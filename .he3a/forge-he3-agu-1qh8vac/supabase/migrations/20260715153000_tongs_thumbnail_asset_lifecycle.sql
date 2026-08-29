begin;

alter table tongs.assets
  add column if not exists operation_id text null,
  add column if not exists operation_fingerprint text null,
  add column if not exists reuse_identity text null,
  add column if not exists content_hash text null,
  add column if not exists failure_code text null,
  add column if not exists failure_message text null,
  add column if not exists reference_committed_at timestamptz null,
  add column if not exists ready_at timestamptz null,
  add column if not exists failed_at timestamptz null;

-- Existing asset bytes were committed through workpiece_files, whose hash is
-- already calculated from the exact canonical storage bytes.
update tongs.assets as a
set content_hash = lower(f.hash_value)
from tongs.workpiece_files as f
where f.workpiece_id = a.workpiece_id
  and f.path = a.path
  and lower(f.hash_algo) = 'sha256'
  and f.hash_value ~* '^[0-9a-f]{64}$'
  and a.content_hash is null;

-- Backfilled ready rows predate ready_at; their existing updated_at is the
-- best canonical lifecycle timestamp available.
update tongs.assets
set ready_at = coalesce(ready_at, updated_at, created_at)
where status = 'ready' and ready_at is null;

alter table tongs.assets
  drop constraint if exists assets_status_check,
  add constraint assets_status_check
    check (status in ('pending', 'ready', 'failed', 'superseded')),
  drop constraint if exists assets_asset_kind_check,
  add constraint assets_asset_kind_check
    check (
      asset_kind in (
        'thumbnail_image',
        'thumbnail_composite',
        'image_map_json',
        'image_map_candidate_image'
      )
    ),
  drop constraint if exists assets_kind_shape_check,
  add constraint assets_kind_shape_check
    check (
      (
        asset_kind in ('thumbnail_image', 'thumbnail_composite')
        and mime_type like 'image/%'
      )
      or (
        asset_kind = 'image_map_json'
        and mime_type = 'application/json'
        and prompt is null
      )
      or (
        asset_kind = 'image_map_candidate_image'
        and mime_type like 'image/%'
        and prompt is not null
      )
    ),
  drop constraint if exists assets_operation_id_check,
  add constraint assets_operation_id_check
    check (operation_id is null or btrim(operation_id) <> ''),
  drop constraint if exists assets_reuse_identity_check,
  add constraint assets_reuse_identity_check
    check (reuse_identity is null or reuse_identity ~ '^[0-9a-f]{64}$'),
  drop constraint if exists assets_operation_fingerprint_check,
  add constraint assets_operation_fingerprint_check
    check (
      (operation_id is null and operation_fingerprint is null)
      or (
        operation_id is not null
        and operation_fingerprint ~ '^[0-9a-f]{64}$'
      )
    ),
  drop constraint if exists assets_content_hash_check,
  add constraint assets_content_hash_check
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  drop constraint if exists assets_thumbnail_ready_hash_check,
  add constraint assets_thumbnail_ready_hash_check
    check (
      asset_kind not in ('thumbnail_image', 'thumbnail_composite')
      or status <> 'ready'
      or content_hash is not null
    ),
  drop constraint if exists assets_failure_diagnostics_check,
  add constraint assets_failure_diagnostics_check
    check (
      (
        status = 'failed'
        and failure_code is not null
        and btrim(failure_code) <> ''
        and failure_message is not null
        and btrim(failure_message) <> ''
        and failed_at is not null
      )
      or (
        status <> 'failed'
        and failure_code is null
        and failure_message is null
        and failed_at is null
      )
    ),
  drop constraint if exists assets_ready_timestamp_check,
  add constraint assets_ready_timestamp_check
    check (
      (status = 'ready' and ready_at is not null)
      or status <> 'ready'
    );

create unique index if not exists assets_thumbnail_operation_unique_idx
  on tongs.assets (workspace_id, workpiece_id, asset_kind, operation_id)
  where operation_id is not null
    and asset_kind in ('thumbnail_image', 'thumbnail_composite');

create unique index if not exists assets_thumbnail_composite_reuse_unique_idx
  on tongs.assets (workspace_id, workpiece_id, reuse_identity)
  where reuse_identity is not null
    and asset_kind = 'thumbnail_composite'
    and status in ('pending', 'ready');

create index if not exists assets_thumbnail_reconciliation_idx
  on tongs.assets (workpiece_id, status, created_at)
  where asset_kind in ('thumbnail_image', 'thumbnail_composite')
    and status in ('pending', 'failed');

create index if not exists assets_thumbnail_hash_idx
  on tongs.assets (workpiece_id, content_hash)
  where asset_kind in ('thumbnail_image', 'thumbnail_composite')
    and content_hash is not null;

commit;
