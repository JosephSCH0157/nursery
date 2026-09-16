-- Canonical Test/Live customer financial parity.
--
-- Test and Live are accounting/configuration dimensions on one financial
-- workflow. This migration publishes no price, creates no allowance grant,
-- enrolls no customer, and activates no provider route.

begin;

-- ---------------------------------------------------------------------------
-- Runtime configuration and immutable environment context
-- ---------------------------------------------------------------------------

create table tongs.financial_environment_configuration_revisions (
  environment text not null check (environment in ('test', 'live')),
  revision integer not null check (revision > 0),
  lifecycle_state text not null check (lifecycle_state in (
    'structurally_ready', 'certification_ready', 'inactive_ready', 'retired'
  )),
  workflow_contract text not null check (workflow_contract = 'forge.customer-financial-path.v2'),
  route_code text not null check (route_code = 'hearth.chat_completion'),
  provider text not null check (provider = 'openai'),
  model text not null check (model = 'gpt-5.6-luna'),
  cost_policy_revision_id uuid references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  pricing_revision_id uuid references tongs.private_pricing_revisions(id) on delete restrict,
  wholesale_exposure_ceiling_micros bigint not null check (wholesale_exposure_ceiling_micros = 11015),
  maximum_concurrency integer not null check (maximum_concurrency = 1),
  rolling_window_seconds integer not null check (rolling_window_seconds = 86400),
  maximum_operation_count integer not null check (maximum_operation_count = 1),
  required_stripe_identifier_slots jsonb not null check (
    jsonb_typeof(required_stripe_identifier_slots) = 'array'
    and required_stripe_identifier_slots @> '["ai_credit_pack_price_ids","subscription_price_ids","webhook_endpoint_secret"]'::jsonb
  ),
  reason text not null check (nullif(btrim(reason), '') is not null),
  created_at timestamptz not null default now(),
  primary key (environment, revision),
  check (
    lifecycle_state = 'structurally_ready'
    or (cost_policy_revision_id is not null and pricing_revision_id is not null)
  )
);

create table tongs.financial_runtime_environment_revisions (
  revision integer primary key check (revision > 0),
  financial_environment text not null check (financial_environment in ('test', 'live')),
  reason text not null check (nullif(btrim(reason), '') is not null),
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table tongs.stripe_customer_environment_identifiers (
  user_id uuid not null references auth.users(id) on delete restrict,
  financial_environment text not null check (financial_environment in ('test', 'live')),
  stripe_customer_id text not null check (nullif(btrim(stripe_customer_id), '') is not null),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, financial_environment),
  unique (financial_environment, stripe_customer_id)
);

insert into tongs.stripe_customer_environment_identifiers(
  user_id, financial_environment, stripe_customer_id, evidence_json, created_at
)
select distinct on (coalesce(event.user_id, customer.user_id), case when event.livemode then 'live' else 'test' end)
  coalesce(event.user_id, customer.user_id),
  case when event.livemode then 'live' else 'test' end,
  event.stripe_customer_id,
  jsonb_build_object('source', 'billing_event', 'stripe_event_id', event.stripe_event_id),
  event.processed_at
from tongs.billing_events event
left join tongs.billing_customers customer
  on customer.stripe_customer_id = event.stripe_customer_id
where coalesce(event.user_id, customer.user_id) is not null
  and event.stripe_customer_id is not null
  and event.livemode is not null
order by coalesce(event.user_id, customer.user_id),
  case when event.livemode then 'live' else 'test' end,
  event.processed_at desc;

insert into tongs.financial_environment_configuration_revisions(
  environment, revision, lifecycle_state, workflow_contract, route_code,
  provider, model, wholesale_exposure_ceiling_micros, maximum_concurrency,
  rolling_window_seconds, maximum_operation_count, required_stripe_identifier_slots, reason
) values
  ('test', 1, 'structurally_ready', 'forge.customer-financial-path.v2',
   'hearth.chat_completion', 'openai', 'gpt-5.6-luna', 11015, 1, 86400, 1,
   '["ai_credit_pack_price_ids","subscription_price_ids","webhook_endpoint_secret"]',
   'Unified financial path installed; commercial price remains approval-gated.'),
  ('live', 1, 'structurally_ready', 'forge.customer-financial-path.v2',
   'hearth.chat_completion', 'openai', 'gpt-5.6-luna', 11015, 1, 86400, 1,
   '["ai_credit_pack_price_ids","subscription_price_ids","webhook_endpoint_secret"]',
   'Live-compatible configuration installed inactive; commercial price remains approval-gated.');

insert into tongs.financial_runtime_environment_revisions(
  revision, financial_environment, reason, actor_id
) values (1, 'test', 'Development and beta use Stripe Test through the canonical financial path.', null);

create or replace function tongs._current_financial_environment()
returns text language sql stable security definer set search_path = pg_catalog as $$
  select financial_environment
  from tongs.financial_runtime_environment_revisions
  order by revision desc
  limit 1
$$;

create or replace function tongs.read_financial_runtime_environment()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_environment text;
  v_configuration tongs.financial_environment_configuration_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  v_environment := tongs._current_financial_environment();
  select * into v_configuration
  from tongs.financial_environment_configuration_revisions
  where environment = v_environment
  order by revision desc limit 1;
  return jsonb_build_object(
    'contract_version', 'forge.financial-runtime.v1',
    'financial_environment', v_environment,
    'configuration_revision', v_configuration.revision,
    'configuration_state', v_configuration.lifecycle_state,
    'workflow_contract', v_configuration.workflow_contract
  );
end $$;

create or replace function tongs.read_stripe_customer_environment_identifier(
  p_user_id uuid,
  p_financial_environment text
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_identifier tongs.stripe_customer_environment_identifiers%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_financial_environment not in ('test', 'live') then
    raise exception 'invalid financial environment' using errcode = '22023';
  end if;
  select * into v_identifier
  from tongs.stripe_customer_environment_identifiers
  where user_id = p_user_id and financial_environment = p_financial_environment;
  return jsonb_build_object(
    'financial_environment', p_financial_environment,
    'stripe_customer_id', v_identifier.stripe_customer_id
  );
end $$;

create or replace function tongs.record_stripe_customer_environment_identifier(
  p_user_id uuid,
  p_financial_environment text,
  p_stripe_customer_id text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_existing text;
begin
  perform tongs._require_pricing_service_role();
  if p_financial_environment not in ('test', 'live')
     or nullif(btrim(coalesce(p_stripe_customer_id, '')), '') is null then
    raise exception 'valid financial environment and Stripe customer are required' using errcode = '22023';
  end if;
  select stripe_customer_id into v_existing
  from tongs.stripe_customer_environment_identifiers
  where user_id = p_user_id and financial_environment = p_financial_environment;
  if found and v_existing <> btrim(p_stripe_customer_id) then
    raise exception 'environment-scoped Stripe customer already exists' using errcode = '23505';
  end if;
  insert into tongs.stripe_customer_environment_identifiers(
    user_id, financial_environment, stripe_customer_id, evidence_json
  ) values (
    p_user_id, p_financial_environment, btrim(p_stripe_customer_id), coalesce(p_evidence_json, '{}'::jsonb)
  ) on conflict (user_id, financial_environment) do nothing;
  return jsonb_build_object(
    'financial_environment', p_financial_environment,
    'stripe_customer_id', btrim(p_stripe_customer_id)
  );
end $$;

create or replace function tongs.activate_financial_runtime_environment(
  p_environment text,
  p_actor_id uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_configuration tongs.financial_environment_configuration_revisions%rowtype;
  v_revision integer;
begin
  perform tongs._require_pricing_service_role();
  if p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or p_environment not in ('test', 'live')
     or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'platform operator and activation reason required' using errcode = '42501';
  end if;
  select * into v_configuration
  from tongs.financial_environment_configuration_revisions
  where environment = p_environment
  order by revision desc limit 1;
  if not found or v_configuration.lifecycle_state not in ('certification_ready', 'inactive_ready')
     or v_configuration.cost_policy_revision_id is null
     or v_configuration.pricing_revision_id is null then
    raise exception 'financial environment is not activation-ready' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('financial-runtime-environment'));
  select coalesce(max(revision), 0) + 1 into v_revision
  from tongs.financial_runtime_environment_revisions;
  insert into tongs.financial_runtime_environment_revisions(
    revision, financial_environment, reason, actor_id
  ) values (v_revision, p_environment, btrim(p_reason), p_actor_id);
  return jsonb_build_object(
    'financial_environment', p_environment,
    'runtime_revision', v_revision,
    'configuration_revision', v_configuration.revision
  );
end $$;

create or replace function tongs.bind_financial_environment_configuration_pair(
  p_actor_id uuid,
  p_pricing_revision_id uuid,
  p_cost_policy_revision_id uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_pricing tongs.private_pricing_revisions%rowtype;
  v_policy tongs.private_pricing_policies%rowtype;
  v_cost tongs.openai_text_cost_policy_revisions%rowtype;
  v_publication tongs.private_pricing_publications%rowtype;
  v_test_revision integer;
  v_live_revision integer;
  v_expected_sku text;
begin
  perform tongs._require_pricing_service_role();
  if p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'platform operator and configuration reason required' using errcode = '42501';
  end if;
  select * into v_pricing from tongs.private_pricing_revisions where id = p_pricing_revision_id;
  select * into v_policy from tongs.private_pricing_policies where id = v_pricing.policy_id;
  select * into v_cost from tongs.openai_text_cost_policy_revisions where id = p_cost_policy_revision_id;
  v_expected_sku := 'openai-text:hearth.chat_completion:gpt-5.6-luna:' || p_cost_policy_revision_id::text;
  select distinct on (publication.policy_id) publication.* into v_publication
  from tongs.private_pricing_publications publication
  where publication.policy_id = v_policy.id
  order by publication.policy_id, publication.publication_revision desc;
  if v_pricing.id is null or v_policy.id is null or v_cost.id is null
     or v_publication.action is distinct from 'published'
     or v_publication.pricing_revision_id is distinct from v_pricing.id
     or v_pricing.lifecycle_state <> 'review_ready' or v_pricing.currency <> 'USD'
     or v_pricing.markup_basis_points <> 3300
     or v_pricing.full_cost_ceiling_micros <> 11015
     or v_pricing.failure_cost_ceiling_micros <> 0
     or v_pricing.customer_price_ceiling_micros <> 20000
     or v_pricing.customer_credit_units <> 2
     or v_policy.scope_kind <> 'sku' or lower(v_policy.provider) <> 'openai'
     or lower(v_policy.sku) <> lower(v_expected_sku)
     or v_cost.route_code <> 'hearth.chat_completion'
     or v_cost.full_cost_ceiling_micros <> 11015
     or v_cost.maximum_input_units <> 2000 or v_cost.maximum_output_units <> 512
     or v_cost.maximum_attempts <> 1 or v_cost.cost_coverage <> 'complete'
     or v_cost.lifecycle_state not in ('pilot_candidate', 'active') then
    raise exception 'published environment-neutral Luna pricing and bounded cost policy required' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('financial-environment-configuration-pair', 0));
  select coalesce(max(revision), 0) + 1 into v_test_revision
  from tongs.financial_environment_configuration_revisions where environment = 'test';
  select coalesce(max(revision), 0) + 1 into v_live_revision
  from tongs.financial_environment_configuration_revisions where environment = 'live';
  insert into tongs.financial_environment_configuration_revisions(
    environment, revision, lifecycle_state, workflow_contract, route_code,
    provider, model, cost_policy_revision_id, pricing_revision_id,
    wholesale_exposure_ceiling_micros, maximum_concurrency,
    rolling_window_seconds, maximum_operation_count,
    required_stripe_identifier_slots, reason
  ) values
    ('test', v_test_revision, 'certification_ready', 'forge.customer-financial-path.v2',
     'hearth.chat_completion', 'openai', 'gpt-5.6-luna', p_cost_policy_revision_id,
     p_pricing_revision_id, 11015, 1, 86400, 1,
     '["ai_credit_pack_price_ids","subscription_price_ids","webhook_endpoint_secret"]', btrim(p_reason)),
    ('live', v_live_revision, 'inactive_ready', 'forge.customer-financial-path.v2',
     'hearth.chat_completion', 'openai', 'gpt-5.6-luna', p_cost_policy_revision_id,
     p_pricing_revision_id, 11015, 1, 86400, 1,
     '["ai_credit_pack_price_ids","subscription_price_ids","webhook_endpoint_secret"]', btrim(p_reason));
  return jsonb_build_object(
    'test_configuration_revision', v_test_revision,
    'live_configuration_revision', v_live_revision,
    'pricing_revision_id', p_pricing_revision_id,
    'cost_policy_revision_id', p_cost_policy_revision_id,
    'workflow_contract', 'forge.customer-financial-path.v2'
  );
end $$;

create table tongs.financial_parity_baseline_captures (
  id uuid primary key,
  baseline_kind text not null unique check (baseline_kind = 'pre_unified_financial_path'),
  summary_json jsonb not null check (jsonb_typeof(summary_json) = 'object'),
  summary_hash text not null check (summary_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now()
);

with baseline as (
  select jsonb_build_object(
    'accounting_journal_event_count', (select count(*) from tongs.accounting_journal_events),
    'customer_deposit_count', (select count(*) from tongs.customer_deposits),
    'canonical_consumption_count', (select count(*) from tongs.customer_deposit_consumptions),
    'test_simulator_consumption_count', (select count(*) from tongs.test_customer_deposit_consumptions),
    'test_certification_consumption_count', (select count(*) from tongs.openai_text_test_certification_consumptions),
    'legacy_opening_balance_count', (select count(*) from tongs.legacy_credit_opening_balances),
    'legacy_opening_credit_units', (select coalesce(sum(credit_units), 0) from tongs.legacy_credit_opening_balances),
    'openai_rollout_revisions', (select count(*) from tongs.openai_text_rollout_revisions),
    'published_pricing_revisions', (select count(*) from tongs.private_pricing_publications)
  ) summary_json
)
insert into tongs.financial_parity_baseline_captures(
  id, baseline_kind, summary_json, summary_hash
)
select
  '14ef37cc-642c-4ff1-9e08-18a899d10001'::uuid,
  'pre_unified_financial_path',
  summary_json,
  encode(extensions.digest(convert_to(summary_json::text, 'utf8'), 'sha256'), 'hex')
from baseline;

alter table tongs.customer_spending_quotes
  add column financial_environment text not null default 'legacy_unverified'
    check (financial_environment in ('test', 'live', 'legacy_unverified'));

alter table tongs.funding_reservations
  add column funding_environment text not null default 'legacy_unverified'
    check (funding_environment in ('test', 'live', 'owner_internal', 'legacy_unverified')),
  add column rollout_authorization_id uuid;

alter table tongs.paid_allowance_grants
  add column financial_environment text not null default 'legacy_unverified'
    check (financial_environment in ('test', 'live', 'legacy_unverified'));

alter table tongs.restricted_beta_exposure_holds
  add column funding_environment text not null default 'legacy_unverified'
    check (funding_environment in ('test', 'live', 'owner_internal', 'legacy_unverified'));

-- Existing immutable records receive a derived environment without changing
-- any economic values or identifiers.
alter table tongs.paid_allowance_grants disable trigger user;
update tongs.paid_allowance_grants allowance
set financial_environment = receipt.stripe_mode
from tongs.subscription_cycle_receipts receipt
where receipt.id = allowance.receipt_id;
alter table tongs.paid_allowance_grants enable trigger user;

alter table tongs.funding_reservations disable trigger user;
update tongs.funding_reservations reservation
set funding_environment = case reservation.funding_source_type
  when 'customer_deposit' then (
    select deposit.stripe_mode from tongs.customer_deposits deposit
    where deposit.id = reservation.funding_source_id
  )
  when 'paid_allowance' then (
    select allowance.financial_environment from tongs.paid_allowance_grants allowance
    where allowance.id = reservation.funding_source_id
  )
  when 'owner_budget' then 'owner_internal'
  else 'legacy_unverified'
end;
alter table tongs.funding_reservations enable trigger user;

alter table tongs.customer_spending_quotes disable trigger user;
update tongs.customer_spending_quotes quote
set financial_environment = reservation.funding_environment
from tongs.funding_reservations reservation
where reservation.quote_id = quote.id
  and reservation.funding_environment in ('test', 'live');
alter table tongs.customer_spending_quotes enable trigger user;

alter table tongs.restricted_beta_exposure_holds disable trigger user;
update tongs.restricted_beta_exposure_holds
set funding_environment = case funding_class
  when 'test_customer' then 'test'
  when 'owner_operating_budget' then 'owner_internal'
  when 'verified_customer_deposit' then 'live'
  when 'economically_backed_allowance' then 'live'
  else 'legacy_unverified'
end;
alter table tongs.restricted_beta_exposure_holds enable trigger user;

create or replace function tongs._stamp_spending_quote_environment()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_environment text;
begin
  v_environment := tongs._current_financial_environment();
  if v_environment not in ('test', 'live') then
    raise exception 'trusted financial runtime environment is unavailable' using errcode = '42501';
  end if;
  new.financial_environment := v_environment;
  return new;
end $$;

create trigger customer_spending_quotes_financial_environment
before insert on tongs.customer_spending_quotes
for each row execute function tongs._stamp_spending_quote_environment();

create or replace function tongs._stamp_paid_allowance_environment()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  select receipt.stripe_mode into new.financial_environment
  from tongs.subscription_cycle_receipts receipt
  where receipt.id = new.receipt_id;
  if new.financial_environment not in ('test', 'live') then
    raise exception 'allowance receipt environment is unavailable' using errcode = 'P0002';
  end if;
  return new;
end $$;

create trigger paid_allowance_grants_financial_environment
before insert on tongs.paid_allowance_grants
for each row execute function tongs._stamp_paid_allowance_environment();

-- ---------------------------------------------------------------------------
-- Generic customer rollout authority (not a financial workflow)
-- ---------------------------------------------------------------------------

create table tongs.customer_paid_execution_scope_authorizations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  financial_environment text not null check (financial_environment in ('test', 'live')),
  route_code text not null,
  provider text not null check (provider in ('openai', 'runway')),
  model_or_sku text not null,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  cost_policy_revision_id uuid references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  maximum_operation_count integer not null check (maximum_operation_count > 0),
  maximum_customer_charge_micros bigint not null check (maximum_customer_charge_micros >= 0),
  maximum_wholesale_exposure_micros bigint not null check (maximum_wholesale_exposure_micros > 0),
  maximum_concurrency integer not null check (maximum_concurrency > 0),
  rolling_window_seconds integer not null check (rolling_window_seconds > 0),
  valid_from timestamptz not null,
  valid_until timestamptz not null check (valid_until > valid_from),
  status text not null check (status in ('active', 'closed')),
  reason text not null check (nullif(btrim(reason), '') is not null),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table tongs.funding_reservations
  add constraint funding_reservations_rollout_authorization_fkey
  foreign key (rollout_authorization_id)
  references tongs.customer_paid_execution_scope_authorizations(id)
  on delete restrict;

create or replace function tongs.create_customer_paid_execution_scope_authorization(
  p_authorization_id uuid,
  p_actor_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_financial_environment text,
  p_route_code text,
  p_provider text,
  p_model_or_sku text,
  p_pricing_revision_id uuid,
  p_cost_policy_revision_id uuid,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_config tongs.financial_environment_configuration_revisions%rowtype;
  v_existing tongs.customer_paid_execution_scope_authorizations%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or p_authorization_id is null or p_user_id is null or p_workspace_id is null
     or p_financial_environment not in ('test', 'live')
     or p_provider not in ('openai', 'runway')
     or p_valid_from is null or p_valid_until <= p_valid_from
     or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'invalid paid execution scope authorization' using errcode = '22023';
  end if;
  select * into v_existing
  from tongs.customer_paid_execution_scope_authorizations
  where id = p_authorization_id;
  if found then
    return to_jsonb(v_existing) || jsonb_build_object('replay', true);
  end if;
  select * into v_config
  from tongs.financial_environment_configuration_revisions
  where environment = p_financial_environment
  order by revision desc limit 1;
  if not found or v_config.lifecycle_state not in ('certification_ready', 'inactive_ready')
     or v_config.pricing_revision_id is distinct from p_pricing_revision_id
     or v_config.cost_policy_revision_id is distinct from p_cost_policy_revision_id
     or v_config.route_code <> p_route_code
     or v_config.provider <> p_provider
     or v_config.model <> p_model_or_sku then
    raise exception 'matching activation-ready financial configuration required' using errcode = '42501';
  end if;
  if p_provider = 'openai' and (
    v_config.wholesale_exposure_ceiling_micros <> 11015
    or v_config.maximum_concurrency <> 1
    or v_config.rolling_window_seconds <> 86400
    or v_config.maximum_operation_count <> 1
  ) then
    raise exception 'bounded Luna certification controls required' using errcode = 'P0001';
  end if;
  insert into tongs.customer_paid_execution_scope_authorizations(
    id, user_id, workspace_id, financial_environment, route_code, provider,
    model_or_sku, pricing_revision_id, cost_policy_revision_id,
    maximum_operation_count, maximum_customer_charge_micros,
    maximum_wholesale_exposure_micros, maximum_concurrency,
    rolling_window_seconds, valid_from, valid_until, status, reason, created_by
  ) values (
    p_authorization_id, p_user_id, p_workspace_id, p_financial_environment,
    p_route_code, p_provider, p_model_or_sku, p_pricing_revision_id,
    p_cost_policy_revision_id, v_config.maximum_operation_count, 20000,
    v_config.wholesale_exposure_ceiling_micros, v_config.maximum_concurrency,
    v_config.rolling_window_seconds, p_valid_from, p_valid_until, 'active',
    btrim(p_reason), p_actor_id
  );
  return jsonb_build_object('authorization_id', p_authorization_id, 'replay', false);
end $$;

create or replace function tongs._stamp_and_authorize_funding_reservation()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_quote tongs.customer_spending_quotes%rowtype;
  v_source_environment text;
  v_binding tongs.openai_text_customer_quote_bindings%rowtype;
  v_authorization tongs.customer_paid_execution_scope_authorizations%rowtype;
  v_prior_count bigint;
  v_active_count bigint;
begin
  select * into v_quote from tongs.customer_spending_quotes where id = new.quote_id;
  if not found then raise exception 'spending quote not found' using errcode = 'P0002'; end if;

  if new.funding_source_type = 'customer_deposit' then
    select stripe_mode into v_source_environment
    from tongs.customer_deposits where id = new.funding_source_id;
  elsif new.funding_source_type = 'paid_allowance' then
    select financial_environment into v_source_environment
    from tongs.paid_allowance_grants where id = new.funding_source_id;
  elsif new.funding_source_type = 'owner_budget' then
    v_source_environment := 'owner_internal';
  else
    v_source_environment := v_quote.financial_environment;
  end if;
  if v_source_environment is null then
    raise exception 'funding source environment is unavailable' using errcode = 'P0002';
  end if;
  if new.funding_source_type in ('customer_deposit', 'paid_allowance')
     and v_source_environment <> v_quote.financial_environment then
    raise exception 'cross-environment customer funding is forbidden' using errcode = '42501';
  end if;
  new.funding_environment := v_source_environment;

  if new.funding_source_type not in ('customer_deposit', 'paid_allowance') then
    return new;
  end if;

  select * into v_binding
  from tongs.openai_text_customer_quote_bindings
  where quote_id = new.quote_id;
  if not found then
    raise exception 'generic paid execution authorization requires an immutable provider quote binding' using errcode = '42501';
  end if;
  select scope_auth.* into v_authorization
  from tongs.customer_paid_execution_scope_authorizations scope_auth
  where scope_auth.user_id = new.user_id
    and scope_auth.workspace_id = v_binding.workspace_id
    and scope_auth.financial_environment = v_source_environment
    and scope_auth.route_code = v_binding.route_code
    and scope_auth.provider = 'openai'
    and scope_auth.model_or_sku = v_binding.runtime_model
    and scope_auth.pricing_revision_id = v_binding.pricing_revision_id
    and scope_auth.cost_policy_revision_id = v_binding.cost_policy_revision_id
    and scope_auth.status = 'active'
    and scope_auth.valid_from <= now()
    and scope_auth.valid_until > now()
  order by scope_auth.created_at desc limit 1;
  if not found
     or new.reserved_customer_charge_micros > v_authorization.maximum_customer_charge_micros
     or new.reserved_wholesale_spend_micros > v_authorization.maximum_wholesale_exposure_micros then
    raise exception 'customer paid execution is not authorized for this scope' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('paid-scope:' || v_authorization.id::text, 0));
  select count(*) into v_prior_count
  from tongs.funding_reservations reservation
  where reservation.rollout_authorization_id = v_authorization.id;
  if v_prior_count >= v_authorization.maximum_operation_count then
    raise exception 'customer paid execution operation limit reached' using errcode = 'P0001';
  end if;
  select count(*) into v_active_count
  from tongs.funding_reservations reservation
  where reservation.rollout_authorization_id = v_authorization.id
    and tongs._funding_reservation_state(reservation.id) in (
      'reserved', 'attempt_started', 'provider_attempt_shadowed', 'submission_unknown'
    );
  if v_active_count >= v_authorization.maximum_concurrency then
    raise exception 'customer paid execution concurrency limit reached' using errcode = 'P0001';
  end if;
  new.rollout_authorization_id := v_authorization.id;
  return new;
end $$;

drop trigger if exists funding_reservations_customer_test_scope on tongs.funding_reservations;
create trigger funding_reservations_financial_environment
before insert on tongs.funding_reservations
for each row execute function tongs._stamp_and_authorize_funding_reservation();

-- The prior canary could publish pricing and enable execution. Preserve its
-- evidence, but revoke it as an authority.
revoke all on function tongs.activate_customer_hearth_chat_luna_test(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Make the existing single workflow mode-aware
-- ---------------------------------------------------------------------------

create or replace function tongs._select_customer_funding_for_quote(p_quote_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_quote tongs.customer_spending_quotes%rowtype;
  v_authority tongs.spending_quote_authority_bindings%rowtype;
  v_source record;
  v_control tongs.paid_execution_control_revisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_quote from tongs.customer_spending_quotes where id = p_quote_id;
  if not found then raise exception 'spending quote not found' using errcode = 'P0002'; end if;
  if v_quote.financial_environment not in ('test', 'live') then
    return jsonb_build_object('eligible', false, 'funding_source', 'none',
      'funding_environment', v_quote.financial_environment,
      'customer_label', 'Historical quote has no spendable financial environment');
  end if;
  select * into v_authority from tongs.spending_quote_authority_bindings where quote_id = p_quote_id;
  if not found then
    v_authority.acting_user_id := v_quote.user_id;
    v_authority.payer_kind := 'personal';
    v_authority.payer_user_id := v_quote.user_id;
  end if;

  if v_authority.payer_kind = 'owner_testing' then
    select * into v_control from tongs._current_paid_execution_control();
    select 'owner_budget'::text source_type, budget.id source_id,
      'owner_internal'::text funding_environment,
      'Private owner testing (no customer charge)'::text customer_label,
      budget.period_end sort_time
    into v_source
    from tongs.owner_operating_budgets budget
    join lateral (
      select revision.* from tongs.owner_operating_budget_revisions revision
      where revision.budget_id = budget.id order by revision.revision desc limit 1
    ) latest on true
    left join lateral tongs._active_funding_hold('owner_budget', budget.id) held on true
    where v_control.owner_budget_spending_enabled
      and budget.owner_testing_user_id = v_authority.acting_user_id
      and latest.status = 'active' and latest.maximum_amount_micros is not null
      and now() >= budget.period_start and now() < budget.period_end
      and budget.currency = v_quote.currency
      and (budget.workspace_id is null or budget.workspace_id = v_quote.workspace_id)
      and (budget.provider is null or lower(budget.provider) = 'openai')
      and (budget.route is null or budget.route = v_quote.tool)
      and latest.maximum_amount_micros - held.wholesale_spend_micros >= v_quote.full_cost_ceiling_micros
    order by budget.period_end asc limit 1;
  else
    select candidate.* into v_source from (
      select 'customer_deposit'::text source_type, deposit.id source_id,
        deposit.stripe_mode funding_environment,
        case when v_authority.payer_kind = 'organization_shared'
          then 'Organization shared purchased credits'
          else 'Verified AI credit purchase' end customer_label,
        deposit.received_at sort_time
      from tongs.customer_deposits deposit
      join tongs.customer_deposit_processor_fees fee on fee.deposit_id = deposit.id
      left join lateral (
        select coalesce(sum(c.recognized_revenue_micros), 0)::bigint used_charge,
          coalesce(sum(c.credit_units_consumed), 0)::bigint used_units
        from tongs.customer_deposit_consumptions c where c.deposit_id = deposit.id
      ) used on true
      left join lateral (
        select coalesce(sum(r.liability_release_micros), 0)::bigint refunded_charge,
          coalesce(sum(r.refunded_credit_units), 0)::bigint refunded_units
        from tongs.customer_deposit_refunds r where r.deposit_id = deposit.id
      ) refunded on true
      left join lateral tongs._active_funding_hold('customer_deposit', deposit.id) held on true
      where deposit.user_id = v_authority.payer_user_id
        and deposit.stripe_mode = v_quote.financial_environment
        and deposit.currency = v_quote.currency
        and deposit.gross_amount_micros - used.used_charge - refunded.refunded_charge
          - held.customer_charge_micros >= v_quote.normal_maximum_charge_micros
        and deposit.credit_units - used.used_units - refunded.refunded_units
          - held.credit_units >= v_quote.customer_credit_units
      union all
      select 'paid_allowance', allowance.id, allowance.financial_environment,
        case when v_authority.payer_kind = 'organization_shared'
          then 'Organization shared paid allowance' else 'Paid-plan allowance' end,
        allowance.period_end
      from tongs.paid_allowance_grants allowance
      left join lateral (
        select coalesce(sum(c.recognized_revenue_micros), 0)::bigint used_charge,
          coalesce(sum(c.entitlement_units_consumed), 0)::bigint used_units,
          coalesce(sum(c.wholesale_spend_micros), 0)::bigint used_wholesale
        from tongs.paid_allowance_consumptions c where c.allowance_grant_id = allowance.id
      ) used on true
      left join lateral tongs._active_funding_hold('paid_allowance', allowance.id) held on true
      where allowance.user_id = v_authority.payer_user_id
        and allowance.financial_environment = v_quote.financial_environment
        and allowance.currency = v_quote.currency
        and now() >= allowance.period_start and now() < allowance.period_end
        and not exists (
          select 1 from tongs.subscription_cycle_adjustments adjustment
          where adjustment.receipt_id = allowance.receipt_id
        )
        and allowance.allocated_revenue_micros - used.used_charge
          - held.customer_charge_micros >= v_quote.normal_maximum_charge_micros
        and allowance.entitlement_units - used.used_units
          - held.credit_units >= v_quote.customer_credit_units
        and allowance.maximum_wholesale_spend_micros - used.used_wholesale
          - held.wholesale_spend_micros >= v_quote.full_cost_ceiling_micros
    ) candidate
    order by case candidate.source_type when 'customer_deposit' then 1 else 2 end,
      candidate.sort_time asc limit 1;
  end if;
  if not found then
    return jsonb_build_object(
      'eligible', false,
      'funding_source', 'none',
      'funding_environment', v_quote.financial_environment,
      'payer_kind', v_authority.payer_kind,
      'customer_label', case when v_authority.payer_kind = 'owner_testing'
        then 'Owner testing selected; an active explicit budget is still required'
        else 'No verified eligible funds for the active environment' end
    );
  end if;
  return jsonb_build_object(
    'eligible', true,
    'funding_source', v_source.source_type,
    'funding_source_id', v_source.source_id,
    'funding_environment', v_source.funding_environment,
    'payer_kind', v_authority.payer_kind,
    'payer_user_id', v_authority.payer_user_id,
    'customer_label', v_source.customer_label
  );
end $$;

-- Remove only the obsolete Live-only guards and select account context from
-- the immutable source environment. Assertions make upstream drift fail.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.reserve_operation(uuid,uuid,text,uuid,text)'::regprocedure) into definition;
  changed := replace(definition,
    'IF v_deposit.stripe_mode <> ''live'' THEN\n        RAISE EXCEPTION ''test deposits cannot fund live reservations'' USING ERRCODE = ''42501'';\n    END IF;',
    'IF v_deposit.stripe_mode <> v_quote.financial_environment THEN\n        RAISE EXCEPTION ''cross-environment customer funding is forbidden'' USING ERRCODE = ''42501'';\n    END IF;');
  if changed = definition then
    changed := regexp_replace(definition,
      'if v_deposit\.stripe_mode <> ''live'' then[[:space:]]*raise exception ''test deposits cannot fund live reservations'' using errcode = ''42501'';[[:space:]]*end if;',
      'if v_deposit.stripe_mode <> v_quote.financial_environment then raise exception ''cross-environment customer funding is forbidden'' using errcode = ''42501''; end if;', 'i');
  end if;
  if changed = definition or position('cross-environment customer funding is forbidden' in changed) = 0 then
    raise exception 'reserve_operation Live-only guard changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.consume_customer_deposit(uuid,uuid,text,text,bigint,bigint,timestamptz,jsonb)'::regprocedure) into definition;
  changed := regexp_replace(definition,
    'if v_deposit\.stripe_mode <> ''live'' then[[:space:]]*raise exception ''test deposits cannot fund live customer consumption'' using errcode = ''42501'';[[:space:]]*end if;',
    '', 'i');
  changed := replace(changed, '''customer_deposit_consumed'', ''live'',', '''customer_deposit_consumed'', v_deposit.stripe_mode,');
  changed := replace(changed, '''customer_prepaid_liability''',
    'case when v_deposit.stripe_mode = ''live'' then ''customer_prepaid_liability'' else ''test_customer_prepaid_balance'' end');
  changed := replace(changed, '''service_revenue''',
    'case when v_deposit.stripe_mode = ''live'' then ''service_revenue'' else ''test_ai_consumption_revenue'' end');
  changed := replace(changed, '''live_customer_credits''',
    'case when v_deposit.stripe_mode = ''live'' then ''live_customer_credits'' else ''test_customer_credits'' end');
  if changed = definition or position('test_ai_consumption_revenue' in changed) = 0
     or position('test_customer_credits' in changed) = 0 then
    raise exception 'consume_customer_deposit parity rewrite failed';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.create_paid_allowance_grant(uuid,uuid,bigint,bigint,bigint,text,timestamptz,jsonb)'::regprocedure) into definition;
  changed := regexp_replace(definition,
    'if v_receipt\.stripe_mode <> ''live'' then[[:space:]]*raise exception ''test subscription receipt cannot back a live allowance'' using errcode = ''42501'';[[:space:]]*end if;',
    '', 'i');
  changed := replace(changed, '''paid_allowance_granted'', ''live'',', '''paid_allowance_granted'', v_receipt.stripe_mode,');
  changed := replace(changed, '''subscription_deferred_liability''',
    'case when v_receipt.stripe_mode = ''live'' then ''subscription_deferred_liability'' else ''test_subscription_balance'' end');
  changed := replace(changed, '''allowance_deferred_liability''',
    'case when v_receipt.stripe_mode = ''live'' then ''allowance_deferred_liability'' else ''test_allowance_deferred_balance'' end');
  changed := replace(changed, '''allowance_entitlement_units''',
    'case when v_receipt.stripe_mode = ''live'' then ''allowance_entitlement_units'' else ''test_allowance_entitlement_units'' end');
  changed := replace(changed, '''allowance_wholesale_capacity_micros''',
    'case when v_receipt.stripe_mode = ''live'' then ''allowance_wholesale_capacity_micros'' else ''test_allowance_wholesale_capacity_micros'' end');
  if changed = definition or position('test_allowance_deferred_balance' in changed) = 0 then
    raise exception 'create_paid_allowance_grant parity rewrite failed';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.consume_paid_allowance(uuid,uuid,text,text,bigint,bigint,bigint,timestamptz,jsonb)'::regprocedure) into definition;
  changed := replace(definition, '''paid_allowance_consumed'',\n        ''live'',', '''paid_allowance_consumed'',\n        v_grant.financial_environment,');
  changed := regexp_replace(changed,
    '''paid_allowance_consumed'',[[:space:]]*''live'',',
    '''paid_allowance_consumed'', v_grant.financial_environment,', 'i');
  changed := replace(changed, '''allowance_deferred_liability''',
    'case when v_grant.financial_environment = ''live'' then ''allowance_deferred_liability'' else ''test_allowance_deferred_balance'' end');
  changed := replace(changed, '''service_revenue''',
    'case when v_grant.financial_environment = ''live'' then ''service_revenue'' else ''test_ai_consumption_revenue'' end');
  changed := replace(changed, '''allowance_entitlement_units''',
    'case when v_grant.financial_environment = ''live'' then ''allowance_entitlement_units'' else ''test_allowance_entitlement_units'' end');
  changed := replace(changed, '''allowance_wholesale_capacity_micros''',
    'case when v_grant.financial_environment = ''live'' then ''allowance_wholesale_capacity_micros'' else ''test_allowance_wholesale_capacity_micros'' end');
  if changed = definition or position('v_grant.financial_environment' in changed) = 0
     or position('test_allowance_entitlement_units' in changed) = 0 then
    raise exception 'consume_paid_allowance parity rewrite failed';
  end if;
  execute changed;
end $$;

create or replace function tongs._aggregate_funding_class(p_reservation tongs.funding_reservations)
returns text language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if p_reservation.funding_source_type = 'customer_deposit' then
    return 'verified_customer_deposit';
  elsif p_reservation.funding_source_type = 'paid_allowance' then
    return 'economically_backed_allowance';
  elsif p_reservation.funding_source_type = 'owner_budget' then
    return 'owner_operating_budget';
  elsif p_reservation.funding_source_type = 'none' then
    return 'byo';
  end if;
  raise exception 'unsupported aggregate funding source' using errcode = '22023';
end $$;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'tongs.restricted_beta_exposure_holds'::regclass
      and pg_get_constraintdef(oid) ilike '%provider_mode%test_customer%'
  loop
    execute format('alter table tongs.restricted_beta_exposure_holds drop constraint %I', constraint_name);
  end loop;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.reserve_restricted_beta_exposure(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,integer,text)'::regprocedure) into definition;
  changed := regexp_replace(definition,
    'if p_provider_mode=''real'' and p_funding_class=''test_customer'' then return jsonb_build_object\(''authorized'',false,''reason'',''test_funding_real_provider_forbidden''\); end if;',
    '', 'i');
  if changed = definition then
    raise exception 'restricted-beta Test-provider prohibition changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

-- Stamp newly created exposure holds from the canonical reservation whenever
-- the opaque funding handle is the reservation UUID. Historical rows retain
-- their backfilled context.
create or replace function tongs._stamp_restricted_beta_funding_environment()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_reservation_id uuid;
begin
  begin
    v_reservation_id := nullif(current_setting('forge.funding_reservation_id', true), '')::uuid;
  exception when others then
    v_reservation_id := null;
  end;
  if v_reservation_id is not null then
    select funding_environment into new.funding_environment
    from tongs.funding_reservations where id = v_reservation_id;
  end if;
  if new.funding_environment = 'legacy_unverified' then
    new.funding_environment := case new.funding_class
      when 'owner_operating_budget' then 'owner_internal'
      else tongs._current_financial_environment()
    end;
  end if;
  return new;
end $$;

create trigger restricted_beta_exposure_holds_financial_environment
before insert on tongs.restricted_beta_exposure_holds
for each row execute function tongs._stamp_restricted_beta_funding_environment();

-- Return immutable environment context in the existing quote, reservation,
-- handle, and provider-context contracts without adding a parallel RPC path.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure) into definition;
  changed := replace(definition,
    '''funding_label'', COALESCE(v_funding ->> ''customer_label''::text, ''No verified eligible funds''::text),',
    '''funding_label'', COALESCE(v_funding ->> ''customer_label''::text, ''No verified eligible funds''::text), ''funding_environment'', v_quote.financial_environment,');
  if changed = definition then
    changed := regexp_replace(definition,
      '''funding_label'',[[:space:]]*coalesce\(v_funding->>''customer_label'',''No verified eligible funds''\),',
      '''funding_label'',coalesce(v_funding->>''customer_label'',''No verified eligible funds''),''funding_environment'',v_quote.financial_environment,', 'i');
  end if;
  if changed = definition or position('funding_environment' in changed) = 0 then
    raise exception 'OpenAI quote environment contract insertion failed';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.reserve_customer_openai_text_quote(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text)'::regprocedure) into definition;
  changed := regexp_replace(definition,
    '''request_fingerprint'',[[:space:]]*p_request_fingerprint\)',
    '''request_fingerprint'',p_request_fingerprint,''funding_environment'',(select funding_environment from tongs.funding_reservations where id=p_reservation_id))', 'i');
  if changed = definition or position('funding_environment' in changed) = 0 then
    raise exception 'OpenAI funding handle environment insertion failed';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text)'::regprocedure) into definition;
  changed := replace(definition,
    '''funding_source_type'', v_res.funding_source_type,',
    '''funding_source_type'', v_res.funding_source_type, ''funding_environment'', v_res.funding_environment,');
  if changed = definition then
    changed := regexp_replace(definition,
      '''funding_source_type'',[[:space:]]*v_res\.funding_source_type,',
      '''funding_source_type'',v_res.funding_source_type,''funding_environment'',v_res.funding_environment,', 'i');
  end if;
  if changed = definition or position('funding_environment' in changed) = 0 then
    raise exception 'OpenAI provider context environment insertion failed';
  end if;
  execute changed;
end $$;

-- ---------------------------------------------------------------------------
-- Environment-aware customer funding read model
-- ---------------------------------------------------------------------------

create or replace function tongs.read_my_customer_funding()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_environment text;
  v_environments jsonb;
  v_active jsonb;
  v_reservations jsonb;
  v_legacy jsonb;
  v_deposits jsonb;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_environment := tongs._current_financial_environment();

  with environment_names as (
    select unnest(array['test'::text, 'live'::text]) as environment
  ), deposit_balances as (
    select deposit.*,
      exists(select 1 from tongs.customer_deposit_processor_fees fee where fee.deposit_id = deposit.id) fee_verified,
      coalesce(used.used_charge, 0)::bigint used_charge,
      coalesce(used.used_units, 0)::bigint used_units,
      coalesce(refunded.refunded_charge, 0)::bigint refunded_charge,
      coalesce(refunded.refunded_units, 0)::bigint refunded_units,
      coalesce(held.customer_charge_micros, 0)::bigint held_charge,
      coalesce(held.credit_units, 0)::bigint held_units
    from tongs.customer_deposits deposit
    left join lateral (
      select coalesce(sum(c.recognized_revenue_micros), 0) used_charge,
        coalesce(sum(c.credit_units_consumed), 0) used_units
      from tongs.customer_deposit_consumptions c where c.deposit_id = deposit.id
    ) used on true
    left join lateral (
      select coalesce(sum(r.liability_release_micros), 0) refunded_charge,
        coalesce(sum(r.refunded_credit_units), 0) refunded_units
      from tongs.customer_deposit_refunds r where r.deposit_id = deposit.id
    ) refunded on true
    left join lateral tongs._active_funding_hold('customer_deposit', deposit.id) held on true
    where deposit.user_id = v_user
  ), allowance_balances as (
    select allowance.*,
      coalesce(used.used_revenue, 0)::bigint used_revenue,
      coalesce(used.used_units, 0)::bigint used_units,
      coalesce(used.used_wholesale, 0)::bigint used_wholesale,
      coalesce(held.customer_charge_micros, 0)::bigint held_charge,
      coalesce(held.credit_units, 0)::bigint held_units,
      coalesce(held.wholesale_spend_micros, 0)::bigint held_wholesale
    from tongs.paid_allowance_grants allowance
    left join lateral (
      select coalesce(sum(c.recognized_revenue_micros), 0) used_revenue,
        coalesce(sum(c.entitlement_units_consumed), 0) used_units,
        coalesce(sum(c.wholesale_spend_micros), 0) used_wholesale
      from tongs.paid_allowance_consumptions c where c.allowance_grant_id = allowance.id
    ) used on true
    left join lateral tongs._active_funding_hold('paid_allowance', allowance.id) held on true
    where allowance.user_id = v_user and now() >= allowance.period_start and now() < allowance.period_end
      and not exists(select 1 from tongs.subscription_cycle_adjustments a where a.receipt_id = allowance.receipt_id)
  ), summaries as (
    select environment_names.environment,
      jsonb_build_object(
        'purchased', jsonb_build_object(
          'currency', 'USD',
          'available_micros', coalesce(sum(greatest(d.gross_amount_micros-d.used_charge-d.refunded_charge-d.held_charge,0)) filter(where d.fee_verified),0),
          'available_credit_units', coalesce(sum(greatest(d.credit_units-d.used_units-d.refunded_units-d.held_units,0)) filter(where d.fee_verified),0),
          'pending_fee_deposit_count', count(d.id) filter(where not d.fee_verified),
          'pending_fee_micros', coalesce(sum(d.gross_amount_micros) filter(where not d.fee_verified),0),
          'provider_execution_eligible', coalesce(sum(greatest(d.credit_units-d.used_units-d.refunded_units-d.held_units,0)) filter(where d.fee_verified),0)>0
        ),
        'allowances', jsonb_build_object(
          'currency', 'USD',
          'available_revenue_micros', coalesce((select sum(greatest(a.allocated_revenue_micros-a.used_revenue-a.held_charge,0)) from allowance_balances a where a.financial_environment=environment_names.environment),0),
          'available_entitlement_units', coalesce((select sum(greatest(a.entitlement_units-a.used_units-a.held_units,0)) from allowance_balances a where a.financial_environment=environment_names.environment),0),
          'available_wholesale_micros', coalesce((select sum(greatest(a.maximum_wholesale_spend_micros-a.used_wholesale-a.held_wholesale,0)) from allowance_balances a where a.financial_environment=environment_names.environment),0),
          'provider_execution_eligible', coalesce((select bool_or(a.entitlement_units-a.used_units-a.held_units>0 and a.maximum_wholesale_spend_micros-a.used_wholesale-a.held_wholesale>0) from allowance_balances a where a.financial_environment=environment_names.environment),false)
        )
      ) summary
    from environment_names
    left join deposit_balances d on d.stripe_mode = environment_names.environment
    group by environment_names.environment
  )
  select jsonb_object_agg(environment, summary) into v_environments from summaries;

  v_active := coalesce(v_environments->v_environment, '{}'::jsonb);

  select jsonb_build_object(
    'reservation_count', count(*),
    'reserved_customer_charge_micros', coalesce(sum(reserved_customer_charge_micros), 0),
    'reserved_credit_units', coalesce(sum(reserved_credit_units), 0)
  ) into v_reservations
  from tongs.funding_reservations reservation
  where reservation.user_id = v_user
    and reservation.funding_environment = v_environment
    and tongs._funding_reservation_state(reservation.id) in (
      'reserved', 'attempt_started', 'provider_attempt_shadowed', 'submission_unknown'
    );

  select jsonb_build_object(
    'credit_units', coalesce(sum(opening.credit_units), 0),
    'provider_execution_eligible', false,
    'reason', 'legacy_unverified'
  ) into v_legacy
  from tongs.legacy_credit_opening_balances opening where opening.user_id = v_user;

  select coalesce(jsonb_agg(jsonb_build_object(
    'deposit_id', deposit.id,
    'financial_environment', deposit.stripe_mode,
    'pack_id', deposit.pack_id,
    'currency', deposit.currency,
    'gross_amount_micros', deposit.gross_amount_micros,
    'credit_units', deposit.credit_units,
    'received_at', deposit.received_at
  ) order by deposit.received_at desc), '[]'::jsonb) into v_deposits
  from tongs.customer_deposits deposit where deposit.user_id = v_user;

  return jsonb_build_object(
    'contract_version', 'forge.customer-funding.v2',
    'active_environment', v_environment,
    'environments', coalesce(v_environments, '{}'::jsonb),
    'active_spendable', coalesce(v_active, '{}'::jsonb),
    'active_reservations', coalesce(v_reservations, '{}'::jsonb),
    'legacy_unverified', coalesce(v_legacy, '{}'::jsonb),
    'deposits', coalesce(v_deposits, '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Legacy reconciliation inventory and exact-once historical backfill
-- ---------------------------------------------------------------------------

create table tongs.legacy_credit_reconciliation_cases (
  id uuid primary key,
  user_id uuid not null unique references auth.users(id) on delete restrict,
  opening_credit_units bigint not null check (opening_credit_units >= 0),
  captured_at timestamptz not null,
  source_relation text not null,
  classification text not null check (classification in (
    'pending_investigation', 'exact_reconciliation',
    'supported_pending_operator_approval', 'unsupported', 'malformed_or_conflicting'
  )),
  local_evidence_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(local_evidence_summary) = 'object'),
  unresolved_reason text,
  created_at timestamptz not null default now()
);

create table tongs.legacy_credit_reconciliation_evidence (
  id uuid primary key,
  case_id uuid not null references tongs.legacy_credit_reconciliation_cases(id) on delete restrict,
  evidence_kind text not null,
  source_identifier text not null,
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  evidence_json jsonb not null check (jsonb_typeof(evidence_json) = 'object'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (case_id, evidence_kind, source_identifier)
);

create table tongs.legacy_credit_reconciliation_decisions (
  id uuid primary key,
  case_id uuid not null references tongs.legacy_credit_reconciliation_cases(id) on delete restrict,
  classification text not null check (classification in (
    'exact_reconciliation', 'supported_pending_operator_approval',
    'unsupported', 'malformed_or_conflicting'
  )),
  decision text not null check (decision in (
    'record_exact_reconciliation', 'approve_supported_amount', 'reject_unsupported_value'
  )),
  supported_credit_units bigint not null check (supported_credit_units >= 0),
  calculation_json jsonb not null check (jsonb_typeof(calculation_json) = 'object'),
  evidence_hashes jsonb not null check (jsonb_typeof(evidence_hashes) = 'array'),
  reason text not null check (nullif(btrim(reason), '') is not null),
  actor_id uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now()
);

create table tongs.legacy_credit_conversion_mappings (
  id uuid primary key,
  case_id uuid references tongs.legacy_credit_reconciliation_cases(id) on delete restrict,
  source_kind text not null,
  source_id text not null,
  canonical_kind text not null,
  canonical_id uuid not null,
  converted_credit_units bigint not null check (converted_credit_units >= 0),
  reused_existing_journal_event boolean not null default false,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (source_kind, source_id),
  unique (canonical_kind, canonical_id)
);

-- Legacy installations do not all retain every pre-canonical credit table. The
-- evidence inventory must distinguish an absent source from a source with no
-- matching rows without making a clean installation fail this migration.
create or replace function tongs._legacy_reconciliation_user_row_count(
  p_relation_name text,
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, tongs, extensions
as $$
declare
  v_relation regclass;
  v_count bigint;
begin
  v_relation := to_regclass(p_relation_name);
  if v_relation is null then
    return 0;
  end if;

  execute format('select count(*) from %s where user_id = $1', v_relation)
    into v_count
    using p_user_id;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function tongs._legacy_reconciliation_user_row_count(text, uuid) from public;

insert into tongs.legacy_credit_reconciliation_cases(
  id, user_id, opening_credit_units, captured_at, source_relation,
  classification, local_evidence_summary, unresolved_reason
)
select extensions.uuid_generate_v5(
    '8c963238-d566-4c3d-94dd-d13a677a2402'::uuid,
    opening.user_id::text
  ),
  opening.user_id,
  opening.credit_units,
  opening.captured_at,
  opening.source_relation,
  'pending_investigation',
  jsonb_build_object(
    'legacy_purchase_rows', tongs._legacy_reconciliation_user_row_count('tongs.ai_credit_purchases', opening.user_id),
    'legacy_ledger_rows', tongs._legacy_reconciliation_user_row_count('tongs.ai_credit_ledger', opening.user_id),
    'legacy_reservation_rows', tongs._legacy_reconciliation_user_row_count('tongs.ai_credit_reservations', opening.user_id),
    'canonical_deposit_rows', tongs._legacy_reconciliation_user_row_count('tongs.customer_deposits', opening.user_id),
    'subscription_receipt_rows', tongs._legacy_reconciliation_user_row_count('tongs.subscription_cycle_receipts', opening.user_id),
    'external_payment_evidence_checked', false
  ),
  'External Stripe/payment/grant evidence has not yet established an exact roll-forward.'
from tongs.legacy_credit_opening_balances opening
on conflict (user_id) do nothing;

insert into tongs.legacy_credit_reconciliation_evidence(
  id, case_id, evidence_kind, source_identifier, evidence_hash,
  evidence_json, observed_at
)
select
  extensions.uuid_generate_v5(
    '868c3387-321a-4f35-89de-cf8d61521449'::uuid,
    reconciliation.id::text || ':local-database-inventory'
  ),
  reconciliation.id,
  'local_database_inventory',
  reconciliation.source_relation,
  encode(extensions.digest(
    convert_to(reconciliation.local_evidence_summary::text, 'utf8'),
    'sha256'
  ), 'hex'),
  reconciliation.local_evidence_summary,
  reconciliation.captured_at
from tongs.legacy_credit_reconciliation_cases reconciliation
on conflict (case_id, evidence_kind, source_identifier) do nothing;

create or replace function tongs.record_legacy_credit_reconciliation_evidence(
  p_evidence_id uuid,
  p_case_id uuid,
  p_evidence_kind text,
  p_source_identifier text,
  p_evidence_json jsonb,
  p_observed_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_hash text; v_existing tongs.legacy_credit_reconciliation_evidence%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_evidence_id is null or p_case_id is null
     or nullif(btrim(coalesce(p_evidence_kind, '')), '') is null
     or nullif(btrim(coalesce(p_source_identifier, '')), '') is null
     or jsonb_typeof(p_evidence_json) is distinct from 'object'
     or p_observed_at is null then
    raise exception 'complete reconciliation evidence is required' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(p_evidence_json::text, 'utf8'), 'sha256'), 'hex');
  select * into v_existing from tongs.legacy_credit_reconciliation_evidence
  where case_id = p_case_id and evidence_kind = btrim(p_evidence_kind)
    and source_identifier = btrim(p_source_identifier);
  if found then
    if v_existing.evidence_hash <> v_hash then
      raise exception 'reconciliation evidence replay conflict' using errcode = '23505';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('replay', true);
  end if;
  insert into tongs.legacy_credit_reconciliation_evidence(
    id, case_id, evidence_kind, source_identifier, evidence_hash,
    evidence_json, observed_at
  ) values (
    p_evidence_id, p_case_id, btrim(p_evidence_kind), btrim(p_source_identifier),
    v_hash, p_evidence_json, p_observed_at
  );
  return jsonb_build_object('evidence_id', p_evidence_id, 'evidence_hash', v_hash, 'replay', false);
end $$;

create or replace function tongs.record_legacy_credit_reconciliation_decision(
  p_decision_id uuid,
  p_case_id uuid,
  p_actor_id uuid,
  p_classification text,
  p_decision text,
  p_supported_credit_units bigint,
  p_calculation_json jsonb,
  p_evidence_hashes jsonb,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_existing tongs.legacy_credit_reconciliation_decisions%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or p_decision_id is null or p_case_id is null
     or p_classification not in (
       'exact_reconciliation', 'supported_pending_operator_approval',
       'unsupported', 'malformed_or_conflicting'
     )
     or p_decision not in (
       'record_exact_reconciliation', 'approve_supported_amount', 'reject_unsupported_value'
     )
     or p_supported_credit_units < 0
     or jsonb_typeof(p_calculation_json) is distinct from 'object'
     or jsonb_typeof(p_evidence_hashes) is distinct from 'array'
     or jsonb_array_length(p_evidence_hashes) = 0
     or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'complete operator reconciliation decision is required' using errcode = '22023';
  end if;
  if (p_classification = 'exact_reconciliation' and p_decision <> 'record_exact_reconciliation')
     or (p_classification = 'supported_pending_operator_approval' and p_decision <> 'approve_supported_amount')
     or (p_classification in ('unsupported', 'malformed_or_conflicting')
         and p_decision <> 'reject_unsupported_value') then
    raise exception 'classification and decision are inconsistent' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_evidence_hashes) hash
    where not exists (
      select 1 from tongs.legacy_credit_reconciliation_evidence evidence
      where evidence.case_id = p_case_id and evidence.evidence_hash = hash
    )
  ) then
    raise exception 'decision cites unknown evidence' using errcode = 'P0002';
  end if;
  select * into v_existing from tongs.legacy_credit_reconciliation_decisions where id = p_decision_id;
  if found then return to_jsonb(v_existing) || jsonb_build_object('replay', true); end if;
  insert into tongs.legacy_credit_reconciliation_decisions(
    id, case_id, classification, decision, supported_credit_units,
    calculation_json, evidence_hashes, reason, actor_id
  ) values (
    p_decision_id, p_case_id, p_classification, p_decision,
    p_supported_credit_units, p_calculation_json, p_evidence_hashes,
    btrim(p_reason), p_actor_id
  );
  return jsonb_build_object('decision_id', p_decision_id, 'classification', p_classification, 'replay', false);
end $$;

create or replace function tongs.record_legacy_credit_conversion_mapping(
  p_mapping_id uuid,
  p_decision_id uuid,
  p_source_kind text,
  p_source_id text,
  p_canonical_kind text,
  p_canonical_id uuid,
  p_converted_credit_units bigint,
  p_reused_existing_journal_event boolean,
  p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_decision tongs.legacy_credit_reconciliation_decisions%rowtype;
  v_existing tongs.legacy_credit_conversion_mappings%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_mapping_id is null or p_decision_id is null or p_canonical_id is null
     or nullif(btrim(coalesce(p_source_kind, '')), '') is null
     or nullif(btrim(coalesce(p_source_id, '')), '') is null
     or nullif(btrim(coalesce(p_canonical_kind, '')), '') is null
     or p_converted_credit_units < 0
     or jsonb_typeof(p_evidence_json) is distinct from 'object' then
    raise exception 'complete legacy conversion mapping is required' using errcode = '22023';
  end if;

  select * into v_decision
  from tongs.legacy_credit_reconciliation_decisions
  where id = p_decision_id;
  if not found or v_decision.decision not in (
    'record_exact_reconciliation', 'approve_supported_amount'
  ) then
    raise exception 'approved reconciliation decision is required' using errcode = '42501';
  end if;
  if p_converted_credit_units > v_decision.supported_credit_units then
    raise exception 'conversion exceeds the approved supported amount' using errcode = '22003';
  end if;

  select * into v_existing
  from tongs.legacy_credit_conversion_mappings
  where source_kind = btrim(p_source_kind) and source_id = btrim(p_source_id);
  if found then
    if v_existing.case_id is distinct from v_decision.case_id
       or v_existing.canonical_kind <> btrim(p_canonical_kind)
       or v_existing.canonical_id <> p_canonical_id
       or v_existing.converted_credit_units <> p_converted_credit_units
       or v_existing.reused_existing_journal_event <> p_reused_existing_journal_event then
      raise exception 'legacy conversion replay conflict' using errcode = '23505';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('replay', true);
  end if;

  insert into tongs.legacy_credit_conversion_mappings(
    id, case_id, source_kind, source_id, canonical_kind, canonical_id,
    converted_credit_units, reused_existing_journal_event, evidence_json
  ) values (
    p_mapping_id, v_decision.case_id, btrim(p_source_kind), btrim(p_source_id),
    btrim(p_canonical_kind), p_canonical_id, p_converted_credit_units,
    p_reused_existing_journal_event, p_evidence_json || jsonb_build_object('decision_id', p_decision_id)
  );
  return jsonb_build_object('mapping_id', p_mapping_id, 'case_id', v_decision.case_id, 'replay', false);
end $$;

create or replace function tongs.read_operator_legacy_credit_reconciliation_summary(
  p_actor_id uuid
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_cases jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_actor_id is null or not tongs.is_platform_operator(p_actor_id) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'case_id', reconciliation.id,
    'user_id', reconciliation.user_id,
    'opening_credit_units', reconciliation.opening_credit_units,
    'captured_at', reconciliation.captured_at,
    'source_relation', reconciliation.source_relation,
    'initial_classification', reconciliation.classification,
    'latest_classification', coalesce(decision.classification, reconciliation.classification),
    'supported_credit_units', decision.supported_credit_units,
    'unresolved_reason', reconciliation.unresolved_reason,
    'evidence_count', evidence.evidence_count,
    'conversion_count', conversion.conversion_count
  ) order by reconciliation.captured_at, reconciliation.user_id), '[]'::jsonb)
  into v_cases
  from tongs.legacy_credit_reconciliation_cases reconciliation
  left join lateral (
    select item.classification, item.supported_credit_units
    from tongs.legacy_credit_reconciliation_decisions item
    where item.case_id = reconciliation.id
    order by item.decided_at desc, item.id desc limit 1
  ) decision on true
  left join lateral (
    select count(*) evidence_count
    from tongs.legacy_credit_reconciliation_evidence item
    where item.case_id = reconciliation.id
  ) evidence on true
  left join lateral (
    select count(*) conversion_count
    from tongs.legacy_credit_conversion_mappings item
    where item.case_id = reconciliation.id
  ) conversion on true;
  return jsonb_build_object(
    'contract_version', 'forge.legacy-credit-reconciliation-summary.v1',
    'cases', v_cases
  );
end $$;

create table tongs.legacy_simulator_consumption_backfills (
  source_kind text not null,
  source_id uuid not null,
  canonical_consumption_id uuid not null references tongs.customer_deposit_consumptions(id) on delete restrict,
  original_journal_event_id uuid not null references tongs.accounting_journal_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (source_kind, source_id),
  unique (canonical_consumption_id)
);

-- Reuse original accounting events so historical Test debits are never
-- duplicated. Fee allocation is derived deterministically from the deposit.
with simulator_rows as (
  select 'hearth_test_simulator'::text source_kind, consumption.id source_id,
    consumption.deposit_id, consumption.user_id, consumption.operation_id,
    consumption.recognized_test_revenue_micros recognized_revenue_micros,
    consumption.credit_units_consumed, consumption.journal_event_id,
    consumption.consumed_at
  from tongs.test_customer_deposit_consumptions consumption
  union all
  select 'openai_test_certification', consumption.id,
    consumption.deposit_id, consumption.user_id, consumption.operation_id,
    consumption.recognized_test_revenue_micros,
    consumption.credit_units_consumed, consumption.journal_event_id,
    consumption.consumed_at
  from tongs.openai_text_test_certification_consumptions consumption
), authoritative as (
  select distinct on (deposit_id, operation_id) *
  from simulator_rows
  order by deposit_id, operation_id, consumed_at, source_kind
), prepared as (
  select row.*,
    coalesce(fee.fee_amount_micros, 0) fee_amount_micros,
    deposit.gross_amount_micros,
    coalesce((select sum(existing.recognized_revenue_micros) from tongs.customer_deposit_consumptions existing where existing.deposit_id = row.deposit_id), 0) prior_revenue,
    coalesce((select sum(existing.allocated_processor_fee_micros) from tongs.customer_deposit_consumptions existing where existing.deposit_id = row.deposit_id), 0) prior_fee,
    sum(row.recognized_revenue_micros) over(partition by row.deposit_id order by row.consumed_at, row.source_kind, row.source_id) cumulative_revenue
  from authoritative row
  join tongs.customer_deposits deposit on deposit.id = row.deposit_id and deposit.stripe_mode = 'test'
  left join tongs.customer_deposit_processor_fees fee on fee.deposit_id = row.deposit_id
  where not exists (
    select 1 from tongs.customer_deposit_consumptions existing
    where existing.deposit_id = row.deposit_id and existing.operation_id = row.operation_id
  )
), inserted as (
  insert into tongs.customer_deposit_consumptions(
    id, deposit_id, user_id, allocation_key, operation_id,
    recognized_revenue_micros, credit_units_consumed,
    allocated_processor_fee_micros, journal_event_id, metadata_json, consumed_at
  )
  select journal_event_id, deposit_id, user_id,
    'legacy-simulator:' || source_kind || ':' || source_id::text,
    operation_id, recognized_revenue_micros, credit_units_consumed,
    greatest(
      (fee_amount_micros * (prior_revenue + cumulative_revenue) / gross_amount_micros) - prior_fee,
      0
    ),
    journal_event_id,
    jsonb_build_object('legacy_source_kind', source_kind, 'legacy_source_id', source_id, 'journal_reused', true),
    consumed_at
  from prepared
  returning id, deposit_id, operation_id, journal_event_id
)
insert into tongs.legacy_simulator_consumption_backfills(
  source_kind, source_id, canonical_consumption_id, original_journal_event_id
)
select source.source_kind, source.source_id, canonical.id, source.journal_event_id
from simulator_rows source
join tongs.customer_deposit_consumptions canonical
  on canonical.deposit_id = source.deposit_id and canonical.operation_id = source.operation_id
where canonical.journal_event_id = source.journal_event_id
on conflict do nothing;

insert into tongs.legacy_credit_conversion_mappings(
  id, case_id, source_kind, source_id, canonical_kind, canonical_id,
  converted_credit_units, reused_existing_journal_event, evidence_json
)
select extensions.uuid_generate_v5(
    '2fdd83b2-72f6-467f-9c57-c901640e20b4'::uuid,
    backfill.source_kind || ':' || backfill.source_id::text
  ),
  reconciliation.id,
  backfill.source_kind,
  backfill.source_id::text,
  'customer_deposit_consumption',
  backfill.canonical_consumption_id,
  consumption.credit_units_consumed,
  true,
  jsonb_build_object('original_journal_event_id', backfill.original_journal_event_id)
from tongs.legacy_simulator_consumption_backfills backfill
join tongs.customer_deposit_consumptions consumption on consumption.id = backfill.canonical_consumption_id
left join tongs.legacy_credit_reconciliation_cases reconciliation on reconciliation.user_id = consumption.user_id
on conflict do nothing;

-- Preserve simulator evidence while removing every mutation/execution grant.
do $$
declare function_signature text;
begin
  for function_signature in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tongs'
      and (
        p.proname like '%hearth_chat_test%'
        or p.proname like '%openai_text_test_certification%'
      )
      and p.proname not like 'read_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', function_signature);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS, immutability, grants, and comments
-- ---------------------------------------------------------------------------

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'financial_environment_configuration_revisions',
    'financial_runtime_environment_revisions',
    'stripe_customer_environment_identifiers',
    'financial_parity_baseline_captures',
    'customer_paid_execution_scope_authorizations',
    'legacy_credit_reconciliation_cases',
    'legacy_credit_reconciliation_evidence',
    'legacy_credit_reconciliation_decisions',
    'legacy_credit_conversion_mappings',
    'legacy_simulator_consumption_backfills'
  ] loop
    execute format('alter table tongs.%I enable row level security', table_name);
    execute format('alter table tongs.%I force row level security', table_name);
    execute format('revoke all on tongs.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on tongs.%I to service_role', table_name);
    execute format(
      'create trigger %I before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',
      table_name || '_immutable', table_name
    );
  end loop;
end $$;

revoke all on function tongs._current_financial_environment() from public, anon, authenticated;
revoke all on function tongs.read_financial_runtime_environment() from public, anon, authenticated;
revoke all on function tongs.read_stripe_customer_environment_identifier(uuid,text) from public, anon, authenticated;
revoke all on function tongs.record_stripe_customer_environment_identifier(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.activate_financial_runtime_environment(text,uuid,text) from public, anon, authenticated;
revoke all on function tongs.bind_financial_environment_configuration_pair(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function tongs.create_customer_paid_execution_scope_authorization(uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid,timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function tongs.read_financial_runtime_environment() to service_role;
grant execute on function tongs.read_stripe_customer_environment_identifier(uuid,text) to service_role;
grant execute on function tongs.record_stripe_customer_environment_identifier(uuid,text,text,jsonb) to service_role;
grant execute on function tongs.activate_financial_runtime_environment(text,uuid,text) to service_role;
grant execute on function tongs.bind_financial_environment_configuration_pair(uuid,uuid,uuid,text) to service_role;
grant execute on function tongs.create_customer_paid_execution_scope_authorization(uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid,timestamptz,timestamptz,text) to service_role;

revoke all on function tongs.read_my_customer_funding() from public, anon;
revoke all on function tongs.record_legacy_credit_reconciliation_evidence(uuid,uuid,text,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function tongs.record_legacy_credit_reconciliation_decision(uuid,uuid,uuid,text,text,bigint,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function tongs.record_legacy_credit_conversion_mapping(uuid,uuid,text,text,text,uuid,bigint,boolean,jsonb) from public, anon, authenticated;
revoke all on function tongs.read_operator_legacy_credit_reconciliation_summary(uuid) from public, anon, authenticated;
grant execute on function tongs.record_legacy_credit_reconciliation_evidence(uuid,uuid,text,text,jsonb,timestamptz) to service_role;
grant execute on function tongs.record_legacy_credit_reconciliation_decision(uuid,uuid,uuid,text,text,bigint,jsonb,jsonb,text) to service_role;
grant execute on function tongs.record_legacy_credit_conversion_mapping(uuid,uuid,text,text,text,uuid,bigint,boolean,jsonb) to service_role;
grant execute on function tongs.read_operator_legacy_credit_reconciliation_summary(uuid) to service_role;
grant execute on function tongs.read_my_customer_funding() to authenticated, service_role;

comment on table tongs.financial_environment_configuration_revisions is
  'Test and Live configuration for one canonical customer financial workflow. Environment never selects a different business workflow.';
comment on table tongs.legacy_credit_reconciliation_cases is
  'One immutable investigation case per legacy opening balance. Pending or unsupported value is never spendable.';
comment on table tongs.legacy_simulator_consumption_backfills is
  'Exact-once links from retired simulator consumption to canonical deposit consumption using the original journal event.';
comment on function tongs.read_my_customer_funding() is
  'Customer funding v2: active runtime environment, separate Test/Live balances, canonical reservations, and non-spendable legacy history.';

notify pgrst, 'reload schema';
commit;
