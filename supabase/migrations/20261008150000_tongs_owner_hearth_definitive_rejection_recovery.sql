-- Safely continue the approved owner compatibility batch after a provider
-- request is definitively rejected before billable generation. This release
-- neither publishes prices nor changes global execution rollout.
begin;

-- Compatibility operation count is a provider-submission limit, not a quote
-- preparation limit. A released operation that never reached an attempt may
-- be replaced with a fresh quote after its original quote expires.
create or replace function tongs.prepare_owner_hearth_operation(
 p_operation_authorization_id uuid,p_quote_id uuid,p_acceptance_id uuid,p_reservation_id uuid,
 p_owner_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_operation_id text,p_provider_model_id text,
 p_request_fingerprint text,p_serialized_body_sha256 text,p_serialized_bytes bigint,p_tokenizer_input_tokens bigint,
 p_protocol_overhead_tokens bigint,p_bounded_input_tokens bigint,p_maximum_output_tokens bigint,p_maximum_attempts smallint,
 p_estimator_revision text,p_tokenizer_revision text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare authz tongs.owner_hearth_authorizations%rowtype; latest tongs.owner_hearth_authorization_events%rowtype; term tongs.owner_hearth_model_terms%rowtype;
 cost tongs.openai_text_cost_policy_revisions%rowtype; price tongs.private_pricing_revisions%rowtype; existing tongs.owner_hearth_operation_authorizations%rowtype;
 count_ops bigint; active_ops bigint; consumed bigint; held bigint; quote_hash text; nextseq integer; session_expiry timestamptz;
 rollout tongs.openai_text_rollout_revisions%rowtype;
begin
 perform tongs._require_pricing_service_role();
 if p_request_fingerprint!~'^[0-9a-f]{64}$' or p_serialized_body_sha256!~'^[0-9a-f]{64}$'
    or p_serialized_bytes<=0 or p_bounded_input_tokens<>greatest(p_tokenizer_input_tokens+p_protocol_overhead_tokens,p_serialized_bytes)
    or p_maximum_attempts<>1 or p_expires_at<=now() or p_expires_at>now()+interval '24 hours' then
  raise exception 'invalid exact owner Hearth request evidence' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-prepare:'||p_owner_user_id::text,0));
 select * into existing from tongs.owner_hearth_operation_authorizations where operation_id=btrim(p_operation_id);
 if found then
  if existing.owner_user_id<>p_owner_user_id or existing.workspace_id<>p_workspace_id or existing.workpiece_id<>btrim(p_workpiece_id)
    or existing.provider_model_id<>btrim(p_provider_model_id) or existing.request_fingerprint<>p_request_fingerprint
    or existing.serialized_body_sha256<>p_serialized_body_sha256 then raise exception 'owner Hearth operation replay conflict' using errcode='23505'; end if;
  return jsonb_build_object('operation_id',existing.operation_id,'reservation_id',existing.reservation_id,
   'request_fingerprint',existing.request_fingerprint,'model',existing.provider_model_id,'replay',true);
 end if;
 select a.* into authz from tongs.owner_hearth_authorizations a
 join lateral(select * from tongs.owner_hearth_authorization_events e where e.authorization_id=a.id order by sequence desc limit 1) ev on true
 where a.owner_user_id=p_owner_user_id and a.workspace_id=p_workspace_id and ev.state in ('active','dormant')
   and (ev.expires_at is null or ev.expires_at>now())
 order by (a.authorization_kind='creator_session') desc,a.created_at desc limit 1 for update of a;
 if not found then raise exception 'owner Hearth authorization is not active' using errcode='42501'; end if;
 select * into latest from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 if authz.authorization_kind='creator_session' and latest.state='dormant' then
  session_expiry:=now()+make_interval(secs=>authz.duration_seconds);
  select coalesce(max(sequence),0)+1 into nextseq from tongs.owner_hearth_authorization_events where authorization_id=authz.id;
  insert into tongs.owner_hearth_authorization_events(id,authorization_id,sequence,event_key,state,started_at,expires_at,reason,evidence_json)
  values(gen_random_uuid(),authz.id,nextseq,'owner-hearth-session:'||authz.id::text||':activated','active',now(),session_expiry,
   'First accepted owner creator operation started the approved 24-hour session.','{"automatic_renewal":false}'::jsonb) returning * into latest;
 end if;
 if latest.state<>'active' or latest.expires_at<=now() then raise exception 'owner Hearth authorization is halted or expired' using errcode='42501'; end if;
 select * into term from tongs.owner_hearth_model_terms where authorization_id=authz.id and provider_model_id=btrim(p_provider_model_id);
 select * into cost from tongs.openai_text_cost_policy_revisions where id=term.cost_policy_revision_id;
 select * into price from tongs.private_pricing_revisions where id=term.pricing_revision_id;
 if term.authorization_id is null or cost.id is null or price.id is null or cost.maximum_input_units<p_bounded_input_tokens
    or cost.maximum_output_units<>p_maximum_output_tokens or cost.maximum_attempts<>p_maximum_attempts
    or price.markup_basis_points<>3300 or price.lifecycle_state<>'review_ready' then
  raise exception 'exact owner Hearth cost and pricing terms required' using errcode='P0001'; end if;
 select count(*) into count_ops from tongs.owner_hearth_operation_authorizations o
 where o.authorization_id=authz.id and (
   tongs._funding_reservation_state(o.reservation_id)<>'released'
   or exists(select 1 from tongs.openai_text_failure_exposure_holds h where h.reservation_id=o.reservation_id)
   or exists(select 1 from tongs.owner_hearth_compatibility_results r where r.operation_authorization_id=o.id)
 );
 if count_ops>=authz.maximum_operations then raise exception 'owner Hearth operation limit reached' using errcode='P0001'; end if;
 if authz.authorization_kind='compatibility_batch' and exists(
  select 1 from tongs.owner_hearth_operation_authorizations o
  where o.authorization_id=authz.id and o.provider_model_id=term.provider_model_id and (
    tongs._funding_reservation_state(o.reservation_id)<>'released'
    or exists(select 1 from tongs.openai_text_failure_exposure_holds h where h.reservation_id=o.reservation_id)
    or exists(select 1 from tongs.owner_hearth_compatibility_results r where r.operation_authorization_id=o.id)
  )
 ) then raise exception 'compatibility model already attempted' using errcode='P0001'; end if;
 select count(*) into active_ops from tongs.owner_hearth_operation_authorizations o where o.authorization_id=authz.id
  and tongs._funding_reservation_state(o.reservation_id) in ('reserved','provider_attempt_shadowed','submission_unknown');
 if active_ops>=authz.maximum_concurrency then raise exception 'owner Hearth concurrency limit reached' using errcode='P0001'; end if;
 select coalesce(sum(c.expense_amount_micros),0) into consumed from tongs.owner_operating_budget_consumptions c where c.budget_id=authz.budget_id;
 select coalesce(sum(r.reserved_wholesale_spend_micros),0) into held from tongs.funding_reservations r where r.funding_source_type='owner_budget' and r.funding_source_id=authz.budget_id
  and tongs._funding_reservation_state(r.id) not in ('settled','released');
 if consumed+held+cost.full_cost_ceiling_micros+3>authz.maximum_amount_micros then raise exception 'owner Hearth amount cap exhausted' using errcode='P0001'; end if;
 quote_hash:=encode(extensions.digest(convert_to(jsonb_build_object('quote_id',p_quote_id,'operation_id',btrim(p_operation_id),
  'owner_user_id',p_owner_user_id,'workspace_id',p_workspace_id,'workpiece_id',btrim(p_workpiece_id),'model',term.provider_model_id,
  'pricing_revision_id',price.id,'cost_policy_revision_id',cost.id,'request_fingerprint',p_request_fingerprint,
  'serialized_body_sha256',p_serialized_body_sha256,'full_cost_ceiling_micros',cost.full_cost_ceiling_micros,'customer_charge_micros',0,
  'expires_at',p_expires_at)::text,'utf8'),'sha256'),'hex');
 insert into tongs.customer_spending_quotes(id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
  normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,full_cost_ceiling_micros,
  billable_failure_classes,free_failure_classes,included_quantity,retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at)
 values(p_quote_id,p_owner_user_id,btrim(p_operation_id),'hearth.chat_completion',p_workspace_id,price.id,price.revision,'USD',0,0,0,cost.full_cost_ceiling_micros,
  '[]'::jsonb,'["provider_failure","forge_failure","forge_validation_failure","persistence_failure","unknown_fault"]'::jsonb,
  jsonb_build_object('input_tokens',cost.maximum_input_units,'output_tokens',cost.maximum_output_units,'attempts',1),
  jsonb_build_object('first_30_days','included','post_day_30','separate_owner_tail_allocation'),
  '[{"component":"openai_text","provider_label":"OpenAI","credential_source":"forge_owner_isolated"}]'::jsonb,
  p_request_fingerprint,quote_hash,p_expires_at);
 insert into tongs.customer_spending_quote_acceptances(id,quote_id,user_id,acceptance_key,accepted_quote_hash)
 values(p_acceptance_id,p_quote_id,p_owner_user_id,'owner-hearth:'||p_quote_id::text,quote_hash);
 insert into tongs.funding_reservations(id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,currency,
  reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,idempotency_key)
 values(p_reservation_id,p_quote_id,p_owner_user_id,btrim(p_operation_id),'owner_budget',authz.budget_id,'USD',0,0,cost.full_cost_ceiling_micros,
  'owner-hearth:'||p_reservation_id::text);
 insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
 values(gen_random_uuid(),p_reservation_id,1,'reserved','reservation:'||p_reservation_id::text||':reserved',
  jsonb_build_object('owner_hearth_authorization_id',authz.id,'customer_charge_micros',0,'provider_execution_authorized',false));
 select * into rollout from tongs._current_openai_text_rollout('hearth.chat_completion');
 insert into tongs.openai_text_funding_bindings(operation_id,route_code,reservation_id,credential_funding,model,pricing_revision_id,
  maximum_input_units,maximum_output_units,maximum_attempts,cost_policy_revision_id,rollout_revision)
 values(btrim(p_operation_id),'hearth.chat_completion',p_reservation_id,'forge',term.provider_model_id,price.id,cost.maximum_input_units,
  cost.maximum_output_units,1,cost.id,rollout.revision);
 insert into tongs.bounded_provider_quote_request_bindings(quote_id,route_code,operation_id,request_fingerprint,model,service_tier,
  pricing_revision_id,estimator_revision,tokenizer_revision,serialized_body_sha256,serialized_bytes,tokenizer_input_tokens,
  protocol_overhead_tokens,utf8_byte_token_upper_bound,bounded_input_tokens,maximum_output_tokens,maximum_attempts)
 values(p_quote_id,'hearth.chat_completion',btrim(p_operation_id),p_request_fingerprint,term.provider_model_id,'standard',price.id,
  btrim(p_estimator_revision),btrim(p_tokenizer_revision),p_serialized_body_sha256,p_serialized_bytes,p_tokenizer_input_tokens,
  p_protocol_overhead_tokens,p_serialized_bytes,p_bounded_input_tokens,p_maximum_output_tokens,p_maximum_attempts);
 insert into tongs.owner_hearth_operation_authorizations(id,authorization_id,operation_id,quote_id,reservation_id,owner_user_id,workspace_id,
  workpiece_id,provider_model_id,request_fingerprint,serialized_body_sha256,cost_policy_revision_id,pricing_revision_id,aggregate_policy_revision_id,expires_at)
 values(p_operation_authorization_id,authz.id,btrim(p_operation_id),p_quote_id,p_reservation_id,p_owner_user_id,p_workspace_id,btrim(p_workpiece_id),
  term.provider_model_id,p_request_fingerprint,p_serialized_body_sha256,cost.id,price.id,term.aggregate_policy_revision_id,p_expires_at);
 return jsonb_build_object('operation_id',btrim(p_operation_id),'reservation_id',p_reservation_id,'request_fingerprint',p_request_fingerprint,
  'model',term.provider_model_id,'authorization_kind',authz.authorization_kind,'customer_charge_micros',0,'replay',false);
end $$;

-- Quote expiry is enforced before any new provider attempt. Terminal results
-- remain replayable after expiry because they cannot cause another submission.
create or replace function tongs.resolve_owner_hearth_paid_execution_context(
 p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; authz tongs.owner_hearth_authorizations%rowtype; latest tongs.owner_hearth_authorization_events%rowtype;
 res tongs.funding_reservations%rowtype; cost tongs.openai_text_cost_policy_revisions%rowtype; rate tongs.openai_text_provider_rate_revisions%rowtype;
 reservation_state text;
begin
 perform tongs._require_pricing_service_role();
 select * into op from tongs.owner_hearth_operation_authorizations where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
 select * into authz from tongs.owner_hearth_authorizations where id=op.authorization_id;
 select * into latest from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 select * into res from tongs.funding_reservations where id=p_reservation_id;
 reservation_state:=tongs._funding_reservation_state(p_reservation_id);
 if op.id is null or authz.id is null or res.id is null or op.owner_user_id<>p_user_id or op.workspace_id<>p_workspace_id
   or op.workpiece_id<>btrim(p_workpiece_id) or op.request_fingerprint<>p_request_fingerprint or res.funding_source_id<>authz.budget_id
   or not exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=op.quote_id and user_id=p_user_id)
   then raise exception 'exact owner Hearth funding context required' using errcode='42501'; end if;
 if latest.state not in ('active','closed') or (latest.state='active' and latest.expires_at<=now()) then
  raise exception 'owner Hearth authorization halted' using errcode='42501'; end if;
 if reservation_state not in ('settled','released') and op.expires_at<=now() then
  raise exception 'owner Hearth accepted quote expired' using errcode='42501'; end if;
 select * into cost from tongs.openai_text_cost_policy_revisions where id=op.cost_policy_revision_id;
 select r.* into rate from tongs.openai_text_provider_rate_revisions r where r.id=nullif(cost.attempt_plan->0->>'rate_revision_id','')::uuid;
 if cost.id is null or rate.id is null or rate.provider_model_id<>op.provider_model_id or res.reserved_wholesale_spend_micros<>cost.full_cost_ceiling_micros then
  raise exception 'exact owner Hearth model cost revision required' using errcode='P0001'; end if;
 return jsonb_build_object('operation_id',op.operation_id,'reservation_id',op.reservation_id,'quote_id',op.quote_id,'route_code','hearth.chat_completion',
  'user_id',op.owner_user_id,'workspace_id',op.workspace_id,'workpiece_id',op.workpiece_id,'request_fingerprint',op.request_fingerprint,
  'funding_source_type','owner_budget','funding_source_id',authz.budget_id,'credential_funding','forge','model',op.provider_model_id,
  'maximum_input_units',cost.maximum_input_units,'maximum_output_units',cost.maximum_output_units,'maximum_attempts',1,
  'maximum_failure_exposure_micros',cost.full_cost_ceiling_micros+3,'direct_provider_ceiling_micros',cost.direct_provider_ceiling_micros,
  'supporting_cost_ceiling_micros',cost.supporting_cost_ceiling_micros,'full_cost_ceiling_micros',cost.full_cost_ceiling_micros,
  'input_micros_per_million_tokens',rate.input_micros_per_million_tokens,'cached_input_micros_per_million_tokens',rate.cached_input_micros_per_million_tokens,
  'output_micros_per_million_tokens',rate.output_micros_per_million_tokens,'cost_policy_revision_id',cost.id,'pricing_revision_id',op.pricing_revision_id,
  'owner_hearth_authorization_id',authz.id,'reservation_state',reservation_state);
end $$;

-- A provider response proving that generation was refused for lack of project
-- credit is definitive execution evidence, but not an authoritative billing
-- reconciliation. Release admission/failure headroom while preserving the
-- original unresolved expense record for later invoice reconciliation.
create or replace function tongs.release_owner_hearth_definitive_nonbillable_rejection(
 p_reservation_id uuid,p_event_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; authz tongs.owner_hearth_authorizations%rowtype;
 funding_latest tongs.funding_reservation_events%rowtype; provider_failure tongs.funding_reservation_events%rowtype;
 failure_hold tongs.openai_text_failure_exposure_holds%rowtype; failure_latest tongs.openai_text_failure_exposure_events%rowtype;
 aggregate_binding tongs.paid_operation_aggregate_bindings%rowtype; aggregate_latest tongs.restricted_beta_exposure_events%rowtype;
 detail jsonb:='{}'::jsonb; provider_code text; provider_type text; provider_status integer; nextseq integer;
 direct_expense_count bigint; nonzero_expense_count bigint; capture_count bigint;
begin
 perform tongs._require_pricing_service_role();
 if p_reservation_id is null or length(btrim(coalesce(p_event_key,'')))<8 then
  raise exception 'invalid definitive rejection release' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-definitive-rejection:'||p_reservation_id::text,0));
 select * into op from tongs.owner_hearth_operation_authorizations where reservation_id=p_reservation_id;
 select * into authz from tongs.owner_hearth_authorizations where id=op.authorization_id;
 if op.id is null or authz.authorization_kind<>'compatibility_batch' then
  raise exception 'owner compatibility operation required' using errcode='42501'; end if;
 select * into funding_latest from tongs.funding_reservation_events where reservation_id=p_reservation_id order by sequence desc limit 1;
 select * into provider_failure from tongs.funding_reservation_events
  where reservation_id=p_reservation_id and event_type='provider_failure_recorded' order by sequence desc limit 1;
 if funding_latest.event_type<>'settled' or coalesce(funding_latest.customer_charge_micros,0)<>0
    or coalesce(funding_latest.wholesale_spend_micros,0)<>0 or provider_failure.id is null
    or provider_failure.failure_class<>'provider_failure' then
  return jsonb_build_object('released',false,'reason','not_zero_charge_provider_rejection'); end if;
 provider_status:=case when (provider_failure.evidence_json->>'status')~'^[0-9]+$'
   then (provider_failure.evidence_json->>'status')::integer else null end;
 begin detail:=coalesce(nullif(provider_failure.evidence_json->>'detail',''),'{}')::jsonb;
 exception when others then detail:='{}'::jsonb; end;
 provider_code:=coalesce(detail#>>'{error,code}','');
 provider_type:=coalesce(detail#>>'{error,type}','');
 if provider_status<>429 or not (provider_code in ('credit_balance_exhausted','insufficient_quota')
   or provider_type in ('credit_balance_exhausted','insufficient_quota')) then
  return jsonb_build_object('released',false,'reason','provider_rejection_not_proven_nonbillable',
   'provider_status',provider_status,'provider_code',nullif(provider_code,'')); end if;
 select count(*),count(*) filter(where coalesce(amount_micros,0)>0) into direct_expense_count,nonzero_expense_count
 from tongs.supplier_expenses where reservation_id=p_reservation_id and provider='openai';
 select count(*) into capture_count from tongs.openai_text_usage_evidence where reservation_id=p_reservation_id;
 if nonzero_expense_count>0 or capture_count>0 then
  return jsonb_build_object('released',false,'reason','supplier_usage_or_nonzero_expense_exists'); end if;
 select * into failure_hold from tongs.openai_text_failure_exposure_holds where reservation_id=p_reservation_id order by created_at desc limit 1;
 if failure_hold.id is not null then
  select * into failure_latest from tongs.openai_text_failure_exposure_events where hold_id=failure_hold.id order by sequence desc limit 1;
  if failure_latest.event_type<>'success_released' then
   if failure_latest.event_type<>'failure_realized' or failure_latest.actual_supplier_cost_micros is not null then
    raise exception 'failure exposure is not eligible for definitive rejection correction' using errcode='P0001'; end if;
   select coalesce(max(sequence),0)+1 into nextseq from tongs.openai_text_failure_exposure_events where hold_id=failure_hold.id;
   insert into tongs.openai_text_failure_exposure_events(id,hold_id,sequence,event_key,event_type,actual_supplier_cost_micros,evidence_json)
   values(extensions.uuid_generate_v5(failure_hold.id,btrim(p_event_key)||':failure-release'),failure_hold.id,nextseq,
    btrim(p_event_key)||':failure-release','success_released',0,jsonb_build_object(
     'definitive_nonbillable_rejection',true,'provider_status',provider_status,'provider_code',coalesce(nullif(provider_code,''),provider_type),
     'provider_cost_reconciled_authoritative',false,'supplier_expense_evidence_preserved',direct_expense_count>0));
  end if;
 end if;
 select * into aggregate_binding from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if aggregate_binding.hold_id is not null then
  select * into aggregate_latest from tongs.restricted_beta_exposure_events where hold_id=aggregate_binding.hold_id order by sequence desc limit 1;
  if aggregate_latest.event_type<>'released' then
   select coalesce(max(sequence),0)+1 into nextseq from tongs.restricted_beta_exposure_events where hold_id=aggregate_binding.hold_id;
   insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,supplier_obligation_micros,
    customer_funding_delta_micros,forge_loss_delta_micros,remaining_exposure_micros,exposure_adjustment_micros,evidence_json)
   values(extensions.uuid_generate_v5(aggregate_binding.hold_id,btrim(p_event_key)||':aggregate-release'),aggregate_binding.hold_id,nextseq,
    btrim(p_event_key)||':aggregate-release','released',0,0,0,0,
    -(aggregate_binding.supplier_exposure_ceiling_micros+aggregate_binding.supporting_exposure_ceiling_micros),jsonb_build_object(
     'transmitted',true,'definitive_nonbillable_rejection',true,'provider_status',provider_status,
     'provider_code',coalesce(nullif(provider_code,''),provider_type),'provider_cost_reconciled_authoritative',false,
     'supplier_expense_evidence_preserved',direct_expense_count>0));
  end if;
 end if;
 return jsonb_build_object('released',true,'replay',failure_latest.event_type='success_released' and aggregate_latest.event_type='released',
  'provider_request_id',provider_failure.evidence_json->>'provider_reference','provider_status',provider_status,
  'provider_code',coalesce(nullif(provider_code,''),provider_type),'supplier_expense_evidence_status',
  case when direct_expense_count>0 then 'preserved_unresolved' else 'none' end,'provider_cost_reconciled_authoritative',false);
end $$;

-- Close a fully exercised but unsuccessful compatibility batch. No owner
-- creator session is created, and the compatibility budget cannot admit more
-- work after closure.
create or replace function tongs.close_owner_hearth_unsuccessful_compatibility_batch(
 p_authorization_id uuid,p_operator_user_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare authz tongs.owner_hearth_authorizations%rowtype; latest tongs.owner_hearth_authorization_events%rowtype;
 result_count bigint; passed_count bigint; seq integer; budget_revision integer; event_id uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' or not tongs.is_platform_operator(p_operator_user_id)
   or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'service-role operator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-close-unsuccessful:'||p_authorization_id::text,0));
 select * into authz from tongs.owner_hearth_authorizations where id=p_authorization_id;
 select * into latest from tongs.owner_hearth_authorization_events where authorization_id=p_authorization_id order by sequence desc limit 1;
 if authz.authorization_kind<>'compatibility_batch' then raise exception 'compatibility authorization required' using errcode='42501'; end if;
 if latest.state='closed' then return jsonb_build_object('authorization_id',authz.id,'state','closed','replay',true); end if;
 select count(*),count(*) filter(where r.status='passed') into result_count,passed_count
 from tongs.owner_hearth_compatibility_results r join tongs.owner_hearth_operation_authorizations o on o.id=r.operation_authorization_id
 where o.authorization_id=authz.id;
 if result_count<>5 or passed_count=5 or exists(
  select 1 from tongs.owner_hearth_compatibility_results r join tongs.owner_hearth_operation_authorizations o on o.id=r.operation_authorization_id
  where o.authorization_id=authz.id and r.status='ambiguous'
 ) then raise exception 'five terminal unsuccessful compatibility results required' using errcode='P0001'; end if;
 select coalesce(max(sequence),0)+1 into seq from tongs.owner_hearth_authorization_events where authorization_id=authz.id;
 insert into tongs.owner_hearth_authorization_events(id,authorization_id,sequence,event_key,state,reason,evidence_json)
 values(gen_random_uuid(),authz.id,seq,'owner-hearth-compat:'||authz.id::text||':closed-unsuccessful','closed',btrim(p_reason),
  jsonb_build_object('result_count',result_count,'passed_count',passed_count,'creator_session_created',false));
 select coalesce(max(revision),0)+1 into budget_revision from tongs.owner_operating_budget_revisions where budget_id=authz.budget_id;
 event_id:=extensions.uuid_generate_v5(authz.budget_id,'owner-hearth-compat-budget-closed-unsuccessful');
 perform tongs._create_accounting_event(event_id,'owner-hearth-compat-budget:'||authz.budget_id::text||':closed-unsuccessful',
  'owner_operating_budget_revised','owner_internal','owner_operating_budget',authz.budget_id::text,'USD',authz.owner_user_id,
  authz.workspace_id,p_operator_user_id,jsonb_build_object('status','closed','maximum_amount_micros',authz.maximum_amount_micros,
   'reason',btrim(p_reason),'customer_revenue_micros',0),now());
 insert into tongs.owner_operating_budget_revisions(budget_id,revision,status,maximum_amount_micros,reason,actor_id,journal_event_id)
 values(authz.budget_id,budget_revision,'closed',authz.maximum_amount_micros,btrim(p_reason),p_operator_user_id,event_id);
 return jsonb_build_object('authorization_id',authz.id,'state','closed','budget_id',authz.budget_id,'budget_state','closed',
  'creator_session_created',false,'result_count',result_count,'passed_count',passed_count,'replay',false);
end $$;

revoke all on function tongs.release_owner_hearth_definitive_nonbillable_rejection(uuid,text)
 from public,anon,authenticated;
grant execute on function tongs.release_owner_hearth_definitive_nonbillable_rejection(uuid,text)
 to service_role;
revoke all on function tongs.close_owner_hearth_unsuccessful_compatibility_batch(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function tongs.close_owner_hearth_unsuccessful_compatibility_batch(uuid,uuid,text)
 to service_role;

comment on function tongs.release_owner_hearth_definitive_nonbillable_rejection(uuid,text) is
 'Releases owner compatibility admission after a proven OpenAI credit-balance rejection without claiming authoritative cost reconciliation.';
comment on function tongs.close_owner_hearth_unsuccessful_compatibility_batch(uuid,uuid,text) is
 'Closes a fully exercised unsuccessful compatibility batch and its budget without creating a creator session.';

notify pgrst,'reload schema';
commit;
