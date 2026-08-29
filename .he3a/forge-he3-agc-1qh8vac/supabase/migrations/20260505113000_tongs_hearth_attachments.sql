-- Hearth chat file attachments (V1): canonical upload + extracted text for prompt context.

create table if not exists tongs.hearth_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  episode_id uuid not null references tongs.episodes(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 10485760),
  storage_bucket text not null default 'forge-workpieces',
  storage_path text not null,
  storage_key text not null,
  extracted_text text,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'attached', 'failed')),
  parse_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hearth_attachments_filename_check check (filename <> ''),
  constraint hearth_attachments_mime_type_check check (mime_type <> ''),
  constraint hearth_attachments_storage_path_check check (storage_path <> '' and storage_path !~ '^/' and storage_path !~ '\.\.'),
  constraint hearth_attachments_storage_key_check check (storage_key <> '' and storage_key !~ '^/')
);

create unique index if not exists hearth_attachments_storage_unique_idx
  on tongs.hearth_attachments (storage_bucket, storage_key);

create index if not exists hearth_attachments_workspace_episode_created_idx
  on tongs.hearth_attachments (workspace_id, episode_id, created_at desc);

create index if not exists hearth_attachments_episode_created_idx
  on tongs.hearth_attachments (episode_id, created_at desc);

drop trigger if exists trg_hearth_attachments_updated_at on tongs.hearth_attachments;
create trigger trg_hearth_attachments_updated_at
before update on tongs.hearth_attachments
for each row execute function tongs.set_updated_at();

alter table tongs.hearth_attachments enable row level security;

drop policy if exists hearth_attachments_select_if_workspace_access on tongs.hearth_attachments;
create policy hearth_attachments_select_if_workspace_access
on tongs.hearth_attachments
for select
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists hearth_attachments_insert_if_workspace_access on tongs.hearth_attachments;
create policy hearth_attachments_insert_if_workspace_access
on tongs.hearth_attachments
for insert
to authenticated
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists hearth_attachments_update_if_workspace_access on tongs.hearth_attachments;
create policy hearth_attachments_update_if_workspace_access
on tongs.hearth_attachments
for update
to authenticated
using (tongs.can_access_workspace(workspace_id))
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists hearth_attachments_delete_if_workspace_access on tongs.hearth_attachments;
create policy hearth_attachments_delete_if_workspace_access
on tongs.hearth_attachments
for delete
to authenticated
using (tongs.can_access_workspace(workspace_id));
