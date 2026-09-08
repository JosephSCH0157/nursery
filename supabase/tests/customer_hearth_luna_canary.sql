begin;

alter table tongs.workspaces add column if not exists created_by uuid references auth.users(id) on delete restrict;
create table if not exists tongs.workspace_members (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  invited_by uuid references auth.users(id) on delete set null,
  primary key(workspace_id,user_id)
);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
  ('ce000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','canary-operator@example.test','',now(),now(),now()),
  ('ce000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','canary-customer@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name,created_by)
values('ce000000-0000-4000-8000-000000000010','Customer canary proof','ce000000-0000-4000-8000-000000000002');
insert into tongs.workspace_members(workspace_id,user_id,role,invited_by)
values('ce000000-0000-4000-8000-000000000010','ce000000-0000-4000-8000-000000000002','owner','ce000000-0000-4000-8000-000000000002');
insert into tongs.platform_operators(user_id,reason,granted_by)
values('ce000000-0000-4000-8000-000000000001','isolated customer canary proof','ce000000-0000-4000-8000-000000000001');

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ce000000-0000-4000-8000-000000000001';
set local role authenticated;
select tongs.commit_private_markup_rule_revision(
  'ce000000-0000-4000-8000-000000000020',0,3300,'[]','approved customer canary markup');
select tongs.commit_operator_pricing_revision(
  'ce000000-0000-4000-8000-000000000020',
  'ce000000-0000-4000-8000-000000000021','openai-hearth-luna-customer-canary',
  'sku','openai','gpt-5.6-luna',0,'ce000000-0000-4000-8000-000000000022',2,'USD',
  '[
    {"component_code":"openai_text","component_kind":"direct_provider","credential_funding":"forge","provider_label":"OpenAI","success_ceiling_micros":1015,"failure_ceiling_micros":0,"cost_policy_revision":"openai-text:hearth-chat:luna-bounded-pilot-v1","tail_policy":"none"},
    {"component_code":"bounded_support","component_kind":"compute","credential_funding":"forge","provider_label":"Forge validation and persistence","success_ceiling_micros":10000,"failure_ceiling_micros":0,"cost_policy_revision":"openai-text:hearth-chat:luna-bounded-pilot-v1","tail_policy":"none"}
  ]'::jsonb,
  '[]'::jsonb,
  '["provider_failure","forge_failure","unknown_fault","forge_validation_failure","persistence_failure"]'::jsonb,
  '{"input_tokens":2000,"output_tokens":512,"attempts":1,"concurrency":1}'::jsonb,
  '{"kind":"none"}'::jsonb,'isolated customer canary price');

reset role;
insert into tongs.paid_execution_control_revisions(
  revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
  owner_budget_spending_enabled,provider_execution_enabled,reason,actor_id
) select max(revision)+1,true,true,false,true,true,'isolated customer canary provider controls',
  'ce000000-0000-4000-8000-000000000001'
from tongs.paid_execution_control_revisions;
insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
  rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
) values (
  'ce000000-0000-4000-8000-000000000023','hearth.chat_completion','production',90,
  11015,11015,86400,1,'active','isolated customer canary loss cap','ce000000-0000-4000-8000-000000000001'
);
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

select tongs.activate_customer_hearth_chat_luna_test(
  'ce000000-0000-4000-8000-000000000024','ce000000-0000-4000-8000-000000000001',
  'ce000000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-000000000010',
  'ce000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000010',
  'ce000000-0000-4000-8000-000000000025',now()+interval '1 hour','isolated customer canary activation');

select tongs.record_customer_deposit(
  'ce000000-0000-4000-8000-000000000030','ce000000-0000-4000-8000-000000000002',
  'evt_customer_canary','cs_customer_canary','pi_customer_canary',true,'customer_canary_pack',
  100000,'USD',10,now(),'{}');
select tongs.record_customer_deposit_processor_fee(
  'ce000000-0000-4000-8000-000000000031','ce000000-0000-4000-8000-000000000030',
  'txn_customer_canary',3000,now(),'{}');
select tongs.create_customer_hearth_chat_quote(
  'ce000000-0000-4000-8000-000000000040','ce000000-0000-4000-8000-000000000002',
  'customer-hearth-canary-operation-0001','ce000000-0000-4000-8000-000000000010',repeat('a',64),now()+interval '5 minutes');

do $$ declare v_quote jsonb; begin
  v_quote:=tongs.create_customer_hearth_chat_quote(
    'ce000000-0000-4000-8000-000000000040','ce000000-0000-4000-8000-000000000002',
    'customer-hearth-canary-operation-0001','ce000000-0000-4000-8000-000000000010',repeat('a',64),
    (select expires_at from tongs.customer_spending_quotes where id='ce000000-0000-4000-8000-000000000040'));
  if (v_quote->>'normal_maximum_charge_micros')::bigint<>20000
     or (v_quote->>'billable_failure_maximum_charge_micros')::bigint<>0
     or coalesce((v_quote#>>'{funding,eligible}')::boolean,false) is not true then
    raise exception 'customer-safe quote did not preserve price, failure relief, and verified funding';
  end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ce000000-0000-4000-8000-000000000002';
set local role authenticated;
select tongs.accept_quote(
  'ce000000-0000-4000-8000-000000000040','ce000000-0000-4000-8000-000000000041',
  'customer-canary-acceptance-0001',
  (tongs.read_my_spending_quote('ce000000-0000-4000-8000-000000000040')->>'quote_hash'));

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;
select tongs.reserve_customer_hearth_chat_quote(
  'ce000000-0000-4000-8000-000000000040','ce000000-0000-4000-8000-000000000042',
  'customer-canary-reservation-0001',repeat('a',64));

do $$ begin
  begin
    insert into tongs.customer_spending_quotes(
      id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
      normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,
      full_cost_ceiling_micros,billable_failure_classes,free_failure_classes,included_quantity,
      retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at
    ) select
      'ce000000-0000-4000-8000-000000000050',user_id,'unscoped-customer-operation-0002',tool,workspace_id,
      pricing_revision_id,pricing_revision,currency,normal_maximum_charge_micros,
      billable_failure_maximum_charge_micros,customer_credit_units,full_cost_ceiling_micros,
      billable_failure_classes,free_failure_classes,included_quantity,retention_policy,
      provider_funding_summary,repeat('b',64),repeat('c',64),now()+interval '5 minutes'
    from tongs.customer_spending_quotes where id='ce000000-0000-4000-8000-000000000040';
    insert into tongs.customer_spending_quote_acceptances(id,quote_id,user_id,acceptance_key,accepted_quote_hash)
    values('ce000000-0000-4000-8000-000000000051','ce000000-0000-4000-8000-000000000050',
      'ce000000-0000-4000-8000-000000000002','unscoped-customer-acceptance-0002',repeat('c',64));
    perform tongs.reserve_operation(
      'ce000000-0000-4000-8000-000000000052','ce000000-0000-4000-8000-000000000050',
      'customer_deposit','ce000000-0000-4000-8000-000000000030','unscoped-customer-reservation-0002');
    raise exception 'unscoped customer reservation was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select tongs.authorize_openai_text_provider_attempt(
  'ce000000-0000-4000-8000-000000000042','customer-canary-openai-attempt-0001',1::smallint,
  11015,120,'{"provider":"fake"}');
select tongs.settle_operation(
  'ce000000-0000-4000-8000-000000000042','ce000000-0000-4000-8000-000000000043',
  'customer-canary-settlement-0001','success',null,10026,'{"provider":"fake","cost_coverage":"estimated"}');
select tongs.settle_operation(
  'ce000000-0000-4000-8000-000000000042','ce000000-0000-4000-8000-000000000043',
  'customer-canary-settlement-0001','success',null,10026,'{"provider":"fake","cost_coverage":"estimated"}');
select tongs.close_customer_paid_execution_test_authorization_for_reservation(
  'ce000000-0000-4000-8000-000000000042','isolated customer canary terminal success');
select tongs.close_customer_paid_execution_test_authorization_for_reservation(
  'ce000000-0000-4000-8000-000000000042','isolated customer canary terminal success');

do $$ begin
  if (select count(*) from tongs.customer_deposit_consumptions
      where deposit_id='ce000000-0000-4000-8000-000000000030')<>1 then
    raise exception 'customer revenue was recognized more than once'; end if;
  if (select recognized_revenue_micros from tongs.customer_deposit_consumptions
      where deposit_id='ce000000-0000-4000-8000-000000000030')<>20000 then
    raise exception 'customer charge was not exactly the accepted two-cent ceiling'; end if;
  if (select count(*) from tongs.funding_reservation_events
      where reservation_id='ce000000-0000-4000-8000-000000000042' and event_type='settled')<>1 then
    raise exception 'settlement replay created a duplicate event'; end if;
  if (select status from tongs.customer_paid_execution_test_authorization_revisions
      where authorization_id='ce000000-0000-4000-8000-000000000024'
      order by revision desc limit 1)<>'closed' then
    raise exception 'terminal operation did not close test authorization'; end if;
  begin
    perform tongs.create_customer_hearth_chat_quote(
      'ce000000-0000-4000-8000-000000000060','ce000000-0000-4000-8000-000000000002',
      'customer-hearth-canary-operation-0003','ce000000-0000-4000-8000-000000000010',repeat('d',64),now()+interval '5 minutes');
    raise exception 'closed authorization created another quote';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ce000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare v_receipt jsonb; begin
  v_receipt:=tongs.read_my_spending_operation('customer-hearth-canary-operation-0001');
  if (v_receipt->>'customer_charge_micros')::bigint<>20000
     or v_receipt->>'receipt_status'<>'settled' then
    raise exception 'customer receipt is incomplete'; end if;
  begin
    perform * from tongs.customer_paid_execution_test_authorizations;
    raise exception 'customer read private activation data';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;
select tongs.activate_customer_hearth_chat_luna_test(
  'ce000000-0000-4000-8000-000000000070','ce000000-0000-4000-8000-000000000001',
  'ce000000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-000000000010',
  'ce000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000010',
  'ce000000-0000-4000-8000-000000000071',now()+interval '1 hour','isolated unfunded canary activation');
select tongs.close_customer_paid_execution_test_authorization(
  'ce000000-0000-4000-8000-000000000070','ce000000-0000-4000-8000-000000000001',
  'isolated operator closure before any reservation');
select tongs.close_customer_paid_execution_test_authorization(
  'ce000000-0000-4000-8000-000000000070','ce000000-0000-4000-8000-000000000001',
  'isolated operator closure before any reservation');

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ce000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare v_operator jsonb; begin
  v_operator:=tongs.read_customer_paid_execution_test_authorizations(10);
  if jsonb_array_length(v_operator)<>2
     or exists (select 1 from jsonb_array_elements(v_operator) row_data where row_data->>'status'<>'closed') then
    raise exception 'operator canary audit readback failed'; end if;
end $$;

rollback;
