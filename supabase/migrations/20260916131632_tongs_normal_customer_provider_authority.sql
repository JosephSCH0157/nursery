-- Connect the ongoing normal-customer scope to the existing provider-attempt
-- safety boundary. Certification scopes continue through their historical
-- authorization and aggregate-assignment path; normal customers remain
-- bounded by canonical credits, per-operation exposure, concurrency,
-- idempotency, settlement, and the separate failure-loss emergency control.
begin;

create or replace function tongs.authorize_openai_text_provider_attempt(
  p_reservation_id uuid,
  p_attempt_key text,
  p_attempt_number smallint,
  p_failure_exposure_micros bigint,
  p_lease_seconds integer,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  reservation tongs.funding_reservations%rowtype;
  legacy_authorization tongs.customer_paid_execution_test_authorizations%rowtype;
  normal_authorized boolean := false;
begin
  perform tongs._require_pricing_service_role();
  select * into reservation
  from tongs.funding_reservations
  where id = p_reservation_id;
  if not found then
    raise exception 'funding reservation not found' using errcode = 'P0002';
  end if;

  if reservation.funding_source_type in ('customer_deposit', 'paid_allowance', 'beta_grant') then
    select exists (
      select 1
      from tongs.customer_paid_execution_scope_authorizations scope_auth
      where scope_auth.id = reservation.rollout_authorization_id
        and scope_auth.authorization_kind = 'normal_customer'
        and scope_auth.user_id = reservation.user_id
        and scope_auth.financial_environment = reservation.funding_environment
        and scope_auth.status = 'active'
        and scope_auth.valid_from <= now()
        and (scope_auth.valid_until is null or scope_auth.valid_until > now())
    ) into normal_authorized;

    if not normal_authorized then
      if reservation.funding_source_type = 'beta_grant' then
        raise exception 'normal customer paid execution authorization is required for beta credits'
          using errcode = '42501';
      end if;
      select * into legacy_authorization
      from tongs._active_customer_paid_execution_test_authorization_for_quote(reservation.quote_id);
      if not found then
        raise exception 'customer paid execution authorization is closed or expired'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return tongs._authorize_openai_text_provider_attempt_before_customer_test_scope(
    p_reservation_id,
    p_attempt_key,
    p_attempt_number,
    p_failure_exposure_micros,
    p_lease_seconds,
    p_evidence_json
  );
end $$;

create or replace function tongs.authorize_openai_text_provider_attempt_with_aggregate(
  p_reservation_id uuid,
  p_attempt_key text,
  p_attempt_number smallint,
  p_caller_class text,
  p_failure_exposure_micros bigint,
  p_lease_seconds integer,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  aggregate_result jsonb;
  funding_result jsonb;
  normal_customer_credit_bounded boolean := false;
begin
  perform tongs._require_pricing_service_role();

  select exists (
    select 1
    from tongs.funding_reservations reservation
    join tongs.customer_paid_execution_scope_authorizations scope_auth
      on scope_auth.id = reservation.rollout_authorization_id
    where reservation.id = p_reservation_id
      and scope_auth.authorization_kind = 'normal_customer'
      and scope_auth.user_id = reservation.user_id
      and scope_auth.financial_environment = reservation.funding_environment
      and scope_auth.status = 'active'
      and scope_auth.valid_from <= now()
      and (scope_auth.valid_until is null or scope_auth.valid_until > now())
  ) into normal_customer_credit_bounded;

  if normal_customer_credit_bounded then
    aggregate_result := jsonb_build_object(
      'enforcement_enabled', false,
      'authorized', true,
      'reason', 'normal_customer_credit_bounded'
    );
  else
    if exists (
      select 1
      from tongs.openai_text_funding_bindings binding
      join tongs.openai_text_cost_policy_revisions cost_policy
        on cost_policy.id = binding.cost_policy_revision_id
      where binding.reservation_id = p_reservation_id
        and (binding.credential_funding = 'forge' or cost_policy.supporting_cost_ceiling_micros > 0)
    ) and not exists (
      select 1 from tongs.paid_operation_aggregate_bindings
      where reservation_id = p_reservation_id
    ) then
      return jsonb_build_object(
        'provider_execution_authorized', false,
        'reason', 'aggregate_admission_required'
      );
    end if;
    aggregate_result := tongs.begin_paid_operation_aggregate_attempt(
      p_reservation_id,
      p_attempt_key || ':aggregate',
      p_attempt_number,
      p_caller_class
    );
  end if;

  if coalesce((aggregate_result->>'enforcement_enabled')::boolean, false)
     and not coalesce((aggregate_result->>'authorized')::boolean, false) then
    return jsonb_build_object(
      'provider_execution_authorized', false,
      'reason', coalesce(aggregate_result->>'reason', 'aggregate_admission_denied'),
      'aggregate_enforcement_enabled', true
    );
  end if;

  funding_result := tongs.authorize_openai_text_provider_attempt(
    p_reservation_id,
    p_attempt_key,
    p_attempt_number,
    p_failure_exposure_micros,
    p_lease_seconds,
    p_evidence_json
  );

  if coalesce((aggregate_result->>'enforcement_enabled')::boolean, false)
     and not coalesce((funding_result->>'provider_execution_authorized')::boolean, false) then
    perform tongs.record_paid_operation_aggregate_outcome(
      p_reservation_id,
      p_attempt_key || ':aggregate-preprovider-release',
      'preprovider_release',
      null,
      null,
      jsonb_build_object(
        'reason', coalesce(funding_result->>'reason', 'funding_authority_denied'),
        'transmitted', false
      )
    );
  end if;

  return funding_result || jsonb_build_object(
    'aggregate_enforcement_enabled',
      coalesce((aggregate_result->>'enforcement_enabled')::boolean, false),
    'aggregate_hold_id', aggregate_result->>'hold_id',
    'aggregate_reason', aggregate_result->>'reason'
  );
end $$;

revoke all on function tongs.authorize_openai_text_provider_attempt(
  uuid,text,smallint,bigint,integer,jsonb
) from public, anon, authenticated;
revoke all on function tongs.authorize_openai_text_provider_attempt_with_aggregate(
  uuid,text,smallint,text,bigint,integer,jsonb
) from public, anon, authenticated;
grant execute on function tongs.authorize_openai_text_provider_attempt(
  uuid,text,smallint,bigint,integer,jsonb
) to service_role;
grant execute on function tongs.authorize_openai_text_provider_attempt_with_aggregate(
  uuid,text,smallint,text,bigint,integer,jsonb
) to service_role;

comment on function tongs.authorize_openai_text_provider_attempt_with_aggregate(
  uuid,text,smallint,text,bigint,integer,jsonb
) is 'Uses the certification aggregate for certification scopes and the explicit canonical-credit authority for ongoing normal-customer scopes; the separate provider failure-loss boundary remains mandatory.';

notify pgrst, 'reload schema';
commit;

