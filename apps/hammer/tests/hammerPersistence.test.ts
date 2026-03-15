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
  selectedMacroRecipeRef: "macro:podcast_cleanup.v1",
  lastMacroRunRef: null,
  structuredTranscript: {
    schema_version: 1,
    transcript_id: "transcript_01",
    media_id: "media_01",
    media_signature: "media_sig_01",
    prepared_at: "2026-03-13T10:00:00.000Z",
    structure: "speaker_turns",
    source_media_ref: {
      media_id: "media_01",
      kind: "recording_video",
      source_hint: "local",
      local_relpath: "recordings/episode-1.mp4",
    },
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: ["S1", "G1"],
      raw_labels: ["host", "guest"],
      version: "gpt-4o-transcribe",
      provider: "openai",
      provider_request_id: "req_01",
      model: "gpt-4o-transcribe",
    },
    confidence_flags: [],
    segments: [
      {
        segment_id: "seg_001",
        start_sec: 0,
        end_sec: 4,
        speaker: "S1",
        text: "Um line one.",
      },
      {
        segment_id: "seg_002",
        start_sec: 4,
        end_sec: 8,
        speaker: "G1",
        text: "Line two.",
      },
    ],
    derived_text_layers: {
      schema_version: 1,
      active_layer_id: null,
      layers: [
        {
          layer_id: "macro_run_01",
          recipe_ref: "macro:podcast_cleanup.v1",
          macro_kind: "filler_cleanup",
          status: "review",
          created_at: "2026-03-13T10:12:00.000Z",
          based_on_transcript_id: "transcript_01",
          summary: {
            changed_segment_count: 1,
            removal_count: 1,
            untouched_segment_count: 1,
          },
          changes: [
            {
              segment_id: "seg_001",
              original_text: "Um line one.",
              cleaned_text: "line one.",
              removed_fillers: [
                {
                  value: "Um",
                  start: 0,
                  end: 3,
                },
              ],
            },
          ],
        },
      ],
    },
  },
  editPlan: {
    edit_plan_id: "plan_01",
    version: "1",
    created_at: "2026-03-13T10:00:00.000Z",
    updated_at: "2026-03-13T10:05:00.000Z",
    source_transcript_id: "transcript_01",
    preview_mode: "edit-aware",
    instructions: [],
  },
  visualPlacements: {
    schema_version: 1,
    status: "prepared",
    source_refs: [
      "transcript:transcript_01",
      "script:2026-03-13T10:00:00.000Z",
      "image-map:2026-03-13T10:05:00.000Z",
    ],
    uncertainty_flags: ["match_missing:image-map-02"],
    placements: [
      {
        placement_id: "placement_image-map-01",
        entry_id: "image-map-01",
        anchor_segment_id: "seg_001",
        matched_segment_ids: ["seg_001"],
        anchor_text: "Line one.",
        asset_ref: "asset_01",
        asset_id: "asset_01",
        asset_path: "assets/image-map/candidates/example.png",
        storage_key: "workpieces/example/assets/image-map/candidates/example.png",
        label: "explainer",
        visual_mode: "comparison",
        start_sec: 0,
        end_sec: 4,
        confidence: 0.91,
        timing_source: "transcript_match",
        status: "placed",
        uncertainty_flags: [],
      },
    ],
  },
  audioPolish: {
    schema_version: 1,
    status: "prepared",
    prepared_passes: ["studio_sound", "level_consistency"],
    source_artifact_paths: ["recordings/episode-1.wav"],
    settings_summary: {
      supported_source: true,
      source_extension: ".wav",
    },
    source_media_id: "media_01",
    source_media_signature: "media_sig_01",
    processor_version: "forge-v1.2.0/audio-polish.v1",
    prepared_at: "2026-03-13T10:10:05.000Z",
    output_local_relpath: "hammer/prep/audio-polish/episode-1--abcd1234.wav",
    output_mime_type: "audio/wav",
    output_duration_ms: 8_000,
    failure_code: null,
    failure_reason: null,
  },
};

const saveRequest = buildHammerPersistenceSaveRequest(snapshot);
assert.equal(saveRequest.active_session_id, "session_hammer_01");
assert.equal(saveRequest.edit_plan_signature, "sig_abc");
assert.equal(saveRequest.macro_recipe_ref, "macro:podcast_cleanup.v1");
assert.equal(saveRequest.last_macro_run_ref, null);
assert.equal(saveRequest.structured_transcript?.data.derived_text_layers?.layers[0]?.layer_id, "macro_run_01");
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
assert.equal(
  saveRequest.audio_polish?.data.output_local_relpath,
  "hammer/prep/audio-polish/episode-1--abcd1234.wav",
);
assert.equal(saveRequest.visual_placements?.data.placements[0]?.asset_ref, "asset_01");
assert.deepEqual(
  saveRequest.visual_placements?.data.uncertainty_flags,
  ["match_missing:image-map-02"],
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
    macro_recipe_ref: "macro:podcast_cleanup.v1",
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
    recipe_ref: "macro:podcast_cleanup.v1",
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
