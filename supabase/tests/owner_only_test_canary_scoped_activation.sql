begin;
set request.jwt.claim.role='service_role';

do $$
declare
  owner_id uuid:='6b100000-0000-4000-8000-000000000001';
  workspace_id uuid:='6b100000-0000-4000-8000-000000000101';
  quote_id uuid:='6c100000-0000-4000-8000-000000000001';
  acceptance_id uuid:='6c100000-0000-4000-8000-000000000002';
  reservation_id uuid:='6c100000-0000-4000-8000-000000000003';
  operation_id text:='hammer-owner-canary-proof-0001';
  fingerprint text:=repeat('a',64);
  quote_result jsonb; bound_result jsonb; reserve_result jsonb; execution_context jsonb;
  aggregate_result jsonb; provider_result jsonb; reconciliation_result jsonb; denied boolean:=false;
  scope_id uuid; budget_id uuid; eligibility jsonb;
  start_epoch bigint:=extract(epoch from date_trunc('day',now()))::bigint;
begin
  select choice.scope_id,choice.budget_id into scope_id,budget_id
  from tongs._owner_paid_execution_canary_for_choice(
    owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini'
  ) choice;
  if scope_id is null or budget_id is null then
    raise exception 'fresh exact owner canary was not eligible before reservation';
  end if;
  eligibility:=tongs.resolve_owner_openai_text_canary_eligibility(
    owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini');
  if coalesce((eligibility->>'eligible')::boolean,false) is not true then
    raise exception 'eligibility RPC did not admit fresh exact authority: %',eligibility;
  end if;

  -- A closed latest budget revision must produce zero choice rows. This block
  -- deliberately rolls its append-only revision back after proving the gate.
  begin
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    perform tongs.revise_owner_operating_budget(
      budget_id,'closed',169728,'Slice 6C.8B rollback-only closed budget proof');
    if exists(select 1 from tongs._owner_paid_execution_canary_for_choice(
      owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini')) then
      raise exception 'closed budget remained eligible';
    end if;
    if exists(select 1 from tongs._owner_paid_execution_canary_for_choice(
      owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini') choice
      where choice.activation_id is null) then
      raise exception 'nullable composite escaped as an eligible row';
    end if;
    raise exception using errcode='P0001',message='slice6c8b_closed_budget_probe_complete';
  exception when raise_exception then
    if sqlerrm<>'slice6c8b_closed_budget_probe_complete' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','',true);

  -- Expired scope and expired activation records are independently inert.
  insert into tongs.customer_paid_execution_scope_authorizations(
    id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
    pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
    maximum_customer_charge_micros,maximum_wholesale_exposure_micros,maximum_concurrency,
    rolling_window_seconds,valid_from,valid_until,status,reason,created_by,authorization_kind
  ) select
    '6c8b0000-0000-4000-8000-000000000130',source.user_id,source.workspace_id,source.financial_environment,
    source.route_code,source.provider,source.model_or_sku,source.pricing_revision_id,source.cost_policy_revision_id,
    source.maximum_operation_count,source.maximum_customer_charge_micros,source.maximum_wholesale_exposure_micros,
    source.maximum_concurrency,source.rolling_window_seconds,now()-interval '2 days',now()-interval '1 day',
    source.status,'Slice 6C.8B expired scope proof',source.created_by,source.authorization_kind
  from tongs.customer_paid_execution_scope_authorizations source where source.id=scope_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform tongs.create_owner_testing_budget_draft(
    '6c8b0000-0000-4000-8000-000000000131',owner_id,owner_id,'test',workspace_id,
    'openai','hammer.transcript_cleanup','slice6c8b-expired-scope','USD',
    now()-interval '1 minute',now()+interval '1 day','Slice 6C.8B expired scope budget');
  perform tongs.revise_owner_operating_budget(
    '6c8b0000-0000-4000-8000-000000000131','active',169728,
    'Slice 6C.8B expired scope active budget');
  insert into tongs.owner_paid_execution_canary_activation_revisions(
    id,execution_scope_authorization_id,owner_budget_id,revision,previous_revision_id,state,
    maximum_operation_count,valid_from,valid_until,reason,actor_id
  ) values(
    '6c8b0000-0000-4000-8000-000000000132','6c8b0000-0000-4000-8000-000000000130',
    '6c8b0000-0000-4000-8000-000000000131',1,null,'active',1,
    now()-interval '1 minute',now()+interval '1 day','Slice 6C.8B expired scope activation',owner_id);
  if exists(select 1 from tongs._active_owner_paid_execution_canary_for_scope(
    '6c8b0000-0000-4000-8000-000000000130',null) activation
    where activation.id is not null) then
    raise exception 'expired scope retained active canary authority';
  end if;

  insert into tongs.customer_paid_execution_scope_authorizations(
    id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
    pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
    maximum_customer_charge_micros,maximum_wholesale_exposure_micros,maximum_concurrency,
    rolling_window_seconds,valid_from,valid_until,status,reason,created_by,authorization_kind
  ) select
    '6c8b0000-0000-4000-8000-000000000133',source.user_id,source.workspace_id,source.financial_environment,
    source.route_code,source.provider,source.model_or_sku,source.pricing_revision_id,source.cost_policy_revision_id,
    source.maximum_operation_count,source.maximum_customer_charge_micros,source.maximum_wholesale_exposure_micros,
    source.maximum_concurrency,source.rolling_window_seconds,now()-interval '1 minute',now()+interval '1 day',
    source.status,'Slice 6C.8B expired activation scope',source.created_by,source.authorization_kind
  from tongs.customer_paid_execution_scope_authorizations source where source.id=scope_id;
  perform tongs.create_owner_testing_budget_draft(
    '6c8b0000-0000-4000-8000-000000000134',owner_id,owner_id,'test',workspace_id,
    'openai','hammer.transcript_cleanup','slice6c8b-expired-activation','USD',
    now()-interval '1 minute',now()+interval '1 day','Slice 6C.8B expired activation budget');
  perform tongs.revise_owner_operating_budget(
    '6c8b0000-0000-4000-8000-000000000134','active',169728,
    'Slice 6C.8B expired activation active budget');
  insert into tongs.owner_paid_execution_canary_activation_revisions(
    id,execution_scope_authorization_id,owner_budget_id,revision,previous_revision_id,state,
    maximum_operation_count,valid_from,valid_until,reason,actor_id
  ) values(
    '6c8b0000-0000-4000-8000-000000000135','6c8b0000-0000-4000-8000-000000000133',
    '6c8b0000-0000-4000-8000-000000000134',1,null,'active',1,
    now()-interval '2 days',now()-interval '1 day','Slice 6C.8B expired activation proof',owner_id);
  if exists(select 1 from tongs._active_owner_paid_execution_canary_for_scope(
    '6c8b0000-0000-4000-8000-000000000133',null) activation
    where activation.id is not null) then
    raise exception 'expired activation retained canary authority';
  end if;
  perform set_config('request.jwt.claim.sub','',true);

  quote_result:=tongs.create_owner_openai_text_canary_quote(
    quote_id,owner_id,operation_id,'hammer.transcript_cleanup',workspace_id,'workpiece-proof',
    fingerprint,'gpt-5.4-mini','forge',now()+interval '10 minutes');
  if (quote_result->>'customer_credit_units')::bigint<>46
     or (quote_result->>'maximum_customer_charge_micros')::bigint<>230000
     or quote_result->>'funding_environment'<>'test'
     or quote_result ? 'full_cost_ceiling_micros'
     or quote_result ? 'pricing_revision_id'
     or quote_result ? 'provider_model_id' then
    raise exception 'owner canary quote is not the customer-safe 46-credit contract';
  end if;

  perform tongs.bind_bounded_provider_quote_request(
    quote_id,owner_id,operation_id,'hammer.transcript_cleanup',fingerprint,'gpt-5.4-mini',
    'default','slice6c1-proof','slice6c1-proof',repeat('b',64),1024,100,10,1024,1024,16384,1::smallint);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform tongs.accept_quote(quote_id,acceptance_id,'owner-canary-proof-acceptance',quote_result->>'quote_hash');
  perform set_config('request.jwt.claim.role','service_role',true);

  -- Stage a second accepted quote before the one-operation scope is consumed.
  -- It is used below to prove the trigger, not an idempotency replay guard,
  -- blocks a concurrent/distinct reservation.
  quote_result:=tongs.create_owner_openai_text_canary_quote(
    '6c100000-0000-4000-8000-000000000011',owner_id,'hammer-owner-canary-proof-0002',
    'hammer.transcript_cleanup',workspace_id,'workpiece-proof-two',repeat('c',64),
    'gpt-5.4-mini','forge',now()+interval '10 minutes');
  perform tongs.bind_bounded_provider_quote_request(
    '6c100000-0000-4000-8000-000000000011',owner_id,'hammer-owner-canary-proof-0002',
    'hammer.transcript_cleanup',repeat('c',64),'gpt-5.4-mini','default',
    'slice6c8b-concurrent','slice6c8b-concurrent',repeat('d',64),1024,100,10,1024,1024,16384,1::smallint);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform tongs.accept_quote(
    '6c100000-0000-4000-8000-000000000011','6c100000-0000-4000-8000-000000000013',
    'owner-canary-concurrent-acceptance',quote_result->>'quote_hash');
  perform set_config('request.jwt.claim.role','service_role',true);

  reserve_result:=tongs.reserve_owner_openai_text_canary_quote(
    quote_id,reservation_id,owner_id,operation_id,'hammer.transcript_cleanup',workspace_id,
    'workpiece-proof',fingerprint,'gpt-5.4-mini','forge','owner-canary-proof-reservation');
  if reserve_result#>>'{paid_execution,funding_environment}'<>'test'
     or (select funding_source_type from tongs.funding_reservations where id=reservation_id)<>'owner_budget'
     or (select reserved_wholesale_spend_micros from tongs.funding_reservations where id=reservation_id)<>169728
     or (select reserved_customer_charge_micros from tongs.funding_reservations where id=reservation_id)<>0
     or (select rollout_authorization_id is null from tongs.funding_reservations where id=reservation_id) then
    raise exception 'owner canary reservation did not bind exact Test scope and budget';
  end if;

  eligibility:=tongs.resolve_owner_openai_text_canary_eligibility(
    owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini');
  if coalesce((eligibility->>'eligible')::boolean,true) is not false
     or exists(select 1 from tongs._owner_paid_execution_canary_for_choice(
       owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini')) then
    raise exception 'consumed one-operation scope remained eligible: %',eligibility;
  end if;

  -- Terminal release never makes a one-operation scope reusable. Roll back the
  -- release so the same isolated reservation can continue to provider-boundary
  -- and reconciliation proofs below.
  begin
    perform tongs.release_operation(
      reservation_id,'slice6c8b-release-probe','rollback-only release proof','{"transmitted":false}'::jsonb);
    if exists(select 1 from tongs._owner_paid_execution_canary_for_choice(
      owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini')) then
      raise exception 'released reservation incorrectly restored canary eligibility';
    end if;
    raise exception using errcode='P0001',message='slice6c8b_release_probe_complete';
  exception when raise_exception then
    if sqlerrm<>'slice6c8b_release_probe_complete' then raise; end if;
  end;

  -- Both the customer-safe quote gate and the trigger-backed reservation gate
  -- deny further work. The latter remains the advisory-locked race authority.
  begin
    perform tongs.create_owner_openai_text_canary_quote(
      '6c100000-0000-4000-8000-000000000014',owner_id,'hammer-owner-canary-proof-0003',
      'hammer.transcript_cleanup',workspace_id,'workpiece-proof-three',repeat('e',64),
      'gpt-5.4-mini','forge',now()+interval '10 minutes');
    raise exception 'exhausted scope unexpectedly created another quote';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.reserve_operation(
      '6c100000-0000-4000-8000-000000000012','6c100000-0000-4000-8000-000000000011',
      'owner_budget',budget_id,
      'slice6c8b-duplicate-reservation');
    raise exception 'duplicate reservation bypassed trigger admission';
  exception when raise_exception then
    if sqlerrm not in ('owner canary operation limit reached','insufficient owner operating budget') then raise; end if;
  end;
  if position($needle$pg_advisory_xact_lock(hashtextextended('paid-scope:'||scope_auth.id::text,0))$needle$
      in pg_get_functiondef('tongs._stamp_and_authorize_funding_reservation()'::regprocedure))=0
     or position($needle$where rollout_authorization_id=scope_auth.id$needle$
      in pg_get_functiondef('tongs._stamp_and_authorize_funding_reservation()'::regprocedure))=0 then
    raise exception 'reservation trigger lost advisory lock or all-reservation operation count';
  end if;

  if coalesce((tongs.resolve_openai_text_verified_zero_supporting_cost(reservation_id)->>'authoritative')::boolean,false) is not true then
    raise exception 'exact Hammer reservation did not resolve verified-zero supporting authority';
  end if;

  execution_context:=tongs.resolve_openai_text_paid_execution_context(
    'hammer.transcript_cleanup',operation_id,reservation_id,owner_id,workspace_id,
    'workpiece-proof',fingerprint);
  if execution_context->>'cost_policy_revision_id'<>'40010000-0000-4000-8000-000000000301'
     or execution_context->>'pricing_revision_id'<>'40010000-0000-4000-8000-000000000402'
     or execution_context->>'funding_source_type'<>'owner_budget'
     or execution_context->>'funding_environment'<>'test'
     or execution_context->>'model'<>'gpt-5.4-mini'
     or (execution_context->>'full_cost_ceiling_micros')::bigint<>169728 then
    raise exception 'owner canary execution context did not preserve exact complete-cost authority: %',execution_context;
  end if;

  -- Every caller-controlled identity remains exact. None may be inferred from
  -- owner identity or from the existence of a canary activation.
  begin
    perform tongs.resolve_openai_text_paid_execution_context(
      'hammer.transcript_cleanup',operation_id,reservation_id,'6b100000-0000-4000-8000-000000000099',
      workspace_id,'workpiece-proof',fingerprint);
    raise exception 'wrong owner unexpectedly resolved execution context';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.resolve_openai_text_paid_execution_context(
      'hammer.transcript_cleanup',operation_id,reservation_id,owner_id,'6b100000-0000-4000-8000-000000000199',
      'workpiece-proof',fingerprint);
    raise exception 'wrong workspace unexpectedly resolved execution context';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.resolve_openai_text_paid_execution_context(
      'hammer.transcript_cleanup','hammer-owner-canary-proof-wrong',reservation_id,owner_id,workspace_id,
      'workpiece-proof',fingerprint);
    raise exception 'wrong operation unexpectedly resolved execution context';
  exception when no_data_found then null; end;
  begin
    perform tongs.resolve_openai_text_paid_execution_context(
      'hammer.transcript_cleanup',operation_id,reservation_id,owner_id,workspace_id,
      'workpiece-proof',repeat('f',64));
    raise exception 'wrong request fingerprint unexpectedly resolved execution context';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.resolve_openai_text_paid_execution_context(
      'hammer.transcript_cleanup',operation_id,reservation_id,owner_id,workspace_id,
      'wrong-workpiece',fingerprint);
    raise exception 'wrong workpiece unexpectedly resolved execution context';
  exception when insufficient_privilege then null; end;

  aggregate_result:=tongs.acquire_openai_text_aggregate_admission(reservation_id,'interactive','real');
  if coalesce((aggregate_result->>'authorized')::boolean,false) is not true then
    raise exception 'owner canary aggregate admission failed: %',aggregate_result;
  end if;
  provider_result:=tongs.authorize_openai_text_provider_attempt_with_aggregate(
    reservation_id,'owner-canary-proof-attempt',1::smallint,'interactive',169728,60,
    jsonb_build_object('no_network',true,'proof','rollback_only'));
  if coalesce((provider_result->>'provider_execution_authorized')::boolean,false) is not true then
    raise exception 'owner canary did not reach provider boundary: %',provider_result;
  end if;

  -- Reproduce the historical evidence shape: direct supplier cost remains an
  -- estimate, while an immutable zero supporting expense is effectively
  -- complete only through the pinned policy/inventory authority.
  perform tongs.record_openai_text_supplier_attempt_expense(
    reservation_id,'owner-canary-proof-attempt',1::smallint,'req_slice6c8b_fixture',246,
    'estimated','{"source":"pinned_rate_estimate"}'::jsonb);
  perform tongs.record_supplier_expense(
    '6c8b0000-0000-4000-8000-000000000140',reservation_id,
    'owner-canary-proof-attempt:supporting-expense','forge',
    'openai.text.hammer.transcript_cleanup.supporting',null,'USD',0,'estimated','closed',
    '{"source":"historical_runtime_classification"}'::jsonb);
  perform tongs.record_openai_text_usage(
    '6c8b0000-0000-4000-8000-000000000141',reservation_id,
    'owner-canary-proof-attempt:usage','req_slice6c8b_fixture',1::smallint,10,5,true,true,true,
    '{"cached_input_units":0}'::jsonb);
  perform tongs.record_paid_operation_aggregate_outcome(
    reservation_id,'owner-canary-proof-settled-unconfirmed','settled_unconfirmed',246,null,
    '{"authoritative":false,"supporting_and_tail_costs_confirmed":false}'::jsonb);

  reconciliation_result:=tongs.record_openai_organization_reconciliation(
    '6c8b0000-0000-4000-8000-000000000142','openai-costs-slice6c8b-fixture',
    to_timestamp(start_epoch),to_timestamp(start_epoch+86400),'USD',246,
    'organization_costs_api','confirmed',
    jsonb_build_array(jsonb_build_object(
      'bucket_key','slice6c8b-cost','project_id','proj_slice6c8b','api_key_id','key_slice6c8b',
      'line_item','gpt-5.4-mini, input','amount_micros',246,
      'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    jsonb_build_array(jsonb_build_object(
      'bucket_key','slice6c8b-usage','project_id','proj_slice6c8b','api_key_id','key_slice6c8b',
      'model','gpt-5.4-mini','input_tokens',10,'cached_input_tokens',0,'output_tokens',5,
      'request_count',1,
      'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
    '{"source":"isolated_authoritative_fixture","project_scope":["proj_slice6c8b"]}'::jsonb);
  if reconciliation_result->>'allocation_status'<>'defensibly_allocated'
     or (select evidence_status from tongs.supplier_expenses
         where id='6c8b0000-0000-4000-8000-000000000140')<>'estimated'
     or (select confirmed_amount_micros from tongs.openai_supplier_expense_reconciliation_adjustments
         where supplier_expense_id in(select id from tongs.supplier_expenses
           where tongs.supplier_expenses.reservation_id='6c100000-0000-4000-8000-000000000003'
             and provider='openai'))<>246
     or not exists(
       select 1 from tongs.restricted_beta_exposure_events event
       join tongs.paid_operation_aggregate_bindings binding on binding.hold_id=event.hold_id
       where binding.reservation_id='6c100000-0000-4000-8000-000000000003'
         and event.event_type='reconciled'
         and event.evidence_json->>'verified_zero_supporting_cost_authority'='true'
     ) then
    raise exception 'append-only verified-zero reconciliation failed: %',reconciliation_result;
  end if;

  -- Wrong operation, model, subject, workspace, and Live have no private lane.
  if exists(select 1 from tongs._owner_paid_execution_canary_for_choice(owner_id,workspace_id,'hearth.chat_completion','gpt-5.4-mini'))
     or exists(select 1 from tongs._owner_paid_execution_canary_for_choice(owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.6-sol'))
     or exists(select 1 from tongs._owner_paid_execution_canary_for_choice('6b100000-0000-4000-8000-000000000099',workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini'))
     or exists(select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code='hammer.transcript_cleanup' and financial_environment='live') then
    raise exception 'owner canary identity/environment isolation failed';
  end if;

  -- A second provider attempt is impossible because the exact cost binding allows one.
  begin
    provider_result:=tongs.authorize_openai_text_provider_attempt_with_aggregate(
      reservation_id,'owner-canary-proof-attempt-two',2::smallint,'interactive',169728,60,'{}'::jsonb);
    denied:=coalesce((provider_result->>'provider_execution_authorized')::boolean,false) is not true;
  exception when others then denied:=true; end;
  if not denied then raise exception 'second provider attempt was not denied'; end if;

  if (select mode from tongs.openai_text_rollout_revisions
      where route_code='hammer.transcript_cleanup' order by revision desc limit 1)<>'halt_new'
     or exists(select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code='hammer.transcript_cleanup' and authorization_kind='normal_customer') then
    raise exception 'general Hammer halt/customer isolation regressed';
  end if;
end $$;

rollback;

-- The proof must leave no durable quote, reservation, hold, attempt, expense,
-- charge, or settlement row. The verifier checks those counts after rollback.
