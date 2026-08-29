begin;

alter table tongs.hammer_workpiece_state
  add column if not exists current_pass text not null default 'transcript_cleanup',
  add column if not exists pass_order_version integer not null default 2,
  add column if not exists pass_status jsonb not null default '{}'::jsonb;

alter table tongs.hammer_workpiece_state
  drop constraint if exists hammer_workpiece_state_current_pass_check;

alter table tongs.hammer_workpiece_state
  add constraint hammer_workpiece_state_current_pass_check
  check (
    current_pass in (
      'transcript_cleanup',
      'retakes',
      'gap_pacing',
      'visual_finishing',
      'image_placement',
      'image_animation',
      'audio_finalization',
      'packaging',
      'ready'
    )
  );

create index if not exists hammer_workpiece_state_current_pass_idx
  on tongs.hammer_workpiece_state (workspace_id, current_pass, updated_at desc);

commit;
