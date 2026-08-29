-- Bellows Phase Seven: canonical runtime recovery persistence.
-- Bellows runtime truth must not be coerced into planner/session scheduling tables.

begin;

create table if not exists tongs.bellows_sessions (
  id text primary key,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  host_user_id text not null,
  title text not null,
  mode text not null,
  session_type text not null,
  recording_session_id uuid null references tongs.recording_sessions(id) on delete set null,
  calendar_event_id uuid null references tongs.calendar_events(id) on delete set null,
  acting_authority_state text not null,
  host_participant_id text null,
  acting_host_participant_id text null,
  co_host_participant_ids text[] not null default '{}'::text[],
  lifecycle_state text not null,
  recording_state text not null,
  broadcast_state text not null,
  upload_state text not null,
  seal_state text not null,
  outcome text null,
  integrity_flags text[] not null default '{}'::text[],
  snapshot_schema_version integer not null default 1,
  latest_checkpoint_id uuid null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  ended_at timestamptz null,
  sealed_at timestamptz null,
  archived_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint bellows_sessions_id_check check (length(btrim(id)) > 0),
  constraint bellows_sessions_host_user_id_check check (length(btrim(host_user_id)) > 0),
  constraint bellows_sessions_title_check check (length(btrim(title)) > 0),
  constraint bellows_sessions_mode_check check (mode in ('record_only', 'live')),
  constraint bellows_sessions_session_type_check check (session_type in ('remote', 'hybrid', 'solo')),
  constraint bellows_sessions_acting_authority_state_check check (
    acting_authority_state in ('host_present', 'co_host_promoted', 'engine_stewardship')
  ),
  constraint bellows_sessions_lifecycle_state_check check (
    lifecycle_state in (
      'idle',
      'configuring',
      'linking_accounts',
      'inviting',
      'waiting_for_participants',
      'preflight_ready',
      'preflight_checks',
      'ready_to_start',
      'countdown',
      'sync_initializing',
      'recording_active',
      'recording_degraded',
      'recording_offline_local',
      'recording_rejoining',
      'finalizing_local',
      'uploading',
      'upload_degraded',
      'upload_paused',
      'upload_resuming',
      'upload_complete_pending_verification',
      'verifying_integrity',
      'assembling_manifest',
      'sealing_session',
      'sealed',
      'incomplete_capture',
      'failed_capture',
      'archived'
    )
  ),
  constraint bellows_sessions_recording_state_check check (
    recording_state in (
      'idle',
      'countdown',
      'sync_initializing',
      'active',
      'degraded',
      'offline_local',
      'rejoining',
      'stopping',
      'stopped'
    )
  ),
  constraint bellows_sessions_broadcast_state_check check (
    broadcast_state in (
      'not_broadcasting',
      'starting',
      'live',
      'degraded',
      'disconnected',
      'ended'
    )
  ),
  constraint bellows_sessions_upload_state_check check (
    upload_state in (
      'not_started',
      'finalizing_local',
      'uploading',
      'degraded',
      'paused',
      'resuming',
      'complete_pending_verification'
    )
  ),
  constraint bellows_sessions_seal_state_check check (
    seal_state in (
      'not_started',
      'verifying_integrity',
      'assembling_manifest',
      'sealing_session',
      'sealed'
    )
  ),
  constraint bellows_sessions_outcome_check check (
    outcome is null
    or outcome in ('sealed', 'incomplete_capture', 'failed_capture', 'archived')
  ),
  constraint bellows_sessions_snapshot_schema_version_check check (snapshot_schema_version > 0),
  constraint bellows_sessions_integrity_flags_check check (
    integrity_flags <@ array[
      'missing_track',
      'degraded_quality',
      'participant_dropout',
      'upload_interrupted',
      'resync_required',
      'corrupted_capture'
    ]::text[]
  )
);

create table if not exists tongs.bellows_session_checkpoints (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references tongs.bellows_sessions(id) on delete cascade,
  sequence_no bigint not null,
  checkpoint_kind text not null,
  trigger_action_source text not null,
  trigger_action_type text not null,
  actor_type text null,
  actor_id text null,
  effect_type text null,
  follow_up_action_source text null,
  follow_up_action_type text null,
  offset_ms bigint null,
  occurred_at timestamptz null,
  lifecycle_state text not null,
  recording_state text not null,
  broadcast_state text not null,
  upload_state text not null,
  seal_state text not null,
  outcome text null,
  acting_authority_state text not null,
  host_participant_id text null,
  acting_host_participant_id text null,
  co_host_participant_ids text[] not null default '{}'::text[],
  integrity_flags text[] not null default '{}'::text[],
  event_count integer not null default 0,
  snapshot_schema_version integer not null default 1,
  session_snapshot jsonb not null,
  delta jsonb null,
  recorded_at timestamptz not null default now(),
  constraint bellows_session_checkpoints_sequence_check check (sequence_no > 0),
  constraint bellows_session_checkpoints_kind_check check (
    checkpoint_kind in (
      'session_created',
      'draft_updated',
      'runtime_transition',
      'effect_checkpoint',
      'recovery_checkpoint',
      'integrity_checkpoint',
      'seal_checkpoint',
      'archive_checkpoint'
    )
  ),
  constraint bellows_session_checkpoints_trigger_action_source_check check (
    trigger_action_source in (
      'host',
      'co_host',
      'participant',
      'capture',
      'connectivity',
      'broadcast',
      'upload',
      'recovery',
      'engine'
    )
  ),
  constraint bellows_session_checkpoints_trigger_action_type_check check (
    length(btrim(trigger_action_type)) > 0
  ),
  constraint bellows_session_checkpoints_actor_type_check check (
    actor_type is null
    or actor_type in ('host', 'co_host', 'participant', 'engine', 'system')
  ),
  constraint bellows_session_checkpoints_effect_type_check check (
    effect_type is null
    or effect_type in (
      'run_preflight_checks',
      'generate_invite_links',
      'start_countdown',
      'establish_t0',
      'emit_sync_marker',
      'start_local_recording',
      'start_broadcast',
      'stop_broadcast',
      'finalize_local_segments',
      'resume_pending_uploads',
      'verify_integrity',
      'assemble_manifest',
      'seal_session_record',
      'promote_co_host',
      'enter_engine_stewardship'
    )
  ),
  constraint bellows_session_checkpoints_follow_up_action_source_check check (
    follow_up_action_source is null
    or follow_up_action_source in (
      'host',
      'co_host',
      'participant',
      'capture',
      'connectivity',
      'broadcast',
      'upload',
      'recovery',
      'engine'
    )
  ),
  constraint bellows_session_checkpoints_follow_up_action_pair_check check (
    (follow_up_action_source is null and follow_up_action_type is null)
    or (
      follow_up_action_source is not null
      and follow_up_action_type is not null
      and length(btrim(follow_up_action_type)) > 0
    )
  ),
  constraint bellows_session_checkpoints_lifecycle_state_check check (
    lifecycle_state in (
      'idle',
      'configuring',
      'linking_accounts',
      'inviting',
      'waiting_for_participants',
      'preflight_ready',
      'preflight_checks',
      'ready_to_start',
      'countdown',
      'sync_initializing',
      'recording_active',
      'recording_degraded',
      'recording_offline_local',
      'recording_rejoining',
      'finalizing_local',
      'uploading',
      'upload_degraded',
      'upload_paused',
      'upload_resuming',
      'upload_complete_pending_verification',
      'verifying_integrity',
      'assembling_manifest',
      'sealing_session',
      'sealed',
      'incomplete_capture',
      'failed_capture',
      'archived'
    )
  ),
  constraint bellows_session_checkpoints_recording_state_check check (
    recording_state in (
      'idle',
      'countdown',
      'sync_initializing',
      'active',
      'degraded',
      'offline_local',
      'rejoining',
      'stopping',
      'stopped'
    )
  ),
  constraint bellows_session_checkpoints_broadcast_state_check check (
    broadcast_state in (
      'not_broadcasting',
      'starting',
      'live',
      'degraded',
      'disconnected',
      'ended'
    )
  ),
  constraint bellows_session_checkpoints_upload_state_check check (
    upload_state in (
      'not_started',
      'finalizing_local',
      'uploading',
      'degraded',
      'paused',
      'resuming',
      'complete_pending_verification'
    )
  ),
  constraint bellows_session_checkpoints_seal_state_check check (
    seal_state in (
      'not_started',
      'verifying_integrity',
      'assembling_manifest',
      'sealing_session',
      'sealed'
    )
  ),
  constraint bellows_session_checkpoints_outcome_check check (
    outcome is null
    or outcome in ('sealed', 'incomplete_capture', 'failed_capture', 'archived')
  ),
  constraint bellows_session_checkpoints_acting_authority_state_check check (
    acting_authority_state in ('host_present', 'co_host_promoted', 'engine_stewardship')
  ),
  constraint bellows_session_checkpoints_integrity_flags_check check (
    integrity_flags <@ array[
      'missing_track',
      'degraded_quality',
      'participant_dropout',
      'upload_interrupted',
      'resync_required',
      'corrupted_capture'
    ]::text[]
  ),
  constraint bellows_session_checkpoints_event_count_check check (event_count >= 0),
  constraint bellows_session_checkpoints_snapshot_schema_version_check check (snapshot_schema_version > 0),
  constraint bellows_session_checkpoints_session_snapshot_check check (
    jsonb_typeof(session_snapshot) = 'object'
  ),
  constraint bellows_session_checkpoints_delta_check check (
    delta is null or jsonb_typeof(delta) = 'object'
  ),
  constraint bellows_session_checkpoints_session_sequence_unique unique (session_id, sequence_no),
  constraint bellows_session_checkpoints_session_id_unique unique (session_id, id)
);

alter table if exists tongs.bellows_sessions
  drop constraint if exists bellows_sessions_latest_checkpoint_belongs_to_session_fkey;
alter table if exists tongs.bellows_sessions
  add constraint bellows_sessions_latest_checkpoint_belongs_to_session_fkey
  foreign key (id, latest_checkpoint_id)
  references tongs.bellows_session_checkpoints(session_id, id)
  on delete set null
  deferrable initially deferred;

create unique index if not exists bellows_sessions_recording_session_id_unique
  on tongs.bellows_sessions (recording_session_id)
  where recording_session_id is not null;

create unique index if not exists bellows_sessions_calendar_event_id_unique
  on tongs.bellows_sessions (calendar_event_id)
  where calendar_event_id is not null;

create index if not exists bellows_sessions_workspace_created_idx
  on tongs.bellows_sessions (workspace_id, created_at desc);

create index if not exists bellows_sessions_workspace_updated_idx
  on tongs.bellows_sessions (workspace_id, updated_at desc);

create index if not exists bellows_sessions_workspace_lifecycle_idx
  on tongs.bellows_sessions (workspace_id, lifecycle_state, updated_at desc);

create index if not exists bellows_sessions_workspace_recoverable_idx
  on tongs.bellows_sessions (workspace_id, updated_at desc)
  where lifecycle_state not in ('sealed', 'incomplete_capture', 'failed_capture', 'archived');

create index if not exists bellows_sessions_host_user_idx
  on tongs.bellows_sessions (host_user_id, updated_at desc);

create index if not exists bellows_session_checkpoints_session_sequence_idx
  on tongs.bellows_session_checkpoints (session_id, sequence_no desc);

create index if not exists bellows_session_checkpoints_session_recorded_idx
  on tongs.bellows_session_checkpoints (session_id, recorded_at desc, sequence_no desc);

drop trigger if exists trg_bellows_sessions_updated_at on tongs.bellows_sessions;
create trigger trg_bellows_sessions_updated_at
before update on tongs.bellows_sessions
for each row execute function tongs.set_updated_at();

create or replace function tongs.validate_bellows_session_links()
returns trigger
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_recording_workspace_id uuid;
  v_calendar_workspace_id uuid;
begin
  if new.recording_session_id is not null then
    select rs.workspace_id
    into v_recording_workspace_id
    from tongs.recording_sessions rs
    where rs.id = new.recording_session_id;

    if v_recording_workspace_id is null then
      raise exception 'bellows_recording_session_not_found'
        using errcode = 'P0002';
    end if;

    if v_recording_workspace_id <> new.workspace_id then
      raise exception 'bellows_recording_session_workspace_mismatch'
        using errcode = '22023';
    end if;
  end if;

  if new.calendar_event_id is not null then
    select ce.workspace_id
    into v_calendar_workspace_id
    from tongs.calendar_events ce
    where ce.id = new.calendar_event_id;

    if v_calendar_workspace_id is null then
      raise exception 'bellows_calendar_event_not_found'
        using errcode = 'P0002';
    end if;

    if v_calendar_workspace_id <> new.workspace_id then
      raise exception 'bellows_calendar_event_workspace_mismatch'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bellows_sessions_validate_links on tongs.bellows_sessions;
create trigger trg_bellows_sessions_validate_links
before insert or update on tongs.bellows_sessions
for each row execute function tongs.validate_bellows_session_links();

create or replace function tongs.block_bellows_session_checkpoint_mutation()
returns trigger
language plpgsql
set search_path = tongs, public
as $$
begin
  raise exception 'bellows_session_checkpoints is append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_bellows_session_checkpoints_append_only on tongs.bellows_session_checkpoints;
create trigger trg_bellows_session_checkpoints_append_only
before update or delete on tongs.bellows_session_checkpoints
for each row execute function tongs.block_bellows_session_checkpoint_mutation();

create or replace function tongs.create_bellows_session_header(
  p_session_id text,
  p_workspace_id uuid,
  p_host_user_id text,
  p_title text,
  p_mode text,
  p_session_type text,
  p_acting_authority_state text,
  p_host_participant_id text default null,
  p_acting_host_participant_id text default null,
  p_co_host_participant_ids text[] default '{}'::text[],
  p_lifecycle_state text default 'idle',
  p_recording_state text default 'idle',
  p_broadcast_state text default 'not_broadcasting',
  p_upload_state text default 'not_started',
  p_seal_state text default 'not_started',
  p_outcome text default null,
  p_integrity_flags text[] default '{}'::text[],
  p_recording_session_id uuid default null,
  p_calendar_event_id uuid default null,
  p_started_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_sealed_at timestamptz default null,
  p_archived_at timestamptz default null,
  p_snapshot_schema_version integer default 1
)
returns tongs.bellows_sessions
language plpgsql
security invoker
set search_path = tongs, public
as $$
declare
  v_session tongs.bellows_sessions;
begin
  if p_session_id is null or btrim(p_session_id) = '' then
    raise exception 'session_id is required'
      using errcode = '22023';
  end if;

  if p_host_user_id is null or btrim(p_host_user_id) = '' then
    raise exception 'host_user_id is required'
      using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    perform tongs.assert_workspace_role(p_workspace_id, 'editor');
  end if;

  insert into tongs.bellows_sessions (
    id,
    workspace_id,
    host_user_id,
    title,
    mode,
    session_type,
    recording_session_id,
    calendar_event_id,
    acting_authority_state,
    host_participant_id,
    acting_host_participant_id,
    co_host_participant_ids,
    lifecycle_state,
    recording_state,
    broadcast_state,
    upload_state,
    seal_state,
    outcome,
    integrity_flags,
    snapshot_schema_version,
    started_at,
    ended_at,
    sealed_at,
    archived_at
  )
  values (
    btrim(p_session_id),
    p_workspace_id,
    btrim(p_host_user_id),
    coalesce(nullif(btrim(p_title), ''), 'Bellows Session'),
    p_mode,
    p_session_type,
    p_recording_session_id,
    p_calendar_event_id,
    p_acting_authority_state,
    nullif(btrim(coalesce(p_host_participant_id, '')), ''),
    nullif(btrim(coalesce(p_acting_host_participant_id, '')), ''),
    coalesce(p_co_host_participant_ids, '{}'::text[]),
    p_lifecycle_state,
    p_recording_state,
    p_broadcast_state,
    p_upload_state,
    p_seal_state,
    p_outcome,
    coalesce(p_integrity_flags, '{}'::text[]),
    p_snapshot_schema_version,
    p_started_at,
    p_ended_at,
    p_sealed_at,
    p_archived_at
  )
  returning *
  into v_session;

  return v_session;
end;
$$;

create or replace function tongs.append_bellows_session_checkpoint(
  p_session_id text,
  p_checkpoint_kind text,
  p_trigger_action_source text,
  p_trigger_action_type text,
  p_actor_type text default null,
  p_actor_id text default null,
  p_effect_type text default null,
  p_follow_up_action_source text default null,
  p_follow_up_action_type text default null,
  p_offset_ms bigint default null,
  p_occurred_at timestamptz default null,
  p_lifecycle_state text default null,
  p_recording_state text default null,
  p_broadcast_state text default null,
  p_upload_state text default null,
  p_seal_state text default null,
  p_outcome text default null,
  p_acting_authority_state text default null,
  p_host_participant_id text default null,
  p_acting_host_participant_id text default null,
  p_co_host_participant_ids text[] default null,
  p_integrity_flags text[] default null,
  p_event_count integer default 0,
  p_session_snapshot jsonb default null,
  p_delta jsonb default null,
  p_started_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_sealed_at timestamptz default null,
  p_archived_at timestamptz default null,
  p_snapshot_schema_version integer default 1
)
returns tongs.bellows_session_checkpoints
language plpgsql
security invoker
set search_path = tongs, public
as $$
declare
  v_session tongs.bellows_sessions;
  v_next_sequence bigint;
  v_checkpoint tongs.bellows_session_checkpoints;
begin
  if p_session_snapshot is null or jsonb_typeof(p_session_snapshot) <> 'object' then
    raise exception 'session_snapshot must be a JSON object'
      using errcode = '22023';
  end if;

  select *
  into v_session
  from tongs.bellows_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'bellows_session_not_found'
      using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    perform tongs.assert_workspace_role(v_session.workspace_id, 'editor');
  end if;

  select coalesce(max(sequence_no), 0) + 1
  into v_next_sequence
  from tongs.bellows_session_checkpoints
  where session_id = p_session_id;

  insert into tongs.bellows_session_checkpoints (
    session_id,
    sequence_no,
    checkpoint_kind,
    trigger_action_source,
    trigger_action_type,
    actor_type,
    actor_id,
    effect_type,
    follow_up_action_source,
    follow_up_action_type,
    offset_ms,
    occurred_at,
    lifecycle_state,
    recording_state,
    broadcast_state,
    upload_state,
    seal_state,
    outcome,
    acting_authority_state,
    host_participant_id,
    acting_host_participant_id,
    co_host_participant_ids,
    integrity_flags,
    event_count,
    snapshot_schema_version,
    session_snapshot,
    delta
  )
  values (
    p_session_id,
    v_next_sequence,
    p_checkpoint_kind,
    p_trigger_action_source,
    p_trigger_action_type,
    p_actor_type,
    nullif(btrim(coalesce(p_actor_id, '')), ''),
    p_effect_type,
    p_follow_up_action_source,
    p_follow_up_action_type,
    p_offset_ms,
    p_occurred_at,
    coalesce(p_lifecycle_state, v_session.lifecycle_state),
    coalesce(p_recording_state, v_session.recording_state),
    coalesce(p_broadcast_state, v_session.broadcast_state),
    coalesce(p_upload_state, v_session.upload_state),
    coalesce(p_seal_state, v_session.seal_state),
    coalesce(p_outcome, v_session.outcome),
    coalesce(p_acting_authority_state, v_session.acting_authority_state),
    coalesce(nullif(btrim(coalesce(p_host_participant_id, '')), ''), v_session.host_participant_id),
    coalesce(nullif(btrim(coalesce(p_acting_host_participant_id, '')), ''), v_session.acting_host_participant_id),
    coalesce(p_co_host_participant_ids, v_session.co_host_participant_ids),
    coalesce(p_integrity_flags, v_session.integrity_flags),
    coalesce(p_event_count, 0),
    p_snapshot_schema_version,
    p_session_snapshot,
    p_delta
  )
  returning *
  into v_checkpoint;

  update tongs.bellows_sessions
  set
    latest_checkpoint_id = v_checkpoint.id,
    acting_authority_state = v_checkpoint.acting_authority_state,
    host_participant_id = v_checkpoint.host_participant_id,
    acting_host_participant_id = v_checkpoint.acting_host_participant_id,
    co_host_participant_ids = v_checkpoint.co_host_participant_ids,
    lifecycle_state = v_checkpoint.lifecycle_state,
    recording_state = v_checkpoint.recording_state,
    broadcast_state = v_checkpoint.broadcast_state,
    upload_state = v_checkpoint.upload_state,
    seal_state = v_checkpoint.seal_state,
    outcome = v_checkpoint.outcome,
    integrity_flags = v_checkpoint.integrity_flags,
    snapshot_schema_version = v_checkpoint.snapshot_schema_version,
    started_at = coalesce(tongs.bellows_sessions.started_at, p_started_at),
    ended_at = coalesce(tongs.bellows_sessions.ended_at, p_ended_at),
    sealed_at = coalesce(tongs.bellows_sessions.sealed_at, p_sealed_at),
    archived_at = coalesce(tongs.bellows_sessions.archived_at, p_archived_at)
  where id = p_session_id;

  return v_checkpoint;
end;
$$;

create or replace function tongs.mark_bellows_session_latest_checkpoint(
  p_session_id text,
  p_checkpoint_id uuid
)
returns tongs.bellows_sessions
language plpgsql
security invoker
set search_path = tongs, public
as $$
declare
  v_session tongs.bellows_sessions;
  v_checkpoint tongs.bellows_session_checkpoints;
begin
  select *
  into v_session
  from tongs.bellows_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'bellows_session_not_found'
      using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    perform tongs.assert_workspace_role(v_session.workspace_id, 'editor');
  end if;

  select *
  into v_checkpoint
  from tongs.bellows_session_checkpoints
  where session_id = p_session_id
    and id = p_checkpoint_id;

  if not found then
    raise exception 'bellows_checkpoint_not_found'
      using errcode = 'P0002';
  end if;

  update tongs.bellows_sessions
  set
    latest_checkpoint_id = v_checkpoint.id,
    acting_authority_state = v_checkpoint.acting_authority_state,
    host_participant_id = v_checkpoint.host_participant_id,
    acting_host_participant_id = v_checkpoint.acting_host_participant_id,
    co_host_participant_ids = v_checkpoint.co_host_participant_ids,
    lifecycle_state = v_checkpoint.lifecycle_state,
    recording_state = v_checkpoint.recording_state,
    broadcast_state = v_checkpoint.broadcast_state,
    upload_state = v_checkpoint.upload_state,
    seal_state = v_checkpoint.seal_state,
    outcome = v_checkpoint.outcome,
    integrity_flags = v_checkpoint.integrity_flags,
    snapshot_schema_version = v_checkpoint.snapshot_schema_version
  where id = p_session_id
  returning *
  into v_session;

  return v_session;
end;
$$;

alter table tongs.bellows_sessions enable row level security;
alter table tongs.bellows_session_checkpoints enable row level security;

drop policy if exists bellows_sessions_select_if_workspace_viewer on tongs.bellows_sessions;
create policy bellows_sessions_select_if_workspace_viewer
on tongs.bellows_sessions
for select
to authenticated
using (
  tongs.can_access_workspace(tongs.bellows_sessions.workspace_id)
);

drop policy if exists bellows_sessions_insert_if_workspace_editor on tongs.bellows_sessions;
create policy bellows_sessions_insert_if_workspace_editor
on tongs.bellows_sessions
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.bellows_sessions.workspace_id, 'editor')
);

drop policy if exists bellows_sessions_update_if_workspace_editor on tongs.bellows_sessions;
create policy bellows_sessions_update_if_workspace_editor
on tongs.bellows_sessions
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.bellows_sessions.workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(tongs.bellows_sessions.workspace_id, 'editor')
);

drop policy if exists bellows_session_checkpoints_select_if_workspace_viewer on tongs.bellows_session_checkpoints;
create policy bellows_session_checkpoints_select_if_workspace_viewer
on tongs.bellows_session_checkpoints
for select
to authenticated
using (
  exists (
    select 1
    from tongs.bellows_sessions s
    where s.id = tongs.bellows_session_checkpoints.session_id
      and tongs.can_access_workspace(s.workspace_id)
  )
);

drop policy if exists bellows_session_checkpoints_insert_if_workspace_editor on tongs.bellows_session_checkpoints;
create policy bellows_session_checkpoints_insert_if_workspace_editor
on tongs.bellows_session_checkpoints
for insert
to authenticated
with check (
  exists (
    select 1
    from tongs.bellows_sessions s
    where s.id = tongs.bellows_session_checkpoints.session_id
      and tongs.has_workspace_role(s.workspace_id, 'editor')
  )
);

revoke all on function tongs.validate_bellows_session_links() from public;
revoke all on function tongs.block_bellows_session_checkpoint_mutation() from public;
revoke all on function tongs.create_bellows_session_header(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  integer
) from public;
revoke all on function tongs.append_bellows_session_checkpoint(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text[],
  integer,
  jsonb,
  jsonb,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  integer
) from public;
revoke all on function tongs.mark_bellows_session_latest_checkpoint(text, uuid) from public;

grant execute on function tongs.validate_bellows_session_links() to authenticated;
grant execute on function tongs.validate_bellows_session_links() to service_role;
grant execute on function tongs.block_bellows_session_checkpoint_mutation() to authenticated;
grant execute on function tongs.block_bellows_session_checkpoint_mutation() to service_role;
grant execute on function tongs.create_bellows_session_header(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  integer
) to authenticated;
grant execute on function tongs.create_bellows_session_header(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  integer
) to service_role;
grant execute on function tongs.append_bellows_session_checkpoint(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text[],
  integer,
  jsonb,
  jsonb,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  integer
) to authenticated;
grant execute on function tongs.append_bellows_session_checkpoint(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text[],
  integer,
  jsonb,
  jsonb,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  integer
) to service_role;
grant execute on function tongs.mark_bellows_session_latest_checkpoint(text, uuid) to authenticated;
grant execute on function tongs.mark_bellows_session_latest_checkpoint(text, uuid) to service_role;

commit;
