-- Phase 2: workspace invite + accept flow.

begin;

create table if not exists tongs.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  email text not null,
  role text not null,
  token text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invites_email_lower_check check (email = lower(btrim(email))),
  constraint workspace_invites_role_check check (role in ('owner', 'admin', 'editor', 'viewer')),
  constraint workspace_invites_expiry_check check (expires_at > created_at)
);

create index if not exists workspace_invites_workspace_created_idx
  on tongs.workspace_invites (workspace_id, created_at desc);

create index if not exists workspace_invites_email_idx
  on tongs.workspace_invites (email);

create index if not exists workspace_invites_active_idx
  on tongs.workspace_invites (workspace_id, email)
  where accepted_at is null and revoked_at is null;

drop trigger if exists trg_workspace_invites_updated_at on tongs.workspace_invites;
create trigger trg_workspace_invites_updated_at
before update on tongs.workspace_invites
for each row execute function tongs.set_updated_at();

alter table tongs.workspace_invites enable row level security;

drop policy if exists workspace_invites_select_if_workspace_member on tongs.workspace_invites;
drop policy if exists workspace_invites_insert_if_admin on tongs.workspace_invites;
drop policy if exists workspace_invites_update_if_admin on tongs.workspace_invites;
drop policy if exists workspace_invites_delete_if_admin on tongs.workspace_invites;

create policy workspace_invites_select_if_workspace_member
on tongs.workspace_invites
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'viewer')
);

create policy workspace_invites_insert_if_admin
on tongs.workspace_invites
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'admin')
);

create policy workspace_invites_update_if_admin
on tongs.workspace_invites
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'admin')
)
with check (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'admin')
);

create policy workspace_invites_delete_if_admin
on tongs.workspace_invites
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_invites.workspace_id, 'admin')
);

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
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'admin');

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Invite email is required'
      using errcode = '22023';
  end if;

  v_role := lower(btrim(coalesce(p_role, 'viewer')));
  if tongs.workspace_role_rank(v_role) = 0 then
    raise exception 'Unsupported invite role: %', p_role
      using errcode = '22023';
  end if;

  if v_role = 'owner' and not tongs.has_workspace_role(p_workspace_id, 'owner') then
    raise exception 'Only workspace owners can invite other owners'
      using errcode = '42501';
  end if;

  v_hours := coalesce(p_expires_hours, 72);
  if v_hours < 1 then v_hours := 1; end if;
  if v_hours > 720 then v_hours := 720; end if;

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

create or replace function tongs.revoke_workspace_invite(
  p_invite_id uuid
)
returns table (
  revoked boolean,
  invite_id uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_invite tongs.workspace_invites%rowtype;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  select wi.*
  into v_invite
  from tongs.workspace_invites wi
  where wi.id = p_invite_id
  for update;

  if not found then
    raise exception 'Invite not found'
      using errcode = 'P0002';
  end if;

  perform tongs.assert_workspace_role(v_invite.workspace_id, 'admin');

  if v_invite.accepted_at is not null then
    raise exception 'Invite already accepted'
      using errcode = '22023';
  end if;

  if v_invite.revoked_at is not null then
    return query select false, v_invite.id;
    return;
  end if;

  update tongs.workspace_invites wi
  set revoked_at = now(),
      updated_at = now()
  where wi.id = v_invite.id;

  return query select true, v_invite.id;
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

revoke all on function tongs.create_workspace_invite(uuid, text, text, integer) from public;
revoke all on function tongs.revoke_workspace_invite(uuid) from public;
revoke all on function tongs.accept_workspace_invite(text) from public;

grant execute on function tongs.create_workspace_invite(uuid, text, text, integer) to authenticated;
grant execute on function tongs.create_workspace_invite(uuid, text, text, integer) to service_role;
grant execute on function tongs.revoke_workspace_invite(uuid) to authenticated;
grant execute on function tongs.revoke_workspace_invite(uuid) to service_role;
grant execute on function tongs.accept_workspace_invite(text) to authenticated;
grant execute on function tongs.accept_workspace_invite(text) to service_role;

commit;
