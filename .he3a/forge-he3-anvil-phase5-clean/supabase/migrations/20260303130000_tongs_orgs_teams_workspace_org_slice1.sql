-- Organization scaffold (Model A) - thin slice with zero workspace access behavior change.
-- Adds org/team entities, backfills workspaces.org_id, and exposes read-only org RPCs.

begin;

create table if not exists tongs.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_by uuid references auth.users(id) on delete set null,
  personal_owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists orgs_personal_owner_user_id_idx
  on tongs.orgs (personal_owner_user_id);

create index if not exists orgs_created_by_idx
  on tongs.orgs (created_by);

create table if not exists tongs.org_members (
  org_id uuid not null references tongs.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_role text not null default 'member'
    check (org_role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (org_id, user_id)
);

create index if not exists org_members_user_id_idx
  on tongs.org_members (user_id);

create index if not exists org_members_org_role_idx
  on tongs.org_members (org_id, org_role);

create table if not exists tongs.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tongs.orgs(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create unique index if not exists teams_org_id_name_idx
  on tongs.teams (org_id, name);

create index if not exists teams_org_id_idx
  on tongs.teams (org_id);

create table if not exists tongs.team_members (
  team_id uuid not null references tongs.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_role text not null default 'member'
    check (team_role in ('lead', 'member')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (team_id, user_id)
);

create index if not exists team_members_user_id_idx
  on tongs.team_members (user_id);

create index if not exists team_members_team_role_idx
  on tongs.team_members (team_id, team_role);

create table if not exists tongs.workspace_grants (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  team_id uuid not null references tongs.teams(id) on delete cascade,
  access_role text not null default 'viewer'
    check (access_role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (workspace_id, team_id)
);

create index if not exists workspace_grants_team_id_idx
  on tongs.workspace_grants (team_id);

alter table tongs.orgs enable row level security;
alter table tongs.org_members enable row level security;
alter table tongs.teams enable row level security;
alter table tongs.team_members enable row level security;
alter table tongs.workspace_grants enable row level security;

drop policy if exists org_members_read_self on tongs.org_members;
create policy org_members_read_self
on tongs.org_members
for select
to authenticated
using (
  tongs.org_members.user_id = auth.uid()
);

drop policy if exists orgs_read_if_member on tongs.orgs;
create policy orgs_read_if_member
on tongs.orgs
for select
to authenticated
using (
  exists (
    select 1
    from tongs.org_members om
    where om.org_id = tongs.orgs.id
      and om.user_id = auth.uid()
  )
);

drop policy if exists teams_read_if_org_member on tongs.teams;
create policy teams_read_if_org_member
on tongs.teams
for select
to authenticated
using (
  exists (
    select 1
    from tongs.org_members om
    where om.org_id = tongs.teams.org_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists team_members_read_if_org_member on tongs.team_members;
create policy team_members_read_if_org_member
on tongs.team_members
for select
to authenticated
using (
  exists (
    select 1
    from tongs.teams t
    join tongs.org_members om
      on om.org_id = t.org_id
    where t.id = tongs.team_members.team_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists workspace_grants_read_if_org_member on tongs.workspace_grants;
create policy workspace_grants_read_if_org_member
on tongs.workspace_grants
for select
to authenticated
using (
  exists (
    select 1
    from tongs.teams t
    join tongs.org_members om
      on om.org_id = t.org_id
    where t.id = tongs.workspace_grants.team_id
      and om.user_id = auth.uid()
  )
);

alter table if exists tongs.workspaces
  add column if not exists org_id uuid;

create index if not exists workspaces_org_id_idx
  on tongs.workspaces (org_id);

drop table if exists _workspace_org_owner_map;
create temporary table _workspace_org_owner_map
on commit drop
as
select
  w.id as workspace_id,
  coalesce(
    w.created_by,
    (
      select wm.user_id
      from tongs.workspace_members wm
      where wm.workspace_id = w.id
        and wm.role = 'owner'
      order by wm.created_at asc nulls last
      limit 1
    ),
    (
      select wm.user_id
      from tongs.workspace_members wm
      where wm.workspace_id = w.id
      order by wm.created_at asc nulls last
      limit 1
    )
  ) as owner_user_id
from tongs.workspaces w;

insert into tongs.orgs (
  name,
  created_by,
  personal_owner_user_id,
  created_at,
  updated_at
)
select
  'Personal Org',
  src.owner_user_id,
  src.owner_user_id,
  now(),
  now()
from (
  select distinct owner_user_id
  from _workspace_org_owner_map
  where owner_user_id is not null
) src
on conflict (personal_owner_user_id) do nothing;

insert into tongs.org_members (
  org_id,
  user_id,
  org_role,
  created_at,
  created_by
)
select
  o.id,
  src.owner_user_id,
  'owner',
  now(),
  src.owner_user_id
from (
  select distinct owner_user_id
  from _workspace_org_owner_map
  where owner_user_id is not null
) src
join tongs.orgs o
  on o.personal_owner_user_id = src.owner_user_id
on conflict (org_id, user_id) do update
set org_role = 'owner';

update tongs.workspaces w
set org_id = o.id
from _workspace_org_owner_map src
join tongs.orgs o
  on o.personal_owner_user_id = src.owner_user_id
where w.id = src.workspace_id
  and w.org_id is null;

insert into tongs.orgs (
  name,
  created_by,
  personal_owner_user_id,
  created_at,
  updated_at
)
select
  'Legacy Workspace Org',
  null,
  null,
  now(),
  now()
where exists (
  select 1
  from tongs.workspaces
  where org_id is null
)
and not exists (
  select 1
  from tongs.orgs o
  where o.personal_owner_user_id is null
    and o.name = 'Legacy Workspace Org'
);

update tongs.workspaces w
set org_id = (
  select o.id
  from tongs.orgs o
  where o.personal_owner_user_id is null
    and o.name = 'Legacy Workspace Org'
  order by o.created_at asc, o.id asc
  limit 1
)
where w.org_id is null;

insert into tongs.org_members (
  org_id,
  user_id,
  org_role,
  created_at,
  created_by
)
select distinct
  w.org_id,
  wm.user_id,
  case
    when o.personal_owner_user_id = wm.user_id then 'owner'
    else 'member'
  end as org_role,
  now(),
  coalesce(w.created_by, wm.user_id)
from tongs.workspaces w
join tongs.workspace_members wm
  on wm.workspace_id = w.id
left join tongs.orgs o
  on o.id = w.org_id
where w.org_id is not null
on conflict (org_id, user_id) do update
set org_role = case
  when excluded.org_role = 'owner' then 'owner'
  when tongs.org_members.org_role = 'owner' then 'owner'
  when tongs.org_members.org_role = 'admin' then 'admin'
  else tongs.org_members.org_role
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conname = 'workspaces_org_id_fkey'
      and c.conrelid = 'tongs.workspaces'::regclass
  ) then
    alter table tongs.workspaces
      add constraint workspaces_org_id_fkey
      foreign key (org_id)
      references tongs.orgs(id)
      on delete restrict;
  end if;
end
$$;

alter table tongs.workspaces
  alter column org_id set not null;

create or replace function tongs.ensure_personal_org(p_user_id uuid default auth.uid())
returns uuid
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_org_id uuid;
begin
  v_user := coalesce(p_user_id, auth.uid());
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  select o.id
  into v_org_id
  from tongs.orgs o
  where o.personal_owner_user_id = v_user
  limit 1;

  if v_org_id is null then
    insert into tongs.orgs (
      name,
      created_by,
      personal_owner_user_id,
      created_at,
      updated_at
    )
    values (
      'Personal Org',
      v_user,
      v_user,
      now(),
      now()
    )
    on conflict (personal_owner_user_id) do update
      set personal_owner_user_id = excluded.personal_owner_user_id
    returning id into v_org_id;
  end if;

  insert into tongs.org_members (
    org_id,
    user_id,
    org_role,
    created_at,
    created_by
  )
  values (
    v_org_id,
    v_user,
    'owner',
    now(),
    v_user
  )
  on conflict (org_id, user_id) do update
  set org_role = 'owner';

  return v_org_id;
end;
$$;

create or replace function tongs.get_or_create_my_personal_org_id()
returns table (
  org_id uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  return query
  select tongs.ensure_personal_org(v_user);
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
  v_org_id uuid;
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

  v_org_id := tongs.ensure_personal_org(v_user);

  insert into tongs.workspaces (name, created_by, org_id)
  values (v_name, v_user, v_org_id)
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

create or replace function tongs.list_my_orgs()
returns table (
  org_id uuid,
  org_name text,
  my_org_role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.name,
    om.org_role,
    o.created_at
  from tongs.org_members om
  join tongs.orgs o
    on o.id = om.org_id
  where om.user_id = v_user
  order by
    case om.org_role
      when 'owner' then 40
      when 'admin' then 30
      when 'member' then 20
      else 0
    end desc,
    lower(o.name) asc,
    o.created_at asc;
end;
$$;

create or replace function tongs.list_org_members(p_org_id uuid)
returns table (
  org_id uuid,
  user_id uuid,
  user_email text,
  org_role text,
  created_at timestamptz,
  created_by uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
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

  if not exists (
    select 1
    from tongs.org_members me
    where me.org_id = p_org_id
      and me.user_id = v_user
  ) then
    raise exception 'Insufficient org role (requires member)'
      using errcode = '42501';
  end if;

  return query
  select
    om.org_id,
    om.user_id,
    coalesce(lower(u.email), ''),
    om.org_role,
    om.created_at,
    om.created_by
  from tongs.org_members om
  left join auth.users u
    on u.id = om.user_id
  where om.org_id = p_org_id
  order by
    case om.org_role
      when 'owner' then 40
      when 'admin' then 30
      when 'member' then 20
      else 0
    end desc,
    om.created_at asc,
    coalesce(lower(u.email), '') asc;
end;
$$;

revoke all on function tongs.ensure_personal_org(uuid) from public;
revoke all on function tongs.get_or_create_my_personal_org_id() from public;
revoke all on function tongs.list_my_orgs() from public;
revoke all on function tongs.list_org_members(uuid) from public;
revoke all on function tongs.create_workspace_with_owner(text) from public;

grant execute on function tongs.ensure_personal_org(uuid) to authenticated;
grant execute on function tongs.ensure_personal_org(uuid) to service_role;
grant execute on function tongs.get_or_create_my_personal_org_id() to authenticated;
grant execute on function tongs.get_or_create_my_personal_org_id() to service_role;
grant execute on function tongs.list_my_orgs() to authenticated;
grant execute on function tongs.list_my_orgs() to service_role;
grant execute on function tongs.list_org_members(uuid) to authenticated;
grant execute on function tongs.list_org_members(uuid) to service_role;
grant execute on function tongs.create_workspace_with_owner(text) to authenticated;
grant execute on function tongs.create_workspace_with_owner(text) to service_role;

commit;
