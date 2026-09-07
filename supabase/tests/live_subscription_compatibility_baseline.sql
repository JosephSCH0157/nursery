-- Objects that predate the accounting foundation and are needed by the
-- isolated live-subscription compatibility test.

alter table tongs.ai_credits
  add column updated_at timestamptz not null default now();

create table tongs.plan_credit_grants (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text not null,
  plan_item_id text not null,
  period_start timestamptz not null,
  period_end timestamptz,
  credits_granted bigint not null check (credits_granted > 0),
  source_event_id text,
  created_at timestamptz not null default now(),
  unique (stripe_subscription_id, plan_item_id, period_start)
);

create function tongs.plan_included_ai_credits(p_plan_item_id text)
returns bigint language sql immutable as $$
  select case coalesce(lower(btrim(p_plan_item_id)), '')
    when 'creator' then 1000::bigint
    when 'pro' then 4000::bigint
    when 'studio' then 10000::bigint
    else 0::bigint
  end;
$$;

grant all on tongs.ai_credits, tongs.plan_credit_grants to service_role;
grant usage, select on sequence tongs.plan_credit_grants_id_seq to service_role;
grant execute on function tongs.plan_included_ai_credits(text) to service_role;

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '9c000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'existing-plan@example.test', '',
  now(), now(), now()
);
insert into tongs.ai_credits(user_id, token_balance)
values ('9c000000-0000-4000-8000-000000000002', 1000);
insert into tongs.plan_credit_grants(
  user_id, stripe_subscription_id, plan_item_id, period_start, period_end,
  credits_granted, source_event_id, created_at
) values (
  '9c000000-0000-4000-8000-000000000002', 'sub_existing', 'creator',
  '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', 1000,
  'evt_existing', now() - interval '1 day'
);
