import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  resolveSelectedSegmentId,
  resolveTranscriptDurationSec,
  syncEditableTranscriptSegments,
  updateTranscriptSegmentSpeaker,
  updateTranscriptSegmentText,
} from "../src/editor/hammerWorkspaceTranscript";

function buildSegment(overrides?: Partial<HammerTranscriptSegment>): HammerTranscriptSegment {
  return {
    segment_id: "seg_001",
    speaker: "Host",
    text: "Welcome back.",
    start_sec: 10,
    end_sec: 12,
    ...overrides,
  };
}

async function testSelectionResolution() {
  const segments = [
    buildSegment({ segment_id: "a" }),
    buildSegment({ segment_id: "b" }),
  ];

  assert.equal(resolveSelectedSegmentId(segments, "b"), "b");
  assert.equal(resolveSelectedSegmentId(segments, "missing"), "a");
  assert.equal(resolveSelectedSegmentId([], "a"), null);
  assert.equal(resolveSelectedSegmentId(segments, null), "a");
}

async function testSyncEditableSegments() {
  const segments = [
    buildSegment({ segment_id: "a" }),
    buildSegment({ segment_id: "b" }),
  ];

  const preserved = syncEditableTranscriptSegments(segments, "b");
  assert.equal(preserved.selectedSegmentId, "b");
  assert.equal(preserved.segments.length, 2);

  const reset = syncEditableTranscriptSegments(segments, "missing");
  assert.equal(reset.selectedSegmentId, "a");
}

async function testSegmentEdits() {
  const segments = [
    buildSegment({ segment_id: "a", speaker: "Host", text: "Original A" }),
    buildSegment({ segment_id: "b", speaker: "Guest", text: "Original B" }),
  ];

  const speakerEdited = updateTranscriptSegmentSpeaker(segments, "b", "Panelist");
  assert.equal(speakerEdited[0]?.speaker, "Host");
  assert.equal(speakerEdited[1]?.speaker, "Panelist");

  const textEdited = updateTranscriptSegmentText(segments, "a", "Updated A");
  assert.equal(textEdited[0]?.text, "Updated A");
  assert.equal(textEdited[1]?.text, "Original B");
}

async function testTranscriptDuration() {
  const segments = [
    buildSegment({ segment_id: "a", end_sec: 8 }),
    buildSegment({ segment_id: "b", end_sec: 22 }),
  ];
  assert.equal(resolveTranscriptDurationSec(segments), 32);
  assert.equal(resolveTranscriptDurationSec(segments, 12), 22);
  assert.equal(resolveTranscriptDurationSec([], 15), 15);
}

async function run() {
  await testSelectionResolution();
  await testSyncEditableSegments();
  await testSegmentEdits();
  await testTranscriptDuration();
  // eslint-disable-next-line no-console
  console.log("Hammer workspace transcript tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer workspace transcript tests failed:", error);
  process.exit(1);
});
