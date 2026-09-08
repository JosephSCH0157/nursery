begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 ('be000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','openai-customer@example.test','',now(),now(),now()),
 ('be000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','openai-operator@example.test','',now(),now(),now()),
 ('be000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','openai-viewer@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name) values('be000000-0000-4000-8000-000000000010','OpenAI enforcement proof');
insert into tongs.platform_operators(user_id,reason,granted_by) values('be000000-0000-4000-8000-000000000002','isolated proof','be000000-0000-4000-8000-000000000002');

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='be000000-0000-4000-8000-000000000002';
set local role authenticated;
select tongs.commit_private_markup_rule_revision('be000000-0000-4000-8000-000000000019',0,3300,'[]','isolated approved 33 percent rule');
select tongs.commit_operator_pricing_revision(
  'be000000-0000-4000-8000-000000000019',
  'be000000-0000-4000-8000-000000000020','openai:gpt-5.3-chat-latest:bounded-pilot','sku','openai','gpt-5.3-chat-latest:bounded-pilot',0,
  'be000000-0000-4000-8000-000000000021',1,'USD',
  '[{"component_code":"openai_text","component_kind":"direct_provider","credential_funding":"forge","provider_label":"OpenAI","success_ceiling_micros":10668,"failure_ceiling_micros":10668,"cost_policy_revision":"openai-text:hearth-chat:bounded-pilot-v1","tail_policy":"none"},{"component_code":"bounded_support","component_kind":"supporting_provider","credential_funding":"forge","provider_label":"Forge support","success_ceiling_micros":10000,"failure_ceiling_micros":10000,"cost_policy_revision":"openai-text:hearth-chat:bounded-pilot-v1","tail_policy":"none"}]',
  '[]','[]','{"input_tokens":2000,"output_tokens":512,"attempts":1}','{"kind":"none"}','isolated OpenAI bounded pilot proof');

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;
select tongs.record_customer_deposit('be000000-0000-4000-8000-000000000030','be000000-0000-4000-8000-000000000001','evt_openai_foundation','cs_openai_foundation','pi_openai_foundation',true,'pack',100000,'USD',100,now(),'{}');
select tongs.record_customer_deposit_processor_fee('be000000-0000-4000-8000-000000000031','be000000-0000-4000-8000-000000000030','txn_openai_foundation',1000,now(),'{}');
select tongs.create_shadow_spending_quote('be000000-0000-4000-8000-000000000040','be000000-0000-4000-8000-000000000001','openai-proof-operation-0001','hearth','be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000021',repeat('b',64),'[{"component":"openai_text","provider_label":"OpenAI","credential_source":"forge"}]',now()+interval '1 hour');
select tongs.create_shadow_spending_quote('be000000-0000-4000-8000-000000000041','be000000-0000-4000-8000-000000000001','openai-proof-operation-0002','hearth','be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000021',repeat('c',64),'[{"component":"openai_text","provider_label":"OpenAI","credential_source":"forge"}]',now()+interval '1 hour');

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='be000000-0000-4000-8000-000000000001';
set local role authenticated;
select tongs.accept_quote('be000000-0000-4000-8000-000000000040','be000000-0000-4000-8000-000000000050','accept-openai-proof-0001',(tongs.read_my_spending_quote('be000000-0000-4000-8000-000000000040')->>'quote_hash'));
select tongs.accept_quote('be000000-0000-4000-8000-000000000041','be000000-0000-4000-8000-000000000051','accept-openai-proof-0002',(tongs.read_my_spending_quote('be000000-0000-4000-8000-000000000041')->>'quote_hash'));

reset role;
insert into tongs.paid_execution_control_revisions(revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,owner_budget_spending_enabled,provider_execution_enabled,reason)
select revision+1,true,true,true,owner_budget_spending_enabled,true,'isolated fake-provider authorization proof only; transaction is rolled back'
from tongs.paid_execution_control_revisions order by revision desc limit 1;
insert into tongs.openai_text_failure_loss_policy_revisions(id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,rolling_window_seconds,maximum_concurrency,lifecycle_state,reason)
values('be000000-0000-4000-8000-000000000070','hearth.chat_completion','production',2,20668,20668,86400,2,'active','isolated proof only');
insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason)
values('hearth.chat_completion',2,'enforce','10000000-0000-4000-8000-000000000009','isolated proof only');
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;
select tongs.reserve_operation('be000000-0000-4000-8000-000000000060','be000000-0000-4000-8000-000000000040','customer_deposit','be000000-0000-4000-8000-000000000030','reserve-openai-proof-0001');
select tongs.reserve_operation('be000000-0000-4000-8000-000000000061','be000000-0000-4000-8000-000000000041','customer_deposit','be000000-0000-4000-8000-000000000030','reserve-openai-proof-0002');
select tongs.bind_openai_text_funding_reservation('openai-proof-operation-0001','hearth.chat_completion','be000000-0000-4000-8000-000000000060','forge','gpt-5.3-chat-latest','10000000-0000-4000-8000-000000000009');
select tongs.bind_openai_text_funding_reservation('openai-proof-operation-0002','hearth.chat_completion','be000000-0000-4000-8000-000000000061','forge','gpt-5.3-chat-latest','10000000-0000-4000-8000-000000000009');

do $$ declare v_first jsonb; v_duplicate jsonb; v_blocked jsonb; begin
  v_first:=tongs.authorize_openai_text_provider_attempt('be000000-0000-4000-8000-000000000060','openai-proof-attempt-0001',1::smallint,20668::bigint,120,'{}');
  if coalesce((v_first->>'provider_execution_authorized')::boolean,false) is not true then raise exception 'first exact bounded attempt was not authorized: %',v_first; end if;
  v_duplicate:=tongs.authorize_openai_text_provider_attempt('be000000-0000-4000-8000-000000000060','openai-proof-attempt-0001',1::smallint,20668::bigint,120,'{}');
  if coalesce((v_duplicate->>'provider_execution_authorized')::boolean,true) is not false or v_duplicate->>'reason'<>'duplicate_attempt_blocked' then raise exception 'duplicate provider attempt was not blocked: %',v_duplicate; end if;
  if (tongs.resolve_hearth_chat_paid_execution_context(
    'openai-proof-operation-0001','be000000-0000-4000-8000-000000000060',
    'be000000-0000-4000-8000-000000000001','be000000-0000-4000-8000-000000000010',
    'workpiece-openai-proof-0001',repeat('b',64)
  )->>'reservation_state')<>'provider_attempt_shadowed' then
    raise exception 'server-owned Hearth context did not resolve the authorized attempt';
  end if;
  perform tongs.persist_hearth_chat_paid_result(
    'be000000-0000-4000-8000-000000000090','openai-proof-operation-0001',
    'be000000-0000-4000-8000-000000000060','be000000-0000-4000-8000-000000000001',
    'be000000-0000-4000-8000-000000000010','workpiece-openai-proof-0001',repeat('b',64),
    'req_isolated_fake_1','gpt-5.3-chat-latest',25,7,repeat('d',64),
    '{"assistantText":"A neutral fake-provider result.","ops":[],"scriptText":null,"tagAudit":null}'
  );
  if coalesce((tongs.persist_hearth_chat_paid_result(
    'be000000-0000-4000-8000-000000000091','openai-proof-operation-0001',
    'be000000-0000-4000-8000-000000000060','be000000-0000-4000-8000-000000000001',
    'be000000-0000-4000-8000-000000000010','workpiece-openai-proof-0001',repeat('b',64),
    'req_isolated_fake_1','gpt-5.3-chat-latest',25,7,repeat('d',64),
    '{"assistantText":"A neutral fake-provider result.","ops":[],"scriptText":null,"tagAudit":null}'
  )->>'replay')::boolean,false) is not true then raise exception 'canonical result replay was not idempotent'; end if;
  if (tongs.read_hearth_chat_paid_result(
    'openai-proof-operation-0001','be000000-0000-4000-8000-000000000060',
    'be000000-0000-4000-8000-000000000001',repeat('b',64)
  )->>'provider_request_id')<>'req_isolated_fake_1' then raise exception 'canonical result could not be read for replay'; end if;
  v_blocked:=tongs.authorize_openai_text_provider_attempt('be000000-0000-4000-8000-000000000061','openai-proof-attempt-0002',1::smallint,20668::bigint,120,'{}');
  if coalesce((v_blocked->>'provider_execution_authorized')::boolean,true) is not false or v_blocked->>'reason'<>'aggregate_failure_limit' then raise exception 'aggregate failure exposure was not blocked: %',v_blocked; end if;
  if (select mode from tongs._current_openai_text_rollout('hearth.chat_completion'))<>'halt_new' then raise exception 'aggregate cap did not halt route'; end if;
  perform tongs.close_openai_text_failure_exposure('be000000-0000-4000-8000-000000000060','openai-proof-attempt-0001','success_released',10000,'{}');
end $$;

select tongs.record_openai_organization_reconciliation(
  'be000000-0000-4000-8000-000000000080','openai-costs-2026-09-08-proof','2026-09-08T00:00:00Z','2026-09-09T00:00:00Z','USD',12345,
  'organization_costs_api','confirmed','[{"bucket_key":"project:proof","project_id":"proj_proof","line_item":"model usage","amount_micros":12345}]',
  '[{"bucket_key":"model:proof","model":"gpt-5.3-chat-latest","input_tokens":2000,"cached_input_tokens":0,"output_tokens":512,"request_count":1}]',
  '{"source":"isolated synthetic authoritative-shape proof"}');
select tongs.record_openai_organization_reconciliation(
  'be000000-0000-4000-8000-000000000080','openai-costs-2026-09-08-proof','2026-09-08T00:00:00Z','2026-09-09T00:00:00Z','USD',12345,
  'organization_costs_api','confirmed','[{"bucket_key":"project:proof","project_id":"proj_proof","line_item":"model usage","amount_micros":12345}]',
  '[{"bucket_key":"model:proof","model":"gpt-5.3-chat-latest","input_tokens":2000,"cached_input_tokens":0,"output_tokens":512,"request_count":1}]','{}');
do $$ begin
  if (select count(*) from tongs.openai_organization_reconciliation_batches where source_key='openai-costs-2026-09-08-proof')<>1 then raise exception 'reconciliation replay duplicated batch'; end if;
  if (select status from tongs.openai_text_activation_proposals where id='30000000-0000-4000-8000-000000000001')<>'awaiting_owner_approval' then raise exception 'pilot proposal unexpectedly activated'; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='be000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
  begin perform tongs.read_openai_text_enforcement_readiness(10); raise exception 'viewer read OpenAI enforcement internals'; exception when insufficient_privilege then null; end;
  if has_table_privilege('authenticated','tongs.openai_text_provider_rate_revisions','select')
    or has_table_privilege('authenticated','tongs.openai_organization_cost_buckets','select')
    or has_table_privilege('authenticated','tongs.openai_text_failure_loss_policy_revisions','select')
    or has_table_privilege('authenticated','tongs.openai_text_persisted_results','select') then
    raise exception 'OpenAI wholesale controls exposed'; end if;
end $$;

rollback;
