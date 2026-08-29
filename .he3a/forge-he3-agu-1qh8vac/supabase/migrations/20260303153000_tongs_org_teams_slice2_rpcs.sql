-- Slice 2: Org Teams management RPCs (no workspace access behavior changes).
-- Adds org-scoped team CRUD and team member CRUD with server-side role checks.
-- Emits audit breadcrumbs for team member add/remove events.

begin;

create or replace function tongs.org_role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case lower(trim(coalesce(p_role, '')))
    when 'owner' then 40
    when 'admin' then 30
    when 'member' then 20
    else 0
  end;
$$;

create or replace function tongs.assert_org_role(
  p_org_id uuid,
  p_min_role text default 'member'
)
returns text
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_role text;
  v_needed text;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_org_id is null then
    raise exception 'org_id is required'
      using errcode = '22023';
  end if;

  v_needed := lower(trim(coalesce(p_min_role, 'member')));
  if v_needed not in ('owner', 'admin', 'member') then
    raise exception 'invalid minimum org role: %', p_min_role
      using errcode = '22023';
  end if;

  select om.org_role
  into v_role
  from tongs.org_members om
  where om.org_id = p_org_id
    and om.user_id = v_user;

  if v_role is null then
    raise exception 'Insufficient org role (requires %)', v_needed
      using errcode = '42501';
  end if;

  if tongs.org_role_rank(v_role) < tongs.org_role_rank(v_needed) then
    raise exception 'Insufficient org role (requires %)', v_needed
      using errcode = '42501';
  end if;

  return v_role;
end;
$$;

create or replace function tongs.list_org_teams(p_org_id uuid)
returns table (
  team_id uuid,
  org_id uuid,
  team_name text,
  member_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
begin
  perform tongs.assert_org_role(p_org_id, 'member');

  return query
  select
    t.id,
    t.org_id,
    t.name,
    count(tm.user_id)::bigint as member_count,
    t.created_at,
    t.updated_at
  from tongs.teams t
  left join tongs.team_members tm
    on tm.team_id = t.id
  where t.org_id = p_org_id
  group by t.id, t.org_id, t.name, t.created_at, t.updated_at
  order by lower(t.name) asc, t.created_at asc;
end;
$$;

create or replace function tongs.create_org_team(
  p_org_id uuid,
  p_name text
)
returns table (
  team_id uuid,
  org_id uuid,
  team_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_name text;
  v_team tongs.teams%rowtype;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_org_id is null then
    raise exception 'org_id is required'
      using errcode = '22023';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'team name is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_org_role(p_org_id, 'admin');

  insert into tongs.teams (
    org_id,
    name,
    created_at,
    updated_at,
    created_by
  )
  values (
    p_org_id,
    v_name,
    now(),
    now(),
    v_user
  )
  returning * into v_team;

  return query
  select
    v_team.id,
    v_team.org_id,
    v_team.name,
    v_team.created_at,
    v_team.updated_at;
end;
$$;

create or replace function tongs.rename_org_team(
  p_team_id uuid,
  p_name text
)
returns table (
  team_id uuid,
  org_id uuid,
  team_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_name text;
  v_team tongs.teams%rowtype;
begin
  if p_team_id is null then
    raise exception 'team_id is required'
      using errcode = '22023';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'team name is required'
      using errcode = '22023';
  end if;

  select t.*
  into v_team
  from tongs.teams t
  where t.id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found'
      using errcode = 'P0002';
  end if;

  perform tongs.assert_org_role(v_team.org_id, 'admin');

  update tongs.teams t
  set
    name = v_name,
    updated_at = now()
  where t.id = p_team_id
  returning * into v_team;

  return query
  select
    v_team.id,
    v_team.org_id,
    v_team.name,
    v_team.created_at,
    v_team.updated_at;
end;
$$;

create or replace function tongs.delete_org_team(p_team_id uuid)
returns table (
  deleted boolean,
  team_id uuid,
  org_id uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_team tongs.teams%rowtype;
begin
  if p_team_id is null then
    raise exception 'team_id is required'
      using errcode = '22023';
  end if;

  select t.*
  into v_team
  from tongs.teams t
  where t.id = p_team_id
  for update;

  if not found then
    raise exception 'Team not found'
      using errcode = 'P0002';
  end if;

  perform tongs.assert_org_role(v_team.org_id, 'admin');

  delete from tongs.teams
  where id = p_team_id;

  return query
  select true, v_team.id, v_team.org_id;
end;
$$;

create or replace function tongs.list_team_members(p_team_id uuid)
returns table (
  team_id uuid,
  user_id uuid,
  user_email text,
  team_role text,
  created_at timestamptz,
  created_by uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_org_id uuid;
begin
  if p_team_id is null then
    raise exception 'team_id is required'
      using errcode = '22023';
  end if;

  select t.org_id
  into v_org_id
  from tongs.teams t
  where t.id = p_team_id;

  if v_org_id is null then
    raise exception 'Team not found'
      using errcode = 'P0002';
  end if;

  perform tongs.assert_org_role(v_org_id, 'member');

  return query
  select
    tm.team_id,
    tm.user_id,
    coalesce(lower(u.email), '') as user_email,
    tm.team_role,
    tm.created_at,
    tm.created_by
  from tongs.team_members tm
  left join auth.users u
    on u.id = tm.user_id
  where tm.team_id = p_team_id
  order by
    case tm.team_role
      when 'lead' then 20
      when 'member' then 10
      else 0
    end desc,
    tm.created_at asc,
    coalesce(lower(u.email), '') asc;
end;
$$;

create or replace function tongs.add_team_member(
  p_team_id uuid,
  p_user_id uuid,
  p_team_role text default 'member'
)
returns table (
  team_id uuid,
  user_id uuid,
  user_email text,
  team_role text,
  created_at timestamptz,
  created_by uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_org_id uuid;
  v_team_role text;
  v_existing_role text;
  v_event_timestamp timestamptz := now();
  v_row record;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_team_id is null then
    raise exception 'team_id is required'
      using errcode = '22023';
  end if;

  if p_user_id is null then
    raise exception 'user_id is required'
      using errcode = '22023';
  end if;

  v_team_role := lower(trim(coalesce(p_team_role, 'member')));
  if v_team_role not in ('lead', 'member') then
    raise exception 'invalid team role: %', p_team_role
      using errcode = '22023';
  end if;

  select t.org_id
  into v_org_id
  from tongs.teams t
  where t.id = p_team_id;

  if v_org_id is null then
    raise exception 'Team not found'
      using errcode = 'P0002';
  end if;

  perform tongs.assert_org_role(v_org_id, 'admin');

  select tm.team_role
  into v_existing_role
  from tongs.team_members tm
  where tm.team_id = p_team_id
    and tm.user_id = p_user_id;

  insert into tongs.team_members (
    team_id,
    user_id,
    team_role,
    created_at,
    created_by
  )
  values (
    p_team_id,
    p_user_id,
    v_team_role,
    now(),
    v_user
  )
  on conflict (team_id, user_id) do update
    set team_role = excluded.team_role;

  if v_existing_role is null and to_regclass('tongs.hearth_interaction_events') is not null then
    insert into tongs.hearth_interaction_events (
      user_id,
      workspace_id,
      episode_id,
      event_type,
      payload
    )
    values (
      v_user,
      null,
      null,
      'team.member.add',
      jsonb_build_object(
        'org_id', v_org_id,
        'team_id', p_team_id,
        'actor_user_id', v_user,
        'target_user_id', p_user_id,
        'new_role', v_team_role,
        'timestamp', v_event_timestamp
      )
    );
  end if;

  select
    tm.team_id,
    tm.user_id,
    coalesce(lower(u.email), '') as user_email,
    tm.team_role,
    tm.created_at,
    tm.created_by
  into v_row
  from tongs.team_members tm
  left join auth.users u
    on u.id = tm.user_id
  where tm.team_id = p_team_id
    and tm.user_id = p_user_id;

  return query
  select
    v_row.team_id,
    v_row.user_id,
    v_row.user_email,
    v_row.team_role,
    v_row.created_at,
    v_row.created_by;
end;
$$;

create or replace function tongs.remove_team_member(
  p_team_id uuid,
  p_user_id uuid
)
returns table (
  removed boolean,
  team_id uuid,
  user_id uuid,
  old_team_role text
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_org_id uuid;
  v_old_role text;
  v_removed boolean := false;
  v_event_timestamp timestamptz := now();
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_team_id is null then
    raise exception 'team_id is required'
      using errcode = '22023';
  end if;

  if p_user_id is null then
    raise exception 'user_id is required'
      using errcode = '22023';
  end if;

  select t.org_id
  into v_org_id
  from tongs.teams t
  where t.id = p_team_id;

  if v_org_id is null then
    raise exception 'Team not found'
      using errcode = 'P0002';
  end if;

  perform tongs.assert_org_role(v_org_id, 'admin');

  delete from tongs.team_members tm
  where tm.team_id = p_team_id
    and tm.user_id = p_user_id
  returning tm.team_role into v_old_role;

  v_removed := found;

  if v_removed and to_regclass('tongs.hearth_interaction_events') is not null then
    insert into tongs.hearth_interaction_events (
      user_id,
      workspace_id,
      episode_id,
      event_type,
      payload
    )
    values (
      v_user,
      null,
      null,
      'team.member.remove',
      jsonb_build_object(
        'org_id', v_org_id,
        'team_id', p_team_id,
        'actor_user_id', v_user,
        'target_user_id', p_user_id,
        'old_role', v_old_role,
        'timestamp', v_event_timestamp
      )
    );
  end if;

  return query
  select v_removed, p_team_id, p_user_id, v_old_role;
end;
$$;

revoke all on function tongs.org_role_rank(text) from public;
revoke all on function tongs.assert_org_role(uuid, text) from public;
revoke all on function tongs.list_org_teams(uuid) from public;
revoke all on function tongs.create_org_team(uuid, text) from public;
revoke all on function tongs.rename_org_team(uuid, text) from public;
revoke all on function tongs.delete_org_team(uuid) from public;
revoke all on function tongs.list_team_members(uuid) from public;
revoke all on function tongs.add_team_member(uuid, uuid, text) from public;
revoke all on function tongs.remove_team_member(uuid, uuid) from public;

grant execute on function tongs.org_role_rank(text) to authenticated;
grant execute on function tongs.org_role_rank(text) to service_role;
grant execute on function tongs.assert_org_role(uuid, text) to authenticated;
grant execute on function tongs.assert_org_role(uuid, text) to service_role;
grant execute on function tongs.list_org_teams(uuid) to authenticated;
grant execute on function tongs.list_org_teams(uuid) to service_role;
grant execute on function tongs.create_org_team(uuid, text) to authenticated;
grant execute on function tongs.create_org_team(uuid, text) to service_role;
grant execute on function tongs.rename_org_team(uuid, text) to authenticated;
grant execute on function tongs.rename_org_team(uuid, text) to service_role;
grant execute on function tongs.delete_org_team(uuid) to authenticated;
grant execute on function tongs.delete_org_team(uuid) to service_role;
grant execute on function tongs.list_team_members(uuid) to authenticated;
grant execute on function tongs.list_team_members(uuid) to service_role;
grant execute on function tongs.add_team_member(uuid, uuid, text) to authenticated;
grant execute on function tongs.add_team_member(uuid, uuid, text) to service_role;
grant execute on function tongs.remove_team_member(uuid, uuid) to authenticated;
grant execute on function tongs.remove_team_member(uuid, uuid) to service_role;

commit;
