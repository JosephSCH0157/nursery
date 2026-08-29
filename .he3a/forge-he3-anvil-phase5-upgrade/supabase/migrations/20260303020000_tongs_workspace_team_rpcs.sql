begin;

create or replace function tongs.get_workspace_invite_preview(
  p_token text
)
returns table (
  workspace_id uuid,
  workspace_name text,
  role text,
  email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_user_email text;
  v_token text;
  v_invite tongs.workspace_invites%rowtype;
  v_workspace tongs.workspaces%rowtype;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  v_token := btrim(coalesce(p_token, ''));
  if v_token = '' then
    raise exception 'Invite token is required'
      using errcode = '22023';
  end if;

  select lower(coalesce(u.email, ''))
  into v_user_email
  from auth.users u
  where u.id = v_user;

  if v_user_email is null or v_user_email = '' then
    raise exception 'Authenticated user has no email'
      using errcode = '22023';
  end if;

  select wi.*
  into v_invite
  from tongs.workspace_invites wi
  where wi.token = v_token
    and wi.revoked_at is null
    and wi.accepted_at is null
    and wi.expires_at > now()
  order by wi.created_at desc
  limit 1;

  if not found then
    raise exception 'Invite token is invalid, revoked, accepted, or expired'
      using errcode = '22023';
  end if;

  if v_invite.email <> v_user_email then
    raise exception 'Invite email does not match authenticated user'
      using errcode = '42501';
  end if;

  select w.*
  into v_workspace
  from tongs.workspaces w
  where w.id = v_invite.workspace_id;

  if not found then
    raise exception 'Workspace not found for invite'
      using errcode = 'P0002';
  end if;

  return query
  select
    v_invite.workspace_id,
    v_workspace.name,
    v_invite.role,
    v_invite.email,
    v_invite.expires_at;
end;
$$;

create or replace function tongs.update_workspace_member_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text
)
returns table (
  workspace_id uuid,
  user_id uuid,
  role text
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_role text;
  v_current_role text;
  v_is_creator boolean;
  v_owner_count integer;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null or p_user_id is null then
    raise exception 'workspace_id and user_id are required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'admin');

  v_role := lower(btrim(coalesce(p_role, '')));
  if tongs.workspace_role_rank(v_role) = 0 then
    raise exception 'Unsupported workspace role: %', p_role
      using errcode = '22023';
  end if;

  if v_role = 'owner' and not tongs.has_workspace_role(p_workspace_id, 'owner') then
    raise exception 'Only workspace owners can assign owner role'
      using errcode = '42501';
  end if;

  select
    wm.role,
    (w.created_by = wm.user_id)
  into
    v_current_role,
    v_is_creator
  from tongs.workspace_members wm
  join tongs.workspaces w
    on w.id = wm.workspace_id
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Workspace member not found'
      using errcode = 'P0002';
  end if;

  if v_is_creator and v_role <> 'owner' then
    raise exception 'Cannot change role for workspace creator'
      using errcode = '42501';
  end if;

  if v_current_role = 'owner' and v_role <> 'owner' then
    if not tongs.has_workspace_role(p_workspace_id, 'owner') then
      raise exception 'Only workspace owners can demote owners'
        using errcode = '42501';
    end if;

    select count(*)
    into v_owner_count
    from tongs.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.role = 'owner';

    if coalesce(v_owner_count, 0) <= 1 then
      raise exception 'Workspace must keep at least one owner'
        using errcode = '22023';
    end if;
  end if;

  update tongs.workspace_members wm
  set role = v_role
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_user_id;

  return query
  select
    p_workspace_id,
    p_user_id,
    v_role;
end;
$$;

create or replace function tongs.remove_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
)
returns table (
  removed boolean,
  workspace_id uuid,
  user_id uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_target_role text;
  v_is_creator boolean;
  v_owner_count integer;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null or p_user_id is null then
    raise exception 'workspace_id and user_id are required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'admin');

  select
    wm.role,
    (w.created_by = wm.user_id)
  into
    v_target_role,
    v_is_creator
  from tongs.workspace_members wm
  join tongs.workspaces w
    on w.id = wm.workspace_id
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_user_id
  for update;

  if not found then
    return query select false, p_workspace_id, p_user_id;
    return;
  end if;

  if v_is_creator then
    raise exception 'Cannot remove workspace creator'
      using errcode = '42501';
  end if;

  if v_target_role = 'owner' then
    if not tongs.has_workspace_role(p_workspace_id, 'owner') then
      raise exception 'Only workspace owners can remove owners'
        using errcode = '42501';
    end if;

    select count(*)
    into v_owner_count
    from tongs.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.role = 'owner';

    if coalesce(v_owner_count, 0) <= 1 then
      raise exception 'Workspace must keep at least one owner'
        using errcode = '22023';
    end if;
  end if;

  delete from tongs.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_user_id;

  return query select true, p_workspace_id, p_user_id;
end;
$$;

create or replace function tongs.leave_workspace(
  p_workspace_id uuid
)
returns table (
  left_workspace boolean,
  workspace_id uuid,
  user_id uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_role text;
  v_is_creator boolean;
  v_owner_count integer;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  select
    wm.role,
    (w.created_by = wm.user_id)
  into
    v_role,
    v_is_creator
  from tongs.workspace_members wm
  join tongs.workspaces w
    on w.id = wm.workspace_id
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_user
  for update;

  if not found then
    return query select false, p_workspace_id, v_user;
    return;
  end if;

  if v_is_creator then
    raise exception 'Workspace creator cannot leave this workspace'
      using errcode = '42501';
  end if;

  if v_role = 'owner' then
    select count(*)
    into v_owner_count
    from tongs.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.role = 'owner';

    if coalesce(v_owner_count, 0) <= 1 then
      raise exception 'Workspace must keep at least one owner'
        using errcode = '22023';
    end if;
  end if;

  delete from tongs.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_user;

  return query select true, p_workspace_id, v_user;
end;
$$;

revoke all on function tongs.get_workspace_invite_preview(text) from public;
revoke all on function tongs.update_workspace_member_role(uuid, uuid, text) from public;
revoke all on function tongs.remove_workspace_member(uuid, uuid) from public;
revoke all on function tongs.leave_workspace(uuid) from public;

grant execute on function tongs.get_workspace_invite_preview(text) to authenticated;
grant execute on function tongs.get_workspace_invite_preview(text) to service_role;
grant execute on function tongs.update_workspace_member_role(uuid, uuid, text) to authenticated;
grant execute on function tongs.update_workspace_member_role(uuid, uuid, text) to service_role;
grant execute on function tongs.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function tongs.remove_workspace_member(uuid, uuid) to service_role;
grant execute on function tongs.leave_workspace(uuid) to authenticated;
grant execute on function tongs.leave_workspace(uuid) to service_role;

commit;
