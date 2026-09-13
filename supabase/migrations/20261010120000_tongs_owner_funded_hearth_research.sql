-- Bounded owner-funded Hearth research. This migration installs dormant
-- controls only: it creates no owner identity, budget, credential, aggregate
-- assignment, paid test, or active authorization.
begin;

create table tongs.owner_hearth_research_activation_proposals (
  id uuid primary key,
  proposal_code text not null unique,
  currency text not null check(currency='USD'),
  canary_execution_micros bigint not null check(canary_execution_micros=136456),
  creator_session_execution_micros bigint not null check(creator_session_execution_micros=21306560),
  storage_and_recovery_micros bigint not null check(storage_and_recovery_micros=83772),
  maximum_owner_authorization_micros bigint not null check(maximum_owner_authorization_micros=21526788),
  existing_shared_exposure_micros bigint not null check(existing_shared_exposure_micros=10840000),
  aggregate_risk_micros bigint not null check(aggregate_risk_micros=33),
  proposed_shared_aggregate_ceiling_micros bigint not null check(proposed_shared_aggregate_ceiling_micros=32366821),
  canary_operations integer not null check(canary_operations=1),
  creator_session_operations integer not null check(creator_session_operations=10),
  maximum_concurrency integer not null check(maximum_concurrency=1),
  maximum_attempts smallint not null check(maximum_attempts=1),
  execution_timeout_seconds integer not null check(execution_timeout_seconds=60),
  maximum_searches integer not null check(maximum_searches=6),
  maximum_http_attempts integer not null check(maximum_http_attempts=24),
  maximum_sources integer not null check(maximum_sources=6),
  maximum_capture_bytes bigint not null check(maximum_capture_bytes=1048576),
  maximum_research_package_bytes bigint not null check(maximum_research_package_bytes=786432),
  maximum_recovery_reads_per_package integer not null check(maximum_recovery_reads_per_package=20),
  lifecycle_state text not null check(lifecycle_state='proposed'),
  evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  check(canary_execution_micros+creator_session_execution_micros+storage_and_recovery_micros=maximum_owner_authorization_micros),
  check(existing_shared_exposure_micros+maximum_owner_authorization_micros+aggregate_risk_micros=proposed_shared_aggregate_ceiling_micros)
);

insert into tongs.owner_hearth_research_activation_proposals(
 id,proposal_code,currency,canary_execution_micros,creator_session_execution_micros,storage_and_recovery_micros,
 maximum_owner_authorization_micros,existing_shared_exposure_micros,aggregate_risk_micros,proposed_shared_aggregate_ceiling_micros,
 canary_operations,creator_session_operations,maximum_concurrency,maximum_attempts,
 execution_timeout_seconds,maximum_searches,maximum_http_attempts,maximum_sources,maximum_capture_bytes,
 maximum_research_package_bytes,maximum_recovery_reads_per_package,lifecycle_state,evidence_json
) values(
 '91000000-0000-4000-8000-000000000001','owner-hearth-research-v1','USD',136456,21306560,83772,
 21526788,10840000,33,32366821,1,10,1,1,60,6,24,6,1048576,786432,20,'proposed',jsonb_build_object(
  'activation_approved',false,'credentials_approved',false,'budget_approved',false,'paid_testing_approved',false,
  'rate_verification_required',true,'storage_allowance_verified',false,
  'canary_basis',jsonb_build_object('model','gpt-6-astra','input_tokens',8000,'output_tokens',1000,'searches',1,'sources',2,'http_attempts',24,
    'openai_micros',130000,'search_micros',5000,'platform_micros',1456,'execution_micros',136456,'storage_micros',7616,'quote_micros',144072,'aggregate_admission_micros',144075),
  'session_basis',jsonb_build_object('operations',10,'per_operation_openai_micros',2099200,'per_operation_search_micros',30000,'per_operation_platform_micros',1456),
  'shared_aggregate_risk_micros_per_operation',3,
  'shared_aggregate_ceiling_micros',32366821,
  'canary_failure_loss_limit_micros',144072,
  'session_failure_loss_limit_micros',4276544,
  'note','Storage and provider rates must be independently verified before approval and activation.'
 ));

create table tongs.owner_hearth_research_proposal_events (
  id uuid primary key,
  proposal_id uuid not null references tongs.owner_hearth_research_activation_proposals(id) on delete restrict,
  sequence integer not null check(sequence>0),
  event_key text not null unique,
  event_type text not null check(event_type in('approved','withdrawn')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(proposal_id,sequence)
);

create table tongs.owner_hearth_research_authorizations (
  id uuid primary key,
  proposal_id uuid not null references tongs.owner_hearth_research_activation_proposals(id) on delete restrict,
  authorization_kind text not null check(authorization_kind in('canary','creator_session')),
  limit_profile text not null check(limit_profile in('canary','creator_session')),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  budget_id uuid not null references tongs.owner_operating_budgets(id) on delete restrict,
  maximum_amount_micros bigint not null check(maximum_amount_micros>0),
  maximum_operations integer not null check(maximum_operations>0),
  maximum_concurrency integer not null check(maximum_concurrency=1),
  maximum_attempts smallint not null check(maximum_attempts=1),
  maximum_searches integer not null,
  maximum_sources integer not null,
  maximum_http_attempts integer not null check(maximum_http_attempts=24),
  maximum_input_tokens bigint not null,
  maximum_output_tokens bigint not null,
  failure_loss_limit_micros bigint not null check(failure_loss_limit_micros>=0),
  duration_seconds integer not null check(duration_seconds=86400),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(owner_user_id,workspace_id,authorization_kind,created_at),
  check(limit_profile=authorization_kind),
  check((authorization_kind='canary' and failure_loss_limit_micros=144072)
    or (authorization_kind='creator_session' and failure_loss_limit_micros=4276544)),
  check((authorization_kind='canary' and maximum_searches=1 and maximum_sources=2 and maximum_input_tokens=8000 and maximum_output_tokens=1000)
    or (authorization_kind='creator_session' and maximum_searches=6 and maximum_sources=6 and maximum_input_tokens=128000 and maximum_output_tokens=16384))
);

create table tongs.owner_hearth_research_authorization_events (
  id uuid primary key,
  authorization_id uuid not null references tongs.owner_hearth_research_authorizations(id) on delete restrict,
  sequence integer not null check(sequence>0),
  event_key text not null unique,
  state text not null check(state in('dormant','active','halt_new','closed','expired')),
  started_at timestamptz,
  expires_at timestamptz,
  reason text not null,
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(authorization_id,sequence),
  check((state='dormant' and started_at is null and expires_at is null) or state<>'dormant')
);

create table tongs.owner_hearth_research_model_terms (
  authorization_id uuid not null references tongs.owner_hearth_research_authorizations(id) on delete restrict,
  ordinal smallint not null check(ordinal between 1 and 5),
  provider_model_id text not null,
  display_name text not null,
  cost_policy_revision_id uuid not null references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  aggregate_policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
  direct_provider_ceiling_micros bigint not null check(direct_provider_ceiling_micros>0),
  input_micros_per_million_tokens bigint not null check(input_micros_per_million_tokens>0),
  output_micros_per_million_tokens bigint not null check(output_micros_per_million_tokens>0),
  evidence_status text not null check(evidence_status='verified'),
  evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
  primary key(authorization_id,provider_model_id),
  unique(authorization_id,ordinal),
  check(provider_model_id in('gpt-6-astra','gpt-5.6-sol','gpt-5.6-terra','gpt-5.4-mini-2026-03-17','gpt-5.6-luna'))
);

create table tongs.owner_hearth_research_storage_allowances (
  id uuid primary key,
  proposal_id uuid not null references tongs.owner_hearth_research_activation_proposals(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  budget_id uuid not null references tongs.owner_operating_budgets(id) on delete restrict,
  maximum_amount_micros bigint not null check(maximum_amount_micros=83772),
  maximum_packages integer not null check(maximum_packages=11),
  maximum_recovery_reads_per_package integer not null check(maximum_recovery_reads_per_package=20),
  rate_evidence_status text not null check(rate_evidence_status='verified'),
  evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(owner_user_id,workspace_id,budget_id)
);

create table tongs.owner_hearth_research_quotes (
  quote_id uuid primary key references tongs.customer_spending_quotes(id) on delete restrict,
  authorization_id uuid not null references tongs.owner_hearth_research_authorizations(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  operation_id text not null unique,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  plan_json jsonb not null check(jsonb_typeof(plan_json)='object'),
  plan_fingerprint text not null check(plan_fingerprint~'^[0-9a-f]{64}$'),
  provider_model_id text not null,
  direct_provider_ceiling_micros bigint not null,
  search_ceiling_micros bigint not null check(search_ceiling_micros in(5000,30000)),
  platform_ceiling_micros bigint not null check(platform_ceiling_micros=1456),
  storage_ceiling_micros bigint not null check(storage_ceiling_micros in(7612,7616)),
  aggregate_risk_micros bigint not null check(aggregate_risk_micros=3),
  maximum_owner_commitment_micros bigint not null,
  quote_hash text not null unique check(quote_hash~'^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check(maximum_owner_commitment_micros=direct_provider_ceiling_micros+search_ceiling_micros+platform_ceiling_micros+storage_ceiling_micros)
);

create table tongs.owner_hearth_research_operations (
  id uuid primary key,
  authorization_id uuid not null references tongs.owner_hearth_research_authorizations(id) on delete restrict,
  quote_id uuid not null unique references tongs.owner_hearth_research_quotes(quote_id) on delete restrict,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  operation_id text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  provider_model_id text not null,
  cost_policy_revision_id uuid not null references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  aggregate_policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
  direct_provider_ceiling_micros bigint not null,
  storage_ceiling_micros bigint not null check(storage_ceiling_micros in(7612,7616)),
  full_cost_ceiling_micros bigint not null,
  limit_profile text not null check(limit_profile in('canary','creator_session')),
  maximum_searches integer not null,
  maximum_sources integer not null,
  maximum_http_attempts integer not null check(maximum_http_attempts=24),
  maximum_input_tokens bigint not null,
  maximum_output_tokens bigint not null,
  execution_deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  check(execution_deadline_at<=created_at+interval '61 seconds')
);

create table tongs.owner_hearth_research_stage_events (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  stage_key text not null,
  sequence integer not null check(sequence>0),
  stage_type text not null check(stage_type in('search','retrieval')),
  stage_ordinal integer not null check(stage_ordinal between 1 and 24),
  event_type text not null check(event_type in('authorized','captured','failed','submission_unknown')),
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  maximum_supplier_cost_micros bigint not null check(maximum_supplier_cost_micros>=0),
  actual_supplier_cost_micros bigint check(actual_supplier_cost_micros is null or actual_supplier_cost_micros>=0),
  cost_status text not null check(cost_status in('not_incurred','estimated','authoritative')),
  request_json jsonb not null default '{}'::jsonb check(jsonb_typeof(request_json)='object'),
  capture_json jsonb check(capture_json is null or jsonb_typeof(capture_json)='object'),
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(reservation_id,stage_key,sequence)
);
create unique index owner_hearth_research_one_terminal_stage_event
  on tongs.owner_hearth_research_stage_events(reservation_id,stage_key)
  where event_type in('captured','failed','submission_unknown');

create table tongs.owner_hearth_research_component_expenses (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  expense_key text not null unique,
  component text not null check(component in('search','retrieval','synthesis','platform_execution','database_write','delivery','recovery_read','continuing_storage')),
  amount_micros bigint not null check(amount_micros>=0),
  cost_status text not null check(cost_status in('estimated','authoritative')),
  supplier text not null,
  evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);

create table tongs.owner_hearth_research_frozen_requests (
  reservation_id uuid primary key references tongs.funding_reservations(id) on delete restrict,
  operation_id text not null unique,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  source_revision_fingerprint text not null check(source_revision_fingerprint~'^[0-9a-f]{64}$'),
  model text not null,
  instruction_revision text not null,
  serialized_body text not null,
  serialized_body_sha256 text not null check(serialized_body_sha256~'^[0-9a-f]{64}$'),
  serialized_bytes bigint not null check(serialized_bytes>0),
  tokenizer_revision text not null,
  tokenizer_input_tokens bigint not null check(tokenizer_input_tokens>0),
  protocol_overhead_tokens bigint not null check(protocol_overhead_tokens>=0),
  bounded_input_tokens bigint not null check(bounded_input_tokens>0 and bounded_input_tokens<=128000),
  maximum_output_tokens bigint not null check(maximum_output_tokens=16384),
  maximum_attempts smallint not null default 1 check(maximum_attempts=1),
  created_at timestamptz not null default now()
);

create table tongs.owner_hearth_research_result_packages (
  id uuid primary key,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  operation_id text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  provider_request_id text,
  input_units bigint not null check(input_units>=0),
  output_units bigint not null check(output_units>=0),
  result_json jsonb not null check(jsonb_typeof(result_json)='object'),
  research_result_json jsonb not null check(jsonb_typeof(research_result_json)='object'),
  result_hash text not null check(result_hash~'^[0-9a-f]{64}$'),
  review_state text not null check(review_state in('ready_for_review','accepted','changes_requested','rejected')),
  created_at timestamptz not null default now()
);

create table tongs.owner_hearth_research_source_records (
  id uuid primary key,
  result_package_id uuid not null references tongs.owner_hearth_research_result_packages(id) on delete restrict,
  ordinal integer not null check(ordinal between 1 and 6),
  source_id text not null,
  canonical_url text,
  source_fingerprint text not null check(source_fingerprint~'^[0-9a-f]{64}$'),
  source_json jsonb not null check(jsonb_typeof(source_json)='object'),
  created_at timestamptz not null default now(),
  unique(result_package_id,ordinal),
  unique(result_package_id,source_id)
);

create table tongs.owner_hearth_research_review_events (
  id uuid primary key,
  result_package_id uuid not null references tongs.owner_hearth_research_result_packages(id) on delete restrict,
  sequence integer not null check(sequence>0),
  event_key text not null unique,
  review_state text not null check(review_state in('ready_for_review','accepted','changes_requested','rejected')),
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  unique(result_package_id,sequence)
);

create table tongs.owner_hearth_research_recovery_reads (
  id uuid primary key,
  result_package_id uuid not null references tongs.owner_hearth_research_result_packages(id) on delete restrict,
  ordinal integer not null check(ordinal between 1 and 20),
  read_key text not null unique,
  estimated_cost_micros bigint not null check(estimated_cost_micros>=0),
  created_at timestamptz not null default now(),
  unique(result_package_id,ordinal)
);

do $$ declare n text; begin foreach n in array array[
 'owner_hearth_research_activation_proposals','owner_hearth_research_proposal_events','owner_hearth_research_authorizations',
 'owner_hearth_research_authorization_events','owner_hearth_research_model_terms','owner_hearth_research_storage_allowances',
 'owner_hearth_research_quotes','owner_hearth_research_operations','owner_hearth_research_stage_events',
 'owner_hearth_research_component_expenses','owner_hearth_research_frozen_requests','owner_hearth_research_result_packages',
 'owner_hearth_research_source_records','owner_hearth_research_review_events','owner_hearth_research_recovery_reads'
] loop
 execute format('alter table tongs.%I enable row level security',n);
 execute format('alter table tongs.%I force row level security',n);
 execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
 execute format('grant select on tongs.%I to service_role',n);
 execute format('create trigger %I before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n||'_immutable',n);
end loop; end $$;

create policy owner_hearth_research_result_read on tongs.owner_hearth_research_result_packages for select to authenticated
 using(owner_user_id=auth.uid() and exists(select 1 from tongs.workspace_members m where m.workspace_id=workspace_id and m.user_id=auth.uid()));
create policy owner_hearth_research_source_read on tongs.owner_hearth_research_source_records for select to authenticated
 using(exists(select 1 from tongs.owner_hearth_research_result_packages p join tongs.workspace_members m on m.workspace_id=p.workspace_id
   where p.id=result_package_id and p.owner_user_id=auth.uid() and m.user_id=auth.uid()));
grant select on tongs.owner_hearth_research_result_packages,tongs.owner_hearth_research_source_records to authenticated;

create or replace function tongs._owner_hearth_research_latest_authorization(p_owner uuid,p_workspace uuid)
returns tongs.owner_hearth_research_authorizations language sql stable security definer set search_path=pg_catalog as $$
 select a from tongs.owner_hearth_research_authorizations a
 join lateral(select * from tongs.owner_hearth_research_authorization_events e where e.authorization_id=a.id order by e.sequence desc limit 1) ev on true
 where a.owner_user_id=p_owner and a.workspace_id=p_workspace and ev.state in('active','dormant')
   and (ev.expires_at is null or ev.expires_at>now())
 order by (a.authorization_kind='canary') desc,a.created_at limit 1
$$;

create or replace function tongs.read_owner_hearth_research_execution_requirement(p_owner_user_id uuid,p_workspace_id uuid,p_route_code text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a tongs.owner_hearth_research_authorizations%rowtype; ev tongs.owner_hearth_research_authorization_events%rowtype;
begin
 perform tongs._require_pricing_service_role();
 if p_route_code<>'hearth.research_synthesis' then return tongs.read_openai_text_route_execution_requirement(p_route_code); end if;
 if not exists(select 1 from tongs.owner_testing_principals p where p.user_id=p_owner_user_id and p.status='enabled')
   or not exists(select 1 from tongs.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=p_owner_user_id) then
  return tongs.read_openai_text_route_execution_requirement(p_route_code); end if;
 a:=tongs._owner_hearth_research_latest_authorization(p_owner_user_id,p_workspace_id);
 if a.id is null then return tongs.read_openai_text_route_execution_requirement(p_route_code); end if;
 select * into ev from tongs.owner_hearth_research_authorization_events where authorization_id=a.id order by sequence desc limit 1;
 if not exists(select 1 from tongs.owner_hearth_research_storage_allowances s where s.owner_user_id=p_owner_user_id and s.workspace_id=p_workspace_id and s.budget_id=a.budget_id) then
  return jsonb_build_object('route_code',p_route_code,'mode','halt_new','funding_context_required',true,'owner_testing_effective',true,'reason','research_storage_allowance_unverified'); end if;
 return jsonb_build_object('route_code',p_route_code,'mode','enforce','funding_context_required',true,'owner_testing_effective',true,
  'authorization_id',a.id,'authorization_kind',a.authorization_kind,'authorization_state',ev.state,'dedicated_credential_required',true,
  'limit_profile',a.limit_profile,'maximum_searches',a.maximum_searches,'maximum_sources',a.maximum_sources,
  'maximum_http_attempts',a.maximum_http_attempts,'maximum_input_tokens',a.maximum_input_tokens,'maximum_output_tokens',a.maximum_output_tokens,
  'required_provider_model_id',case when a.authorization_kind='canary' then 'gpt-6-astra' else null end);
end $$;

create or replace function tongs.quote_owner_hearth_research_operation(
 p_owner_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,p_request_fingerprint text,p_plan_json jsonb,
 p_requested_provider_model_id text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a tongs.owner_hearth_research_authorizations%rowtype; term tongs.owner_hearth_research_model_terms%rowtype;
 qid uuid:=gen_random_uuid(); op text; qhash text; price tongs.private_pricing_revisions%rowtype; held bigint; consumed bigint;
 accepted_count bigint; storage_amount bigint; search_amount bigint; direct_amount bigint;
begin
 perform tongs._require_pricing_service_role();
 if p_request_fingerprint!~'^[0-9a-f]{64}$' or jsonb_typeof(p_plan_json)<>'object' or p_plan_json->>'schema'<>'forge.hearth.owner-research-plan.v1'
  or p_plan_json->>'route_code'<>'hearth.research_synthesis' or (p_plan_json->>'workspace_id')::uuid<>p_workspace_id
  or (p_plan_json->>'workpiece_id')::uuid<>p_workpiece_id
  or p_expires_at<=now() or p_expires_at>now()+interval '11 minutes' then raise exception 'invalid bounded research plan' using errcode='22023'; end if;
 a:=tongs._owner_hearth_research_latest_authorization(p_owner_user_id,p_workspace_id);
 if a.id is null then raise exception 'owner research authorization is not active' using errcode='42501'; end if;
 if p_plan_json->>'limit_profile'<>a.limit_profile or (p_plan_json->>'maximum_search_requests')::int<>a.maximum_searches
  or (p_plan_json->>'maximum_sources')::int<>a.maximum_sources or (p_plan_json->>'maximum_http_attempts')::int<>a.maximum_http_attempts
  or (p_plan_json->>'maximum_input_tokens')::bigint<>a.maximum_input_tokens or (p_plan_json->>'maximum_output_tokens')::bigint<>a.maximum_output_tokens
  then raise exception 'research plan does not match immutable authorization profile' using errcode='22023'; end if;
 select t.* into term from tongs.owner_hearth_research_model_terms t where t.authorization_id=a.id
  and (nullif(btrim(coalesce(p_requested_provider_model_id,'')),'') is null or t.provider_model_id=btrim(p_requested_provider_model_id))
  and (a.authorization_kind<>'canary' or t.provider_model_id='gpt-6-astra')
  order by t.ordinal limit 1;
 if term.authorization_id is null then raise exception 'requested owner research model is unavailable' using errcode='42501'; end if;
 if a.authorization_kind='canary' and coalesce(nullif(btrim(p_requested_provider_model_id),''),'gpt-6-astra')<>'gpt-6-astra'
  then raise exception 'canary requires GPT-6 Astra' using errcode='42501'; end if;
 direct_amount:=((a.maximum_input_tokens*term.input_micros_per_million_tokens+999999)/1000000)
  +((a.maximum_output_tokens*term.output_micros_per_million_tokens+999999)/1000000);
 search_amount:=a.maximum_searches*5000;
 select * into price from tongs.private_pricing_revisions where id=term.pricing_revision_id;
 select coalesce(sum(c.expense_amount_micros),0) into consumed from tongs.owner_operating_budget_consumptions c where c.budget_id=a.budget_id;
 select coalesce(sum(r.reserved_wholesale_spend_micros),0) into held from tongs.funding_reservations r where r.funding_source_type='owner_budget' and r.funding_source_id=a.budget_id
  and tongs._funding_reservation_state(r.id) not in('settled','released');
 select count(*) into accepted_count from tongs.owner_hearth_research_operations o
  join tongs.owner_hearth_research_authorizations oa on oa.id=o.authorization_id where oa.budget_id=a.budget_id;
 if accepted_count>=11 then raise exception 'owner research package limit reached' using errcode='42501'; end if;
 storage_amount:=case when accepted_count<10 then 7616 else 7612 end;
 op:='owner-research:'||qid::text;
 qhash:=encode(extensions.digest(convert_to(jsonb_build_object('quote_id',qid,'operation_id',op,'plan',p_plan_json,'request_fingerprint',p_request_fingerprint,
  'model',term.provider_model_id,'profile',a.limit_profile,'direct',direct_amount,'search',search_amount,'platform',1456,'storage',storage_amount,'customer',0,'expires_at',p_expires_at)::text,'utf8'),'sha256'),'hex');
 insert into tongs.customer_spending_quotes(id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
  normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,full_cost_ceiling_micros,billable_failure_classes,
  free_failure_classes,included_quantity,retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at)
 values(qid,p_owner_user_id,op,'hearth.research_synthesis',p_workspace_id,price.id,price.revision,'USD',0,0,0,
  direct_amount+search_amount+1456+storage_amount,'[]','["provider_failure","forge_failure","persistence_failure","unknown_fault"]',
  jsonb_build_object('attempts',1,'profile',a.limit_profile,'searches',a.maximum_searches,'sources',a.maximum_sources,'http_attempts',a.maximum_http_attempts,
   'input_tokens',a.maximum_input_tokens,'output_tokens',a.maximum_output_tokens),
  '{"canonical_package":"retained","recovery_reads":20,"continuing_storage":"separately_bounded"}',
  '[{"component":"openai_synthesis","credential_source":"forge_owner_research_isolated"},{"component":"brave_search","credential_source":"forge_owner_research_isolated"}]',
  p_request_fingerprint,qhash,p_expires_at);
 insert into tongs.owner_hearth_research_quotes values(qid,a.id,p_owner_user_id,p_workspace_id,p_workpiece_id,op,p_request_fingerprint,p_plan_json,
  p_request_fingerprint,term.provider_model_id,direct_amount,search_amount,1456,storage_amount,3,direct_amount+search_amount+1456+storage_amount,qhash,p_expires_at,now());
 return jsonb_build_object('quote_id',qid,'operation_id',op,'quote_hash',qhash,'request_fingerprint',p_request_fingerprint,'currency','USD',
  'maximum_customer_charge_micros',0,'failure_customer_charge_micros',0,'maximum_owner_commitment_micros',direct_amount+search_amount+1456+storage_amount,
  'funding_eligible',consumed+held+direct_amount+search_amount+1456+storage_amount<=a.maximum_amount_micros,'funding_source','owner_budget',
  'funding_label','Owner research budget','model_display_name',term.display_name,'provider_model_id',term.provider_model_id,'catalog_revision',2,
  'expires_at',p_expires_at,'cost_components',jsonb_build_object('openai_synthesis_micros',direct_amount,'brave_search_micros',search_amount,
  'platform_support_micros',1456,'continuing_storage_micros',storage_amount,'aggregate_risk_micros',3),'limits',jsonb_build_object('profile',a.limit_profile,
  'search_requests',a.maximum_searches,'retained_sources',a.maximum_sources,'http_attempts',a.maximum_http_attempts,
  'input_tokens',a.maximum_input_tokens,'output_tokens',a.maximum_output_tokens));
end $$;

create or replace function tongs.accept_owner_hearth_research_operation(
 p_owner_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,p_operation_id text,p_quote_id uuid,p_quote_hash text,
 p_request_fingerprint text,p_plan_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare q tongs.owner_hearth_research_quotes%rowtype; a tongs.owner_hearth_research_authorizations%rowtype; ev tongs.owner_hearth_research_authorization_events%rowtype;
 term tongs.owner_hearth_research_model_terms%rowtype; existing tongs.owner_hearth_research_operations%rowtype; rid uuid; count_ops bigint; active_ops bigint;
 consumed bigint; held bigint; seq int; rollout tongs.openai_text_rollout_revisions%rowtype;
begin
 perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('owner-research-accept:'||p_quote_id::text,0));
 select * into existing from tongs.owner_hearth_research_operations where quote_id=p_quote_id;
 if found then return jsonb_build_object('operation_id',existing.operation_id,'reservation_id',existing.reservation_id,'request_fingerprint',existing.request_fingerprint,
  'provider_model_id',existing.provider_model_id,'maximum_output_tokens',existing.maximum_output_tokens,'limit_profile',existing.limit_profile,'replay',true); end if;
 select * into q from tongs.owner_hearth_research_quotes where quote_id=p_quote_id;
 select * into a from tongs.owner_hearth_research_authorizations where id=q.authorization_id for update;
 select * into ev from tongs.owner_hearth_research_authorization_events where authorization_id=a.id order by sequence desc limit 1;
 if q.quote_id is null or q.owner_user_id<>p_owner_user_id or q.workspace_id<>p_workspace_id or q.workpiece_id<>p_workpiece_id
  or q.operation_id<>btrim(p_operation_id) or q.quote_hash<>p_quote_hash or q.request_fingerprint<>p_request_fingerprint or q.plan_json<>p_plan_json
  or q.expires_at<=now() then raise exception 'accepted research quote mismatch or expiry' using errcode='42501'; end if;
 if ev.state='dormant' then
  select coalesce(max(sequence),0)+1 into seq from tongs.owner_hearth_research_authorization_events where authorization_id=a.id;
  insert into tongs.owner_hearth_research_authorization_events values(gen_random_uuid(),a.id,seq,'owner-research:'||a.id::text||':active','active',now(),now()+make_interval(secs=>a.duration_seconds),
   'First accepted operation started the separately approved session.','{"automatic_renewal":false}',now());
  select * into ev from tongs.owner_hearth_research_authorization_events where authorization_id=a.id order by sequence desc limit 1;
 end if;
 if ev.state<>'active' or ev.expires_at<=now() then raise exception 'owner research authorization is not active' using errcode='42501'; end if;
 select * into term from tongs.owner_hearth_research_model_terms where authorization_id=a.id and provider_model_id=q.provider_model_id;
 select count(*) into count_ops from tongs.owner_hearth_research_operations where authorization_id=a.id;
 select count(*) into active_ops from tongs.owner_hearth_research_operations o where o.authorization_id=a.id and tongs._funding_reservation_state(o.reservation_id) in('reserved','provider_attempt_shadowed','submission_unknown');
 if count_ops>=a.maximum_operations or active_ops>=a.maximum_concurrency then raise exception 'owner research operation or concurrency cap reached' using errcode='42501'; end if;
 select coalesce(sum(c.expense_amount_micros),0) into consumed from tongs.owner_operating_budget_consumptions c where c.budget_id=a.budget_id;
 select coalesce(sum(r.reserved_wholesale_spend_micros),0) into held from tongs.funding_reservations r where r.funding_source_type='owner_budget' and r.funding_source_id=a.budget_id
  and tongs._funding_reservation_state(r.id) not in('settled','released');
 if consumed+held+q.maximum_owner_commitment_micros>a.maximum_amount_micros then raise exception 'owner research budget cap exhausted' using errcode='42501'; end if;
 rid:=extensions.uuid_generate_v5(p_quote_id,'owner-research-reservation');
 insert into tongs.customer_spending_quote_acceptances values(gen_random_uuid(),p_quote_id,p_owner_user_id,'owner-research:'||p_quote_id::text,p_quote_hash,now());
 insert into tongs.funding_reservations values(rid,p_quote_id,p_owner_user_id,q.operation_id,'owner_budget',a.budget_id,'USD',0,0,q.maximum_owner_commitment_micros,
  'owner-research:'||rid::text,now());
 insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
  values(gen_random_uuid(),rid,1,'reserved','owner-research:'||rid::text||':reserved',jsonb_build_object('customer_charge_micros',0,'paid_supporting_work_authorized',false));
 select * into rollout from tongs._current_openai_text_rollout('hearth.research_synthesis');
 insert into tongs.openai_text_funding_bindings(operation_id,route_code,reservation_id,credential_funding,model,pricing_revision_id,maximum_input_units,
  maximum_output_units,maximum_attempts,cost_policy_revision_id,rollout_revision)
 values(q.operation_id,'hearth.research_synthesis',rid,'forge',q.provider_model_id,term.pricing_revision_id,a.maximum_input_tokens,a.maximum_output_tokens,1,term.cost_policy_revision_id,rollout.revision);
 insert into tongs.owner_hearth_research_operations(
  id,authorization_id,quote_id,reservation_id,operation_id,owner_user_id,workspace_id,workpiece_id,request_fingerprint,provider_model_id,
  cost_policy_revision_id,pricing_revision_id,aggregate_policy_revision_id,direct_provider_ceiling_micros,storage_ceiling_micros,full_cost_ceiling_micros,
  limit_profile,maximum_searches,maximum_sources,maximum_http_attempts,maximum_input_tokens,maximum_output_tokens,execution_deadline_at,created_at
 ) values(gen_random_uuid(),a.id,p_quote_id,rid,q.operation_id,p_owner_user_id,p_workspace_id,p_workpiece_id,
  p_request_fingerprint,q.provider_model_id,term.cost_policy_revision_id,term.pricing_revision_id,term.aggregate_policy_revision_id,
  q.direct_provider_ceiling_micros,q.storage_ceiling_micros,q.maximum_owner_commitment_micros,a.limit_profile,a.maximum_searches,a.maximum_sources,
  a.maximum_http_attempts,a.maximum_input_tokens,a.maximum_output_tokens,now()+interval '60 seconds',now());
 return jsonb_build_object('operation_id',q.operation_id,'reservation_id',rid,'request_fingerprint',p_request_fingerprint,'provider_model_id',q.provider_model_id,
  'maximum_output_tokens',a.maximum_output_tokens,'limit_profile',a.limit_profile,'replay',false);
end $$;

create or replace function tongs.acquire_owner_hearth_research_aggregate_admission(p_reservation_id uuid,p_caller_class text,p_provider_mode text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o tongs.owner_hearth_research_operations%rowtype; a tongs.owner_hearth_research_authorizations%rowtype; existing tongs.paid_operation_aggregate_bindings%rowtype;
 hold_id uuid; admitted jsonb;
begin
 perform tongs._require_pricing_service_role();
 select * into existing from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if found then return jsonb_build_object('enforcement_enabled',true,'authorized',true,'replay',true,'hold_id',existing.hold_id); end if;
 select * into o from tongs.owner_hearth_research_operations where reservation_id=p_reservation_id;
 select * into a from tongs.owner_hearth_research_authorizations where id=o.authorization_id;
 if o.id is null or p_provider_mode<>'real' or p_caller_class not in('interactive','recovery') then raise exception 'research aggregate context denied' using errcode='42501'; end if;
 hold_id:=extensions.uuid_generate_v5(p_reservation_id,'owner-research-aggregate');
 admitted:=tongs.reserve_restricted_beta_exposure(hold_id,o.aggregate_policy_revision_id,'openai.text.hearth_research',o.operation_id,o.owner_user_id,o.workspace_id,
  o.request_fingerprint,o.provider_model_id,'owner_operating_budget',p_reservation_id::text,'real',p_caller_class,0,o.direct_provider_ceiling_micros,
  o.maximum_searches*5000+1456,o.storage_ceiling_micros,3,0,180,
  'owner-research:'||p_reservation_id::text||':aggregate');
 if coalesce((admitted->>'authorized')::boolean,false) then
  insert into tongs.paid_operation_aggregate_bindings values(p_reservation_id,hold_id,o.aggregate_policy_revision_id,'openai.text.hearth_research','openai',o.operation_id,
   o.owner_user_id,o.workspace_id,o.request_fingerprint,o.provider_model_id,'owner_budget','forge','real',o.pricing_revision_id,o.cost_policy_revision_id,0,
   o.direct_provider_ceiling_micros,o.maximum_searches*5000+1456+o.storage_ceiling_micros,now());
 end if;
 return jsonb_build_object('enforcement_enabled',true)||admitted;
end $$;

create or replace function tongs.begin_owner_hearth_research_stage(
 p_reservation_id uuid,p_stage_key text,p_stage_type text,p_stage_ordinal integer,p_request_fingerprint text,p_request_json jsonb,p_maximum_supplier_cost_micros bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o tongs.owner_hearth_research_operations%rowtype; latest tongs.owner_hearth_research_stage_events%rowtype; searches bigint; captured_bytes bigint;
begin
 perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('owner-research-stage:'||p_reservation_id::text,0));
 select * into o from tongs.owner_hearth_research_operations where reservation_id=p_reservation_id;
 select * into latest from tongs.owner_hearth_research_stage_events where reservation_id=p_reservation_id and stage_key=btrim(p_stage_key) order by sequence desc limit 1;
 if found then
  if latest.event_type='authorized' then
   insert into tongs.owner_hearth_research_stage_events values(gen_random_uuid(),p_reservation_id,btrim(p_stage_key),2,latest.stage_type,latest.stage_ordinal,
    'submission_unknown',latest.request_fingerprint,latest.maximum_supplier_cost_micros,latest.maximum_supplier_cost_micros,'estimated',latest.request_json,null,
    '{"reason":"authorized_stage_reentered_without_capture","duplicate_submission_prohibited":true}',now());
   insert into tongs.owner_hearth_research_component_expenses values(gen_random_uuid(),p_reservation_id,'stage:'||btrim(p_stage_key),latest.stage_type,
    latest.maximum_supplier_cost_micros,'estimated',case when latest.stage_type='search' then 'Brave Search' else 'retrieval origin' end,
    '{"submission_unknown":true}',now()) on conflict(expense_key) do nothing;
   return jsonb_build_object('replay',true,'capture',null,'event_type','submission_unknown');
  end if;
  return jsonb_build_object('replay',true,'capture',latest.capture_json,'event_type',latest.event_type);
 end if;
 if o.id is null or o.request_fingerprint<>p_request_fingerprint or now()>=o.execution_deadline_at or p_stage_ordinal not between 1 and o.maximum_http_attempts
  or p_stage_type not in('search','retrieval') or p_maximum_supplier_cost_micros<>(case when p_stage_type='search' then 5000 else 0 end)
  or not exists(select 1 from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id) then raise exception 'research stage not authorized' using errcode='42501'; end if;
 if exists(select 1 from tongs.owner_hearth_research_stage_events where reservation_id=p_reservation_id and event_type='submission_unknown') then
  raise exception 'research supplier reconciliation required' using errcode='42501'; end if;
 select count(*) into searches from tongs.owner_hearth_research_stage_events where reservation_id=p_reservation_id and stage_type='search' and event_type='authorized';
 if p_stage_type='search' and searches>=o.maximum_searches then raise exception 'research search cap reached' using errcode='42501'; end if;
 select coalesce(sum((capture_json->>'response_bytes')::bigint),0) into captured_bytes from tongs.owner_hearth_research_stage_events
  where reservation_id=p_reservation_id and event_type='captured';
 if captured_bytes>=1048576 then raise exception 'research capture cap reached' using errcode='42501'; end if;
 insert into tongs.owner_hearth_research_stage_events values(gen_random_uuid(),p_reservation_id,btrim(p_stage_key),1,p_stage_type,p_stage_ordinal,'authorized',
  p_request_fingerprint,p_maximum_supplier_cost_micros,null,'not_incurred',p_request_json,null,'{}',now());
 insert into tongs.owner_hearth_research_component_expenses values(gen_random_uuid(),p_reservation_id,'platform:'||p_reservation_id::text,'platform_execution',1456,'estimated',
  'Netlify/Supabase',jsonb_build_object('covers','execution,database writes,initial delivery','rate_verification_required',true),now()) on conflict(expense_key) do nothing;
 return jsonb_build_object('replay',false,'authorized',true);
end $$;

create or replace function tongs._finish_owner_hearth_research_stage(p_reservation_id uuid,p_stage_key text,p_event_type text,p_actual bigint,p_capture jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare first tongs.owner_hearth_research_stage_events%rowtype; latest tongs.owner_hearth_research_stage_events%rowtype; total bigint;
begin
 perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('owner-research-stage:'||p_reservation_id::text,0));
 select * into first from tongs.owner_hearth_research_stage_events where reservation_id=p_reservation_id and stage_key=btrim(p_stage_key) and sequence=1;
 select * into latest from tongs.owner_hearth_research_stage_events where reservation_id=p_reservation_id and stage_key=btrim(p_stage_key) order by sequence desc limit 1;
 if first.id is null then raise exception 'research stage authorization missing' using errcode='42501'; end if;
 if latest.sequence>1 then return jsonb_build_object('replay',true,'event_type',latest.event_type,'capture',latest.capture_json); end if;
 if p_event_type not in('captured','failed','submission_unknown') or p_actual<0 or p_actual>first.maximum_supplier_cost_micros then raise exception 'invalid research stage result' using errcode='22023'; end if;
 if p_event_type='captured' then
  select coalesce(sum((capture_json->>'response_bytes')::bigint),0)+coalesce((p_capture->>'response_bytes')::bigint,0) into total
   from tongs.owner_hearth_research_stage_events where reservation_id=p_reservation_id and event_type='captured';
  if total>1048576 then raise exception 'research capture package cap exceeded' using errcode='22023'; end if;
 end if;
 insert into tongs.owner_hearth_research_stage_events values(gen_random_uuid(),p_reservation_id,btrim(p_stage_key),2,first.stage_type,first.stage_ordinal,p_event_type,
  first.request_fingerprint,first.maximum_supplier_cost_micros,p_actual,case when p_actual=0 then 'estimated' else 'estimated' end,first.request_json,p_capture,coalesce(p_evidence,'{}'),now()) returning * into latest;
 insert into tongs.owner_hearth_research_component_expenses values(gen_random_uuid(),p_reservation_id,'stage:'||btrim(p_stage_key),first.stage_type,p_actual,'estimated',
  case when first.stage_type='search' then 'Brave Search' else 'retrieval origin' end,coalesce(p_evidence,'{}')||jsonb_build_object('event_type',p_event_type),now());
 return jsonb_build_object('replay',false,'event_type',latest.event_type,'capture',latest.capture_json);
end $$;

create or replace function tongs.complete_owner_hearth_research_stage(p_reservation_id uuid,p_stage_key text,p_actual_supplier_cost_micros bigint,p_capture_json jsonb)
returns jsonb language sql security definer set search_path=pg_catalog as $$ select tongs._finish_owner_hearth_research_stage($1,$2,'captured',$3,$4,'{}') $$;
create or replace function tongs.fail_owner_hearth_research_stage(p_reservation_id uuid,p_stage_key text,p_failure_code text,p_actual_supplier_cost_micros bigint,p_evidence_json jsonb)
returns jsonb language sql security definer set search_path=pg_catalog as $$ select tongs._finish_owner_hearth_research_stage($1,$2,'failed',$4,null,coalesce($5,'{}')||jsonb_build_object('failure_code',$3)) $$;
create or replace function tongs.mark_owner_hearth_research_stage_unknown(p_reservation_id uuid,p_stage_key text,p_evidence_json jsonb)
returns jsonb language sql security definer set search_path=pg_catalog as $$ select tongs._finish_owner_hearth_research_stage($1,$2,'submission_unknown',
 (select maximum_supplier_cost_micros from tongs.owner_hearth_research_stage_events where reservation_id=$1 and stage_key=btrim($2) and sequence=1),null,$3) $$;

create or replace function tongs.freeze_owner_hearth_research_synthesis_request(
 p_reservation_id uuid,p_operation_id text,p_request_fingerprint text,p_source_revision_fingerprint text,p_model text,p_instruction_revision text,
 p_serialized_body text,p_serialized_body_sha256 text,p_serialized_bytes bigint,p_tokenizer_revision text,p_tokenizer_input_tokens bigint,
 p_protocol_overhead_tokens bigint,p_bounded_input_tokens bigint,p_maximum_output_tokens bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o tongs.owner_hearth_research_operations%rowtype; f tongs.owner_hearth_research_frozen_requests%rowtype; computed text;
begin
 perform tongs._require_pricing_service_role(); select * into o from tongs.owner_hearth_research_operations where reservation_id=p_reservation_id;
 computed:=encode(extensions.digest(convert_to(p_serialized_body,'utf8'),'sha256'),'hex');
 select * into f from tongs.owner_hearth_research_frozen_requests where reservation_id=p_reservation_id;
 if found then return jsonb_build_object('authorized',f.serialized_body_sha256=p_serialized_body_sha256,'replay',true,'reason','existing_freeze'); end if;
 if o.id is null or o.operation_id<>btrim(p_operation_id) or o.request_fingerprint<>p_request_fingerprint or o.provider_model_id<>p_model
  or now()>=o.execution_deadline_at or p_instruction_revision<>'hearth-research-synthesis-v1' or computed<>p_serialized_body_sha256
  or octet_length(p_serialized_body)<>p_serialized_bytes or p_bounded_input_tokens<>greatest(p_tokenizer_input_tokens+p_protocol_overhead_tokens,p_serialized_bytes)
  or p_bounded_input_tokens>o.maximum_input_tokens or p_maximum_output_tokens<>o.maximum_output_tokens
  or exists(select 1 from tongs.owner_hearth_research_stage_events where reservation_id=p_reservation_id and event_type='submission_unknown') then
  return jsonb_build_object('authorized',false,'reason','frozen_request_outside_accepted_authority'); end if;
 insert into tongs.owner_hearth_research_frozen_requests values(p_reservation_id,btrim(p_operation_id),p_request_fingerprint,p_source_revision_fingerprint,p_model,
  p_instruction_revision,p_serialized_body,p_serialized_body_sha256,p_serialized_bytes,p_tokenizer_revision,p_tokenizer_input_tokens,p_protocol_overhead_tokens,
  p_bounded_input_tokens,p_maximum_output_tokens,1,now());
 return jsonb_build_object('authorized',true,'replay',false);
end $$;

create or replace function tongs.bind_owner_hearth_research_bounded_provider_request(
 p_reservation_id uuid,p_route_code text,p_request_fingerprint text,p_model text,p_service_tier text,p_estimator_revision text,p_tokenizer_revision text,
 p_serialized_body_sha256 text,p_serialized_bytes bigint,p_tokenizer_input_tokens bigint,p_protocol_overhead_tokens bigint,p_utf8_byte_token_upper_bound bigint,
 p_bounded_input_tokens bigint,p_maximum_output_tokens bigint,p_maximum_attempts smallint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o tongs.owner_hearth_research_operations%rowtype; f tongs.owner_hearth_research_frozen_requests%rowtype; q tongs.customer_spending_quotes%rowtype;
 auth tongs.spending_quote_authority_bindings%rowtype; existing tongs.bounded_provider_request_bindings%rowtype; retention_hash text;
begin
 perform tongs._require_pricing_service_role(); select * into o from tongs.owner_hearth_research_operations where reservation_id=p_reservation_id;
 select * into f from tongs.owner_hearth_research_frozen_requests where reservation_id=p_reservation_id; select * into q from tongs.customer_spending_quotes where id=o.quote_id;
 select * into auth from tongs.spending_quote_authority_bindings where quote_id=o.quote_id;
 if o.id is null or f.reservation_id is null or auth.quote_id is null or p_route_code<>'hearth.research_synthesis' or o.request_fingerprint<>p_request_fingerprint
  or o.provider_model_id<>p_model or f.serialized_body_sha256<>p_serialized_body_sha256 or f.serialized_bytes<>p_serialized_bytes
  or f.tokenizer_revision<>p_tokenizer_revision or f.bounded_input_tokens<>p_bounded_input_tokens or f.maximum_output_tokens<>p_maximum_output_tokens
  or p_maximum_attempts<>1 or p_utf8_byte_token_upper_bound<>p_serialized_bytes then raise exception 'final research payload does not match frozen authority' using errcode='42501'; end if;
 select * into existing from tongs.bounded_provider_request_bindings where reservation_id=p_reservation_id;
 if found then
  if existing.serialized_body_sha256<>p_serialized_body_sha256 then raise exception 'research provider binding replay conflict' using errcode='23505'; end if;
  return to_jsonb(existing)||jsonb_build_object('replay',true);
 end if;
 retention_hash:=encode(extensions.digest(convert_to(q.retention_policy::text,'utf8'),'sha256'),'hex');
 insert into tongs.bounded_provider_request_bindings values(p_reservation_id,o.quote_id,o.operation_id,p_route_code,p_request_fingerprint,p_model,p_service_tier,
  o.pricing_revision_id,auth.accepted_authority_hash,retention_hash,p_estimator_revision,p_tokenizer_revision,p_serialized_body_sha256,p_serialized_bytes,
  p_tokenizer_input_tokens,p_protocol_overhead_tokens,p_utf8_byte_token_upper_bound,p_bounded_input_tokens,p_maximum_output_tokens,1,now()) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.resolve_owner_hearth_research_paid_execution_context(
 p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o tongs.owner_hearth_research_operations%rowtype; t tongs.owner_hearth_research_model_terms%rowtype;
begin
 perform tongs._require_pricing_service_role(); select * into o from tongs.owner_hearth_research_operations where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
 select * into t from tongs.owner_hearth_research_model_terms where authorization_id=o.authorization_id and provider_model_id=o.provider_model_id;
 if o.id is null or o.owner_user_id<>p_user_id or o.workspace_id<>p_workspace_id or o.workpiece_id::text<>btrim(p_workpiece_id) or o.request_fingerprint<>p_request_fingerprint
  then raise exception 'exact owner research context required' using errcode='42501'; end if;
 return jsonb_build_object('operation_id',o.operation_id,'reservation_id',o.reservation_id,'quote_id',o.quote_id,'route_code','hearth.research_synthesis',
  'user_id',o.owner_user_id,'workspace_id',o.workspace_id,'workpiece_id',o.workpiece_id,'request_fingerprint',o.request_fingerprint,
  'funding_source_type','owner_budget','credential_funding','forge','model',o.provider_model_id,'maximum_input_units',o.maximum_input_tokens,'maximum_output_units',o.maximum_output_tokens,
  'maximum_attempts',1,'maximum_failure_exposure_micros',o.full_cost_ceiling_micros+3,'direct_provider_ceiling_micros',o.direct_provider_ceiling_micros,
  'supporting_cost_ceiling_micros',1456,'full_cost_ceiling_micros',o.full_cost_ceiling_micros,'input_micros_per_million_tokens',t.input_micros_per_million_tokens,
  'cached_input_micros_per_million_tokens',t.input_micros_per_million_tokens,'output_micros_per_million_tokens',t.output_micros_per_million_tokens,
  'cost_policy_revision_id',o.cost_policy_revision_id,'pricing_revision_id',o.pricing_revision_id,'reservation_state',tongs._funding_reservation_state(o.reservation_id));
end $$;

create or replace function tongs.authorize_owner_hearth_research_openai_attempt(
 p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_caller_class text,p_failure_exposure_micros bigint,p_lease_seconds integer,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o tongs.owner_hearth_research_operations%rowtype; hold tongs.openai_text_failure_exposure_holds%rowtype; aggregate_result jsonb; seq int; lease timestamptz;
begin
 perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('owner-research-openai:'||p_reservation_id::text,0));
 select * into o from tongs.owner_hearth_research_operations where reservation_id=p_reservation_id;
 select * into hold from tongs.openai_text_failure_exposure_holds where attempt_key=btrim(p_attempt_key);
 if found then return jsonb_build_object('provider_execution_authorized',false,'replay',true,'reason','duplicate_attempt_blocked'); end if;
 if o.id is null or p_attempt_number<>1 or p_failure_exposure_micros>o.full_cost_ceiling_micros+3 or now()>=o.execution_deadline_at
  or not exists(select 1 from tongs.owner_hearth_research_frozen_requests where reservation_id=p_reservation_id) then raise exception 'research OpenAI attempt not authorized' using errcode='42501'; end if;
 aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||':aggregate',1,p_caller_class);
 if coalesce((aggregate_result->>'enforcement_enabled')::boolean,false) and not coalesce((aggregate_result->>'authorized')::boolean,false) then
  return jsonb_build_object('provider_execution_authorized',false,'reason',aggregate_result->>'reason'); end if;
 insert into tongs.openai_text_failure_exposure_holds(id,reservation_id,route_code,attempt_key,attempt_number,loss_policy_revision_id,authorized_exposure_micros,lease_expires_at)
 values(gen_random_uuid(),p_reservation_id,'hearth.research_synthesis',btrim(p_attempt_key),1,null,p_failure_exposure_micros,now()+make_interval(secs=>p_lease_seconds)) returning * into hold;
 insert into tongs.openai_text_failure_exposure_events(id,hold_id,sequence,event_key,event_type,actual_supplier_cost_micros,evidence_json)
 values(gen_random_uuid(),hold.id,1,btrim(p_attempt_key)||':loss-authorized','authorized',null,coalesce(p_evidence_json,'{}'));
 select coalesce(max(sequence),0)+1 into seq from tongs.funding_reservation_events where reservation_id=p_reservation_id; lease:=now()+make_interval(secs=>p_lease_seconds);
 insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,provider_attempt_key,lease_expires_at,evidence_json)
 values(gen_random_uuid(),p_reservation_id,seq,'provider_attempt_shadowed','owner-research:'||p_reservation_id::text||':openai',btrim(p_attempt_key),lease,
  coalesce(p_evidence_json,'{}')||'{"customer_charge_micros":0,"duplicate_submission_prohibited":true}');
 return jsonb_build_object('provider_execution_authorized',true,'replay',false,'failure_exposure_hold_id',hold.id,'lease_expires_at',lease);
end $$;

create or replace function tongs.settle_owner_hearth_research_operation(
 p_reservation_id uuid,p_settlement_id uuid,p_settlement_key text,p_outcome text,p_failure_class text,p_actual_fulfillment_cost_micros bigint,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o tongs.owner_hearth_research_operations%rowtype; r tongs.funding_reservations%rowtype; stage_cost bigint; total bigint; seq int; existing tongs.funding_reservation_events%rowtype;
begin
 perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('owner-research-settle:'||p_reservation_id::text,0));
 select * into o from tongs.owner_hearth_research_operations where reservation_id=p_reservation_id; select * into r from tongs.funding_reservations where id=p_reservation_id for update;
 select * into existing from tongs.funding_reservation_events where event_key=btrim(p_settlement_key);
 if found then return jsonb_build_object('reservation_id',p_reservation_id,'state','settled','replay',true,'owner_expense_micros',existing.wholesale_spend_micros,'customer_charge_micros',0); end if;
 insert into tongs.owner_hearth_research_component_expenses values(gen_random_uuid(),p_reservation_id,'synthesis:'||p_reservation_id::text,'synthesis',
  greatest(0,p_actual_fulfillment_cost_micros-1456),'estimated','OpenAI',coalesce(p_evidence_json,'{}')||jsonb_build_object('customer_charge_micros',0),now())
  on conflict(expense_key) do nothing;
 select coalesce(sum(amount_micros),0) into stage_cost from tongs.owner_hearth_research_component_expenses where reservation_id=p_reservation_id and component in('search','retrieval','continuing_storage');
 total:=p_actual_fulfillment_cost_micros+stage_cost;
 if o.id is null or total>r.reserved_wholesale_spend_micros then raise exception 'research settlement exceeds accepted owner commitment' using errcode='42501'; end if;
 if total>0 then perform tongs.consume_owner_operating_budget(p_settlement_id,r.funding_source_id,r.id,'owner-research:'||r.id::text,r.operation_id,total,now(),
  coalesce(p_evidence_json,'{}')||jsonb_build_object('customer_charge_micros',0,'component_expenses_micros',stage_cost)); end if;
 select coalesce(max(sequence),0)+1 into seq from tongs.funding_reservation_events where reservation_id=r.id;
 insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,customer_charge_micros,credit_units,wholesale_spend_micros,failure_class,evidence_json)
 values(gen_random_uuid(),r.id,seq,'settled',btrim(p_settlement_key),0,0,total,nullif(btrim(coalesce(p_failure_class,'')),''),
  coalesce(p_evidence_json,'{}')||jsonb_build_object('customer_revenue_micros',0,'supplier_expenses_retained',true));
 return jsonb_build_object('reservation_id',r.id,'state','settled','replay',false,'owner_expense_micros',total,'customer_charge_micros',0,'customer_revenue_micros',0);
end $$;

create or replace function tongs.settle_owner_hearth_research_before_synthesis(p_reservation_id uuid,p_failure_class text,p_evidence_json jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare amount bigint; sid uuid:=extensions.uuid_generate_v5(p_reservation_id,'pre-synthesis-settlement');
begin
 perform tongs._require_pricing_service_role();
 select coalesce(sum(amount_micros),0) into amount from tongs.owner_hearth_research_component_expenses where reservation_id=p_reservation_id;
 return tongs.settle_owner_hearth_research_operation(p_reservation_id,sid,'owner-research:'||p_reservation_id::text||':pre-synthesis','nonbillable_failure',p_failure_class,
  greatest(0,amount-(select coalesce(sum(amount_micros),0) from tongs.owner_hearth_research_component_expenses where reservation_id=p_reservation_id and component in('search','retrieval'))),
  coalesce(p_evidence_json,'{}')||jsonb_build_object('openai_submitted',false,'customer_charge_micros',0));
end $$;

create or replace function tongs.persist_owner_hearth_research_result(
 p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,p_request_fingerprint text,
 p_provider_request_id text,p_input_units bigint,p_output_units bigint,p_result_json jsonb,p_research_result_json jsonb,p_review_state text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o tongs.owner_hearth_research_operations%rowtype; pkg tongs.owner_hearth_research_result_packages%rowtype; source jsonb; ord int:=0; result_hash text;
 allowance tongs.owner_hearth_research_storage_allowances%rowtype; package_ordinal int;
begin
 perform tongs._require_pricing_service_role(); select * into o from tongs.owner_hearth_research_operations where reservation_id=p_reservation_id;
 if o.id is null or o.operation_id<>btrim(p_operation_id) or o.owner_user_id<>p_user_id or o.workspace_id<>p_workspace_id or o.workpiece_id<>p_workpiece_id
  or o.request_fingerprint<>p_request_fingerprint or p_review_state<>'ready_for_review' or octet_length(p_research_result_json::text)>786432
  or jsonb_array_length(coalesce(p_research_result_json->'sources','[]'))>o.maximum_sources then raise exception 'invalid canonical research package' using errcode='42501'; end if;
 select * into pkg from tongs.owner_hearth_research_result_packages where reservation_id=p_reservation_id;
 if found then return pkg.result_json||jsonb_build_object('domain_result_id',pkg.id,'provider_request_id',pkg.provider_request_id,'input_units',pkg.input_units,'output_units',pkg.output_units,'review_state',pkg.review_state); end if;
 result_hash:=encode(extensions.digest(convert_to(jsonb_build_object('result',p_result_json,'research',p_research_result_json)::text,'utf8'),'sha256'),'hex');
 insert into tongs.owner_hearth_research_result_packages values(gen_random_uuid(),p_reservation_id,btrim(p_operation_id),p_user_id,p_workspace_id,p_workpiece_id,
  p_request_fingerprint,nullif(btrim(coalesce(p_provider_request_id,'')),''),p_input_units,p_output_units,p_result_json,p_research_result_json,result_hash,p_review_state,now()) returning * into pkg;
 for source in select value from jsonb_array_elements(coalesce(p_research_result_json->'sources','[]')) loop
  ord:=ord+1;
  insert into tongs.owner_hearth_research_source_records values(gen_random_uuid(),pkg.id,ord,coalesce(nullif(source->>'sourceId',''),'source-'||ord),
   coalesce(source->>'canonicalUrl',source->>'url'),encode(extensions.digest(convert_to(source::text,'utf8'),'sha256'),'hex'),source,now());
 end loop;
 insert into tongs.owner_hearth_research_review_events values(gen_random_uuid(),pkg.id,1,'owner-research-review:'||pkg.id::text||':ready','ready_for_review',p_user_id,null,now());
 insert into tongs.owner_hearth_research_component_expenses values(gen_random_uuid(),p_reservation_id,'database-write:'||pkg.id::text,'database_write',0,
  'estimated','Supabase',jsonb_build_object('covered_by_platform_allocation_micros',1456),now());
 insert into tongs.owner_hearth_research_component_expenses values(gen_random_uuid(),p_reservation_id,'delivery:'||pkg.id::text,'delivery',0,
  'estimated','Netlify/Supabase',jsonb_build_object('covered_by_platform_allocation_micros',1456),now());
 insert into tongs.hearth_research_synthesis_results(operation_id,reservation_id,user_id,workspace_id,workpiece_id,request_fingerprint,provider_request_id,input_units,output_units,result_json)
 values(pkg.operation_id,pkg.reservation_id,pkg.owner_user_id,pkg.workspace_id,pkg.workpiece_id,pkg.request_fingerprint,pkg.provider_request_id,pkg.input_units,pkg.output_units,
  pkg.result_json||jsonb_build_object('research_package_id',pkg.id,'review_state',pkg.review_state));
 select * into allowance from tongs.owner_hearth_research_storage_allowances where owner_user_id=p_user_id and workspace_id=p_workspace_id
  and budget_id=(select a.budget_id from tongs.owner_hearth_research_authorizations a where a.id=o.authorization_id);
 select count(*) into package_ordinal from tongs.owner_hearth_research_result_packages p where p.owner_user_id=p_user_id and p.workspace_id=p_workspace_id;
 if allowance.id is null or package_ordinal>allowance.maximum_packages then raise exception 'research storage allowance exhausted' using errcode='42501'; end if;
 insert into tongs.owner_hearth_research_component_expenses values(gen_random_uuid(),p_reservation_id,'storage:'||pkg.id::text,'continuing_storage',o.storage_ceiling_micros,
  'estimated','Supabase/Netlify',jsonb_build_object('storage_allowance_id',allowance.id,'package_ordinal',package_ordinal,'maximum_packages',11),now());
 return pkg.result_json||jsonb_build_object('domain_result_id',pkg.id,'provider_request_id',pkg.provider_request_id,'input_units',pkg.input_units,'output_units',pkg.output_units,'review_state',pkg.review_state);
end $$;

create or replace function tongs.read_owner_hearth_research_result(p_operation_id text,p_reservation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare pkg tongs.owner_hearth_research_result_packages%rowtype; ordinal int; allowance tongs.owner_hearth_research_storage_allowances%rowtype; latest_review text;
begin
 perform tongs._require_pricing_service_role(); select * into pkg from tongs.owner_hearth_research_result_packages where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
 if pkg.id is null then raise exception 'owner research result not found' using errcode='P0002'; end if;
 select * into allowance from tongs.owner_hearth_research_storage_allowances where owner_user_id=pkg.owner_user_id and workspace_id=pkg.workspace_id;
 select coalesce(max(r.ordinal),0)+1 into ordinal from tongs.owner_hearth_research_recovery_reads r where r.result_package_id=pkg.id;
 if ordinal>allowance.maximum_recovery_reads_per_package then raise exception 'bounded research recovery read limit reached' using errcode='42501'; end if;
 insert into tongs.owner_hearth_research_recovery_reads values(gen_random_uuid(),pkg.id,ordinal,'owner-research-read:'||pkg.id::text||':'||ordinal,0,now());
 insert into tongs.owner_hearth_research_component_expenses values(gen_random_uuid(),p_reservation_id,'recovery-read:'||pkg.id::text||':'||ordinal,'recovery_read',0,'estimated',
  'Netlify/Supabase',jsonb_build_object('covered_by_storage_allowance_id',allowance.id),now());
 select e.review_state into latest_review from tongs.owner_hearth_research_review_events e where e.result_package_id=pkg.id order by e.sequence desc limit 1;
 return pkg.result_json||jsonb_build_object('domain_result_id',pkg.id,'provider_request_id',pkg.provider_request_id,'input_units',pkg.input_units,'output_units',pkg.output_units,
  'review_state',latest_review,'research_result',pkg.research_result_json,'recovery_read_ordinal',ordinal);
end $$;

create or replace function tongs.record_owner_hearth_research_review(p_result_package_id uuid,p_event_key text,p_review_state text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare pkg tongs.owner_hearth_research_result_packages%rowtype; existing tongs.owner_hearth_research_review_events%rowtype; seq int; actor uuid:=auth.uid();
begin
 if actor is null or p_review_state not in('accepted','changes_requested','rejected') then raise exception 'authenticated research review required' using errcode='42501'; end if;
 select * into existing from tongs.owner_hearth_research_review_events where event_key=btrim(p_event_key);
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 select * into pkg from tongs.owner_hearth_research_result_packages where id=p_result_package_id;
 if pkg.id is null or pkg.owner_user_id<>actor or not exists(select 1 from tongs.workspace_members m where m.workspace_id=pkg.workspace_id and m.user_id=actor)
  then raise exception 'research package review denied' using errcode='42501'; end if;
 select coalesce(max(sequence),0)+1 into seq from tongs.owner_hearth_research_review_events where result_package_id=pkg.id;
 insert into tongs.owner_hearth_research_review_events values(gen_random_uuid(),pkg.id,seq,btrim(p_event_key),p_review_state,actor,nullif(btrim(coalesce(p_note,'')),''),now()) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.read_owner_hearth_research_canary_reconciliation(p_authorization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare a tongs.owner_hearth_research_authorizations%rowtype; o tongs.owner_hearth_research_operations%rowtype;
 pkg tongs.owner_hearth_research_result_packages%rowtype; hold tongs.openai_text_failure_exposure_holds%rowtype;
 funding_state text; funding_event tongs.funding_reservation_events%rowtype; loss_event tongs.openai_text_failure_exposure_events%rowtype;
 aggregate_event tongs.restricted_beta_exposure_events%rowtype; source_count bigint; expected_sources bigint; expense_basis text;
begin
 perform tongs._require_pricing_service_role();
 select * into a from tongs.owner_hearth_research_authorizations where id=p_authorization_id;
 if a.id is null or a.authorization_kind<>'canary' or a.limit_profile<>'canary' or a.maximum_operations<>1
  then return jsonb_build_object('reconciled',false,'reason','canary_authorization_mismatch'); end if;
 if (select count(*) from tongs.owner_hearth_research_operations where authorization_id=a.id)<>1
  then return jsonb_build_object('reconciled',false,'reason','canary_operation_count_mismatch'); end if;
 select * into o from tongs.owner_hearth_research_operations where authorization_id=a.id;
 if o.provider_model_id<>'gpt-6-astra' or o.limit_profile<>'canary' or o.maximum_searches<>1 or o.maximum_sources<>2
  or o.maximum_http_attempts<>24 or o.maximum_input_tokens<>8000 or o.maximum_output_tokens<>1000 or o.full_cost_ceiling_micros<>144072
  then return jsonb_build_object('reconciled',false,'reason','canary_operation_authority_mismatch'); end if;
 select tongs._funding_reservation_state(o.reservation_id) into funding_state;
 if funding_state<>'settled' then return jsonb_build_object('reconciled',false,'reason','settlement_not_terminal'); end if;
 select * into funding_event from tongs.funding_reservation_events where reservation_id=o.reservation_id order by sequence desc limit 1;
 if funding_event.event_type<>'settled' or coalesce(funding_event.customer_charge_micros,0)<>0
  then return jsonb_build_object('reconciled',false,'reason','zero_customer_settlement_missing'); end if;
 if exists(select 1 from tongs.owner_hearth_research_stage_events where reservation_id=o.reservation_id and event_type in('authorized','submission_unknown'))
  then return jsonb_build_object('reconciled',false,'reason','supplier_stage_unresolved'); end if;
 if not exists(select 1 from tongs.owner_hearth_research_stage_events where reservation_id=o.reservation_id and stage_type='search' and event_type in('captured','failed'))
  then return jsonb_build_object('reconciled',false,'reason','supplier_stage_evidence_missing'); end if;
 if not exists(select 1 from tongs.paid_operation_aggregate_bindings b where b.reservation_id=o.reservation_id and b.operation_id=o.operation_id
   and b.supplier_exposure_ceiling_micros=130000 and b.supporting_exposure_ceiling_micros=14072)
  then return jsonb_build_object('reconciled',false,'reason','shared_aggregate_binding_missing'); end if;
 select e.* into aggregate_event from tongs.paid_operation_aggregate_bindings b join tongs.restricted_beta_exposure_events e on e.hold_id=b.hold_id
  where b.reservation_id=o.reservation_id order by e.sequence desc limit 1;
 if aggregate_event.id is null or aggregate_event.event_type not in('settled_unconfirmed','reconciled')
  then return jsonb_build_object('reconciled',false,'reason','aggregate_supplier_obligation_not_retained'); end if;
 select * into hold from tongs.openai_text_failure_exposure_holds where reservation_id=o.reservation_id;
 select * into loss_event from tongs.openai_text_failure_exposure_events where hold_id=hold.id order by sequence desc limit 1;
 if hold.id is null or loss_event.id is null or loss_event.event_type not in('success_released','failure_realized','reconciled')
  then return jsonb_build_object('reconciled',false,'reason','provider_attempt_not_terminal'); end if;
 if loss_event.event_type='unresolved' or (loss_event.event_type='authorized' and hold.lease_expires_at>now())
  then return jsonb_build_object('reconciled',false,'reason','provider_lease_or_obligation_unresolved'); end if;
 if not exists(select 1 from tongs.owner_hearth_research_frozen_requests f where f.reservation_id=o.reservation_id and f.operation_id=o.operation_id
   and f.model='gpt-6-astra' and f.maximum_output_tokens=1000)
  or not exists(select 1 from tongs.bounded_provider_request_bindings b where b.reservation_id=o.reservation_id and b.operation_id=o.operation_id
   and b.model='gpt-6-astra' and b.maximum_output_tokens=1000 and b.maximum_attempts=1)
  or not exists(select 1 from tongs.openai_text_provider_captures c where c.reservation_id=o.reservation_id and c.attempt_number=1)
  then return jsonb_build_object('reconciled',false,'reason','frozen_provider_capture_chain_incomplete'); end if;
 select * into pkg from tongs.owner_hearth_research_result_packages where reservation_id=o.reservation_id and operation_id=o.operation_id;
 if pkg.id is null or pkg.request_fingerprint<>o.request_fingerprint or pkg.review_state<>'ready_for_review'
  then return jsonb_build_object('reconciled',false,'reason','canonical_package_missing'); end if;
 select count(*) into source_count from tongs.owner_hearth_research_source_records where result_package_id=pkg.id;
 expected_sources:=jsonb_array_length(coalesce(pkg.research_result_json->'sources','[]'::jsonb));
 if source_count<>expected_sources or source_count>2
  then return jsonb_build_object('reconciled',false,'reason','canonical_sources_mismatch'); end if;
 if not exists(select 1 from tongs.owner_hearth_research_review_events e where e.result_package_id=pkg.id and e.review_state='ready_for_review')
  or not exists(select 1 from tongs.owner_hearth_research_recovery_reads r where r.result_package_id=pkg.id)
  then return jsonb_build_object('reconciled',false,'reason','review_or_recovery_readback_missing'); end if;
 if not ('{search,synthesis,platform_execution,database_write,delivery,continuing_storage}'::text[]
   <@ (select coalesce(array_agg(distinct component),'{}'::text[]) from tongs.owner_hearth_research_component_expenses where reservation_id=o.reservation_id))
  then return jsonb_build_object('reconciled',false,'reason','component_cost_trace_incomplete'); end if;
 select case when bool_and(cost_status='authoritative') then 'authoritative' else 'conservative_estimated' end into expense_basis
  from tongs.owner_hearth_research_component_expenses where reservation_id=o.reservation_id;
 return jsonb_build_object('reconciled',true,'reason','terminal_settlement_with_retained_supplier_exposure','expense_basis',expense_basis,
  'authoritative_provider_billing_required',false,'waiting_period_seconds',0,'customer_charge_micros',0,'automatic_resubmission_allowed',false,
  'reservation_id',o.reservation_id,'operation_id',o.operation_id,'result_package_id',pkg.id);
end $$;

-- Activation is deliberately impossible until a separately recorded approval
-- and verified cost/storage evidence exist. No caller in this migration invokes it.
create or replace function tongs.activate_owner_hearth_research_package(
 p_proposal_id uuid,p_owner_user_id uuid,p_workspace_id uuid,p_budget_id uuid,p_canary_authorization_id uuid,p_session_authorization_id uuid,
 p_storage_allowance_id uuid,p_verified_model_terms jsonb,p_storage_evidence_json jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform tongs._require_pricing_service_role();
 if p_proposal_id<>'91000000-0000-4000-8000-000000000001' or not exists(select 1 from tongs.owner_hearth_research_proposal_events e where e.proposal_id=p_proposal_id and e.event_type='approved')
  or jsonb_typeof(p_verified_model_terms)<>'array' or jsonb_array_length(p_verified_model_terms)<>5
  or coalesce(p_storage_evidence_json->>'status','')<>'verified' then raise exception 'separate owner approval and verified rate/storage evidence required' using errcode='42501'; end if;
 raise exception 'activation handoff requires the separately approved deployment transaction' using errcode='42501';
end $$;

do $$ declare sig text; begin foreach sig in array array[
 'read_owner_hearth_research_execution_requirement(uuid,uuid,text)','quote_owner_hearth_research_operation(uuid,uuid,uuid,text,jsonb,text,timestamptz)',
 'accept_owner_hearth_research_operation(uuid,uuid,uuid,text,uuid,text,text,jsonb)','acquire_owner_hearth_research_aggregate_admission(uuid,text,text)',
 'begin_owner_hearth_research_stage(uuid,text,text,integer,text,jsonb,bigint)','complete_owner_hearth_research_stage(uuid,text,bigint,jsonb)',
 'fail_owner_hearth_research_stage(uuid,text,text,bigint,jsonb)','mark_owner_hearth_research_stage_unknown(uuid,text,jsonb)',
 'freeze_owner_hearth_research_synthesis_request(uuid,text,text,text,text,text,text,text,bigint,text,bigint,bigint,bigint,bigint)',
 'bind_owner_hearth_research_bounded_provider_request(uuid,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,smallint)',
 'resolve_owner_hearth_research_paid_execution_context(text,uuid,uuid,uuid,text,text)',
 'authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)',
 'settle_owner_hearth_research_operation(uuid,uuid,text,text,text,bigint,jsonb)','settle_owner_hearth_research_before_synthesis(uuid,text,jsonb)',
 'persist_owner_hearth_research_result(text,uuid,uuid,uuid,uuid,text,text,bigint,bigint,jsonb,jsonb,text)',
 'read_owner_hearth_research_result(text,uuid)','read_owner_hearth_research_canary_reconciliation(uuid)',
 'activate_owner_hearth_research_package(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text)'
] loop
 execute format('revoke all on function tongs.%s from public,anon,authenticated',sig);
 execute format('grant execute on function tongs.%s to service_role',sig);
end loop; end $$;

revoke all on function tongs.record_owner_hearth_research_review(uuid,text,text,text) from public,anon;
grant execute on function tongs.record_owner_hearth_research_review(uuid,text,text,text) to authenticated,service_role;

comment on table tongs.owner_hearth_research_activation_proposals is 'Exact $21.526788 owner research proposal. Presence is not approval or activation.';
comment on function tongs.activate_owner_hearth_research_package(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text) is 'Intentional approval boundary: remains fail-closed until a separately approved activation migration implements the verified deployment transaction.';
notify pgrst,'reload schema';
commit;
