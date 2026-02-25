-- Tongs commit API core schema: cradles, indexed files, and append-only events.
create schema if not exists tongs;

create or replace function tongs.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists tongs.project_cradles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  status text not null default 'draft',
  manifest_path text not null default 'manifest.json',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_cradles_manifest_path_check check (manifest_path = 'manifest.json')
);

create table if not exists tongs.workpiece_files (
  workpiece_id uuid not null references tongs.project_cradles(id) on delete cascade,
  path text not null,
  file_type text not null default 'artifact',
  content_type text not null,
  bytes bigint not null check (bytes >= 0),
  hash_algo text not null default 'sha256',
  hash_value text not null,
  storage_bucket text not null default 'forge-workpieces',
  storage_key text not null,
  written_by_tool text not null,
  written_by_tool_version text not null,
  written_by_lane text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workpiece_id, path),
  constraint workpiece_files_path_check check (path <> '' and path !~ '^/' and path !~ '\\.\\.')
);

create table if not exists tongs.workpiece_events (
  id bigint generated always as identity primary key,
  workpiece_id uuid not null references tongs.project_cradles(id) on delete cascade,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id text,
  written_by_tool text not null,
  written_by_tool_version text not null,
  written_by_lane text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_cradles_workspace_idx
  on tongs.project_cradles (workspace_id, created_at desc);

create index if not exists workpiece_files_workpiece_updated_idx
  on tongs.workpiece_files (workpiece_id, updated_at desc);

create index if not exists workpiece_events_workpiece_created_idx
  on tongs.workpiece_events (workpiece_id, created_at desc);

drop trigger if exists trg_project_cradles_updated_at on tongs.project_cradles;
create trigger trg_project_cradles_updated_at
before update on tongs.project_cradles
for each row execute function tongs.set_updated_at();

drop trigger if exists trg_workpiece_files_updated_at on tongs.workpiece_files;
create trigger trg_workpiece_files_updated_at
before update on tongs.workpiece_files
for each row execute function tongs.set_updated_at();

create or replace function tongs.can_access_workspace(_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select
    exists (
      select 1
      from tongs.workspaces w
      where w.id = _workspace_id
        and w.created_by = auth.uid()
    )
    or exists (
      select 1
      from tongs.workspace_members wm
      where wm.workspace_id = _workspace_id
        and wm.user_id = auth.uid()
    );
$$;

create or replace function tongs.can_access_workpiece(_workpiece_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from tongs.project_cradles pc
    where pc.id = _workpiece_id
      and tongs.can_access_workspace(pc.workspace_id)
  );
$$;

alter table tongs.project_cradles enable row level security;
alter table tongs.workpiece_files enable row level security;
alter table tongs.workpiece_events enable row level security;

drop policy if exists project_cradles_select_if_workspace_access on tongs.project_cradles;
create policy project_cradles_select_if_workspace_access
on tongs.project_cradles
for select
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists project_cradles_insert_if_workspace_access on tongs.project_cradles;
create policy project_cradles_insert_if_workspace_access
on tongs.project_cradles
for insert
to authenticated
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists project_cradles_update_if_workspace_access on tongs.project_cradles;
create policy project_cradles_update_if_workspace_access
on tongs.project_cradles
for update
to authenticated
using (tongs.can_access_workspace(workspace_id))
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists project_cradles_delete_if_workspace_access on tongs.project_cradles;
create policy project_cradles_delete_if_workspace_access
on tongs.project_cradles
for delete
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists workpiece_files_select_if_workpiece_access on tongs.workpiece_files;
create policy workpiece_files_select_if_workpiece_access
on tongs.workpiece_files
for select
to authenticated
using (tongs.can_access_workpiece(workpiece_id));

drop policy if exists workpiece_files_insert_if_workpiece_access on tongs.workpiece_files;
create policy workpiece_files_insert_if_workpiece_access
on tongs.workpiece_files
for insert
to authenticated
with check (tongs.can_access_workpiece(workpiece_id));

drop policy if exists workpiece_files_update_if_workpiece_access on tongs.workpiece_files;
create policy workpiece_files_update_if_workpiece_access
on tongs.workpiece_files
for update
to authenticated
using (tongs.can_access_workpiece(workpiece_id))
with check (tongs.can_access_workpiece(workpiece_id));

drop policy if exists workpiece_files_delete_if_workpiece_access on tongs.workpiece_files;
create policy workpiece_files_delete_if_workpiece_access
on tongs.workpiece_files
for delete
to authenticated
using (tongs.can_access_workpiece(workpiece_id));

drop policy if exists workpiece_events_select_if_workpiece_access on tongs.workpiece_events;
create policy workpiece_events_select_if_workpiece_access
on tongs.workpiece_events
for select
to authenticated
using (tongs.can_access_workpiece(workpiece_id));

drop policy if exists workpiece_events_insert_if_workpiece_access on tongs.workpiece_events;
create policy workpiece_events_insert_if_workpiece_access
on tongs.workpiece_events
for insert
to authenticated
with check (tongs.can_access_workpiece(workpiece_id));

insert into storage.buckets (id, name, public)
values ('forge-workpieces', 'forge-workpieces', false)
on conflict (id) do nothing;

update storage.buckets
set public = false
where id = 'forge-workpieces';
