-- Henry v1 orientation layer persistence contract
-- Canonical durable state for preferences, message suppression, and utility telemetry.

create table if not exists tongs.henry_user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  show_henry boolean not null default true,
  hide_tips boolean not null default false,
  muted_until timestamptz null,
  open_last_tab boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create table if not exists tongs.henry_message_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  message_id text not null,
  last_seen_at timestamptz not null default now(),
  last_dismissed_at timestamptz null,
  cooldown_until timestamptz null,
  dismiss_count integer not null default 0 check (dismiss_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace_id, message_id)
);

create table if not exists tongs.henry_events (
  event_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid null references tongs.episodes(id) on delete set null,
  event_name text not null,
  surface text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists henry_user_preferences_workspace_idx
  on tongs.henry_user_preferences (workspace_id, updated_at desc);

create index if not exists henry_message_state_workspace_idx
  on tongs.henry_message_state (workspace_id, updated_at desc);

create index if not exists henry_events_user_workspace_created_idx
  on tongs.henry_events (user_id, workspace_id, created_at desc);

alter table tongs.henry_user_preferences enable row level security;
alter table tongs.henry_message_state enable row level security;
alter table tongs.henry_events enable row level security;

drop policy if exists henry_user_preferences_select_self on tongs.henry_user_preferences;
create policy henry_user_preferences_select_self
on tongs.henry_user_preferences
for select
to authenticated
using (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
);

drop policy if exists henry_user_preferences_insert_self on tongs.henry_user_preferences;
create policy henry_user_preferences_insert_self
on tongs.henry_user_preferences
for insert
to authenticated
with check (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
);

drop policy if exists henry_user_preferences_update_self on tongs.henry_user_preferences;
create policy henry_user_preferences_update_self
on tongs.henry_user_preferences
for update
to authenticated
using (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
)
with check (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
);

drop policy if exists henry_message_state_select_self on tongs.henry_message_state;
create policy henry_message_state_select_self
on tongs.henry_message_state
for select
to authenticated
using (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
);

drop policy if exists henry_message_state_insert_self on tongs.henry_message_state;
create policy henry_message_state_insert_self
on tongs.henry_message_state
for insert
to authenticated
with check (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
);

drop policy if exists henry_message_state_update_self on tongs.henry_message_state;
create policy henry_message_state_update_self
on tongs.henry_message_state
for update
to authenticated
using (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
)
with check (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
);

drop policy if exists henry_events_select_self on tongs.henry_events;
create policy henry_events_select_self
on tongs.henry_events
for select
to authenticated
using (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
);

drop policy if exists henry_events_insert_self on tongs.henry_events;
create policy henry_events_insert_self
on tongs.henry_events
for insert
to authenticated
with check (
  user_id = auth.uid()
  and tongs.can_access_workspace(workspace_id)
);

create or replace function tongs.get_my_henry_preferences(
  p_workspace_id uuid
)
returns table (
  user_id uuid,
  workspace_id uuid,
  show_henry boolean,
  hide_tips boolean,
  muted_until timestamptz,
  open_last_tab boolean,
  updated_at timestamptz
)
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if not tongs.can_access_workspace(p_workspace_id) then
    raise exception 'Workspace access denied';
  end if;

  return query
  select
    p.user_id,
    p.workspace_id,
    p.show_henry,
    p.hide_tips,
    p.muted_until,
    p.open_last_tab,
    p.updated_at
  from tongs.henry_user_preferences p
  where p.user_id = auth.uid()
    and p.workspace_id = p_workspace_id
  limit 1;
end;
$$;

create or replace function tongs.upsert_my_henry_preferences(
  p_workspace_id uuid,
  p_show_henry boolean,
  p_hide_tips boolean,
  p_muted_until timestamptz,
  p_open_last_tab boolean
)
returns table (
  user_id uuid,
  workspace_id uuid,
  show_henry boolean,
  hide_tips boolean,
  muted_until timestamptz,
  open_last_tab boolean,
  updated_at timestamptz
)
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if not tongs.can_access_workspace(p_workspace_id) then
    raise exception 'Workspace access denied';
  end if;

  insert into tongs.henry_user_preferences (
    user_id,
    workspace_id,
    show_henry,
    hide_tips,
    muted_until,
    open_last_tab,
    updated_at
  ) values (
    auth.uid(),
    p_workspace_id,
    coalesce(p_show_henry, true),
    coalesce(p_hide_tips, false),
    p_muted_until,
    coalesce(p_open_last_tab, false),
    now()
  )
  on conflict (user_id, workspace_id) do update
  set
    show_henry = excluded.show_henry,
    hide_tips = excluded.hide_tips,
    muted_until = excluded.muted_until,
    open_last_tab = excluded.open_last_tab,
    updated_at = now();

  return query
  select
    p.user_id,
    p.workspace_id,
    p.show_henry,
    p.hide_tips,
    p.muted_until,
    p.open_last_tab,
    p.updated_at
  from tongs.henry_user_preferences p
  where p.user_id = auth.uid()
    and p.workspace_id = p_workspace_id
  limit 1;
end;
$$;

create or replace function tongs.get_my_henry_message_state(
  p_workspace_id uuid
)
returns table (
  user_id uuid,
  workspace_id uuid,
  message_id text,
  last_seen_at timestamptz,
  last_dismissed_at timestamptz,
  cooldown_until timestamptz,
  dismiss_count integer,
  updated_at timestamptz
)
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if not tongs.can_access_workspace(p_workspace_id) then
    raise exception 'Workspace access denied';
  end if;

  return query
  select
    p.user_id,
    p.workspace_id,
    p.message_id,
    p.last_seen_at,
    p.last_dismissed_at,
    p.cooldown_until,
    p.dismiss_count,
    p.updated_at
  from tongs.henry_message_state p
  where p.user_id = auth.uid()
    and p.workspace_id = p_workspace_id
  order by p.updated_at desc;
end;
$$;

create or replace function tongs.upsert_my_henry_message_state(
  p_workspace_id uuid,
  p_message_id text,
  p_last_seen_at timestamptz,
  p_last_dismissed_at timestamptz,
  p_cooldown_until timestamptz,
  p_increment_dismiss integer default 0
)
returns table (
  user_id uuid,
  workspace_id uuid,
  message_id text,
  last_seen_at timestamptz,
  last_dismissed_at timestamptz,
  cooldown_until timestamptz,
  dismiss_count integer,
  updated_at timestamptz
)
language plpgsql
security invoker
as $$
declare
  v_message_id text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if not tongs.can_access_workspace(p_workspace_id) then
    raise exception 'Workspace access denied';
  end if;

  v_message_id := nullif(trim(coalesce(p_message_id, '')), '');
  if v_message_id is null then
    raise exception 'message_id is required';
  end if;

  insert into tongs.henry_message_state (
    user_id,
    workspace_id,
    message_id,
    last_seen_at,
    last_dismissed_at,
    cooldown_until,
    dismiss_count,
    updated_at
  ) values (
    auth.uid(),
    p_workspace_id,
    v_message_id,
    coalesce(p_last_seen_at, now()),
    p_last_dismissed_at,
    p_cooldown_until,
    greatest(coalesce(p_increment_dismiss, 0), 0),
    now()
  )
  on conflict (user_id, workspace_id, message_id) do update
  set
    last_seen_at = coalesce(excluded.last_seen_at, tongs.henry_message_state.last_seen_at),
    last_dismissed_at = coalesce(excluded.last_dismissed_at, tongs.henry_message_state.last_dismissed_at),
    cooldown_until = coalesce(excluded.cooldown_until, tongs.henry_message_state.cooldown_until),
    dismiss_count = tongs.henry_message_state.dismiss_count + greatest(coalesce(p_increment_dismiss, 0), 0),
    updated_at = now();

  return query
  select
    p.user_id,
    p.workspace_id,
    p.message_id,
    p.last_seen_at,
    p.last_dismissed_at,
    p.cooldown_until,
    p.dismiss_count,
    p.updated_at
  from tongs.henry_message_state p
  where p.user_id = auth.uid()
    and p.workspace_id = p_workspace_id
    and p.message_id = v_message_id
  limit 1;
end;
$$;

create or replace function tongs.track_henry_event(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_event_name text,
  p_surface text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if not tongs.can_access_workspace(p_workspace_id) then
    raise exception 'Workspace access denied';
  end if;
  if nullif(trim(coalesce(p_event_name, '')), '') is null then
    raise exception 'event_name is required';
  end if;
  if nullif(trim(coalesce(p_surface, '')), '') is null then
    raise exception 'surface is required';
  end if;

  insert into tongs.henry_events (
    user_id,
    workspace_id,
    workpiece_id,
    event_name,
    surface,
    metadata
  ) values (
    auth.uid(),
    p_workspace_id,
    p_workpiece_id,
    trim(p_event_name),
    trim(p_surface),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on table tongs.henry_user_preferences from public;
revoke all on table tongs.henry_message_state from public;
revoke all on table tongs.henry_events from public;

grant select, insert, update on tongs.henry_user_preferences to authenticated;
grant select, insert, update on tongs.henry_message_state to authenticated;
grant select, insert on tongs.henry_events to authenticated;

grant all on tongs.henry_user_preferences to service_role;
grant all on tongs.henry_message_state to service_role;
grant all on tongs.henry_events to service_role;

revoke all on function tongs.get_my_henry_preferences(uuid) from public;
revoke all on function tongs.upsert_my_henry_preferences(uuid, boolean, boolean, timestamptz, boolean) from public;
revoke all on function tongs.get_my_henry_message_state(uuid) from public;
revoke all on function tongs.upsert_my_henry_message_state(uuid, text, timestamptz, timestamptz, timestamptz, integer) from public;
revoke all on function tongs.track_henry_event(uuid, uuid, text, text, jsonb) from public;

grant execute on function tongs.get_my_henry_preferences(uuid) to authenticated;
grant execute on function tongs.upsert_my_henry_preferences(uuid, boolean, boolean, timestamptz, boolean) to authenticated;
grant execute on function tongs.get_my_henry_message_state(uuid) to authenticated;
grant execute on function tongs.upsert_my_henry_message_state(uuid, text, timestamptz, timestamptz, timestamptz, integer) to authenticated;
grant execute on function tongs.track_henry_event(uuid, uuid, text, text, jsonb) to authenticated;

grant execute on function tongs.get_my_henry_preferences(uuid) to service_role;
grant execute on function tongs.upsert_my_henry_preferences(uuid, boolean, boolean, timestamptz, boolean) to service_role;
grant execute on function tongs.get_my_henry_message_state(uuid) to service_role;
grant execute on function tongs.upsert_my_henry_message_state(uuid, text, timestamptz, timestamptz, timestamptz, integer) to service_role;
grant execute on function tongs.track_henry_event(uuid, uuid, text, text, jsonb) to service_role;
