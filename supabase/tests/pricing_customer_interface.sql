begin;

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('9f000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','customer@example.test','',now(),now(),now()),
  ('9f000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','operator@example.test','',now(),now(),now()),
  ('9f000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name) values('9f000000-0000-4000-8000-000000000010','Isolated billing verification');
insert into tongs.platform_operators(user_id,reason,granted_by)
values('9f000000-0000-4000-8000-000000000002','isolated pricing interface test','9f000000-0000-4000-8000-000000000002');

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9f000000-0000-4000-8000-000000000002';
set local role authenticated;

do $$
declare v_rules jsonb; v_price jsonb; v_preview jsonb; v_publish jsonb;
begin
  v_rules := tongs.commit_private_markup_rule_revision(
    '9f000000-0000-4000-8000-000000000020',0,2000,
    '[{"scope_kind":"provider","provider":"other","markup_basis_points":3000},
      {"scope_kind":"sku","provider":"runway","sku":"gen4.5:5s:1280:720","markup_basis_points":2000}]',
    'isolated proposed markup rules');
  if (v_rules->>'published')::boolean then raise exception 'markup rules activated themselves'; end if;
  v_price := tongs.commit_operator_pricing_revision(
    '9f000000-0000-4000-8000-000000000020',
    '9f000000-0000-4000-8000-000000000021','runway:gen4.5:5s:1280:720','sku','runway','gen4.5:5s:1280:720',0,
    '9f000000-0000-4000-8000-000000000022',90,'usd',
    '[{"component_code":"runway_generation","component_kind":"direct_provider","credential_funding":"forge","provider_label":"Runway","success_ceiling_micros":600000,"failure_ceiling_micros":300000,"cost_policy_revision":"isolated-runway","tail_policy":"none"},
      {"component_code":"supporting_services","component_kind":"supporting_provider","credential_funding":"forge","provider_label":"Forge support","success_ceiling_micros":150000,"failure_ceiling_micros":75000,"cost_policy_revision":"isolated-support","tail_policy":"none"}]',
    '["provider_billed_failure"]','["pre_billing_rejection","forge_validation_failure"]',
    '{"model":"gen4.5","duration_seconds":5,"ratio":"1280:720"}',
    '{"kind":"included_until","duration_hours":24}','isolated fake-provider price');
  v_preview := tongs.preview_private_price('9f000000-0000-4000-8000-000000000022');
  if (v_preview->>'full_cost_ceiling_micros')::bigint<>750000
     or (v_preview->>'customer_price_ceiling_micros')::bigint<>900000
     or (v_preview->>'expected_margin_micros')::bigint<>150000
     or round((v_preview->>'expected_margin_percentage')::numeric,4)<>16.6667 then
    raise exception 'cost-plus preview arithmetic failed: %',v_preview;
  end if;
  v_publish := tongs.publish_private_pricing_revision(
    '9f000000-0000-4000-8000-000000000023','9f000000-0000-4000-8000-000000000022','isolated publication only');
  if (v_publish->>'customer_spending_enabled')::boolean then raise exception 'publication activated customer spending'; end if;
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$
begin
  perform tongs.record_customer_deposit('9f000000-0000-4000-8000-000000000030','9f000000-0000-4000-8000-000000000001','evt_success','cs_success','pi_success',true,'pack',1000000,'usd',100,now()-interval '3 minutes','{}');
  perform tongs.record_customer_deposit_processor_fee('9f000000-0000-4000-8000-000000000031','9f000000-0000-4000-8000-000000000030','txn_success',100000,now(),'{}');
  perform tongs.record_customer_deposit('9f000000-0000-4000-8000-000000000032','9f000000-0000-4000-8000-000000000001','evt_failure','cs_failure','pi_failure',true,'pack',1000000,'usd',100,now()-interval '2 minutes','{}');
  perform tongs.record_customer_deposit_processor_fee('9f000000-0000-4000-8000-000000000033','9f000000-0000-4000-8000-000000000032','txn_failure',0,now(),'{}');
  perform tongs.record_customer_deposit('9f000000-0000-4000-8000-000000000034','9f000000-0000-4000-8000-000000000001','evt_refund','cs_refund','pi_refund',true,'pack',1000000,'usd',100,now()-interval '1 minute','{}');
  perform tongs.record_customer_deposit_processor_fee('9f000000-0000-4000-8000-000000000035','9f000000-0000-4000-8000-000000000034','txn_refund',0,now(),'{}');
  perform tongs.record_stripe_adjustment_accounting('9f000000-0000-4000-8000-000000000036','re_refund','evt_refund_done','pi_refund','dispute',true,1000000,'usd',now(),'{}');
  perform tongs.record_customer_deposit('9f000000-0000-4000-8000-000000000037','9f000000-0000-4000-8000-000000000001','evt_test','cs_test','pi_test',false,'pack',1000000,'usd',100,now(),'{}');
  perform tongs.record_customer_deposit_processor_fee('9f000000-0000-4000-8000-000000000038','9f000000-0000-4000-8000-000000000037','txn_test',0,now(),'{}');
  perform tongs.create_customer_runway_quote('9f000000-0000-4000-8000-000000000040','9f000000-0000-4000-8000-000000000001','runway-customer-success','9f000000-0000-4000-8000-000000000010',repeat('a',64),'gen4.5',5,'1280:720',now()+interval '15 minutes');
  perform tongs.create_customer_runway_quote('9f000000-0000-4000-8000-000000000041','9f000000-0000-4000-8000-000000000001','runway-customer-failure','9f000000-0000-4000-8000-000000000010',repeat('b',64),'gen4.5',5,'1280:720',now()+interval '15 minutes');
  perform tongs.create_customer_runway_quote('9f000000-0000-4000-8000-000000000042','9f000000-0000-4000-8000-000000000001','runway-refunded-funding','9f000000-0000-4000-8000-000000000010',repeat('c',64),'gen4.5',5,'1280:720',now()+interval '15 minutes');
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9f000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare v_receipt jsonb;
begin
  perform tongs.accept_quote('9f000000-0000-4000-8000-000000000040','9f000000-0000-4000-8000-000000000050','accept-customer-success',tongs.read_my_spending_quote('9f000000-0000-4000-8000-000000000040')->>'quote_hash');
  perform tongs.accept_quote('9f000000-0000-4000-8000-000000000041','9f000000-0000-4000-8000-000000000051','accept-customer-failure',tongs.read_my_spending_quote('9f000000-0000-4000-8000-000000000041')->>'quote_hash');
  perform tongs.accept_quote('9f000000-0000-4000-8000-000000000042','9f000000-0000-4000-8000-000000000052','accept-customer-refund',tongs.read_my_spending_quote('9f000000-0000-4000-8000-000000000042')->>'quote_hash');
  v_receipt:=tongs.read_my_spending_quote('9f000000-0000-4000-8000-000000000040');
  if (v_receipt->>'normal_maximum_charge_micros')::bigint<>900000
     or (v_receipt->>'billable_failure_maximum_charge_micros')::bigint<>450000
     or v_receipt::text ~* '(wholesale|markup|margin|cost_policy|processor_fee)' then
    raise exception 'customer quote leaked private pricing or has wrong terms: %',v_receipt;
  end if;
end $$;

reset role;
insert into tongs.paid_execution_control_revisions(
  revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
  owner_budget_spending_enabled,provider_execution_enabled,reason
) values(2,true,true,true,false,true,'isolated fake-provider customer flow only');
insert into tongs.runway_execution_rollout_revisions(revision,mode,reason)
values(2,'enforce','isolated fake-provider customer flow only');

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$
declare v_result jsonb; v_replay jsonb;
begin
  v_result:=tongs.reserve_customer_runway_quote('9f000000-0000-4000-8000-000000000040','9f000000-0000-4000-8000-000000000060','reserve-customer-success',repeat('a',64),'gen4.5',5,'1280:720');
  if v_result->>'state'<>'reserved' or v_result->>'funding_source'<>'customer_deposit' then raise exception 'customer reservation failed: %',v_result; end if;
  v_replay:=tongs.reserve_customer_runway_quote('9f000000-0000-4000-8000-000000000040','9f000000-0000-4000-8000-000000000060','reserve-customer-success',repeat('a',64),'gen4.5',5,'1280:720');
  if not (v_replay->>'replay')::boolean then raise exception 'customer reservation was not idempotent'; end if;
  v_result:=tongs.authorize_runway_submission('runway-customer-success',repeat('a',64),'attempt-customer-success','9f000000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000010','gen4.5',5,'1280:720','{}');
  if not (v_result->>'provider_execution_authorized')::boolean then raise exception 'funded fake submission was not authorized: %',v_result; end if;
  v_replay:=tongs.authorize_runway_submission('runway-customer-success',repeat('a',64),'attempt-customer-success-duplicate','9f000000-0000-4000-8000-000000000001','9f000000-0000-4000-8000-000000000010','gen4.5',5,'1280:720','{}');
  if (v_replay->>'provider_execution_authorized')::boolean or v_replay->>'reason'<>'duplicate_attempt' then raise exception 'duplicate provider delivery escaped the boundary: %',v_replay; end if;
  perform tongs.record_runway_completion_for_reconciliation('runway-customer-success',repeat('a',64),'fake-task-success','{"provider":"fake"}');
  v_result:=tongs.reconcile_runway_execution('runway-customer-success',600000,150000,'9f000000-0000-4000-8000-000000000061','settle-customer-success','{"provider":"fake"}');
  if (v_result->>'customer_charge_micros')::bigint<>900000 then raise exception 'success settlement wrong: %',v_result; end if;
  v_replay:=tongs.reconcile_runway_execution('runway-customer-success',600000,150000,'9f000000-0000-4000-8000-000000000061','settle-customer-success','{"provider":"fake"}');
  if not (v_replay->>'replay')::boolean then raise exception 'duplicate reconciliation was not idempotent'; end if;

  v_result:=tongs.reserve_customer_runway_quote('9f000000-0000-4000-8000-000000000041','9f000000-0000-4000-8000-000000000062','reserve-customer-failure',repeat('b',64),'gen4.5',5,'1280:720');
  perform tongs.record_provider_failure('9f000000-0000-4000-8000-000000000062','fake-provider-billed-failure','provider_billed_failure','{"provider":"fake"}');
  v_result:=tongs.settle_operation('9f000000-0000-4000-8000-000000000062','9f000000-0000-4000-8000-000000000063','settle-customer-failure','billable_failure','provider_billed_failure',375000,'{"provider":"fake"}');
  if (v_result->>'customer_charge_micros')::bigint<>450000 then raise exception 'billable-failure ceiling wrong: %',v_result; end if;

  begin
    perform tongs.reserve_customer_runway_quote('9f000000-0000-4000-8000-000000000042','9f000000-0000-4000-8000-000000000064','reserve-refunded-funding',repeat('c',64),'gen4.5',5,'1280:720');
    raise exception 'refunded/disputed deposit funded a provider reservation';
  exception when sqlstate 'P0001' then
    if sqlerrm !~* 'insufficient verified funding' then raise; end if;
  end;
  if (select count(*) from tongs.customer_deposit_consumptions where operation_id='runway-customer-success')<>1
     or (select count(*) from tongs.funding_reservation_events where reservation_id='9f000000-0000-4000-8000-000000000060' and event_type='settled')<>1 then
    raise exception 'duplicate delivery counted revenue or settlement twice';
  end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9f000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare v_receipt jsonb;
begin
  v_receipt:=tongs.read_my_spending_operation('runway-customer-success');
  if v_receipt->>'receipt_status'<>'settled' or (v_receipt->>'customer_charge_micros')::bigint<>900000
     or v_receipt::text ~* '(wholesale|markup|margin|cost_policy|processor_fee)' then
    raise exception 'customer receipt is unsafe or incomplete: %',v_receipt;
  end if;
  begin
    perform tongs.read_owner_billing_console(10);
    raise exception 'ordinary customer reached owner financial reporting';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='9f000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$
declare v_console jsonb; v_operation jsonb;
begin
  v_console:=tongs.read_owner_billing_console(50);
  select value into v_operation from jsonb_array_elements(v_console->'operations') value
  where value->>'operation_id'='runway-customer-success';
  if v_operation is null or v_operation->>'expense_coverage'<>'confirmed'
     or (v_operation->>'recognized_revenue_micros')::bigint<>900000
     or (v_operation->>'direct_provider_actual_micros')::bigint<>600000
     or (v_operation->>'supporting_actual_micros')::bigint<>150000
     or (v_operation->>'allocated_processor_fee_micros')::bigint<>90000
     or (v_operation->>'contribution_profit_micros')::bigint<>60000 then
    raise exception 'owner contribution reporting is wrong: %',v_operation;
  end if;
end $$;

reset role;
do $$
begin
  if has_table_privilege('authenticated','tongs.private_markup_rule_revisions','select')
     or has_table_privilege('authenticated','tongs.private_pricing_publications','select')
     or has_function_privilege('authenticated','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('authenticated','tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)','execute') then
    raise exception 'pricing internals or reservation adapters are directly exposed';
  end if;
end $$;

rollback;
