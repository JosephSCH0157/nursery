begin;

do $$
declare
  v_customer constant uuid := '9c000000-0000-4000-8000-000000000001';
  v_operator constant uuid := '9c000000-0000-4000-8000-000000000002';
begin
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    (v_customer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pricing-customer@example.test', '', now(), now(), now()),
    (v_operator, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pricing-operator@example.test', '', now(), now(), now());
  insert into tongs.platform_operators(user_id, reason, granted_by)
  values(v_operator, 'private pricing test', v_operator);
end;
$$;

set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000002';
set local role authenticated;

do $$
declare
  v_draft jsonb;
  v_ready jsonb;
  v_preview jsonb;
  v_components jsonb := jsonb_build_array(
    jsonb_build_object('component_code','runway-generation','component_kind','direct_provider',
      'credential_funding','forge','provider_label','Runway','success_ceiling_micros',400000,
      'failure_ceiling_micros',200000,'cost_policy_revision','runway-test-v1','tail_policy','none'),
    jsonb_build_object('component_code','fly-transcode','component_kind','compute',
      'credential_funding','forge','provider_label','Fly.io','success_ceiling_micros',100000,
      'failure_ceiling_micros',50000,'cost_policy_revision','fly-test-v1','tail_policy','none')
  );
begin
  v_draft := tongs.commit_private_pricing_revision(
    '9c000000-0000-4000-8000-000000000010', 'default-private-test', 'default', null, null, 0,
    '9c000000-0000-4000-8000-000000000011', null, null, 'usd', v_components,
    '["provider_billed_failure"]', '["prebilling_rejection"]', '{"outputs":1}',
    '{"kind":"none"}', 'draft without commercial decisions');
  if v_draft->>'state' <> 'draft' or (v_draft->>'activation_enabled')::boolean then
    raise exception 'amount-less pricing draft was not safely disabled: %', v_draft;
  end if;
  v_preview := tongs.preview_price('9c000000-0000-4000-8000-000000000011');
  if v_preview->>'customer_price_ceiling_micros' is not null
     or v_preview#>>'{missing_decisions,0}' <> 'markup_basis_points' then
    raise exception 'draft preview did not report missing owner decisions: %', v_preview;
  end if;
  v_ready := tongs.commit_private_pricing_revision(
    '9c000000-0000-4000-8000-000000000010', 'default-private-test', 'default', null, null, 1,
    '9c000000-0000-4000-8000-000000000012', 2000, 60, 'usd', v_components,
    '["provider_billed_failure"]', '["prebilling_rejection"]', '{"outputs":1}',
    '{"kind":"none"}', 'transaction-scoped test pricing only');
  if v_ready->>'state' <> 'review_ready' or (v_ready->>'activation_enabled')::boolean then
    raise exception 'review-ready pricing revision activated execution: %', v_ready;
  end if;
  v_preview := tongs.preview_price('9c000000-0000-4000-8000-000000000012');
  if (v_preview->>'full_cost_ceiling_micros')::bigint <> 500000
     or (v_preview->>'failure_cost_ceiling_micros')::bigint <> 250000
     or (v_preview->>'customer_price_ceiling_micros')::bigint <> 600000
     or (v_preview->>'billable_failure_ceiling_micros')::bigint <> 300000
     or (v_preview->>'expected_margin_micros')::bigint <> 100000
     or (v_preview->>'activation_enabled')::boolean then
    raise exception 'private full-cost preview arithmetic is incorrect: %', v_preview;
  end if;
end;
$$;

reset role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
set local role service_role;

do $$
declare
  v_customer constant uuid := '9c000000-0000-4000-8000-000000000001';
  v_deposit constant uuid := '9c000000-0000-4000-8000-000000000020';
  v_test_deposit constant uuid := '9c000000-0000-4000-8000-000000000021';
  v_release_deposit constant uuid := '9c000000-0000-4000-8000-000000000024';
  v_quote_one constant uuid := '9c000000-0000-4000-8000-000000000030';
  v_quote_two constant uuid := '9c000000-0000-4000-8000-000000000031';
  v_quote_three constant uuid := '9c000000-0000-4000-8000-000000000032';
  v_result jsonb;
begin
  perform tongs.record_customer_deposit(v_deposit, v_customer, 'evt_pricing_deposit_live',
    'cs_pricing_deposit_live', 'pi_pricing_deposit_live', true, 'pricing-pack',
    1000000, 'usd', 100, now(), '{}');
  perform tongs.record_customer_deposit_processor_fee(
    '9c000000-0000-4000-8000-000000000022', v_deposit, 'txn_pricing_fee_live', 0, now(), '{}');
  perform tongs.record_customer_deposit(v_test_deposit, v_customer, 'evt_pricing_deposit_test',
    'cs_pricing_deposit_test', 'pi_pricing_deposit_test', false, 'pricing-pack',
    1000000, 'usd', 100, now(), '{}');
  perform tongs.record_customer_deposit_processor_fee(
    '9c000000-0000-4000-8000-000000000023', v_test_deposit, 'txn_pricing_fee_test', 0, now(), '{}');
  perform tongs.record_customer_deposit(v_release_deposit, v_customer, 'evt_pricing_deposit_release',
    'cs_pricing_deposit_release', 'pi_pricing_deposit_release', true, 'pricing-pack',
    600000, 'usd', 60, now(), '{}');
  perform tongs.record_customer_deposit_processor_fee(
    '9c000000-0000-4000-8000-000000000025', v_release_deposit, 'txn_pricing_fee_release', 0, now(), '{}');
  v_result := tongs.create_shadow_spending_quote(v_quote_one, v_customer, 'pricing-operation-one',
    'runway-generate', null, '9c000000-0000-4000-8000-000000000012', repeat('a',64),
    '[{"component":"generation","provider_label":"Runway","credential_source":"forge"},
      {"component":"transcode","provider_label":"Fly.io","credential_source":"forge"}]',
    now()+interval '30 minutes');
  if (v_result->>'execution_authorized')::boolean then raise exception 'shadow quote authorized execution'; end if;
  perform tongs.create_shadow_spending_quote(v_quote_two, v_customer, 'pricing-operation-two',
    'runway-generate', null, '9c000000-0000-4000-8000-000000000012', repeat('b',64),
    '[{"component":"generation","provider_label":"Runway","credential_source":"forge"}]',
    now()+interval '30 minutes');
  perform tongs.create_shadow_spending_quote(v_quote_three, v_customer, 'pricing-operation-three',
    'runway-generate', null, '9c000000-0000-4000-8000-000000000012', repeat('c',64),
    '[{"component":"generation","provider_label":"Runway","credential_source":"forge"}]',
    now()+interval '30 minutes');
end;
$$;

reset role;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '9c000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare
  v_quote_one constant uuid := '9c000000-0000-4000-8000-000000000030';
  v_quote_two constant uuid := '9c000000-0000-4000-8000-000000000031';
  v_quote_three constant uuid := '9c000000-0000-4000-8000-000000000032';
  v_hash_one text;
  v_hash_two text;
  v_hash_three text;
  v_receipt jsonb;
begin
  v_hash_one := tongs.read_my_spending_quote(v_quote_one)->>'quote_hash';
  v_hash_two := tongs.read_my_spending_quote(v_quote_two)->>'quote_hash';
  v_hash_three := tongs.read_my_spending_quote(v_quote_three)->>'quote_hash';
  perform tongs.accept_quote(v_quote_one, '9c000000-0000-4000-8000-000000000040',
    'accept-pricing-operation-one', v_hash_one);
  perform tongs.accept_quote(v_quote_two, '9c000000-0000-4000-8000-000000000041',
    'accept-pricing-operation-two', v_hash_two);
  perform tongs.accept_quote(v_quote_three, '9c000000-0000-4000-8000-000000000042',
    'accept-pricing-operation-three', v_hash_three);
  v_receipt := tongs.read_my_spending_quote(v_quote_one);
  if (v_receipt->>'normal_maximum_charge_micros')::bigint <> 600000
     or (v_receipt->>'billable_failure_maximum_charge_micros')::bigint <> 300000
     or v_receipt::text ~* '(wholesale|markup|margin|cost_policy|processor_fee)' then
    raise exception 'customer quote is incorrect or leaks private economics: %', v_receipt;
  end if;
  begin
    perform tongs.preview_price('9c000000-0000-4000-8000-000000000012');
    raise exception 'ordinary customer reached private pricing preview';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
set local role service_role;

do $$
declare
  v_deposit constant uuid := '9c000000-0000-4000-8000-000000000020';
  v_test_deposit constant uuid := '9c000000-0000-4000-8000-000000000021';
  v_release_deposit constant uuid := '9c000000-0000-4000-8000-000000000024';
  v_reservation constant uuid := '9c000000-0000-4000-8000-000000000050';
  v_result jsonb;
begin
  v_result := tongs.reserve_operation(v_reservation, '9c000000-0000-4000-8000-000000000030',
    'customer_deposit', v_deposit, 'reserve-pricing-operation-one');
  if v_result->>'state' <> 'reserved' or (v_result->>'provider_execution_authorized')::boolean then
    raise exception 'reservation was not created in shadow mode: %', v_result;
  end if;
  v_result := tongs.reserve_operation(v_reservation, '9c000000-0000-4000-8000-000000000030',
    'customer_deposit', v_deposit, 'reserve-pricing-operation-one');
  if not (v_result->>'replay')::boolean then raise exception 'reservation replay created duplicate state'; end if;
  begin
    perform tongs.reserve_operation('9c000000-0000-4000-8000-000000000051',
      '9c000000-0000-4000-8000-000000000031', 'customer_deposit', v_deposit,
      'reserve-pricing-operation-two');
    raise exception 'concurrent-equivalent held funds were overspent';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform tongs.reserve_operation('9c000000-0000-4000-8000-000000000052',
      '9c000000-0000-4000-8000-000000000031', 'customer_deposit', v_test_deposit,
      'reserve-test-funds-blocked');
    raise exception 'test deposit funded live reservation';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.reserve_operation('9c000000-0000-4000-8000-000000000052',
      '9c000000-0000-4000-8000-000000000031', 'legacy_unverified', null,
      'reserve-legacy-funds-blocked');
    raise exception 'legacy unverified credits funded live reservation';
  exception when invalid_parameter_value then null; end;
  begin
    perform tongs.reserve_operation('9c000000-0000-4000-8000-000000000052',
      '9c000000-0000-4000-8000-000000000031', 'owner_budget', gen_random_uuid(),
      'reserve-owner-budget-blocked');
    raise exception 'owner budget funded spending without approval';
  exception when insufficient_privilege then null; end;
  v_result := tongs.begin_provider_attempt(v_reservation, 'attempt-pricing-one', 60, '{}');
  if (v_result->>'provider_execution_authorized')::boolean or v_result->>'reason' <> 'shadow_mode' then
    raise exception 'provider attempt escaped shadow mode: %', v_result;
  end if;
  v_result := tongs.begin_provider_attempt(v_reservation, 'attempt-pricing-one', 60, '{}');
  if not (v_result->>'replay')::boolean then raise exception 'provider attempt was not idempotent'; end if;
  perform tongs.mark_submission_unknown(v_reservation, 'unknown-pricing-operation-one',
    'attempt-pricing-one', '{"provider_request_id":"unknown"}');
  v_result := tongs.begin_provider_attempt(v_reservation, 'attempt-pricing-two', 60, '{}');
  if v_result->>'reason' <> 'ambiguous_submission_requires_reconciliation'
     or (v_result->>'provider_execution_authorized')::boolean then
    raise exception 'ambiguous submission permitted automatic resubmission: %', v_result;
  end if;
  begin
    perform tongs.release_operation(v_reservation, 'release-unknown-pricing-one', 'timeout', '{}');
    raise exception 'ambiguous submission released its reservation automatically';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform tongs.settle_operation(v_reservation, '9c000000-0000-4000-8000-000000000060',
      'settle-disabled-pricing-one', 'success', null, 500000, '{}');
    raise exception 'customer settlement ran while activation was disabled';
  exception when insufficient_privilege then null; end;
  if (select count(*) from tongs.funding_reservation_events
      where reservation_id = v_reservation and event_type = 'provider_attempt_shadowed') <> 1 then
    raise exception 'retry created more than one provider-attempt event';
  end if;
  perform tongs.reserve_operation('9c000000-0000-4000-8000-000000000053',
    '9c000000-0000-4000-8000-000000000031', 'customer_deposit', v_release_deposit,
    'reserve-release-operation-two');
  v_result := tongs.release_operation('9c000000-0000-4000-8000-000000000053',
    'release-pricing-operation-two', 'definitive prebilling rejection', '{}');
  if v_result->>'state' <> 'released' or not (v_result->>'funds_released')::boolean
     or (select event_type from tongs.funding_reservation_events
       where reservation_id='9c000000-0000-4000-8000-000000000053'
       order by sequence desc limit 1) <> 'released'
     or exists (select 1 from tongs.customer_deposit_consumptions where deposit_id = v_release_deposit) then
    raise exception 'release did not restore the full available balance: %', v_result;
  end if;
  perform tongs.reserve_operation('9c000000-0000-4000-8000-000000000054',
    '9c000000-0000-4000-8000-000000000032', 'customer_deposit', v_release_deposit,
    'reserve-failure-operation-three');
  v_result := tongs.record_provider_failure('9c000000-0000-4000-8000-000000000054',
    'failure-pricing-operation-three', 'provider_billed_failure', '{"provider_billed":true}');
  if not (v_result->>'billable')::boolean
     or (v_result->>'maximum_customer_charge_micros')::bigint <> 300000 then
    raise exception 'accepted failure contract was not preserved: %', v_result;
  end if;
end;
$$;

reset role;

insert into tongs.paid_execution_control_revisions(
  revision, pricing_activation_enabled, reservation_shadow_enabled,
  customer_settlement_enabled, owner_budget_spending_enabled,
  provider_execution_enabled, reason
) values (2, true, true, true, false, false, 'transaction-scoped settlement test only');

set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '';
set local role service_role;

do $$
declare
  v_result jsonb;
begin
  v_result := tongs.settle_operation('9c000000-0000-4000-8000-000000000050',
    '9c000000-0000-4000-8000-000000000060', 'settle-pricing-operation-one',
    'success', null, 500000, '{"reconciled_from":"submission_unknown"}');
  if v_result->>'state' <> 'settled' or (v_result->>'customer_charge_micros')::bigint <> 600000 then
    raise exception 'reconciled settlement failed: %', v_result;
  end if;
  v_result := tongs.settle_operation('9c000000-0000-4000-8000-000000000050',
    '9c000000-0000-4000-8000-000000000060', 'settle-pricing-operation-one',
    'success', null, 500000, '{"reconciled_from":"submission_unknown"}');
  if not (v_result->>'replay')::boolean then raise exception 'settlement replay duplicated consumption'; end if;
  if (select count(*) from tongs.customer_deposit_consumptions
      where operation_id = 'pricing-operation-one') <> 1
     or (select coalesce(sum(-amount_micros),0) from tongs.accounting_journal_entries
       where user_id='9c000000-0000-4000-8000-000000000001'
         and account_code='service_revenue') <> 600000 then
    raise exception 'settlement did not recognize revenue exactly once';
  end if;
  v_result := tongs.settle_operation('9c000000-0000-4000-8000-000000000054',
    '9c000000-0000-4000-8000-000000000061', 'settle-pricing-operation-three',
    'billable_failure', 'provider_billed_failure', 600000,
    '{"expected_priced_failure_micros":720000}');
  if (v_result->>'customer_charge_micros')::bigint <> 300000
     or not (v_result->>'customer_ceiling_applied')::boolean
     or not exists (select 1 from tongs.pricing_discrepancies
       where reservation_id='9c000000-0000-4000-8000-000000000054'
         and discrepancy_type='customer_ceiling_overrun')
     or not exists (select 1 from tongs.pricing_discrepancies
       where reservation_id='9c000000-0000-4000-8000-000000000054'
         and discrepancy_type='wholesale_ceiling_overrun') then
    raise exception 'billable failure exceeded or bypassed its accepted ceiling: %', v_result;
  end if;
end;
$$;

reset role;

do $$
begin
  if has_table_privilege('authenticated', 'tongs.private_pricing_revisions', 'select')
     or has_table_privilege('authenticated', 'tongs.private_pricing_cost_components', 'select')
     or has_table_privilege('authenticated', 'tongs.funding_reservations', 'select')
     or has_table_privilege('authenticated', 'tongs.pricing_discrepancies', 'select') then
    raise exception 'authenticated direct access to private pricing or reservation tables remains';
  end if;
  if has_function_privilege('authenticated',
      'tongs.reserve_operation(uuid,uuid,text,uuid,text)', 'execute')
     or has_function_privilege('authenticated',
      'tongs.settle_operation(uuid,uuid,text,text,text,bigint,jsonb)', 'execute') then
    raise exception 'authenticated caller can mutate reservations or settlements';
  end if;
  if pg_get_functiondef('tongs.reserve_operation(uuid,uuid,text,uuid,text)'::regprocedure) !~* 'for update'
     or pg_get_functiondef('tongs.reserve_operation(uuid,uuid,text,uuid,text)'::regprocedure) !~* 'pg_advisory_xact_lock' then
    raise exception 'atomic reservation locking contract is missing';
  end if;
  if (select provider_execution_enabled from tongs.paid_execution_control_revisions where revision = 1)
     or (select customer_settlement_enabled from tongs.paid_execution_control_revisions where revision = 1)
     or (select pricing_activation_enabled from tongs.paid_execution_control_revisions where revision = 1)
     or exists (select 1 from tongs.paid_execution_control_revisions where provider_execution_enabled)
     or exists (select 1 from tongs.private_pricing_revisions where lifecycle_state not in ('draft','review_ready')) then
    raise exception 'pricing, settlement, or provider execution was activated';
  end if;
end;
$$;

rollback;
