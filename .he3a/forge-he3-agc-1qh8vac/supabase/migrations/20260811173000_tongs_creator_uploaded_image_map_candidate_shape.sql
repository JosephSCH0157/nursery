-- Creator-uploaded image-map candidates have no generation prompt. Preserve
-- the generated-candidate contract while admitting the explicit upload shape.

alter table tongs.assets
  drop constraint assets_kind_shape_check,
  add constraint assets_kind_shape_check check (
    (
      asset_kind in (
        'thumbnail_image',
        'thumbnail_composite',
        'broll_candidate_poster',
        'reference_clip_poster',
        'reference_visual_image'
      )
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
      and (prompt is not null or provider = 'creator_upload')
    )
    or (
      asset_kind in ('broll_candidate_video', 'reference_clip_video')
      and mime_type like 'video/%'
    )
  );

comment on constraint assets_kind_shape_check on tongs.assets is
  'Enforces media shape by asset kind; image-map candidates require a generation prompt unless their provider is the canonical creator_upload path.';
