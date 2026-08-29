begin;

alter table tongs.unified_visual_plan_operations
  drop constraint unified_visual_plan_operations_state_check,
  add column contract_version text not null default 'forge.unified-visual-plan.v1',
  add column expected_reference_visual_revision_id uuid,
  add column expected_reference_visual_revision bigint,
  add column image_plan_content_hash text,
  add column image_plan_empty boolean,
  add column broll_plan_content_hash text,
  add column broll_plan_empty boolean,
  add column reference_clip_plan_content_hash text,
  add column reference_clip_plan_empty boolean,
  add column reference_visual_plan_revision_id uuid,
  add column reference_visual_plan_revision bigint,
  add column reference_visual_plan_content_hash text,
  add column reference_visual_plan_empty boolean,
  add constraint unified_visual_plan_operations_state_check check(state in(
    'pending','provider_completed','image_plan_committed','broll_plan_committed',
    'reference_plan_committed','reference_visual_plan_committed','verified'
  )),
  add constraint unified_visual_plan_operations_contract_check check(contract_version in(
    'forge.unified-visual-plan.v1','forge.unified-visual-plan.v2'
  )),
  add constraint unified_visual_plan_operations_reference_visual_revision_check check(
    (expected_reference_visual_revision_id is null and coalesce(expected_reference_visual_revision,0)=0)
    or (expected_reference_visual_revision_id is not null and expected_reference_visual_revision>0)
  ),
  add constraint unified_visual_plan_operations_child_hashes_check check(
    (image_plan_content_hash is null or image_plan_content_hash~'^[0-9a-f]{64}$') and
    (broll_plan_content_hash is null or broll_plan_content_hash~'^[0-9a-f]{64}$') and
    (reference_clip_plan_content_hash is null or reference_clip_plan_content_hash~'^[0-9a-f]{64}$') and
    (reference_visual_plan_content_hash is null or reference_visual_plan_content_hash~'^[0-9a-f]{64}$')
  ),
  add constraint unified_visual_plan_operations_reference_visual_plan_fkey
    foreign key(reference_visual_plan_revision_id,workspace_id,workpiece_id,reference_visual_plan_revision)
    references tongs.reference_visual_plan_revisions(id,workspace_id,workpiece_id,revision);

comment on column tongs.unified_visual_plan_operations.contract_version is
  'v1 receipts are historical three-child evidence; v2 operations require four canonical child plans.';

drop function tongs.begin_unified_visual_plan(uuid,uuid,uuid,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text,text,uuid);

create function tongs.begin_unified_visual_plan(
  p_workspace_id uuid,p_workpiece_id uuid,p_script_approval_id uuid,
  p_expected_image_revision_id uuid,p_expected_image_revision bigint,
  p_expected_broll_revision_id uuid,p_expected_broll_revision bigint,
  p_expected_reference_revision_id uuid,p_expected_reference_revision bigint,
  p_expected_reference_visual_revision_id uuid,p_expected_reference_visual_revision bigint,
  p_normalized_inputs_json jsonb,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype; approval tongs.script_approval_revisions%rowtype;
  image_seq tongs.workpiece_image_map_sequences%rowtype; broll_seq tongs.broll_plan_sequences%rowtype;
  ref_seq tongs.reference_clip_plan_sequences%rowtype; visual_seq tongs.reference_visual_plan_sequences%rowtype;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') or auth.uid() is distinct from p_actor_id then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if found then
    if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
    return jsonb_build_object('disposition','replay','operation',to_jsonb(op));
  end if;
  select * into approval from tongs.script_approval_revisions where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found or not exists(select 1 from tongs.workpiece_script_approval_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and current_approval_id=approval.id) then
    return jsonb_build_object('disposition','script_revision_conflict');
  end if;
  select * into image_seq from tongs.workpiece_image_map_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into broll_seq from tongs.broll_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into ref_seq from tongs.reference_clip_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into visual_seq from tongs.reference_visual_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if coalesce(image_seq.current_revision,0)<>p_expected_image_revision or image_seq.current_revision_id is distinct from p_expected_image_revision_id
    or coalesce(broll_seq.current_plan_revision,0)<>p_expected_broll_revision or broll_seq.current_plan_revision_id is distinct from p_expected_broll_revision_id
    or coalesce(ref_seq.current_plan_revision,0)<>p_expected_reference_revision or ref_seq.current_plan_revision_id is distinct from p_expected_reference_revision_id
    or coalesce(visual_seq.current_plan_revision,0)<>p_expected_reference_visual_revision or visual_seq.current_plan_revision_id is distinct from p_expected_reference_visual_revision_id then
    return jsonb_build_object('disposition','child_revision_conflict');
  end if;
  insert into tongs.unified_visual_plan_operations(
    operation_id,operation_fingerprint,workspace_id,workpiece_id,script_approval_id,script_approval_revision,script_content_hash,
    contract_version,expected_reference_visual_revision_id,expected_reference_visual_revision,normalized_inputs_json,created_by
  ) values(
    p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,approval.id,approval.approval_revision,approval.script_content_hash,
    'forge.unified-visual-plan.v2',p_expected_reference_visual_revision_id,p_expected_reference_visual_revision,p_normalized_inputs_json,p_actor_id
  ) returning * into op;
  return jsonb_build_object('disposition','reserved','operation',to_jsonb(op));
end$$;

create or replace function tongs.record_unified_visual_plan_child(
  p_operation_id text,p_operation_fingerprint text,p_child_kind text,p_revision_id uuid,p_revision bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype; expected_state text; next_state text; valid boolean:=false; child_hash text; child_empty boolean;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if op.state='verified' then return jsonb_build_object('disposition','replay','operation',to_jsonb(op)); end if;
  if op.contract_version<>'forge.unified-visual-plan.v2' then return jsonb_build_object('disposition','historical_contract_immutable'); end if;
  if p_child_kind='image' then
    expected_state:='provider_completed';next_state:='image_plan_committed';
    select r.document_content_hash,coalesce(jsonb_array_length(r.document_json->'entries'),0)=0 into child_hash,child_empty
      from tongs.image_map_revisions r where r.id=p_revision_id and r.workspace_id=op.workspace_id and r.workpiece_id=op.workpiece_id and r.revision=p_revision
        and r.source_script_approval_id=op.script_approval_id and r.source_script_approval_revision=op.script_approval_revision and r.source_script_content_hash=op.script_content_hash;
  elsif p_child_kind='broll' then
    expected_state:='image_plan_committed';next_state:='broll_plan_committed';
    select r.content_hash,not exists(select 1 from tongs.broll_plan_beat_membership m where m.plan_revision_id=r.id) into child_hash,child_empty
      from tongs.broll_plan_revisions r where r.id=p_revision_id and r.workspace_id=op.workspace_id and r.workpiece_id=op.workpiece_id and r.revision=p_revision
        and r.script_approval_id=op.script_approval_id and r.script_approval_revision=op.script_approval_revision and r.script_content_hash=op.script_content_hash;
  elsif p_child_kind='reference_clip' then
    expected_state:='broll_plan_committed';next_state:='reference_plan_committed';
    select r.content_hash,not exists(select 1 from tongs.reference_clip_plan_membership m where m.plan_revision_id=r.id) into child_hash,child_empty
      from tongs.reference_clip_plan_revisions r where r.id=p_revision_id and r.workspace_id=op.workspace_id and r.workpiece_id=op.workpiece_id and r.revision=p_revision
        and r.script_approval_id=op.script_approval_id and r.script_approval_revision=op.script_approval_revision and r.script_content_hash=op.script_content_hash;
  elsif p_child_kind='reference_visual' then
    expected_state:='reference_plan_committed';next_state:='reference_visual_plan_committed';
    select r.content_hash,not exists(select 1 from tongs.reference_visual_plan_membership m where m.plan_revision_id=r.id) into child_hash,child_empty
      from tongs.reference_visual_plan_revisions r where r.id=p_revision_id and r.workspace_id=op.workspace_id and r.workpiece_id=op.workpiece_id and r.revision=p_revision
        and r.script_approval_id=op.script_approval_id and r.script_approval_revision=op.script_approval_revision and r.script_content_hash=op.script_content_hash;
  else return jsonb_build_object('disposition','invalid_child_kind'); end if;
  valid:=child_hash is not null;
  if (p_child_kind='image' and op.image_map_revision_id=p_revision_id) or (p_child_kind='broll' and op.broll_plan_revision_id=p_revision_id)
    or (p_child_kind='reference_clip' and op.reference_clip_plan_revision_id=p_revision_id) or (p_child_kind='reference_visual' and op.reference_visual_plan_revision_id=p_revision_id) then
    return jsonb_build_object('disposition','replay','operation',to_jsonb(op));
  end if;
  if op.state<>expected_state then return jsonb_build_object('disposition','stage_conflict','state',op.state); end if;
  if not valid then return jsonb_build_object('disposition','canonical_child_revision_required'); end if;
  update tongs.unified_visual_plan_operations set state=next_state,
    image_map_revision_id=case when p_child_kind='image' then p_revision_id else image_map_revision_id end,
    image_map_revision=case when p_child_kind='image' then p_revision else image_map_revision end,
    image_plan_content_hash=case when p_child_kind='image' then child_hash else image_plan_content_hash end,
    image_plan_empty=case when p_child_kind='image' then child_empty else image_plan_empty end,
    broll_plan_revision_id=case when p_child_kind='broll' then p_revision_id else broll_plan_revision_id end,
    broll_plan_revision=case when p_child_kind='broll' then p_revision else broll_plan_revision end,
    broll_plan_content_hash=case when p_child_kind='broll' then child_hash else broll_plan_content_hash end,
    broll_plan_empty=case when p_child_kind='broll' then child_empty else broll_plan_empty end,
    reference_clip_plan_revision_id=case when p_child_kind='reference_clip' then p_revision_id else reference_clip_plan_revision_id end,
    reference_clip_plan_revision=case when p_child_kind='reference_clip' then p_revision else reference_clip_plan_revision end,
    reference_clip_plan_content_hash=case when p_child_kind='reference_clip' then child_hash else reference_clip_plan_content_hash end,
    reference_clip_plan_empty=case when p_child_kind='reference_clip' then child_empty else reference_clip_plan_empty end,
    reference_visual_plan_revision_id=case when p_child_kind='reference_visual' then p_revision_id else reference_visual_plan_revision_id end,
    reference_visual_plan_revision=case when p_child_kind='reference_visual' then p_revision else reference_visual_plan_revision end,
    reference_visual_plan_content_hash=case when p_child_kind='reference_visual' then child_hash else reference_visual_plan_content_hash end,
    reference_visual_plan_empty=case when p_child_kind='reference_visual' then child_empty else reference_visual_plan_empty end,
    failed_stage=null,failure_code=null,failure_message=null,updated_at=now()
    where operation_id=p_operation_id returning * into op;
  return jsonb_build_object('disposition',next_state,'operation',to_jsonb(op));
end$$;

create or replace function tongs.verify_unified_visual_plan(p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.unified_visual_plan_operations%rowtype; receipt jsonb;
begin
  select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id for update;
  if not found or op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if not tongs.has_workspace_role(op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if op.state='verified' then return op.receipt_json; end if;
  if op.contract_version<>'forge.unified-visual-plan.v2' or op.state<>'reference_visual_plan_committed' then return jsonb_build_object('disposition','stage_conflict','state',op.state); end if;
  if not exists(select 1 from tongs.workpiece_image_map_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_revision_id=op.image_map_revision_id and current_revision=op.image_map_revision)
    or not exists(select 1 from tongs.broll_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_plan_revision_id=op.broll_plan_revision_id and current_plan_revision=op.broll_plan_revision)
    or not exists(select 1 from tongs.reference_clip_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_plan_revision_id=op.reference_clip_plan_revision_id and current_plan_revision=op.reference_clip_plan_revision)
    or not exists(select 1 from tongs.reference_visual_plan_sequences where workspace_id=op.workspace_id and workpiece_id=op.workpiece_id and current_plan_revision_id=op.reference_visual_plan_revision_id and current_plan_revision=op.reference_visual_plan_revision) then
    return jsonb_build_object('disposition','child_revision_no_longer_current');
  end if;
  receipt:=jsonb_build_object(
    'disposition','verified','contract_version',op.contract_version,'operation_id',op.operation_id,'operation_fingerprint',op.operation_fingerprint,
    'script_approval_id',op.script_approval_id,'script_approval_revision',op.script_approval_revision,'script_content_hash',op.script_content_hash,
    'provider_response_hash',op.provider_response_hash,
    'image_plan',jsonb_build_object('revision_id',op.image_map_revision_id,'revision',op.image_map_revision,'content_hash',op.image_plan_content_hash,'empty',op.image_plan_empty),
    'broll_plan',jsonb_build_object('revision_id',op.broll_plan_revision_id,'revision',op.broll_plan_revision,'content_hash',op.broll_plan_content_hash,'empty',op.broll_plan_empty),
    'reference_clip_plan',jsonb_build_object('revision_id',op.reference_clip_plan_revision_id,'revision',op.reference_clip_plan_revision,'content_hash',op.reference_clip_plan_content_hash,'empty',op.reference_clip_plan_empty),
    'reference_visual_plan',jsonb_build_object('revision_id',op.reference_visual_plan_revision_id,'revision',op.reference_visual_plan_revision,'content_hash',op.reference_visual_plan_content_hash,'empty',op.reference_visual_plan_empty)
  );
  update tongs.unified_visual_plan_operations set state='verified',receipt_json=receipt,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id;
  return receipt;
end$$;

revoke all on function tongs.begin_unified_visual_plan(uuid,uuid,uuid,uuid,bigint,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function tongs.begin_unified_visual_plan(uuid,uuid,uuid,uuid,bigint,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text,text,uuid) to authenticated,service_role;

commit;
