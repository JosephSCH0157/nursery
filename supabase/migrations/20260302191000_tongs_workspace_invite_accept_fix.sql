-- Fix accept_workspace_invite ambiguity with RETURNS TABLE output names.
-- Use conflict-on-constraint to avoid workspace_id variable/column ambiguity.

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
  limit 1
  for update;

  if not found then
    raise exception 'Invite token is invalid, revoked, accepted, or expired'
      using errcode = '22023';
  end if;

  if v_invite.email <> v_user_email then
    raise exception 'Invite email does not match authenticated user'
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

revoke all on function tongs.accept_workspace_invite(text) from public;
grant execute on function tongs.accept_workspace_invite(text) to authenticated;
grant execute on function tongs.accept_workspace_invite(text) to service_role;
