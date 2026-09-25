-- Reconcile the exact customer Test Runway operation that was conservatively
-- marked submission_unknown when an old pre-boundary `submitting` receipt was
-- replayed after the 117800 aggregate signature repair.
--
-- The canonical request path authorizes and records the paid Runway boundary
-- before calling the provider. This migration refuses to act unless the exact
-- operation has no aggregate hold, paid attempt, boundary event, provider
-- task/response, completion receipt, asset, or candidate. It preserves the
-- accepted quote and reservation and records the old submission identity in
-- the existing reconciliation history before returning the receipt to pending.
begin;

do $$
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20261011780000'
  ) then
    raise exception '20261011780000 must precede pre-boundary Runway reconciliation';
  end if;
end $$;

do $$
declare
  target_operation constant text :=
    'forge:broll:acquire:eca82dd315133b5db4197005ee769f7bfae6cd064ff80dea53f787d5feae176f';
  target_fingerprint constant text :=
    'eca82dd315133b5db4197005ee769f7bfae6cd064ff80dea53f787d5feae176f';
  target_attempt constant uuid :=
    'e9a80bcd-0368-4ec8-ba47-c26e6be18eff';
  target_user constant uuid :=
    '71daf61b-57b3-4e5f-a8c8-64befecb5950';
  target_workspace constant uuid :=
    'cc5478ff-37be-403e-824c-467fa7da061e';
  target_reservation constant uuid :=
    'ef81741a-3407-4b7c-806d-30f0222cf925';
  target_quote constant uuid :=
    'd9ace641-4f20-46d1-afb8-8650b1ec135d';
  operation tongs.broll_operation_receipts%rowtype;
  reservation tongs.funding_reservations%rowtype;
  binding tongs.runway_funding_bindings%rowtype;
  result jsonb;
begin
  select * into operation
  from tongs.broll_operation_receipts receipt
  where receipt.operation_id=target_operation
  for update;

  -- Clean replay has no linked canary data.
  if not found then
    return;
  end if;

  -- Idempotent post-reconciliation proof.
  if operation.state='pending'
     and operation.reconciliation_decision='authorize_resubmission'
     and operation.resubmission_authorized_at is not null
     and operation.submission_attempt_id is null
     and operation.transport_evidence_json#>>'{latest,submission_attempt_id}'=target_attempt::text
     and operation.transport_evidence_json#>>'{latest,prior_ambiguity_reason}'=
       'recovered_inflight_submission_without_task_id' then
    return;
  end if;

  if operation.operation_fingerprint<>target_fingerprint
     or operation.created_by<>target_user
     or operation.workspace_id<>target_workspace
     or operation.state<>'submission_unknown'
     or operation.submission_attempt_id<>target_attempt
     or operation.ambiguity_reason<>'recovered_inflight_submission_without_task_id'
     or operation.provider_submitted_at is not null
     or operation.provider_task_id is not null
     or operation.provider_response_json is not null
     or operation.provider_submission_json is not null
     or operation.provider_completed_json is not null
     or operation.transport_evidence_json is not null
     or operation.verified_asset_id is not null
     or operation.verified_poster_asset_id is not null
     or operation.result_candidate_revision_id is not null then
    raise exception 'exact Runway operation is not the certified pre-boundary unknown state';
  end if;

  select * into reservation
  from tongs.funding_reservations funding
  where funding.id=target_reservation
    and funding.operation_id=target_operation;
  if not found
     or reservation.quote_id<>target_quote
     or reservation.user_id<>target_user
     or reservation.funding_environment<>'test'
     or reservation.funding_source_type<>'customer_deposit'
     or reservation.reserved_credit_units<>160
     or reservation.reserved_customer_charge_micros<>800000
     or reservation.reserved_wholesale_spend_micros<>600000
     or not exists (
       select 1 from tongs.customer_spending_quote_acceptances acceptance
       where acceptance.quote_id=target_quote
     )
     or (select count(*) from tongs.funding_reservation_events event
         where event.reservation_id=target_reservation)<>1
     or (select event.event_type from tongs.funding_reservation_events event
         where event.reservation_id=target_reservation
         order by event.sequence desc limit 1)<>'reserved' then
    raise exception 'accepted Runway reservation is not unchanged and reserved';
  end if;

  select * into binding
  from tongs.runway_funding_bindings runway_binding
  where runway_binding.operation_id=target_operation;
  if not found
     or binding.operation_fingerprint<>target_fingerprint
     or binding.reservation_id<>target_reservation
     or binding.user_id<>target_user
     or binding.workspace_id<>target_workspace
     or binding.model<>'gen4.5'
     or binding.duration_seconds<>5
     or binding.ratio<>'1280:720'
     or binding.direct_provider_ceiling_micros<>600000
     or binding.supporting_cost_ceiling_micros<>0
     or binding.total_cost_ceiling_micros<>600000 then
    raise exception 'Runway funding binding is not the exact accepted Test product';
  end if;

  if exists (
       select 1 from tongs.runway_submission_boundary_events event
       where event.operation_id=target_operation
     )
     or exists (
       select 1 from tongs.paid_operation_aggregate_bindings aggregate_binding
       where aggregate_binding.reservation_id=target_reservation
     )
     or exists (
       select 1 from tongs.restricted_beta_exposure_holds hold
       where hold.operation_identity=target_operation
     )
     or exists (
       select 1 from tongs.runway_execution_reconciliation_receipts receipt
       where receipt.operation_id=target_operation
     )
     or exists (
       select 1 from tongs.broll_candidate_revisions candidate
       where candidate.beat_id=operation.beat_id
         and candidate.provider_request_id is not null
     ) then
    raise exception 'provider or aggregate evidence exists; automatic reconciliation is forbidden';
  end if;

  -- Use the existing canonical reconciliation path. Its history entry retains
  -- the prior submission attempt, timestamps, ambiguity reason, and decision.
  perform set_config('request.jwt.claim.role','service_role',true);
  result:=tongs.reconcile_broll_runway_submission(
    target_operation,
    target_fingerprint,
    'authorize_resubmission',
    null,
    jsonb_build_object(
      'authority','20261011790000',
      'provider_transmitted',false,
      'proof','no aggregate hold, paid attempt, boundary, task, response, asset, or candidate'),
    target_user
  );
  if result->>'disposition'<>'reconciled' then
    raise exception 'canonical Runway reconciliation failed: %',result;
  end if;

  select * into operation
  from tongs.broll_operation_receipts receipt
  where receipt.operation_id=target_operation;
  if operation.state<>'pending'
     or operation.reconciliation_decision<>'authorize_resubmission'
     or operation.resubmission_authorized_at is null
     or operation.submission_attempt_id is not null
     or operation.submitting_at is not null
     or operation.submission_unknown_at is not null
     or operation.ambiguity_reason is not null
     or operation.transport_evidence_json#>>'{latest,submission_attempt_id}'<>target_attempt::text
     or operation.transport_evidence_json#>>'{latest,prior_ambiguity_reason}'<>
       'recovered_inflight_submission_without_task_id' then
    raise exception 'Runway reconciliation did not preserve the prior attempt correctly';
  end if;

  if (select count(*) from tongs.funding_reservation_events event
      where event.reservation_id=target_reservation)<>1
     or (select event.event_type from tongs.funding_reservation_events event
         where event.reservation_id=target_reservation
         order by event.sequence desc limit 1)<>'reserved'
     or exists (select 1 from tongs.runway_submission_boundary_events event
                where event.operation_id=target_operation)
     or exists (select 1 from tongs.paid_operation_aggregate_bindings aggregate_binding
                where aggregate_binding.reservation_id=target_reservation) then
    raise exception 'reconciliation mutated funding or provider-boundary history';
  end if;
end $$;

do $$
begin
  if (select lifecycle_state
      from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live changed during Runway pre-boundary reconciliation';
  end if;
end $$;

notify pgrst,'reload schema';
commit;
