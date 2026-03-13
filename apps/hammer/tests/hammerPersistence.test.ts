import assert from "node:assert/strict";
import {
  buildHammerLaunchContextFromPersistence,
  buildHammerPersistenceSaveRequest,
  readHammerPersistenceTarget,
} from "../src/persistence/hammerPersistence";
import type { HammerWorkspaceSnapshot } from "../src/editor/hammerWorkspaceSnapshot";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";

const target = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workpieceId: "22222222-2222-4222-8222-222222222222",
};

const snapshot: HammerWorkspaceSnapshot = {
  workspaceId: target.workspaceId,
  workpieceId: target.workpieceId,
  sessionId: "session_hammer_01",
  sourceMode: "tongs",
  previewMode: "edit-aware",
  editPlanStatus: "dirty",
  editPlanSignature: "sig_abc",
  transcriptSourceId: "transcript_01",
  transcriptSegments: [
    {
      segment_id: "seg_001",
      start_sec: 0,
      end_sec: 4,
      speaker: "S1",
      text: "Line one.",
    },
    {
      segment_id: "seg_002",
      start_sec: 4,
      end_sec: 8,
      speaker: "G1",
      text: "Line two.",
    },
  ],
  selectedSegmentId: "seg_001",
  selectedOverlayRowId: "row_001",
  mediaRef: {
    media_id: "media_01",
    kind: "recording_video",
    source_hint: "local",
    local_relpath: "recordings/episode-1.mp4",
  },
  workspaceMapping: {
    workspace_id: target.workspaceId,
    local_root_abs: "D:\\ForgeMedia\\workspace",
  },
  mediaSourceLabel: "tongs:media_01",
  editPlan: {
    edit_plan_id: "plan_01",
    version: "1",
    created_at: "2026-03-13T10:00:00.000Z",
    updated_at: "2026-03-13T10:05:00.000Z",
    source_transcript_id: "transcript_01",
    preview_mode: "edit-aware",
    instructions: [],
  },
  studioSoundPrepared: true,
  noiseCleanupPrepared: false,
  levelConsistencyPrepared: true,
};

const saveRequest = buildHammerPersistenceSaveRequest(snapshot);
assert.equal(saveRequest.active_session_id, "session_hammer_01");
assert.equal(saveRequest.edit_plan_signature, "sig_abc");
assert.deepEqual(
  saveRequest.speaker_map?.data.default_labels,
  ["S1", "S2", "S3", "G1", "G2"],
);
assert.deepEqual(
  saveRequest.speaker_map?.data.mappings.map((entry) => entry.speaker_label),
  ["S1", "G1"],
);
assert.deepEqual(
  saveRequest.audio_polish?.data.prepared_passes,
  ["studio_sound", "level_consistency"],
);

const persistedSnapshot: HammerPersistenceSnapshot = {
  schema_version: 1,
  state: {
    workspace_id: target.workspaceId,
    workpiece_id: target.workpieceId,
    active_session_id: "session_hammer_01",
    editor_session_path: "hammer/session/editor-state.v1.json",
    transcript_artifact_path: "hammer/transcript/structured.v1.json",
    speaker_map_artifact_path: "hammer/transcript/speaker-map.v1.json",
    visual_placement_artifact_path: "hammer/prep/visual-placements.v1.json",
    audio_polish_artifact_path: "hammer/prep/audio-polish.v1.json",
    edit_plan_artifact_path: "hammer/edit-plan/current.v1.json",
    edit_plan_signature: "sig_abc",
    prep_status: "prepared",
    alignment_status: "aligned",
    macro_recipe_ref: null,
    last_macro_run_ref: null,
    last_opened_at: "2026-03-13T10:10:00.000Z",
    updated_at: "2026-03-13T10:10:05.000Z",
    updated_by: "33333333-3333-4333-8333-333333333333",
  },
  editor_session: {
    path: "hammer/session/editor-state.v1.json",
    updated_at: "2026-03-13T10:10:01.000Z",
    data: saveRequest.editor_session?.data ?? null,
  },
  structured_transcript: {
    path: "hammer/transcript/structured.v1.json",
    updated_at: "2026-03-13T10:10:02.000Z",
    data: saveRequest.structured_transcript?.data ?? null,
  },
  speaker_map: {
    path: "hammer/transcript/speaker-map.v1.json",
    updated_at: "2026-03-13T10:10:03.000Z",
    data: saveRequest.speaker_map?.data ?? null,
  },
  visual_placements: {
    path: "hammer/prep/visual-placements.v1.json",
    updated_at: "2026-03-13T10:10:04.000Z",
    data: saveRequest.visual_placements?.data ?? null,
  },
  audio_polish: {
    path: "hammer/prep/audio-polish.v1.json",
    updated_at: "2026-03-13T10:10:05.000Z",
    data: saveRequest.audio_polish?.data ?? null,
  },
  edit_plan: {
    path: "hammer/edit-plan/current.v1.json",
    updated_at: "2026-03-13T10:10:06.000Z",
    data: saveRequest.edit_plan?.data ?? null,
  },
  macro_hooks: {
    recipe_ref: null,
    last_run_ref: null,
  },
};

const hydrated = buildHammerLaunchContextFromPersistence(target, persistedSnapshot);
assert.ok(hydrated);
assert.equal(hydrated?.source, "persistence");
assert.equal(hydrated?.launchContext.session_id, "session_hammer_01");
assert.equal(hydrated?.launchContext.transcript.kind, "tongs-stub");
assert.equal(hydrated?.launchContext.media.kind, "tongs-stub");
assert.equal(hydrated?.launchContext.edit_plan?.edit_plan_id, "plan_01");

assert.deepEqual(
  readHammerPersistenceTarget("?workspace_id=aaa&workpiece_id=bbb"),
  { workspaceId: "aaa", workpieceId: "bbb" },
);
