-- Persist creator image selection in the immutable canonical image-map sequence.

do $block$
declare v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'tongs.hearth_authority_operation_receipts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%mutation_kind%'
  loop
    execute format('alter table tongs.hearth_authority_operation_receipts drop constraint %I', v_constraint.conname);
  end loop;
end
$block$;

alter table tongs.hearth_authority_operation_receipts
  add constraint hearth_authority_receipts_mutation_kind_check check (mutation_kind in (
    'commit_script_approval','commit_image_map','repair_to_approved_script',
    'resolve_manual_anchor','reapply_visual_plan','regenerate_from_approved_script','select_candidate'
  )),
  add constraint hearth_authority_receipts_shape_check check (
    (mutation_kind='commit_script_approval'
      and source_image_map_revision_id is null
      and target_script_approval_id is null
      and result_image_map_revision_id is null
      and result_script_approval_id is not null)
    or
    (mutation_kind='commit_image_map'
      and result_script_approval_id is null
      and result_image_map_revision_id is not null)
    or
    (mutation_kind in ('repair_to_approved_script','resolve_manual_anchor','reapply_visual_plan','regenerate_from_approved_script','select_candidate')
      and source_image_map_revision_id is not null
      and target_script_approval_id is not null
      and result_image_map_revision_id is not null
      and result_script_approval_id is null)
  );

create or replace function tongs.select_image_map_candidate(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_expected_current_revision bigint,
  p_expected_current_revision_id uuid,
  p_image_map_entry_id text,
  p_candidate_asset_id uuid,
  p_operation_contract_version text,
  p_operation_id text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
declare
  v_sequence tongs.workpiece_image_map_sequences%rowtype;
  v_current tongs.image_map_revisions%rowtype;
  v_revision tongs.image_map_revisions%rowtype;
  v_receipt tongs.hearth_authority_operation_receipts%rowtype;
  v_document jsonb;
  v_document_hash text;
  v_semantic_hash text;
  v_revision_hash text;
  v_fingerprint text;
  v_result jsonb;
  v_next bigint;
begin
  if p_actor_id is null then raise exception 'actor is required' using errcode='22023'; end if;
  if not exists (
    select 1 from tongs.assets a
    where a.id=p_candidate_asset_id and a.workspace_id=p_workspace_id and a.workpiece_id=p_workpiece_id
      and a.metadata_json->>'image_map_entry_id'=p_image_map_entry_id and a.status='ready'
  ) then
    return jsonb_build_object('disposition','candidate_not_attached');
  end if;

  insert into tongs.workpiece_image_map_sequences(workspace_id,workpiece_id)
  values(p_workspace_id,p_workpiece_id) on conflict do nothing;
  select * into v_sequence from tongs.workpiece_image_map_sequences
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
  if v_sequence.current_revision <> p_expected_current_revision
    or v_sequence.current_revision_id is distinct from p_expected_current_revision_id then
    return jsonb_build_object('disposition','revision_conflict','current_revision',v_sequence.current_revision,'current_revision_id',v_sequence.current_revision_id);
  end if;
  select * into v_current from tongs.image_map_revisions where id=v_sequence.current_revision_id;
  if not found then return jsonb_build_object('disposition','canonical_image_map_required'); end if;
  if not exists (
    select 1 from jsonb_array_elements(v_current.document_json->'entries') e,
      jsonb_array_elements(coalesce(e->'candidate_assets','[]'::jsonb)) a
    where e->>'id'=p_image_map_entry_id and a->>'asset_id'=p_candidate_asset_id::text
  ) then return jsonb_build_object('disposition','candidate_not_attached'); end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'contract',p_operation_contract_version,'workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,
    'source_revision_id',p_expected_current_revision_id,'source_revision',p_expected_current_revision,
    'entry_id',p_image_map_entry_id,'candidate_asset_id',p_candidate_asset_id
  )::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from tongs.hearth_authority_operation_receipts where operation_id=p_operation_id;
  if found then
    if v_receipt.operation_fingerprint <> v_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
    return v_receipt.immutable_result_json;
  end if;

  select jsonb_set(v_current.document_json,'{entries}',jsonb_agg(
    case when e->>'id'=p_image_map_entry_id
      then e || jsonb_build_object('selected_asset_id',p_candidate_asset_id::text,'status','selected')
      else e end order by ord
  )) into v_document
  from jsonb_array_elements(v_current.document_json->'entries') with ordinality entries(e,ord);
  if v_document = v_current.document_json then
    v_result := jsonb_build_object('disposition','no_change','image_map_revision',to_jsonb(v_current));
    insert into tongs.hearth_authority_operation_receipts(
      operation_id,operation_fingerprint,workspace_id,workpiece_id,mutation_kind,
      source_image_map_revision_id,source_image_map_revision,target_script_approval_id,target_script_approval_revision,
      result_image_map_revision_id,result_image_map_revision,immutable_result_json,created_by
    ) values(p_operation_id,v_fingerprint,p_workspace_id,p_workpiece_id,'select_candidate',v_current.id,v_current.revision,
      v_current.source_script_approval_id,v_current.source_script_approval_revision,v_current.id,v_current.revision,v_result,p_actor_id);
    return v_result;
  end if;

  v_document_hash := encode(extensions.digest(convert_to(v_document::text,'UTF8'),'sha256'),'hex');
  v_semantic_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,
    'source_script_approval_id',v_current.source_script_approval_id,'source_script_hash',v_current.source_script_content_hash,
    'anchor_contract_version',v_current.anchor_contract_version,'provenance_state',v_current.provenance_state,
    'document_content_hash',v_document_hash,'document',v_document
  )::text,'UTF8'),'sha256'),'hex');
  v_next := v_sequence.current_revision+1;
  v_revision_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'semantic_state_hash',v_semantic_hash,'revision',v_next,'previous_revision_id',v_current.id,
    'created_at',clock_timestamp()::text,'operation_id',p_operation_id
  )::text,'UTF8'),'sha256'),'hex');
  insert into tongs.image_map_revisions(
    workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,
    source_script_approval_id,source_script_approval_revision,source_script_content_hash,
    anchor_contract_version,provenance_state,document_json,document_content_hash,
    semantic_state_hash,immutable_revision_hash,created_by
  ) values(p_workspace_id,p_workpiece_id,v_next,v_current.id,v_current.revision,
    v_current.source_script_approval_id,v_current.source_script_approval_revision,v_current.source_script_content_hash,
    v_current.anchor_contract_version,v_current.provenance_state,v_document,v_document_hash,
    v_semantic_hash,v_revision_hash,p_actor_id) returning * into v_revision;
  update tongs.workpiece_image_map_sequences set current_revision_id=v_revision.id,current_revision=v_revision.revision,updated_at=now()
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  v_result := jsonb_build_object('disposition','committed','image_map_revision',to_jsonb(v_revision));
  insert into tongs.hearth_authority_operation_receipts(
    operation_id,operation_fingerprint,workspace_id,workpiece_id,mutation_kind,
    source_image_map_revision_id,source_image_map_revision,target_script_approval_id,target_script_approval_revision,
    result_image_map_revision_id,result_image_map_revision,immutable_result_json,created_by
  ) values(p_operation_id,v_fingerprint,p_workspace_id,p_workpiece_id,'select_candidate',v_current.id,v_current.revision,
    v_current.source_script_approval_id,v_current.source_script_approval_revision,v_revision.id,v_revision.revision,v_result,p_actor_id);
  return v_result;
end
$function$;

revoke all on function tongs.select_image_map_candidate(uuid,uuid,bigint,uuid,text,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function tongs.select_image_map_candidate(uuid,uuid,bigint,uuid,text,uuid,text,text,uuid) to service_role;
