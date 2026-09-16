-- Canonical, operator-provisioned Test Forge Credits for beta accounts. These
-- grants join the existing quote/reservation/settlement path and are not Stripe
-- deposits, subscription receipts, simulator balances, or legacy ai_credits.
begin;

create table tongs.beta_credit_grants (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  financial_environment text not null check (financial_environment = 'test'),
  credit_units bigint not null check (credit_units > 0),
  customer_value_micros bigint not null check (
    customer_value_micros = credit_units * 5000
  ),
  maximum_wholesale_capacity_micros bigint not null check (
    maximum_wholesale_capacity_micros = customer_value_micros
  ),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 300),
  reason text not null check (length(btrim(reason)) between 3 and 300),
  granted_by uuid not null references auth.users(id) on delete restrict,
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  granted_at timestamptz not null default now()
);

create table tongs.beta_credit_consumptions (
  id uuid primary key,
  grant_id uuid not null references tongs.beta_credit_grants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  allocation_key text not null unique check (length(btrim(allocation_key)) between 8 and 300),
  operation_id text not null check (length(btrim(operation_id)) between 8 and 300),
  credit_units_consumed bigint not null check (credit_units_consumed > 0),
  customer_value_micros bigint not null check (customer_value_micros = credit_units_consumed * 5000),
  wholesale_spend_micros bigint not null check (wholesale_spend_micros >= 0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  consumed_at timestamptz not null default now(),
  unique (grant_id, operation_id)
);

create index beta_credit_grants_user_environment_idx
  on tongs.beta_credit_grants(user_id, financial_environment, granted_at);
create index beta_credit_consumptions_grant_idx
  on tongs.beta_credit_consumptions(grant_id, consumed_at);

alter table tongs.beta_credit_grants enable row level security;
alter table tongs.beta_credit_consumptions enable row level security;
revoke all on tongs.beta_credit_grants, tongs.beta_credit_consumptions from public, anon, authenticated;
grant all on tongs.beta_credit_grants, tongs.beta_credit_consumptions to service_role;

alter table tongs.accounting_journal_entries
  add column beta_credit_grant_id uuid references tongs.beta_credit_grants(id) on delete restrict;

create trigger beta_credit_grants_immutable
before update or delete on tongs.beta_credit_grants
for each row execute function tongs._reject_accounting_mutation();
create trigger beta_credit_consumptions_immutable
before update or delete on tongs.beta_credit_consumptions
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.provision_beta_test_credits(
  p_grant_id uuid,
  p_actor_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_credit_units bigint,
  p_idempotency_key text,
  p_reason text,
  p_metadata_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  existing tongs.beta_credit_grants%rowtype;
  value_micros bigint;
  payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_grant_id is null or p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or p_user_id is null or p_workspace_id is null or p_credit_units <= 0
     or p_credit_units > 10000000
     or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 300
     or length(btrim(coalesce(p_reason, ''))) not between 3 and 300
     or jsonb_typeof(coalesce(p_metadata_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid operator beta credit grant' using errcode = '22023';
  end if;
  if tongs._current_financial_environment() <> 'test' then
    raise exception 'beta credits can only be provisioned in Test' using errcode = '42501';
  end if;
  if not exists (
    select 1 from tongs.workspace_members membership
    where membership.workspace_id = p_workspace_id and membership.user_id = p_user_id
  ) then
    raise exception 'beta customer must belong to the target workspace' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('beta-credit-grant:' || btrim(p_idempotency_key), 0));
  select * into existing from tongs.beta_credit_grants
  where id = p_grant_id or idempotency_key = btrim(p_idempotency_key)
  limit 1;
  value_micros := p_credit_units * 5000;
  if found then
    if existing.id <> p_grant_id or existing.user_id <> p_user_id
       or existing.workspace_id <> p_workspace_id
       or existing.credit_units <> p_credit_units then
      raise exception 'beta credit grant replay conflict' using errcode = '23505';
    end if;
    return to_jsonb(existing) || jsonb_build_object('replay', true);
  end if;
  payload := jsonb_build_object(
    'grant_id', p_grant_id, 'user_id', p_user_id, 'workspace_id', p_workspace_id,
    'financial_environment', 'test', 'credit_units', p_credit_units,
    'customer_value_micros', value_micros, 'reason', btrim(p_reason),
    'metadata', coalesce(p_metadata_json, '{}'::jsonb)
  );
  perform tongs._create_accounting_event(
    p_grant_id, 'beta-credit-grant:' || btrim(p_idempotency_key),
    'beta_test_credits_provisioned', 'test', 'beta_credit_grant',
    p_grant_id::text, 'USD', p_user_id, p_workspace_id, p_actor_id,
    payload, now()
  );
  insert into tongs.beta_credit_grants(
    id, user_id, workspace_id, financial_environment, credit_units,
    customer_value_micros, maximum_wholesale_capacity_micros,
    idempotency_key, reason, granted_by, journal_event_id, metadata_json
  ) values (
    p_grant_id, p_user_id, p_workspace_id, 'test', p_credit_units,
    value_micros, value_micros, btrim(p_idempotency_key), btrim(p_reason),
    p_actor_id, p_grant_id, coalesce(p_metadata_json, '{}'::jsonb)
  ) returning * into existing;
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, workspace_id,
    beta_credit_grant_id, currency, amount_micros
  ) values
    (p_grant_id, 1, 'beta_promotion_expense', p_user_id, p_workspace_id,
      p_grant_id, 'USD', value_micros),
    (p_grant_id, 2, 'beta_credit_deferred_value', p_user_id, p_workspace_id,
      p_grant_id, 'USD', -value_micros);
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, workspace_id,
    beta_credit_grant_id, unit_kind, quantity_delta
  ) values (
    p_grant_id, 3, 'beta_forge_credit_units', p_user_id, p_workspace_id,
    p_grant_id, 'forge_credit', p_credit_units
  );
  perform tongs._assert_accounting_event_balanced(p_grant_id);
  return to_jsonb(existing) || jsonb_build_object('replay', false);
end $$;

create or replace function tongs.consume_beta_test_credits(
  p_consumption_id uuid,
  p_grant_id uuid,
  p_allocation_key text,
  p_operation_id text,
  p_credit_units bigint,
  p_customer_value_micros bigint,
  p_wholesale_spend_micros bigint,
  p_metadata_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  grant_row tongs.beta_credit_grants%rowtype;
  existing tongs.beta_credit_consumptions%rowtype;
  used_units bigint;
  used_value bigint;
  used_wholesale bigint;
  payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_consumption_id is null or p_grant_id is null or p_credit_units <= 0
     or p_customer_value_micros <> p_credit_units * 5000
     or p_wholesale_spend_micros < 0
     or length(btrim(coalesce(p_allocation_key, ''))) not between 8 and 300
     or length(btrim(coalesce(p_operation_id, ''))) not between 8 and 300 then
    raise exception 'invalid beta credit consumption' using errcode = '22023';
  end if;
  select * into grant_row from tongs.beta_credit_grants where id = p_grant_id for update;
  if not found then raise exception 'beta credit grant not found' using errcode = 'P0002'; end if;
  select * into existing from tongs.beta_credit_consumptions
  where allocation_key = btrim(p_allocation_key)
     or (grant_id = p_grant_id and operation_id = btrim(p_operation_id))
  limit 1;
  if found then
    if existing.id <> p_consumption_id or existing.credit_units_consumed <> p_credit_units
       or existing.customer_value_micros <> p_customer_value_micros
       or existing.wholesale_spend_micros <> p_wholesale_spend_micros then
      raise exception 'beta credit consumption replay conflict' using errcode = '23505';
    end if;
    return to_jsonb(existing) || jsonb_build_object('replay', true);
  end if;
  select coalesce(sum(credit_units_consumed),0), coalesce(sum(customer_value_micros),0),
    coalesce(sum(wholesale_spend_micros),0)
  into used_units, used_value, used_wholesale
  from tongs.beta_credit_consumptions where grant_id = p_grant_id;
  if p_credit_units > grant_row.credit_units - used_units
     or p_customer_value_micros > grant_row.customer_value_micros - used_value
     or p_wholesale_spend_micros > grant_row.maximum_wholesale_capacity_micros - used_wholesale then
    raise exception 'insufficient beta Forge Credits' using errcode = 'P0001';
  end if;
  payload := jsonb_build_object(
    'consumption_id', p_consumption_id, 'grant_id', p_grant_id,
    'operation_id', btrim(p_operation_id), 'credit_units', p_credit_units,
    'customer_value_micros', p_customer_value_micros,
    'wholesale_spend_micros', p_wholesale_spend_micros,
    'metadata', coalesce(p_metadata_json, '{}'::jsonb)
  );
  perform tongs._create_accounting_event(
    p_consumption_id, 'beta-credit-consumption:' || btrim(p_allocation_key),
    'beta_test_credits_consumed', 'test', 'forge_operation', btrim(p_operation_id),
    'USD', grant_row.user_id, grant_row.workspace_id, null, payload, now()
  );
  insert into tongs.beta_credit_consumptions(
    id, grant_id, user_id, allocation_key, operation_id,
    credit_units_consumed, customer_value_micros, wholesale_spend_micros,
    journal_event_id, metadata_json
  ) values (
    p_consumption_id, p_grant_id, grant_row.user_id, btrim(p_allocation_key),
    btrim(p_operation_id), p_credit_units, p_customer_value_micros,
    p_wholesale_spend_micros, p_consumption_id, coalesce(p_metadata_json, '{}'::jsonb)
  ) returning * into existing;
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, workspace_id,
    beta_credit_grant_id, currency, amount_micros
  ) values
    (p_consumption_id, 1, 'beta_credit_deferred_value', grant_row.user_id,
      grant_row.workspace_id, p_grant_id, 'USD', p_customer_value_micros),
    (p_consumption_id, 2, 'service_revenue', grant_row.user_id,
      grant_row.workspace_id, p_grant_id, 'USD', -p_customer_value_micros);
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, workspace_id,
    beta_credit_grant_id, unit_kind, quantity_delta
  ) values (
    p_consumption_id, 3, 'beta_forge_credit_units', grant_row.user_id,
    grant_row.workspace_id, p_grant_id, 'forge_credit', -p_credit_units
  );
  perform tongs._assert_accounting_event_balanced(p_consumption_id);
  return to_jsonb(existing) || jsonb_build_object('replay', false);
end $$;

revoke all on function tongs.provision_beta_test_credits(uuid,uuid,uuid,uuid,bigint,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function tongs.consume_beta_test_credits(uuid,uuid,text,text,bigint,bigint,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function tongs.provision_beta_test_credits(uuid,uuid,uuid,uuid,bigint,text,text,jsonb)
  to service_role;
grant execute on function tongs.consume_beta_test_credits(uuid,uuid,text,text,bigint,bigint,bigint,jsonb)
  to service_role;

alter table tongs.funding_reservations
  drop constraint funding_reservations_funding_source_type_check,
  add constraint funding_reservations_funding_source_type_check
    check (funding_source_type in ('customer_deposit','paid_allowance','beta_grant','owner_budget','none'));
alter table tongs.paid_operation_aggregate_bindings
  drop constraint paid_operation_aggregate_bindings_funding_source_type_check,
  add constraint paid_operation_aggregate_bindings_funding_source_type_check
    check (funding_source_type in ('customer_deposit','paid_allowance','beta_grant','owner_budget','none'));

create or replace function tongs._aggregate_funding_class(p_reservation tongs.funding_reservations)
returns text language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if p_reservation.funding_source_type = 'customer_deposit' then return 'verified_customer_deposit';
  elsif p_reservation.funding_source_type = 'paid_allowance' then return 'economically_backed_allowance';
  elsif p_reservation.funding_source_type = 'beta_grant' then return 'operator_provisioned_beta_credit';
  elsif p_reservation.funding_source_type = 'owner_budget' then return 'owner_operating_budget';
  elsif p_reservation.funding_source_type = 'none' then return 'byo';
  end if;
  raise exception 'unsupported aggregate funding source' using errcode = '22023';
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs._stamp_and_authorize_funding_reservation()'::regprocedure) into definition;
  changed := replace(definition,
    $old$elsif new.funding_source_type = 'paid_allowance' then
    select financial_environment into v_source_environment from tongs.paid_allowance_grants where id = new.funding_source_id;$old$,
    $new$elsif new.funding_source_type = 'paid_allowance' then
    select financial_environment into v_source_environment from tongs.paid_allowance_grants where id = new.funding_source_id;
  elsif new.funding_source_type = 'beta_grant' then
    select financial_environment into v_source_environment from tongs.beta_credit_grants where id = new.funding_source_id;$new$);
  changed := replace(changed,
    $old$new.funding_source_type in ('customer_deposit', 'paid_allowance')$old$,
    $new$new.funding_source_type in ('customer_deposit', 'paid_allowance', 'beta_grant')$new$);
  changed := replace(changed,
    $old$new.funding_source_type not in ('customer_deposit', 'paid_allowance')$old$,
    $new$new.funding_source_type not in ('customer_deposit', 'paid_allowance', 'beta_grant')$new$);
  if changed = definition or position('beta_credit_grants' in changed) = 0 then
    raise exception 'funding environment trigger changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs._select_customer_funding_for_quote(uuid)'::regprocedure) into definition;
  changed := replace(definition,
    $old$        and allowance.maximum_wholesale_spend_micros - used.used_wholesale
          - held.wholesale_spend_micros >= v_quote.full_cost_ceiling_micros
    ) candidate
    order by case candidate.source_type when 'customer_deposit' then 1 else 2 end,$old$,
    $new$        and allowance.maximum_wholesale_spend_micros - used.used_wholesale
          - held.wholesale_spend_micros >= v_quote.full_cost_ceiling_micros
      union all
      select 'beta_grant', beta.id, beta.financial_environment,
        'Forge Credits', beta.granted_at
      from tongs.beta_credit_grants beta
      left join lateral (
        select coalesce(sum(c.customer_value_micros), 0)::bigint used_charge,
          coalesce(sum(c.credit_units_consumed), 0)::bigint used_units,
          coalesce(sum(c.wholesale_spend_micros), 0)::bigint used_wholesale
        from tongs.beta_credit_consumptions c where c.grant_id = beta.id
      ) used on true
      left join lateral tongs._active_funding_hold('beta_grant', beta.id) held on true
      where beta.user_id = v_authority.payer_user_id
        and beta.workspace_id = v_quote.workspace_id
        and beta.financial_environment = v_quote.financial_environment
        and beta.customer_value_micros - used.used_charge
          - held.customer_charge_micros >= v_quote.normal_maximum_charge_micros
        and beta.credit_units - used.used_units
          - held.credit_units >= v_quote.customer_credit_units
        and beta.maximum_wholesale_capacity_micros - used.used_wholesale
          - held.wholesale_spend_micros >= v_quote.full_cost_ceiling_micros
    ) candidate
    order by case candidate.source_type
      when 'customer_deposit' then 1 when 'paid_allowance' then 2 else 3 end,$new$);
  if changed = definition or position($needle$select 'beta_grant', beta.id$needle$ in changed) = 0 then
    raise exception 'customer funding selector changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

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
    select unnest(array['test'::text,'live'::text]) environment
  ), deposit_balances as (
    select deposit.*,
      exists(select 1 from tongs.customer_deposit_processor_fees fee where fee.deposit_id=deposit.id) fee_verified,
      coalesce(used.used_charge,0)::bigint used_charge,
      coalesce(refunded.refunded_charge,0)::bigint refunded_charge,
      coalesce(held.customer_charge_micros,0)::bigint held_charge,
      tongs._effective_deposit_credit_units(deposit.id) effective_units,
      tongs._available_deposit_credit_units(deposit.id) available_units
    from tongs.customer_deposits deposit
    left join lateral (
      select coalesce(sum(c.recognized_revenue_micros),0) used_charge
      from tongs.customer_deposit_consumptions c where c.deposit_id=deposit.id
    ) used on true
    left join lateral (
      select coalesce(sum(r.liability_release_micros),0) refunded_charge
      from tongs.customer_deposit_refunds r where r.deposit_id=deposit.id
    ) refunded on true
    left join lateral tongs._active_funding_hold('customer_deposit',deposit.id) held on true
    where deposit.user_id=v_user
  ), allowance_balances as (
    select allowance.*,
      coalesce(used.used_revenue,0)::bigint used_revenue,
      coalesce(used.used_units,0)::bigint used_units,
      coalesce(used.used_wholesale,0)::bigint used_wholesale,
      coalesce(held.customer_charge_micros,0)::bigint held_charge,
      coalesce(held.credit_units,0)::bigint held_units,
      coalesce(held.wholesale_spend_micros,0)::bigint held_wholesale
    from tongs.paid_allowance_grants allowance
    left join lateral (
      select coalesce(sum(c.recognized_revenue_micros),0) used_revenue,
        coalesce(sum(c.entitlement_units_consumed),0) used_units,
        coalesce(sum(c.wholesale_spend_micros),0) used_wholesale
      from tongs.paid_allowance_consumptions c where c.allowance_grant_id=allowance.id
    ) used on true
    left join lateral tongs._active_funding_hold('paid_allowance',allowance.id) held on true
    where allowance.user_id=v_user and now()>=allowance.period_start and now()<allowance.period_end
      and not exists(select 1 from tongs.subscription_cycle_adjustments a where a.receipt_id=allowance.receipt_id)
  ), beta_balances as (
    select beta.*,
      coalesce(used.used_value,0)::bigint used_value,
      coalesce(used.used_units,0)::bigint used_units,
      coalesce(used.used_wholesale,0)::bigint used_wholesale,
      coalesce(held.customer_charge_micros,0)::bigint held_value,
      coalesce(held.credit_units,0)::bigint held_units,
      coalesce(held.wholesale_spend_micros,0)::bigint held_wholesale
    from tongs.beta_credit_grants beta
    left join lateral (
      select coalesce(sum(c.customer_value_micros),0) used_value,
        coalesce(sum(c.credit_units_consumed),0) used_units,
        coalesce(sum(c.wholesale_spend_micros),0) used_wholesale
      from tongs.beta_credit_consumptions c where c.grant_id=beta.id
    ) used on true
    left join lateral tongs._active_funding_hold('beta_grant',beta.id) held on true
    where beta.user_id=v_user
  ), summaries as (
    select environment_names.environment, jsonb_build_object(
      'purchased', jsonb_build_object(
        'currency','USD',
        'available_micros',coalesce(sum(greatest(d.gross_amount_micros-d.used_charge-d.refunded_charge-d.held_charge,0)) filter(where d.fee_verified),0),
        'available_credit_units',coalesce(sum(d.available_units) filter(where d.fee_verified),0),
        'pending_fee_deposit_count',count(d.id) filter(where not d.fee_verified),
        'pending_fee_micros',coalesce(sum(d.gross_amount_micros) filter(where not d.fee_verified),0),
        'provider_execution_eligible',coalesce(sum(d.available_units) filter(where d.fee_verified),0)>0
      ),
      'allowances', jsonb_build_object(
        'currency','USD',
        'available_revenue_micros',coalesce((select sum(greatest(a.allocated_revenue_micros-a.used_revenue-a.held_charge,0)) from allowance_balances a where a.financial_environment=environment_names.environment),0),
        'available_entitlement_units',coalesce((select sum(greatest(a.entitlement_units-a.used_units-a.held_units,0)) from allowance_balances a where a.financial_environment=environment_names.environment),0),
        'available_wholesale_micros',coalesce((select sum(greatest(a.maximum_wholesale_spend_micros-a.used_wholesale-a.held_wholesale,0)) from allowance_balances a where a.financial_environment=environment_names.environment),0),
        'provider_execution_eligible',coalesce((select bool_or(a.entitlement_units-a.used_units-a.held_units>0 and a.maximum_wholesale_spend_micros-a.used_wholesale-a.held_wholesale>0) from allowance_balances a where a.financial_environment=environment_names.environment),false)
      ),
      'beta_grants', jsonb_build_object(
        'currency','USD',
        'available_customer_value_micros',coalesce((select sum(greatest(b.customer_value_micros-b.used_value-b.held_value,0)) from beta_balances b where b.financial_environment=environment_names.environment),0),
        'available_credit_units',coalesce((select sum(greatest(b.credit_units-b.used_units-b.held_units,0)) from beta_balances b where b.financial_environment=environment_names.environment),0),
        'available_wholesale_micros',coalesce((select sum(greatest(b.maximum_wholesale_capacity_micros-b.used_wholesale-b.held_wholesale,0)) from beta_balances b where b.financial_environment=environment_names.environment),0),
        'provider_execution_eligible',coalesce((select bool_or(b.credit_units-b.used_units-b.held_units>0 and b.maximum_wholesale_capacity_micros-b.used_wholesale-b.held_wholesale>0) from beta_balances b where b.financial_environment=environment_names.environment),false)
      )
    ) summary
    from environment_names
    left join deposit_balances d on d.stripe_mode=environment_names.environment
    group by environment_names.environment
  ) select jsonb_object_agg(environment,summary) into v_environments from summaries;
  v_active := coalesce(v_environments->v_environment,'{}'::jsonb);
  select jsonb_build_object(
    'reservation_count',count(*),
    'reserved_customer_charge_micros',coalesce(sum(reserved_customer_charge_micros),0),
    'reserved_credit_units',coalesce(sum(reserved_credit_units),0)
  ) into v_reservations
  from tongs.funding_reservations reservation
  where reservation.user_id=v_user and reservation.funding_environment=v_environment
    and tongs._funding_reservation_state(reservation.id)
      in('reserved','attempt_started','provider_attempt_shadowed','submission_unknown');
  select jsonb_build_object(
    'credit_units',coalesce(sum(opening.credit_units),0),
    'provider_execution_eligible',false,'reason','legacy_unverified'
  ) into v_legacy from tongs.legacy_credit_opening_balances opening where opening.user_id=v_user;
  select coalesce(jsonb_agg(jsonb_build_object(
    'deposit_id',deposit.id,'financial_environment',deposit.stripe_mode,
    'pack_id',deposit.pack_id,'currency',deposit.currency,
    'gross_amount_micros',deposit.gross_amount_micros,
    'source_credit_units',deposit.credit_units,
    'credit_units',tongs._effective_deposit_credit_units(deposit.id),
    'available_credit_units',tongs._available_deposit_credit_units(deposit.id),
    'conversion_value_remainder_micros',coalesce(conversion.value_remainder_micros,0),
    'received_at',deposit.received_at
  ) order by deposit.received_at desc),'[]'::jsonb) into v_deposits
  from tongs.customer_deposits deposit
  left join tongs.legacy_deposit_credit_conversions conversion on conversion.deposit_id=deposit.id
  where deposit.user_id=v_user;
  return jsonb_build_object(
    'contract_version','forge.customer-funding.v4',
    'credit_contract','forge.credit-economy.v1',
    'active_environment',v_environment,
    'environments',coalesce(v_environments,'{}'::jsonb),
    'active_spendable',coalesce(v_active,'{}'::jsonb),
    'active_reservations',coalesce(v_reservations,'{}'::jsonb),
    'legacy_unverified',coalesce(v_legacy,'{}'::jsonb),
    'deposits',coalesce(v_deposits,'[]'::jsonb)
  );
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.reserve_operation(uuid,uuid,text,uuid,text)'::regprocedure) into definition;
  changed := replace(definition,
    'v_allowance tongs.paid_allowance_grants%rowtype;',
    'v_allowance tongs.paid_allowance_grants%rowtype; v_beta tongs.beta_credit_grants%rowtype;');
  changed := replace(changed,
    $old$p_funding_source_type not in ('customer_deposit', 'paid_allowance', 'owner_budget', 'none')$old$,
    $new$p_funding_source_type not in ('customer_deposit', 'paid_allowance', 'beta_grant', 'owner_budget', 'none')$new$);
  changed := replace(changed,
    $old$  else
    if not v_control.owner_budget_spending_enabled then$old$,
    $new$  elsif p_funding_source_type = 'beta_grant' then
    select * into v_beta from tongs.beta_credit_grants where id = p_funding_source_id for update;
    if not found or not tongs._quote_payer_allows_user(v_quote.id, v_beta.user_id)
       or v_beta.workspace_id <> v_quote.workspace_id
       or v_beta.financial_environment <> v_quote.financial_environment then
      raise exception 'eligible beta credit grant not found' using errcode = 'P0002';
    end if;
    select coalesce(sum(customer_value_micros),0), coalesce(sum(credit_units_consumed),0),
      coalesce(sum(wholesale_spend_micros),0)
      into v_used_charge, v_used_units, v_used_wholesale
    from tongs.beta_credit_consumptions where grant_id = v_beta.id;
    select * into v_hold from tongs._active_funding_hold('beta_grant', v_beta.id);
    if v_reserve_charge > v_beta.customer_value_micros - v_used_charge - v_hold.customer_charge_micros
       or v_reserve_units > v_beta.credit_units - v_used_units - v_hold.credit_units
       or v_reserve_wholesale > v_beta.maximum_wholesale_capacity_micros - v_used_wholesale - v_hold.wholesale_spend_micros then
      raise exception 'insufficient beta Forge Credits' using errcode = 'P0001';
    end if;
  else
    if not v_control.owner_budget_spending_enabled then$new$);
  if changed = definition or position('eligible beta credit grant' in changed) = 0 then
    raise exception 'reservation function changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs._settle_operation_before_zero_failure_policy(uuid,uuid,text,text,text,bigint,jsonb)'::regprocedure) into definition;
  changed := replace(definition,
    $old$  elsif v_reservation.funding_source_type = 'owner_budget' then$old$,
    $new$  elsif v_reservation.funding_source_type = 'beta_grant' and v_charge > 0 then
    v_consumption := tongs.consume_beta_test_credits(
      p_settlement_id, v_reservation.funding_source_id,
      'reservation-settlement:' || p_reservation_id::text, v_reservation.operation_id,
      v_units, v_charge, least(p_actual_fulfillment_cost_micros, v_reservation.reserved_wholesale_spend_micros),
      jsonb_build_object('reservation_id', p_reservation_id, 'quote_id', v_quote.id, 'outcome', p_outcome)
    );
  elsif v_reservation.funding_source_type = 'owner_budget' then$new$);
  if changed = definition or position('consume_beta_test_credits' in changed) = 0 then
    raise exception 'settlement function changed upstream; explicit review required';
  end if;
  execute changed;
end $$;

alter table tongs.customer_operation_reliefs
  drop constraint customer_operation_reliefs_funding_source_type_check,
  add constraint customer_operation_reliefs_funding_source_type_check
    check (funding_source_type in ('customer_deposit','paid_allowance','beta_grant'));

create or replace function tongs.relieve_failed_customer_operation(
  p_relief_id uuid,
  p_reservation_id uuid,
  p_relief_key text,
  p_reason text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_res tongs.funding_reservations%rowtype;
  v_event tongs.funding_reservation_events%rowtype;
  v_existing tongs.customer_operation_reliefs%rowtype;
  v_consumption_id uuid;
  v_units bigint;
  v_charge bigint;
  v_user uuid;
  v_workspace uuid;
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  perform pg_advisory_xact_lock(hashtextextended('customer-relief:' || p_reservation_id::text, 0));
  select * into v_existing from tongs.customer_operation_reliefs
  where reservation_id = p_reservation_id or relief_key = btrim(p_relief_key) limit 1;
  if found then
    return jsonb_build_object(
      'relief_id',v_existing.id,'replay',true,
      'customer_credit_micros',v_existing.customer_credit_micros
    );
  end if;
  select * into v_res from tongs.funding_reservations
  where id = p_reservation_id for update;
  if not found then raise exception 'funding reservation not found' using errcode = 'P0002'; end if;
  select * into v_event from tongs.funding_reservation_events
  where reservation_id = p_reservation_id and event_type = 'settled'
  order by sequence desc limit 1;
  if not found or coalesce(v_event.customer_charge_micros,0) = 0 then
    return jsonb_build_object(
      'relief_id',null,'replay',false,'customer_credit_micros',0,
      'reason','no_customer_charge'
    );
  end if;
  if v_res.funding_source_type = 'customer_deposit' then
    select id,user_id,credit_units_consumed
      into v_consumption_id,v_user,v_units
    from tongs.customer_deposit_consumptions
    where deposit_id = v_res.funding_source_id and operation_id = v_res.operation_id;
  elsif v_res.funding_source_type = 'paid_allowance' then
    select id,user_id,entitlement_units_consumed
      into v_consumption_id,v_user,v_units
    from tongs.paid_allowance_consumptions
    where allowance_grant_id = v_res.funding_source_id and operation_id = v_res.operation_id;
  elsif v_res.funding_source_type = 'beta_grant' then
    select consumption.id,consumption.user_id,consumption.credit_units_consumed,grant_row.workspace_id
      into v_consumption_id,v_user,v_units,v_workspace
    from tongs.beta_credit_consumptions consumption
    join tongs.beta_credit_grants grant_row on grant_row.id = consumption.grant_id
    where consumption.grant_id = v_res.funding_source_id
      and consumption.operation_id = v_res.operation_id;
  else
    raise exception 'customer relief requires customer funding source' using errcode = '22023';
  end if;
  if v_consumption_id is null then
    raise exception 'customer consumption not found for relief' using errcode = 'P0002';
  end if;
  v_charge := v_event.customer_charge_micros;
  v_payload := jsonb_build_object(
    'reservation_id',p_reservation_id,'original_consumption_id',v_consumption_id,
    'customer_credit_micros',v_charge,'restored_units',v_units,
    'reason',btrim(p_reason)
  );
  perform tongs._create_accounting_event(
    p_relief_id,'operation-relief:' || btrim(p_relief_key),
    'customer_operation_relieved',v_res.funding_environment,'forge_operation',
    v_res.operation_id,v_res.currency,v_user,v_workspace,null,v_payload,now()
  );
  insert into tongs.customer_operation_reliefs(
    id,reservation_id,relief_key,funding_source_type,funding_source_id,
    original_consumption_id,currency,customer_credit_micros,restored_units,
    revenue_reversal_micros,reason,journal_event_id,evidence_json,relieved_at
  ) values (
    p_relief_id,p_reservation_id,btrim(p_relief_key),v_res.funding_source_type,
    v_res.funding_source_id,v_consumption_id,v_res.currency,v_charge,v_units,
    v_charge,btrim(p_reason),p_relief_id,coalesce(p_evidence_json,'{}'::jsonb),now()
  ) returning * into v_existing;
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,user_id,workspace_id,deposit_id,
    allowance_grant_id,beta_credit_grant_id,currency,amount_micros
  ) values
    (p_relief_id,1,'service_revenue_reversal',v_user,v_workspace,
      case when v_res.funding_source_type='customer_deposit' then v_res.funding_source_id end,
      case when v_res.funding_source_type='paid_allowance' then v_res.funding_source_id end,
      case when v_res.funding_source_type='beta_grant' then v_res.funding_source_id end,
      v_res.currency,v_charge),
    (p_relief_id,2,
      case v_res.funding_source_type
        when 'customer_deposit' then 'customer_prepaid_liability'
        when 'paid_allowance' then 'allowance_deferred_liability'
        else 'beta_credit_deferred_value' end,
      v_user,v_workspace,
      case when v_res.funding_source_type='customer_deposit' then v_res.funding_source_id end,
      case when v_res.funding_source_type='paid_allowance' then v_res.funding_source_id end,
      case when v_res.funding_source_type='beta_grant' then v_res.funding_source_id end,
      v_res.currency,-v_charge);
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,user_id,workspace_id,deposit_id,
    allowance_grant_id,beta_credit_grant_id,unit_kind,quantity_delta
  ) values (
    p_relief_id,3,
    case v_res.funding_source_type
      when 'customer_deposit' then 'live_customer_credits'
      when 'paid_allowance' then 'allowance_entitlement_units'
      else 'beta_forge_credit_units' end,
    v_user,v_workspace,
    case when v_res.funding_source_type='customer_deposit' then v_res.funding_source_id end,
    case when v_res.funding_source_type='paid_allowance' then v_res.funding_source_id end,
    case when v_res.funding_source_type='beta_grant' then v_res.funding_source_id end,
    'forge_credit',v_units
  );
  perform tongs._assert_accounting_event_balanced(p_relief_id);
  return jsonb_build_object(
    'relief_id',v_existing.id,'replay',false,'customer_credit_micros',v_charge,
    'restored_units',v_units,'revenue_reversal_micros',v_charge
  );
end $$;

comment on table tongs.beta_credit_grants is
  'Operator-only canonical Test Forge Credit grants for beta customers; never a Stripe deposit or legacy balance.';
comment on function tongs.provision_beta_test_credits(uuid,uuid,uuid,uuid,bigint,text,text,jsonb) is
  'Idempotently provisions an operator-approved quantity of canonical Test Forge Credits for a beta account.';

notify pgrst, 'reload schema';
commit;
