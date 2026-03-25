-- Henry RPC ambiguity fix:
-- avoid PL/pgSQL name collisions between OUT params and table column names.

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
#variable_conflict use_column
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
  on conflict on constraint henry_user_preferences_pkey do update
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
#variable_conflict use_column
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
  on conflict on constraint henry_message_state_pkey do update
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

