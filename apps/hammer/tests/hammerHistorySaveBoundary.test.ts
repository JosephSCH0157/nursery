import assert from "node:assert/strict";
import test from "node:test";
import {
  captureHammerHistoryPostSaveSnapshotRequest,
  persistHammerHistorySaveBoundary,
} from "../src/editor/hammerWorkspaceShellHistoryController";
import { createHammerHistoryController, createHammerHistoryDocument } from "../src/editor/hammerWorkspaceHistory";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";

const state = () => ({
  transcriptSegments: [{ segment_id: "s1", speaker: "S1", text: "before", start_sec: 0, end_sec: 1 }],
  visualPlacements: null,
  visualTimeline: null,
  audioEdit: null,
  studioRack: createDefaultHammerStudioRackState(),
  editorialAuthorityGraph: null,
  outputSelection: { layerId: null, sourceRecipeRef: null },
  selectedSegmentId: "s1",
  playheadSec: 0,
  transcriptTimingHint: null,
});

test("pending persistence cannot contaminate the captured snapshot request", async () => {
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({ workpieceId: "w1", sessionId: "session1", baseRevisionId: "base1" }),
    initialState: state(),
    maxUndoSteps: 10,
  });
  const request = captureHammerHistoryPostSaveSnapshotRequest({ workpieceId: "w1", controller });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const received: typeof request[] = [];
  const operation = persistHammerHistorySaveBoundary({
    saveHistory: async () => { await pending; return { ok: true }; },
    snapshotRequest: request,
    onHistorySaved: async (value) => { received.push(value); },
  });
  controller.replaceState({ ...state(), transcriptSegments: [{ ...state().transcriptSegments[0]!, text: "later" }] });
  release();
  await operation;
  assert.equal(received.length, 1);
  assert.equal(received[0]!.editorState.transcriptSegments[0]!.text, "before");
});

test("history failure prevents the post-save callback", async () => {
  let callbacks = 0;
  const result = await persistHammerHistorySaveBoundary({
    saveHistory: async () => ({ ok: false, error: "failed" }),
    snapshotRequest: {} as never,
    onHistorySaved: async () => { callbacks += 1; },
  });
  assert.equal(result.ok, false);
  assert.equal(callbacks, 0);
});

test("history and snapshot execute sequentially exactly once", async () => {
  const order: string[] = [];
  await persistHammerHistorySaveBoundary({
    saveHistory: async () => { order.push("history"); return { ok: true }; },
    snapshotRequest: {} as never,
    onHistorySaved: async () => { order.push("snapshot"); },
  });
  assert.deepEqual(order, ["history", "snapshot"]);
});

test("snapshot failure remains non-fatal after history succeeds", async () => {
  const result = await persistHammerHistorySaveBoundary({
    saveHistory: async () => ({ ok: true }),
    snapshotRequest: {} as never,
    onHistorySaved: async () => { throw new Error("snapshot unavailable"); },
  });
  assert.deepEqual(result, { ok: true });
});
