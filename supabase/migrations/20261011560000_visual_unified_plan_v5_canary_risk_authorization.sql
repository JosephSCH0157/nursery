-- Authorize one additional bounded Test Visual Plan canary while the
-- historical 6,286-micro realized supplier expense remains in the rolling
-- window. This appends operator authority only: the hard per-operation,
-- concurrency, pricing, customer-scope, and Live authorities stay unchanged.
begin;

do $$
declare
  decision_id constant uuid := 'cdc820d9-e6b8-53fd-9ca8-f6a41eced0a2';
  test_policy tongs.openai_text_failure_loss_policy_revisions%rowtype;
  test_rollout tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  live_rollout tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  actor uuid;
  linked_exposure bigint;
  linked_concurrency integer;
  reason constant text :=
    'Permit exactly one additional bounded v5 Visual Plan Test canary while 6286 micros of prior realized supplier expense remains inside the 24-hour rolling window.';
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'openai-text-loss:visual.unified_plan:test',0));

  select * into test_policy
  from tongs.openai_text_failure_loss_policy_revisions
  where id='17000000-0000-4000-8000-000000000006'
    and route_code='visual.unified_plan'
    and environment='test'
    and revision=1
    and per_operation_limit_micros=13773
    and aggregate_limit_micros=13773
    and rolling_window_seconds=86400
    and maximum_concurrency=1
    and lifecycle_state='active';
  if test_policy.id is null then
    raise exception 'exact Visual Plan Test failure-loss policy is required';
  end if;

  select * into test_rollout
  from tongs._current_openai_text_failure_loss_rollout('visual.unified_plan','test');
  select * into live_rollout
  from tongs._current_openai_text_failure_loss_rollout('visual.unified_plan','live');
  if test_rollout.revision<>1 or test_rollout.mode<>'enforce'
    or test_rollout.loss_policy_revision_id<>test_policy.id
    or test_rollout.operator_decision_id is not null
  then
    raise exception 'exact pre-canary Test failure-loss rollout is required';
  end if;
  if live_rollout.revision<>1 or live_rollout.mode<>'enforce'
    or live_rollout.loss_policy_revision_id<>'17000000-0000-4000-8000-000000000007'
    or live_rollout.operator_decision_id is not null
  then
    raise exception 'Live failure-loss rollout must remain unchanged';
  end if;

  -- The linked deployment contains this historical reservation. Disposable
  -- replay databases intentionally do not reproduce customer financial rows,
  -- so the stored decision snapshot below remains the replay authority there.
  if exists(
    select 1 from tongs.funding_reservations
    where id='f1972784-1ec5-4465-a6ab-6807b69f836e'
  ) then
    select committed_micros,concurrency_count
    into linked_exposure,linked_concurrency
    from tongs._openai_text_failure_loss_exposure(
      'visual.unified_plan','test',test_policy.rolling_window_seconds);
    if linked_exposure<>6286 or linked_concurrency<>0 then
      raise exception 'Visual Plan Test exposure must be exactly 6286 micros with zero active concurrency';
    end if;
  end if;

  select user_id into actor
  from tongs.platform_operators
  order by granted_at
  limit 1;
  if actor is null then raise exception 'platform operator required'; end if;

  if not exists(
    select 1
    from tongs.openai_text_model_route_compatibility compatibility
    join tongs.openai_text_model_catalog_entries entry
      on entry.id=compatibility.catalog_entry_id
    join tongs.openai_text_model_catalog_revisions catalog
      on catalog.id=entry.catalog_revision_id
    where catalog.revision=11 and catalog.lifecycle_state='active'
      and catalog.revision=(select max(revision)
        from tongs.openai_text_model_catalog_revisions where lifecycle_state='active')
      and entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='visual.unified_plan'
      and compatibility.compatibility_status='generation_verified'
      and compatibility.maximum_input_tokens=32000
      and compatibility.maximum_output_tokens=6144
      and compatibility.maximum_attempts=1
      and compatibility.cost_policy_revision_id='17000000-0000-4000-8000-000000000001'
      and compatibility.evidence_json->>'provider_contract_version'='forge.unified-visual-plan-provider.v5'
  ) then
    raise exception 'active Visual Plan v5 compatibility is required';
  end if;

  if not exists(
    select 1 from tongs.private_pricing_revisions
    where id='17000000-0000-4000-8000-000000000003'
      and customer_credit_units=4
      and full_cost_ceiling_micros=13773
  ) then raise exception 'unchanged four-credit Visual Plan pricing is required'; end if;
  if exists(
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where route_code='visual.unified_plan'
      and financial_environment='live'
      and status='active'
  ) then raise exception 'Live Visual Plan customer scope must remain absent'; end if;

  insert into tongs.openai_text_failure_loss_operator_decisions(
    id,route_code,financial_environment,decision_type,loss_policy_revision_id,
    source_rollout_revision,source_rollout_mode,resulting_rollout_revision,
    resulting_rollout_mode,known_exposure_micros,active_concurrency,
    base_aggregate_limit_micros,additional_loss_capacity_micros,
    effective_aggregate_limit_micros,reason,actor_id
  ) values(
    decision_id,'visual.unified_plan','test','bounded_test_risk_acceptance',
    test_policy.id,test_rollout.revision,test_rollout.mode,2,'operator_authorized',
    6286,0,13773,13773,20059,reason,actor
  );

  insert into tongs.openai_text_failure_loss_rollout_revisions(
    route_code,financial_environment,revision,mode,loss_policy_revision_id,
    source_limit_event_id,reason,actor_id,operator_decision_id
  ) values(
    'visual.unified_plan','test',2,'operator_authorized',test_policy.id,
    null,reason,actor,decision_id
  );

  if not exists(
    select 1
    from tongs._current_openai_text_failure_loss_rollout('visual.unified_plan','test') rollout
    join tongs.openai_text_failure_loss_operator_decisions decision
      on decision.id=rollout.operator_decision_id
    where rollout.revision=2
      and rollout.mode='operator_authorized'
      and rollout.loss_policy_revision_id=test_policy.id
      and decision.id=decision_id
      and decision.known_exposure_micros=6286
      and decision.additional_loss_capacity_micros=13773
      and decision.effective_aggregate_limit_micros=20059
      and decision.active_concurrency=0
  ) then raise exception 'bounded v5 Visual Plan Test canary authority mismatch'; end if;

  if not exists(
    select 1 from tongs.openai_text_failure_loss_policy_revisions
    where id=test_policy.id and per_operation_limit_micros=13773
      and aggregate_limit_micros=13773 and maximum_concurrency=1
      and rolling_window_seconds=86400
  ) then raise exception 'hard Visual Plan Test limits changed'; end if;
  if not exists(
    select 1 from tongs._current_openai_text_failure_loss_rollout('visual.unified_plan','live')
    where revision=live_rollout.revision and mode=live_rollout.mode
      and loss_policy_revision_id=live_rollout.loss_policy_revision_id
      and operator_decision_id is not distinct from live_rollout.operator_decision_id
  ) then raise exception 'Live failure-loss authority changed'; end if;
end $$;

commit;
