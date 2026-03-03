-- Fix 42702 ambiguity on add_team_member path when called via add_team_member_by_email.
-- Root cause: ON CONFLICT (team_id, user_id) collides with OUT parameter names in plpgsql scope.

begin;

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
  on conflict on constraint team_members_pkey do update
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

create or replace function tongs.add_team_member_by_email(
  p_team_id uuid,
  p_email text,
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
  v_org_id uuid;
  v_user_id uuid;
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

  perform tongs.assert_org_role(v_org_id, 'admin');

  select r.user_id
  into v_user_id
  from tongs.resolve_org_user_by_email(v_org_id, p_email) r
  limit 1;

  if v_user_id is null then
    return;
  end if;

  return query
  select
    atm.team_id,
    atm.user_id,
    atm.user_email,
    atm.team_role,
    atm.created_at,
    atm.created_by
  from tongs.add_team_member(p_team_id, v_user_id, p_team_role) atm;
end;
$$;

commit;
