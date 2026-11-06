-- Test-only predecessor identity; no linked or hosted database may run this proof.
do $request_guard$
begin
 if current_database() is distinct from 'postgres'
  or current_user is distinct from 'postgres'
  or current_setting('forge.owner_request_certification',true) is distinct from 'disposable-baseline-v1'
  or (select count(*) from forge_meta.database_lineage) is distinct from 1
  or not exists(select 1 from forge_meta.database_lineage where singleton and lineage='baseline-v1')
  or (select max(version) from supabase_migrations.schema_migrations) is distinct from '20261104071802'
  or exists(select 1 from auth.users where id='94000000-0000-4000-8000-000000000001') then
   raise exception 'Owner request proof requires the exact disposable canonical predecessor' using errcode='42501';
 end if;
end $request_guard$;

create function pg_temp.owner_request_fingerprints()
returns table(relation_name text,fingerprint text) language plpgsql as $fingerprints$
declare r record;
begin
 for r in select c.oid::regclass::text rel
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where (n.nspname='tongs' and c.relkind in ('r','p'))
      or (n.nspname='auth' and c.relname='users')
 loop
  relation_name:=r.rel;
  execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' order by to_jsonb(x)::text),'''')) from %s x',r.rel) into fingerprint;
  return next;
 end loop;
end $fingerprints$;
create temp table owner_request_original_state as select * from pg_temp.owner_request_fingerprints();

begin;

-- The disposable policy fixture is historical evidence and intentionally stale.
-- This regression constructs only the already-reviewed binding/hold relationship
-- needed to exercise provider-attempt enforcement; it grants no hosted authority.
insert into auth.users(id,email) values
 ('94000000-0000-4000-8000-000000000001','owner-aggregate-enforcement@example.test');
insert into tongs.platform_operators(user_id,reason) values
 ('94000000-0000-4000-8000-000000000001','disposable aggregate enforcement operator');
select tongs.ensure_personal_org('94000000-0000-4000-8000-000000000001');
insert into tongs.workspaces(id,name,created_by,org_id)
select '94000000-0000-4000-8000-000000000010','Aggregate enforcement workspace',
       '94000000-0000-4000-8000-000000000001',o.id
from tongs.orgs o where o.personal_owner_user_id='94000000-0000-4000-8000-000000000001';
insert into tongs.account_authority_classifications(user_id,account_class,revision,reason,configured_by)
values('94000000-0000-4000-8000-000000000001','owner',1,
 'Disposable owner-Hearth aggregate enforcement identity.','94000000-0000-4000-8000-000000000001');

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='94000000-0000-4000-8000-000000000001';
set local role service_role;
select tongs.configure_owner_testing_principal(
 '94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','enabled',
 'disposable aggregate enforcement owner');
reset role;
set local request.jwt.claim.role='authenticated';
set local role authenticated;
select tongs.commit_private_markup_rule_revision(
 '94000000-0000-4000-8000-000000000019',0,3300,'[]','disposable aggregate enforcement markup');
reset role;
set local request.jwt.claim.role='service_role';
set local role service_role;
select tongs.activate_owner_hearth_compatibility_package(
 '94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000010',
 '94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000020',
 '94000000-0000-4000-8000-000000000021','94000000-0000-4000-8000-000000000022',
 'disposable aggregate enforcement package');
reset role;
create temp table owner_request_evidence(
 kind text primary key,body text not null,sha256 text not null,serialized_bytes bigint not null,
 tokenizer_input_tokens bigint not null,protocol_overhead_tokens bigint not null,bounded_input_tokens bigint not null);
insert into owner_request_evidence values
 ('historical',$historical_request${"max_completion_tokens":512,"messages":[{"content":"You are Hearth, a concise podcast writing collaborator. Answer only the creator's bounded request. Do not browse, call tools, purchase assets, or claim work you did not perform. Return plain text or the existing Hearth JSON reply shape.","role":"system"},{"content":"Reply with exactly: Ready.","role":"user"}],"model":"gpt-6-astra"}$historical_request$,'a47a64df70bcccf38b7174d5829798f7a69e47c11f218857091f99b3b0f9cd43',386,85,16,386),
 ('current',$current_request${"max_completion_tokens":512,"messages":[{"content":"You are Hearth, a concise podcast writing collaborator. Answer only the creator's bounded request. Do not browse, call tools, purchase assets, or claim work you did not perform. Return plain text or the existing Hearth JSON reply shape.","role":"system"},{"content":"Reply with exactly: Ready.","role":"user"}],"model":"gpt-6-astra","prompt_cache_options":{"ttl":"30m"},"service_tier":"default"}$current_request$,'5782309a417f5970d78dfc57b6c42c717d771ce9bc1c6b88747c8c2ee2da2735',448,101,16,448);
grant usage on schema pg_temp to service_role;
grant select on pg_temp.owner_request_evidence to service_role;

-- These are retained reviewed terms, not a new allowance or a price recalculation.
do $reviewed_terms$
declare v_source text;
begin
 if (select count(*) from tongs.openai_text_cost_policy_revisions
     where id='81000000-0000-4000-8000-000000000001' and revision=101
       and policy_code='owner-hearth-compat-astra-v1' and route_code='hearth.chat_completion'
       and maximum_input_units=386 and maximum_output_units=512 and maximum_attempts=1
       and direct_provider_ceiling_micros=29460 and supporting_cost_ceiling_micros=1456
       and full_cost_ceiling_micros=30916 and cost_coverage='complete') is distinct from 1
    or not exists(select 1 from tongs.owner_hearth_model_terms
     where authorization_id='94000000-0000-4000-8000-000000000020' and provider_model_id='gpt-6-astra'
       and cost_policy_revision_id='81000000-0000-4000-8000-000000000001')
    or not exists(select 1 from tongs.owner_hearth_authorizations
     where id='94000000-0000-4000-8000-000000000020' and maximum_amount_micros=90000
       and maximum_operations=5 and maximum_concurrency=1 and maximum_attempts=1)
    or exists(select 1 from pg_temp.owner_request_evidence
     where octet_length(convert_to(body,'UTF8')) is distinct from serialized_bytes
       or encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex') is distinct from sha256
       or greatest(tokenizer_input_tokens+protocol_overhead_tokens,serialized_bytes) is distinct from bounded_input_tokens)
 then raise exception 'Historical owner request evidence or reviewed financial terms changed'; end if;
 select pg_get_functiondef(p.oid) into strict v_source
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='tongs' and p.proname='prepare_owner_hearth_operation';
 if position('cost.maximum_input_units<p_bounded_input_tokens' in v_source)=0
   or position('consumed+held+cost.full_cost_ceiling_micros+3>authz.maximum_amount_micros' in v_source)=0
 then raise exception 'Owner input or aggregate amount admission guard changed'; end if;
end $reviewed_terms$;

-- Calls the unchanged production RPC as service_role. No stubbed SQL admission.
create function pg_temp.prepare_owner_request(p_kind text,p_owner uuid,p_operation text,p_expiry timestamptz)
returns jsonb language sql as $prepare$
 select tongs.prepare_owner_hearth_operation(
  '94000000-0000-4000-8000-000000000080','94000000-0000-4000-8000-000000000081',
  '94000000-0000-4000-8000-000000000082','94000000-0000-4000-8000-000000000083',
  p_owner,'94000000-0000-4000-8000-000000000010','aggregate-enforcement-workpiece',
  p_operation,'gpt-6-astra',repeat('a',64),e.sha256,e.serialized_bytes,e.tokenizer_input_tokens,
  e.protocol_overhead_tokens,e.bounded_input_tokens,512,1::smallint,
  'openai-json-o200k-byte-ceiling-v1','o200k_base-js-tiktoken-1.0.21',p_expiry)
 from pg_temp.owner_request_evidence e where e.kind=p_kind
$prepare$;
grant execute on function pg_temp.prepare_owner_request(text,uuid,text,timestamptz) to service_role;

create temp table owner_request_before_denial as select * from pg_temp.owner_request_fingerprints();
set local role service_role;
do $current_request_denied$
declare v_denied boolean; i integer;
begin
 for i in 1..2 loop
  v_denied:=false;
  begin
   perform pg_temp.prepare_owner_request('current','94000000-0000-4000-8000-000000000001',
    'owner-hearth-current-request-denied',now()+interval '10 minutes');
  exception when sqlstate 'P0001' then
   if sqlerrm is distinct from 'exact owner Hearth cost and pricing terms required' then raise; end if;
   v_denied:=true;
  end;
  if v_denied is distinct from true then raise exception 'Current request exceeded historical authority without denial'; end if;
 end loop;
 v_denied:=false;
 begin
  perform pg_temp.prepare_owner_request('historical','94000000-0000-4000-8000-000000000001',
   'owner-hearth-expired-request-denied',now()-interval '1 minute');
 exception when invalid_parameter_value then
  if sqlerrm is distinct from 'invalid exact owner Hearth request evidence' then raise; end if;
  v_denied:=true;
 end;
 if v_denied is distinct from true then raise exception 'Expired owner request was accepted'; end if;
 v_denied:=false;
 begin
  perform pg_temp.prepare_owner_request('historical','94000000-0000-4000-8000-000000000002',
   'owner-hearth-cross-owner-request-denied',now()+interval '10 minutes');
 exception when insufficient_privilege then
  if sqlerrm is distinct from 'owner Hearth authorization is not active' then raise; end if;
  v_denied:=true;
 end;
 if v_denied is distinct from true then raise exception 'Cross-owner request inherited authority'; end if;
end $current_request_denied$;
reset role;
do $denial_integrity$
begin
 if exists(select 1 from pg_temp.owner_request_fingerprints() a
   full join pg_temp.owner_request_before_denial b using(relation_name)
   where a.fingerprint is distinct from b.fingerprint)
   or exists(select 1 from tongs.funding_reservations where id='94000000-0000-4000-8000-000000000083')
   or exists(select 1 from tongs.owner_hearth_operation_authorizations where id='94000000-0000-4000-8000-000000000080')
 then raise exception 'Denied current/expired/cross-owner requests mutated financial or provider state'; end if;
end $denial_integrity$;
select 'Current Astra request denied by unchanged 386-unit SQL authority; zero financial/provider mutations' as certification;
set local role service_role;

select tongs.prepare_owner_hearth_operation(
 '94000000-0000-4000-8000-000000000030','94000000-0000-4000-8000-000000000031',
 '94000000-0000-4000-8000-000000000032','94000000-0000-4000-8000-000000000033',
 '94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000010','aggregate-enforcement-workpiece',
 'owner-hearth-aggregate-enforcement','gpt-6-astra',repeat('a',64),e.sha256,e.serialized_bytes,e.tokenizer_input_tokens,e.protocol_overhead_tokens,e.bounded_input_tokens,512,1::smallint,
 'openai-json-o200k-byte-ceiling-v1','o200k_base-js-tiktoken-1.0.21',now()+interval '10 minutes')
from pg_temp.owner_request_evidence e where e.kind='historical';


reset role;
create temp table owner_request_before_replay as select * from pg_temp.owner_request_fingerprints();
set local role service_role;
do $changed_hash_denied$
declare v_denied boolean:=false;
begin
 begin
  perform pg_temp.prepare_owner_request('current','94000000-0000-4000-8000-000000000001',
   'owner-hearth-aggregate-enforcement',now()+interval '10 minutes');
 exception when unique_violation then
  if sqlerrm is distinct from 'owner Hearth operation replay conflict' then raise; end if;
  v_denied:=true;
 end;
 if v_denied is distinct from true then raise exception 'Changed current request reused historical operation authority'; end if;
end $changed_hash_denied$;
reset role;
do $replay_integrity$
begin
 if exists(select 1 from pg_temp.owner_request_fingerprints() a
   full join pg_temp.owner_request_before_replay b using(relation_name)
   where a.fingerprint is distinct from b.fingerprint)
 then raise exception 'Changed request hash mutated historical authorization or financial state'; end if;
end $replay_integrity$;
set local role service_role;

-- Missing aggregate admission must deny before any financial or attempt mutation.
do $missing_admission$
declare
  v_result jsonb;
  v_failure_holds bigint; v_failure_events bigint; v_reservation_events bigint;
  v_aggregate_events bigint; v_supplier_expenses bigint; v_budget_consumptions bigint;
begin
  select count(*) into v_failure_holds from tongs.openai_text_failure_exposure_holds;
  select count(*) into v_failure_events from tongs.openai_text_failure_exposure_events;
  select count(*) into v_reservation_events from tongs.funding_reservation_events;
  select count(*) into v_aggregate_events from tongs.restricted_beta_exposure_events;
  select count(*) into v_supplier_expenses from tongs.supplier_expenses;
  select count(*) into v_budget_consumptions from tongs.owner_operating_budget_consumptions;
  v_result:=tongs.authorize_owner_hearth_provider_attempt_with_aggregate(
    '94000000-0000-4000-8000-000000000033','missing-aggregate-attempt',1::smallint,
    'interactive',30919,120,'{"provider":"openai","provider_submission_count":0}');
  if coalesce((v_result->>'provider_execution_authorized')::boolean,true)
     or v_result->>'reason'<>'aggregate_admission_required'
     or coalesce((v_result->>'aggregate_enforcement_enabled')::boolean,false) is not true then
    raise exception 'missing aggregate admission did not fail closed: %',v_result; end if;
  if v_failure_holds<>(select count(*) from tongs.openai_text_failure_exposure_holds)
     or v_failure_events<>(select count(*) from tongs.openai_text_failure_exposure_events)
     or v_reservation_events<>(select count(*) from tongs.funding_reservation_events)
     or v_aggregate_events<>(select count(*) from tongs.restricted_beta_exposure_events)
     or v_supplier_expenses<>(select count(*) from tongs.supplier_expenses)
     or v_budget_consumptions<>(select count(*) from tongs.owner_operating_budget_consumptions) then
    raise exception 'denied owner-Hearth attempt mutated financial or provider-attempt state'; end if;
end
$missing_admission$;

-- Exercise the Research RPC's gate independently. The canonical baseline does
-- not package active Research aggregate-policy rows, so this rolled-back row is
-- only the minimum operation/frozen-request shape needed to reach the repaired
-- gate; it cannot authorize aggregate admission or provider execution.
reset role;
set local session_replication_role='replica';
insert into tongs.owner_hearth_research_operations(
 id,authorization_id,quote_id,reservation_id,operation_id,owner_user_id,workspace_id,workpiece_id,
 request_fingerprint,provider_model_id,cost_policy_revision_id,pricing_revision_id,aggregate_policy_revision_id,
 direct_provider_ceiling_micros,storage_ceiling_micros,full_cost_ceiling_micros,limit_profile,maximum_searches,
 maximum_sources,maximum_http_attempts,maximum_input_tokens,maximum_output_tokens,execution_deadline_at,created_at
) select
 '94000000-0000-4000-8000-000000000050','94000000-0000-4000-8000-000000000051',
 '94000000-0000-4000-8000-000000000052',o.reservation_id,'owner-hearth-research-aggregate-enforcement',
 o.owner_user_id,o.workspace_id,'94000000-0000-4000-8000-000000000053',repeat('c',64),'gpt-6-astra',
 o.cost_policy_revision_id,o.pricing_revision_id,o.aggregate_policy_revision_id,130000,7612,144072,
 'canary',1,2,24,8000,1000,now()+interval '60 seconds',now()
from tongs.owner_hearth_operation_authorizations o
where o.reservation_id='94000000-0000-4000-8000-000000000033';
insert into tongs.owner_hearth_research_frozen_requests(
 reservation_id,operation_id,request_fingerprint,source_revision_fingerprint,model,instruction_revision,
 serialized_body,serialized_body_sha256,serialized_bytes,tokenizer_revision,tokenizer_input_tokens,
 protocol_overhead_tokens,bounded_input_tokens,maximum_output_tokens,maximum_attempts
) values(
 '94000000-0000-4000-8000-000000000033','owner-hearth-research-aggregate-enforcement',repeat('c',64),repeat('d',64),
 'gpt-6-astra','disposable-gate-e1','{}',repeat('e',64),2,'disposable',1,0,1,16384,1);
set local session_replication_role='origin';
set local role service_role;

do $research_missing_admission$
declare v_result jsonb; v_holds bigint; v_events bigint; v_reservation_events bigint;
begin
  select count(*) into v_holds from tongs.openai_text_failure_exposure_holds;
  select count(*) into v_events from tongs.openai_text_failure_exposure_events;
  select count(*) into v_reservation_events from tongs.funding_reservation_events;
  v_result:=tongs.authorize_owner_hearth_research_openai_attempt(
    '94000000-0000-4000-8000-000000000033','research-missing-aggregate-attempt',1::smallint,
    'interactive',1000,120,'{"provider":"openai","provider_submission_count":0}');
  if coalesce((v_result->>'provider_execution_authorized')::boolean,true)
     or v_result->>'reason'<>'aggregate_admission_required'
     or coalesce((v_result->>'aggregate_enforcement_enabled')::boolean,false) is not true then
    raise exception 'Research missing aggregate admission did not fail closed: %',v_result; end if;
  if v_holds<>(select count(*) from tongs.openai_text_failure_exposure_holds)
     or v_events<>(select count(*) from tongs.openai_text_failure_exposure_events)
     or v_reservation_events<>(select count(*) from tongs.funding_reservation_events) then
    raise exception 'denied Research attempt mutated financial or provider-attempt state'; end if;
end
$research_missing_admission$;

-- Install the exact disposable binding and live hold that affirmative aggregate
-- admission would have produced for the reviewed operation authority.
do $admitted_fixture$
declare
  v_op tongs.owner_hearth_operation_authorizations%rowtype;
  v_term tongs.restricted_beta_policy_capabilities%rowtype;
  v_hold uuid := '94000000-0000-4000-8000-000000000040';
begin
  select * into v_op from tongs.owner_hearth_operation_authorizations
   where reservation_id='94000000-0000-4000-8000-000000000033';
  select * into v_term from tongs.restricted_beta_policy_capabilities
   where policy_revision_id=v_op.aggregate_policy_revision_id and capability_code='openai.text.hearth_chat';
  if v_op.id is null or v_term.id is null then raise exception 'reviewed disposable aggregate authority is missing'; end if;
  insert into tongs.restricted_beta_exposure_holds(
    id,policy_revision_id,capability_term_id,operation_identity,user_id,workspace_id,request_fingerprint,
    model_or_sku,funding_class,funding_handle_hash,provider_mode,caller_class,
    customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros,
    tail_exposure_ceiling_micros,unreconciled_exposure_ceiling_micros,retry_exposure_ceiling_micros,lease_expires_at
  ) values(
    v_hold,v_op.aggregate_policy_revision_id,v_term.id,v_op.operation_id,v_op.owner_user_id,v_op.workspace_id,v_op.request_fingerprint,
    v_op.provider_model_id,'owner_operating_budget',encode(extensions.digest(convert_to(v_op.reservation_id::text,'utf8'),'sha256'),'hex'),
    'real','interactive',0,v_term.per_operation_supplier_ceiling_micros,v_term.per_operation_supporting_ceiling_micros,
    0,3,0,now()+interval '5 minutes');
  insert into tongs.restricted_beta_exposure_events(
    id,hold_id,sequence,event_key,event_type,evidence_json
  ) values('94000000-0000-4000-8000-000000000041',v_hold,1,
    'owner-hearth-aggregate-enforcement:reserved','reserved','{"synthetic_disposable_admission":true}');
  insert into tongs.paid_operation_aggregate_bindings(
    reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,workspace_id,
    request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,
    cost_policy_revision_id,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros
  ) values(
    v_op.reservation_id,v_hold,v_op.aggregate_policy_revision_id,'openai.text.hearth_chat','openai',v_op.operation_id,
    v_op.owner_user_id,v_op.workspace_id,v_op.request_fingerprint,v_op.provider_model_id,'owner_budget','forge','real',
    v_op.pricing_revision_id,v_op.cost_policy_revision_id,0,v_term.per_operation_supplier_ceiling_micros,
    v_term.per_operation_supporting_ceiling_micros);
end
$admitted_fixture$;

-- Cost freshness is deliberately not renewed in the historical fixture. For
-- this rolled-back positive-path proof only, advance the reviewed evidence's
-- validity window without changing any rate, ceiling, policy, or identity.
-- session_replication_role is available only to the disposable postgres
-- superuser and cannot be exercised by the service-role production caller.
reset role;
set local session_replication_role='replica';
update tongs.restricted_beta_cost_evidence_revisions e
set observed_at=now()-interval '1 minute', valid_until=now()+interval '1 day'
from tongs.restricted_beta_policy_capabilities c
where c.policy_revision_id='9e86fd12-96ae-5e47-bfd0-9bb130e081ca'
  and c.capability_code='openai.text.hearth_chat'
  and e.id=c.cost_evidence_revision_id;
set local session_replication_role='origin';
set local role service_role;

do $positive_and_replay$
declare v_result jsonb; v_replay jsonb; v_holds bigint; v_attempt_events bigint;
begin
  v_result:=tongs.authorize_owner_hearth_provider_attempt_with_aggregate(
    '94000000-0000-4000-8000-000000000033','valid-aggregate-attempt',1::smallint,
    'interactive',30919,120,'{"provider":"openai","provider_submission_count":0}');
  if coalesce((v_result->>'provider_execution_authorized')::boolean,false) is not true
     or (v_result->>'aggregate_hold_id')::uuid<>'94000000-0000-4000-8000-000000000040' then
    raise exception 'valid aggregate admission did not authorize exactly one attempt: %',v_result; end if;
  select count(*) into v_holds from tongs.openai_text_failure_exposure_holds where reservation_id='94000000-0000-4000-8000-000000000033';
  select count(*) into v_attempt_events from tongs.funding_reservation_events
   where reservation_id='94000000-0000-4000-8000-000000000033' and event_type='provider_attempt_shadowed';
  v_replay:=tongs.authorize_owner_hearth_provider_attempt_with_aggregate(
    '94000000-0000-4000-8000-000000000033','valid-aggregate-attempt',1::smallint,
    'interactive',30919,120,'{"provider":"openai","provider_submission_count":0}');
  if coalesce((v_replay->>'provider_execution_authorized')::boolean,true)
     or v_replay->>'reason'<>'duplicate_attempt_blocked'
     or v_holds<>1 or v_attempt_events<>1
     or (select count(*) from tongs.openai_text_failure_exposure_holds where reservation_id='94000000-0000-4000-8000-000000000033')<>1
     or (select count(*) from tongs.funding_reservation_events where reservation_id='94000000-0000-4000-8000-000000000033' and event_type='provider_attempt_shadowed')<>1 then
    raise exception 'one-attempt/replay enforcement failed: %',v_replay; end if;
end
$positive_and_replay$;

-- Both repaired service-role functions must carry the same independent gate;
-- public roles remain unable to invoke either function.
do $installed_contract$
declare v_chat text; v_research text;
begin
  select pg_get_functiondef('tongs.authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)'::regprocedure) into v_chat;
  select pg_get_functiondef('tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)'::regprocedure) into v_research;
  if position('aggregate_binding.capability_code<>''openai.text.hearth_chat''' in v_chat)=0
     or position('aggregate_binding.capability_code<>''openai.text.hearth_research''' in v_research)=0
     or position('aggregate_hold.lease_expires_at<=now()' in v_chat)=0
     or position('aggregate_hold.lease_expires_at<=now()' in v_research)=0
     or position('aggregate_admission_required' in v_chat)=0
     or position('aggregate_admission_required' in v_research)=0 then
    raise exception 'installed owner-Hearth aggregate enforcement contract is incomplete'; end if;
  if has_function_privilege('anon','tongs.authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)','execute')
     or has_function_privilege('authenticated','tongs.authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)','execute')
     or has_function_privilege('anon','tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)','execute')
     or has_function_privilege('authenticated','tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)','execute')
     or not has_function_privilege('service_role','tongs.authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)','execute')
     or not has_function_privilege('service_role','tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)','execute') then
    raise exception 'owner-Hearth aggregate enforcement ACL drift'; end if;
end
$installed_contract$;

reset role;
rollback;
do $original_integrity$
begin
 if exists(select 1 from pg_temp.owner_request_fingerprints() a
   full join pg_temp.owner_request_original_state b using(relation_name)
   where a.fingerprint is distinct from b.fingerprint)
 then raise exception 'Owner historical/current certification failed complete rollback integrity'; end if;
end $original_integrity$;
select 'Historical serialization/terms, current denial, hash isolation and complete rollback certified; no provider execution claimed' as certification;
