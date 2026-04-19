import assert from "node:assert/strict";
import {
  deriveAudioCutsForRemovedSegments,
  deriveAudioCutsForSubtractiveTextEdits,
  deriveAudioCutsForTimelineCompression,
  HAMMER_FILLER_CUT_PAD_AFTER_SEC,
  HAMMER_FILLER_CUT_PAD_BEFORE_SEC,
} from "../src/editor/hammerCleanupExecution";

function seg(args: { id: string; start: number; end: number }) {
  return {
    segment_id: args.id,
    start_sec: args.start,
    end_sec: args.end,
    speaker: "S1",
    text: args.id,
  };
}

async function testFillerPaddingExpandsCut() {
  const cuts = deriveAudioCutsForRemovedSegments({
    segments: [
      seg({ id: "a", start: 0.0, end: 1.0 }),
      seg({ id: "f", start: 1.0, end: 1.2 }),
      seg({ id: "b", start: 1.2, end: 2.0 }),
    ] as never,
    removeSegmentIds: ["f"],
    durationSec: 10,
    padBeforeSec: HAMMER_FILLER_CUT_PAD_BEFORE_SEC,
    padAfterSec: HAMMER_FILLER_CUT_PAD_AFTER_SEC,
  });

  assert.equal(cuts.length, 1);
  assert.equal(cuts[0]?.startSec, 0.98);
  assert.equal(cuts[0]?.endSec, 1.22);
}

async function testPaddingClampedToDuration() {
  const cuts = deriveAudioCutsForRemovedSegments({
    segments: [
      seg({ id: "f", start: 0.01, end: 0.05 }),
    ] as never,
    removeSegmentIds: ["f"],
    durationSec: 0.06,
    padBeforeSec: 0.02,
    padAfterSec: 0.02,
  });

  assert.equal(cuts.length, 1);
  assert.equal(cuts[0]?.startSec, 0);
  assert.equal(cuts[0]?.endSec, 0.06);
}

async function testNoPaddingLeavesWindowUntouched() {
  const cuts = deriveAudioCutsForRemovedSegments({
    segments: [
      seg({ id: "f", start: 1.0, end: 1.2 }),
    ] as never,
    removeSegmentIds: ["f"],
    durationSec: 10,
  });

  assert.equal(cuts.length, 1);
  assert.equal(cuts[0]?.startSec, 1.0);
  assert.equal(cuts[0]?.endSec, 1.2);
}

async function testCleanupTimelineCompressionCanPadRetakeRemoval() {
  const cuts = deriveAudioCutsForTimelineCompression({
    beforeSegments: [
      seg({ id: "a", start: 0.0, end: 1.0 }),
      seg({ id: "retake", start: 1.0, end: 1.2 }),
      seg({ id: "b", start: 1.2, end: 2.0 }),
    ] as never,
    afterSegments: [
      seg({ id: "a", start: 0.0, end: 1.0 }),
      seg({ id: "b", start: 1.0, end: 1.8 }),
    ] as never,
    durationSec: 10,
    padBeforeSec: HAMMER_FILLER_CUT_PAD_BEFORE_SEC,
    padAfterSec: HAMMER_FILLER_CUT_PAD_AFTER_SEC,
  });

  assert.equal(cuts.length, 1);
  assert.equal(cuts[0]?.startSec, 0.98);
  assert.equal(cuts[0]?.endSec, 1.22);
}

async function testCleanupSubtractiveTextCutsCanPadSingleWordRemoval() {
  const cuts = deriveAudioCutsForSubtractiveTextEdits({
    beforeSegments: [
      {
        segment_id: "a",
        start_sec: 1.0,
        end_sec: 2.0,
        speaker: "S1",
        text: "um this is fine",
      },
    ] as never,
    afterSegments: [
      {
        segment_id: "a",
        start_sec: 1.0,
        end_sec: 2.0,
        speaker: "S1",
        text: "this is fine",
      },
    ] as never,
    durationSec: 10,
    padBeforeSec: HAMMER_FILLER_CUT_PAD_BEFORE_SEC,
    padAfterSec: HAMMER_FILLER_CUT_PAD_AFTER_SEC,
  });

  assert.equal(cuts.length, 1);
  assert.equal(cuts[0]?.startSec, 0.98);
  assert.equal(cuts[0]?.endSec, 1.27);
}

await testFillerPaddingExpandsCut();
await testPaddingClampedToDuration();
await testNoPaddingLeavesWindowUntouched();
await testCleanupTimelineCompressionCanPadRetakeRemoval();
await testCleanupSubtractiveTextCutsCanPadSingleWordRemoval();

console.log("Hammer cleanup execution tests passed.");

