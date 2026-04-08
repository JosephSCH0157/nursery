import assert from "node:assert/strict";
import { buildCandidateQueue, clampActiveCandidateIndex } from "../src/editor/hammerCandidateQueue";

function buildSegments() {
  return [
    {
      segment_id: "seg_1",
      start_sec: 0,
      end_sec: 2,
      speaker: "S1",
      text: "um we should start now",
    },
    {
      segment_id: "seg_2",
      start_sec: 2,
      end_sec: 4,
      speaker: "S1",
      text: "this is fine",
    },
  ];
}

const fillerOptions = { aggressiveness: "light", protectIntentionalPhrasing: true } as const;
const retakeOptions = {
  detection: "normal",
  preferLaterCleanerTake: true,
  honorExplicitRetakePhrases: true,
  sameSpeakerOnly: true,
} as const;

async function testBuildQueueFiltersHandledCandidates() {
  const segments = buildSegments();
  const handled = new Set<string>();
  const first = buildCandidateQueue({
    kind: "fillers",
    segments: segments as never,
    fillerOptions: fillerOptions as never,
    retakeOptions: retakeOptions as never,
    handledCandidateIds: handled,
  });

  assert.equal(first.cards.length, 1);
  assert.equal(first.cards[0]?.id, "filler:seg_1");

  handled.add("filler:seg_1");
  const second = buildCandidateQueue({
    kind: "fillers",
    segments: segments as never,
    fillerOptions: fillerOptions as never,
    retakeOptions: retakeOptions as never,
    handledCandidateIds: handled,
  });
  assert.equal(second.cards.length, 0);

  // Strict-mode style double rebuild should remain stable.
  const third = buildCandidateQueue({
    kind: "fillers",
    segments: segments as never,
    fillerOptions: fillerOptions as never,
    retakeOptions: retakeOptions as never,
    handledCandidateIds: handled,
  });
  assert.equal(third.cards.length, 0);
}

async function testClampIndex() {
  assert.equal(clampActiveCandidateIndex(0, 0), 0);
  assert.equal(clampActiveCandidateIndex(5, 1), 0);
  assert.equal(clampActiveCandidateIndex(5, 2), 1);
  assert.equal(clampActiveCandidateIndex(-1, 3), 0);
}

async function run() {
  await testBuildQueueFiltersHandledCandidates();
  await testClampIndex();
  // eslint-disable-next-line no-console
  console.log("Hammer candidate queue tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer candidate queue tests failed:", error);
  process.exit(1);
});

