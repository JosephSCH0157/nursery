-- Runway success financial finalization.
--
-- A customer-funded Runway completion derives its direct supplier actual from
-- the persisted Runway completion evidence (cost.credits x 10000 micros),
-- cross-checks it against the bound Gen-4.5 pricing fact (duration x 120000),
-- records exactly one confirmed Runway supplier expense, settles through the
-- canonical settle_operation('success') path, and only then finalizes the
-- reconciliation receipt. All effects share one transaction.
--
-- Owner-budget reconciliation is preserved unchanged. No pricing, credit
-- denomination, quote, reservation, or historical accounting row is changed.
begin;

do $$
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20261011800000'
  ) then
    raise exception '20261011800000 must precede Runway success financial finalization';
  end if;
end $$;

alter function tongs.reconcile_runway_execution(text,bigint,bigint,uuid,text,jsonb)
  rename to _reconcile_runway_execution_before_success_finalization;
revoke all on function tongs._reconcile_runway_execution_before_success_finalization(text,bigint,bigint,uuid,text,jsonb)
  from public,anon,authenticated,service_role;

create function tongs.reconcile_runway_execution(
  p_operation_id text,
  p_direct_provider_actual_micros bigint,
  p_supporting_actual_micros bigint,
  p_settlement_id uuid,
  p_settlement_key text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');
  v_binding tongs.runway_funding_bindings%rowtype;
  v_receipt tongs.runway_execution_reconciliation_receipts%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_existing_expense tongs.supplier_expenses%rowtype;
  v_credits numeric;
  v_derived bigint;
  v_bound bigint;
  v_total bigint;
  v_component text;
  v_evidence jsonb;
  v_expense jsonb;
  v_result jsonb;
begin
  perform tongs._require_pricing_service_role();
  if v_operation is null
     or p_supporting_actual_micros is null or p_supporting_actual_micros<0
     or (p_direct_provider_actual_micros is not null and p_direct_provider_actual_micros<0)
     or p_settlement_id is null
     or length(btrim(coalesce(p_settlement_key,'')))<8
     or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid Runway reconciliation' using errcode='22023';
  end if;

  select * into v_binding from tongs.runway_funding_bindings where operation_id=v_operation;
  if found then
    select * into v_reservation from tongs.funding_reservations where id=v_binding.reservation_id;
    if v_reservation.funding_source_type='owner_budget' then
      return tongs._reconcile_runway_execution_before_success_finalization(
        p_operation_id,p_direct_provider_actual_micros,p_supporting_actual_micros,
        p_settlement_id,p_settlement_key,p_evidence_json);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('runway-reconcile:'||v_operation,0));
  select * into v_receipt from tongs.runway_execution_reconciliation_receipts
    where operation_id=v_operation for update;
  if v_binding.operation_id is null or v_receipt.operation_id is null then
    raise exception 'completed funded Runway operation not found' using errcode='P0002';
  end if;

  if v_receipt.supporting_cost_status='finalized' then
    if v_receipt.supporting_actual_micros<>p_supporting_actual_micros
       or (p_direct_provider_actual_micros is not null
         and p_direct_provider_actual_micros<>v_receipt.direct_provider_actual_micros) then
      raise exception 'Runway reconciliation replay conflict' using errcode='23505';
    end if;
    return coalesce(v_receipt.settlement_result_json,'{}'::jsonb)||jsonb_build_object(
      'replay',true,
      'direct_provider_actual_micros',v_receipt.direct_provider_actual_micros,
      'supporting_actual_micros',v_receipt.supporting_actual_micros);
  end if;

  -- The receipt evidence is the persisted Runway SUCCEEDED task response.
  if coalesce(v_receipt.evidence_json->>'status','')<>'SUCCEEDED'
     or (v_receipt.evidence_json ? 'id'
       and v_receipt.evidence_json->>'id' is distinct from v_receipt.provider_task_id)
     or jsonb_typeof(v_receipt.evidence_json#>'{cost,credits}') is distinct from 'number' then
    raise exception 'authoritative Runway completion cost evidence required' using errcode='P0001';
  end if;
  v_credits:=(v_receipt.evidence_json#>>'{cost,credits}')::numeric;
  if v_credits<0 or v_credits<>trunc(v_credits) or v_credits>1000000 then
    raise exception 'authoritative Runway completion cost evidence required' using errcode='P0001';
  end if;
  -- Runway bills USD 0.01 per credit.
  v_derived:=(v_credits*10000)::bigint;
  if p_direct_provider_actual_micros is not null and p_direct_provider_actual_micros<>v_derived then
    raise exception 'Runway reconciliation actual disagrees with provider cost evidence' using errcode='22023';
  end if;
  -- Gen-4.5 bound pricing: 12 credits/second x USD 0.01.
  v_bound:=v_binding.duration_seconds::bigint*120000;
  v_total:=v_derived+p_supporting_actual_micros;
  v_evidence:=coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object(
    'provider','runway',
    'provider_reference',v_receipt.provider_task_id,
    'provider_task_id',v_receipt.provider_task_id,
    'runway_credits',v_credits,
    'micros_per_runway_credit',10000,
    'direct_provider_actual_micros',v_derived,
    'supporting_actual_micros',p_supporting_actual_micros,
    'bound_direct_provider_micros',v_bound,
    'authoritative',true,
    'cost_coverage','confirmed');

  if v_derived>v_binding.direct_provider_ceiling_micros
     or p_supporting_actual_micros>v_binding.supporting_cost_ceiling_micros
     or v_total>v_binding.total_cost_ceiling_micros then
    insert into tongs.pricing_discrepancies(
      id,reservation_id,discrepancy_key,discrepancy_type,
      quoted_ceiling_micros,observed_amount_micros,evidence_json
    ) values (
      gen_random_uuid(),v_binding.reservation_id,
      btrim(p_settlement_key)||':runway-reconciliation-overrun',
      'wholesale_ceiling_overrun',
      case when v_derived>v_binding.direct_provider_ceiling_micros then v_binding.direct_provider_ceiling_micros
        when p_supporting_actual_micros>v_binding.supporting_cost_ceiling_micros then v_binding.supporting_cost_ceiling_micros
        else v_binding.total_cost_ceiling_micros end,
      case when v_derived>v_binding.direct_provider_ceiling_micros then v_derived
        when p_supporting_actual_micros>v_binding.supporting_cost_ceiling_micros then p_supporting_actual_micros
        else v_total end,
      v_evidence
    ) on conflict (discrepancy_key) do nothing;
    return jsonb_build_object('settled',false,'pricing_discrepancy',true,
      'reservation_retained',true,'customer_overcharge_allowed',false,
      'quoted_ceiling_micros',v_binding.total_cost_ceiling_micros,
      'observed_amount_micros',v_total,
      'direct_provider_actual_micros',v_derived);
  end if;
  -- pricing_discrepancies only records overruns; any other disagreement fails closed.
  if v_derived<>v_bound then
    raise exception 'Runway provider cost evidence disagrees with bound pricing' using errcode='P0001';
  end if;

  select component->>'component_code' into v_component
  from jsonb_array_elements(v_binding.cost_stack_json) component
  where component->>'component_kind'='direct_provider'
    and lower(component->>'provider_label')='runway'
  limit 1;
  v_expense:=tongs.record_supplier_expense(
    extensions.uuid_generate_v5(v_binding.reservation_id,'runway-direct-supplier-expense'),
    v_binding.reservation_id,
    'runway-direct-supplier-expense:'||v_binding.operation_id,
    'runway',
    coalesce(v_component,'runway.video'),
    v_receipt.provider_task_id,
    v_reservation.currency,
    v_derived,
    'confirmed',
    'closed',
    v_evidence);
  select * into v_existing_expense from tongs.supplier_expenses
    where expense_key='runway-direct-supplier-expense:'||v_binding.operation_id;
  if v_existing_expense.reservation_id<>v_binding.reservation_id
     or v_existing_expense.amount_micros is distinct from v_derived
     or v_existing_expense.evidence_status<>'confirmed'
     or v_existing_expense.provider_reference is distinct from v_receipt.provider_task_id then
    raise exception 'Runway supplier expense replay conflict' using errcode='23505';
  end if;

  v_result:=tongs.settle_operation(
    v_binding.reservation_id,p_settlement_id,btrim(p_settlement_key),
    'success',null,v_total,v_evidence);
  if coalesce(v_result->>'state','')<>'settled' then
    raise exception 'Runway customer success settlement did not settle: %',v_result using errcode='P0001';
  end if;

  update tongs.runway_execution_reconciliation_receipts
  set supporting_cost_status='finalized',
      direct_provider_actual_micros=v_derived,
      supporting_actual_micros=p_supporting_actual_micros,
      settlement_result_json=v_result||jsonb_build_object('supplier_expense',v_expense),
      reconciled_at=now()
  where operation_id=v_binding.operation_id;

  return v_result||jsonb_build_object(
    'replay',false,
    'direct_provider_actual_micros',v_derived,
    'supporting_actual_micros',p_supporting_actual_micros,
    'actual_fulfillment_cost_micros',v_total,
    'supplier_expense',v_expense);
end $$;

revoke all on function tongs.reconcile_runway_execution(text,bigint,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function tongs.reconcile_runway_execution(text,bigint,bigint,uuid,text,jsonb) to service_role;

comment on function tongs.reconcile_runway_execution(text,bigint,bigint,uuid,text,jsonb) is
  'Finalizes a completed customer-funded Runway operation from persisted provider cost evidence: one confirmed supplier expense, one canonical success settlement, then a finalized receipt. Owner-budget reconciliation delegates to the preserved prior implementation.';

commit;
