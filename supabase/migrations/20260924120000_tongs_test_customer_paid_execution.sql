-- Isolated Stripe Test funding and simulated Hearth execution.
-- Test value can never authorize a live provider attempt or enter Live revenue.

begin;

create table tongs.test_paid_execution_authorizations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  deposit_id uuid not null references tongs.customer_deposits(id) on delete restrict,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  route_code text not null check (route_code = 'hearth.chat_completion'),
  model text not null check (model = 'gpt-5.6-luna'),
  maximum_operations integer not null check (maximum_operations between 1 and 10),
  maximum_aggregate_charge_micros bigint not null check (maximum_aggregate_charge_micros > 0),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table tongs.test_paid_execution_authorization_events (
  id uuid primary key,
  authorization_id uuid not null references tongs.test_paid_execution_authorizations(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_type text not null check (event_type in ('opened','closed')),
  event_key text not null unique,
  actor_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (authorization_id, sequence)
);

create table tongs.test_customer_spending_quotes (
  id uuid primary key,
  authorization_id uuid not null references tongs.test_paid_execution_authorizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  operation_id text not null unique,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  quote_hash text not null check (quote_hash ~ '^[0-9a-f]{64}$'),
  currency text not null check (currency = 'USD'),
  normal_maximum_charge_micros bigint not null check (normal_maximum_charge_micros = 20000),
  billable_failure_maximum_charge_micros bigint not null check (billable_failure_maximum_charge_micros = 0),
  customer_credit_units bigint not null check (customer_credit_units = 2),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table tongs.test_customer_spending_quote_acceptances (
  id uuid primary key,
  quote_id uuid not null unique references tongs.test_customer_spending_quotes(id) on delete restrict,
  acceptance_key text not null unique,
  quote_hash text not null check (quote_hash ~ '^[0-9a-f]{64}$'),
  accepted_by uuid not null references auth.users(id) on delete restrict,
  acceptance_kind text not null check (acceptance_kind in ('customer','platform_operator_test')),
  accepted_at timestamptz not null default now()
);

create table tongs.test_funding_reservations (
  id uuid primary key,
  quote_id uuid not null unique references tongs.test_customer_spending_quotes(id) on delete restrict,
  deposit_id uuid not null references tongs.customer_deposits(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  operation_id text not null unique,
  reserved_customer_charge_micros bigint not null check (reserved_customer_charge_micros = 20000),
  reserved_credit_units bigint not null check (reserved_credit_units = 2),
  idempotency_key text not null unique,
  execution_kind text not null check (execution_kind = 'simulated_test'),
  created_at timestamptz not null default now()
);

create table tongs.test_funding_reservation_events (
  id uuid primary key,
  reservation_id uuid not null references tongs.test_funding_reservations(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_type text not null check (event_type in ('reserved','attempt_started','submission_unknown','settled','released')),
  event_key text not null unique,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique (reservation_id, sequence)
);

create table tongs.test_paid_execution_evidence (
  id uuid primary key,
  reservation_id uuid not null references tongs.test_funding_reservations(id) on delete restrict,
  evidence_key text not null unique,
  evidence_kind text not null,
  evidence_json jsonb not null check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);

create table tongs.test_hearth_chat_paid_results (
  id uuid primary key,
  reservation_id uuid not null unique references tongs.test_funding_reservations(id) on delete restrict,
  operation_id text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_request_id text,
  model text not null check (model='gpt-5.6-luna'),
  input_units integer not null check (input_units >= 0),
  output_units integer not null check (output_units >= 0),
  result_hash text not null check (result_hash ~ '^[0-9a-f]{64}$'),
  result_json jsonb not null check (jsonb_typeof(result_json)='object'),
  persisted_at timestamptz not null default now()
);

create table tongs.test_customer_deposit_consumptions (
  id uuid primary key,
  reservation_id uuid not null unique references tongs.test_funding_reservations(id) on delete restrict,
  deposit_id uuid not null references tongs.customer_deposits(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  operation_id text not null unique,
  recognized_test_revenue_micros bigint not null check (recognized_test_revenue_micros > 0),
  credit_units_consumed bigint not null check (credit_units_consumed > 0),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  consumed_at timestamptz not null default now()
);

create table tongs.test_paid_execution_settlements (
  id uuid primary key,
  reservation_id uuid not null unique references tongs.test_funding_reservations(id) on delete restrict,
  settlement_key text not null unique,
  outcome text not null check (outcome in ('success','nonbillable_failure')),
  failure_class text,
  customer_charge_micros bigint not null check (customer_charge_micros >= 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  settled_at timestamptz not null default now(),
  check ((outcome='success' and customer_charge_micros=20000 and failure_class is null)
      or (outcome='nonbillable_failure' and customer_charge_micros=0 and failure_class is not null))
);

alter table tongs.test_paid_execution_authorizations enable row level security;
alter table tongs.test_paid_execution_authorization_events enable row level security;
alter table tongs.test_customer_spending_quotes enable row level security;
alter table tongs.test_customer_spending_quote_acceptances enable row level security;
alter table tongs.test_funding_reservations enable row level security;
alter table tongs.test_funding_reservation_events enable row level security;
alter table tongs.test_paid_execution_evidence enable row level security;
alter table tongs.test_hearth_chat_paid_results enable row level security;
alter table tongs.test_customer_deposit_consumptions enable row level security;
alter table tongs.test_paid_execution_settlements enable row level security;

create or replace function tongs._test_reservation_state(p_reservation_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select event_type from tongs.test_funding_reservation_events
    where reservation_id=p_reservation_id order by sequence desc limit 1),'missing')
$$;

create or replace function tongs._test_authorization_state(p_authorization_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select event_type from tongs.test_paid_execution_authorization_events
    where authorization_id=p_authorization_id order by sequence desc limit 1),'missing')
$$;

create or replace function tongs.open_hearth_test_execution_authorization(
  p_authorization_id uuid,p_actor_id uuid,p_user_id uuid,p_workspace_id uuid,p_deposit_id uuid,
  p_maximum_operations integer,p_maximum_aggregate_charge_micros bigint,p_expires_at timestamptz,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_pricing uuid;
begin
  perform tongs._require_pricing_service_role();
  if not tongs.is_platform_operator(p_actor_id) then raise exception 'platform operator required' using errcode='42501'; end if;
  if p_maximum_operations<1 or p_maximum_operations>10 or p_maximum_aggregate_charge_micros<>p_maximum_operations*20000
     or p_expires_at<=now() or length(btrim(coalesce(p_reason,'')))<8 then raise exception 'invalid Test authorization' using errcode='22023'; end if;
  if not exists(select 1 from tongs.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then
    raise exception 'workspace membership required' using errcode='42501'; end if;
  if not exists(select 1 from tongs.customer_deposits where id=p_deposit_id and user_id=p_user_id and stripe_mode='test') then
    raise exception 'eligible Stripe Test deposit required' using errcode='P0002'; end if;
  select id into v_pricing from tongs._published_pricing_revision('openai','gpt-5.6-luna')
    where markup_basis_points=3300 and full_cost_ceiling_micros=11015 and failure_cost_ceiling_micros=0
      and tongs.round_customer_price_micros(full_cost_ceiling_micros::numeric*(10000+markup_basis_points)/10000,currency)=20000;
  if v_pricing is null then raise exception 'published bounded Luna price required' using errcode='P0002'; end if;
  insert into tongs.test_paid_execution_authorizations(id,user_id,workspace_id,deposit_id,pricing_revision_id,route_code,model,
    maximum_operations,maximum_aggregate_charge_micros,expires_at,created_by)
  values(p_authorization_id,p_user_id,p_workspace_id,p_deposit_id,v_pricing,'hearth.chat_completion','gpt-5.6-luna',
    p_maximum_operations,p_maximum_aggregate_charge_micros,p_expires_at,p_actor_id);
  insert into tongs.test_paid_execution_authorization_events(id,authorization_id,sequence,event_type,event_key,actor_id,reason)
  values(gen_random_uuid(),p_authorization_id,1,'opened','test-authorization:'||p_authorization_id||':opened',p_actor_id,btrim(p_reason));
  return jsonb_build_object('authorization_id',p_authorization_id,'state','opened','execution_kind','simulated_test');
end $$;

create or replace function tongs.close_hearth_test_execution_authorization(
  p_authorization_id uuid,p_actor_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_seq integer; v_state text;
begin
  perform tongs._require_pricing_service_role();
  if not tongs.is_platform_operator(p_actor_id) then raise exception 'platform operator required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('test-authorization:'||p_authorization_id::text,0));
  v_state:=tongs._test_authorization_state(p_authorization_id);
  if v_state='closed' then return jsonb_build_object('authorization_id',p_authorization_id,'state','closed','replay',true); end if;
  if v_state<>'opened' then raise exception 'Test authorization not open' using errcode='P0002'; end if;
  select coalesce(max(sequence),0)+1 into v_seq from tongs.test_paid_execution_authorization_events where authorization_id=p_authorization_id;
  insert into tongs.test_paid_execution_authorization_events(id,authorization_id,sequence,event_type,event_key,actor_id,reason)
  values(gen_random_uuid(),p_authorization_id,v_seq,'closed','test-authorization:'||p_authorization_id||':closed',p_actor_id,btrim(p_reason));
  return jsonb_build_object('authorization_id',p_authorization_id,'state','closed','replay',false);
end $$;

create or replace function tongs.create_hearth_chat_test_quote(
  p_quote_id uuid,p_authorization_id uuid,p_operation_id text,p_request_fingerprint text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_auth tongs.test_paid_execution_authorizations%rowtype; v_existing tongs.test_customer_spending_quotes%rowtype; v_hash text; v_count integer;
begin
  perform tongs._require_pricing_service_role();
  select * into v_auth from tongs.test_paid_execution_authorizations where id=p_authorization_id;
  if not found or tongs._test_authorization_state(p_authorization_id)<>'opened' or v_auth.expires_at<=now() then raise exception 'Test authorization inactive' using errcode='42501'; end if;
  select * into v_existing from tongs.test_customer_spending_quotes where operation_id=btrim(p_operation_id);
  if found then return jsonb_build_object('quote_id',v_existing.id,'operation_id',v_existing.operation_id,'quote_hash',v_existing.quote_hash,
    'request_fingerprint',v_existing.request_fingerprint,'normal_maximum_charge_micros',20000,'billable_failure_maximum_charge_micros',0,
    'customer_credit_units',2,'currency','USD','expires_at',v_existing.expires_at,'funding',jsonb_build_object('eligible',true,'funding_source','test_customer_deposit','customer_label','Stripe Test AI credits'),'replay',true); end if;
  select count(*) into v_count from tongs.test_customer_spending_quotes where authorization_id=p_authorization_id;
  if v_count>=v_auth.maximum_operations or (v_count+1)*20000>v_auth.maximum_aggregate_charge_micros then raise exception 'Test operation limit reached' using errcode='42501'; end if;
  if p_expires_at<=now() or p_expires_at>v_auth.expires_at or p_request_fingerprint!~'^[0-9a-f]{64}$' then raise exception 'invalid Test quote' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(concat_ws(':','forge.hearth.test-quote.v1',p_quote_id,p_authorization_id,btrim(p_operation_id),p_request_fingerprint,'20000','0','2'),'sha256'),'hex');
  insert into tongs.test_customer_spending_quotes(id,authorization_id,user_id,workspace_id,operation_id,request_fingerprint,quote_hash,
    currency,normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,expires_at)
  values(p_quote_id,p_authorization_id,v_auth.user_id,v_auth.workspace_id,btrim(p_operation_id),p_request_fingerprint,v_hash,'USD',20000,0,2,p_expires_at);
  return jsonb_build_object('quote_id',p_quote_id,'operation_id',btrim(p_operation_id),'quote_hash',v_hash,'request_fingerprint',p_request_fingerprint,
    'normal_maximum_charge_micros',20000,'billable_failure_maximum_charge_micros',0,'customer_credit_units',2,'currency','USD','expires_at',p_expires_at,
    'failure_terms','Forge/provider failure costs $0; simulated Test funding is restored.','execution_kind','simulated_test',
    'funding',jsonb_build_object('eligible',true,'funding_source','test_customer_deposit','customer_label','Stripe Test AI credits'),'replay',false);
end $$;

create or replace function tongs.accept_hearth_chat_test_quote(
  p_acceptance_id uuid,p_quote_id uuid,p_acceptance_key text,p_quote_hash text,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_quote tongs.test_customer_spending_quotes%rowtype; v_existing tongs.test_customer_spending_quote_acceptances%rowtype; v_kind text;
begin
  select * into v_quote from tongs.test_customer_spending_quotes where id=p_quote_id;
  if not found or v_quote.expires_at<=now() or v_quote.quote_hash<>p_quote_hash then raise exception 'invalid or expired Test quote' using errcode='P0001'; end if;
  if coalesce(auth.role(),'')='service_role' then
    if not tongs.is_platform_operator(p_actor_id) then raise exception 'platform operator required' using errcode='42501'; end if;
    v_kind:='platform_operator_test';
  else
    if auth.uid() is distinct from v_quote.user_id or p_actor_id is distinct from auth.uid() then raise exception 'customer required' using errcode='42501'; end if;
    v_kind:='customer';
  end if;
  select * into v_existing from tongs.test_customer_spending_quote_acceptances where quote_id=p_quote_id;
  if found then return jsonb_build_object('acceptance_id',v_existing.id,'replay',true); end if;
  insert into tongs.test_customer_spending_quote_acceptances(id,quote_id,acceptance_key,quote_hash,accepted_by,acceptance_kind)
  values(p_acceptance_id,p_quote_id,btrim(p_acceptance_key),p_quote_hash,p_actor_id,v_kind);
  return jsonb_build_object('acceptance_id',p_acceptance_id,'replay',false,'acceptance_kind',v_kind);
end $$;

create or replace function tongs.reserve_hearth_chat_test_quote(
  p_reservation_id uuid,p_quote_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_quote tongs.test_customer_spending_quotes%rowtype; v_auth tongs.test_paid_execution_authorizations%rowtype; v_dep tongs.customer_deposits%rowtype;
 v_existing tongs.test_funding_reservations%rowtype; v_used_units bigint; v_used_micros bigint; v_refund_units bigint; v_refund_micros bigint; v_hold_units bigint; v_hold_micros bigint;
begin
  perform tongs._require_pricing_service_role();
  select * into v_quote from tongs.test_customer_spending_quotes where id=p_quote_id;
  if not found or v_quote.expires_at<=now() or not exists(select 1 from tongs.test_customer_spending_quote_acceptances where quote_id=p_quote_id) then raise exception 'accepted Test quote required' using errcode='P0001'; end if;
  select * into v_auth from tongs.test_paid_execution_authorizations where id=v_quote.authorization_id for update;
  if tongs._test_authorization_state(v_auth.id)<>'opened' or v_auth.expires_at<=now() then raise exception 'Test authorization inactive' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('test-deposit:'||v_auth.deposit_id::text,0));
  select * into v_existing from tongs.test_funding_reservations where quote_id=p_quote_id;
  if found then return jsonb_build_object('reservation_id',v_existing.id,'state',tongs._test_reservation_state(v_existing.id),'execution_kind','simulated_test','replay',true); end if;
  select * into v_dep from tongs.customer_deposits where id=v_auth.deposit_id for update;
  if not found or v_dep.stripe_mode<>'test' or v_dep.user_id<>v_quote.user_id then raise exception 'Stripe Test deposit required' using errcode='42501'; end if;
  select coalesce(sum(credit_units_consumed),0),coalesce(sum(recognized_test_revenue_micros),0) into v_used_units,v_used_micros from tongs.test_customer_deposit_consumptions where deposit_id=v_dep.id;
  select coalesce(sum(refunded_credit_units),0),coalesce(sum(liability_release_micros),0) into v_refund_units,v_refund_micros from tongs.customer_deposit_refunds where deposit_id=v_dep.id;
  select coalesce(sum(r.reserved_credit_units),0),coalesce(sum(r.reserved_customer_charge_micros),0) into v_hold_units,v_hold_micros
    from tongs.test_funding_reservations r where r.deposit_id=v_dep.id and tongs._test_reservation_state(r.id) in ('reserved','attempt_started','submission_unknown');
  if 2>v_dep.credit_units-v_used_units-v_refund_units-v_hold_units or 20000>v_dep.gross_amount_micros-v_used_micros-v_refund_micros-v_hold_micros then raise exception 'insufficient Stripe Test balance' using errcode='P0001'; end if;
  insert into tongs.test_funding_reservations(id,quote_id,deposit_id,user_id,operation_id,reserved_customer_charge_micros,reserved_credit_units,idempotency_key,execution_kind)
  values(p_reservation_id,p_quote_id,v_dep.id,v_quote.user_id,v_quote.operation_id,20000,2,btrim(p_idempotency_key),'simulated_test');
  insert into tongs.test_funding_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
  values(gen_random_uuid(),p_reservation_id,1,'reserved','test-reservation:'||p_reservation_id||':reserved',jsonb_build_object('provider_execution_kind','simulated_test','real_provider_authorized',false));
  return jsonb_build_object('reservation_id',p_reservation_id,'state','reserved','funding_source','test_customer_deposit','execution_kind','simulated_test','real_provider_authorized',false,'replay',false);
end $$;

create or replace function tongs.resolve_hearth_chat_test_execution_context(
  p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_res tongs.test_funding_reservations%rowtype; v_quote tongs.test_customer_spending_quotes%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_res from tongs.test_funding_reservations where id=p_reservation_id;
  select * into v_quote from tongs.test_customer_spending_quotes where id=v_res.quote_id;
  if v_res.operation_id<>p_operation_id or v_res.user_id<>p_user_id or v_quote.workspace_id<>p_workspace_id or v_quote.request_fingerprint<>p_request_fingerprint then raise exception 'Test execution context mismatch' using errcode='42501'; end if;
  return jsonb_build_object('operation_id',v_res.operation_id,'reservation_id',v_res.id,'quote_id',v_quote.id,'funding_source_type','customer_deposit','funding_source_id',v_res.deposit_id,
    'credential_funding','forge','model','gpt-5.6-luna','maximum_input_units',2000,'maximum_output_units',512,'maximum_attempts',1,
    'maximum_failure_exposure_micros',0,'direct_provider_ceiling_micros',1015,'supporting_cost_ceiling_micros',10000,
    'input_micros_per_million_tokens',200000,'output_micros_per_million_tokens',1200000,'reservation_state',tongs._test_reservation_state(v_res.id),
    'execution_kind','simulated_test','real_provider_authorized',false);
end $$;

create or replace function tongs.authorize_hearth_chat_test_attempt(p_reservation_id uuid,p_attempt_key text,p_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_state text; v_seq integer;
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended('test-attempt:'||p_reservation_id::text,0));
  if exists(select 1 from tongs.test_funding_reservation_events where event_key=btrim(p_attempt_key)) then return jsonb_build_object('provider_execution_authorized',true,'execution_kind','simulated_test','real_provider_authorized',false,'replay',true); end if;
  v_state:=tongs._test_reservation_state(p_reservation_id);
  if v_state<>'reserved' then raise exception 'Test reservation not attemptable' using errcode='P0001'; end if;
  select coalesce(max(sequence),0)+1 into v_seq from tongs.test_funding_reservation_events where reservation_id=p_reservation_id;
  insert into tongs.test_funding_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
  values(gen_random_uuid(),p_reservation_id,v_seq,'attempt_started',btrim(p_attempt_key),coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object('execution_kind','simulated_test','real_provider_authorized',false));
  return jsonb_build_object('provider_execution_authorized',true,'execution_kind','simulated_test','real_provider_authorized',false,'replay',false);
end $$;

create or replace function tongs.record_hearth_chat_test_evidence(p_reservation_id uuid,p_evidence_key text,p_evidence_kind text,p_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_existing uuid;
begin
  perform tongs._require_pricing_service_role();
  select id into v_existing from tongs.test_paid_execution_evidence where evidence_key=btrim(p_evidence_key);
  if v_existing is not null then return jsonb_build_object('evidence_id',v_existing,'replay',true); end if;
  v_existing:=gen_random_uuid();
  insert into tongs.test_paid_execution_evidence(id,reservation_id,evidence_key,evidence_kind,evidence_json)
  values(v_existing,p_reservation_id,btrim(p_evidence_key),btrim(p_evidence_kind),coalesce(p_evidence_json,'{}'::jsonb));
  return jsonb_build_object('evidence_id',v_existing,'replay',false);
end $$;

create or replace function tongs.persist_hearth_chat_test_result(
  p_result_id uuid,p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text,
  p_provider_request_id text,p_model text,p_input_units integer,p_output_units integer,p_result_hash text,p_result_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_existing tongs.test_hearth_chat_paid_results%rowtype; v_res tongs.test_funding_reservations%rowtype; v_quote tongs.test_customer_spending_quotes%rowtype;
begin
  perform tongs._require_pricing_service_role(); select * into v_res from tongs.test_funding_reservations where id=p_reservation_id; select * into v_quote from tongs.test_customer_spending_quotes where id=v_res.quote_id;
  if v_res.operation_id<>p_operation_id or v_res.user_id<>p_user_id or v_quote.workspace_id<>p_workspace_id or v_quote.request_fingerprint<>p_request_fingerprint or p_model<>'gpt-5.6-luna' then raise exception 'Test result context mismatch' using errcode='42501'; end if;
  select * into v_existing from tongs.test_hearth_chat_paid_results where reservation_id=p_reservation_id;
  if found then return jsonb_build_object('result_id',v_existing.id,'replay',true); end if;
  insert into tongs.test_hearth_chat_paid_results(id,reservation_id,operation_id,user_id,workspace_id,workpiece_id,request_fingerprint,provider_request_id,model,input_units,output_units,result_hash,result_json)
  values(p_result_id,p_reservation_id,p_operation_id,p_user_id,p_workspace_id,p_workpiece_id,p_request_fingerprint,p_provider_request_id,p_model,p_input_units,p_output_units,p_result_hash,p_result_json);
  return jsonb_build_object('result_id',p_result_id,'replay',false);
end $$;

create or replace function tongs.settle_hearth_chat_test_operation(
  p_reservation_id uuid,p_settlement_id uuid,p_settlement_key text,p_outcome text,p_failure_class text,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_res tongs.test_funding_reservations%rowtype; v_existing tongs.test_paid_execution_settlements%rowtype; v_seq integer; v_charge bigint; v_payload jsonb;
begin
  perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('test-settlement:'||p_reservation_id::text,0));
  select * into v_existing from tongs.test_paid_execution_settlements where reservation_id=p_reservation_id;
  if found then return jsonb_build_object('settlement_id',v_existing.id,'customer_charge_micros',v_existing.customer_charge_micros,'replay',true,'state',case when v_existing.outcome='success' then 'settled' else 'released' end); end if;
  select * into v_res from tongs.test_funding_reservations where id=p_reservation_id for update;
  if not found or tongs._test_reservation_state(p_reservation_id)<>'attempt_started' or p_outcome not in ('success','nonbillable_failure') then raise exception 'invalid Test settlement' using errcode='P0001'; end if;
  if p_outcome='success' and not exists(select 1 from tongs.test_hearth_chat_paid_results where reservation_id=p_reservation_id) then raise exception 'canonical Test result required' using errcode='P0001'; end if;
  v_charge:=case when p_outcome='success' then 20000 else 0 end;
  insert into tongs.test_paid_execution_settlements(id,reservation_id,settlement_key,outcome,failure_class,customer_charge_micros,evidence_json)
  values(p_settlement_id,p_reservation_id,btrim(p_settlement_key),p_outcome,case when p_outcome='success' then null else coalesce(nullif(btrim(p_failure_class),''),'provider_failure') end,v_charge,coalesce(p_evidence_json,'{}'::jsonb));
  if p_outcome='success' then
    v_payload:=jsonb_build_object('reservation_id',p_reservation_id,'operation_id',v_res.operation_id,'recognized_test_revenue_micros',20000,'credit_units_consumed',2,'simulated',true);
    perform tongs._create_accounting_event(p_settlement_id,'test-deposit-consumption:'||v_res.operation_id,'test_customer_deposit_consumed','test','simulated_forge_operation',v_res.operation_id,'USD',v_res.user_id,null,null,v_payload,now());
    insert into tongs.test_customer_deposit_consumptions(id,reservation_id,deposit_id,user_id,operation_id,recognized_test_revenue_micros,credit_units_consumed,journal_event_id)
    values(p_settlement_id,p_reservation_id,v_res.deposit_id,v_res.user_id,v_res.operation_id,20000,2,p_settlement_id);
    insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,deposit_id,currency,amount_micros) values
      (p_settlement_id,1,'test_customer_prepaid_balance',v_res.user_id,v_res.deposit_id,'USD',20000),
      (p_settlement_id,2,'test_ai_consumption_revenue',v_res.user_id,v_res.deposit_id,'USD',-20000);
    insert into tongs.accounting_journal_entries(event_id,line_number,account_code,user_id,deposit_id,unit_kind,quantity_delta)
      values(p_settlement_id,3,'test_customer_credits',v_res.user_id,v_res.deposit_id,'forge_credit',-2);
    perform tongs._assert_accounting_event_balanced(p_settlement_id);
  end if;
  select coalesce(max(sequence),0)+1 into v_seq from tongs.test_funding_reservation_events where reservation_id=p_reservation_id;
  insert into tongs.test_funding_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
  values(gen_random_uuid(),p_reservation_id,v_seq,case when p_outcome='success' then 'settled' else 'released' end,'test-settlement:'||p_settlement_id,coalesce(p_evidence_json,'{}'::jsonb));
  return jsonb_build_object('settlement_id',p_settlement_id,'customer_charge_micros',v_charge,'replay',false,'state',case when p_outcome='success' then 'settled' else 'released' end);
end $$;

create or replace function tongs.mark_hearth_chat_test_submission_unknown(p_reservation_id uuid,p_event_key text,p_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_seq integer;
begin
  perform tongs._require_pricing_service_role();
  if exists(select 1 from tongs.test_funding_reservation_events where event_key=btrim(p_event_key)) then return jsonb_build_object('state','submission_unknown','replay',true); end if;
  if tongs._test_reservation_state(p_reservation_id)<>'attempt_started' then raise exception 'Test attempt required' using errcode='P0001'; end if;
  select coalesce(max(sequence),0)+1 into v_seq from tongs.test_funding_reservation_events where reservation_id=p_reservation_id;
  insert into tongs.test_funding_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
  values(gen_random_uuid(),p_reservation_id,v_seq,'submission_unknown',btrim(p_event_key),coalesce(p_evidence_json,'{}'::jsonb));
  return jsonb_build_object('state','submission_unknown','replay',false,'reservation_retained',true,'automatic_resubmission_allowed',false);
end $$;

create or replace function tongs.read_hearth_chat_test_result(p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_request_fingerprint text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result tongs.test_hearth_chat_paid_results%rowtype; v_settlement tongs.test_paid_execution_settlements%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into v_result from tongs.test_hearth_chat_paid_results where operation_id=p_operation_id and reservation_id=p_reservation_id and user_id=p_user_id and request_fingerprint=p_request_fingerprint;
  if not found then raise exception 'Test result not found' using errcode='P0002'; end if;
  select * into v_settlement from tongs.test_paid_execution_settlements where reservation_id=p_reservation_id;
  return jsonb_build_object('provider_request_id',v_result.provider_request_id,'input_units',v_result.input_units,'output_units',v_result.output_units,
    'customer_charge_micros',coalesce(v_settlement.customer_charge_micros,0),'result_json',v_result.result_json);
end $$;

create or replace function tongs.read_customer_test_billing(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_user uuid; v_balance bigint;
begin
  if coalesce(auth.role(),'')='service_role' then v_user:=p_user_id; else v_user:=auth.uid(); end if;
  if v_user is null or (coalesce(auth.role(),'')<>'service_role' and p_user_id is not null and p_user_id<>v_user) then raise exception 'customer required' using errcode='42501'; end if;
  select coalesce(sum(quantity_delta),0) into v_balance from tongs.accounting_journal_entries where user_id=v_user and account_code='test_customer_credits';
  return jsonb_build_object('contract_version','forge.customer-test-billing.v1','stripe_mode','test','test_credit_balance',v_balance,
    'live_provider_eligible',false,'live_revenue',false,
    'deposits',(select coalesce(jsonb_agg(jsonb_build_object('deposit_id',d.id,'pack_id',d.pack_id,'currency',d.currency,'gross_amount_micros',d.gross_amount_micros,'credit_units',d.credit_units,'received_at',d.received_at,'label','Stripe Test') order by d.received_at desc),'[]'::jsonb) from tongs.customer_deposits d where d.user_id=v_user and d.stripe_mode='test'),
    'receipts',(select coalesce(jsonb_agg(jsonb_build_object('operation_id',r.operation_id,'customer_charge_micros',s.customer_charge_micros,'outcome',s.outcome,'settled_at',s.settled_at,'execution_kind','simulated_test') order by s.settled_at desc),'[]'::jsonb) from tongs.test_funding_reservations r join tongs.test_paid_execution_settlements s on s.reservation_id=r.id where r.user_id=v_user));
end $$;

alter function tongs.read_owner_purchase_activity(text,integer) rename to _read_owner_purchase_activity_before_test_ai_deposits;
create or replace function tongs.read_owner_purchase_activity(p_stripe_mode text default 'test',p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_base jsonb; v_mode text:=lower(btrim(coalesce(p_stripe_mode,''))); v_deposits jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' and (auth.uid() is null or not tongs.is_platform_operator(auth.uid())) then raise exception 'platform operator required' using errcode='42501'; end if;
  v_base:=tongs._read_owner_purchase_activity_before_test_ai_deposits(v_mode,p_limit);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.observed_at desc),'[]'::jsonb) into v_deposits from (
    select d.id::text purchase_id,d.user_id,c.email customer_email,c.customer_name,d.stripe_mode,'ai_credits'::text purchase_type,d.pack_id item_id,'one_time'::text interval,'paid'::text status,
      d.stripe_session_id checkout_session_id,null::text stripe_invoice_id,'paid'::text payment_status,lower(d.currency) checkout_currency,(d.gross_amount_micros/10000)::bigint checkout_amount_minor,
      e.processed_at checkout_processed_at,d.id::text accounting_receipt_id,d.gross_amount_micros accounted_cash_micros,d.currency accounting_currency,d.received_at accounting_received_at,
      0::integer allowance_grant_count,0::bigint allocated_revenue_micros,0::bigint maximum_wholesale_spend_micros,
      coalesce(cons.recognized,0)::bigint recognized_revenue_micros,'deposit_receipt_recorded'::text accounting_state,
      (d.stripe_mode='live' and fee.id is not null)::boolean live_funding_eligible,
      case when e.stripe_event_id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('event_id',e.stripe_event_id,'event_type',e.event_type,'processed_at',e.processed_at)) end signed_webhook_events,
      coalesce(e.processed_at,d.received_at) observed_at
    from tongs.customer_deposits d join tongs.billing_customers c on c.user_id=d.user_id
    left join tongs.billing_events e on e.stripe_event_id=d.stripe_event_id and e.livemode=(d.stripe_mode='live')
    left join tongs.customer_deposit_processor_fees fee on fee.deposit_id=d.id
    left join lateral (select sum(recognized_revenue_micros) recognized from tongs.customer_deposit_consumptions where deposit_id=d.id) cons on true
    where d.stripe_mode=v_mode order by d.received_at desc limit least(greatest(coalesce(p_limit,100),1),500)
  ) x;
  return jsonb_set(v_base,'{purchases}',v_deposits||coalesce(v_base->'purchases','[]'::jsonb),true)
    || jsonb_build_object('contract_version','forge.owner-purchase-activity.v2');
end $$;

revoke all on table tongs.test_paid_execution_authorizations,tongs.test_paid_execution_authorization_events,tongs.test_customer_spending_quotes,
  tongs.test_customer_spending_quote_acceptances,tongs.test_funding_reservations,tongs.test_funding_reservation_events,
  tongs.test_paid_execution_evidence,tongs.test_hearth_chat_paid_results,tongs.test_customer_deposit_consumptions,tongs.test_paid_execution_settlements from public,anon,authenticated;

revoke all on function tongs.open_hearth_test_execution_authorization(uuid,uuid,uuid,uuid,uuid,integer,bigint,timestamptz,text),
  tongs.close_hearth_test_execution_authorization(uuid,uuid,text),tongs.create_hearth_chat_test_quote(uuid,uuid,text,text,timestamptz),
  tongs.reserve_hearth_chat_test_quote(uuid,uuid,text),tongs.resolve_hearth_chat_test_execution_context(text,uuid,uuid,uuid,text,text),
  tongs.authorize_hearth_chat_test_attempt(uuid,text,jsonb),tongs.record_hearth_chat_test_evidence(uuid,text,text,jsonb),
  tongs.persist_hearth_chat_test_result(uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,text,jsonb),
  tongs.settle_hearth_chat_test_operation(uuid,uuid,text,text,text,jsonb),tongs.mark_hearth_chat_test_submission_unknown(uuid,text,jsonb),
  tongs.read_hearth_chat_test_result(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function tongs.open_hearth_test_execution_authorization(uuid,uuid,uuid,uuid,uuid,integer,bigint,timestamptz,text),
  tongs.close_hearth_test_execution_authorization(uuid,uuid,text),tongs.create_hearth_chat_test_quote(uuid,uuid,text,text,timestamptz),
  tongs.reserve_hearth_chat_test_quote(uuid,uuid,text),tongs.resolve_hearth_chat_test_execution_context(text,uuid,uuid,uuid,text,text),
  tongs.authorize_hearth_chat_test_attempt(uuid,text,jsonb),tongs.record_hearth_chat_test_evidence(uuid,text,text,jsonb),
  tongs.persist_hearth_chat_test_result(uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,text,jsonb),
  tongs.settle_hearth_chat_test_operation(uuid,uuid,text,text,text,jsonb),tongs.mark_hearth_chat_test_submission_unknown(uuid,text,jsonb),
  tongs.read_hearth_chat_test_result(text,uuid,uuid,text) to service_role;
revoke all on function tongs.accept_hearth_chat_test_quote(uuid,uuid,text,text,uuid),tongs.read_customer_test_billing(uuid) from public,anon;
grant execute on function tongs.accept_hearth_chat_test_quote(uuid,uuid,text,text,uuid),tongs.read_customer_test_billing(uuid) to authenticated,service_role;
revoke all on function tongs._read_owner_purchase_activity_before_test_ai_deposits(text,integer) from public,anon,authenticated;
grant execute on function tongs._read_owner_purchase_activity_before_test_ai_deposits(text,integer) to service_role;
revoke all on function tongs.read_owner_purchase_activity(text,integer) from public,anon;
grant execute on function tongs.read_owner_purchase_activity(text,integer) to authenticated,service_role;

comment on function tongs.read_customer_test_billing(uuid) is 'Customer-safe Stripe Test funding and simulated receipt view. Never authorizes a live provider or reports Live revenue.';
comment on table tongs.test_funding_reservations is 'Test-only simulated reservations. The live-provider authorization RPC cannot resolve these rows.';

notify pgrst,'reload schema';
commit;
