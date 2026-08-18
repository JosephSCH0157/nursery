import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import type { HammerAuthorityOp } from "../src/editor/hammerCompositionMutations";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "../src/editor/hammerWorkspaceHistory";
import type {
  HammerHistoryCommandAuthority,
  HammerHistoryMutationArgs,
} from "../src/editor/hammerWorkspaceShellHistoryController";
import {
  createHammerTranscriptEditingCommands,
  createHammerTranscriptSelectionCommands,
} from "../src/editor/useHammerWorkspaceShellTranscriptEditing";

const entry = { id: "entry", parentEntryId: null, timestamp: "2026-08-18T00:00:00.000Z",
  kind: "transcript_text_edit", label: "test", forwardPatch: [], inversePatch: [] } as HammerHistoryEntry;

function createState(): HammerEditorStateSerializable {
  return {
    transcriptSegments: [
      { segment_id: "s1", speaker: "Host", text: "alpha beta", start_sec: 0, end_sec: 2 },
      { segment_id: "s2", speaker: "Host", text: "gamma", start_sec: 2, end_sec: 4 },
    ],
    visualPlacements: null,
    visualTimeline: null,
    audioEdit: null,
    studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: null,
    outputSelection: { layerId: null, sourceRecipeRef: null },
    selectedSegmentId: "s1",
    playheadSec: 1,
    transcriptTimingHint: null,
  };
}

function createFixture() {
  let state = createState();
  const historyMutations: HammerHistoryMutationArgs[] = [];
  const compositionMutations: HammerAuthorityOp[] = [];
  let persistCount = 0;
  const authority = {
    getController: () => ({ getState: () => state }),
  } as unknown as HammerHistoryCommandAuthority;
  const applyHistoryMutation = (mutation: HammerHistoryMutationArgs): HammerHistoryEntry => {
    historyMutations.push(mutation);
    state = mutation.computeAfter(state);
    return entry;
  };
  const applyCompositionMutation = (op: HammerAuthorityOp): HammerHistoryEntry => {
    compositionMutations.push(op);
    if (op.type === "TRANSCRIPT_SPLIT") state = { ...state, selectedSegmentId: "s1:split" };
    return entry;
  };
  const commands = createHammerTranscriptEditingCommands({
    segments: state.transcriptSegments,
    selectedSegmentId: "s1",
    playbackDurationSec: 4,
    waveformProxy: null,
    historyAuthority: authority,
    applyHistoryMutation,
    applyCompositionMutation,
    requestImmediatePersist: () => { persistCount += 1; },
    setTimingHint: () => undefined,
    setSelectionAnchor: () => undefined,
    setSelectionFocus: () => undefined,
    focusTime: () => undefined,
    selectLinkedTimelineRange: () => undefined,
    snapToleranceSec: 0.08,
  });
  return { commands, historyMutations, compositionMutations, getState: () => state, getPersistCount: () => persistCount };
}

test("text and timing commands preserve canonical history metadata and state projection", () => {
  const fixture = createFixture();
  assert.deepEqual(fixture.commands.commitTranscriptTextEdits({ s1: "alpha beta!" }),
    { applied: true, playbackChanged: false });
  assert.equal(fixture.getState().transcriptSegments[0]?.text, "alpha beta!");
  assert.deepEqual({ label: fixture.historyMutations[0]?.label, kind: fixture.historyMutations[0]?.kind,
    affectedSegments: fixture.historyMutations[0]?.affectedSegments,
    immediatePersist: fixture.historyMutations[0]?.immediatePersist }, {
    label: "Edit transcript", kind: "transcript_text_edit", affectedSegments: ["s1"], immediatePersist: true,
  });
  assert.equal(fixture.getPersistCount(), 1);

  fixture.commands.moveSegment("s1", 0.3);
  const moved = fixture.getState();
  assert.deepEqual([moved.transcriptSegments[0]?.start_sec, moved.transcriptSegments[0]?.end_sec, moved.playheadSec],
    [0.3, 2.3, 1.3]);
  assert.deepEqual({ label: fixture.historyMutations[1]?.label, kind: fixture.historyMutations[1]?.kind,
    affectedSegments: fixture.historyMutations[1]?.affectedSegments },
  { label: "Adjust segment timing", kind: "timing_adjustment", affectedSegments: ["s1"] });
});

test("trim and split commands delegate exact composition operations and restore split selection", () => {
  const fixture = createFixture();
  fixture.commands.trimSegmentStart("s1", 0.4);
  fixture.commands.trimSegmentEnd("s1", -0.4);
  fixture.commands.splitSelectedSegmentAtPlayhead();
  assert.deepEqual(fixture.compositionMutations, [
    { type: "TRANSCRIPT_TRIM_SEGMENT", label: "Trim segment start", kind: "timing_adjustment",
      segmentId: "s1", trimStartSec: 0.4, trimEndSec: 2.4 },
    { type: "TRANSCRIPT_TRIM_SEGMENT", label: "Trim segment end", kind: "timing_adjustment",
      segmentId: "s1", trimStartSec: 0, trimEndSec: 1.6 },
    { type: "TRANSCRIPT_SPLIT", label: "Split segment at playhead", kind: "segment_structure",
      segmentId: "s1", splitTimeSec: 1, immediatePersist: true },
  ]);
});

test("selection commands preserve linked selection and selection-edit metadata", () => {
  const selected: Array<{ anchorSegmentId: string; focusSegmentId: string }> = [];
  const operations: HammerAuthorityOp[] = [];
  const authority = { getController: () => ({ getState: () => ({ selectedSegmentId: "s2" }) }) } as unknown as HammerHistoryCommandAuthority;
  const commands = createHammerTranscriptSelectionCommands({
    segments: createState().transcriptSegments,
    getSelectedRangeDetail: () => null,
    anchorId: "s1",
    focusId: "s1",
    range: { segmentIds: ["s1", "s2"] },
    timingHint: null,
    hasSelection: true,
    selectLinkedTarget: (selection) => { selected.push(selection); },
    clearLinkedSelection: () => undefined,
    setTimingHint: () => undefined,
    applyCompositionMutation: (op) => { operations.push(op); return entry; },
    historyAuthority: authority,
    setSelectionAnchor: () => undefined,
    setSelectionFocus: () => undefined,
    focusTime: () => undefined,
  });
  commands.applyTranscriptSelection("s2", true);
  commands.disableTranscriptSelection();
  commands.cutTranscriptSelection();
  assert.deepEqual(selected, [{ anchorSegmentId: "s1", focusSegmentId: "s2" }]);
  assert.deepEqual(operations, [
    { type: "TRANSCRIPT_TOGGLE_MUTE_SEGMENTS", label: "Disable transcript selection", kind: "segment_structure",
      segmentIds: ["s1", "s2"], disabled: true, immediatePersist: true },
    { type: "TRANSCRIPT_DELETE_RANGE", label: "Cut transcript selection", kind: "segment_structure",
      segmentIds: ["s1", "s2"], immediatePersist: true },
  ]);
});

test("shell delegates ordinary transcript mutations without merging adjacent authorities", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const shell = fs.readFileSync(path.join(root, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  const authority = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellTranscriptEditing.ts"), "utf8");
  assert.doesNotMatch(shell, /deriveAudioCutsForSubtractiveTextEdits|commitAudioCutSelection|moveSegmentTiming|trimSegmentStartTiming|trimSegmentEndTiming|updateSegmentGain/);
  assert.doesNotMatch(authority, /CleanupCandidate|DeadAir|Caption|shortCandidate|Snapshot|SourceDesk|AutomaticPlacement/);
});
