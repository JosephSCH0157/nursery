import assert from "node:assert/strict";
import { buildHammerRenderAssembly, projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { buildHammerReleasePrepPackage } from "../src/lib/hammerReleasePrepPackage";
import { buildHammerQuenchReleasePacket } from "../src/lib/hammerQuenchReleasePacket";
import {
  HAMMER_QUENCH_HANDOFF_PACKAGE_SAVED_MESSAGE,
  decideHammerQuenchHandoff,
  validateHammerQuenchPacketForHandoff,
} from "../src/editor/hammerQuenchHandoff";
import type { HammerReadinessGateResult } from "../src/editor/hammerReadinessGate";
import { buildHammerReadinessVerdict } from "../src/editor/hammerReadinessTypes";
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
  prepared_at: "2026-03-24T14:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_handoff",
    kind: "recording_audio",
    local_relpath: "recordings/episode.wav",
    cloud_uri: undefined,
    source_hint: "local",
    byte_size: undefined,
    duration_ms: 10_000,
    sha256: undefined,
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1"],
    raw_labels: ["S1"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_handoff",
    model: "gpt-4o-transcribe",
  },
  confidence_flags: [],
  segments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 5, speaker: "S1", text: "Hello world." }],
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
  return buildHammerReadinessVerdict({
    blockingReasons: status === "blocked" ? [{
      code: "export_posture_unavailable",
      label: "Blocked reason",
      severity: "blocking",
      source: "gate",
      operationId: null,
      operation_id: null,
    }] : [],
    reviewReasons: status === "needs_review" ? [{
      code: "export_posture_degraded",
      label: "Review reason",
      severity: "review",
      source: "gate",
      operationId: null,
      operation_id: null,
    }] : [],
  });
}

async function testDecisions() {
  assert.equal(HAMMER_QUENCH_HANDOFF_PACKAGE_SAVED_MESSAGE, "Release package saved.");
  const prep = buildReadyPrep();
  const allowed = decideHammerQuenchHandoff({ releasePrepPackage: prep, readinessGate: buildReadiness("ready") });
  assert.equal(allowed.status, "allowed");
  assert.deepEqual(allowed.reasonCodes, []);
  const review = decideHammerQuenchHandoff({ releasePrepPackage: prep, readinessGate: buildReadiness("needs_review") });
  assert.equal(review.status, "requires_confirmation");
  assert.equal(review.reasonCodes.includes("export_posture_degraded"), true);
  assert.equal(review.reasonDetails.some((reason) => reason.source === "gate"), true);
  const blocked = decideHammerQuenchHandoff({ releasePrepPackage: prep, readinessGate: buildReadiness("blocked") });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reasonCodes.includes("export_posture_unavailable"), true);
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
  const blockedByArtifact = decideHammerQuenchHandoff({ releasePrepPackage: incompletePrep, readinessGate: buildReadiness("ready") });
  assert.equal(blockedByArtifact.status, "blocked");
  assert.equal(blockedByArtifact.reasonCodes.includes("artifact_visuals_missing"), true);
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
  const finalAudioMaster = {
    workspace_id: "ws_handoff", workpiece_id: "wp_handoff", recording_revision_id: "recording-revision-handoff",
    composition_revision: 1, composition_fingerprint: "composition-handoff", render_job_id: "render-handoff",
    render_plan_fingerprint: "render-plan-handoff", renderer_version: "hammer-audio-master.v1",
    output_profile_id: "podcast-master-v1", acknowledged_result_fingerprint: "ack-handoff",
    canonical_asset_id: "audio-master-handoff", canonical_content_hash: "a".repeat(64),
    storage_bucket: "forge-workpieces", storage_key: "workpieces/wp_handoff/hammer/audio-master.wav",
    mime_type: "audio/wav", duration_ms: 5000, readiness: "ready" as const,
  };
  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    readinessGate: buildReadiness("ready"),
    preparedAt: "2026-03-24T14:01:00.000Z",
    canonicalGraph: graph,
    renderAssembly,
    finalAudioMaster,
  });
  assert.equal(validateHammerQuenchPacketForHandoff({
    releasePrepPackage: prep,
    packet,
    renderAssembly,
    readinessGate: buildReadiness("ready"),
  }).ok, true);
  const reviewReadiness = buildReadiness("needs_review");
  const reviewPacket = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    readinessGate: reviewReadiness,
    preparedAt: "2026-03-24T14:02:00.000Z",
    canonicalGraph: graph,
    renderAssembly,
    finalAudioMaster,
  });
  const reviewValidation = validateHammerQuenchPacketForHandoff({
    releasePrepPackage: prep,
    packet: reviewPacket,
    renderAssembly,
    readinessGate: reviewReadiness,
  });
  assert.equal(reviewPacket.manifest.readiness.status, "needs_review");
  assert.equal(reviewPacket.manifest.readiness.ready_for_quench, false);
  assert.equal(reviewValidation.ok, true);
  assert.equal(reviewValidation.reasonCodes.includes("handoff_needs_review"), true);
  assert.equal(reviewValidation.reasonDetails.every((reason) => reason.severity === "review"), true);
  const blockedValidation = validateHammerQuenchPacketForHandoff({
    releasePrepPackage: prep,
    packet,
    renderAssembly,
    readinessGate: buildReadiness("blocked"),
  });
  assert.equal(blockedValidation.ok, false);
  assert.equal(blockedValidation.reasonCodes.includes("handoff_blocked"), true);
  assert.equal(blockedValidation.reasonCodes.includes("export_posture_unavailable"), true);
  assert.equal(blockedValidation.reasonDetails.some((reason) => reason.source === "handoff"), true);
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
