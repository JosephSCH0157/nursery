\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Slice A behavior assertion failed: %', p_message;
  end if;
end
$$;

-- Fixed synthetic identities. The production trigger path must bootstrap both a
-- public profile and a Tongs workspace without requiring production data.
insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'slice-a-owner@example.invalid', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'slice-a-other@example.invalid', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());

select pg_temp.assert_true(
  (select count(*) = 2 from public.profiles
   where user_id in ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')),
  'signup bootstrap did not create both public.profiles rows'
);

select pg_temp.assert_true(
  (select count(*) = 2 from tongs.workspace_members
   where user_id in ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')),
  'signup bootstrap did not create workspace memberships'
);

-- Service-written compatibility rows exercise subscription display, account
-- balances, public billing, pairing and workpiece projection behavior.
insert into public.account_identities (user_id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'slice-a-owner@example.invalid'),
  ('a1000000-0000-4000-8000-000000000002', 'slice-a-other@example.invalid');

insert into public.account_balances (
  user_id, ai_credit_balance, active_plan_code, active_plan_status
) values
  ('a1000000-0000-4000-8000-000000000001', 250, 'creator', 'active'),
  ('a1000000-0000-4000-8000-000000000002', 500, 'studio', 'active');

insert into public.billing_customers (user_id, stripe_customer_id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'cus_slice_a_owner', 'slice-a-owner@example.invalid'),
  ('a1000000-0000-4000-8000-000000000002', 'cus_slice_a_other', 'slice-a-other@example.invalid');

insert into public.billing_subscriptions (
  user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
  stripe_env, subscription_kind, plan_code, interval_code, status
) values
  ('a1000000-0000-4000-8000-000000000001', 'cus_slice_a_owner', 'sub_slice_a_owner',
   'price_slice_a_owner', 'test', 'forge_plan', 'creator', 'month', 'active'),
  ('a1000000-0000-4000-8000-000000000002', 'cus_slice_a_other', 'sub_slice_a_other',
   'price_slice_a_other', 'test', 'forge_plan', 'studio', 'month', 'active');

insert into public.display_pair_sessions (token, expires_at, created_by) values
  ('slice-a-pair-token', now() + interval '5 minutes', 'a1000000-0000-4000-8000-000000000001');

insert into public.tp_profiles (user_id, profile) values
  ('a1000000-0000-4000-8000-000000000001', '{"speakerProfiles":[{"id":"owner"}]}'),
  ('a1000000-0000-4000-8000-000000000002', '{"speakerProfiles":[{"id":"other"}]}');

update public.profiles
set settings = '{"anvil":{"speakerProfiles":[{"id":"persisted"}]}}', settings_rev = 1
where user_id = 'a1000000-0000-4000-8000-000000000001';

insert into public.workpiece_files (
  workpiece_id, workspace_id, path, type, content_type, bytes, hash_value,
  written_by_tool, written_by_version
) values
  ('a1200000-0000-4000-8000-000000000001',
   (select workspace_id from tongs.workspace_members where user_id = 'a1000000-0000-4000-8000-000000000001' order by workspace_id limit 1),
   'script/owner.md', 'script', 'text/markdown', 10, repeat('a', 64), 'slice-a', '1'),
  ('a1200000-0000-4000-8000-000000000002',
   (select workspace_id from tongs.workspace_members where user_id = 'a1000000-0000-4000-8000-000000000002' order by workspace_id limit 1),
   'script/other.md', 'script', 'text/markdown', 10, repeat('b', 64), 'slice-a', '1');

insert into public.workpiece_events (
  workpiece_id, workspace_id, tool_name, tool_version, event_name
) values
  ('a1200000-0000-4000-8000-000000000001',
   (select workspace_id from tongs.workspace_members where user_id = 'a1000000-0000-4000-8000-000000000001' order by workspace_id limit 1),
   'slice-a', '1', 'owner.event'),
  ('a1200000-0000-4000-8000-000000000002',
   (select workspace_id from tongs.workspace_members where user_id = 'a1000000-0000-4000-8000-000000000002' order by workspace_id limit 1),
   'slice-a', '1', 'other.event');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'profile RLS exposed another user');
select pg_temp.assert_true((select settings_rev = 1 from public.profiles), 'Anvil profile settings were not readable');
select pg_temp.assert_true((select count(*) = 1 from public.tp_profiles), 'teleprompter profile RLS exposed another user');
select pg_temp.assert_true((select count(*) = 1 from public.account_balances), 'account balance RLS exposed another user');
select pg_temp.assert_true((select ai_credit_balance = 250 from public.account_balances), 'account balance display changed');
select pg_temp.assert_true((select count(*) = 1 from public.billing_customers), 'billing customer RLS exposed another user');
select pg_temp.assert_true((select count(*) = 1 from public.billing_subscriptions), 'subscription RLS exposed another user');
select pg_temp.assert_true((select plan_code = 'creator' from public.billing_subscriptions), 'subscription display changed');
select pg_temp.assert_true((select count(*) = 1 from public.account_overview_v), 'security-invoker account view exposed another user');
select pg_temp.assert_true((select count(*) = 1 from public.workpiece_files), 'workpiece file ownership isolation changed');
select pg_temp.assert_true((select count(*) = 1 from public.workpiece_events), 'workpiece event ownership isolation changed');
select pg_temp.assert_true((select count(*) = 0 from public.display_pair_sessions), 'pairing table unexpectedly became authenticated-readable');

do $$
begin
  begin
    insert into public.profiles (user_id)
    values ('a1000000-0000-4000-8000-000000000002');
    raise exception 'cross-user profile insert unexpectedly succeeded';
  exception
    when insufficient_privilege or check_violation or unique_violation then null;
  end;

  begin
    insert into public.workpiece_events (
      workpiece_id, workspace_id, tool_name, tool_version, event_name
    ) values (
      'a1200000-0000-4000-8000-000000000003',
      (select workspace_id from tongs.workspace_members where user_id = 'a1000000-0000-4000-8000-000000000001' order by workspace_id limit 1),
      'slice-a', '1', 'denied.event'
    );
    raise exception 'authenticated workpiece event insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- Function and relation reachability is part of the production contract. These
-- assertions deliberately preserve existing grants without endorsing them as a
-- future design.
select pg_temp.assert_true(not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'), 'anon can execute signup trigger function');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'), 'authenticated can execute signup trigger function');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE'), 'service role lost signup trigger execution');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.start_trial_on_first_login()', 'EXECUTE'), 'anon can execute first-login trial trigger function');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.start_trial_on_first_login()', 'EXECUTE'), 'authenticated can execute first-login trial trigger function');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.start_trial_on_first_login()', 'EXECUTE'), 'service role lost first-login trial trigger execution');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.upsert_billing_subscription(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,timestamptz,integer,jsonb)', 'EXECUTE'), 'authenticated gained billing mutation execution');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.upsert_billing_subscription(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,timestamptz,integer,jsonb)', 'EXECUTE'), 'service role lost billing mutation execution');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.workspaces', 'SELECT'), 'anon gained workspace view access');
select pg_temp.assert_true(has_table_privilege('authenticated', 'public.workspaces', 'SELECT'), 'authenticated lost workspace view access');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.stripe_event_log', 'SELECT'), 'anon gained Stripe event access');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.stripe_event_log', 'SELECT'), 'authenticated gained Stripe event access');
select pg_temp.assert_true(has_table_privilege('service_role', 'public.stripe_event_log', 'SELECT'), 'service role lost Stripe event access');

rollback;

select 'FORGE_PUBLIC_SLICE_A_SECURITY_BEHAVIOR_PASSED' as result;
