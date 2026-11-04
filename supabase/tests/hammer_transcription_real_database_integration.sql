-- Disposable certification only. This file is never a migration and must never
-- run against a linked database. It exercises the production Hammer financial
-- RPCs with deterministic synthetic provider evidence and rolls everything back.
\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if current_database()<>'postgres'
     or current_setting('forge.hammer_real_db_certification',true)
          is distinct from 'disposable-baseline-v1'
     or current_setting('request.jwt.claim.role',true)
          is distinct from 'service_role'
     or exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.hammer_canonical_transcripts_v2)
  then raise exception 'Hammer real-database fixture requires an empty guarded disposable database'
    using errcode='42501';
  end if;
end
$guard$;

insert into auth.users(id,email) values
  ('71daf61b-57b3-4e5f-a8c8-64befecb5950','synthetic-brad@disposable.invalid'),
  ('42c3de1d-bd24-41fe-abd9-640f17518b2c','synthetic-operator@disposable.invalid');
insert into tongs.platform_operators(user_id,reason,granted_by) values
  ('42c3de1d-bd24-41fe-abd9-640f17518b2c',
   'Synthetic disposable Hammer integration operator.',
   '42c3de1d-bd24-41fe-abd9-640f17518b2c');
insert into tongs.account_authority_classifications(
  user_id,account_class,revision,reason,configured_by
) values(
  '42c3de1d-bd24-41fe-abd9-640f17518b2c','owner',1,
  'Synthetic disposable Hammer integration owner authority.',
  '42c3de1d-bd24-41fe-abd9-640f17518b2c');
insert into tongs.account_authority_classification_events(
  id,user_id,revision,account_class,reason,actor_id,evidence
) values(
  '6cf76eff-0000-4000-8000-000000000003','42c3de1d-bd24-41fe-abd9-640f17518b2c',
  1,'owner','Synthetic disposable Hammer integration owner authority.',
  '42c3de1d-bd24-41fe-abd9-640f17518b2c','{"source":"synthetic_disposable_certification"}'::jsonb);
insert into tongs.owner_testing_principals(user_id,status,revision,reason,configured_by) values(
  '42c3de1d-bd24-41fe-abd9-640f17518b2c','enabled',1,
  'Synthetic disposable Hammer integration owner principal.',
  '42c3de1d-bd24-41fe-abd9-640f17518b2c');
insert into tongs.owner_testing_principal_events(id,user_id,revision,status,reason,actor_id) values(
  '6cf76eff-0000-4000-8000-000000000004','42c3de1d-bd24-41fe-abd9-640f17518b2c',
  1,'enabled','Synthetic disposable Hammer integration owner principal.',
  '42c3de1d-bd24-41fe-abd9-640f17518b2c');
insert into tongs.orgs(id,name,created_by) values
  ('cc5478ff-37be-403e-824c-467fa7da0600','Synthetic Hammer certification org',
   '71daf61b-57b3-4e5f-a8c8-64befecb5950');
insert into tongs.workspaces(id,name,created_by,org_id) values
  ('cc5478ff-37be-403e-824c-467fa7da061e','Synthetic Hammer certification workspace',
   '71daf61b-57b3-4e5f-a8c8-64befecb5950','cc5478ff-37be-403e-824c-467fa7da0600');
insert into tongs.episodes(id,workspace_id,label,created_by,creation_origin) values
  ('21d16d6a-905b-491e-8761-028789612ae5','cc5478ff-37be-403e-824c-467fa7da061e',
   'Synthetic Hammer real-database certification','71daf61b-57b3-4e5f-a8c8-64befecb5950',
   'synthetic_disposable_certification');

insert into tongs.recording_capture_authorities(
  id,workspace_id,workpiece_id,operation_key,provenance,established_by,
  venue,script_binding_kind,request_fingerprint
) values(
  '6cf76eff-0000-4000-8000-000000000001','cc5478ff-37be-403e-824c-467fa7da061e',
  '21d16d6a-905b-491e-8761-028789612ae5','synthetic-hammer-db-certification',
  'completion_backfill','71daf61b-57b3-4e5f-a8c8-64befecb5950','anvil','none',
  md5('synthetic-hammer-db-certification'));
insert into tongs.workpiece_files(
  workpiece_id,path,file_type,content_type,bytes,hash_value,storage_key,
  written_by_tool,written_by_tool_version,written_by_lane
) values(
  '21d16d6a-905b-491e-8761-028789612ae5','recordings/synthetic-hammer-certification.webm',
  'recording','video/webm',120617428,
  '595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24',
  'workpieces/21d16d6a-905b-491e-8761-028789612ae5/recordings/synthetic-hammer-certification.webm',
  'hammer','disposable-certification','forge-managed');
insert into tongs.recording_media_verification_receipts(
  id,workspace_id,workpiece_id,recording_capture_authority_id,media_path,media_revision,
  media_hash,media_bytes,media_content_type,storage_bucket,storage_key,duration_ms,
  has_audio_stream,has_video_stream,probe_implementation,verification_evidence,verified_by
) values(
  '6cf76eff-0000-4000-8000-000000000002','cc5478ff-37be-403e-824c-467fa7da061e',
  '21d16d6a-905b-491e-8761-028789612ae5','6cf76eff-0000-4000-8000-000000000001',
  'recordings/synthetic-hammer-certification.webm',1,
  '595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24',
  120617428,'video/webm','forge-workpieces',
  'workpieces/21d16d6a-905b-491e-8761-028789612ae5/recordings/synthetic-hammer-certification.webm',
  603848,true,true,'deterministic-disposable-provider','{"synthetic":true}'::jsonb,
  '71daf61b-57b3-4e5f-a8c8-64befecb5950');
insert into tongs.anvil_recording_completion_requests(
  id,workspace_id,workpiece_id,capture_session_id,capture_authority_id,media_path,
  media_revision,media_hash,media_bytes,media_content_type,storage_bucket,storage_key,
  idempotency_key,request_fingerprint,completion_evidence,completed_by,
  media_verification_receipt_id
) values(
  'bf67d649-1bc2-44ba-9a33-783b3ab523ea','cc5478ff-37be-403e-824c-467fa7da061e',
  '21d16d6a-905b-491e-8761-028789612ae5',null,
  '6cf76eff-0000-4000-8000-000000000001','recordings/synthetic-hammer-certification.webm',1,
  '595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24',
  120617428,'video/webm','forge-workpieces',
  'workpieces/21d16d6a-905b-491e-8761-028789612ae5/recordings/synthetic-hammer-certification.webm',
  'synthetic-hammer-completion',md5('synthetic-hammer-completion'),
  jsonb_build_object('schema','forge.recording-completion.v2','completed',true,
    'canonical_media_verification',jsonb_build_object(
      'source','trusted_tongs_storage_readback','has_audio_stream',true,
      'duration_ms',603848,'sha256','595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24',
      'bytes',120617428,'content_type','video/webm',
      'probe_implementation','deterministic-disposable-provider')),
  '71daf61b-57b3-4e5f-a8c8-64befecb5950','6cf76eff-0000-4000-8000-000000000002');
insert into tongs.canonical_recordings(
  id,workspace_id,workpiece_id,status,media_path,media_content_type,media_bytes,
  media_duration_ms,media_id,created_by,updated_by
) values(
  '4cc846e3-187c-46d9-8733-e7402488236c','cc5478ff-37be-403e-824c-467fa7da061e',
  '21d16d6a-905b-491e-8761-028789612ae5','draft',
  'recordings/synthetic-hammer-certification.webm','video/webm',120617428,603848,
  'anvil-completion:bf67d649-1bc2-44ba-9a33-783b3ab523ea',
  '71daf61b-57b3-4e5f-a8c8-64befecb5950','71daf61b-57b3-4e5f-a8c8-64befecb5950');
insert into tongs.recording_revisions(
  id,workspace_id,workpiece_id,canonical_recording_id,status,label,created_by,updated_by
) values(
  '9c991aa7-f551-4f03-a4d6-41eb40ef81ec','cc5478ff-37be-403e-824c-467fa7da061e',
  '21d16d6a-905b-491e-8761-028789612ae5','4cc846e3-187c-46d9-8733-e7402488236c',
  'active','Synthetic disposable certification','71daf61b-57b3-4e5f-a8c8-64befecb5950',
  '71daf61b-57b3-4e5f-a8c8-64befecb5950');

select tongs.install_brad_hammer_first_transcription_authority_bundle(
  '42c3de1d-bd24-41fe-abd9-640f17518b2c',repeat('a',64),
  'https://disposable.invalid/assemblyai-account-evidence',clock_timestamp()-interval '1 minute',
  clock_timestamp()+interval '20 hours',repeat('b',64),clock_timestamp()-interval '1 minute',
  clock_timestamp()+interval '20 hours',1000000,500000000,500000000,true,
  clock_timestamp()-interval '1 minute',clock_timestamp()+interval '12 hours',
  'Synthetic disposable Hammer real-database certification.');

select tongs.install_hammer_owner_funded_first_transcription_authority(
  '6cf76eff-0000-4000-8000-000000000010','6cf76eff-0000-4000-8000-000000000011',
  extensions.uuid_generate_v5('4cc846e3-187c-46d9-8733-e7402488236c','assemblyai-activation-authority-v1'),
  '42c3de1d-bd24-41fe-abd9-640f17518b2c',clock_timestamp()-interval '1 minute',
  clock_timestamp()+interval '10 hours','Synthetic disposable Hammer owner sponsorship.');

do $environment_guard$
begin
  if tongs._current_financial_environment() is distinct from 'test' then
    raise exception 'owner fixture changed canonical runtime environment (rows=%, value=%)',
      (select count(*) from tongs.financial_runtime_environment_revisions),
      tongs._current_financial_environment();
  end if;
  if not exists(
    select 1 from pg_trigger trigger_row
     where trigger_row.tgrelid='tongs.customer_spending_quotes'::regclass
       and trigger_row.tgname='customer_spending_quotes_financial_environment'
       and trigger_row.tgenabled='O' and not trigger_row.tgisinternal
  ) then
    raise exception 'canonical quote-environment trigger is unavailable';
  end if;
end
$environment_guard$;

do $flow$
declare
  v_quote jsonb;
  v_quote_hash text;
  v_accept jsonb;
  v_reserved jsonb;
  v_authorized jsonb;
  v_persisted jsonb;
  v_settled jsonb;
  v_readback jsonb;
  v_transcript jsonb;
begin
  v_quote:=tongs.create_hammer_first_transcription_quote(
    '6cf76eff-0000-4000-8000-000000000020','6cf76eff-0000-4000-8000-000000000021',
    '71daf61b-57b3-4e5f-a8c8-64befecb5950','cc5478ff-37be-403e-824c-467fa7da061e',
    '21d16d6a-905b-491e-8761-028789612ae5','4cc846e3-187c-46d9-8733-e7402488236c',
    '9c991aa7-f551-4f03-a4d6-41eb40ef81ec',repeat('c',64));
  if (v_quote->>'customer_credit_units')::bigint<>0
     or (v_quote->>'reference_customer_credit_units')::bigint<>12
     or v_quote->>'funding_source'<>'owner_budget' then
    raise exception 'owner-sponsored quote did not retain zero-charge/12-Credit reference contract';
  end if;
  if (select financial_environment from tongs.customer_spending_quotes
       where id='6cf76eff-0000-4000-8000-000000000020') is distinct from 'test' then
    raise exception 'canonical trigger did not stamp the owner-sponsored quote as Test';
  end if;
  v_quote_hash:=v_quote->>'quote_hash';

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','71daf61b-57b3-4e5f-a8c8-64befecb5950',true);
  v_accept:=tongs.accept_quote('6cf76eff-0000-4000-8000-000000000020',
    '6cf76eff-0000-4000-8000-000000000022','synthetic-acceptance',v_quote_hash);
  if coalesce((v_accept->>'replay')::boolean,true) then raise exception 'initial acceptance replayed'; end if;
  v_accept:=tongs.accept_quote('6cf76eff-0000-4000-8000-000000000020',
    '6cf76eff-0000-4000-8000-000000000022','synthetic-acceptance',v_quote_hash);
  if coalesce((v_accept->>'replay')::boolean,false) is not true then raise exception 'acceptance replay not idempotent'; end if;

  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  v_reserved:=tongs.reserve_hammer_first_transcription_quote(
    '6cf76eff-0000-4000-8000-000000000020','6cf76eff-0000-4000-8000-000000000023',
    '71daf61b-57b3-4e5f-a8c8-64befecb5950','6cf76eff-0000-4000-8000-000000000021',
    repeat('c',64),'synthetic-reservation');
  if v_reserved->>'funding_source'<>'owner_budget'
     or (v_reserved->>'customer_charge_micros')::bigint<>0 then
    raise exception 'actual PostgreSQL owner reservation contract failed';
  end if;
  v_authorized:=tongs.authorize_hammer_first_transcription_attempt(
    '6cf76eff-0000-4000-8000-000000000021','6cf76eff-0000-4000-8000-000000000024',
    'synthetic-attempt',repeat('d',64),jsonb_build_object('evidenceSha256',repeat('b',64)));
  if coalesce((v_authorized->>'provider_execution_authorized')::boolean,false) is not true
     or (v_authorized->>'automatic_retries')::integer<>0 then
    raise exception 'actual PostgreSQL provider-attempt authorization failed: %',v_authorized;
  end if;

  perform tongs.record_hammer_first_transcription_submission(
    '6cf76eff-0000-4000-8000-000000000021','6cf76eff-0000-4000-8000-000000000024',
    'synthetic-assemblyai-request-1','{"provider":"deterministic_simulation","network":false}'::jsonb);
  perform tongs.complete_hammer_first_transcription_attempt(
    '6cf76eff-0000-4000-8000-000000000021','6cf76eff-0000-4000-8000-000000000024',
    'synthetic-assemblyai-request-1',repeat('e',64),
    '{"provider":"deterministic_simulation","network":false,"status":"completed"}'::jsonb);
  v_transcript:=jsonb_build_object(
    'schema_version','2','recording',jsonb_build_object(
      'media_sha256','595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24',
      'duration_ms',603848),
    'provider',jsonb_build_object('provider','assemblyai','model','universal-3-5-pro',
      'provider_request_id','synthetic-assemblyai-request-1'),
    'segments',jsonb_build_array(jsonb_build_object('id','segment-1','start_ms',0,
      'end_ms',1200,'speaker','A','text','Synthetic Hammer certification transcript.')));
  v_persisted:=tongs.persist_hammer_canonical_transcript_v2(
    '6cf76eff-0000-4000-8000-000000000021','6cf76eff-0000-4000-8000-000000000025',
    '6cf76eff-0000-4000-8000-000000000024','synthetic-assemblyai-request-1',repeat('f',64),
    v_transcript,'hammer/recordings/4cc846e3-187c-46d9-8733-e7402488236c/baseline/transcript.v2.json',
    '6cf76eff-0000-4000-8000-000000000026',
    'synthetic-canonical-persisted',repeat('1',64));
  if coalesce((v_persisted->>'replay')::boolean,true) then raise exception 'canonical persistence unexpectedly replayed'; end if;
  v_settled:=tongs.settle_hammer_first_transcription_operation(
    '6cf76eff-0000-4000-8000-000000000021','6cf76eff-0000-4000-8000-000000000027',
    'synthetic-owner-settlement',1000,
    '{"authoritative":true,"actual_supporting_cost_micros":500,"promotional_credit_offset_micros":0,"provider":"deterministic_simulation","network":false}'::jsonb);
  if (v_settled->>'customer_charge_micros')::bigint<>0
     or v_settled->>'state'<>'completed' then raise exception 'owner settlement failed: %',v_settled; end if;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','71daf61b-57b3-4e5f-a8c8-64befecb5950',true);
  v_readback:=tongs.read_my_hammer_transcription_evidence('6cf76eff-0000-4000-8000-000000000021');
  if v_readback#>>'{operation,state}'<>'completed'
     or v_readback#>>'{canonical_transcript,id}'<>'6cf76eff-0000-4000-8000-000000000025'
     or jsonb_array_length(v_readback->'attempts')<>1 then
    raise exception 'Hammer hydration/evidence contract did not expose persisted transcript: %',v_readback;
  end if;
end
$flow$;

do $negative$
declare
  v_second_attempt jsonb;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  begin
    perform tongs.record_hammer_first_transcription_submission(
      '6cf76eff-0000-4000-8000-000000000021','6cf76eff-0000-4000-8000-000000000024',
      'conflicting-synthetic-provider-request',
      '{"provider":"deterministic_simulation","network":false,"conflicting_replay":true}'::jsonb);
    raise exception 'ambiguous provider submission replay unexpectedly succeeded';
  exception when others then
    if sqlerrm='ambiguous provider submission replay unexpectedly succeeded' then raise; end if;
  end;
  begin
    perform tongs.reserve_hammer_first_transcription_quote(
      '6cf76eff-0000-4000-8000-000000000020','6cf76eff-0000-4000-8000-000000000030',
      '71daf61b-57b3-4e5f-a8c8-64befecb5950','6cf76eff-0000-4000-8000-000000000021',
      repeat('c',64),'duplicate-reservation');
    raise exception 'duplicate operation reservation unexpectedly succeeded';
  exception when others then
    if sqlerrm='duplicate operation reservation unexpectedly succeeded' then raise; end if;
  end;
  v_second_attempt:=tongs.authorize_hammer_first_transcription_attempt(
    '6cf76eff-0000-4000-8000-000000000021','6cf76eff-0000-4000-8000-000000000031',
    'second-attempt',repeat('2',64),jsonb_build_object('evidenceSha256',repeat('b',64)));
  if coalesce((v_second_attempt->>'provider_execution_authorized')::boolean,false)
     or v_second_attempt->>'reason' is null then
    raise exception 'exhausted provider attempt did not fail closed: %',v_second_attempt;
  end if;
  if (select count(*) from tongs.hammer_transcription_provider_attempts)<>1
     or (select count(*) from tongs.customer_spending_quote_acceptances)<>1
     or exists(select 1 from tongs.ai_credit_ledger
       where user_id='71daf61b-57b3-4e5f-a8c8-64befecb5950') then
    raise exception 'duplicate execution or customer debit escaped containment';
  end if;
end
$negative$;

rollback;

do $cleanup$
begin
  if exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.hammer_canonical_transcripts_v2)
     or exists(select 1 from tongs.hammer_owner_funded_transcription_authorities)
  then raise exception 'Hammer disposable certification did not roll back cleanly'; end if;
end
$cleanup$;
