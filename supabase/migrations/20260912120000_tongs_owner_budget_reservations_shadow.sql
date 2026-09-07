-- Owner-funded live-provider testing lane. The lane is fully implemented but remains
-- unusable until a later approved control revision and an explicitly capped active budget exist.

begin;

-- Owner-funded testing must be independently activatable before customer-funded
-- settlement. Keep the shared pricing/provider prerequisites without coupling the
-- owner lane to the customer-settlement flag.
do $$
declare v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'tongs.paid_execution_control_revisions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%provider_execution_enabled%'
      and pg_get_constraintdef(oid) like '%customer_settlement_enabled%'
  loop
    execute format('alter table tongs.paid_execution_control_revisions drop constraint %I',
      v_constraint.conname);
  end loop;
end $$;
alter table tongs.paid_execution_control_revisions
  add constraint paid_execution_provider_requires_pricing
    check (not provider_execution_enabled or pricing_activation_enabled);

-- The accounting-foundation draft intentionally created no active budget, but its
-- revision validator also omitted `active`. Restore the owner-only activation path
-- without creating a revision, assigning an amount, or enabling execution.
create or replace function tongs.revise_owner_operating_budget(
  p_budget_id uuid,
  p_status text,
  p_maximum_amount_micros bigint,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_budget tongs.owner_operating_budgets%rowtype;
  v_revision integer;
  v_event_id uuid := gen_random_uuid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payload jsonb;
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  if p_budget_id is null or p_status not in ('draft', 'active', 'paused', 'closed')
     or (p_maximum_amount_micros is not null and p_maximum_amount_micros <= 0)
     or (p_status = 'active' and p_maximum_amount_micros is null) or v_reason is null then
    raise exception 'invalid owner operating budget revision' using errcode = '22023';
  end if;
  select * into v_budget from tongs.owner_operating_budgets where id = p_budget_id for update;
  if not found then raise exception 'owner operating budget not found' using errcode = 'P0002'; end if;
  select coalesce(max(revision), 0) + 1 into v_revision
  from tongs.owner_operating_budget_revisions where budget_id = p_budget_id;
  v_payload := jsonb_build_object('budget_id', p_budget_id, 'revision', v_revision,
    'status', p_status, 'maximum_amount_micros', p_maximum_amount_micros, 'reason', v_reason);
  perform tongs._create_accounting_event(
    v_event_id, 'owner-budget:' || p_budget_id::text || ':revision:' || v_revision::text,
    'owner_operating_budget_revised', 'owner_internal', 'owner_operating_budget', p_budget_id::text,
    v_budget.currency, null, v_budget.workspace_id, v_actor, v_payload, now()
  );
  insert into tongs.owner_operating_budget_revisions(
    budget_id, revision, status, maximum_amount_micros, reason, actor_id, journal_event_id
  ) values (p_budget_id, v_revision, p_status, p_maximum_amount_micros, v_reason, v_actor, v_event_id);
  return jsonb_build_object('budget_id', p_budget_id, 'revision', v_revision, 'status', p_status,
    'maximum_amount_micros', p_maximum_amount_micros,
    'spending_enabled', false);
end;
$$;

-- A future owner-only activation must not authorize customer-funded execution.
-- Customer deposits and allowances require the independent settlement flag;
-- owner reservations must use begin_owner_provider_attempt below.
create or replace function tongs.begin_provider_attempt(
  p_reservation_id uuid,
  p_attempt_key text,
  p_lease_seconds integer,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_state text;
  v_existing tongs.funding_reservation_events%rowtype;
  v_sequence integer;
  v_lease timestamptz;
  v_authorized boolean;
  v_reason text;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_attempt_key, ''))) < 8 or p_lease_seconds < 5 or p_lease_seconds > 900
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid provider attempt lease' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-attempt:' || p_reservation_id::text, 0));
  select * into v_reservation from tongs.funding_reservations where id = p_reservation_id for update;
  if not found then raise exception 'funding reservation not found' using errcode = 'P0002'; end if;
  select * into v_existing from tongs.funding_reservation_events
    where reservation_id = p_reservation_id and provider_attempt_key = btrim(p_attempt_key);
  if found then
    return jsonb_build_object('reservation_id', p_reservation_id, 'attempt_key', v_existing.provider_attempt_key,
      'state', tongs._funding_reservation_state(p_reservation_id), 'replay', true,
      'lease_expires_at', v_existing.lease_expires_at, 'provider_execution_authorized', false,
      'reason', 'duplicate_attempt');
  end if;
  v_state := tongs._funding_reservation_state(p_reservation_id);
  if v_state = 'submission_unknown' then
    return jsonb_build_object('reservation_id', p_reservation_id, 'state', v_state,
      'replay', true, 'provider_execution_authorized', false,
      'reason', 'ambiguous_submission_requires_reconciliation');
  elsif v_state in ('settled', 'released') then
    raise exception 'reservation is terminal' using errcode = 'P0001';
  elsif v_state not in ('reserved', 'provider_attempt_shadowed', 'provider_failure_recorded') then
    raise exception 'reservation is not attemptable' using errcode = 'P0001';
  end if;
  select * into v_control from tongs._current_paid_execution_control();
  v_authorized := v_control.provider_execution_enabled and case
    when v_reservation.funding_source_type in ('customer_deposit', 'paid_allowance')
      then v_control.customer_settlement_enabled
    when v_reservation.funding_source_type = 'none' then true
    else false
  end;
  v_reason := case
    when v_reservation.funding_source_type = 'owner_budget' then 'owner_budget_requires_owner_boundary'
    when not v_control.provider_execution_enabled then 'shadow_mode'
    when v_reservation.funding_source_type in ('customer_deposit', 'paid_allowance')
      and not v_control.customer_settlement_enabled then 'customer_settlement_disabled'
    when v_authorized then 'authorized'
    else 'funding_lane_not_authorized'
  end;
  v_lease := now() + make_interval(secs => p_lease_seconds);
  select coalesce(max(sequence),0)+1 into v_sequence from tongs.funding_reservation_events
    where reservation_id = p_reservation_id;
  insert into tongs.funding_reservation_events(
    id, reservation_id, sequence, event_type, event_key, provider_attempt_key,
    lease_expires_at, evidence_json
  ) values (
    gen_random_uuid(), p_reservation_id, v_sequence, 'provider_attempt_shadowed',
    'reservation:' || p_reservation_id::text || ':attempt:' || btrim(p_attempt_key),
    btrim(p_attempt_key), v_lease, coalesce(p_evidence_json, '{}'::jsonb)
  );
  return jsonb_build_object('reservation_id', p_reservation_id, 'attempt_key', btrim(p_attempt_key),
    'state', 'provider_attempt_shadowed', 'replay', false, 'lease_expires_at', v_lease,
    'provider_execution_authorized', v_authorized, 'reason', v_reason);
end;
$$;

create table tongs.owner_operating_budget_consumptions (
  id uuid primary key,
  budget_id uuid not null references tongs.owner_operating_budgets(id) on delete restrict,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  operation_id text not null,
  allocation_key text not null unique check (length(btrim(allocation_key)) between 8 and 300),
  expense_amount_micros bigint not null check (expense_amount_micros > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  consumed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (budget_id, operation_id)
);

create index owner_budget_consumptions_budget_idx
  on tongs.owner_operating_budget_consumptions(budget_id, consumed_at);

create table tongs.owner_operating_budget_discrepancies (
  id uuid primary key,
  budget_id uuid not null references tongs.owner_operating_budgets(id) on delete restrict,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  discrepancy_key text not null unique,
  maximum_amount_micros bigint not null check (maximum_amount_micros > 0),
  prior_consumed_micros bigint not null check (prior_consumed_micros >= 0),
  observed_expense_micros bigint not null check (observed_expense_micros > 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  check (prior_consumed_micros + observed_expense_micros > maximum_amount_micros)
);

create trigger owner_operating_budget_consumptions_immutable before update or delete
on tongs.owner_operating_budget_consumptions
for each row execute function tongs._reject_accounting_mutation();
create trigger owner_operating_budget_discrepancies_immutable before update or delete
on tongs.owner_operating_budget_discrepancies
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs._validate_owner_budget_reservation()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_budget tongs.owner_operating_budgets%rowtype;
  v_revision tongs.owner_operating_budget_revisions%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_consumed bigint;
  v_held bigint;
begin
  if new.funding_source_type <> 'owner_budget' then return new; end if;
  select * into v_budget from tongs.owner_operating_budgets where id = new.funding_source_id for update;
  select * into v_revision from tongs.owner_operating_budget_revisions
    where budget_id = new.funding_source_id order by revision desc limit 1;
  select * into v_quote from tongs.customer_spending_quotes where id = new.quote_id;
  select * into v_pricing from tongs.private_pricing_revisions where id = v_quote.pricing_revision_id;
  select * into v_policy from tongs.private_pricing_policies where id = v_pricing.policy_id;
  if v_budget.id is null or v_revision.status <> 'active' or v_revision.maximum_amount_micros is null
     or now() < v_budget.period_start or now() >= v_budget.period_end then
    raise exception 'active capped owner operating budget required' using errcode = 'P0001';
  end if;
  if not tongs.is_platform_operator(v_quote.user_id) then
    raise exception 'owner budget requires platform-operator operation identity' using errcode = '42501';
  end if;
  if v_budget.currency <> new.currency
     or (v_budget.workspace_id is not null and v_budget.workspace_id is distinct from v_quote.workspace_id)
     or (v_budget.provider is not null and lower(v_budget.provider) is distinct from lower(v_policy.provider))
     or (v_budget.route is not null and lower(v_budget.route) is distinct from lower(v_quote.tool))
     or (v_budget.sku is not null and lower(v_budget.sku) is distinct from lower(v_policy.sku)) then
    raise exception 'owner budget scope does not cover operation' using errcode = '42501';
  end if;
  select coalesce(sum(expense_amount_micros),0) into v_consumed
    from tongs.owner_operating_budget_consumptions where budget_id = v_budget.id;
  select coalesce(sum(reservation.reserved_wholesale_spend_micros),0) into v_held
    from tongs.funding_reservations reservation
    where reservation.funding_source_type = 'owner_budget'
      and reservation.funding_source_id = v_budget.id
      and tongs._funding_reservation_state(reservation.id) not in ('settled','released');
  if v_consumed + v_held + new.reserved_wholesale_spend_micros > v_revision.maximum_amount_micros then
    raise exception 'insufficient owner operating budget' using errcode = 'P0001';
  end if;
  if new.reserved_customer_charge_micros <> 0 or new.reserved_credit_units <> 0 then
    raise exception 'owner-funded reservation cannot debit a customer' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger funding_reservations_owner_budget_cap
before insert on tongs.funding_reservations
for each row execute function tongs._validate_owner_budget_reservation();

create or replace function tongs.consume_owner_operating_budget(
  p_consumption_id uuid,
  p_budget_id uuid,
  p_reservation_id uuid,
  p_allocation_key text,
  p_operation_id text,
  p_expense_amount_micros bigint,
  p_consumed_at timestamptz,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_budget tongs.owner_operating_budgets%rowtype;
  v_revision tongs.owner_operating_budget_revisions%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_existing tongs.owner_operating_budget_consumptions%rowtype;
  v_consumed bigint;
  v_key text := nullif(btrim(coalesce(p_allocation_key,'')), '');
  v_operation text := nullif(btrim(coalesce(p_operation_id,'')), '');
  v_payload jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_consumption_id is null or p_budget_id is null or p_reservation_id is null
     or v_key is null or v_operation is null or p_expense_amount_micros <= 0
     or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb)) <> 'object' then
    raise exception 'invalid owner budget consumption' using errcode = '22023';
  end if;
  select * into v_budget from tongs.owner_operating_budgets where id = p_budget_id for update;
  if not found then raise exception 'owner operating budget not found' using errcode = 'P0002'; end if;
  select * into v_revision from tongs.owner_operating_budget_revisions
    where budget_id = p_budget_id order by revision desc limit 1;
  if v_revision.status <> 'active' or v_revision.maximum_amount_micros is null
     or now() < v_budget.period_start or now() >= v_budget.period_end then
    raise exception 'active capped owner operating budget required' using errcode = 'P0001';
  end if;
  select * into v_reservation from tongs.funding_reservations where id = p_reservation_id for update;
  if not found or v_reservation.funding_source_type <> 'owner_budget'
     or v_reservation.funding_source_id <> p_budget_id or v_reservation.operation_id <> v_operation then
    raise exception 'matching owner-funded reservation required' using errcode = 'P0001';
  end if;
  select * into v_existing from tongs.owner_operating_budget_consumptions
    where allocation_key = v_key or reservation_id = p_reservation_id limit 1;
  if found then
    if v_existing.budget_id <> p_budget_id or v_existing.operation_id <> v_operation
       or v_existing.expense_amount_micros <> p_expense_amount_micros then
      raise exception 'owner budget consumption replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('consumption_id',v_existing.id,'replay',true,
      'customer_revenue_micros',0,'margin','not_applicable');
  end if;
  select coalesce(sum(expense_amount_micros),0) into v_consumed
    from tongs.owner_operating_budget_consumptions where budget_id = p_budget_id;
  if v_consumed + p_expense_amount_micros > v_revision.maximum_amount_micros then
    insert into tongs.owner_operating_budget_discrepancies(
      id,budget_id,reservation_id,discrepancy_key,maximum_amount_micros,
      prior_consumed_micros,observed_expense_micros,evidence_json
    ) values (gen_random_uuid(),p_budget_id,p_reservation_id,v_key||':budget-overrun',
      v_revision.maximum_amount_micros,v_consumed,p_expense_amount_micros,
      coalesce(p_evidence_json,'{}'::jsonb)) on conflict(discrepancy_key) do nothing;
  end if;
  v_payload := jsonb_build_object('consumption_id',p_consumption_id,'budget_id',p_budget_id,
    'reservation_id',p_reservation_id,'operation_id',v_operation,
    'expense_amount_micros',p_expense_amount_micros,'customer_revenue_micros',0,
    'margin','not_applicable','evidence',coalesce(p_evidence_json,'{}'::jsonb));
  perform tongs._create_accounting_event(
    p_consumption_id,'owner-budget-consumption:'||v_key,'owner_operating_budget_consumed',
    'owner_internal','forge_operation',v_operation,v_budget.currency,null,v_budget.workspace_id,null,
    v_payload,coalesce(p_consumed_at,now())
  );
  insert into tongs.owner_operating_budget_consumptions(
    id,budget_id,reservation_id,operation_id,allocation_key,expense_amount_micros,
    currency,journal_event_id,evidence_json,consumed_at
  ) values (p_consumption_id,p_budget_id,p_reservation_id,v_operation,v_key,p_expense_amount_micros,
    v_budget.currency,p_consumption_id,coalesce(p_evidence_json,'{}'::jsonb),coalesce(p_consumed_at,now()));
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,workspace_id,owner_budget_id,currency,amount_micros
  ) values
    (p_consumption_id,1,'owner_research_qa_expense',v_budget.workspace_id,p_budget_id,v_budget.currency,p_expense_amount_micros),
    (p_consumption_id,2,'forge_cash_clearing',v_budget.workspace_id,p_budget_id,v_budget.currency,-p_expense_amount_micros);
  perform tongs._assert_accounting_event_balanced(p_consumption_id);
  return jsonb_build_object('consumption_id',p_consumption_id,'replay',false,
    'remaining_budget_micros',v_revision.maximum_amount_micros-v_consumed-p_expense_amount_micros,
    'customer_revenue_micros',0,'margin','not_applicable');
end;
$$;

create or replace function tongs.begin_owner_provider_attempt(
  p_reservation_id uuid,
  p_attempt_key text,
  p_lease_seconds integer,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_budget tongs.owner_operating_budgets%rowtype;
  v_revision tongs.owner_operating_budget_revisions%rowtype;
  v_state text;
  v_existing tongs.funding_reservation_events%rowtype;
  v_consumed bigint;
  v_held bigint;
  v_sequence integer;
  v_lease timestamptz;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_attempt_key,'')))<8 or p_lease_seconds<5 or p_lease_seconds>900
     or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid provider attempt lease' using errcode='22023';
  end if;
  select * into v_control from tongs._current_paid_execution_control();
  if not v_control.owner_budget_spending_enabled or not v_control.provider_execution_enabled then
    raise exception 'owner-budget provider execution is not activated' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-attempt:'||p_reservation_id::text,0));
  select * into v_reservation from tongs.funding_reservations where id=p_reservation_id for update;
  if not found or v_reservation.funding_source_type<>'owner_budget' then
    raise exception 'owner-funded reservation not found' using errcode='P0002';
  end if;
  select * into v_existing from tongs.funding_reservation_events
    where reservation_id=p_reservation_id and provider_attempt_key=btrim(p_attempt_key);
  if found then
    return jsonb_build_object('reservation_id',p_reservation_id,'attempt_key',v_existing.provider_attempt_key,
      'state',tongs._funding_reservation_state(p_reservation_id),'replay',true,
      'lease_expires_at',v_existing.lease_expires_at,'provider_execution_authorized',false,
      'reason','duplicate_attempt');
  end if;
  v_state:=tongs._funding_reservation_state(p_reservation_id);
  if v_state='submission_unknown' then
    return jsonb_build_object('reservation_id',p_reservation_id,'state',v_state,'replay',true,
      'provider_execution_authorized',false,'reason','ambiguous_submission_requires_reconciliation');
  elsif v_state in ('settled','released') then
    raise exception 'reservation is terminal' using errcode='P0001';
  elsif v_state not in ('reserved','provider_attempt_shadowed','provider_failure_recorded') then
    raise exception 'reservation is not attemptable' using errcode='P0001';
  end if;
  select * into v_budget from tongs.owner_operating_budgets where id=v_reservation.funding_source_id for update;
  select * into v_revision from tongs.owner_operating_budget_revisions
    where budget_id=v_budget.id order by revision desc limit 1;
  if v_revision.status<>'active' or v_revision.maximum_amount_micros is null
     or now()<v_budget.period_start or now()>=v_budget.period_end then
    raise exception 'active capped owner operating budget required' using errcode='P0001';
  end if;
  select coalesce(sum(expense_amount_micros),0) into v_consumed
    from tongs.owner_operating_budget_consumptions where budget_id=v_budget.id;
  select coalesce(sum(reservation.reserved_wholesale_spend_micros),0) into v_held
    from tongs.funding_reservations reservation
    where reservation.funding_source_type='owner_budget' and reservation.funding_source_id=v_budget.id
      and tongs._funding_reservation_state(reservation.id) not in ('settled','released');
  if v_consumed+v_held>v_revision.maximum_amount_micros then
    raise exception 'owner operating budget cap exhausted before provider boundary' using errcode='P0001';
  end if;
  v_lease:=now()+make_interval(secs=>p_lease_seconds);
  select coalesce(max(sequence),0)+1 into v_sequence from tongs.funding_reservation_events
    where reservation_id=p_reservation_id;
  insert into tongs.funding_reservation_events(
    id,reservation_id,sequence,event_type,event_key,provider_attempt_key,lease_expires_at,evidence_json
  ) values (gen_random_uuid(),p_reservation_id,v_sequence,'provider_attempt_shadowed',
    'reservation:'||p_reservation_id::text||':attempt:'||btrim(p_attempt_key),btrim(p_attempt_key),v_lease,
    coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object('owner_budget_id',v_budget.id));
  return jsonb_build_object('reservation_id',p_reservation_id,'attempt_key',btrim(p_attempt_key),
    'state','provider_attempt_shadowed','replay',false,'lease_expires_at',v_lease,
    'provider_execution_authorized',true,'reason','owner_budget_authorized');
end $$;

create or replace function tongs.settle_owner_operation(
  p_reservation_id uuid,
  p_settlement_id uuid,
  p_settlement_key text,
  p_outcome text,
  p_failure_class text,
  p_actual_fulfillment_cost_micros bigint,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_existing tongs.funding_reservation_events%rowtype;
  v_expense bigint;
  v_sequence integer;
  v_consumption jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into v_control from tongs._current_paid_execution_control();
  if not v_control.owner_budget_spending_enabled or not v_control.provider_execution_enabled then
    raise exception 'owner-budget provider execution is not activated' using errcode = '42501';
  end if;
  if p_settlement_id is null or length(btrim(coalesce(p_settlement_key,''))) < 8
     or p_outcome not in ('success','billable_failure','nonbillable_failure')
     or p_actual_fulfillment_cost_micros < 0
     or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb)) <> 'object' then
    raise exception 'invalid owner operation settlement' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-attempt:'||p_reservation_id::text,0));
  select * into v_reservation from tongs.funding_reservations where id=p_reservation_id for update;
  if not found or v_reservation.funding_source_type <> 'owner_budget' then
    raise exception 'owner-funded reservation not found' using errcode = 'P0002';
  end if;
  select * into v_quote from tongs.customer_spending_quotes where id=v_reservation.quote_id;
  select * into v_existing from tongs.funding_reservation_events where event_key=btrim(p_settlement_key);
  if found then return jsonb_build_object('reservation_id',p_reservation_id,'state','settled','replay',true,
    'owner_expense_micros',v_existing.wholesale_spend_micros,'customer_revenue_micros',0,'margin','not_applicable'); end if;
  if tongs._funding_reservation_state(p_reservation_id) in ('settled','released') then
    raise exception 'owner-funded reservation is terminal' using errcode = 'P0001';
  end if;
  if p_outcome='billable_failure' and not exists (
    select 1 from jsonb_array_elements_text(v_quote.billable_failure_classes) value
    where value=btrim(coalesce(p_failure_class,''))
  ) then raise exception 'failure class is not billable under accepted quote' using errcode = 'P0001'; end if;
  v_expense := case when p_outcome='nonbillable_failure' then 0 else p_actual_fulfillment_cost_micros end;
  if v_expense > v_reservation.reserved_wholesale_spend_micros then
    insert into tongs.pricing_discrepancies(
      id,reservation_id,discrepancy_key,discrepancy_type,quoted_ceiling_micros,observed_amount_micros,evidence_json
    ) values (gen_random_uuid(),p_reservation_id,btrim(p_settlement_key)||':owner-cost-overrun',
      'wholesale_ceiling_overrun',v_reservation.reserved_wholesale_spend_micros,v_expense,
      coalesce(p_evidence_json,'{}'::jsonb)) on conflict(discrepancy_key) do nothing;
  end if;
  if v_expense > 0 then
    v_consumption := tongs.consume_owner_operating_budget(
      p_settlement_id,v_reservation.funding_source_id,p_reservation_id,
      'owner-reservation-settlement:'||p_reservation_id::text,v_reservation.operation_id,
      v_expense,now(),coalesce(p_evidence_json,'{}'::jsonb)
    );
  end if;
  select coalesce(max(sequence),0)+1 into v_sequence from tongs.funding_reservation_events
    where reservation_id=p_reservation_id;
  insert into tongs.funding_reservation_events(
    id,reservation_id,sequence,event_type,event_key,customer_charge_micros,credit_units,
    wholesale_spend_micros,failure_class,evidence_json
  ) values (gen_random_uuid(),p_reservation_id,v_sequence,'settled',btrim(p_settlement_key),0,0,v_expense,
    nullif(btrim(coalesce(p_failure_class,'')),''),coalesce(p_evidence_json,'{}'::jsonb));
  return jsonb_build_object('reservation_id',p_reservation_id,'state','settled','replay',false,
    'owner_expense_micros',v_expense,'customer_debit_micros',0,'customer_revenue_micros',0,
    'margin','not_applicable','accounting_consumption',v_consumption);
end;
$$;

create or replace function tongs.read_owner_operating_budget_activity(p_budget_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_budget jsonb; v_consumptions jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode='42501';
  end if;
  select to_jsonb(b) into v_budget from (
    select budget.*,revision.revision,revision.status,revision.maximum_amount_micros,revision.reason
    from tongs.owner_operating_budgets budget
    join lateral (select r.revision,r.status,r.maximum_amount_micros,r.reason
      from tongs.owner_operating_budget_revisions r where r.budget_id=budget.id order by r.revision desc limit 1) revision on true
    where budget.id=p_budget_id
  ) b;
  if v_budget is null then raise exception 'owner operating budget not found' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.consumed_at),'[]'::jsonb) into v_consumptions
    from tongs.owner_operating_budget_consumptions c where c.budget_id=p_budget_id;
  return jsonb_build_object('budget',v_budget,'consumptions',v_consumptions,
    'discrepancies',(select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at),'[]'::jsonb)
      from tongs.owner_operating_budget_discrepancies d where d.budget_id=p_budget_id),
    'customer_revenue_micros',0,'margin','not_applicable');
end;
$$;

alter table tongs.owner_operating_budget_consumptions enable row level security;
alter table tongs.owner_operating_budget_discrepancies enable row level security;
revoke all on tongs.owner_operating_budget_consumptions from public,anon,authenticated,service_role;
revoke all on tongs.owner_operating_budget_discrepancies from public,anon,authenticated,service_role;
grant select on tongs.owner_operating_budget_consumptions to service_role;
grant select on tongs.owner_operating_budget_discrepancies to service_role;
revoke all on function tongs._validate_owner_budget_reservation() from public,anon,authenticated,service_role;
revoke all on function tongs.consume_owner_operating_budget(uuid,uuid,uuid,text,text,bigint,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function tongs.begin_owner_provider_attempt(uuid,text,integer,jsonb) from public,anon,authenticated;
revoke all on function tongs.settle_owner_operation(uuid,uuid,text,text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function tongs.consume_owner_operating_budget(uuid,uuid,uuid,text,text,bigint,timestamptz,jsonb) to service_role;
grant execute on function tongs.begin_owner_provider_attempt(uuid,text,integer,jsonb) to service_role;
grant execute on function tongs.settle_owner_operation(uuid,uuid,text,text,text,bigint,jsonb) to service_role;
revoke all on function tongs.read_owner_operating_budget_activity(uuid) from public,anon;
grant execute on function tongs.read_owner_operating_budget_activity(uuid) to authenticated,service_role;

comment on table tongs.owner_operating_budget_consumptions is
  'Owner-funded R&D/QA expense only. Never creates customer liability, debit, allowance use, or service revenue.';
comment on function tongs.settle_owner_operation(uuid,uuid,text,text,text,bigint,jsonb) is
  'Separate owner-funded settlement path; production remains disabled until an approved control revision and capped active budget exist.';

notify pgrst,'reload schema';
commit;
