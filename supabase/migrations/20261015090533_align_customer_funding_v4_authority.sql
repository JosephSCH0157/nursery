-- Restore the reviewed customer-funding v4 read contract after the later
-- unified-financial-environment migration replayed its older v2 definition.
-- This migration changes no stored financial records or spending authority.
begin;

do $$
declare
  v_definition_hash text;
begin
  select encode(extensions.digest(pg_get_functiondef(
    'tongs.read_my_customer_funding()'::regprocedure
  ), 'sha256'), 'hex')
  into v_definition_hash;

  if v_definition_hash not in (
    -- Reviewed v2 definition from 20261011140000.
    '3cb56dc6f2de9812267d7bb58ac4d005c620873d0988dfb0b48fdd64514e179a',
    -- Reviewed connected v4 definition (already aligned/replay-safe).
    '3bcab056a448a45bc7b075e31f6af1cc41809e66de2d725f4e5412aadec8f783'
  ) then
    raise exception 'read_my_customer_funding changed upstream (sha256=%); explicit review required',
      v_definition_hash;
  end if;

  perform 'tongs._effective_deposit_credit_units(uuid)'::regprocedure;
  perform 'tongs._available_deposit_credit_units(uuid)'::regprocedure;
  perform 'tongs._available_deposit_value_micros(uuid)'::regprocedure;
  perform 'tongs._active_funding_hold(text,uuid)'::regprocedure;
  perform 'tongs._current_financial_environment()'::regprocedure;
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
        'available_micros',coalesce(sum(tongs._available_deposit_value_micros(d.id)) filter(where d.fee_verified),0),
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

revoke all on function tongs.read_my_customer_funding() from public, anon;
grant execute on function tongs.read_my_customer_funding() to authenticated, service_role;

comment on function tongs.read_my_customer_funding() is
  'Customer-scoped Forge Credit funding read model v4. Reports Test and Live separately and exposes only canonical spendable balances.';

notify pgrst, 'reload schema';

commit;
