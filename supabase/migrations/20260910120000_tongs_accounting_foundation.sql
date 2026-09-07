-- Accounting foundation only: append-only funding provenance and owner controls.
-- This migration does not activate pricing, provider execution, or a spending gate.
begin;

create extension if not exists pgcrypto;

create table tongs.accounting_journal_events (
  id uuid primary key,
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 300),
  event_type text not null check (length(btrim(event_type)) between 3 and 80),
  environment text not null check (environment in ('live', 'test', 'legacy_unverified', 'owner_internal')),
  source_type text not null check (length(btrim(source_type)) between 2 and 80),
  source_id text not null check (length(btrim(source_id)) between 1 and 300),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  user_id uuid references auth.users(id) on delete restrict,
  workspace_id uuid references tongs.workspaces(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table tongs.accounting_journal_entries (
  event_id uuid not null references tongs.accounting_journal_events(id) on delete restrict,
  line_number smallint not null check (line_number > 0),
  account_code text not null check (length(btrim(account_code)) between 3 and 100),
  user_id uuid references auth.users(id) on delete restrict,
  workspace_id uuid references tongs.workspaces(id) on delete restrict,
  deposit_id uuid,
  allowance_grant_id uuid,
  owner_budget_id uuid,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  amount_micros bigint not null default 0,
  unit_kind text,
  quantity_delta bigint not null default 0,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  primary key (event_id, line_number),
  check (amount_micros <> 0 or quantity_delta <> 0),
  check ((amount_micros = 0) = (currency is null)),
  check ((quantity_delta = 0) = (unit_kind is null))
);

create index accounting_journal_entries_account_idx
  on tongs.accounting_journal_entries(account_code, user_id, currency, created_at);
create index accounting_journal_entries_deposit_idx
  on tongs.accounting_journal_entries(deposit_id, created_at) where deposit_id is not null;

create table tongs.customer_deposits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  stripe_mode text not null check (stripe_mode in ('live', 'test')),
  stripe_event_id text not null,
  stripe_session_id text not null,
  stripe_payment_intent_id text,
  pack_id text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_amount_micros bigint not null check (gross_amount_micros > 0),
  credit_units bigint not null check (credit_units > 0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (stripe_mode, stripe_event_id),
  unique (stripe_mode, stripe_session_id)
);
create unique index customer_deposits_payment_intent_uidx
  on tongs.customer_deposits(stripe_mode, stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create table tongs.customer_deposit_processor_fees (
  id uuid primary key,
  deposit_id uuid not null unique references tongs.customer_deposits(id) on delete restrict,
  provider_fee_reference text not null unique,
  fee_amount_micros bigint not null check (fee_amount_micros >= 0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table tongs.customer_deposit_consumptions (
  id uuid primary key,
  deposit_id uuid not null references tongs.customer_deposits(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  allocation_key text not null unique,
  operation_id text not null,
  recognized_revenue_micros bigint not null check (recognized_revenue_micros > 0),
  credit_units_consumed bigint not null check (credit_units_consumed > 0),
  allocated_processor_fee_micros bigint not null check (allocated_processor_fee_micros >= 0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  consumed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (deposit_id, operation_id)
);

create table tongs.customer_deposit_refunds (
  id uuid primary key,
  deposit_id uuid not null references tongs.customer_deposits(id) on delete restrict,
  stripe_refund_id text not null unique,
  stripe_event_id text not null,
  adjustment_type text not null check (adjustment_type in ('refund', 'dispute', 'payment_reversal')),
  refund_amount_micros bigint not null check (refund_amount_micros > 0),
  refunded_credit_units bigint not null check (refunded_credit_units >= 0),
  liability_release_micros bigint not null check (liability_release_micros >= 0),
  discrepancy_expense_micros bigint not null check (discrepancy_expense_micros >= 0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  refunded_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (liability_release_micros + discrepancy_expense_micros = refund_amount_micros)
);

create table tongs.subscription_cycle_receipts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  stripe_mode text not null check (stripe_mode in ('live', 'test')),
  stripe_event_id text not null,
  stripe_invoice_id text not null,
  stripe_subscription_id text not null,
  stripe_payment_intent_id text,
  purchase_type text not null check (purchase_type in ('subscription', 'cloud_storage')),
  plan_item_id text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_amount_micros bigint not null check (gross_amount_micros > 0),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (stripe_mode, stripe_event_id),
  unique (stripe_mode, stripe_invoice_id)
);
create index subscription_cycle_receipts_payment_intent_idx
  on tongs.subscription_cycle_receipts(stripe_mode, stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create table tongs.subscription_cycle_adjustments (
  id uuid primary key,
  receipt_id uuid not null references tongs.subscription_cycle_receipts(id) on delete restrict,
  provider_object_id text not null unique,
  stripe_event_id text not null,
  adjustment_type text not null check (adjustment_type in ('refund', 'dispute', 'payment_reversal')),
  amount_micros bigint not null check (amount_micros > 0),
  liability_release_micros bigint not null check (liability_release_micros >= 0),
  discrepancy_expense_micros bigint not null check (discrepancy_expense_micros >= 0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  adjusted_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (liability_release_micros + discrepancy_expense_micros = amount_micros)
);

create table tongs.paid_allowance_grants (
  id uuid primary key,
  receipt_id uuid not null references tongs.subscription_cycle_receipts(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  stripe_subscription_id text not null,
  plan_item_id text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  entitlement_units bigint not null check (entitlement_units > 0),
  allocated_revenue_micros bigint not null check (allocated_revenue_micros > 0),
  maximum_wholesale_spend_micros bigint not null check (maximum_wholesale_spend_micros > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  allocation_policy_revision text not null check (length(btrim(allocation_policy_revision)) > 0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  granted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (receipt_id, allocation_policy_revision),
  check (maximum_wholesale_spend_micros <= allocated_revenue_micros),
  check (period_end > period_start)
);

create table tongs.paid_allowance_consumptions (
  id uuid primary key,
  allowance_grant_id uuid not null references tongs.paid_allowance_grants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  allocation_key text not null unique,
  operation_id text not null,
  entitlement_units_consumed bigint not null check (entitlement_units_consumed > 0),
  recognized_revenue_micros bigint not null check (recognized_revenue_micros > 0),
  wholesale_spend_micros bigint not null check (wholesale_spend_micros >= 0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  consumed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (allowance_grant_id, operation_id)
);

create table tongs.legacy_credit_opening_balances (
  user_id uuid primary key references auth.users(id) on delete restrict,
  credit_units bigint not null check (credit_units >= 0),
  eligible_for_live_funding boolean not null default false check (eligible_for_live_funding = false),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  captured_at timestamptz not null,
  source_relation text not null default 'tongs.ai_credits'
);

create table tongs.owner_operating_budgets (
  id uuid primary key,
  environment text not null check (environment in ('production', 'preview', 'development')),
  workspace_id uuid references tongs.workspaces(id) on delete restrict,
  provider text,
  route text,
  sku text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table tongs.owner_operating_budget_revisions (
  budget_id uuid not null references tongs.owner_operating_budgets(id) on delete restrict,
  revision integer not null check (revision > 0),
  status text not null check (status in ('draft', 'active', 'paused', 'closed')),
  maximum_amount_micros bigint check (maximum_amount_micros is null or maximum_amount_micros > 0),
  reason text not null check (length(btrim(reason)) > 0),
  actor_id uuid not null references auth.users(id) on delete restrict,
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (budget_id, revision),
  check (status <> 'active' or maximum_amount_micros is not null)
);

create table tongs.accounting_unmatched_provider_events (
  id uuid primary key,
  provider text not null,
  provider_event_id text not null,
  provider_object_id text not null,
  event_type text not null,
  stripe_mode text check (stripe_mode in ('live', 'test')),
  amount_micros bigint check (amount_micros is null or amount_micros >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (provider, provider_object_id)
);

alter table tongs.accounting_journal_entries
  add constraint accounting_journal_entries_deposit_fk
    foreign key (deposit_id) references tongs.customer_deposits(id) on delete restrict,
  add constraint accounting_journal_entries_allowance_fk
    foreign key (allowance_grant_id) references tongs.paid_allowance_grants(id) on delete restrict,
  add constraint accounting_journal_entries_owner_budget_fk
    foreign key (owner_budget_id) references tongs.owner_operating_budgets(id) on delete restrict;

create or replace function tongs._reject_accounting_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'accounting records are append-only' using errcode = '55000';
end;
$$;

create or replace function tongs.record_customer_deposit_refund(
  p_refund_id uuid,
  p_deposit_id uuid,
  p_stripe_refund_id text,
  p_stripe_event_id text,
  p_adjustment_type text,
  p_refund_amount_micros bigint,
  p_refunded_at timestamptz,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_deposit tongs.customer_deposits%rowtype;
  v_existing tongs.customer_deposit_refunds%rowtype;
  v_refund_reference text := nullif(btrim(coalesce(p_stripe_refund_id, '')), '');
  v_event_reference text := nullif(btrim(coalesce(p_stripe_event_id, '')), '');
  v_prior_refunds bigint;
  v_consumed_micros bigint;
  v_prior_refunded_units bigint;
  v_consumed_units bigint;
  v_liability_available bigint;
  v_liability_release bigint;
  v_discrepancy bigint;
  v_refunded_units bigint;
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_refund_id is null or p_deposit_id is null or v_refund_reference is null
     or v_event_reference is null or p_adjustment_type not in ('refund', 'dispute', 'payment_reversal')
     or p_refund_amount_micros <= 0 then
    raise exception 'invalid customer deposit refund' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe-refund:' || v_refund_reference, 0));
  select * into v_existing from tongs.customer_deposit_refunds where stripe_refund_id = v_refund_reference;
  if found then
    if v_existing.deposit_id <> p_deposit_id or v_existing.adjustment_type <> p_adjustment_type
       or v_existing.refund_amount_micros <> p_refund_amount_micros then
      raise exception 'customer refund replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('refund_id', v_existing.id, 'replay', true);
  end if;
  select * into v_deposit from tongs.customer_deposits where id = p_deposit_id for update;
  if not found then raise exception 'deposit not found' using errcode = 'P0002'; end if;
  select coalesce(sum(refund_amount_micros), 0), coalesce(sum(refunded_credit_units), 0)
    into v_prior_refunds, v_prior_refunded_units
  from tongs.customer_deposit_refunds where deposit_id = p_deposit_id;
  if p_refund_amount_micros > v_deposit.gross_amount_micros - v_prior_refunds then
    raise exception 'refund exceeds deposit receipt' using errcode = 'P0001';
  end if;
  select coalesce(sum(recognized_revenue_micros), 0), coalesce(sum(credit_units_consumed), 0)
    into v_consumed_micros, v_consumed_units
  from tongs.customer_deposit_consumptions where deposit_id = p_deposit_id;
  v_liability_available := greatest(v_deposit.gross_amount_micros - v_consumed_micros -
    (select coalesce(sum(liability_release_micros), 0) from tongs.customer_deposit_refunds where deposit_id = p_deposit_id), 0);
  v_liability_release := least(p_refund_amount_micros, v_liability_available);
  v_discrepancy := p_refund_amount_micros - v_liability_release;
  v_refunded_units := least(
    v_deposit.credit_units - v_consumed_units - v_prior_refunded_units,
    greatest((v_deposit.credit_units * (v_prior_refunds + p_refund_amount_micros) / v_deposit.gross_amount_micros) - v_prior_refunded_units, 0)
  );
  v_payload := jsonb_build_object('refund_id', p_refund_id, 'deposit_id', p_deposit_id,
    'stripe_refund_id', v_refund_reference, 'stripe_event_id', v_event_reference,
    'adjustment_type', p_adjustment_type,
    'refund_amount_micros', p_refund_amount_micros, 'refunded_credit_units', v_refunded_units,
    'liability_release_micros', v_liability_release, 'discrepancy_expense_micros', v_discrepancy,
    'evidence', coalesce(p_evidence_json, '{}'::jsonb));
  perform tongs._create_accounting_event(
    p_refund_id, 'stripe:' || v_deposit.stripe_mode || ':refund:' || v_refund_reference,
    'customer_deposit_' || p_adjustment_type, v_deposit.stripe_mode, 'stripe_adjustment', v_refund_reference,
    v_deposit.currency, v_deposit.user_id, null, null, v_payload, coalesce(p_refunded_at, now())
  );
  insert into tongs.customer_deposit_refunds(
    id, deposit_id, stripe_refund_id, stripe_event_id, adjustment_type, refund_amount_micros,
    refunded_credit_units, liability_release_micros, discrepancy_expense_micros,
    journal_event_id, evidence_json, refunded_at
  ) values (
    p_refund_id, p_deposit_id, v_refund_reference, v_event_reference, p_adjustment_type, p_refund_amount_micros,
    v_refunded_units, v_liability_release, v_discrepancy, p_refund_id,
    coalesce(p_evidence_json, '{}'::jsonb), coalesce(p_refunded_at, now())
  );
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, deposit_id, currency, amount_micros
  )
  select p_refund_id, line_number, account_code, v_deposit.user_id, p_deposit_id,
    v_deposit.currency, amount_micros
  from (values
    (1::smallint, case when v_deposit.stripe_mode = 'live' then 'customer_prepaid_liability' else 'test_customer_prepaid_balance' end, v_liability_release),
    (2::smallint, case when v_deposit.stripe_mode = 'live' then 'refund_discrepancy_expense' else 'test_refund_discrepancy' end, v_discrepancy),
    (3::smallint, case when v_deposit.stripe_mode = 'live' then 'forge_cash_clearing' else 'test_cash_clearing' end, -p_refund_amount_micros)
  ) lines(line_number, account_code, amount_micros)
  where amount_micros <> 0;
  if v_refunded_units > 0 then
    insert into tongs.accounting_journal_entries(
      event_id, line_number, account_code, user_id, deposit_id, unit_kind, quantity_delta
    ) values (p_refund_id, 4,
      case when v_deposit.stripe_mode = 'live' then 'live_customer_credits' else 'test_customer_credits' end,
      v_deposit.user_id, p_deposit_id, 'forge_credit', -v_refunded_units);
  end if;
  perform tongs._assert_accounting_event_balanced(p_refund_id);
  return jsonb_build_object('refund_id', p_refund_id, 'replay', false,
    'liability_release_micros', v_liability_release, 'discrepancy_expense_micros', v_discrepancy,
    'refunded_credit_units', v_refunded_units);
end;
$$;

create or replace function tongs.record_subscription_cycle_receipt(
  p_receipt_id uuid,
  p_user_id uuid,
  p_stripe_event_id text,
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_stripe_payment_intent_id text,
  p_livemode boolean,
  p_purchase_type text,
  p_plan_item_id text,
  p_gross_amount_micros bigint,
  p_currency text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_received_at timestamptz,
  p_metadata_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_mode text := case when coalesce(p_livemode, false) then 'live' else 'test' end;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_event text := nullif(btrim(coalesce(p_stripe_event_id, '')), '');
  v_invoice text := nullif(btrim(coalesce(p_stripe_invoice_id, '')), '');
  v_subscription text := nullif(btrim(coalesce(p_stripe_subscription_id, '')), '');
  v_payment_intent text := nullif(btrim(coalesce(p_stripe_payment_intent_id, '')), '');
  v_plan text := nullif(btrim(coalesce(p_plan_item_id, '')), '');
  v_existing tongs.subscription_cycle_receipts%rowtype;
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_receipt_id is null or p_user_id is null or v_event is null or v_invoice is null
     or v_subscription is null or v_plan is null or p_purchase_type not in ('subscription', 'cloud_storage')
     or p_gross_amount_micros <= 0 or v_currency !~ '^[A-Z]{3}$'
     or p_period_start is null or p_period_end <= p_period_start then
    raise exception 'invalid subscription cycle receipt' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe:' || v_mode || ':invoice:' || v_invoice, 0));
  select * into v_existing from tongs.subscription_cycle_receipts
   where (stripe_mode = v_mode and stripe_event_id = v_event)
      or (stripe_mode = v_mode and stripe_invoice_id = v_invoice) limit 1;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.stripe_invoice_id <> v_invoice
       or v_existing.stripe_subscription_id <> v_subscription or v_existing.purchase_type <> p_purchase_type
       or v_existing.plan_item_id <> v_plan or v_existing.currency <> v_currency
       or v_existing.gross_amount_micros <> p_gross_amount_micros
       or v_existing.period_start <> p_period_start or v_existing.period_end <> p_period_end then
      raise exception 'subscription receipt replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('receipt_id', v_existing.id, 'stripe_mode', v_existing.stripe_mode, 'replay', true);
  end if;
  v_payload := jsonb_build_object('receipt_id', p_receipt_id, 'user_id', p_user_id,
    'stripe_event_id', v_event, 'stripe_invoice_id', v_invoice, 'stripe_subscription_id', v_subscription,
    'stripe_payment_intent_id', v_payment_intent, 'stripe_mode', v_mode, 'purchase_type', p_purchase_type,
    'plan_item_id', v_plan, 'gross_amount_micros', p_gross_amount_micros, 'currency', v_currency,
    'period_start', p_period_start, 'period_end', p_period_end, 'metadata', coalesce(p_metadata_json, '{}'::jsonb));
  perform tongs._create_accounting_event(
    p_receipt_id, 'stripe:' || v_mode || ':subscription-receipt:' || v_invoice,
    'subscription_cycle_cash_received', v_mode, 'stripe_invoice', v_invoice, v_currency,
    p_user_id, null, null, v_payload, coalesce(p_received_at, now())
  );
  insert into tongs.subscription_cycle_receipts(
    id, user_id, stripe_mode, stripe_event_id, stripe_invoice_id, stripe_subscription_id,
    stripe_payment_intent_id, purchase_type, plan_item_id, currency, gross_amount_micros,
    period_start, period_end, journal_event_id, metadata_json, received_at
  ) values (
    p_receipt_id, p_user_id, v_mode, v_event, v_invoice, v_subscription, v_payment_intent,
    p_purchase_type, v_plan, v_currency, p_gross_amount_micros, p_period_start, p_period_end,
    p_receipt_id, coalesce(p_metadata_json, '{}'::jsonb), coalesce(p_received_at, now())
  );
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, currency, amount_micros
  ) values
    (p_receipt_id, 1, case when v_mode = 'live' then 'forge_cash_clearing' else 'test_cash_clearing' end,
      p_user_id, v_currency, p_gross_amount_micros),
    (p_receipt_id, 2, case when v_mode = 'live' then 'subscription_deferred_liability' else 'test_subscription_balance' end,
      p_user_id, v_currency, -p_gross_amount_micros);
  perform tongs._assert_accounting_event_balanced(p_receipt_id);
  return jsonb_build_object('receipt_id', p_receipt_id, 'stripe_mode', v_mode, 'replay', false);
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'accounting_journal_events', 'accounting_journal_entries', 'customer_deposits',
    'customer_deposit_processor_fees', 'customer_deposit_consumptions', 'customer_deposit_refunds',
    'subscription_cycle_receipts', 'subscription_cycle_adjustments', 'paid_allowance_grants',
    'paid_allowance_consumptions',
    'legacy_credit_opening_balances', 'owner_operating_budgets',
    'owner_operating_budget_revisions', 'accounting_unmatched_provider_events'
  ] loop
    execute format('create trigger %I before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',
      'trg_' || v_table || '_append_only', v_table);
    execute format('alter table tongs.%I enable row level security', v_table);
  end loop;
end;
$$;

create or replace function tongs._require_accounting_service_role()
returns void language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
end;
$$;

create or replace function tongs._accounting_payload_hash(p_payload jsonb)
returns text language sql immutable set search_path = pg_catalog as $$
  select encode(extensions.digest(convert_to(coalesce(p_payload, '{}'::jsonb)::text, 'utf8'), 'sha256'), 'hex');
$$;

create or replace function tongs._create_accounting_event(
  p_event_id uuid,
  p_idempotency_key text,
  p_event_type text,
  p_environment text,
  p_source_type text,
  p_source_id text,
  p_currency text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_actor_id uuid,
  p_payload jsonb,
  p_occurred_at timestamptz
) returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_hash text := tongs._accounting_payload_hash(p_payload);
  v_existing tongs.accounting_journal_events%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into v_existing from tongs.accounting_journal_events where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.id <> p_event_id or v_existing.payload_hash <> v_hash then
      raise exception 'accounting event replay conflict' using errcode = '23505';
    end if;
    return false;
  end if;
  insert into tongs.accounting_journal_events(
    id, idempotency_key, event_type, environment, source_type, source_id, currency,
    user_id, workspace_id, actor_id, payload_hash, metadata_json, occurred_at
  ) values (
    p_event_id, btrim(p_idempotency_key), btrim(p_event_type), p_environment,
    btrim(p_source_type), btrim(p_source_id), p_currency, p_user_id, p_workspace_id,
    p_actor_id, v_hash, coalesce(p_payload, '{}'::jsonb), coalesce(p_occurred_at, now())
  );
  return true;
end;
$$;

create or replace function tongs._assert_accounting_event_balanced(p_event_id uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if exists (
    select 1 from tongs.accounting_journal_entries entry
    where entry.event_id = p_event_id and entry.amount_micros <> 0
    group by entry.currency having sum(entry.amount_micros) <> 0
  ) then
    raise exception 'accounting event is not balanced' using errcode = '23514';
  end if;
end;
$$;

create or replace function tongs.record_customer_deposit(
  p_deposit_id uuid,
  p_user_id uuid,
  p_stripe_event_id text,
  p_stripe_session_id text,
  p_stripe_payment_intent_id text,
  p_livemode boolean,
  p_pack_id text,
  p_gross_amount_micros bigint,
  p_currency text,
  p_credit_units bigint,
  p_received_at timestamptz,
  p_metadata_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_mode text := case when coalesce(p_livemode, false) then 'live' else 'test' end;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_event_id text := nullif(btrim(coalesce(p_stripe_event_id, '')), '');
  v_session_id text := nullif(btrim(coalesce(p_stripe_session_id, '')), '');
  v_payment_intent text := nullif(btrim(coalesce(p_stripe_payment_intent_id, '')), '');
  v_pack text := nullif(btrim(coalesce(p_pack_id, '')), '');
  v_payload jsonb;
  v_existing tongs.customer_deposits%rowtype;
  v_created boolean;
begin
  perform tongs._require_accounting_service_role();
  if p_deposit_id is null or p_user_id is null or v_event_id is null or v_session_id is null
     or v_pack is null or p_gross_amount_micros <= 0 or p_credit_units <= 0
     or v_currency !~ '^[A-Z]{3}$' or jsonb_typeof(coalesce(p_metadata_json, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid customer deposit' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_mode || ':deposit:' || v_event_id || ':' || v_session_id, 0));
  select * into v_existing
  from tongs.customer_deposits deposit
  where (deposit.stripe_mode = v_mode and deposit.stripe_event_id = v_event_id)
     or (deposit.stripe_mode = v_mode and deposit.stripe_session_id = v_session_id)
     or (v_payment_intent is not null and deposit.stripe_mode = v_mode and deposit.stripe_payment_intent_id = v_payment_intent)
  limit 1;
  if found then
    if v_existing.user_id <> p_user_id
       or v_existing.stripe_event_id <> v_event_id or v_existing.stripe_session_id <> v_session_id
       or v_existing.stripe_payment_intent_id is distinct from v_payment_intent
       or v_existing.pack_id <> v_pack or v_existing.currency <> v_currency
       or v_existing.gross_amount_micros <> p_gross_amount_micros
       or v_existing.credit_units <> p_credit_units then
      raise exception 'customer deposit replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('deposit_id', v_existing.id, 'stripe_mode', v_existing.stripe_mode, 'replay', true);
  end if;

  v_payload := jsonb_build_object(
    'deposit_id', p_deposit_id, 'user_id', p_user_id, 'stripe_event_id', v_event_id,
    'stripe_session_id', v_session_id, 'stripe_payment_intent_id', v_payment_intent,
    'stripe_mode', v_mode, 'pack_id', v_pack, 'gross_amount_micros', p_gross_amount_micros,
    'currency', v_currency, 'credit_units', p_credit_units, 'metadata', coalesce(p_metadata_json, '{}'::jsonb)
  );
  v_created := tongs._create_accounting_event(
    p_deposit_id, 'stripe:' || v_mode || ':deposit:' || v_event_id, 'customer_deposit_received',
    v_mode, 'stripe_checkout_session', v_session_id, v_currency, p_user_id, null, null,
    v_payload, coalesce(p_received_at, now())
  );
  if not v_created then raise exception 'deposit event exists without deposit record' using errcode = '23514'; end if;

  insert into tongs.customer_deposits(
    id, user_id, stripe_mode, stripe_event_id, stripe_session_id, stripe_payment_intent_id,
    pack_id, currency, gross_amount_micros, credit_units, journal_event_id, metadata_json, received_at
  ) values (
    p_deposit_id, p_user_id, v_mode, v_event_id, v_session_id, v_payment_intent,
    v_pack, v_currency, p_gross_amount_micros, p_credit_units, p_deposit_id,
    coalesce(p_metadata_json, '{}'::jsonb), coalesce(p_received_at, now())
  ) returning * into v_existing;

  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, deposit_id, currency, amount_micros
  ) values
    (p_deposit_id, 1, case when v_mode = 'live' then 'forge_cash_clearing' else 'test_cash_clearing' end,
      p_user_id, p_deposit_id, v_currency, p_gross_amount_micros),
    (p_deposit_id, 2, case when v_mode = 'live' then 'customer_prepaid_liability' else 'test_customer_prepaid_balance' end,
      p_user_id, p_deposit_id, v_currency, -p_gross_amount_micros);
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, deposit_id, unit_kind, quantity_delta
  ) values (
    p_deposit_id, 3, case when v_mode = 'live' then 'live_customer_credits' else 'test_customer_credits' end,
    p_user_id, p_deposit_id, 'forge_credit', p_credit_units
  );
  perform tongs._assert_accounting_event_balanced(p_deposit_id);
  return jsonb_build_object('deposit_id', p_deposit_id, 'stripe_mode', v_mode, 'replay', false);
end;
$$;

create or replace function tongs.record_customer_deposit_processor_fee(
  p_fee_id uuid,
  p_deposit_id uuid,
  p_provider_fee_reference text,
  p_fee_amount_micros bigint,
  p_recorded_at timestamptz,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_deposit tongs.customer_deposits%rowtype;
  v_existing tongs.customer_deposit_processor_fees%rowtype;
  v_reference text := nullif(btrim(coalesce(p_provider_fee_reference, '')), '');
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_fee_id is null or p_deposit_id is null or v_reference is null or p_fee_amount_micros < 0 then
    raise exception 'invalid processor fee' using errcode = '22023';
  end if;
  select * into v_deposit from tongs.customer_deposits where id = p_deposit_id for update;
  if not found then raise exception 'deposit not found' using errcode = 'P0002'; end if;
  select * into v_existing from tongs.customer_deposit_processor_fees
  where deposit_id = p_deposit_id or provider_fee_reference = v_reference limit 1;
  if found then
    if v_existing.deposit_id <> p_deposit_id
       or v_existing.provider_fee_reference <> v_reference or v_existing.fee_amount_micros <> p_fee_amount_micros then
      raise exception 'processor fee replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('processor_fee_id', v_existing.id, 'replay', true);
  end if;
  if p_fee_amount_micros > v_deposit.gross_amount_micros then
    raise exception 'processor fee exceeds deposit' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('fee_id', p_fee_id, 'deposit_id', p_deposit_id,
    'provider_fee_reference', v_reference, 'fee_amount_micros', p_fee_amount_micros,
    'evidence', coalesce(p_evidence_json, '{}'::jsonb));
  perform tongs._create_accounting_event(
    p_fee_id, 'stripe:' || v_deposit.stripe_mode || ':processor-fee:' || v_reference,
    'deposit_processor_fee_recorded', v_deposit.stripe_mode, 'stripe_balance_transaction',
    v_reference, v_deposit.currency, v_deposit.user_id, null, null, v_payload, coalesce(p_recorded_at, now())
  );
  insert into tongs.customer_deposit_processor_fees(
    id, deposit_id, provider_fee_reference, fee_amount_micros, journal_event_id, evidence_json, recorded_at
  ) values (p_fee_id, p_deposit_id, v_reference, p_fee_amount_micros, p_fee_id,
    coalesce(p_evidence_json, '{}'::jsonb), coalesce(p_recorded_at, now())) returning * into v_existing;
  if p_fee_amount_micros > 0 then
    insert into tongs.accounting_journal_entries(
      event_id, line_number, account_code, user_id, deposit_id, currency, amount_micros
    ) values
      (p_fee_id, 1, case when v_deposit.stripe_mode='live' then 'processor_fee_expense' else 'test_processor_fee' end,
        v_deposit.user_id, p_deposit_id, v_deposit.currency, p_fee_amount_micros),
      (p_fee_id, 2, case when v_deposit.stripe_mode='live' then 'forge_cash_clearing' else 'test_cash_clearing' end,
        v_deposit.user_id, p_deposit_id, v_deposit.currency, -p_fee_amount_micros);
    perform tongs._assert_accounting_event_balanced(p_fee_id);
  end if;
  return jsonb_build_object('processor_fee_id', p_fee_id, 'replay', false);
end;
$$;

create or replace function tongs.consume_customer_deposit(
  p_consumption_id uuid,
  p_deposit_id uuid,
  p_allocation_key text,
  p_operation_id text,
  p_revenue_micros bigint,
  p_credit_units bigint,
  p_consumed_at timestamptz,
  p_metadata_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_deposit tongs.customer_deposits%rowtype;
  v_existing tongs.customer_deposit_consumptions%rowtype;
  v_key text := nullif(btrim(coalesce(p_allocation_key, '')), '');
  v_operation text := nullif(btrim(coalesce(p_operation_id, '')), '');
  v_consumed_micros bigint;
  v_consumed_units bigint;
  v_refund_liability bigint;
  v_refunded_units bigint;
  v_fee bigint;
  v_prior_fee_allocated bigint;
  v_fee_allocation bigint;
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_consumption_id is null or p_deposit_id is null or v_key is null or v_operation is null
     or p_revenue_micros <= 0 or p_credit_units <= 0 then
    raise exception 'invalid deposit consumption' using errcode = '22023';
  end if;
  select * into v_deposit from tongs.customer_deposits where id = p_deposit_id for update;
  if not found then raise exception 'deposit not found' using errcode = 'P0002'; end if;
  if v_deposit.stripe_mode <> 'live' then
    raise exception 'test deposits cannot fund live customer consumption' using errcode = '42501';
  end if;
  select * into v_existing from tongs.customer_deposit_consumptions
  where allocation_key = v_key or (deposit_id = p_deposit_id and operation_id = v_operation) limit 1;
  if found then
    if v_existing.deposit_id <> p_deposit_id
       or v_existing.allocation_key <> v_key or v_existing.operation_id <> v_operation
       or v_existing.recognized_revenue_micros <> p_revenue_micros
       or v_existing.credit_units_consumed <> p_credit_units then
      raise exception 'deposit consumption replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('consumption_id', v_existing.id, 'replay', true);
  end if;
  select fee.fee_amount_micros into v_fee from tongs.customer_deposit_processor_fees fee where fee.deposit_id = p_deposit_id;
  if not found then
    raise exception 'processor fee must be finalized before consumption' using errcode = 'P0001';
  end if;
  select coalesce(sum(recognized_revenue_micros),0), coalesce(sum(credit_units_consumed),0),
         coalesce(sum(allocated_processor_fee_micros),0)
    into v_consumed_micros, v_consumed_units, v_prior_fee_allocated
  from tongs.customer_deposit_consumptions where deposit_id = p_deposit_id;
  select coalesce(sum(liability_release_micros),0), coalesce(sum(refunded_credit_units),0)
    into v_refund_liability, v_refunded_units
  from tongs.customer_deposit_refunds where deposit_id = p_deposit_id;
  if p_revenue_micros > v_deposit.gross_amount_micros - v_consumed_micros - v_refund_liability
     or p_credit_units > v_deposit.credit_units - v_consumed_units - v_refunded_units then
    raise exception 'insufficient verified deposit balance' using errcode = 'P0001';
  end if;
  v_fee_allocation := (v_fee * (v_consumed_micros + p_revenue_micros) / v_deposit.gross_amount_micros) - v_prior_fee_allocated;
  v_payload := jsonb_build_object('consumption_id', p_consumption_id, 'deposit_id', p_deposit_id,
    'allocation_key', v_key, 'operation_id', v_operation, 'recognized_revenue_micros', p_revenue_micros,
    'credit_units_consumed', p_credit_units, 'allocated_processor_fee_micros', v_fee_allocation,
    'metadata', coalesce(p_metadata_json, '{}'::jsonb));
  perform tongs._create_accounting_event(
    p_consumption_id, 'deposit-consumption:' || v_key, 'customer_deposit_consumed', 'live',
    'forge_operation', v_operation, v_deposit.currency, v_deposit.user_id, null, null,
    v_payload, coalesce(p_consumed_at, now())
  );
  insert into tongs.customer_deposit_consumptions(
    id, deposit_id, user_id, allocation_key, operation_id, recognized_revenue_micros,
    credit_units_consumed, allocated_processor_fee_micros, journal_event_id, metadata_json, consumed_at
  ) values (
    p_consumption_id, p_deposit_id, v_deposit.user_id, v_key, v_operation, p_revenue_micros,
    p_credit_units, v_fee_allocation, p_consumption_id, coalesce(p_metadata_json, '{}'::jsonb), coalesce(p_consumed_at, now())
  ) returning * into v_existing;
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, deposit_id, currency, amount_micros
  ) values
    (p_consumption_id, 1, 'customer_prepaid_liability', v_deposit.user_id, p_deposit_id, v_deposit.currency, p_revenue_micros),
    (p_consumption_id, 2, 'service_revenue', v_deposit.user_id, p_deposit_id, v_deposit.currency, -p_revenue_micros);
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, deposit_id, unit_kind, quantity_delta
  ) values (p_consumption_id, 3, 'live_customer_credits', v_deposit.user_id, p_deposit_id, 'forge_credit', -p_credit_units);
  perform tongs._assert_accounting_event_balanced(p_consumption_id);
  return jsonb_build_object('consumption_id', p_consumption_id, 'replay', false,
    'allocated_processor_fee_micros', v_fee_allocation);
end;
$$;

create or replace function tongs.record_subscription_cycle_adjustment(
  p_adjustment_id uuid,
  p_receipt_id uuid,
  p_provider_object_id text,
  p_stripe_event_id text,
  p_adjustment_type text,
  p_amount_micros bigint,
  p_adjusted_at timestamptz,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_receipt tongs.subscription_cycle_receipts%rowtype;
  v_existing tongs.subscription_cycle_adjustments%rowtype;
  v_object text := nullif(btrim(coalesce(p_provider_object_id, '')), '');
  v_event text := nullif(btrim(coalesce(p_stripe_event_id, '')), '');
  v_prior_adjustments bigint;
  v_allocated bigint;
  v_liability_available bigint;
  v_liability_release bigint;
  v_discrepancy bigint;
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_adjustment_id is null or p_receipt_id is null or v_object is null or v_event is null
     or p_adjustment_type not in ('refund', 'dispute', 'payment_reversal') or p_amount_micros <= 0 then
    raise exception 'invalid subscription cycle adjustment' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe-adjustment:' || v_object, 0));
  select * into v_existing from tongs.subscription_cycle_adjustments where provider_object_id = v_object;
  if found then
    if v_existing.receipt_id <> p_receipt_id or v_existing.adjustment_type <> p_adjustment_type
       or v_existing.amount_micros <> p_amount_micros then
      raise exception 'subscription adjustment replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('adjustment_id', v_existing.id, 'replay', true);
  end if;
  select * into v_receipt from tongs.subscription_cycle_receipts where id = p_receipt_id for update;
  if not found then raise exception 'subscription cycle receipt not found' using errcode = 'P0002'; end if;
  select coalesce(sum(amount_micros), 0), coalesce(sum(liability_release_micros), 0)
    into v_prior_adjustments, v_liability_available
  from tongs.subscription_cycle_adjustments where receipt_id = p_receipt_id;
  if p_amount_micros > v_receipt.gross_amount_micros - v_prior_adjustments then
    raise exception 'adjustment exceeds subscription receipt' using errcode = 'P0001';
  end if;
  select coalesce(sum(allocated_revenue_micros), 0) into v_allocated
  from tongs.paid_allowance_grants where receipt_id = p_receipt_id;
  v_liability_available := greatest(v_receipt.gross_amount_micros - v_allocated - v_liability_available, 0);
  v_liability_release := least(p_amount_micros, v_liability_available);
  v_discrepancy := p_amount_micros - v_liability_release;
  v_payload := jsonb_build_object('adjustment_id', p_adjustment_id, 'receipt_id', p_receipt_id,
    'provider_object_id', v_object, 'stripe_event_id', v_event, 'adjustment_type', p_adjustment_type,
    'amount_micros', p_amount_micros, 'liability_release_micros', v_liability_release,
    'discrepancy_expense_micros', v_discrepancy, 'evidence', coalesce(p_evidence_json, '{}'::jsonb));
  perform tongs._create_accounting_event(
    p_adjustment_id, 'stripe:' || v_receipt.stripe_mode || ':subscription-adjustment:' || v_object,
    'subscription_cycle_' || p_adjustment_type, v_receipt.stripe_mode, 'stripe_adjustment', v_object,
    v_receipt.currency, v_receipt.user_id, null, null, v_payload, coalesce(p_adjusted_at, now())
  );
  insert into tongs.subscription_cycle_adjustments(
    id, receipt_id, provider_object_id, stripe_event_id, adjustment_type, amount_micros,
    liability_release_micros, discrepancy_expense_micros, journal_event_id, evidence_json, adjusted_at
  ) values (
    p_adjustment_id, p_receipt_id, v_object, v_event, p_adjustment_type, p_amount_micros,
    v_liability_release, v_discrepancy, p_adjustment_id, coalesce(p_evidence_json, '{}'::jsonb), coalesce(p_adjusted_at, now())
  );
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, currency, amount_micros
  )
  select p_adjustment_id, line_number, account_code, v_receipt.user_id,
    v_receipt.currency, amount_micros
  from (values
    (1::smallint, case when v_receipt.stripe_mode = 'live' then 'subscription_deferred_liability' else 'test_subscription_balance' end, v_liability_release),
    (2::smallint, case when v_receipt.stripe_mode = 'live' then 'subscription_adjustment_discrepancy_expense' else 'test_subscription_discrepancy' end, v_discrepancy),
    (3::smallint, case when v_receipt.stripe_mode = 'live' then 'forge_cash_clearing' else 'test_cash_clearing' end, -p_amount_micros)
  ) lines(line_number, account_code, amount_micros)
  where amount_micros <> 0;
  perform tongs._assert_accounting_event_balanced(p_adjustment_id);
  return jsonb_build_object('adjustment_id', p_adjustment_id, 'replay', false,
    'liability_release_micros', v_liability_release, 'discrepancy_expense_micros', v_discrepancy);
end;
$$;

create or replace function tongs.record_stripe_adjustment_accounting(
  p_record_id uuid,
  p_stripe_refund_id text,
  p_stripe_event_id text,
  p_stripe_payment_intent_id text,
  p_adjustment_type text,
  p_livemode boolean,
  p_amount_micros bigint,
  p_currency text,
  p_recorded_at timestamptz,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_mode text := case when coalesce(p_livemode, false) then 'live' else 'test' end;
  v_payment_intent text := nullif(btrim(coalesce(p_stripe_payment_intent_id, '')), '');
  v_refund text := nullif(btrim(coalesce(p_stripe_refund_id, '')), '');
  v_deposit tongs.customer_deposits%rowtype;
  v_receipt tongs.subscription_cycle_receipts%rowtype;
  v_unmatched tongs.accounting_unmatched_provider_events%rowtype;
begin
  perform tongs._require_accounting_service_role();
  if p_record_id is null or v_payment_intent is null or v_refund is null
     or nullif(btrim(coalesce(p_stripe_event_id, '')), '') is null or p_amount_micros <= 0
     or upper(btrim(coalesce(p_currency, ''))) !~ '^[A-Z]{3}$'
     or p_adjustment_type not in ('refund', 'dispute', 'payment_reversal') then
    raise exception 'invalid Stripe refund accounting event' using errcode = '22023';
  end if;
  select * into v_deposit from tongs.customer_deposits
   where stripe_mode = v_mode and stripe_payment_intent_id = v_payment_intent;
  if found then
    if v_deposit.currency <> upper(btrim(p_currency)) then
      raise exception 'Stripe adjustment currency does not match deposit' using errcode = '22023';
    end if;
    return tongs.record_customer_deposit_refund(p_record_id, v_deposit.id, v_refund,
      p_stripe_event_id, p_adjustment_type, p_amount_micros, p_recorded_at, p_evidence_json);
  end if;
  select * into v_receipt from tongs.subscription_cycle_receipts
   where stripe_mode = v_mode and stripe_payment_intent_id = v_payment_intent
   order by received_at desc limit 1;
  if found then
    if v_receipt.currency <> upper(btrim(p_currency)) then
      raise exception 'Stripe adjustment currency does not match subscription receipt' using errcode = '22023';
    end if;
    return tongs.record_subscription_cycle_adjustment(p_record_id, v_receipt.id, v_refund,
      p_stripe_event_id, p_adjustment_type, p_amount_micros, p_recorded_at, p_evidence_json);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe-unmatched:' || v_refund, 0));
  select * into v_unmatched from tongs.accounting_unmatched_provider_events
  where provider = 'stripe' and provider_object_id = v_refund;
  if found then
    if v_unmatched.stripe_mode <> v_mode or v_unmatched.amount_micros <> p_amount_micros
       or v_unmatched.currency <> upper(btrim(p_currency)) or v_unmatched.event_type <> p_adjustment_type then
      raise exception 'unmatched Stripe adjustment replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('unmatched', true, 'record_id', v_unmatched.id, 'replay', true);
  end if;
  insert into tongs.accounting_unmatched_provider_events(
    id, provider, provider_event_id, provider_object_id, event_type, stripe_mode,
    amount_micros, currency, evidence_json
  ) values (
    p_record_id, 'stripe', btrim(p_stripe_event_id), v_refund, p_adjustment_type, v_mode,
    p_amount_micros, upper(btrim(p_currency)), coalesce(p_evidence_json, '{}'::jsonb)
  );
  return jsonb_build_object('unmatched', true, 'record_id', p_record_id, 'replay', false);
end;
$$;

create or replace function tongs.create_paid_allowance_grant(
  p_grant_id uuid,
  p_receipt_id uuid,
  p_entitlement_units bigint,
  p_allocated_revenue_micros bigint,
  p_maximum_wholesale_spend_micros bigint,
  p_allocation_policy_revision text,
  p_granted_at timestamptz,
  p_metadata_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_receipt tongs.subscription_cycle_receipts%rowtype;
  v_existing tongs.paid_allowance_grants%rowtype;
  v_policy text := nullif(btrim(coalesce(p_allocation_policy_revision, '')), '');
  v_allocated bigint;
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_grant_id is null or p_receipt_id is null or p_entitlement_units <= 0
     or p_allocated_revenue_micros <= 0 or p_maximum_wholesale_spend_micros <= 0
     or p_maximum_wholesale_spend_micros > p_allocated_revenue_micros or v_policy is null then
    raise exception 'invalid paid allowance grant' using errcode = '22023';
  end if;
  select * into v_receipt from tongs.subscription_cycle_receipts where id = p_receipt_id for update;
  if not found then raise exception 'subscription cycle receipt not found' using errcode = 'P0002'; end if;
  if v_receipt.stripe_mode <> 'live' then
    raise exception 'test subscription receipt cannot back a live allowance' using errcode = '42501';
  end if;
  if exists (select 1 from tongs.subscription_cycle_adjustments where receipt_id = p_receipt_id) then
    raise exception 'adjusted subscription receipt cannot back a new allowance' using errcode = 'P0001';
  end if;
  select * into v_existing from tongs.paid_allowance_grants
   where receipt_id = p_receipt_id and allocation_policy_revision = v_policy;
  if found then
    if v_existing.entitlement_units <> p_entitlement_units
       or v_existing.allocated_revenue_micros <> p_allocated_revenue_micros
       or v_existing.maximum_wholesale_spend_micros <> p_maximum_wholesale_spend_micros then
      raise exception 'allowance grant replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('grant_id', v_existing.id, 'replay', true);
  end if;
  select coalesce(sum(allocated_revenue_micros), 0) into v_allocated
  from tongs.paid_allowance_grants where receipt_id = p_receipt_id;
  if p_allocated_revenue_micros > v_receipt.gross_amount_micros - v_allocated then
    raise exception 'allowance allocation exceeds paid cycle backing' using errcode = 'P0001';
  end if;
  v_payload := jsonb_build_object('grant_id', p_grant_id, 'receipt_id', p_receipt_id,
    'entitlement_units', p_entitlement_units, 'allocated_revenue_micros', p_allocated_revenue_micros,
    'maximum_wholesale_spend_micros', p_maximum_wholesale_spend_micros,
    'allocation_policy_revision', v_policy, 'metadata', coalesce(p_metadata_json, '{}'::jsonb));
  perform tongs._create_accounting_event(
    p_grant_id, 'allowance:' || p_receipt_id::text || ':' || v_policy, 'paid_allowance_granted',
    'live', 'subscription_cycle_receipt', p_receipt_id::text, v_receipt.currency,
    v_receipt.user_id, null, null, v_payload, coalesce(p_granted_at, now())
  );
  insert into tongs.paid_allowance_grants(
    id, receipt_id, user_id, stripe_subscription_id, plan_item_id, period_start, period_end,
    entitlement_units, allocated_revenue_micros, maximum_wholesale_spend_micros, currency,
    allocation_policy_revision, journal_event_id, metadata_json, granted_at
  ) values (
    p_grant_id, p_receipt_id, v_receipt.user_id, v_receipt.stripe_subscription_id, v_receipt.plan_item_id,
    v_receipt.period_start, v_receipt.period_end, p_entitlement_units, p_allocated_revenue_micros,
    p_maximum_wholesale_spend_micros, v_receipt.currency, v_policy, p_grant_id,
    coalesce(p_metadata_json, '{}'::jsonb), coalesce(p_granted_at, now())
  );
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, allowance_grant_id, currency, amount_micros
  ) values
    (p_grant_id, 1, 'subscription_deferred_liability', v_receipt.user_id, p_grant_id, v_receipt.currency, p_allocated_revenue_micros),
    (p_grant_id, 2, 'allowance_deferred_liability', v_receipt.user_id, p_grant_id, v_receipt.currency, -p_allocated_revenue_micros);
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, allowance_grant_id, unit_kind, quantity_delta
  ) values
    (p_grant_id, 3, 'allowance_entitlement_units', v_receipt.user_id, p_grant_id, 'forge_credit', p_entitlement_units),
    (p_grant_id, 4, 'allowance_wholesale_capacity_micros', v_receipt.user_id, p_grant_id,
      lower(v_receipt.currency) || '_micros', p_maximum_wholesale_spend_micros);
  perform tongs._assert_accounting_event_balanced(p_grant_id);
  return jsonb_build_object('grant_id', p_grant_id, 'replay', false);
end;
$$;

create or replace function tongs.consume_paid_allowance(
  p_consumption_id uuid,
  p_allowance_grant_id uuid,
  p_allocation_key text,
  p_operation_id text,
  p_entitlement_units bigint,
  p_recognized_revenue_micros bigint,
  p_wholesale_spend_micros bigint,
  p_consumed_at timestamptz,
  p_metadata_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_grant tongs.paid_allowance_grants%rowtype;
  v_existing tongs.paid_allowance_consumptions%rowtype;
  v_key text := nullif(btrim(coalesce(p_allocation_key, '')), '');
  v_operation text := nullif(btrim(coalesce(p_operation_id, '')), '');
  v_used_units bigint;
  v_used_revenue bigint;
  v_used_spend bigint;
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_consumption_id is null or p_allowance_grant_id is null or v_key is null or v_operation is null
     or p_entitlement_units <= 0 or p_recognized_revenue_micros <= 0 or p_wholesale_spend_micros < 0 then
    raise exception 'invalid paid allowance consumption' using errcode = '22023';
  end if;
  select * into v_grant from tongs.paid_allowance_grants where id = p_allowance_grant_id for update;
  if not found then raise exception 'paid allowance grant not found' using errcode = 'P0002'; end if;
  if now() < v_grant.period_start or now() >= v_grant.period_end then
    raise exception 'paid allowance is outside its funded period' using errcode = 'P0001';
  end if;
  if exists (select 1 from tongs.subscription_cycle_adjustments where receipt_id = v_grant.receipt_id) then
    raise exception 'adjusted subscription cycle cannot fund new consumption' using errcode = 'P0001';
  end if;
  select * into v_existing from tongs.paid_allowance_consumptions
   where allocation_key = v_key or (allowance_grant_id = p_allowance_grant_id and operation_id = v_operation)
   limit 1;
  if found then
    if v_existing.allowance_grant_id <> p_allowance_grant_id
       or v_existing.allocation_key <> v_key or v_existing.operation_id <> v_operation
       or v_existing.entitlement_units_consumed <> p_entitlement_units
       or v_existing.recognized_revenue_micros <> p_recognized_revenue_micros
       or v_existing.wholesale_spend_micros <> p_wholesale_spend_micros then
      raise exception 'allowance consumption replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('consumption_id', v_existing.id, 'replay', true);
  end if;
  select coalesce(sum(entitlement_units_consumed), 0), coalesce(sum(recognized_revenue_micros), 0),
    coalesce(sum(wholesale_spend_micros), 0)
  into v_used_units, v_used_revenue, v_used_spend
  from tongs.paid_allowance_consumptions where allowance_grant_id = p_allowance_grant_id;
  if p_entitlement_units > v_grant.entitlement_units - v_used_units
     or p_recognized_revenue_micros > v_grant.allocated_revenue_micros - v_used_revenue
     or p_wholesale_spend_micros > v_grant.maximum_wholesale_spend_micros - v_used_spend then
    raise exception 'insufficient funded allowance balance' using errcode = 'P0001';
  end if;
  v_payload := jsonb_build_object('consumption_id', p_consumption_id,
    'allowance_grant_id', p_allowance_grant_id, 'allocation_key', v_key,
    'operation_id', v_operation, 'entitlement_units_consumed', p_entitlement_units,
    'recognized_revenue_micros', p_recognized_revenue_micros,
    'wholesale_spend_micros', p_wholesale_spend_micros,
    'metadata', coalesce(p_metadata_json, '{}'::jsonb));
  perform tongs._create_accounting_event(
    p_consumption_id, 'allowance-consumption:' || v_key, 'paid_allowance_consumed',
    'live', 'forge_operation', v_operation, v_grant.currency, v_grant.user_id,
    null, null, v_payload, coalesce(p_consumed_at, now())
  );
  insert into tongs.paid_allowance_consumptions(
    id, allowance_grant_id, user_id, allocation_key, operation_id,
    entitlement_units_consumed, recognized_revenue_micros, wholesale_spend_micros,
    journal_event_id, metadata_json, consumed_at
  ) values (
    p_consumption_id, p_allowance_grant_id, v_grant.user_id, v_key, v_operation,
    p_entitlement_units, p_recognized_revenue_micros, p_wholesale_spend_micros,
    p_consumption_id, coalesce(p_metadata_json, '{}'::jsonb), coalesce(p_consumed_at, now())
  );
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, allowance_grant_id, currency, amount_micros
  ) values
    (p_consumption_id, 1, 'allowance_deferred_liability', v_grant.user_id,
      p_allowance_grant_id, v_grant.currency, p_recognized_revenue_micros),
    (p_consumption_id, 2, 'service_revenue', v_grant.user_id,
      p_allowance_grant_id, v_grant.currency, -p_recognized_revenue_micros);
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, allowance_grant_id, unit_kind, quantity_delta
  ) values
    (p_consumption_id, 3, 'allowance_entitlement_units', v_grant.user_id,
      p_allowance_grant_id, 'forge_credit', -p_entitlement_units);
  if p_wholesale_spend_micros > 0 then
    insert into tongs.accounting_journal_entries(
      event_id, line_number, account_code, user_id, allowance_grant_id, unit_kind, quantity_delta
    ) values (p_consumption_id, 4, 'allowance_wholesale_capacity_micros', v_grant.user_id,
      p_allowance_grant_id, lower(v_grant.currency) || '_micros', -p_wholesale_spend_micros);
  end if;
  perform tongs._assert_accounting_event_balanced(p_consumption_id);
  return jsonb_build_object('consumption_id', p_consumption_id, 'replay', false,
    'remaining_entitlement_units', v_grant.entitlement_units - v_used_units - p_entitlement_units,
    'remaining_revenue_micros', v_grant.allocated_revenue_micros - v_used_revenue - p_recognized_revenue_micros,
    'remaining_wholesale_spend_micros', v_grant.maximum_wholesale_spend_micros - v_used_spend - p_wholesale_spend_micros);
end;
$$;

create or replace function tongs.create_owner_operating_budget_draft(
  p_budget_id uuid,
  p_environment text,
  p_workspace_id uuid,
  p_provider text,
  p_route text,
  p_sku text,
  p_currency text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_event_id uuid := gen_random_uuid();
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payload jsonb;
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  if p_budget_id is null or p_environment not in ('production', 'preview', 'development')
     or v_currency !~ '^[A-Z]{3}$' or p_period_start is null or p_period_end <= p_period_start
     or v_reason is null then
    raise exception 'invalid owner operating budget draft' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('budget_id', p_budget_id, 'environment', p_environment,
    'workspace_id', p_workspace_id, 'provider', nullif(btrim(coalesce(p_provider, '')), ''),
    'route', nullif(btrim(coalesce(p_route, '')), ''), 'sku', nullif(btrim(coalesce(p_sku, '')), ''),
    'currency', v_currency, 'period_start', p_period_start, 'period_end', p_period_end,
    'status', 'draft', 'maximum_amount_micros', null, 'reason', v_reason);
  perform tongs._create_accounting_event(
    v_event_id, 'owner-budget:' || p_budget_id::text || ':revision:1', 'owner_operating_budget_drafted',
    'owner_internal', 'owner_operating_budget', p_budget_id::text, v_currency, null,
    p_workspace_id, v_actor, v_payload, now()
  );
  insert into tongs.owner_operating_budgets(
    id, environment, workspace_id, provider, route, sku, currency, period_start, period_end, created_by
  ) values (
    p_budget_id, p_environment, p_workspace_id, nullif(btrim(coalesce(p_provider, '')), ''),
    nullif(btrim(coalesce(p_route, '')), ''), nullif(btrim(coalesce(p_sku, '')), ''),
    v_currency, p_period_start, p_period_end, v_actor
  );
  insert into tongs.owner_operating_budget_revisions(
    budget_id, revision, status, maximum_amount_micros, reason, actor_id, journal_event_id
  ) values (p_budget_id, 1, 'draft', null, v_reason, v_actor, v_event_id);
  return jsonb_build_object('budget_id', p_budget_id, 'revision', 1, 'status', 'draft',
    'maximum_amount_micros', null, 'spending_enabled', false);
end;
$$;

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
  if p_budget_id is null or p_status not in ('draft', 'paused', 'closed')
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

-- Capture the pre-foundation mixed balance as evidence only. It is deliberately
-- excluded from every live-funding account and cannot be upgraded implicitly.
do $$
declare
  v_credit record;
  v_event_id uuid;
  v_payload jsonb;
begin
  for v_credit in select user_id, token_balance from tongs.ai_credits loop
    v_event_id := (
      substr(md5('legacy-ai-credit:' || v_credit.user_id::text), 1, 8) || '-' ||
      substr(md5('legacy-ai-credit:' || v_credit.user_id::text), 9, 4) || '-4' ||
      substr(md5('legacy-ai-credit:' || v_credit.user_id::text), 14, 3) || '-a' ||
      substr(md5('legacy-ai-credit:' || v_credit.user_id::text), 18, 3) || '-' ||
      substr(md5('legacy-ai-credit:' || v_credit.user_id::text), 21, 12)
    )::uuid;
    v_payload := jsonb_build_object('user_id', v_credit.user_id, 'credit_units', v_credit.token_balance,
      'source_relation', 'tongs.ai_credits', 'eligible_for_live_funding', false);
    perform tongs._create_accounting_event(
      v_event_id, 'legacy-ai-credit:' || v_credit.user_id::text, 'legacy_credit_opening_balance_captured',
      'legacy_unverified', 'tongs.ai_credits', v_credit.user_id::text, null,
      v_credit.user_id, null, null, v_payload, now()
    );
    insert into tongs.legacy_credit_opening_balances(
      user_id, credit_units, eligible_for_live_funding, journal_event_id, captured_at
    ) values (v_credit.user_id, v_credit.token_balance, false, v_event_id, now());
    if v_credit.token_balance > 0 then
      insert into tongs.accounting_journal_entries(
        event_id, line_number, account_code, user_id, unit_kind, quantity_delta
      ) values (v_event_id, 1, 'legacy_unverified_credits', v_credit.user_id,
        'forge_credit', v_credit.token_balance);
    end if;
  end loop;
end;
$$;

create or replace function tongs.read_my_accounting_balances()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_live_credits bigint;
  v_test_credits bigint;
  v_legacy_credits bigint;
  v_allowance_units bigint;
  v_liabilities jsonb;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select coalesce(sum(quantity_delta) filter (where account_code = 'live_customer_credits'), 0),
         coalesce(sum(quantity_delta) filter (where account_code = 'test_customer_credits'), 0),
         coalesce(sum(quantity_delta) filter (where account_code = 'legacy_unverified_credits'), 0),
         coalesce(sum(quantity_delta) filter (where account_code = 'allowance_entitlement_units'), 0)
    into v_live_credits, v_test_credits, v_legacy_credits, v_allowance_units
  from tongs.accounting_journal_entries where user_id = v_user;
  select coalesce(jsonb_agg(jsonb_build_object('currency', currency,
    'prepaid_balance_micros', prepaid_balance_micros, 'allowance_backing_micros', allowance_backing_micros)
    order by currency), '[]'::jsonb) into v_liabilities
  from (
    select currency,
      -coalesce(sum(amount_micros) filter (where account_code = 'customer_prepaid_liability'), 0) as prepaid_balance_micros,
      -coalesce(sum(amount_micros) filter (where account_code = 'allowance_deferred_liability'), 0) as allowance_backing_micros
    from tongs.accounting_journal_entries
    where user_id = v_user and account_code in ('customer_prepaid_liability', 'allowance_deferred_liability')
    group by currency
  ) balances;
  return jsonb_build_object('live', jsonb_build_object('credit_units', v_live_credits,
      'currency_balances', v_liabilities, 'eligible_for_live_funding', true),
    'test', jsonb_build_object('credit_units', v_test_credits, 'eligible_for_live_funding', false),
    'legacy_unverified', jsonb_build_object('credit_units', v_legacy_credits, 'eligible_for_live_funding', false),
    'paid_allowance', jsonb_build_object('entitlement_units', v_allowance_units,
      'execution_enforcement_active', false));
end;
$$;

create or replace function tongs.read_owner_accounting_foundation(
  p_user_id uuid default null,
  p_limit integer default 250
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 250), 1), 2000);
  v_events jsonb;
  v_budgets jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.occurred_at desc), '[]'::jsonb)
    into v_events
  from (
    select e.id, e.event_type, e.environment, e.source_type, e.source_id, e.currency,
      e.user_id, e.workspace_id, e.occurred_at, e.created_at, e.metadata_json,
      coalesce((select sum(j.amount_micros) from tongs.accounting_journal_entries j
        where j.event_id = e.id), 0) as monetary_imbalance_micros
    from tongs.accounting_journal_events e
    where p_user_id is null or e.user_id = p_user_id
    order by e.occurred_at desc limit v_limit
  ) event_row;
  select coalesce(jsonb_agg(to_jsonb(budget_row) order by budget_row.created_at desc), '[]'::jsonb)
    into v_budgets
  from (
    select b.*, revision.revision, revision.status, revision.maximum_amount_micros,
      revision.reason, revision.created_at as revision_created_at
    from tongs.owner_operating_budgets b
    join lateral (
      select r.revision, r.status, r.maximum_amount_micros, r.reason, r.created_at
      from tongs.owner_operating_budget_revisions r where r.budget_id = b.id
      order by r.revision desc limit 1
    ) revision on true
  ) budget_row;
  return jsonb_build_object('events', v_events, 'owner_operating_budgets', v_budgets,
    'spending_gate_active', false);
end;
$$;

create or replace function tongs.verify_accounting_reconstruction()
returns table(event_id uuid, currency text, imbalance_micros bigint)
language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_actor uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  return query
  select entry.event_id, entry.currency, sum(entry.amount_micros)::bigint
  from tongs.accounting_journal_entries entry where entry.amount_micros <> 0
  group by entry.event_id, entry.currency having sum(entry.amount_micros) <> 0;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'accounting_journal_events', 'accounting_journal_entries', 'customer_deposits',
    'customer_deposit_processor_fees', 'customer_deposit_consumptions', 'customer_deposit_refunds',
    'subscription_cycle_receipts', 'subscription_cycle_adjustments', 'paid_allowance_grants',
    'paid_allowance_consumptions', 'legacy_credit_opening_balances', 'owner_operating_budgets',
    'owner_operating_budget_revisions', 'accounting_unmatched_provider_events'
  ] loop
    execute format('revoke all on tongs.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select on tongs.%I to service_role', v_table);
  end loop;
end;
$$;

revoke all on function tongs._require_accounting_service_role() from public, anon, authenticated, service_role;
revoke all on function tongs._accounting_payload_hash(jsonb) from public, anon, authenticated, service_role;
revoke all on function tongs._create_accounting_event(uuid, text, text, text, text, text, text, uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke all on function tongs._assert_accounting_event_balanced(uuid) from public, anon, authenticated, service_role;

revoke all on function tongs.record_customer_deposit(uuid, uuid, text, text, text, boolean, text, bigint, text, bigint, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function tongs.record_customer_deposit_processor_fee(uuid, uuid, text, bigint, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function tongs.consume_customer_deposit(uuid, uuid, text, text, bigint, bigint, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function tongs.record_customer_deposit_refund(uuid, uuid, text, text, text, bigint, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function tongs.record_subscription_cycle_receipt(uuid, uuid, text, text, text, text, boolean, text, text, bigint, text, timestamptz, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function tongs.record_subscription_cycle_adjustment(uuid, uuid, text, text, text, bigint, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function tongs.record_stripe_adjustment_accounting(uuid, text, text, text, text, boolean, bigint, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function tongs.create_paid_allowance_grant(uuid, uuid, bigint, bigint, bigint, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function tongs.consume_paid_allowance(uuid, uuid, text, text, bigint, bigint, bigint, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function tongs.record_customer_deposit(uuid, uuid, text, text, text, boolean, text, bigint, text, bigint, timestamptz, jsonb) to service_role;
grant execute on function tongs.record_customer_deposit_processor_fee(uuid, uuid, text, bigint, timestamptz, jsonb) to service_role;
grant execute on function tongs.consume_customer_deposit(uuid, uuid, text, text, bigint, bigint, timestamptz, jsonb) to service_role;
grant execute on function tongs.record_customer_deposit_refund(uuid, uuid, text, text, text, bigint, timestamptz, jsonb) to service_role;
grant execute on function tongs.record_subscription_cycle_receipt(uuid, uuid, text, text, text, text, boolean, text, text, bigint, text, timestamptz, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function tongs.record_subscription_cycle_adjustment(uuid, uuid, text, text, text, bigint, timestamptz, jsonb) to service_role;
grant execute on function tongs.record_stripe_adjustment_accounting(uuid, text, text, text, text, boolean, bigint, text, timestamptz, jsonb) to service_role;
grant execute on function tongs.create_paid_allowance_grant(uuid, uuid, bigint, bigint, bigint, text, timestamptz, jsonb) to service_role;
grant execute on function tongs.consume_paid_allowance(uuid, uuid, text, text, bigint, bigint, bigint, timestamptz, jsonb) to service_role;

revoke all on function tongs.create_owner_operating_budget_draft(uuid, text, uuid, text, text, text, text, timestamptz, timestamptz, text) from public, anon;
revoke all on function tongs.revise_owner_operating_budget(uuid, text, bigint, text) from public, anon;
revoke all on function tongs.read_my_accounting_balances() from public, anon;
revoke all on function tongs.read_owner_accounting_foundation(uuid, integer) from public, anon;
revoke all on function tongs.verify_accounting_reconstruction() from public, anon;
grant execute on function tongs.create_owner_operating_budget_draft(uuid, text, uuid, text, text, text, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function tongs.revise_owner_operating_budget(uuid, text, bigint, text) to authenticated;
grant execute on function tongs.read_my_accounting_balances() to authenticated;
grant execute on function tongs.read_owner_accounting_foundation(uuid, integer) to authenticated, service_role;
grant execute on function tongs.verify_accounting_reconstruction() to authenticated, service_role;

comment on table tongs.accounting_journal_events is 'Append-only accounting event headers. Customer deposits are liabilities until consumed.';
comment on table tongs.legacy_credit_opening_balances is 'Snapshot of pre-foundation mixed credits; permanently ineligible for live funding.';
comment on table tongs.owner_operating_budgets is 'Owner-only budget scopes. Creation is draft-only and this release provides no spending interface.';
comment on function tongs.read_my_accounting_balances() is 'Customer-safe balances derived from append-only events; excludes wholesale costs, fees, revenue, markup, and margin.';

notify pgrst, 'reload schema';

commit;
