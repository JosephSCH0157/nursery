begin;

do $$
declare v_hash text;
begin
  select encode(extensions.digest(pg_get_functiondef(
    'tongs.read_my_customer_funding()'::regprocedure
  ),'sha256'),'hex') into v_hash;
  if v_hash <> '3bcab056a448a45bc7b075e31f6af1cc41809e66de2d725f4e5412aadec8f783' then
    raise exception 'final customer-funding v4 definition differs from reviewed connected authority: %',v_hash;
  end if;
  if not has_function_privilege('authenticated','tongs.read_my_customer_funding()','execute')
     or not has_function_privilege('service_role','tongs.read_my_customer_funding()','execute')
     or has_function_privilege('anon','tongs.read_my_customer_funding()','execute')
     or has_function_privilege('public','tongs.read_my_customer_funding()','execute') then
    raise exception 'customer-funding v4 execute grants are not self-only/service-compatible';
  end if;
  if not (select prosecdef from pg_proc where oid='tongs.read_my_customer_funding()'::regprocedure)
     or (select proconfig from pg_proc where oid='tongs.read_my_customer_funding()'::regprocedure)
        is distinct from array['search_path=pg_catalog'] then
    raise exception 'customer-funding v4 security-definer/search-path contract changed';
  end if;
end $$;

do $$
declare
  v_customer uuid := 'cf400000-0000-4000-8000-000000000001';
  v_other uuid := 'cf400000-0000-4000-8000-000000000002';
  v_operator uuid := 'cf400000-0000-4000-8000-000000000003';
  v_workspace uuid := 'cf400000-0000-4000-8000-000000000004';
  v_org uuid;
  v_policy uuid := 'cf400000-0000-4000-8000-000000000010';
  v_revision uuid := 'cf400000-0000-4000-8000-000000000011';
  v_test_deposit uuid := 'cf400000-0000-4000-8000-000000000020';
  v_live_deposit uuid := 'cf400000-0000-4000-8000-000000000021';
  v_receipt uuid := 'cf400000-0000-4000-8000-000000000022';
  v_allowance uuid := 'cf400000-0000-4000-8000-000000000023';
  v_beta uuid := 'cf400000-0000-4000-8000-000000000024';
  v_consumption uuid := 'cf400000-0000-4000-8000-000000000025';
  v_relief uuid := 'cf400000-0000-4000-8000-000000000026';
  v_contract uuid;
  v_contract_count bigint;
  v_snapshot jsonb;
  v_active_sum bigint;
begin
  insert into tongs.financial_runtime_environment_revisions(
    revision,financial_environment,reason,actor_id
  )
  select 1,'test','isolated customer-funding v4 proof',null
  where not exists(select 1 from tongs.financial_runtime_environment_revisions);
  if tongs._current_financial_environment()<>'test' then
    raise exception 'customer-funding v4 proof requires the canonical Test financial environment';
  end if;
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values
    (v_customer,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','funding-v4@example.test','',now(),now(),now()),
    (v_other,'00000000-0000-0000-8000-000000000000','authenticated','authenticated','funding-v4-other@example.test','',now(),now(),now()),
    (v_operator,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','funding-v4-operator@example.test','',now(),now(),now());
  select id into v_org from tongs.orgs where personal_owner_user_id=v_customer;
  if v_org is null then raise exception 'personal organization fixture was not provisioned'; end if;
  insert into tongs.workspaces(id,name,created_by,org_id)
  values(v_workspace,'Funding v4 proof',v_customer,v_org);
  insert into tongs.workspace_members(workspace_id,user_id,role)
  values(v_workspace,v_customer,'owner') on conflict(workspace_id,user_id) do nothing;
  insert into tongs.platform_operators(user_id,reason,granted_by)
  values(v_operator,'isolated customer-funding v4 proof',v_operator);
  select count(*),(array_agg(id order by id))[1]
    into v_contract_count,v_contract
  from tongs.forge_credit_contract_revisions
  where contract_code='forge.credit-economy.v1'
    and revision=1;
  if v_contract_count is distinct from 1 or v_contract is null then
    raise exception 'expected exactly one immutable forge.credit-economy.v1 revision 1 contract, found %',v_contract_count;
  end if;
  if not exists(
    select 1
    from tongs.forge_credit_contract_revisions
    where id=v_contract
      and contract_code='forge.credit-economy.v1'
      and revision=1
      and lifecycle_state='active'
      and credit_value_micros=5000
      and currency='USD'
      and markup_basis_points=3300
      and tax_treatment='pre_tax_customer_value'
  ) then
    raise exception 'immutable forge.credit-economy.v1 revision 1 contract differs from reviewed authority';
  end if;
  insert into tongs.forge_credit_pack_terms(
    id,contract_revision_id,financial_environment,pack_id,offer_id,stripe_product_id,
    stripe_price_id,gross_amount_micros,credit_units,availability,effective_from,reason
  ) values
    ('cf400000-0000-4000-8000-000000000007',v_contract,'test','ai_small','v4-test',
      'prod_v4_test','price_v4_test',100000,20,'current',now()-interval '1 day','isolated v4 test term'),
    ('cf400000-0000-4000-8000-000000000008',v_contract,'live','ai_small','v4-live',
      'prod_v4_live','price_v4_live',200000,40,'current',now()-interval '1 day','isolated v4 live term');
  insert into tongs.customer_subscription_allowance_terms(
    id,contract_revision_id,financial_environment,plan_item_id,interval,policy_revision,
    entitlement_units,allocated_revenue_micros,maximum_wholesale_spend_micros,
    lifecycle_state,effective_from,reason
  ) values('cf400000-0000-4000-8000-000000000009',v_contract,'live','creator','monthly',
    'v4-isolated',30,150000,150000,'active',now()-interval '1 day','isolated v4 allowance term');

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_operator::text,true);
  set local role authenticated;
  perform tongs.commit_private_pricing_revision(
    v_policy,'customer-funding-v4-isolated','provider','customer-funding-v4-isolated',null,0,
    v_revision,0,25,'usd',
    '[{"component_code":"provider","component_kind":"direct_provider","credential_funding":"forge","provider_label":"Synthetic","success_ceiling_micros":125000,"failure_ceiling_micros":0,"cost_policy_revision":"synthetic-v4","tail_policy":"none"}]'::jsonb,
    '[]'::jsonb,'["provider_failure","forge_validation_failure","persistence_failure"]'::jsonb,
    '{"operations":1}'::jsonb,'{"kind":"none"}'::jsonb,'isolated v4 funding proof');

  reset role;
  set local session_replication_role=replica;
  insert into tongs.customer_spending_quotes(
    id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
    normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,
    full_cost_ceiling_micros,billable_failure_classes,free_failure_classes,included_quantity,
    retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at,
    financial_environment
  ) values
    ('cf400000-0000-4000-8000-000000000091',v_customer,'v4-live-relief-operation','isolated',v_workspace,v_revision,1,'USD',125000,0,25,125000,'[]','[]','{}','{}','[]',repeat('a',64),repeat('1',64),now()+interval '10 minutes','live'),
    ('cf400000-0000-4000-8000-000000000092',v_customer,'v4-test-deposit-hold','isolated',v_workspace,v_revision,1,'USD',125000,0,25,125000,'[]','[]','{}','{}','[]',repeat('b',64),repeat('2',64),now()+interval '10 minutes','test'),
    ('cf400000-0000-4000-8000-000000000093',v_customer,'v4-test-beta-hold','isolated',v_workspace,v_revision,1,'USD',125000,0,25,125000,'[]','[]','{}','{}','[]',repeat('c',64),repeat('3',64),now()+interval '10 minutes','test'),
    ('cf400000-0000-4000-8000-000000000094',v_customer,'v4-live-allowance-hold','isolated',v_workspace,v_revision,1,'USD',125000,0,25,125000,'[]','[]','{}','{}','[]',repeat('d',64),repeat('4',64),now()+interval '10 minutes','live');
  set local session_replication_role=origin;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role service_role;
  reset role;
  perform tongs._create_accounting_event(
    v_test_deposit,'stripe:test:deposit:evt_v4_test','customer_deposit_received','test',
    'stripe_checkout_session','cs_v4_test','USD',v_customer,null,null,
    '{"fixture":"pre-credit-contract deposit"}'::jsonb,now());
  reset role;
  set local session_replication_role=replica;
  insert into tongs.customer_deposits(
    id,user_id,stripe_mode,stripe_event_id,stripe_session_id,stripe_payment_intent_id,
    pack_id,currency,gross_amount_micros,credit_units,journal_event_id,metadata_json,received_at
  ) values(v_test_deposit,v_customer,'test','evt_v4_test','cs_v4_test','pi_v4_test',
    'legacy_ai_v4','USD',103000,21,v_test_deposit,'{"fixture":"pre-credit-contract deposit"}',now());
  set local session_replication_role=origin;
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,user_id,deposit_id,currency,amount_micros
  ) values
    (v_test_deposit,1,'test_cash_clearing',v_customer,v_test_deposit,'USD',103000),
    (v_test_deposit,2,'test_customer_deposit_balance',v_customer,v_test_deposit,'USD',-103000);
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,user_id,deposit_id,unit_kind,quantity_delta
  ) values(v_test_deposit,3,'test_customer_credits',v_customer,v_test_deposit,'forge_credit',21);
  perform tongs._assert_accounting_event_balanced(v_test_deposit);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role service_role;
  perform tongs.record_customer_deposit(v_live_deposit,v_customer,'evt_v4_live','cs_v4_live','pi_v4_live',true,'ai_small',200000,'usd',40,now(),'{"forge_offer_id":"v4-live"}');
  perform tongs.record_customer_deposit_processor_fee('cf400000-0000-4000-8000-000000000030',v_test_deposit,'txn_v4_test',0,now(),'{}');
  perform tongs.record_customer_deposit_processor_fee('cf400000-0000-4000-8000-000000000031',v_live_deposit,'txn_v4_live',0,now(),'{}');
  perform tongs.record_subscription_cycle_receipt(
    v_receipt,v_customer,'evt_v4_subscription','in_v4_subscription','sub_v4','pi_v4_subscription',true,
    'subscription','creator',150000,'usd',now()-interval '1 day',now()+interval '29 days',now(),'{}');
  perform tongs.create_paid_allowance_grant(v_allowance,v_receipt,30,150000,150000,'v4-isolated',now(),'{}');
  perform tongs.provision_beta_test_credits(v_beta,v_operator,v_customer,v_workspace,10,'v4-beta-grant','isolated v4 proof','{}');

  reset role;
  insert into tongs.legacy_deposit_credit_conversions(
    deposit_id,contract_revision_id,source_credit_units,source_gross_amount_micros,
    baseline_recognized_revenue_micros,baseline_refunded_liability_micros,
    canonical_total_credit_units,canonical_available_credit_units,value_remainder_micros,
    conversion_method,evidence_json
  ) values(v_test_deposit,v_contract,21,103000,0,0,20,20,3000,
    'remaining_customer_value_floor_v1','{"fixture":"v4 conversion remainder"}');

  -- A consumption and append-only relief restore both purchased units and value.
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role service_role;
  perform tongs.consume_customer_deposit(v_consumption,v_live_deposit,'v4-live-consumption','v4-live-relief-operation',50000,10,now(),'{}');
  reset role;
  perform tongs._create_accounting_event(v_relief,'v4-live-relief','customer_operation_relief','live',
    'forge_operation','v4-live-relief-operation','USD',v_customer,v_workspace,v_operator,
    '{"fixture":"v4 relief"}'::jsonb,now());
  -- The read-model proof needs immutable relief evidence, not a live reservation.
  set local session_replication_role=replica;
  insert into tongs.funding_reservations(
    id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,currency,
    reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,
    idempotency_key,funding_environment
  ) values(
    'cf400000-0000-4000-8000-000000000090','cf400000-0000-4000-8000-000000000091',
    v_customer,'v4-live-relief-operation','customer_deposit',v_live_deposit,'USD',50000,10,0,
    'v4-relief-reservation','live'
  );
  set local session_replication_role=origin;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  reset role;
  insert into tongs.customer_operation_reliefs(
    id,reservation_id,relief_key,funding_source_type,funding_source_id,original_consumption_id,
    currency,customer_credit_micros,restored_units,revenue_reversal_micros,reason,
    journal_event_id,evidence_json,relieved_at
  ) values(v_relief,'cf400000-0000-4000-8000-000000000090','v4-relief-key','customer_deposit',
    v_live_deposit,v_consumption,'USD',50000,10,50000,'isolated v4 relief proof',v_relief,'{}',now());
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,user_id,workspace_id,deposit_id,currency,amount_micros
  ) values
    (v_relief,1,'service_revenue_reversal',v_customer,v_workspace,v_live_deposit,'USD',50000),
    (v_relief,2,'customer_prepaid_liability',v_customer,v_workspace,v_live_deposit,'USD',-50000);
  insert into tongs.accounting_journal_entries(
    event_id,line_number,account_code,user_id,workspace_id,deposit_id,unit_kind,quantity_delta
  ) values(v_relief,3,'live_customer_credits',v_customer,v_workspace,v_live_deposit,'forge_credit',10);
  perform tongs._assert_accounting_event_balanced(v_relief);

  reset role;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  set local role authenticated;
  v_snapshot:=tongs.read_my_customer_funding();
  if v_snapshot->>'contract_version' is distinct from 'forge.customer-funding.v4'
     or v_snapshot->>'credit_contract' is distinct from 'forge.credit-economy.v1'
     or v_snapshot->>'active_environment' is distinct from 'test' then
    raise exception 'v4 contract identity/environment mismatch: %',v_snapshot;
  end if;
  if (v_snapshot#>>'{environments,test,purchased,available_credit_units}')::bigint is distinct from 20
     or (v_snapshot#>>'{environments,test,purchased,available_micros}')::bigint is distinct from 103000
     or (v_snapshot#>>'{environments,test,beta_grants,available_credit_units}')::bigint is distinct from 10
     or (v_snapshot#>>'{environments,test,beta_grants,available_customer_value_micros}')::bigint is distinct from 50000 then
    raise exception 'Test purchased/beta authority projection mismatch: %',v_snapshot;
  end if;
  if (v_snapshot#>>'{environments,live,purchased,available_credit_units}')::bigint is distinct from 40
     or (v_snapshot#>>'{environments,live,purchased,available_micros}')::bigint is distinct from 200000
     or (v_snapshot#>>'{environments,live,allowances,available_entitlement_units}')::bigint is distinct from 30
     or (v_snapshot#>>'{environments,live,allowances,available_revenue_micros}')::bigint is distinct from 150000 then
    raise exception 'Live allowance or relief-aware purchased projection mismatch: %',v_snapshot;
  end if;
  if not exists(select 1 from jsonb_array_elements(v_snapshot->'deposits') d
    where d->>'deposit_id'=v_test_deposit::text
      and (d->>'source_credit_units')::bigint=21 and (d->>'credit_units')::bigint=20
      and (d->>'available_credit_units')::bigint=20
      and (d->>'conversion_value_remainder_micros')::bigint=3000) then
    raise exception 'converted deposit authority was recomputed or double counted: %',v_snapshot->'deposits';
  end if;

  v_active_sum:=
    case when (v_snapshot#>>'{active_spendable,purchased,provider_execution_eligible}')::boolean
      then (v_snapshot#>>'{active_spendable,purchased,available_credit_units}')::bigint else 0 end
    +case when (v_snapshot#>>'{active_spendable,allowances,provider_execution_eligible}')::boolean
      then (v_snapshot#>>'{active_spendable,allowances,available_entitlement_units}')::bigint else 0 end
    +case when (v_snapshot#>>'{active_spendable,beta_grants,provider_execution_eligible}')::boolean
      then (v_snapshot#>>'{active_spendable,beta_grants,available_credit_units}')::bigint else 0 end;
  if v_active_sum is distinct from 30 then
    raise exception 'Hearth eligible bucket sum must equal canonical active-spendable authority exactly once: %, snapshot %',v_active_sum,v_snapshot;
  end if;

  -- Active holds reduce each canonical bucket once and remain environment-scoped.
  reset role;
  set local session_replication_role=replica;
  insert into tongs.funding_reservations(
    id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,currency,
    reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,
    idempotency_key,funding_environment
  ) values
    ('cf400000-0000-4000-8000-000000000092','cf400000-0000-4000-8000-000000000092',v_customer,
      'v4-test-deposit-hold','customer_deposit',v_test_deposit,'USD',25000,5,0,'v4-test-deposit-hold','test'),
    ('cf400000-0000-4000-8000-000000000093','cf400000-0000-4000-8000-000000000093',v_customer,
      'v4-test-beta-hold','beta_grant',v_beta,'USD',10000,2,1000,'v4-test-beta-hold','test'),
    ('cf400000-0000-4000-8000-000000000094','cf400000-0000-4000-8000-000000000094',v_customer,
      'v4-live-allowance-hold','paid_allowance',v_allowance,'USD',15000,3,1000,'v4-live-allowance-hold','live');
  insert into tongs.funding_reservation_events(
    id,reservation_id,sequence,event_type,event_key,customer_charge_micros,
    credit_units,wholesale_spend_micros,evidence_json
  ) values
    ('cf400000-0000-4000-8000-0000000000a2','cf400000-0000-4000-8000-000000000092',1,'reserved','v4-test-deposit-reserved',25000,5,0,'{}'),
    ('cf400000-0000-4000-8000-0000000000a3','cf400000-0000-4000-8000-000000000093',1,'reserved','v4-test-beta-reserved',10000,2,1000,'{}'),
    ('cf400000-0000-4000-8000-0000000000a4','cf400000-0000-4000-8000-000000000094',1,'reserved','v4-live-allowance-reserved',15000,3,1000,'{}');
  set local session_replication_role=origin;

  reset role;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  set local role authenticated;
  v_snapshot:=tongs.read_my_customer_funding();
  if (v_snapshot#>>'{environments,test,purchased,available_credit_units}')::bigint is distinct from 15
     or (v_snapshot#>>'{environments,test,purchased,available_micros}')::bigint is distinct from 78000
     or (v_snapshot#>>'{environments,test,beta_grants,available_credit_units}')::bigint is distinct from 8
     or (v_snapshot#>>'{environments,test,beta_grants,available_customer_value_micros}')::bigint is distinct from 40000
     or (v_snapshot#>>'{environments,live,allowances,available_entitlement_units}')::bigint is distinct from 27
     or (v_snapshot#>>'{environments,live,allowances,available_revenue_micros}')::bigint is distinct from 135000
     or (v_snapshot#>>'{active_reservations,reservation_count}')::bigint is distinct from 2
     or (v_snapshot#>>'{active_reservations,reserved_credit_units}')::bigint is distinct from 7 then
    raise exception 'active holds or Test/Live reservation separation changed: %',v_snapshot;
  end if;

  perform set_config('request.jwt.claim.sub',v_other::text,true);
  v_snapshot:=tongs.read_my_customer_funding();
  if (v_snapshot#>>'{active_spendable,purchased,available_credit_units}')::bigint is distinct from 0
     or (v_snapshot#>>'{active_spendable,beta_grants,available_credit_units}')::bigint is distinct from 0
     or jsonb_array_length(v_snapshot->'deposits') is distinct from 0 then
    raise exception 'customer-funding v4 exposed another customer balance: %',v_snapshot;
  end if;
end $$;

do $$
begin
  perform set_config('request.jwt.claim.role','anon',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  begin
    perform tongs.read_my_customer_funding();
    raise exception 'anon unexpectedly executed customer-funding v4';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

rollback;
