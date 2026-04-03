begin;

alter table if exists tongs.episodes
  add column if not exists lifecycle_state text not null default 'active',
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id),
  add column if not exists detached_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'episodes_lifecycle_state_check'
      and conrelid = 'tongs.episodes'::regclass
  ) then
    alter table tongs.episodes
      add constraint episodes_lifecycle_state_check
      check (lifecycle_state in ('active', 'archived', 'published_detached', 'deleted'));
  end if;
end $$;

create index if not exists episodes_workspace_lifecycle_updated_idx
  on tongs.episodes (workspace_id, lifecycle_state, updated_at desc);

create table if not exists tongs.episode_performance_retention (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid null references tongs.episodes(id) on delete set null,
  former_workpiece_id uuid not null,
  deletion_mode text not null,
  tracking_enabled boolean not null default true,
  platform_records jsonb not null default '[]'::jsonb,
  publish_timestamp timestamptz null,
  title_snapshot text null,
  canonical_url text null,
  detached_at timestamptz not null default now(),
  created_by uuid null references auth.users(id),
  last_analytics_fetch_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, former_workpiece_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'episode_performance_retention_deletion_mode_check'
      and conrelid = 'tongs.episode_performance_retention'::regclass
  ) then
    alter table tongs.episode_performance_retention
      add constraint episode_performance_retention_deletion_mode_check
      check (deletion_mode in ('full_delete', 'delete_keep_performance', 'delete_keep_reusable_media'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'episode_performance_retention_platform_records_array_check'
      and conrelid = 'tongs.episode_performance_retention'::regclass
  ) then
    alter table tongs.episode_performance_retention
      add constraint episode_performance_retention_platform_records_array_check
      check (jsonb_typeof(platform_records) = 'array');
  end if;
end $$;

create index if not exists episode_performance_retention_workspace_detached_idx
  on tongs.episode_performance_retention (workspace_id, detached_at desc);

create table if not exists tongs.episode_deletion_audit (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  deletion_mode text not null,
  retained_performance_stub boolean not null default false,
  retained_reusable_assets_count integer not null default 0,
  deleted_asset_rows_count integer not null default 0,
  deleted_workpiece_file_rows_count integer not null default 0,
  deleted_workpiece_event_rows_count integer not null default 0,
  deleted_presence_rows_count integer not null default 0,
  deleted_recording_links_count integer not null default 0,
  deleted_project_links_count integer not null default 0,
  bytes_removed_estimate bigint not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'episode_deletion_audit_deletion_mode_check'
      and conrelid = 'tongs.episode_deletion_audit'::regclass
  ) then
    alter table tongs.episode_deletion_audit
      add constraint episode_deletion_audit_deletion_mode_check
      check (deletion_mode in ('full_delete', 'delete_keep_performance', 'delete_keep_reusable_media'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'episode_deletion_audit_warnings_array_check'
      and conrelid = 'tongs.episode_deletion_audit'::regclass
  ) then
    alter table tongs.episode_deletion_audit
      add constraint episode_deletion_audit_warnings_array_check
      check (jsonb_typeof(warnings) = 'array');
  end if;
end $$;

create index if not exists episode_deletion_audit_workspace_created_idx
  on tongs.episode_deletion_audit (workspace_id, created_at desc);

commit;
