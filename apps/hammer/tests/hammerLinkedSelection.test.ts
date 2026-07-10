import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  buildLinkedSelectionTranscriptSegmentIdSet,
  buildLinkedSelectionVisualIdSet,
  resolveSelectionFromTimeline,
  resolveSelectionFromTranscript,
  resolveSelectionFromVisual,
} from "../src/editor/hammerLinkedSelection";

function buildSegment(overrides?: Partial<HammerTranscriptSegment>): HammerTranscriptSegment {
  return {
    segment_id: "seg-1",
    speaker: "Host",
    text: "sample",
    start_sec: 0,
    end_sec: 1,
    ...overrides,
  };
}

function buildSegments(): HammerTranscriptSegment[] {
  return [
    buildSegment({ segment_id: "seg-1", text: "alpha", start_sec: 0, end_sec: 1.2 }),
    buildSegment({ segment_id: "seg-2", text: "beta", start_sec: 1.2, end_sec: 2.6 }),
    buildSegment({ segment_id: "seg-3", text: "gamma", start_sec: 2.6, end_sec: 4.1 }),
  ];
}

function buildVisuals() {
  return [
    { id: "vis-1", anchorSegmentId: "seg-1", startSec: 0, endSec: 1.2 },
    { id: "vis-2", anchorSegmentId: "seg-2", startSec: 1.2, endSec: 2.6 },
    { id: "vis-3", anchorSegmentId: "seg-2", startSec: 1.25, endSec: 2.55 },
    { id: "vis-4", anchorSegmentId: null, startSec: 4.2, endSec: 5.1 },
  ];
}

async function testTranscriptSelectionResolvesTimelineAndVisuals() {
  const selection = resolveSelectionFromTranscript({
    transcriptSegments: buildSegments(),
    visualItems: buildVisuals(),
    anchorSegmentId: "seg-1",
    focusSegmentId: "seg-2",
  });

  assert.ok(selection);
  assert.equal(selection.kind, "transcript");
  assert.equal(selection.anchorId, "seg-2");
  assert.deepEqual(selection.timeRange, { startSec: 0, endSec: 2.6 });
  assert.deepEqual(selection.transcriptRange?.segmentIds, ["seg-1", "seg-2"]);
  assert.deepEqual(selection.visualIds, ["vis-1", "vis-2", "vis-3"]);
  assert.equal(selection.primaryVisualId, "vis-1");
  assert.equal(selection.isLinked, true);
}

async function testTimelineSelectionResolvesTranscriptAndVisuals() {
  const selection = resolveSelectionFromTimeline({
    transcriptSegments: buildSegments(),
    visualItems: buildVisuals(),
    startSec: 1,
    endSec: 3,
  });

  assert.ok(selection);
  assert.equal(selection.kind, "timeline");
  assert.deepEqual(selection.transcriptRange?.segmentIds, ["seg-1", "seg-2", "seg-3"]);
  assert.deepEqual(selection.visualIds, ["vis-1", "vis-2", "vis-3"]);
  assert.equal(selection.isLinked, true);
}

async function testVisualSelectionResolvesTranscriptAndSiblingVisuals() {
  const selection = resolveSelectionFromVisual({
    transcriptSegments: buildSegments(),
    visualItems: buildVisuals(),
    visualId: "vis-2",
  });

  assert.ok(selection);
  assert.equal(selection.kind, "visual");
  assert.equal(selection.anchorId, "seg-2");
  assert.deepEqual(selection.transcriptRange?.segmentIds, ["seg-2"]);
  assert.deepEqual(selection.visualIds, ["vis-2", "vis-3"]);
  assert.equal(selection.primaryVisualId, "vis-2");
  assert.equal(selection.isLinked, true);
}

async function testBrokenVisualAnchorRemainsSelectableButUnlinked() {
  const selection = resolveSelectionFromVisual({
    transcriptSegments: buildSegments(),
    visualItems: buildVisuals(),
    visualId: "vis-4",
  });

  assert.ok(selection);
  assert.equal(selection.anchorId, null);
  assert.equal(selection.transcriptRange, null);
  assert.deepEqual(selection.visualIds, ["vis-4"]);
  assert.equal(selection.primaryVisualId, "vis-4");
  assert.equal(selection.isLinked, false);
}

async function testSelectionSetHelpersReflectResolvedSelection() {
  const selection = resolveSelectionFromVisual({
    transcriptSegments: buildSegments(),
    visualItems: buildVisuals(),
    visualId: "vis-2",
  });

  assert.deepEqual([...buildLinkedSelectionTranscriptSegmentIdSet(selection)], ["seg-2"]);
  assert.deepEqual([...buildLinkedSelectionVisualIdSet(selection)], ["vis-2", "vis-3"]);
}

async function run() {
  await testTranscriptSelectionResolvesTimelineAndVisuals();
  await testTimelineSelectionResolvesTranscriptAndVisuals();
  await testVisualSelectionResolvesTranscriptAndSiblingVisuals();
  await testBrokenVisualAnchorRemainsSelectableButUnlinked();
  await testSelectionSetHelpersReflectResolvedSelection();
  // eslint-disable-next-line no-console
  console.log("Hammer linked selection tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer linked selection tests failed:", error);
  process.exit(1);
});
