alter table tongs.recording_revisions
  add column if not exists composition_revision bigint null,
  add column if not exists composition_fingerprint text null,
  add column if not exists composition_history_head_id text null;

alter table tongs.recording_revisions
  drop constraint if exists recording_revisions_composition_revision_nonnegative;
alter table tongs.recording_revisions
  add constraint recording_revisions_composition_revision_nonnegative
  check (composition_revision is null or composition_revision >= 0);

comment on column tongs.recording_revisions.composition_revision is
  'Acknowledged Hammer Composition V2 revision. Updated with composition_v2_path by optimistic compare-and-swap.';
comment on column tongs.recording_revisions.composition_fingerprint is
  'Fingerprint of the acknowledged Hammer Composition V2 transaction.';
comment on column tongs.recording_revisions.composition_history_head_id is
  'Acknowledged head of the single canonical Hammer creative history.';

-- The columns remain on the existing revision row and therefore inherit its
-- workspace viewer/editor policies. Reassert the fail-closed posture.
alter table tongs.recording_revisions enable row level security;
grant select, insert, update, delete on table tongs.recording_revisions to authenticated;
grant all on table tongs.recording_revisions to service_role;
