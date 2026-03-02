-- Bar-Stock projects as first-class workspace entities.
-- Adds canonical assignments/projects, nullable spark project linkage, and
-- explicit project <-> episode/workpiece links for deterministic Hearth intake.

create table if not exists tongs.barstock_assignments (
  id uuid primary key,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  created_by uuid not null,
  title text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tongs.barstock_assignments
  add column if not exists workspace_id uuid references tongs.workspaces(id) on delete cascade;
alter table tongs.barstock_assignments
  add column if not exists created_by uuid;
alter table tongs.barstock_assignments
  add column if not exists title text;
alter table tongs.barstock_assignments
  add column if not exists status text;
alter table tongs.barstock_assignments
  add column if not exists created_at timestamptz not null default now();
alter table tongs.barstock_assignments
  add column if not exists updated_at timestamptz not null default now();

do $migrate$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'tongs'
      and table_name = 'barstock_assignments'
      and column_name = 'name'
  ) then
    execute $$
      update tongs.barstock_assignments
      set title = coalesce(nullif(trim(title), ''), nullif(trim(name), ''), 'Imported Project')
      where title is null or trim(title) = ''
    $$;
  else
    update tongs.barstock_assignments
    set title = coalesce(nullif(trim(title), ''), 'Imported Project')
    where title is null or trim(title) = '';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'tongs'
      and table_name = 'barstock_assignments'
      and column_name = 'deleted_at'
  ) then
    execute $$
      update tongs.barstock_assignments
      set status = case
        when deleted_at is not null then 'archived'
        when status is null or trim(status) = '' then 'open'
        else status
      end
    $$;
  else
    update tongs.barstock_assignments
    set status = case
      when status is null or trim(status) = '' then 'open'
      else status
    end;
  end if;
end;
$migrate$;

update tongs.barstock_assignments
set status = case
  when lower(trim(status)) = 'archived' then 'archived'
  else 'open'
end
where status is not null;

alter table tongs.barstock_assignments
  alter column title set not null;
alter table tongs.barstock_assignments
  alter column status set not null;
alter table tongs.barstock_assignments
  alter column status set default 'open';

create index if not exists barstock_assignments_workspace_created_idx
  on tongs.barstock_assignments (workspace_id, created_at desc);

create table if not exists tongs.barstock_sparks (
  id uuid primary key,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  created_by uuid not null,
  assignment_id uuid null references tongs.barstock_assignments(id) on delete set null,
  title text null,
  body text not null,
  tags text[] not null default '{}'::text[],
  status text not null default 'raw',
  source text not null default 'typed',
  pinned boolean not null default false,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tongs.barstock_sparks
  add column if not exists workspace_id uuid references tongs.workspaces(id) on delete cascade;
alter table tongs.barstock_sparks
  add column if not exists created_by uuid;
alter table tongs.barstock_sparks
  add column if not exists assignment_id uuid;
alter table tongs.barstock_sparks
  add column if not exists title text;
alter table tongs.barstock_sparks
  add column if not exists body text;
alter table tongs.barstock_sparks
  add column if not exists tags text[] not null default '{}'::text[];
alter table tongs.barstock_sparks
  add column if not exists status text not null default 'raw';
alter table tongs.barstock_sparks
  add column if not exists source text not null default 'typed';
alter table tongs.barstock_sparks
  add column if not exists pinned boolean not null default false;
alter table tongs.barstock_sparks
  add column if not exists deleted_at timestamptz null;
alter table tongs.barstock_sparks
  add column if not exists created_at timestamptz not null default now();
alter table tongs.barstock_sparks
  add column if not exists updated_at timestamptz not null default now();

do $migrate$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'tongs'
      and table_name = 'barstock_sparks'
      and column_name = 'episode_id'
  ) then
    execute $$
      update tongs.barstock_sparks
      set assignment_id = episode_id
      where assignment_id is null
        and episode_id is not null
    $$;
  end if;
end;
$migrate$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'barstock_sparks_assignment_id_fkey'
      and conrelid = 'tongs.barstock_sparks'::regclass
  ) then
    alter table tongs.barstock_sparks
      add constraint barstock_sparks_assignment_id_fkey
      foreign key (assignment_id)
      references tongs.barstock_assignments(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists barstock_sparks_workspace_created_idx
  on tongs.barstock_sparks (workspace_id, created_at desc);

create index if not exists barstock_sparks_assignment_created_idx
  on tongs.barstock_sparks (assignment_id, created_at desc);

create table if not exists tongs.barstock_project_episode_links (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  project_id uuid not null references tongs.barstock_assignments(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint barstock_project_episode_links_project_unique unique (workspace_id, project_id)
);

create index if not exists barstock_project_episode_links_workpiece_idx
  on tongs.barstock_project_episode_links (workpiece_id);

-- One-time migration for older bar-stock deployments:
-- - materialize missing project rows from spark.assignment/episode ids
-- - keep imported projects visible with a safe title
insert into tongs.barstock_assignments (
  id,
  workspace_id,
  created_by,
  title,
  status,
  created_at,
  updated_at
)
select distinct on (s.assignment_id)
  s.assignment_id as id,
  s.workspace_id,
  coalesce(s.created_by, w.created_by, wm.user_id, '00000000-0000-0000-0000-000000000000'::uuid) as created_by,
  coalesce(
    nullif(trim(s.title), ''),
    'Imported Project'
  ) as title,
  'open' as status,
  coalesce(s.created_at, now()) as created_at,
  coalesce(s.updated_at, s.created_at, now()) as updated_at
from tongs.barstock_sparks s
left join tongs.workspaces w
  on w.id = s.workspace_id
left join lateral (
  select wm.user_id
  from tongs.workspace_members wm
  where wm.workspace_id = s.workspace_id
  order by wm.created_at asc
  limit 1
) wm on true
where s.assignment_id is not null
order by s.assignment_id, coalesce(s.updated_at, s.created_at, now()) desc
on conflict (id) do update
set
  workspace_id = excluded.workspace_id,
  created_by = excluded.created_by,
  title = excluded.title,
  updated_at = greatest(tongs.barstock_assignments.updated_at, excluded.updated_at);

-- Optional backfill: if old flows used assignment_id as episode/workpiece id,
-- preserve deterministic project -> episode mapping.
insert into tongs.barstock_project_episode_links (workspace_id, project_id, workpiece_id)
select distinct
  s.workspace_id,
  s.assignment_id as project_id,
  s.assignment_id as workpiece_id
from tongs.barstock_sparks s
join tongs.episodes e
  on e.id = s.assignment_id
 and e.workspace_id = s.workspace_id
where s.assignment_id is not null
on conflict (workspace_id, project_id) do nothing;

update tongs.barstock_assignments a
set workspace_id = s.workspace_id
from lateral (
  select sp.workspace_id
  from tongs.barstock_sparks sp
  where sp.assignment_id = a.id
    and sp.workspace_id is not null
  limit 1
) s
where a.workspace_id is null;

update tongs.barstock_assignments a
set created_by = coalesce(
  a.created_by,
  w.created_by,
  wm.user_id,
  '00000000-0000-0000-0000-000000000000'::uuid
)
from tongs.workspaces w
left join lateral (
  select m.user_id
  from tongs.workspace_members m
  where m.workspace_id = w.id
  order by m.created_at asc
  limit 1
) wm on true
where a.workspace_id = w.id
  and a.created_by is null;

delete from tongs.barstock_assignments
where workspace_id is null
   or created_by is null;

alter table tongs.barstock_assignments
  alter column workspace_id set not null;
alter table tongs.barstock_assignments
  alter column created_by set not null;

alter table tongs.barstock_assignments enable row level security;
alter table tongs.barstock_sparks enable row level security;
alter table tongs.barstock_project_episode_links enable row level security;

drop policy if exists barstock_assignments_select_if_workspace_access on tongs.barstock_assignments;
create policy barstock_assignments_select_if_workspace_access
on tongs.barstock_assignments
for select
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_assignments_insert_if_workspace_access on tongs.barstock_assignments;
create policy barstock_assignments_insert_if_workspace_access
on tongs.barstock_assignments
for insert
to authenticated
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_assignments_update_if_workspace_access on tongs.barstock_assignments;
create policy barstock_assignments_update_if_workspace_access
on tongs.barstock_assignments
for update
to authenticated
using (tongs.can_access_workspace(workspace_id))
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_assignments_delete_if_workspace_access on tongs.barstock_assignments;
create policy barstock_assignments_delete_if_workspace_access
on tongs.barstock_assignments
for delete
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_sparks_select_if_workspace_access on tongs.barstock_sparks;
create policy barstock_sparks_select_if_workspace_access
on tongs.barstock_sparks
for select
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_sparks_insert_if_workspace_access on tongs.barstock_sparks;
create policy barstock_sparks_insert_if_workspace_access
on tongs.barstock_sparks
for insert
to authenticated
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_sparks_update_if_workspace_access on tongs.barstock_sparks;
create policy barstock_sparks_update_if_workspace_access
on tongs.barstock_sparks
for update
to authenticated
using (tongs.can_access_workspace(workspace_id))
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_sparks_delete_if_workspace_access on tongs.barstock_sparks;
create policy barstock_sparks_delete_if_workspace_access
on tongs.barstock_sparks
for delete
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_project_episode_links_select_if_workspace_access on tongs.barstock_project_episode_links;
create policy barstock_project_episode_links_select_if_workspace_access
on tongs.barstock_project_episode_links
for select
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_project_episode_links_insert_if_workspace_access on tongs.barstock_project_episode_links;
create policy barstock_project_episode_links_insert_if_workspace_access
on tongs.barstock_project_episode_links
for insert
to authenticated
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists barstock_project_episode_links_update_if_workspace_access on tongs.barstock_project_episode_links;
create policy barstock_project_episode_links_update_if_workspace_access
on tongs.barstock_project_episode_links
for update
to authenticated
using (tongs.can_access_workspace(workspace_id))
with check (tongs.can_access_workspace(workspace_id));

drop trigger if exists trg_barstock_assignments_updated_at on tongs.barstock_assignments;
create trigger trg_barstock_assignments_updated_at
before update on tongs.barstock_assignments
for each row execute function tongs.set_updated_at();

drop trigger if exists trg_barstock_sparks_updated_at on tongs.barstock_sparks;
create trigger trg_barstock_sparks_updated_at
before update on tongs.barstock_sparks
for each row execute function tongs.set_updated_at();

alter table tongs.barstock_assignments
  drop constraint if exists barstock_assignments_status_check;
alter table tongs.barstock_assignments
  add constraint barstock_assignments_status_check
  check (status in ('open', 'archived'));
