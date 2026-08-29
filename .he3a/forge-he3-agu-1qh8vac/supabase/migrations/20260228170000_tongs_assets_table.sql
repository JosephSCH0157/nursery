-- Canonical workspace asset registry for generated and uploaded media.

create table if not exists tongs.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  path text not null,
  mime_type text not null,
  bytes bigint not null check (bytes >= 0),
  storage_bucket text not null default 'forge-workpieces',
  storage_key text not null,
  provider text not null,
  provider_request_id text,
  request_id text,
  prompt text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_path_check check (path <> '' and path !~ '^/' and path !~ '\\.\\.'),
  constraint assets_storage_key_check check (storage_key <> '' and storage_key !~ '^/'),
  constraint assets_provider_check check (provider <> ''),
  constraint assets_mime_type_check check (mime_type <> '')
);

create unique index if not exists assets_storage_unique_idx
  on tongs.assets (storage_bucket, storage_key);

create index if not exists assets_workspace_created_idx
  on tongs.assets (workspace_id, created_at desc);

create index if not exists assets_workpiece_created_idx
  on tongs.assets (workpiece_id, created_at desc);

drop trigger if exists trg_assets_updated_at on tongs.assets;
create trigger trg_assets_updated_at
before update on tongs.assets
for each row execute function tongs.set_updated_at();

alter table tongs.assets enable row level security;

drop policy if exists assets_select_if_workspace_access on tongs.assets;
create policy assets_select_if_workspace_access
on tongs.assets
for select
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists assets_insert_if_workspace_access on tongs.assets;
create policy assets_insert_if_workspace_access
on tongs.assets
for insert
to authenticated
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists assets_update_if_workspace_access on tongs.assets;
create policy assets_update_if_workspace_access
on tongs.assets
for update
to authenticated
using (tongs.can_access_workspace(workspace_id))
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists assets_delete_if_workspace_access on tongs.assets;
create policy assets_delete_if_workspace_access
on tongs.assets
for delete
to authenticated
using (tongs.can_access_workspace(workspace_id));
