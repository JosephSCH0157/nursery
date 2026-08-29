-- Slice 4 hardening: add email-based member resolution and team-member add path.
-- Keeps org/team permissions server-side and avoids exposing auth.users to clients.

begin;

create or replace function tongs.resolve_org_user_by_email(
  p_org_id uuid,
  p_email text
)
returns table (
  user_id uuid,
  email text
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_email text;
begin
  if p_org_id is null then
    raise exception 'org_id is required'
      using errcode = '22023';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'email is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_org_role(p_org_id, 'admin');

  return query
  select
    u.id,
    lower(u.email)
  from auth.users u
  where lower(u.email) = v_email
  limit 1;
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
  select *
  from tongs.add_team_member(p_team_id, v_user_id, p_team_role);
end;
$$;

revoke all on function tongs.resolve_org_user_by_email(uuid, text) from public;
revoke all on function tongs.add_team_member_by_email(uuid, text, text) from public;

grant execute on function tongs.resolve_org_user_by_email(uuid, text) to authenticated;
grant execute on function tongs.resolve_org_user_by_email(uuid, text) to service_role;
grant execute on function tongs.add_team_member_by_email(uuid, text, text) to authenticated;
grant execute on function tongs.add_team_member_by_email(uuid, text, text) to service_role;

commit;
