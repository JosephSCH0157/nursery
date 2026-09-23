begin;

set local session_replication_role=replica;
select plan(1);

do $$
declare
  before_test_exposure bigint;
  before_test_concurrency integer;
  after_test_exposure bigint;
  after_test_concurrency integer;
  before_live_exposure bigint;
  before_live_concurrency integer;
  after_live_exposure bigint;
  after_live_concurrency integer;
  replay jsonb;
begin
  select committed_micros,concurrency_count
  into before_test_exposure,before_test_concurrency
  from tongs._openai_text_failure_loss_exposure('visual.unified_plan','test',86400);
  select committed_micros,concurrency_count
  into before_live_exposure,before_live_concurrency
  from tongs._openai_text_failure_loss_exposure('visual.unified_plan','live',86400);

  insert into tongs.funding_reservations(
    id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,
    currency,reserved_customer_charge_micros,reserved_credit_units,
    reserved_wholesale_spend_micros,idempotency_key,funding_environment
  ) values
    ('58000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000021','fixture:visual:authorized','none',null,'USD',0,0,0,'fixture-risk-authorized','test'),
    ('58000000-0000-4000-8000-000000000002','58000000-0000-4000-8000-000000000012','58000000-0000-4000-8000-000000000022','fixture:visual:inflight-unresolved','none',null,'USD',0,0,0,'fixture-risk-inflight','test'),
    ('58000000-0000-4000-8000-000000000003','58000000-0000-4000-8000-000000000013','58000000-0000-4000-8000-000000000023','fixture:visual:terminal-unknown','none',null,'USD',0,0,0,'fixture-risk-terminal','test'),
    ('58000000-0000-4000-8000-000000000004','58000000-0000-4000-8000-000000000014','58000000-0000-4000-8000-000000000024','fixture:visual:realized','none',null,'USD',0,0,0,'fixture-risk-realized','test');

  insert into tongs.openai_text_failure_exposure_holds(
    id,reservation_id,route_code,attempt_key,attempt_number,
    authorized_exposure_micros,lease_expires_at,financial_environment,environment_authority
  ) values
    ('58000000-0000-4000-8000-000000000101','58000000-0000-4000-8000-000000000001','visual.unified_plan','fixture:attempt:authorized',1,100,now()+interval '5 minutes','test','canonical_reservation'),
    ('58000000-0000-4000-8000-000000000102','58000000-0000-4000-8000-000000000002','visual.unified_plan','fixture:attempt:inflight',1,200,now()+interval '5 minutes','test','canonical_reservation'),
    ('58000000-0000-4000-8000-000000000103','58000000-0000-4000-8000-000000000003','visual.unified_plan','fixture:attempt:terminal',1,300,now()-interval '5 minutes','test','canonical_reservation'),
    ('58000000-0000-4000-8000-000000000104','58000000-0000-4000-8000-000000000004','visual.unified_plan','fixture:attempt:realized',1,7000,now()-interval '5 minutes','test','canonical_reservation');

  insert into tongs.openai_text_failure_exposure_events(
    id,hold_id,sequence,event_key,event_type,actual_supplier_cost_micros,evidence_json
  ) values
    ('58000000-0000-4000-8000-000000000201','58000000-0000-4000-8000-000000000101',1,'fixture:exposure:authorized','authorized',null,'{}'),
    ('58000000-0000-4000-8000-000000000202','58000000-0000-4000-8000-000000000102',1,'fixture:exposure:inflight','unresolved',null,'{}'),
    ('58000000-0000-4000-8000-000000000203','58000000-0000-4000-8000-000000000103',1,'fixture:exposure:terminal','unresolved',null,'{}'),
    ('58000000-0000-4000-8000-000000000204','58000000-0000-4000-8000-000000000104',1,'fixture:exposure:realized','failure_realized',6286,'{}');

  insert into tongs.funding_reservation_events(
    id,reservation_id,sequence,event_type,event_key,provider_attempt_key,
    lease_expires_at,evidence_json
  ) values
    ('58000000-0000-4000-8000-000000000301','58000000-0000-4000-8000-000000000002',1,'provider_attempt_shadowed','fixture:reservation:inflight-attempt','fixture:attempt:inflight',now()+interval '5 minutes','{}'),
    ('58000000-0000-4000-8000-000000000302','58000000-0000-4000-8000-000000000002',2,'submission_unknown','fixture:reservation:inflight-unknown',null,null,'{"automatic_resubmission_allowed":false}'),
    ('58000000-0000-4000-8000-000000000303','58000000-0000-4000-8000-000000000003',1,'provider_attempt_shadowed','fixture:reservation:terminal-attempt','fixture:attempt:terminal',now()-interval '5 minutes','{}'),
    ('58000000-0000-4000-8000-000000000304','58000000-0000-4000-8000-000000000003',2,'submission_unknown','fixture:reservation:terminal-unknown',null,null,'{"automatic_resubmission_allowed":false}');

  insert into tongs.openai_text_funding_bindings(
    operation_id,route_code,reservation_id,credential_funding,model,
    pricing_revision_id,maximum_input_units,maximum_output_units,maximum_attempts
  ) values
    ('fixture:visual:inflight-unresolved','visual.unified_plan','58000000-0000-4000-8000-000000000002','forge','gpt-5.6-luna','17000000-0000-4000-8000-000000000003',32000,6144,1),
    ('fixture:visual:terminal-unknown','visual.unified_plan','58000000-0000-4000-8000-000000000003','forge','gpt-5.6-luna','17000000-0000-4000-8000-000000000003',32000,6144,1);

  insert into tongs.unified_visual_plan_operations(
    operation_id,operation_fingerprint,workspace_id,workpiece_id,
    script_approval_id,script_approval_revision,script_content_hash,state,
    normalized_inputs_json,created_by,contract_version
  ) values
    ('fixture:visual:inflight-unresolved',repeat('a',64),'58000000-0000-4000-8000-000000000401','58000000-0000-4000-8000-000000000411','58000000-0000-4000-8000-000000000421',1,repeat('b',64),'submission_unknown','{}','58000000-0000-4000-8000-000000000431','forge.unified-visual-plan.v2'),
    ('fixture:visual:terminal-unknown',repeat('c',64),'58000000-0000-4000-8000-000000000402','58000000-0000-4000-8000-000000000412','58000000-0000-4000-8000-000000000422',1,repeat('d',64),'submission_unknown','{}','58000000-0000-4000-8000-000000000432','forge.unified-visual-plan.v2');

  insert into tongs.unified_visual_plan_transport_recovery_events(
    id,event_key,operation_id,reservation_id,failure_exposure_hold_id,event_type,evidence_json
  ) values(
    '58000000-0000-4000-8000-000000000501','fixture:transport:terminal',
    'fixture:visual:terminal-unknown','58000000-0000-4000-8000-000000000003',
    '58000000-0000-4000-8000-000000000103','expired_attempt_submission_unknown',
    '{"attempt_key":"fixture:attempt:terminal","automatic_resubmission_allowed":false}'
  );

  select committed_micros,concurrency_count
  into after_test_exposure,after_test_concurrency
  from tongs._openai_text_failure_loss_exposure('visual.unified_plan','test',86400);
  if after_test_exposure-before_test_exposure<>6886 then
    raise exception 'exposure delta mismatch: expected 6886, got %',after_test_exposure-before_test_exposure;
  end if;
  if after_test_concurrency-before_test_concurrency<>2 then
    raise exception 'concurrency delta mismatch: expected authorized plus in-flight unresolved only';
  end if;

  perform set_config('request.jwt.claim.role','service_role',true);
  replay:=tongs.begin_provider_attempt(
    '58000000-0000-4000-8000-000000000003',
    'fixture:attempt:terminal:replay',60,'{}');
  if replay->>'state'<>'submission_unknown'
    or replay->>'replay'<>'true'
    or replay->>'provider_execution_authorized'<>'false'
  then raise exception 'submission-unknown replay guard mismatch: %',replay; end if;

  if exists(select 1 from tongs.supplier_expenses
      where reservation_id in(
        '58000000-0000-4000-8000-000000000001',
        '58000000-0000-4000-8000-000000000002',
        '58000000-0000-4000-8000-000000000003',
        '58000000-0000-4000-8000-000000000004'))
    or exists(select 1 from tongs.funding_reservation_events
      where reservation_id in(
        '58000000-0000-4000-8000-000000000001',
        '58000000-0000-4000-8000-000000000002',
        '58000000-0000-4000-8000-000000000003',
        '58000000-0000-4000-8000-000000000004')
        and event_type='settled' and coalesce(customer_charge_micros,0)<>0)
  then raise exception 'projection invented supplier expense or customer charge'; end if;

  select committed_micros,concurrency_count
  into after_live_exposure,after_live_concurrency
  from tongs._openai_text_failure_loss_exposure('visual.unified_plan','live',86400);
  if after_live_exposure<>before_live_exposure
    or after_live_concurrency<>before_live_concurrency
  then raise exception 'Live exposure semantics changed'; end if;
end $$;

select pass('failure-loss exposure and active concurrency are projected independently');
select * from finish();

rollback;
