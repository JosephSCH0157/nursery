-- Controlled Stripe Test certification for the seven inactive OpenAI text adapters.
-- This lane is synthetic-only: it cannot authorize a real provider or create Live revenue.

begin;

create table tongs.openai_text_test_certification_batches (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  deposit_id uuid not null references tongs.customer_deposits(id) on delete restrict,
  invocation_token_hash text not null check (invocation_token_hash ~ '^[0-9a-f]{64}$'),
  maximum_operation_count integer not null check (maximum_operation_count=14),
  maximum_aggregate_charge_micros bigint not null check (maximum_aggregate_charge_micros>0),
  maximum_aggregate_failure_exposure_micros bigint not null check (maximum_aggregate_failure_exposure_micros>=0),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now()
);

create table tongs.openai_text_test_certification_batch_events (
  id uuid primary key,
  batch_id uuid not null references tongs.openai_text_test_certification_batches(id) on delete restrict,
  sequence integer not null check (sequence>0),
  event_type text not null check (event_type in ('opened','closed')),
  event_key text not null unique,
  actor_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  unique(batch_id,sequence)
);

create table tongs.openai_text_test_certification_terms (
  id uuid primary key,
  batch_id uuid not null references tongs.openai_text_test_certification_batches(id) on delete restrict,
  route_code text not null,
  revision integer not null check (revision=1),
  model text not null,
  maximum_input_units integer not null check (maximum_input_units>0),
  maximum_output_units integer not null check (maximum_output_units>0),
  maximum_attempts smallint not null check (maximum_attempts=1),
  input_micros_per_million_tokens bigint not null check (input_micros_per_million_tokens>=0),
  output_micros_per_million_tokens bigint not null check (output_micros_per_million_tokens>=0),
  direct_provider_ceiling_micros bigint not null check (direct_provider_ceiling_micros>=0),
  supporting_cost_ceiling_micros bigint not null check (supporting_cost_ceiling_micros>=0),
  full_cost_ceiling_micros bigint generated always as (direct_provider_ceiling_micros+supporting_cost_ceiling_micros) stored,
  failure_exposure_ceiling_micros bigint not null check (failure_exposure_ceiling_micros>=0 and failure_exposure_ceiling_micros<=direct_provider_ceiling_micros),
  markup_basis_points integer not null check (markup_basis_points=3300),
  customer_price_ceiling_micros bigint not null check (customer_price_ceiling_micros>0),
  customer_credit_units bigint not null check (customer_credit_units>0),
  rate_evidence_status text not null check (rate_evidence_status in ('synthetic_test','estimated')),
  supporting_cost_policy jsonb not null check (jsonb_typeof(supporting_cost_policy)='object'),
  created_at timestamptz not null default now(),
  unique(batch_id,route_code),
  check (route_code in ('hearth.research_synthesis','visual.unified_plan','visual.narrative_interpretation','motion.broll_interpretation','hammer.transcript_cleanup','shorts.discovery','quench.metadata')),
  check ((route_code in ('visual.unified_plan','visual.narrative_interpretation','motion.broll_interpretation') and model='gpt-5-mini')
      or (route_code in ('hearth.research_synthesis','hammer.transcript_cleanup','shorts.discovery','quench.metadata') and model='gpt-5.3'))
);

create table tongs.openai_text_test_certification_operations (
  id uuid primary key,
  batch_id uuid not null references tongs.openai_text_test_certification_batches(id) on delete restrict,
  term_id uuid not null references tongs.openai_text_test_certification_terms(id) on delete restrict,
  route_code text not null,
  scenario text not null check (scenario in ('success','provider_failure','validation_failure','persistence_failure')),
  operation_id text not null unique,
  workpiece_id text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  request_json jsonb not null check (jsonb_typeof(request_json)='object'),
  quote_hash text not null check (quote_hash ~ '^[0-9a-f]{64}$'),
  accepted_by uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  normal_maximum_charge_micros bigint not null check (normal_maximum_charge_micros>=0),
  billable_failure_maximum_charge_micros bigint not null check (billable_failure_maximum_charge_micros=0),
  reserved_credit_units bigint not null check (reserved_credit_units>=0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(batch_id,route_code,scenario)
);

create table tongs.openai_text_test_certification_reservations (
  id uuid primary key,
  operation_record_id uuid not null unique references tongs.openai_text_test_certification_operations(id) on delete restrict,
  batch_id uuid not null references tongs.openai_text_test_certification_batches(id) on delete restrict,
  deposit_id uuid not null references tongs.customer_deposits(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  operation_id text not null unique,
  reserved_customer_charge_micros bigint not null check (reserved_customer_charge_micros>=0),
  reserved_credit_units bigint not null check (reserved_credit_units>=0),
  idempotency_key text not null unique,
  execution_kind text not null check (execution_kind='simulated_test'),
  created_at timestamptz not null default now()
);

create table tongs.openai_text_test_certification_reservation_events (
  id uuid primary key,
  reservation_id uuid not null references tongs.openai_text_test_certification_reservations(id) on delete restrict,
  sequence integer not null check (sequence>0),
  event_type text not null check (event_type in ('reserved','attempt_started','submission_unknown','settled','released')),
  event_key text not null unique,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(reservation_id,sequence)
);

create table tongs.openai_text_test_certification_evidence (
  id uuid primary key,
  reservation_id uuid not null references tongs.openai_text_test_certification_reservations(id) on delete restrict,
  evidence_key text not null unique,
  evidence_kind text not null,
  evidence_json jsonb not null check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);

create table tongs.openai_text_test_certification_expenses (
  id uuid primary key,
  reservation_id uuid not null references tongs.openai_text_test_certification_reservations(id) on delete restrict,
  expense_key text not null unique,
  component_kind text not null check (component_kind in ('direct_provider','supporting')),
  amount_micros bigint,
  evidence_status text not null check (evidence_status in ('synthetic_test','unresolved')),
  evidence_json jsonb not null check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  check (amount_micros is null or amount_micros>=0)
);

create table tongs.openai_text_test_certification_results (
  id uuid primary key,
  reservation_id uuid not null unique references tongs.openai_text_test_certification_reservations(id) on delete restrict,
  operation_id text not null unique,
  route_code text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_request_id text,
  model text not null,
  input_units bigint not null check (input_units>=0),
  output_units bigint not null check (output_units>=0),
  result_hash text not null check (result_hash ~ '^[0-9a-f]{64}$'),
  result_json jsonb not null check (jsonb_typeof(result_json)='object'),
  persisted_at timestamptz not null default now()
);

create table tongs.openai_text_test_certification_settlements (
  id uuid primary key,
  reservation_id uuid not null unique references tongs.openai_text_test_certification_reservations(id) on delete restrict,
  settlement_key text not null unique,
  outcome text not null check (outcome in ('success','nonbillable_failure')),
  failure_class text,
  customer_charge_micros bigint not null check (customer_charge_micros>=0),
  customer_credit_units bigint not null check (customer_credit_units>=0),
  evidence_json jsonb not null check (jsonb_typeof(evidence_json)='object'),
  settled_at timestamptz not null default now(),
  check ((outcome='success' and failure_class is null) or (outcome='nonbillable_failure' and failure_class is not null and customer_charge_micros=0 and customer_credit_units=0))
);

create table tongs.openai_text_test_certification_consumptions (
  id uuid primary key,
  reservation_id uuid not null unique references tongs.openai_text_test_certification_reservations(id) on delete restrict,
  deposit_id uuid not null references tongs.customer_deposits(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  operation_id text not null unique,
  recognized_test_revenue_micros bigint not null check (recognized_test_revenue_micros>0),
  credit_units_consumed bigint not null check (credit_units_consumed>0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  consumed_at timestamptz not null default now()
);

do $$ declare v_table text; begin
  foreach v_table in array array[
    'openai_text_test_certification_batches','openai_text_test_certification_batch_events',
    'openai_text_test_certification_terms','openai_text_test_certification_operations',
    'openai_text_test_certification_reservations','openai_text_test_certification_reservation_events',
    'openai_text_test_certification_evidence','openai_text_test_certification_expenses',
    'openai_text_test_certification_results','openai_text_test_certification_settlements',
    'openai_text_test_certification_consumptions'
  ] loop
    execute format('alter table tongs.%I enable row level security',v_table);
    execute format('alter table tongs.%I force row level security',v_table);
    execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',v_table);
    execute format('grant select,insert on tongs.%I to service_role',v_table);
  end loop;
end $$;

create or replace function tongs._openai_text_test_certification_batch_state(p_batch_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select event_type from tongs.openai_text_test_certification_batch_events where batch_id=p_batch_id order by sequence desc limit 1),'missing')
$$;

create or replace function tongs._openai_text_test_certification_reservation_state(p_reservation_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select event_type from tongs.openai_text_test_certification_reservation_events where reservation_id=p_reservation_id order by sequence desc limit 1),'missing')
$$;

create or replace function tongs.open_openai_text_test_certification(
  p_batch_id uuid,p_actor_id uuid,p_user_id uuid,p_workspace_id uuid,p_deposit_id uuid,
  p_invocation_token_hash text,p_expires_at timestamptz,p_terms jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_term jsonb; v_count integer:=0; v_charge bigint:=0; v_loss bigint:=0; v_model text; v_route text; v_full bigint; v_price bigint; v_term_id uuid;
begin
  perform tongs._require_pricing_service_role();
  if not tongs.is_platform_operator(p_actor_id) or p_expires_at<=now() or p_expires_at>now()+interval '24 hours'
     or p_invocation_token_hash!~'^[0-9a-f]{64}$' or jsonb_typeof(p_terms)<>'array' or length(btrim(coalesce(p_reason,'')))<8 then
    raise exception 'invalid Test certification authorization' using errcode='22023';
  end if;
  if not exists(select 1 from tongs.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then
    raise exception 'customer owner membership required' using errcode='42501';
  end if;
  if not exists(select 1 from tongs.customer_deposits where id=p_deposit_id and user_id=p_user_id and stripe_mode='test') then
    raise exception 'eligible Stripe Test deposit required' using errcode='42501';
  end if;
  for v_term in select value from jsonb_array_elements(p_terms) loop
    v_count:=v_count+1; v_route:=btrim(v_term->>'route_code'); v_model:=btrim(v_term->>'model');
    if v_route not in ('hearth.research_synthesis','visual.unified_plan','visual.narrative_interpretation','motion.broll_interpretation','hammer.transcript_cleanup','shorts.discovery','quench.metadata')
       or ((v_route like 'visual.%' or v_route='motion.broll_interpretation') and v_model<>'gpt-5-mini')
       or (v_route not like 'visual.%' and v_route<>'motion.broll_interpretation' and v_model<>'gpt-5.3')
       or coalesce((v_term->>'markup_basis_points')::integer,-1)<>3300
       or coalesce((v_term->>'maximum_attempts')::integer,0)<>1
       or v_term->>'rate_evidence_status' not in ('synthetic_test','estimated')
       or coalesce(v_term->'supporting_cost_policy'->>'scope','')<>'validation_and_tongs_persistence_only'
       or coalesce((v_term->'supporting_cost_policy'->>'search_allowed')::boolean,true)
       or coalesce((v_term->'supporting_cost_policy'->>'external_enrichment_allowed')::boolean,true) then
      raise exception 'invalid or unbounded Test route term' using errcode='22023';
    end if;
    v_full:=(v_term->>'direct_provider_ceiling_micros')::bigint+(v_term->>'supporting_cost_ceiling_micros')::bigint;
    v_price:=tongs.round_customer_price_micros(v_full::numeric*13300/10000,'USD');
    if v_price<>(v_term->>'customer_price_ceiling_micros')::bigint or (v_term->>'customer_credit_units')::bigint<>v_price/10000 then
      raise exception 'Test price does not match 33 percent cost-plus rounding' using errcode='22023';
    end if;
    v_charge:=v_charge+v_price; v_loss:=v_loss+(v_term->>'failure_exposure_ceiling_micros')::bigint;
  end loop;
  if v_count<>7 or (select count(distinct value->>'route_code') from jsonb_array_elements(p_terms))<>7 then
    raise exception 'all seven unique routes are required' using errcode='22023';
  end if;
  insert into tongs.openai_text_test_certification_batches(id,user_id,workspace_id,deposit_id,invocation_token_hash,maximum_operation_count,
    maximum_aggregate_charge_micros,maximum_aggregate_failure_exposure_micros,expires_at,created_by,reason)
  values(p_batch_id,p_user_id,p_workspace_id,p_deposit_id,p_invocation_token_hash,14,v_charge,v_loss,p_expires_at,p_actor_id,btrim(p_reason));
  insert into tongs.openai_text_test_certification_batch_events(id,batch_id,sequence,event_type,event_key,actor_id,reason)
  values(gen_random_uuid(),p_batch_id,1,'opened','openai-text-test-certification:'||p_batch_id||':opened',p_actor_id,btrim(p_reason));
  for v_term in select value from jsonb_array_elements(p_terms) loop
    v_term_id:=gen_random_uuid();
    insert into tongs.openai_text_test_certification_terms(id,batch_id,route_code,revision,model,maximum_input_units,maximum_output_units,maximum_attempts,
      input_micros_per_million_tokens,output_micros_per_million_tokens,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
      failure_exposure_ceiling_micros,markup_basis_points,customer_price_ceiling_micros,customer_credit_units,rate_evidence_status,supporting_cost_policy)
    values(v_term_id,p_batch_id,v_term->>'route_code',1,v_term->>'model',(v_term->>'maximum_input_units')::integer,(v_term->>'maximum_output_units')::integer,1,
      (v_term->>'input_micros_per_million_tokens')::bigint,(v_term->>'output_micros_per_million_tokens')::bigint,
      (v_term->>'direct_provider_ceiling_micros')::bigint,(v_term->>'supporting_cost_ceiling_micros')::bigint,
      (v_term->>'failure_exposure_ceiling_micros')::bigint,3300,(v_term->>'customer_price_ceiling_micros')::bigint,
      (v_term->>'customer_credit_units')::bigint,v_term->>'rate_evidence_status',v_term->'supporting_cost_policy');
  end loop;
  return jsonb_build_object('batch_id',p_batch_id,'state','opened','operation_limit',14,'success_count',7,'failure_count',7,
    'maximum_aggregate_charge_micros',v_charge,'maximum_aggregate_failure_exposure_micros',v_loss,'real_provider_authorized',false);
end $$;

create or replace function tongs.prepare_openai_text_test_certification_operation(
  p_operation_record_id uuid,p_batch_id uuid,p_route_code text,p_scenario text,p_operation_id text,p_workpiece_id text,p_request_fingerprint text,p_request_json jsonb,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_batch tongs.openai_text_test_certification_batches%rowtype; v_term tongs.openai_text_test_certification_terms%rowtype; v_fingerprint text; v_hash text; v_charge bigint; v_units bigint;
begin
  perform tongs._require_pricing_service_role(); select * into v_batch from tongs.openai_text_test_certification_batches where id=p_batch_id;
  if not found or tongs._openai_text_test_certification_batch_state(p_batch_id)<>'opened' or v_batch.expires_at<=now() or not tongs.is_platform_operator(p_actor_id) then raise exception 'Test certification inactive' using errcode='42501'; end if;
  select * into v_term from tongs.openai_text_test_certification_terms where batch_id=p_batch_id and route_code=btrim(p_route_code);
  if not found or p_scenario not in ('success','provider_failure','validation_failure','persistence_failure') or jsonb_typeof(p_request_json)<>'object' then raise exception 'invalid Test operation' using errcode='22023'; end if;
  if p_request_fingerprint!~'^[0-9a-f]{64}$' then raise exception 'invalid Test request fingerprint' using errcode='22023'; end if;
  v_fingerprint:=p_request_fingerprint;
  v_charge:=case when p_scenario='success' then v_term.customer_price_ceiling_micros else 0 end;
  v_units:=case when p_scenario='success' then v_term.customer_credit_units else 0 end;
  v_hash:=encode(extensions.digest(concat_ws(':','forge.openai-text-test-certification.v1',p_operation_record_id,p_batch_id,p_route_code,p_scenario,p_operation_id,v_fingerprint,v_charge,'0'),'sha256'),'hex');
  insert into tongs.openai_text_test_certification_operations(id,batch_id,term_id,route_code,scenario,operation_id,workpiece_id,request_fingerprint,request_json,quote_hash,accepted_by,
    normal_maximum_charge_micros,billable_failure_maximum_charge_micros,reserved_credit_units,expires_at)
  values(p_operation_record_id,p_batch_id,v_term.id,p_route_code,p_scenario,btrim(p_operation_id),btrim(p_workpiece_id),v_fingerprint,p_request_json,v_hash,p_actor_id,v_charge,0,v_units,v_batch.expires_at);
  return jsonb_build_object('quote_id',p_operation_record_id,'operation_id',p_operation_id,'route_code',p_route_code,'scenario',p_scenario,'quote_hash',v_hash,
    'request_fingerprint',v_fingerprint,'normal_maximum_charge_micros',v_charge,'billable_failure_maximum_charge_micros',0,'customer_credit_units',v_units,
    'funding_source','stripe_test_deposit','acceptance_kind','platform_operator_test','accepted',true,'real_provider_authorized',false);
end $$;

create or replace function tongs.reserve_openai_text_test_certification_operation(p_reservation_id uuid,p_operation_record_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_op tongs.openai_text_test_certification_operations%rowtype; v_batch tongs.openai_text_test_certification_batches%rowtype; v_existing tongs.openai_text_test_certification_reservations%rowtype; v_balance bigint; v_holds bigint; v_count integer;
begin
  perform tongs._require_pricing_service_role(); select * into v_op from tongs.openai_text_test_certification_operations where id=p_operation_record_id;
  select * into v_batch from tongs.openai_text_test_certification_batches where id=v_op.batch_id for update;
  if v_op.id is null or v_batch.id is null or v_op.expires_at<=now() or tongs._openai_text_test_certification_batch_state(v_batch.id)<>'opened' then raise exception 'accepted Test quote required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('openai-text-test-certification:'||v_batch.id::text,0));
  select * into v_existing from tongs.openai_text_test_certification_reservations where operation_record_id=v_op.id;
  if found then return jsonb_build_object('reservation_id',v_existing.id,'state',tongs._openai_text_test_certification_reservation_state(v_existing.id),'replay',true,'real_provider_authorized',false); end if;
  if exists(select 1 from tongs.openai_text_test_certification_reservations r where r.batch_id=v_batch.id and tongs._openai_text_test_certification_reservation_state(r.id) in ('reserved','attempt_started','submission_unknown')) then raise exception 'Test certification concurrency limit reached' using errcode='P0001'; end if;
  select count(*) into v_count from tongs.openai_text_test_certification_reservations where batch_id=v_batch.id;
  if v_count>=v_batch.maximum_operation_count then raise exception 'Test operation limit reached' using errcode='42501'; end if;
  select coalesce(sum(quantity_delta),0) into v_balance from tongs.accounting_journal_entries where user_id=v_batch.user_id and account_code='test_customer_credits';
  select coalesce(sum(reserved_credit_units),0) into v_holds from tongs.openai_text_test_certification_reservations r where r.deposit_id=v_batch.deposit_id and tongs._openai_text_test_certification_reservation_state(r.id) in ('reserved','attempt_started','submission_unknown');
  if v_op.reserved_credit_units>v_balance-v_holds then raise exception 'insufficient Stripe Test balance' using errcode='P0001'; end if;
  insert into tongs.openai_text_test_certification_reservations(id,operation_record_id,batch_id,deposit_id,user_id,operation_id,reserved_customer_charge_micros,reserved_credit_units,idempotency_key,execution_kind)
  values(p_reservation_id,v_op.id,v_batch.id,v_batch.deposit_id,v_batch.user_id,v_op.operation_id,v_op.normal_maximum_charge_micros,v_op.reserved_credit_units,btrim(p_idempotency_key),'simulated_test');
  insert into tongs.openai_text_test_certification_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
  values(gen_random_uuid(),p_reservation_id,1,'reserved','openai-text-test-reservation:'||p_reservation_id||':reserved',jsonb_build_object('real_provider_authorized',false,'concurrency_limit',1));
  return jsonb_build_object('reservation_id',p_reservation_id,'state','reserved','replay',false,'execution_kind','simulated_test','real_provider_authorized',false);
end $$;

create or replace function tongs.read_openai_text_test_certification_invocation(p_batch_id uuid,p_operation_id text,p_reservation_id uuid,p_invocation_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_batch tongs.openai_text_test_certification_batches%rowtype; v_op tongs.openai_text_test_certification_operations%rowtype; v_res tongs.openai_text_test_certification_reservations%rowtype; v_term tongs.openai_text_test_certification_terms%rowtype;
begin
  perform tongs._require_pricing_service_role(); select * into v_batch from tongs.openai_text_test_certification_batches where id=p_batch_id;
  if not found or v_batch.expires_at<=now() or tongs._openai_text_test_certification_batch_state(v_batch.id)<>'opened'
     or encode(extensions.digest(convert_to(coalesce(p_invocation_token,''),'UTF8'),'sha256'),'hex')<>v_batch.invocation_token_hash then raise exception 'Test invocation denied' using errcode='42501'; end if;
  select * into v_res from tongs.openai_text_test_certification_reservations where id=p_reservation_id and batch_id=p_batch_id and operation_id=btrim(p_operation_id);
  select * into v_op from tongs.openai_text_test_certification_operations where id=v_res.operation_record_id; select * into v_term from tongs.openai_text_test_certification_terms where id=v_op.term_id;
  if v_res.id is null or v_op.id is null or v_term.id is null then raise exception 'Test reservation not found' using errcode='P0002'; end if;
  return jsonb_build_object('batch_id',v_batch.id,'user_id',v_batch.user_id,'workspace_id',v_batch.workspace_id,'deposit_id',v_batch.deposit_id,'operation_record_id',v_op.id,
    'operation_id',v_op.operation_id,'reservation_id',v_res.id,'route_code',v_op.route_code,'scenario',v_op.scenario,'workpiece_id',v_op.workpiece_id,
    'request_fingerprint',v_op.request_fingerprint,'request_json',v_op.request_json,'model',v_term.model,'real_provider_authorized',false);
end $$;

create or replace function tongs.resolve_openai_text_test_certification_context(p_route_code text,p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_res tongs.openai_text_test_certification_reservations%rowtype; v_op tongs.openai_text_test_certification_operations%rowtype; v_term tongs.openai_text_test_certification_terms%rowtype;
begin
  perform tongs._require_pricing_service_role(); select * into v_res from tongs.openai_text_test_certification_reservations where id=p_reservation_id;
  select * into v_op from tongs.openai_text_test_certification_operations where id=v_res.operation_record_id; select * into v_term from tongs.openai_text_test_certification_terms where id=v_op.term_id;
  if v_res.operation_id<>p_operation_id or v_res.user_id<>p_user_id or v_op.route_code<>p_route_code or v_op.workpiece_id<>p_workpiece_id or v_op.request_fingerprint<>p_request_fingerprint
     or not exists(select 1 from tongs.openai_text_test_certification_batches b where b.id=v_res.batch_id and b.workspace_id=p_workspace_id and tongs._openai_text_test_certification_batch_state(b.id)='opened') then
    raise exception 'Test execution context mismatch' using errcode='42501'; end if;
  return jsonb_build_object('operation_id',v_res.operation_id,'reservation_id',v_res.id,'quote_id',v_op.id,'route_code',v_op.route_code,
    'funding_source_type','customer_deposit','funding_source_id',v_res.deposit_id,'credential_funding','forge','model',v_term.model,
    'maximum_input_units',v_term.maximum_input_units,'maximum_output_units',v_term.maximum_output_units,'maximum_attempts',v_term.maximum_attempts,
    'maximum_failure_exposure_micros',v_term.failure_exposure_ceiling_micros,'direct_provider_ceiling_micros',v_term.direct_provider_ceiling_micros,
    'supporting_cost_ceiling_micros',v_term.supporting_cost_ceiling_micros,'input_micros_per_million_tokens',v_term.input_micros_per_million_tokens,
    'output_micros_per_million_tokens',v_term.output_micros_per_million_tokens,'reservation_state',tongs._openai_text_test_certification_reservation_state(v_res.id),
    'execution_kind','simulated_test','real_provider_authorized',false);
end $$;

create or replace function tongs.authorize_openai_text_test_certification_attempt(p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_failure_exposure_micros bigint,p_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_res tongs.openai_text_test_certification_reservations%rowtype; v_term tongs.openai_text_test_certification_terms%rowtype; v_seq integer;
begin
  perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('openai-text-test-attempt:'||p_reservation_id::text,0));
  if exists(select 1 from tongs.openai_text_test_certification_reservation_events where event_key=p_attempt_key) then return jsonb_build_object('provider_execution_authorized',true,'real_provider_authorized',false,'replay',true); end if;
  select * into v_res from tongs.openai_text_test_certification_reservations where id=p_reservation_id; select t.* into v_term from tongs.openai_text_test_certification_terms t join tongs.openai_text_test_certification_operations o on o.term_id=t.id where o.id=v_res.operation_record_id;
  if tongs._openai_text_test_certification_reservation_state(p_reservation_id)<>'reserved' or p_attempt_number<>1 or p_failure_exposure_micros>v_term.failure_exposure_ceiling_micros then raise exception 'Test attempt denied' using errcode='42501'; end if;
  insert into tongs.openai_text_test_certification_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
  values(gen_random_uuid(),p_reservation_id,2,'attempt_started',p_attempt_key,coalesce(p_evidence_json,'{}')||jsonb_build_object('real_provider_authorized',false));
  return jsonb_build_object('provider_execution_authorized',true,'real_provider_authorized',false,'replay',false);
end $$;

create or replace function tongs.record_openai_text_test_certification_evidence(p_reservation_id uuid,p_evidence_key text,p_evidence_kind text,p_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid;
begin perform tongs._require_pricing_service_role(); select id into v_id from tongs.openai_text_test_certification_evidence where evidence_key=p_evidence_key;
  if v_id is not null then return jsonb_build_object('evidence_id',v_id,'replay',true); end if; v_id:=gen_random_uuid();
  insert into tongs.openai_text_test_certification_evidence values(v_id,p_reservation_id,p_evidence_key,p_evidence_kind,coalesce(p_evidence_json,'{}'),now());
  return jsonb_build_object('evidence_id',v_id,'replay',false); end $$;

create or replace function tongs.record_openai_text_test_certification_expense(p_reservation_id uuid,p_expense_key text,p_component_kind text,p_amount_micros bigint,p_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid;
begin perform tongs._require_pricing_service_role(); select id into v_id from tongs.openai_text_test_certification_expenses where expense_key=p_expense_key;
  if v_id is not null then return jsonb_build_object('expense_id',v_id,'replay',true); end if; v_id:=gen_random_uuid();
  insert into tongs.openai_text_test_certification_expenses(id,reservation_id,expense_key,component_kind,amount_micros,evidence_status,evidence_json)
  values(v_id,p_reservation_id,p_expense_key,p_component_kind,p_amount_micros,case when p_amount_micros is null then 'unresolved' else 'synthetic_test' end,coalesce(p_evidence_json,'{}')||jsonb_build_object('live_expense',false));
  return jsonb_build_object('expense_id',v_id,'replay',false); end $$;

create or replace function tongs.record_openai_text_test_certification_capture(p_capture_id uuid,p_reservation_id uuid,p_capture_key text,p_provider_request_id text,p_attempt_number smallint,p_input_units bigint,p_output_units bigint,p_response_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin perform tongs._require_pricing_service_role();
  return tongs.record_openai_text_test_certification_evidence(p_reservation_id,p_capture_key,'provider_capture',coalesce(p_response_evidence_json,'{}')||jsonb_build_object('capture_id',p_capture_id,'provider_request_id',p_provider_request_id,'attempt_number',p_attempt_number,'input_units',p_input_units,'output_units',p_output_units,'simulated',true)); end $$;

create or replace function tongs.persist_openai_text_test_certification_result(p_result_id uuid,p_route_code text,p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text,p_provider_request_id text,p_model text,p_input_units bigint,p_output_units bigint,p_result_hash text,p_result_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_existing uuid; v_op tongs.openai_text_test_certification_operations%rowtype;
begin perform tongs._require_pricing_service_role(); select o.* into v_op from tongs.openai_text_test_certification_operations o join tongs.openai_text_test_certification_reservations r on r.operation_record_id=o.id where r.id=p_reservation_id and r.operation_id=p_operation_id and r.user_id=p_user_id;
  if not found or v_op.route_code<>p_route_code or v_op.workpiece_id<>p_workpiece_id or v_op.request_fingerprint<>p_request_fingerprint or not exists(select 1 from tongs.openai_text_test_certification_batches b where b.id=v_op.batch_id and b.workspace_id=p_workspace_id) then raise exception 'Test result context mismatch' using errcode='42501'; end if;
  if v_op.scenario='persistence_failure' then raise exception 'injected Test persistence failure' using errcode='P0001'; end if;
  select id into v_existing from tongs.openai_text_test_certification_results where reservation_id=p_reservation_id; if v_existing is not null then return jsonb_build_object('result_id',v_existing,'replay',true); end if;
  insert into tongs.openai_text_test_certification_results(id,reservation_id,operation_id,route_code,user_id,workspace_id,workpiece_id,request_fingerprint,provider_request_id,model,input_units,output_units,result_hash,result_json)
  values(p_result_id,p_reservation_id,p_operation_id,p_route_code,p_user_id,p_workspace_id,p_workpiece_id,p_request_fingerprint,p_provider_request_id,p_model,p_input_units,p_output_units,p_result_hash,p_result_json);
  return jsonb_build_object('result_id',p_result_id,'replay',false); end $$;

create or replace function tongs.read_openai_text_test_certification_result(p_route_code text,p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_request_fingerprint text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result tongs.openai_text_test_certification_results%rowtype; v_settlement tongs.openai_text_test_certification_settlements%rowtype;
begin perform tongs._require_pricing_service_role(); select * into v_result from tongs.openai_text_test_certification_results where route_code=p_route_code and operation_id=p_operation_id and reservation_id=p_reservation_id and user_id=p_user_id and request_fingerprint=p_request_fingerprint;
  if not found then raise exception 'Test result not found' using errcode='P0002'; end if; select * into v_settlement from tongs.openai_text_test_certification_settlements where reservation_id=p_reservation_id;
  return jsonb_build_object('provider_request_id',v_result.provider_request_id,'customer_charge_micros',coalesce(v_settlement.customer_charge_micros,0),'result_json',v_result.result_json); end $$;

create or replace function tongs.settle_openai_text_test_certification_operation(p_reservation_id uuid,p_settlement_id uuid,p_settlement_key text,p_outcome text,p_failure_class text,p_actual_fulfillment_cost_micros bigint,p_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_res tongs.openai_text_test_certification_reservations%rowtype; v_op tongs.openai_text_test_certification_operations%rowtype; v_existing tongs.openai_text_test_certification_settlements%rowtype; v_charge bigint; v_units bigint; v_event uuid;
begin perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('openai-text-test-settlement:'||p_reservation_id::text,0));
  select * into v_existing from tongs.openai_text_test_certification_settlements where reservation_id=p_reservation_id; if found then return jsonb_build_object('settlement_id',v_existing.id,'customer_charge_micros',v_existing.customer_charge_micros,'state',case when v_existing.outcome='success' then 'settled' else 'released' end,'replay',true); end if;
  select * into v_res from tongs.openai_text_test_certification_reservations where id=p_reservation_id; select * into v_op from tongs.openai_text_test_certification_operations where id=v_res.operation_record_id;
  if tongs._openai_text_test_certification_reservation_state(p_reservation_id)<>'attempt_started' or p_outcome not in ('success','nonbillable_failure') or (p_outcome='success' and v_op.scenario<>'success') or (p_outcome='success' and not exists(select 1 from tongs.openai_text_test_certification_results where reservation_id=p_reservation_id)) then raise exception 'invalid Test settlement' using errcode='P0001'; end if;
  v_charge:=case when p_outcome='success' then v_op.normal_maximum_charge_micros else 0 end; v_units:=case when p_outcome='success' then v_op.reserved_credit_units else 0 end;
  insert into tongs.openai_text_test_certification_settlements(id,reservation_id,settlement_key,outcome,failure_class,customer_charge_micros,customer_credit_units,evidence_json)
  values(p_settlement_id,p_reservation_id,p_settlement_key,p_outcome,case when p_outcome='success' then null else coalesce(nullif(p_failure_class,''),'forge_failure') end,v_charge,v_units,coalesce(p_evidence_json,'{}')||jsonb_build_object('execution_kind','simulated_test','live_revenue',false));
  if p_outcome='success' then
    v_event:=p_settlement_id; perform tongs._create_accounting_event(v_event,'openai-text-test-consumption:'||v_op.operation_id,'test_customer_deposit_consumed','test','simulated_forge_operation',v_op.operation_id,'USD',v_res.user_id,null,null,jsonb_build_object('route_code',v_op.route_code,'simulated',true,'recognized_test_revenue_micros',v_charge,'credit_units_consumed',v_units),now());
    insert into tongs.openai_text_test_certification_consumptions(id,reservation_id,deposit_id,user_id,operation_id,recognized_test_revenue_micros,credit_units_consumed,journal_event_id) values(v_event,p_reservation_id,v_res.deposit_id,v_res.user_id,v_op.operation_id,v_charge,v_units,v_event);
    insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,deposit_id,currency,amount_micros) values(v_event,1,'test_customer_prepaid_balance',v_res.user_id,v_res.deposit_id,'USD',v_charge),(v_event,2,'test_ai_consumption_revenue',v_res.user_id,v_res.deposit_id,'USD',-v_charge);
    insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,deposit_id,unit_kind,quantity_delta) values(v_event,3,'test_customer_credits',v_res.user_id,v_res.deposit_id,'forge_credit',-v_units); perform tongs._assert_accounting_event_balanced(v_event);
  end if;
  insert into tongs.openai_text_test_certification_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
  values(gen_random_uuid(),p_reservation_id,3,case when p_outcome='success' then 'settled' else 'released' end,'openai-text-test-settlement:'||p_settlement_id,coalesce(p_evidence_json,'{}'));
  return jsonb_build_object('settlement_id',p_settlement_id,'customer_charge_micros',v_charge,'state',case when p_outcome='success' then 'settled' else 'released' end,'replay',false); end $$;

create or replace function tongs.mark_openai_text_test_certification_unknown(p_reservation_id uuid,p_event_key text,p_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin perform tongs._require_pricing_service_role(); if exists(select 1 from tongs.openai_text_test_certification_reservation_events where event_key=p_event_key) then return jsonb_build_object('state','submission_unknown','replay',true); end if;
  if tongs._openai_text_test_certification_reservation_state(p_reservation_id)<>'attempt_started' then raise exception 'Test attempt required' using errcode='P0001'; end if;
  insert into tongs.openai_text_test_certification_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json) values(gen_random_uuid(),p_reservation_id,3,'submission_unknown',p_event_key,coalesce(p_evidence_json,'{}'));
  return jsonb_build_object('state','submission_unknown','reservation_retained',true,'automatic_resubmission_allowed',false,'replay',false); end $$;

create or replace function tongs.close_openai_text_test_certification(p_batch_id uuid,p_actor_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_seq integer; v_total integer; v_terminal integer;
begin perform tongs._require_pricing_service_role(); if not tongs.is_platform_operator(p_actor_id) then raise exception 'platform operator required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('openai-text-test-certification:'||p_batch_id::text,0)); if tongs._openai_text_test_certification_batch_state(p_batch_id)='closed' then return jsonb_build_object('batch_id',p_batch_id,'state','closed','replay',true); end if;
  select count(*) into v_total from tongs.openai_text_test_certification_reservations where batch_id=p_batch_id; select count(*) into v_terminal from tongs.openai_text_test_certification_reservations r where r.batch_id=p_batch_id and tongs._openai_text_test_certification_reservation_state(r.id) in ('settled','released');
  if v_total<>14 or v_terminal<>14 then raise exception 'all certification operations must be terminal before closure' using errcode='P0001'; end if;
  select coalesce(max(sequence),0)+1 into v_seq from tongs.openai_text_test_certification_batch_events where batch_id=p_batch_id;
  insert into tongs.openai_text_test_certification_batch_events values(gen_random_uuid(),p_batch_id,v_seq,'closed','openai-text-test-certification:'||p_batch_id||':closed',p_actor_id,btrim(p_reason),now());
  return jsonb_build_object('batch_id',p_batch_id,'state','closed','replay',false,'new_reservations_authorized',false,'reconciliation_preserved',true); end $$;

create or replace function tongs.read_openai_text_test_certification(p_batch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();
begin
  if coalesce(auth.role(),'')<>'service_role' and (v_actor is null or not tongs.is_platform_operator(v_actor)) then raise exception 'platform operator required' using errcode='42501'; end if;
  return jsonb_build_object('contract_version','forge.openai-text-test-certification.v1','environment','test','live_provider_authorized',false,
    'batches',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (select b.id,b.user_id,b.workspace_id,b.deposit_id,b.maximum_operation_count,b.maximum_aggregate_charge_micros,b.maximum_aggregate_failure_exposure_micros,b.expires_at,b.created_at,tongs._openai_text_test_certification_batch_state(b.id) status from tongs.openai_text_test_certification_batches b where p_batch_id is null or b.id=p_batch_id) x),
    'terms',(select coalesce(jsonb_agg(to_jsonb(t) order by t.route_code),'[]'::jsonb) from tongs.openai_text_test_certification_terms t where p_batch_id is null or t.batch_id=p_batch_id),
    'operations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.route_code,x.scenario),'[]'::jsonb) from (select o.id quote_id,o.batch_id,o.route_code,o.scenario,o.operation_id,o.workpiece_id,o.quote_hash,o.request_fingerprint,o.normal_maximum_charge_micros,o.accepted_by,r.id reservation_id,tongs._openai_text_test_certification_reservation_state(r.id) reservation_state,res.id result_id,s.id settlement_id,s.customer_charge_micros,s.failure_class,(select count(*) from tongs.openai_text_test_certification_evidence e where e.reservation_id=r.id and e.evidence_kind='provider_capture') provider_execution_count from tongs.openai_text_test_certification_operations o left join tongs.openai_text_test_certification_reservations r on r.operation_record_id=o.id left join tongs.openai_text_test_certification_results res on res.reservation_id=r.id left join tongs.openai_text_test_certification_settlements s on s.reservation_id=r.id where p_batch_id is null or o.batch_id=p_batch_id) x),
    'expenses',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]'::jsonb) from tongs.openai_text_test_certification_expenses e join tongs.openai_text_test_certification_reservations r on r.id=e.reservation_id where p_batch_id is null or r.batch_id=p_batch_id));
end $$;

alter function tongs.read_customer_test_billing(uuid) rename to _read_customer_test_billing_before_openai_text_certification;
create or replace function tongs.read_customer_test_billing(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_user uuid; v_base jsonb; v_receipts jsonb;
begin
  if coalesce(auth.role(),'')='service_role' then v_user:=p_user_id; else v_user:=auth.uid(); end if;
  if v_user is null or (coalesce(auth.role(),'')<>'service_role' and p_user_id is not null and p_user_id<>v_user) then raise exception 'customer required' using errcode='42501'; end if;
  v_base:=tongs._read_customer_test_billing_before_openai_text_certification(v_user);
  select coalesce(jsonb_agg(jsonb_build_object('operation_id',r.operation_id,'route_code',o.route_code,'customer_charge_micros',s.customer_charge_micros,'outcome',s.outcome,'failure_class',s.failure_class,'settled_at',s.settled_at,'execution_kind','simulated_test','certification',true) order by s.settled_at desc),'[]'::jsonb) into v_receipts
  from tongs.openai_text_test_certification_reservations r join tongs.openai_text_test_certification_operations o on o.id=r.operation_record_id join tongs.openai_text_test_certification_settlements s on s.reservation_id=r.id where r.user_id=v_user;
  return jsonb_set(v_base,'{receipts}',v_receipts||coalesce(v_base->'receipts','[]'::jsonb),true)||jsonb_build_object('contract_version','forge.customer-test-billing.v2');
end $$;

revoke all on function tongs._openai_text_test_certification_batch_state(uuid),tongs._openai_text_test_certification_reservation_state(uuid),
  tongs.open_openai_text_test_certification(uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb,text),tongs.prepare_openai_text_test_certification_operation(uuid,uuid,text,text,text,text,text,jsonb,uuid),
  tongs.reserve_openai_text_test_certification_operation(uuid,uuid,text),tongs.read_openai_text_test_certification_invocation(uuid,text,uuid,text),
  tongs.resolve_openai_text_test_certification_context(text,text,uuid,uuid,uuid,text,text),tongs.authorize_openai_text_test_certification_attempt(uuid,text,smallint,bigint,jsonb),
  tongs.record_openai_text_test_certification_evidence(uuid,text,text,jsonb),tongs.record_openai_text_test_certification_expense(uuid,text,text,bigint,jsonb),
  tongs.record_openai_text_test_certification_capture(uuid,uuid,text,text,smallint,bigint,bigint,jsonb),
  tongs.persist_openai_text_test_certification_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb),
  tongs.read_openai_text_test_certification_result(text,text,uuid,uuid,text),tongs.settle_openai_text_test_certification_operation(uuid,uuid,text,text,text,bigint,jsonb),
  tongs.mark_openai_text_test_certification_unknown(uuid,text,jsonb),tongs.close_openai_text_test_certification(uuid,uuid,text),tongs.read_openai_text_test_certification(uuid) from public,anon,authenticated;
grant execute on function tongs.open_openai_text_test_certification(uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb,text),tongs.prepare_openai_text_test_certification_operation(uuid,uuid,text,text,text,text,text,jsonb,uuid),
  tongs.reserve_openai_text_test_certification_operation(uuid,uuid,text),tongs.read_openai_text_test_certification_invocation(uuid,text,uuid,text),
  tongs.resolve_openai_text_test_certification_context(text,text,uuid,uuid,uuid,text,text),tongs.authorize_openai_text_test_certification_attempt(uuid,text,smallint,bigint,jsonb),
  tongs.record_openai_text_test_certification_evidence(uuid,text,text,jsonb),tongs.record_openai_text_test_certification_expense(uuid,text,text,bigint,jsonb),
  tongs.record_openai_text_test_certification_capture(uuid,uuid,text,text,smallint,bigint,bigint,jsonb),
  tongs.persist_openai_text_test_certification_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb),
  tongs.read_openai_text_test_certification_result(text,text,uuid,uuid,text),tongs.settle_openai_text_test_certification_operation(uuid,uuid,text,text,text,bigint,jsonb),
  tongs.mark_openai_text_test_certification_unknown(uuid,text,jsonb),tongs.close_openai_text_test_certification(uuid,uuid,text),tongs.read_openai_text_test_certification(uuid) to service_role;
revoke all on function tongs._read_customer_test_billing_before_openai_text_certification(uuid) from public,anon,authenticated;
grant execute on function tongs._read_customer_test_billing_before_openai_text_certification(uuid) to service_role;
revoke all on function tongs.read_customer_test_billing(uuid) from public,anon;
grant execute on function tongs.read_customer_test_billing(uuid) to authenticated,service_role;
grant execute on function tongs.read_openai_text_test_certification(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
