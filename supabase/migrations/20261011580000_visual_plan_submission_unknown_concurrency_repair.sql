-- Keep unresolved supplier liability committed while releasing concurrency only
-- when canonical route-specific evidence proves that no provider attempt remains
-- active and automatic resubmission is prohibited.
begin;

do $$
declare
  exposure bigint;
  concurrency integer;
begin
  -- The linked Visual Plan operation must still present the exact defect this
  -- migration repairs. Disposable replay databases intentionally have no
  -- customer operation rows and skip this linked-data precondition.
  if exists(select 1 from tongs.funding_reservations
    where id='2569c829-18fe-485c-a6f6-b168f23c8d7e') then
    select committed_micros,concurrency_count into exposure,concurrency
    from tongs._openai_text_failure_loss_exposure('visual.unified_plan','test',86400);
    if exposure<>20059 or concurrency<>1 then
      raise exception 'linked Visual Plan exposure must begin at 20059 micros and concurrency 1';
    end if;
  end if;
end $$;

create or replace function tongs._openai_text_failure_loss_exposure(
  p_route_code text,p_financial_environment text,p_rolling_window_seconds integer
) returns table(committed_micros bigint,concurrency_count integer)
language sql stable security definer set search_path=pg_catalog as $$
  with latest as(
    select distinct on(exposure_hold.id)
      exposure_hold.id,exposure_hold.reservation_id,exposure_hold.attempt_key,
      exposure_hold.authorized_exposure_micros,
      exposure_event.id event_id,exposure_event.event_type,
      coalesce(correction.corrected_realized_loss_micros,
        exposure_event.actual_supplier_cost_micros) actual_supplier_cost_micros,
      exposure_event.created_at
    from tongs.openai_text_failure_exposure_holds exposure_hold
    join tongs.funding_reservations exposure_reservation
      on exposure_reservation.id=exposure_hold.reservation_id
    join tongs.openai_text_failure_exposure_events exposure_event
      on exposure_event.hold_id=exposure_hold.id
    left join lateral(
      select corrected.corrected_realized_loss_micros
      from tongs.openai_text_failure_realized_loss_corrections corrected
      where corrected.failure_event_id=exposure_event.id
        and corrected.financial_environment=p_financial_environment
      order by corrected.revision desc limit 1
    ) correction on true
    where exposure_hold.route_code=btrim(p_route_code)
      and exposure_reservation.funding_environment=p_financial_environment
    order by exposure_hold.id,exposure_event.sequence desc
  ), projected as(
    select latest.*,
      not(
        latest.event_type='unresolved'
        and btrim(p_route_code)='visual.unified_plan'
        and exists(
          select 1
          from tongs.funding_reservation_events reservation_event
          where reservation_event.reservation_id=latest.reservation_id
            and reservation_event.sequence=(
              select max(candidate.sequence)
              from tongs.funding_reservation_events candidate
              where candidate.reservation_id=latest.reservation_id
            )
            and reservation_event.event_type='submission_unknown'
            and reservation_event.evidence_json->'automatic_resubmission_allowed'='false'::jsonb
        )
        and exists(
          select 1
          from tongs.funding_reservation_events attempt_event
          where attempt_event.reservation_id=latest.reservation_id
            and attempt_event.event_type='provider_attempt_shadowed'
            and attempt_event.provider_attempt_key=latest.attempt_key
            and attempt_event.lease_expires_at<=now()
        )
        and exists(
          select 1
          from tongs.openai_text_funding_bindings binding
          join tongs.unified_visual_plan_operations operation
            on operation.operation_id=binding.operation_id
          join tongs.unified_visual_plan_transport_recovery_events recovery
            on recovery.operation_id=operation.operation_id
            and recovery.reservation_id=binding.reservation_id
          where binding.reservation_id=latest.reservation_id
            and binding.route_code='visual.unified_plan'
            and operation.state='submission_unknown'
            and recovery.event_type='expired_attempt_submission_unknown'
            and recovery.evidence_json->>'attempt_key'=latest.attempt_key
            and recovery.evidence_json->'automatic_resubmission_allowed'='false'::jsonb
        )
      ) counts_concurrency
    from latest
  )
  select
    coalesce(sum(case
      when event_type in('authorized','unresolved') then authorized_exposure_micros
      when event_type='failure_realized'
        and created_at>=now()-make_interval(secs=>p_rolling_window_seconds)
        then coalesce(actual_supplier_cost_micros,authorized_exposure_micros)
      else 0 end),0)::bigint,
    count(*) filter(
      where event_type in('authorized','unresolved') and counts_concurrency
    )::integer
  from projected
$$;

revoke all on function tongs._openai_text_failure_loss_exposure(text,text,integer)
  from public,anon,authenticated;
grant execute on function tongs._openai_text_failure_loss_exposure(text,text,integer)
  to service_role;

do $$
declare
  decision_id uuid:=extensions.uuid_generate_v5(
    '17000000-0000-4000-8000-000000000006'::uuid,
    'visual-plan-submission-unknown-concurrency-repair-risk-v1');
  test_policy tongs.openai_text_failure_loss_policy_revisions%rowtype;
  test_rollout tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  live_rollout tongs.openai_text_failure_loss_rollout_revisions%rowtype;
  actor uuid;
  exposure bigint;
  concurrency integer;
  reason constant text:=
    'Permit exactly one additional bounded v5 Visual Plan Test canary while retaining the full 13773-micro unresolved liability and the 6286-micro rolling realized loss; terminal submission-unknown evidence consumes no active request concurrency.';
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'openai-text-loss:visual.unified_plan:test',0));

  select * into test_policy
  from tongs.openai_text_failure_loss_policy_revisions
  where id='17000000-0000-4000-8000-000000000006'
    and route_code='visual.unified_plan' and environment='test'
    and revision=1 and per_operation_limit_micros=13773
    and aggregate_limit_micros=13773 and rolling_window_seconds=86400
    and maximum_concurrency=1 and lifecycle_state='active';
  if test_policy.id is null then
    raise exception 'exact Visual Plan Test failure-loss policy is required';
  end if;

  select * into test_rollout
  from tongs._current_openai_text_failure_loss_rollout('visual.unified_plan','test');
  select * into live_rollout
  from tongs._current_openai_text_failure_loss_rollout('visual.unified_plan','live');
  if test_rollout.revision<>2 or test_rollout.mode<>'operator_authorized'
    or test_rollout.loss_policy_revision_id<>test_policy.id
    or test_rollout.operator_decision_id<>'cdc820d9-e6b8-53fd-9ca8-f6a41eced0a2'
  then raise exception 'exact pre-repair Visual Plan Test rollout is required'; end if;
  if live_rollout.revision<>1 or live_rollout.mode<>'enforce'
    or live_rollout.loss_policy_revision_id<>'17000000-0000-4000-8000-000000000007'
    or live_rollout.operator_decision_id is not null
  then raise exception 'Live failure-loss rollout must remain unchanged'; end if;

  select actor_id into actor
  from tongs.openai_text_failure_loss_operator_decisions
  where id=test_rollout.operator_decision_id
    and known_exposure_micros=6286 and active_concurrency=0
    and additional_loss_capacity_micros=13773
    and effective_aggregate_limit_micros=20059;
  if actor is null then raise exception 'prior bounded Visual Plan authority mismatch'; end if;

  if exists(select 1 from tongs.funding_reservations
    where id='2569c829-18fe-485c-a6f6-b168f23c8d7e') then
    if not exists(
      select 1
      from tongs.openai_text_funding_bindings binding
      join tongs.funding_reservations reservation
        on reservation.id=binding.reservation_id
      join tongs.unified_visual_plan_operations operation
        on operation.operation_id=binding.operation_id
      join tongs.unified_visual_plan_transport_recovery_events recovery
        on recovery.operation_id=operation.operation_id
        and recovery.reservation_id=reservation.id
      join tongs.openai_text_failure_exposure_holds hold
        on hold.reservation_id=reservation.id
      join lateral(
        select event.* from tongs.openai_text_failure_exposure_events event
        where event.hold_id=hold.id order by event.sequence desc limit 1
      ) exposure_event on true
      where reservation.id='2569c829-18fe-485c-a6f6-b168f23c8d7e'
        and reservation.funding_environment='test'
        and reservation.reserved_wholesale_spend_micros=13773
        and binding.route_code='visual.unified_plan'
        and binding.model='gpt-5.6-luna' and binding.maximum_attempts=1
        and operation.state='submission_unknown'
        and operation.provider_response_json is null and operation.receipt_json is null
        and exposure_event.event_type='unresolved'
        and exposure_event.actual_supplier_cost_micros is null
        and hold.authorized_exposure_micros=13773
        and recovery.event_type='expired_attempt_submission_unknown'
        and recovery.evidence_json->>'attempt_key'=hold.attempt_key
        and recovery.evidence_json->'automatic_resubmission_allowed'='false'::jsonb
        and exists(
          select 1 from tongs.funding_reservation_events attempt_event
          where attempt_event.reservation_id=reservation.id
            and attempt_event.event_type='provider_attempt_shadowed'
            and attempt_event.provider_attempt_key=hold.attempt_key
            and attempt_event.lease_expires_at<=now()
        )
        and exists(
          select 1 from tongs.funding_reservation_events terminal_event
          where terminal_event.reservation_id=reservation.id
            and terminal_event.sequence=(select max(candidate.sequence)
              from tongs.funding_reservation_events candidate
              where candidate.reservation_id=reservation.id)
            and terminal_event.event_type='submission_unknown'
            and terminal_event.evidence_json->'automatic_resubmission_allowed'='false'::jsonb
        )
    ) then raise exception 'canonical terminal submission-unknown evidence mismatch'; end if;
    if exists(select 1 from tongs.openai_text_provider_captures
        where reservation_id='2569c829-18fe-485c-a6f6-b168f23c8d7e')
      or exists(select 1 from tongs.openai_text_usage_evidence
        where reservation_id='2569c829-18fe-485c-a6f6-b168f23c8d7e')
      or exists(select 1 from tongs.openai_text_persisted_results
        where reservation_id='2569c829-18fe-485c-a6f6-b168f23c8d7e')
      or exists(select 1 from tongs.supplier_expenses
        where reservation_id='2569c829-18fe-485c-a6f6-b168f23c8d7e')
      or exists(select 1 from tongs.funding_reservation_events
        where reservation_id='2569c829-18fe-485c-a6f6-b168f23c8d7e'
          and event_type='settled' and coalesce(customer_charge_micros,0)<>0)
    then raise exception 'submission-unknown financial evidence changed'; end if;

    select committed_micros,concurrency_count into exposure,concurrency
    from tongs._openai_text_failure_loss_exposure(
      'visual.unified_plan','test',test_policy.rolling_window_seconds);
    if exposure<>20059 or concurrency<>0 then
      raise exception 'repaired Visual Plan exposure must be 20059 micros with zero active concurrency';
    end if;
  end if;

  insert into tongs.openai_text_failure_loss_operator_decisions(
    id,route_code,financial_environment,decision_type,loss_policy_revision_id,
    source_rollout_revision,source_rollout_mode,resulting_rollout_revision,
    resulting_rollout_mode,known_exposure_micros,active_concurrency,
    base_aggregate_limit_micros,additional_loss_capacity_micros,
    effective_aggregate_limit_micros,reason,actor_id
  ) values(
    decision_id,'visual.unified_plan','test','bounded_test_risk_acceptance',
    test_policy.id,2,'operator_authorized',3,'operator_authorized',
    20059,0,13773,13773,33832,reason,actor
  );

  insert into tongs.openai_text_failure_loss_rollout_revisions(
    route_code,financial_environment,revision,mode,loss_policy_revision_id,
    source_limit_event_id,reason,actor_id,operator_decision_id
  ) values(
    'visual.unified_plan','test',3,'operator_authorized',test_policy.id,
    null,reason,actor,decision_id
  );

  if not exists(
    select 1
    from tongs._current_openai_text_failure_loss_rollout('visual.unified_plan','test') rollout
    join tongs.openai_text_failure_loss_operator_decisions decision
      on decision.id=rollout.operator_decision_id
    where rollout.revision=3 and rollout.mode='operator_authorized'
      and rollout.loss_policy_revision_id=test_policy.id
      and decision.id=decision_id
      and decision.source_rollout_revision=2
      and decision.known_exposure_micros=20059
      and decision.active_concurrency=0
      and decision.base_aggregate_limit_micros=13773
      and decision.additional_loss_capacity_micros=13773
      and decision.effective_aggregate_limit_micros=33832
  ) then raise exception 'bounded post-repair Visual Plan Test authority mismatch'; end if;
  if not exists(
    select 1 from tongs._current_openai_text_failure_loss_rollout('visual.unified_plan','live')
    where revision=live_rollout.revision and mode=live_rollout.mode
      and loss_policy_revision_id=live_rollout.loss_policy_revision_id
      and operator_decision_id is not distinct from live_rollout.operator_decision_id
  ) then raise exception 'Live failure-loss authority changed'; end if;
  if not exists(
    select 1 from tongs.private_pricing_revisions
    where id='17000000-0000-4000-8000-000000000003'
      and customer_credit_units=4 and full_cost_ceiling_micros=13773
  ) then raise exception 'Visual Plan customer price changed'; end if;
  if exists(
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where route_code='visual.unified_plan' and financial_environment='live'
      and status='active'
  ) then raise exception 'Live Visual Plan customer scope changed'; end if;
end $$;

comment on function tongs._openai_text_failure_loss_exposure(text,text,integer) is
  'Projects committed supplier liability independently from active attempt concurrency. Terminal Visual Plan submission-unknown holds retain full exposure but release concurrency only with canonical reservation, operation, expired-lease, and no-resubmission evidence.';

commit;
