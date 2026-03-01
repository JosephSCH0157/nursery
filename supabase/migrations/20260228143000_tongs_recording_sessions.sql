-- Recording sessions + episode linkage for scheduling and planning.
-- Hard rule: scheduling state must not alter recording completion state.

create table if not exists tongs.recording_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'planned',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recording_sessions_title_check check (length(btrim(title)) > 0),
  constraint recording_sessions_status_check check (status in ('planned', 'active', 'completed', 'canceled')),
  constraint recording_sessions_time_window_check check (ends_at is null or ends_at >= starts_at)
);

create index if not exists recording_sessions_workspace_starts_idx
  on tongs.recording_sessions (workspace_id, starts_at);

create index if not exists recording_sessions_workspace_status_idx
  on tongs.recording_sessions (workspace_id, status);

create index if not exists recording_sessions_created_by_idx
  on tongs.recording_sessions (created_by);

drop trigger if exists trg_recording_sessions_updated_at on tongs.recording_sessions;
create trigger trg_recording_sessions_updated_at
before update on tongs.recording_sessions
for each row execute function tongs.set_updated_at();

create table if not exists tongs.recording_session_episodes (
  recording_session_id uuid not null references tongs.recording_sessions(id) on delete cascade,
  episode_id uuid not null references tongs.episodes(id) on delete cascade,
  position integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (recording_session_id, episode_id),
  constraint recording_session_episodes_position_check check (position >= 0)
);

create index if not exists recording_session_episodes_session_position_idx
  on tongs.recording_session_episodes (recording_session_id, position, created_at);

create index if not exists recording_session_episodes_episode_idx
  on tongs.recording_session_episodes (episode_id);

drop trigger if exists trg_recording_session_episodes_updated_at on tongs.recording_session_episodes;
create trigger trg_recording_session_episodes_updated_at
before update on tongs.recording_session_episodes
for each row execute function tongs.set_updated_at();

alter table if exists tongs.calendar_events
  add column if not exists session_id uuid;

alter table if exists tongs.calendar_events
  drop constraint if exists calendar_events_session_id_fkey;

alter table if exists tongs.calendar_events
  add constraint calendar_events_session_id_fkey
  foreign key (session_id)
  references tongs.recording_sessions(id)
  on delete set null;

create index if not exists calendar_events_session_id_idx
  on tongs.calendar_events (session_id);

alter table tongs.recording_sessions enable row level security;
alter table tongs.recording_session_episodes enable row level security;

drop policy if exists recording_sessions_select_if_workspace_access on tongs.recording_sessions;
create policy recording_sessions_select_if_workspace_access
on tongs.recording_sessions
for select
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists recording_sessions_insert_if_workspace_access on tongs.recording_sessions;
create policy recording_sessions_insert_if_workspace_access
on tongs.recording_sessions
for insert
to authenticated
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists recording_sessions_update_if_workspace_access on tongs.recording_sessions;
create policy recording_sessions_update_if_workspace_access
on tongs.recording_sessions
for update
to authenticated
using (tongs.can_access_workspace(workspace_id))
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists recording_sessions_delete_if_workspace_access on tongs.recording_sessions;
create policy recording_sessions_delete_if_workspace_access
on tongs.recording_sessions
for delete
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists recording_session_episodes_select_if_workspace_access on tongs.recording_session_episodes;
create policy recording_session_episodes_select_if_workspace_access
on tongs.recording_session_episodes
for select
to authenticated
using (
  exists (
    select 1
    from tongs.recording_sessions rs
    where rs.id = recording_session_episodes.recording_session_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
);

drop policy if exists recording_session_episodes_insert_if_workspace_access on tongs.recording_session_episodes;
create policy recording_session_episodes_insert_if_workspace_access
on tongs.recording_session_episodes
for insert
to authenticated
with check (
  exists (
    select 1
    from tongs.recording_sessions rs
    join tongs.episodes e on e.id = recording_session_episodes.episode_id
    where rs.id = recording_session_episodes.recording_session_id
      and e.workspace_id = rs.workspace_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
);

drop policy if exists recording_session_episodes_update_if_workspace_access on tongs.recording_session_episodes;
create policy recording_session_episodes_update_if_workspace_access
on tongs.recording_session_episodes
for update
to authenticated
using (
  exists (
    select 1
    from tongs.recording_sessions rs
    join tongs.episodes e on e.id = recording_session_episodes.episode_id
    where rs.id = recording_session_episodes.recording_session_id
      and e.workspace_id = rs.workspace_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
)
with check (
  exists (
    select 1
    from tongs.recording_sessions rs
    join tongs.episodes e on e.id = recording_session_episodes.episode_id
    where rs.id = recording_session_episodes.recording_session_id
      and e.workspace_id = rs.workspace_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
);

drop policy if exists recording_session_episodes_delete_if_workspace_access on tongs.recording_session_episodes;
create policy recording_session_episodes_delete_if_workspace_access
on tongs.recording_session_episodes
for delete
to authenticated
using (
  exists (
    select 1
    from tongs.recording_sessions rs
    where rs.id = recording_session_episodes.recording_session_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
);
