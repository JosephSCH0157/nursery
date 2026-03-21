import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  moveSegmentTiming,
  resolveFocusAfterPlayheadChange,
  resolvePreviewLabel,
  resolvePlayheadSegment,
  resolveWorkspaceFocusMode,
  trimSegmentEndTiming,
  trimSegmentStartTiming,
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

async function run() {
  await testFocusModeDefaults();
  await testMoveAndTrimTiming();
  await testPlayheadResolution();
  await testFocusAndPreviewResolution();
  await testSegmentListUpdate();
  // eslint-disable-next-line no-console
  console.log("Hammer workspace timeline tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer workspace timeline tests failed:", error);
  process.exit(1);
});
