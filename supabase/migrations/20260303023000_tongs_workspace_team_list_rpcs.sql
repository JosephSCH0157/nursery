begin;

create or replace function tongs.list_workspace_members(
  p_workspace_id uuid
)
returns table (
  workspace_id uuid,
  user_id uuid,
  user_email text,
  role text,
  created_at timestamptz,
  created_by uuid,
  created_by_email text
)
language plpgsql
security definer
set search_path = tongs, public
as $$
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  return query
  select
    wm.workspace_id,
    wm.user_id,
    lower(coalesce(member_user.email, '')) as user_email,
    wm.role,
    wm.created_at,
    wm.created_by,
    lower(coalesce(created_by_user.email, '')) as created_by_email
  from tongs.workspace_members wm
  left join auth.users member_user
    on member_user.id = wm.user_id
  left join auth.users created_by_user
    on created_by_user.id = wm.created_by
  where wm.workspace_id = p_workspace_id
  order by tongs.workspace_role_rank(wm.role) desc, wm.created_at asc;
end;
$$;

create or replace function tongs.list_workspace_invites(
  p_workspace_id uuid,
  p_only_pending boolean default true
)
returns table (
  id uuid,
  workspace_id uuid,
  email text,
  role text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  return query
  select
    wi.id,
    wi.workspace_id,
    wi.email,
    wi.role,
    wi.created_by,
    lower(coalesce(created_by_user.email, '')) as created_by_email,
    wi.created_at,
    wi.expires_at,
    wi.accepted_at,
    wi.revoked_at
  from tongs.workspace_invites wi
  left join auth.users created_by_user
    on created_by_user.id = wi.created_by
  where wi.workspace_id = p_workspace_id
    and (
      not coalesce(p_only_pending, true)
      or (wi.accepted_at is null and wi.revoked_at is null)
    )
  order by wi.created_at desc;
end;
$$;

revoke all on function tongs.list_workspace_members(uuid) from public;
revoke all on function tongs.list_workspace_invites(uuid, boolean) from public;

grant execute on function tongs.list_workspace_members(uuid) to authenticated;
grant execute on function tongs.list_workspace_members(uuid) to service_role;
grant execute on function tongs.list_workspace_invites(uuid, boolean) to authenticated;
grant execute on function tongs.list_workspace_invites(uuid, boolean) to service_role;

commit;
