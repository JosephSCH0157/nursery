-- Owner-only, sanitized cross-customer purchase activity.
-- This is a read model only: it does not create receipts, funding, allowances, or revenue.

begin;

create or replace function tongs.read_owner_purchase_activity(
  p_stripe_mode text default 'test',
  p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_mode text := lower(btrim(coalesce(p_stripe_mode, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_purchases jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
  if v_mode not in ('test', 'live') then
    raise exception 'stripe mode must be test or live' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(purchase_row) order by purchase_row.observed_at desc), '[]'::jsonb)
  into v_purchases
  from (
    select
      subscription.stripe_subscription_id as purchase_id,
      subscription.user_id,
      customer.email as customer_email,
      customer.customer_name,
      v_mode as stripe_mode,
      subscription.purchase_type,
      subscription.item_id,
      subscription.interval,
      subscription.status,
      subscription.current_period_start,
      subscription.current_period_end,
      subscription.cancel_at_period_end,
      checkout.stripe_event_id as checkout_event_id,
      nullif(checkout.payload_json #>> '{data,object,id}', '') as checkout_session_id,
      nullif(checkout.payload_json #>> '{data,object,invoice}', '') as stripe_invoice_id,
      nullif(lower(checkout.payload_json #>> '{data,object,payment_status}'), '') as payment_status,
      nullif(lower(checkout.payload_json #>> '{data,object,currency}'), '') as checkout_currency,
      case
        when checkout.payload_json #>> '{data,object,amount_total}' ~ '^[0-9]+$'
          then (checkout.payload_json #>> '{data,object,amount_total}')::bigint
        else null
      end as checkout_amount_minor,
      checkout.processed_at as checkout_processed_at,
      receipt.id as accounting_receipt_id,
      receipt.stripe_event_id as accounting_event_id,
      receipt.gross_amount_micros as accounted_cash_micros,
      receipt.currency as accounting_currency,
      receipt.received_at as accounting_received_at,
      coalesce(allowance.allowance_grant_count, 0) as allowance_grant_count,
      coalesce(allowance.allocated_revenue_micros, 0) as allocated_revenue_micros,
      coalesce(allowance.maximum_wholesale_spend_micros, 0) as maximum_wholesale_spend_micros,
      coalesce(recognized.recognized_revenue_micros, 0) as recognized_revenue_micros,
      case
        when receipt.id is not null then 'cycle_receipt_recorded'
        when checkout.stripe_event_id is not null
          and nullif(checkout.payload_json #>> '{data,object,invoice}', '') is not null
          then 'invoice_receipt_pending'
        when checkout.stripe_event_id is not null then 'checkout_recorded'
        else 'subscription_recorded'
      end as accounting_state,
      case
        when v_mode = 'test' then false
        when receipt.id is null then false
        else coalesce(allowance.allowance_grant_count, 0) > 0
      end as live_funding_eligible,
      event_summary.signed_webhook_events,
      coalesce(checkout.processed_at, mode_event.processed_at, subscription.updated_at) as observed_at
    from tongs.billing_subscriptions subscription
    join tongs.billing_customers customer on customer.user_id = subscription.user_id
    join lateral (
      select event.processed_at
      from tongs.billing_events event
      where event.stripe_subscription_id = subscription.stripe_subscription_id
        and event.livemode = (v_mode = 'live')
      order by event.processed_at desc
      limit 1
    ) mode_event on true
    left join lateral (
      select event.stripe_event_id, event.payload_json, event.processed_at
      from tongs.billing_events event
      where event.stripe_subscription_id = subscription.stripe_subscription_id
        and event.livemode = (v_mode = 'live')
        and event.event_type = 'checkout.session.completed'
      order by event.processed_at desc
      limit 1
    ) checkout on true
    left join lateral (
      select cycle.*
      from tongs.subscription_cycle_receipts cycle
      where cycle.stripe_subscription_id = subscription.stripe_subscription_id
        and cycle.stripe_mode = v_mode
      order by cycle.received_at desc
      limit 1
    ) receipt on true
    left join lateral (
      select count(*)::integer as allowance_grant_count,
        coalesce(sum(grant_row.allocated_revenue_micros), 0)::bigint as allocated_revenue_micros,
        coalesce(sum(grant_row.maximum_wholesale_spend_micros), 0)::bigint as maximum_wholesale_spend_micros
      from tongs.paid_allowance_grants grant_row
      where grant_row.receipt_id = receipt.id
    ) allowance on true
    left join lateral (
      select coalesce(sum(consumption.recognized_revenue_micros), 0)::bigint as recognized_revenue_micros
      from tongs.paid_allowance_consumptions consumption
      join tongs.paid_allowance_grants grant_row on grant_row.id = consumption.allowance_grant_id
      where grant_row.receipt_id = receipt.id
    ) recognized on true
    join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'event_id', event.stripe_event_id,
        'event_type', event.event_type,
        'processed_at', event.processed_at
      ) order by event.processed_at), '[]'::jsonb) as signed_webhook_events
      from tongs.billing_events event
      where event.stripe_subscription_id = subscription.stripe_subscription_id
        and event.livemode = (v_mode = 'live')
    ) event_summary on true
    order by coalesce(checkout.processed_at, mode_event.processed_at, subscription.updated_at) desc
    limit v_limit
  ) purchase_row;

  return jsonb_build_object(
    'contract_version', 'forge.owner-purchase-activity.v1',
    'stripe_mode', v_mode,
    'purchases', v_purchases,
    'contains_wholesale_costs', false,
    'creates_accounting_entries', false,
    'spending_activation_changed', false
  );
end;
$$;

revoke all on function tongs.read_owner_purchase_activity(text, integer) from public, anon;
grant execute on function tongs.read_owner_purchase_activity(text, integer) to authenticated, service_role;

comment on function tongs.read_owner_purchase_activity(text, integer) is
  'Platform-operator-only sanitized Test/Live purchase read model. Never creates funding, allowance, revenue, or expense entries.';

notify pgrst, 'reload schema';
commit;
