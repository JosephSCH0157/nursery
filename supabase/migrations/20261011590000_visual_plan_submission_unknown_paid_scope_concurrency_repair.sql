-- Keep terminal submission-unknown liability committed while releasing the
-- generic paid-scope concurrency slot only when the same canonical evidence
-- used by the provider failure-loss projection proves no attempt is active.
begin;

do $$
declare
  active_count bigint;
begin
  -- Linked-state guard for the exact reservation that exposed the stale
  -- paid-scope projection. Disposable migration databases skip this check.
  if exists(
    select 1 from tongs.funding_reservations
    where id='2569c829-18fe-485c-a6f6-b168f23c8d7e'
  ) then
    select count(*) into active_count
    from tongs.funding_reservations reservation
    where reservation.rollout_authorization_id=
      '26c4cf82-0866-5e74-b1ac-7fbc7212be8a'
      and tongs._funding_reservation_state(reservation.id) in(
        'reserved','attempt_started','provider_attempt_shadowed','submission_unknown'
      );
    if active_count<>1 then
      raise exception 'linked paid-scope concurrency defect is not present';
    end if;
  end if;
end $$;

create or replace function tongs._funding_reservation_counts_paid_scope_concurrency(
  p_reservation_id uuid
) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select case
    when tongs._funding_reservation_state(reservation.id) not in(
      'reserved','attempt_started','provider_attempt_shadowed','submission_unknown'
    ) then false
    when exists(
      select 1
      from tongs.openai_text_funding_bindings binding
      join tongs.unified_visual_plan_operations operation
        on operation.operation_id=binding.operation_id
      join tongs.unified_visual_plan_transport_recovery_events recovery
        on recovery.operation_id=operation.operation_id
        and recovery.reservation_id=binding.reservation_id
      where binding.reservation_id=reservation.id
        and binding.route_code='visual.unified_plan'
        and operation.state='submission_unknown'
        and recovery.event_type='expired_attempt_submission_unknown'
        and recovery.evidence_json->'automatic_resubmission_allowed'='false'::jsonb
        and exists(
          select 1
          from tongs.funding_reservation_events terminal_event
          where terminal_event.reservation_id=reservation.id
            and terminal_event.sequence=(
              select max(candidate.sequence)
              from tongs.funding_reservation_events candidate
              where candidate.reservation_id=reservation.id
            )
            and terminal_event.event_type='submission_unknown'
            and terminal_event.evidence_json->'automatic_resubmission_allowed'='false'::jsonb
        )
        and exists(
          select 1
          from tongs.funding_reservation_events attempt_event
          where attempt_event.reservation_id=reservation.id
            and attempt_event.event_type='provider_attempt_shadowed'
            and attempt_event.provider_attempt_key=
              recovery.evidence_json->>'attempt_key'
            and attempt_event.lease_expires_at<=now()
        )
    ) then false
    else true
  end
  from tongs.funding_reservations reservation
  where reservation.id=p_reservation_id
$$;

revoke all on function
  tongs._funding_reservation_counts_paid_scope_concurrency(uuid)
  from public,anon,authenticated;
grant execute on function
  tongs._funding_reservation_counts_paid_scope_concurrency(uuid)
  to service_role;

create or replace function tongs._stamp_and_authorize_funding_reservation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_quote tongs.customer_spending_quotes%rowtype;
  v_source_environment text;
  v_binding tongs.openai_text_customer_quote_bindings%rowtype;
  v_authorization tongs.customer_paid_execution_scope_authorizations%rowtype;
  v_prior_count bigint;
  v_active_count bigint;
begin
  select * into v_quote
  from tongs.customer_spending_quotes where id=new.quote_id;
  if not found then
    raise exception 'spending quote not found' using errcode='P0002';
  end if;

  if new.funding_source_type='customer_deposit' then
    select stripe_mode into v_source_environment
    from tongs.customer_deposits where id=new.funding_source_id;
  elsif new.funding_source_type='paid_allowance' then
    select financial_environment into v_source_environment
    from tongs.paid_allowance_grants where id=new.funding_source_id;
  elsif new.funding_source_type='beta_grant' then
    select financial_environment into v_source_environment
    from tongs.beta_credit_grants where id=new.funding_source_id;
  elsif new.funding_source_type='owner_budget' then
    v_source_environment:='owner_internal';
  else
    v_source_environment:=v_quote.financial_environment;
  end if;
  if v_source_environment is null then
    raise exception 'funding source environment is unavailable'
      using errcode='P0002';
  end if;
  if new.funding_source_type in(
      'customer_deposit','paid_allowance','beta_grant'
    ) and v_source_environment<>v_quote.financial_environment then
    raise exception 'cross-environment customer funding is forbidden'
      using errcode='42501';
  end if;
  new.funding_environment:=v_source_environment;

  if new.funding_source_type not in(
    'customer_deposit','paid_allowance','beta_grant'
  ) then return new; end if;

  select * into v_binding
  from tongs.openai_text_customer_quote_bindings
  where quote_id=new.quote_id;
  if not found then
    raise exception 'generic paid execution authorization requires an immutable provider quote binding'
      using errcode='42501';
  end if;
  select scope_auth.* into v_authorization
  from tongs.customer_paid_execution_scope_authorizations scope_auth
  where scope_auth.user_id=new.user_id
    and scope_auth.workspace_id=v_binding.workspace_id
    and scope_auth.financial_environment=v_source_environment
    and scope_auth.route_code=v_binding.route_code
    and scope_auth.provider='openai'
    and scope_auth.model_or_sku=v_binding.runtime_model
    and scope_auth.pricing_revision_id=v_binding.pricing_revision_id
    and scope_auth.cost_policy_revision_id=v_binding.cost_policy_revision_id
    and scope_auth.status='active'
    and scope_auth.valid_from<=now()
    and(scope_auth.valid_until is null or scope_auth.valid_until>now())
  order by(scope_auth.authorization_kind='normal_customer') desc,
    scope_auth.created_at desc
  limit 1;
  if not found
    or new.reserved_customer_charge_micros>
      v_authorization.maximum_customer_charge_micros
    or new.reserved_wholesale_spend_micros>
      v_authorization.maximum_wholesale_exposure_micros then
    raise exception 'customer paid execution is not authorized for this scope'
      using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('paid-scope:'||v_authorization.id::text,0));
  if v_authorization.maximum_operation_count is not null then
    select count(*) into v_prior_count
    from tongs.funding_reservations reservation
    where reservation.rollout_authorization_id=v_authorization.id;
    if v_prior_count>=v_authorization.maximum_operation_count then
      raise exception 'customer paid execution operation limit reached'
        using errcode='P0001';
    end if;
  end if;

  select count(*) into v_active_count
  from tongs.funding_reservations reservation
  where reservation.rollout_authorization_id=v_authorization.id
    and tongs._funding_reservation_counts_paid_scope_concurrency(
      reservation.id
    );
  if v_active_count>=v_authorization.maximum_concurrency then
    raise exception 'customer paid execution concurrency limit reached'
      using errcode='P0001';
  end if;
  new.rollout_authorization_id:=v_authorization.id;
  return new;
end $$;

revoke all on function tongs._stamp_and_authorize_funding_reservation()
  from public,anon,authenticated;
grant execute on function tongs._stamp_and_authorize_funding_reservation()
  to service_role;

do $$
declare
  counts_concurrency boolean;
  committed bigint;
  failure_loss_concurrency integer;
begin
  if exists(
    select 1 from tongs.funding_reservations
    where id='2569c829-18fe-485c-a6f6-b168f23c8d7e'
  ) then
    select tongs._funding_reservation_counts_paid_scope_concurrency(
      '2569c829-18fe-485c-a6f6-b168f23c8d7e'
    ) into counts_concurrency;
    if counts_concurrency then
      raise exception 'terminal Visual Plan reservation still consumes paid-scope concurrency';
    end if;

    select committed_micros,concurrency_count
    into committed,failure_loss_concurrency
    from tongs._openai_text_failure_loss_exposure(
      'visual.unified_plan','test',86400
    );
    if committed<>20059 or failure_loss_concurrency<>0 then
      raise exception 'Visual Plan failure-loss exposure changed unexpectedly';
    end if;

    if exists(
      select 1 from tongs.funding_reservations
      where quote_id='78717410-4868-4755-b8ce-3e09fed1bd54'
    ) then
      raise exception 'failed fresh quote unexpectedly acquired a reservation';
    end if;
  end if;
end $$;

comment on function
  tongs._funding_reservation_counts_paid_scope_concurrency(uuid) is
  'Projects paid-scope concurrency from canonical execution evidence. A terminal Visual Plan submission-unknown reservation releases concurrency only after its attempt lease expires and canonical operation, recovery, and no-resubmission evidence agree; financial exposure and replay rules are unchanged.';

commit;
