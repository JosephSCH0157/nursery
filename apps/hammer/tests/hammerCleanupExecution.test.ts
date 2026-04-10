import assert from "node:assert/strict";
import {
  deriveAudioCutsForRemovedSegments,
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

await testFillerPaddingExpandsCut();
await testPaddingClampedToDuration();
await testNoPaddingLeavesWindowUntouched();

console.log("Hammer cleanup execution tests passed.");

