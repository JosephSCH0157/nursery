begin;

insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','owner-activation@example.test'),
 ('91000000-0000-4000-8000-000000000002','operator-only@example.test');
insert into tongs.platform_operators(user_id,reason) values
 ('91000000-0000-4000-8000-000000000001','isolated owner operator'),
 ('91000000-0000-4000-8000-000000000002','operator without owner authority');
insert into tongs.workspaces(id,name) values
 ('91000000-0000-4000-8000-000000000010','Owner activation workspace');
insert into tongs.workspace_members(workspace_id,user_id,role) values
 ('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000001','owner');

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000001';
set local role service_role;

select tongs.configure_owner_testing_principal(
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','enabled','isolated verified owner');
reset role;
set local request.jwt.claim.role='authenticated';
set local role authenticated;
select tongs.commit_private_markup_rule_revision(
 '91000000-0000-4000-8000-000000000019',0,3300,'[]','isolated approved private markup');
reset role;
set local request.jwt.claim.role='service_role';
set local role service_role;
select tongs.activate_owner_hearth_compatibility_package(
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010',
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000020',
 '91000000-0000-4000-8000-000000000021','91000000-0000-4000-8000-000000000022',
 'isolated owner activation proof');

do $$ declare owner_requirement jsonb; operator_requirement jsonb; begin
 owner_requirement:=tongs.read_owner_hearth_execution_requirement(
  '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010','hearth.chat_completion');
 if owner_requirement->>'mode'<>'enforce' or coalesce((owner_requirement->>'owner_testing_effective')::boolean,false) is not true then
  raise exception 'explicit owner authority not effective: %',owner_requirement; end if;
 operator_requirement:=tongs.read_owner_hearth_execution_requirement(
  '91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000010','hearth.chat_completion');
 if coalesce((operator_requirement->>'owner_testing_effective')::boolean,false) then
  raise exception 'operator inherited owner authority'; end if;
end $$;

select tongs.prepare_owner_hearth_operation(
 '91000000-0000-4000-8000-000000000030','91000000-0000-4000-8000-000000000031',
 '91000000-0000-4000-8000-000000000032','91000000-0000-4000-8000-000000000033',
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010','compat-workpiece',
 'owner-hearth-isolated-operation-astra','gpt-6-astra',repeat('a',64),repeat('b',64),386,300,16,386,512,1::smallint,
 'openai-json-o200k-byte-ceiling-v1','o200k_base-js-tiktoken-1.0.21',now()+interval '10 minutes');

do $$ begin
 begin
  perform tongs.prepare_owner_hearth_operation(
   '91000000-0000-4000-8000-000000000040','91000000-0000-4000-8000-000000000041',
   '91000000-0000-4000-8000-000000000042','91000000-0000-4000-8000-000000000043',
   '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010','compat-workpiece',
   'owner-hearth-isolated-operation-astra','gpt-6-astra',repeat('c',64),repeat('b',64),386,300,16,386,512,1::smallint,
   'openai-json-o200k-byte-ceiling-v1','o200k_base-js-tiktoken-1.0.21',now()+interval '10 minutes');
  raise exception 'changed request replay was accepted';
 exception when unique_violation then null; end;
end $$;

do $$ declare imported jsonb; replayed jsonb; begin
 imported:=tongs.import_legacy_runway_opening_commitment(
  '544efbb5-7b76-4c2b-a5cd-d8846ff66fec','91000000-0000-4000-8000-000000000001',750000,
  'isolated missing-reservation opening commitment proof');
 replayed:=tongs.import_legacy_runway_opening_commitment(
  '544efbb5-7b76-4c2b-a5cd-d8846ff66fec','91000000-0000-4000-8000-000000000001',750000,
  'isolated missing-reservation opening commitment proof');
 if imported->>'reservation_id' is not null then raise exception 'missing legacy reservation was fabricated'; end if;
 if coalesce((imported->'evidence_json'->>'funding_entitlement')::boolean,true) then
  raise exception 'opening commitment created funding entitlement'; end if;
 if coalesce((replayed->>'replay')::boolean,false) is not true then raise exception 'opening import replay duplicated'; end if;
end $$;

select tongs.acquire_owner_hearth_aggregate_admission(
 '91000000-0000-4000-8000-000000000033','interactive','real');
select tongs.authorize_owner_hearth_provider_attempt_with_aggregate(
 '91000000-0000-4000-8000-000000000033','owner-hearth-isolated-attempt',1::smallint,
 'interactive',30919,120,'{"provider":"openai","provider_submission_count":0}');
insert into tongs.legacy_supplier_opening_commitments(id,environment,provider,commitment_key,amount_micros,status,evidence_json)
values('91000000-0000-4000-8000-000000000050','production','runway','isolated-runway-opening',750000,'unresolved','{"funding_entitlement":false}');
do $$ declare commitment bigint; concurrency bigint; policy_id uuid; begin
 select aggregate_policy_revision_id into policy_id from tongs.owner_hearth_model_terms
 where authorization_id='91000000-0000-4000-8000-000000000020' and provider_model_id='gpt-6-astra';
 select committed_micros,outstanding_count into commitment,concurrency from tongs._restricted_beta_policy_commitment(policy_id);
 if commitment<780919 then raise exception 'historical obligation not preserved: %',commitment; end if;
 if concurrency<>1 then raise exception 'historical opening commitment consumed concurrency: %',concurrency; end if;
end $$;

select tongs.settle_owner_hearth_operation(
 '91000000-0000-4000-8000-000000000033','91000000-0000-4000-8000-000000000060',
 'owner-hearth-isolated-operation-astra:settled','success',null,1000,'{"authoritative":false}');
select tongs.record_paid_operation_aggregate_outcome(
 '91000000-0000-4000-8000-000000000033','owner-hearth-isolated-operation-astra:aggregate-settled',
 'settled_unconfirmed',1000,null,
 '{"authoritative":false,"provider_usage_reported":true,"direct_cost_rounding_risk_micros":3}'::jsonb);

do $$ declare policy_id uuid; committed bigint; active_execution bigint; begin
 select aggregate_policy_revision_id into policy_id from tongs.owner_hearth_model_terms
 where authorization_id='91000000-0000-4000-8000-000000000020' and provider_model_id='gpt-6-astra';
 select committed_micros into committed from tongs._restricted_beta_policy_commitment(policy_id);
 active_execution:=tongs._restricted_beta_policy_execution_concurrency(policy_id);
 if committed<1000 then raise exception 'settled estimated supplier expense was not retained: %',committed; end if;
 if active_execution<>0 then
  raise exception 'terminal settled-estimated exposure still consumed execution concurrency: %',active_execution; end if;
end $$;

do $$ declare covered_at timestamptz; settled_at timestamptz; begin
 select created_at into settled_at from tongs.funding_reservation_events where event_key='owner-hearth-isolated-operation-astra:settled';
 select min(coverage_start) into covered_at from tongs.owner_hearth_tail_periods where reservation_id='91000000-0000-4000-8000-000000000033';
 if covered_at<>settled_at+interval '30 days' then raise exception 'tail overlaps first 30 days: %, %',settled_at,covered_at; end if;
 if (select count(*) from tongs.owner_hearth_tail_periods where reservation_id='91000000-0000-4000-8000-000000000033')<>2 then
  raise exception 'tail allocation was duplicated or incomplete'; end if;
end $$;

select tongs.record_owner_hearth_tail_measurement(
 '91000000-0000-4000-8000-000000000022',current_date,134217728,33554432,'measured_estimate',
 'owner-tail-isolated-measurement-1','{"source":"isolated"}');
do $$ begin
 if (select estimated_cost_micros from tongs.owner_hearth_tail_measurements where measurement_key='owner-tail-isolated-measurement-1')<>19680 then
  raise exception 'replacement cost measurement incorrect'; end if;
 if exists(select 1 from tongs.customer_spending_quotes where id='91000000-0000-4000-8000-000000000031'
   and (normal_maximum_charge_micros<>0 or billable_failure_maximum_charge_micros<>0)) then
  raise exception 'owner activation created customer charge'; end if;
end $$;

-- A quote released before provider submission may be replaced without using
-- one of the five provider-attempt slots. This is the recovery required when
-- aggregate admission rejects before the provider boundary.
select tongs.prepare_owner_hearth_operation(
 '91000000-0000-4000-8000-000000000070','91000000-0000-4000-8000-000000000071',
 '91000000-0000-4000-8000-000000000072','91000000-0000-4000-8000-000000000073',
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010','compat-sol-released',
 'owner-hearth-isolated-operation-sol-released','gpt-5.6-sol',repeat('c',64),repeat('d',64),386,300,16,386,512,1::smallint,
 'openai-json-o200k-byte-ceiling-v1','o200k_base-js-tiktoken-1.0.21',now()+interval '10 minutes');
select tongs.release_operation(
 '91000000-0000-4000-8000-000000000073','owner-hearth-sol-preprovider-release',
 'aggregate admission was unavailable before provider submission','{"transmitted":false,"provider_submission_count":0}'::jsonb);
select tongs.prepare_owner_hearth_operation(
 '91000000-0000-4000-8000-000000000074','91000000-0000-4000-8000-000000000075',
 '91000000-0000-4000-8000-000000000076','91000000-0000-4000-8000-000000000077',
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010','compat-sol-recovery',
 'owner-hearth-isolated-operation-sol-recovery','gpt-5.6-sol',repeat('e',64),repeat('f',64),386,300,16,386,512,1::smallint,
 'openai-json-o200k-byte-ceiling-v1','o200k_base-js-tiktoken-1.0.21',now()+interval '10 minutes');

select tongs.acquire_owner_hearth_aggregate_admission(
 '91000000-0000-4000-8000-000000000077','interactive','real');
select tongs.authorize_owner_hearth_provider_attempt_with_aggregate(
 '91000000-0000-4000-8000-000000000077','owner-hearth-isolated-sol-attempt',1::smallint,
 'interactive',13243,120,'{"provider":"openai","provider_submission_count":0}');
select tongs.record_openai_text_supplier_attempt_expense(
 '91000000-0000-4000-8000-000000000077','owner-hearth-isolated-sol-attempt',1::smallint,
 'req_test_credit_exhausted',null,'unresolved',
 '{"provider_reference":"req_test_credit_exhausted","status":429,"detail":"{\"error\":{\"code\":\"credit_balance_exhausted\",\"type\":\"credit_balance_exhausted\"}}"}'::jsonb);
select tongs.close_openai_text_failure_exposure(
 '91000000-0000-4000-8000-000000000077','owner-hearth-isolated-sol-attempt','failure_realized',null,
 '{"provider_reference":"req_test_credit_exhausted","status":429}'::jsonb);
select tongs.record_provider_failure(
 '91000000-0000-4000-8000-000000000077','owner-hearth-isolated-sol-provider-failure','provider_failure',
 '{"provider_reference":"req_test_credit_exhausted","status":429,"detail":"{\"error\":{\"code\":\"credit_balance_exhausted\",\"type\":\"credit_balance_exhausted\"}}"}'::jsonb);
select tongs.settle_owner_hearth_operation(
 '91000000-0000-4000-8000-000000000077','91000000-0000-4000-8000-000000000078',
 'owner-hearth-isolated-sol-settlement','nonbillable_failure','provider_failure',0,
 '{"authoritative":false,"cost_coverage":"incomplete"}'::jsonb);
select tongs.record_paid_operation_aggregate_outcome(
 '91000000-0000-4000-8000-000000000077','owner-hearth-isolated-sol-aggregate-failure','failure',null,null,
 '{"provider_reference":"req_test_credit_exhausted","status":429,"authoritative":false}'::jsonb);
select tongs.release_owner_hearth_definitive_nonbillable_rejection(
 '91000000-0000-4000-8000-000000000077','owner-hearth-isolated-sol-definitive-rejection');
select tongs.record_owner_hearth_compatibility_result(
 '91000000-0000-4000-8000-000000000077','owner-hearth-isolated-sol-original-result','billed_failure',
 'req_test_credit_exhausted',0,null,'{"authoritative":false,"classification":"original"}'::jsonb);
select tongs.correct_owner_hearth_nonbillable_result(
 '91000000-0000-4000-8000-000000000077','owner-hearth-isolated-sol-correction');

do $$ declare aggregate_state text; failure_state text; begin
 select e.event_type into aggregate_state from tongs.paid_operation_aggregate_bindings b
 join lateral(select event_type from tongs.restricted_beta_exposure_events x where x.hold_id=b.hold_id order by sequence desc limit 1)e on true
 where b.reservation_id='91000000-0000-4000-8000-000000000077';
 select e.event_type into failure_state from tongs.openai_text_failure_exposure_holds h
 join lateral(select event_type from tongs.openai_text_failure_exposure_events x where x.hold_id=h.id order by sequence desc limit 1)e on true
 where h.reservation_id='91000000-0000-4000-8000-000000000077';
 if aggregate_state<>'released' or failure_state<>'success_released' then
  raise exception 'definitive nonbillable rejection did not release capacity: %, %',aggregate_state,failure_state; end if;
 if exists(select 1 from tongs.owner_operating_budget_consumptions where reservation_id='91000000-0000-4000-8000-000000000077') then
  raise exception 'definitive nonbillable rejection consumed owner budget'; end if;
 if not exists(select 1 from tongs.supplier_expenses where reservation_id='91000000-0000-4000-8000-000000000077'
   and evidence_status='unresolved' and amount_micros is null) then
  raise exception 'original unresolved supplier evidence was not preserved'; end if;
 if not exists(select 1 from tongs.owner_hearth_compatibility_result_corrections c
   join tongs.owner_hearth_compatibility_results r on r.id=c.compatibility_result_id
   join tongs.owner_hearth_operation_authorizations o on o.id=r.operation_authorization_id
   where o.reservation_id='91000000-0000-4000-8000-000000000077'
     and c.original_status='billed_failure' and c.corrected_status='definitive_rejection') then
  raise exception 'append-only compatibility correction was not recorded'; end if;
end $$;

-- A fresh compatibility batch reuses the existing non-overlapping tail
-- authorization and creates only a new capped execution budget.
insert into tongs.owner_hearth_authorization_events(
 id,authorization_id,sequence,event_key,state,reason,evidence_json
)
select '91000000-0000-4000-8000-000000000089',a.id,
 (select coalesce(max(sequence),0)+1 from tongs.owner_hearth_authorization_events e where e.authorization_id=a.id),
 'owner-hearth-isolated-prior-closed','closed','isolated retry predecessor closed','{"test_only":true}'::jsonb
from tongs.owner_hearth_authorizations a where a.id='91000000-0000-4000-8000-000000000020';

select tongs.activate_owner_hearth_compatibility_retry(
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010',
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000020',
 '91000000-0000-4000-8000-000000000090','91000000-0000-4000-8000-000000000091',
 '91000000-0000-4000-8000-000000000022','isolated fresh compatibility retry');
select tongs.activate_owner_hearth_compatibility_retry(
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010',
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000020',
 '91000000-0000-4000-8000-000000000090','91000000-0000-4000-8000-000000000091',
 '91000000-0000-4000-8000-000000000022','isolated fresh compatibility retry replay');

select tongs.prepare_owner_hearth_operation(
 '91000000-0000-4000-8000-000000000092','91000000-0000-4000-8000-000000000093',
 '91000000-0000-4000-8000-000000000094','91000000-0000-4000-8000-000000000095',
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010','compat-terra-preprovider',
 'owner-hearth-isolated-retry-terra','gpt-5.6-terra',repeat('1',64),repeat('2',64),386,300,16,386,512,1::smallint,
 'openai-json-o200k-byte-ceiling-v1','o200k_base-js-tiktoken-1.0.21',now()+interval '10 minutes');
select tongs.release_operation(
 '91000000-0000-4000-8000-000000000095','owner-hearth-isolated-terra-aggregate-denied',
 'aggregate_concurrency_exhausted',
 '{"reason":"aggregate_concurrency_exhausted","transmitted":false,"provider_submission_count":0}'::jsonb);
insert into tongs.owner_hearth_operation_recovery_authorizations(
 id,operation_authorization_id,reservation_id,event_key,authorized_by,reason,expires_at,evidence_json,created_at
) values(
 '91000000-0000-4000-8000-000000000096','91000000-0000-4000-8000-000000000092',
 '91000000-0000-4000-8000-000000000095','owner-hearth-isolated-terra-expired-recovery',
 '91000000-0000-4000-8000-000000000001','expired isolated recovery fixture',now()-interval '10 minutes',
 '{"test_only":true}'::jsonb,now()-interval '20 minutes');
select tongs.rearm_owner_hearth_preprovider_release(
 '91000000-0000-4000-8000-000000000095','91000000-0000-4000-8000-000000000001',
 'owner-hearth-isolated-terra-rearm');
select tongs.rearm_owner_hearth_preprovider_release(
 '91000000-0000-4000-8000-000000000095','91000000-0000-4000-8000-000000000001',
 'owner-hearth-isolated-terra-rearm');

do $$ begin
 if (select event_type from tongs.funding_reservation_events
     where reservation_id='91000000-0000-4000-8000-000000000095' order by sequence desc limit 1)<>'reserved' then
  raise exception 'pre-provider aggregate rejection was not rearmed'; end if;
 if (select count(*) from tongs.funding_reservation_events where event_key='owner-hearth-isolated-terra-rearm')<>1 then
  raise exception 'pre-provider rearm replay was not idempotent'; end if;
 if exists(select 1 from tongs.paid_operation_aggregate_bindings where reservation_id='91000000-0000-4000-8000-000000000095')
    or exists(select 1 from tongs.openai_text_failure_exposure_holds where reservation_id='91000000-0000-4000-8000-000000000095') then
  raise exception 'rearm fabricated provider or aggregate execution evidence'; end if;
 if not exists(select 1 from tongs.owner_hearth_operation_recovery_authorizations
   where reservation_id='91000000-0000-4000-8000-000000000095' and expires_at>now()) then
  raise exception 'pre-provider recovery did not receive a bounded append-only quote-recovery window'; end if;
 if (select count(*) from tongs.owner_hearth_operation_recovery_authorizations
   where reservation_id='91000000-0000-4000-8000-000000000095')<>2 then
  raise exception 'expired append-only recovery authority was not renewed exactly once'; end if;
end $$;

do $$ declare latest_state text; begin
 select e.state into latest_state from tongs.owner_hearth_authorization_events e
 where e.authorization_id='91000000-0000-4000-8000-000000000090' order by e.sequence desc limit 1;
 if latest_state<>'active'
    or (select count(*) from tongs.owner_hearth_model_terms where authorization_id='91000000-0000-4000-8000-000000000090')<>5
    or (select count(*) from tongs.owner_hearth_tail_authorizations where owner_user_id='91000000-0000-4000-8000-000000000001'
      and workspace_id='91000000-0000-4000-8000-000000000010')<>1
    or (select maximum_amount_micros from tongs.owner_operating_budget_revisions
      where budget_id='91000000-0000-4000-8000-000000000091' order by revision desc limit 1)<>90000 then
  raise exception 'fresh compatibility retry did not preserve the exact cap and single tail allocation'; end if;
 if exists(select 1 from tongs.owner_hearth_authorizations where authorization_kind='creator_session') then
  raise exception 'retry created the conditional owner session before compatibility passed'; end if;
end $$;

rollback;
