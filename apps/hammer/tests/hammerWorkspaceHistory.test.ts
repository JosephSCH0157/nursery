import assert from "node:assert/strict";
import type { HammerPersistedAudioEdit } from "../../../packages/contracts/hammer/audio-edit.contract";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  applyPatches,
  buildStatePatches,
  cloneEditorState,
  createHammerHistoryController,
  createHammerHistoryDocument,
  hashEditorState,
  hashEditorStateLegacy,
  matchEditorStateHash,
  serializeCanonicalEditorState,
  normalizeHammerHistoryDocument,
  verifyHammerHistoryAgainstCanonicalHead,
  HammerHistoryVerificationError,
  type HammerEditorStateSerializable,
} from "../src/editor/hammerWorkspaceHistory";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { normalizeHammerVisualPlacementsState } from "../src/lib/hammerVisualPlacements";
import { createDefaultVisualAnimation, createDefaultVisualGeometry, createDefaultVisualLane, createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";
import { deriveLegacyVisualPlacementsFromTimeline } from "../src/visuals/persistence/hammerVisualTimelineLegacyAdapter";
import type { HammerVisualTimelineState } from "../src/visuals/model/hammerVisualTypes";

function segment(id: string, text: string, start = 0, end = 1): HammerTranscriptSegment {
  return {
    segment_id: id,
    speaker: "Host",
    text,
    start_sec: start,
    end_sec: end,
  };
}

function baseVisualTimeline(): HammerVisualTimelineState {
  return createEmptyVisualTimelineState({
    updated_at: "2026-04-03T12:00:00.000Z",
    assets: [
      {
        asset_id: "asset-1",
        asset_ref: "assets/image.png",
        kind: "image",
        label: "Image",
        path: "assets/image.png",
        storage_key: "workpieces/example/assets/image.png",
        mime_type: "image/png",
        source_mode: "packaging",
        updated_at: "2026-04-03T12:00:00.000Z",
      },
    ],
    lanes: [
      createDefaultVisualLane({
        lane_id: "lane:primary",
        clip_ids: ["clip-1"],
      }),
    ],
    clips: [
      {
        clip_id: "clip-1",
        asset_id: "asset-1",
        lane_id: "lane:primary",
        entry_id: "manual:clip-1",
        label: "Image",
        visual_mode: "still_image",
        confidence: 1,
        placement_status: "placed",
        ingest_state: "approved",
        uncertainty_flags: [],
        start_sec: 0,
        end_sec: 2,
        geometry: createDefaultVisualGeometry({
          x: 0.2,
          y: 0.3,
          width: 0.4,
          height: 0.5,
          anchor: "top_left",
        }),
        animation: createDefaultVisualAnimation({
          preset: "fade_in",
        }),
        opacity: 0.85,
        z_index: 7,
        enabled: true,
        locked: false,
        source_mode: "packaging",
        anchor_hint: {
          anchor_segment_id: "a",
          matched_segment_ids: ["a"],
          anchor_text: "hello",
          anchor_label: "Image",
          detached: false,
        },
        updated_at: "2026-04-03T12:00:00.000Z",
      },
    ],
    selected_clip_id: "clip-1",
  });
}

function baseState(): HammerEditorStateSerializable {
  const visualTimeline = baseVisualTimeline();
  const visualPlacements = normalizeHammerVisualPlacementsState(
    deriveLegacyVisualPlacementsFromTimeline(visualTimeline),
  );
  assert.ok(visualPlacements);
  for (const placement of visualPlacements.placements) {
    if (placement.authority_operation_id === undefined) {
      delete placement.authority_operation_id;
    }
  }
  return {
    transcriptSegments: [segment("a", "hello"), segment("b", "world", 1, 2)],
    visualPlacements,
    visualTimeline,
    audioEdit: null,
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

function audioEdit(operations: HammerPersistedAudioEdit["operations"]): HammerPersistedAudioEdit {
  return {
    version: "v1",
    operations,
  };
}

async function testAudioEditOperationsPersistThroughHistory() {
  const initial = baseState();
  initial.audioEdit = audioEdit([
    { id: "cut:one", type: "cut", start_sec: 0.4, end_sec: 0.8 },
  ]);

  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-audio-edit",
      sessionId: "session-audio-edit",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });

  const next = cloneEditorState(initial);
  next.audioEdit = audioEdit([
    ...(initial.audioEdit?.operations ?? []),
    { id: "cut:two", type: "cut", start_sec: 1.1, end_sec: 1.3 },
  ]);

  const entry = controller.applyMutation({
    label: "Add audio cut operation",
    kind: "cleanup_tool",
    nextState: next,
  });
  assert.ok(entry);

  assert.equal(controller.getState().audioEdit?.operations.length, 2);
  controller.undo();
  assert.equal(controller.getState().audioEdit?.operations.length, 1);
  controller.redo();
  assert.equal(controller.getState().audioEdit?.operations.length, 2);

  const patches = buildStatePatches(initial, next);
  assert.equal(patches.forward.some((patch) => patch.path.startsWith("/audioEdit")), true);
  assert.deepEqual(applyPatches(initial, patches.forward).audioEdit, next.audioEdit);

  const replayed = controller.getReplayStateFromBaseline(initial);
  assert.deepEqual(replayed.audioEdit, next.audioEdit);
}

async function testTranscriptSpanCutMutationUndoRedo() {
  const initial: HammerEditorStateSerializable = {
    transcriptSegments: [
      segment("a", "hello", 0, 1),
      segment("b", "dead", 1, 2),
      segment("c", "world", 2, 3),
    ],
    visualPlacements: deriveLegacyVisualPlacementsFromTimeline(baseVisualTimeline()),
    visualTimeline: baseVisualTimeline(),
    audioEdit: null,
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
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-visual",
      sessionId: "session-visual",
      baseRevisionId: hashEditorState(initial),
    }),
    initialState: initial,
  });

  const updated = cloneEditorState(initial);
  if (!updated.visualTimeline?.clips[0]) {
    throw new Error("Expected seeded visual clip");
  }
  updated.visualTimeline.clips[0].geometry = {
    x: 0.25,
    y: 0.35,
    width: 0.45,
    height: 0.55,
    anchor: "top_left",
  };
  updated.visualTimeline.clips[0].animation = {
    ...updated.visualTimeline.clips[0].animation,
    preset: "shutter_in",
  };
  updated.visualTimeline.revision += 1;
  updated.visualTimeline.updated_at = "2026-04-03T12:01:00.000Z";
  updated.visualPlacements = deriveLegacyVisualPlacementsFromTimeline(updated.visualTimeline);
  controller.applyMutation({
    label: "Adjust visual composition",
    kind: "visual_adjustment",
    affectedPlacementIds: ["clip-1"],
    nextState: updated,
  });

  const after = controller.getState().visualTimeline?.clips[0] ?? null;
  assert.ok(after);
  assert.deepEqual(after?.geometry, {
    x: 0.25,
    y: 0.35,
    width: 0.45,
    height: 0.55,
    anchor: "top_left",
  });
  assert.equal(after?.animation.preset, "shutter_in");
  controller.undo();
  const undone = controller.getState().visualTimeline?.clips[0] ?? null;
  assert.ok(undone);
  assert.deepEqual(undone?.geometry, {
    x: 0.2,
    y: 0.3,
    width: 0.4,
    height: 0.5,
    anchor: "top_left",
  });
  assert.equal(undone?.animation.preset, "fade_in");
}

async function testCompatibilityPlacementsDoNotDriveHistoryDiffs() {
  const before = baseState();
  const after = cloneEditorState(before);
  if (!after.visualPlacements?.placements[0]) {
    throw new Error("Expected compatibility placement");
  }

  after.visualPlacements.placements[0].overlay_geometry = {
    x: 0.9,
    y: 0.9,
    width: 0.1,
    height: 0.1,
    anchor: "top_left",
  };
  after.visualPlacements.placements[0].animation_preset = "shutter_in";

  const patches = buildStatePatches(before, after);
  assert.equal(patches.forward.some((patch) => patch.path === "/visualPlacements"), false);
  assert.equal(patches.forward.some((patch) => patch.path === "/visualTimeline"), false);
}

async function testStrictHistoryVerification() {
  const baseline = baseState();
  const controller = createHammerHistoryController({
    document: createHammerHistoryDocument({
      workpieceId: "wp-verified",
      sessionId: "session-verified",
      baseRevisionId: hashEditorState(baseline),
    }),
    initialState: baseline,
  });
  const first = cloneEditorState(baseline);
  first.playheadSec = 0.5;
  controller.applyMutation({ label: "First", nextState: first });
  const head = cloneEditorState(first);
  head.selectedSegmentId = "b";
  controller.applyMutation({ label: "Second", nextState: head });

  const verified = verifyHammerHistoryAgainstCanonicalHead({ document: controller.document, canonicalHead: head });
  assert.equal(hashEditorState(verified.baseline), controller.document.baseRevisionId);
  assert.equal(hashEditorState(verified.replayedHead), hashEditorState(head));

  const expectCode = (document: typeof controller.document, canonicalHead: HammerEditorStateSerializable, code: string) => {
    assert.throws(
      () => verifyHammerHistoryAgainstCanonicalHead({ document, canonicalHead }),
      (error) => error instanceof HammerHistoryVerificationError && error.code === code,
    );
  };
  const badInverse = structuredClone(controller.document);
  badInverse.entries[0].inversePatch = [{ op: "replace", path: "/playheadSec", value: 99 }];
  expectCode(badInverse, head, "history_declared_base_mismatch");

  const wrongBase = structuredClone(controller.document);
  wrongBase.baseRevisionId = "hammer-state:00000000";
  expectCode(wrongBase, head, "history_declared_base_mismatch");

  const wrongHead = cloneEditorState(head);
  wrongHead.playheadSec = 1.5;
  expectCode(controller.document, wrongHead, "history_current_head_mismatch");

  const incomplete = structuredClone(controller.document);
  incomplete.entries = incomplete.entries.slice(0, 1);
  expectCode(incomplete, head, "history_incomplete_entry_sequence");
}

async function testVersionAwareCanonicalHashing() {
  const anchor = baseState();
  const reopen = structuredClone(anchor);
  const reverseKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).reverse().map((key) => [key, reverseKeys((value as Record<string, unknown>)[key])]));
  };
  reopen.visualTimeline = reverseKeys(anchor.visualTimeline) as HammerVisualTimelineState;
  assert.notEqual(hashEditorStateLegacy(anchor), hashEditorStateLegacy(reopen));
  assert.equal(hashEditorState(anchor), hashEditorState(reopen));
  assert.equal(serializeCanonicalEditorState(anchor), serializeCanonicalEditorState(reopen));

  const legacy = hashEditorStateLegacy(anchor);
  assert.deepEqual(matchEditorStateHash({ expectedHash: legacy, canonicalState: reopen, legacyReconstruction: anchor }), {
    matched: true,
    algorithm: "json-stringify-v0",
    canonicalHash: hashEditorState(reopen),
    legacyHash: legacy,
  });
  assert.equal(matchEditorStateHash({ expectedHash: "hammer-state:00000000", canonicalState: reopen, legacyReconstruction: anchor }).matched, false);

  const changed = structuredClone(reopen);
  changed.playheadSec += 0.001;
  assert.notEqual(hashEditorState(anchor), hashEditorState(changed));
  const reorderedArray = structuredClone(reopen);
  reorderedArray.transcriptSegments.reverse();
  assert.notEqual(hashEditorState(anchor), hashEditorState(reorderedArray));
  assert.notEqual(serializeCanonicalEditorState({ missing: false }), serializeCanonicalEditorState({ missing: null }));
  assert.notEqual(serializeCanonicalEditorState({ missing: 0 }), serializeCanonicalEditorState({}));
  assert.notEqual(serializeCanonicalEditorState({ missing: [] }), serializeCanonicalEditorState({ missing: {} }));
}

async function testExistingLegacyHistoryVerificationRemainsAvailable() {
  const baseline = baseState();
  const head = cloneEditorState(baseline); head.playheadSec = 0.75;
  const controller = createHammerHistoryController({ document: createHammerHistoryDocument({
    workpieceId: "legacy-workpiece", sessionId: "legacy-session", baseRevisionId: hashEditorState(baseline),
  }), initialState: baseline });
  controller.applyMutation({ label: "legacy edit", nextState: head });
  controller.document.baseRevisionId = hashEditorStateLegacy(baseline);
  controller.document.entries[0]!.baseStateHash = hashEditorStateLegacy(baseline);
  controller.document.entries[0]!.resultStateHash = hashEditorStateLegacy(head);
  const verified = verifyHammerHistoryAgainstCanonicalHead({
    document: controller.document, canonicalHead: head, legacyCanonicalHeadReconstruction: head,
  });
  assert.equal(hashEditorState(verified.replayedHead), hashEditorState(head));
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
  await testAudioEditOperationsPersistThroughHistory();
  await testTranscriptSpanCutMutationUndoRedo();
  await testVisualCompositionFieldsPersistAcrossUndoRedo();
  await testCompatibilityPlacementsDoNotDriveHistoryDiffs();
  await testStrictHistoryVerification();
  await testVersionAwareCanonicalHashing();
  await testExistingLegacyHistoryVerificationRemainsAvailable();
  // eslint-disable-next-line no-console
  console.log("Hammer workspace history tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer workspace history tests failed:", error);
  process.exit(1);
});
