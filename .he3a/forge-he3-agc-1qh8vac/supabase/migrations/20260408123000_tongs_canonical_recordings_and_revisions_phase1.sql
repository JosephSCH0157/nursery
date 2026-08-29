-- Phase 1: Canonical Recording + Revisions (DB-first)
-- Goals:
-- - Canonical recording baseline is immutable once sealed.
-- - All mutable Hammer editor state lives in revision-scoped records.
-- - Workpiece (tongs.episodes) points to canonical_recording_id and active_revision_id.

begin;

-- 1) Canonical recordings (Phase 1: exactly one per workpiece)
create table if not exists tongs.canonical_recordings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'sealed', 'failed')),

  -- Immutable media receipt snapshot (copied from kept take truth)
  kept_take_event_id bigint null,
  media_path text not null,
  media_content_type text null,
  media_bytes bigint null,
  media_duration_ms bigint null,
  recording_session_id uuid null,
  anvil_capture_session_id text null,
  media_id text not null,
  media_signature text null,

  -- Immutable canonical baseline artifacts (never overwritten after sealed_at)
  baseline_transcript_path text null,
  baseline_timing_path text null,
  baseline_speaker_map_path text null,

  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  sealed_at timestamptz null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),

  constraint canonical_recordings_one_per_workpiece unique (workspace_id, workpiece_id)
);

create index if not exists canonical_recordings_workspace_created_idx
  on tongs.canonical_recordings (workspace_id, created_at desc);

create index if not exists canonical_recordings_workpiece_idx
  on tongs.canonical_recordings (workpiece_id);

drop trigger if exists trg_canonical_recordings_updated_at on tongs.canonical_recordings;
create trigger trg_canonical_recordings_updated_at
before update on tongs.canonical_recordings
for each row execute function tongs.set_updated_at();

-- Enforce immutability of canonical baselines once sealed.
create or replace function tongs.enforce_canonical_recording_immutable()
returns trigger
language plpgsql
as $$
begin
  -- Workspace/workpiece identity is never mutable.
  if new.workspace_id <> old.workspace_id then
    raise exception 'canonical_recordings.workspace_id is immutable';
  end if;
  if new.workpiece_id <> old.workpiece_id then
    raise exception 'canonical_recordings.workpiece_id is immutable';
  end if;

  -- Once sealed, media receipt and baseline pointers are immutable.
  if old.sealed_at is not null then
    if new.media_path <> old.media_path
      or coalesce(new.media_content_type, '') <> coalesce(old.media_content_type, '')
      or coalesce(new.media_bytes, -1) <> coalesce(old.media_bytes, -1)
      or coalesce(new.media_duration_ms, -1) <> coalesce(old.media_duration_ms, -1)
      or coalesce(new.recording_session_id::text, '') <> coalesce(old.recording_session_id::text, '')
      or coalesce(new.anvil_capture_session_id, '') <> coalesce(old.anvil_capture_session_id, '')
      or new.media_id <> old.media_id
      or coalesce(new.media_signature, '') <> coalesce(old.media_signature, '')
      or coalesce(new.kept_take_event_id, -1) <> coalesce(old.kept_take_event_id, -1)
    then
      raise exception 'canonical_recordings media receipt fields are immutable after sealed_at';
    end if;

    if coalesce(new.baseline_transcript_path, '') <> coalesce(old.baseline_transcript_path, '')
      or coalesce(new.baseline_timing_path, '') <> coalesce(old.baseline_timing_path, '')
      or coalesce(new.baseline_speaker_map_path, '') <> coalesce(old.baseline_speaker_map_path, '')
    then
      raise exception 'canonical_recordings baseline artifact pointers are immutable after sealed_at';
    end if;

    if new.sealed_at <> old.sealed_at then
      raise exception 'canonical_recordings.sealed_at is immutable once set';
    end if;
  end if;

  -- When sealing (transition null -> non-null), require baseline transcript to be present.
  if old.sealed_at is null and new.sealed_at is not null then
    if new.status <> 'sealed' then
      raise exception 'canonical_recordings.status must be sealed when sealed_at is set';
    end if;
    if new.baseline_transcript_path is null then
      raise exception 'canonical_recordings.baseline_transcript_path must be set before sealing';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_canonical_recordings_immutable on tongs.canonical_recordings;
create trigger trg_canonical_recordings_immutable
before update on tongs.canonical_recordings
for each row execute function tongs.enforce_canonical_recording_immutable();

alter table tongs.canonical_recordings enable row level security;

drop policy if exists canonical_recordings_select_if_workspace_viewer on tongs.canonical_recordings;
drop policy if exists canonical_recordings_insert_if_workspace_editor on tongs.canonical_recordings;
drop policy if exists canonical_recordings_update_if_workspace_editor on tongs.canonical_recordings;
drop policy if exists canonical_recordings_delete_if_workspace_editor on tongs.canonical_recordings;

create policy canonical_recordings_select_if_workspace_viewer
on tongs.canonical_recordings
for select
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'viewer')
);

create policy canonical_recordings_insert_if_workspace_editor
on tongs.canonical_recordings
for insert
to authenticated
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy canonical_recordings_update_if_workspace_editor
on tongs.canonical_recordings
for update
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and updated_by = auth.uid()
);

create policy canonical_recordings_delete_if_workspace_editor
on tongs.canonical_recordings
for delete
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
);

grant select, insert, update, delete on table tongs.canonical_recordings to authenticated;
grant all on table tongs.canonical_recordings to service_role;


-- 2) Recording revisions (mutable editor state only)
create table if not exists tongs.recording_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  canonical_recording_id uuid not null references tongs.canonical_recordings(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'superseded', 'discarded')),
  label text null,

  -- Revision-scoped artifact pointers (mutable)
  editor_session_path text null,
  revision_transcript_path text null,
  audio_polish_path text null,
  visual_timeline_path text null,
  visual_placements_path text null,
  history_path text null,
  snapshots_manifest_path text null,

  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);

create index if not exists recording_revisions_canonical_updated_idx
  on tongs.recording_revisions (canonical_recording_id, updated_at desc);

create index if not exists recording_revisions_workpiece_updated_idx
  on tongs.recording_revisions (workpiece_id, updated_at desc);

drop trigger if exists trg_recording_revisions_updated_at on tongs.recording_revisions;
create trigger trg_recording_revisions_updated_at
before update on tongs.recording_revisions
for each row execute function tongs.set_updated_at();

alter table tongs.recording_revisions enable row level security;

drop policy if exists recording_revisions_select_if_workspace_viewer on tongs.recording_revisions;
drop policy if exists recording_revisions_insert_if_workspace_editor on tongs.recording_revisions;
drop policy if exists recording_revisions_update_if_workspace_editor on tongs.recording_revisions;
drop policy if exists recording_revisions_delete_if_workspace_editor on tongs.recording_revisions;

create policy recording_revisions_select_if_workspace_viewer
on tongs.recording_revisions
for select
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'viewer')
);

create policy recording_revisions_insert_if_workspace_editor
on tongs.recording_revisions
for insert
to authenticated
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy recording_revisions_update_if_workspace_editor
on tongs.recording_revisions
for update
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and updated_by = auth.uid()
);

create policy recording_revisions_delete_if_workspace_editor
on tongs.recording_revisions
for delete
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
);

grant select, insert, update, delete on table tongs.recording_revisions to authenticated;
grant all on table tongs.recording_revisions to service_role;


-- 3) Workpiece pointers
alter table tongs.episodes
  add column if not exists canonical_recording_id uuid null references tongs.canonical_recordings(id) on delete set null,
  add column if not exists active_revision_id uuid null references tongs.recording_revisions(id) on delete set null;

create index if not exists episodes_canonical_recording_idx
  on tongs.episodes (canonical_recording_id);

create index if not exists episodes_active_revision_idx
  on tongs.episodes (active_revision_id);

commit;

