-- Functional certification for 20261011810000 on the fixture-assisted local
-- replay database. Builds its own exact Test scope through the canonical
-- activation RPC. Fake provider evidence only; everything rolls back.
begin;

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';

create temporary table runway_success_fixture on commit drop as
select '18100000-0000-4000-8000-000000000020'::uuid authorization_id,
  'fe000000-0000-4000-8000-000000000001'::uuid user_id,
  'fe000000-0000-4000-8000-000000000201'::uuid workspace_id,
  '18100000-0000-4000-8000-000000000010'::uuid workpiece_id,
  ('forge:broll:acquire:'||repeat('c1',32))::text operation_id,
  repeat('c1',32)::text operation_fingerprint,
  '18100000-0000-4000-8000-000000000001'::uuid deposit_id,
  '18100000-0000-4000-8000-000000000002'::uuid quote_id,
  '18100000-0000-4000-8000-000000000003'::uuid acceptance_id,
  '18100000-0000-4000-8000-000000000004'::uuid reservation_id,
  '18100000-0000-4000-8000-000000000005'::uuid settlement_id,
  'runway-success-task-0001'::text task_id,
  'certify-runway-success-settlement'::text settlement_key;

do $$
declare f record; v jsonb;
begin
  select * into f from runway_success_fixture;
  if not exists(select 1 from tongs.platform_operators where user_id=f.user_id)
     or not exists(select 1 from tongs.workspaces where id=f.workspace_id and created_by=f.user_id) then
    raise exception 'local replay fixture operator/workspace missing';
  end if;
  insert into tongs.episodes(id,workspace_id,label)
    values(f.workpiece_id,f.workspace_id,'Runway success finalization certification');
  insert into tongs.broll_operation_receipts(
    operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,
    normalized_inputs_json,created_by)
  values(f.operation_id,f.operation_fingerprint,'candidate_acquire','pending',f.workspace_id,f.workpiece_id,
    jsonb_build_object('source_kind','generated','runway_model','gen4.5','duration_seconds',5,
      'ratio','1280:720','reference_images','[]'::jsonb,'final_prompt','Local certification motion prompt'),
    f.user_id);
  v:=tongs.activate_runway_gen45_customer_test(f.authorization_id,f.user_id,f.user_id,f.workspace_id,
    f.operation_id,f.operation_fingerprint,clock_timestamp()+interval '1 hour',
    'transaction-scoped Runway success finalization certification');
  if (v->>'replay')::boolean then raise exception 'certification scope unexpectedly pre-existed'; end if;
end $$;

-- Activation stamps clock_timestamp(); authority checks compare against transaction now().
alter table tongs.runway_customer_test_authorizations disable trigger runway_customer_test_authorizations_immutable;
alter table tongs.paid_execution_aggregate_assignments disable trigger paid_execution_aggregate_assignments_immutable;
alter table tongs.paid_execution_aggregate_assignments disable trigger paid_execution_aggregate_assignment_guard;
update tongs.runway_customer_test_authorizations set valid_from=now()-interval '1 minute'
  where id='18100000-0000-4000-8000-000000000020';
update tongs.paid_execution_aggregate_assignments set valid_from=now()-interval '1 minute'
  where id=extensions.uuid_generate_v5('18100000-0000-4000-8000-000000000020','aggregate-assignment');
alter table tongs.runway_customer_test_authorizations enable trigger runway_customer_test_authorizations_immutable;
alter table tongs.paid_execution_aggregate_assignments enable trigger paid_execution_aggregate_assignments_immutable;
alter table tongs.paid_execution_aggregate_assignments enable trigger paid_execution_aggregate_assignment_guard;

insert into tongs.paid_execution_control_revisions(
  revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
  owner_budget_spending_enabled,provider_execution_enabled,reason)
select coalesce(max(revision),0)+1,true,true,true,false,true,'transaction-scoped Runway success finalization certification'
from tongs.paid_execution_control_revisions;

do $$
declare f record; v jsonb;
begin
  select * into f from runway_success_fixture;
  perform tongs.record_customer_deposit(f.deposit_id,f.user_id,'evt_runway_success_cert','cs_runway_success_cert',
    'pi_runway_success_cert',false,'ai_small',10000000,'usd',2000,clock_timestamp()-interval '1 minute',
    '{"forge_offer_id":"forge_credits_2000"}');
  perform tongs.record_customer_deposit_processor_fee('18100000-0000-4000-8000-000000000006',f.deposit_id,
    'txn_runway_success_cert',0,clock_timestamp(),'{}');
  v:=tongs.create_customer_runway_quote(f.quote_id,f.user_id,f.operation_id,f.workspace_id,
    f.operation_fingerprint,'gen4.5',5,'1280:720',clock_timestamp()+interval '5 minutes');
  if (v->>'normal_maximum_charge_micros')::bigint<>800000 or (v->>'customer_credit_units')::bigint<>160 then
    raise exception 'fixture quote is not the exact 160-credit product: %',v;
  end if;
end $$;

do $$
declare f record;
begin
  select * into f from runway_success_fixture;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',f.user_id::text,true);
  perform tongs.accept_quote(f.quote_id,f.acceptance_id,'certify-runway-success-acceptance',
    (select quote_hash from tongs.customer_spending_quotes where id=f.quote_id));
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
end $$;

do $$
declare f record; v jsonb;
begin
  select * into f from runway_success_fixture;
  v:=tongs.reserve_customer_runway_quote(f.quote_id,f.reservation_id,'certify-runway-success-reservation',
    f.operation_fingerprint,'gen4.5',5,'1280:720');
  if v->>'state'<>'reserved' then raise exception 'reservation failed: %',v; end if;
  v:=tongs.authorize_runway_submission_with_aggregate(f.operation_id,f.operation_fingerprint,
    'certify-runway-success-attempt',f.user_id,f.workspace_id,'gen4.5',5,'1280:720','interactive','{}');
  if not coalesce((v->>'provider_execution_authorized')::boolean,false) then
    raise exception 'fake Runway submission was not authorized: %',v;
  end if;
  if tongs._funding_reservation_state(f.reservation_id)<>'provider_attempt_shadowed' then
    raise exception 'provider attempt did not use the canonical attempt event';
  end if;
end $$;

-- D. Evidence overrun: discrepancy recorded, no settlement, no confirmed expense, not finalized.
do $$
declare f record; v jsonb;
begin
  select * into f from runway_success_fixture;
  begin
    perform tongs.record_runway_completion_for_reconciliation(f.operation_id,f.operation_fingerprint,f.task_id,
      jsonb_build_object('id',f.task_id,'status','SUCCEEDED','cost',jsonb_build_object('credits',70)));
    v:=tongs.reconcile_runway_execution(f.operation_id,null,0,f.settlement_id,f.settlement_key,'{}');
    if coalesce((v->>'settled')::boolean,true) or not (v->>'pricing_discrepancy')::boolean then
      raise exception 'overrun evidence settled: %',v;
    end if;
    if (select count(*) from tongs.pricing_discrepancies where reservation_id=f.reservation_id
        and discrepancy_type='wholesale_ceiling_overrun' and quoted_ceiling_micros=600000
        and observed_amount_micros=700000)<>1
       or exists(select 1 from tongs.funding_reservation_events where reservation_id=f.reservation_id and event_type='settled')
       or exists(select 1 from tongs.supplier_expenses where reservation_id=f.reservation_id)
       or exists(select 1 from tongs.customer_deposit_consumptions where operation_id=f.operation_id)
       or (select supporting_cost_status from tongs.runway_execution_reconciliation_receipts where operation_id=f.operation_id)<>'pending' then
      raise exception 'overrun discrepancy did not fail closed';
    end if;
    raise exception 'certification-sentinel';
  exception when others then
    if sqlerrm<>'certification-sentinel' then raise; end if;
  end;
  raise notice 'CERT discrepancy(70 credits): wholesale_ceiling_overrun 600000->700000, settled=false, no expense, receipt pending';
end $$;

-- Zero-charge provider failure path (as used by the boundary) remains unchanged.
do $$
declare f record; v jsonb;
begin
  select * into f from runway_success_fixture;
  begin
    perform tongs.record_runway_failure_for_reconciliation(f.operation_id,f.operation_fingerprint,'runway-failed-task-0001',
      '{"status":"FAILED"}');
    v:=tongs.settle_operation(f.reservation_id,'18100000-0000-4000-8000-000000000007',
      f.operation_id||':runway-provider-failure-settlement','nonbillable_failure','provider_failure',0,
      '{"provider":"runway","authoritative":false,"customer_charge_micros":0}');
    if (v->>'customer_charge_micros')::bigint<>0 or (v->>'credit_units')::bigint<>0
       or exists(select 1 from tongs.customer_deposit_consumptions where operation_id=f.operation_id)
       or exists(select 1 from tongs.funding_reservation_events where reservation_id=f.reservation_id
         and event_type='settled' and customer_charge_micros>0) then
      raise exception 'provider failure charged the customer: %',v;
    end if;
    raise notice 'CERT zero-charge provider failure: charge=% credits=% state=%',v->>'customer_charge_micros',v->>'credit_units',v->>'state';
    raise exception 'certification-sentinel';
  exception when others then
    if sqlerrm<>'certification-sentinel' then raise; end if;
  end;
end $$;

-- D. Under-run disagreement and missing cost evidence fail closed without accounting effects.
do $$
declare f record; v_failed boolean;
begin
  select * into f from runway_success_fixture;
  v_failed:=false;
  begin
    perform tongs.record_runway_completion_for_reconciliation(f.operation_id,f.operation_fingerprint,f.task_id,
      jsonb_build_object('id',f.task_id,'status','SUCCEEDED','cost',jsonb_build_object('credits',50)));
    perform tongs.reconcile_runway_execution(f.operation_id,null,0,f.settlement_id,f.settlement_key,'{}');
  exception when sqlstate 'P0001' then
    v_failed:=position('disagrees with bound pricing' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'under-run provider evidence was tolerated'; end if;
  v_failed:=false;
  begin
    perform tongs.record_runway_completion_for_reconciliation(f.operation_id,f.operation_fingerprint,f.task_id,
      jsonb_build_object('id',f.task_id,'status','SUCCEEDED'));
    perform tongs.reconcile_runway_execution(f.operation_id,null,0,f.settlement_id,f.settlement_key,'{}');
  exception when sqlstate 'P0001' then
    v_failed:=position('cost evidence required' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'missing provider cost evidence was tolerated'; end if;
  v_failed:=false;
  begin
    perform tongs.record_runway_completion_for_reconciliation(f.operation_id,f.operation_fingerprint,f.task_id,
      jsonb_build_object('id',f.task_id,'status','SUCCEEDED','cost',jsonb_build_object('credits','60')));
    perform tongs.reconcile_runway_execution(f.operation_id,null,0,f.settlement_id,f.settlement_key,'{}');
  exception when sqlstate 'P0001' then
    v_failed:=position('cost evidence required' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'non-numeric provider cost evidence was tolerated'; end if;
  v_failed:=false;
  begin
    perform tongs.record_runway_completion_for_reconciliation(f.operation_id,f.operation_fingerprint,f.task_id,
      jsonb_build_object('id',f.task_id,'status','SUCCEEDED','cost',jsonb_build_object('credits',60.5)));
    perform tongs.reconcile_runway_execution(f.operation_id,null,0,f.settlement_id,f.settlement_key,'{}');
  exception when sqlstate 'P0001' then
    v_failed:=position('cost evidence required' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'fractional provider cost evidence was tolerated'; end if;
  v_failed:=false;
  begin
    perform tongs.record_runway_completion_for_reconciliation(f.operation_id,f.operation_fingerprint,f.task_id,
      jsonb_build_object('id',f.task_id,'status','FAILED','cost',jsonb_build_object('credits',60)));
    perform tongs.reconcile_runway_execution(f.operation_id,null,0,f.settlement_id,f.settlement_key,'{}');
  exception when sqlstate 'P0001' then
    v_failed:=position('cost evidence required' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'non-SUCCEEDED provider evidence was tolerated'; end if;
  raise notice 'CERT under-run(50 credits)=fail-closed P0001 disagrees-with-bound; missing/string/fractional/non-SUCCEEDED cost=fail-closed; caller override 500000=rejected 22023';
  v_failed:=false;
  begin
    perform tongs.record_runway_completion_for_reconciliation(f.operation_id,f.operation_fingerprint,f.task_id,
      jsonb_build_object('id',f.task_id,'status','SUCCEEDED','cost',jsonb_build_object('credits',60)));
    perform tongs.reconcile_runway_execution(f.operation_id,500000,0,f.settlement_id,f.settlement_key,'{}');
  exception when sqlstate '22023' then
    v_failed:=position('disagrees with provider cost evidence' in sqlerrm)>0;
  end;
  if not v_failed then raise exception 'caller actual contradicting provider evidence was tolerated'; end if;
  if exists(select 1 from tongs.runway_execution_reconciliation_receipts where operation_id=f.operation_id)
     or exists(select 1 from tongs.supplier_expenses where reservation_id=f.reservation_id)
     or exists(select 1 from tongs.funding_reservation_events where reservation_id=f.reservation_id and event_type='settled') then
    raise exception 'fail-closed reconciliation left accounting effects';
  end if;
end $$;

-- C. Customer-deposit success certification.
do $$
declare f record; v jsonb; v_replay jsonb; v_conflict boolean:=false;
  v_journal_events bigint; v_journal_entries bigint;
begin
  select * into f from runway_success_fixture;
  perform tongs.record_runway_completion_for_reconciliation(f.operation_id,f.operation_fingerprint,f.task_id,
    jsonb_build_object('id',f.task_id,'status','SUCCEEDED','cost',jsonb_build_object('credits',60)));
  v:=tongs.reconcile_runway_execution(f.operation_id,null,0,f.settlement_id,f.settlement_key,
    '{"candidate_committed":true}');
  if v->>'state'<>'settled' or (v->>'replay')::boolean
     or (v->>'customer_charge_micros')::bigint<>800000 or (v->>'credit_units')::bigint<>160
     or (v->>'direct_provider_actual_micros')::bigint<>600000
     or (v->>'supporting_actual_micros')::bigint<>0 then
    raise exception 'Runway success settlement wrong: %',v;
  end if;
  select count(*) into v_journal_events from tongs.accounting_journal_events;
  select count(*) into v_journal_entries from tongs.accounting_journal_entries;

  v_replay:=tongs.reconcile_runway_execution(f.operation_id,null,0,f.settlement_id,f.settlement_key,'{}');
  if not (v_replay->>'replay')::boolean or (v_replay->>'customer_charge_micros')::bigint<>800000 then
    raise exception 'repeated reconciliation was not idempotent: %',v_replay;
  end if;
  v_replay:=tongs.reconcile_runway_execution(f.operation_id,600000,0,f.settlement_id,f.settlement_key,'{}');
  if not (v_replay->>'replay')::boolean then raise exception 'explicit-actual replay was not idempotent'; end if;
  begin
    perform tongs.reconcile_runway_execution(f.operation_id,null,1,f.settlement_id,f.settlement_key,'{}');
  exception when sqlstate '23505' then v_conflict:=true;
  end;
  if not v_conflict then raise exception 'conflicting replay was accepted'; end if;

  if (select count(*) from tongs.supplier_expenses where reservation_id=f.reservation_id)<>1
     or not exists(select 1 from tongs.supplier_expenses where reservation_id=f.reservation_id
       and provider='runway' and amount_micros=600000 and evidence_status='confirmed'
       and obligation_status='closed' and provider_reference=f.task_id and currency='USD') then
    raise exception 'Runway supplier expense is not exactly one confirmed 600000-micro row';
  end if;
  if (select count(*) from tongs.funding_reservation_events where reservation_id=f.reservation_id and event_type='settled')<>1
     or not exists(select 1 from tongs.funding_reservation_events where reservation_id=f.reservation_id
       and event_type='settled' and customer_charge_micros=800000 and credit_units=160
       and wholesale_spend_micros=600000) then
    raise exception 'customer settlement is not exactly one 800000-micro/160-credit event';
  end if;
  if (select count(*) from tongs.customer_deposit_consumptions where operation_id=f.operation_id)<>1
     or (select sum(credit_units_consumed) from tongs.customer_deposit_consumptions where operation_id=f.operation_id)<>160 then
    raise exception 'customer credit consumption is not exactly 160 credits once';
  end if;
  if exists(select 1 from tongs.pricing_discrepancies where reservation_id=f.reservation_id) then
    raise exception 'successful reconciliation recorded a discrepancy';
  end if;
  if not exists(select 1 from tongs.runway_execution_reconciliation_receipts where operation_id=f.operation_id
      and supporting_cost_status='finalized' and direct_provider_actual_micros=600000
      and supporting_actual_micros=0 and settlement_result_json is not null and reconciled_at is not null) then
    raise exception 'reconciliation receipt was not finalized';
  end if;
  if (select count(*) from tongs.paid_operation_aggregate_bindings b
      join tongs.restricted_beta_exposure_events e on e.hold_id=b.hold_id
      where b.reservation_id=f.reservation_id and e.event_type='reconciled')<>1 then
    raise exception 'aggregate reconciliation was not recorded exactly once';
  end if;
  if (select count(*) from tongs.accounting_journal_events)<>v_journal_events
     or (select count(*) from tongs.accounting_journal_entries)<>v_journal_entries then
    raise exception 'replayed reconciliation produced a second journal effect';
  end if;
  raise notice 'CERT success: %',v;
  raise notice 'CERT supplier expense: %',(select jsonb_build_object('count',count(*),'provider',min(provider),
    'component',min(component_code),'amount_micros',min(amount_micros),'evidence',min(evidence_status),
    'obligation',min(obligation_status),'provider_reference',min(provider_reference),'key',min(expense_key))
    from tongs.supplier_expenses where reservation_id=f.reservation_id);
  raise notice 'CERT settlement events: %',(select jsonb_agg(jsonb_build_object('event_type',event_type,
    'charge',customer_charge_micros,'credits',credit_units,'wholesale',wholesale_spend_micros,'key',event_key) order by sequence)
    from tongs.funding_reservation_events where reservation_id=f.reservation_id);
  raise notice 'CERT consumption: %',(select jsonb_build_object('rows',count(*),'credits',sum(credit_units_consumed))
    from tongs.customer_deposit_consumptions where operation_id=f.operation_id);
  raise notice 'CERT receipt: %',(select jsonb_build_object('status',supporting_cost_status,'direct',direct_provider_actual_micros,
    'supporting',supporting_actual_micros,'reconciled',reconciled_at is not null,'credits',evidence_json#>'{cost,credits}')
    from tongs.runway_execution_reconciliation_receipts where operation_id=f.operation_id);
  raise notice 'CERT aggregate events: %',(select jsonb_agg(e.event_type order by e.created_at) from tongs.paid_operation_aggregate_bindings b
    join tongs.restricted_beta_exposure_events e on e.hold_id=b.hold_id where b.reservation_id=f.reservation_id);
  raise notice 'CERT replay: %',v_replay;
  raise notice 'CERT journal events/entries unchanged by replay: %/%',v_journal_events,v_journal_entries;
end $$;

rollback;
