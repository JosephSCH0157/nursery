-- Terminalize the one exact customer Test canary that was stranded in
-- `submitting` after aggregate admission denied execution and atomically
-- released its reservation before any provider transmission.
begin;

do $$
begin
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20261011740000') then
    raise exception '20261011740000 must precede Runway canary terminalization';
  end if;
end $$;

do $$
declare
  v_operation constant text:='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32';
  v_fingerprint constant text:='9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32';
  op tongs.broll_operation_receipts%rowtype;
  reservation tongs.funding_reservations%rowtype;
  latest_event tongs.funding_reservation_events%rowtype;
begin
  select * into op from tongs.broll_operation_receipts
  where operation_id=v_operation for update;
  if not found then return; end if;
  if op.operation_fingerprint<>v_fingerprint then
    raise exception 'exact Runway canary fingerprint mismatch';
  end if;
  if op.state='failed' and op.failed_stage='runway_financial_preflight'
     and op.failure_code='runway_funding_required' then return; end if;
  if op.state<>'submitting' or op.provider_task_id is not null
     or op.provider_response_json is not null or op.verified_asset_id is not null
     or op.verified_poster_asset_id is not null or op.result_candidate_revision_id is not null then
    raise exception 'Runway canary is not an untransmitted stranded pre-provider operation';
  end if;
  if exists(select 1 from tongs.runway_submission_boundary_events where operation_id=v_operation)
     or exists(select 1 from tongs.runway_execution_reconciliation_receipts where operation_id=v_operation) then
    raise exception 'Runway canary has provider-boundary evidence and cannot be terminalized as untransmitted';
  end if;
  select r.* into reservation
  from tongs.runway_funding_bindings binding
  join tongs.funding_reservations r on r.id=binding.reservation_id
  where binding.operation_id=v_operation and binding.operation_fingerprint=v_fingerprint
    and r.reserved_customer_charge_micros=800000 and r.reserved_credit_units=160
    and r.reserved_wholesale_spend_micros=600000 and r.funding_environment='test';
  if not found then raise exception 'exact released Runway reservation is missing'; end if;
  select * into latest_event from tongs.funding_reservation_events
  where reservation_id=reservation.id order by sequence desc limit 1;
  if latest_event.event_type<>'released'
     or latest_event.evidence_json->>'reason'<>'aggregate_exposure_exhausted'
     or coalesce((latest_event.evidence_json->>'transmitted')::boolean,true) then
    raise exception 'Runway reservation lacks definitive pre-provider release evidence';
  end if;
  update tongs.broll_operation_receipts set
    state='failed',failed_stage='runway_financial_preflight',
    failure_code='runway_funding_required',
    failure_message='Aggregate Test exposure was unavailable. The reservation was released before Runway was called.',
    updated_at=clock_timestamp()
  where operation_id=v_operation;
end $$;

do $$
declare
  v_operation constant text:='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32';
begin
  if exists(select 1 from tongs.broll_operation_receipts where operation_id=v_operation)
     and not exists(select 1 from tongs.broll_operation_receipts
       where operation_id=v_operation and state='failed'
         and failed_stage='runway_financial_preflight' and failure_code='runway_funding_required'
         and provider_task_id is null and provider_response_json is null
         and verified_asset_id is null and verified_poster_asset_id is null
         and result_candidate_revision_id is null) then
    raise exception 'Runway canary terminalization assertion failed';
  end if;
  if exists(select 1 from tongs.runway_submission_boundary_events where operation_id=v_operation)
     or exists(select 1 from tongs.runway_execution_reconciliation_receipts where operation_id=v_operation) then
    raise exception 'Runway provider authority appeared during terminalization';
  end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live changed during Runway canary terminalization';
  end if;
end $$;

notify pgrst,'reload schema';
commit;
