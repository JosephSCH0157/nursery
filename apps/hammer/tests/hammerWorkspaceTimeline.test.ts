import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC,
  LARGE_PLAYHEAD_NUDGE_SEC,
  SMALL_PLAYHEAD_NUDGE_SEC,
  cutSegmentRangeAndRipple,
  deleteSegmentAndRipple,
  moveSegmentTiming,
  resolveAdjacentSegmentSelection,
  resolveEffectivePlaybackTime,
  resolveFocusAfterPlayheadChange,
  resolvePlayheadAfterRangeCut,
  resolveSelectedSegmentAfterDelete,
  resolveTranscriptSegmentRange,
  resolveTimelineBoundaryTimes,
  resolvePlayheadAfterDelete,
  resolvePreviewLabel,
  resolvePlayheadSegment,
  resolveWorkspaceFocusMode,
  snapPlayheadToBoundary,
  splitSegmentAtTime,
  toggleSegmentDisabled,
  trimSegmentEndTiming,
  trimSegmentStartTiming,
  updateSegmentGain,
  updateSegmentInTimeline,
} from "../src/editor/hammerWorkspaceTimeline";

function buildSegment(overrides?: Partial<HammerTranscriptSegment>): HammerTranscriptSegment {
  return {
    segment_id: "seg_001",
    speaker: "Host",
    text: "Welcome back.",
    start_sec: 10,
    end_sec: 12,
    confidence: 0.95,
    ...overrides,
  };
}

async function testFocusModeDefaults() {
  assert.equal(resolveWorkspaceFocusMode("polish"), "source-focus");
  assert.equal(resolveWorkspaceFocusMode("audio"), "tool-focus");
  assert.equal(resolveWorkspaceFocusMode("video"), "tool-focus");
  assert.equal(resolveWorkspaceFocusMode("details"), "balanced");
}

async function testMoveAndTrimTiming() {
  const movedLeft = moveSegmentTiming(buildSegment({ start_sec: 0.2, end_sec: 2.2 }), -0.5);
  assert.equal(movedLeft.start_sec, 0);
  assert.equal(movedLeft.end_sec, 2);

  const movedRight = moveSegmentTiming(buildSegment(), 0.5);
  assert.equal(movedRight.start_sec, 10.5);
  assert.equal(movedRight.end_sec, 12.5);

  const trimmedStart = trimSegmentStartTiming(buildSegment(), 0.1);
  assert.equal(trimmedStart.start_sec, 10.1);
  assert.equal(trimmedStart.end_sec, 12.1);

  const trimmedEnd = trimSegmentEndTiming(buildSegment(), -1.95);
  assert.equal(trimmedEnd.end_sec, 10.1);
}

async function testPlayheadResolution() {
  const segments = [
    buildSegment({ segment_id: "a", start_sec: 1, end_sec: 2 }),
    buildSegment({ segment_id: "b", start_sec: 3, end_sec: 4 }),
  ];

  assert.equal(resolvePlayheadSegment(segments, 1.5)?.segment_id, "a");
  assert.equal(resolvePlayheadSegment(segments, 3.2)?.segment_id, "b");
  assert.equal(resolvePlayheadSegment(segments, 2.5), null);
}

async function testFocusAndPreviewResolution() {
  assert.equal(resolveFocusAfterPlayheadChange("auto"), "time-focus");
  assert.equal(resolveFocusAfterPlayheadChange("tool-focus"), "tool-focus");

  const segment = buildSegment({ speaker: "Guest", text: "Testing one two." });
  assert.equal(resolvePreviewLabel(segment, 10.4), "Guest: Testing one two.");
  assert.equal(resolvePreviewLabel(null, 9.9), "Timeline gap at 9.9s");
}

async function testSegmentListUpdate() {
  const segments = [
    buildSegment({ segment_id: "a", text: "A" }),
    buildSegment({ segment_id: "b", text: "B" }),
  ];

  const updated = updateSegmentInTimeline(segments, "b", (segment) => ({
    ...segment,
    text: "B updated",
  }));

  assert.equal(updated[0]?.text, "A");
  assert.equal(updated[1]?.text, "B updated");
}

async function testSplitSegmentAtPlayhead() {
  const segments = [
    buildSegment({ segment_id: "seg_a", start_sec: 0, end_sec: 2, text: "Part A" }),
    buildSegment({ segment_id: "seg_b", start_sec: 2, end_sec: 4, text: "Part B" }),
  ];

  const split = splitSegmentAtTime(segments, "seg_a", 1.2);
  assert.equal(split.changed, true);
  assert.equal(split.segments.length, 3);
  assert.equal(split.segments[0]?.start_sec, 0);
  assert.equal(split.segments[0]?.end_sec, 1.2);
  assert.equal(split.segments[1]?.start_sec, 1.2);
  assert.equal(split.segments[1]?.end_sec, 2);
  assert.equal(split.segments[2]?.segment_id, "seg_b");
}

async function testDeleteSegmentAndRipple() {
  const segments = [
    buildSegment({ segment_id: "seg_a", start_sec: 0, end_sec: 1 }),
    buildSegment({ segment_id: "seg_b", start_sec: 1, end_sec: 2 }),
    buildSegment({ segment_id: "seg_c", start_sec: 2, end_sec: 3 }),
  ];

  const deleted = deleteSegmentAndRipple(segments, "seg_b");
  assert.equal(deleted.changed, true);
  assert.equal(deleted.segments.length, 2);
  assert.equal(deleted.shiftSec, 1);
  assert.equal(deleted.segments[0]?.segment_id, "seg_a");
  assert.equal(deleted.segments[0]?.start_sec, 0);
  assert.equal(deleted.segments[0]?.end_sec, 1);
  assert.equal(deleted.segments[1]?.segment_id, "seg_c");
  assert.equal(deleted.segments[1]?.start_sec, 1);
  assert.equal(deleted.segments[1]?.end_sec, 2);
}

async function testResolvePlayheadAfterDelete() {
  const removed = buildSegment({ segment_id: "seg_b", start_sec: 2, end_sec: 3 });
  assert.equal(resolvePlayheadAfterDelete(1.5, removed, 1), 1.5);
  assert.equal(resolvePlayheadAfterDelete(2.5, removed, 1), 2);
  assert.equal(resolvePlayheadAfterDelete(4.2, removed, 1), 3.2);
}

async function testPlayheadSnapAndNavigation() {
  const segments = [
    buildSegment({ segment_id: "a", start_sec: 0, end_sec: 1 }),
    buildSegment({ segment_id: "b", start_sec: 1, end_sec: 2 }),
    buildSegment({ segment_id: "c", start_sec: 2, end_sec: 3 }),
  ];
  const boundaries = resolveTimelineBoundaryTimes(segments);
  assert.deepEqual(boundaries, [0, 1, 2, 3]);
  assert.equal(
    snapPlayheadToBoundary({
      nextPlayheadSec: 1.16,
      boundaryTimesSec: boundaries,
      toleranceSec: DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC,
    }),
    1,
  );
  assert.equal(
    snapPlayheadToBoundary({
      nextPlayheadSec: 1.6,
      boundaryTimesSec: boundaries,
      toleranceSec: 0.1,
    }),
    1.6,
  );
  assert.equal(resolveAdjacentSegmentSelection(segments, "b", "previous"), "a");
  assert.equal(resolveAdjacentSegmentSelection(segments, "b", "next"), "c");
}

async function testDeleteSelectionHandoff() {
  const segments = [
    buildSegment({ segment_id: "a", start_sec: 0, end_sec: 1 }),
    buildSegment({ segment_id: "c", start_sec: 1, end_sec: 2 }),
  ];
  assert.equal(resolveSelectedSegmentAfterDelete({ segmentsAfterDelete: segments, removedIndex: 0 }), "a");
  assert.equal(resolveSelectedSegmentAfterDelete({ segmentsAfterDelete: segments, removedIndex: 1 }), "c");
  assert.equal(resolveSelectedSegmentAfterDelete({ segmentsAfterDelete: [], removedIndex: 0 }), null);
}

async function testDisableAndGainEdits() {
  const segment = buildSegment({ segment_id: "a", start_sec: 0, end_sec: 1 });
  const toggled = toggleSegmentDisabled(segment);
  assert.equal(toggled.is_disabled, true);
  const untoggled = toggleSegmentDisabled(toggled);
  assert.equal(untoggled.is_disabled, false);

  const louder = updateSegmentGain(segment, LARGE_PLAYHEAD_NUDGE_SEC);
  assert.equal(louder.gain_db, LARGE_PLAYHEAD_NUDGE_SEC);
  const quieter = updateSegmentGain(louder, -SMALL_PLAYHEAD_NUDGE_SEC);
  assert.equal(quieter.gain_db, 0.9);
}

async function testDisabledSegmentsExcludedFromEffectivePlaybackTime() {
  const segments = [
    buildSegment({ segment_id: "a", start_sec: 0, end_sec: 1 }),
    buildSegment({ segment_id: "b", start_sec: 1, end_sec: 2, is_disabled: true }),
    buildSegment({ segment_id: "c", start_sec: 2, end_sec: 3 }),
  ];
  assert.equal(resolveEffectivePlaybackTime(segments, 0.5), 0.5);
  assert.equal(resolveEffectivePlaybackTime(segments, 1.4), 2);
}

async function testResolveTranscriptRange() {
  const segments = [
    buildSegment({ segment_id: "a", start_sec: 0, end_sec: 1 }),
    buildSegment({ segment_id: "b", start_sec: 1, end_sec: 2 }),
    buildSegment({ segment_id: "c", start_sec: 2, end_sec: 3 }),
  ];
  const range = resolveTranscriptSegmentRange({
    segments,
    anchorSegmentId: "c",
    focusSegmentId: "b",
  });
  assert.deepEqual(range.segmentIds, ["b", "c"]);
  assert.equal(range.startSec, 1);
  assert.equal(range.endSec, 3);
}

async function testCutRangeAndRipple() {
  const segments = [
    buildSegment({ segment_id: "a", start_sec: 0, end_sec: 1 }),
    buildSegment({ segment_id: "b", start_sec: 1, end_sec: 2 }),
    buildSegment({ segment_id: "c", start_sec: 2, end_sec: 3 }),
    buildSegment({ segment_id: "d", start_sec: 3, end_sec: 4 }),
  ];
  const cut = cutSegmentRangeAndRipple({
    segments,
    segmentIds: ["b", "c"],
  });
  assert.equal(cut.changed, true);
  assert.deepEqual(cut.removedSegmentIds, ["b", "c"]);
  assert.equal(cut.shiftSec, 2);
  assert.equal(cut.segments.length, 2);
  assert.equal(cut.segments[0]?.segment_id, "a");
  assert.equal(cut.segments[1]?.segment_id, "d");
  assert.equal(cut.segments[1]?.start_sec, 1);
  assert.equal(cut.segments[1]?.end_sec, 2);
  assert.equal(
    resolvePlayheadAfterRangeCut({
      playheadSec: 2.4,
      removedStartSec: cut.removedStartSec ?? 0,
      removedEndSec: cut.removedEndSec ?? 0,
      shiftSec: cut.shiftSec,
    }),
    1,
  );
}

async function run() {
  await testFocusModeDefaults();
  await testMoveAndTrimTiming();
  await testPlayheadResolution();
  await testFocusAndPreviewResolution();
  await testSegmentListUpdate();
  await testSplitSegmentAtPlayhead();
  await testDeleteSegmentAndRipple();
  await testResolvePlayheadAfterDelete();
  await testPlayheadSnapAndNavigation();
  await testDeleteSelectionHandoff();
  await testDisableAndGainEdits();
  await testDisabledSegmentsExcludedFromEffectivePlaybackTime();
  await testResolveTranscriptRange();
  await testCutRangeAndRipple();
  // eslint-disable-next-line no-console
  console.log("Hammer workspace timeline tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer workspace timeline tests failed:", error);
  process.exit(1);
});
