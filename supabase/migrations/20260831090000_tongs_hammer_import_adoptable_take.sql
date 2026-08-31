-- A deliberate, verified Hammer import is already accepted recording media.
-- Project it as an adoptable kept take so Hammer can make it canonical without
-- requiring a fictional Anvil keep-decision row.

begin;

create or replace view tongs.current_workpiece_recorded_takes
with (security_invoker=true) as
select
  c.workspace_id,
  c.workpiece_id,
  e.execution_id capture_session_id,
  c.id completion_id,
  k.id keep_id,
  a.ready_transition_id,
  a.script_revision,
  a.script_hash,
  c.media_path,
  c.media_revision,
  c.media_hash,
  c.completion_evidence,
  k.decision_evidence,
  c.created_at completed_at,
  k.created_at kept_at,
  c.completed_by,
  k.kept_by,
  'anvil_capture'::text source_kind,
  c.id source_authority_id,
  c.media_content_type,
  c.media_bytes,
  a.recording_session_id
from tongs.anvil_recording_completion_requests c
join tongs.recording_capture_authorities a on a.id=c.capture_authority_id
join tongs.recording_media_verification_receipts v on v.id=c.media_verification_receipt_id
left join tongs.anvil_capture_executions e on e.recording_capture_authority_id=a.id
left join tongs.anvil_recording_keep_requests k on k.completion_id=c.id
where k.id is not null

union all

select
  h.workspace_id,
  h.workpiece_id,
  null::uuid capture_session_id,
  null::uuid completion_id,
  h.id keep_id,
  null::uuid ready_transition_id,
  null::bigint script_revision,
  null::text script_hash,
  h.media_path,
  null::bigint media_revision,
  h.verified_media_hash media_hash,
  h.provenance || jsonb_build_object(
    'artifact_validation', jsonb_build_object(
      'content_type', h.verified_media_content_type,
      'bytes', h.verified_media_bytes,
      'sha256', h.verified_media_hash,
      'path', h.media_path,
      'ok', true
    )
  ) completion_evidence,
  jsonb_build_object(
    'schema', 'hammer.recording-import-acceptance.v1',
    'decision', 'keep',
    'import_id', h.id,
    'deliberate_attach', coalesce(h.provenance->>'deliberate_attach', 'false') = 'true'
  ) decision_evidence,
  h.committed_at completed_at,
  h.committed_at kept_at,
  h.imported_by completed_by,
  h.imported_by kept_by,
  'hammer_import'::text source_kind,
  h.id source_authority_id,
  h.verified_media_content_type media_content_type,
  h.verified_media_bytes media_bytes,
  null::uuid recording_session_id
from tongs.hammer_recording_import_requests h
where h.state='committed';

commit;
