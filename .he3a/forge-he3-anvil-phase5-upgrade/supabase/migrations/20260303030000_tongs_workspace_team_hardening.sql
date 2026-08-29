begin;

create or replace function tongs.create_workspace_invite(
  p_workspace_id uuid,
  p_email text,
  p_role text default 'viewer',
  p_expires_hours integer default 72
)
returns table (
  invite_id uuid,
  workspace_id uuid,
  email text,
  role text,
  token text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_email text;
  v_role text;
  v_hours integer;
  v_token text;
  v_invite tongs.workspace_invites%rowtype;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated'
      using errcode = '42501';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'admin');

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'invite_email_required'
      using errcode = '22023';
  end if;

  v_role := lower(btrim(coalesce(p_role, 'viewer')));
  if tongs.workspace_role_rank(v_role) = 0 then
    raise exception 'unsupported_invite_role'
      using errcode = '22023';
  end if;

  if v_role = 'owner' and not tongs.has_workspace_role(p_workspace_id, 'owner') then
    raise exception 'owner_invite_requires_owner'
      using errcode = '42501';
  end if;

  v_hours := coalesce(p_expires_hours, 72);
  if v_hours < 1 then v_hours := 1; end if;
  if v_hours > 720 then v_hours := 720; end if;

  -- Deterministic duplicate behavior: only one pending invite per workspace/email.
  update tongs.workspace_invites wi
  set revoked_at = now(),
      updated_at = now()
  where wi.workspace_id = p_workspace_id
    and wi.email = v_email
    and wi.accepted_at is null
    and wi.revoked_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');

  insert into tongs.workspace_invites (
    workspace_id,
    email,
    role,
    token,
    expires_at,
    created_by
  )
  values (
    p_workspace_id,
    v_email,
    v_role,
    v_token,
    now() + make_interval(hours => v_hours),
    v_user
  )
  returning * into v_invite;

  return query
  select
    v_invite.id,
    v_invite.workspace_id,
    v_invite.email,
    v_invite.role,
    v_invite.token,
    v_invite.expires_at,
    v_invite.created_at;
end;
$$;

create or replace function tongs.accept_workspace_invite(
  p_token text
)
returns table (
  workspace_id uuid,
  role text,
  membership_created boolean
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
  v_existing_member boolean;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated'
      using errcode = '42501';
  end if;

  v_token := btrim(coalesce(p_token, ''));
  if v_token = '' then
    raise exception 'invalid_token'
      using errcode = '22023';
  end if;

  select lower(coalesce(u.email, ''))
  into v_user_email
  from auth.users u
  where u.id = v_user;

  if v_user_email is null or v_user_email = '' then
    raise exception 'invite_user_email_missing'
      using errcode = '22023';
  end if;

  select wi.*
  into v_invite
  from tongs.workspace_invites wi
  where wi.token = v_token
  order by wi.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'invalid_token'
      using errcode = '22023';
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'invite_revoked'
      using errcode = '22023';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'invite_already_accepted'
      using errcode = '22023';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'invite_expired'
      using errcode = '22023';
  end if;

  if v_invite.email <> v_user_email then
    raise exception 'invite_email_mismatch'
      using errcode = '42501';
  end if;

  select exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = v_invite.workspace_id
      and wm.user_id = v_user
  )
  into v_existing_member;

  insert into tongs.workspace_members (
    workspace_id,
    user_id,
    role,
    created_at,
    created_by
  )
  values (
    v_invite.workspace_id,
    v_user,
    v_invite.role,
    now(),
    coalesce(v_invite.created_by, v_user)
  )
  on conflict on constraint workspace_members_pkey do update
    set role = case
      when tongs.workspace_role_rank(workspace_members.role)
         >= tongs.workspace_role_rank(excluded.role)
      then workspace_members.role
      else excluded.role
    end,
    created_by = coalesce(workspace_members.created_by, excluded.created_by);

  update tongs.workspace_invites wi
  set accepted_by = v_user,
      accepted_at = now(),
      updated_at = now()
  where wi.id = v_invite.id;

  return query
  select
    v_invite.workspace_id,
    v_invite.role,
    not v_existing_member;
end;
$$;

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
    raise exception 'not_authenticated'
      using errcode = '42501';
  end if;

  v_token := btrim(coalesce(p_token, ''));
  if v_token = '' then
    raise exception 'invalid_token'
      using errcode = '22023';
  end if;

  select lower(coalesce(u.email, ''))
  into v_user_email
  from auth.users u
  where u.id = v_user;

  if v_user_email is null or v_user_email = '' then
    raise exception 'invite_user_email_missing'
      using errcode = '22023';
  end if;

  select wi.*
  into v_invite
  from tongs.workspace_invites wi
  where wi.token = v_token
  order by wi.created_at desc
  limit 1;

  if not found then
    raise exception 'invalid_token'
      using errcode = '22023';
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'invite_revoked'
      using errcode = '22023';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'invite_already_accepted'
      using errcode = '22023';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'invite_expired'
      using errcode = '22023';
  end if;

  if v_invite.email <> v_user_email then
    raise exception 'invite_email_mismatch'
      using errcode = '42501';
  end if;

  select w.*
  into v_workspace
  from tongs.workspaces w
  where w.id = v_invite.workspace_id;

  if not found then
    raise exception 'workspace_not_found_for_invite'
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
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null or p_user_id is null then
    raise exception 'workspace_id_and_user_id_required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'admin');

  v_role := lower(btrim(coalesce(p_role, '')));
  if tongs.workspace_role_rank(v_role) = 0 then
    raise exception 'unsupported_workspace_role'
      using errcode = '22023';
  end if;

  if v_role = 'owner' and not tongs.has_workspace_role(p_workspace_id, 'owner') then
    raise exception 'owner_assignment_requires_owner'
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
    raise exception 'workspace_member_not_found'
      using errcode = 'P0002';
  end if;

  if v_is_creator and v_role <> 'owner' then
    raise exception 'creator_role_locked'
      using errcode = '42501';
  end if;

  if v_current_role = 'owner' and v_role <> 'owner' then
    raise exception 'owner_role_locked'
      using errcode = '42501';
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
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null or p_user_id is null then
    raise exception 'workspace_id_and_user_id_required'
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
    raise exception 'creator_remove_blocked'
      using errcode = '42501';
  end if;

  if v_target_role = 'owner' then
    raise exception 'owner_remove_blocked'
      using errcode = '42501';
  end if;

  delete from tongs.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_user_id;

  return query select true, p_workspace_id, p_user_id;
end;
$$;

commit;
