-- Canonical Hammer first-class editor artifacts remain revision-scoped.
alter table tongs.recording_revisions
  add column if not exists composition_v2_path text null,
  add column if not exists media_provenance_path text null,
  add column if not exists render_jobs_path text null,
  add column if not exists release_packet_path text null;

comment on column tongs.recording_revisions.composition_v2_path is
  'Canonical Hammer Composition V2 artifact for this mutable recording revision.';
comment on column tongs.recording_revisions.media_provenance_path is
  'Canonical immutable-source provenance and derived-artifact ownership document.';
comment on column tongs.recording_revisions.render_jobs_path is
  'Revision-bound Hammer render job registry; completed stale jobs are retained but cannot acknowledge.';
comment on column tongs.recording_revisions.release_packet_path is
  'Validated Hammer creative-master packet offered to Quench for receiver-side revalidation.';

-- Existing recording_revisions RLS remains authoritative:
-- viewer for SELECT; editor for INSERT/UPDATE/DELETE; updated_by must equal auth.uid().
-- Reassert RLS and grants so partially provisioned environments fail closed.
alter table tongs.recording_revisions enable row level security;
grant select, insert, update, delete on table tongs.recording_revisions to authenticated;
grant all on table tongs.recording_revisions to service_role;
