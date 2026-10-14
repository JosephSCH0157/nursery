-- Hammer 6C financial-contract repair.
--
-- Provider-reported snapshots are matched through the active catalog instead
-- of being rewritten. Accepted organization reconciliation now closes the
-- effective supplier obligation and, for legacy owner-budget settlements,
-- appends the exact correcting consumption/journal delta. Original expense,
-- consumption, settlement, and journal rows remain immutable.
begin;

do $$
begin
  if to_regprocedure('tongs._process_openai_organization_reconciliation(uuid)') is null
     or to_regclass('tongs.openai_text_model_catalog_entries') is null
     or to_regclass('tongs.openai_supplier_expense_reconciliation_adjustments') is null
     or to_regclass('tongs.owner_operating_budget_consumptions') is null then
    raise exception 'Hammer 6C reconciliation prerequisites are missing';
  end if;
end $$;

create table tongs.openai_supplier_expense_obligation_settlement_events (
  id uuid primary key,
  supplier_expense_id uuid not null references tongs.supplier_expenses(id) on delete restrict,
  reconciliation_batch_id uuid not null references tongs.openai_organization_reconciliation_batches(id) on delete restrict,
  operation_allocation_id uuid not null references tongs.openai_text_operation_cost_allocations(id) on delete restrict,
  sequence integer not null check(sequence > 0),
  event_key text not null unique check(length(btrim(event_key)) between 8 and 300),
  effective_obligation_status text not null check(effective_obligation_status='closed'),
  confirmed_amount_micros bigint not null check(confirmed_amount_micros >= 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(supplier_expense_id,reconciliation_batch_id),
  unique(supplier_expense_id,sequence)
);

create index openai_supplier_obligation_events_expense_idx
  on tongs.openai_supplier_expense_obligation_settlement_events(supplier_expense_id,sequence desc);
create index openai_supplier_obligation_events_batch_idx
  on tongs.openai_supplier_expense_obligation_settlement_events(reconciliation_batch_id);

create table tongs.owner_operating_budget_reconciliation_adjustments (
  id uuid primary key,
  consumption_id uuid not null references tongs.owner_operating_budget_consumptions(id) on delete restrict,
  supplier_expense_id uuid not null references tongs.supplier_expenses(id) on delete restrict,
  reconciliation_batch_id uuid not null references tongs.openai_organization_reconciliation_batches(id) on delete restrict,
  operation_allocation_id uuid not null references tongs.openai_text_operation_cost_allocations(id) on delete restrict,
  source_key text not null unique check(length(btrim(source_key)) between 8 and 300),
  prior_effective_amount_micros bigint not null check(prior_effective_amount_micros >= 0),
  confirmed_effective_amount_micros bigint not null check(confirmed_effective_amount_micros >= 0),
  adjustment_micros bigint not null check(adjustment_micros <> 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(consumption_id,reconciliation_batch_id),
  check(confirmed_effective_amount_micros-prior_effective_amount_micros=adjustment_micros)
);

create index owner_budget_reconciliation_adjustments_consumption_idx
  on tongs.owner_operating_budget_reconciliation_adjustments(consumption_id,created_at);
create index owner_budget_reconciliation_adjustments_supplier_idx
  on tongs.owner_operating_budget_reconciliation_adjustments(supplier_expense_id);
create index owner_budget_reconciliation_adjustments_batch_idx
  on tongs.owner_operating_budget_reconciliation_adjustments(reconciliation_batch_id);

create trigger openai_supplier_obligation_settlement_events_immutable
  before update or delete on tongs.openai_supplier_expense_obligation_settlement_events
  for each row execute function tongs._reject_accounting_mutation();
create trigger owner_budget_reconciliation_adjustments_immutable
  before update or delete on tongs.owner_operating_budget_reconciliation_adjustments
  for each row execute function tongs._reject_accounting_mutation();

alter table tongs.openai_supplier_expense_obligation_settlement_events enable row level security;
alter table tongs.openai_supplier_expense_obligation_settlement_events force row level security;
alter table tongs.owner_operating_budget_reconciliation_adjustments enable row level security;
alter table tongs.owner_operating_budget_reconciliation_adjustments force row level security;
revoke all on tongs.openai_supplier_expense_obligation_settlement_events from public,anon,authenticated,service_role;
revoke all on tongs.owner_operating_budget_reconciliation_adjustments from public,anon,authenticated,service_role;
grant select on tongs.openai_supplier_expense_obligation_settlement_events to service_role;
grant select on tongs.owner_operating_budget_reconciliation_adjustments to service_role;

create or replace function tongs._openai_reconciliation_runtime_model_matches_snapshot(
  p_runtime_model text,p_provider_snapshot text
) returns boolean language sql stable security definer set search_path=pg_catalog as $$
  with current_catalog_revision as (
    select revision.id
    from tongs.openai_text_model_catalog_revisions revision
    where revision.lifecycle_state='active'
    order by revision.revision desc
    limit 1
  ), active_entries as (
    select entry.runtime_model_id,entry.provider_model_id
    from tongs.openai_text_model_catalog_entries entry
    join current_catalog_revision catalog on catalog.id=entry.catalog_revision_id
    where entry.lifecycle_state='active'
  )
  select
    (select count(*) from active_entries
      where runtime_model_id=btrim(p_runtime_model)
        and provider_model_id=btrim(p_provider_snapshot))=1
    and (select count(*) from active_entries
      where runtime_model_id=btrim(p_runtime_model))=1
    and (select count(*) from active_entries
      where provider_model_id=btrim(p_provider_snapshot))=1
$$;

create or replace function tongs._effective_supplier_expense_obligation_status(p_supplier_expense_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(
    (select event.effective_obligation_status
     from tongs.openai_supplier_expense_obligation_settlement_events event
     where event.supplier_expense_id=p_supplier_expense_id
     order by event.sequence desc limit 1),
    (select expense.obligation_status from tongs.supplier_expenses expense where expense.id=p_supplier_expense_id)
  )
$$;

create or replace function tongs._effective_supplier_expense_amount_micros(p_supplier_expense_id uuid)
returns bigint language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(
    (select event.confirmed_amount_micros
     from tongs.openai_supplier_expense_obligation_settlement_events event
     where event.supplier_expense_id=p_supplier_expense_id
     order by event.sequence desc limit 1),
    (select expense.amount_micros from tongs.supplier_expenses expense where expense.id=p_supplier_expense_id)
  )
$$;

create or replace function tongs.record_openai_supplier_expense_obligation_settlement(
  p_id uuid,p_supplier_expense_id uuid,p_batch_id uuid,p_allocation_id uuid,
  p_event_key text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  expense tongs.supplier_expenses%rowtype;
  adjustment tongs.openai_supplier_expense_reconciliation_adjustments%rowtype;
  existing tongs.openai_supplier_expense_obligation_settlement_events%rowtype;
  next_sequence integer;
begin
  perform tongs._require_pricing_service_role();
  if p_id is null or length(btrim(coalesce(p_event_key,''))) not between 8 and 300
     or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid supplier obligation settlement' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('supplier-obligation:'||p_supplier_expense_id::text,0));
  select * into existing
  from tongs.openai_supplier_expense_obligation_settlement_events
  where event_key=btrim(p_event_key) or (supplier_expense_id=p_supplier_expense_id and reconciliation_batch_id=p_batch_id)
  order by created_at limit 1;
  if found then
    if existing.id<>p_id or existing.supplier_expense_id<>p_supplier_expense_id
       or existing.reconciliation_batch_id<>p_batch_id or existing.operation_allocation_id<>p_allocation_id then
      raise exception 'supplier obligation settlement replay conflict' using errcode='23505';
    end if;
    return to_jsonb(existing)||jsonb_build_object('replay',true);
  end if;
  select * into expense from tongs.supplier_expenses where id=p_supplier_expense_id;
  select * into adjustment from tongs.openai_supplier_expense_reconciliation_adjustments
    where supplier_expense_id=p_supplier_expense_id and reconciliation_batch_id=p_batch_id
      and operation_allocation_id=p_allocation_id;
  if expense.id is null or expense.provider<>'openai' or adjustment.id is null
     or tongs._openai_reconciliation_batch_state(p_batch_id)<>'accepted' then
    raise exception 'accepted supplier reconciliation adjustment required' using errcode='P0001';
  end if;
  select coalesce(max(sequence),0)+1 into next_sequence
  from tongs.openai_supplier_expense_obligation_settlement_events
  where supplier_expense_id=p_supplier_expense_id;
  insert into tongs.openai_supplier_expense_obligation_settlement_events(
    id,supplier_expense_id,reconciliation_batch_id,operation_allocation_id,sequence,event_key,
    effective_obligation_status,confirmed_amount_micros,currency,evidence_json
  ) values(
    p_id,p_supplier_expense_id,p_batch_id,p_allocation_id,next_sequence,btrim(p_event_key),
    'closed',adjustment.confirmed_amount_micros,expense.currency,
    coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object(
      'authoritative',true,'original_obligation_status',expense.obligation_status,
      'original_estimated_amount_micros',expense.amount_micros)
  ) returning * into existing;
  return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs._owner_operating_budget_effective_consumption(
  p_consumption_id uuid
) returns bigint language sql stable security definer set search_path=pg_catalog as $$
  select consumption.expense_amount_micros+coalesce((
    select sum(adjustment.adjustment_micros)
    from tongs.owner_operating_budget_reconciliation_adjustments adjustment
    where adjustment.consumption_id=consumption.id
  ),0)
  from tongs.owner_operating_budget_consumptions consumption
  where consumption.id=p_consumption_id
$$;

create or replace function tongs._owner_operating_budget_effective_consumed(
  p_budget_id uuid
) returns bigint language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(sum(tongs._owner_operating_budget_effective_consumption(consumption.id)),0)::bigint
  from tongs.owner_operating_budget_consumptions consumption
  where consumption.budget_id=p_budget_id
$$;

create or replace function tongs.record_owner_operating_budget_reconciliation_adjustment(
  p_id uuid,p_reservation_id uuid,p_supplier_expense_id uuid,p_batch_id uuid,
  p_allocation_id uuid,p_source_key text,p_confirmed_effective_amount_micros bigint,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  reservation tongs.funding_reservations%rowtype;
  consumption tongs.owner_operating_budget_consumptions%rowtype;
  owner_budget tongs.owner_operating_budgets%rowtype;
  supplier_adjustment tongs.openai_supplier_expense_reconciliation_adjustments%rowtype;
  existing tongs.owner_operating_budget_reconciliation_adjustments%rowtype;
  prior_effective bigint;
  delta bigint;
  payload jsonb;
  created boolean;
begin
  perform tongs._require_pricing_service_role();
  if p_id is null or p_confirmed_effective_amount_micros<0
     or length(btrim(coalesce(p_source_key,''))) not between 8 and 240
     or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid owner budget reconciliation adjustment' using errcode='22023';
  end if;
  select * into reservation from tongs.funding_reservations where id=p_reservation_id;
  if reservation.id is null then raise exception 'funding reservation not found' using errcode='P0002'; end if;
  if reservation.funding_source_type<>'owner_budget' then
    return jsonb_build_object('applied',false,'reason','not_owner_budget','replay',false);
  end if;
  select * into consumption from tongs.owner_operating_budget_consumptions
    where reservation_id=p_reservation_id;
  if consumption.id is null then
    raise exception 'owner budget consumption required before supplier reconciliation' using errcode='P0001';
  end if;
  select * into owner_budget from tongs.owner_operating_budgets where id=consumption.budget_id;
  if owner_budget.id is null then raise exception 'owner operating budget not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('owner-budget-reconciliation:'||consumption.id::text,0));
  select * into existing from tongs.owner_operating_budget_reconciliation_adjustments
    where source_key=btrim(p_source_key) or (consumption_id=consumption.id and reconciliation_batch_id=p_batch_id)
    order by created_at limit 1;
  if found then
    if existing.id<>p_id or existing.supplier_expense_id<>p_supplier_expense_id
       or existing.operation_allocation_id<>p_allocation_id
       or existing.confirmed_effective_amount_micros<>p_confirmed_effective_amount_micros then
      raise exception 'owner budget reconciliation replay conflict' using errcode='23505';
    end if;
    return to_jsonb(existing)||jsonb_build_object('applied',true,'replay',true);
  end if;
  select * into supplier_adjustment from tongs.openai_supplier_expense_reconciliation_adjustments
    where supplier_expense_id=p_supplier_expense_id and reconciliation_batch_id=p_batch_id
      and operation_allocation_id=p_allocation_id;
  if supplier_adjustment.id is null
     or not exists(select 1 from tongs.openai_supplier_expense_obligation_settlement_events event
       where event.supplier_expense_id=p_supplier_expense_id and event.reconciliation_batch_id=p_batch_id
         and event.operation_allocation_id=p_allocation_id)
     or tongs._openai_reconciliation_batch_state(p_batch_id)<>'accepted' then
    raise exception 'closed accepted supplier reconciliation required' using errcode='P0001';
  end if;
  prior_effective:=tongs._owner_operating_budget_effective_consumption(consumption.id);
  delta:=p_confirmed_effective_amount_micros-prior_effective;
  if delta=0 then
    return jsonb_build_object('applied',false,'reason','already_effective','replay',true,
      'consumption_id',consumption.id,'effective_amount_micros',prior_effective);
  end if;
  payload:=jsonb_build_object(
    'adjustment_id',p_id,'consumption_id',consumption.id,'reservation_id',p_reservation_id,
    'supplier_expense_id',p_supplier_expense_id,'reconciliation_batch_id',p_batch_id,
    'operation_allocation_id',p_allocation_id,'prior_effective_amount_micros',prior_effective,
    'confirmed_effective_amount_micros',p_confirmed_effective_amount_micros,
    'adjustment_micros',delta,'customer_charge_micros',0,
    'evidence',coalesce(p_evidence_json,'{}'::jsonb));
  created:=tongs._create_accounting_event(
    p_id,'owner-budget-reconciliation:'||btrim(p_source_key),
    'owner_operating_budget_reconciled','owner_internal','owner_budget_reconciliation',
    p_id::text,consumption.currency,null,owner_budget.workspace_id,null,payload,now());
  if not created then raise exception 'owner budget reconciliation journal exists without adjustment' using errcode='23514'; end if;
  insert into tongs.owner_operating_budget_reconciliation_adjustments(
    id,consumption_id,supplier_expense_id,reconciliation_batch_id,operation_allocation_id,
    source_key,prior_effective_amount_micros,confirmed_effective_amount_micros,
    adjustment_micros,currency,journal_event_id,evidence_json
  ) values(
    p_id,consumption.id,p_supplier_expense_id,p_batch_id,p_allocation_id,btrim(p_source_key),
    prior_effective,p_confirmed_effective_amount_micros,delta,consumption.currency,p_id,
    coalesce(p_evidence_json,'{}'::jsonb));
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,workspace_id,owner_budget_id,currency,amount_micros,metadata_json
  ) values
    (p_id,1,'owner_research_qa_expense',owner_budget.workspace_id,consumption.budget_id,
      consumption.currency,delta,jsonb_build_object('reconciliation_adjustment_id',p_id)),
    (p_id,2,'forge_cash_clearing',owner_budget.workspace_id,consumption.budget_id,
      consumption.currency,-delta,jsonb_build_object('reconciliation_adjustment_id',p_id));
  perform tongs._assert_accounting_event_balanced(p_id);
  return jsonb_build_object('applied',true,'replay',false,'adjustment_id',p_id,
    'consumption_id',consumption.id,'prior_effective_amount_micros',prior_effective,
    'confirmed_effective_amount_micros',p_confirmed_effective_amount_micros,
    'adjustment_micros',delta,'journal_event_id',p_id);
end $$;

create or replace function tongs._process_openai_organization_reconciliation(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare ub record; candidate record; candidate_count bigint; candidate_input bigint; candidate_cached bigint;
 provider_bucket_count bigint; candidate_output bigint; distinct_refs bigint; cost_total bigint; cost_bucket_count bigint;
 allocation_count bigint:=0; adjustment_total bigint:=0; direct_count bigint; reconciled_direct_count bigint;
 direct_actual bigint; other_incomplete bigint; other_confirmed bigint; aggregate_result jsonb;
begin
 perform tongs._require_pricing_service_role();
 if tongs._openai_reconciliation_batch_state(p_batch_id)<>'accepted' then
  return jsonb_build_object('batch_id',p_batch_id,'effective',false,'allocation_status','overlap_quarantined','automatic_allocations',0);
 end if;
 for ub in select * from tongs.openai_organization_usage_buckets where batch_id=p_batch_id loop
  select count(*) into provider_bucket_count from tongs.openai_organization_usage_buckets x
   where x.batch_id=p_batch_id and x.model is not distinct from ub.model
    and (x.evidence_json->>'start_time')=(ub.evidence_json->>'start_time')
    and (x.evidence_json->>'end_time')=(ub.evidence_json->>'end_time')
    and x.project_id is not distinct from ub.project_id;
  if provider_bucket_count<>1 or ub.model is null or ub.api_key_id is null then continue; end if;
  select count(*),coalesce(sum(c.amount_micros),0) into cost_bucket_count,cost_total
  from tongs.openai_organization_cost_buckets c
  where c.batch_id=p_batch_id and c.project_id is not distinct from ub.project_id
    and c.api_key_id is not distinct from ub.api_key_id
    and (c.evidence_json->>'start_time')=(ub.evidence_json->>'start_time')
    and (c.evidence_json->>'end_time')=(ub.evidence_json->>'end_time')
    and btrim(split_part(coalesce(c.line_item,''),',',1))=ub.model;
  if cost_bucket_count=0 then continue; end if;
  select count(*),coalesce(sum(u.input_units),0),
    coalesce(sum(case when (u.evidence_json->>'cached_input_units')~'^[0-9]+$' then (u.evidence_json->>'cached_input_units')::bigint else 0 end),0),
    coalesce(sum(u.output_units),0),count(distinct u.provider_request_id)
  into candidate_count,candidate_input,candidate_cached,candidate_output,distinct_refs
  from tongs.supplier_expenses e
  join tongs.openai_text_funding_bindings b on b.reservation_id=e.reservation_id
    and b.credential_funding='forge'
    and tongs._openai_reconciliation_runtime_model_matches_snapshot(b.model,ub.model)
  join tongs.openai_text_usage_evidence u on u.reservation_id=e.reservation_id
    and u.attempt_number=coalesce((e.evidence_json->>'attempt_number')::smallint,1) and u.provider_reported
  join tongs.funding_reservations r on r.id=e.reservation_id
  where e.provider='openai' and e.provider_reference is not null and u.provider_request_id=e.provider_reference
    and tongs._aggregate_funding_class(r)<>'test_customer'
    and u.recorded_at>=to_timestamp((ub.evidence_json->>'start_time')::double precision)
    and u.recorded_at<to_timestamp((ub.evidence_json->>'end_time')::double precision);
  if candidate_count=0 or candidate_count<>ub.request_count or distinct_refs<>candidate_count
     or candidate_input<>ub.input_tokens or candidate_cached<>ub.cached_input_tokens or candidate_output<>ub.output_tokens then continue; end if;
  for candidate in
   with candidates as (
    select e.id expense_id,e.reservation_id,e.amount_micros,u.provider_request_id,
      greatest(coalesce(e.amount_micros,0),u.input_units+u.output_units,1)::numeric weight
    from tongs.supplier_expenses e
    join tongs.openai_text_funding_bindings b on b.reservation_id=e.reservation_id
      and b.credential_funding='forge'
      and tongs._openai_reconciliation_runtime_model_matches_snapshot(b.model,ub.model)
    join tongs.openai_text_usage_evidence u on u.reservation_id=e.reservation_id
      and u.attempt_number=coalesce((e.evidence_json->>'attempt_number')::smallint,1) and u.provider_reported
    join tongs.funding_reservations r on r.id=e.reservation_id
    where e.provider='openai' and e.provider_reference is not null and u.provider_request_id=e.provider_reference
      and tongs._aggregate_funding_class(r)<>'test_customer'
      and u.recorded_at>=to_timestamp((ub.evidence_json->>'start_time')::double precision)
      and u.recorded_at<to_timestamp((ub.evidence_json->>'end_time')::double precision)
   ), weighted as (
    select c.*,sum(weight) over() total_weight,
      sum(weight) over(order by reservation_id rows between unbounded preceding and current row) cumulative_weight,
      coalesce(sum(weight) over(order by reservation_id rows between unbounded preceding and 1 preceding),0) prior_weight
    from candidates c
   )
   select w.*,case when cost_total=0 then 0 else
     floor(cost_total::numeric*cumulative_weight/total_weight)::bigint-floor(cost_total::numeric*prior_weight/total_weight)::bigint end allocated
   from weighted w order by reservation_id
  loop
   insert into tongs.openai_text_operation_cost_allocations(
     id,reservation_id,batch_id,allocation_key,allocated_cost_micros,allocation_status,allocation_method,evidence_json)
   values(extensions.uuid_generate_v5(p_batch_id,candidate.reservation_id::text),candidate.reservation_id,p_batch_id,
    'openai-allocation:'||p_batch_id::text||':'||candidate.reservation_id::text,candidate.allocated,'confirmed','token_weighted',
    jsonb_build_object('evidence_class','defensible_aggregate_allocation','request_level_cost_match',false,
      'provider_request_id_used_for_completeness',candidate.provider_request_id,'project_id',ub.project_id,
      'api_key_id',ub.api_key_id,'provider_snapshot_model',ub.model,'provider_request_count',ub.request_count,
      'provider_usage_totals_exactly_accounted_for',true,
      'allocation_rule','estimated-cost weight, token fallback, deterministic remainder'))
   on conflict(allocation_key) do nothing;
   perform tongs.record_openai_supplier_expense_reconciliation_adjustment(
    extensions.uuid_generate_v5(p_batch_id,'adjustment:'||candidate.expense_id::text),candidate.expense_id,p_batch_id,
    extensions.uuid_generate_v5(p_batch_id,candidate.reservation_id::text),
    'openai-adjustment:'||p_batch_id::text||':'||candidate.expense_id::text,candidate.allocated,'documented_allocation',
    jsonb_build_object('provider_total_authoritative',true,'operation_amount_is_allocated',true,'request_level_cost_match',false));
   perform tongs.record_openai_supplier_expense_obligation_settlement(
    extensions.uuid_generate_v5(p_batch_id,'obligation-settlement:'||candidate.expense_id::text),candidate.expense_id,p_batch_id,
    extensions.uuid_generate_v5(p_batch_id,candidate.reservation_id::text),
    'openai-obligation:'||p_batch_id::text||':'||candidate.expense_id::text,
    jsonb_build_object('provider_total_authoritative',true,'provider_snapshot_model',ub.model));
   allocation_count:=allocation_count+1;
   adjustment_total:=adjustment_total+(candidate.allocated-coalesce(candidate.amount_micros,0));

   if exists(select 1 from tongs.paid_operation_aggregate_bindings b where b.reservation_id=candidate.reservation_id) then
    select count(*),count(*) filter(where effective.confirmed_amount is not null),coalesce(sum(effective.confirmed_amount),0)
    into direct_count,reconciled_direct_count,direct_actual
    from tongs.supplier_expenses e
    left join lateral(
      select settlement.confirmed_amount_micros confirmed_amount
      from tongs.openai_supplier_expense_obligation_settlement_events settlement
      where settlement.supplier_expense_id=e.id
      order by settlement.sequence desc limit 1
    ) effective on true
    where e.reservation_id=candidate.reservation_id and e.provider='openai';
    if direct_count>0 and direct_count=reconciled_direct_count then
     select summary.incomplete_count
       + case when authority.verified_zero and summary.verified_zero_expense_count<>1 then 1 else 0 end,
       summary.confirmed_amount
     into other_incomplete,other_confirmed
     from (select tongs._openai_text_verified_zero_supporting_cost(candidate.reservation_id) verified_zero) authority
     cross join lateral(
       select
        count(*) filter(where (e.evidence_status<>'confirmed' or e.amount_micros is null)
          and not (authority.verified_zero and e.provider='forge'
            and e.component_code='openai.text.hammer.transcript_cleanup.supporting'
            and e.amount_micros=0 and e.obligation_status='closed'
            and e.evidence_status in ('estimated','confirmed'))) incomplete_count,
        coalesce(sum(e.amount_micros) filter(where e.evidence_status='confirmed'),0) confirmed_amount,
        count(*) filter(where e.provider='forge'
          and e.component_code='openai.text.hammer.transcript_cleanup.supporting'
          and e.amount_micros=0 and e.obligation_status='closed'
          and e.evidence_status in ('estimated','confirmed')) verified_zero_expense_count
       from tongs.supplier_expenses e
       where e.reservation_id=candidate.reservation_id and e.provider<>'openai'
     ) summary;
     if other_incomplete=0 then
      perform tongs.record_owner_operating_budget_reconciliation_adjustment(
       extensions.uuid_generate_v5(p_batch_id,'owner-budget-adjustment:'||candidate.reservation_id::text),
       candidate.reservation_id,candidate.expense_id,p_batch_id,
       extensions.uuid_generate_v5(p_batch_id,candidate.reservation_id::text),
       'owner-budget-adjustment:'||p_batch_id::text||':'||candidate.reservation_id::text,
       direct_actual+other_confirmed,
       jsonb_build_object('authoritative',true,'provider','openai','provider_snapshot_model',ub.model,
         'direct_provider_allocated',true,'supporting_costs_confirmed',true));
      aggregate_result:=tongs.record_paid_operation_aggregate_outcome(candidate.reservation_id,
       'openai-reconciliation:'||p_batch_id::text||':'||candidate.reservation_id::text||':complete','reconciled',direct_actual+other_confirmed,null,
       jsonb_build_object('authoritative',true,'provider','openai','batch_id',p_batch_id,
         'direct_provider_allocated',true,'supporting_costs_confirmed',true,
         'verified_zero_supporting_cost_authority',tongs._openai_text_verified_zero_supporting_cost(candidate.reservation_id)));
       perform tongs.record_restricted_beta_exposure_adjustment(
         binding.hold_id,
         'openai-reconciliation:'||p_batch_id::text||':'||candidate.reservation_id::text||':effective-exposure',
         'authoritative_adjustment',direct_actual+other_confirmed,
         (direct_actual+other_confirmed)-coalesce(prior.remaining_exposure,
           binding.supplier_exposure_ceiling_micros+binding.supporting_exposure_ceiling_micros),
         direct_actual+other_confirmed,
         jsonb_build_object('authoritative',true,'provider','openai','batch_id',p_batch_id,
           'effective_supplier_obligations_closed',true,'supporting_costs_confirmed',true))
       from tongs.paid_operation_aggregate_bindings binding
       left join lateral(
         select event.remaining_exposure_micros remaining_exposure
         from tongs.restricted_beta_exposure_events event
         where event.hold_id=binding.hold_id and event.remaining_exposure_micros is not null
         order by event.sequence desc limit 1
       ) prior on true
       where binding.reservation_id=candidate.reservation_id;
     else
      aggregate_result:=tongs.record_paid_operation_aggregate_outcome(candidate.reservation_id,
       'openai-reconciliation:'||p_batch_id::text||':'||candidate.reservation_id::text||':partial','reconciled_partial',direct_actual,null,
       jsonb_build_object('authoritative',true,'provider','openai','batch_id',p_batch_id,
         'direct_provider_allocated',true,'supporting_costs_confirmed',false));
     end if;
    end if;
   end if;
  end loop;
 end loop;
 return jsonb_build_object('batch_id',p_batch_id,'effective',true,
  'allocation_status',case when allocation_count>0 then 'defensibly_allocated' else 'unresolved' end,
  'automatic_allocations',allocation_count,'estimate_replacement_adjustment_micros',adjustment_total);
end $$;

create or replace function tongs.read_openai_reconciliation_summary()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare source_total bigint; allocated bigint; adjustment bigint; estimate_total bigint; unresolved_estimate bigint;
 unresolved_expenses bigint; raw_batches bigint; effective_batches bigint; superseded_batches bigint; quarantined_batches bigint;
 incomplete_batches bigint; unresolved_batches bigint; historical_unresolved bigint;
begin
 if coalesce(auth.role(),'')<>'service_role' and not tongs.is_platform_operator(auth.uid()) then
  raise exception 'platform operator required' using errcode='42501'; end if;
 select count(*),count(*) filter(where tongs._openai_reconciliation_batch_state(id)='accepted'),
  count(*) filter(where tongs._openai_reconciliation_batch_state(id)='superseded'),
  count(*) filter(where tongs._openai_reconciliation_batch_state(id)='overlap_quarantined'),
  count(*) filter(where evidence_status='incomplete' and tongs._openai_reconciliation_batch_state(id)='accepted'),
  coalesce(sum(total_cost_micros) filter(where tongs._openai_reconciliation_batch_state(id)='accepted'),0)
 into raw_batches,effective_batches,superseded_batches,quarantined_batches,incomplete_batches,source_total
 from tongs.openai_organization_reconciliation_batches;
 select count(*) into unresolved_batches from tongs.openai_organization_reconciliation_batches b
 where tongs._openai_reconciliation_batch_state(b.id)='accepted'
   and coalesce((select sum(a.allocated_cost_micros) from tongs.openai_text_operation_cost_allocations a
     where a.batch_id=b.id and a.allocation_status='confirmed'),0)<b.total_cost_micros;
 select coalesce(sum(a.allocated_cost_micros),0) into allocated
 from tongs.openai_text_operation_cost_allocations a
 where a.allocation_status='confirmed' and tongs._openai_reconciliation_batch_state(a.batch_id)='accepted';
 select coalesce(sum(latest.confirmed_amount_micros-coalesce(expense.amount_micros,0)),0)
 into adjustment
 from tongs.supplier_expenses expense
 join lateral(select event.confirmed_amount_micros
   from tongs.openai_supplier_expense_obligation_settlement_events event
   where event.supplier_expense_id=expense.id order by event.sequence desc limit 1) latest on true
 where expense.provider='openai';
 select coalesce(sum(coalesce(e.amount_micros,0)) filter(where e.evidence_status='estimated'),0),
  coalesce(sum(coalesce(e.amount_micros,0)) filter(where e.evidence_status='estimated' and not exists(
    select 1 from tongs.openai_supplier_expense_obligation_settlement_events event where event.supplier_expense_id=e.id)),0),
  count(*) filter(where e.evidence_status='unresolved' and not exists(
    select 1 from tongs.openai_supplier_expense_obligation_settlement_events event where event.supplier_expense_id=e.id))
 into estimate_total,unresolved_estimate,unresolved_expenses
 from tongs.supplier_expenses e where e.provider='openai';
 select coalesce(sum(amount_micros),0) into historical_unresolved
 from tongs.openai_historical_unmatched_cost_estimates where resolution_state='unresolved';
 return jsonb_build_object(
  'authoritative_provider_total_micros',source_total,'usage_based_operation_estimate_micros',estimate_total,
  'defensibly_allocated_micros',allocated,'estimate_replacement_adjustment_micros',adjustment,
  'unmatched_authoritative_micros',greatest(source_total-allocated,0),
  'unresolved_operation_estimate_micros',unresolved_estimate,'unresolved_operation_count',unresolved_expenses,
  'raw_batch_count',raw_batches,'effective_batch_count',effective_batches,
  'historical_unmatched_estimate_micros',historical_unresolved,'historical_estimate_potential_overlap',historical_unresolved>0,
  'superseded_batch_count',superseded_batches,'quarantined_batch_count',quarantined_batches,
  'incomplete_effective_batch_count',incomplete_batches,'source_total_micros',source_total,
  'matched_micros',allocated,'unresolved_source_micros',greatest(source_total-allocated,0),
  'batch_count',effective_batches,'unresolved_batches',unresolved_batches,
  'source_granularity','Organization-credential scope; project/API-key/model/day Usage and project/API-key/line-item/day Costs. Costs and Usage expose no request identifier join.',
  'matching_rule','Automatic allocation requires one provider API-key bucket, an exact active runtime-to-provider snapshot catalog mapping, and exact complete equality of request count, input, cached input, and output totals.');
end $$;

create or replace function tongs.read_failure_financials(p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid(); lim integer:=least(greatest(coalesce(p_limit,250),1),2000);
begin
 if coalesce(auth.role(),'')<>'service_role' and (actor is null or not tongs.is_platform_operator(actor)) then
  raise exception 'platform operator required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
  select r.id reservation_id,r.operation_id,r.user_id,r.funding_source_type,r.currency,
   coalesce(s.customer_charge_micros,0) gross_customer_charge_micros,
   coalesce(rel.revenue_reversal_micros,0) revenue_reversal_micros,
   coalesce(s.customer_charge_micros,0)-coalesce(rel.revenue_reversal_micros,0) recognized_revenue_micros,
   expenses.effective_amount_micros supplier_expense_micros,expenses.evidence_status supplier_expense_status,
   expenses.obligation_status,coalesce(expenses.confirmed_recovery_micros,0) confirmed_supplier_recovery_micros,
   case when expenses.coverage in ('confirmed','allocated_authoritative') then
    coalesce(s.customer_charge_micros,0)-coalesce(rel.revenue_reversal_micros,0)-expenses.effective_amount_micros+coalesce(expenses.confirmed_recovery_micros,0)
   else null end contribution_profit_micros,
   case when coalesce(expenses.expense_count,0)=0 then 'missing' else expenses.coverage end cost_coverage,r.created_at
  from tongs.funding_reservations r
  left join lateral(select customer_charge_micros from tongs.funding_reservation_events
    where reservation_id=r.id and event_type='settled' order by sequence desc limit 1)s on true
  left join tongs.customer_operation_reliefs rel on rel.reservation_id=r.id
  left join lateral(
   with effective as (
    select e.*,
     settlement.confirmed_amount_micros allocated_amount,
     coalesce(settlement.confirmed_amount_micros,e.amount_micros) effective_amount,
     settlement.confirmed_amount_micros is not null has_allocation,
     case when settlement.confirmed_amount_micros is not null then 'closed' else e.obligation_status end effective_obligation_status,
     coalesce((select sum(sr.amount_micros) from tongs.supplier_recoveries sr
       where sr.supplier_expense_id=e.id and sr.evidence_status='confirmed'),0) recovery
    from tongs.supplier_expenses e
    left join lateral(
     select event.confirmed_amount_micros
     from tongs.openai_supplier_expense_obligation_settlement_events event
     where event.supplier_expense_id=e.id order by event.sequence desc limit 1
    ) settlement on true where e.reservation_id=r.id
   )
   select count(*) expense_count,
    case when count(*) filter(where effective_amount is null)>0 then null else sum(effective_amount)::bigint end effective_amount_micros,
    case when count(*) filter(where effective_amount is null or (evidence_status<>'confirmed' and not has_allocation))>0 then 'incomplete'
      when bool_or(has_allocation) then 'allocated_authoritative' else 'confirmed' end evidence_status,
    case when count(*) filter(where effective_obligation_status='unresolved')>0 then 'unresolved'
      when count(*) filter(where effective_obligation_status='open')>0 then 'open' else 'closed' end obligation_status,
    sum(recovery)::bigint confirmed_recovery_micros,
    case when count(*) filter(where effective_amount is null or (evidence_status<>'confirmed' and not has_allocation))>0 then 'incomplete'
      when bool_or(has_allocation) then 'allocated_authoritative' else 'confirmed' end coverage
   from effective
  )expenses on true
  order by r.created_at desc limit lim
 )x);
end $$;

create or replace function tongs.read_owner_operating_budget_activity(p_budget_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_budget jsonb; v_consumptions jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
  raise exception 'platform operator required' using errcode='42501'; end if;
 select to_jsonb(b) into v_budget from (
  select budget.*,revision.revision,revision.status,revision.maximum_amount_micros,revision.reason,
   tongs._owner_operating_budget_effective_consumed(budget.id) effective_consumed_micros
  from tongs.owner_operating_budgets budget
  join lateral(select r.revision,r.status,r.maximum_amount_micros,r.reason
    from tongs.owner_operating_budget_revisions r where r.budget_id=budget.id order by r.revision desc limit 1) revision on true
  where budget.id=p_budget_id
 ) b;
 if v_budget is null then raise exception 'owner operating budget not found' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object(
   'effective_expense_amount_micros',tongs._owner_operating_budget_effective_consumption(c.id),
   'reconciliation_adjustments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at)
     from tongs.owner_operating_budget_reconciliation_adjustments a where a.consumption_id=c.id),'[]'::jsonb)
 ) order by c.consumed_at),'[]'::jsonb) into v_consumptions
 from tongs.owner_operating_budget_consumptions c where c.budget_id=p_budget_id;
 return jsonb_build_object('budget',v_budget,'consumptions',v_consumptions,
  'discrepancies',(select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at),'[]'::jsonb)
    from tongs.owner_operating_budget_discrepancies d where d.budget_id=p_budget_id),
  'customer_revenue_micros',0,'margin','not_applicable');
end $$;

-- Every active owner-budget admission/consumption path must use effective
-- append-only consumption, never only the immutable original rows.
do $$
declare target regprocedure; definition text; changed text; argument_expression text;
begin
 foreach target in array array[
  'tongs._validate_owner_budget_reservation()'::regprocedure,
  'tongs.begin_owner_provider_attempt(uuid,text,integer,jsonb)'::regprocedure,
  'tongs.consume_owner_operating_budget(uuid,uuid,uuid,text,text,bigint,timestamptz,jsonb)'::regprocedure
 ] loop
  select pg_get_functiondef(target) into definition;
  argument_expression:=case
   when target='tongs.consume_owner_operating_budget(uuid,uuid,uuid,text,text,bigint,timestamptz,jsonb)'::regprocedure then 'p_budget_id'
   else 'v_budget.id' end;
  changed:=regexp_replace(definition,
   'select coalesce\(sum\(expense_amount_micros\),0\) into v_consumed[[:space:]]+from tongs\.owner_operating_budget_consumptions where budget_id[[:space:]]*=[[:space:]]*[^;]+;',
   'select tongs._owner_operating_budget_effective_consumed('||argument_expression||') into v_consumed;');
  if changed=definition or position('_owner_operating_budget_effective_consumed' in changed)=0 then
   raise exception 'owner budget effective-consumption patch did not match %',target;
  end if;
  execute changed;
 end loop;
end $$;

revoke all on function tongs._openai_reconciliation_runtime_model_matches_snapshot(text,text) from public,anon,authenticated,service_role;
revoke all on function tongs._effective_supplier_expense_obligation_status(uuid) from public,anon,authenticated,service_role;
revoke all on function tongs._effective_supplier_expense_amount_micros(uuid) from public,anon,authenticated,service_role;
revoke all on function tongs._owner_operating_budget_effective_consumption(uuid) from public,anon,authenticated,service_role;
revoke all on function tongs._owner_operating_budget_effective_consumed(uuid) from public,anon,authenticated,service_role;
revoke all on function tongs.record_openai_supplier_expense_obligation_settlement(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.record_owner_operating_budget_reconciliation_adjustment(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function tongs._process_openai_organization_reconciliation(uuid) from public,anon,authenticated;
grant execute on function tongs.record_openai_supplier_expense_obligation_settlement(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function tongs.record_owner_operating_budget_reconciliation_adjustment(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb) to service_role;
grant execute on function tongs._process_openai_organization_reconciliation(uuid) to service_role;

comment on table tongs.openai_supplier_expense_obligation_settlement_events is
 'Append-only effective closure of an immutable supplier obligation from an accepted confirmed reconciliation allocation.';
comment on table tongs.owner_operating_budget_reconciliation_adjustments is
 'Append-only owner-budget effective-consumption delta and balanced correcting journal linked to authoritative supplier reconciliation.';
comment on function tongs._openai_reconciliation_runtime_model_matches_snapshot(text,text) is
 'Fail-closed exact active catalog mapping from a funding-bound runtime model to a supplier-reported provider snapshot.';
comment on function tongs._process_openai_organization_reconciliation(uuid) is
 'Atomically allocates exact aggregate supplier evidence, closes effective supplier obligations, reconciles aggregate exposure, and appends owner-budget corrections without mutating historical rows.';

notify pgrst,'reload schema';
commit;
