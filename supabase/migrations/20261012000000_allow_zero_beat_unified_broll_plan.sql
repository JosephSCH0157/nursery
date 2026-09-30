begin;

-- Zero motion opportunities are a valid completed B-roll plan. The plan row,
-- sequence head, operation receipt, and Unified Visual Plan child receipt make
-- that absence canonical without inventing a beat or provider work.
create or replace function tongs.commit_broll_plan(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_expected_revision_id uuid,
  p_expected_revision bigint,
  p_script_approval_id uuid,
  p_source_context_contract_version text,
  p_beats jsonb,
  p_operation_id text,
  p_operation_fingerprint text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  v_seq tongs.broll_plan_sequences%rowtype;
  v_script tongs.script_approval_revisions%rowtype;
  v_plan tongs.broll_plan_revisions%rowtype;
  v_op tongs.broll_operation_receipts%rowtype;
  v_beat jsonb;
  v_beat_rev tongs.broll_beat_revisions%rowtype;
  v_prev tongs.broll_beat_revisions%rowtype;
  v_beat_id uuid;
  v_hash text;
  v_immutable text;
  v_ordinal int := 0;
  v_result jsonb;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if jsonb_typeof(p_beats) <> 'array' then
    return jsonb_build_object('disposition','beats_array_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
  select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
  if found then
    if v_op.operation_fingerprint<>p_operation_fingerprint then
      return jsonb_build_object('disposition','operation_identity_conflict');
    end if;
    return v_op.receipt_json;
  end if;

  insert into tongs.broll_plan_sequences(workspace_id,workpiece_id)
  values(p_workspace_id,p_workpiece_id) on conflict do nothing;
  select * into v_seq from tongs.broll_plan_sequences
  where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
  if v_seq.current_plan_revision<>p_expected_revision
    or v_seq.current_plan_revision_id is distinct from p_expected_revision_id then
    return jsonb_build_object(
      'disposition','plan_revision_conflict',
      'current_revision_id',v_seq.current_plan_revision_id,
      'current_revision',v_seq.current_plan_revision
    );
  end if;

  select * into v_script from tongs.script_approval_revisions
  where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found then return jsonb_build_object('disposition','script_revision_conflict'); end if;

  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'script_approval_id',v_script.id,'script_hash',v_script.script_content_hash,
    'contract',p_source_context_contract_version,'beats',p_beats
  )::text,'UTF8'),'sha256'),'hex');
  v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object(
    'content_hash',v_hash,'revision',v_seq.current_plan_revision+1,
    'previous_revision_id',v_seq.current_plan_revision_id,'operation_id',p_operation_id
  )::text,'UTF8'),'sha256'),'hex');

  insert into tongs.broll_plan_revisions(
    workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,
    script_approval_id,script_approval_revision,script_content_hash,
    source_context_contract_version,content_hash,immutable_revision_hash,created_by
  ) values(
    p_workspace_id,p_workpiece_id,v_seq.current_plan_revision+1,v_seq.current_plan_revision_id,
    nullif(v_seq.current_plan_revision,0),v_script.id,v_script.approval_revision,
    v_script.script_content_hash,p_source_context_contract_version,v_hash,v_immutable,p_actor_id
  ) returning * into v_plan;

  for v_beat in select value from jsonb_array_elements(p_beats) loop
    v_ordinal:=v_ordinal+1;
    v_beat_id:=coalesce(nullif(v_beat->>'beat_id','')::uuid,gen_random_uuid());
    select * into v_prev from tongs.broll_beat_revisions
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=v_beat_id
    order by revision desc limit 1;
    v_hash:=encode(extensions.digest(convert_to(v_beat::text,'UTF8'),'sha256'),'hex');
    v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object(
      'content_hash',v_hash,'plan_revision_id',v_plan.id,'beat_id',v_beat_id,
      'revision',coalesce(v_prev.revision,0)+1
    )::text,'UTF8'),'sha256'),'hex');
    insert into tongs.broll_beat_revisions(
      workspace_id,workpiece_id,beat_id,revision,previous_revision_id,previous_revision,
      source_plan_revision_id,source_plan_revision,script_approval_id,script_approval_revision,
      context_before,context_focus,context_after,canonical_anchor_assessment,narrative_purpose,
      placement_hint,duration_target_ms,shot_type,motion_intent,mood_pacing,asset_category,
      trim_guidance_json,content_hash,immutable_revision_hash,created_by
    ) values(
      p_workspace_id,p_workpiece_id,v_beat_id,coalesce(v_prev.revision,0)+1,v_prev.id,v_prev.revision,
      v_plan.id,v_plan.revision,v_script.id,v_script.approval_revision,
      coalesce(v_beat->>'context_before',''),v_beat->>'context_focus',coalesce(v_beat->>'context_after',''),
      coalesce(v_beat->'canonical_anchor_assessment','{}'),v_beat->>'narrative_purpose',
      v_beat->>'placement_hint',coalesce((v_beat->>'duration_target_ms')::bigint,4000),
      v_beat->>'shot_type',v_beat->>'motion_intent',v_beat->>'mood_pacing',v_beat->>'asset_category',
      coalesce(v_beat->'trim_guidance','{}'),v_hash,v_immutable,p_actor_id
    ) returning * into v_beat_rev;
    insert into tongs.broll_plan_beat_membership(
      plan_revision_id,workspace_id,workpiece_id,plan_revision,ordinal,
      beat_id,beat_revision_id,beat_revision
    ) values(
      v_plan.id,p_workspace_id,p_workpiece_id,v_plan.revision,v_ordinal,
      v_beat_id,v_beat_rev.id,v_beat_rev.revision
    );
  end loop;

  update tongs.broll_plan_sequences
  set current_plan_revision_id=v_plan.id,current_plan_revision=v_plan.revision,updated_at=now()
  where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  v_result:=jsonb_build_object(
    'disposition','committed','plan_revision',to_jsonb(v_plan),
    'beat_count',jsonb_array_length(p_beats),'empty',jsonb_array_length(p_beats)=0
  );
  insert into tongs.broll_operation_receipts(
    operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,
    normalized_inputs_json,result_plan_revision_id,receipt_json,created_by
  ) values(
    p_operation_id,p_operation_fingerprint,'plan_commit','committed',p_workspace_id,p_workpiece_id,
    jsonb_build_object('beats',p_beats,'beat_count',jsonb_array_length(p_beats),'empty',jsonb_array_length(p_beats)=0),
    v_plan.id,v_result,p_actor_id
  );
  return v_result;
end
$$;

do $$
begin
  if has_function_privilege(
      'anon','tongs.commit_broll_plan(uuid,uuid,uuid,bigint,uuid,text,jsonb,text,text,uuid)','execute')
    or not has_function_privilege(
      'authenticated','tongs.commit_broll_plan(uuid,uuid,uuid,bigint,uuid,text,jsonb,text,text,uuid)','execute')
    or not has_function_privilege(
      'service_role','tongs.commit_broll_plan(uuid,uuid,uuid,bigint,uuid,text,jsonb,text,text,uuid)','execute')
  then
    raise exception 'commit_broll_plan grants changed';
  end if;
end
$$;

commit;
