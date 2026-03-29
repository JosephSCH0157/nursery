import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC,
  LARGE_PLAYHEAD_NUDGE_SEC,
  SMALL_PLAYHEAD_NUDGE_SEC,
  cutSegmentRangeAndRipple,
  deleteSegmentAndRipple,
  moveSegmentTiming,
  resolveAdjacentBoundaryTime,
  resolveAdjacentJumpPointTime,
  resolveAdjacentSegmentSelection,
  resolveEffectivePlaybackTime,
  resolveFocusAfterPlayheadChange,
  resolvePlayheadAfterRangeCut,
  remapPlacementForRippleDelete,
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
import {
  getEffectiveCutRegions,
  getNextPlayableTime,
  isTimeInsideCut,
  normalizeCutOperations,
  resolveNextAudiblePlaybackTime,
} from "../src/editor/hammerAudioEditPlayback";

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

async function testBoundaryNavigation() {
  const boundaries = [0, 1, 2.5, 4];
  assert.equal(resolveAdjacentBoundaryTime({ boundaryTimesSec: boundaries, playheadSec: 2.5, direction: "previous" }), 1);
  assert.equal(resolveAdjacentBoundaryTime({ boundaryTimesSec: boundaries, playheadSec: 2.5, direction: "next" }), 4);
  assert.equal(resolveAdjacentBoundaryTime({ boundaryTimesSec: boundaries, playheadSec: 0.1, direction: "previous" }), 0);
  assert.equal(resolveAdjacentBoundaryTime({ boundaryTimesSec: boundaries, playheadSec: 3.9, direction: "next" }), 4);
}

async function testGenericJumpPointNavigation() {
  const points = [0.5, 1.2, 1.2, 3.7];
  assert.equal(resolveAdjacentJumpPointTime({ jumpPointsSec: points, playheadSec: 1.2, direction: "previous" }), 0.5);
  assert.equal(resolveAdjacentJumpPointTime({ jumpPointsSec: points, playheadSec: 1.2, direction: "next" }), 3.7);
  assert.equal(resolveAdjacentJumpPointTime({ jumpPointsSec: points, playheadSec: 0, direction: "previous" }), 0.5);
  assert.equal(resolveAdjacentJumpPointTime({ jumpPointsSec: points, playheadSec: 9, direction: "next" }), 3.7);
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

async function testAudioEditCutNormalization() {
  const normalized = normalizeCutOperations([
    { id: "cut_mid", type: "cut", start_sec: 2, end_sec: 3.5 },
    { id: "cut_overlap", type: "cut", start_sec: 3.4, end_sec: 4.5 },
    { id: "cut_adjacent", type: "cut", start_sec: 4.5004, end_sec: 5 },
    { id: "cut_start", type: "cut", start_sec: -2, end_sec: 0.8 },
    { id: "cut_tail", type: "cut", start_sec: 8.2, end_sec: 15 },
    { id: "cut_zero", type: "cut", start_sec: 6, end_sec: 6 },
  ], 10);

  assert.deepEqual(normalized, [
    { startSec: 0, endSec: 0.8 },
    { startSec: 2, endSec: 5 },
    { startSec: 8.2, endSec: 10 },
  ]);
}

async function testAudioEditNextPlayableTimeResolution() {
  const effectiveCutRegions = getEffectiveCutRegions({
    version: "v1",
    operations: [
      { id: "cut_start", type: "cut", start_sec: 0, end_sec: 1 },
      { id: "cut_mid_a", type: "cut", start_sec: 2, end_sec: 3 },
      { id: "cut_mid_b", type: "cut", start_sec: 3, end_sec: 4 },
      { id: "cut_tail", type: "cut", start_sec: 7.5, end_sec: 9 },
    ],
  }, 9);

  assert.equal(getNextPlayableTime({ effectiveCutRegions, timeSec: 1.4, durationSec: 9 }), 1.4);
  assert.equal(getNextPlayableTime({ effectiveCutRegions, timeSec: 0.2, durationSec: 9 }), 1);
  assert.equal(getNextPlayableTime({ effectiveCutRegions, timeSec: 2.2, durationSec: 9 }), 4);
  assert.equal(getNextPlayableTime({ effectiveCutRegions, timeSec: 8.1, durationSec: 9 }), null);

  const startResolved = getNextPlayableTime({ effectiveCutRegions, timeSec: 0, durationSec: 9 });
  assert.equal(startResolved, 1);
  assert.equal(startResolved != null && isTimeInsideCut(effectiveCutRegions, startResolved), false);
  assert.equal(isTimeInsideCut(effectiveCutRegions, 2.5), true);
  assert.equal(isTimeInsideCut(effectiveCutRegions, 4), false);

  const fullyCut = getEffectiveCutRegions({
    version: "v1",
    operations: [
      { id: "cut_all", type: "cut", start_sec: 0, end_sec: 20 },
    ],
  }, 9);
  assert.deepEqual(fullyCut, [{ startSec: 0, endSec: 9 }]);
  assert.equal(getNextPlayableTime({ effectiveCutRegions: fullyCut, timeSec: 0, durationSec: 9 }), null);
}

async function testResolveNextAudiblePlaybackTimeWithCuts() {
  const segments = [
    buildSegment({ segment_id: "a", start_sec: 0, end_sec: 2 }),
    buildSegment({ segment_id: "b", start_sec: 2, end_sec: 4, is_disabled: true }),
    buildSegment({ segment_id: "c", start_sec: 4, end_sec: 6 }),
  ];
  const effectiveCutRegions = getEffectiveCutRegions({
    version: "v1",
    operations: [
      { id: "cut_mid", type: "cut", start_sec: 4, end_sec: 5 },
      { id: "cut_tail", type: "cut", start_sec: 5.8, end_sec: 6 },
    ],
  }, 6);

  assert.equal(resolveNextAudiblePlaybackTime({
    requestedTimeSec: 0.5,
    durationSec: 6,
    effectiveCutRegions,
    transcriptSegments: segments,
  }), 0.5);
  assert.equal(resolveNextAudiblePlaybackTime({
    requestedTimeSec: 2.2,
    durationSec: 6,
    effectiveCutRegions,
    transcriptSegments: segments,
  }), 5);
  assert.equal(resolveNextAudiblePlaybackTime({
    requestedTimeSec: 5.9,
    durationSec: 6,
    effectiveCutRegions,
    transcriptSegments: segments,
  }), null);
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

async function testRippleDeletePlacementRemapMatrix() {
  const removedStartSec = 10;
  const removedEndSec = 14;

  const before = remapPlacementForRippleDelete({
    startSec: 6,
    endSec: 9,
    removedStartSec,
    removedEndSec,
  });
  assert.equal(before.kind, "unchanged");
  assert.equal(before.startSec, 6);
  assert.equal(before.endSec, 9);

  const after = remapPlacementForRippleDelete({
    startSec: 16,
    endSec: 18,
    removedStartSec,
    removedEndSec,
  });
  assert.equal(after.kind, "shifted");
  assert.equal(after.startSec, 12);
  assert.equal(after.endSec, 14);

  const inside = remapPlacementForRippleDelete({
    startSec: 10.2,
    endSec: 13.5,
    removedStartSec,
    removedEndSec,
  });
  assert.equal(inside.kind, "removed");

  const leftOverlap = remapPlacementForRippleDelete({
    startSec: 8,
    endSec: 11,
    removedStartSec,
    removedEndSec,
  });
  assert.equal(leftOverlap.kind, "trimmed");
  assert.equal(leftOverlap.startSec, 8);
  assert.equal(leftOverlap.endSec, 10);

  const rightOverlap = remapPlacementForRippleDelete({
    startSec: 12,
    endSec: 16,
    removedStartSec,
    removedEndSec,
  });
  assert.equal(rightOverlap.kind, "trimmed");
  assert.equal(rightOverlap.startSec, 10);
  assert.equal(rightOverlap.endSec, 12);

  const spanning = remapPlacementForRippleDelete({
    startSec: 7,
    endSec: 18,
    removedStartSec,
    removedEndSec,
  });
  assert.equal(spanning.kind, "bridged");
  assert.equal(spanning.startSec, 7);
  assert.equal(spanning.endSec, 14);
  assert.equal(spanning.needsAttention, true);
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
  await testBoundaryNavigation();
  await testGenericJumpPointNavigation();
  await testDeleteSelectionHandoff();
  await testDisableAndGainEdits();
  await testDisabledSegmentsExcludedFromEffectivePlaybackTime();
  await testAudioEditCutNormalization();
  await testAudioEditNextPlayableTimeResolution();
  await testResolveNextAudiblePlaybackTimeWithCuts();
  await testResolveTranscriptRange();
  await testCutRangeAndRipple();
  await testRippleDeletePlacementRemapMatrix();
  // eslint-disable-next-line no-console
  console.log("Hammer workspace timeline tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer workspace timeline tests failed:", error);
  process.exit(1);
});
