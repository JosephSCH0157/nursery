-- Inactive, server-owned restricted-beta admission and aggregate Forge exposure accounting.
-- This migration creates no spending budget, chooses no loss limit, enrolls no user, and
-- changes no existing Runway/OpenAI rollout. An active policy must be added separately.
begin;

create table tongs.paid_capability_inventory_revisions (
 id uuid primary key,
 capability_code text not null,
 revision integer not null check(revision>0),
 provider text not null,
 cost_kind text not null check(cost_kind in ('provider','compute','support','continuing')),
 callers_json jsonb not null check(jsonb_typeof(callers_json)='array'),
 credential_sources_json jsonb not null check(jsonb_typeof(credential_sources_json)='array'),
 current_enforcement text not null check(current_enforcement in ('enforced','partial','legacy_unfunded','external_configuration','continuing_unmetered')),
 fallback_behavior text not null,
 known_limits_json jsonb not null default '{}'::jsonb check(jsonb_typeof(known_limits_json)='object'),
 bypass_status text not null check(bypass_status in ('none_known','known_bypass','external_bypass','not_applicable')),
 restricted_beta_disposition text not null check(restricted_beta_disposition in ('retain_existing_enforcement','eligible_when_covered','block_until_covered')),
 evidence_status text not null check(evidence_status in ('verified','estimated','incomplete','external_attestation_required')),
 evidence_checked_at timestamptz not null,
 notes text not null,
 created_at timestamptz not null default now(),
 unique(capability_code,revision)
);

insert into tongs.paid_capability_inventory_revisions
(id,capability_code,revision,provider,cost_kind,callers_json,credential_sources_json,current_enforcement,fallback_behavior,known_limits_json,bypass_status,restricted_beta_disposition,evidence_status,evidence_checked_at,notes)
values
('51000000-0000-4000-8000-000000000001','openai.text.hearth_chat',1,'openai','provider','["Hearth chat UI","server Hearth handler","recovery"]','["OPENAI_TEXT_API_KEY","OPENAI_API_KEY","exact BYO"]','enforced','enforce mode requires accepted funding; inactive transport is legacy pass-through','{"attempts":1}','none_known','retain_existing_enforcement','verified','2026-09-09T00:00:00Z','Existing bounded Hearth coordinator; ordinary non-beta rollout remains separately controlled.'),
('51000000-0000-4000-8000-000000000002','openai.text.hearth_research',1,'openai','provider','["Hearth research UI","Hearth server handler","background synthesis","recovery"]','["OPENAI_TEXT_API_KEY","OPENAI_API_KEY","exact BYO"]','partial','inactive OpenAI transport can pass through legacy caller','{"attempts_max":1}','known_bypass','eligible_when_covered','verified','2026-09-09T00:00:00Z','Certified adapter exists; ordinary production transport remains inactive.'),
('51000000-0000-4000-8000-000000000003','openai.text.visual_unified_plan',1,'openai','provider','["visual planning UI","unified visual provider","background recovery"]','["OPENAI_TEXT_API_KEY","OPENAI_API_KEY","exact BYO"]','partial','inactive OpenAI transport can pass through legacy caller','{"attempts_max":1}','known_bypass','eligible_when_covered','verified','2026-09-09T00:00:00Z','Supporting search/extraction is excluded unless separately covered.'),
('51000000-0000-4000-8000-000000000004','openai.text.visual_narrative',1,'openai','provider','["visual planning UI","narrative provider","background recovery"]','["OPENAI_TEXT_API_KEY","OPENAI_API_KEY","exact BYO"]','partial','inactive OpenAI transport can pass through legacy caller','{"attempts_max":1}','known_bypass','eligible_when_covered','verified','2026-09-09T00:00:00Z','Certified adapter exists; ordinary production transport remains inactive.'),
('51000000-0000-4000-8000-000000000005','openai.text.motion_broll',1,'openai','provider','["motion planning UI","b-roll interpretation provider","background recovery"]','["OPENAI_TEXT_API_KEY","OPENAI_API_KEY","exact BYO"]','partial','inactive OpenAI transport can pass through legacy caller','{"attempts_max":1}','known_bypass','eligible_when_covered','verified','2026-09-09T00:00:00Z','Runway generation is a distinct separately funded boundary.'),
('51000000-0000-4000-8000-000000000006','openai.text.hammer_cleanup',1,'openai','provider','["Hammer preparation script","transcript cleanup","retry/recovery"]','["OPENAI_TEXT_API_KEY","OPENAI_API_KEY","exact BYO"]','partial','inactive OpenAI transport can pass through legacy caller','{"attempts_max":1}','known_bypass','eligible_when_covered','verified','2026-09-09T00:00:00Z','Transcription is excluded and must be separately authorized.'),
('51000000-0000-4000-8000-000000000007','openai.text.shorts_discovery',1,'openai','provider','["Hammer shorts discovery","background discovery","recovery"]','["OPENAI_TEXT_API_KEY","OPENAI_API_KEY","exact BYO"]','partial','inactive OpenAI transport can pass through legacy caller','{"attempts_max":1}','known_bypass','eligible_when_covered','verified','2026-09-09T00:00:00Z','Certified adapter exists; ordinary production transport remains inactive.'),
('51000000-0000-4000-8000-000000000008','openai.text.quench_metadata',1,'openai','provider','["Quench metadata UI","metadata provider","background recovery"]','["OPENAI_TEXT_API_KEY","OPENAI_API_KEY","exact BYO"]','partial','inactive OpenAI transport can pass through legacy caller','{"attempts_max":1}','known_bypass','eligible_when_covered','verified','2026-09-09T00:00:00Z','Publishing calls are separate and are not authorized by a text quote.'),
('51000000-0000-4000-8000-000000000009','openai.image',1,'openai','provider','["image generation","image edit","visual asset jobs"]','["OPENAI_IMAGE_API_KEY","OPENAI_API_KEY","BYO"]','legacy_unfunded','provider calls are not connected to the shared funding coordinator','{}','known_bypass','block_until_covered','verified','2026-09-09T00:00:00Z','Generation and edits both require exact SKU pricing and funding.'),
('51000000-0000-4000-8000-000000000010','openai.audio',1,'openai','provider','["Anvil Whisper handler","workpiece job runner","Hammer prep"]','["OPENAI_API_KEY","BYO","Hugging Face fallback"]','legacy_unfunded','caller-specific provider fallback can create a different paid boundary','{}','known_bypass','block_until_covered','verified','2026-09-09T00:00:00Z','Transcription duration, attempts, and exact provider must be bound.'),
('51000000-0000-4000-8000-000000000011','runway.video',1,'runway','provider','["b-roll generation","poller","reconciliation"]','["FORGE_BROLL_RUNWAY_API_KEY","exact BYO"]','enforced','missing exact funding fails closed; polling/reconciliation remain available','{"submission_concurrency":1}','none_known','retain_existing_enforcement','verified','2026-09-09T00:00:00Z','Existing Runway enforce/halt_new boundary remains authoritative.'),
('51000000-0000-4000-8000-000000000012','brave.search',1,'brave','provider','["Hearth research","topic discovery","research runtime"]','["HEARTH_RESEARCH_API_KEY","HEARTH_RESEARCH_BRAVE_API_KEY","BRAVE_SEARCH_API_KEY","BRAVE_API_KEY"]','legacy_unfunded','missing key may disable search but is not a spending control','{}','known_bypass','block_until_covered','verified','2026-09-09T00:00:00Z','Search calls need their own unit rate, quota, and attempt policy.'),
('51000000-0000-4000-8000-000000000013','extraction.remote',1,'external','support','["Hearth research extraction","reference ingestion","background enrichment"]','["caller-specific remote endpoint or account"]','legacy_unfunded','absence or failure may fall back to incomplete local content','{}','known_bypass','block_until_covered','incomplete','2026-09-09T00:00:00Z','Every remote extractor and enrichment service requires provider registry evidence.'),
('51000000-0000-4000-8000-000000000014','huggingface.inference',1,'huggingface','provider','["Anvil transcription","model routing","background ASR"]','["HUGGINGFACE_API_TOKEN","HF_TOKEN","BYO"]','legacy_unfunded','OpenAI/Hugging Face fallback is caller-specific','{}','known_bypass','block_until_covered','verified','2026-09-09T00:00:00Z','Exact inference provider/model and duration must be priced.'),
('51000000-0000-4000-8000-000000000015','fly.probe',1,'fly.io','compute','["brand media inspection","server probe fallback"]','["Netlify caller token","Supabase caller token","worker token"]','partial','service authentication exists but no monetary reservation','{}','known_bypass','block_until_covered','verified','2026-09-09T00:00:00Z','Caller auth is containment, not funded authorization.'),
('51000000-0000-4000-8000-000000000016','fly.transcode',1,'fly.io','compute','["Hammer FFmpeg client","transcode fallback","background worker"]','["Netlify caller token","Supabase caller token","worker token"]','partial','service authentication exists but no monetary reservation','{}','known_bypass','block_until_covered','verified','2026-09-09T00:00:00Z','Duration/input/output limits exist but need operation-scoped funding.'),
('51000000-0000-4000-8000-000000000017','fly.render',1,'fly.io','compute','["background effect renderer","Hammer worker"]','["Netlify caller token","Supabase caller token","worker token"]','partial','service authentication exists but no monetary reservation','{}','known_bypass','block_until_covered','verified','2026-09-09T00:00:00Z','Render compute needs an exact cost and operation token.'),
('51000000-0000-4000-8000-000000000018','postmark.auth_email',1,'postmark','support','["Supabase Auth SMTP"]','["Supabase externally configured SMTP credential"]','external_configuration','Supabase can invoke SMTP outside repository call sites','{}','external_bypass','block_until_covered','external_attestation_required','2026-09-09T00:00:00Z','Inventory from dashboard/invoice; do not infer inactivity from absent SDK calls.'),
('51000000-0000-4000-8000-000000000019','storage.persistence',1,'supabase','continuing','["canonical Tongs persistence","media uploads","retention jobs"]','["Supabase session/service role"]','continuing_unmetered','cost continues after provider completion','{}','not_applicable','block_until_covered','estimated','2026-09-09T00:00:00Z','Canonical content must never be deleted merely to satisfy a financial threshold.'),
('51000000-0000-4000-8000-000000000020','delivery.egress',1,'supabase_netlify','continuing','["customer result delivery","media playback/download","background export"]','["Supabase session/service role","Netlify runtime"]','continuing_unmetered','delivery can continue after settlement','{}','not_applicable','block_until_covered','estimated','2026-09-09T00:00:00Z','Cached and uncached paths must not be charged simultaneously.');

create table tongs.openai_text_rate_condition_revisions (
 id uuid primary key,
 provider_rate_revision_id uuid not null references tongs.openai_text_provider_rate_revisions(id) on delete restrict,
 revision integer not null check(revision>0),
 service_tier text not null check(service_tier in ('standard','batch','flex','fast')),
 cache_write_micros_per_million_tokens bigint,
 long_context_threshold_tokens bigint,
 long_context_input_multiplier_millis integer,
 long_context_cached_input_multiplier_millis integer,
 long_context_output_multiplier_millis integer,
 reasoning_billing_rule text not null,
 source_url text not null check(source_url like 'https://developers.openai.com/%'),
 source_retrieved_at timestamptz not null,
 lifecycle_state text not null check(lifecycle_state in ('draft','approved','retired')),
 notes text not null,
 created_at timestamptz not null default now(),
 unique(provider_rate_revision_id,revision),
 check((long_context_threshold_tokens is null and long_context_input_multiplier_millis is null and long_context_cached_input_multiplier_millis is null and long_context_output_multiplier_millis is null)
   or (long_context_threshold_tokens>0 and long_context_input_multiplier_millis>0 and long_context_cached_input_multiplier_millis>0 and long_context_output_multiplier_millis>0))
);

insert into tongs.openai_text_rate_condition_revisions(id,provider_rate_revision_id,revision,service_tier,cache_write_micros_per_million_tokens,long_context_threshold_tokens,long_context_input_multiplier_millis,long_context_cached_input_multiplier_millis,long_context_output_multiplier_millis,reasoning_billing_rule,source_url,source_retrieved_at,lifecycle_state,notes) values
('51100000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,'standard',12500000,272000,2000,2000,1500,'Reasoning tokens are included in billed output tokens and must fit the output ceiling.','https://developers.openai.com/api/docs/models/gpt-6-astra','2026-09-09T16:00:00Z','draft','Any request above 272K input is activation-ineligible until its doubled input/cache and 1.5x output ceiling is explicitly quoted.'),
('51100000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000001',1,'standard',5000000,272000,2000,2000,1500,'Reasoning tokens are included in billed output tokens and must fit the output ceiling.','https://developers.openai.com/api/docs/models/gpt-5.6-sol','2026-09-09T16:00:00Z','draft','Promotional standard rate; accepted quotes bind this exact rate revision and expiry review.'),
('51100000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000002',1,'standard',2500000,272000,2000,2000,1500,'Reasoning tokens are included in billed output tokens and must fit the output ceiling.','https://developers.openai.com/api/docs/models/gpt-5.6-terra','2026-09-09T16:00:00Z','draft','Long-context multiplier is retained even though current route input bounds are below the threshold.'),
('51100000-0000-4000-8000-000000000004','56560000-0000-4000-8000-000000000001',1,'standard',250000,null,null,null,null,'Reasoning tokens are included in billed output tokens and must fit the output ceiling.','https://developers.openai.com/api/docs/models/gpt-5.6-luna','2026-09-09T16:00:00Z','draft','Implicit cache writes can be reported; maximum pricing must reserve for writes or explicitly disable implicit caching.'),
('51100000-0000-4000-8000-000000000005','53500000-0000-4000-8000-000000000002',1,'standard',null,null,null,null,null,'Reasoning tokens are included in billed output tokens and must fit the output ceiling.','https://developers.openai.com/api/docs/models/gpt-5-mini','2026-09-09T16:00:00Z','draft','Deprecated pinned snapshot and unpinned alias are not activation eligible.');

create table tongs.restricted_beta_policy_revisions (
 id uuid primary key,
 environment text not null check(environment in ('test','production')),
 revision integer not null check(revision>0),
 lifecycle_state text not null check(lifecycle_state in ('draft','active','halt_new','retired')),
 aggregate_forge_exposure_limit_micros bigint check(aggregate_forge_exposure_limit_micros>0),
 reserved_headroom_micros bigint check(reserved_headroom_micros>=0),
 maximum_concurrency integer check(maximum_concurrency>0),
 rolling_window_seconds integer check(rolling_window_seconds>0),
 evidence_max_age_seconds integer check(evidence_max_age_seconds>0),
 allocation_policy_revision_id uuid,
 tail_policy_revision_id uuid,
 reason text not null,
 created_at timestamptz not null default now(),
 unique(environment,revision),
 check(lifecycle_state='draft' or (aggregate_forge_exposure_limit_micros is not null and reserved_headroom_micros is not null and maximum_concurrency is not null and rolling_window_seconds is not null and evidence_max_age_seconds is not null))
);

create table tongs.restricted_beta_allocation_policy_revisions (
 id uuid primary key,
 revision integer not null unique check(revision>0),
 option_code text not null check(option_code in ('subscription_revenue_pool','fixed_volume_allocation')),
 lifecycle_state text not null check(lifecycle_state in ('draft','active','retired')),
 monthly_fixed_cost_micros bigint not null check(monthly_fixed_cost_micros>=0),
 assumed_monthly_operations integer,
 fixed_allocation_per_operation_micros bigint,
 subscription_revenue_allocation_limit_micros bigint,
 notes text not null,
 created_at timestamptz not null default now(),
 check((option_code='subscription_revenue_pool' and assumed_monthly_operations is null and fixed_allocation_per_operation_micros is null)
    or (option_code='fixed_volume_allocation' and assumed_monthly_operations>0 and fixed_allocation_per_operation_micros>=0))
);

create table tongs.restricted_beta_tail_policy_revisions (
 id uuid primary key,
 revision integer not null unique check(revision>0),
 lifecycle_state text not null check(lifecycle_state in ('draft','active','retired')),
 first_period_days integer not null check(first_period_days>0),
 first_period_storage_ceiling_bytes bigint not null check(first_period_storage_ceiling_bytes>0),
 after_first_period_policy text not null check(after_first_period_policy in ('plan_funded','recurring_metered','unfunded_block')),
 warning_threshold_basis_points integer check(warning_threshold_basis_points between 1 and 10000),
 halt_threshold_basis_points integer check(halt_threshold_basis_points between 1 and 10000),
 deletion_on_threshold boolean not null default false check(deletion_on_threshold=false),
 notes text not null,
 created_at timestamptz not null default now()
);

insert into tongs.restricted_beta_allocation_policy_revisions values
('52000000-0000-4000-8000-000000000001',1,'subscription_revenue_pool','draft',45000000,null,null,45000000,'Option A: allocate at most $45 of already recognized eligible subscription-cycle revenue; never recognize it twice.',now()),
('52000000-0000-4000-8000-000000000002',2,'fixed_volume_allocation','draft',45000000,500,90000,null,'Option B: $0.09 per completed operation assumes 500 completions; the $45 expense is recorded once.',now());

insert into tongs.restricted_beta_tail_policy_revisions values
('53000000-0000-4000-8000-000000000001',1,'draft',30,1048576,'plan_funded',7000,8000,false,'Proposal only: canonical content remains; warning/halt stops new work, never deletes creator data.',now()),
('53000000-0000-4000-8000-000000000002',2,'draft',30,1048576,'recurring_metered',7000,8000,false,'Alternative proposal only: assign continuing bytes to a versioned recurring funded pool.',now());

alter table tongs.restricted_beta_policy_revisions
 add constraint restricted_beta_policy_allocation_fk foreign key(allocation_policy_revision_id) references tongs.restricted_beta_allocation_policy_revisions(id) on delete restrict,
 add constraint restricted_beta_policy_tail_fk foreign key(tail_policy_revision_id) references tongs.restricted_beta_tail_policy_revisions(id) on delete restrict;

insert into tongs.restricted_beta_policy_revisions(id,environment,revision,lifecycle_state,reason)
values('54000000-0000-4000-8000-000000000001','production',1,'draft','Preparation only: no aggregate limit, loss allowance, allocation choice, storage choice, enrollment, or spending authorization.');

create table tongs.restricted_beta_cost_evidence_revisions (
 id uuid primary key,
 capability_code text not null,
 revision integer not null check(revision>0),
 evidence_state text not null check(evidence_state in ('verified_rate','estimated_allocation','synthetic_test','unresolved')),
 coverage_state text not null check(coverage_state in ('complete','incomplete')),
 source_reference text not null,
 observed_at timestamptz not null,
 valid_until timestamptz not null,
 included_capacity_json jsonb not null default '{}'::jsonb check(jsonb_typeof(included_capacity_json)='object'),
 reserved_headroom_json jsonb not null default '{}'::jsonb check(jsonb_typeof(reserved_headroom_json)='object'),
 latency_json jsonb not null default '{}'::jsonb check(jsonb_typeof(latency_json)='object'),
 hard_cap_scope text not null,
 notes text not null,
 created_at timestamptz not null default now(),
 unique(capability_code,revision),
 check(valid_until>observed_at)
);

create table tongs.restricted_beta_policy_capabilities (
 id uuid primary key,
 policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
 capability_code text not null,
 admission_mode text not null check(admission_mode in ('covered','block','existing_enforced')),
 cost_evidence_revision_id uuid references tongs.restricted_beta_cost_evidence_revisions(id) on delete restrict,
 maximum_attempts smallint check(maximum_attempts between 1 and 4),
 maximum_concurrency integer check(maximum_concurrency>0),
 per_operation_supplier_ceiling_micros bigint check(per_operation_supplier_ceiling_micros>=0),
 per_operation_supporting_ceiling_micros bigint check(per_operation_supporting_ceiling_micros>=0),
 per_operation_tail_ceiling_micros bigint check(per_operation_tail_ceiling_micros>=0),
 permitted_callers_json jsonb not null default '["interactive"]'::jsonb check(jsonb_typeof(permitted_callers_json)='array'),
 exact_model_or_sku text,
 notes text not null,
 created_at timestamptz not null default now(),
 unique(policy_revision_id,capability_code),
 check(admission_mode='block' or (cost_evidence_revision_id is not null and maximum_attempts is not null and maximum_concurrency is not null and per_operation_supplier_ceiling_micros is not null and per_operation_supporting_ceiling_micros is not null and per_operation_tail_ceiling_micros is not null and nullif(btrim(exact_model_or_sku),'') is not null))
);

insert into tongs.restricted_beta_policy_capabilities(id,policy_revision_id,capability_code,admission_mode,notes)
select extensions.uuid_generate_v5('54000000-0000-4000-8000-000000000001'::uuid,capability_code),'54000000-0000-4000-8000-000000000001',capability_code,'block','Draft default: uncovered actions stop before cost once a future policy enrolls traffic.'
from tongs.paid_capability_inventory_revisions where revision=1;

create table tongs.restricted_beta_exposure_holds (
 id uuid primary key,
 policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
 capability_term_id uuid not null references tongs.restricted_beta_policy_capabilities(id) on delete restrict,
 operation_identity text not null unique check(length(btrim(operation_identity)) between 8 and 300),
 user_id uuid references auth.users(id) on delete restrict,
 workspace_id uuid references tongs.workspaces(id) on delete restrict,
 request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
 model_or_sku text not null,
 funding_class text not null check(funding_class in ('verified_customer_deposit','economically_backed_allowance','owner_operating_budget','test_customer','byo')),
 funding_handle_hash text not null check(funding_handle_hash ~ '^[0-9a-f]{64}$'),
 provider_mode text not null check(provider_mode in ('real','simulated','byo')),
 caller_class text not null check(caller_class in ('interactive','background','retry','recovery')),
 customer_funding_ceiling_micros bigint not null check(customer_funding_ceiling_micros>=0),
 supplier_exposure_ceiling_micros bigint not null check(supplier_exposure_ceiling_micros>=0),
 supporting_exposure_ceiling_micros bigint not null check(supporting_exposure_ceiling_micros>=0),
 tail_exposure_ceiling_micros bigint not null check(tail_exposure_ceiling_micros>=0),
 unreconciled_exposure_ceiling_micros bigint not null check(unreconciled_exposure_ceiling_micros>=0),
 retry_exposure_ceiling_micros bigint not null check(retry_exposure_ceiling_micros>=0),
 lease_expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 check(not(provider_mode='real' and funding_class='test_customer'))
);

create table tongs.restricted_beta_exposure_events (
 id uuid primary key,
 hold_id uuid not null references tongs.restricted_beta_exposure_holds(id) on delete restrict,
 sequence integer not null check(sequence>0),
 event_key text not null unique,
 event_type text not null check(event_type in ('reserved','attempt_started','ambiguous','customer_relieved_supplier_obligation','supplier_recovery','released','reconciled')),
 attempt_number smallint,
 supplier_obligation_micros bigint check(supplier_obligation_micros is null or supplier_obligation_micros>=0),
 supplier_recovery_micros bigint check(supplier_recovery_micros is null or supplier_recovery_micros>=0),
 customer_funding_delta_micros bigint not null default 0,
 forge_loss_delta_micros bigint not null default 0,
 evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
 created_at timestamptz not null default now(),
 unique(hold_id,sequence)
);

do $$ declare n text; begin
 foreach n in array array['paid_capability_inventory_revisions','openai_text_rate_condition_revisions','restricted_beta_policy_revisions','restricted_beta_allocation_policy_revisions','restricted_beta_tail_policy_revisions','restricted_beta_cost_evidence_revisions','restricted_beta_policy_capabilities','restricted_beta_exposure_holds','restricted_beta_exposure_events'] loop
  execute format('alter table tongs.%I enable row level security',n);
  execute format('alter table tongs.%I force row level security',n);
  execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
  execute format('grant select,insert on tongs.%I to service_role',n);
  execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n,n);
 end loop;
end $$;

create or replace function tongs.reserve_restricted_beta_exposure(
 p_hold_id uuid,p_policy_revision_id uuid,p_capability_code text,p_operation_identity text,
 p_user_id uuid,p_workspace_id uuid,p_request_fingerprint text,p_model_or_sku text,
 p_funding_class text,p_opaque_funding_handle text,p_provider_mode text,p_caller_class text,
 p_customer_funding_ceiling_micros bigint,p_supplier_exposure_ceiling_micros bigint,
 p_supporting_exposure_ceiling_micros bigint,p_tail_exposure_ceiling_micros bigint,
 p_unreconciled_exposure_ceiling_micros bigint,p_retry_exposure_ceiling_micros bigint,
 p_lease_seconds integer,p_event_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare pol tongs.restricted_beta_policy_revisions%rowtype; term tongs.restricted_beta_policy_capabilities%rowtype;
 existing tongs.restricted_beta_exposure_holds%rowtype; ev tongs.restricted_beta_cost_evidence_revisions%rowtype;
 requested bigint; committed bigint; concurrent_count bigint;
begin
 perform tongs._require_pricing_service_role();
 select * into pol from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id;
 if not found or pol.lifecycle_state='draft' then return jsonb_build_object('authorized',false,'reason','restricted_beta_inactive'); end if;
 if pol.lifecycle_state<>'active' then return jsonb_build_object('authorized',false,'reason','halt_new'); end if;
 perform pg_advisory_xact_lock(hashtext('restricted-beta:'||pol.environment));
 select * into existing from tongs.restricted_beta_exposure_holds where operation_identity=btrim(p_operation_identity);
 if found then
  if existing.request_fingerprint<>lower(p_request_fingerprint) or existing.model_or_sku<>p_model_or_sku then raise exception 'operation binding mismatch' using errcode='22023'; end if;
  return jsonb_build_object('authorized',true,'replay',true,'hold_id',existing.id);
 end if;
 select * into term from tongs.restricted_beta_policy_capabilities where policy_revision_id=pol.id and capability_code=p_capability_code;
 if not found or term.admission_mode='block' then return jsonb_build_object('authorized',false,'reason','capability_not_covered'); end if;
 select * into ev from tongs.restricted_beta_cost_evidence_revisions where id=term.cost_evidence_revision_id;
 if not found or ev.coverage_state<>'complete' or ev.evidence_state='unresolved' or ev.valid_until<=now() or ev.observed_at < now()-make_interval(secs=>pol.evidence_max_age_seconds) then
  return jsonb_build_object('authorized',false,'reason','cost_evidence_stale_or_incomplete');
 end if;
 if p_model_or_sku<>term.exact_model_or_sku then return jsonb_build_object('authorized',false,'reason','model_or_sku_mismatch'); end if;
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 if p_provider_mode='real' and p_funding_class='test_customer' then return jsonb_build_object('authorized',false,'reason','test_funding_real_provider_forbidden'); end if;
 if nullif(btrim(p_opaque_funding_handle),'') is null then return jsonb_build_object('authorized',false,'reason','funding_context_required'); end if;
 if p_supplier_exposure_ceiling_micros>term.per_operation_supplier_ceiling_micros or p_supporting_exposure_ceiling_micros>term.per_operation_supporting_ceiling_micros or p_tail_exposure_ceiling_micros>term.per_operation_tail_ceiling_micros then
  return jsonb_build_object('authorized',false,'reason','operation_ceiling_exceeded');
 end if;
 requested:=p_supplier_exposure_ceiling_micros+p_supporting_exposure_ceiling_micros+p_tail_exposure_ceiling_micros+p_unreconciled_exposure_ceiling_micros+p_retry_exposure_ceiling_micros;
 select coalesce(sum(h.supplier_exposure_ceiling_micros+h.supporting_exposure_ceiling_micros+h.tail_exposure_ceiling_micros+h.unreconciled_exposure_ceiling_micros+h.retry_exposure_ceiling_micros),0),count(*) into committed,concurrent_count
 from tongs.restricted_beta_exposure_holds h
 join lateral(select e.event_type from tongs.restricted_beta_exposure_events e where e.hold_id=h.id order by e.sequence desc limit 1) last on true
 where h.policy_revision_id=pol.id and last.event_type in ('reserved','attempt_started','ambiguous','customer_relieved_supplier_obligation') and h.created_at>=now()-make_interval(secs=>pol.rolling_window_seconds);
 if concurrent_count>=pol.maximum_concurrency then return jsonb_build_object('authorized',false,'reason','aggregate_concurrency_exhausted','committed_micros',committed); end if;
 if committed+requested+pol.reserved_headroom_micros>pol.aggregate_forge_exposure_limit_micros then return jsonb_build_object('authorized',false,'reason','aggregate_exposure_exhausted','committed_micros',committed,'requested_micros',requested); end if;
 insert into tongs.restricted_beta_exposure_holds(id,policy_revision_id,capability_term_id,operation_identity,user_id,workspace_id,request_fingerprint,model_or_sku,funding_class,funding_handle_hash,provider_mode,caller_class,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros,tail_exposure_ceiling_micros,unreconciled_exposure_ceiling_micros,retry_exposure_ceiling_micros,lease_expires_at)
 values(p_hold_id,pol.id,term.id,btrim(p_operation_identity),p_user_id,p_workspace_id,lower(p_request_fingerprint),p_model_or_sku,p_funding_class,encode(extensions.digest(convert_to(p_opaque_funding_handle,'utf8'),'sha256'),'hex'),p_provider_mode,p_caller_class,p_customer_funding_ceiling_micros,p_supplier_exposure_ceiling_micros,p_supporting_exposure_ceiling_micros,p_tail_exposure_ceiling_micros,p_unreconciled_exposure_ceiling_micros,p_retry_exposure_ceiling_micros,now()+make_interval(secs=>p_lease_seconds));
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,customer_funding_delta_micros,evidence_json)
 values(extensions.uuid_generate_v5(p_hold_id,'reserved'),p_hold_id,1,p_event_key,'reserved',p_customer_funding_ceiling_micros,jsonb_build_object('caller_class',p_caller_class));
 return jsonb_build_object('authorized',true,'replay',false,'hold_id',p_hold_id,'aggregate_before_micros',committed,'reserved_exposure_micros',requested);
end $$;

create or replace function tongs.begin_restricted_beta_attempt(p_hold_id uuid,p_event_key text,p_attempt_number smallint,p_caller_class text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare h tongs.restricted_beta_exposure_holds%rowtype; term tongs.restricted_beta_policy_capabilities%rowtype; last_type text; existing tongs.restricted_beta_exposure_events%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into existing from tongs.restricted_beta_exposure_events where event_key=p_event_key;
 if found then return jsonb_build_object('authorized',false,'reason','duplicate_attempt','replay',true); end if;
 select * into h from tongs.restricted_beta_exposure_holds where id=p_hold_id for update;
 if not found then raise exception 'unknown exposure hold' using errcode='22023'; end if;
 select * into term from tongs.restricted_beta_policy_capabilities where id=h.capability_term_id;
 select event_type into last_type from tongs.restricted_beta_exposure_events where hold_id=h.id order by sequence desc limit 1;
 if last_type in ('ambiguous','customer_relieved_supplier_obligation','released','reconciled') then return jsonb_build_object('authorized',false,'reason','reconciliation_only'); end if;
 if p_attempt_number>term.maximum_attempts then return jsonb_build_object('authorized',false,'reason','attempt_limit'); end if;
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,attempt_number,evidence_json)
 select extensions.uuid_generate_v5(h.id,p_event_key),h.id,coalesce(max(sequence),0)+1,p_event_key,'attempt_started',p_attempt_number,jsonb_build_object('caller_class',p_caller_class) from tongs.restricted_beta_exposure_events where hold_id=h.id;
 return jsonb_build_object('authorized',true,'replay',false,'hold_id',h.id);
end $$;

create or replace function tongs.record_restricted_beta_exposure_outcome(p_hold_id uuid,p_event_key text,p_event_type text,p_supplier_obligation_micros bigint default null,p_supplier_recovery_micros bigint default null,p_customer_funding_delta_micros bigint default 0,p_forge_loss_delta_micros bigint default 0,p_evidence_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare h tongs.restricted_beta_exposure_holds%rowtype; existing tongs.restricted_beta_exposure_events%rowtype;
begin
 perform tongs._require_pricing_service_role();
 if p_event_type not in ('ambiguous','customer_relieved_supplier_obligation','supplier_recovery','released','reconciled') then raise exception 'invalid outcome' using errcode='22023'; end if;
 select * into existing from tongs.restricted_beta_exposure_events where event_key=p_event_key;
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 select * into h from tongs.restricted_beta_exposure_holds where id=p_hold_id for update;
 if not found then raise exception 'unknown exposure hold' using errcode='22023'; end if;
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,supplier_obligation_micros,supplier_recovery_micros,customer_funding_delta_micros,forge_loss_delta_micros,evidence_json)
 select extensions.uuid_generate_v5(h.id,p_event_key),h.id,coalesce(max(sequence),0)+1,p_event_key,p_event_type,p_supplier_obligation_micros,p_supplier_recovery_micros,p_customer_funding_delta_micros,p_forge_loss_delta_micros,coalesce(p_evidence_json,'{}'::jsonb) from tongs.restricted_beta_exposure_events where hold_id=h.id returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.read_restricted_beta_financial_controls_admin()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not tongs.is_platform_operator(auth.uid()) then raise exception 'platform operator required' using errcode='42501'; end if;
 return jsonb_build_object(
  'policies',(select coalesce(jsonb_agg(to_jsonb(x) order by revision desc),'[]'::jsonb) from tongs.restricted_beta_policy_revisions x),
  'capabilities',(select coalesce(jsonb_agg(to_jsonb(x) order by capability_code),'[]'::jsonb) from tongs.paid_capability_inventory_revisions x),
  'allocation_options',(select coalesce(jsonb_agg(to_jsonb(x) order by revision),'[]'::jsonb) from tongs.restricted_beta_allocation_policy_revisions x),
  'tail_options',(select coalesce(jsonb_agg(to_jsonb(x) order by revision),'[]'::jsonb) from tongs.restricted_beta_tail_policy_revisions x),
  'exposure',(select jsonb_build_object('customer_funding_micros',coalesce(sum(customer_funding_delta_micros),0),'supplier_obligations_micros',coalesce(sum(supplier_obligation_micros),0)-coalesce(sum(supplier_recovery_micros),0),'forge_loss_micros',coalesce(sum(forge_loss_delta_micros),0)) from tongs.restricted_beta_exposure_events)
 );
end $$;

revoke all on function tongs.reserve_restricted_beta_exposure(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,integer,text) from public,anon,authenticated;
revoke all on function tongs.begin_restricted_beta_attempt(uuid,text,smallint,text) from public,anon,authenticated;
revoke all on function tongs.record_restricted_beta_exposure_outcome(uuid,text,text,bigint,bigint,bigint,bigint,jsonb) from public,anon,authenticated;
revoke all on function tongs.read_restricted_beta_financial_controls_admin() from public,anon,authenticated;
grant execute on function tongs.reserve_restricted_beta_exposure(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,integer,text) to service_role;
grant execute on function tongs.begin_restricted_beta_attempt(uuid,text,smallint,text) to service_role;
grant execute on function tongs.record_restricted_beta_exposure_outcome(uuid,text,text,bigint,bigint,bigint,bigint,jsonb) to service_role;
grant execute on function tongs.read_restricted_beta_financial_controls_admin() to authenticated;

comment on table tongs.restricted_beta_exposure_events is 'Append-only separation of customer funding, supplier obligations/recoveries, and Forge loss; ambiguous work remains reconciliation-only.';
comment on function tongs.reserve_restricted_beta_exposure(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,integer,text) is 'Atomic service-only aggregate admission across routes and users. No active policy exists in this migration.';

commit;
