import assert from "node:assert/strict";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { resolveBaselineAuthorityGraph } from "../src/editor/hammerWorkspaceShellHistoryController";
import type { HammerEditPlan } from "../../../packages/contracts/hammer/edit-plan.contract";

function buildPlan(id: string): HammerEditPlan {
  return {
    edit_plan_id: id,
    version: "1",
    created_at: "2026-04-17T12:00:00.000Z",
    updated_at: "2026-04-17T12:00:00.000Z",
    source_transcript_id: "tx_reason_preservation",
    preview_mode: "edit-aware",
    instructions: [
      {
        instruction_id: `${id}:ins_01`,
        segment_id: "seg_01",
        type: "insert_broll",
        asset_ref: "assets/broll.png",
        start_sec: 1,
        end_sec: 3,
        asset_binding_state: "resolved",
        created_at: "2026-04-17T12:00:00.000Z",
      },
    ],
  };
}

async function testPersistedAuthorityGraphWinsOverProjectionFallback() {
  const projected = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: buildPlan("plan_projected"),
    workspaceId: "ws_reason",
    workpieceId: "wp_reason",
    sessionId: "session_reason",
  });
  const persisted = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: buildPlan("plan_persisted"),
    workspaceId: "ws_reason",
    workpieceId: "wp_reason",
    sessionId: "session_reason",
  });
  persisted.graph_version = 9;
  persisted.operations[0] = {
    ...persisted.operations[0],
    lifecycle: "superseded",
    capability_state: {
      ...persisted.operations[0].capability_state,
      capability: "degraded",
      reason_codes: ["operation_conflict", "runtime_partial_capability"],
    },
    truth_posture: {
      preview: {
        ...persisted.operations[0].truth_posture.preview,
        posture: "degraded",
        capability: "degraded",
        reason_codes: ["operation_conflict"],
      },
      export: {
        ...persisted.operations[0].truth_posture.export,
        posture: "degraded",
        capability: "degraded",
        reason_codes: ["runtime_partial_capability"],
      },
      handoff: {
        ...persisted.operations[0].truth_posture.handoff,
        posture: "degraded",
        capability: "degraded",
        reason_codes: ["handoff_deferred"],
      },
    },
  };

  const baseline = resolveBaselineAuthorityGraph({
    persistedEditorialAuthorityGraph: persisted,
    projectedAuthorityGraph: projected,
  });

  assert.equal(baseline.graph_id, persisted.graph_id);
  assert.equal(baseline.graph_version, 9);
  assert.equal(baseline.operations[0]?.lifecycle, "superseded");
  assert.equal(baseline.operations[0]?.capability_state.reason_codes.includes("operation_conflict"), true);
  assert.equal(baseline.operations[0]?.capability_state.reason_codes.includes("runtime_partial_capability"), true);
  assert.notEqual(baseline, persisted);

  baseline.operations[0]!.capability_state.reason_codes.push("operation_not_implemented");
  assert.equal(
    persisted.operations[0]?.capability_state.reason_codes.includes("operation_not_implemented"),
    false,
  );
}

async function testProjectedAuthorityGraphUsedWhenPersistedGraphMissing() {
  const projected = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: buildPlan("plan_projected_only"),
    workspaceId: "ws_reason",
    workpieceId: "wp_reason",
    sessionId: "session_reason",
  });

  const baseline = resolveBaselineAuthorityGraph({
    persistedEditorialAuthorityGraph: null,
    projectedAuthorityGraph: projected,
  });

  assert.equal(baseline.graph_id, projected.graph_id);
  assert.equal(baseline.operations.length, projected.operations.length);
}

async function run() {
  await testPersistedAuthorityGraphWinsOverProjectionFallback();
  await testProjectedAuthorityGraphUsedWhenPersistedGraphMissing();
  // eslint-disable-next-line no-console
  console.log("Hammer reason preservation tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer reason preservation tests failed:", error);
  process.exit(1);
});
