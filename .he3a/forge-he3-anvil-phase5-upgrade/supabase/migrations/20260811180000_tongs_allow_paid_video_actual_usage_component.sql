begin;

alter table tongs.paid_media_actual_usage_components
  drop constraint paid_media_actual_usage_components_component_kind_check;

alter table tongs.paid_media_actual_usage_components
  add constraint paid_media_actual_usage_components_component_kind_check
  check (component_kind in (
    'text_input',
    'cached_text_input',
    'image_input',
    'cached_image_input',
    'image_output',
    'video_output'
  )) not valid;

alter table tongs.paid_media_actual_usage_components
  validate constraint paid_media_actual_usage_components_component_kind_check;

commit;
