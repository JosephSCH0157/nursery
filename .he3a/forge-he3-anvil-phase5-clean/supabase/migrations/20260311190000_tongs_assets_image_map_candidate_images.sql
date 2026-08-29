begin;

alter table tongs.assets
  drop constraint if exists assets_asset_kind_check,
  add constraint assets_asset_kind_check
    check (asset_kind in ('thumbnail_image', 'image_map_json', 'image_map_candidate_image')),
  drop constraint if exists assets_kind_shape_check,
  add constraint assets_kind_shape_check
    check (
      (asset_kind = 'thumbnail_image' and prompt is not null)
      or
      (asset_kind = 'image_map_json' and mime_type = 'application/json' and prompt is null)
      or
      (
        asset_kind = 'image_map_candidate_image'
        and mime_type like 'image/%'
        and prompt is not null
      )
    );

create index if not exists assets_workpiece_candidate_ready_created_idx
  on tongs.assets (workpiece_id, created_at desc)
  where asset_kind = 'image_map_candidate_image' and status = 'ready';

create index if not exists assets_workspace_candidate_ready_created_idx
  on tongs.assets (workspace_id, created_at desc)
  where asset_kind = 'image_map_candidate_image' and status = 'ready';

commit;
