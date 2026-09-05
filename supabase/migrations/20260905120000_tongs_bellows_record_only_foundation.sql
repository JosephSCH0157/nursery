begin;

alter table tongs.bellows_sessions
  add column if not exists authority_generation bigint not null default 1
    check (authority_generation > 0),
  add column if not exists workpiece_id uuid references tongs.episodes(id) on delete restrict;

create table if not exists tongs.bellows_session_participants (
  id text primary key,
  session_id text not null references tongs.bellows_sessions(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role_code text not null check (role_code in ('S1','S2','G1','G2')),
  capture_identity uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  unique (session_id, role_code),
  unique (session_id, id)
);

create table if not exists tongs.bellows_tracks (
  id text primary key,
  session_id text not null references tongs.bellows_sessions(id) on delete cascade,
  participant_id text not null,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  kind text not null check (kind in ('audio','video','audio_video')),
  continuity_state text not null default 'complete' check (continuity_state in ('complete','partial','dropped')),
  created_at timestamptz not null default now(),
  foreign key (session_id, participant_id)
    references tongs.bellows_session_participants(session_id, id) on delete cascade,
  unique (session_id, id)
);

create table if not exists tongs.bellows_segments (
  id text primary key,
  session_id text not null references tongs.bellows_sessions(id) on delete cascade,
  track_id text not null,
  participant_id text not null,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  recorder_generation integer not null check (recorder_generation > 0),
  boundary_reason text not null check (boundary_reason in ('initial','manual_stop','page_recovery','device_restart','permission_reset','capture_error')),
  mime_type text not null,
  capture_profile jsonb not null default '{}'::jsonb check (jsonb_typeof(capture_profile) = 'object'),
  started_at timestamptz not null,
  ended_at timestamptz,
  start_offset_ms bigint not null check (start_offset_ms >= 0),
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  expected_part_count integer check (expected_part_count is null or expected_part_count >= 0),
  byte_length bigint check (byte_length is null or byte_length >= 0),
  sha256 text,
  storage_bucket text,
  storage_key text,
  integrity_state text not null default 'pending' check (integrity_state in ('pending','verified','failed','unverifiable','missing')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, track_id) references tongs.bellows_tracks(session_id, id) on delete cascade,
  foreign key (session_id, participant_id) references tongs.bellows_session_participants(session_id, id) on delete cascade,
  unique (session_id, track_id, recorder_generation),
  check ((integrity_state = 'verified') = (verified_at is not null))
);

create table if not exists tongs.bellows_upload_parts (
  id text primary key,
  segment_id text not null references tongs.bellows_segments(id) on delete cascade,
  session_id text not null references tongs.bellows_sessions(id) on delete cascade,
  participant_id text not null,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  sequence_number integer not null check (sequence_number >= 0),
  byte_length bigint not null check (byte_length >= 0),
  sha256 text not null check (length(sha256) = 64),
  storage_bucket text not null default 'bellows-capture',
  storage_key text not null,
  upload_state text not null default 'queued' check (upload_state in ('queued','uploading','retryable_failed','permanently_failed','verified_received')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (segment_id, sequence_number),
  unique (storage_bucket, storage_key),
  check ((upload_state = 'verified_received') = (verified_at is not null))
);

create table if not exists tongs.bellows_sync_observations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references tongs.bellows_sessions(id) on delete cascade,
  participant_id text not null,
  segment_id text not null references tongs.bellows_segments(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  observation_kind text not null check (observation_kind in ('opening','interval','closing','before_restart','after_restart')),
  expected_offset_ms bigint not null,
  observed_audio_offset_ms bigint,
  observed_video_offset_ms bigint,
  corrected_residual_ms numeric,
  confidence numeric check (confidence is null or confidence between 0 and 1),
  correction_model jsonb not null default '{}'::jsonb check (jsonb_typeof(correction_model) = 'object'),
  observed_at timestamptz not null default now()
);

create table if not exists tongs.bellows_integrity_findings (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references tongs.bellows_sessions(id) on delete cascade,
  participant_id text,
  track_id text,
  segment_id text references tongs.bellows_segments(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  finding_type text not null check (finding_type in ('failed','unverifiable','missing','discontinuity','sync_out_of_tolerance')),
  interval_start_ms bigint,
  interval_end_ms bigint,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists tongs.bellows_incomplete_acceptances (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references tongs.bellows_sessions(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  accepted_by_user_id uuid not null references auth.users(id) on delete restrict,
  authority_generation bigint not null check (authority_generation > 0),
  finding_ids uuid[] not null check (cardinality(finding_ids) > 0),
  accepted_at timestamptz not null default now(),
  unique (session_id, authority_generation)
);

create table if not exists tongs.bellows_capture_packages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique references tongs.bellows_sessions(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  contract_version integer not null default 1 check (contract_version = 1),
  outcome text not null check (outcome in ('sealed','incomplete_capture')),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  manifest_sha256 text not null check (length(manifest_sha256) = 64),
  incomplete_acceptance_id uuid references tongs.bellows_incomplete_acceptances(id) on delete restrict,
  sealed_by_engine_at timestamptz not null default now(),
  hammer_handoff_id text not null unique,
  created_at timestamptz not null default now(),
  check ((outcome = 'incomplete_capture') = (incomplete_acceptance_id is not null))
);

create index if not exists bellows_segments_session_idx on tongs.bellows_segments(session_id, started_at);
create index if not exists bellows_upload_parts_pending_idx on tongs.bellows_upload_parts(session_id, upload_state, sequence_number);
create index if not exists bellows_integrity_findings_session_idx on tongs.bellows_integrity_findings(session_id, created_at);

drop trigger if exists trg_bellows_segments_updated_at on tongs.bellows_segments;
create trigger trg_bellows_segments_updated_at before update on tongs.bellows_segments
for each row execute function tongs.set_updated_at();
drop trigger if exists trg_bellows_upload_parts_updated_at on tongs.bellows_upload_parts;
create trigger trg_bellows_upload_parts_updated_at before update on tongs.bellows_upload_parts
for each row execute function tongs.set_updated_at();

create or replace function tongs.register_bellows_capture_segment(
  p_session_id text, p_participant_id text, p_track_id text, p_segment_id text,
  p_recorder_generation integer, p_boundary_reason text, p_mime_type text,
  p_capture_profile jsonb, p_started_at timestamptz, p_start_offset_ms bigint
) returns tongs.bellows_segments
language plpgsql security definer set search_path = tongs, public, auth as $$
declare v_session tongs.bellows_sessions; v_existing tongs.bellows_segments; v_result tongs.bellows_segments;
begin
  select * into v_session from tongs.bellows_sessions where id = p_session_id for update;
  if not found then raise exception 'bellows_session_not_found'; end if;
  if not tongs.has_workspace_role(v_session.workspace_id, 'editor') then raise exception 'bellows_capture_forbidden'; end if;
  insert into tongs.bellows_session_participants(id,session_id,workspace_id,user_id,role_code)
    values(p_participant_id,p_session_id,v_session.workspace_id,auth.uid(),'S1') on conflict (id) do nothing;
  insert into tongs.bellows_tracks(id,session_id,participant_id,workspace_id,kind)
    values(p_track_id,p_session_id,p_participant_id,v_session.workspace_id,'audio_video') on conflict (id) do nothing;
  select * into v_existing from tongs.bellows_segments where id = p_segment_id;
  if found then
    if v_existing.session_id <> p_session_id or v_existing.track_id <> p_track_id
      or v_existing.recorder_generation <> p_recorder_generation or v_existing.mime_type <> p_mime_type then
      raise exception 'bellows_segment_identity_conflict';
    end if;
    return v_existing;
  end if;
  insert into tongs.bellows_segments(id,session_id,track_id,participant_id,workspace_id,recorder_generation,boundary_reason,mime_type,capture_profile,started_at,start_offset_ms)
    values(p_segment_id,p_session_id,p_track_id,p_participant_id,v_session.workspace_id,p_recorder_generation,p_boundary_reason,p_mime_type,coalesce(p_capture_profile,'{}'),p_started_at,p_start_offset_ms)
    returning * into v_result;
  return v_result;
end $$;

create or replace function tongs.register_bellows_upload_part(
  p_session_id text, p_participant_id text, p_segment_id text, p_part_id text,
  p_sequence_number integer, p_byte_length bigint, p_sha256 text, p_storage_key text
) returns tongs.bellows_upload_parts
language plpgsql security definer set search_path = tongs, public, auth as $$
declare v_segment tongs.bellows_segments; v_existing tongs.bellows_upload_parts; v_result tongs.bellows_upload_parts;
begin
  select * into v_segment from tongs.bellows_segments where id=p_segment_id and session_id=p_session_id;
  if not found then raise exception 'bellows_segment_not_found'; end if;
  if not tongs.has_workspace_role(v_segment.workspace_id, 'editor') then raise exception 'bellows_capture_forbidden'; end if;
  select * into v_existing from tongs.bellows_upload_parts where id=p_part_id;
  if found then
    if v_existing.segment_id<>p_segment_id or v_existing.sequence_number<>p_sequence_number
      or v_existing.byte_length<>p_byte_length or v_existing.sha256<>lower(p_sha256) then
      raise exception 'bellows_upload_part_identity_conflict';
    end if;
    return v_existing;
  end if;
  insert into tongs.bellows_upload_parts(id,segment_id,session_id,participant_id,workspace_id,sequence_number,byte_length,sha256,storage_key)
    values(p_part_id,p_segment_id,p_session_id,p_participant_id,v_segment.workspace_id,p_sequence_number,p_byte_length,lower(p_sha256),p_storage_key)
    returning * into v_result;
  return v_result;
end $$;

create or replace function tongs.confirm_bellows_upload_part(
  p_part_id text, p_sha256 text
) returns tongs.bellows_upload_parts
language plpgsql security definer set search_path = tongs, public, auth as $$
declare v_part tongs.bellows_upload_parts;
begin
  select * into v_part from tongs.bellows_upload_parts where id=p_part_id for update;
  if not found then raise exception 'bellows_upload_part_not_found'; end if;
  if not tongs.has_workspace_role(v_part.workspace_id, 'editor') then raise exception 'bellows_capture_forbidden'; end if;
  if v_part.sha256<>lower(p_sha256) then raise exception 'bellows_upload_part_checksum_conflict'; end if;
  update tongs.bellows_upload_parts set upload_state='verified_received', verified_at=now(), attempt_count=attempt_count+1, last_error=null where id=p_part_id returning * into v_part;
  return v_part;
end $$;

create or replace function tongs.verify_bellows_capture_segment(
  p_segment_id text, p_expected_part_count integer, p_byte_length bigint,
  p_sha256 text, p_storage_key text, p_ended_at timestamptz, p_duration_ms bigint
) returns tongs.bellows_segments
language plpgsql security definer set search_path = tongs, public, auth as $$
declare v_segment tongs.bellows_segments; v_count integer; v_bytes bigint;
begin
  select * into v_segment from tongs.bellows_segments where id=p_segment_id for update;
  if not found then raise exception 'bellows_segment_not_found'; end if;
  if not tongs.has_workspace_role(v_segment.workspace_id, 'editor') then raise exception 'bellows_capture_forbidden'; end if;
  select count(*),coalesce(sum(byte_length),0) into v_count,v_bytes from tongs.bellows_upload_parts
    where segment_id=p_segment_id and upload_state='verified_received';
  if v_count<>p_expected_part_count or v_bytes<>p_byte_length then raise exception 'bellows_segment_parts_incomplete'; end if;
  update tongs.bellows_segments set expected_part_count=p_expected_part_count,byte_length=p_byte_length,sha256=lower(p_sha256),storage_bucket='bellows-capture',storage_key=p_storage_key,ended_at=p_ended_at,duration_ms=p_duration_ms,integrity_state='verified',verified_at=now()
    where id=p_segment_id returning * into v_segment;
  return v_segment;
end $$;

create or replace function tongs.accept_and_seal_incomplete_bellows_capture(
  p_session_id text, p_authority_generation bigint, p_finding_ids uuid[],
  p_workpiece_id uuid, p_manifest jsonb, p_manifest_sha256 text
) returns tongs.bellows_capture_packages
language plpgsql security definer set search_path = tongs, public, auth as $$
declare v_session tongs.bellows_sessions; v_acceptance uuid; v_package tongs.bellows_capture_packages;
begin
  select * into v_session from tongs.bellows_sessions where id=p_session_id for update;
  if not found then raise exception 'bellows_session_not_found'; end if;
  if v_session.authority_generation<>p_authority_generation then raise exception 'bellows_stale_authority_generation'; end if;
  if not exists(select 1 from tongs.bellows_session_participants p where p.session_id=p_session_id and p.id=v_session.acting_host_participant_id and p.user_id=auth.uid()) then raise exception 'bellows_incomplete_acceptance_forbidden'; end if;
  if not exists(select 1 from tongs.bellows_integrity_findings where session_id=p_session_id and id=any(p_finding_ids)) then raise exception 'bellows_findings_required'; end if;
  insert into tongs.bellows_incomplete_acceptances(session_id,workspace_id,accepted_by_user_id,authority_generation,finding_ids)
    values(p_session_id,v_session.workspace_id,auth.uid(),p_authority_generation,p_finding_ids) returning id into v_acceptance;
  insert into tongs.bellows_capture_packages(session_id,workspace_id,workpiece_id,outcome,manifest,manifest_sha256,incomplete_acceptance_id,hammer_handoff_id)
    values(p_session_id,v_session.workspace_id,p_workpiece_id,'incomplete_capture',p_manifest,lower(p_manifest_sha256),v_acceptance,'bellows:'||p_session_id)
    returning * into v_package;
  update tongs.bellows_sessions set lifecycle_state='incomplete_capture',outcome='incomplete_capture',seal_state='sealed',sealed_at=now(),workpiece_id=p_workpiece_id where id=p_session_id;
  return v_package;
end $$;

create or replace function tongs.seal_complete_bellows_capture(
  p_session_id text, p_authority_generation bigint, p_workpiece_id uuid,
  p_manifest jsonb, p_manifest_sha256 text
) returns tongs.bellows_capture_packages
language plpgsql security definer set search_path = tongs, public, auth as $$
declare v_session tongs.bellows_sessions; v_package tongs.bellows_capture_packages;
begin
  select * into v_session from tongs.bellows_sessions where id=p_session_id for update;
  if not found then raise exception 'bellows_session_not_found'; end if;
  if v_session.authority_generation<>p_authority_generation then raise exception 'bellows_stale_authority_generation'; end if;
  if not exists(select 1 from tongs.bellows_session_participants p where p.session_id=p_session_id and p.id=v_session.acting_host_participant_id and p.user_id=auth.uid()) then raise exception 'bellows_seal_forbidden'; end if;
  if exists(select 1 from tongs.bellows_segments where session_id=p_session_id and integrity_state<>'verified')
    or not exists(select 1 from tongs.bellows_segments where session_id=p_session_id)
    or exists(select 1 from tongs.bellows_integrity_findings where session_id=p_session_id) then
    raise exception 'bellows_complete_seal_integrity_failed';
  end if;
  insert into tongs.bellows_capture_packages(session_id,workspace_id,workpiece_id,outcome,manifest,manifest_sha256,hammer_handoff_id)
    values(p_session_id,v_session.workspace_id,p_workpiece_id,'sealed',p_manifest,lower(p_manifest_sha256),'bellows:'||p_session_id)
    on conflict(session_id) do nothing returning * into v_package;
  if v_package.id is null then
    select * into v_package from tongs.bellows_capture_packages where session_id=p_session_id;
    if v_package.manifest_sha256<>lower(p_manifest_sha256) then raise exception 'bellows_capture_package_identity_conflict'; end if;
  end if;
  update tongs.bellows_sessions set lifecycle_state='sealed',outcome='sealed',seal_state='sealed',sealed_at=coalesce(sealed_at,now()),workpiece_id=p_workpiece_id where id=p_session_id;
  return v_package;
end $$;

create or replace function tongs.read_bellows_authority_generation(p_session_id text)
returns jsonb language plpgsql security definer set search_path=tongs,public,auth stable as $$
declare v_session tongs.bellows_sessions;
begin
  select * into v_session from tongs.bellows_sessions where id=p_session_id;
  if not found or not tongs.can_access_workspace(v_session.workspace_id) then return jsonb_build_object('outcome','not_found'); end if;
  return jsonb_build_object('outcome','ok','authority_generation',v_session.authority_generation,'acting_host_participant_id',v_session.acting_host_participant_id);
end $$;

create or replace function tongs.promote_bellows_cohost_authority(
  p_session_id text, p_expected_generation bigint, p_cohost_participant_id text
) returns jsonb
language plpgsql security definer set search_path = tongs, public, auth as $$
declare v_session tongs.bellows_sessions;
begin
  select * into v_session from tongs.bellows_sessions where id=p_session_id for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  if v_session.authority_generation<>p_expected_generation then
    return jsonb_build_object('outcome','stale','authority_generation',v_session.authority_generation);
  end if;
  if not exists(select 1 from tongs.bellows_session_participants p where p.session_id=p_session_id and p.id=p_cohost_participant_id and p.role_code='S2' and p.user_id=auth.uid()) then
    return jsonb_build_object('outcome','denied');
  end if;
  update tongs.bellows_sessions set authority_generation=authority_generation+1,acting_authority_state='co_host_promoted',acting_host_participant_id=p_cohost_participant_id
    where id=p_session_id returning * into v_session;
  return jsonb_build_object('outcome','promoted','authority_generation',v_session.authority_generation,'acting_host_participant_id',v_session.acting_host_participant_id);
end $$;

alter table tongs.bellows_session_participants enable row level security;
alter table tongs.bellows_tracks enable row level security;
alter table tongs.bellows_segments enable row level security;
alter table tongs.bellows_upload_parts enable row level security;
alter table tongs.bellows_sync_observations enable row level security;
alter table tongs.bellows_integrity_findings enable row level security;
alter table tongs.bellows_incomplete_acceptances enable row level security;
alter table tongs.bellows_capture_packages enable row level security;

do $$ declare t text; begin
  foreach t in array array['bellows_session_participants','bellows_tracks','bellows_segments','bellows_upload_parts','bellows_sync_observations','bellows_integrity_findings','bellows_incomplete_acceptances','bellows_capture_packages'] loop
    execute format('drop policy if exists %I on tongs.%I',t||'_workspace_access',t);
    execute format('create policy %I on tongs.%I for select using (tongs.can_access_workspace(workspace_id))',t||'_workspace_access',t);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bellows-capture','bellows-capture',false,1073741824,array['video/webm','video/mp4','audio/webm','application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists bellows_capture_operator_read on storage.objects;
create policy bellows_capture_operator_read on storage.objects for select to authenticated using (
  bucket_id='bellows-capture' and exists(select 1 from tongs.bellows_sessions s where s.id=(storage.foldername(name))[2] and tongs.can_access_workspace(s.workspace_id))
);
drop policy if exists bellows_capture_operator_insert on storage.objects;
create policy bellows_capture_operator_insert on storage.objects for insert to authenticated with check (
  bucket_id='bellows-capture' and exists(select 1 from tongs.bellows_sessions s where s.id=(storage.foldername(name))[2] and tongs.has_workspace_role(s.workspace_id,'editor'))
);

revoke all on function tongs.register_bellows_capture_segment(text,text,text,text,integer,text,text,jsonb,timestamptz,bigint) from public;
revoke all on function tongs.register_bellows_upload_part(text,text,text,text,integer,bigint,text,text) from public;
revoke all on function tongs.confirm_bellows_upload_part(text,text) from public;
revoke all on function tongs.verify_bellows_capture_segment(text,integer,bigint,text,text,timestamptz,bigint) from public;
revoke all on function tongs.accept_and_seal_incomplete_bellows_capture(text,bigint,uuid[],uuid,jsonb,text) from public;
revoke all on function tongs.seal_complete_bellows_capture(text,bigint,uuid,jsonb,text) from public;
revoke all on function tongs.promote_bellows_cohost_authority(text,bigint,text) from public;
revoke all on function tongs.read_bellows_authority_generation(text) from public;
grant execute on function tongs.register_bellows_capture_segment(text,text,text,text,integer,text,text,jsonb,timestamptz,bigint) to authenticated,service_role;
grant execute on function tongs.register_bellows_upload_part(text,text,text,text,integer,bigint,text,text) to authenticated,service_role;
grant execute on function tongs.confirm_bellows_upload_part(text,text) to authenticated,service_role;
grant execute on function tongs.verify_bellows_capture_segment(text,integer,bigint,text,text,timestamptz,bigint) to authenticated,service_role;
grant execute on function tongs.accept_and_seal_incomplete_bellows_capture(text,bigint,uuid[],uuid,jsonb,text) to authenticated,service_role;
grant execute on function tongs.seal_complete_bellows_capture(text,bigint,uuid,jsonb,text) to authenticated,service_role;
grant execute on function tongs.promote_bellows_cohost_authority(text,bigint,text) to authenticated,service_role;
grant execute on function tongs.read_bellows_authority_generation(text) to authenticated,service_role;
grant select on tongs.bellows_session_participants,tongs.bellows_tracks,tongs.bellows_segments,tongs.bellows_upload_parts,tongs.bellows_sync_observations,tongs.bellows_integrity_findings,tongs.bellows_incomplete_acceptances,tongs.bellows_capture_packages to authenticated,service_role;

commit;
