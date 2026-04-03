import assert from "node:assert/strict";
import { buildHammerReleasePrepPackage } from "../src/lib/hammerReleasePrepPackage";
import { deriveHammerReleaseHandoffPosture } from "../src/lib/hammerReleaseHandoffPosture";
import { buildHammerReadinessVerdict } from "../src/editor/hammerReadinessTypes";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
} from "../src/persistence/hammerPersistenceContract";

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "tx_posture",
  media_id: "media_posture",
  media_signature: "sig_posture",
  source_media_ref: {
    media_id: "media_posture",
    kind: "recording_audio",
    local_relpath: "recordings/posture.wav",
    cloud_uri: null,
    source_hint: "local",
    mime_type: "audio/wav",
    byte_size: null,
    duration_ms: 12_000,
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
      source_transcript_id: "tx_posture",
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
      source_transcript_id: "tx_posture",
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
  source_refs: ["transcript:tx_posture"],
  uncertainty_flags: [],
  placements: [
    {
      placement_id: "placement_01",
      entry_id: "image-map-01",
      anchor_segment_id: "seg_01",
      matched_segment_ids: ["seg_01"],
      anchor_text: "Hello world.",
      asset_ref: "asset_posture_01",
      asset_id: "asset_posture_01",
      asset_path: "assets/posture.png",
      storage_key: "workpieces/wp_posture/assets/posture.png",
      label: "posture visual",
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
  source_artifact_paths: ["recordings/posture.wav"],
  settings_summary: {},
  analysis: null,
  audio_edit: null,
  source_media_id: "media_posture",
  source_media_signature: "sig_posture",
  processor_version: "forge-v1.2.0/audio-polish.v4",
  prepared_at: "2026-03-24T14:00:00.000Z",
  output_local_relpath: "hammer/prep/audio-polish/posture.wav",
  output_workpiece_path: "hammer/prep/audio-polish/posture.wav",
  output_mime_type: "audio/wav",
  output_duration_ms: 12_000,
  failure_code: null,
  failure_reason: null,
};

function buildGate(status: "ready" | "needs_review" | "blocked") {
  if (status === "ready") {
    return buildHammerReadinessVerdict({
      blockingReasons: [],
      reviewReasons: [],
    });
  }
  if (status === "blocked") {
    return buildHammerReadinessVerdict({
      blockingReasons: [{
        code: "export_posture_unavailable",
        label: "Export assembly is unavailable.",
        severity: "blocking",
        source: "gate",
        operationId: null,
        operation_id: null,
      }],
      reviewReasons: [],
    });
  }
  return buildHammerReadinessVerdict({
    blockingReasons: [],
    reviewReasons: [{
      code: "export_posture_degraded",
      label: "Export assembly is degraded and needs review.",
      severity: "review",
      source: "gate",
      operationId: null,
      operation_id: null,
    }],
  });
}

async function testArtifactReasonsAreCanonical() {
  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_posture",
    workpieceId: "wp_posture",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: null,
    audioPolish,
    editorSession: null,
  });
  const posture = deriveHammerReleaseHandoffPosture({
    releasePrepPackage: prep,
    readinessGate: buildGate("ready"),
  });

  assert.equal(posture.handoff_status, "blocked");
  assert.equal(posture.artifact_reason_codes.includes("artifact_visuals_missing"), true);
  assert.equal(posture.blocking_reason_codes.includes("artifact_visuals_missing"), true);
  assert.equal(posture.reason_details.some((reason) => reason.source === "artifact"), true);
  assert.equal(posture.artifact_reasons.includes("Visual placements are missing."), true);
}

async function testGateReviewSurvivesEnrichment() {
  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_posture",
    workpieceId: "wp_posture",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: visuals,
    audioPolish,
    editorSession: null,
  });
  const posture = deriveHammerReleaseHandoffPosture({
    releasePrepPackage: prep,
    readinessGate: buildGate("needs_review"),
  });

  assert.equal(posture.handoff_status, "needs_review");
  assert.equal(posture.review_reason_codes.includes("export_posture_degraded"), true);
  assert.equal(posture.reason_codes.includes("export_posture_degraded"), true);
  assert.equal(posture.reason_details.some((reason) => reason.source === "gate"), true);
  assert.equal(posture.review_reasons.includes("Export assembly is degraded and needs review."), true);
}

async function run() {
  await testArtifactReasonsAreCanonical();
  await testGateReviewSurvivesEnrichment();
  // eslint-disable-next-line no-console
  console.log("Hammer release handoff posture tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer release handoff posture tests failed:", error);
  process.exit(1);
});
