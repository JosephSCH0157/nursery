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

async function run() {
  await testPatchRoundTrip();
  await testControllerUndoRedoAndRedoClear();
  await testCoalescedTextEdits();
  await testNormalizeAndReplay();
  await testOutputSelectionUndoRedo();
  // eslint-disable-next-line no-console
  console.log("Hammer workspace history tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer workspace history tests failed:", error);
  process.exit(1);
});
