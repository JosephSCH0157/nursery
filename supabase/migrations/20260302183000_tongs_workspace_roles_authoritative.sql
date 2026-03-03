-- Phase 1: authoritative workspace membership roles + role-check RPCs.
-- Roles (v1): owner > admin > editor > viewer

begin;

alter table if exists tongs.workspace_members
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update tongs.workspace_members wm
set created_by = coalesce(wm.created_by, wm.user_id, w.created_by)
from tongs.workspaces w
where w.id = wm.workspace_id
  and wm.created_by is null;

update tongs.workspace_members
set role = lower(btrim(coalesce(role, '')));

update tongs.workspace_members
set role = 'editor'
where role = 'member';

update tongs.workspace_members
set role = 'viewer'
where role = '' or role not in ('owner', 'admin', 'editor', 'viewer');

alter table if exists tongs.workspace_members
  alter column role set default 'viewer';

alter table if exists tongs.workspace_members
  drop constraint if exists workspace_members_role_check;

alter table if exists tongs.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'editor', 'viewer'));

create or replace function tongs.workspace_role_rank(_role text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(btrim(_role), ''))
    when 'viewer' then 10
    when 'editor' then 20
    when 'member' then 20
    when 'admin' then 30
    when 'owner' then 40
    else 0
  end;
$$;

create or replace function tongs.get_my_workspace_role(_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = tongs, public
as $$
  with me as (
    select wm.role
    from tongs.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
    limit 1
  )
  select case
    when exists (
      select 1
      from tongs.workspaces w
      where w.id = _workspace_id
        and w.created_by = auth.uid()
    ) then 'owner'
    else (select me.role from me)
  end;
$$;

create or replace function tongs.has_workspace_role(_workspace_id uuid, _min_role text)
returns boolean
language sql
stable
security definer
set search_path = tongs, public
as $$
  with min_role as (
    select tongs.workspace_role_rank(_min_role) as rank
  ),
  my_role as (
    select tongs.workspace_role_rank(tongs.get_my_workspace_role(_workspace_id)) as rank
  )
  select
    (select min_role.rank from min_role) > 0
    and (select my_role.rank from my_role) >= (select min_role.rank from min_role);
$$;

create or replace function tongs.assert_workspace_role(_workspace_id uuid, _min_role text)
returns void
language plpgsql
security definer
set search_path = tongs, public
as $$
begin
  if _workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  if tongs.workspace_role_rank(_min_role) = 0 then
    raise exception 'Unsupported workspace role: %', _min_role
      using errcode = '22023';
  end if;

  if not tongs.has_workspace_role(_workspace_id, _min_role) then
    raise exception 'Insufficient workspace role (requires %)', lower(btrim(_min_role))
      using errcode = '42501';
  end if;
end;
$$;

create or replace function tongs.workspace_is_member(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tongs, public
as $$
  select tongs.get_my_workspace_role(_workspace_id) is not null;
$$;

create or replace function tongs.workspace_is_owner(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tongs, public
as $$
  select tongs.has_workspace_role(_workspace_id, 'owner');
$$;

create or replace function tongs.can_access_workspace(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tongs, public
as $$
  select tongs.has_workspace_role(_workspace_id, 'viewer');
$$;

alter table tongs.workspace_members enable row level security;

drop policy if exists workspace_members_read_if_member on tongs.workspace_members;
drop policy if exists workspace_members_read_self_or_owner on tongs.workspace_members;
drop policy if exists workspace_members_read_self on tongs.workspace_members;
drop policy if exists workspace_members_insert_self on tongs.workspace_members;
drop policy if exists workspace_members_insert_if_admin on tongs.workspace_members;
drop policy if exists workspace_members_update_if_admin on tongs.workspace_members;
drop policy if exists workspace_members_delete_if_member on tongs.workspace_members;
drop policy if exists workspace_members_delete_self_or_owner on tongs.workspace_members;
drop policy if exists workspace_members_delete_self on tongs.workspace_members;
drop policy if exists workspace_members_delete_if_admin_or_self on tongs.workspace_members;

create policy workspace_members_read_if_workspace_member
on tongs.workspace_members
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'viewer')
);

create policy workspace_members_insert_if_admin
on tongs.workspace_members
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'admin')
  and tongs.workspace_role_rank(tongs.workspace_members.role) > 0
);

create policy workspace_members_update_if_admin
on tongs.workspace_members
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'admin')
)
with check (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'admin')
  and tongs.workspace_role_rank(tongs.workspace_members.role) > 0
);

create policy workspace_members_delete_if_admin_or_self
on tongs.workspace_members
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.workspace_members.workspace_id, 'admin')
  or tongs.workspace_members.user_id = auth.uid()
);

create or replace function tongs.workspace_add_creator_member()
returns trigger
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_creator uuid;
begin
  v_creator := coalesce(new.created_by, auth.uid());
  if v_creator is null then
    return new;
  end if;

  insert into tongs.workspace_members (workspace_id, user_id, role, created_at, created_by)
  values (new.id, v_creator, 'owner', now(), v_creator)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        created_by = coalesce(workspace_members.created_by, excluded.created_by);

  return new;
end;
$$;

create or replace function tongs.create_workspace_with_owner(_name text default 'Workspace')
returns table (
  id uuid,
  name text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_name text;
  v_workspace tongs.workspaces%rowtype;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  v_name := nullif(trim(coalesce(_name, '')), '');
  if v_name is null then
    v_name := 'Workspace';
  end if;

  insert into tongs.workspaces (name, created_by)
  values (v_name, v_user)
  returning * into v_workspace;

  insert into tongs.workspace_members (workspace_id, user_id, role, created_at, created_by)
  values (v_workspace.id, v_user, 'owner', now(), v_user)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        created_by = coalesce(workspace_members.created_by, excluded.created_by);

  return query
  select
    v_workspace.id,
    v_workspace.name,
    v_workspace.created_by,
    v_workspace.created_at;
end;
$$;

revoke all on function tongs.workspace_role_rank(text) from public;
revoke all on function tongs.get_my_workspace_role(uuid) from public;
revoke all on function tongs.has_workspace_role(uuid, text) from public;
revoke all on function tongs.assert_workspace_role(uuid, text) from public;
revoke all on function tongs.workspace_is_member(uuid) from public;
revoke all on function tongs.workspace_is_owner(uuid) from public;
revoke all on function tongs.can_access_workspace(uuid) from public;

grant execute on function tongs.workspace_role_rank(text) to authenticated;
grant execute on function tongs.workspace_role_rank(text) to service_role;
grant execute on function tongs.get_my_workspace_role(uuid) to authenticated;
grant execute on function tongs.get_my_workspace_role(uuid) to service_role;
grant execute on function tongs.has_workspace_role(uuid, text) to authenticated;
grant execute on function tongs.has_workspace_role(uuid, text) to service_role;
grant execute on function tongs.assert_workspace_role(uuid, text) to authenticated;
grant execute on function tongs.assert_workspace_role(uuid, text) to service_role;
grant execute on function tongs.workspace_is_member(uuid) to authenticated;
grant execute on function tongs.workspace_is_member(uuid) to service_role;
grant execute on function tongs.workspace_is_owner(uuid) to authenticated;
grant execute on function tongs.workspace_is_owner(uuid) to service_role;
grant execute on function tongs.can_access_workspace(uuid) to authenticated;
grant execute on function tongs.can_access_workspace(uuid) to service_role;

revoke all on function tongs.create_workspace_with_owner(text) from public;
grant execute on function tongs.create_workspace_with_owner(text) to authenticated;
grant execute on function tongs.create_workspace_with_owner(text) to service_role;

commit;
