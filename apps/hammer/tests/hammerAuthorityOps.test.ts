import assert from "node:assert/strict";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import {
  appendAuthorityInstructionToGraph,
  createHearthBrollSuggestionInstruction,
  createAudioDuckInstruction,
  createCrossfadeInstruction,
  createDipToBlackInstruction,
  createInsertBrollInstruction,
  createRippleDeleteInstruction,
  remapResolvedBrollOperationsForRippleDelete,
  resolveInsertBrollSuggestionInGraph,
  synchronizeLinkedAudioDuckForBrollOperation,
  updateResolvedInsertBrollOperationInGraph,
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

async function testSuggestionResolutionPreservesOperationIdentity() {
  const initial = baseState();
  const suggestion = createHearthBrollSuggestionInstruction({
    segmentId: "seg_01",
    intentRef: "hearth-suggestion-01",
    intentDescription: "Insert skyline cutaway",
    startSec: 0.4,
    endSec: 2.6,
    instructionId: "suggestion_01",
  });
  const withSuggestion = appendAuthorityInstructionToGraph({
    graph: initial.editorialAuthorityGraph,
    instruction: suggestion,
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const suggestionOperationId = withSuggestion.operations.at(-1)?.operation_id ?? null;
  assert.ok(suggestionOperationId);
  const resolved = resolveInsertBrollSuggestionInGraph({
    graph: withSuggestion,
    operationId: suggestionOperationId!,
    assetRef: "assets/broll/skyline.mp4",
    startSec: 0.5,
    endSec: 2.7,
  });
  assert.ok(resolved);
  const sameOperation = resolved?.operations.find((operation) => operation.operation_id === suggestionOperationId) ?? null;
  assert.equal(sameOperation?.instruction.type, "insert_broll");
  if (sameOperation?.instruction.type === "insert_broll") {
    assert.equal(sameOperation.instruction.asset_binding_state, "resolved");
    assert.equal(sameOperation.instruction.intent_source, "hearth_suggestion");
    assert.equal(sameOperation.instruction.asset_ref, "assets/broll/skyline.mp4");
  }
}

async function testResolvedBindingMoveTrimReplacePreserveOperationIdentity() {
  const initial = baseState();
  const inserted = appendAuthorityInstructionToGraph({
    graph: initial.editorialAuthorityGraph,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_02",
      assetRef: "assets/broll/original.mp4",
      startSec: 2,
      endSec: 5,
      instructionId: "insert_resolved_01",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const operationId = inserted.operations.at(-1)?.operation_id ?? "";
  const moved = updateResolvedInsertBrollOperationInGraph({
    graph: inserted,
    operationId,
    changes: { start_sec: 2.5, end_sec: 5.5 },
  });
  assert.ok(moved);
  const replaced = updateResolvedInsertBrollOperationInGraph({
    graph: moved!,
    operationId,
    changes: { asset_ref: "assets/broll/replaced.mp4" },
  });
  assert.ok(replaced);
  const operation = replaced?.operations.find((item) => item.operation_id === operationId) ?? null;
  assert.equal(operation?.instruction.type, "insert_broll");
  if (operation?.instruction.type === "insert_broll") {
    assert.equal(operation.instruction.start_sec, 2.5);
    assert.equal(operation.instruction.end_sec, 5.5);
    assert.equal(operation.instruction.asset_ref, "assets/broll/replaced.mp4");
    assert.equal(operation.instruction.asset_binding_state, "resolved");
  }
}

async function testRippleDeleteRemapsResolvedBrollDeterministically() {
  const initial = baseState();
  const withBrollA = appendAuthorityInstructionToGraph({
    graph: initial.editorialAuthorityGraph,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_01",
      assetRef: "assets/broll/before.mp4",
      startSec: 0.5,
      endSec: 1.5,
      instructionId: "broll_before",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const withBrollB = appendAuthorityInstructionToGraph({
    graph: withBrollA,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_01",
      assetRef: "assets/broll/after.mp4",
      startSec: 6,
      endSec: 7,
      instructionId: "broll_after",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const withBrollC = appendAuthorityInstructionToGraph({
    graph: withBrollB,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_01",
      assetRef: "assets/broll/inside.mp4",
      startSec: 2.2,
      endSec: 3.7,
      instructionId: "broll_inside",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const withBrollD = appendAuthorityInstructionToGraph({
    graph: withBrollC,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_01",
      assetRef: "assets/broll/span.mp4",
      startSec: 1,
      endSec: 7,
      instructionId: "broll_span",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const withRipple = appendAuthorityInstructionToGraph({
    graph: withBrollD,
    instruction: createRippleDeleteInstruction({
      segmentId: "seg_01",
      startSec: 2,
      endSec: 4,
      instructionId: "ripple_ops_matrix",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const spanBrollOperationId = withRipple.operations.find((op) => op.instruction.instruction_id === "broll_span")?.operation_id ?? "";
  const withLinkedDuck = appendAuthorityInstructionToGraph({
    graph: withRipple,
    instruction: createAudioDuckInstruction({
      segmentId: "seg_01",
      startSec: 1,
      endSec: 7,
      duckGainDb: -9,
      linkedBrollOperationId: spanBrollOperationId,
      instructionId: "duck_span_linked",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const duckOpId = withLinkedDuck.operations.find((op) => op.instruction.instruction_id === "duck_span_linked")?.operation_id ?? "";
  const withCompanion = updateResolvedInsertBrollOperationInGraph({
    graph: withLinkedDuck,
    operationId: spanBrollOperationId,
    changes: {
      companion_audio_duck_operation_id: duckOpId,
    },
  }) ?? withLinkedDuck;
  const rippleOpId = withCompanion.operations.find((op) => op.instruction.instruction_id === "ripple_ops_matrix")?.operation_id ?? "";
  const remapped = remapResolvedBrollOperationsForRippleDelete({
    graph: withCompanion,
    rippleDeleteOperationId: rippleOpId,
    removedStartSec: 2,
    removedEndSec: 4,
  });

  const beforeOp = remapped.graph.operations.find((op) => op.instruction.instruction_id === "broll_before");
  const afterOp = remapped.graph.operations.find((op) => op.instruction.instruction_id === "broll_after");
  const insideOp = remapped.graph.operations.find((op) => op.instruction.instruction_id === "broll_inside");
  const spanOp = remapped.graph.operations.find((op) => op.instruction.instruction_id === "broll_span");

  assert.equal(beforeOp?.instruction.type, "insert_broll");
  if (beforeOp?.instruction.type === "insert_broll") {
    assert.equal(beforeOp.instruction.start_sec, 0.5);
    assert.equal(beforeOp.instruction.end_sec, 1.5);
  }

  assert.equal(afterOp?.instruction.type, "insert_broll");
  if (afterOp?.instruction.type === "insert_broll") {
    assert.equal(afterOp.instruction.start_sec, 4);
    assert.equal(afterOp.instruction.end_sec, 5);
  }

  assert.equal(insideOp?.lifecycle, "superseded");
  assert.equal(insideOp?.superseded_by_operation_id, rippleOpId);

  assert.equal(spanOp?.instruction.type, "insert_broll");
  if (spanOp?.instruction.type === "insert_broll") {
    assert.equal(spanOp.instruction.start_sec, 1);
    assert.equal(spanOp.instruction.end_sec, 5);
  }
  assert.equal(spanOp?.capability_state.capability, "degraded");
  assert.equal(spanOp?.capability_state.reason_codes.includes("operation_conflict"), true);

  assert.equal(remapped.summary.adjustedOperationIds.includes(afterOp?.operation_id ?? ""), true);
  assert.equal(remapped.summary.removedOperationIds.includes(insideOp?.operation_id ?? ""), true);
  assert.equal(remapped.summary.attentionOperationIds.includes(spanOp?.operation_id ?? ""), true);
  assert.equal(remapped.summary.adjustedDuckOperationIds.length, 1);
}

async function testLinkedDuckSynchronizesWithBrollMoveTrim() {
  const initial = baseState();
  const withBroll = appendAuthorityInstructionToGraph({
    graph: initial.editorialAuthorityGraph,
    instruction: createInsertBrollInstruction({
      segmentId: "seg_02",
      assetRef: "assets/broll/linked.mp4",
      startSec: 2,
      endSec: 4,
      instructionId: "broll_linked_01",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const brollOperationId = withBroll.operations.at(-1)?.operation_id ?? "";
  const withDuck = appendAuthorityInstructionToGraph({
    graph: withBroll,
    instruction: createAudioDuckInstruction({
      segmentId: "seg_02",
      startSec: 2,
      endSec: 4,
      duckGainDb: -9,
      linkedBrollOperationId: brollOperationId,
      instructionId: "duck_linked_01",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const duckOperationId = withDuck.operations.at(-1)?.operation_id ?? "";
  const movedBroll = updateResolvedInsertBrollOperationInGraph({
    graph: withDuck,
    operationId: brollOperationId,
    changes: {
      start_sec: 2.5,
      end_sec: 4.5,
      companion_audio_duck_operation_id: duckOperationId,
    },
  }) ?? withDuck;
  const synchronized = synchronizeLinkedAudioDuckForBrollOperation({
    graph: movedBroll,
    brollOperationId,
  });
  assert.ok(synchronized);
  const linkedDuck = synchronized?.operations.find((op) => op.operation_id === duckOperationId) ?? null;
  assert.equal(linkedDuck?.instruction.type, "audio_duck");
  if (linkedDuck?.instruction.type === "audio_duck") {
    assert.equal(linkedDuck.instruction.start_sec, 2.5);
    assert.equal(linkedDuck.instruction.end_sec, 4.5);
    assert.equal(linkedDuck.instruction.linked_broll_operation_id, brollOperationId);
  }
}

async function testRippleDeleteRemapsTransitionsWithoutSilentDrift() {
  const initial = baseState();
  const withDip = appendAuthorityInstructionToGraph({
    graph: initial.editorialAuthorityGraph,
    instruction: createDipToBlackInstruction({
      segmentId: "seg_01",
      startSec: 3,
      endSec: 3.6,
      instructionId: "dip_transition_01",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const withCrossfade = appendAuthorityInstructionToGraph({
    graph: withDip,
    instruction: createCrossfadeInstruction({
      segmentId: "seg_01",
      nextSegmentId: "seg_02",
      durationSec: 0.6,
      instructionId: "crossfade_no_window_01",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const withRipple = appendAuthorityInstructionToGraph({
    graph: withCrossfade,
    instruction: createRippleDeleteInstruction({
      segmentId: "seg_01",
      startSec: 2,
      endSec: 4,
      instructionId: "ripple_transition_01",
    }),
    fallback: {
      graphId: "fallback",
      workspaceId: "ws_ops",
      workpieceId: "wp_ops",
      sessionId: "session_ops",
      sourceTranscriptId: "tx_ops",
    },
  });
  const rippleOpId = withRipple.operations.at(-1)?.operation_id ?? "";
  const remapped = remapResolvedBrollOperationsForRippleDelete({
    graph: withRipple,
    rippleDeleteOperationId: rippleOpId,
    removedStartSec: 2,
    removedEndSec: 4,
  });
  const dipOp = remapped.graph.operations.find((operation) => operation.instruction.instruction_id === "dip_transition_01") ?? null;
  assert.equal(dipOp?.lifecycle, "superseded");
  const crossfadeOp = remapped.graph.operations.find((operation) => operation.instruction.instruction_id === "crossfade_no_window_01") ?? null;
  assert.equal(crossfadeOp?.capability_state.capability, "degraded");
  assert.equal(remapped.summary.removedTransitionOperationIds.length, 1);
  assert.equal(remapped.summary.degradedTransitionOperationIds.length, 1);
}

async function run() {
  await testFirstAuthorityOpsAffectAssemblyDeterministically();
  await testUndoRedoPreservesCanonicalOperationIdentity();
  await testSuggestionResolutionPreservesOperationIdentity();
  await testResolvedBindingMoveTrimReplacePreserveOperationIdentity();
  await testRippleDeleteRemapsResolvedBrollDeterministically();
  await testLinkedDuckSynchronizesWithBrollMoveTrim();
  await testRippleDeleteRemapsTransitionsWithoutSilentDrift();
  // eslint-disable-next-line no-console
  console.log("Hammer authority ops tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer authority ops tests failed:", error);
  process.exit(1);
});
