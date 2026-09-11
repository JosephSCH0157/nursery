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

rollback;
