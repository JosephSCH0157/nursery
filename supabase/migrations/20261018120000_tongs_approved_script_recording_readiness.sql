-- Recording readiness is derived from the current canonical script approval.
-- Approval and its compatibility Ready projection commit in one transaction;
-- optional editorial review and visual assets never participate in this gate.

begin;

alter function tongs.approve_canonical_script_v4(
  uuid,uuid,bigint,bigint,text,text,text,text
) rename to approve_canonical_script_v4_commit_only;

create or replace function tongs.approve_canonical_script_v4(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_expected_current_approval_revision bigint,
  p_expected_source_file_revision bigint,
  p_expected_source_content_hash text,
  p_script_text text,
  p_creator_version_label text,
  p_operation_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_approval jsonb;
  v_approval_id uuid;
  v_approval_revision bigint;
  v_approval_hash text;
  v_ready_result jsonb;
begin
  -- The commit-only implementation retains all existing role, membership,
  -- source-revision, source-hash, and operation-id checks.
  select tongs.approve_canonical_script_v4_commit_only(
    p_workspace_id,
    p_workpiece_id,
    p_expected_current_approval_revision,
    p_expected_source_file_revision,
    p_expected_source_content_hash,
    p_script_text,
    p_creator_version_label,
    p_operation_id
  ) into v_result;

  if coalesce(v_result->>'disposition','') not in ('committed','no_change') then
    return v_result;
  end if;

  v_approval := v_result->'approval';
  begin
    v_approval_id := (v_approval->>'id')::uuid;
    v_approval_revision := (v_approval->>'approval_revision')::bigint;
    v_approval_hash := lower(coalesce(v_approval->>'script_content_hash',''));
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using
        errcode = '23514',
        message = 'canonical script approval returned malformed recording-readiness evidence';
  end;

  if v_approval_id is null
    or v_approval_revision < 1
    or v_approval_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      message = 'canonical script approval returned incomplete recording-readiness evidence';
  end if;

  select tongs.hearth_transition_approved_script_ready_v4(
    p_workspace_id,
    p_workpiece_id,
    v_approval_id,
    'hearth-approved-ready-v4:' || p_workpiece_id::text || ':' || v_approval_id::text,
    jsonb_build_object(
      'transition','hearth.approved-script.ready.v4',
      'script_approval_id',v_approval_id,
      'script_approval_revision',v_approval_revision,
      'script_approval_hash',v_approval_hash
    )
  ) into v_ready_result;

  if coalesce(v_ready_result->>'outcome','') not in ('saved','duplicate') then
    raise exception using
      errcode = '23514',
      message = 'approved script could not become recording-ready',
      detail = coalesce(v_ready_result::text,'null');
  end if;

  return v_result || jsonb_build_object(
    'recording_readiness', jsonb_build_object(
      'state','ready',
      'basis','current_script_approval',
      'ready',v_ready_result->'ready'
    )
  );
end;
$function$;

-- Compatibility path for approvals created before approval atomically emitted
-- Ready. It derives every identity field from the current canonical approval;
-- callers cannot nominate an approval, revision, hash, or unrelated workpiece.
create or replace function tongs.reconcile_current_approved_script_ready_v1(
  p_workspace_id uuid,
  p_workpiece_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_approval tongs.script_approval_revisions%rowtype;
  v_ready_result jsonb;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    return jsonb_build_object('outcome','denied','reason','editor_required','ready',null);
  end if;

  if not exists(
    select 1
    from tongs.episodes e
    where e.id=p_workpiece_id
      and e.workspace_id=p_workspace_id
      and e.archived_at is null
      and e.deleted_at is null
  ) then
    return jsonb_build_object('outcome','not_found','reason','active_episode_membership_invalid','ready',null);
  end if;

  select a.* into v_approval
  from tongs.workpiece_script_approval_sequences s
  join tongs.script_approval_revisions a
    on a.id=s.current_approval_id
    and a.workspace_id=s.workspace_id
    and a.workpiece_id=s.workpiece_id
    and a.approval_revision=s.current_revision
  where s.workspace_id=p_workspace_id
    and s.workpiece_id=p_workpiece_id;

  if not found then
    return jsonb_build_object('outcome','not_found','reason','current_approval_not_found','ready',null);
  end if;

  select tongs.hearth_transition_approved_script_ready_v4(
    p_workspace_id,
    p_workpiece_id,
    v_approval.id,
    'hearth-approved-ready-v4:' || p_workpiece_id::text || ':' || v_approval.id::text,
    jsonb_build_object(
      'transition','hearth.approved-script.ready.v4',
      'script_approval_id',v_approval.id,
      'script_approval_revision',v_approval.approval_revision,
      'script_approval_hash',v_approval.script_content_hash
    )
  ) into v_ready_result;

  return v_ready_result || jsonb_build_object(
    'basis','current_script_approval',
    'reconciled_by',v_user
  );
end;
$function$;

-- Preserve the existing RLS boundary: authenticated clients may read their
-- workspace-scoped projection but cannot write either Ready table directly.
alter table tongs.workpiece_ready_transition_requests enable row level security;
alter table tongs.workpiece_ready_script_meta enable row level security;
revoke insert, update, delete on tongs.workpiece_ready_transition_requests from authenticated;
revoke insert, update, delete on tongs.workpiece_ready_script_meta from authenticated;

revoke all on function tongs.approve_canonical_script_v4_commit_only(
  uuid,uuid,bigint,bigint,text,text,text,text
) from public,anon,authenticated,service_role;
revoke all on function tongs.approve_canonical_script_v4(
  uuid,uuid,bigint,bigint,text,text,text,text
) from public,anon;
revoke all on function tongs.reconcile_current_approved_script_ready_v1(
  uuid,uuid
) from public,anon;
grant execute on function tongs.approve_canonical_script_v4(
  uuid,uuid,bigint,bigint,text,text,text,text
) to authenticated,service_role;
grant execute on function tongs.reconcile_current_approved_script_ready_v1(
  uuid,uuid
) to authenticated,service_role;

alter function tongs.approve_canonical_script_v4_commit_only(
  uuid,uuid,bigint,bigint,text,text,text,text
) owner to postgres;
alter function tongs.approve_canonical_script_v4(
  uuid,uuid,bigint,bigint,text,text,text,text
) owner to postgres;
alter function tongs.reconcile_current_approved_script_ready_v1(
  uuid,uuid
) owner to postgres;

comment on function tongs.approve_canonical_script_v4(
  uuid,uuid,bigint,bigint,text,text,text,text
) is 'Commits canonical script approval and atomically derives Anvil recording readiness. Optional review, thumbnails, images, reference material, and B-roll are non-blocking.';

comment on function tongs.reconcile_current_approved_script_ready_v1(
  uuid,uuid
) is 'Idempotently materializes Ready for an existing current canonical approval after validating workspace role, active workpiece scope, and exact current script identity.';

commit;
