begin;

-- Owner Unified Visual Plan continuation is permitted only for the service
-- accounting path bound to the exact canonical owner operation and attempt.
-- Customer operations continue to require the pre-existing workspace editor
-- authority in each public persistence function.
create function tongs._assert_owner_unified_visual_plan_persistence_authority(
  p_owner_cost_attempt_id uuid,
  p_operation_id text,
  p_operation_fingerprint text,
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_created_by uuid
) returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  perform tongs._require_accounting_service_role();

  if p_owner_cost_attempt_id is null or not exists (
    select 1
    from tongs.owner_cost_provider_attempts attempt
    join tongs.owner_cost_operations owner_operation
      on owner_operation.operation_id = attempt.operation_id
    join tongs.workspaces workspace
      on workspace.id = p_workspace_id
    where attempt.attempt_id = p_owner_cost_attempt_id
      and attempt.provider = 'openai'
      and owner_operation.payer = 'forge'
      and owner_operation.originating_tool = 'hearth'
      and owner_operation.operation_type = 'visual.unified_plan'
      and owner_operation.operation_key = p_operation_id
      and owner_operation.request_fingerprint = p_operation_fingerprint
      and owner_operation.workspace_id is not distinct from p_workspace_id
      and owner_operation.workpiece_id is not distinct from p_workpiece_id
      and (
        workspace.created_by = p_created_by
        or exists (
          select 1
          from tongs.workspace_members member
          where member.workspace_id = workspace.id
            and member.user_id = p_created_by
        )
        or tongs.is_platform_operator(p_created_by)
      )
      and exists (
        select 1
        from tongs.owner_cost_attempt_events event
        where event.attempt_id = attempt.attempt_id
          and event.lifecycle_state = 'response_captured'
          and event.provider_reference_id is not null
      )
  ) then
    raise exception 'owner Unified Visual Plan persistence authority mismatch'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function tongs._assert_owner_unified_visual_plan_persistence_authority(
  uuid,text,text,uuid,uuid,uuid
) from public, anon, authenticated, service_role;

do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_patched text;
  v_guard_pattern text :=
    'if not tongs\.has_workspace_role\(op\.workspace_id,\s*''editor''\) then\s*'
    || 'raise exception ''workspace editor authority required'' using errcode\s*=\s*''42501'';\s*end if;';
  v_owner_guard text := $guard$
if op.owner_cost_attempt_id is not null then
    perform tongs._assert_owner_unified_visual_plan_persistence_authority(
      op.owner_cost_attempt_id,
      op.operation_id,
      op.operation_fingerprint,
      op.workspace_id,
      op.workpiece_id,
      op.created_by
    );
  elsif coalesce(auth.role(), '') = 'service_role' then
    raise exception 'owner-bound Unified Visual Plan operation required for service continuation'
      using errcode = '42501';
  elsif not tongs.has_workspace_role(op.workspace_id, 'editor') then
    raise exception 'workspace editor authority required' using errcode = '42501';
  end if;$guard$;
begin
  foreach v_signature in array array[
    'tongs.record_unified_image_plan_membership(text,text,uuid)'::regprocedure,
    'tongs.retain_unified_visual_plan_selections(text,text,text,uuid)'::regprocedure,
    'tongs.retain_unified_reference_clip_selections_singular_legacy(text,text,uuid)'::regprocedure,
    'tongs.adopt_creator_amended_reference_visual_plan(text,text)'::regprocedure,
    'tongs.adopt_repaired_image_map_for_unified_operation(text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_patched := regexp_replace(v_definition, v_guard_pattern, v_owner_guard);
    if v_patched = v_definition then
      raise exception 'owner persistence authority guard not found in %', v_signature;
    end if;
    execute v_patched;
  end loop;

  -- The reference-clip collection wrapper performs writes before invoking its
  -- private singular core, so it must authorize the operation before either
  -- the marker copy or the delegated retention transaction begins.
  v_signature := 'tongs.retain_unified_reference_clip_selections(text,text,uuid)'::regprocedure;
  select pg_get_functiondef(v_signature) into v_definition;
  v_patched := replace(
    v_definition,
    ' select * into op from tongs.unified_visual_plan_operations where operation_id=p_operation_id;',
    $wrapper$
 select * into op
 from tongs.unified_visual_plan_operations
 where operation_id=p_operation_id
 for update;
 if not found or op.operation_fingerprint<>p_operation_fingerprint then
  return jsonb_build_object('disposition','operation_identity_conflict');
 end if;
 if op.owner_cost_attempt_id is not null then
  perform tongs._assert_owner_unified_visual_plan_persistence_authority(
   op.owner_cost_attempt_id,op.operation_id,op.operation_fingerprint,
   op.workspace_id,op.workpiece_id,op.created_by);
 elsif coalesce(auth.role(),'')='service_role' then
  raise exception 'owner-bound Unified Visual Plan operation required for service continuation'
   using errcode='42501';
 elsif not tongs.has_workspace_role(op.workspace_id,'editor') then
  raise exception 'workspace editor authority required' using errcode='42501';
 end if;$wrapper$
  );
  if v_patched = v_definition then
    raise exception 'reference-clip collection wrapper lookup was not found';
  end if;
  execute v_patched;
end
$migration$;

-- CREATE OR REPLACE preserves the five public RPC ACLs and the legacy service
-- core ACL. Assert that no browser role can execute the private assertion/core,
-- and that the public RPC grants remain exactly as before this migration.
do $$
declare
  v_public_rpc regprocedure;
begin
  foreach v_public_rpc in array array[
    'tongs.record_unified_image_plan_membership(text,text,uuid)'::regprocedure,
    'tongs.retain_unified_visual_plan_selections(text,text,text,uuid)'::regprocedure,
    'tongs.retain_unified_reference_clip_selections(text,text,uuid)'::regprocedure,
    'tongs.adopt_creator_amended_reference_visual_plan(text,text)'::regprocedure,
    'tongs.adopt_repaired_image_map_for_unified_operation(text,text)'::regprocedure
  ] loop
    if not has_function_privilege('authenticated', v_public_rpc, 'execute')
      or not has_function_privilege('service_role', v_public_rpc, 'execute')
      or has_function_privilege('anon', v_public_rpc, 'execute')
    then
      raise exception 'Unified Visual Plan persistence RPC grants changed for %', v_public_rpc;
    end if;
  end loop;

  if has_function_privilege(
      'authenticated',
      'tongs._assert_owner_unified_visual_plan_persistence_authority(uuid,text,text,uuid,uuid,uuid)',
      'execute')
    or has_function_privilege(
      'service_role',
      'tongs._assert_owner_unified_visual_plan_persistence_authority(uuid,text,text,uuid,uuid,uuid)',
      'execute')
    or has_function_privilege(
      'authenticated',
      'tongs.retain_unified_reference_clip_selections_singular_legacy(text,text,uuid)',
      'execute')
    or not has_function_privilege(
      'service_role',
      'tongs.retain_unified_reference_clip_selections_singular_legacy(text,text,uuid)',
      'execute')
  then
    raise exception 'Unified Visual Plan persistence helper grant changed';
  end if;
end
$$;

commit;
