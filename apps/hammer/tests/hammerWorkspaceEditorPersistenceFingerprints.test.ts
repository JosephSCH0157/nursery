import assert from "node:assert/strict";

import {
  buildAutosavePayloadKey,
  buildHydrationNoopFingerprint,
  normalizeVisualTimelineForFingerprint,
  stripEditorSessionOpenMetadata,
} from "../src/editor/hammerWorkspaceEditorPersistenceFingerprints";

const target = { workspaceId: "workspace-1", workpieceId: "workpiece-1" };

const firstSession = {
  schema_version: 1,
  session_id: "session-1",
  last_opened_at: "2026-10-14T10:00:00.000Z",
  selected_segment_id: "segment-1",
  selected_overlay_row_id: "overlay-1",
};
const reopenedSession = {
  ...firstSession,
  last_opened_at: "2026-10-14T11:00:00.000Z",
  selected_segment_id: "segment-2",
  selected_overlay_row_id: null,
};

assert.deepEqual(
  stripEditorSessionOpenMetadata(firstSession),
  stripEditorSessionOpenMetadata(reopenedSession),
  "Open-time and transient selection metadata must not create a hydration save.",
);

const firstTimeline = {
  schema_version: 1,
  updated_at: "2026-10-14T10:00:00.000Z",
  debug_origin: "first-load",
  debug_migration_hash: "hash-a",
  selected_clip_id: "clip-1",
  assets: [{ asset_id: "asset-1", updated_at: "2026-10-14T10:00:00.000Z" }],
  clips: [{ clip_id: "clip-1", asset_id: "asset-1", updated_at: "2026-10-14T10:00:00.000Z" }],
};
const reopenedTimeline = {
  ...firstTimeline,
  updated_at: "2026-10-14T11:00:00.000Z",
  debug_origin: "reopen",
  debug_migration_hash: "hash-b",
  selected_clip_id: null,
  assets: [{ asset_id: "asset-1", updated_at: "2026-10-14T11:00:00.000Z" }],
  clips: [{ clip_id: "clip-1", asset_id: "asset-1", updated_at: "2026-10-14T11:00:00.000Z" }],
};

assert.deepEqual(
  normalizeVisualTimelineForFingerprint(firstTimeline),
  normalizeVisualTimelineForFingerprint(reopenedTimeline),
  "Volatile visual hydration metadata must not create a hydration save.",
);

const firstFingerprint = buildHydrationNoopFingerprint({
  target,
  revisionId: "revision-1",
  request: {
    editor_session: { data: firstSession },
    visual_timeline: { data: firstTimeline },
    revision_transcript: { data: { transcript_id: "transcript-1" } },
  },
  persistenceRequest: { editorial_authority: undefined },
});
const reopenedFingerprint = buildHydrationNoopFingerprint({
  target,
  revisionId: "revision-1",
  request: {
    editor_session: { data: reopenedSession },
    visual_timeline: { data: reopenedTimeline },
    revision_transcript: { data: { transcript_id: "transcript-1" } },
  },
  persistenceRequest: { editorial_authority: undefined },
});
assert.equal(firstFingerprint, reopenedFingerprint);

const changedFingerprint = buildHydrationNoopFingerprint({
  target,
  revisionId: "revision-1",
  request: {
    editor_session: { data: reopenedSession },
    visual_timeline: { data: { ...reopenedTimeline, clips: [{ clip_id: "clip-2", asset_id: "asset-1" }] } },
    revision_transcript: { data: { transcript_id: "transcript-1" } },
  },
  persistenceRequest: { editorial_authority: undefined },
});
assert.notEqual(firstFingerprint, changedFingerprint, "A substantive visual edit must change the fingerprint.");

assert.notEqual(
  buildAutosavePayloadKey({
    target,
    revisionId: "revision-1",
    request: { revision_transcript: { data: { transcript_id: "transcript-1" } } },
    persistenceRequest: { active_session_id: "session-1" },
  }),
  buildAutosavePayloadKey({
    target,
    revisionId: "revision-1",
    request: { revision_transcript: { data: { transcript_id: "transcript-2" } } },
    persistenceRequest: { active_session_id: "session-1" },
  }),
  "A changed autosave payload must retain a distinct identity.",
);

console.log("Hammer workspace editor persistence fingerprint tests passed.");
