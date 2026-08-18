import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  captureHammerHistoryPostSaveSnapshotRequest,
  createHammerHistoryCommandAuthority,
  persistHammerHistorySaveBoundary,
  type HammerHistoryCommandAuthorityConfig,
} from "../src/editor/hammerWorkspaceShellHistoryController";
import {
  cloneEditorState,
  createHammerHistoryController,
  createHammerHistoryDocument,
  type HammerEditorStateSerializable,
  type HammerHistoryDocumentV1,
} from "../src/editor/hammerWorkspaceHistory";
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

function authorityFixture(overrides: Partial<HammerHistoryCommandAuthorityConfig> = {}, debounceMs = 900) {
  let currentState: HammerEditorStateSerializable = state();
  const saved: HammerHistoryDocumentV1[] = [];
  const snapshots: Array<{ headEntryId: string | null; text: string }> = [];
  const statuses: Array<string | null> = [];
  let derivedLayers = { schema_version: 1 as const, active_layer_id: null, output_layer_id: null, layers: [] };
  const config: HammerHistoryCommandAuthorityConfig = {
    workspaceId: "workspace1",
    workpieceId: "w1",
    revisionId: null,
    selectionSegmentId: "s1",
    activeTool: "transcript",
    captureState: () => cloneEditorState(currentState),
    normalizeState: cloneEditorState,
    applyState: (next) => { currentState = cloneEditorState(next); },
    setDerivedLayers: (layers) => { derivedLayers = structuredClone(layers ?? derivedLayers); },
    onHistoryNavigation: () => undefined,
    getViewingTranscript: () => null,
    formatDerivedLayerLabel: () => "layer",
    setHistoryStatus: (status) => { statuses.push(status); },
    captureSnapshotRequest: (document, editorState) => Object.freeze({
      workpieceId: document.workpieceId,
      sessionId: document.sessionId,
      baseRevisionId: document.baseRevisionId,
      headEntryId: document.headEntryId,
      undoDepth: document.undoStack.length,
      redoDepth: document.redoStack.length,
      editorState: cloneEditorState(editorState),
    }),
    onHistorySaved: async (request) => {
      snapshots.push({
        headEntryId: request.headEntryId,
        text: request.editorState.transcriptSegments[0]!.text,
      });
    },
    saveDocument: async (document) => { saved.push(cloneHammerDocument(document)); return { ok: true }; },
    ...overrides,
  };
  const authority = createHammerHistoryCommandAuthority(config, debounceMs, 1_500);
  authority.installBaseline(currentState, derivedLayers);
  authority.installController(createHammerHistoryController({
    document: createHammerHistoryDocument({ workpieceId: "w1", sessionId: "session1", baseRevisionId: "base1" }),
    initialState: currentState,
    maxUndoSteps: 10,
  }));
  return { authority, config, saved, snapshots, statuses, getState: () => currentState, getDerivedLayers: () => derivedLayers };
}

function cloneHammerDocument(document: HammerHistoryDocumentV1): HammerHistoryDocumentV1 {
  return structuredClone(document);
}

function editText(before: HammerEditorStateSerializable, text: string): HammerEditorStateSerializable {
  return {
    ...before,
    transcriptSegments: [{ ...before.transcriptSegments[0]!, text }],
  };
}

test("production authority persists the matching cloned document before its snapshot callback", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const order: string[] = [];
  const fixture = authorityFixture({
    saveDocument: async (document) => {
      fixture.saved.push(cloneHammerDocument(document));
      await pending;
      order.push("history");
      return { ok: true };
    },
    onHistorySaved: async (request) => {
      order.push("snapshot");
      fixture.snapshots.push({ headEntryId: request.headEntryId, text: request.editorState.transcriptSegments[0]!.text });
    },
  });
  fixture.authority.applyMutation({ label: "First", computeAfter: (before) => editText(before, "first") });
  fixture.authority.schedulePersist(true);
  fixture.authority.applyMutation({ label: "Second", computeAfter: (before) => editText(before, "second") });
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, ["history", "snapshot"]);
  assert.equal(fixture.saved[0]!.entries.length, 1);
  assert.equal(fixture.snapshots[0]!.text, "first");
  assert.equal(fixture.snapshots[0]!.headEntryId, fixture.saved[0]!.headEntryId);
  fixture.authority.clearPersistTimer();
});

test("overlapping successful saves retain matching requests and one callback each", async () => {
  const releases: Array<() => void> = [];
  const fixture = authorityFixture({
    saveDocument: async (document) => {
      fixture.saved.push(cloneHammerDocument(document));
      await new Promise<void>((resolve) => { releases.push(resolve); });
      return { ok: true };
    },
  });
  fixture.authority.applyMutation({ label: "First", computeAfter: (before) => editText(before, "first") });
  fixture.authority.schedulePersist(true);
  fixture.authority.applyMutation({ label: "Second", computeAfter: (before) => editText(before, "second") });
  fixture.authority.schedulePersist(true);
  releases[1]!();
  releases[0]!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fixture.snapshots.length, 2);
  assert.deepEqual(new Set(fixture.snapshots.map((item) => item.text)), new Set(["first", "second"]));
});

test("invalidating authority clears timers and suppresses stale in-flight completion", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const fixture = authorityFixture({ saveDocument: async () => { await pending; return { ok: true }; } });
  fixture.authority.schedulePersist(true);
  fixture.authority.invalidate();
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(fixture.snapshots, []);
  assert.deepEqual(fixture.statuses, []);
});

test("invalidating authority clears a scheduled persistence timer", async () => {
  let saves = 0;
  const fixture = authorityFixture({ saveDocument: async () => { saves += 1; return { ok: true }; } }, 5);
  fixture.authority.schedulePersist();
  fixture.authority.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(saves, 0);
});

test("authority owns mutation coalescing and undo redo application", () => {
  let navigations = 0;
  const fixture = authorityFixture({ onHistoryNavigation: () => { navigations += 1; } });
  fixture.authority.applyMutation({
    label: "Typing",
    transactionId: "typing:s1",
    allowCoalesce: true,
    computeAfter: (before) => editText(before, "one"),
  });
  fixture.authority.applyMutation({
    label: "Typing",
    transactionId: "typing:s1",
    allowCoalesce: true,
    computeAfter: (before) => editText(before, "two"),
  });
  assert.equal(fixture.authority.getController()!.document.entries.length, 1);
  fixture.authority.undo();
  assert.equal(fixture.getState().transcriptSegments[0]!.text, "before");
  fixture.authority.redo();
  assert.equal(fixture.getState().transcriptSegments[0]!.text, "two");
  assert.equal(navigations, 2);
  fixture.authority.clearPersistTimer();
});

test("authority owns baseline, derived transitions, jump, and restore bookkeeping", () => {
  const fixture = authorityFixture();
  const beforeLayers = { schema_version: 1 as const, active_layer_id: null, output_layer_id: null, layers: [] };
  const afterLayers = {
    schema_version: 1 as const,
    active_layer_id: "layer-1",
    output_layer_id: null,
    layers: [{
      layer_id: "layer-1",
      recipe_ref: "macro:podcast_cleanup.v1",
      macro_kind: "filler_cleanup" as const,
      status: "active" as const,
      created_at: "2026-08-18T12:00:00.000Z",
      based_on_transcript_id: "t1",
      summary: { changed_segment_count: 0, removal_count: 0, untouched_segment_count: 1 },
      changes: [],
    }],
  };
  const entry = fixture.authority.applyMutation({
    label: "Switch viewing layer to Clean",
    kind: "editor_state_change",
    toolId: "polish",
    immediatePersist: true,
    computeAfter: (before) => editText(before, "layer state"),
  });
  assert.ok(entry);
  fixture.authority.installDerivedLayerTransition(entry!.id, {
    before: beforeLayers,
    after: afterLayers,
    layerLabel: "Clean",
  });
  assert.equal(fixture.getDerivedLayers().active_layer_id, "layer-1");
  fixture.authority.undo();
  assert.equal(fixture.getDerivedLayers().active_layer_id, null);
  fixture.authority.redo();
  assert.equal(fixture.getDerivedLayers().active_layer_id, "layer-1");
  const jumped = fixture.authority.jumpToEntry(entry!.id);
  assert.deepEqual(jumped, { undoStack: [entry!.id], hasRedo: false });
  assert.equal(fixture.getDerivedLayers().active_layer_id, "layer-1");
  fixture.authority.undo();
  assert.equal(fixture.authority.restoreCurrentState(), true);
  assert.equal(fixture.statuses.at(-1), "Restored this state. Future history steps were cleared.");
  fixture.authority.clearPersistTimer();
});

test("history refs and navigation construction remain outside the shell", () => {
  const shell = readFileSync(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../src/editor/hammerWorkspaceShellHistoryController.ts", import.meta.url), "utf8");
  for (const forbidden of ["historyAuthorityRef", "historyBaselineStateRef", "baselineDerivedLayersRef", "derivedLayerHistoryRef"] as const) {
    assert.equal(shell.includes(forbidden), false);
  }
  assert.equal(shell.includes("function jumpToHistoryEntry"), false);
  assert.equal(shell.includes("function restoreCurrentHistoryState"), false);
  assert.equal(shell.includes("function selectViewingLayer"), false);
  assert.equal(controller.includes("const derivedLayerTransitions = new Map"), true);
  assert.equal(controller.includes("useHammerHistoryCommandAuthority"), true);
});
