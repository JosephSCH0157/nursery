begin;

alter table tongs.episodes
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id),
  add column if not exists archive_reason text null;

alter table tongs.episodes
  drop constraint if exists episodes_archive_fields_check;

alter table tongs.episodes
  add constraint episodes_archive_fields_check check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  );

create index if not exists episodes_workspace_active_updated_idx
  on tongs.episodes (workspace_id, updated_at desc)
  where archived_at is null;

create index if not exists episodes_workspace_archived_updated_idx
  on tongs.episodes (workspace_id, archived_at desc, updated_at desc)
  where archived_at is not null;

commit;
