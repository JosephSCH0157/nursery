begin;

create or replace function tongs.adopt_creator_amended_reference_visual_plan(
  p_operation_id text,
  p_operation_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  op tongs.unified_visual_plan_operations%rowtype;
  seq tongs.reference_visual_plan_sequences%rowtype;
  current_plan tongs.reference_visual_plan_revisions%rowtype;
  creator_added jsonb;
  retained_members jsonb;
  evidence jsonb;
begin
  select * into op
  from tongs.unified_visual_plan_operations
  where operation_id = p_operation_id
  for update;
  if not found or op.operation_fingerprint <> p_operation_fingerprint then
    return jsonb_build_object('disposition', 'operation_identity_conflict');
  end if;
  if not tongs.has_workspace_role(op.workspace_id, 'editor') then
    raise exception 'workspace editor authority required' using errcode = '42501';
  end if;
  if op.state <> 'reference_plan_committed' then
    return jsonb_build_object('disposition', 'stage_conflict', 'state', op.state);
  end if;
  if op.child_membership_evidence_json ? 'reference_visual' then
    return jsonb_build_object(
      'disposition', 'replay',
      'revision_id', op.child_membership_evidence_json->'reference_visual'->>'final_plan_revision_id',
      'membership_evidence', op.child_membership_evidence_json
    );
  end if;

  select * into seq
  from tongs.reference_visual_plan_sequences
  where workspace_id = op.workspace_id and workpiece_id = op.workpiece_id
  for update;
  select * into current_plan
  from tongs.reference_visual_plan_revisions
  where id = seq.current_plan_revision_id;

  if current_plan.previous_revision_id is distinct from op.expected_reference_visual_revision_id
    or current_plan.previous_revision is distinct from op.expected_reference_visual_revision
    or current_plan.contract_version <> 'forge.reference-visual.creator-amendment.v1'
    or current_plan.script_approval_id <> op.script_approval_id
    or current_plan.script_approval_revision <> op.script_approval_revision
    or current_plan.script_content_hash <> op.script_content_hash then
    return jsonb_build_object(
      'disposition', 'creator_amendment_not_adoptable',
      'current_revision_id', current_plan.id,
      'current_revision', current_plan.revision
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'ordinal', m.ordinal,
      'opportunity_id', m.opportunity_id,
      'opportunity_revision_id', m.opportunity_revision_id,
      'origin', o.opportunity_origin
    ) order by m.ordinal, m.opportunity_id), '[]'::jsonb)
  into retained_members
  from tongs.reference_visual_plan_membership m
  join tongs.reference_visual_opportunity_revisions o on o.id = m.opportunity_revision_id
  where m.plan_revision_id = current_plan.id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'ordinal', m.ordinal,
      'opportunity_id', m.opportunity_id,
      'opportunity_revision_id', m.opportunity_revision_id,
      'derived_from_opportunity_revision_id', o.derived_from_opportunity_revision_id
    ) order by m.ordinal, m.opportunity_id), '[]'::jsonb)
  into creator_added
  from tongs.reference_visual_plan_membership m
  join tongs.reference_visual_opportunity_revisions o on o.id = m.opportunity_revision_id
  where m.plan_revision_id = current_plan.id and o.opportunity_origin = 'creator_added';

  evidence := jsonb_build_object(
    'provider_plan_revision_id', null,
    'provider_output_applied', false,
    'superseded_by_creator_plan', true,
    'frozen_expected_plan_revision_id', op.expected_reference_visual_revision_id,
    'final_plan_revision_id', current_plan.id,
    'provider_proposed', '[]'::jsonb,
    'creator_retained', retained_members,
    'creator_added', creator_added
  );
  update tongs.unified_visual_plan_operations
  set child_membership_evidence_json = child_membership_evidence_json || jsonb_build_object('reference_visual', evidence),
      updated_at = now()
  where operation_id = op.operation_id
  returning child_membership_evidence_json into evidence;

  return jsonb_build_object(
    'disposition', 'creator_amendment_adopted',
    'revision_id', current_plan.id,
    'revision', current_plan.revision,
    'membership_evidence', evidence
  );
end
$$;

revoke all on function tongs.adopt_creator_amended_reference_visual_plan(text,text) from public, anon, authenticated;
grant execute on function tongs.adopt_creator_amended_reference_visual_plan(text,text) to authenticated, service_role;

commit;
