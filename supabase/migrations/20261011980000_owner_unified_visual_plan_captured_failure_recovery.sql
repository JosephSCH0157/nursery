begin;

-- A Unified Visual Plan attempt may end in `failed` after OpenAI returned a
-- durable response when a downstream canonical persistence step fails. Keep
-- the exact owner operation/attempt checks, but permit that captured result to
-- resume without requiring a second provider submission.
create or replace function tongs._enforce_hearth_remaining_execution_authority()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_route text;
  v_customer boolean;
  v_historical boolean;
  v_owner tongs.owner_cost_operations%rowtype;
  v_attempt tongs.owner_cost_provider_attempts%rowtype;
  v_latest_state text;
  v_captured_response boolean := false;
begin
  if tg_table_name='unified_visual_plan_operations' then
    v_route:='visual.unified_plan';
    select exists(select 1 from tongs.unified_visual_plan_historical_authorities historical
      where historical.operation_id=new.operation_id) into v_historical;
  elsif tg_table_name='broll_operation_receipts' and new.operation_type='prompt_interpretation' then
    v_route:='motion.broll_interpretation';
    select exists(select 1 from tongs.broll_interpretation_historical_authorities historical
      where historical.operation_id=new.operation_id) into v_historical;
  else
    if new.owner_cost_attempt_id is not null then
      raise exception 'owner authority is restricted to B-roll prompt interpretation' using errcode='23514';
    end if;
    return new;
  end if;

  select exists(select 1 from tongs.openai_text_funding_bindings binding
    where binding.operation_id=new.operation_id and binding.route_code=v_route) into v_customer;
  if ((v_customer::integer)+(v_historical::integer)+
      ((new.owner_cost_attempt_id is not null)::integer)) <> 1 then
    raise exception '% requires exactly one customer, owner, or sealed historical authority', v_route
      using errcode='23514';
  end if;
  if tg_op='UPDATE' and new.owner_cost_attempt_id is distinct from old.owner_cost_attempt_id then
    raise exception 'execution authority is immutable' using errcode='55000';
  end if;
  if v_historical then
    if tg_op='INSERT' or new.owner_cost_attempt_id is not null then
      raise exception 'historical authority is migration-only' using errcode='42501';
    end if;
    return new;
  end if;
  if new.owner_cost_attempt_id is null then return new; end if;

  select * into v_attempt from tongs.owner_cost_provider_attempts
    where attempt_id=new.owner_cost_attempt_id;
  select * into v_owner from tongs.owner_cost_operations
    where operation_id=v_attempt.operation_id;
  select lifecycle_state into v_latest_state from tongs.owner_cost_attempt_events
    where attempt_id=new.owner_cost_attempt_id order by event_sequence desc limit 1;
  if v_route='visual.unified_plan' then
    select exists (
      select 1
      from tongs.owner_cost_attempt_events event
      where event.attempt_id=new.owner_cost_attempt_id
        and event.lifecycle_state='response_captured'
        and event.provider_reference_id is not null
    ) into v_captured_response;
  end if;

  if v_attempt.attempt_id is null or v_owner.operation_id is null
    or v_owner.payer<>'forge' or v_owner.originating_tool<>'hearth'
    or v_owner.operation_type<>v_route or v_owner.operation_key<>new.operation_id
    or v_owner.workspace_id is distinct from new.workspace_id
    or v_owner.workpiece_id is distinct from new.workpiece_id
    or v_owner.request_fingerprint<>new.operation_fingerprint
    or v_attempt.provider<>'openai'
    or (
      v_latest_state not in ('authorized','submitted','response_captured','succeeded')
      and not (v_latest_state='failed' and v_captured_response)
    )
    or (
      new.provider_response_json is not null
      and v_latest_state not in ('response_captured','succeeded')
      and not (v_latest_state='failed' and v_captured_response)
    )
  then raise exception 'owner execution authority does not match canonical operation'
    using errcode='42501'; end if;
  return new;
end
$$;

commit;
