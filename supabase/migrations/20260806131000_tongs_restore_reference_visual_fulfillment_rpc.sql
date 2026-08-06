-- Restore the canonical Reference Visual Source-fulfillment RPC on databases
-- whose migration history records 20260805120000 although the function is absent.
create or replace function tongs.fulfill_reference_visual_opportunity(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_opportunity_id uuid,
  p_expected_opportunity_revision_id uuid,
  p_expected_opportunity_revision bigint,
  p_source_revision_id uuid,
  p_workpiece_source_link_revision_id uuid,
  p_operation_id text,
  p_operation_fingerprint text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
#variable_conflict use_column
declare
  op tongs.reference_visual_operation_receipts%rowtype;
  seq tongs.reference_visual_plan_sequences%rowtype;
  old_plan tongs.reference_visual_plan_revisions%rowtype;
  old_opp tongs.reference_visual_opportunity_revisions%rowtype;
  sr tongs.source_revisions%rowtype;
  lr tongs.workpiece_source_link_revisions%rowtype;
  new_plan tongs.reference_visual_plan_revisions%rowtype;
  new_opp tongs.reference_visual_opportunity_revisions%rowtype;
  m tongs.reference_visual_plan_membership%rowtype;
  h text;
  ih text;
  result jsonb;
begin
  if not tongs.has_workspace_role(p_workspace_id, 'editor') or auth.uid() is distinct from p_actor_id then
    raise exception 'workspace editor authority required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id, 0));
  select * into op from tongs.reference_visual_operation_receipts where operation_id = p_operation_id;
  if found then
    if op.operation_fingerprint <> p_operation_fingerprint then
      return jsonb_build_object('disposition', 'operation_identity_conflict');
    end if;
    return op.receipt_json;
  end if;

  select * into seq
  from tongs.reference_visual_plan_sequences
  where workspace_id = p_workspace_id and workpiece_id = p_workpiece_id
  for update;

  select o.* into old_opp
  from tongs.reference_visual_plan_membership m
  join tongs.reference_visual_opportunity_revisions o on o.id = m.opportunity_revision_id
  where m.plan_revision_id = seq.current_plan_revision_id and m.opportunity_id = p_opportunity_id;

  if not found
    or old_opp.id is distinct from p_expected_opportunity_revision_id
    or old_opp.revision <> p_expected_opportunity_revision then
    return jsonb_build_object('disposition', 'opportunity_revision_conflict');
  end if;
  if old_opp.source_status <> 'unresolved' then
    return jsonb_build_object('disposition', 'opportunity_already_linked');
  end if;

  select * into sr from tongs.source_revisions
  where id = p_source_revision_id and workspace_id = p_workspace_id;
  select * into lr from tongs.workpiece_source_link_revisions
  where id = p_workpiece_source_link_revision_id
    and workspace_id = p_workspace_id
    and workpiece_id = p_workpiece_id
    and source_revision_id = sr.id;
  if sr.id is null or lr.id is null then
    return jsonb_build_object('disposition', 'canonical_source_evidence_required');
  end if;

  select * into old_plan from tongs.reference_visual_plan_revisions where id = seq.current_plan_revision_id;
  h := encode(extensions.digest(convert_to(jsonb_build_object(
    'previous_plan', old_plan.content_hash,
    'fulfilled_opportunity', old_opp.id,
    'source_revision', sr.id,
    'source_link_revision', lr.id
  )::text, 'UTF8'), 'sha256'), 'hex');
  ih := encode(extensions.digest(convert_to(jsonb_build_object(
    'content_hash', h,
    'revision', old_plan.revision + 1,
    'previous_revision_id', old_plan.id
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into tongs.reference_visual_plan_revisions(
    workspace_id, workpiece_id, revision, previous_revision_id, previous_revision,
    script_approval_id, script_approval_revision, script_content_hash, contract_version,
    content_hash, immutable_revision_hash, created_by
  ) values (
    p_workspace_id, p_workpiece_id, old_plan.revision + 1, old_plan.id, old_plan.revision,
    old_plan.script_approval_id, old_plan.script_approval_revision, old_plan.script_content_hash,
    old_plan.contract_version, h, ih, p_actor_id
  ) returning * into new_plan;

  h := encode(extensions.digest(convert_to(jsonb_build_object(
    'previous', old_opp.content_hash,
    'source_revision', sr.id,
    'source_link_revision', lr.id
  )::text, 'UTF8'), 'sha256'), 'hex');
  ih := encode(extensions.digest(convert_to(jsonb_build_object(
    'content_hash', h,
    'revision', old_opp.revision + 1,
    'previous_revision_id', old_opp.id
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into tongs.reference_visual_opportunity_revisions(
    opportunity_id, workspace_id, workpiece_id, revision, previous_revision_id, previous_revision,
    source_plan_revision_id, source_plan_revision, script_approval_id, script_approval_revision,
    source_status, source_revision_id, source_revision, workpiece_source_link_revision_id,
    workpiece_source_link_revision, visual_subtype, context_before, context_focus, context_after,
    citation_anchor_json, document_locator_json, media_range_json, editorial_reason, desired_material,
    search_terms, placement_hint, duration_target_ms, creator_direction, content_hash,
    immutable_revision_hash, created_by
  )
  select
    opportunity_id, workspace_id, workpiece_id, revision + 1, id, revision,
    new_plan.id, new_plan.revision, script_approval_id, script_approval_revision,
    'linked', sr.id, sr.revision, lr.id, lr.revision, visual_subtype, context_before, context_focus,
    context_after, citation_anchor_json, document_locator_json, media_range_json, editorial_reason,
    desired_material, search_terms, placement_hint, duration_target_ms, creator_direction, h, ih, p_actor_id
  from tongs.reference_visual_opportunity_revisions
  where id = old_opp.id
  returning * into new_opp;

  for m in
    select * from tongs.reference_visual_plan_membership
    where plan_revision_id = old_plan.id
    order by ordinal
  loop
    insert into tongs.reference_visual_plan_membership values (
      new_plan.id, p_workspace_id, p_workpiece_id, new_plan.revision, m.ordinal, m.opportunity_id,
      case when m.opportunity_id = p_opportunity_id then new_opp.id else m.opportunity_revision_id end,
      case when m.opportunity_id = p_opportunity_id then new_opp.revision else m.opportunity_revision end
    );
  end loop;

  update tongs.reference_visual_plan_sequences
  set current_plan_revision_id = new_plan.id, current_plan_revision = new_plan.revision, updated_at = now()
  where workspace_id = p_workspace_id and workpiece_id = p_workpiece_id;

  result := jsonb_build_object(
    'disposition', 'committed',
    'plan_revision', to_jsonb(new_plan),
    'opportunity_revision', to_jsonb(new_opp)
  );
  insert into tongs.reference_visual_operation_receipts values (
    p_operation_id, p_operation_fingerprint, 'source_fulfillment', p_workspace_id, p_workpiece_id,
    'committed', new_opp.id, result, p_actor_id, now()
  );
  return result;
end
$$;

revoke all on function tongs.fulfill_reference_visual_opportunity(uuid, uuid, uuid, uuid, bigint, uuid, uuid, text, text, uuid) from public, anon;
grant execute on function tongs.fulfill_reference_visual_opportunity(uuid, uuid, uuid, uuid, bigint, uuid, uuid, text, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
