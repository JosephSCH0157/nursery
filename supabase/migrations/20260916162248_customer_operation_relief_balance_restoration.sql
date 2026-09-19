-- Customer operation relief is an accounting reversal and must also restore
-- the corresponding purchased-credit spending capacity. Supplier expense
-- evidence remains independent and is not reversed here.
begin;

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
      + coalesce((select sum(relief.restored_units)
          from tongs.customer_operation_reliefs relief
          where relief.funding_source_type='customer_deposit'
            and relief.funding_source_id=deposit.id),0)
    else deposit.credit_units
      - coalesce((select sum(c.credit_units_consumed)
          from tongs.customer_deposit_consumptions c where c.deposit_id=deposit.id),0)
      - coalesce((select sum(r.refunded_credit_units)
          from tongs.customer_deposit_refunds r where r.deposit_id=deposit.id),0)
      + coalesce((select sum(relief.restored_units)
          from tongs.customer_operation_reliefs relief
          where relief.funding_source_type='customer_deposit'
            and relief.funding_source_id=deposit.id),0)
    end,0)::bigint
  from tongs.customer_deposits deposit
  left join tongs.legacy_deposit_credit_conversions conversion
    on conversion.deposit_id=deposit.id
  where deposit.id=p_deposit_id
$$;

create or replace function tongs._unconsumed_deposit_value_micros(p_deposit_id uuid)
returns bigint language sql stable security definer set search_path = pg_catalog as $$
  select greatest(
    deposit.gross_amount_micros
      - coalesce((select sum(c.recognized_revenue_micros)
          from tongs.customer_deposit_consumptions c where c.deposit_id=deposit.id),0)
      - coalesce((select sum(r.liability_release_micros)
          from tongs.customer_deposit_refunds r where r.deposit_id=deposit.id),0)
      + coalesce((select sum(relief.revenue_reversal_micros)
          from tongs.customer_operation_reliefs relief
          where relief.funding_source_type='customer_deposit'
            and relief.funding_source_id=deposit.id),0),
    0
  )::bigint
  from tongs.customer_deposits deposit where deposit.id=p_deposit_id
$$;

create or replace function tongs._available_deposit_value_micros(p_deposit_id uuid)
returns bigint language sql stable security definer set search_path = pg_catalog as $$
  select greatest(
    coalesce(tongs._unconsumed_deposit_value_micros(p_deposit_id),0)
      - coalesce((select held.customer_charge_micros
          from tongs._active_funding_hold('customer_deposit',p_deposit_id) held),0),
    0
  )::bigint
$$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs._select_customer_funding_for_quote(uuid)'::regprocedure)
    into definition;
  changed:=regexp_replace(
    definition,
    'deposit\.gross_amount_micros[[:space:]]*-[[:space:]]*used\.used_charge[[:space:]]*-[[:space:]]*refunded\.refunded_charge[[:space:]]*-[[:space:]]*held\.customer_charge_micros[[:space:]]*>=[[:space:]]*v_quote\.normal_maximum_charge_micros',
    'tongs._available_deposit_value_micros(deposit.id) >= v_quote.normal_maximum_charge_micros',
    'i'
  );
  if changed=definition or position('_available_deposit_value_micros' in changed)=0 then
    raise exception 'customer funding value selector changed upstream';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(
    'tongs.consume_customer_deposit(uuid,uuid,text,text,bigint,bigint,timestamptz,jsonb)'::regprocedure
  ) into definition;
  changed:=replace(
    definition,
    'v_deposit.gross_amount_micros-v_consumed_micros-v_refund_liability',
    'tongs._unconsumed_deposit_value_micros(p_deposit_id)'
  );
  if changed=definition or position('_unconsumed_deposit_value_micros' in changed)=0 then
    raise exception 'customer deposit consumption value guard changed upstream';
  end if;
  execute changed;
end $$;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs.read_my_customer_funding()'::regprocedure)
    into definition;
  changed:=replace(
    definition,
    'greatest(d.gross_amount_micros-d.used_charge-d.refunded_charge-d.held_charge,0)',
    'tongs._available_deposit_value_micros(d.id)'
  );
  if changed=definition or position('_available_deposit_value_micros' in changed)=0 then
    raise exception 'customer funding read model value balance changed upstream';
  end if;
  execute changed;
end $$;

revoke all on function tongs._unconsumed_deposit_value_micros(uuid)
  from public,anon,authenticated;
revoke all on function tongs._available_deposit_value_micros(uuid)
  from public,anon,authenticated;
grant execute on function tongs._unconsumed_deposit_value_micros(uuid) to service_role;
grant execute on function tongs._available_deposit_value_micros(uuid) to service_role;

comment on function tongs._unconsumed_deposit_credit_units(uuid) is
  'Canonical purchased Forge Credit balance after consumption, Stripe refunds, and immutable customer-operation relief.';
comment on function tongs._unconsumed_deposit_value_micros(uuid) is
  'Canonical purchased-credit liability capacity after consumption, Stripe refunds, and immutable customer-operation relief.';

commit;

