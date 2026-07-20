-- Brand media roles are additive. Legacy intro_media/outro_media identities remain valid.
-- Existing brand asset RLS and storage policies are workspace/profile scoped and role-neutral.
alter table tongs.brand_assets
  drop constraint if exists brand_assets_role_check;

alter table tongs.brand_assets
  add constraint brand_assets_role_check check(role in (
    'primary_logo','secondary_logo','alternate_logo','transparent_logo','watermark_logo',
    'audio_intro','audio_outro','video_intro','video_outro',
    'intro_media','outro_media','theme_music','intro_stinger','outro_stinger','music_bed'
  ));

comment on constraint brand_assets_role_check on tongs.brand_assets is
  'Canonical brand asset roles. Explicit audio/video intro/outro roles coexist with legacy media roles.';
