import assert from "node:assert/strict";
import type { HammerTranscriptSegment } from "../../../packages/contracts/hammer/transcript.contract";
import {
  previewQuickClean,
  previewRemoveFillers,
  previewRemoveRetakes,
  previewShortenGaps,
} from "../src/editor/hammerCleanupTools";

function s(id: string, start: number, end: number, speaker: string, text: string): HammerTranscriptSegment {
  return { segment_id: id, start_sec: start, end_sec: end, speaker, text };
}

async function testShortenGapsDeterministic() {
  const segments = [
    s("a", 0, 1, "Host", "hello"),
    s("b", 2.2, 3, "Host", "next"),
  ];
  const first = previewShortenGaps(segments, { maxGapSec: 0.4, minPauseSec: 0.1, preserveDramaticPauses: false });
  const second = previewShortenGaps(segments, { maxGapSec: 0.4, minPauseSec: 0.1, preserveDramaticPauses: false });
  assert.deepEqual(first, second);
  assert.equal(first.summary.changedSegments, 1);
}

async function testFillerRemovalDeterministic() {
  const segments = [
    s("a", 0, 1.3, "Host", "Um I mean this is, like, fine."),
  ];
  const preview = previewRemoveFillers(segments, { aggressiveness: "medium", protectIntentionalPhrasing: true });
  assert.equal(preview.summary.changedSegments, 1);
  assert.equal(preview.resultSegments[0]?.text.includes("um"), false);
}

async function testRetakeRemovalDeterministic() {
  const segments = [
    s("a", 0, 1, "Host", "let me do that again"),
    s("b", 1.1, 2.1, "Host", "Final kept line"),
  ];
  const preview = previewRemoveRetakes(segments, {
    detection: "normal",
    preferLaterCleanerTake: true,
    honorExplicitRetakePhrases: true,
    sameSpeakerOnly: true,
  });
  assert.equal(preview.summary.removedSegments, 1);
  assert.equal(preview.resultSegments.some((segment) => segment.segment_id === "a"), false);
}

async function testQuickCleanOrderDeterministic() {
  const segments = [
    s("a", 0, 1, "Host", "uh intro"),
    s("b", 2.0, 3.0, "Host", "let me do that again"),
    s("c", 3.1, 4.0, "Host", "clean line"),
  ];
  const preview = previewQuickClean({
    segments,
    retakes: {
      detection: "normal",
      preferLaterCleanerTake: true,
      honorExplicitRetakePhrases: true,
      sameSpeakerOnly: true,
    },
    fillers: {
      aggressiveness: "medium",
      protectIntentionalPhrasing: true,
    },
    gaps: {
      maxGapSec: 0.4,
      minPauseSec: 0.1,
      preserveDramaticPauses: false,
    },
  });
  assert.ok(preview.summary.timeSavedSec >= 0.1);
  assert.equal(preview.label, "Quick Clean");
}

async function run() {
  await testShortenGapsDeterministic();
  await testFillerRemovalDeterministic();
  await testRetakeRemovalDeterministic();
  await testQuickCleanOrderDeterministic();
  // eslint-disable-next-line no-console
  console.log("Hammer cleanup tools tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer cleanup tools tests failed:", error);
  process.exit(1);
});
