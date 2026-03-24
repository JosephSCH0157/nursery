import assert from "node:assert/strict";
import type { HammerLaunchContext } from "../../../packages/contracts/hammer/launch-context.contract";
import { buildHammerPersistenceSaveRequest } from "../src/persistence/hammerPersistence";
import type { HammerWorkspaceSnapshot } from "../src/editor/hammerWorkspaceSnapshot";
import {
  buildHammerPrepOverlayViewModel,
  buildHammerPrepPersistenceSaveRequest,
  buildPreparedTranscript,
  createHammerPrepState,
  resolveHammerPrepOpenDecision,
  resolveHammerPrepSource,
} from "../src/prep/hammerPrep";

function buildLaunchContext(withWorkspaceMapping = true): HammerLaunchContext {
  return {
    workspace_id: "11111111-1111-4111-8111-111111111111",
    workpiece_id: "22222222-2222-4222-8222-222222222222",
    session_id: "session_hammer_prep",
    source_mode: "tongs",
    transcript: {
      kind: "tongs-stub",
      transcript_id: "transcript_seed",
      segments: [],
      label: "seed",
    },
    media: {
      kind: "tongs-stub",
      ref: {
        media_id: "media_01",
        kind: "recording_video",
        local_relpath: "recordings/episode-1.mp4",
        duration_ms: 67_000,
        byte_size: 4_500_000,
        sha256: "sha_episode_1",
      },
      ...(withWorkspaceMapping
        ? {
          workspace_mapping: {
            workspace_id: "11111111-1111-4111-8111-111111111111",
            local_root_abs: "D:\\ForgeMedia\\workspace",
          },
        }
        : {}),
      label: "tongs:media_01",
    },
    preview_mode: "edit-aware",
  };
}

function buildWorkspaceSnapshot(): HammerWorkspaceSnapshot {
  return {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workpieceId: "22222222-2222-4222-8222-222222222222",
    sessionId: "session_hammer_prep",
    sourceMode: "tongs",
    previewMode: "edit-aware",
    editPlanStatus: "dirty",
    editPlanSignature: "sig_abc",
    transcriptSourceId: "hammer_transcript_prepared",
    transcriptSegments: [
      {
        segment_id: "turn_001",
        start_sec: 0,
        end_sec: 2.2,
        speaker: "S1",
        text: "Hello world",
      },
      {
        segment_id: "turn_002",
        start_sec: 2.2,
        end_sec: 4.1,
        speaker: "G1",
        text: "Guest answer",
      },
    ],
    selectedSegmentId: "turn_001",
    selectedOverlayRowId: "turn_001",
    mediaRef: {
      media_id: "media_01",
      kind: "recording_video",
      local_relpath: "recordings/episode-1.mp4",
      duration_ms: 67_000,
      byte_size: 4_500_000,
      sha256: "sha_episode_1",
    },
    workspaceMapping: {
      workspace_id: "11111111-1111-4111-8111-111111111111",
      local_root_abs: "D:\\ForgeMedia\\workspace",
    },
    mediaSourceLabel: "tongs:media_01",
    editPlan: {
      edit_plan_id: "plan_01",
      version: "1",
      created_at: "2026-03-14T09:00:00.000Z",
      updated_at: "2026-03-14T09:05:00.000Z",
      source_transcript_id: "hammer_transcript_prepared",
      preview_mode: "edit-aware",
      instructions: [],
    },
    visualPlacements: null,
    audioPolish: null,
  };
}

const persistedPreparedSnapshot = {
  schema_version: 1 as const,
  state: {
    workspace_id: "11111111-1111-4111-8111-111111111111",
    workpiece_id: "22222222-2222-4222-8222-222222222222",
    active_session_id: "session_hammer_prep",
    editor_session_path: "hammer/session/editor-state.v1.json",
    transcript_artifact_path: "hammer/transcript/structured.v1.json",
    speaker_map_artifact_path: "hammer/transcript/speaker-map.v1.json",
    visual_placement_artifact_path: null,
    audio_polish_artifact_path: null,
    edit_plan_artifact_path: null,
    editorial_authority_artifact_path: null,
    edit_plan_signature: null,
    prep_status: "prepared" as const,
    alignment_status: "aligned" as const,
    macro_recipe_ref: null,
    last_macro_run_ref: null,
    last_opened_at: "2026-03-14T09:30:00.000Z",
    updated_at: "2026-03-14T09:30:05.000Z",
    updated_by: "33333333-3333-4333-8333-333333333333",
  },
  editor_session: {
    path: "hammer/session/editor-state.v1.json",
    updated_at: "2026-03-14T09:30:01.000Z",
    data: {
      schema_version: 1 as const,
      session_id: "session_hammer_prep",
      source_mode: "tongs" as const,
      preview_mode: "edit-aware" as const,
      transcript_source_id: "hammer_transcript_prepared",
      selected_segment_id: "turn_001",
      selected_overlay_row_id: "turn_001",
      media_ref: {
        media_id: "media_01",
        kind: "recording_video" as const,
        local_relpath: "recordings/episode-1.mp4",
        duration_ms: 67_000,
        byte_size: 4_500_000,
        sha256: "sha_episode_1",
      },
      workspace_mapping: {
        workspace_id: "11111111-1111-4111-8111-111111111111",
        local_root_abs: "D:\\ForgeMedia\\workspace",
      },
      media_source_label: "tongs:media_01",
      last_opened_at: "2026-03-14T09:30:00.000Z",
    },
  },
  structured_transcript: {
    path: "hammer/transcript/structured.v1.json",
    updated_at: "2026-03-14T09:30:02.000Z",
    data: {
      schema_version: 1 as const,
      transcript_id: "hammer_transcript_prepared",
      media_id: "media_01",
      media_signature: "media_01|recording_video|recordings/episode-1.mp4||4500000|67000|sha_episode_1",
      prepared_at: "2026-03-14T09:30:02.000Z",
      structure: "speaker_turns" as const,
      source_media_ref: {
        media_id: "media_01",
        kind: "recording_video" as const,
        local_relpath: "recordings/episode-1.mp4",
        duration_ms: 67_000,
        byte_size: 4_500_000,
        sha256: "sha_episode_1",
      },
      diarization: {
        label_scheme: "forge-neutral-speakers.v1" as const,
        labels: ["S1", "G1"],
        raw_labels: ["A", "B"],
        version: "gpt-4o-transcribe-diarize",
        provider: "openai" as const,
        provider_request_id: "req_123",
        model: "gpt-4o-transcribe-diarize",
      },
      confidence_flags: [],
      segments: [
        {
          segment_id: "turn_001",
          start_sec: 0,
          end_sec: 2.2,
          speaker: "S1",
          text: "Hello world",
        },
        {
          segment_id: "turn_002",
          start_sec: 2.2,
          end_sec: 4.1,
          speaker: "G1",
          text: "Guest answer",
        },
      ],
    },
  },
  speaker_map: {
    path: "hammer/transcript/speaker-map.v1.json",
    updated_at: "2026-03-14T09:30:03.000Z",
    data: {
      schema_version: 1 as const,
      default_labels: ["S1", "S2", "S3", "G1", "G2"],
      mappings: [],
    },
  },
  visual_placements: {
    path: null,
    updated_at: null,
    data: null,
  },
  audio_polish: {
    path: null,
    updated_at: null,
    data: null,
  },
  edit_plan: {
    path: null,
    updated_at: null,
    data: null,
  },
  editorial_authority: {
    path: null,
    updated_at: null,
    data: null,
  },
  macro_hooks: {
    recipe_ref: null,
    last_run_ref: null,
  },
};

function testOpenDecisionPreparesWhenTranscriptMissing() {
  const decision = resolveHammerPrepOpenDecision(buildLaunchContext(), null);

  assert.equal(decision.action, "prepare");
  assert.equal(decision.state.status, "preparing");
  assert.equal(decision.state.step, "transcribing_audio");
}

function testOpenDecisionPreparesFromCanonicalWorkpieceMediaWithoutLocalMapping() {
  const launchContext = buildLaunchContext(false);
  const decision = resolveHammerPrepOpenDecision(launchContext, null);
  const prepSource = resolveHammerPrepSource(launchContext);

  assert.equal(decision.action, "prepare");
  assert.equal(decision.state.status, "preparing");
  assert.equal(decision.state.step, "transcribing_audio");
  assert.equal(prepSource?.source_kind, "canonical_workpiece_media");
  assert.equal(prepSource?.canonical_workpiece_path, "recordings/episode-1.mp4");
  assert.equal(prepSource?.local_root_abs, null);
}

function testOpenDecisionReusesPreparedTranscript() {
  const decision = resolveHammerPrepOpenDecision(buildLaunchContext(), persistedPreparedSnapshot);

  assert.equal(decision.action, "reuse");
  assert.equal(decision.state.status, "prepared");
}

function testPreparedTranscriptUsesNeutralForgeTagsAndSpeakerTurns() {
  const preparedTranscript = buildPreparedTranscript(buildLaunchContext(), {
    provider: "openai",
    model: "gpt-4o-transcribe-diarize",
    provider_request_id: "req_456",
    text: "Hello world Guest answer Third Fourth Fifth Sixth",
    segments: [
      { id: "a1", start: 0, end: 1, text: "Hello", speaker: "A" },
      { id: "a2", start: 1, end: 2.2, text: "world", speaker: "A" },
      { id: "b1", start: 2.2, end: 4.1, text: "Guest answer", speaker: "B" },
      { id: "c1", start: 4.1, end: 5.1, text: "Third", speaker: "C" },
      { id: "d1", start: 5.1, end: 6.1, text: "Fourth", speaker: "D" },
      { id: "e1", start: 6.1, end: 7.1, text: "Fifth", speaker: "E" },
      { id: "f1", start: 7.1, end: 8.1, text: "Sixth", speaker: "F" },
    ],
  });

  assert.deepEqual(
    preparedTranscript.turns.map((turn) => ({ speaker: turn.speaker, text: turn.text })),
    [
      { speaker: "S1", text: "Hello world" },
      { speaker: "S2", text: "Guest answer" },
      { speaker: "S3", text: "Third" },
      { speaker: "G1", text: "Fourth" },
      { speaker: "G2", text: "Fifth" },
      { speaker: "G3", text: "Sixth" },
    ],
  );
  assert.equal(preparedTranscript.structuredTranscript.structure, "speaker_turns");
  assert.deepEqual(
    preparedTranscript.structuredTranscript.diarization.labels,
    ["S1", "S2", "S3", "G1", "G2", "G3"],
  );
}

function testOverlayViewModelTracksPrepStages() {
  const transcribing = buildHammerPrepOverlayViewModel(createHammerPrepState("preparing", "transcribing_audio"));
  const finalizing = buildHammerPrepOverlayViewModel(createHammerPrepState("preparing", "finalizing_transcript"));
  const prepared = buildHammerPrepOverlayViewModel(createHammerPrepState("prepared", "ready_for_next_step"));
  const polishing = buildHammerPrepOverlayViewModel(createHammerPrepState("preparing", "polishing_audio"));

  assert.equal(transcribing.visible, true);
  assert.equal(transcribing.message, "Listening to the recording…");
  assert.equal(finalizing.message, "Finalizing transcript…");
  assert.equal(polishing.message, "Cleaning audio for studio clarity…");
  assert.equal(polishing.step_count, 7);
  assert.equal(prepared.visible, false);
}

function testPrepPersistenceSeedWritesPreparedTranscript() {
  const preparedTranscript = buildPreparedTranscript(buildLaunchContext(), {
    provider: "openai",
    model: "gpt-4o-transcribe-diarize",
    provider_request_id: "req_789",
    text: "Hello world",
    segments: [
      { id: "a1", start: 0, end: 1, text: "Hello", speaker: "A" },
      { id: "a2", start: 1, end: 2, text: "world", speaker: "A" },
    ],
  });

  const saveRequest = buildHammerPrepPersistenceSaveRequest({
    launchContext: buildLaunchContext(),
    status: "prepared",
    preparedTranscript,
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:hammer_transcript_prepared"],
      uncertainty_flags: [],
      placements: [
        {
          placement_id: "placement_image-map-01",
          entry_id: "image-map-01",
          anchor_segment_id: "turn_001",
          matched_segment_ids: ["turn_001"],
          anchor_text: "Hello world",
          asset_ref: "asset_01",
          asset_id: "asset_01",
          asset_path: "assets/image-map/candidates/example.png",
          storage_key: "workpieces/example/assets/image-map/candidates/example.png",
          label: "explainer",
          visual_mode: "comparison",
          start_sec: 0,
          end_sec: 2,
          confidence: 0.98,
          timing_source: "transcript_match",
          status: "placed",
          uncertainty_flags: [],
        },
      ],
    },
  });

  assert.equal(saveRequest.prep_status, "prepared");
  assert.equal(saveRequest.editor_session?.data.transcript_source_id, preparedTranscript.transcriptId);
  assert.equal(
    saveRequest.structured_transcript?.data.diarization.provider_request_id,
    "req_789",
  );
  assert.equal(saveRequest.visual_placements?.data.placements.length, 1);
}

function testPrepPersistenceSeedWritesAudioPolishArtifact() {
  const saveRequest = buildHammerPrepPersistenceSaveRequest({
    launchContext: buildLaunchContext(),
    status: "prepared",
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound", "noise_cleanup", "level_consistency"],
      source_artifact_paths: ["recordings/episode-1.wav"],
      settings_summary: {
        supported_source: true,
        source_extension: ".wav",
      },
      source_media_id: "media_01",
      source_media_signature: "media_sig_01",
      processor_version: "forge-v1.2.0/audio-polish.v1",
      prepared_at: "2026-03-14T09:45:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/workpiece/episode-1.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 67_000,
      failure_code: null,
      failure_reason: null,
    },
  });

  assert.equal(saveRequest.audio_polish?.data.status, "prepared");
  assert.equal(saveRequest.audio_polish?.data.output_local_relpath, "hammer/prep/audio-polish/workpiece/episode-1.wav");
}

function testWorkspaceSavePreservesTranscriptMetadata() {
  const saveRequest = buildHammerPersistenceSaveRequest(
    buildWorkspaceSnapshot(),
    persistedPreparedSnapshot.structured_transcript.data,
  );

  assert.equal(
    saveRequest.structured_transcript?.data.diarization.provider_request_id,
    "req_123",
  );
  assert.equal(
    saveRequest.structured_transcript?.data.media_signature,
    "media_01|recording_video|recordings/episode-1.mp4||4500000|67000|sha_episode_1",
  );
  assert.equal(
    saveRequest.structured_transcript?.data.prepared_at,
    "2026-03-14T09:30:02.000Z",
  );
}

try {
  testOpenDecisionPreparesWhenTranscriptMissing();
  testOpenDecisionPreparesFromCanonicalWorkpieceMediaWithoutLocalMapping();
  testOpenDecisionReusesPreparedTranscript();
  testPreparedTranscriptUsesNeutralForgeTagsAndSpeakerTurns();
  testOverlayViewModelTracksPrepStages();
  testPrepPersistenceSeedWritesPreparedTranscript();
  testPrepPersistenceSeedWritesAudioPolishArtifact();
  testWorkspaceSavePreservesTranscriptMetadata();
  console.log("Hammer prep tests passed.");
} catch (error) {
  console.error("Hammer prep tests failed:", error);
  process.exitCode = 1;
}
