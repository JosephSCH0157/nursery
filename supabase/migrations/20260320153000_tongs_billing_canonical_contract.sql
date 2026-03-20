-- Canonical billing persistence for Stripe-backed Forge entitlements.
-- Extends the existing AI credit flow instead of replacing it.

begin;

create or replace function tongs.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;
create table if not exists tongs.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  email text null,
  customer_name text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tongs.billing_subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  purchase_type text not null check (purchase_type in ('subscription', 'cloud_storage')),
  item_id text not null,
  interval text not null check (interval in ('monthly', 'quarterly')),
  status text not null,
  price_id text null,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_user_status_idx
  on tongs.billing_subscriptions (user_id, status, current_period_end desc);

create index if not exists billing_subscriptions_customer_idx
  on tongs.billing_subscriptions (stripe_customer_id, updated_at desc);

create table if not exists tongs.billing_one_time_purchases (
  stripe_session_id text primary key,
  stripe_event_id text not null unique,
  stripe_customer_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_type text not null check (purchase_type in ('ai_credits')),
  item_id text not null,
  status text not null,
  payment_intent_id text null,
  amount_total bigint null,
  currency text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_one_time_purchases_user_created_idx
  on tongs.billing_one_time_purchases (user_id, created_at desc);

create unique index if not exists billing_one_time_purchases_payment_intent_uidx
  on tongs.billing_one_time_purchases (payment_intent_id)
  where payment_intent_id is not null;

create table if not exists tongs.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  user_id uuid null references auth.users(id) on delete set null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_session_id text null,
  livemode boolean null,
  payload_json jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists billing_events_user_processed_idx
  on tongs.billing_events (user_id, processed_at desc);

create index if not exists billing_events_customer_processed_idx
  on tongs.billing_events (stripe_customer_id, processed_at desc);

create table if not exists tongs.account_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text null,
  plan_item_id text null,
  plan_interval text null,
  plan_status text null,
  plan_current_period_end timestamptz null,
  plan_entitled boolean not null default false,
  storage_item_id text null,
  storage_status text null,
  storage_current_period_end timestamptz null,
  storage_bytes_entitled bigint not null default 0 check (storage_bytes_entitled >= 0),
  ai_credit_balance bigint not null default 0 check (ai_credit_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_billing_customers_updated_at on tongs.billing_customers;
create trigger trg_billing_customers_updated_at
before update on tongs.billing_customers
for each row execute function tongs.set_updated_at();

drop trigger if exists trg_billing_subscriptions_updated_at on tongs.billing_subscriptions;
create trigger trg_billing_subscriptions_updated_at
before update on tongs.billing_subscriptions
for each row execute function tongs.set_updated_at();

drop trigger if exists trg_billing_one_time_purchases_updated_at on tongs.billing_one_time_purchases;
create trigger trg_billing_one_time_purchases_updated_at
before update on tongs.billing_one_time_purchases
for each row execute function tongs.set_updated_at();

drop trigger if exists trg_account_balances_updated_at on tongs.account_balances;
create trigger trg_account_balances_updated_at
before update on tongs.account_balances
for each row execute function tongs.set_updated_at();

alter table tongs.billing_customers enable row level security;
alter table tongs.billing_subscriptions enable row level security;
alter table tongs.billing_one_time_purchases enable row level security;
alter table tongs.billing_events enable row level security;
alter table tongs.account_balances enable row level security;

drop policy if exists billing_customers_select_self on tongs.billing_customers;
create policy billing_customers_select_self
on tongs.billing_customers
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists billing_subscriptions_select_self on tongs.billing_subscriptions;
create policy billing_subscriptions_select_self
on tongs.billing_subscriptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists billing_one_time_purchases_select_self on tongs.billing_one_time_purchases;
create policy billing_one_time_purchases_select_self
on tongs.billing_one_time_purchases
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists account_balances_select_self on tongs.account_balances;
create policy account_balances_select_self
on tongs.account_balances
for select
to authenticated
using (user_id = auth.uid());

create or replace function tongs.billing_item_is_plan(
  p_item_id text
)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(btrim(p_item_id)), '') in ('creator', 'studio');
$$;

create or replace function tongs.billing_status_entitles_access(
  p_status text
)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(btrim(p_status)), '') in ('active', 'trialing');
$$;

create or replace function tongs.billing_storage_entitled_bytes(
  p_item_id text
)
returns bigint
language sql
immutable
as $$
  select case coalesce(lower(btrim(p_item_id)), '')
    when '50gb' then 53687091200::bigint
    when '100gb' then 107374182400::bigint
    when '1tb' then 1099511627776::bigint
    else 0::bigint
  end;
$$;

create or replace function tongs.sync_legacy_profile_from_account_balance(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_customer_id text;
  v_plan_status text;
  v_plan_current_period_end timestamptz;
  v_plan_entitled boolean := false;
  v_plan_subscription_id text;
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  if pg_catalog.to_regclass('public.profiles') is null then
    return;
  end if;

  insert into public.profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select
    ab.stripe_customer_id,
    ab.plan_status,
    ab.plan_current_period_end,
    ab.plan_entitled
  into
    v_customer_id,
    v_plan_status,
    v_plan_current_period_end,
    v_plan_entitled
  from tongs.account_balances ab
  where ab.user_id = p_user_id;

  select s.stripe_subscription_id
  into v_plan_subscription_id
  from tongs.billing_subscriptions s
  where s.user_id = p_user_id
    and s.purchase_type = 'subscription'
    and tongs.billing_item_is_plan(s.item_id)
  order by
    case when tongs.billing_status_entitles_access(s.status) then 0 else 1 end,
    s.current_period_end desc nulls last,
    s.updated_at desc
  limit 1;

  update public.profiles p
  set
    stripe_customer_id = v_customer_id,
    stripe_subscription_id = v_plan_subscription_id,
    subscription_status = v_plan_status,
    current_period_end = v_plan_current_period_end,
    anvil_paid = coalesce(v_plan_entitled, false)
  where p.user_id = p_user_id;
end;
$$;

create or replace function tongs.recompute_account_balance(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_customer_id text;
  v_plan_item_id text;
  v_plan_interval text;
  v_plan_status text;
  v_plan_current_period_end timestamptz;
  v_plan_entitled boolean := false;
  v_storage_item_id text;
  v_storage_status text;
  v_storage_current_period_end timestamptz;
  v_storage_bytes_entitled bigint := 0;
  v_ai_credit_balance bigint := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  select c.stripe_customer_id
  into v_customer_id
  from tongs.billing_customers c
  where c.user_id = p_user_id;

  select
    s.item_id,
    s.interval,
    s.status,
    s.current_period_end
  into
    v_plan_item_id,
    v_plan_interval,
    v_plan_status,
    v_plan_current_period_end
  from tongs.billing_subscriptions s
  where s.user_id = p_user_id
    and s.purchase_type = 'subscription'
    and tongs.billing_item_is_plan(s.item_id)
  order by
    case when tongs.billing_status_entitles_access(s.status) then 0 else 1 end,
    s.current_period_end desc nulls last,
    s.updated_at desc
  limit 1;

  v_plan_entitled := tongs.billing_status_entitles_access(v_plan_status);

  select
    s.item_id,
    s.status,
    s.current_period_end
  into
    v_storage_item_id,
    v_storage_status,
    v_storage_current_period_end
  from tongs.billing_subscriptions s
  where s.user_id = p_user_id
    and s.purchase_type = 'cloud_storage'
  order by
    case when tongs.billing_status_entitles_access(s.status) then 0 else 1 end,
    s.current_period_end desc nulls last,
    s.updated_at desc
  limit 1;

  if tongs.billing_status_entitles_access(v_storage_status) then
    v_storage_bytes_entitled := tongs.billing_storage_entitled_bytes(v_storage_item_id);
  else
    v_storage_bytes_entitled := 0;
  end if;

  select c.token_balance
  into v_ai_credit_balance
  from tongs.ai_credits c
  where c.user_id = p_user_id;

  v_ai_credit_balance := coalesce(v_ai_credit_balance, 0);

  insert into tongs.account_balances (
    user_id,
    stripe_customer_id,
    plan_item_id,
    plan_interval,
    plan_status,
    plan_current_period_end,
    plan_entitled,
    storage_item_id,
    storage_status,
    storage_current_period_end,
    storage_bytes_entitled,
    ai_credit_balance
  )
  values (
    p_user_id,
    v_customer_id,
    v_plan_item_id,
    v_plan_interval,
    v_plan_status,
    v_plan_current_period_end,
    coalesce(v_plan_entitled, false),
    v_storage_item_id,
    v_storage_status,
    v_storage_current_period_end,
    coalesce(v_storage_bytes_entitled, 0),
    v_ai_credit_balance
  )
  on conflict (user_id) do update
  set
    stripe_customer_id = excluded.stripe_customer_id,
    plan_item_id = excluded.plan_item_id,
    plan_interval = excluded.plan_interval,
    plan_status = excluded.plan_status,
    plan_current_period_end = excluded.plan_current_period_end,
    plan_entitled = excluded.plan_entitled,
    storage_item_id = excluded.storage_item_id,
    storage_status = excluded.storage_status,
    storage_current_period_end = excluded.storage_current_period_end,
    storage_bytes_entitled = excluded.storage_bytes_entitled,
    ai_credit_balance = excluded.ai_credit_balance,
    updated_at = now();

  perform tongs.sync_legacy_profile_from_account_balance(p_user_id);
end;
$$;

create or replace function tongs.recompute_account_balance_from_trigger()
returns trigger
language plpgsql
security definer
set search_path = tongs, public
as $$
begin
  if tg_op = 'DELETE' then
    perform tongs.recompute_account_balance(old.user_id);
    return old;
  end if;

  perform tongs.recompute_account_balance(new.user_id);

  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform tongs.recompute_account_balance(old.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_billing_customers_recompute_account_balance on tongs.billing_customers;
create trigger trg_billing_customers_recompute_account_balance
after insert or update or delete on tongs.billing_customers
for each row execute function tongs.recompute_account_balance_from_trigger();

drop trigger if exists trg_billing_subscriptions_recompute_account_balance on tongs.billing_subscriptions;
create trigger trg_billing_subscriptions_recompute_account_balance
after insert or update or delete on tongs.billing_subscriptions
for each row execute function tongs.recompute_account_balance_from_trigger();

drop trigger if exists trg_ai_credits_recompute_account_balance on tongs.ai_credits;
create trigger trg_ai_credits_recompute_account_balance
after insert or update or delete on tongs.ai_credits
for each row execute function tongs.recompute_account_balance_from_trigger();

create or replace function tongs.upsert_billing_customer(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_email text default null,
  p_customer_name text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_stripe_customer_id text := nullif(btrim(coalesce(p_stripe_customer_id, '')), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_customer_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  if v_stripe_customer_id is null then
    raise exception 'p_stripe_customer_id required'
      using errcode = '22023';
  end if;

  delete from tongs.billing_customers
  where user_id = p_user_id
    and stripe_customer_id <> v_stripe_customer_id;

  insert into tongs.billing_customers (
    user_id,
    stripe_customer_id,
    email,
    customer_name,
    metadata_json
  )
  values (
    p_user_id,
    v_stripe_customer_id,
    v_email,
    v_customer_name,
    v_metadata
  )
  on conflict (stripe_customer_id) do update
  set
    user_id = excluded.user_id,
    email = coalesce(excluded.email, tongs.billing_customers.email),
    customer_name = coalesce(excluded.customer_name, tongs.billing_customers.customer_name),
    metadata_json = tongs.billing_customers.metadata_json || excluded.metadata_json,
    updated_at = now();
end;
$$;

create or replace function tongs.upsert_billing_one_time_purchase(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_event_id text,
  p_stripe_session_id text,
  p_purchase_type text,
  p_item_id text,
  p_status text,
  p_payment_intent_id text default null,
  p_amount_total bigint default null,
  p_currency text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_customer_id text := nullif(btrim(coalesce(p_stripe_customer_id, '')), '');
  v_event_id text := nullif(btrim(coalesce(p_stripe_event_id, '')), '');
  v_session_id text := nullif(btrim(coalesce(p_stripe_session_id, '')), '');
  v_purchase_type text := nullif(lower(btrim(coalesce(p_purchase_type, ''))), '');
  v_item_id text := nullif(lower(btrim(coalesce(p_item_id, ''))), '');
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_payment_intent_id text := nullif(btrim(coalesce(p_payment_intent_id, '')), '');
  v_currency text := nullif(lower(btrim(coalesce(p_currency, ''))), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  if v_customer_id is null then
    raise exception 'p_stripe_customer_id required'
      using errcode = '22023';
  end if;

  if v_event_id is null then
    raise exception 'p_stripe_event_id required'
      using errcode = '22023';
  end if;

  if v_session_id is null then
    raise exception 'p_stripe_session_id required'
      using errcode = '22023';
  end if;

  if v_purchase_type is distinct from 'ai_credits' then
    raise exception 'Unsupported one-time purchase_type: %', coalesce(v_purchase_type, 'null')
      using errcode = '22023';
  end if;

  if v_item_id is null then
    raise exception 'p_item_id required'
      using errcode = '22023';
  end if;

  if v_status is null then
    raise exception 'p_status required'
      using errcode = '22023';
  end if;

  insert into tongs.billing_one_time_purchases (
    stripe_session_id,
    stripe_event_id,
    stripe_customer_id,
    user_id,
    purchase_type,
    item_id,
    status,
    payment_intent_id,
    amount_total,
    currency,
    metadata_json
  )
  values (
    v_session_id,
    v_event_id,
    v_customer_id,
    p_user_id,
    v_purchase_type,
    v_item_id,
    v_status,
    v_payment_intent_id,
    p_amount_total,
    v_currency,
    v_metadata
  )
  on conflict (stripe_session_id) do update
  set
    stripe_event_id = excluded.stripe_event_id,
    stripe_customer_id = excluded.stripe_customer_id,
    user_id = excluded.user_id,
    purchase_type = excluded.purchase_type,
    item_id = excluded.item_id,
    status = excluded.status,
    payment_intent_id = coalesce(excluded.payment_intent_id, tongs.billing_one_time_purchases.payment_intent_id),
    amount_total = coalesce(excluded.amount_total, tongs.billing_one_time_purchases.amount_total),
    currency = coalesce(excluded.currency, tongs.billing_one_time_purchases.currency),
    metadata_json = tongs.billing_one_time_purchases.metadata_json || excluded.metadata_json,
    updated_at = now();
end;
$$;

create or replace function tongs.upsert_billing_subscription(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_purchase_type text,
  p_item_id text,
  p_interval text,
  p_status text,
  p_price_id text default null,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_canceled_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_customer_id text := nullif(btrim(coalesce(p_stripe_customer_id, '')), '');
  v_subscription_id text := nullif(btrim(coalesce(p_stripe_subscription_id, '')), '');
  v_purchase_type text := nullif(lower(btrim(coalesce(p_purchase_type, ''))), '');
  v_item_id text := nullif(lower(btrim(coalesce(p_item_id, ''))), '');
  v_interval text := nullif(lower(btrim(coalesce(p_interval, ''))), '');
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_price_id text := nullif(btrim(coalesce(p_price_id, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_user_id is null then
    raise exception 'p_user_id required'
      using errcode = '22023';
  end if;

  if v_customer_id is null then
    raise exception 'p_stripe_customer_id required'
      using errcode = '22023';
  end if;

  if v_subscription_id is null then
    raise exception 'p_stripe_subscription_id required'
      using errcode = '22023';
  end if;

  if v_purchase_type not in ('subscription', 'cloud_storage') then
    raise exception 'Unsupported subscription purchase_type: %', coalesce(v_purchase_type, 'null')
      using errcode = '22023';
  end if;

  if v_item_id is null then
    raise exception 'p_item_id required'
      using errcode = '22023';
  end if;

  if v_interval is null then
    raise exception 'p_interval required'
      using errcode = '22023';
  end if;

  if v_status is null then
    raise exception 'p_status required'
      using errcode = '22023';
  end if;

  if v_purchase_type = 'subscription' and v_interval not in ('monthly', 'quarterly') then
    raise exception 'Invalid interval for subscription: %', v_interval
      using errcode = '22023';
  end if;

  if v_purchase_type = 'cloud_storage' and v_interval <> 'monthly' then
    raise exception 'Invalid interval for cloud_storage: %', v_interval
      using errcode = '22023';
  end if;

  if v_purchase_type = 'cloud_storage' and tongs.billing_status_entitles_access(v_status) then
    update tongs.billing_subscriptions s
    set
      status = 'replaced',
      cancel_at_period_end = true,
      canceled_at = coalesce(s.canceled_at, now()),
      updated_at = now()
    where s.user_id = p_user_id
      and s.purchase_type = 'cloud_storage'
      and s.stripe_subscription_id <> v_subscription_id
      and tongs.billing_status_entitles_access(s.status);
  end if;

  if v_purchase_type = 'subscription'
     and tongs.billing_item_is_plan(v_item_id)
     and tongs.billing_status_entitles_access(v_status) then
    update tongs.billing_subscriptions s
    set
      status = 'replaced',
      cancel_at_period_end = true,
      canceled_at = coalesce(s.canceled_at, now()),
      updated_at = now()
    where s.user_id = p_user_id
      and s.purchase_type = 'subscription'
      and tongs.billing_item_is_plan(s.item_id)
      and s.stripe_subscription_id <> v_subscription_id
      and tongs.billing_status_entitles_access(s.status);
  end if;

  insert into tongs.billing_subscriptions (
    stripe_subscription_id,
    user_id,
    stripe_customer_id,
    purchase_type,
    item_id,
    interval,
    status,
    price_id,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    metadata_json
  )
  values (
    v_subscription_id,
    p_user_id,
    v_customer_id,
    v_purchase_type,
    v_item_id,
    v_interval,
    v_status,
    v_price_id,
    p_current_period_start,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    p_canceled_at,
    v_metadata
  )
  on conflict (stripe_subscription_id) do update
  set
    user_id = excluded.user_id,
    stripe_customer_id = excluded.stripe_customer_id,
    purchase_type = excluded.purchase_type,
    item_id = excluded.item_id,
    interval = excluded.interval,
    status = excluded.status,
    price_id = coalesce(excluded.price_id, tongs.billing_subscriptions.price_id),
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    metadata_json = tongs.billing_subscriptions.metadata_json || excluded.metadata_json,
    updated_at = now();
end;
$$;

create or replace function tongs.record_billing_event(
  p_stripe_event_id text,
  p_event_type text,
  p_user_id uuid default null,
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null,
  p_stripe_session_id text default null,
  p_livemode boolean default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_event_id text := nullif(btrim(coalesce(p_stripe_event_id, '')), '');
  v_event_type text := nullif(lower(btrim(coalesce(p_event_type, ''))), '');
  v_customer_id text := nullif(btrim(coalesce(p_stripe_customer_id, '')), '');
  v_subscription_id text := nullif(btrim(coalesce(p_stripe_subscription_id, '')), '');
  v_session_id text := nullif(btrim(coalesce(p_stripe_session_id, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if v_event_id is null then
    raise exception 'p_stripe_event_id required'
      using errcode = '22023';
  end if;

  if v_event_type is null then
    raise exception 'p_event_type required'
      using errcode = '22023';
  end if;

  insert into tongs.billing_events (
    stripe_event_id,
    event_type,
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_session_id,
    livemode,
    payload_json,
    processed_at
  )
  values (
    v_event_id,
    v_event_type,
    p_user_id,
    v_customer_id,
    v_subscription_id,
    v_session_id,
    p_livemode,
    v_payload,
    now()
  )
  on conflict (stripe_event_id) do update
  set
    event_type = excluded.event_type,
    user_id = coalesce(excluded.user_id, tongs.billing_events.user_id),
    stripe_customer_id = coalesce(excluded.stripe_customer_id, tongs.billing_events.stripe_customer_id),
    stripe_subscription_id = coalesce(excluded.stripe_subscription_id, tongs.billing_events.stripe_subscription_id),
    stripe_session_id = coalesce(excluded.stripe_session_id, tongs.billing_events.stripe_session_id),
    livemode = coalesce(excluded.livemode, tongs.billing_events.livemode),
    payload_json = excluded.payload_json,
    processed_at = now();
end;
$$;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is not null then
    insert into tongs.billing_customers (
      user_id,
      stripe_customer_id,
      metadata_json
    )
    select
      p.user_id,
      btrim(p.stripe_customer_id),
      jsonb_build_object('source', 'public.profiles_backfill')
    from public.profiles p
    where p.user_id is not null
      and nullif(btrim(coalesce(p.stripe_customer_id, '')), '') is not null
    on conflict (stripe_customer_id) do update
    set
      user_id = excluded.user_id,
      metadata_json = tongs.billing_customers.metadata_json || excluded.metadata_json,
      updated_at = now();
  end if;
end;
$$;

do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct source.user_id
    from (
      select c.user_id from tongs.ai_credits c
      union
      select c.user_id from tongs.billing_customers c
      union
      select s.user_id from tongs.billing_subscriptions s
    ) as source
  loop
    perform tongs.recompute_account_balance(v_user_id);
  end loop;
end;
$$;

revoke all on tongs.billing_customers from public;
revoke all on tongs.billing_subscriptions from public;
revoke all on tongs.billing_one_time_purchases from public;
revoke all on tongs.billing_events from public;
revoke all on tongs.account_balances from public;

revoke all on function tongs.billing_item_is_plan(text) from public;
revoke all on function tongs.billing_status_entitles_access(text) from public;
revoke all on function tongs.billing_storage_entitled_bytes(text) from public;
revoke all on function tongs.sync_legacy_profile_from_account_balance(uuid) from public;
revoke all on function tongs.recompute_account_balance(uuid) from public;
revoke all on function tongs.recompute_account_balance_from_trigger() from public;
revoke all on function tongs.upsert_billing_customer(uuid, text, text, text, jsonb) from public;
revoke all on function tongs.upsert_billing_one_time_purchase(uuid, text, text, text, text, text, text, text, bigint, text, jsonb) from public;
revoke all on function tongs.upsert_billing_subscription(uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, jsonb) from public;
revoke all on function tongs.record_billing_event(text, text, uuid, text, text, text, boolean, jsonb) from public;

grant select on tongs.billing_customers to authenticated;
grant select on tongs.billing_subscriptions to authenticated;
grant select on tongs.billing_one_time_purchases to authenticated;
grant select on tongs.account_balances to authenticated;

grant all on tongs.billing_customers to service_role;
grant all on tongs.billing_subscriptions to service_role;
grant all on tongs.billing_one_time_purchases to service_role;
grant all on tongs.billing_events to service_role;
grant all on tongs.account_balances to service_role;

grant execute on function tongs.billing_item_is_plan(text) to authenticated;
grant execute on function tongs.billing_item_is_plan(text) to service_role;
grant execute on function tongs.billing_status_entitles_access(text) to authenticated;
grant execute on function tongs.billing_status_entitles_access(text) to service_role;
grant execute on function tongs.billing_storage_entitled_bytes(text) to authenticated;
grant execute on function tongs.billing_storage_entitled_bytes(text) to service_role;

grant execute on function tongs.sync_legacy_profile_from_account_balance(uuid) to service_role;
grant execute on function tongs.recompute_account_balance(uuid) to service_role;
grant execute on function tongs.recompute_account_balance_from_trigger() to service_role;
grant execute on function tongs.upsert_billing_customer(uuid, text, text, text, jsonb) to service_role;
grant execute on function tongs.upsert_billing_one_time_purchase(uuid, text, text, text, text, text, text, text, bigint, text, jsonb) to service_role;
grant execute on function tongs.upsert_billing_subscription(uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, jsonb) to service_role;
grant execute on function tongs.record_billing_event(text, text, uuid, text, text, text, boolean, jsonb) to service_role;

commit;
