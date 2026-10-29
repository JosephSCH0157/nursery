-- Hammer first-transcription execution contract.
--
-- This migration installs only private contracts and service-only RPCs. It
-- inserts no provider rate, price, capacity fact, customer scope, quote,
-- reservation, aggregate hold, operation, attempt, credential, or rollout.
-- Production activation remains a separate owner-authorized write.
begin;

alter table tongs.hammer_transcription_provider_authorities
  drop constraint hammer_transcription_provider_autho_financial_environment_check;
alter table tongs.hammer_transcription_provider_authorities
  add constraint hammer_transcription_provider_author_financial_environment_check
  check (financial_environment in ('test','live'));

create table tongs.hammer_first_transcription_capacity_authorities (
  id uuid primary key,
  project_ref text not null check (project_ref='wtvdjndyxegudufrompx'),
  evidence_sha256 text not null unique check (evidence_sha256~'^[0-9a-f]{64}$'),
  checked_at timestamptz not null,
  expires_at timestamptz not null check (expires_at>checked_at),
  netlify_plan text not null check (netlify_plan='pro'),
  netlify_remaining_credit_microunits bigint not null check (netlify_remaining_credit_microunits>=671178),
  supabase_plan text not null check (supabase_plan='pro'),
  supabase_spend_cap_enabled boolean not null check (supabase_spend_cap_enabled),
  supabase_remaining_uncached_egress_bytes bigint not null check (supabase_remaining_uncached_egress_bytes>=243332008),
  supabase_remaining_database_bytes bigint not null check (supabase_remaining_database_bytes>=8388608),
  observed_active_hammer_operations integer not null check (observed_active_hammer_operations=0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table tongs.hammer_first_transcription_activation_authorities (
  id uuid primary key,
  financial_environment text not null check (financial_environment in ('test','live')),
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  canonical_recording_id uuid not null references tongs.canonical_recordings(id) on delete restrict,
  recording_revision_id uuid not null references tongs.recording_revisions(id) on delete restrict,
  completion_id uuid not null references tongs.anvil_recording_completion_requests(id) on delete restrict,
  media_sha256 text not null check (media_sha256~'^[0-9a-f]{64}$'),
  media_bytes bigint not null check (media_bytes=120617428),
  verified_duration_ms bigint not null check (verified_duration_ms=603848),
  provider_authority_id uuid not null references tongs.hammer_transcription_provider_authorities(id) on delete restrict,
  capacity_authority_id uuid not null references tongs.hammer_first_transcription_capacity_authorities(id) on delete restrict,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  aggregate_policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
  supplier_ceiling_micros bigint not null check (supplier_ceiling_micros=38589),
  supporting_cost_ceiling_micros bigint not null check (supporting_cost_ceiling_micros=6000),
  complete_wholesale_ceiling_micros bigint not null check (complete_wholesale_ceiling_micros=44589),
  customer_credit_units bigint not null check (customer_credit_units=12),
  maximum_customer_charge_micros bigint not null check (maximum_customer_charge_micros=60000),
  maximum_provider_attempts smallint not null check (maximum_provider_attempts=1),
  maximum_concurrency smallint not null check (maximum_concurrency=1),
  automatic_retries smallint not null check (automatic_retries=0),
  valid_from timestamptz not null,
  valid_until timestamptz not null check (valid_until>valid_from),
  reason text not null check (length(btrim(reason)) between 8 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(user_id,canonical_recording_id,recording_revision_id)
);

create table tongs.hammer_first_transcription_activation_consumptions (
  id uuid primary key,
  activation_authority_id uuid not null unique references tongs.hammer_first_transcription_activation_authorities(id) on delete restrict,
  operation_id uuid not null unique references tongs.hammer_transcription_operations(id) on delete restrict,
  provider_attempt_id uuid not null unique references tongs.hammer_transcription_provider_attempts(id) on delete restrict,
  consumed_at timestamptz not null default clock_timestamp()
);

create table tongs.hammer_first_transcription_quote_bindings (
  quote_id uuid primary key references tongs.customer_spending_quotes(id) on delete restrict,
  activation_authority_id uuid not null references tongs.hammer_first_transcription_activation_authorities(id) on delete restrict,
  operation_uuid uuid not null unique,
  operation_id text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  request_fingerprint text not null check (request_fingerprint~'^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

do $$ declare n text; begin
  foreach n in array array[
    'hammer_first_transcription_capacity_authorities',
    'hammer_first_transcription_activation_authorities',
    'hammer_first_transcription_activation_consumptions',
    'hammer_first_transcription_quote_bindings'
  ] loop
    execute format('alter table tongs.%I enable row level security',n);
    execute format('alter table tongs.%I force row level security',n);
    execute format('revoke all on table tongs.%I from public,anon,authenticated,service_role',n);
    execute format('grant select,insert on table tongs.%I to service_role',n);
    execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n,n);
  end loop;
end $$;

alter table tongs.hammer_transcription_operations
  drop constraint hammer_transcription_operations_execution_authorized_check;
alter table tongs.hammer_transcription_operations
  add constraint hammer_transcription_operations_execution_authorized_state_check
  check (not execution_authorized or state in ('queued','processing','submission_unknown','failed','completed'));

create or replace function tongs._enforce_hammer_transcription_operation_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if row(
    new.operation_id,new.request_fingerprint,new.route_code,new.financial_environment,
    new.user_id,new.workspace_id,new.workpiece_id,new.canonical_recording_id,
    new.recording_revision_id,new.completion_id,new.media_revision,new.media_path,
    new.media_sha256,new.media_bytes,new.media_content_type,new.verified_duration_ms,
    new.duration_evidence_source,new.provider_authority_id,new.quote_id,new.reservation_id,
    new.aggregate_hold_id,new.accepted_customer_charge_micros,new.supplier_ceiling_micros,
    new.supporting_cost_ceiling_micros,new.complete_wholesale_ceiling_micros,
    new.maximum_provider_attempts,new.created_at
  ) is distinct from row(
    old.operation_id,old.request_fingerprint,old.route_code,old.financial_environment,
    old.user_id,old.workspace_id,old.workpiece_id,old.canonical_recording_id,
    old.recording_revision_id,old.completion_id,old.media_revision,old.media_path,
    old.media_sha256,old.media_bytes,old.media_content_type,old.verified_duration_ms,
    old.duration_evidence_source,old.provider_authority_id,old.quote_id,old.reservation_id,
    old.aggregate_hold_id,old.accepted_customer_charge_micros,old.supplier_ceiling_micros,
    old.supporting_cost_ceiling_micros,old.complete_wholesale_ceiling_micros,
    old.maximum_provider_attempts,old.created_at
  ) then raise exception 'Hammer transcription operation authority is immutable' using errcode='42501'; end if;
  if old.execution_authorized and not new.execution_authorized then
    raise exception 'Hammer execution authorization cannot be rearmed' using errcode='42501';
  end if;
  if old.state in ('failed','completed','submission_unknown') and new.state<>old.state then
    raise exception 'Terminal Hammer transcription state is immutable' using errcode='42501';
  end if;
  if new.settled_at is not null and new.canonical_transcript_id is null then
    raise exception 'Canonical transcript persistence is required before settlement' using errcode='23514';
  end if;
  new.updated_at:=now(); return new;
end $$;

grant update(execution_authorized) on tongs.hammer_transcription_operations to service_role;

create or replace function tongs.install_hammer_first_transcription_activation(
  p_activation_id uuid,p_provider_authority_id uuid,p_capacity_authority_id uuid,
  p_actor_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_canonical_recording_id uuid,p_recording_revision_id uuid,p_completion_id uuid,
  p_financial_environment text,p_pricing_revision_id uuid,p_aggregate_policy_revision_id uuid,
  p_account_evidence_sha256 text,p_account_source_url text,p_account_checked_at timestamptz,
  p_account_expires_at timestamptz,p_capacity_evidence_sha256 text,p_capacity_checked_at timestamptz,
  p_capacity_expires_at timestamptz,p_netlify_remaining_credit_microunits bigint,
  p_supabase_remaining_uncached_egress_bytes bigint,p_supabase_remaining_database_bytes bigint,
  p_supabase_spend_cap_enabled boolean,p_valid_from timestamptz,p_valid_until timestamptz,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare source jsonb; pricing tongs.private_pricing_revisions%rowtype; capability tongs.restricted_beta_policy_capabilities%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if not tongs.is_platform_operator(p_actor_id) then raise exception 'platform operator required' using errcode='42501'; end if;
  if p_workspace_id<>'cc5478ff-37be-403e-824c-467fa7da061e'::uuid
     or p_workpiece_id<>'21d16d6a-905b-491e-8761-028789612ae5'::uuid
     or p_canonical_recording_id<>'4cc846e3-187c-46d9-8733-e7402488236c'::uuid
     or p_recording_revision_id<>'9c991aa7-f551-4f03-a4d6-41eb40ef81ec'::uuid
     or p_completion_id<>'bf67d649-1bc2-44ba-9a33-783b3ab523ea'::uuid
  then raise exception 'exact certified first recording required' using errcode='42501'; end if;
  source:=tongs.resolve_hammer_transcription_source_authority(p_workspace_id,p_workpiece_id,p_canonical_recording_id,p_recording_revision_id);
  if source->>'completion_id'<>p_completion_id::text
     or source->>'media_sha256'<>'595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24'
     or (source->>'media_bytes')::bigint<>120617428 or (source->>'duration_ms')::bigint<>603848
  then raise exception 'canonical recording evidence drifted' using errcode='42501'; end if;
  select * into pricing from tongs.private_pricing_revisions where id=p_pricing_revision_id;
  if pricing.lifecycle_state<>'review_ready' or pricing.currency<>'USD' or pricing.markup_basis_points<>3300
     or pricing.full_cost_ceiling_micros<>44589 or pricing.failure_cost_ceiling_micros<>6000
     or pricing.customer_price_ceiling_micros<>60000 or pricing.billable_failure_ceiling_micros<>0
     or pricing.customer_credit_units<>12
     or (select coalesce(sum(success_ceiling_micros),0) from tongs.private_pricing_cost_components where pricing_revision_id=pricing.id)<>44589
  then raise exception 'exact reviewed 12-Credit pricing revision required' using errcode='42501'; end if;
  select * into capability from tongs.restricted_beta_policy_capabilities
    where policy_revision_id=p_aggregate_policy_revision_id and capability_code='assemblyai.transcription.hammer';
  if capability.id is null or capability.admission_mode='block' or capability.maximum_attempts<>1
     or capability.per_operation_supplier_ceiling_micros<38589
     or capability.per_operation_supporting_ceiling_micros<6000
  then raise exception 'exact AssemblyAI aggregate policy required' using errcode='42501'; end if;
  insert into tongs.hammer_transcription_provider_authorities(
    id,provider,model,speaker_labels,financial_environment,supplier_rate_micros_per_hour,
    billing_increment_ms,minimum_billable_ms,supporting_cost_ceiling_micros,source_url,
    account_evidence_sha256,source_checked_at,expires_at,lifecycle_state
  ) values(p_provider_authority_id,'assemblyai','universal-3-5-pro',true,p_financial_environment,
    230000,1000,1000,6000,p_account_source_url,p_account_evidence_sha256,
    p_account_checked_at,p_account_expires_at,'certified_inactive');
  insert into tongs.hammer_first_transcription_capacity_authorities values(
    p_capacity_authority_id,'wtvdjndyxegudufrompx',p_capacity_evidence_sha256,p_capacity_checked_at,
    p_capacity_expires_at,'pro',p_netlify_remaining_credit_microunits,'pro',p_supabase_spend_cap_enabled,
    p_supabase_remaining_uncached_egress_bytes,p_supabase_remaining_database_bytes,0,p_actor_id,now());
  insert into tongs.hammer_first_transcription_activation_authorities(
    id,financial_environment,user_id,workspace_id,workpiece_id,canonical_recording_id,
    recording_revision_id,completion_id,media_sha256,media_bytes,verified_duration_ms,
    provider_authority_id,capacity_authority_id,pricing_revision_id,aggregate_policy_revision_id,
    supplier_ceiling_micros,supporting_cost_ceiling_micros,complete_wholesale_ceiling_micros,
    customer_credit_units,maximum_customer_charge_micros,maximum_provider_attempts,
    maximum_concurrency,automatic_retries,valid_from,valid_until,reason,created_by
  ) values(p_activation_id,p_financial_environment,p_user_id,p_workspace_id,p_workpiece_id,
    p_canonical_recording_id,p_recording_revision_id,p_completion_id,
    '595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24',120617428,603848,
    p_provider_authority_id,p_capacity_authority_id,p_pricing_revision_id,p_aggregate_policy_revision_id,
    38589,6000,44589,12,60000,1,1,0,p_valid_from,p_valid_until,p_reason,p_actor_id);
  return jsonb_build_object('activation_authority_id',p_activation_id,'execution_authorized',false,'maximum_operations',1);
end $$;

create or replace function tongs.create_hammer_first_transcription_quote(
  p_quote_id uuid,p_operation_uuid uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_canonical_recording_id uuid,p_recording_revision_id uuid,p_request_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare authority tongs.hammer_first_transcription_activation_authorities%rowtype; quote jsonb; funding jsonb; quote_row tongs.customer_spending_quotes%rowtype; operation_text text;
begin
  perform tongs._require_pricing_service_role();
  select * into authority from tongs.hammer_first_transcription_activation_authorities a
    where a.user_id=p_user_id and a.workspace_id=p_workspace_id and a.workpiece_id=p_workpiece_id
      and a.canonical_recording_id=p_canonical_recording_id and a.recording_revision_id=p_recording_revision_id
      and clock_timestamp()>=a.valid_from and clock_timestamp()<a.valid_until
      and not exists(select 1 from tongs.hammer_first_transcription_activation_consumptions c where c.activation_authority_id=a.id);
  if authority.id is null then raise exception 'paid_submissions_halted' using errcode='42501'; end if;
  operation_text:='hammer-assemblyai:'||p_operation_uuid::text;
  quote:=tongs.create_shadow_spending_quote(p_quote_id,p_user_id,operation_text,'hammer.transcript_prep',p_workspace_id,
    authority.pricing_revision_id,p_request_fingerprint,
    jsonb_build_array(jsonb_build_object('component','assemblyai_transcription','provider_label','AssemblyAI Universal-3.5 Pro with speaker labels','credential_source','forge')),
    least(authority.valid_until,clock_timestamp()+interval '15 minutes'));
  insert into tongs.hammer_first_transcription_quote_bindings(quote_id,activation_authority_id,operation_uuid,operation_id,user_id,request_fingerprint)
  values(p_quote_id,authority.id,p_operation_uuid,operation_text,p_user_id,p_request_fingerprint) on conflict(quote_id) do nothing;
  select * into quote_row from tongs.customer_spending_quotes where id=p_quote_id;
  funding:=tongs._select_customer_funding_for_quote(p_quote_id);
  return jsonb_build_object('quote_id',quote_row.id,'operation_id',operation_text,
    'quote_hash',quote_row.quote_hash,'request_fingerprint',quote_row.request_fingerprint,
    'customer_credit_units',quote_row.customer_credit_units,'maximum_customer_charge_micros',quote_row.normal_maximum_charge_micros,
    'funding_eligible',coalesce((funding->>'eligible')::boolean,false),'funding_label',coalesce(funding->>'customer_label','No verified eligible funds'),
    'expires_at',quote_row.expires_at,'accepted',exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=quote_row.id));
end $$;

create or replace function tongs.reserve_hammer_first_transcription_quote(
  p_quote_id uuid,p_reservation_id uuid,p_user_id uuid,p_operation_uuid uuid,
  p_request_fingerprint text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare binding tongs.hammer_first_transcription_quote_bindings%rowtype; authority tongs.hammer_first_transcription_activation_authorities%rowtype;
  quote_row tongs.customer_spending_quotes%rowtype; funding jsonb; reserved jsonb; admitted jsonb; hold_id uuid; source jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into binding from tongs.hammer_first_transcription_quote_bindings where quote_id=p_quote_id;
  select * into authority from tongs.hammer_first_transcription_activation_authorities where id=binding.activation_authority_id;
  select * into quote_row from tongs.customer_spending_quotes where id=p_quote_id;
  if binding.user_id<>p_user_id or binding.operation_uuid<>p_operation_uuid or binding.request_fingerprint<>p_request_fingerprint
     or quote_row.id is null or not exists(select 1 from tongs.customer_spending_quote_acceptances a where a.quote_id=p_quote_id and a.user_id=p_user_id and a.accepted_quote_hash=quote_row.quote_hash)
     or clock_timestamp()>=authority.valid_until
     or exists(select 1 from tongs.hammer_first_transcription_activation_consumptions c where c.activation_authority_id=authority.id)
  then raise exception 'accepted exact first-transcription quote required' using errcode='42501'; end if;
  funding:=tongs._select_customer_funding_for_quote(p_quote_id);
  if coalesce((funding->>'eligible')::boolean,false) is not true then raise exception 'insufficient verified funding' using errcode='P0001'; end if;
  reserved:=tongs.reserve_operation(p_reservation_id,p_quote_id,funding->>'funding_source',(funding->>'funding_source_id')::uuid,p_idempotency_key);
  hold_id:=extensions.uuid_generate_v5(p_reservation_id,'aggregate-exposure');
  admitted:=tongs.reserve_restricted_beta_exposure(hold_id,authority.aggregate_policy_revision_id,'assemblyai.transcription.hammer',
    binding.operation_id,p_user_id,authority.workspace_id,p_request_fingerprint,'universal-3-5-pro:diarization',
    tongs._aggregate_funding_class((select r from tongs.funding_reservations r where r.id=p_reservation_id)),
    p_reservation_id::text,'real','interactive',quote_row.normal_maximum_charge_micros,38589,6000,0,0,0,900,
    p_reservation_id::text||':aggregate-reserved');
  if coalesce((admitted->>'authorized')::boolean,false) is not true then
    perform tongs.release_operation(p_reservation_id,p_reservation_id::text||':aggregate-denied-release',coalesce(admitted->>'reason','aggregate_denied'),jsonb_build_object('transmitted',false));
    return jsonb_build_object('provider_execution_authorized',false,'reason',admitted->>'reason');
  end if;
  insert into tongs.paid_operation_aggregate_bindings(reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,workspace_id,request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,cost_policy_revision_id,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros)
  values(p_reservation_id,hold_id,authority.aggregate_policy_revision_id,'assemblyai.transcription.hammer','assemblyai',binding.operation_id,p_user_id,authority.workspace_id,p_request_fingerprint,'universal-3-5-pro:diarization',funding->>'funding_source','forge','real',authority.pricing_revision_id,null,60000,38589,6000);
  perform tongs.bind_inactive_hammer_assemblyai_operation(p_operation_uuid,binding.operation_id,p_request_fingerprint,p_user_id,
    authority.workspace_id,authority.workpiece_id,authority.canonical_recording_id,authority.recording_revision_id,
    authority.provider_authority_id,p_quote_id,p_reservation_id);
  return jsonb_build_object('operation_id',p_operation_uuid,'reservation_id',p_reservation_id,'execution_authorized',false,'replay',coalesce((reserved->>'replay')::boolean,false));
end $$;

create or replace function tongs.authorize_hammer_first_transcription_attempt(
  p_operation_id uuid,p_attempt_id uuid,p_attempt_key text,p_request_sha256 text,p_capacity_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare operation tongs.hammer_transcription_operations%rowtype; binding tongs.hammer_first_transcription_quote_bindings%rowtype;
  authority tongs.hammer_first_transcription_activation_authorities%rowtype; capacity tongs.hammer_first_transcription_capacity_authorities%rowtype;
  aggregate_result jsonb; funding_result jsonb;
begin
  perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('hammer-first-transcription',0));
  select * into operation from tongs.hammer_transcription_operations where id=p_operation_id for update;
  select * into binding from tongs.hammer_first_transcription_quote_bindings where quote_id=operation.quote_id;
  select * into authority from tongs.hammer_first_transcription_activation_authorities where id=binding.activation_authority_id;
  select * into capacity from tongs.hammer_first_transcription_capacity_authorities where id=authority.capacity_authority_id;
  if operation.id is null or operation.state<>'reserved' or operation.execution_authorized
     or clock_timestamp()>=least(authority.valid_until,capacity.expires_at)
     or p_capacity_evidence->>'evidenceSha256'<>capacity.evidence_sha256
     or exists(select 1 from tongs.hammer_first_transcription_activation_consumptions c where c.activation_authority_id=authority.id)
  then return jsonb_build_object('provider_execution_authorized',false,'reason','halt_new'); end if;
  if operation.financial_environment='test' and (select funding_environment from tongs.funding_reservations where id=operation.reservation_id)='test' then
    return jsonb_build_object('provider_execution_authorized',false,'reason','test_funding_real_provider_forbidden');
  end if;
  aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(operation.reservation_id,p_attempt_key||':aggregate',1,'interactive');
  if coalesce((aggregate_result->>'authorized')::boolean,false) is not true then
    return jsonb_build_object('provider_execution_authorized',false,'reason',coalesce(aggregate_result->>'reason','aggregate_denied'));
  end if;
  funding_result:=tongs.begin_provider_attempt(operation.reservation_id,p_attempt_key,900,jsonb_build_object('provider','assemblyai','attempt',1));
  if coalesce((funding_result->>'provider_execution_authorized')::boolean,false) is not true then
    perform tongs.record_paid_operation_aggregate_outcome(operation.reservation_id,p_attempt_key||':preprovider-release','preprovider_release',null,null,jsonb_build_object('transmitted',false));
    return jsonb_build_object('provider_execution_authorized',false,'reason',coalesce(funding_result->>'reason','funding_gate_denied'));
  end if;
  insert into tongs.hammer_transcription_provider_attempts(id,operation_id,attempt_number,state,request_sha256,evidence_json)
  values(p_attempt_id,operation.id,1,'authorized',p_request_sha256,jsonb_build_object('attempt_key',p_attempt_key));
  update tongs.hammer_transcription_operations set execution_authorized=true,state='queued' where id=operation.id;
  insert into tongs.hammer_first_transcription_activation_consumptions(id,activation_authority_id,operation_id,provider_attempt_id)
  values(extensions.uuid_generate_v5(authority.id,'consumed'),authority.id,operation.id,p_attempt_id);
  return jsonb_build_object('provider_execution_authorized',true,'operation_id',operation.id,
    'complete_wholesale_ceiling_micros',operation.complete_wholesale_ceiling_micros,'automatic_retries',0);
end $$;

create or replace function tongs.mark_hammer_first_transcription_submission_unknown(
  p_operation_id uuid,p_attempt_id uuid,p_attempt_key text,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform tongs._require_pricing_service_role();
  perform tongs.mark_submission_unknown((select reservation_id from tongs.hammer_transcription_operations where id=p_operation_id),p_attempt_key||':unknown',p_attempt_key,p_evidence_json);
  update tongs.hammer_transcription_provider_attempts set state='submission_unknown',submitted_at=clock_timestamp(),evidence_json=p_evidence_json where id=p_attempt_id and operation_id=p_operation_id and state='authorized';
  update tongs.hammer_transcription_operations set state='submission_unknown' where id=p_operation_id;
  perform tongs.record_paid_operation_aggregate_outcome((select reservation_id from tongs.hammer_transcription_operations where id=p_operation_id),p_attempt_key||':aggregate-unknown','ambiguous',null,null,p_evidence_json);
  return jsonb_build_object('state','submission_unknown','automatic_retry_allowed',false);
end $$;

create or replace function tongs.record_hammer_first_transcription_submission(
  p_operation_id uuid,p_attempt_id uuid,p_provider_request_id text,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform tongs._require_pricing_service_role();
  update tongs.hammer_transcription_provider_attempts set state='queued',provider_request_id=p_provider_request_id,submitted_at=clock_timestamp(),evidence_json=p_evidence_json where id=p_attempt_id and operation_id=p_operation_id and state='authorized';
  if not found then raise exception 'authorized first attempt required' using errcode='42501'; end if;
  update tongs.hammer_transcription_operations set state='processing' where id=p_operation_id;
  return jsonb_build_object('state','processing');
end $$;

create or replace function tongs.complete_hammer_first_transcription_attempt(
  p_operation_id uuid,p_attempt_id uuid,p_provider_request_id text,p_response_sha256 text,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform tongs._require_pricing_service_role();
  update tongs.hammer_transcription_provider_attempts set state='completed',response_sha256=p_response_sha256,completed_at=clock_timestamp(),evidence_json=p_evidence_json where id=p_attempt_id and operation_id=p_operation_id and provider_request_id=p_provider_request_id and state in ('queued','processing');
  if not found then raise exception 'submitted first attempt required' using errcode='42501'; end if;
  return jsonb_build_object('state','completed');
end $$;

create or replace function tongs.fail_hammer_first_transcription_attempt(
  p_operation_id uuid,p_attempt_id uuid,p_failure_class text,p_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare operation tongs.hammer_transcription_operations%rowtype;
begin
  perform tongs._require_pricing_service_role(); select * into operation from tongs.hammer_transcription_operations where id=p_operation_id;
  update tongs.hammer_transcription_provider_attempts set state='failed',completed_at=clock_timestamp(),failure_class=p_failure_class,evidence_json=p_evidence_json where id=p_attempt_id and operation_id=p_operation_id and state in ('authorized','queued','processing');
  update tongs.hammer_transcription_operations set state='failed' where id=p_operation_id;
  perform tongs.record_provider_failure(operation.reservation_id,p_attempt_id::text||':provider-failure',p_failure_class,p_evidence_json);
  perform tongs.release_operation(operation.reservation_id,p_attempt_id::text||':customer-relief',
    'provider failure is nonbillable to the customer',p_evidence_json||jsonb_build_object('transmitted',true));
  perform tongs.record_paid_operation_aggregate_outcome(operation.reservation_id,p_attempt_id::text||':aggregate-failure',
    'failure',operation.supplier_ceiling_micros,null,p_evidence_json||jsonb_build_object('customer_relieved',true));
  return jsonb_build_object('state','failed','customer_charge_micros',0);
end $$;

create or replace function tongs.settle_hammer_first_transcription_operation(
  p_operation_id uuid,p_settlement_id uuid,p_settlement_key text,
  p_actual_supplier_cost_micros bigint,p_supplier_evidence_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare operation tongs.hammer_transcription_operations%rowtype; settled jsonb;
begin
  perform tongs._require_pricing_service_role(); select * into operation from tongs.hammer_transcription_operations where id=p_operation_id for update;
  if operation.canonical_transcript_id is null or p_actual_supplier_cost_micros is null
     or p_actual_supplier_cost_micros<0 or p_actual_supplier_cost_micros>operation.supplier_ceiling_micros
     or coalesce((p_supplier_evidence_json->>'authoritative')::boolean,false) is not true
  then raise exception 'canonical persistence and authoritative supplier reconciliation required before settlement' using errcode='42501'; end if;
  settled:=tongs.settle_operation(operation.reservation_id,p_settlement_id,p_settlement_key,'success',null,
    p_actual_supplier_cost_micros+operation.supporting_cost_ceiling_micros,p_supplier_evidence_json);
  update tongs.hammer_transcription_operations set state='completed',settled_at=clock_timestamp() where id=operation.id;
  perform tongs.record_paid_operation_aggregate_outcome(operation.reservation_id,p_settlement_key||':aggregate','reconciled',p_actual_supplier_cost_micros,null,p_supplier_evidence_json);
  return settled||jsonb_build_object('state','completed','canonical_transcript_id',operation.canonical_transcript_id);
end $$;

do $$ declare signature regprocedure; begin
  foreach signature in array array[
    'tongs.install_hammer_first_transcription_activation(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure,
    'tongs.create_hammer_first_transcription_quote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure,
    'tongs.reserve_hammer_first_transcription_quote(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
    'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure,
    'tongs.mark_hammer_first_transcription_submission_unknown(uuid,uuid,text,jsonb)'::regprocedure,
    'tongs.record_hammer_first_transcription_submission(uuid,uuid,text,jsonb)'::regprocedure,
    'tongs.complete_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure,
    'tongs.fail_hammer_first_transcription_attempt(uuid,uuid,text,jsonb)'::regprocedure,
    'tongs.settle_hammer_first_transcription_operation(uuid,uuid,text,bigint,jsonb)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
  end loop;
end $$;

do $$ begin
  if exists(select 1 from tongs.hammer_transcription_provider_authorities)
     or exists(select 1 from tongs.hammer_first_transcription_capacity_authorities)
     or exists(select 1 from tongs.hammer_first_transcription_activation_authorities)
     or exists(select 1 from tongs.hammer_first_transcription_quote_bindings)
     or exists(select 1 from tongs.hammer_first_transcription_activation_consumptions)
  then raise exception 'first-transcription migration must remain financially inert'; end if;
end $$;

comment on function tongs.install_hammer_first_transcription_activation(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text) is
  'Separate owner-authorized service operation that binds one exact recording, reviewed private price, current capacity evidence, and aggregate policy. Migration application never calls it.';

notify pgrst,'reload schema';
commit;
