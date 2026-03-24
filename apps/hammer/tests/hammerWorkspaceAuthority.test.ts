import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  moveSegmentTiming,
  resolvePlayheadSegment,
  resolvePreviewLabel,
  trimSegmentEndTiming,
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

async function testTimelineEditDrivesPreviewLabel() {
  const segments: HammerTranscriptSegment[] = [
    buildSegment({ segment_id: "a", speaker: "Host", text: "Alpha", start_sec: 0, end_sec: 2 }),
    buildSegment({ segment_id: "b", speaker: "Guest", text: "Beta", start_sec: 3, end_sec: 5 }),
  ];

  // 1) Initial playhead resolves to the first segment.
  const initialPlayhead = 1.2;
  const initialSegment = resolvePlayheadSegment(segments, initialPlayhead);
  assert.equal(resolvePreviewLabel(initialSegment, initialPlayhead), "Host: Alpha");

  // 2) Timeline edit moves segment "a" out of the current playhead range.
  const movedSegments = updateSegmentInTimeline(segments, "a", (segment) => moveSegmentTiming(segment, 4));
  const afterMoveSegment = resolvePlayheadSegment(movedSegments, initialPlayhead);
  assert.equal(afterMoveSegment, null);
  assert.equal(resolvePreviewLabel(afterMoveSegment, initialPlayhead), "Timeline gap at 1.2s");

  // 3) Playhead moved into the new segment range resolves updated preview content.
  const movedPlayhead = 4.3;
  const movedSegment = resolvePlayheadSegment(movedSegments, movedPlayhead);
  assert.equal(resolvePreviewLabel(movedSegment, movedPlayhead), "Host: Alpha");

  // 4) Timeline trim updates resolvable range deterministically.
  const trimmedSegments = updateSegmentInTimeline(movedSegments, "a", (segment) => trimSegmentEndTiming(segment, -1.9));
  const nearEndPlayhead = 5.9;
  const trimmedSegment = resolvePlayheadSegment(trimmedSegments, nearEndPlayhead);
  assert.equal(trimmedSegment, null);
  assert.equal(resolvePreviewLabel(trimmedSegment, nearEndPlayhead), "Timeline gap at 5.9s");
}

async function run() {
  await testTimelineEditDrivesPreviewLabel();
  // eslint-disable-next-line no-console
  console.log("Hammer workspace authority tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer workspace authority tests failed:", error);
  process.exit(1);
});
