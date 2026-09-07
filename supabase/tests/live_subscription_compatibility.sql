begin;

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '9c000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'new-plan@example.test', '',
  now(), now(), now()
);

set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
set local role service_role;

do $$
declare
  v_user constant uuid := '9c000000-0000-4000-8000-000000000001';
  v_existing_user constant uuid := '9c000000-0000-4000-8000-000000000002';
  v_receipt constant uuid := '9c000000-0000-4000-8000-000000000011';
  v_existing_receipt constant uuid := '9c000000-0000-4000-8000-000000000012';
  v_test_receipt constant uuid := '9c000000-0000-4000-8000-000000000013';
  v_result jsonb;
  v_legacy_result bigint;
begin
  perform tongs.record_subscription_cycle_receipt(
    v_receipt, v_user, 'evt_live_new', 'in_live_new', 'sub_live_new', 'pi_live_new', true,
    'subscription', 'pro', 10000000, 'usd',
    '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', now(), '{}'
  );
  v_result := tongs.grant_legacy_plan_entitlement_compatibility(
    '9c000000-0000-4000-8000-000000000021', v_receipt, now(), '{}'
  );
  if (v_result->>'replay')::boolean
     or (v_result->>'entitlement_units')::bigint <> 4000
     or (v_result->>'eligible_for_shared_spending_gate')::boolean then
    raise exception 'first compatibility grant returned the wrong contract: %', v_result;
  end if;

  v_result := tongs.grant_legacy_plan_entitlement_compatibility(
    '9c000000-0000-4000-8000-000000000022', v_receipt, now(), '{}'
  );
  if not (v_result->>'replay')::boolean then
    raise exception 'compatibility replay was not idempotent: %', v_result;
  end if;
  if (select token_balance from tongs.ai_credits where user_id = v_user) <> 4000
     or (select count(*) from tongs.plan_credit_grants where user_id = v_user) <> 1
     or (select count(*) from tongs.legacy_plan_entitlement_compatibility_grants where user_id = v_user) <> 1
     or (select coalesce(sum(quantity_delta), 0) from tongs.accounting_journal_entries
         where user_id = v_user and account_code = 'legacy_unverified_credits') <> 4000 then
    raise exception 'new compatibility entitlement was duplicated or not reconstructible';
  end if;

  v_legacy_result := tongs.grant_plan_cycle_ai_credits(
    v_user, 'sub_live_new', 'pro', '2026-09-01T00:00:00Z',
    '2026-10-01T00:00:00Z', 'evt_live_new'
  );
  if v_legacy_result <> 0 or (select token_balance from tongs.ai_credits where user_id = v_user) <> 4000 then
    raise exception 'legacy wrapper duplicated a recorded entitlement';
  end if;

  perform tongs.record_subscription_cycle_receipt(
    v_existing_receipt, v_existing_user, 'evt_live_existing_receipt', 'in_live_existing',
    'sub_existing', 'pi_live_existing', true, 'subscription', 'creator', 5000000, 'usd',
    '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z', now(), '{}'
  );
  v_result := tongs.grant_legacy_plan_entitlement_compatibility(
    '9c000000-0000-4000-8000-000000000023', v_existing_receipt, now(), '{}'
  );
  if not (v_result->>'adopted_existing')::boolean
     or not (v_result->>'opening_balance_already_captured')::boolean
     or (select token_balance from tongs.ai_credits where user_id = v_existing_user) <> 1000
     or (select coalesce(sum(quantity_delta), 0) from tongs.accounting_journal_entries
         where user_id = v_existing_user and account_code = 'legacy_unverified_credits') <> 1000 then
    raise exception 'existing entitlement was not adopted without duplication: %', v_result;
  end if;

  perform tongs.record_subscription_cycle_receipt(
    v_test_receipt, v_user, 'evt_test_receipt', 'in_test_receipt', 'sub_test', 'pi_test', false,
    'subscription', 'pro', 10000000, 'usd',
    '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', now(), '{}'
  );
  begin
    perform tongs.grant_legacy_plan_entitlement_compatibility(
      '9c000000-0000-4000-8000-000000000024', v_test_receipt, now(), '{}'
    );
    raise exception 'test receipt created a live compatibility entitlement';
  exception when insufficient_privilege then null;
  end;

  if exists (select 1 from tongs.paid_allowance_grants)
     or exists (
       select 1 from tongs.accounting_journal_entries
       where account_code in ('service_revenue', 'allowance_entitlement_units', 'live_customer_credits')
     ) then
    raise exception 'compatibility path created funding, allowance, or revenue';
  end if;

  begin
    perform tongs.grant_plan_cycle_ai_credits(
      v_user, 'sub_without_receipt', 'pro', '2026-11-01T00:00:00Z',
      '2026-12-01T00:00:00Z', 'evt_without_receipt'
    );
    raise exception 'legacy wrapper granted without a recorded receipt';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if has_table_privilege('authenticated', 'tongs.legacy_plan_entitlement_compatibility_grants', 'select')
     or has_function_privilege(
       'authenticated',
       'tongs.grant_legacy_plan_entitlement_compatibility(uuid,uuid,timestamptz,jsonb)',
       'execute'
     ) then
    raise exception 'customer can access the service-role compatibility grant path';
  end if;
end;
$$;

rollback;
