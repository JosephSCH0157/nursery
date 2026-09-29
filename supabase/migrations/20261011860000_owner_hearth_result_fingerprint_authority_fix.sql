-- Slice 4B: a persisted Hearth result identifies the logical owner-cost
-- operation. Provider attempts retain their own, independently immutable
-- execution fingerprints and are bound to the operation by operation_id.

create or replace function tongs._assert_owner_hearth_result_authority(
  p_owner_cost_attempt_id uuid,
  p_route_code text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_request_fingerprint text,
  p_financial_environment text,
  p_runtime_environment text,
  p_provider_request_id text,
  p_model text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_attempt tongs.owner_cost_provider_attempts%rowtype;
  v_operation tongs.owner_cost_operations%rowtype;
  v_latest_state text;
  v_provider_reference text;
  v_route text := lower(btrim(coalesce(p_route_code,'')));
  v_fingerprint text := lower(btrim(coalesce(p_request_fingerprint,'')));
  v_financial text := lower(btrim(coalesce(p_financial_environment,'')));
  v_runtime text := lower(btrim(coalesce(p_runtime_environment,'')));
begin
  perform tongs._require_accounting_service_role();
  if p_owner_cost_attempt_id is null or p_user_id is null or p_workspace_id is null
     or p_workpiece_id is null or v_fingerprint !~ '^[0-9a-f]{64}$'
     or v_financial not in ('live','test')
     or v_runtime not in ('production','preview','development') then
    raise exception 'invalid owner Hearth result authority request' using errcode='22023';
  end if;
  select * into v_attempt from tongs.owner_cost_provider_attempts
    where attempt_id=p_owner_cost_attempt_id;
  if not found then raise exception 'owner-cost attempt not found' using errcode='23503'; end if;
  select * into v_operation from tongs.owner_cost_operations
    where operation_id=v_attempt.operation_id;
  if not found then raise exception 'owner-cost operation not found' using errcode='23503'; end if;
  select e.lifecycle_state into v_latest_state
    from tongs.owner_cost_attempt_events e
    where e.attempt_id=v_attempt.attempt_id order by e.event_sequence desc limit 1;
  select e.provider_reference_id into v_provider_reference
    from tongs.owner_cost_attempt_events e
    where e.attempt_id=v_attempt.attempt_id and e.provider_reference_id is not null
    order by e.event_sequence desc limit 1;
  if v_operation.payer<>'forge' or v_operation.originating_tool<>'hearth'
     or v_operation.operation_type<>v_route
     or v_operation.financial_environment<>v_financial
     or v_operation.runtime_environment<>v_runtime
     or v_operation.workspace_id is distinct from p_workspace_id
     or v_operation.workpiece_id is distinct from p_workpiece_id
     or v_operation.request_fingerprint<>v_fingerprint
     or v_attempt.provider<>'openai'
     or v_latest_state not in ('response_captured','succeeded')
     or (nullif(btrim(coalesce(p_model,'')),'') is not null
       and v_attempt.model is distinct from nullif(btrim(p_model),''))
     or (nullif(btrim(coalesce(p_provider_request_id,'')),'') is not null
       and v_provider_reference is not null
       and v_provider_reference is distinct from nullif(btrim(p_provider_request_id),''))
  then raise exception 'owner Hearth result authority mismatch' using errcode='42501'; end if;
  if not exists (
    select 1 from tongs.workspaces w
    where w.id=p_workspace_id and (
      w.created_by=p_user_id
      or exists(select 1 from tongs.workspace_members m where m.workspace_id=w.id and m.user_id=p_user_id)
      or tongs.is_platform_operator(p_user_id)
    )
  ) then raise exception 'owner Hearth result user cannot access workspace' using errcode='42501'; end if;
  return jsonb_build_object(
    'operation_id',v_operation.operation_id,
    'operation_key',v_operation.operation_key,
    'attempt_id',v_attempt.attempt_id,
    'route_code',v_route
  );
end $$;

