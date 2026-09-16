-- Forge Credit economy realignment and standard-customer funding terms.
-- Test and Live share these contracts; only the active financial environment
-- may grant or spend customer value. Existing receipts remain immutable.
begin;

lock table tongs.customer_deposits in share row exclusive mode;
lock table tongs.customer_deposit_consumptions in share row exclusive mode;
lock table tongs.customer_deposit_refunds in share row exclusive mode;

create table tongs.forge_credit_contract_revisions (
  id uuid primary key default gen_random_uuid(),
  contract_code text not null,
  revision integer not null check (revision > 0),
  lifecycle_state text not null check (lifecycle_state in ('active', 'retired')),
  credit_value_micros bigint not null check (credit_value_micros = 5000),
  currency text not null check (currency = 'USD'),
  markup_basis_points integer not null check (markup_basis_points = 3300),
  tax_treatment text not null check (tax_treatment = 'pre_tax_customer_value'),
  reason text not null check (nullif(btrim(reason), '') is not null),
  created_at timestamptz not null default now(),
  unique (contract_code, revision)
);

insert into tongs.forge_credit_contract_revisions(
  contract_code, revision, lifecycle_state, credit_value_micros, currency,
  markup_basis_points, tax_treatment, reason
) values (
  'forge.credit-economy.v1', 1, 'active', 5000, 'USD', 3300,
  'pre_tax_customer_value',
  'One Forge Credit is exactly $0.005 of pre-tax customer value; supplier cost is private.'
);

create table tongs.forge_credit_pack_terms (
  id uuid primary key default gen_random_uuid(),
  contract_revision_id uuid not null references tongs.forge_credit_contract_revisions(id) on delete restrict,
  financial_environment text not null check (financial_environment in ('test', 'live')),
  pack_id text not null check (pack_id in ('ai_small', 'ai_medium', 'ai_large')),
  offer_id text not null check (nullif(btrim(offer_id), '') is not null),
  stripe_product_id text not null,
  stripe_price_id text not null,
  gross_amount_micros bigint not null check (gross_amount_micros > 0),
  credit_units bigint not null check (credit_units > 0),
  availability text not null check (availability in ('current', 'historical_replay_only')),
  effective_from timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (financial_environment, stripe_price_id, offer_id),
  check (gross_amount_micros = credit_units * 5000 or availability = 'historical_replay_only')
);

with contract as (
  select id from tongs.forge_credit_contract_revisions
  where contract_code = 'forge.credit-economy.v1' and revision = 1
), terms(environment, pack_id, offer_id, product_id, price_id, gross_micros, units, availability, reason) as (
  values
    ('test','ai_small','forge_credits_2000','prod_UFwW61glKzQWEO','price_1THQeR1OSG3CCNl8YajEHCL8',10000000::bigint,2000::bigint,'current','Canonical $10 Forge Credit pack.'),
    ('test','ai_medium','forge_credits_5000','prod_UFwWSwnxAMF7S8','price_1THQeT1OSG3CCNl8aEXhSrGx',25000000,5000,'current','Canonical $25 Forge Credit pack.'),
    ('test','ai_large','forge_credits_10000','prod_UFwWVhvFehtYC2','price_1THQeV1OSG3CCNl8XJJv7vvT',50000000,10000,'current','Canonical $50 Forge Credit pack.'),
    ('live','ai_small','forge_credits_2000','prod_UFw2TIryedKAqv','price_1THR9p1OSG3CCNl89Pm2J7BR',10000000,2000,'current','Canonical $10 Forge Credit pack.'),
    ('live','ai_medium','forge_credits_5000','prod_UFw2Enfc7CgIsd','price_1THR9q1OSG3CCNl8IKWwVQLY',25000000,5000,'current','Canonical $25 Forge Credit pack.'),
    ('live','ai_large','forge_credits_10000','prod_UFw2NvKZbPGj9Q','price_1THR9q1OSG3CCNl8KnKj1lHI',50000000,10000,'current','Canonical $50 Forge Credit pack.'),
    ('test','ai_small','forge_ai_credits_2000','prod_UFwW61glKzQWEO','price_1THQeR1OSG3CCNl8YajEHCL8',10000000,2000,'historical_replay_only','Pre-realignment current-product replay.'),
    ('test','ai_medium','forge_ai_credits_6000','prod_UFwWSwnxAMF7S8','price_1THQeT1OSG3CCNl8aEXhSrGx',25000000,6000,'historical_replay_only','Pre-realignment current-product replay.'),
    ('test','ai_large','forge_ai_credits_15000','prod_UFwWVhvFehtYC2','price_1THQeV1OSG3CCNl8XJJv7vvT',50000000,15000,'historical_replay_only','Pre-realignment current-product replay.'),
    ('live','ai_small','forge_ai_credits_2000','prod_UFw2TIryedKAqv','price_1THR9p1OSG3CCNl89Pm2J7BR',10000000,2000,'historical_replay_only','Pre-realignment current-product replay.'),
    ('live','ai_medium','forge_ai_credits_6000','prod_UFw2Enfc7CgIsd','price_1THR9q1OSG3CCNl8IKWwVQLY',25000000,6000,'historical_replay_only','Pre-realignment current-product replay.'),
    ('live','ai_large','forge_ai_credits_15000','prod_UFw2NvKZbPGj9Q','price_1THR9q1OSG3CCNl8KnKj1lHI',50000000,15000,'historical_replay_only','Pre-realignment current-product replay.'),
    ('test','ai_small','forge_ai_credits_2000','prod_TndF1ENQTGet4Q','price_1T7MSt1OSG3CCNl8p7bTPKE8',10000000,2000,'historical_replay_only','Legacy grouped-product replay.'),
    ('test','ai_medium','forge_ai_credits_6000','prod_TndF1ENQTGet4Q','price_1Sq1zI1OSG3CCNl8w823S5rR',15000000,6000,'historical_replay_only','Legacy grouped-product replay.'),
    ('test','ai_large','forge_ai_credits_15000','prod_TndF1ENQTGet4Q','price_1T83vg1OSG3CCNl8MQMqUTR0',40000000,15000,'historical_replay_only','Legacy grouped-product replay.'),
    ('live','ai_small','forge_ai_credits_2000','prod_U5TpXdkVfZtwDh','price_1T7Iry1OSG3CCNl8VQ86l8Ff',10000000,2000,'historical_replay_only','Legacy grouped-product replay.'),
    ('live','ai_medium','forge_ai_credits_6000','prod_U5TpXdkVfZtwDh','price_1T7Iry1OSG3CCNl8Oo8Myfhw',25000000,6000,'historical_replay_only','Legacy grouped-product replay.'),
    ('live','ai_large','forge_ai_credits_15000','prod_U5TpXdkVfZtwDh','price_1T7Iry1OSG3CCNl8QjxT3OiY',50000000,15000,'historical_replay_only','Legacy grouped-product replay.')
)
insert into tongs.forge_credit_pack_terms(
  contract_revision_id, financial_environment, pack_id, offer_id,
  stripe_product_id, stripe_price_id, gross_amount_micros, credit_units,
  availability, effective_from, reason
)
select contract.id, terms.environment, terms.pack_id, terms.offer_id,
  terms.product_id, terms.price_id, terms.gross_micros, terms.units,
  terms.availability, '2026-09-16T00:00:00Z'::timestamptz, terms.reason
from contract cross join terms;

create table tongs.legacy_deposit_credit_conversions (
  deposit_id uuid primary key references tongs.customer_deposits(id) on delete restrict,
  contract_revision_id uuid not null references tongs.forge_credit_contract_revisions(id) on delete restrict,
  source_credit_units bigint not null check (source_credit_units > 0),
  source_gross_amount_micros bigint not null check (source_gross_amount_micros > 0),
  baseline_recognized_revenue_micros bigint not null check (baseline_recognized_revenue_micros >= 0),
  baseline_refunded_liability_micros bigint not null check (baseline_refunded_liability_micros >= 0),
  canonical_total_credit_units bigint not null check (canonical_total_credit_units >= 0),
  canonical_available_credit_units bigint not null check (canonical_available_credit_units >= 0),
  value_remainder_micros bigint not null check (value_remainder_micros between 0 and 4999),
  conversion_method text not null check (conversion_method = 'remaining_customer_value_floor_v1'),
  evidence_json jsonb not null check (jsonb_typeof(evidence_json) = 'object'),
  converted_at timestamptz not null default now(),
  check (canonical_available_credit_units <= canonical_total_credit_units)
);

create table tongs.legacy_deposit_conversion_consumptions (
  conversion_deposit_id uuid not null references tongs.legacy_deposit_credit_conversions(deposit_id) on delete restrict,
  consumption_id uuid primary key references tongs.customer_deposit_consumptions(id) on delete restrict,
  source_credit_units bigint not null check (source_credit_units > 0),
  recognized_revenue_micros bigint not null check (recognized_revenue_micros > 0)
);

create table tongs.legacy_deposit_conversion_refunds (
  conversion_deposit_id uuid not null references tongs.legacy_deposit_credit_conversions(deposit_id) on delete restrict,
  refund_id uuid primary key references tongs.customer_deposit_refunds(id) on delete restrict,
  source_refunded_credit_units bigint not null check (source_refunded_credit_units >= 0),
  liability_release_micros bigint not null check (liability_release_micros >= 0)
);

do $$
begin
  if exists (
    select 1
    from tongs.customer_deposits deposit
    join lateral tongs._active_funding_hold('customer_deposit', deposit.id) held on true
    where deposit.credit_units <> deposit.gross_amount_micros / 5000
      and (held.customer_charge_micros <> 0 or held.credit_units <> 0 or held.wholesale_spend_micros <> 0)
  ) then
    raise exception 'legacy Forge Credit conversion requires zero active reservations' using errcode = 'P0001';
  end if;
end $$;

with contract as (
  select id from tongs.forge_credit_contract_revisions
  where contract_code = 'forge.credit-economy.v1' and revision = 1
), candidates as (
  select deposit.*,
    coalesce((select sum(c.recognized_revenue_micros) from tongs.customer_deposit_consumptions c where c.deposit_id=deposit.id),0)::bigint used_micros,
    coalesce((select sum(r.liability_release_micros) from tongs.customer_deposit_refunds r where r.deposit_id=deposit.id),0)::bigint refunded_micros
  from tongs.customer_deposits deposit
  where deposit.credit_units <> deposit.gross_amount_micros / 5000
)
insert into tongs.legacy_deposit_credit_conversions(
  deposit_id, contract_revision_id, source_credit_units, source_gross_amount_micros,
  baseline_recognized_revenue_micros, baseline_refunded_liability_micros,
  canonical_total_credit_units, canonical_available_credit_units,
  value_remainder_micros, conversion_method, evidence_json
)
select candidates.id, contract.id, candidates.credit_units, candidates.gross_amount_micros,
  candidates.used_micros, candidates.refunded_micros,
  candidates.gross_amount_micros / 5000,
  greatest(candidates.gross_amount_micros-candidates.used_micros-candidates.refunded_micros,0) / 5000,
  mod(greatest(candidates.gross_amount_micros-candidates.used_micros-candidates.refunded_micros,0),5000),
  'remaining_customer_value_floor_v1',
  jsonb_build_object('source','forward_only_migration','source_units_preserved',true,
    'source_receipt_preserved',true,'unit_value_micros',5000)
from candidates cross join contract
where candidates.used_micros + candidates.refunded_micros <= candidates.gross_amount_micros;

insert into tongs.legacy_deposit_conversion_consumptions(
  conversion_deposit_id, consumption_id, source_credit_units, recognized_revenue_micros
)
select conversion.deposit_id, consumption.id, consumption.credit_units_consumed,
  consumption.recognized_revenue_micros
from tongs.legacy_deposit_credit_conversions conversion
join tongs.customer_deposit_consumptions consumption on consumption.deposit_id=conversion.deposit_id;

insert into tongs.legacy_deposit_conversion_refunds(
  conversion_deposit_id, refund_id, source_refunded_credit_units, liability_release_micros
)
select conversion.deposit_id, refund.id, refund.refunded_credit_units, refund.liability_release_micros
from tongs.legacy_deposit_credit_conversions conversion
join tongs.customer_deposit_refunds refund on refund.deposit_id=conversion.deposit_id;

create or replace function tongs._effective_deposit_credit_units(p_deposit_id uuid)
returns bigint language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(conversion.canonical_total_credit_units, deposit.credit_units)
  from tongs.customer_deposits deposit
  left join tongs.legacy_deposit_credit_conversions conversion on conversion.deposit_id=deposit.id
  where deposit.id=p_deposit_id
$$;

create or replace function tongs._unconsumed_deposit_credit_units(p_deposit_id uuid)
returns bigint language sql stable security definer set search_path = pg_catalog as $$
  select greatest(case when conversion.deposit_id is not null then
    conversion.canonical_available_credit_units
      - coalesce((select sum(c.credit_units_consumed)
          from tongs.customer_deposit_consumptions c
          where c.deposit_id=deposit.id and not exists (
            select 1 from tongs.legacy_deposit_conversion_consumptions mapped
            where mapped.consumption_id=c.id)),0)
      - coalesce((select sum(r.refunded_credit_units)
          from tongs.customer_deposit_refunds r
          where r.deposit_id=deposit.id and not exists (
            select 1 from tongs.legacy_deposit_conversion_refunds mapped
            where mapped.refund_id=r.id)),0)
    else deposit.credit_units
      - coalesce((select sum(c.credit_units_consumed) from tongs.customer_deposit_consumptions c where c.deposit_id=deposit.id),0)
      - coalesce((select sum(r.refunded_credit_units) from tongs.customer_deposit_refunds r where r.deposit_id=deposit.id),0)
    end,0)::bigint
  from tongs.customer_deposits deposit
  left join tongs.legacy_deposit_credit_conversions conversion on conversion.deposit_id=deposit.id
  where deposit.id=p_deposit_id
$$;

create or replace function tongs._available_deposit_credit_units(p_deposit_id uuid)
returns bigint language sql stable security definer set search_path = pg_catalog as $$
  select greatest(coalesce(tongs._unconsumed_deposit_credit_units(p_deposit_id),0)
    - coalesce((select held.credit_units from tongs._active_funding_hold('customer_deposit',p_deposit_id) held),0),0)::bigint
$$;

create or replace function tongs._validate_customer_deposit_credit_term()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_offer text := nullif(btrim(coalesce(new.metadata_json->>'forge_offer_id','')), '');
begin
  if v_offer is null or not exists (
    select 1 from tongs.forge_credit_pack_terms term
    join tongs.forge_credit_contract_revisions contract on contract.id=term.contract_revision_id
    where contract.lifecycle_state='active'
      and term.financial_environment=new.stripe_mode and term.pack_id=new.pack_id
      and term.offer_id=v_offer and term.gross_amount_micros=new.gross_amount_micros
      and term.credit_units=new.credit_units
  ) then
    raise exception 'customer deposit does not match a versioned Forge Credit term' using errcode='23514';
  end if;
  return new;
end $$;

create trigger customer_deposits_credit_term
before insert on tongs.customer_deposits
for each row execute function tongs._validate_customer_deposit_credit_term();

create or replace function tongs.consume_customer_deposit(
  p_consumption_id uuid, p_deposit_id uuid, p_allocation_key text,
  p_operation_id text, p_revenue_micros bigint, p_credit_units bigint,
  p_consumed_at timestamptz, p_metadata_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_deposit tongs.customer_deposits%rowtype; v_existing tongs.customer_deposit_consumptions%rowtype;
  v_key text:=nullif(btrim(coalesce(p_allocation_key,'')),''); v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');
  v_consumed_micros bigint; v_refund_liability bigint; v_fee bigint; v_prior_fee_allocated bigint;
  v_fee_allocation bigint; v_available_units bigint; v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_consumption_id is null or p_deposit_id is null or v_key is null or v_operation is null
     or p_revenue_micros<=0 or p_credit_units<=0 then raise exception 'invalid deposit consumption' using errcode='22023'; end if;
  select * into v_deposit from tongs.customer_deposits where id=p_deposit_id for update;
  if not found then raise exception 'deposit not found' using errcode='P0002'; end if;
  select * into v_existing from tongs.customer_deposit_consumptions
    where allocation_key=v_key or (deposit_id=p_deposit_id and operation_id=v_operation) limit 1;
  if found then
    if v_existing.deposit_id<>p_deposit_id or v_existing.allocation_key<>v_key or v_existing.operation_id<>v_operation
       or v_existing.recognized_revenue_micros<>p_revenue_micros or v_existing.credit_units_consumed<>p_credit_units
    then raise exception 'deposit consumption replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('consumption_id',v_existing.id,'replay',true);
  end if;
  select fee_amount_micros into v_fee from tongs.customer_deposit_processor_fees where deposit_id=p_deposit_id;
  if not found then raise exception 'processor fee must be finalized before consumption' using errcode='P0001'; end if;
  select coalesce(sum(recognized_revenue_micros),0),coalesce(sum(allocated_processor_fee_micros),0)
    into v_consumed_micros,v_prior_fee_allocated from tongs.customer_deposit_consumptions where deposit_id=p_deposit_id;
  select coalesce(sum(liability_release_micros),0) into v_refund_liability from tongs.customer_deposit_refunds where deposit_id=p_deposit_id;
  v_available_units:=tongs._unconsumed_deposit_credit_units(p_deposit_id);
  if p_revenue_micros>v_deposit.gross_amount_micros-v_consumed_micros-v_refund_liability or p_credit_units>v_available_units
  then raise exception 'insufficient verified deposit balance' using errcode='P0001'; end if;
  v_fee_allocation:=(v_fee*(v_consumed_micros+p_revenue_micros)/v_deposit.gross_amount_micros)-v_prior_fee_allocated;
  v_payload:=jsonb_build_object('consumption_id',p_consumption_id,'deposit_id',p_deposit_id,'allocation_key',v_key,
    'operation_id',v_operation,'recognized_revenue_micros',p_revenue_micros,'credit_units_consumed',p_credit_units,
    'allocated_processor_fee_micros',v_fee_allocation,'metadata',coalesce(p_metadata_json,'{}'::jsonb));
  perform tongs._create_accounting_event(p_consumption_id,'deposit-consumption:'||v_key,'customer_deposit_consumed',
    v_deposit.stripe_mode,'forge_operation',v_operation,v_deposit.currency,v_deposit.user_id,null,null,v_payload,coalesce(p_consumed_at,now()));
  insert into tongs.customer_deposit_consumptions(id,deposit_id,user_id,allocation_key,operation_id,recognized_revenue_micros,
    credit_units_consumed,allocated_processor_fee_micros,journal_event_id,metadata_json,consumed_at)
  values(p_consumption_id,p_deposit_id,v_deposit.user_id,v_key,v_operation,p_revenue_micros,p_credit_units,
    v_fee_allocation,p_consumption_id,coalesce(p_metadata_json,'{}'::jsonb),coalesce(p_consumed_at,now())) returning * into v_existing;
  insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,deposit_id,currency,amount_micros) values
    (p_consumption_id,1,case when v_deposit.stripe_mode='live' then 'customer_prepaid_liability' else 'test_customer_prepaid_balance' end,v_deposit.user_id,p_deposit_id,v_deposit.currency,p_revenue_micros),
    (p_consumption_id,2,case when v_deposit.stripe_mode='live' then 'service_revenue' else 'test_ai_consumption_revenue' end,v_deposit.user_id,p_deposit_id,v_deposit.currency,-p_revenue_micros);
  insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,deposit_id,unit_kind,quantity_delta)
  values(p_consumption_id,3,case when v_deposit.stripe_mode='live' then 'live_customer_credits' else 'test_customer_credits' end,
    v_deposit.user_id,p_deposit_id,'forge_credit',-p_credit_units);
  perform tongs._assert_accounting_event_balanced(p_consumption_id);
  return jsonb_build_object('consumption_id',p_consumption_id,'replay',false,'allocated_processor_fee_micros',v_fee_allocation);
end $$;

create table tongs.customer_subscription_allowance_terms (
  id uuid primary key default gen_random_uuid(),
  contract_revision_id uuid not null references tongs.forge_credit_contract_revisions(id) on delete restrict,
  financial_environment text not null check (financial_environment in ('test','live')),
  plan_item_id text not null,
  interval text not null check (interval in ('monthly','quarterly')),
  policy_revision text not null,
  entitlement_units bigint not null check (entitlement_units>0),
  allocated_revenue_micros bigint not null check (allocated_revenue_micros>0),
  maximum_wholesale_spend_micros bigint not null check (maximum_wholesale_spend_micros>0),
  lifecycle_state text not null check (lifecycle_state in ('active','retired')),
  effective_from timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique(financial_environment,plan_item_id,interval,policy_revision),
  check(maximum_wholesale_spend_micros<=allocated_revenue_micros)
);

insert into tongs.customer_subscription_allowance_terms(
  contract_revision_id,financial_environment,plan_item_id,interval,policy_revision,
  entitlement_units,allocated_revenue_micros,maximum_wholesale_spend_micros,
  lifecycle_state,effective_from,reason
)
select contract.id,environment,'creator','monthly','forge.creator-monthly.allowance.v1',
  1000,5000000,3759398,'active','2026-09-01T00:00:00Z'::timestamptz,
  'Creator monthly includes 1,000 Forge Credits backed by $5.00 of cycle revenue.'
from tongs.forge_credit_contract_revisions contract
cross join (values('test'::text),('live'::text)) environments(environment)
where contract.contract_code='forge.credit-economy.v1' and contract.revision=1;

create or replace function tongs.grant_subscription_allowance_from_receipt(p_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_receipt tongs.subscription_cycle_receipts%rowtype; v_term tongs.customer_subscription_allowance_terms%rowtype;
  v_existing tongs.paid_allowance_grants%rowtype; v_result jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_receipt_id is null then raise exception 'receipt required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription-allowance:'||p_receipt_id::text,0));
  select * into v_receipt from tongs.subscription_cycle_receipts where id=p_receipt_id for update;
  if not found then raise exception 'subscription cycle receipt not found' using errcode='P0002'; end if;
  if v_receipt.stripe_mode<>tongs._current_financial_environment() then
    return jsonb_build_object('eligible',false,'reason','inactive_financial_environment','receipt_id',p_receipt_id);
  end if;
  select * into v_term from tongs.customer_subscription_allowance_terms
  where financial_environment=v_receipt.stripe_mode and plan_item_id=v_receipt.plan_item_id
    and interval=coalesce(v_receipt.metadata_json->>'forge_interval','') and lifecycle_state='active'
    and effective_from<=v_receipt.period_start order by effective_from desc limit 1;
  if not found or v_receipt.purchase_type<>'subscription' then
    return jsonb_build_object('eligible',false,'reason','no_active_allowance_term','receipt_id',p_receipt_id);
  end if;
  if exists(select 1 from tongs.subscription_cycle_adjustments where receipt_id=p_receipt_id) then
    return jsonb_build_object('eligible',false,'reason','adjusted_receipt','receipt_id',p_receipt_id);
  end if;
  if v_receipt.gross_amount_micros<v_term.allocated_revenue_micros then
    raise exception 'subscription receipt cannot back configured allowance' using errcode='P0001';
  end if;
  select * into v_existing from tongs.paid_allowance_grants
  where receipt_id=p_receipt_id and allocation_policy_revision=v_term.policy_revision;
  if found then return jsonb_build_object('eligible',true,'grant_id',v_existing.id,'replay',true); end if;
  v_result:=tongs.create_paid_allowance_grant(gen_random_uuid(),p_receipt_id,v_term.entitlement_units,
    v_term.allocated_revenue_micros,v_term.maximum_wholesale_spend_micros,v_term.policy_revision,
    greatest(v_receipt.received_at,v_receipt.period_start),jsonb_build_object('source','versioned_subscription_allowance_term','term_id',v_term.id));
  return v_result||jsonb_build_object('eligible',true,'term_id',v_term.id);
end $$;

-- Preserve cost-plus math and record the customer-facing 3-credit settlement
-- as a visible 350-micro rounding adjustment over the 14,650-micro formula.
alter table tongs.private_pricing_revisions
  add column unrounded_customer_price_micros bigint,
  add column rounding_adjustment_micros bigint,
  add column settled_customer_price_micros bigint,
  add constraint private_pricing_rounding_consistency check (
    settled_customer_price_micros is null or (
      unrounded_customer_price_micros is not null and rounding_adjustment_micros is not null
      and settled_customer_price_micros=unrounded_customer_price_micros+rounding_adjustment_micros
      and settled_customer_price_micros=customer_price_ceiling_micros
    )
  );

do $$
declare v_policy tongs.private_pricing_policies%rowtype; v_previous tongs.private_pricing_revisions%rowtype;
  v_actor uuid; v_revision_id uuid:=gen_random_uuid(); v_hash text;
begin
  select * into v_policy from tongs.private_pricing_policies where policy_code='owner-openai-hearth-chat-luna-bounded-pilot';
  select * into v_previous from tongs.private_pricing_revisions where policy_id=v_policy.id order by revision desc limit 1;
  select user_id into v_actor from tongs.platform_operators order by granted_at asc limit 1;
  if v_policy.id is null or v_previous.revision<>1 or v_previous.full_cost_ceiling_micros<>11015 or v_actor is null then
    raise exception 'bounded Luna pricing baseline changed upstream' using errcode='P0001';
  end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'policy_id',v_policy.id,'revision',2,'currency','USD','markup_basis_points',3300,
    'customer_credit_units',3,'full_cost_ceiling_micros',11015,
    'unrounded_customer_price_micros',14650,'rounding_adjustment_micros',350,
    'settled_customer_price_micros',15000,'change_reason','Forge Credit economy v1 exact Luna price')::text,'utf8'),'sha256'),'hex');
  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
    full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,
    billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,
    free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros
  ) values(v_revision_id,v_policy.id,2,v_previous.id,'review_ready','USD',3300,11015,0,15000,0,3,
    v_previous.billable_failure_classes,v_previous.free_failure_classes,v_previous.included_quantity,
    v_previous.retention_policy,'Forge Credit economy v1: ceil(11,015 x 1.33)=14,650 micros; rounded to 3 credits = 15,000 micros.',
    v_hash,v_actor,14650,350,15000);
  insert into tongs.private_pricing_cost_components
  select v_revision_id,ordinal,component_code,component_kind,credential_funding,provider_label,
    success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,tail_policy,tail_policy_details
  from tongs.private_pricing_cost_components where pricing_revision_id=v_previous.id;
  insert into tongs.private_pricing_revision_markup_sources(pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points)
  select v_revision_id,markup_rule_revision_id,3300 from tongs.private_pricing_revision_markup_sources where pricing_revision_id=v_previous.id;
  insert into tongs.private_pricing_publications(id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id)
  values(gen_random_uuid(),v_policy.id,v_revision_id,2,'published','Publish exact 3-credit Luna price for the standard customer path.',v_actor);
  insert into tongs.financial_environment_configuration_revisions(
    environment,revision,lifecycle_state,workflow_contract,route_code,provider,model,
    cost_policy_revision_id,pricing_revision_id,wholesale_exposure_ceiling_micros,
    maximum_concurrency,rolling_window_seconds,maximum_operation_count,
    required_stripe_identifier_slots,reason
  ) values
    ('test',2,'certification_ready','forge.customer-financial-path.v2','hearth.chat_completion','openai','gpt-5.6-luna',
      '10000000-0000-4000-8000-000000000010',v_revision_id,11015,1,86400,1,
      '["ai_credit_pack_price_ids","subscription_price_ids","webhook_endpoint_secret"]','Exact Forge Credit pricing ready for one standard-customer certification.'),
    ('live',2,'inactive_ready','forge.customer-financial-path.v2','hearth.chat_completion','openai','gpt-5.6-luna',
      '10000000-0000-4000-8000-000000000010',v_revision_id,11015,1,86400,1,
      '["ai_credit_pack_price_ids","subscription_price_ids","webhook_endpoint_secret"]','Live-compatible exact Forge Credit pricing remains inactive.');
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.bind_financial_environment_configuration_pair(uuid,uuid,uuid,text)'::regprocedure) into definition;
  changed:=replace(definition,'v_pricing.customer_price_ceiling_micros <> 20000','v_pricing.customer_price_ceiling_micros <> 15000');
  changed:=replace(changed,'v_pricing.customer_credit_units <> 2','v_pricing.customer_credit_units <> 3');
  if changed=definition or position('customer_credit_units <> 3' in changed)=0 then
    raise exception 'financial configuration pricing guard changed upstream';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.create_customer_paid_execution_scope_authorization(uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid,timestamptz,timestamptz,text)'::regprocedure) into definition;
  changed:=replace(definition,'p_cost_policy_revision_id, v_config.maximum_operation_count, 20000,','p_cost_policy_revision_id, v_config.maximum_operation_count, 15000,');
  if changed=definition or position('v_config.maximum_operation_count, 15000' in changed)=0 then
    raise exception 'customer scope charge guard changed upstream';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs._select_customer_funding_for_quote(uuid)'::regprocedure) into definition;
  changed:=regexp_replace(definition,
    'and deposit\.credit_units - used\.used_units - refunded\.refunded_units[[:space:]]*- held\.credit_units >= v_quote\.customer_credit_units',
    'and tongs._available_deposit_credit_units(deposit.id) >= v_quote.customer_credit_units','i');
  changed:=replace(changed,'Verified AI credit purchase','Verified Forge Credit purchase');
  if changed=definition or position('_available_deposit_credit_units' in changed)=0 then
    raise exception 'customer funding selector changed upstream';
  end if;
  execute changed;
end $$;

create or replace function tongs.read_my_customer_funding()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_user uuid:=auth.uid(); v_environment text; v_environments jsonb; v_active jsonb;
  v_reservations jsonb; v_legacy jsonb; v_deposits jsonb;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  v_environment:=tongs._current_financial_environment();
  with environment_names as (select unnest(array['test'::text,'live'::text]) environment),
  deposit_balances as (
    select deposit.*,exists(select 1 from tongs.customer_deposit_processor_fees fee where fee.deposit_id=deposit.id) fee_verified,
      coalesce(used.used_charge,0)::bigint used_charge,coalesce(refunded.refunded_charge,0)::bigint refunded_charge,
      coalesce(held.customer_charge_micros,0)::bigint held_charge,
      tongs._effective_deposit_credit_units(deposit.id) effective_units,
      tongs._available_deposit_credit_units(deposit.id) available_units
    from tongs.customer_deposits deposit
    left join lateral(select coalesce(sum(c.recognized_revenue_micros),0) used_charge from tongs.customer_deposit_consumptions c where c.deposit_id=deposit.id) used on true
    left join lateral(select coalesce(sum(r.liability_release_micros),0) refunded_charge from tongs.customer_deposit_refunds r where r.deposit_id=deposit.id) refunded on true
    left join lateral tongs._active_funding_hold('customer_deposit',deposit.id) held on true
    where deposit.user_id=v_user
  ), allowance_balances as (
    select allowance.*,coalesce(used.used_revenue,0)::bigint used_revenue,coalesce(used.used_units,0)::bigint used_units,
      coalesce(used.used_wholesale,0)::bigint used_wholesale,coalesce(held.customer_charge_micros,0)::bigint held_charge,
      coalesce(held.credit_units,0)::bigint held_units,coalesce(held.wholesale_spend_micros,0)::bigint held_wholesale
    from tongs.paid_allowance_grants allowance
    left join lateral(select coalesce(sum(c.recognized_revenue_micros),0) used_revenue,coalesce(sum(c.entitlement_units_consumed),0) used_units,
      coalesce(sum(c.wholesale_spend_micros),0) used_wholesale from tongs.paid_allowance_consumptions c where c.allowance_grant_id=allowance.id) used on true
    left join lateral tongs._active_funding_hold('paid_allowance',allowance.id) held on true
    where allowance.user_id=v_user and now()>=allowance.period_start and now()<allowance.period_end
      and not exists(select 1 from tongs.subscription_cycle_adjustments a where a.receipt_id=allowance.receipt_id)
  ), summaries as (
    select environment_names.environment,jsonb_build_object(
      'purchased',jsonb_build_object('currency','USD',
        'available_micros',coalesce(sum(greatest(d.gross_amount_micros-d.used_charge-d.refunded_charge-d.held_charge,0)) filter(where d.fee_verified),0),
        'available_credit_units',coalesce(sum(d.available_units) filter(where d.fee_verified),0),
        'pending_fee_deposit_count',count(d.id) filter(where not d.fee_verified),
        'pending_fee_micros',coalesce(sum(d.gross_amount_micros) filter(where not d.fee_verified),0),
        'provider_execution_eligible',coalesce(sum(d.available_units) filter(where d.fee_verified),0)>0),
      'allowances',jsonb_build_object('currency','USD',
        'available_revenue_micros',coalesce((select sum(greatest(a.allocated_revenue_micros-a.used_revenue-a.held_charge,0)) from allowance_balances a where a.financial_environment=environment_names.environment),0),
        'available_entitlement_units',coalesce((select sum(greatest(a.entitlement_units-a.used_units-a.held_units,0)) from allowance_balances a where a.financial_environment=environment_names.environment),0),
        'available_wholesale_micros',coalesce((select sum(greatest(a.maximum_wholesale_spend_micros-a.used_wholesale-a.held_wholesale,0)) from allowance_balances a where a.financial_environment=environment_names.environment),0),
        'provider_execution_eligible',coalesce((select bool_or(a.entitlement_units-a.used_units-a.held_units>0 and a.maximum_wholesale_spend_micros-a.used_wholesale-a.held_wholesale>0) from allowance_balances a where a.financial_environment=environment_names.environment),false))) summary
    from environment_names left join deposit_balances d on d.stripe_mode=environment_names.environment group by environment_names.environment
  ) select jsonb_object_agg(environment,summary) into v_environments from summaries;
  v_active:=coalesce(v_environments->v_environment,'{}'::jsonb);
  select jsonb_build_object('reservation_count',count(*),'reserved_customer_charge_micros',coalesce(sum(reserved_customer_charge_micros),0),
    'reserved_credit_units',coalesce(sum(reserved_credit_units),0)) into v_reservations from tongs.funding_reservations reservation
    where reservation.user_id=v_user and reservation.funding_environment=v_environment and tongs._funding_reservation_state(reservation.id)
      in('reserved','attempt_started','provider_attempt_shadowed','submission_unknown');
  select jsonb_build_object('credit_units',coalesce(sum(opening.credit_units),0),'provider_execution_eligible',false,'reason','legacy_unverified')
    into v_legacy from tongs.legacy_credit_opening_balances opening where opening.user_id=v_user;
  select coalesce(jsonb_agg(jsonb_build_object('deposit_id',deposit.id,'financial_environment',deposit.stripe_mode,
    'pack_id',deposit.pack_id,'currency',deposit.currency,'gross_amount_micros',deposit.gross_amount_micros,
    'source_credit_units',deposit.credit_units,'credit_units',tongs._effective_deposit_credit_units(deposit.id),
    'available_credit_units',tongs._available_deposit_credit_units(deposit.id),
    'conversion_value_remainder_micros',coalesce(conversion.value_remainder_micros,0),'received_at',deposit.received_at)
    order by deposit.received_at desc),'[]'::jsonb) into v_deposits from tongs.customer_deposits deposit
    left join tongs.legacy_deposit_credit_conversions conversion on conversion.deposit_id=deposit.id where deposit.user_id=v_user;
  return jsonb_build_object('contract_version','forge.customer-funding.v3','credit_contract','forge.credit-economy.v1',
    'active_environment',v_environment,'environments',coalesce(v_environments,'{}'::jsonb),'active_spendable',coalesce(v_active,'{}'::jsonb),
    'active_reservations',coalesce(v_reservations,'{}'::jsonb),'legacy_unverified',coalesce(v_legacy,'{}'::jsonb),'deposits',coalesce(v_deposits,'[]'::jsonb));
end $$;

-- Backfill only the active Test environment through the same idempotent grant
-- function used by future webhook receipts. Live terms remain inactive.
do $$
declare receipt record;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  for receipt in
    select r.id from tongs.subscription_cycle_receipts r
    where r.stripe_mode=tongs._current_financial_environment() and r.purchase_type='subscription'
      and exists(select 1 from tongs.customer_subscription_allowance_terms term
        where term.financial_environment=r.stripe_mode and term.plan_item_id=r.plan_item_id
          and term.interval=coalesce(r.metadata_json->>'forge_interval','') and term.lifecycle_state='active'
          and term.effective_from<=r.period_start)
  loop
    perform tongs.grant_subscription_allowance_from_receipt(receipt.id);
  end loop;
  perform set_config('request.jwt.claim.role','',true);
end $$;

do $$
begin
  if exists(select 1 from tongs.customer_deposits where gross_amount_micros=40000000 and credit_units=15000)
     and not exists(select 1 from tongs.customer_deposits deposit
       join tongs.legacy_deposit_credit_conversions conversion on conversion.deposit_id=deposit.id
       where deposit.gross_amount_micros=40000000 and deposit.credit_units=15000
         and conversion.canonical_available_credit_units=7982 and conversion.value_remainder_micros=0) then
    raise exception 'legacy $40 deposit did not convert to the expected 7,982 available Forge Credits';
  end if;
  if not exists(select 1 from tongs.private_pricing_revisions revision
    join tongs.private_pricing_policies policy on policy.id=revision.policy_id
    where policy.policy_code='owner-openai-hearth-chat-luna-bounded-pilot' and revision.revision=2
      and revision.full_cost_ceiling_micros=11015 and revision.markup_basis_points=3300
      and revision.unrounded_customer_price_micros=14650 and revision.rounding_adjustment_micros=350
      and revision.settled_customer_price_micros=15000 and revision.customer_credit_units=3) then
    raise exception 'exact Luna Forge Credit pricing was not installed';
  end if;
end $$;

do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'forge_credit_contract_revisions','forge_credit_pack_terms','legacy_deposit_credit_conversions',
    'legacy_deposit_conversion_consumptions','legacy_deposit_conversion_refunds','customer_subscription_allowance_terms'
  ] loop
    execute format('alter table tongs.%I enable row level security',relation_name);
    execute format('alter table tongs.%I force row level security',relation_name);
    execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',relation_name);
    execute format('grant select on tongs.%I to service_role',relation_name);
  end loop;
end $$;

create trigger forge_credit_contract_revisions_immutable before update or delete on tongs.forge_credit_contract_revisions
for each row execute function tongs._reject_accounting_mutation();
create trigger forge_credit_pack_terms_immutable before update or delete on tongs.forge_credit_pack_terms
for each row execute function tongs._reject_accounting_mutation();
create trigger legacy_deposit_credit_conversions_immutable before update or delete on tongs.legacy_deposit_credit_conversions
for each row execute function tongs._reject_accounting_mutation();
create trigger legacy_deposit_conversion_consumptions_immutable before update or delete on tongs.legacy_deposit_conversion_consumptions
for each row execute function tongs._reject_accounting_mutation();
create trigger legacy_deposit_conversion_refunds_immutable before update or delete on tongs.legacy_deposit_conversion_refunds
for each row execute function tongs._reject_accounting_mutation();
create trigger customer_subscription_allowance_terms_immutable before update or delete on tongs.customer_subscription_allowance_terms
for each row execute function tongs._reject_accounting_mutation();

revoke all on function tongs._effective_deposit_credit_units(uuid) from public,anon,authenticated;
revoke all on function tongs._unconsumed_deposit_credit_units(uuid) from public,anon,authenticated;
revoke all on function tongs._available_deposit_credit_units(uuid) from public,anon,authenticated;
revoke all on function tongs._validate_customer_deposit_credit_term() from public,anon,authenticated,service_role;
revoke all on function tongs.grant_subscription_allowance_from_receipt(uuid) from public,anon,authenticated;
grant execute on function tongs._effective_deposit_credit_units(uuid) to service_role;
grant execute on function tongs._unconsumed_deposit_credit_units(uuid) to service_role;
grant execute on function tongs._available_deposit_credit_units(uuid) to service_role;
grant execute on function tongs.grant_subscription_allowance_from_receipt(uuid) to service_role;

comment on table tongs.forge_credit_contract_revisions is 'Versioned Forge Credit denomination and customer-value contract; supplier costs are deliberately excluded.';
comment on table tongs.legacy_deposit_credit_conversions is 'Append-only bridge from historical credit counts to remaining customer value at the canonical denomination without rewriting receipts.';
comment on table tongs.customer_subscription_allowance_terms is 'Versioned paid-plan allowance economics shared by Test and Live; runtime environment activation controls grant eligibility.';

notify pgrst,'reload schema';
commit;
