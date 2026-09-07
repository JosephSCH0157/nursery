-- Minimal legacy billing read model required by owner_purchase_activity.sql.

create table tongs.billing_customers (
  user_id uuid primary key references auth.users(id),
  stripe_customer_id text not null unique,
  email text,
  customer_name text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tongs.billing_subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id),
  stripe_customer_id text not null,
  purchase_type text not null,
  item_id text not null,
  interval text not null,
  status text not null,
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tongs.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  user_id uuid references auth.users(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_session_id text,
  livemode boolean,
  payload_json jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
