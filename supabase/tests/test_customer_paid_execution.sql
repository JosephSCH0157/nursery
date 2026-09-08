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
  ('cf000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','operator@example.test','',now(),now(),now()),
  ('cf000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','customer@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name,created_by) values('cf000000-0000-4000-8000-000000000010','Test execution','cf000000-0000-4000-8000-000000000002');
insert into tongs.workspace_members(workspace_id,user_id,role,invited_by) values('cf000000-0000-4000-8000-000000000010','cf000000-0000-4000-8000-000000000002','owner','cf000000-0000-4000-8000-000000000002');
insert into tongs.platform_operators(user_id,reason,granted_by) values('cf000000-0000-4000-8000-000000000001','isolated Test execution proof','cf000000-0000-4000-8000-000000000001');

set local request.jwt.claim.role='authenticated'; set local request.jwt.claim.sub='cf000000-0000-4000-8000-000000000001'; set local role authenticated;
select tongs.commit_private_markup_rule_revision('cf000000-0000-4000-8000-000000000020',0,3300,'[]','approved isolated Test markup');
select tongs.commit_operator_pricing_revision(
  'cf000000-0000-4000-8000-000000000020','cf000000-0000-4000-8000-000000000021','openai-hearth-luna-test-simulation',
  'sku','openai','gpt-5.6-luna',0,'cf000000-0000-4000-8000-000000000022',2,'USD',
  '[{"component_code":"openai_text","component_kind":"direct_provider","credential_funding":"forge","provider_label":"OpenAI","success_ceiling_micros":1015,"failure_ceiling_micros":0,"cost_policy_revision":"test","tail_policy":"none"},{"component_code":"bounded_support","component_kind":"compute","credential_funding":"forge","provider_label":"Forge","success_ceiling_micros":10000,"failure_ceiling_micros":0,"cost_policy_revision":"test","tail_policy":"none"}]',
  '[]','["provider_failure","forge_failure","forge_validation_failure","persistence_failure"]',
  '{"input_tokens":2000,"output_tokens":512,"attempts":1,"concurrency":1}','{"kind":"none"}','isolated Test price');
select tongs.publish_private_pricing_revision('cf000000-0000-4000-8000-000000000023','cf000000-0000-4000-8000-000000000022','isolated Test publication');

reset role; set local request.jwt.claim.role='service_role'; set local request.jwt.claim.sub=''; set local role service_role;
select tongs.record_customer_deposit('cf000000-0000-4000-8000-000000000030','cf000000-0000-4000-8000-000000000002',
  'evt_test_execution','cs_test_execution','pi_test_execution',false,'ai_large',40000000,'USD',15000,now(),'{}');
select tongs.open_hearth_test_execution_authorization('cf000000-0000-4000-8000-000000000040','cf000000-0000-4000-8000-000000000001',
  'cf000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000010','cf000000-0000-4000-8000-000000000030',2,40000,now()+interval '1 hour','isolated Test success and failure');

select tongs.create_hearth_chat_test_quote('cf000000-0000-4000-8000-000000000050','cf000000-0000-4000-8000-000000000040','test-success-operation',repeat('a',64),now()+interval '10 minutes');
select tongs.accept_hearth_chat_test_quote('cf000000-0000-4000-8000-000000000051','cf000000-0000-4000-8000-000000000050','test-success-acceptance',
  '35a32b35a82b1b540528004f976c8b1400d563b8bbebe5c97940fed37e7a2547','cf000000-0000-4000-8000-000000000001');
select tongs.reserve_hearth_chat_test_quote('cf000000-0000-4000-8000-000000000052','cf000000-0000-4000-8000-000000000050','test-success-reservation');

do $$ begin
  begin
    perform tongs.authorize_openai_text_provider_attempt('cf000000-0000-4000-8000-000000000052','must-not-reach-live-provider',1,0,120,'{}');
    raise exception 'Test reservation reached live-provider authorization';
  exception when no_data_found then null; when others then
    if sqlerrm='Test reservation reached live-provider authorization' then raise; end if;
  end;
end $$;

select tongs.authorize_hearth_chat_test_attempt('cf000000-0000-4000-8000-000000000052','test-success-attempt','{}');
select tongs.persist_hearth_chat_test_result('cf000000-0000-4000-8000-000000000053','test-success-operation','cf000000-0000-4000-8000-000000000052',
  'cf000000-0000-4000-8000-000000000002','cf000000-0000-4000-8000-000000000010','episode-test',repeat('a',64),'req_simulated_success','gpt-5.6-luna',30,9,repeat('b',64),'{"assistantText":"Simulated persisted result","ops":[],"scriptText":null,"tagAudit":null}');
select tongs.settle_hearth_chat_test_operation('cf000000-0000-4000-8000-000000000052','cf000000-0000-4000-8000-000000000054','test-success-settlement','success',null,'{"simulated":true}');
select tongs.settle_hearth_chat_test_operation('cf000000-0000-4000-8000-000000000052','cf000000-0000-4000-8000-000000000054','test-success-settlement','success',null,'{"simulated":true}');

select tongs.create_hearth_chat_test_quote('cf000000-0000-4000-8000-000000000060','cf000000-0000-4000-8000-000000000040','test-failure-operation',repeat('c',64),now()+interval '10 minutes');
select tongs.accept_hearth_chat_test_quote('cf000000-0000-4000-8000-000000000061','cf000000-0000-4000-8000-000000000060','test-failure-acceptance',
  '36176440aceb35b3902fffa46e184575d9015eb1d9ca11752815481e78d133c2','cf000000-0000-4000-8000-000000000001');
select tongs.reserve_hearth_chat_test_quote('cf000000-0000-4000-8000-000000000062','cf000000-0000-4000-8000-000000000060','test-failure-reservation');
select tongs.authorize_hearth_chat_test_attempt('cf000000-0000-4000-8000-000000000062','test-failure-attempt','{}');
select tongs.settle_hearth_chat_test_operation('cf000000-0000-4000-8000-000000000062','cf000000-0000-4000-8000-000000000063','test-failure-settlement','nonbillable_failure','provider_failure','{"simulated":true}');
select tongs.close_hearth_test_execution_authorization('cf000000-0000-4000-8000-000000000040','cf000000-0000-4000-8000-000000000001','isolated Test complete');

reset role;
do $$ declare v_customer jsonb; begin
  v_customer:=tongs.read_customer_test_billing('cf000000-0000-4000-8000-000000000002');
  if (v_customer->>'test_credit_balance')::bigint<>14998 then raise exception 'unexpected Test balance %',v_customer; end if;
  if (select count(*) from tongs.test_customer_deposit_consumptions)<>1 then raise exception 'duplicate Test debit'; end if;
  if (select count(*) from tongs.test_paid_execution_settlements where customer_charge_micros=0 and outcome='nonbillable_failure')<>1 then raise exception 'failure relief missing'; end if;
  if (select count(*) from tongs.accounting_journal_entries where account_code='service_revenue')<>0 then raise exception 'Test settlement entered Live revenue'; end if;
  if (select count(*) from tongs.test_funding_reservation_events where reservation_id='cf000000-0000-4000-8000-000000000052' and event_type='settled')<>1 then raise exception 'duplicate settlement event'; end if;
  if tongs._test_authorization_state('cf000000-0000-4000-8000-000000000040')<>'closed' then raise exception 'authorization not closed'; end if;
end $$;

reset role; set local request.jwt.claim.role='authenticated'; set local request.jwt.claim.sub='cf000000-0000-4000-8000-000000000002'; set local role authenticated;
do $$ declare v_customer jsonb; begin
  v_customer:=tongs.read_customer_test_billing(null);
  if (v_customer->>'live_provider_eligible')::boolean or (v_customer->>'live_revenue')::boolean then raise exception 'Test value leaked to Live'; end if;
  begin perform * from tongs.test_funding_reservations; raise exception 'customer read private Test reservation'; exception when insufficient_privilege then null; end;
end $$;

rollback;
