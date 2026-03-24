import assert from "node:assert/strict";
import { projectEditorialAuthorityGraphFromEditPlan, buildHammerRenderAssembly } from "../src/editor/hammerRenderAssembly";
import { deriveHammerBoundAttentionQueue, deriveHammerBoundObjects } from "../src/editor/hammerBoundObjects";

async function testDeriveBoundObjectsForBrollAndDuck() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_bound_objects",
      version: "1",
      created_at: "2026-03-24T10:00:00.000Z",
      updated_at: "2026-03-24T10:00:00.000Z",
      source_transcript_id: "tx_bound_objects",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_broll",
          segment_id: "seg_01",
          type: "insert_broll",
          asset_ref: "assets/broll/a.mp4",
          start_sec: 1,
          end_sec: 4,
          intent_source: "manual",
          intent_description: "cutaway",
          asset_binding_state: "resolved",
          duck_preference: "auto",
          companion_audio_duck_operation_id: null,
          created_at: "2026-03-24T10:00:00.000Z",
        },
        {
          instruction_id: "ins_duck",
          segment_id: "seg_01",
          type: "audio_duck",
          start_sec: 1,
          end_sec: 4,
          duck_gain_db: -9,
          linked_broll_operation_id: "op:ins_broll",
          created_at: "2026-03-24T10:00:01.000Z",
        },
      ],
    },
    workspaceId: "ws_bound_objects",
    workpieceId: "wp_bound_objects",
    sessionId: "session_bound_objects",
  });
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["insert_broll", "audio_duck"],
      export_supported_operation_types: ["insert_broll", "audio_duck"],
      handoff_supported_operation_types: ["insert_broll", "audio_duck"],
    },
  });
  const objects = deriveHammerBoundObjects({
    canonical_graph: graph,
    render_assembly: assembly,
  });
  const brollObject = objects.find((object) => object.type === "broll") ?? null;
  const duckObject = objects.find((object) => object.type === "audio_duck") ?? null;
  assert.ok(brollObject);
  assert.ok(duckObject);
  assert.equal(brollObject?.linked_object_ids.includes(duckObject?.object_id ?? ""), true);
}

async function testAttentionQueueIncludesUnresolvedAndDegraded() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_bound_queue",
      version: "1",
      created_at: "2026-03-24T10:00:00.000Z",
      updated_at: "2026-03-24T10:00:00.000Z",
      source_transcript_id: "tx_bound_queue",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_broll_unresolved",
          segment_id: "seg_01",
          type: "insert_broll",
          asset_ref: "unresolved:hearth",
          start_sec: 2,
          end_sec: 5,
          intent_source: "hearth_suggestion",
          intent_ref: "hearth-01",
          intent_description: "city shot",
          asset_binding_state: "unresolved",
          duck_preference: "auto",
          created_at: "2026-03-24T10:00:00.000Z",
        },
      ],
    },
    workspaceId: "ws_bound_queue",
    workpieceId: "wp_bound_queue",
    sessionId: "session_bound_queue",
  });
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["insert_broll"],
      export_supported_operation_types: ["insert_broll"],
      handoff_supported_operation_types: ["insert_broll"],
    },
  });
  const queue = deriveHammerBoundAttentionQueue(deriveHammerBoundObjects({
    canonical_graph: graph,
    render_assembly: assembly,
  }));
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.reasons.includes("awaiting_resolution"), true);
}

async function run() {
  await testDeriveBoundObjectsForBrollAndDuck();
  await testAttentionQueueIncludesUnresolvedAndDegraded();
  // eslint-disable-next-line no-console
  console.log("Hammer bound objects tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer bound objects tests failed:", error);
  process.exit(1);
});
