-- Transcript version registry: adds a pointer to the transcript version registry artifact
-- so Hammer can track multiple transcript versions (anvil source, hammer_ai, imported)
-- without destructively overwriting the original Anvil transcript.

begin;

alter table tongs.hammer_workpiece_state
  add column if not exists transcript_versions_artifact_path text null;

comment on column tongs.hammer_workpiece_state.transcript_versions_artifact_path
  is 'Path to the HammerPersistedTranscriptVersionRegistry artifact JSON.  '
     'Null until the first time a version registry is written (lazy-bootstrapped on '
     'first open after migration).  The existing transcript_artifact_path continues '
     'to reference the currently-active transcript for backward compatibility.';

commit;
