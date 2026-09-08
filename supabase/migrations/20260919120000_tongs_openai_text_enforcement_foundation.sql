-- Exact OpenAI text rate revisions, append-only rollout controls, Forge failure-loss caps,
-- and organization-level authoritative reconciliation. This migration activates no route,
-- publishes no customer price, creates no budget, and authorizes no provider execution.
begin;

create table tongs.openai_text_provider_rate_revisions (
  id uuid primary key,
  provider text not null check (provider = 'openai'),
  runtime_model_alias text not null check (length(btrim(runtime_model_alias)) between 2 and 120),
  provider_model_id text not null check (length(btrim(provider_model_id)) between 2 and 160),
  revision integer not null check (revision > 0),
  input_micros_per_million_tokens bigint not null check (input_micros_per_million_tokens >= 0),
  cached_input_micros_per_million_tokens bigint not null check (cached_input_micros_per_million_tokens >= 0),
  output_micros_per_million_tokens bigint not null check (output_micros_per_million_tokens >= 0),
  maximum_context_tokens bigint not null check (maximum_context_tokens > 0),
  maximum_output_tokens bigint not null check (maximum_output_tokens > 0),
  source_url text not null check (source_url like 'https://developers.openai.com/%'),
  source_checked_at timestamptz not null,
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (provider_model_id, revision)
);

insert into tongs.openai_text_provider_rate_revisions(
  id,provider,runtime_model_alias,provider_model_id,revision,
  input_micros_per_million_tokens,cached_input_micros_per_million_tokens,
  output_micros_per_million_tokens,maximum_context_tokens,maximum_output_tokens,
  source_url,source_checked_at,content_hash
) values
  ('53530000-0000-4000-8000-000000000001','openai','gpt-5.3','gpt-5.3-chat-latest',1,
    1750000,175000,14000000,128000,16384,
    'https://developers.openai.com/api/docs/models/gpt-5.3-chat-latest','2026-09-08T00:00:00Z',
    encode(extensions.digest(convert_to('openai:gpt-5.3-chat-latest:1:1750000:175000:14000000:128000:16384','utf8'),'sha256'),'hex')),
  ('40000000-0000-4000-8000-000000000001','openai','gpt-4o-mini','gpt-4o-mini',1,
    150000,75000,600000,128000,16384,
    'https://developers.openai.com/api/docs/models/gpt-4o-mini','2026-09-08T00:00:00Z',
    encode(extensions.digest(convert_to('openai:gpt-4o-mini:1:150000:75000:600000:128000:16384','utf8'),'sha256'),'hex'));

create table tongs.openai_text_cost_policy_revisions (
  id uuid primary key,
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  revision integer not null check (revision > 0),
  policy_code text not null unique check (length(btrim(policy_code)) between 8 and 180),
  attempt_plan jsonb not null check (jsonb_typeof(attempt_plan) = 'array' and jsonb_array_length(attempt_plan) > 0),
  maximum_input_units bigint not null check (maximum_input_units > 0),
  maximum_output_units bigint not null check (maximum_output_units > 0),
  maximum_attempts smallint not null check (maximum_attempts between 1 and 4),
  direct_provider_ceiling_micros bigint not null check (direct_provider_ceiling_micros >= 0),
  supporting_cost_ceiling_micros bigint check (supporting_cost_ceiling_micros is null or supporting_cost_ceiling_micros >= 0),
  full_cost_ceiling_micros bigint check (full_cost_ceiling_micros is null or full_cost_ceiling_micros >= 0),
  cost_coverage text not null check (cost_coverage in ('complete','supporting_unpriced','rate_unverified')),
  lifecycle_state text not null check (lifecycle_state in ('draft','pilot_candidate','active','retired')),
  notes text not null,
  created_at timestamptz not null default now(),
  unique (route_code, revision),
  check ((cost_coverage = 'complete' and supporting_cost_ceiling_micros is not null
    and full_cost_ceiling_micros = direct_provider_ceiling_micros + supporting_cost_ceiling_micros)
    or (cost_coverage <> 'complete' and full_cost_ceiling_micros is null and lifecycle_state = 'draft'))
);

-- Direct-provider ceilings are exact standard-rate maxima for the bounded attempt plans.
-- Supporting costs deliberately remain unpriced, so these revisions cannot activate.
insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
  maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
  full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values
  ('10000000-0000-4000-8000-000000000001','hearth.chat_completion',1,'openai-text:hearth-chat:standard-v1',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":128000,"output_max":16384},{"attempt":2,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":128000,"output_max":16384},{"attempt":3,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":128000,"output_max":16384}]',384000,49152,3,1360128,null,null,'supporting_unpriced','draft','Exact OpenAI maximum; supporting validation, persistence, and infrastructure allocation is not approved.'),
  ('10000000-0000-4000-8000-000000000002','hearth.research_synthesis',1,'openai-text:hearth-research:standard-v1',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":128000,"output_max":16384},{"attempt":2,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":128000,"output_max":16384},{"attempt":3,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":128000,"output_max":16384}]',384000,49152,3,1360128,null,null,'supporting_unpriced','draft','Exact OpenAI maximum; research evidence and persistence allocation is not approved.'),
  ('10000000-0000-4000-8000-000000000003','visual.unified_plan',1,'openai-text:visual-unified-plan:standard-v1',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":64000,"output_max":16384}]',64000,16384,1,341376,null,null,'supporting_unpriced','draft','Exact OpenAI maximum; canonical plan persistence allocation is not approved.'),
  ('10000000-0000-4000-8000-000000000004','visual.narrative_interpretation',1,'openai-text:visual-narrative:standard-v1',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":32000,"output_max":8000}]',32000,8000,1,168000,null,null,'supporting_unpriced','draft','Exact OpenAI maximum; caller persistence allocation is not approved.'),
  ('10000000-0000-4000-8000-000000000005','motion.broll_interpretation',1,'openai-text:motion-broll:standard-v1',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":32000,"output_max":8000}]',32000,8000,1,168000,null,null,'supporting_unpriced','draft','Exact OpenAI maximum; caller persistence allocation is not approved.'),
  ('10000000-0000-4000-8000-000000000006','hammer.transcript_cleanup',1,'openai-text:hammer-cleanup:standard-v1',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":128000,"output_max":16384},{"attempt":2,"rate_revision_id":"40000000-0000-4000-8000-000000000001","input_max":128000,"output_max":16384}]',256000,32768,2,482407,null,null,'supporting_unpriced','draft','Exact primary plus gpt-4o-mini fallback maximum; transcript persistence allocation is not approved.'),
  ('10000000-0000-4000-8000-000000000007','shorts.discovery',1,'openai-text:shorts-discovery:standard-v1',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":64000,"output_max":16384}]',64000,16384,1,341376,null,null,'supporting_unpriced','draft','Exact OpenAI maximum; deterministic resolution and persistence allocation is not approved.'),
  ('10000000-0000-4000-8000-000000000008','quench.metadata',1,'openai-text:quench-metadata:standard-v1',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":32000,"output_max":8000}]',32000,8000,1,168000,null,null,'supporting_unpriced','draft','Exact OpenAI maximum; metadata persistence allocation is not approved.'),
  ('10000000-0000-4000-8000-000000000009','hearth.chat_completion',2,'openai-text:hearth-chat:bounded-pilot-v1',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000001","input_max":2000,"output_max":512}]',2000,512,1,10668,10000,20668,'complete','pilot_candidate','Awaiting owner approval; one neutral prompt, one attempt, no tools or purchased assets.');

create table tongs.openai_text_rollout_revisions (
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  revision integer not null check (revision > 0),
  mode text not null check (mode in ('inactive','shadow','enforce','halt_new')),
  cost_policy_revision_id uuid references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  reason text not null check (nullif(btrim(reason),'') is not null),
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (route_code, revision),
  check (mode in ('inactive','halt_new') or cost_policy_revision_id is not null)
);

insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,reason)
select route_code,1,'inactive','Exact rates and loss controls installed; no OpenAI execution activation approved.'
from tongs.openai_text_route_policies;

create table tongs.openai_text_failure_loss_policy_revisions (
  id uuid primary key,
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  environment text not null check (environment in ('test','production')),
  revision integer not null check (revision > 0),
  per_operation_limit_micros bigint not null check (per_operation_limit_micros >= 0),
  aggregate_limit_micros bigint not null check (aggregate_limit_micros >= per_operation_limit_micros),
  rolling_window_seconds integer not null check (rolling_window_seconds between 60 and 2592000),
  maximum_concurrency integer not null check (maximum_concurrency between 1 and 100),
  lifecycle_state text not null check (lifecycle_state in ('draft','active','retired')),
  reason text not null,
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (route_code, environment, revision)
);

insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
  rolling_window_seconds,maximum_concurrency,lifecycle_state,reason
) values (
  '20000000-0000-4000-8000-000000000001','hearth.chat_completion','production',1,
  20668,20668,86400,1,'draft',
  'Concrete bounded activation-test proposal only; no owner budget or spending authorization exists.'
);

create table tongs.openai_text_failure_exposure_holds (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  attempt_key text not null unique check (length(btrim(attempt_key)) between 8 and 300),
  attempt_number smallint not null check (attempt_number between 1 and 4),
  loss_policy_revision_id uuid references tongs.openai_text_failure_loss_policy_revisions(id) on delete restrict,
  authorized_exposure_micros bigint not null check (authorized_exposure_micros >= 0),
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (reservation_id, attempt_number)
);

create table tongs.openai_text_failure_exposure_events (
  id uuid primary key,
  hold_id uuid not null references tongs.openai_text_failure_exposure_holds(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_key text not null unique check (length(btrim(event_key)) between 8 and 360),
  event_type text not null check (event_type in ('authorized','success_released','failure_realized','unresolved','reconciled')),
  actual_supplier_cost_micros bigint check (actual_supplier_cost_micros is null or actual_supplier_cost_micros >= 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (hold_id, sequence)
);

create table tongs.openai_text_failure_limit_events (
  id uuid primary key,
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  reservation_id uuid references tongs.funding_reservations(id) on delete restrict,
  event_key text not null unique,
  event_type text not null check (event_type in ('aggregate_limit_blocked','operation_limit_blocked','concurrency_blocked','overrun_halted')),
  requested_micros bigint not null check (requested_micros >= 0),
  committed_micros bigint not null check (committed_micros >= 0),
  configured_limit_micros bigint not null check (configured_limit_micros >= 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now()
);

alter table tongs.openai_text_funding_bindings
  add column cost_policy_revision_id uuid references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  add column rollout_revision integer,
  add constraint openai_text_funding_rollout_revision_fk foreign key(route_code,rollout_revision)
    references tongs.openai_text_rollout_revisions(route_code,revision) on delete restrict;

create table tongs.openai_organization_reconciliation_batches (
  id uuid primary key,
  source_key text not null unique check (length(btrim(source_key)) between 8 and 300),
  period_start timestamptz not null,
  period_end timestamptz not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_cost_micros bigint not null check (total_cost_micros >= 0),
  source_kind text not null check (source_kind in ('organization_costs_api','provider_invoice')),
  evidence_status text not null check (evidence_status in ('confirmed','incomplete')),
  raw_evidence_json jsonb not null check (jsonb_typeof(raw_evidence_json) = 'object'),
  recorded_at timestamptz not null default now(),
  check (period_end > period_start)
);

create table tongs.openai_organization_cost_buckets (
  id uuid primary key,
  batch_id uuid not null references tongs.openai_organization_reconciliation_batches(id) on delete restrict,
  bucket_key text not null,
  project_id text,
  api_key_id text,
  line_item text,
  amount_micros bigint not null check (amount_micros >= 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  unique (batch_id,bucket_key)
);

create table tongs.openai_organization_usage_buckets (
  id uuid primary key,
  batch_id uuid not null references tongs.openai_organization_reconciliation_batches(id) on delete restrict,
  bucket_key text not null,
  model text,
  project_id text,
  api_key_id text,
  input_tokens bigint not null check (input_tokens >= 0),
  cached_input_tokens bigint not null check (cached_input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  request_count bigint not null check (request_count >= 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  unique (batch_id,bucket_key)
);

create table tongs.openai_text_operation_cost_allocations (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  batch_id uuid not null references tongs.openai_organization_reconciliation_batches(id) on delete restrict,
  allocation_key text not null unique,
  allocated_cost_micros bigint check (allocated_cost_micros is null or allocated_cost_micros >= 0),
  allocation_status text not null check (allocation_status in ('unresolved','estimated','confirmed')),
  allocation_method text not null check (allocation_method in ('request_id_direct','token_weighted','manual_evidence','unallocated')),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  check (allocation_status = 'unresolved' or allocated_cost_micros is not null),
  unique (reservation_id,batch_id)
);

create table tongs.openai_text_activation_proposals (
  id uuid primary key,
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  cost_policy_revision_id uuid not null references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  failure_loss_policy_revision_id uuid not null references tongs.openai_text_failure_loss_policy_revisions(id) on delete restrict,
  model text not null,
  prompt_class text not null,
  maximum_input_units bigint not null,
  maximum_output_units bigint not null,
  maximum_attempts smallint not null,
  direct_provider_ceiling_micros bigint not null,
  supporting_cost_ceiling_micros bigint not null,
  total_cost_ceiling_micros bigint not null,
  markup_basis_points integer not null,
  rounded_customer_price_micros bigint not null,
  proposed_owner_budget_micros bigint not null,
  authorization_window_seconds integer not null,
  status text not null check (status in ('awaiting_owner_approval','approved','rejected','expired')),
  created_at timestamptz not null default now(),
  check (total_cost_ceiling_micros = direct_provider_ceiling_micros + supporting_cost_ceiling_micros)
);

insert into tongs.openai_text_activation_proposals(
  id,route_code,cost_policy_revision_id,failure_loss_policy_revision_id,model,prompt_class,
  maximum_input_units,maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,total_cost_ceiling_micros,markup_basis_points,
  rounded_customer_price_micros,proposed_owner_budget_micros,authorization_window_seconds,status
) values (
  '30000000-0000-4000-8000-000000000001','hearth.chat_completion',
  '10000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000001',
  'gpt-5.3-chat-latest','neutral bounded text response; no tools, search, media, or purchased assets',
  2000,512,1,10668,10000,20668,3300,30000,30000,86400,'awaiting_owner_approval'
);

do $$ declare v_table text; begin
  foreach v_table in array array[
    'openai_text_provider_rate_revisions','openai_text_cost_policy_revisions',
    'openai_text_rollout_revisions','openai_text_failure_loss_policy_revisions',
    'openai_text_failure_exposure_holds','openai_text_failure_exposure_events',
    'openai_text_failure_limit_events','openai_organization_reconciliation_batches',
    'openai_organization_cost_buckets','openai_organization_usage_buckets',
    'openai_text_operation_cost_allocations','openai_text_activation_proposals'
  ] loop
    execute format('alter table tongs.%I enable row level security',v_table);
    execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',v_table);
    execute format('grant select on tongs.%I to service_role',v_table);
    execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',v_table,v_table);
  end loop;
end $$;

create or replace function tongs._current_openai_text_rollout(p_route_code text)
returns tongs.openai_text_rollout_revisions language sql stable security definer set search_path=pg_catalog as $$
  select row_data from tongs.openai_text_rollout_revisions row_data
  where row_data.route_code=btrim(p_route_code) order by row_data.revision desc limit 1;
$$;

create or replace function tongs.bind_openai_text_funding_reservation(
  p_operation_id text,p_route_code text,p_reservation_id uuid,p_credential_funding text,
  p_model text,p_cost_policy_revision_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_res tongs.funding_reservations%rowtype; v_quote tongs.customer_spending_quotes%rowtype;
  v_cost tongs.openai_text_cost_policy_revisions%rowtype; v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_existing tongs.openai_text_funding_bindings%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_operation_id,'')))<8 or p_credential_funding not in ('forge','byo_customer')
    or length(btrim(coalesce(p_model,'')))<2 then raise exception 'invalid OpenAI text funding binding' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('openai-text-binding:'||btrim(p_operation_id),0));
  select * into v_existing from tongs.openai_text_funding_bindings where operation_id=btrim(p_operation_id);
  if found then
    if v_existing.reservation_id<>p_reservation_id or v_existing.route_code<>btrim(p_route_code)
      or v_existing.credential_funding<>p_credential_funding or v_existing.model<>btrim(p_model)
      or v_existing.cost_policy_revision_id is distinct from p_cost_policy_revision_id then
      raise exception 'OpenAI text binding replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('operation_id',v_existing.operation_id,'reservation_id',v_existing.reservation_id,'replay',true,'provider_execution_authorized',false);
  end if;
  select * into v_res from tongs.funding_reservations where id=p_reservation_id for update;
  if not found or v_res.operation_id<>btrim(p_operation_id) or tongs._funding_reservation_state(v_res.id)<>'reserved' then
    raise exception 'eligible reserved funding allocation not found' using errcode='P0002'; end if;
  select * into v_quote from tongs.customer_spending_quotes where id=v_res.quote_id;
  select * into v_cost from tongs.openai_text_cost_policy_revisions where id=p_cost_policy_revision_id;
  if not found or v_cost.route_code<>btrim(p_route_code) or v_cost.cost_coverage<>'complete'
    or v_cost.lifecycle_state not in ('pilot_candidate','active') then raise exception 'pricing_not_configured' using errcode='P0001'; end if;
  if v_res.reserved_wholesale_spend_micros<>v_cost.full_cost_ceiling_micros
    or v_quote.full_cost_ceiling_micros<>v_cost.full_cost_ceiling_micros then
    raise exception 'reservation does not cover exact OpenAI text cost policy' using errcode='P0001'; end if;
  if p_credential_funding='byo_customer' and v_cost.direct_provider_ceiling_micros<>0 then
    raise exception 'BYO pricing must not reserve Forge OpenAI provider cost' using errcode='P0001'; end if;
  select * into v_rollout from tongs._current_openai_text_rollout(btrim(p_route_code));
  insert into tongs.openai_text_funding_bindings(operation_id,route_code,reservation_id,credential_funding,model,
    pricing_revision_id,maximum_input_units,maximum_output_units,maximum_attempts,cost_policy_revision_id,rollout_revision)
  values(btrim(p_operation_id),btrim(p_route_code),p_reservation_id,p_credential_funding,btrim(p_model),
    v_quote.pricing_revision_id,v_cost.maximum_input_units,v_cost.maximum_output_units,v_cost.maximum_attempts,v_cost.id,v_rollout.revision);
  return jsonb_build_object('operation_id',btrim(p_operation_id),'reservation_id',p_reservation_id,'replay',false,
    'provider_execution_authorized',false,'rollout_mode',v_rollout.mode,'cost_policy_revision_id',v_cost.id);
end $$;

create or replace function tongs.authorize_openai_text_provider_attempt(
  p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_failure_exposure_micros bigint,
  p_lease_seconds integer,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_binding tongs.openai_text_funding_bindings%rowtype; v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_policy tongs.openai_text_failure_loss_policy_revisions%rowtype; v_hold tongs.openai_text_failure_exposure_holds%rowtype;
  v_begin jsonb; v_committed bigint:=0; v_concurrency integer:=0; v_next_revision integer;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_attempt_key,'')))<8 or p_attempt_number not between 1 and 4
    or p_failure_exposure_micros<0 or p_lease_seconds not between 5 and 900
    or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid OpenAI text provider attempt' using errcode='22023'; end if;
  select * into v_binding from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
  if not found or v_binding.cost_policy_revision_id is null or p_attempt_number>v_binding.maximum_attempts then
    raise exception 'funded OpenAI text binding required' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('openai-text-loss:'||v_binding.route_code||':production',0));
  select * into v_hold from tongs.openai_text_failure_exposure_holds where attempt_key=btrim(p_attempt_key);
  if found then
    return jsonb_build_object('reservation_id',p_reservation_id,'attempt_key',v_hold.attempt_key,'replay',true,
      'provider_execution_authorized',false,'reason','duplicate_attempt_blocked');
  end if;
  select * into v_rollout from tongs._current_openai_text_rollout(v_binding.route_code);
  if v_rollout.mode<>'enforce' or v_rollout.cost_policy_revision_id is distinct from v_binding.cost_policy_revision_id then
    raise exception 'OpenAI text route is not activated for this exact cost revision' using errcode='42501'; end if;
  if v_binding.credential_funding='forge' then
    select * into v_policy from tongs.openai_text_failure_loss_policy_revisions
      where route_code=v_binding.route_code and environment='production' and lifecycle_state='active'
      order by revision desc limit 1;
    if not found then raise exception 'OpenAI failure-loss policy is not active' using errcode='42501'; end if;
    with latest as (
      select distinct on (h.id) h.id,h.authorized_exposure_micros,e.event_type,e.actual_supplier_cost_micros,e.created_at
      from tongs.openai_text_failure_exposure_holds h
      join tongs.openai_text_failure_exposure_events e on e.hold_id=h.id
      where h.route_code=v_binding.route_code order by h.id,e.sequence desc
    ) select coalesce(sum(case when event_type in ('authorized','unresolved') then authorized_exposure_micros
        when event_type='failure_realized' and created_at>=now()-make_interval(secs=>v_policy.rolling_window_seconds)
          then coalesce(actual_supplier_cost_micros,authorized_exposure_micros) else 0 end),0),
      count(*) filter(where event_type in ('authorized','unresolved')) into v_committed,v_concurrency from latest;
    if p_failure_exposure_micros>v_policy.per_operation_limit_micros then
      insert into tongs.openai_text_failure_limit_events(id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,configured_limit_micros,evidence_json)
      values(gen_random_uuid(),v_binding.route_code,p_reservation_id,btrim(p_attempt_key)||':operation-limit','operation_limit_blocked',p_failure_exposure_micros,v_committed,v_policy.per_operation_limit_micros,p_evidence_json);
      return jsonb_build_object('provider_execution_authorized',false,'reason','operation_failure_limit','rollout_mode',v_rollout.mode);
    elsif v_concurrency>=v_policy.maximum_concurrency then
      insert into tongs.openai_text_failure_limit_events(id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,configured_limit_micros,evidence_json)
      values(gen_random_uuid(),v_binding.route_code,p_reservation_id,btrim(p_attempt_key)||':concurrency-limit','concurrency_blocked',p_failure_exposure_micros,v_committed,v_policy.aggregate_limit_micros,p_evidence_json);
      return jsonb_build_object('provider_execution_authorized',false,'reason','failure_loss_concurrency_limit','rollout_mode',v_rollout.mode);
    elsif v_committed+p_failure_exposure_micros>v_policy.aggregate_limit_micros then
      insert into tongs.openai_text_failure_limit_events(id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,configured_limit_micros,evidence_json)
      values(gen_random_uuid(),v_binding.route_code,p_reservation_id,btrim(p_attempt_key)||':aggregate-limit','aggregate_limit_blocked',p_failure_exposure_micros,v_committed,v_policy.aggregate_limit_micros,p_evidence_json);
      select coalesce(max(revision),0)+1 into v_next_revision from tongs.openai_text_rollout_revisions where route_code=v_binding.route_code;
      insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason)
      values(v_binding.route_code,v_next_revision,'halt_new',v_binding.cost_policy_revision_id,'Automatic halt: aggregate Forge failure-loss ceiling reached.');
      return jsonb_build_object('provider_execution_authorized',false,'reason','aggregate_failure_limit','rollout_mode','halt_new');
    end if;
  elsif p_failure_exposure_micros<>0 then
    raise exception 'BYO OpenAI attempt cannot reserve Forge provider failure exposure' using errcode='22023';
  end if;
  insert into tongs.openai_text_failure_exposure_holds(id,reservation_id,route_code,attempt_key,attempt_number,
    loss_policy_revision_id,authorized_exposure_micros,lease_expires_at)
  values(gen_random_uuid(),p_reservation_id,v_binding.route_code,btrim(p_attempt_key),p_attempt_number,
    v_policy.id,p_failure_exposure_micros,now()+make_interval(secs=>p_lease_seconds)) returning * into v_hold;
  insert into tongs.openai_text_failure_exposure_events(id,hold_id,sequence,event_key,event_type,evidence_json)
  values(gen_random_uuid(),v_hold.id,1,btrim(p_attempt_key)||':loss-authorized','authorized',p_evidence_json);
  if (select funding_source_type from tongs.funding_reservations where id=p_reservation_id)='owner_budget' then
    v_begin:=tongs.begin_owner_provider_attempt(p_reservation_id,btrim(p_attempt_key),p_lease_seconds,p_evidence_json);
  else
    v_begin:=tongs.begin_provider_attempt(p_reservation_id,btrim(p_attempt_key),p_lease_seconds,p_evidence_json);
  end if;
  if coalesce((v_begin->>'provider_execution_authorized')::boolean,false) is not true then
    raise exception 'shared spending gate denied OpenAI execution' using errcode='42501'; end if;
  return v_begin||jsonb_build_object('failure_exposure_hold_id',v_hold.id,'failure_exposure_micros',p_failure_exposure_micros);
end $$;

create or replace function tongs.close_openai_text_failure_exposure(
  p_reservation_id uuid,p_attempt_key text,p_outcome text,p_actual_supplier_cost_micros bigint,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_hold tongs.openai_text_failure_exposure_holds%rowtype; v_existing tongs.openai_text_failure_exposure_events%rowtype;
  v_sequence integer; v_next_revision integer; v_key text;
begin
  perform tongs._require_pricing_service_role();
  if p_outcome not in ('success_released','failure_realized','unresolved','reconciled')
    or (p_outcome='success_released' and p_actual_supplier_cost_micros is null)
    or p_actual_supplier_cost_micros<0 or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid OpenAI failure exposure close' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('openai-text-attempt:'||btrim(p_attempt_key),0));
  select * into v_hold from tongs.openai_text_failure_exposure_holds where reservation_id=p_reservation_id and attempt_key=btrim(p_attempt_key);
  if not found then raise exception 'OpenAI failure exposure hold not found' using errcode='P0002'; end if;
  v_key:=btrim(p_attempt_key)||':loss:'||p_outcome;
  select * into v_existing from tongs.openai_text_failure_exposure_events where event_key=v_key;
  if found then return jsonb_build_object('hold_id',v_hold.id,'outcome',v_existing.event_type,'replay',true); end if;
  select * into v_existing from tongs.openai_text_failure_exposure_events where hold_id=v_hold.id order by sequence desc limit 1;
  if v_existing.event_type in ('success_released','failure_realized','reconciled') then
    raise exception 'OpenAI failure exposure is terminal' using errcode='P0001'; end if;
  select coalesce(max(sequence),0)+1 into v_sequence from tongs.openai_text_failure_exposure_events where hold_id=v_hold.id;
  insert into tongs.openai_text_failure_exposure_events(id,hold_id,sequence,event_key,event_type,actual_supplier_cost_micros,evidence_json)
  values(gen_random_uuid(),v_hold.id,v_sequence,v_key,p_outcome,p_actual_supplier_cost_micros,p_evidence_json);
  if p_actual_supplier_cost_micros is not null and p_actual_supplier_cost_micros>v_hold.authorized_exposure_micros then
    insert into tongs.pricing_discrepancies(id,reservation_id,discrepancy_key,discrepancy_type,quoted_ceiling_micros,observed_amount_micros,evidence_json)
    values(gen_random_uuid(),p_reservation_id,btrim(p_attempt_key)||':failure-loss-overrun','wholesale_ceiling_overrun',v_hold.authorized_exposure_micros,p_actual_supplier_cost_micros,
      p_evidence_json||jsonb_build_object('component','openai_failure_loss')) on conflict(discrepancy_key) do nothing;
    select coalesce(max(revision),0)+1 into v_next_revision from tongs.openai_text_rollout_revisions where route_code=v_hold.route_code;
    insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,reason)
    values(v_hold.route_code,v_next_revision,'halt_new','Automatic halt: actual OpenAI failure cost exceeded the authorized per-attempt ceiling.');
    insert into tongs.openai_text_failure_limit_events(id,route_code,reservation_id,event_key,event_type,requested_micros,committed_micros,configured_limit_micros,evidence_json)
    values(gen_random_uuid(),v_hold.route_code,p_reservation_id,btrim(p_attempt_key)||':overrun-halted','overrun_halted',p_actual_supplier_cost_micros,p_actual_supplier_cost_micros,v_hold.authorized_exposure_micros,p_evidence_json);
  end if;
  return jsonb_build_object('hold_id',v_hold.id,'outcome',p_outcome,'replay',false,'route_halted',p_actual_supplier_cost_micros>v_hold.authorized_exposure_micros);
end $$;

create or replace function tongs.record_openai_text_supplier_attempt_expense(
  p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_provider_reference text,
  p_amount_micros bigint,p_evidence_status text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_binding tongs.openai_text_funding_bindings%rowtype; v_existing tongs.supplier_expenses%rowtype; v_key text;
begin
  perform tongs._require_pricing_service_role();
  select * into v_binding from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
  if not found or v_binding.credential_funding<>'forge' or p_attempt_number>v_binding.maximum_attempts then
    raise exception 'Forge-funded OpenAI binding required' using errcode='P0002'; end if;
  if p_evidence_status not in ('estimated','confirmed','unresolved') or (p_evidence_status<>'unresolved' and p_amount_micros is null)
    or p_amount_micros<0 then raise exception 'invalid OpenAI supplier expense' using errcode='22023'; end if;
  v_key:=btrim(p_attempt_key)||':supplier-expense';
  select * into v_existing from tongs.supplier_expenses where expense_key=v_key;
  if found then
    if v_existing.amount_micros is distinct from p_amount_micros or v_existing.evidence_status<>p_evidence_status then
      raise exception 'OpenAI supplier expense replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('supplier_expense_id',v_existing.id,'replay',true);
  end if;
  insert into tongs.supplier_expenses(id,reservation_id,expense_key,provider,component_code,provider_reference,currency,
    amount_micros,evidence_status,obligation_status,evidence_json,incurred_at)
  values(gen_random_uuid(),p_reservation_id,v_key,'openai','openai.text.'||v_binding.route_code,
    nullif(btrim(coalesce(p_provider_reference,'')),''),'USD',p_amount_micros,p_evidence_status,
    case when p_evidence_status='confirmed' then 'closed' when p_evidence_status='unresolved' then 'unresolved' else 'open' end,
    p_evidence_json||jsonb_build_object('attempt_number',p_attempt_number,'attempt_key',btrim(p_attempt_key)),now()) returning * into v_existing;
  return jsonb_build_object('supplier_expense_id',v_existing.id,'replay',false,'evidence_status',v_existing.evidence_status);
end $$;

create or replace function tongs.record_openai_organization_reconciliation(
  p_batch_id uuid,p_source_key text,p_period_start timestamptz,p_period_end timestamptz,
  p_currency text,p_total_cost_micros bigint,p_source_kind text,p_evidence_status text,
  p_cost_buckets jsonb,p_usage_buckets jsonb,p_raw_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_existing tongs.openai_organization_reconciliation_batches%rowtype; v_cost_sum bigint;
begin
  perform tongs._require_pricing_service_role();
  if p_batch_id is null or length(btrim(coalesce(p_source_key,'')))<8 or p_period_end<=p_period_start
    or upper(btrim(coalesce(p_currency,'')))<>'USD' or p_total_cost_micros<0
    or p_source_kind not in ('organization_costs_api','provider_invoice')
    or p_evidence_status not in ('confirmed','incomplete')
    or jsonb_typeof(coalesce(p_cost_buckets,'null'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_usage_buckets,'null'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_raw_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid OpenAI reconciliation batch' using errcode='22023'; end if;
  select coalesce(sum((item->>'amount_micros')::bigint),0) into v_cost_sum from jsonb_array_elements(p_cost_buckets)item;
  if v_cost_sum<>p_total_cost_micros then raise exception 'OpenAI cost bucket total mismatch' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('openai-reconciliation:'||btrim(p_source_key),0));
  select * into v_existing from tongs.openai_organization_reconciliation_batches where source_key=btrim(p_source_key);
  if found then
    if v_existing.total_cost_micros<>p_total_cost_micros or v_existing.period_start<>p_period_start or v_existing.period_end<>p_period_end then
      raise exception 'OpenAI reconciliation replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('batch_id',v_existing.id,'replay',true,'allocation_status','unresolved');
  end if;
  insert into tongs.openai_organization_reconciliation_batches(id,source_key,period_start,period_end,currency,total_cost_micros,source_kind,evidence_status,raw_evidence_json)
  values(p_batch_id,btrim(p_source_key),p_period_start,p_period_end,'USD',p_total_cost_micros,p_source_kind,p_evidence_status,p_raw_evidence_json);
  insert into tongs.openai_organization_cost_buckets(id,batch_id,bucket_key,project_id,api_key_id,line_item,amount_micros,evidence_json)
  select gen_random_uuid(),p_batch_id,btrim(item->>'bucket_key'),nullif(btrim(coalesce(item->>'project_id','')),''),
    nullif(btrim(coalesce(item->>'api_key_id','')),''),nullif(btrim(coalesce(item->>'line_item','')),''),
    (item->>'amount_micros')::bigint,coalesce(item->'evidence','{}'::jsonb) from jsonb_array_elements(p_cost_buckets)item;
  insert into tongs.openai_organization_usage_buckets(id,batch_id,bucket_key,model,project_id,api_key_id,input_tokens,cached_input_tokens,output_tokens,request_count,evidence_json)
  select gen_random_uuid(),p_batch_id,btrim(item->>'bucket_key'),nullif(btrim(coalesce(item->>'model','')),''),
    nullif(btrim(coalesce(item->>'project_id','')),''),nullif(btrim(coalesce(item->>'api_key_id','')),''),
    coalesce((item->>'input_tokens')::bigint,0),coalesce((item->>'cached_input_tokens')::bigint,0),
    coalesce((item->>'output_tokens')::bigint,0),coalesce((item->>'request_count')::bigint,0),
    coalesce(item->'evidence','{}'::jsonb) from jsonb_array_elements(p_usage_buckets)item;
  return jsonb_build_object('batch_id',p_batch_id,'replay',false,'allocation_status','unresolved',
    'note','Organization Costs evidence is authoritative in aggregate; operation allocation remains unresolved until matched.');
end $$;

create or replace function tongs.read_openai_text_enforcement_readiness(p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,250),1),2000);
begin
  if coalesce(auth.role(),'')<>'service_role' and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode='42501'; end if;
  return jsonb_build_object(
    'routes',(select coalesce(jsonb_agg(to_jsonb(x) order by x.route_code),'[]'::jsonb) from (
      select p.route_code,r.mode,r.revision rollout_revision,r.cost_policy_revision_id,c.cost_coverage,c.lifecycle_state,
        c.maximum_input_units,c.maximum_output_units,c.maximum_attempts,c.direct_provider_ceiling_micros,
        c.supporting_cost_ceiling_micros,c.full_cost_ceiling_micros
      from tongs.openai_text_route_policies p left join lateral(select * from tongs.openai_text_rollout_revisions rr where rr.route_code=p.route_code order by revision desc limit 1)r on true
      left join lateral(select * from tongs.openai_text_cost_policy_revisions cc where cc.id=r.cost_policy_revision_id or (r.cost_policy_revision_id is null and cc.route_code=p.route_code)
        order by case when cc.id=r.cost_policy_revision_id then 0 else 1 end,cc.revision desc limit 1)c on true order by p.route_code limit v_limit)x),
    'activation_proposals',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (select * from tongs.openai_text_activation_proposals order by created_at desc limit v_limit)x),
    'failure_limit_events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (select * from tongs.openai_text_failure_limit_events order by created_at desc limit v_limit)x),
    'reconciliation',(select jsonb_build_object('batch_count',count(*),'confirmed_total_micros',coalesce(sum(total_cost_micros) filter(where evidence_status='confirmed'),0),
      'unallocated_batches',count(*) filter(where not exists(select 1 from tongs.openai_text_operation_cost_allocations a where a.batch_id=b.id and a.allocation_status='confirmed')))
      from tongs.openai_organization_reconciliation_batches b),
    'customer_spending_enabled',coalesce((select customer_settlement_enabled from tongs._current_paid_execution_control()),false),
    'provider_execution_globally_enabled',coalesce((select provider_execution_enabled from tongs._current_paid_execution_control()),false)
  );
end $$;

do $$ declare v_fn text; begin
  foreach v_fn in array array[
    'bind_openai_text_funding_reservation(text,text,uuid,text,text,uuid)',
    'authorize_openai_text_provider_attempt(uuid,text,smallint,bigint,integer,jsonb)',
    'close_openai_text_failure_exposure(uuid,text,text,bigint,jsonb)',
    'record_openai_text_supplier_attempt_expense(uuid,text,smallint,text,bigint,text,jsonb)',
    'record_openai_organization_reconciliation(uuid,text,timestamptz,timestamptz,text,bigint,text,text,jsonb,jsonb,jsonb)'
  ] loop
    execute format('revoke all on function tongs.%s from public,anon,authenticated',v_fn);
    execute format('grant execute on function tongs.%s to service_role',v_fn);
  end loop;
end $$;
revoke all on function tongs._current_openai_text_rollout(text) from public,anon,authenticated;
grant execute on function tongs._current_openai_text_rollout(text) to service_role;
revoke all on function tongs.read_openai_text_enforcement_readiness(integer) from public,anon;
grant execute on function tongs.read_openai_text_enforcement_readiness(integer) to authenticated,service_role;

comment on table tongs.openai_text_activation_proposals is 'Private, non-spendable activation proposals. Rows do not create budgets, publish prices, or enable execution.';
comment on table tongs.openai_organization_reconciliation_batches is 'Authoritative aggregate OpenAI Costs API or invoice evidence; never implies per-operation allocation without explicit matching evidence.';
comment on function tongs.authorize_openai_text_provider_attempt(uuid,text,smallint,bigint,integer,jsonb) is 'Atomic shared-gate plus per-operation, rolling aggregate, and concurrency Forge failure-loss authorization.';

notify pgrst,'reload schema';
commit;
