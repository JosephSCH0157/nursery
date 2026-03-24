import assert from "node:assert/strict";
import { cloneHammerEditorialAuthorityGraph } from "../../../packages/contracts/hammer/editorial-authority.contract";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";

async function testCloneRoundTrip() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_authority_01",
      version: "1",
      created_at: "2026-03-24T12:30:00.000Z",
      updated_at: "2026-03-24T12:30:00.000Z",
      source_transcript_id: "tx_authority_01",
      instructions: [
        {
          instruction_id: "ins_01",
          segment_id: "seg_01",
          type: "delete",
          created_at: "2026-03-24T12:30:00.000Z",
        },
      ],
    },
    workspaceId: "ws_authority",
    workpieceId: "wp_authority",
    sessionId: "session_authority",
    nowIso: "2026-03-24T12:31:00.000Z",
  });

  const cloned = cloneHammerEditorialAuthorityGraph(graph);
  assert.deepEqual(cloned, graph);
  assert.notEqual(cloned, graph);
  assert.notEqual(cloned.operations, graph.operations);
}

async function run() {
  await testCloneRoundTrip();
  // eslint-disable-next-line no-console
  console.log("Hammer editorial authority contract tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer editorial authority contract tests failed:", error);
  process.exit(1);
});
