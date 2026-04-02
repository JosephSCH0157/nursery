import assert from "node:assert/strict";
import { buildHammerRenderAssembly, projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { buildHammerReleasePrepPackage } from "../src/lib/hammerReleasePrepPackage";
import { buildHammerQuenchReleasePacket } from "../src/lib/hammerQuenchReleasePacket";
import {
  decideHammerQuenchHandoff,
  validateHammerQuenchPacketForHandoff,
} from "../src/editor/hammerQuenchHandoff";
import type { HammerReadinessGateResult } from "../src/editor/hammerReadinessGate";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
} from "../src/persistence/hammerPersistenceContract";

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "tx_handoff",
  media_id: "media_handoff",
  media_signature: "sig_handoff",
  source_media_ref: {
    media_id: "media_handoff",
    kind: "recording_audio",
    local_relpath: "recordings/episode.wav",
    cloud_uri: null,
    source_hint: "local",
    mime_type: "audio/wav",
    byte_size: null,
    duration_ms: 10_000,
    sha256: null,
  },
  diarization: { labels: ["S1"], raw_labels: ["S1"], low_confidence_turn_ids: [] },
  confidence_flags: [],
  segments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 5, speaker: "S1", text: "Hello world." }],
  derived_text_layers: null,
  subtitle_outputs: {
    schema_version: 1,
    last_generated_format: "srt",
    srt: {
      format: "srt",
      generated_at: "2026-03-24T14:00:00.000Z",
      source_transcript_id: "tx_handoff",
      source_layer_id: null,
      source_kind: "raw",
      source_recipe_ref: null,
      approximate_timing: false,
      entry_count: 1,
      content: "1\n00:00:00,000 --> 00:00:05,000\nHello world.\n",
    },
    vtt: {
      format: "vtt",
      generated_at: "2026-03-24T14:00:00.000Z",
      source_transcript_id: "tx_handoff",
      source_layer_id: null,
      source_kind: "raw",
      source_recipe_ref: null,
      approximate_timing: false,
      entry_count: 1,
      content: "WEBVTT\n\n00:00.000 --> 00:05.000\nHello world.\n",
    },
  },
};

const visuals: HammerPersistedVisualPlacements = {
  schema_version: 1,
  status: "prepared",
  source_refs: ["transcript:tx_handoff"],
  uncertainty_flags: [],
  placements: [
    {
      placement_id: "placement_handoff_01",
      entry_id: "image-map-01",
      anchor_segment_id: "seg_01",
      matched_segment_ids: ["seg_01"],
      anchor_text: "Hello world.",
      asset_ref: "asset_handoff_01",
      asset_id: "asset_handoff_01",
      asset_path: "assets/handoff.png",
      storage_key: "workpieces/wp_handoff/assets/handoff.png",
      label: "handoff visual",
      visual_mode: "comparison",
      start_sec: 0,
      end_sec: 5,
      confidence: 0.9,
      timing_source: "transcript_match",
      status: "placed",
      uncertainty_flags: [],
    },
  ],
};

const audioPolish: HammerPersistedAudioPolish = {
  schema_version: 1,
  status: "prepared",
  prepared_passes: ["studio_sound"],
  source_artifact_paths: ["recordings/episode.wav"],
  settings_summary: {},
  analysis: null,
  audio_edit: null,
  source_media_id: "media_handoff",
  source_media_signature: "sig_handoff",
  processor_version: "forge-v1.2.0/audio-polish.v4",
  prepared_at: "2026-03-24T14:00:00.000Z",
  output_local_relpath: "hammer/prep/audio-polish/handoff.wav",
  output_workpiece_path: "hammer/prep/audio-polish/handoff.wav",
  output_mime_type: "audio/wav",
  output_duration_ms: 10_000,
  failure_code: null,
  failure_reason: null,
};

function buildReadyPrep() {
  return buildHammerReleasePrepPackage({
    workspaceId: "ws_handoff",
    workpieceId: "wp_handoff",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: visuals,
    audioPolish,
    editorSession: null,
  });
}

function buildReadiness(status: HammerReadinessGateResult["status"]): HammerReadinessGateResult {
  return {
    status,
    review_count: status === "needs_review" ? 1 : 0,
    blocker_count: status === "blocked" ? 1 : 0,
    blocking_reasons: status === "blocked" ? [{
      code: "blocked",
      label: "Blocked reason",
      severity: "blocking",
      operation_id: null,
    }] : [],
    review_reasons: status === "needs_review" ? [{
      code: "review",
      label: "Review reason",
      severity: "review",
      operation_id: null,
    }] : [],
    primary_operation_id: null,
  };
}

async function testDecisions() {
  const prep = buildReadyPrep();
  assert.equal(decideHammerQuenchHandoff({ releasePrepPackage: prep, readinessGate: buildReadiness("ready") }).status, "allowed");
  assert.equal(decideHammerQuenchHandoff({ releasePrepPackage: prep, readinessGate: buildReadiness("needs_review") }).status, "requires_confirmation");
  assert.equal(decideHammerQuenchHandoff({ releasePrepPackage: prep, readinessGate: buildReadiness("blocked") }).status, "blocked");
  const incompletePrep = buildHammerReleasePrepPackage({
    workspaceId: "ws_handoff",
    workpieceId: "wp_handoff",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: null,
    audioPolish: audioPolish,
    editorSession: null,
  });
  assert.equal(decideHammerQuenchHandoff({ releasePrepPackage: incompletePrep, readinessGate: buildReadiness("ready") }).status, "blocked");
}

async function testPacketValidation() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_handoff_01",
      version: "1",
      created_at: "2026-03-24T14:00:00.000Z",
      updated_at: "2026-03-24T14:00:00.000Z",
      source_transcript_id: "tx_handoff",
      preview_mode: "edit-aware",
      instructions: [],
    },
    workspaceId: "ws_handoff",
    workpieceId: "wp_handoff",
    sessionId: "session_handoff",
  });
  const renderAssembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: [],
      export_supported_operation_types: [],
      handoff_supported_operation_types: [],
    },
    transcriptSegments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 5 }],
    captionChunks: [{ chunk_id: "cap_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] }],
  });
  const prep = buildReadyPrep();
  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    readinessGate: buildReadiness("ready"),
    preparedAt: "2026-03-24T14:01:00.000Z",
    canonicalGraph: graph,
    renderAssembly,
  });
  assert.equal(validateHammerQuenchPacketForHandoff({
    releasePrepPackage: prep,
    packet,
    renderAssembly,
    readinessGate: buildReadiness("ready"),
  }).ok, true);
  assert.equal(validateHammerQuenchPacketForHandoff({
    releasePrepPackage: prep,
    packet,
    renderAssembly,
    readinessGate: buildReadiness("blocked"),
  }).ok, false);
}

async function run() {
  await testDecisions();
  await testPacketValidation();
  // eslint-disable-next-line no-console
  console.log("Hammer Quench handoff tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer Quench handoff tests failed:", error);
  process.exit(1);
});
