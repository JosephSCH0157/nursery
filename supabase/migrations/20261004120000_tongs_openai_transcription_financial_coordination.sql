-- OpenAI audio-transcription financial coordination. This release records
-- official rate evidence, exact immutable request/source bindings, and the
-- server-only persistence needed by ephemeral speech capture. Every route and
-- cost policy remains inactive/draft; no price or spending is activated.
begin;

alter table tongs.openai_text_route_policies
  drop constraint if exists openai_text_route_policies_provider_operation_check;
alter table tongs.openai_text_route_policies
  add constraint openai_text_route_policies_provider_operation_check
  check (provider_operation in ('responses','chat_completions','audio_transcriptions'));

insert into tongs.openai_text_route_policies(
  route_code,product_area,provider_operation,maximum_input_units,
  maximum_output_units,maximum_attempts,notes
) values
 ('hearth.speech_transcription','hearth','audio_transcriptions',16000,2000,1,'Ephemeral speech audio; validated transcript is the retained result.'),
 ('anvil.realtime_transcription','visual_motion','audio_transcriptions',16000,2000,1,'One immutable audio chunk per operation; session assembly is canonical client state.'),
 ('hammer.transcript_prep','hammer','audio_transcriptions',16000,2000,1,'Diarized transcript must persist through the Hammer/Tongs authority before settlement.'),
 ('hammer.transcript_regeneration','hammer','audio_transcriptions',16000,2000,1,'Regenerated diarized transcript must persist through the Hammer/Tongs authority before settlement.')
on conflict(route_code) do nothing;

insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,reason)
select route_code,1,'inactive','Audio-transcription coordination deployed with pricing and execution inactive.'
from tongs.openai_text_route_policies
where route_code in ('hearth.speech_transcription','anvil.realtime_transcription','hammer.transcript_prep','hammer.transcript_regeneration')
on conflict(route_code,revision) do nothing;

alter table tongs.openai_text_provider_rate_revisions
 add column if not exists audio_input_micros_per_million_tokens bigint,
 add column if not exists text_input_micros_per_million_tokens bigint,
 add column if not exists billing_basis text not null default 'text_tokens';
alter table tongs.openai_text_provider_rate_revisions
 drop constraint if exists openai_text_provider_rate_revisions_billing_basis_check;
alter table tongs.openai_text_provider_rate_revisions
 add constraint openai_text_provider_rate_revisions_billing_basis_check
 check(billing_basis in ('text_tokens','audio_and_text_tokens','duration_seconds'));

insert into tongs.openai_text_provider_rate_revisions(
 id,provider,runtime_model_alias,provider_model_id,revision,
 input_micros_per_million_tokens,cached_input_micros_per_million_tokens,
 output_micros_per_million_tokens,maximum_context_tokens,maximum_output_tokens,
 source_url,source_checked_at,content_hash,audio_input_micros_per_million_tokens,
 text_input_micros_per_million_tokens,billing_basis
) values
 ('4a000000-0000-4000-8000-000000000001','openai','gpt-4o-mini-transcribe','gpt-4o-mini-transcribe',1,
  1250000,0,5000000,16000,2000,'https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe','2026-09-10T00:00:00Z',
  encode(extensions.digest(convert_to('openai:gpt-4o-mini-transcribe:1:1250000:1250000:5000000:16000:2000:2026-09-10','utf8'),'sha256'),'hex'),1250000,1250000,'audio_and_text_tokens'),
 ('4a000000-0000-4000-8000-000000000002','openai','gpt-4o-transcribe','gpt-4o-transcribe',1,
  2500000,0,10000000,16000,2000,'https://developers.openai.com/api/docs/models/gpt-4o-transcribe','2026-09-10T00:00:00Z',
  encode(extensions.digest(convert_to('openai:gpt-4o-transcribe:1:2500000:2500000:10000000:16000:2000:2026-09-10','utf8'),'sha256'),'hex'),2500000,2500000,'audio_and_text_tokens'),
 ('4a000000-0000-4000-8000-000000000003','openai','gpt-4o-transcribe-diarize','gpt-4o-transcribe-diarize',1,
  2500000,0,10000000,16000,2000,'https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize','2026-09-10T00:00:00Z',
  encode(extensions.digest(convert_to('openai:gpt-4o-transcribe-diarize:1:2500000:2500000:10000000:16000:2000:2026-09-10','utf8'),'sha256'),'hex'),2500000,2500000,'audio_and_text_tokens')
on conflict(provider_model_id,revision) do nothing;

create table tongs.openai_transcription_duration_rate_revisions(
 id uuid primary key,
 provider text not null check(provider='openai'),
 provider_model_id text not null,
 revision integer not null check(revision>0),
 micros_per_minute bigint not null check(micros_per_minute>=0),
 source_url text not null check(source_url like 'https://developers.openai.com/%'),
 source_checked_at timestamptz not null,
 lifecycle_state text not null check(lifecycle_state in ('draft','active','retired')),
 content_hash text not null unique check(content_hash~'^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 unique(provider_model_id,revision)
);
insert into tongs.openai_transcription_duration_rate_revisions values(
 '4a000000-0000-4000-8000-000000000004','openai','whisper-1',1,6000,
 'https://developers.openai.com/api/docs/models/whisper-1','2026-09-10T00:00:00Z','draft',
 encode(extensions.digest(convert_to('openai:whisper-1:1:6000:minute:2026-09-10','utf8'),'sha256'),'hex'),now()
) on conflict(provider_model_id,revision) do nothing;

insert into tongs.openai_text_cost_policy_revisions(
 id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
 maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
 full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values
 ('4b000000-0000-4000-8000-000000000001','hearth.speech_transcription',1,'openai-transcription:hearth-speech:draft-v1',
  '[{"attempt":1,"rate_revision_id":"4a000000-0000-4000-8000-000000000001","runtime_model":"gpt-4o-mini-transcribe","provider_model_id":"gpt-4o-mini-transcribe","audio_input_max":16000,"text_input_max":0,"output_max":2000,"maximum_bytes":10485760,"maximum_duration_seconds":null,"maximum_chunks":1}]',16000,2000,1,30000,null,null,'supporting_unpriced','draft','Official token rates verified. Storage upload/removal, hosting, validation, and canonical result persistence remain unpriced.'),
 ('4b000000-0000-4000-8000-000000000002','anvil.realtime_transcription',1,'openai-transcription:anvil-chunk:draft-v1',
  '[{"attempt":1,"rate_revision_id":"4a000000-0000-4000-8000-000000000001","runtime_model":"gpt-4o-mini-transcribe","provider_model_id":"gpt-4o-mini-transcribe","audio_input_max":16000,"text_input_max":0,"output_max":2000,"maximum_bytes":26214400,"maximum_duration_seconds":2,"maximum_chunks":1}]',16000,2000,1,30000,null,null,'supporting_unpriced','draft','One chunk and one OpenAI submission. Language-hint retry and paid transcode fallback are excluded under enforcement; hosting/persistence allocation remains unpriced.'),
 ('4b000000-0000-4000-8000-000000000003','hammer.transcript_prep',1,'openai-transcription:hammer-prep:draft-v1',
  '[{"attempt":1,"rate_revision_id":"4a000000-0000-4000-8000-000000000003","runtime_model":"gpt-4o-transcribe-diarize","provider_model_id":"gpt-4o-transcribe-diarize","audio_input_max":16000,"text_input_max":0,"output_max":2000,"maximum_source_bytes":268435456,"maximum_upload_bytes":26214400,"maximum_duration_seconds":null,"maximum_chunks":1}]',16000,2000,1,60000,null,null,'supporting_unpriced','draft','Direct source or one pre-provider transcode only. Provider-error retranscode/resubmit is excluded under enforcement; compute, storage, validation, and persistence remain unpriced.'),
 ('4b000000-0000-4000-8000-000000000004','hammer.transcript_regeneration',1,'openai-transcription:hammer-regeneration:draft-v1',
  '[{"attempt":1,"rate_revision_id":"4a000000-0000-4000-8000-000000000003","runtime_model":"gpt-4o-transcribe-diarize","provider_model_id":"gpt-4o-transcribe-diarize","audio_input_max":16000,"text_input_max":0,"output_max":2000,"maximum_source_bytes":268435456,"maximum_upload_bytes":26214400,"maximum_duration_seconds":null,"maximum_chunks":1}]',16000,2000,1,60000,null,null,'supporting_unpriced','draft','Audio preflight and one provider submission. Compute, storage, validation, and canonical revision persistence remain unpriced.')
on conflict(route_code,revision) do nothing;

create table tongs.openai_transcription_supporting_cost_inventory(
 id uuid primary key,
 route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
 cost_policy_revision_id uuid not null references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
 component_code text not null,
 disposition text not null check(disposition in ('included_unmetered','separately_blocked','allocation_required')),
 evidence_status text not null check(evidence_status in ('verified','estimated','unpriced')),
 notes text not null,
 created_at timestamptz not null default now(),
 unique(cost_policy_revision_id,component_code)
);
insert into tongs.openai_transcription_supporting_cost_inventory values
 ('4c000000-0000-4000-8000-000000000001','hearth.speech_transcription','4b000000-0000-4000-8000-000000000001','supabase_upload_retention','allocation_required','unpriced','Uploaded speech must be removed after processing; canonical transcript result remains.' ,now()),
 ('4c000000-0000-4000-8000-000000000002','hearth.speech_transcription','4b000000-0000-4000-8000-000000000001','validation_persistence_hosting','allocation_required','unpriced','Serverless execution and canonical transcript persistence need an approved ceiling.',now()),
 ('4c000000-0000-4000-8000-000000000003','anvil.realtime_transcription','4b000000-0000-4000-8000-000000000002','transcode','separately_blocked','unpriced','Paid Fly transcoding is not authorized by a transcription quote.',now()),
 ('4c000000-0000-4000-8000-000000000004','anvil.realtime_transcription','4b000000-0000-4000-8000-000000000002','validation_persistence_hosting','allocation_required','unpriced','Chunk validation, replay persistence, and hosting need an approved ceiling.',now()),
 ('4c000000-0000-4000-8000-000000000005','hammer.transcript_prep','4b000000-0000-4000-8000-000000000003','probe_transcode','separately_blocked','unpriced','Fly probe/transcode needs separately priced authority; local compute still needs allocation.',now()),
 ('4c000000-0000-4000-8000-000000000006','hammer.transcript_prep','4b000000-0000-4000-8000-000000000003','validation_persistence_hosting','allocation_required','unpriced','Diarized validation and canonical Tongs commit need an approved ceiling.',now()),
 ('4c000000-0000-4000-8000-000000000007','hammer.transcript_regeneration','4b000000-0000-4000-8000-000000000004','probe_transcode','separately_blocked','unpriced','Fly probe/transcode needs separately priced authority; local compute still needs allocation.',now()),
 ('4c000000-0000-4000-8000-000000000008','hammer.transcript_regeneration','4b000000-0000-4000-8000-000000000004','validation_persistence_hosting','allocation_required','unpriced','Diarized validation and canonical revision commit need an approved ceiling.',now());

create table tongs.openai_transcription_source_bindings(
 quote_id uuid primary key references tongs.customer_spending_quotes(id) on delete restrict,
 route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
 workpiece_id text not null,
 source_asset_revision text not null,
 source_sha256 text not null check(source_sha256~'^[0-9a-f]{64}$'),
 source_bytes bigint not null check(source_bytes>0),
 maximum_duration_seconds numeric,
 maximum_chunks integer not null check(maximum_chunks>0),
 output_contract text not null,
 created_at timestamptz not null default now()
);

create table tongs.openai_transcription_canonical_results(
 operation_id text primary key,
 reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
 route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
 workpiece_id text not null,
 source_sha256 text not null check(source_sha256~'^[0-9a-f]{64}$'),
 provider_request_id text,
 transcript_json jsonb not null check(jsonb_typeof(transcript_json)='object'),
 created_at timestamptz not null default now()
);

create table tongs.openai_transcription_reconciliation_notes(
 id uuid primary key,
 source_key text not null unique,
 amount_micros bigint not null check(amount_micros>=0),
 currency text not null check(currency~'^[A-Z]{3}$'),
 period_start timestamptz not null,
 period_end timestamptz not null check(period_end>period_start),
 classification text not null,
 allocation_status text not null check(allocation_status in ('unmatched','allocated','confirmed')),
 request_level_certainty boolean not null,
 evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
 created_at timestamptz not null default now()
);

do $$ declare n text; begin
 foreach n in array array['openai_transcription_duration_rate_revisions','openai_transcription_supporting_cost_inventory','openai_transcription_source_bindings','openai_transcription_canonical_results','openai_transcription_reconciliation_notes'] loop
  execute format('alter table tongs.%I enable row level security',n);
  execute format('alter table tongs.%I force row level security',n);
  execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
  execute format('grant select on tongs.%I to service_role',n);
  execute format('create trigger %I before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n||'_immutable',n);
 end loop;
end $$;

create or replace function tongs.resolve_openai_transcription_model_for_quote(p_user_id uuid,p_route_code text,p_credential_funding text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare r tongs.openai_text_rollout_revisions%rowtype; c tongs.openai_text_cost_policy_revisions%rowtype; rate tongs.openai_text_provider_rate_revisions%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into r from tongs._current_openai_text_rollout(p_route_code);
 if not found or r.mode<>'enforce' or r.cost_policy_revision_id is null then raise exception 'OpenAI transcription is not active' using errcode='42501'; end if;
 select * into c from tongs.openai_text_cost_policy_revisions where id=r.cost_policy_revision_id;
 select * into rate from tongs.openai_text_provider_rate_revisions where id=nullif(c.attempt_plan->0->>'rate_revision_id','')::uuid;
 if c.cost_coverage<>'complete' or c.lifecycle_state not in ('pilot_candidate','active') or rate.id is null or rate.billing_basis<>'audio_and_text_tokens' then
  raise exception 'pricing_not_configured: complete transcription rate and supporting costs required' using errcode='P0001';
 end if;
 return jsonb_build_object('catalog_revision_id',rate.id,'catalog_revision',rate.revision,'model_catalog_entry_id',rate.id,
  'runtime_model_id',rate.runtime_model_alias,'provider_model_id',rate.provider_model_id,
  'display_name',rate.provider_model_id,'tradeoff_summary','Bounded OpenAI audio transcription; no search, enrichment, generation, or paid transcode is included.');
end $$;

-- The ordinary quote/reservation functions retain their immutable text-era
-- storage but accept only these four additional audio route codes through a
-- dedicated entry point. The underlying function remains the single balance.
create or replace function tongs.create_customer_openai_transcription_quote(
 p_quote_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_workspace_id uuid,p_workpiece_id text,
 p_request_fingerprint text,p_model text,p_credential_funding text,p_expires_at timestamptz,
 p_source_asset_revision text,p_source_sha256 text,p_source_bytes bigint,p_maximum_duration_seconds numeric,p_maximum_chunks integer,p_output_contract text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; existing tongs.openai_transcription_source_bindings%rowtype;
begin
 perform tongs._require_pricing_service_role();
 if p_route_code not in ('hearth.speech_transcription','anvil.realtime_transcription','hammer.transcript_prep','hammer.transcript_regeneration')
  or p_source_sha256!~'^[0-9a-f]{64}$' or p_source_bytes<=0 or p_maximum_chunks<=0 or nullif(btrim(p_source_asset_revision),'') is null or nullif(btrim(p_output_contract),'') is null
 then raise exception 'invalid transcription quote request' using errcode='22023'; end if;
 result:=tongs.create_customer_openai_text_quote(p_quote_id,p_user_id,p_operation_id,p_route_code,p_workspace_id,p_workpiece_id,p_request_fingerprint,p_model,p_credential_funding,p_expires_at);
 select * into existing from tongs.openai_transcription_source_bindings where quote_id=p_quote_id;
 if found then
  if existing.route_code<>p_route_code or existing.user_id<>p_user_id or existing.workspace_id<>p_workspace_id or existing.workpiece_id<>p_workpiece_id
    or existing.source_asset_revision<>p_source_asset_revision or existing.source_sha256<>p_source_sha256 or existing.source_bytes<>p_source_bytes
    or existing.maximum_duration_seconds is distinct from p_maximum_duration_seconds or existing.maximum_chunks<>p_maximum_chunks or existing.output_contract<>p_output_contract
  then raise exception 'transcription source quote replay conflict' using errcode='23505'; end if;
 else
  insert into tongs.openai_transcription_source_bindings values(p_quote_id,p_route_code,p_user_id,p_workspace_id,p_workpiece_id,p_source_asset_revision,p_source_sha256,p_source_bytes,p_maximum_duration_seconds,p_maximum_chunks,p_output_contract,now());
 end if;
 return result;
end $$;

create or replace function tongs.reserve_customer_openai_transcription_quote(
 p_quote_id uuid,p_reservation_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_workspace_id uuid,p_workpiece_id text,
 p_request_fingerprint text,p_model text,p_credential_funding text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform tongs._require_pricing_service_role();
 if not exists(select 1 from tongs.openai_transcription_source_bindings s where s.quote_id=p_quote_id and s.route_code=p_route_code and s.user_id=p_user_id and s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id)
 then raise exception 'exact transcription source binding required' using errcode='42501'; end if;
 return tongs.reserve_customer_openai_text_quote(p_quote_id,p_reservation_id,p_user_id,p_operation_id,p_route_code,p_workspace_id,p_workpiece_id,p_request_fingerprint,p_model,p_credential_funding,p_idempotency_key);
end $$;

create or replace function tongs.persist_openai_transcription_result(
 p_operation_id text,p_reservation_id uuid,p_route_code text,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_source_sha256 text,p_provider_request_id text,p_transcript_json jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.openai_text_funding_bindings%rowtype; existing tongs.openai_transcription_canonical_results%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into b from tongs.openai_text_funding_bindings where operation_id=p_operation_id and reservation_id=p_reservation_id and route_code=p_route_code;
 if not found or p_source_sha256!~'^[0-9a-f]{64}$' or jsonb_typeof(p_transcript_json)<>'object' then raise exception 'funded transcription result binding required' using errcode='42501'; end if;
 select * into existing from tongs.openai_transcription_canonical_results where operation_id=p_operation_id;
 if found then
  if existing.reservation_id<>p_reservation_id or existing.source_sha256<>p_source_sha256 or existing.transcript_json<>p_transcript_json then raise exception 'transcription result replay conflict' using errcode='23505'; end if;
 else
  insert into tongs.openai_transcription_canonical_results values(p_operation_id,p_reservation_id,p_route_code,p_user_id,p_workspace_id,p_workpiece_id,p_source_sha256,p_provider_request_id,p_transcript_json,now());
 end if;
 return jsonb_build_object('operation_id',p_operation_id,'reservation_id',p_reservation_id,'persisted',true);
end $$;

create or replace function tongs.read_my_openai_transcription_result(p_operation_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); r tongs.openai_transcription_canonical_results%rowtype; customer_charge bigint:=0; settled boolean:=false;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select * into r from tongs.openai_transcription_canonical_results where operation_id=p_operation_id and user_id=uid;
 if not found then return null; end if;
 select coalesce(e.customer_charge_micros,0),true into customer_charge,settled from tongs.funding_reservation_events e where e.reservation_id=r.reservation_id and e.event_type='settled' order by e.sequence desc limit 1;
 return jsonb_build_object('operation_id',r.operation_id,'route_code',r.route_code,'workpiece_id',r.workpiece_id,'result',r.transcript_json,
  'customer_charge_micros',customer_charge,'status',case when settled then 'settled' else 'persistence_complete_reconciliation_pending' end,'created_at',r.created_at);
end $$;

-- OpenAI attempt expenses are recorded at the provider boundary before Forge
-- validation/persistence. Customer failure relief must therefore not create a
-- second supplier expense during settlement. This function only releases or
-- reverses customer funding; the attempt expense and aggregate exposure remain
-- independently reconcilable.
create or replace function tongs.settle_openai_customer_failure_without_duplicate_expense(
 p_reservation_id uuid,p_relief_id uuid,p_event_key text,p_failure_class text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare state text; relief jsonb; released jsonb;
begin
 perform tongs._require_pricing_service_role();
 if p_relief_id is null or length(btrim(coalesce(p_event_key,'')))<8
  or nullif(btrim(coalesce(p_failure_class,'')),'') is null
  or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object'
 then raise exception 'invalid OpenAI customer failure settlement' using errcode='22023'; end if;
 if not exists(select 1 from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id)
 then raise exception 'OpenAI funding binding required' using errcode='P0002'; end if;
 state:=tongs._funding_reservation_state(p_reservation_id);
 if state='submission_unknown' then
  raise exception 'ambiguous submission reservation requires reconciliation' using errcode='P0001';
 elsif state='settled' then
  relief:=tongs.relieve_failed_customer_operation(p_relief_id,p_reservation_id,btrim(p_event_key)||':customer-relief',
   'Forge/provider failure customer protection',coalesce(p_evidence_json,'{}'::jsonb));
  return jsonb_build_object('reservation_id',p_reservation_id,'state','relieved','customer_charge_micros',0,
   'customer_relief',relief,'supplier_expense_created',false);
 elsif state='released' then
  return jsonb_build_object('reservation_id',p_reservation_id,'state','released','replay',true,
   'customer_charge_micros',0,'supplier_expense_created',false);
 end if;
 released:=tongs.release_operation(p_reservation_id,btrim(p_event_key)||':zero-charge-release',
  'Confirmed '||btrim(p_failure_class)||'; customer charge zero',coalesce(p_evidence_json,'{}'::jsonb));
 return released||jsonb_build_object('customer_charge_micros',0,'supplier_expense_created',false);
end $$;

-- Widen only the hard-coded route admission in the existing quote function.
-- All other checks (enforce mode, complete cost, published exact price, verified
-- funds, immutable revisions) remain in that canonical function.
create or replace function tongs._is_customer_openai_paid_route(p_route_code text)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select p_route_code in ('hearth.research_synthesis','visual.unified_plan','visual.narrative_interpretation','motion.broll_interpretation','hammer.transcript_cleanup','shorts.discovery','quench.metadata','hearth.speech_transcription','anvil.realtime_transcription','hammer.transcript_prep','hammer.transcript_regeneration')
$$;

-- Preserve the complete existing quote implementation while replacing its
-- fixed route list with the shared predicate.
do $$
declare definition text;
begin
 select pg_get_functiondef('tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure) into definition;
 definition:=replace(definition,
  'p_route_code not in (''hearth.research_synthesis'',''visual.unified_plan'',''visual.narrative_interpretation'',''motion.broll_interpretation'',''hammer.transcript_cleanup'',''shorts.discovery'',''quench.metadata'')',
  'not tongs._is_customer_openai_paid_route(p_route_code)');
 execute definition;
end $$;

-- Organization audio-usage evidence reports seconds and request counts rather
-- than request IDs or token totals. Extend the existing conservative allocator
-- so it may allocate an audio cost bucket only when project, API key, model,
-- interval, request count, and the sum of provider-reported durations all match.
-- Missing duration evidence remains unresolved; it never falls back to a
-- request-level or customer allocation guess.
do $$
declare definition text;
begin
 select pg_get_functiondef('tongs._process_openai_organization_reconciliation(uuid)'::regprocedure) into definition;
 definition:=replace(definition,
  'candidate_output bigint; distinct_refs bigint;',
  'candidate_output bigint; candidate_duration numeric; distinct_refs bigint;');
 definition:=replace(definition,
  'and x.project_id is not distinct from ub.project_id;',
  'and x.project_id is not distinct from ub.project_id and coalesce(x.evidence_json->>''operation_kind'',''completions'')=coalesce(ub.evidence_json->>''operation_kind'',''completions'');');
 definition:=replace(definition,
  'coalesce(sum(u.output_units),0),count(distinct u.provider_request_id)',
  'coalesce(sum(u.output_units),0),coalesce(sum(case when (u.evidence_json->>''duration_seconds'')~''^[0-9]+([.][0-9]+)?$'' then (u.evidence_json->>''duration_seconds'')::numeric else 0 end),0),count(distinct u.provider_request_id)');
 definition:=replace(definition,
  'into candidate_count,candidate_input,candidate_cached,candidate_output,distinct_refs',
  'into candidate_count,candidate_input,candidate_cached,candidate_output,candidate_duration,distinct_refs');
 definition:=replace(definition,
  'and u.recorded_at<to_timestamp((ub.evidence_json->>''end_time'')::double precision);',
  'and u.recorded_at<to_timestamp((ub.evidence_json->>''end_time'')::double precision) and coalesce(u.evidence_json->>''operation_kind'',''completions'')=case when coalesce(ub.evidence_json->>''operation_kind'',''completions'')=''audio_transcriptions'' then ''audio_transcription'' else ''completions'' end;');
 definition:=replace(definition,
  'or candidate_input<>ub.input_tokens or candidate_cached<>ub.cached_input_tokens or candidate_output<>ub.output_tokens then continue;',
  'or (coalesce(ub.evidence_json->>''operation_kind'',''completions'')=''audio_transcriptions'' and candidate_duration<>(ub.evidence_json->>''duration_seconds'')::numeric) or (coalesce(ub.evidence_json->>''operation_kind'',''completions'')<>''audio_transcriptions'' and (candidate_input<>ub.input_tokens or candidate_cached<>ub.cached_input_tokens or candidate_output<>ub.output_tokens)) then continue;');
 execute definition;
end $$;

-- Return audio/text rate dimensions to the shared server coordinator. Existing
-- text callers keep their legacy input rate through COALESCE.
do $$
declare definition text;
begin
 select pg_get_functiondef('tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text)'::regprocedure) into definition;
 definition:=replace(definition,
  '''output_micros_per_million_tokens'',v_rate.output_micros_per_million_tokens,',
  '''output_micros_per_million_tokens'',v_rate.output_micros_per_million_tokens,''audio_input_micros_per_million_tokens'',coalesce(v_rate.audio_input_micros_per_million_tokens,v_rate.input_micros_per_million_tokens),''text_input_micros_per_million_tokens'',coalesce(v_rate.text_input_micros_per_million_tokens,v_rate.input_micros_per_million_tokens),');
 execute definition;
end $$;

-- Historical Sep 1-10 evidence remains an authoritative organization aggregate,
-- not a request-level allocation. This row records that explicit limitation and
-- does not create or adjust any supplier expense.
insert into tongs.openai_transcription_reconciliation_notes(
 id,source_key,amount_micros,currency,period_start,period_end,classification,allocation_status,request_level_certainty,evidence_json
) values(
 '4d000000-0000-4000-8000-000000000001','openai:transcription:2026-09-01:2026-09-10:authoritative-unallocated',39058,'USD','2026-09-01T00:00:00Z','2026-09-10T00:00:00Z','authoritative_organization_aggregate','unmatched',false,
 '{"authoritative_total_micros":39058,"classification":"transcription","allocation":"unmatched","duplicate_expense_created":false,"request_level_certainty":false}'::jsonb
) on conflict(source_key) do nothing;

revoke all on function tongs.resolve_openai_transcription_model_for_quote(uuid,text,text) from public,anon,authenticated;
revoke all on function tongs.create_customer_openai_transcription_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz,text,text,bigint,numeric,integer,text) from public,anon,authenticated;
revoke all on function tongs.reserve_customer_openai_transcription_quote(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function tongs.persist_openai_transcription_result(text,uuid,text,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.settle_openai_customer_failure_without_duplicate_expense(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function tongs.resolve_openai_transcription_model_for_quote(uuid,text,text) to service_role;
grant execute on function tongs.create_customer_openai_transcription_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz,text,text,bigint,numeric,integer,text) to service_role;
grant execute on function tongs.reserve_customer_openai_transcription_quote(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text) to service_role;
grant execute on function tongs.persist_openai_transcription_result(text,uuid,text,uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function tongs.settle_openai_customer_failure_without_duplicate_expense(uuid,uuid,text,text,jsonb) to service_role;
revoke all on function tongs.read_my_openai_transcription_result(text) from public,anon;
grant execute on function tongs.read_my_openai_transcription_result(text) to authenticated;

comment on table tongs.openai_transcription_source_bindings is 'Immutable exact source-asset/upload revision binding for accepted transcription terms.';
comment on table tongs.openai_transcription_canonical_results is 'Server-only canonical replay result for ephemeral Hearth/Anvil speech. Audio bytes are not retained here.';
comment on table tongs.openai_transcription_supporting_cost_inventory is 'Unapproved supporting costs block activation; no missing cost is treated as zero.';
comment on function tongs._process_openai_organization_reconciliation(uuid) is 'Allocates completions by exact aggregate token completeness and audio transcription by exact aggregate duration/request-count completeness; otherwise leaves cost unmatched.';
comment on function tongs.read_my_openai_transcription_result(text) is 'Customer-safe result and charge only; no wholesale rate, supplier expense, markup, or margin fields.';

notify pgrst,'reload schema';
commit;
