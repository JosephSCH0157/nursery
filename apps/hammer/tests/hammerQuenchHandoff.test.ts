import assert from "node:assert/strict";
import { buildHammerRenderAssembly, projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { buildHammerReleasePrepPackage } from "../src/lib/hammerReleasePrepPackage";
import { buildHammerQuenchReleasePacket } from "../src/lib/hammerQuenchReleasePacket";
import {
  decideHammerQuenchHandoff,
  validateHammerQuenchPacketForHandoff,
} from "../src/editor/hammerQuenchHandoff";
import type { HammerReadinessGateResult } from "../src/editor/hammerReadinessGate";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";

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
  subtitle_outputs: null,
};

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
  assert.equal(decideHammerQuenchHandoff({ readinessGate: buildReadiness("ready") }).status, "allowed");
  assert.equal(decideHammerQuenchHandoff({ readinessGate: buildReadiness("needs_review") }).status, "requires_confirmation");
  assert.equal(decideHammerQuenchHandoff({ readinessGate: buildReadiness("blocked") }).status, "blocked");
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
  const prep = buildHammerReleasePrepPackage({
    workspaceId: "ws_handoff",
    workpieceId: "wp_handoff",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: null,
    audioPolish: null,
    editorSession: null,
  });
  const packet = buildHammerQuenchReleasePacket({
    releasePrepPackage: prep,
    preparedAt: "2026-03-24T14:01:00.000Z",
    canonicalGraph: graph,
    renderAssembly,
  });
  assert.equal(validateHammerQuenchPacketForHandoff({
    packet,
    renderAssembly,
    readinessGate: buildReadiness("ready"),
  }).ok, true);
  assert.equal(validateHammerQuenchPacketForHandoff({
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
