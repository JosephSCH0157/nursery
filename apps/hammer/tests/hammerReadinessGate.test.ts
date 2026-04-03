import assert from "node:assert/strict";
import { projectEditorialAuthorityGraphFromEditPlan, buildHammerRenderAssembly } from "../src/editor/hammerRenderAssembly";
import { evaluateHammerReadinessGate } from "../src/editor/hammerReadinessGate";

function buildGraphWithInstructions(instructions: Array<Record<string, unknown>>) {
  return projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_readiness_01",
      version: "1",
      created_at: "2026-03-24T13:00:00.000Z",
      updated_at: "2026-03-24T13:00:00.000Z",
      source_transcript_id: "tx_readiness_01",
      preview_mode: "edit-aware",
      instructions: instructions as any,
    },
    workspaceId: "ws_readiness",
    workpieceId: "wp_readiness",
    sessionId: "session_readiness",
  });
}

async function testReadyState() {
  const graph = buildGraphWithInstructions([]);
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: [],
      export_supported_operation_types: [],
      handoff_supported_operation_types: [],
    },
    transcriptSegments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 10 }],
    captionChunks: [{ chunk_id: "cap_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] }],
  });
  const gate = evaluateHammerReadinessGate({
    renderAssembly: assembly,
    canonicalGraph: graph,
    boundAttentionQueue: [],
    unresolvedBrollSuggestionOperationIds: [],
  });
  assert.equal(gate.status, "ready");
  assert.equal(gate.readyForQuench, true);
  assert.equal(gate.review_count, 0);
  assert.equal(gate.blocker_count, 0);
  assert.equal(gate.counts.review, 0);
  assert.equal(gate.counts.blocking, 0);
  assert.deepEqual(gate.reasons, []);
}

async function testNeedsReviewState() {
  const graph = buildGraphWithInstructions([
    {
      instruction_id: "ins_suggestion_01",
      segment_id: "seg_01",
      type: "insert_broll",
      asset_ref: "unresolved:hearth-01",
      start_sec: 1,
      end_sec: 3,
      intent_source: "hearth_suggestion",
      intent_ref: "hearth-01",
      intent_description: "cutaway",
      asset_binding_state: "unresolved",
      created_at: "2026-03-24T13:00:00.000Z",
    },
  ]);
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["insert_broll"],
      export_supported_operation_types: ["insert_broll"],
      handoff_supported_operation_types: ["insert_broll"],
    },
    transcriptSegments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 10 }],
    captionChunks: [{ chunk_id: "cap_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] }],
  });
  const gate = evaluateHammerReadinessGate({
    renderAssembly: assembly,
    canonicalGraph: graph,
    boundAttentionQueue: [{
      object_id: "op:ins_suggestion_01",
      object_type: "broll",
      priority: "medium",
      reasons: ["awaiting_resolution"],
      label: "cutaway",
    }],
    unresolvedBrollSuggestionOperationIds: ["op:ins_suggestion_01"],
  });
  assert.equal(gate.status, "needs_review");
  assert.equal(gate.readyForQuench, false);
  assert.equal(gate.review_count > 0, true);
  assert.equal(gate.counts.review > 0, true);
  assert.equal(gate.reviewReasons.length > 0, true);
  assert.equal(gate.reasons.some((reason) => reason.code === "unresolved_broll_intent"), true);
  assert.equal(gate.reasons.some((reason) => reason.code === "bound_attention_video"), true);
}

async function testBlockedState() {
  const graph = buildGraphWithInstructions([
    {
      instruction_id: "ins_master_01",
      segment_id: "seg_01",
      type: "podcast_master_pass",
      preset: "podcast_master_v1",
      noise_cleanup: "light",
      normalization_lufs: -16,
      compression_amount: "medium",
      limiter_ceiling_dbtp: -1,
      created_at: "2026-03-24T13:00:00.000Z",
    },
  ]);
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: [],
      export_supported_operation_types: [],
      handoff_supported_operation_types: ["podcast_master_pass"],
      podcast_master: {
        available: false,
        preview_supported: false,
        stages: {
          normalize: false,
          compress: false,
          limit: false,
          noise_cleanup_light: false,
        },
      },
    },
    transcriptSegments: [{ segment_id: "seg_01", start_sec: 0, end_sec: 10 }],
    captionChunks: [{ chunk_id: "cap_01", start_sec: 0, end_sec: 1, segment_ids: ["seg_01"] }],
  });
  const gate = evaluateHammerReadinessGate({
    renderAssembly: assembly,
    canonicalGraph: graph,
    boundAttentionQueue: [],
    unresolvedBrollSuggestionOperationIds: [],
  });
  assert.equal(gate.status, "blocked");
  assert.equal(gate.readyForQuench, false);
  assert.equal(gate.blocker_count > 0, true);
  assert.equal(gate.counts.blocking > 0, true);
  assert.equal(gate.blockingReasons.some((reason) => reason.code === "podcast_master_unavailable"), true);
  assert.equal(gate.primaryOperationId, gate.primary_operation_id);
}

async function run() {
  await testReadyState();
  await testNeedsReviewState();
  await testBlockedState();
  // eslint-disable-next-line no-console
  console.log("Hammer readiness gate tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer readiness gate tests failed:", error);
  process.exit(1);
});
