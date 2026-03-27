import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  applyPatches,
  buildStatePatches,
  cloneEditorState,
  createHammerHistoryController,
  createHammerHistoryDocument,
  hashEditorState,
  normalizeHammerHistoryDocument,
  type HammerEditorStateSerializable,
} from "../src/editor/hammerWorkspaceHistory";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";

function segment(id: string, text: string, start = 0, end = 1): HammerTranscriptSegment {
  return {
    segment_id: id,
    speaker: "Host",
    text,
    start_sec: start,
    end_sec: end,
  };
}

function baseState(): HammerEditorStateSerializable {
  return {
    transcriptSegments: [segment("a", "hello"), segment("b", "world", 1, 2)],
    visualPlacements: null,
    studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: null,
    outputSelection: {
      layerId: null,
      sourceRecipeRef: null,
    },
    selectedSegmentId: "a",
    playheadSec: 0,
    transcriptTimingHint: null,
  };
}

async function testPatchRoundTrip() {
  const before = baseState();
  const after = cloneEditorState(before);
  after.transcriptSegments[0] = { ...after.transcriptSegments[0], text: "hello there" };
  after.selectedSegmentId = "b";
  after.playheadSec = 1.2;

  const patches = buildStatePatches(before, after);
  assert.ok(patches.forward.length > 0);
  assert.ok(patches.inverse.length > 0);

  const applied = applyPatches(before, patches.forward);
  assert.deepEqual(applied, after);

  const rolledBack = applyPatches(applied, patches.inverse);
  assert.deepEqual(rolledBack, before);
}

async function testControllerUndoRedoAndRedoClear() {
  const initial = baseState();
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-1",
      sessionId: "session-1",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
    maxUndoSteps: 10,
  });

  const first = cloneEditorState(initial);
  first.transcriptSegments[0] = { ...first.transcriptSegments[0], text: "first edit" };
  const firstEntry = controller.applyMutation({
    label: "Edit transcript text",
    kind: "transcript_text_edit",
    transactionId: "text:a",
    nextState: first,
  });
  assert.ok(firstEntry);

  const second = cloneEditorState(first);
  second.transcriptSegments[1] = { ...second.transcriptSegments[1], text: "second edit" };
  const secondEntry = controller.applyMutation({
    label: "Edit transcript text",
    kind: "transcript_text_edit",
    transactionId: "text:b",
    nextState: second,
  });
  assert.ok(secondEntry);

  assert.equal(controller.canUndo(), true);
  assert.equal(controller.canRedo(), false);

  const undone = controller.undo();
  assert.ok(undone);
  assert.equal(controller.getState().transcriptSegments[1]?.text, "world");
  assert.equal(controller.canRedo(), true);

  const replacement = cloneEditorState(controller.getState());
  replacement.transcriptSegments[1] = { ...replacement.transcriptSegments[1], text: "replacement" };
  controller.applyMutation({
    label: "Edit transcript text",
    kind: "transcript_text_edit",
    transactionId: "text:b",
    nextState: replacement,
  });
  assert.equal(controller.canRedo(), false);
}

async function testCoalescedTextEdits() {
  const initial = baseState();
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-2",
      sessionId: "session-2",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });

  const first = cloneEditorState(initial);
  first.transcriptSegments[0] = { ...first.transcriptSegments[0], text: "h" };
  controller.applyMutation({
    label: "Edit transcript text",
    kind: "transcript_text_edit",
    transactionId: "text:a",
    allowCoalesce: true,
    coalesceWindowMs: 2000,
    nextState: first,
  });

  const second = cloneEditorState(first);
  second.transcriptSegments[0] = { ...second.transcriptSegments[0], text: "hello edited" };
  controller.applyMutation({
    label: "Edit transcript text",
    kind: "transcript_text_edit",
    transactionId: "text:a",
    allowCoalesce: true,
    coalesceWindowMs: 2000,
    nextState: second,
  });

  assert.equal(controller.document.undoStack.length, 1);
  assert.equal(controller.getState().transcriptSegments[0]?.text, "hello edited");
  controller.undo();
  assert.equal(controller.getState().transcriptSegments[0]?.text, "hello");
}

async function testNormalizeAndReplay() {
  const initial = baseState();
  const document = createHammerHistoryDocument({
    workpieceId: "wp-3",
    sessionId: "session-3",
    baseRevisionId: hashEditorState(initial),
  });
  const controller = createHammerHistoryController({
    document,
    initialState: initial,
  });

  const next = cloneEditorState(initial);
  next.playheadSec = 1.7;
  next.selectedSegmentId = "b";
  next.outputSelection = {
    layerId: "macro_run_1",
    sourceRecipeRef: "retake_cleanup",
  };
  controller.applyMutation({
    label: "Set export output",
    kind: "output_selection",
    nextState: next,
  });

  const normalized = normalizeHammerHistoryDocument(document, {
    workpieceId: "fallback",
    sessionId: "fallback",
    baseRevisionId: "fallback",
  });

  const replayController = createHammerHistoryController({
    document: normalized,
    initialState: initial,
  });
  const replayed = replayController.getReplayStateFromBaseline(initial);

  assert.equal(replayed.playheadSec, 1.7);
  assert.equal(replayed.selectedSegmentId, "b");
  assert.equal(replayed.outputSelection.layerId, "macro_run_1");
  assert.equal(replayed.outputSelection.sourceRecipeRef, "retake_cleanup");
}

async function testOutputSelectionUndoRedo() {
  const initial = baseState();
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-4",
      sessionId: "session-4",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });

  const selected = cloneEditorState(initial);
  selected.outputSelection = {
    layerId: "macro_run_2",
    sourceRecipeRef: "filler_cleanup",
  };

  controller.applyMutation({
    label: "Set export output to filler cleanup",
    kind: "output_selection",
    nextState: selected,
  });

  assert.equal(controller.getState().outputSelection.layerId, "macro_run_2");
  assert.equal(controller.getState().outputSelection.sourceRecipeRef, "filler_cleanup");

  controller.undo();
  assert.equal(controller.getState().outputSelection.layerId, null);
  assert.equal(controller.getState().outputSelection.sourceRecipeRef, null);

  controller.redo();
  assert.equal(controller.getState().outputSelection.layerId, "macro_run_2");
  assert.equal(controller.getState().outputSelection.sourceRecipeRef, "filler_cleanup");
}

async function testOutputSelectionMultipleDerivedAppliesRestoreInOrder() {
  const initial = baseState();
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-4b",
      sessionId: "session-4b",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });

  const panelSelection = cloneEditorState(initial);
  panelSelection.outputSelection = {
    layerId: "macro_run_panel",
    sourceRecipeRef: "speaker_panel:balanced",
  };
  controller.applyMutation({
    label: "Set export output to Panel Mode",
    kind: "output_selection",
    nextState: panelSelection,
  });

  const soloSelection = cloneEditorState(panelSelection);
  soloSelection.outputSelection = {
    layerId: "macro_run_solo",
    sourceRecipeRef: "speaker_solo:s2",
  };
  controller.applyMutation({
    label: "Set export output to Solo Mode - S2",
    kind: "output_selection",
    nextState: soloSelection,
  });

  assert.equal(controller.getState().outputSelection.sourceRecipeRef, "speaker_solo:s2");

  controller.undo();
  assert.equal(controller.getState().outputSelection.sourceRecipeRef, "speaker_panel:balanced");

  controller.undo();
  assert.equal(controller.getState().outputSelection.sourceRecipeRef, null);

  controller.redo();
  assert.equal(controller.getState().outputSelection.sourceRecipeRef, "speaker_panel:balanced");

  controller.redo();
  assert.equal(controller.getState().outputSelection.sourceRecipeRef, "speaker_solo:s2");
}

async function testReplayFromSnapshotTail() {
  const initial = baseState();
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-5",
      sessionId: "session-5",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });

  const afterFirst = cloneEditorState(initial);
  afterFirst.transcriptSegments[0] = { ...afterFirst.transcriptSegments[0], text: "first" };
  const firstEntry = controller.applyMutation({
    label: "First edit",
    kind: "transcript_text_edit",
    nextState: afterFirst,
  });
  assert.ok(firstEntry);

  const afterSecond = cloneEditorState(afterFirst);
  afterSecond.transcriptSegments[1] = { ...afterSecond.transcriptSegments[1], text: "second" };
  controller.applyMutation({
    label: "Second edit",
    kind: "transcript_text_edit",
    nextState: afterSecond,
  });

  const tailReplayed = controller.getReplayStateFromBaseline(afterFirst, firstEntry?.id ?? null);
  assert.equal(tailReplayed.transcriptSegments[0]?.text, "first");
  assert.equal(tailReplayed.transcriptSegments[1]?.text, "second");
}

async function testDisabledAndGainPersistThroughHistory() {
  const initial = baseState();
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-6",
      sessionId: "session-6",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });

  const disabled = cloneEditorState(initial);
  disabled.transcriptSegments[0] = {
    ...disabled.transcriptSegments[0],
    is_disabled: true,
    gain_db: -3,
  };
  controller.applyMutation({
    label: "Disable segment",
    kind: "segment_structure",
    nextState: disabled,
  });

  assert.equal(controller.getState().transcriptSegments[0]?.is_disabled, true);
  assert.equal(controller.getState().transcriptSegments[0]?.gain_db, -3);

  controller.undo();
  assert.equal(controller.getState().transcriptSegments[0]?.is_disabled, undefined);
  assert.equal(controller.getState().transcriptSegments[0]?.gain_db, undefined);

  controller.redo();
  assert.equal(controller.getState().transcriptSegments[0]?.is_disabled, true);
  assert.equal(controller.getState().transcriptSegments[0]?.gain_db, -3);
}

async function testTranscriptSpanCutMutationUndoRedo() {
  const initial: HammerEditorStateSerializable = {
    transcriptSegments: [
      segment("a", "hello", 0, 1),
      segment("b", "dead", 1, 2),
      segment("c", "world", 2, 3),
    ],
    visualPlacements: null,
    studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: null,
    outputSelection: {
      layerId: null,
      sourceRecipeRef: null,
    },
    selectedSegmentId: "b",
    playheadSec: 1.4,
    transcriptTimingHint: null,
  };
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-7",
      sessionId: "session-7",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });

  const cut = cloneEditorState(initial);
  cut.transcriptSegments = [
    segment("a", "hello", 0, 1),
    segment("c", "world", 1, 2),
  ];
  cut.selectedSegmentId = "c";
  cut.playheadSec = 1;

  controller.applyMutation({
    label: "Cut transcript selection",
    kind: "segment_structure",
    affectedSegmentIds: ["b"],
    nextState: cut,
  });

  assert.equal(controller.getState().transcriptSegments.length, 2);
  assert.equal(controller.getState().transcriptSegments[1]?.segment_id, "c");
  assert.equal(controller.getState().transcriptSegments[1]?.start_sec, 1);
  assert.equal(controller.getState().playheadSec, 1);

  controller.undo();
  assert.equal(controller.getState().transcriptSegments.length, 3);
  assert.equal(controller.getState().transcriptSegments[1]?.segment_id, "b");
  assert.equal(controller.getState().playheadSec, 1.4);

  controller.redo();
  assert.equal(controller.getState().transcriptSegments.length, 2);
  assert.equal(controller.getState().transcriptSegments[1]?.segment_id, "c");
}

async function testVisualCompositionFieldsPersistAcrossUndoRedo() {
  const initial = baseState();
  initial.visualPlacements = {
    schema_version: 1,
    status: "prepared",
    source_refs: [],
    uncertainty_flags: [],
    placements: [
      {
        placement_id: "placement-01",
        entry_id: "manual:placement-01",
        anchor_segment_id: "a",
        matched_segment_ids: ["a"],
        anchor_text: "hello",
        asset_ref: "asset-1",
        asset_id: "asset-1",
        asset_path: "assets/image.png",
        storage_key: "workpieces/example/assets/image.png",
        label: "Image",
        visual_mode: "still_image",
        start_sec: 0,
        end_sec: 2,
        confidence: 1,
        timing_source: "ordered_fallback",
        status: "placed",
        ingest_state: "approved",
        uncertainty_flags: [],
        overlay_geometry: {
          x: 0.2,
          y: 0.3,
          width: 0.4,
          height: 0.5,
          anchor: "top_left",
        },
        animation_preset: "fade_in",
        overlay_opacity: 0.85,
        overlay_z_index: 7,
      },
    ],
  };
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-visual",
      sessionId: "session-visual",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });

  const updated = cloneEditorState(initial);
  if (!updated.visualPlacements?.placements[0]) {
    throw new Error("Expected seeded visual placement");
  }
  updated.visualPlacements.placements[0].overlay_geometry = {
    x: 0.25,
    y: 0.35,
    width: 0.45,
    height: 0.55,
    anchor: "top_left",
  };
  updated.visualPlacements.placements[0].animation_preset = "shutter_in";
  controller.applyMutation({
    label: "Adjust visual composition",
    kind: "visual_adjustment",
    affectedPlacementIds: ["placement-01"],
    nextState: updated,
  });

  const after = controller.getState().visualPlacements?.placements[0] ?? null;
  assert.ok(after);
  assert.deepEqual(after?.overlay_geometry, {
    x: 0.25,
    y: 0.35,
    width: 0.45,
    height: 0.55,
    anchor: "top_left",
  });
  assert.equal(after?.animation_preset, "shutter_in");
  controller.undo();
  const undone = controller.getState().visualPlacements?.placements[0] ?? null;
  assert.ok(undone);
  assert.deepEqual(undone?.overlay_geometry, {
    x: 0.2,
    y: 0.3,
    width: 0.4,
    height: 0.5,
    anchor: "top_left",
  });
  assert.equal(undone?.animation_preset, "fade_in");
}

async function run() {
  await testPatchRoundTrip();
  await testControllerUndoRedoAndRedoClear();
  await testCoalescedTextEdits();
  await testNormalizeAndReplay();
  await testOutputSelectionUndoRedo();
  await testOutputSelectionMultipleDerivedAppliesRestoreInOrder();
  await testReplayFromSnapshotTail();
  await testDisabledAndGainPersistThroughHistory();
  await testTranscriptSpanCutMutationUndoRedo();
  await testVisualCompositionFieldsPersistAcrossUndoRedo();
  // eslint-disable-next-line no-console
  console.log("Hammer workspace history tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer workspace history tests failed:", error);
  process.exit(1);
});
