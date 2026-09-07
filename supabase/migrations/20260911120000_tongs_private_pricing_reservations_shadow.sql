-- Private pricing and verified-funding reservations in shadow mode.
-- No provider route is authorized by this release and no commercial markup is seeded.

begin;

create table tongs.paid_execution_control_revisions (
  revision integer primary key check (revision > 0),
  pricing_activation_enabled boolean not null default false,
  reservation_shadow_enabled boolean not null default true,
  customer_settlement_enabled boolean not null default false,
  owner_budget_spending_enabled boolean not null default false,
  provider_execution_enabled boolean not null default false,
  reason text not null check (nullif(btrim(reason), '') is not null),
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (not provider_execution_enabled or (pricing_activation_enabled and customer_settlement_enabled)),
  check (not owner_budget_spending_enabled or provider_execution_enabled)
);

insert into tongs.paid_execution_control_revisions(
  revision, pricing_activation_enabled, reservation_shadow_enabled,
  customer_settlement_enabled, owner_budget_spending_enabled,
  provider_execution_enabled, reason
) values (
  1, false, true, false, false, false,
  'Private pricing and reservations installed in shadow mode; activation requires a later approved migration.'
);

create table tongs.private_pricing_policies (
  id uuid primary key,
  policy_code text not null unique check (length(btrim(policy_code)) between 3 and 120),
  scope_kind text not null check (scope_kind in ('default', 'provider', 'sku')),
  provider text,
  sku text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (scope_kind = 'default' and provider is null and sku is null)
    or (scope_kind = 'provider' and provider is not null and sku is null)
    or (scope_kind = 'sku' and provider is not null and sku is not null)
  )
);

create unique index private_pricing_one_default_uidx
  on tongs.private_pricing_policies ((scope_kind)) where scope_kind = 'default';
create unique index private_pricing_provider_scope_uidx
  on tongs.private_pricing_policies (lower(provider)) where scope_kind = 'provider';
create unique index private_pricing_sku_scope_uidx
  on tongs.private_pricing_policies (lower(provider), lower(sku)) where scope_kind = 'sku';

create table tongs.private_pricing_revisions (
  id uuid primary key,
  policy_id uuid not null references tongs.private_pricing_policies(id) on delete restrict,
  revision integer not null check (revision > 0),
  previous_revision_id uuid references tongs.private_pricing_revisions(id) on delete restrict,
  lifecycle_state text not null check (lifecycle_state in ('draft', 'review_ready')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  markup_basis_points integer check (markup_basis_points is null or markup_basis_points >= 0),
  full_cost_ceiling_micros bigint not null check (full_cost_ceiling_micros >= 0),
  failure_cost_ceiling_micros bigint not null check (
    failure_cost_ceiling_micros >= 0 and failure_cost_ceiling_micros <= full_cost_ceiling_micros
  ),
  customer_price_ceiling_micros bigint,
  billable_failure_ceiling_micros bigint,
  customer_credit_units bigint,
  billable_failure_classes jsonb not null check (jsonb_typeof(billable_failure_classes) = 'array'),
  free_failure_classes jsonb not null check (jsonb_typeof(free_failure_classes) = 'array'),
  included_quantity jsonb not null check (jsonb_typeof(included_quantity) = 'object'),
  retention_policy jsonb not null check (jsonb_typeof(retention_policy) = 'object'),
  change_reason text not null check (nullif(btrim(change_reason), '') is not null),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (policy_id, revision),
  check (
    (lifecycle_state = 'draft' and markup_basis_points is null
      and customer_price_ceiling_micros is null
      and billable_failure_ceiling_micros is null
      and customer_credit_units is null)
    or
    (lifecycle_state = 'review_ready' and markup_basis_points is not null
      and customer_price_ceiling_micros is not null
      and billable_failure_ceiling_micros is not null
      and customer_credit_units is not null and customer_credit_units >= 0)
  )
);

create table tongs.private_pricing_cost_components (
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  ordinal smallint not null check (ordinal > 0),
  component_code text not null check (length(btrim(component_code)) between 2 and 120),
  component_kind text not null check (component_kind in (
    'direct_provider', 'supporting_provider', 'compute', 'storage', 'bandwidth_egress',
    'transactional_notification', 'payment_processing', 'retention_tail', 'contingency'
  )),
  credential_funding text not null check (credential_funding in ('forge', 'byo_customer')),
  provider_label text not null check (length(btrim(provider_label)) between 2 and 120),
  success_ceiling_micros bigint not null check (success_ceiling_micros >= 0),
  failure_ceiling_micros bigint not null check (
    failure_ceiling_micros >= 0 and failure_ceiling_micros <= success_ceiling_micros
  ),
  cost_policy_revision text not null check (length(btrim(cost_policy_revision)) between 1 and 160),
  tail_policy text not null check (tail_policy in ('none', 'included_until', 'plan_funded', 'recurring_metered')),
  tail_policy_details jsonb not null default '{}'::jsonb check (jsonb_typeof(tail_policy_details) = 'object'),
  primary key (pricing_revision_id, ordinal),
  unique (pricing_revision_id, component_code),
  check (credential_funding <> 'byo_customer' or (success_ceiling_micros = 0 and failure_ceiling_micros = 0)),
  check (tail_policy <> 'included_until' or nullif(tail_policy_details->>'included_until', '') is not null)
);

create table tongs.customer_spending_quotes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  operation_id text not null check (length(btrim(operation_id)) between 8 and 300),
  tool text not null check (length(btrim(tool)) between 2 and 100),
  workspace_id uuid references tongs.workspaces(id) on delete restrict,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  pricing_revision integer not null check (pricing_revision > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  normal_maximum_charge_micros bigint not null check (normal_maximum_charge_micros >= 0),
  billable_failure_maximum_charge_micros bigint not null check (
    billable_failure_maximum_charge_micros >= 0
    and billable_failure_maximum_charge_micros <= normal_maximum_charge_micros
  ),
  customer_credit_units bigint not null check (customer_credit_units >= 0),
  full_cost_ceiling_micros bigint not null check (full_cost_ceiling_micros >= 0),
  billable_failure_classes jsonb not null check (jsonb_typeof(billable_failure_classes) = 'array'),
  free_failure_classes jsonb not null check (jsonb_typeof(free_failure_classes) = 'array'),
  included_quantity jsonb not null check (jsonb_typeof(included_quantity) = 'object'),
  retention_policy jsonb not null check (jsonb_typeof(retention_policy) = 'object'),
  provider_funding_summary jsonb not null check (jsonb_typeof(provider_funding_summary) = 'array'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  quote_hash text not null unique check (quote_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id),
  check (expires_at > created_at)
);

create table tongs.customer_spending_quote_acceptances (
  id uuid primary key,
  quote_id uuid not null unique references tongs.customer_spending_quotes(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  acceptance_key text not null unique check (length(btrim(acceptance_key)) between 8 and 300),
  accepted_quote_hash text not null check (accepted_quote_hash ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default now()
);

create table tongs.funding_reservations (
  id uuid primary key,
  quote_id uuid not null unique references tongs.customer_spending_quotes(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  operation_id text not null,
  funding_source_type text not null check (funding_source_type in ('customer_deposit', 'paid_allowance', 'owner_budget', 'none')),
  funding_source_id uuid,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reserved_customer_charge_micros bigint not null check (reserved_customer_charge_micros >= 0),
  reserved_credit_units bigint not null check (reserved_credit_units >= 0),
  reserved_wholesale_spend_micros bigint not null check (reserved_wholesale_spend_micros >= 0),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, operation_id),
  check (
    (funding_source_type = 'none' and funding_source_id is null
      and reserved_customer_charge_micros = 0 and reserved_credit_units = 0
      and reserved_wholesale_spend_micros = 0)
    or (funding_source_type <> 'none' and funding_source_id is not null)
  )
);

create table tongs.funding_reservation_events (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_type text not null check (event_type in (
    'reserved', 'provider_attempt_shadowed', 'submission_unknown',
    'provider_failure_recorded', 'settled', 'released'
  )),
  event_key text not null unique check (length(btrim(event_key)) between 8 and 300),
  provider_attempt_key text,
  lease_expires_at timestamptz,
  customer_charge_micros bigint check (customer_charge_micros is null or customer_charge_micros >= 0),
  credit_units bigint check (credit_units is null or credit_units >= 0),
  wholesale_spend_micros bigint check (wholesale_spend_micros is null or wholesale_spend_micros >= 0),
  failure_class text,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (reservation_id, sequence),
  unique (reservation_id, provider_attempt_key)
);

create table tongs.pricing_discrepancies (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  discrepancy_key text not null unique,
  discrepancy_type text not null check (discrepancy_type in ('customer_ceiling_overrun', 'wholesale_ceiling_overrun')),
  quoted_ceiling_micros bigint not null check (quoted_ceiling_micros >= 0),
  observed_amount_micros bigint not null check (observed_amount_micros > quoted_ceiling_micros),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now()
);

create index funding_reservations_source_idx
  on tongs.funding_reservations(funding_source_type, funding_source_id);
create index funding_reservation_events_state_idx
  on tongs.funding_reservation_events(reservation_id, sequence desc);

create trigger paid_execution_control_revisions_immutable before update or delete on tongs.paid_execution_control_revisions
for each row execute function tongs._reject_accounting_mutation();
create trigger private_pricing_policies_immutable before update or delete on tongs.private_pricing_policies
for each row execute function tongs._reject_accounting_mutation();
create trigger private_pricing_revisions_immutable before update or delete on tongs.private_pricing_revisions
for each row execute function tongs._reject_accounting_mutation();
create trigger private_pricing_cost_components_immutable before update or delete on tongs.private_pricing_cost_components
for each row execute function tongs._reject_accounting_mutation();
create trigger customer_spending_quotes_immutable before update or delete on tongs.customer_spending_quotes
for each row execute function tongs._reject_accounting_mutation();
create trigger customer_spending_quote_acceptances_immutable before update or delete on tongs.customer_spending_quote_acceptances
for each row execute function tongs._reject_accounting_mutation();
create trigger funding_reservations_immutable before update or delete on tongs.funding_reservations
for each row execute function tongs._reject_accounting_mutation();
create trigger funding_reservation_events_immutable before update or delete on tongs.funding_reservation_events
for each row execute function tongs._reject_accounting_mutation();
create trigger pricing_discrepancies_immutable before update or delete on tongs.pricing_discrepancies
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs._require_pricing_service_role()
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role authority required' using errcode = '42501';
  end if;
end;
$$;

create or replace function tongs.record_provider_failure(
  p_reservation_id uuid,
  p_event_key text,
  p_failure_class text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_existing tongs.funding_reservation_events%rowtype;
  v_sequence integer;
  v_billable boolean;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_event_key, ''))) < 8
     or nullif(btrim(coalesce(p_failure_class, '')), '') is null
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid provider failure' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-attempt:' || p_reservation_id::text, 0));
  select * into v_reservation from tongs.funding_reservations where id = p_reservation_id for update;
  if not found then raise exception 'funding reservation not found' using errcode = 'P0002'; end if;
  select * into v_quote from tongs.customer_spending_quotes where id = v_reservation.quote_id;
  select * into v_existing from tongs.funding_reservation_events where event_key = btrim(p_event_key);
  if found then return jsonb_build_object('reservation_id', p_reservation_id,
    'failure_class', v_existing.failure_class, 'replay', true); end if;
  if tongs._funding_reservation_state(p_reservation_id) in ('settled', 'released') then
    raise exception 'reservation is terminal' using errcode = 'P0001';
  end if;
  v_billable := exists (select 1 from jsonb_array_elements_text(v_quote.billable_failure_classes) value
    where value = btrim(p_failure_class));
  if not v_billable and not exists (
    select 1 from jsonb_array_elements_text(v_quote.free_failure_classes) value
    where value = btrim(p_failure_class)
  ) then raise exception 'failure class was not disclosed by accepted quote' using errcode = 'P0001'; end if;
  select coalesce(max(sequence),0)+1 into v_sequence from tongs.funding_reservation_events
    where reservation_id = p_reservation_id;
  insert into tongs.funding_reservation_events(
    id, reservation_id, sequence, event_type, event_key, failure_class, evidence_json
  ) values (gen_random_uuid(), p_reservation_id, v_sequence, 'provider_failure_recorded',
    btrim(p_event_key), btrim(p_failure_class), coalesce(p_evidence_json, '{}'::jsonb));
  return jsonb_build_object('reservation_id', p_reservation_id, 'failure_class', btrim(p_failure_class),
    'billable', v_billable, 'maximum_customer_charge_micros',
      case when v_billable then v_quote.billable_failure_maximum_charge_micros else 0 end,
    'replay', false);
end;
$$;

create or replace function tongs.settle_operation(
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
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_existing tongs.funding_reservation_events%rowtype;
  v_state text;
  v_sequence integer;
  v_ceiling bigint;
  v_charge bigint;
  v_units bigint;
  v_calculated_charge numeric;
  v_observed_charge bigint;
  v_consumption jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_settlement_id is null or length(btrim(coalesce(p_settlement_key, ''))) < 8
     or p_outcome not in ('success', 'billable_failure', 'nonbillable_failure')
     or p_actual_fulfillment_cost_micros < 0
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid operation settlement' using errcode = '22023';
  end if;
  select * into v_control from tongs._current_paid_execution_control();
  if not v_control.pricing_activation_enabled or not v_control.customer_settlement_enabled then
    raise exception 'customer settlement is not activated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-attempt:' || p_reservation_id::text, 0));
  select * into v_reservation from tongs.funding_reservations where id = p_reservation_id for update;
  if not found then raise exception 'funding reservation not found' using errcode = 'P0002'; end if;
  select * into v_quote from tongs.customer_spending_quotes where id = v_reservation.quote_id;
  select * into v_pricing from tongs.private_pricing_revisions where id = v_quote.pricing_revision_id;
  select * into v_existing from tongs.funding_reservation_events where event_key = btrim(p_settlement_key);
  if found then
    return jsonb_build_object('reservation_id', p_reservation_id, 'state', 'settled', 'replay', true,
      'customer_charge_micros', v_existing.customer_charge_micros,
      'wholesale_spend_micros', v_existing.wholesale_spend_micros);
  end if;
  v_state := tongs._funding_reservation_state(p_reservation_id);
  if v_state = 'settled' then raise exception 'settlement replay key conflict' using errcode = '23505'; end if;
  if v_state = 'released' then raise exception 'released reservation cannot settle' using errcode = 'P0001'; end if;
  if p_outcome = 'nonbillable_failure' then
    v_ceiling := 0;
    v_calculated_charge := 0;
  elsif p_outcome = 'billable_failure' then
    if nullif(btrim(coalesce(p_failure_class, '')), '') is null
       or not exists (select 1 from jsonb_array_elements_text(v_quote.billable_failure_classes) value
         where value = btrim(p_failure_class)) then
      raise exception 'failure class is not billable under accepted quote' using errcode = 'P0001';
    end if;
    v_ceiling := v_quote.billable_failure_maximum_charge_micros;
    v_calculated_charge := ceil(
      p_actual_fulfillment_cost_micros::numeric
      * (10000::numeric + v_pricing.markup_basis_points::numeric) / 10000::numeric
    );
  else
    v_ceiling := v_quote.normal_maximum_charge_micros;
    v_calculated_charge := v_quote.normal_maximum_charge_micros;
  end if;
  if v_calculated_charge > 9223372036854775807::numeric then
    v_observed_charge := 9223372036854775807;
  else
    v_observed_charge := v_calculated_charge::bigint;
  end if;
  v_charge := least(v_observed_charge, v_ceiling, v_reservation.reserved_customer_charge_micros);
  v_units := case
    when v_charge = 0 or v_reservation.reserved_customer_charge_micros = 0 then 0
    else ceil(v_reservation.reserved_credit_units::numeric * v_charge::numeric
      / v_reservation.reserved_customer_charge_micros::numeric)::bigint end;
  if p_outcome = 'nonbillable_failure' and (v_charge <> 0 or v_units <> 0) then
    raise exception 'nonbillable failure must settle at zero' using errcode = 'P0001';
  end if;
  if v_observed_charge > v_ceiling then
    insert into tongs.pricing_discrepancies(
      id, reservation_id, discrepancy_key, discrepancy_type,
      quoted_ceiling_micros, observed_amount_micros, evidence_json
    ) values (gen_random_uuid(), p_reservation_id, btrim(p_settlement_key) || ':customer-overrun',
      'customer_ceiling_overrun', v_ceiling, v_observed_charge,
      coalesce(p_evidence_json, '{}'::jsonb)) on conflict (discrepancy_key) do nothing;
  end if;
  if p_actual_fulfillment_cost_micros > v_reservation.reserved_wholesale_spend_micros then
    insert into tongs.pricing_discrepancies(
      id, reservation_id, discrepancy_key, discrepancy_type,
      quoted_ceiling_micros, observed_amount_micros, evidence_json
    ) values (gen_random_uuid(), p_reservation_id, btrim(p_settlement_key) || ':wholesale-overrun',
      'wholesale_ceiling_overrun', v_reservation.reserved_wholesale_spend_micros,
      p_actual_fulfillment_cost_micros, coalesce(p_evidence_json, '{}'::jsonb))
    on conflict (discrepancy_key) do nothing;
  end if;
  if v_reservation.funding_source_type = 'customer_deposit' and v_charge > 0 then
    v_consumption := tongs.consume_customer_deposit(
      p_settlement_id, v_reservation.funding_source_id,
      'reservation-settlement:' || p_reservation_id::text, v_reservation.operation_id,
      v_charge, v_units, now(), jsonb_build_object('reservation_id', p_reservation_id,
        'quote_id', v_quote.id, 'outcome', p_outcome)
    );
  elsif v_reservation.funding_source_type = 'paid_allowance' and v_charge > 0 then
    v_consumption := tongs.consume_paid_allowance(
      p_settlement_id, v_reservation.funding_source_id,
      'reservation-settlement:' || p_reservation_id::text, v_reservation.operation_id,
      v_units, v_charge, least(p_actual_fulfillment_cost_micros, v_reservation.reserved_wholesale_spend_micros),
      now(), jsonb_build_object('reservation_id', p_reservation_id,
        'quote_id', v_quote.id, 'outcome', p_outcome)
    );
  elsif v_reservation.funding_source_type = 'owner_budget' then
    raise exception 'owner-budget settlement is not available in this release' using errcode = '42501';
  elsif v_reservation.funding_source_type <> 'none' and v_charge = 0 and v_units <> 0 then
    raise exception 'zero-charge settlement cannot consume credits' using errcode = '22023';
  end if;
  select coalesce(max(sequence),0)+1 into v_sequence from tongs.funding_reservation_events
    where reservation_id = p_reservation_id;
  insert into tongs.funding_reservation_events(
    id, reservation_id, sequence, event_type, event_key, customer_charge_micros,
    credit_units, wholesale_spend_micros, failure_class, evidence_json
  ) values (
    gen_random_uuid(), p_reservation_id, v_sequence, 'settled', btrim(p_settlement_key),
    v_charge, v_units, p_actual_fulfillment_cost_micros, nullif(btrim(coalesce(p_failure_class, '')), ''),
    coalesce(p_evidence_json, '{}'::jsonb)
  );
  return jsonb_build_object('reservation_id', p_reservation_id, 'state', 'settled',
    'replay', false, 'customer_charge_micros', v_charge, 'credit_units', v_units,
    'fulfillment_cost_micros', p_actual_fulfillment_cost_micros,
    'customer_ceiling_applied', v_observed_charge > v_ceiling,
    'wholesale_discrepancy_recorded', p_actual_fulfillment_cost_micros > v_reservation.reserved_wholesale_spend_micros,
    'accounting_consumption', v_consumption);
end;
$$;

create or replace function tongs.release_operation(
  p_reservation_id uuid,
  p_release_key text,
  p_reason text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_reservation tongs.funding_reservations%rowtype;
  v_existing tongs.funding_reservation_events%rowtype;
  v_state text;
  v_sequence integer;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_release_key, ''))) < 8
     or nullif(btrim(coalesce(p_reason, '')), '') is null
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid reservation release' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-attempt:' || p_reservation_id::text, 0));
  select * into v_reservation from tongs.funding_reservations where id = p_reservation_id for update;
  if not found then raise exception 'funding reservation not found' using errcode = 'P0002'; end if;
  select * into v_existing from tongs.funding_reservation_events where event_key = btrim(p_release_key);
  if found then return jsonb_build_object('reservation_id', p_reservation_id, 'state', 'released', 'replay', true); end if;
  v_state := tongs._funding_reservation_state(p_reservation_id);
  if v_state = 'submission_unknown' then
    raise exception 'ambiguous submission reservation requires reconciliation' using errcode = 'P0001';
  elsif v_state = 'settled' then
    raise exception 'settled reservation cannot be released' using errcode = 'P0001';
  elsif v_state = 'released' then
    raise exception 'release replay key conflict' using errcode = '23505';
  end if;
  select coalesce(max(sequence),0)+1 into v_sequence from tongs.funding_reservation_events
    where reservation_id = p_reservation_id;
  insert into tongs.funding_reservation_events(
    id, reservation_id, sequence, event_type, event_key, evidence_json
  ) values (gen_random_uuid(), p_reservation_id, v_sequence, 'released', btrim(p_release_key),
    coalesce(p_evidence_json, '{}'::jsonb) || jsonb_build_object('reason', btrim(p_reason)));
  return jsonb_build_object('reservation_id', p_reservation_id, 'state', 'released',
    'replay', false, 'funds_released', true);
end;
$$;

create or replace function tongs.read_my_spending_operation(p_operation_id text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_quote tongs.customer_spending_quotes%rowtype;
  v_reservation tongs.funding_reservations%rowtype;
  v_settlement tongs.funding_reservation_events%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_quote from tongs.customer_spending_quotes
    where user_id = v_user and operation_id = btrim(p_operation_id);
  if not found then raise exception 'spending operation not found' using errcode = 'P0002'; end if;
  select * into v_reservation from tongs.funding_reservations where quote_id = v_quote.id;
  if v_reservation.id is not null then
    select * into v_settlement from tongs.funding_reservation_events
      where reservation_id = v_reservation.id and event_type = 'settled' order by sequence desc limit 1;
  end if;
  return jsonb_build_object(
    'operation_id', v_quote.operation_id, 'quote_id', v_quote.id, 'currency', v_quote.currency,
    'normal_maximum_charge_micros', v_quote.normal_maximum_charge_micros,
    'billable_failure_maximum_charge_micros', v_quote.billable_failure_maximum_charge_micros,
    'provider_funding_summary', v_quote.provider_funding_summary,
    'accepted', exists (select 1 from tongs.customer_spending_quote_acceptances where quote_id = v_quote.id),
    'reservation_state', case when v_reservation.id is null then null else tongs._funding_reservation_state(v_reservation.id) end,
    'customer_charge_micros', v_settlement.customer_charge_micros,
    'credit_units', v_settlement.credit_units,
    'execution_authorized', false
  );
end;
$$;

create or replace function tongs.read_owner_pricing_reservations(
  p_limit integer default 250
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit,250),1),2000);
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_pricing jsonb;
  v_reservations jsonb;
  v_discrepancies jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  select * into v_control from tongs._current_paid_execution_control();
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
    into v_pricing from (
      select policy.policy_code, policy.scope_kind, policy.provider, policy.sku,
        revision.id as revision_id, revision.revision, revision.lifecycle_state, revision.currency,
        revision.markup_basis_points, revision.full_cost_ceiling_micros,
        revision.failure_cost_ceiling_micros, revision.customer_price_ceiling_micros,
        revision.billable_failure_ceiling_micros, revision.customer_credit_units,
        revision.content_hash, revision.created_at
      from tongs.private_pricing_revisions revision
      join tongs.private_pricing_policies policy on policy.id = revision.policy_id
      order by revision.created_at desc limit v_limit
    ) row_data;
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
    into v_reservations from (
      select reservation.*, tongs._funding_reservation_state(reservation.id) as state
      from tongs.funding_reservations reservation order by reservation.created_at desc limit v_limit
    ) row_data;
  select coalesce(jsonb_agg(to_jsonb(discrepancy) order by discrepancy.created_at desc), '[]'::jsonb)
    into v_discrepancies from (
      select * from tongs.pricing_discrepancies order by created_at desc limit v_limit
    ) discrepancy;
  return jsonb_build_object('control', to_jsonb(v_control), 'pricing_revisions', v_pricing,
    'reservations', v_reservations, 'pricing_discrepancies', v_discrepancies);
end;
$$;

create or replace function tongs.reserve_operation(
  p_reservation_id uuid,
  p_quote_id uuid,
  p_funding_source_type text,
  p_funding_source_id uuid,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_existing tongs.funding_reservations%rowtype;
  v_deposit tongs.customer_deposits%rowtype;
  v_allowance tongs.paid_allowance_grants%rowtype;
  v_budget tongs.owner_operating_budgets%rowtype;
  v_budget_revision tongs.owner_operating_budget_revisions%rowtype;
  v_hold record;
  v_used_charge bigint;
  v_used_units bigint;
  v_used_wholesale bigint;
  v_refunded_charge bigint;
  v_refunded_units bigint;
  v_reserve_charge bigint;
  v_reserve_units bigint;
  v_reserve_wholesale bigint;
begin
  perform tongs._require_pricing_service_role();
  select * into v_control from tongs._current_paid_execution_control();
  if not v_control.reservation_shadow_enabled then
    raise exception 'reservation shadow is disabled' using errcode = '42501';
  end if;
  if p_reservation_id is null or p_quote_id is null
     or p_funding_source_type not in ('customer_deposit', 'paid_allowance', 'owner_budget', 'none')
     or length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'invalid operation reservation' using errcode = '22023';
  end if;
  select * into v_quote from tongs.customer_spending_quotes where id = p_quote_id;
  if not found then raise exception 'spending quote not found' using errcode = 'P0002'; end if;
  if v_quote.expires_at <= now() then raise exception 'spending quote expired' using errcode = 'P0001'; end if;
  if not exists (select 1 from tongs.customer_spending_quote_acceptances where quote_id = p_quote_id) then
    raise exception 'accepted spending quote required' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'funding-reservation:' || v_quote.user_id::text || ':' || v_quote.operation_id, 0));
  select * into v_existing from tongs.funding_reservations
  where user_id = v_quote.user_id and operation_id = v_quote.operation_id;
  if found then
    if v_existing.id <> p_reservation_id or v_existing.quote_id <> p_quote_id
       or v_existing.funding_source_type <> p_funding_source_type
       or v_existing.funding_source_id is distinct from p_funding_source_id
       or v_existing.idempotency_key <> btrim(p_idempotency_key) then
      raise exception 'operation reservation replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('reservation_id', v_existing.id,
      'state', tongs._funding_reservation_state(v_existing.id), 'replay', true,
      'provider_execution_authorized', false, 'shadow_mode', true);
  end if;

  v_reserve_charge := v_quote.normal_maximum_charge_micros;
  v_reserve_units := v_quote.customer_credit_units;
  v_reserve_wholesale := v_quote.full_cost_ceiling_micros;
  if p_funding_source_type = 'none' then
    if p_funding_source_id is not null or v_reserve_charge <> 0 or v_reserve_units <> 0 or v_reserve_wholesale <> 0 then
      raise exception 'zero-Forge-cost quote required for no-funding reservation' using errcode = 'P0001';
    end if;
  elsif p_funding_source_id is null then
    raise exception 'funding source id required' using errcode = '22023';
  elsif p_funding_source_type = 'customer_deposit' then
    select * into v_deposit from tongs.customer_deposits where id = p_funding_source_id for update;
    if not found or v_deposit.user_id <> v_quote.user_id or v_deposit.currency <> v_quote.currency then
      raise exception 'eligible customer deposit not found' using errcode = 'P0002';
    end if;
    if v_deposit.stripe_mode <> 'live' then
      raise exception 'test deposits cannot fund live reservations' using errcode = '42501';
    end if;
    if not exists (select 1 from tongs.customer_deposit_processor_fees where deposit_id = v_deposit.id) then
      raise exception 'processor fee must be finalized before reservation' using errcode = 'P0001';
    end if;
    select coalesce(sum(recognized_revenue_micros),0), coalesce(sum(credit_units_consumed),0)
      into v_used_charge, v_used_units from tongs.customer_deposit_consumptions
      where deposit_id = v_deposit.id;
    select coalesce(sum(liability_release_micros),0), coalesce(sum(refunded_credit_units),0)
      into v_refunded_charge, v_refunded_units from tongs.customer_deposit_refunds
      where deposit_id = v_deposit.id;
    select * into v_hold from tongs._active_funding_hold('customer_deposit', v_deposit.id);
    if v_reserve_charge > v_deposit.gross_amount_micros - v_used_charge - v_refunded_charge - v_hold.customer_charge_micros
       or v_reserve_units > v_deposit.credit_units - v_used_units - v_refunded_units - v_hold.credit_units then
      raise exception 'insufficient verified deposit balance' using errcode = 'P0001';
    end if;
  elsif p_funding_source_type = 'paid_allowance' then
    select * into v_allowance from tongs.paid_allowance_grants where id = p_funding_source_id for update;
    if not found or v_allowance.user_id <> v_quote.user_id or v_allowance.currency <> v_quote.currency then
      raise exception 'eligible paid allowance not found' using errcode = 'P0002';
    end if;
    if now() < v_allowance.period_start or now() >= v_allowance.period_end
       or exists (select 1 from tongs.subscription_cycle_adjustments where receipt_id = v_allowance.receipt_id) then
      raise exception 'paid allowance is not currently funded' using errcode = 'P0001';
    end if;
    select coalesce(sum(recognized_revenue_micros),0), coalesce(sum(entitlement_units_consumed),0),
      coalesce(sum(wholesale_spend_micros),0)
      into v_used_charge, v_used_units, v_used_wholesale
    from tongs.paid_allowance_consumptions where allowance_grant_id = v_allowance.id;
    select * into v_hold from tongs._active_funding_hold('paid_allowance', v_allowance.id);
    if v_reserve_charge > v_allowance.allocated_revenue_micros - v_used_charge - v_hold.customer_charge_micros
       or v_reserve_units > v_allowance.entitlement_units - v_used_units - v_hold.credit_units
       or v_reserve_wholesale > v_allowance.maximum_wholesale_spend_micros - v_used_wholesale - v_hold.wholesale_spend_micros then
      raise exception 'insufficient funded allowance balance' using errcode = 'P0001';
    end if;
  else
    if not v_control.owner_budget_spending_enabled then
      raise exception 'owner-budget spending is not activated' using errcode = '42501';
    end if;
    select * into v_budget from tongs.owner_operating_budgets where id = p_funding_source_id for update;
    select revision.* into v_budget_revision from tongs.owner_operating_budget_revisions revision
      where revision.budget_id = p_funding_source_id order by revision.revision desc limit 1;
    if not found or v_budget_revision.status <> 'active' or v_budget_revision.maximum_amount_micros is null
       or now() < v_budget.period_start or now() >= v_budget.period_end or v_budget.currency <> v_quote.currency then
      raise exception 'eligible owner operating budget not found' using errcode = 'P0002';
    end if;
    select * into v_hold from tongs._active_funding_hold('owner_budget', v_budget.id);
    if v_reserve_wholesale > v_budget_revision.maximum_amount_micros - v_hold.wholesale_spend_micros then
      raise exception 'insufficient owner operating budget' using errcode = 'P0001';
    end if;
    v_reserve_charge := 0;
    v_reserve_units := 0;
  end if;

  insert into tongs.funding_reservations(
    id, quote_id, user_id, operation_id, funding_source_type, funding_source_id,
    currency, reserved_customer_charge_micros, reserved_credit_units,
    reserved_wholesale_spend_micros, idempotency_key
  ) values (
    p_reservation_id, p_quote_id, v_quote.user_id, v_quote.operation_id,
    p_funding_source_type, p_funding_source_id, v_quote.currency,
    v_reserve_charge, v_reserve_units, v_reserve_wholesale, btrim(p_idempotency_key)
  );
  insert into tongs.funding_reservation_events(
    id, reservation_id, sequence, event_type, event_key, evidence_json
  ) values (gen_random_uuid(), p_reservation_id, 1, 'reserved',
    'reservation:' || p_reservation_id::text || ':reserved',
    jsonb_build_object('shadow_mode', true, 'provider_execution_authorized', false));
  return jsonb_build_object('reservation_id', p_reservation_id, 'state', 'reserved',
    'replay', false, 'provider_execution_authorized', false, 'shadow_mode', true);
end;
$$;

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
      'reason', 'shadow_mode');
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
    'provider_execution_authorized', v_control.provider_execution_enabled,
    'reason', case when v_control.provider_execution_enabled then 'authorized' else 'shadow_mode' end);
end;
$$;

create or replace function tongs.mark_submission_unknown(
  p_reservation_id uuid,
  p_event_key text,
  p_attempt_key text,
  p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_reservation tongs.funding_reservations%rowtype;
  v_existing tongs.funding_reservation_events%rowtype;
  v_state text;
  v_sequence integer;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_event_key, ''))) < 8 or length(btrim(coalesce(p_attempt_key, ''))) < 8
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid unknown-submission event' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-attempt:' || p_reservation_id::text, 0));
  select * into v_reservation from tongs.funding_reservations where id = p_reservation_id for update;
  if not found then raise exception 'funding reservation not found' using errcode = 'P0002'; end if;
  select * into v_existing from tongs.funding_reservation_events where event_key = btrim(p_event_key);
  if found then return jsonb_build_object('reservation_id', p_reservation_id, 'state', 'submission_unknown', 'replay', true); end if;
  v_state := tongs._funding_reservation_state(p_reservation_id);
  if v_state in ('settled', 'released') then raise exception 'reservation is terminal' using errcode = 'P0001'; end if;
  if not exists (select 1 from tongs.funding_reservation_events
    where reservation_id = p_reservation_id and provider_attempt_key = btrim(p_attempt_key)
      and event_type = 'provider_attempt_shadowed') then
    raise exception 'provider attempt lease not found' using errcode = 'P0002';
  end if;
  select coalesce(max(sequence),0)+1 into v_sequence from tongs.funding_reservation_events
    where reservation_id = p_reservation_id;
  insert into tongs.funding_reservation_events(
    id, reservation_id, sequence, event_type, event_key, evidence_json
  ) values (gen_random_uuid(), p_reservation_id, v_sequence, 'submission_unknown',
    btrim(p_event_key), coalesce(p_evidence_json, '{}'::jsonb));
  return jsonb_build_object('reservation_id', p_reservation_id, 'state', 'submission_unknown',
    'replay', false, 'reservation_retained', true, 'automatic_resubmission_allowed', false);
end;
$$;


create or replace function tongs.preview_private_price(p_pricing_revision_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_revision tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_components jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  select * into v_revision from tongs.private_pricing_revisions where id = p_pricing_revision_id;
  if not found then raise exception 'private pricing revision not found' using errcode = 'P0002'; end if;
  select * into v_policy from tongs.private_pricing_policies where id = v_revision.policy_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'component_code', component.component_code,
    'component_kind', component.component_kind,
    'credential_funding', component.credential_funding,
    'provider_label', component.provider_label,
    'success_ceiling_micros', component.success_ceiling_micros,
    'failure_ceiling_micros', component.failure_ceiling_micros,
    'cost_policy_revision', component.cost_policy_revision,
    'tail_policy', component.tail_policy,
    'tail_policy_details', component.tail_policy_details
  ) order by component.ordinal), '[]'::jsonb) into v_components
  from tongs.private_pricing_cost_components component
  where component.pricing_revision_id = v_revision.id;
  return jsonb_build_object(
    'policy', jsonb_build_object('policy_code', v_policy.policy_code, 'scope_kind', v_policy.scope_kind,
      'provider', v_policy.provider, 'sku', v_policy.sku),
    'revision_id', v_revision.id, 'revision', v_revision.revision,
    'state', v_revision.lifecycle_state, 'currency', v_revision.currency,
    'cost_components', v_components,
    'full_cost_ceiling_micros', v_revision.full_cost_ceiling_micros,
    'failure_cost_ceiling_micros', v_revision.failure_cost_ceiling_micros,
    'markup_basis_points', v_revision.markup_basis_points,
    'customer_price_ceiling_micros', v_revision.customer_price_ceiling_micros,
    'billable_failure_ceiling_micros', v_revision.billable_failure_ceiling_micros,
    'customer_credit_units', v_revision.customer_credit_units,
    'expected_margin_micros', case when v_revision.customer_price_ceiling_micros is null then null
      else v_revision.customer_price_ceiling_micros - v_revision.full_cost_ceiling_micros end,
    'expected_margin_percentage', case
      when coalesce(v_revision.customer_price_ceiling_micros, 0) = 0 then null
      else round(100::numeric * (v_revision.customer_price_ceiling_micros - v_revision.full_cost_ceiling_micros)::numeric
        / v_revision.customer_price_ceiling_micros::numeric, 4) end,
    'funding_behavior', jsonb_build_object(
      'customer_deposit', 'requires verified live deposit and finalized processor fee',
      'paid_allowance', 'requires funded-cycle entitlement, revenue backing, and wholesale capacity',
      'byo', 'reserves only Forge-funded supporting components',
      'owner_testing', 'disabled until a later approved control revision and an active capped budget'),
    'activation_enabled', false,
    'missing_decisions', case when v_revision.markup_basis_points is null
      then jsonb_build_array('markup_basis_points', 'customer_credit_units') else '[]'::jsonb end
  );
end;
$$;

create or replace function tongs.preview_price(p_pricing_revision_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select tongs.preview_private_price(p_pricing_revision_id);
$$;

create or replace function tongs.create_shadow_spending_quote(
  p_quote_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_tool text,
  p_workspace_id uuid,
  p_pricing_revision_id uuid,
  p_request_fingerprint text,
  p_provider_funding_summary jsonb,
  p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_revision tongs.private_pricing_revisions%rowtype;
  v_existing tongs.customer_spending_quotes%rowtype;
  v_operation text := nullif(btrim(coalesce(p_operation_id, '')), '');
  v_tool text := nullif(btrim(coalesce(p_tool, '')), '');
  v_hash text;
begin
  perform tongs._require_pricing_service_role();
  if p_quote_id is null or p_user_id is null or v_operation is null or length(v_operation) < 8
     or v_tool is null or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(p_provider_funding_summary, 'null'::jsonb)) <> 'array'
     or p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid shadow spending quote' using errcode = '22023';
  end if;
  select * into v_revision from tongs.private_pricing_revisions where id = p_pricing_revision_id;
  if not found then raise exception 'private pricing revision not found' using errcode = 'P0002'; end if;
  if v_revision.lifecycle_state <> 'review_ready' or v_revision.markup_basis_points is null
     or v_revision.customer_price_ceiling_micros is null or v_revision.customer_credit_units is null then
    raise exception 'pricing_not_configured' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_provider_funding_summary) item
    where jsonb_typeof(item) <> 'object'
       or item->>'credential_source' not in ('forge', 'byo_customer')
       or nullif(btrim(coalesce(item->>'component', '')), '') is null
       or nullif(btrim(coalesce(item->>'provider_label', '')), '') is null
  ) then raise exception 'invalid provider funding summary' using errcode = '22023'; end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'quote_id', p_quote_id, 'user_id', p_user_id, 'operation_id', v_operation,
    'tool', v_tool, 'workspace_id', p_workspace_id, 'pricing_revision_id', v_revision.id,
    'pricing_revision', v_revision.revision, 'currency', v_revision.currency,
    'normal_maximum_charge_micros', v_revision.customer_price_ceiling_micros,
    'billable_failure_maximum_charge_micros', v_revision.billable_failure_ceiling_micros,
    'customer_credit_units', v_revision.customer_credit_units,
    'request_fingerprint', p_request_fingerprint, 'provider_funding_summary', p_provider_funding_summary,
    'expires_at', p_expires_at
  )::text, 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('spending-quote:' || p_user_id::text || ':' || v_operation, 0));
  select * into v_existing from tongs.customer_spending_quotes
  where user_id = p_user_id and operation_id = v_operation;
  if found then
    if v_existing.id <> p_quote_id or v_existing.request_fingerprint <> p_request_fingerprint
       or v_existing.pricing_revision_id <> p_pricing_revision_id
       or v_existing.quote_hash <> v_hash then
      raise exception 'shadow spending quote replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('quote_id', v_existing.id, 'quote_hash', v_existing.quote_hash,
      'replay', true, 'execution_authorized', false);
  end if;
  insert into tongs.customer_spending_quotes(
    id, user_id, operation_id, tool, workspace_id, pricing_revision_id, pricing_revision,
    currency, normal_maximum_charge_micros, billable_failure_maximum_charge_micros,
    customer_credit_units, full_cost_ceiling_micros, billable_failure_classes,
    free_failure_classes, included_quantity, retention_policy, provider_funding_summary,
    request_fingerprint, quote_hash, expires_at
  ) values (
    p_quote_id, p_user_id, v_operation, v_tool, p_workspace_id, v_revision.id, v_revision.revision,
    v_revision.currency, v_revision.customer_price_ceiling_micros, v_revision.billable_failure_ceiling_micros,
    v_revision.customer_credit_units, v_revision.full_cost_ceiling_micros,
    v_revision.billable_failure_classes, v_revision.free_failure_classes,
    v_revision.included_quantity, v_revision.retention_policy, p_provider_funding_summary,
    p_request_fingerprint, v_hash, p_expires_at
  );
  return jsonb_build_object('quote_id', p_quote_id, 'quote_hash', v_hash,
    'replay', false, 'execution_authorized', false);
end;
$$;

create or replace function tongs.read_my_spending_quote(p_quote_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_quote tongs.customer_spending_quotes%rowtype;
  v_accepted timestamptz;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_quote from tongs.customer_spending_quotes
  where id = p_quote_id and user_id = v_user;
  if not found then raise exception 'spending quote not found' using errcode = 'P0002'; end if;
  select acceptance.accepted_at into v_accepted from tongs.customer_spending_quote_acceptances acceptance
  where acceptance.quote_id = v_quote.id;
  return jsonb_build_object(
    'quote_id', v_quote.id, 'operation_id', v_quote.operation_id, 'tool', v_quote.tool,
    'workspace_id', v_quote.workspace_id, 'currency', v_quote.currency,
    'normal_maximum_charge_micros', v_quote.normal_maximum_charge_micros,
    'billable_failure_maximum_charge_micros', v_quote.billable_failure_maximum_charge_micros,
    'customer_credit_units', v_quote.customer_credit_units,
    'billable_failure_classes', v_quote.billable_failure_classes,
    'free_failure_classes', v_quote.free_failure_classes,
    'included_quantity', v_quote.included_quantity,
    'retention_policy', v_quote.retention_policy,
    'provider_funding_summary', v_quote.provider_funding_summary,
    'quote_hash', v_quote.quote_hash, 'expires_at', v_quote.expires_at,
    'accepted_at', v_accepted, 'execution_authorized', false
  );
end;
$$;

create or replace function tongs.accept_quote(
  p_quote_id uuid,
  p_acceptance_id uuid,
  p_acceptance_key text,
  p_quote_hash text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_quote tongs.customer_spending_quotes%rowtype;
  v_existing tongs.customer_spending_quote_acceptances%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_acceptance_id is null or length(btrim(coalesce(p_acceptance_key, ''))) < 8
     or p_quote_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid quote acceptance' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('quote-acceptance:' || p_quote_id::text, 0));
  select * into v_quote from tongs.customer_spending_quotes
  where id = p_quote_id and user_id = v_user;
  if not found then raise exception 'spending quote not found' using errcode = 'P0002'; end if;
  if v_quote.expires_at <= now() then raise exception 'spending quote expired' using errcode = 'P0001'; end if;
  if v_quote.quote_hash <> p_quote_hash then raise exception 'accepted quote hash mismatch' using errcode = '22023'; end if;
  select * into v_existing from tongs.customer_spending_quote_acceptances where quote_id = p_quote_id;
  if found then
    if v_existing.user_id <> v_user or v_existing.acceptance_key <> btrim(p_acceptance_key)
       or v_existing.accepted_quote_hash <> p_quote_hash then
      raise exception 'quote acceptance replay conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('acceptance_id', v_existing.id, 'replay', true,
      'execution_authorized', false);
  end if;
  insert into tongs.customer_spending_quote_acceptances(
    id, quote_id, user_id, acceptance_key, accepted_quote_hash
  ) values (p_acceptance_id, p_quote_id, v_user, btrim(p_acceptance_key), p_quote_hash);
  return jsonb_build_object('acceptance_id', p_acceptance_id, 'replay', false,
    'execution_authorized', false);
end;
$$;


create or replace function tongs._current_paid_execution_control()
returns tongs.paid_execution_control_revisions
language sql stable security definer set search_path = pg_catalog as $$
  select control.* from tongs.paid_execution_control_revisions control
  order by control.revision desc limit 1;
$$;

create or replace function tongs._funding_reservation_state(p_reservation_id uuid)
returns text language sql stable security definer set search_path = pg_catalog as $$
  select event.event_type from tongs.funding_reservation_events event
  where event.reservation_id = p_reservation_id order by event.sequence desc limit 1;
$$;

create or replace function tongs._active_funding_hold(
  p_source_type text,
  p_source_id uuid
) returns table(customer_charge_micros bigint, credit_units bigint, wholesale_spend_micros bigint)
language sql stable security definer set search_path = pg_catalog as $$
  select
    coalesce(sum(reservation.reserved_customer_charge_micros), 0)::bigint,
    coalesce(sum(reservation.reserved_credit_units), 0)::bigint,
    coalesce(sum(reservation.reserved_wholesale_spend_micros), 0)::bigint
  from tongs.funding_reservations reservation
  where reservation.funding_source_type = p_source_type
    and reservation.funding_source_id = p_source_id
    and tongs._funding_reservation_state(reservation.id) not in ('settled', 'released');
$$;

create or replace function tongs.commit_private_pricing_revision(
  p_policy_id uuid,
  p_policy_code text,
  p_scope_kind text,
  p_provider text,
  p_sku text,
  p_expected_revision integer,
  p_revision_id uuid,
  p_markup_basis_points integer,
  p_customer_credit_units bigint,
  p_currency text,
  p_cost_components jsonb,
  p_billable_failure_classes jsonb,
  p_free_failure_classes jsonb,
  p_included_quantity jsonb,
  p_retention_policy jsonb,
  p_change_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_policy tongs.private_pricing_policies%rowtype;
  v_existing tongs.private_pricing_revisions%rowtype;
  v_previous tongs.private_pricing_revisions%rowtype;
  v_revision integer;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_components jsonb := coalesce(p_cost_components, '[]'::jsonb);
  v_component jsonb;
  v_ordinal integer := 0;
  v_success numeric := 0;
  v_failure numeric := 0;
  v_success_price numeric;
  v_failure_price numeric;
  v_state text;
  v_hash text;
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
begin
  if v_actor is null or not tongs.is_platform_operator(v_actor) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  if p_policy_id is null or p_revision_id is null
     or nullif(btrim(coalesce(p_policy_code, '')), '') is null
     or p_scope_kind not in ('default', 'provider', 'sku')
     or v_currency !~ '^[A-Z]{3}$'
     or jsonb_typeof(v_components) <> 'array' or jsonb_array_length(v_components) = 0
     or jsonb_typeof(coalesce(p_billable_failure_classes, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_free_failure_classes, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_included_quantity, 'null'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_retention_policy, 'null'::jsonb)) <> 'object'
     or p_markup_basis_points < 0 or p_customer_credit_units < 0
     or (p_markup_basis_points is not null and p_customer_credit_units is null)
     or v_reason is null then
    raise exception 'invalid private pricing revision' using errcode = '22023';
  end if;
  if (p_scope_kind = 'default' and (nullif(btrim(coalesce(p_provider, '')), '') is not null or nullif(btrim(coalesce(p_sku, '')), '') is not null))
     or (p_scope_kind = 'provider' and (nullif(btrim(coalesce(p_provider, '')), '') is null or nullif(btrim(coalesce(p_sku, '')), '') is not null))
     or (p_scope_kind = 'sku' and (nullif(btrim(coalesce(p_provider, '')), '') is null or nullif(btrim(coalesce(p_sku, '')), '') is null)) then
    raise exception 'pricing scope does not match provider and SKU' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('private-pricing:' || p_policy_id::text, 0));
  select * into v_policy from tongs.private_pricing_policies where id = p_policy_id;
  if not found then
    insert into tongs.private_pricing_policies(id, policy_code, scope_kind, provider, sku, created_by)
    values (p_policy_id, btrim(p_policy_code), p_scope_kind,
      nullif(lower(btrim(coalesce(p_provider, ''))), ''), nullif(lower(btrim(coalesce(p_sku, ''))), ''), v_actor)
    returning * into v_policy;
  elsif v_policy.policy_code <> btrim(p_policy_code) or v_policy.scope_kind <> p_scope_kind
     or v_policy.provider is distinct from nullif(lower(btrim(coalesce(p_provider, ''))), '')
     or v_policy.sku is distinct from nullif(lower(btrim(coalesce(p_sku, ''))), '') then
    raise exception 'pricing policy identity conflict' using errcode = '23505';
  end if;
  select * into v_existing from tongs.private_pricing_revisions where id = p_revision_id;
  if found then return jsonb_build_object('revision_id', v_existing.id, 'revision', v_existing.revision,
    'state', v_existing.lifecycle_state, 'replay', true, 'activation_enabled', false); end if;
  select * into v_previous from tongs.private_pricing_revisions
    where policy_id = p_policy_id order by revision desc limit 1;
  if coalesce(v_previous.revision, 0) <> coalesce(p_expected_revision, 0) then
    raise exception 'stale private pricing revision' using errcode = '40001';
  end if;

  for v_component in select value from jsonb_array_elements(v_components) loop
    v_ordinal := v_ordinal + 1;
    if jsonb_typeof(v_component) <> 'object'
       or nullif(btrim(coalesce(v_component->>'component_code', '')), '') is null
       or v_component->>'component_kind' not in (
         'direct_provider', 'supporting_provider', 'compute', 'storage', 'bandwidth_egress',
         'transactional_notification', 'payment_processing', 'retention_tail', 'contingency')
       or v_component->>'credential_funding' not in ('forge', 'byo_customer')
       or nullif(btrim(coalesce(v_component->>'provider_label', '')), '') is null
       or nullif(btrim(coalesce(v_component->>'cost_policy_revision', '')), '') is null
       or v_component->>'tail_policy' not in ('none', 'included_until', 'plan_funded', 'recurring_metered')
       or not (v_component ? 'success_ceiling_micros')
       or not (v_component ? 'failure_ceiling_micros') then
      raise exception 'unpriced or invalid cost component at ordinal %', v_ordinal using errcode = '22023';
    end if;
    if (v_component->>'success_ceiling_micros')::numeric < 0
       or (v_component->>'failure_ceiling_micros')::numeric < 0
       or (v_component->>'failure_ceiling_micros')::numeric > (v_component->>'success_ceiling_micros')::numeric
       or (v_component->>'credential_funding' = 'byo_customer'
         and ((v_component->>'success_ceiling_micros')::numeric <> 0
           or (v_component->>'failure_ceiling_micros')::numeric <> 0))
       or (v_component->>'tail_policy' = 'included_until'
         and nullif(v_component#>>'{tail_policy_details,included_until}', '') is null) then
      raise exception 'invalid cost ceiling, BYO cost, or tail policy at ordinal %', v_ordinal using errcode = '22023';
    end if;
    v_success := v_success + (v_component->>'success_ceiling_micros')::numeric;
    v_failure := v_failure + (v_component->>'failure_ceiling_micros')::numeric;
  end loop;
  if v_success > 9223372036854775807::numeric or v_failure > 9223372036854775807::numeric then
    raise exception 'pricing cost stack overflows bigint micros' using errcode = '22003';
  end if;
  if p_markup_basis_points is null then
    v_state := 'draft'; v_success_price := null; v_failure_price := null;
  else
    v_state := 'review_ready';
    v_success_price := ceil(v_success * (10000::numeric + p_markup_basis_points::numeric) / 10000::numeric);
    v_failure_price := ceil(v_failure * (10000::numeric + p_markup_basis_points::numeric) / 10000::numeric);
    if v_success_price > 9223372036854775807::numeric or v_failure_price > 9223372036854775807::numeric then
      raise exception 'pricing customer ceiling overflows bigint micros' using errcode = '22003';
    end if;
    if v_success_price > 0 and coalesce(p_customer_credit_units, 0) = 0 then
      raise exception 'positive customer price requires positive credit units' using errcode = '22023';
    end if;
  end if;
  v_revision := coalesce(v_previous.revision, 0) + 1;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'policy_id', p_policy_id, 'revision', v_revision, 'currency', v_currency,
    'markup_basis_points', p_markup_basis_points, 'customer_credit_units', p_customer_credit_units,
    'cost_components', v_components, 'billable_failure_classes', p_billable_failure_classes,
    'free_failure_classes', p_free_failure_classes, 'included_quantity', p_included_quantity,
    'retention_policy', p_retention_policy, 'change_reason', v_reason
  )::text, 'utf8'), 'sha256'), 'hex');
  insert into tongs.private_pricing_revisions(
    id, policy_id, revision, previous_revision_id, lifecycle_state, currency,
    markup_basis_points, full_cost_ceiling_micros, failure_cost_ceiling_micros,
    customer_price_ceiling_micros, billable_failure_ceiling_micros, customer_credit_units,
    billable_failure_classes, free_failure_classes, included_quantity, retention_policy,
    change_reason, content_hash, actor_id
  ) values (
    p_revision_id, p_policy_id, v_revision, v_previous.id, v_state, v_currency,
    p_markup_basis_points, v_success::bigint, v_failure::bigint,
    v_success_price::bigint, v_failure_price::bigint,
    case when p_markup_basis_points is null then null else p_customer_credit_units end,
    p_billable_failure_classes, p_free_failure_classes, p_included_quantity, p_retention_policy,
    v_reason, v_hash, v_actor
  );
  v_ordinal := 0;
  for v_component in select value from jsonb_array_elements(v_components) loop
    v_ordinal := v_ordinal + 1;
    insert into tongs.private_pricing_cost_components(
      pricing_revision_id, ordinal, component_code, component_kind, credential_funding,
      provider_label, success_ceiling_micros, failure_ceiling_micros, cost_policy_revision,
      tail_policy, tail_policy_details
    ) values (
      p_revision_id, v_ordinal, btrim(v_component->>'component_code'), v_component->>'component_kind',
      v_component->>'credential_funding', btrim(v_component->>'provider_label'),
      (v_component->>'success_ceiling_micros')::bigint, (v_component->>'failure_ceiling_micros')::bigint,
      btrim(v_component->>'cost_policy_revision'), v_component->>'tail_policy',
      coalesce(v_component->'tail_policy_details', '{}'::jsonb)
    );
  end loop;
  return jsonb_build_object('revision_id', p_revision_id, 'revision', v_revision, 'state', v_state,
    'activation_enabled', false, 'replay', false);
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'paid_execution_control_revisions', 'private_pricing_policies', 'private_pricing_revisions',
    'private_pricing_cost_components', 'customer_spending_quotes',
    'customer_spending_quote_acceptances', 'funding_reservations',
    'funding_reservation_events', 'pricing_discrepancies'
  ] loop
    execute format('alter table tongs.%I enable row level security', v_table);
    execute format('revoke all on tongs.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select on tongs.%I to service_role', v_table);
  end loop;
end;
$$;

revoke all on function tongs._require_pricing_service_role() from public, anon, authenticated, service_role;
revoke all on function tongs._current_paid_execution_control() from public, anon, authenticated, service_role;
revoke all on function tongs._funding_reservation_state(uuid) from public, anon, authenticated, service_role;
revoke all on function tongs._active_funding_hold(text, uuid) from public, anon, authenticated, service_role;

revoke all on function tongs.commit_private_pricing_revision(uuid,text,text,text,text,integer,uuid,integer,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,text) from public, anon;
revoke all on function tongs.preview_private_price(uuid) from public, anon;
revoke all on function tongs.preview_price(uuid) from public, anon;
grant execute on function tongs.commit_private_pricing_revision(uuid,text,text,text,text,integer,uuid,integer,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,text) to authenticated;
grant execute on function tongs.preview_private_price(uuid) to authenticated, service_role;
grant execute on function tongs.preview_price(uuid) to authenticated, service_role;

revoke all on function tongs.create_shadow_spending_quote(uuid,uuid,text,text,uuid,uuid,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function tongs.reserve_operation(uuid,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function tongs.begin_provider_attempt(uuid,text,integer,jsonb) from public, anon, authenticated;
revoke all on function tongs.mark_submission_unknown(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.record_provider_failure(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.settle_operation(uuid,uuid,text,text,text,bigint,jsonb) from public, anon, authenticated;
revoke all on function tongs.release_operation(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function tongs.create_shadow_spending_quote(uuid,uuid,text,text,uuid,uuid,text,jsonb,timestamptz) to service_role;
grant execute on function tongs.reserve_operation(uuid,uuid,text,uuid,text) to service_role;
grant execute on function tongs.begin_provider_attempt(uuid,text,integer,jsonb) to service_role;
grant execute on function tongs.mark_submission_unknown(uuid,text,text,jsonb) to service_role;
grant execute on function tongs.record_provider_failure(uuid,text,text,jsonb) to service_role;
grant execute on function tongs.settle_operation(uuid,uuid,text,text,text,bigint,jsonb) to service_role;
grant execute on function tongs.release_operation(uuid,text,text,jsonb) to service_role;

revoke all on function tongs.accept_quote(uuid,uuid,text,text) from public, anon;
revoke all on function tongs.read_my_spending_quote(uuid) from public, anon;
revoke all on function tongs.read_my_spending_operation(text) from public, anon;
revoke all on function tongs.read_owner_pricing_reservations(integer) from public, anon;
grant execute on function tongs.accept_quote(uuid,uuid,text,text) to authenticated;
grant execute on function tongs.read_my_spending_quote(uuid) to authenticated;
grant execute on function tongs.read_my_spending_operation(text) to authenticated;
grant execute on function tongs.read_owner_pricing_reservations(integer) to authenticated, service_role;

comment on table tongs.private_pricing_revisions is
  'Owner-only immutable cost-plus revisions. This release seeds no markup and supports no active lifecycle state.';
comment on table tongs.funding_reservations is
  'Verified-funding holds. Test deposits and legacy credits are not valid source types.';
comment on function tongs.begin_provider_attempt(uuid,text,integer,jsonb) is
  'Shadow lease interface. Returns provider_execution_authorized=false until a later approved control revision.';
comment on function tongs.read_my_spending_quote(uuid) is
  'Customer-safe accepted-price view; excludes wholesale cost, markup, margin, fees, and internal evidence.';

notify pgrst, 'reload schema';

commit;
