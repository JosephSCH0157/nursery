begin;

insert into auth.users(id,email) values
 ('71000000-0000-4000-8000-000000000001','repair-one@example.test'),
 ('71000000-0000-4000-8000-000000000002','repair-two@example.test');
insert into tongs.workspaces(id,name) values
 ('71000000-0000-4000-8000-000000000010','Repair workspace one'),
 ('71000000-0000-4000-8000-000000000011','Repair workspace two');

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$ begin
 if exists(select 1 from tongs.aggregate_financial_halt_events) then
   raise exception 'repair migration changed production-style admission state'; end if;
 if not exists(select 1 from tongs.restricted_beta_tail_policy_revisions
   where revision=3 and lifecycle_state='draft' and after_first_period_policy='unfunded_block'
     and funding_treatment_json->>'canonical_content'='plan_allocation_or_owner_testing_context_required'
     and funding_treatment_json->>'provider_evidence'='reconciliation_tail_owner_overhead_until_resolved') then
   raise exception 'post-30-day funding treatment is not explicit and inactive'; end if;
end $$;

insert into tongs.restricted_beta_cost_evidence_revisions(
 id,capability_code,revision,evidence_state,coverage_state,source_reference,
 observed_at,valid_until,hard_cap_scope,notes
) values(
 '71000000-0000-4000-8000-000000000020','openai.text.hearth_chat',71,
 'synthetic_test','complete','isolated financial repair',now()-interval '1 minute',
 now()+interval '1 day','fake provider only','no external calls');
insert into tongs.restricted_beta_policy_revisions(
 id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,
 reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,reason
) values(
 '71000000-0000-4000-8000-000000000030','test',71,'active',1000,0,3,60,3600,
 'isolated conservative exposure proof');
insert into tongs.restricted_beta_policy_capabilities(
 id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,
 maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,
 per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,
 permitted_callers_json,exact_model_or_sku,notes
) values(
 '71000000-0000-4000-8000-000000000031','71000000-0000-4000-8000-000000000030',
 'openai.text.hearth_chat','covered','71000000-0000-4000-8000-000000000020',1,3,
 900,100,100,'["interactive","recovery"]','fake-openai','isolated');

do $$ declare result jsonb; committed bigint; outstanding bigint; begin
 result:=tongs.reserve_restricted_beta_exposure(
  '71000000-0000-4000-8000-000000000040','71000000-0000-4000-8000-000000000030',
  'openai.text.hearth_chat','repair-operation-one','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000010',repeat('a',64),'fake-openai','test_customer',
  'opaque-one','simulated','interactive',900,800,100,0,0,0,60,'repair-operation-one-reserved');
 if coalesce((result->>'authorized')::boolean,false) is not true then raise exception 'first hold failed: %',result; end if;

 perform tongs.record_restricted_beta_exposure_adjustment(
  '71000000-0000-4000-8000-000000000040','repair-operation-one-risk','reconciliation_risk',103,-797,500,
  '{"authoritative":false,"supporting_tail_unresolved":true,"rounding_risk_micros":3}');
 select c.committed_micros,c.outstanding_count into committed,outstanding
 from tongs._restricted_beta_policy_commitment('71000000-0000-4000-8000-000000000030') c;
 if committed<>103 or outstanding<>1 then raise exception 'conservative risk did not replace only unused ceiling: %, %',committed,outstanding; end if;

 result:=tongs.reserve_restricted_beta_exposure(
  '71000000-0000-4000-8000-000000000041','71000000-0000-4000-8000-000000000030',
  'openai.text.hearth_chat','repair-operation-two','71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000011',repeat('b',64),'fake-openai','test_customer',
  'opaque-two','simulated','interactive',800,800,0,0,0,0,60,'repair-operation-two-reserved');
 if coalesce((result->>'authorized')::boolean,false) is not true then raise exception 'unused capacity was not released defensibly: %',result; end if;

 perform tongs.record_restricted_beta_exposure_adjustment(
  '71000000-0000-4000-8000-000000000040','repair-operation-one-authoritative-up',
  'authoritative_adjustment',300,197,697,'{"authoritative":true,"source":"isolated revised provider total"}');
 if not exists(select 1 from tongs.aggregate_financial_halt_events
   where policy_revision_id='71000000-0000-4000-8000-000000000030'
     and committed_micros=1100 and configured_limit_micros=1000) then
   raise exception 'authoritative upward adjustment did not halt new admission'; end if;
 result:=tongs.reserve_restricted_beta_exposure(
  '71000000-0000-4000-8000-000000000042','71000000-0000-4000-8000-000000000030',
  'openai.text.hearth_chat','repair-operation-three','71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000011',repeat('c',64),'fake-openai','test_customer',
  'opaque-three','simulated','interactive',1,1,0,0,0,0,60,'repair-operation-three-reserved');
 if result->>'reason'<>'aggregate_authoritative_overrun_halt' then raise exception 'halt was bypassed: %',result; end if;
end $$;

-- A later policy revision still sees unresolved obligations from the earlier
-- revision. It cannot reset exposure merely by changing the window/revision.
insert into tongs.restricted_beta_policy_revisions(
 id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,
 reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,reason
) values(
 '71000000-0000-4000-8000-000000000050','test',72,'active',1000,0,3,1,3600,
 'isolated cross-revision obligation proof');
insert into tongs.restricted_beta_policy_capabilities(
 id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,
 maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,
 per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,
 permitted_callers_json,exact_model_or_sku,notes
) values(
 '71000000-0000-4000-8000-000000000051','71000000-0000-4000-8000-000000000050',
 'openai.text.hearth_chat','covered','71000000-0000-4000-8000-000000000020',1,3,
 900,100,100,'["interactive"]','fake-openai','isolated');
do $$ declare committed bigint; outstanding bigint; begin
 select c.committed_micros,c.outstanding_count into committed,outstanding
 from tongs._restricted_beta_policy_commitment('71000000-0000-4000-8000-000000000050') c;
 if committed<>1100 or outstanding<>2 then raise exception 'cross-revision obligations disappeared: %, %',committed,outstanding; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='71000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if has_table_privilege('authenticated','tongs.bounded_provider_quote_request_bindings','select')
    or has_table_privilege('authenticated','tongs.bounded_provider_request_bindings','select')
    or has_table_privilege('authenticated','tongs.paid_operation_tail_obligation_events','select')
    or has_table_privilege('authenticated','tongs.aggregate_financial_halt_events','select') then
  raise exception 'private request/exposure data exposed'; end if;
 begin
  perform tongs.bind_bounded_provider_request(null,null,null,null,null,null,null,null,null,null,null,null,null,null,null);
  raise exception 'customer invoked bounded request authority';
 exception when insufficient_privilege then null; end;
end $$;

rollback;
