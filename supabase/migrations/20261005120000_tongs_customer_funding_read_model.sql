-- Customer-safe funding read model for normal purchased-credit execution.
-- This migration publishes no prices and changes no execution rollout mode.
begin;

create or replace function tongs.read_my_customer_funding()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_live jsonb;
  v_pending jsonb;
  v_test jsonb;
  v_allowance jsonb;
  v_legacy jsonb;
  v_active jsonb;
  v_deposits jsonb;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  with deposit_balances as (
    select
      deposit.id,
      deposit.stripe_mode,
      deposit.pack_id,
      deposit.currency,
      deposit.gross_amount_micros,
      deposit.credit_units,
      deposit.received_at,
      exists (
        select 1 from tongs.customer_deposit_processor_fees fee
        where fee.deposit_id = deposit.id
      ) as fee_verified,
      coalesce(used.used_charge, 0)::bigint as used_charge,
      coalesce(used.used_units, 0)::bigint as used_units,
      coalesce(refunded.refunded_charge, 0)::bigint as refunded_charge,
      coalesce(refunded.refunded_units, 0)::bigint as refunded_units,
      coalesce(held.customer_charge_micros, 0)::bigint as held_charge,
      coalesce(held.credit_units, 0)::bigint as held_units
    from tongs.customer_deposits deposit
    left join lateral (
      select coalesce(sum(consumption.recognized_revenue_micros), 0)::bigint as used_charge,
        coalesce(sum(consumption.credit_units_consumed), 0)::bigint as used_units
      from tongs.customer_deposit_consumptions consumption
      where consumption.deposit_id = deposit.id
    ) used on true
    left join lateral (
      select coalesce(sum(refund.liability_release_micros), 0)::bigint as refunded_charge,
        coalesce(sum(refund.refunded_credit_units), 0)::bigint as refunded_units
      from tongs.customer_deposit_refunds refund
      where refund.deposit_id = deposit.id
    ) refunded on true
    left join lateral tongs._active_funding_hold('customer_deposit', deposit.id) held on true
    where deposit.user_id = v_user
  )
  select
    jsonb_build_object(
      'currency', 'USD',
      'purchased_micros', coalesce(sum(gross_amount_micros) filter (where stripe_mode = 'live' and fee_verified), 0),
      'consumed_micros', coalesce(sum(used_charge) filter (where stripe_mode = 'live' and fee_verified), 0),
      'refunded_micros', coalesce(sum(refunded_charge) filter (where stripe_mode = 'live' and fee_verified), 0),
      'reserved_micros', coalesce(sum(held_charge) filter (where stripe_mode = 'live' and fee_verified), 0),
      'available_micros', coalesce(sum(greatest(gross_amount_micros - used_charge - refunded_charge - held_charge, 0))
        filter (where stripe_mode = 'live' and fee_verified), 0),
      'purchased_credit_units', coalesce(sum(credit_units) filter (where stripe_mode = 'live' and fee_verified), 0),
      'consumed_credit_units', coalesce(sum(used_units) filter (where stripe_mode = 'live' and fee_verified), 0),
      'refunded_credit_units', coalesce(sum(refunded_units) filter (where stripe_mode = 'live' and fee_verified), 0),
      'reserved_credit_units', coalesce(sum(held_units) filter (where stripe_mode = 'live' and fee_verified), 0),
      'available_credit_units', coalesce(sum(greatest(credit_units - used_units - refunded_units - held_units, 0))
        filter (where stripe_mode = 'live' and fee_verified), 0),
      'live_provider_eligible', coalesce(sum(greatest(gross_amount_micros - used_charge - refunded_charge - held_charge, 0))
        filter (where stripe_mode = 'live' and fee_verified), 0) > 0
    ),
    jsonb_build_object(
      'currency', 'USD',
      'deposit_count', count(*) filter (where stripe_mode = 'live' and not fee_verified),
      'gross_amount_micros', coalesce(sum(gross_amount_micros) filter (where stripe_mode = 'live' and not fee_verified), 0),
      'credit_units', coalesce(sum(credit_units) filter (where stripe_mode = 'live' and not fee_verified), 0),
      'live_provider_eligible', false,
      'reason', 'processor_fee_evidence_pending'
    ),
    jsonb_build_object(
      'currency', 'USD',
      'gross_amount_micros', coalesce(sum(gross_amount_micros) filter (where stripe_mode = 'test'), 0),
      'credit_units', coalesce(sum(greatest(credit_units - used_units - refunded_units - held_units, 0))
        filter (where stripe_mode = 'test'), 0),
      'live_provider_eligible', false
    ),
    coalesce(jsonb_agg(jsonb_build_object(
      'deposit_id', id,
      'stripe_mode', stripe_mode,
      'pack_id', pack_id,
      'currency', currency,
      'gross_amount_micros', gross_amount_micros,
      'credit_units', credit_units,
      'available_micros', greatest(gross_amount_micros - used_charge - refunded_charge - held_charge, 0),
      'available_credit_units', greatest(credit_units - used_units - refunded_units - held_units, 0),
      'reserved_micros', held_charge,
      'reserved_credit_units', held_units,
      'refunded_micros', refunded_charge,
      'fee_status', case when fee_verified then 'verified' else 'pending' end,
      'live_provider_eligible', stripe_mode = 'live' and fee_verified
        and gross_amount_micros - used_charge - refunded_charge - held_charge > 0,
      'received_at', received_at
    ) order by received_at desc), '[]'::jsonb)
  into v_live, v_pending, v_test, v_deposits
  from deposit_balances;

  select jsonb_build_object(
    'currency', 'USD',
    'available_revenue_micros', coalesce(sum(greatest(allowance.allocated_revenue_micros
      - coalesce(used.used_revenue, 0) - coalesce(held.customer_charge_micros, 0), 0)), 0),
    'available_entitlement_units', coalesce(sum(greatest(allowance.entitlement_units
      - coalesce(used.used_units, 0) - coalesce(held.credit_units, 0), 0)), 0),
    'grant_count', count(*),
    'live_provider_eligible', count(*) filter (where
      allowance.allocated_revenue_micros - coalesce(used.used_revenue, 0) - coalesce(held.customer_charge_micros, 0) > 0
      and allowance.entitlement_units - coalesce(used.used_units, 0) - coalesce(held.credit_units, 0) > 0
      and allowance.maximum_wholesale_spend_micros - coalesce(used.used_wholesale, 0) - coalesce(held.wholesale_spend_micros, 0) > 0
    ) > 0
  ) into v_allowance
  from tongs.paid_allowance_grants allowance
  join tongs.subscription_cycle_receipts receipt on receipt.id = allowance.receipt_id
  left join lateral (
    select coalesce(sum(consumption.recognized_revenue_micros), 0)::bigint as used_revenue,
      coalesce(sum(consumption.entitlement_units_consumed), 0)::bigint as used_units,
      coalesce(sum(consumption.wholesale_spend_micros), 0)::bigint as used_wholesale
    from tongs.paid_allowance_consumptions consumption
    where consumption.allowance_grant_id = allowance.id
  ) used on true
  left join lateral tongs._active_funding_hold('paid_allowance', allowance.id) held on true
  where allowance.user_id = v_user
    and receipt.stripe_mode = 'live'
    and now() >= allowance.period_start and now() < allowance.period_end
    and not exists (
      select 1 from tongs.subscription_cycle_adjustments adjustment
      where adjustment.receipt_id = allowance.receipt_id
    );

  select jsonb_build_object(
    'credit_units', coalesce(sum(opening.credit_units), 0),
    'live_provider_eligible', false,
    'reason', 'legacy_unverified'
  ) into v_legacy
  from tongs.legacy_credit_opening_balances opening
  where opening.user_id = v_user;

  select jsonb_build_object(
    'reservation_count', count(*),
    'reserved_customer_charge_micros', coalesce(sum(reservation.reserved_customer_charge_micros), 0),
    'reserved_credit_units', coalesce(sum(reservation.reserved_credit_units), 0)
  ) into v_active
  from tongs.funding_reservations reservation
  where reservation.user_id = v_user
    and tongs._funding_reservation_state(reservation.id) in
      ('reserved', 'attempt_started', 'provider_attempt_shadowed', 'submission_unknown');

  return jsonb_build_object(
    'contract_version', 'forge.customer-funding.v1',
    'live_verified_purchases', coalesce(v_live, '{}'::jsonb),
    'live_pending_fee_evidence', coalesce(v_pending, '{}'::jsonb),
    'paid_allowances', coalesce(v_allowance, '{}'::jsonb),
    'test_funding', coalesce(v_test, '{}'::jsonb),
    'legacy_unverified', coalesce(v_legacy, '{}'::jsonb),
    'active_reservations', coalesce(v_active, '{}'::jsonb),
    'deposits', coalesce(v_deposits, '[]'::jsonb)
  );
end;
$$;

revoke all on function tongs.read_my_customer_funding() from public, anon;
grant execute on function tongs.read_my_customer_funding() to authenticated, service_role;

comment on function tongs.read_my_customer_funding() is
  'Self-only customer funding summary. Separates verified Live purchases, pending fee evidence, paid allowances, Test funding, legacy balances, and active reservations without exposing pricing or supplier costs.';

notify pgrst, 'reload schema';
commit;
