import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import type { HammerEditorStateSerializable } from "../src/editor/hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs } from "../src/editor/hammerWorkspaceShellHistoryController";
import {
  captureHammerPostHistorySaveRequest,
  executeHammerCompositionHistoryMutation,
  normalizeHammerHistoryCompatibilityState,
} from "../src/editor/hammerCompositionHistoryCommands";

function state(): HammerEditorStateSerializable {
  return { transcriptSegments: [{ segment_id: "s1", speaker: "Host", text: "hello", start_sec: 0, end_sec: 1 }],
    visualPlacements: null, visualTimeline: null, audioEdit: null, studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: null, outputSelection: { layerId: null, sourceRecipeRef: null },
    selectedSegmentId: "s1", playheadSec: 0, transcriptTimingHint: null };
}

test("composition history construction preserves exact command metadata and before-after state", () => {
  const before = state();
  const commands: HammerHistoryMutationArgs[] = [];
  executeHammerCompositionHistoryMutation({
    op: { type: "TRANSCRIPT_TOGGLE_MUTE_SEGMENTS", label: "Mute selection", segmentIds: ["s1"], disabled: true,
      kind: "segment_structure", toolId: "transcript", immediatePersist: true },
    applyMutation: (next) => { commands.push(next); return null; }, playbackDurationSec: 1, waveformProxy: null,
    authorityFallback: { graphId: "g1", workspaceId: "w1", workpieceId: "p1", sessionId: "session1", sourceTranscriptId: "t1" },
  });
  const command = commands[0]!;
  assert.deepEqual({ label: command.label, kind: command.kind, toolId: command.toolId,
    affectedSegments: command.affectedSegments, immediatePersist: command.immediatePersist }, {
    label: "Mute selection", kind: "segment_structure", toolId: "transcript",
    affectedSegments: ["s1"], immediatePersist: true,
  });
  const after = command.computeAfter(before);
  assert.notDeepEqual(after, before);
  assert.equal(after.editorialAuthorityGraph?.operations[0]?.instruction.type, "mute");
  assert.equal(before.editorialAuthorityGraph, null);
});

test("snapshot request is structurally captured and compatibility normalization remains isolated", () => {
  const editorState = state();
  const request = captureHammerPostHistorySaveRequest({ document: { workpieceId: "p1", sessionId: "s1",
    baseRevisionId: "r1", headEntryId: "e1", undoStack: ["e1"], redoStack: [] }, editorState });
  editorState.transcriptSegments[0]!.text = "later";
  assert.equal(request.editorState.transcriptSegments[0]?.text, "hello");
  assert.deepEqual({ head: request.headEntryId, undo: request.undoDepth, redo: request.redoDepth },
    { head: "e1", undo: 1, redo: 0 });
  assert.equal(normalizeHammerHistoryCompatibilityState({ state: state(), fallbackTimeline: null }).visualTimeline, null);
});

test("shell delegates composition construction without absorbing adjacent authorities", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const shell = fs.readFileSync(path.join(root, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  const authority = fs.readFileSync(path.join(root, "src/editor/hammerCompositionHistoryCommands.ts"), "utf8");
  assert.doesNotMatch(shell, /applyTranscript(?:DeleteRange|CleanupPreview|ToggleMuteSegments|Split|TrimSegment)Composition/);
  assert.doesNotMatch(authority, /SourceDesk|AutomaticPlacement|buildHammerReleasePrepPackage|shortCandidate/i);
});
