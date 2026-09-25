-- Repair the aggregate Runway submission wrapper's exact helper signature.
--
-- PostgreSQL resolves the literal `1` as integer inside the PL/pgSQL call,
-- while begin_paid_operation_aggregate_attempt requires smallint. The failure
-- occurs after quote acceptance/reservation and before any provider boundary.
-- This migration changes only that call-site cast. It does not create an
-- acceptance, reservation, aggregate hold, provider boundary, or provider call.
begin;

do $$
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20261011770000'
  ) then
    raise exception '20261011770000 must precede the Runway aggregate signature repair';
  end if;
end $$;

create or replace function tongs.authorize_runway_submission_with_aggregate(
  p_operation_id text,
  p_operation_fingerprint text,
  p_submission_attempt_id text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_model text,
  p_duration_seconds integer,
  p_ratio text,
  p_caller_class text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  rollout tongs.runway_execution_rollout_revisions%rowtype;
  admission jsonb;
  aggregate_attempt jsonb;
  result jsonb;
  reservation uuid;
begin
  perform tongs._require_pricing_service_role();
  select * into rollout from tongs._current_runway_execution_rollout();
  if rollout.mode<>'enforce' then
    return tongs.authorize_runway_submission(
      p_operation_id,p_operation_fingerprint,p_submission_attempt_id,
      p_user_id,p_workspace_id,p_model,p_duration_seconds,p_ratio,p_evidence_json);
  end if;

  admission:=tongs.acquire_runway_aggregate_admission(
    p_operation_id,p_operation_fingerprint,p_user_id,p_workspace_id,
    p_caller_class,'real');
  if coalesce((admission->>'enforcement_enabled')::boolean,false)
     and not coalesce((admission->>'authorized')::boolean,false) then
    select reservation_id into reservation
    from tongs.runway_funding_bindings where operation_id=btrim(p_operation_id);
    if reservation is not null then
      perform tongs.release_operation(
        reservation,
        p_submission_attempt_id||':aggregate-admission-denied-release',
        coalesce(admission->>'reason','aggregate_admission_denied'),
        jsonb_build_object('transmitted',false,'aggregate_admission_denied',true));
    end if;
    return jsonb_build_object(
      'mode',rollout.mode,
      'rollout_revision',rollout.revision,
      'provider_execution_authorized',false,
      'legacy_execution_allowed',false,
      'reason',admission->>'reason',
      'replay',false,
      'reservation_id',null,
      'aggregate_enforcement_enabled',true);
  end if;

  select reservation_id into reservation
  from tongs.runway_funding_bindings where operation_id=btrim(p_operation_id);
  aggregate_attempt:=tongs.begin_paid_operation_aggregate_attempt(
    reservation,p_submission_attempt_id||':aggregate',1::smallint,p_caller_class);
  if coalesce((aggregate_attempt->>'enforcement_enabled')::boolean,false)
     and not coalesce((aggregate_attempt->>'authorized')::boolean,false) then
    return jsonb_build_object(
      'mode',rollout.mode,
      'rollout_revision',rollout.revision,
      'provider_execution_authorized',false,
      'legacy_execution_allowed',false,
      'reason',aggregate_attempt->>'reason',
      'replay',coalesce((aggregate_attempt->>'replay')::boolean,false),
      'reservation_id',reservation,
      'aggregate_enforcement_enabled',true);
  end if;

  result:=tongs.authorize_runway_submission(
    p_operation_id,p_operation_fingerprint,p_submission_attempt_id,
    p_user_id,p_workspace_id,p_model,p_duration_seconds,p_ratio,p_evidence_json);
  if coalesce((aggregate_attempt->>'enforcement_enabled')::boolean,false)
     and not coalesce((result->>'provider_execution_authorized')::boolean,false) then
    perform tongs.record_paid_operation_aggregate_outcome(
      reservation,
      p_submission_attempt_id||':aggregate-preprovider-release',
      'preprovider_release',null,null,
      jsonb_build_object(
        'reason',coalesce(result->>'reason','funding_authority_denied'),
        'transmitted',false));
  end if;
  return result||jsonb_build_object(
    'aggregate_enforcement_enabled',
      coalesce((aggregate_attempt->>'enforcement_enabled')::boolean,false),
    'aggregate_hold_id',aggregate_attempt->>'hold_id');
end $$;

revoke all on function tongs.authorize_runway_submission_with_aggregate(
  text,text,text,uuid,uuid,text,integer,text,text,jsonb
) from public,anon,authenticated;
grant execute on function tongs.authorize_runway_submission_with_aggregate(
  text,text,text,uuid,uuid,text,integer,text,text,jsonb
) to service_role;

do $$
declare
  target_operation_id constant text :=
    'forge:broll:acquire:eca82dd315133b5db4197005ee769f7bfae6cd064ff80dea53f787d5feae176f';
  target_operation_fingerprint constant text :=
    'eca82dd315133b5db4197005ee769f7bfae6cd064ff80dea53f787d5feae176f';
  operation tongs.broll_operation_receipts%rowtype;
  reservation tongs.funding_reservations%rowtype;
begin
  if position(
       '1::smallint' in
       pg_get_functiondef(
         'tongs.authorize_runway_submission_with_aggregate(text,text,text,uuid,uuid,text,integer,text,text,jsonb)'::regprocedure)
     )=0 then
    raise exception 'Runway aggregate attempt signature repair is absent';
  end if;

  if has_function_privilege(
       'public',
       'tongs.authorize_runway_submission_with_aggregate(text,text,text,uuid,uuid,text,integer,text,text,jsonb)',
       'execute')
     or has_function_privilege(
       'anon',
       'tongs.authorize_runway_submission_with_aggregate(text,text,text,uuid,uuid,text,integer,text,text,jsonb)',
       'execute')
     or has_function_privilege(
       'authenticated',
       'tongs.authorize_runway_submission_with_aggregate(text,text,text,uuid,uuid,text,integer,text,text,jsonb)',
       'execute')
     or not has_function_privilege(
       'service_role',
       'tongs.authorize_runway_submission_with_aggregate(text,text,text,uuid,uuid,text,integer,text,text,jsonb)',
       'execute') then
    raise exception 'Runway aggregate wrapper privilege mismatch';
  end if;

  select * into operation from tongs.broll_operation_receipts
  where broll_operation_receipts.operation_id=target_operation_id;
  if not found then
    return;
  end if;
  if operation.operation_fingerprint<>target_operation_fingerprint
     or operation.state<>'submitting'
     or operation.submission_attempt_id is null
     or operation.provider_submitted_at is not null
     or operation.provider_task_id is not null
     or operation.provider_response_json is not null
     or operation.result_candidate_revision_id is not null
     or exists (
       select 1 from tongs.runway_submission_boundary_events event
       where event.operation_id=target_operation_id
     ) then
    raise exception 'linked replacement operation is not the exact untransmitted pre-boundary state';
  end if;

  select funding.* into reservation
  from tongs.funding_reservations funding
  where funding.operation_id=target_operation_id;
  if not found
     or reservation.funding_environment<>'test'
     or reservation.reserved_credit_units<>160
     or reservation.reserved_customer_charge_micros<>800000
     or reservation.reserved_wholesale_spend_micros<>600000
     or not exists (
       select 1 from tongs.customer_spending_quote_acceptances acceptance
       where acceptance.quote_id=reservation.quote_id
     )
     or (select event_type from tongs.funding_reservation_events event
         where event.reservation_id=reservation.id
         order by event.sequence desc limit 1)<>'reserved' then
    raise exception 'linked replacement funding is not the exact accepted reserved Test state';
  end if;

  if exists (
       select 1 from tongs.paid_operation_aggregate_bindings binding
       where binding.reservation_id=reservation.id
     ) then
    raise exception 'linked replacement unexpectedly crossed aggregate admission before repair';
  end if;
end $$;

do $$
begin
  if (select lifecycle_state
      from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live changed during Runway aggregate signature repair';
  end if;
end $$;

comment on function tongs.authorize_runway_submission_with_aggregate(
  text,text,text,uuid,uuid,text,integer,text,text,jsonb
) is
  'Service-only transactional Runway funding and aggregate boundary. The aggregate attempt ordinal is explicitly smallint; no provider call occurs inside this database function.';

notify pgrst,'reload schema';
commit;
