-- Phase 3: recording sessions + deterministic ordered items.
-- Data and API contract foundation (no UI concerns).

create table if not exists tongs.recording_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  title text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  calendar_event_id uuid null references tongs.calendar_events(id) on delete set null,
  constraint recording_sessions_title_check check (length(btrim(title)) > 0)
);

alter table if exists tongs.recording_sessions
  add column if not exists workspace_id uuid;
alter table if exists tongs.recording_sessions
  add column if not exists title text;
alter table if exists tongs.recording_sessions
  add column if not exists created_by uuid;
alter table if exists tongs.recording_sessions
  add column if not exists created_at timestamptz not null default now();
alter table if exists tongs.recording_sessions
  add column if not exists updated_at timestamptz not null default now();
alter table if exists tongs.recording_sessions
  add column if not exists calendar_event_id uuid;

alter table if exists tongs.recording_sessions
  alter column title set not null;

alter table if exists tongs.recording_sessions
  drop constraint if exists recording_sessions_calendar_event_id_fkey;
alter table if exists tongs.recording_sessions
  add constraint recording_sessions_calendar_event_id_fkey
  foreign key (calendar_event_id)
  references tongs.calendar_events(id)
  on delete set null;

create index if not exists recording_sessions_workspace_created_idx
  on tongs.recording_sessions (workspace_id, created_at desc);
create index if not exists recording_sessions_calendar_event_id_idx
  on tongs.recording_sessions (calendar_event_id);

drop trigger if exists trg_recording_sessions_updated_at on tongs.recording_sessions;
create trigger trg_recording_sessions_updated_at
before update on tongs.recording_sessions
for each row execute function tongs.set_updated_at();

create table if not exists tongs.recording_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tongs.recording_sessions(id) on delete cascade,
  position integer not null,
  episode_id uuid not null references tongs.episodes(id) on delete cascade,
  script_path text not null,
  created_at timestamptz not null default now(),
  constraint recording_session_items_position_check check (position > 0),
  constraint recording_session_items_script_path_check check (length(btrim(script_path)) > 0),
  constraint recording_session_items_session_position_unique unique (session_id, position),
  constraint recording_session_items_session_episode_path_unique unique (session_id, episode_id, script_path)
);

alter table if exists tongs.recording_session_items
  add column if not exists id uuid default gen_random_uuid();
alter table if exists tongs.recording_session_items
  add column if not exists created_at timestamptz not null default now();

create index if not exists recording_session_items_session_position_idx
  on tongs.recording_session_items (session_id, position asc, created_at asc);
create index if not exists recording_session_items_episode_idx
  on tongs.recording_session_items (episode_id);

-- Atomic session creation + optional calendar binding.
create or replace function tongs.create_recording_session(
  p_workspace_id uuid,
  p_title text,
  p_created_by uuid,
  p_calendar_event_id uuid default null
)
returns tongs.recording_sessions
language plpgsql
security invoker
as $$
declare
  v_session tongs.recording_sessions;
  v_title text := coalesce(nullif(btrim(p_title), ''), 'Recording Session');
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required' using errcode = '22023';
  end if;

  if p_created_by is null then
    raise exception 'created_by is required' using errcode = '22023';
  end if;

  if p_calendar_event_id is not null then
    if not exists (
      select 1
      from tongs.calendar_events ce
      where ce.id = p_calendar_event_id
        and ce.workspace_id = p_workspace_id
    ) then
      raise exception 'calendar_event_mismatch' using errcode = '22023';
    end if;
  end if;

  insert into tongs.recording_sessions (
    workspace_id,
    title,
    created_by,
    calendar_event_id,
    starts_at,
    ends_at,
    status
  )
  values (
    p_workspace_id,
    v_title,
    p_created_by,
    p_calendar_event_id,
    now(),
    null,
    'planned'
  )
  returning *
  into v_session;

  if p_calendar_event_id is not null then
    update tongs.calendar_events
    set session_id = v_session.id
    where id = p_calendar_event_id
      and workspace_id = p_workspace_id;
  end if;

  return v_session;
end;
$$;

-- Deterministic full replacement in a single transaction boundary.
create or replace function tongs.replace_recording_session_items(
  p_session_id uuid,
  p_items jsonb
)
returns setof tongs.recording_session_items
language plpgsql
security invoker
as $$
declare
  v_workspace_id uuid;
  v_item jsonb;
  v_position integer := 0;
  v_episode_id uuid;
  v_script_path text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;

  select rs.workspace_id
  into v_workspace_id
  from tongs.recording_sessions rs
  where rs.id = p_session_id;

  if v_workspace_id is null then
    raise exception 'recording_session_not_found' using errcode = 'P0002';
  end if;

  delete from tongs.recording_session_items
  where session_id = p_session_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;
    v_episode_id := nullif(v_item ->> 'episode_id', '')::uuid;
    v_script_path := btrim(coalesce(v_item ->> 'script_path', ''));

    if v_episode_id is null then
      raise exception 'episode_id is required for each item' using errcode = '22023';
    end if;

    if v_script_path = '' then
      raise exception 'script_path is required for each item' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from tongs.episodes e
      where e.id = v_episode_id
        and e.workspace_id = v_workspace_id
    ) then
      raise exception 'episode workspace mismatch or episode not found' using errcode = '22023';
    end if;

    insert into tongs.recording_session_items (
      session_id,
      position,
      episode_id,
      script_path
    )
    values (
      p_session_id,
      v_position,
      v_episode_id,
      v_script_path
    );
  end loop;

  return query
  select i.*
  from tongs.recording_session_items i
  where i.session_id = p_session_id
  order by i.position asc, i.created_at asc;
end;
$$;

alter table tongs.recording_sessions enable row level security;
alter table tongs.recording_session_items enable row level security;

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

drop policy if exists recording_session_items_select_if_workspace_access on tongs.recording_session_items;
create policy recording_session_items_select_if_workspace_access
on tongs.recording_session_items
for select
to authenticated
using (
  exists (
    select 1
    from tongs.recording_sessions rs
    where rs.id = recording_session_items.session_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
);

drop policy if exists recording_session_items_insert_if_workspace_access on tongs.recording_session_items;
create policy recording_session_items_insert_if_workspace_access
on tongs.recording_session_items
for insert
to authenticated
with check (
  exists (
    select 1
    from tongs.recording_sessions rs
    join tongs.episodes e on e.id = recording_session_items.episode_id
    where rs.id = recording_session_items.session_id
      and e.workspace_id = rs.workspace_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
);

drop policy if exists recording_session_items_update_if_workspace_access on tongs.recording_session_items;
create policy recording_session_items_update_if_workspace_access
on tongs.recording_session_items
for update
to authenticated
using (
  exists (
    select 1
    from tongs.recording_sessions rs
    join tongs.episodes e on e.id = recording_session_items.episode_id
    where rs.id = recording_session_items.session_id
      and e.workspace_id = rs.workspace_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
)
with check (
  exists (
    select 1
    from tongs.recording_sessions rs
    join tongs.episodes e on e.id = recording_session_items.episode_id
    where rs.id = recording_session_items.session_id
      and e.workspace_id = rs.workspace_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
);

drop policy if exists recording_session_items_delete_if_workspace_access on tongs.recording_session_items;
create policy recording_session_items_delete_if_workspace_access
on tongs.recording_session_items
for delete
to authenticated
using (
  exists (
    select 1
    from tongs.recording_sessions rs
    where rs.id = recording_session_items.session_id
      and tongs.can_access_workspace(rs.workspace_id)
  )
);
