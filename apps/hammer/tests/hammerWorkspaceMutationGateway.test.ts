import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import type { HammerEditorStateSerializable } from "../src/editor/hammerWorkspaceHistory";
import {
  applyWorkspaceVisualTimelineActions,
  createHammerWorkspaceMutationGateway,
  replaceWorkspaceVisualTimelineState,
  resolveCanonicalWorkspaceVisualTimeline,
} from "../src/editor/hammerWorkspaceMutationGateway";
import { createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";

function state(): HammerEditorStateSerializable {
  return {
    transcriptSegments: [{ segment_id: "s1", speaker: "Host", text: "hello", start_sec: 0, end_sec: 1 }],
    visualPlacements: null,
    visualTimeline: createEmptyVisualTimelineState({ updated_at: "2026-08-17T00:00:00.000Z" }),
    audioEdit: null,
    studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: null,
    outputSelection: { layerId: null, sourceRecipeRef: null },
    selectedSegmentId: "s1",
    playheadSec: 0.25,
    transcriptTimingHint: "ready",
  };
}

test("timeline gateway preserves reducer action ordering and legacy projection", () => {
  const before = state();
  const after = applyWorkspaceVisualTimelineActions(before, [
    { type: "SELECT_CLIP", clip_id: "clip-first" },
    { type: "SELECT_CLIP", clip_id: "clip-final" },
  ]);
  assert.equal(after.visualTimeline?.selected_clip_id, "clip-final");
  assert.equal(before.visualTimeline?.selected_clip_id, null);
  assert.ok(after.visualPlacements);
  const replacement = replaceWorkspaceVisualTimelineState(before, (timeline) => ({ ...timeline, updated_at: "2026-08-18T00:00:00.000Z" }));
  assert.equal(replacement.visualTimeline?.updated_at, "2026-08-18T00:00:00.000Z");
  assert.equal(resolveCanonicalWorkspaceVisualTimeline(before), before.visualTimeline);
});

test("workspace gateway applies normalized state, diagnostics, selection, and cleanup in exact order", () => {
  const before = state();
  const calls: string[] = [];
  let capturedReason = "";
  const gateway = createHammerWorkspaceMutationGateway({
    capture: { segments: before.transcriptSegments, visualPlacements: before.visualPlacements,
      visualTimeline: before.visualTimeline, audioEdit: before.audioEdit, studioRack: before.studioRack,
      editorialAuthorityGraph: before.editorialAuthorityGraph, outputSelection: before.outputSelection,
      selectedSegmentId: before.selectedSegmentId, playheadSec: before.playheadSec,
      transcriptTimingHint: before.transcriptTimingHint },
    getCurrentTimeline: () => before.visualTimeline,
    getMediaUpdateReason: () => "history_apply",
    setTimelineUpdateReason: (reason) => { capturedReason = reason; calls.push("reason"); },
    setPlacementOutboundDiagnostics: (value) => { assert.equal(value.reason, "history:replay_apply"); calls.push("diagnostics"); },
    setTranscriptSegments: () => calls.push("transcript"), setVisualTimeline: () => calls.push("timeline"),
    setStudioRack: () => calls.push("rack"), setEditorialAuthorityGraph: () => calls.push("graph"),
    setOutputSelection: () => calls.push("output"), setSelectedSegmentId: () => calls.push("segment"),
    setPlayheadSec: () => calls.push("playhead"), setTranscriptTimingHint: () => calls.push("hint"),
    linkedSelectionVisualItems: [], setLinkedSelection: () => calls.push("selection"),
    applyAudioEdit: () => calls.push("audio"), invalidateCleanupPreview: () => calls.push("cleanup"),
  });
  gateway.applyWorkspaceState(before, "history:replay_apply");
  assert.equal(capturedReason, "history:replay_apply");
  assert.deepEqual(calls, ["reason", "diagnostics", "transcript", "timeline", "rack", "graph", "output",
    "segment", "playhead", "hint", "selection", "audio", "cleanup"]);
  assert.deepEqual(gateway.captureWorkspaceState(), before);
});
