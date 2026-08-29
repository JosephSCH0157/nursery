begin;

alter table tongs.assets
  alter column prompt drop not null;

alter table tongs.assets
  add column if not exists asset_kind text not null default 'thumbnail_image',
  add column if not exists status text not null default 'ready',
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists supersedes_asset_id uuid null references tongs.assets(id) on delete set null;

alter table tongs.assets
  drop constraint if exists assets_prompt_nullable_nonempty_check,
  add constraint assets_prompt_nullable_nonempty_check
    check (prompt is null or btrim(prompt) <> ''),
  drop constraint if exists assets_asset_kind_check,
  add constraint assets_asset_kind_check
    check (asset_kind in ('thumbnail_image', 'image_map_json')),
  drop constraint if exists assets_status_check,
  add constraint assets_status_check
    check (status in ('ready', 'superseded')),
  drop constraint if exists assets_kind_shape_check,
  add constraint assets_kind_shape_check
    check (
      (asset_kind = 'thumbnail_image' and prompt is not null)
      or
      (asset_kind = 'image_map_json' and mime_type = 'application/json' and prompt is null)
    );

create index if not exists assets_workpiece_kind_status_created_idx
  on tongs.assets (workpiece_id, asset_kind, status, created_at desc);

create index if not exists assets_workspace_kind_status_created_idx
  on tongs.assets (workspace_id, asset_kind, status, created_at desc);

create index if not exists assets_supersedes_asset_idx
  on tongs.assets (supersedes_asset_id)
  where supersedes_asset_id is not null;

create unique index if not exists assets_ready_image_map_unique_idx
  on tongs.assets (workpiece_id, asset_kind)
  where asset_kind = 'image_map_json' and status = 'ready';

commit;
