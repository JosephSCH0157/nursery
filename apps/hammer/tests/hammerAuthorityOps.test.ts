import assert from "node:assert/strict";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import {
  appendAuthorityInstructionToGraph,
  createAudioDuckInstruction,
  createInsertBrollInstruction,
  createRippleDeleteInstruction,
} from "../src/editor/hammerAuthorityOps";
import {
  buildHammerRenderAssembly,
  projectEditorialAuthorityGraphFromEditPlan,
} from "../src/editor/hammerRenderAssembly";
import {
  createHammerHistoryController,
  createHammerHistoryDocument,
  hashEditorState,
  type HammerEditorStateSerializable,
} from "../src/editor/hammerWorkspaceHistory";

function baseState(): HammerEditorStateSerializable {
  return {
    transcriptSegments: [
      { segment_id: "seg_01", speaker: "S1", text: "Hello", start_sec: 0, end_sec: 2 },
      { segment_id: "seg_02", speaker: "S2", text: "World", start_sec: 2, end_sec: 4 },
    ],
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_ops"],
      uncertainty_flags: [],
      placements: [],
    },
    studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: projectEditorialAuthorityGraphFromEditPlan({
      editPlan: {
        edit_plan_id: "plan_ops_01",
        version: "1",
        created_at: "2026-03-24T15:00:00.000Z",
        updated_at: "2026-03-24T15:00:00.000Z",
        source_transcript_id: "tx_ops",
        instructions: [],
      },
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      nowIso: "2026-03-24T15:00:00.000Z",
    }),
    outputSelection: {
      layerId: null,
      sourceRecipeRef: null,
    },
    selectedSegmentId: "seg_01",
    playheadSec: 0,
    transcriptTimingHint: null,
  };
}

async function testFirstAuthorityOpsAffectAssemblyDeterministically() {
  const start = baseState();
  const ripple = createRippleDeleteInstruction({
    segmentId: "seg_01",
    startSec: 0.5,
    endSec: 1.4,
    nowIso: "2026-03-24T15:01:00.000Z",
    instructionId: "ripple_test_01",
  });
  const broll = createInsertBrollInstruction({
    segmentId: "seg_02",
    assetRef: "assets/broll/clip.mp4",
    startSec: 2.2,
    endSec: 4.8,
    nowIso: "2026-03-24T15:01:10.000Z",
    instructionId: "broll_test_01",
  });
  const duck = createAudioDuckInstruction({
    segmentId: "seg_02",
    startSec: 2.2,
    endSec: 4.8,
    duckGainDb: -9,
    nowIso: "2026-03-24T15:01:11.000Z",
    instructionId: "duck_test_01",
  });

  const withRipple = appendAuthorityInstructionToGraph({
    graph: start.editorialAuthorityGraph,
    instruction: ripple,
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const withBroll = appendAuthorityInstructionToGraph({
    graph: withRipple,
    instruction: broll,
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const withDuck = appendAuthorityInstructionToGraph({
    graph: withBroll,
    instruction: duck,
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const assemblyA = buildHammerRenderAssembly({
    canonicalGraph: withDuck,
    runtimeCapabilities: {
      preview_supported_operation_types: ["delete", "mute", "trim", "split", "merge", "ripple_delete"],
      export_supported_operation_types: ["delete", "mute", "trim", "split", "merge", "ripple_delete", "insert_broll"],
      handoff_supported_operation_types: ["ripple_delete", "insert_broll", "audio_duck"],
    },
  });
  const assemblyB = buildHammerRenderAssembly({
    canonicalGraph: withDuck,
    runtimeCapabilities: {
      preview_supported_operation_types: ["delete", "mute", "trim", "split", "merge", "ripple_delete"],
      export_supported_operation_types: ["delete", "mute", "trim", "split", "merge", "ripple_delete", "insert_broll"],
      handoff_supported_operation_types: ["ripple_delete", "insert_broll", "audio_duck"],
    },
  });
  assert.deepEqual(assemblyA, assemblyB);
  assert.equal(assemblyA.operations.length, 3);
  const brollOp = withDuck.operations.find((operation) => operation.instruction.type === "insert_broll");
  assert.equal(brollOp?.instruction.type, "insert_broll");
  if (brollOp?.instruction.type === "insert_broll") {
    assert.equal(brollOp.instruction.intent_source, "manual");
    assert.equal(brollOp.instruction.asset_binding_state, "resolved");
    assert.equal(brollOp.instruction.duck_preference, "auto");
  }
}

async function testUndoRedoPreservesCanonicalOperationIdentity() {
  const initial = baseState();
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });
  const brollInstruction = createInsertBrollInstruction({
    segmentId: "seg_02",
    assetRef: "assets/broll/clip.mp4",
    startSec: 2,
    endSec: 5,
    instructionId: "broll_identity_01",
  });
  const nextGraph = appendAuthorityInstructionToGraph({
    graph: initial.editorialAuthorityGraph,
    instruction: brollInstruction,
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const appendedOperationId = nextGraph.operations.at(-1)?.operation_id ?? null;
  const nextState: HammerEditorStateSerializable = {
    ...initial,
    editorialAuthorityGraph: nextGraph,
  };

  controller.applyMutation({
    label: "Insert b-roll op",
    kind: "visual_adjustment",
    nextState,
  });
  controller.undo();
  controller.redo();
  const redoOperationId = controller.getState().editorialAuthorityGraph?.operations.at(-1)?.operation_id ?? null;
  assert.equal(redoOperationId, appendedOperationId);
}

async function run() {
  await testFirstAuthorityOpsAffectAssemblyDeterministically();
  await testUndoRedoPreservesCanonicalOperationIdentity();
  // eslint-disable-next-line no-console
  console.log("Hammer authority ops tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer authority ops tests failed:", error);
  process.exit(1);
});
