import assert from "node:assert/strict";
import type { HammerEditPlan } from "../../../packages/contracts/hammer/edit-plan.contract";
import {
  buildHammerRenderAssembly,
  projectEditorialAuthorityGraphFromEditPlan,
} from "../src/editor/hammerRenderAssembly";

function buildPlan(): HammerEditPlan {
  return {
    edit_plan_id: "plan_render_01",
    version: "1",
    created_at: "2026-03-24T12:00:00.000Z",
    updated_at: "2026-03-24T12:00:00.000Z",
    source_transcript_id: "transcript_render_01",
    preview_mode: "edit-aware",
    instructions: [
      {
        instruction_id: "ins_delete_01",
        segment_id: "seg_01",
        type: "delete",
        created_at: "2026-03-24T12:00:00.000Z",
      },
      {
        instruction_id: "ins_broll_01",
        segment_id: "seg_02",
        type: "insert_broll",
        asset_ref: "assets/broll-01.mp4",
        start_sec: 2,
        end_sec: 6,
        created_at: "2026-03-24T12:00:00.000Z",
      },
    ],
  };
}

async function testAssemblyDeterminismAndPosture() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: buildPlan(),
    workspaceId: "ws_render",
    workpieceId: "wp_render",
    sessionId: "session_render",
    nowIso: "2026-03-24T12:00:00.000Z",
  });

  const full = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["delete", "insert_broll"],
      export_supported_operation_types: ["delete", "insert_broll"],
      handoff_supported_operation_types: ["delete", "insert_broll"],
    },
  });
  const fullSecond = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["delete", "insert_broll"],
      export_supported_operation_types: ["delete", "insert_broll"],
      handoff_supported_operation_types: ["delete", "insert_broll"],
    },
  });
  assert.deepEqual(full, fullSecond);
  assert.equal(full.preview.posture, "authoritative");
  assert.equal(full.export.posture, "authoritative");
  assert.equal(full.handoff.posture, "authoritative");

  const degradedPreview = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["delete"],
      export_supported_operation_types: ["delete", "insert_broll"],
      handoff_supported_operation_types: ["delete", "insert_broll"],
    },
  });
  assert.equal(degradedPreview.preview.posture, "degraded");
  assert.equal(degradedPreview.export.posture, "authoritative");
}

async function testUnresolvedBrollIsNeverTreatedAsBoundMediaTruth() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_render_02",
      version: "1",
      created_at: "2026-03-24T12:10:00.000Z",
      updated_at: "2026-03-24T12:10:00.000Z",
      source_transcript_id: "transcript_render_02",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_broll_unresolved",
          segment_id: "seg_10",
          type: "insert_broll",
          asset_ref: "unresolved:hearth-suggestion-01",
          start_sec: 4,
          end_sec: 8,
          intent_source: "hearth_suggestion",
          intent_ref: "hearth-suggestion-01",
          intent_description: "city establishing shot",
          asset_binding_state: "unresolved",
          duck_preference: "auto",
          created_at: "2026-03-24T12:10:00.000Z",
        },
      ],
    },
    workspaceId: "ws_render",
    workpieceId: "wp_render",
    sessionId: "session_render",
  });
  const assembly = buildHammerRenderAssembly({
    canonicalGraph: graph,
    runtimeCapabilities: {
      preview_supported_operation_types: ["insert_broll"],
      export_supported_operation_types: ["insert_broll"],
      handoff_supported_operation_types: ["insert_broll"],
    },
  });
  assert.equal(assembly.preview.posture, "unavailable");
  assert.equal(assembly.export.posture, "degraded");
  assert.equal(assembly.handoff.posture, "degraded");
}

async function run() {
  await testAssemblyDeterminismAndPosture();
  await testUnresolvedBrollIsNeverTreatedAsBoundMediaTruth();
  // eslint-disable-next-line no-console
  console.log("Hammer render assembly tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer render assembly tests failed:", error);
  process.exit(1);
});
