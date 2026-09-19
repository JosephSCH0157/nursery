-- LOCAL CERTIFICATION FIXTURE ONLY. Never place this file under
-- supabase/migrations and never execute it against a linked database.
--
-- 20260917012424 requires exactly one active normal-customer Test authority
-- for Hearth chat, then derives the script-generation canary authority from it.
-- This local row uses the fixture operator and an empty fixture workspace. It
-- creates no balance, quote, reservation, purchase, Stripe, or execution state.

begin;

do $$
begin
  if current_setting('forge.local_historical_replay', true)
       is distinct from 'mid-september-v1' then
    raise exception 'local historical replay guard is missing' using errcode='42501';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260917012316'
  ) or exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260917012424'
  ) then
    raise exception 'customer canary fixture requires the exact pre-canary boundary'
      using errcode='P0001';
  end if;
  if exists (
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where authorization_kind='normal_customer' and financial_environment='test'
      and route_code='hearth.chat_completion' and provider='openai'
      and model_or_sku='gpt-5.6-luna' and status='active'
  ) then
    raise exception 'normal Test Hearth chat authority already exists'
      using errcode='23505';
  end if;
end $$;

insert into tongs.orgs(id,name,created_by)
values (
  'fe000000-0000-4000-8000-000000000200',
  'Mid-September local replay fixture',
  'fe000000-0000-4000-8000-000000000001'
);

insert into tongs.workspaces(id,created_by,name,org_id)
values (
  'fe000000-0000-4000-8000-000000000201',
  'fe000000-0000-4000-8000-000000000001',
  'Mid-September local replay fixture',
  'fe000000-0000-4000-8000-000000000200'
);

insert into tongs.customer_paid_execution_scope_authorizations(
  id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
  pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
  maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
  maximum_concurrency,rolling_window_seconds,valid_from,valid_until,status,
  reason,created_by,authorization_kind
) values (
  '4e28dc91-5042-4c98-ad2e-8fd8bd5ddd51',
  'fe000000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000201',
  'test','hearth.chat_completion','openai','gpt-5.6-luna',
  'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a',
  '10000000-0000-4000-8000-000000000010',
  null,15000,11015,1,null,'2026-09-16T13:07:40.059068Z',null,'active',
  'Local-only historical prerequisite for the standard-customer script-generation canary.',
  'fe000000-0000-4000-8000-000000000001','normal_customer'
);

do $$
begin
  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where authorization_kind='normal_customer' and financial_environment='test'
        and route_code='hearth.chat_completion' and provider='openai'
        and model_or_sku='gpt-5.6-luna' and status='active') <> 1 then
    raise exception 'customer canary authority fixture was not established';
  end if;
  if exists (select 1 from tongs.customer_deposits)
     or exists (select 1 from tongs.customer_spending_quotes)
     or exists (select 1 from tongs.funding_reservations) then
    raise exception 'customer canary fixture created forbidden financial state';
  end if;
end $$;

commit;
