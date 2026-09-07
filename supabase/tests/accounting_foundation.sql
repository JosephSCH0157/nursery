begin;

do $$
declare
  v_customer constant uuid := '9b000000-0000-4000-8000-000000000001';
  v_operator constant uuid := '9b000000-0000-4000-8000-000000000002';
begin
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_customer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'accounting-customer@example.test', '', now(), now(), now()),
    (v_operator, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'accounting-operator@example.test', '', now(), now(), now());
  insert into tongs.platform_operators(user_id, reason, granted_by)
  values(v_operator, 'accounting foundation test', v_operator);
end;
$$;

set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
set local role service_role;

do $$
declare
  v_customer constant uuid := '9b000000-0000-4000-8000-000000000001';
  v_deposit constant uuid := '9b000000-0000-4000-8000-000000000011';
  v_test_deposit constant uuid := '9b000000-0000-4000-8000-000000000012';
  v_receipt constant uuid := '9b000000-0000-4000-8000-000000000021';
  v_test_receipt constant uuid := '9b000000-0000-4000-8000-000000000022';
  v_adjusted_receipt constant uuid := '9b000000-0000-4000-8000-000000000023';
  v_allowance constant uuid := '9b000000-0000-4000-8000-000000000031';
  v_result jsonb;
begin
  v_result := tongs.record_customer_deposit(v_deposit, v_customer, 'evt_accounting_deposit_live',
    'cs_accounting_deposit_live', 'pi_accounting_deposit_live', true, 'credits-test',
    10000000, 'usd', 1000, now(), '{}');
  if (v_result->>'replay')::boolean then raise exception 'first deposit was a replay'; end if;
  v_result := tongs.record_customer_deposit(gen_random_uuid(), v_customer, 'evt_accounting_deposit_live',
    'cs_accounting_deposit_live', 'pi_accounting_deposit_live', true, 'credits-test',
    10000000, 'usd', 1000, now(), '{}');
  if not (v_result->>'replay')::boolean then raise exception 'duplicate deposit was not replay-safe'; end if;
  if (select count(*) from tongs.customer_deposits where stripe_event_id='evt_accounting_deposit_live') <> 1 then
    raise exception 'duplicate deposit created more than one receipt';
  end if;
  if (select coalesce(sum(-amount_micros),0) from tongs.accounting_journal_entries
      where user_id=v_customer and account_code='service_revenue') <> 0 then
    raise exception 'deposit receipt recognized revenue';
  end if;

  perform tongs.record_customer_deposit_processor_fee(
    '9b000000-0000-4000-8000-000000000041', v_deposit, 'txn_accounting_fee', 500000, now(), '{}');
  perform tongs.consume_customer_deposit(
    '9b000000-0000-4000-8000-000000000051', v_deposit, 'allocation:deposit:one',
    'operation:deposit:one', 3000000, 300, now(), '{}');
  v_result := tongs.consume_customer_deposit(
    gen_random_uuid(), v_deposit, 'allocation:deposit:one',
    'operation:deposit:one', 3000000, 300, now(), '{}');
  if not (v_result->>'replay')::boolean then raise exception 'deposit consumption replay failed'; end if;
  perform tongs.consume_customer_deposit(
    '9b000000-0000-4000-8000-000000000052', v_deposit, 'allocation:deposit:two',
    'operation:deposit:two', 4000000, 400, now(), '{}');
  begin
    perform tongs.consume_customer_deposit(
      '9b000000-0000-4000-8000-000000000053', v_deposit, 'allocation:deposit:overspend',
      'operation:deposit:overspend', 4000000, 400, now(), '{}');
    raise exception 'deposit over-allocation succeeded';
  exception when sqlstate 'P0001' then null; end;

  perform tongs.record_customer_deposit_refund(
    '9b000000-0000-4000-8000-000000000061', v_deposit, 're_accounting_refund',
    'evt_accounting_refund', 'refund', 2000000, now(), '{}');
  v_result := tongs.record_customer_deposit_refund(
    gen_random_uuid(), v_deposit, 're_accounting_refund', 'evt_accounting_refund_duplicate',
    'refund', 2000000, now(), '{}');
  if not (v_result->>'replay')::boolean then raise exception 'refund replay failed'; end if;
  if (select coalesce(sum(-amount_micros),0) from tongs.accounting_journal_entries
      where user_id=v_customer and account_code='service_revenue') <> 7000000 then
    raise exception 'consumption did not recognize revenue exactly once';
  end if;
  if (select coalesce(-sum(amount_micros),0) from tongs.accounting_journal_entries
      where user_id=v_customer and account_code='customer_prepaid_liability') <> 1000000 then
    raise exception 'live prepaid liability is not reconstructible';
  end if;
  if (select coalesce(sum(quantity_delta),0) from tongs.accounting_journal_entries
      where user_id=v_customer and account_code='live_customer_credits') <> 100 then
    raise exception 'live credit balance is not reconstructible';
  end if;

  perform tongs.record_customer_deposit(v_test_deposit, v_customer, 'evt_accounting_deposit_test',
    'cs_accounting_deposit_test', 'pi_accounting_deposit_test', false, 'credits-test',
    5000000, 'usd', 500, now(), '{}');
  perform tongs.record_customer_deposit_processor_fee(
    '9b000000-0000-4000-8000-000000000042', v_test_deposit, 'txn_accounting_test_fee', 0, now(), '{}');
  begin
    perform tongs.consume_customer_deposit(
      '9b000000-0000-4000-8000-000000000054', v_test_deposit, 'allocation:test:blocked',
      'operation:test:blocked', 1000000, 100, now(), '{}');
    raise exception 'test deposit funded live consumption';
  exception when insufficient_privilege then null; end;
  if (select coalesce(sum(quantity_delta),0) from tongs.accounting_journal_entries
      where user_id=v_customer and account_code='test_customer_credits') <> 500 then
    raise exception 'test credits did not remain isolated';
  end if;

  perform tongs.record_subscription_cycle_receipt(v_receipt, v_customer, 'evt_accounting_invoice_live',
    'in_accounting_live', 'sub_accounting_live', 'pi_accounting_invoice_live', true,
    'subscription', 'forge-pro-monthly', 12000000, 'usd', now()-interval '1 day',
    now()+interval '29 days', now(), '{}');
  perform tongs.create_paid_allowance_grant(v_allowance, v_receipt, 1200, 9000000,
    6000000, 'allocation-policy-test-v1', now(), '{}');
  perform tongs.consume_paid_allowance('9b000000-0000-4000-8000-000000000071', v_allowance,
    'allocation:allowance:one', 'operation:allowance:one', 600, 4500000, 3000000, now(), '{}');
  v_result := tongs.consume_paid_allowance(gen_random_uuid(), v_allowance,
    'allocation:allowance:one', 'operation:allowance:one', 600, 4500000, 3000000, now(), '{}');
  if not (v_result->>'replay')::boolean then raise exception 'allowance consumption replay failed'; end if;
  begin
    perform tongs.consume_paid_allowance('9b000000-0000-4000-8000-000000000072', v_allowance,
      'allocation:allowance:overspend', 'operation:allowance:overspend', 601, 4500001, 3000001, now(), '{}');
    raise exception 'allowance over-allocation succeeded';
  exception when sqlstate 'P0001' then null; end;

  perform tongs.record_subscription_cycle_receipt(v_test_receipt, v_customer, 'evt_accounting_invoice_test',
    'in_accounting_test', 'sub_accounting_test', 'pi_accounting_invoice_test', false,
    'subscription', 'forge-pro-monthly', 12000000, 'usd', now()-interval '1 day',
    now()+interval '29 days', now(), '{}');
  begin
    perform tongs.create_paid_allowance_grant(gen_random_uuid(), v_test_receipt, 1200, 9000000,
      6000000, 'allocation-policy-test-v1', now(), '{}');
    raise exception 'test subscription receipt created live allowance';
  exception when insufficient_privilege then null; end;

  perform tongs.record_subscription_cycle_receipt(v_adjusted_receipt, v_customer, 'evt_accounting_invoice_adjusted',
    'in_accounting_adjusted', 'sub_accounting_adjusted', 'pi_accounting_invoice_adjusted', true,
    'subscription', 'forge-pro-monthly', 12000000, 'usd', now()-interval '1 day',
    now()+interval '29 days', now(), '{}');
  perform tongs.record_subscription_cycle_adjustment(
    '9b000000-0000-4000-8000-000000000081', v_adjusted_receipt, 'dp_accounting_adjusted',
    'evt_accounting_dispute', 'dispute', 12000000, now(), '{}');
  begin
    perform tongs.create_paid_allowance_grant(gen_random_uuid(), v_adjusted_receipt, 1200, 9000000,
      6000000, 'allocation-policy-test-v1', now(), '{}');
    raise exception 'disputed subscription receipt created live allowance';
  exception when sqlstate 'P0001' then null; end;

  if exists (select 1 from tongs.verify_accounting_reconstruction()) then
    raise exception 'journal contains an unbalanced monetary event';
  end if;
end;
$$;

reset role;

do $$
declare
  v_customer constant uuid := '9b000000-0000-4000-8000-000000000001';
  v_event constant uuid := '9b000000-0000-4000-8000-000000000091';
begin
  insert into tongs.accounting_journal_events(
    id, idempotency_key, event_type, environment, source_type, source_id,
    user_id, payload_hash, metadata_json, occurred_at
  ) values (
    v_event, 'legacy-test-opening-balance', 'legacy_credit_opening_balance_captured',
    'legacy_unverified', 'test_fixture', v_customer::text, v_customer,
    repeat('0',64), '{}', now()
  );
  insert into tongs.accounting_journal_entries(
    event_id, line_number, account_code, user_id, unit_kind, quantity_delta
  ) values (v_event, 1, 'legacy_unverified_credits', v_customer, 'forge_credit', 777);
  insert into tongs.legacy_credit_opening_balances(
    user_id, credit_units, eligible_for_live_funding, journal_event_id, captured_at, source_relation
  ) values (v_customer, 777, false, v_event, now(), 'test_fixture');
end;
$$;

do $$
begin
  if has_table_privilege('authenticated', 'tongs.accounting_journal_entries', 'select')
     or has_table_privilege('authenticated', 'tongs.customer_deposits', 'select')
     or has_table_privilege('authenticated', 'tongs.paid_allowance_grants', 'select')
     or has_table_privilege('authenticated', 'tongs.owner_operating_budgets', 'select') then
    raise exception 'authenticated direct accounting-table access remains';
  end if;
  if has_function_privilege('authenticated',
      'tongs.consume_customer_deposit(uuid,uuid,text,text,bigint,bigint,timestamptz,jsonb)', 'execute')
     or has_function_privilege('authenticated',
     'tongs.consume_paid_allowance(uuid,uuid,text,text,bigint,bigint,bigint,timestamptz,jsonb)', 'execute') then
    raise exception 'authenticated caller can allocate accounting balances';
  end if;
  if pg_get_functiondef(
      'tongs.consume_customer_deposit(uuid,uuid,text,text,bigint,bigint,timestamptz,jsonb)'::regprocedure
    ) !~* 'for update'
     or pg_get_functiondef(
      'tongs.consume_paid_allowance(uuid,uuid,text,text,bigint,bigint,bigint,timestamptz,jsonb)'::regprocedure
    ) !~* 'for update'
     or pg_get_functiondef(
      'tongs.record_customer_deposit(uuid,uuid,text,text,text,boolean,text,bigint,text,bigint,timestamptz,jsonb)'::regprocedure
    ) !~* 'pg_advisory_xact_lock' then
    raise exception 'concurrent-allocation locking contract is missing';
  end if;
end;
$$;

set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '9b000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare v_balances jsonb;
begin
  v_balances := tongs.read_my_accounting_balances();
  if v_balances#>>'{live,credit_units}' <> '100'
     or v_balances#>>'{test,credit_units}' <> '500'
     or v_balances#>>'{legacy_unverified,credit_units}' <> '777'
     or v_balances#>>'{legacy_unverified,eligible_for_live_funding}' <> 'false'
     or v_balances::text ~ '(service_revenue|processor_fee|wholesale|margin|markup)' then
    raise exception 'customer-safe accounting response is incorrect or leaks owner data: %', v_balances;
  end if;
  begin
    perform tongs.read_owner_accounting_foundation(null, 10);
    raise exception 'ordinary customer reached owner accounting audit';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.create_owner_operating_budget_draft(gen_random_uuid(), 'production', null,
      'runway', 'generate', 'test', 'usd', now(), now()+interval '1 month', 'unauthorized test');
    raise exception 'ordinary customer created owner budget';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '9b000000-0000-4000-8000-000000000002';
set local role authenticated;

do $$
declare
  v_budget constant uuid := '9b000000-0000-4000-8000-000000000099';
  v_result jsonb;
begin
  v_result := tongs.create_owner_operating_budget_draft(v_budget, 'production', null,
    'runway', 'generate', 'test', 'usd', now(), now()+interval '1 month', 'draft only test');
  if v_result->>'status' <> 'draft' or v_result->'maximum_amount_micros' <> 'null'::jsonb
     or (v_result->>'spending_enabled')::boolean then
    raise exception 'owner budget was not created as a disabled amount-less draft: %', v_result;
  end if;
  begin
    perform tongs.revise_owner_operating_budget(v_budget, 'active', 1000000, 'activation must wait');
    raise exception 'foundation release activated owner spending';
  exception when invalid_parameter_value then null; end;
  if (tongs.read_owner_accounting_foundation(null, 20)->>'spending_gate_active')::boolean then
    raise exception 'accounting foundation activated spending gate';
  end if;
end;
$$;

reset role;
rollback;
