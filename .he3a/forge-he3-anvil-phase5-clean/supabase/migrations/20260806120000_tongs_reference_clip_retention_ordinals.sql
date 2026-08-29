begin;

create or replace function tongs.retain_unified_reference_clip_selections(
  p_operation_id text,
  p_operation_fingerprint text,
  p_provider_plan_revision_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  op tongs.unified_visual_plan_operations%rowtype;
  approval tongs.script_approval_revisions%rowtype;
  seq tongs.reference_clip_plan_sequences%rowtype;
  provider_plan tongs.reference_clip_plan_revisions%rowtype;
  successor tongs.reference_clip_plan_revisions%rowtype;
  member tongs.reference_clip_plan_membership%rowtype;
  selected tongs.reference_clip_selections%rowtype;
  previous_selection tongs.reference_clip_selections%rowtype;
  retained jsonb := '[]'::jsonb;
  provider_members jsonb := '[]'::jsonb;
  retained_count integer := 0;
  next_ordinal integer := 1;
  content_hash text;
  immutable_hash text;
  selection_fingerprint text;
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

  if op.child_membership_evidence_json ? 'reference_clip' then
    if op.child_membership_evidence_json->'reference_clip'->>'provider_plan_revision_id' <> p_provider_plan_revision_id::text then
      return jsonb_build_object('disposition', 'retention_identity_conflict');
    end if;
    return jsonb_build_object(
      'disposition', 'replay',
      'revision_id', op.child_membership_evidence_json->'reference_clip'->>'final_plan_revision_id',
      'retained_count', jsonb_array_length(coalesce(op.child_membership_evidence_json->'reference_clip'->'creator_retained', '[]'::jsonb)),
      'membership_evidence', op.child_membership_evidence_json
    );
  end if;

  select * into seq
  from tongs.reference_clip_plan_sequences
  where workspace_id = op.workspace_id and workpiece_id = op.workpiece_id
  for update;
  if seq.current_plan_revision_id is distinct from p_provider_plan_revision_id then
    return jsonb_build_object('disposition', 'provider_child_not_current');
  end if;

  select * into provider_plan from tongs.reference_clip_plan_revisions where id = p_provider_plan_revision_id;
  select * into approval from tongs.script_approval_revisions where id = op.script_approval_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'ordinal', m.ordinal,
      'opportunity_id', m.opportunity_id,
      'opportunity_revision_id', m.opportunity_revision_id
    ) order by m.ordinal, m.opportunity_id), '[]'::jsonb)
  into provider_members
  from tongs.reference_clip_plan_membership m
  where m.plan_revision_id = provider_plan.id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'opportunity_id', x.opportunity_id,
      'selection_id', x.id,
      'candidate_revision_id', x.candidate_revision_id
    ) order by x.opportunity_id), '[]'::jsonb), count(*)
  into retained, retained_count
  from (
    select distinct on (s.opportunity_id) s.*
    from tongs.reference_clip_selections s
    join tongs.reference_clip_opportunity_revisions o on o.id = s.opportunity_revision_id
    where s.workspace_id = op.workspace_id
      and s.workpiece_id = op.workpiece_id
      and strpos(approval.script_text, o.context_focus) > 0
      and not exists (
        select 1 from tongs.reference_clip_plan_membership m
        where m.plan_revision_id = provider_plan.id and m.opportunity_id = s.opportunity_id
      )
    order by s.opportunity_id, s.revision desc
  ) x;

  if retained_count > 0 then
    content_hash := encode(extensions.digest(convert_to(jsonb_build_object(
      'provider_plan', provider_plan.content_hash,
      'provider_members', provider_members,
      'creator_retained', retained
    )::text, 'UTF8'), 'sha256'), 'hex');
    immutable_hash := encode(extensions.digest(convert_to(jsonb_build_object(
      'content_hash', content_hash,
      'revision', provider_plan.revision + 1,
      'previous_revision_id', provider_plan.id
    )::text, 'UTF8'), 'sha256'), 'hex');

    insert into tongs.reference_clip_plan_revisions(
      workspace_id, workpiece_id, revision, previous_revision_id, previous_revision,
      script_approval_id, script_approval_revision, script_content_hash,
      contract_version, content_hash, immutable_revision_hash, created_by
    ) values (
      op.workspace_id, op.workpiece_id, provider_plan.revision + 1, provider_plan.id, provider_plan.revision,
      provider_plan.script_approval_id, provider_plan.script_approval_revision, provider_plan.script_content_hash,
      'forge.unified-visual-plan.retained.v2', content_hash, immutable_hash, op.created_by
    ) returning * into successor;

    for member in
      select * from tongs.reference_clip_plan_membership
      where plan_revision_id = provider_plan.id
      order by ordinal, opportunity_id
    loop
      insert into tongs.reference_clip_plan_membership(
        plan_revision_id, workspace_id, workpiece_id, plan_revision, ordinal,
        opportunity_id, opportunity_revision_id, opportunity_revision
      ) values (
        successor.id, op.workspace_id, op.workpiece_id, successor.revision, next_ordinal,
        member.opportunity_id, member.opportunity_revision_id, member.opportunity_revision
      );
      next_ordinal := next_ordinal + 1;
    end loop;

    for selected in
      select distinct on (s.opportunity_id) s.*
      from tongs.reference_clip_selections s
      join tongs.reference_clip_opportunity_revisions o on o.id = s.opportunity_revision_id
      where s.workspace_id = op.workspace_id
        and s.workpiece_id = op.workpiece_id
        and strpos(approval.script_text, o.context_focus) > 0
        and not exists (
          select 1 from tongs.reference_clip_plan_membership m
          where m.plan_revision_id = provider_plan.id and m.opportunity_id = s.opportunity_id
        )
      order by s.opportunity_id, s.revision desc
    loop
      insert into tongs.reference_clip_plan_membership(
        plan_revision_id, workspace_id, workpiece_id, plan_revision, ordinal,
        opportunity_id, opportunity_revision_id, opportunity_revision
      ) values (
        successor.id, op.workspace_id, op.workpiece_id, successor.revision, next_ordinal,
        selected.opportunity_id, selected.opportunity_revision_id, selected.opportunity_revision
      );
      next_ordinal := next_ordinal + 1;

      select * into previous_selection
      from tongs.reference_clip_selections
      where workspace_id = op.workspace_id and workpiece_id = op.workpiece_id
      order by revision desc limit 1;
      selection_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
        'parent', op.operation_id,
        'retained_selection', selected.id,
        'plan', successor.id
      )::text, 'UTF8'), 'sha256'), 'hex');
      insert into tongs.reference_clip_selections(
        workspace_id, workpiece_id, revision, previous_selection_id, previous_revision,
        plan_revision_id, plan_revision, opportunity_id, opportunity_revision_id, opportunity_revision,
        candidate_revision_id, candidate_revision, operation_id, operation_fingerprint, created_by
      ) values (
        op.workspace_id, op.workpiece_id, coalesce(previous_selection.revision, 0) + 1,
        previous_selection.id, previous_selection.revision,
        successor.id, successor.revision, selected.opportunity_id, selected.opportunity_revision_id, selected.opportunity_revision,
        selected.candidate_revision_id, selected.candidate_revision,
        op.operation_id || ':retain:reference:' || selected.opportunity_id,
        selection_fingerprint, op.created_by
      );
    end loop;

    update tongs.reference_clip_plan_sequences
    set current_plan_revision_id = successor.id,
        current_plan_revision = successor.revision,
        current_selection_revision = (
          select max(revision) from tongs.reference_clip_selections
          where workspace_id = op.workspace_id and workpiece_id = op.workpiece_id
        ),
        updated_at = now()
    where workspace_id = op.workspace_id and workpiece_id = op.workpiece_id;
  else
    successor := provider_plan;
  end if;

  evidence := jsonb_build_object(
    'provider_plan_revision_id', provider_plan.id,
    'final_plan_revision_id', successor.id,
    'provider_proposed', provider_members,
    'creator_retained', retained,
    'creator_added', '[]'::jsonb
  );
  update tongs.unified_visual_plan_operations
  set child_membership_evidence_json = child_membership_evidence_json || jsonb_build_object('reference_clip', evidence),
      updated_at = now()
  where operation_id = op.operation_id
  returning child_membership_evidence_json into evidence;

  return jsonb_build_object(
    'disposition', 'retained',
    'revision_id', successor.id,
    'retained_count', retained_count,
    'membership_evidence', evidence
  );
end
$$;

revoke all on function tongs.retain_unified_reference_clip_selections(text,text,uuid) from public, anon, authenticated;
grant execute on function tongs.retain_unified_reference_clip_selections(text,text,uuid) to authenticated, service_role;

commit;
