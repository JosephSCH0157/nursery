-- Slice C1a: align Hammer persisted prep lifecycle with transcript-first runtime prep states.

begin;

update tongs.hammer_workpiece_state
set prep_status = 'idle'
where prep_status = 'not_started';

update tongs.hammer_workpiece_state
set prep_status = 'prep_failed'
where prep_status = 'needs_review';

alter table tongs.hammer_workpiece_state
  drop constraint if exists hammer_workpiece_state_prep_status_check;

alter table tongs.hammer_workpiece_state
  add constraint hammer_workpiece_state_prep_status_check
  check (prep_status in ('idle', 'preparing', 'prepared', 'prep_failed'));

commit;
