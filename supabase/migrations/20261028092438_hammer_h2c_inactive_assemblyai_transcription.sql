-- Hammer H2-C: inactive AssemblyAI customer-transcription persistence.
--
-- This migration intentionally creates no provider authority, price, quote,
-- reservation, rollout, customer operation, provider attempt, or transcript.
-- The execution_authorized=false constraint is a database hard stop. A later
-- reviewed activation migration is required before any provider transmission.
begin;

create table tongs.hammer_transcription_provider_authorities (
  id uuid primary key,
  provider text not null check (provider = 'assemblyai'),
  model text not null check (model = 'universal-3-5-pro'),
  speaker_labels boolean not null check (speaker_labels),
  financial_environment text not null check (financial_environment = 'test'),
  supplier_rate_micros_per_hour bigint not null check (supplier_rate_micros_per_hour > 0),
  billing_increment_ms bigint not null check (billing_increment_ms > 0),
  minimum_billable_ms bigint not null check (minimum_billable_ms > 0),
  supporting_cost_ceiling_micros bigint not null check (supporting_cost_ceiling_micros >= 0),
  source_url text not null check (source_url like 'https://%'),
  account_evidence_sha256 text not null check (account_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  source_checked_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > source_checked_at),
  lifecycle_state text not null check (lifecycle_state in ('draft','certified_inactive','retired')),
  created_at timestamptz not null default now(),
  unique (provider, model, financial_environment, account_evidence_sha256)
);

create table tongs.hammer_transcription_operations (
  id uuid primary key,
  operation_id text not null unique check (length(btrim(operation_id)) > 0),
  request_fingerprint text not null unique check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  route_code text not null check (route_code = 'hammer.transcript_prep'),
  financial_environment text not null check (financial_environment = 'test'),
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  canonical_recording_id uuid not null references tongs.canonical_recordings(id) on delete restrict,
  recording_revision_id uuid not null references tongs.recording_revisions(id) on delete restrict,
  completion_id uuid not null references tongs.anvil_recording_completion_requests(id) on delete restrict,
  media_revision integer not null check (media_revision > 0),
  media_path text not null check (length(btrim(media_path)) > 0),
  media_sha256 text not null check (media_sha256 ~ '^[0-9a-f]{64}$'),
  media_bytes bigint not null check (media_bytes > 0),
  media_content_type text not null check (lower(media_content_type) like 'video/webm%'),
  verified_duration_ms bigint not null check (verified_duration_ms > 0),
  duration_evidence_source text not null check (duration_evidence_source = 'trusted_tongs_storage_readback'),
  provider_authority_id uuid not null references tongs.hammer_transcription_provider_authorities(id) on delete restrict,
  quote_id uuid not null unique references tongs.customer_spending_quotes(id) on delete restrict,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  aggregate_hold_id uuid not null,
  accepted_customer_charge_micros bigint not null check (accepted_customer_charge_micros > 0),
  supplier_ceiling_micros bigint not null check (supplier_ceiling_micros > 0),
  supporting_cost_ceiling_micros bigint not null check (supporting_cost_ceiling_micros >= 0),
  complete_wholesale_ceiling_micros bigint not null check (
    complete_wholesale_ceiling_micros = supplier_ceiling_micros + supporting_cost_ceiling_micros
  ),
  maximum_provider_attempts smallint not null default 1 check (maximum_provider_attempts = 1),
  execution_authorized boolean not null default false check (execution_authorized = false),
  state text not null check (state in (
    'quoted','reserved','queued','processing','submission_unknown','failed','completed'
  )),
  canonical_transcript_id uuid,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (settled_at is null or canonical_transcript_id is not null),
  unique (canonical_recording_id, recording_revision_id, media_sha256, provider_authority_id)
);

alter table tongs.paid_operation_aggregate_bindings
  drop constraint if exists paid_operation_aggregate_bindings_provider_check;
alter table tongs.paid_operation_aggregate_bindings
  add constraint paid_operation_aggregate_bindings_provider_check
  check (provider in ('openai','runway','assemblyai'));

create table tongs.hammer_transcription_provider_attempts (
  id uuid primary key,
  operation_id uuid not null references tongs.hammer_transcription_operations(id) on delete restrict,
  attempt_number smallint not null check (attempt_number = 1),
  state text not null check (state in ('authorized','submission_unknown','queued','processing','failed','completed')),
  provider_request_id text,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text check (response_sha256 is null or response_sha256 ~ '^[0-9a-f]{64}$'),
  submitted_at timestamptz,
  completed_at timestamptz,
  failure_class text,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (operation_id, attempt_number),
  unique (provider_request_id),
  check (state <> 'submission_unknown' or submitted_at is not null),
  check (completed_at is null or submitted_at is not null)
);

create table tongs.hammer_transcription_stage_receipts (
  id uuid primary key,
  operation_id uuid not null references tongs.hammer_transcription_operations(id) on delete restrict,
  stage text not null check (stage in (
    'source_verified','quote_accepted','reservation_verified','attempt_authorized',
    'submission_unknown','provider_queued','provider_processing','provider_failed',
    'provider_completed','transcript_validated','canonical_persisted','supplier_reconciled',
    'reservation_released','settled'
  )),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  recorded_at timestamptz not null default now(),
  unique (operation_id, stage)
);

create table tongs.hammer_canonical_transcripts_v2 (
  id uuid primary key,
  operation_id uuid not null unique references tongs.hammer_transcription_operations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  canonical_recording_id uuid not null references tongs.canonical_recordings(id) on delete restrict,
  recording_revision_id uuid not null references tongs.recording_revisions(id) on delete restrict,
  provider_attempt_id uuid not null unique references tongs.hammer_transcription_provider_attempts(id) on delete restrict,
  provider text not null check (provider = 'assemblyai'),
  model text not null check (model = 'universal-3-5-pro'),
  provider_request_id text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  transcript_sha256 text not null unique check (transcript_sha256 ~ '^[0-9a-f]{64}$'),
  transcript_json jsonb not null check (
    jsonb_typeof(transcript_json) = 'object'
    and transcript_json->>'schema_version' = '2'
    and transcript_json#>>'{provider,provider}' = 'assemblyai'
    and transcript_json#>>'{provider,model}' = 'universal-3-5-pro'
  ),
  artifact_path text not null unique check (artifact_path like 'hammer/recordings/%/baseline/transcript.v2.json'),
  persisted_at timestamptz not null default now(),
  unique (recording_revision_id, source_sha256)
);

alter table tongs.hammer_transcription_operations
  add constraint hammer_transcription_operations_canonical_transcript_fk
  foreign key (canonical_transcript_id) references tongs.hammer_canonical_transcripts_v2(id) on delete restrict
  deferrable initially deferred;

create index hammer_transcription_operations_customer_idx
  on tongs.hammer_transcription_operations(user_id, created_at desc);
create index hammer_transcription_operations_workspace_idx
  on tongs.hammer_transcription_operations(workspace_id, workpiece_id, created_at desc);
create index hammer_transcription_stage_receipts_operation_idx
  on tongs.hammer_transcription_stage_receipts(operation_id, recorded_at);

create or replace function tongs._reject_hammer_transcription_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Hammer transcription evidence is append-only' using errcode = '42501';
end $$;

create trigger hammer_transcription_provider_authorities_immutable
before update or delete on tongs.hammer_transcription_provider_authorities
for each row execute function tongs._reject_hammer_transcription_mutation();
create trigger hammer_transcription_stage_receipts_immutable
before update or delete on tongs.hammer_transcription_stage_receipts
for each row execute function tongs._reject_hammer_transcription_mutation();
create trigger hammer_canonical_transcripts_v2_immutable
before update or delete on tongs.hammer_canonical_transcripts_v2
for each row execute function tongs._reject_hammer_transcription_mutation();

create or replace function tongs._enforce_hammer_transcription_attempt_update()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Hammer transcription attempt evidence is append-only' using errcode = '42501';
  end if;
  if row(new.id,new.operation_id,new.attempt_number,new.request_sha256,new.created_at)
     is distinct from row(old.id,old.operation_id,old.attempt_number,old.request_sha256,old.created_at)
  then raise exception 'Hammer transcription attempt identity is immutable' using errcode = '42501'; end if;
  if old.state in ('submission_unknown','failed','completed') and new.state <> old.state then
    raise exception 'Terminal provider attempt state is immutable' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger hammer_transcription_provider_attempts_guard
before update or delete on tongs.hammer_transcription_provider_attempts
for each row execute function tongs._enforce_hammer_transcription_attempt_update();

create or replace function tongs._enforce_hammer_transcription_operation_update()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if row(
    new.operation_id,new.request_fingerprint,new.route_code,new.financial_environment,
    new.user_id,new.workspace_id,new.workpiece_id,new.canonical_recording_id,
    new.recording_revision_id,new.completion_id,new.media_revision,new.media_path,
    new.media_sha256,new.media_bytes,new.media_content_type,new.verified_duration_ms,
    new.duration_evidence_source,new.provider_authority_id,new.quote_id,new.reservation_id,
    new.aggregate_hold_id,new.accepted_customer_charge_micros,new.supplier_ceiling_micros,
    new.supporting_cost_ceiling_micros,new.complete_wholesale_ceiling_micros,
    new.maximum_provider_attempts,new.execution_authorized,new.created_at
  ) is distinct from row(
    old.operation_id,old.request_fingerprint,old.route_code,old.financial_environment,
    old.user_id,old.workspace_id,old.workpiece_id,old.canonical_recording_id,
    old.recording_revision_id,old.completion_id,old.media_revision,old.media_path,
    old.media_sha256,old.media_bytes,old.media_content_type,old.verified_duration_ms,
    old.duration_evidence_source,old.provider_authority_id,old.quote_id,old.reservation_id,
    old.aggregate_hold_id,old.accepted_customer_charge_micros,old.supplier_ceiling_micros,
    old.supporting_cost_ceiling_micros,old.complete_wholesale_ceiling_micros,
    old.maximum_provider_attempts,old.execution_authorized,old.created_at
  ) then
    raise exception 'Hammer transcription operation authority is immutable' using errcode = '42501';
  end if;
  if old.state in ('failed','completed','submission_unknown') and new.state <> old.state then
    raise exception 'Terminal Hammer transcription state is immutable' using errcode = '42501';
  end if;
  if new.settled_at is not null and new.canonical_transcript_id is null then
    raise exception 'Canonical transcript persistence is required before settlement' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger hammer_transcription_operations_guard
before update or delete on tongs.hammer_transcription_operations
for each row execute function tongs._enforce_hammer_transcription_operation_update();

do $$ declare table_name text; begin
  foreach table_name in array array[
    'hammer_transcription_provider_authorities',
    'hammer_transcription_operations',
    'hammer_transcription_provider_attempts',
    'hammer_transcription_stage_receipts',
    'hammer_canonical_transcripts_v2'
  ] loop
    execute format('alter table tongs.%I enable row level security', table_name);
    execute format('alter table tongs.%I force row level security', table_name);
    execute format('revoke all on table tongs.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select, insert on table tongs.%I to service_role', table_name);
  end loop;
end $$;
grant update(state,canonical_transcript_id,settled_at,updated_at)
  on tongs.hammer_transcription_operations to service_role;
grant update(state,provider_request_id,response_sha256,submitted_at,completed_at,failure_class,evidence_json)
  on tongs.hammer_transcription_provider_attempts to service_role;

create policy hammer_transcription_operations_customer_read
on tongs.hammer_transcription_operations for select to authenticated
using ((select auth.uid()) = user_id and tongs.has_workspace_role(workspace_id, 'viewer'));

create policy hammer_transcription_attempts_customer_read
on tongs.hammer_transcription_provider_attempts for select to authenticated
using (exists (
  select 1 from tongs.hammer_transcription_operations operation
  where operation.id = operation_id and operation.user_id = (select auth.uid())
    and tongs.has_workspace_role(operation.workspace_id, 'viewer')
));

create policy hammer_transcription_stages_customer_read
on tongs.hammer_transcription_stage_receipts for select to authenticated
using (exists (
  select 1 from tongs.hammer_transcription_operations operation
  where operation.id = operation_id and operation.user_id = (select auth.uid())
    and tongs.has_workspace_role(operation.workspace_id, 'viewer')
));

create policy hammer_canonical_transcripts_v2_customer_read
on tongs.hammer_canonical_transcripts_v2 for select to authenticated
using ((select auth.uid()) = user_id and tongs.has_workspace_role(workspace_id, 'viewer'));

grant select on tongs.hammer_transcription_operations,
  tongs.hammer_transcription_provider_attempts,
  tongs.hammer_transcription_stage_receipts,
  tongs.hammer_canonical_transcripts_v2 to authenticated;

-- Provider authority contains private account-cost evidence and remains service-only.

create or replace function tongs.resolve_hammer_transcription_source_authority(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_canonical_recording_id uuid,
  p_recording_revision_id uuid
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  canonical tongs.canonical_recordings%rowtype;
  revision tongs.recording_revisions%rowtype;
  completion tongs.anvil_recording_completion_requests%rowtype;
  verified jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into canonical from tongs.canonical_recordings
  where id=p_canonical_recording_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into revision from tongs.recording_revisions
  where id=p_recording_revision_id and canonical_recording_id=p_canonical_recording_id
    and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and status='active';
  if canonical.id is null or revision.id is null or canonical.media_id not like 'anvil-completion:%' then
    raise exception 'exact active canonical source required' using errcode = '42501';
  end if;
  select * into completion from tongs.anvil_recording_completion_requests
  where id=substring(canonical.media_id from length('anvil-completion:')+1)::uuid
    and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id
    and media_path=canonical.media_path;
  verified := completion.completion_evidence->'canonical_media_verification';
  if completion.id is null
     or verified->>'source' <> 'trusted_tongs_storage_readback'
     or coalesce((verified->>'has_audio_stream')::boolean,false) is not true
     or coalesce((verified->>'duration_ms')::bigint,0) <= 0
     or verified->>'sha256' is distinct from completion.media_hash
     or coalesce((verified->>'bytes')::bigint,0) <> canonical.media_bytes
     or verified->>'content_type' is distinct from canonical.media_content_type
  then raise exception 'trusted canonical duration evidence required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'schema','forge.hammer.transcription-source-authority.v1',
    'completion_id',completion.id,'media_revision',completion.media_revision,
    'media_path',completion.media_path,'media_sha256',verified->>'sha256',
    'media_bytes',(verified->>'bytes')::bigint,'media_content_type',verified->>'content_type',
    'duration_ms',(verified->>'duration_ms')::bigint,
    'duration_evidence_source',verified->>'source',
    'probe_implementation',verified->>'probe_implementation'
  );
end $$;

revoke all on function tongs.resolve_hammer_transcription_source_authority(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function tongs.resolve_hammer_transcription_source_authority(uuid,uuid,uuid,uuid)
  to service_role;

create or replace function tongs.bind_inactive_hammer_assemblyai_operation(
  p_id uuid,
  p_operation_id text,
  p_request_fingerprint text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_canonical_recording_id uuid,
  p_recording_revision_id uuid,
  p_provider_authority_id uuid,
  p_quote_id uuid,
  p_reservation_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  authority tongs.hammer_transcription_provider_authorities%rowtype;
  quote tongs.customer_spending_quotes%rowtype;
  acceptance tongs.customer_spending_quote_acceptances%rowtype;
  reservation tongs.funding_reservations%rowtype;
  aggregate_binding tongs.paid_operation_aggregate_bindings%rowtype;
  source jsonb;
  existing tongs.hammer_transcription_operations%rowtype;
  supplier_ceiling bigint;
  supporting_ceiling bigint;
begin
  perform tongs._require_pricing_service_role();
  select * into existing from tongs.hammer_transcription_operations where id=p_id;
  if existing.id is not null then
    if existing.operation_id<>p_operation_id or existing.request_fingerprint<>p_request_fingerprint
       or existing.quote_id<>p_quote_id or existing.reservation_id<>p_reservation_id
    then raise exception 'Hammer transcription operation replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('operation_id',existing.id,'state',existing.state,'replay',true,'execution_authorized',false);
  end if;
  select * into authority from tongs.hammer_transcription_provider_authorities where id=p_provider_authority_id;
  select * into quote from tongs.customer_spending_quotes where id=p_quote_id;
  select * into acceptance from tongs.customer_spending_quote_acceptances where quote_id=p_quote_id;
  select * into reservation from tongs.funding_reservations where id=p_reservation_id and quote_id=p_quote_id;
  select * into aggregate_binding from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
  source:=tongs.resolve_hammer_transcription_source_authority(
    p_workspace_id,p_workpiece_id,p_canonical_recording_id,p_recording_revision_id
  );
  if authority.id is null or authority.lifecycle_state<>'certified_inactive' or authority.expires_at<=now()
     or quote.id is null or quote.user_id<>p_user_id or quote.workspace_id<>p_workspace_id
     or quote.operation_id<>p_operation_id or quote.request_fingerprint<>p_request_fingerprint
     or quote.tool<>'hammer.transcript_prep' or quote.expires_at<=acceptance.accepted_at
     or acceptance.id is null or acceptance.user_id<>p_user_id
     or acceptance.accepted_quote_hash<>quote.quote_hash
     or reservation.id is null or reservation.user_id<>p_user_id or reservation.operation_id<>p_operation_id
     or reservation.funding_source_type not in ('customer_deposit','paid_allowance')
     or reservation.reserved_customer_charge_micros<>quote.normal_maximum_charge_micros
     or reservation.reserved_credit_units<>quote.customer_credit_units
     or aggregate_binding.reservation_id is null or aggregate_binding.provider<>'assemblyai'
     or aggregate_binding.operation_id<>p_operation_id
     or aggregate_binding.request_fingerprint<>p_request_fingerprint
     or aggregate_binding.customer_funding_ceiling_micros<>quote.normal_maximum_charge_micros
  then raise exception 'complete accepted customer-funded AssemblyAI authority required' using errcode='42501'; end if;
  supplier_ceiling:=aggregate_binding.supplier_exposure_ceiling_micros;
  supporting_ceiling:=aggregate_binding.supporting_exposure_ceiling_micros;
  if supplier_ceiling<=0 or supplier_ceiling+supporting_ceiling<>quote.full_cost_ceiling_micros
     or quote.normal_maximum_charge_micros<>quote.customer_credit_units*5000
     or quote.normal_maximum_charge_micros < ceil(quote.full_cost_ceiling_micros*133::numeric/100)::bigint
  then raise exception 'fixed complete cost-plus quote mismatch' using errcode='22023'; end if;
  insert into tongs.hammer_transcription_operations(
    id,operation_id,request_fingerprint,route_code,financial_environment,user_id,workspace_id,
    workpiece_id,canonical_recording_id,recording_revision_id,completion_id,media_revision,
    media_path,media_sha256,media_bytes,media_content_type,verified_duration_ms,
    duration_evidence_source,provider_authority_id,quote_id,reservation_id,aggregate_hold_id,
    accepted_customer_charge_micros,supplier_ceiling_micros,supporting_cost_ceiling_micros,
    complete_wholesale_ceiling_micros,maximum_provider_attempts,execution_authorized,state
  ) values(
    p_id,p_operation_id,p_request_fingerprint,'hammer.transcript_prep','test',p_user_id,p_workspace_id,
    p_workpiece_id,p_canonical_recording_id,p_recording_revision_id,(source->>'completion_id')::uuid,
    (source->>'media_revision')::integer,source->>'media_path',source->>'media_sha256',
    (source->>'media_bytes')::bigint,source->>'media_content_type',(source->>'duration_ms')::bigint,
    source->>'duration_evidence_source',authority.id,quote.id,reservation.id,aggregate_binding.hold_id,
    quote.normal_maximum_charge_micros,supplier_ceiling,supporting_ceiling,quote.full_cost_ceiling_micros,
    1,false,'reserved'
  );
  return jsonb_build_object('operation_id',p_id,'state','reserved','replay',false,'execution_authorized',false);
end $$;

revoke all on function tongs.bind_inactive_hammer_assemblyai_operation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function tongs.bind_inactive_hammer_assemblyai_operation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
  to service_role;

create or replace function tongs.persist_hammer_canonical_transcript_v2(
  p_operation_id uuid,
  p_transcript_id uuid,
  p_provider_attempt_id uuid,
  p_provider_request_id text,
  p_transcript_sha256 text,
  p_transcript_json jsonb,
  p_artifact_path text,
  p_stage_receipt_id uuid,
  p_stage_idempotency_key text,
  p_stage_evidence_sha256 text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  operation tongs.hammer_transcription_operations%rowtype;
  attempt tongs.hammer_transcription_provider_attempts%rowtype;
  existing tongs.hammer_canonical_transcripts_v2%rowtype;
begin
  perform tongs._require_pricing_service_role();
  select * into operation from tongs.hammer_transcription_operations where id=p_operation_id for update;
  select * into attempt from tongs.hammer_transcription_provider_attempts
    where id=p_provider_attempt_id and operation_id=p_operation_id and attempt_number=1;
  if operation.id is null or attempt.id is null or attempt.state <> 'completed'
     or attempt.provider_request_id is distinct from p_provider_request_id
     or operation.execution_authorized is not true
  then raise exception 'completed authorized provider attempt required' using errcode='42501'; end if;
  if p_transcript_sha256 !~ '^[0-9a-f]{64}$'
     or p_stage_evidence_sha256 !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_transcript_json) <> 'object'
     or p_transcript_json->>'schema_version' <> '2'
     or p_transcript_json#>>'{recording,media_sha256}' is distinct from operation.media_sha256
     or p_transcript_json#>>'{recording,duration_ms}' is distinct from operation.verified_duration_ms::text
     or p_transcript_json#>>'{provider,provider}' <> 'assemblyai'
     or p_transcript_json#>>'{provider,model}' <> 'universal-3-5-pro'
     or p_transcript_json#>>'{provider,provider_request_id}' is distinct from p_provider_request_id
  then raise exception 'canonical transcript evidence mismatch' using errcode='22023'; end if;
  select * into existing from tongs.hammer_canonical_transcripts_v2 where operation_id=p_operation_id;
  if existing.id is not null then
    if existing.id<>p_transcript_id or existing.transcript_sha256<>p_transcript_sha256
       or existing.artifact_path<>p_artifact_path
    then raise exception 'canonical transcript replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('transcript_id',existing.id,'replay',true);
  end if;
  insert into tongs.hammer_canonical_transcripts_v2(
    id,operation_id,user_id,workspace_id,workpiece_id,canonical_recording_id,
    recording_revision_id,provider_attempt_id,provider,model,provider_request_id,
    source_sha256,transcript_sha256,transcript_json,artifact_path
  ) values(
    p_transcript_id,operation.id,operation.user_id,operation.workspace_id,operation.workpiece_id,
    operation.canonical_recording_id,operation.recording_revision_id,attempt.id,'assemblyai',
    'universal-3-5-pro',p_provider_request_id,operation.media_sha256,p_transcript_sha256,
    p_transcript_json,p_artifact_path
  );
  insert into tongs.hammer_transcription_stage_receipts(
    id,operation_id,stage,idempotency_key,evidence_sha256,evidence_json
  ) values(
    p_stage_receipt_id,operation.id,'canonical_persisted',p_stage_idempotency_key,
    p_stage_evidence_sha256,jsonb_build_object('transcript_id',p_transcript_id,'artifact_path',p_artifact_path)
  );
  update tongs.hammer_transcription_operations
    set canonical_transcript_id=p_transcript_id,state='processing'
    where id=operation.id;
  return jsonb_build_object('transcript_id',p_transcript_id,'replay',false);
end $$;

revoke all on function tongs.persist_hammer_canonical_transcript_v2(uuid,uuid,uuid,text,text,jsonb,text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function tongs.persist_hammer_canonical_transcript_v2(uuid,uuid,uuid,text,text,jsonb,text,uuid,text,text)
  to service_role;

create or replace function tongs.read_my_hammer_transcription_evidence(p_operation_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog as $$
declare operation tongs.hammer_transcription_operations%rowtype;
begin
  select * into operation from tongs.hammer_transcription_operations where id=p_operation_id;
  if operation.id is null then return null; end if;
  return jsonb_build_object(
    'operation',jsonb_build_object(
      'id',operation.id,'operation_id',operation.operation_id,'state',operation.state,
      'financial_environment',operation.financial_environment,
      'accepted_customer_charge_micros',operation.accepted_customer_charge_micros,
      'complete_wholesale_ceiling_micros',operation.complete_wholesale_ceiling_micros,
      'maximum_provider_attempts',operation.maximum_provider_attempts,
      'provider_execution_authorized',operation.execution_authorized,
      'canonical_transcript_id',operation.canonical_transcript_id,'settled_at',operation.settled_at
    ),
    'attempts',coalesce((select jsonb_agg(jsonb_build_object(
      'attempt_number',attempt.attempt_number,'state',attempt.state,
      'provider_request_id',attempt.provider_request_id,'submitted_at',attempt.submitted_at,
      'completed_at',attempt.completed_at
    ) order by attempt.attempt_number) from tongs.hammer_transcription_provider_attempts attempt
      where attempt.operation_id=operation.id),'[]'::jsonb),
    'stages',coalesce((select jsonb_agg(receipt.stage order by receipt.recorded_at)
      from tongs.hammer_transcription_stage_receipts receipt
      where receipt.operation_id=operation.id),'[]'::jsonb),
    'canonical_transcript',coalesce((select jsonb_build_object(
      'id',transcript.id,'provider',transcript.provider,'model',transcript.model,
      'provider_request_id',transcript.provider_request_id,
      'source_sha256',transcript.source_sha256,'transcript_sha256',transcript.transcript_sha256,
      'artifact_path',transcript.artifact_path,'persisted_at',transcript.persisted_at
    ) from tongs.hammer_canonical_transcripts_v2 transcript
      where transcript.operation_id=operation.id),'null'::jsonb)
  );
end $$;

revoke all on function tongs.read_my_hammer_transcription_evidence(uuid) from public,anon;
grant execute on function tongs.read_my_hammer_transcription_evidence(uuid) to authenticated,service_role;

comment on table tongs.hammer_transcription_provider_authorities is
  'Private, immutable AssemblyAI account/model/rate evidence. H2-C installs no rows.';
comment on table tongs.hammer_transcription_operations is
  'Customer-funded Hammer operation bound to existing Tongs quote, reservation, and aggregate authority; execution is hard-disabled.';
comment on function tongs.resolve_hammer_transcription_source_authority(uuid,uuid,uuid,uuid) is
  'Resolves duration only from immutable trusted server storage-readback evidence; never from browser media metadata.';

notify pgrst, 'reload schema';
commit;
