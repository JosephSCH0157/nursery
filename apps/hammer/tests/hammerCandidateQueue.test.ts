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
  assert.deepEqual(first.cards[0]?.segmentIds, ["seg_1"]);

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

async function testFillerCardCanRemoveSegmentWhenFillerOnly() {
  const segments = [
    {
      segment_id: "seg_1",
      start_sec: 0,
      end_sec: 1,
      speaker: "S1",
      text: "um.",
    },
  ];

  const result = buildCandidateQueue({
    kind: "fillers",
    segments: segments as never,
    fillerOptions: fillerOptions as never,
    retakeOptions: retakeOptions as never,
    handledCandidateIds: new Set<string>(),
  });

  assert.equal(result.cards.length, 1);
  const card = result.cards[0]!;
  assert.equal(card.afterText, null);
  assert.deepEqual(card.apply.removeSegmentIds, ["seg_1"]);
  assert.deepEqual(card.apply.updateSegments, []);
  assert.equal(card.suggestedRemoval.length, 1);
  assert.equal(card.suggestedRemoval[0]?.segmentId, "seg_1");
  assert.equal(card.suggestedRemovalText, "um.");
}

async function testRetakePairCardBuildsFromSuggestionId() {
  const segments = [
    {
      segment_id: "seg_a",
      start_sec: 0,
      end_sec: 1.2,
      speaker: "S1",
      text: "Florida's citrus really sta—",
    },
    {
      segment_id: "seg_b",
      start_sec: 1.25,
      end_sec: 3.0,
      speaker: "S1",
      text: "Florida's citrus didn't start small.",
    },
  ];

  const handled = new Set<string>();
  const result = buildCandidateQueue({
    kind: "retakes",
    segments: segments as never,
    fillerOptions: fillerOptions as never,
    retakeOptions: retakeOptions as never,
    handledCandidateIds: handled,
  });

  assert.equal(result.cards.length, 1);
  const card = result.cards[0]!;
  assert.equal(card.segmentIds.length, 2);
  assert.equal(card.segmentIds[0], "seg_a");
  assert.equal(card.segmentIds[1], "seg_b");
  assert.equal(card.apply.removeSegmentIds.includes("seg_a"), true);
  assert.equal(card.afterText, "Florida's citrus didn't start small.");
  assert.equal(card.suggestedRemoval.length, 1);
  assert.equal(card.suggestedRemoval[0]?.segmentId, "seg_a");
  assert.equal(card.suggestedRemovalText, "Florida's citrus really sta—");
}

async function testRetakeChainCardRemovesMarkerAndAbort() {
  const segments = [
    {
      segment_id: "seg_a",
      start_sec: 0,
      end_sec: 1.0,
      speaker: "S1",
      text: "Florida oranges really sta—",
    },
    {
      segment_id: "seg_b",
      start_sec: 1.05,
      end_sec: 1.4,
      speaker: "S1",
      text: "let me start that again",
    },
    {
      segment_id: "seg_c",
      start_sec: 1.45,
      end_sec: 3.0,
      speaker: "S1",
      text: "Florida oranges didn't start small.",
    },
  ];

  const handled = new Set<string>();
  const result = buildCandidateQueue({
    kind: "retakes",
    segments: segments as never,
    fillerOptions: fillerOptions as never,
    retakeOptions: retakeOptions as never,
    handledCandidateIds: handled,
  });

  assert.equal(result.cards.length, 1);
  const card = result.cards[0]!;
  assert.equal(card.segmentIds.includes("seg_a"), true);
  assert.equal(card.segmentIds.includes("seg_b"), true);
  assert.equal(card.segmentIds.includes("seg_c"), true);
  assert.equal(card.apply.removeSegmentIds.includes("seg_a"), true);
  assert.equal(card.apply.removeSegmentIds.includes("seg_b"), true);
  assert.equal(card.afterText, "Florida oranges didn't start small.");
  assert.equal(card.suggestedRemoval.length, 2);
  assert.equal(card.suggestedRemovalText, "Florida oranges really sta—\nlet me start that again");
}

async function testRetakeCardIncludesPreTriggerAndTriggerRemovalWhenKeepingRestart() {
  const segments = [
    {
      segment_id: "seg_a",
      start_sec: 0,
      end_sec: 1.0,
      speaker: "S1",
      text: "Florida oranges didn't sta—",
    },
    {
      segment_id: "seg_b",
      start_sec: 1.05,
      end_sec: 3.2,
      speaker: "S1",
      text: "Let me start that again. Florida oranges didn't start small.",
    },
  ];

  const result = buildCandidateQueue({
    kind: "retakes",
    segments: segments as never,
    fillerOptions: fillerOptions as never,
    retakeOptions: retakeOptions as never,
    handledCandidateIds: new Set<string>(),
  });

  assert.equal(result.cards.length, 1);
  const card = result.cards[0]!;
  assert.equal(card.apply.removeSegmentIds.includes("seg_a"), true);
  assert.equal(card.apply.updateSegments.some((entry) => entry.segmentId === "seg_b"), true);
  assert.equal(card.afterText, "Florida oranges didn't start small.");
  assert.equal(card.suggestedRemoval.some((item) => item.segmentId === "seg_a"), true);
  assert.equal(card.suggestedRemoval.some((item) => (
    item.segmentId === "seg_b" && item.text.toLowerCase().includes("let me start that again")
  )), true);
}

async function testClampIndex() {
  assert.equal(clampActiveCandidateIndex(0, 0), 0);
  assert.equal(clampActiveCandidateIndex(5, 1), 0);
  assert.equal(clampActiveCandidateIndex(5, 2), 1);
  assert.equal(clampActiveCandidateIndex(-1, 3), 0);
}

async function run() {
  await testBuildQueueFiltersHandledCandidates();
  await testFillerCardCanRemoveSegmentWhenFillerOnly();
  await testRetakePairCardBuildsFromSuggestionId();
  await testRetakeChainCardRemovesMarkerAndAbort();
  await testRetakeCardIncludesPreTriggerAndTriggerRemovalWhenKeepingRestart();
  await testClampIndex();
  // eslint-disable-next-line no-console
  console.log("Hammer candidate queue tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer candidate queue tests failed:", error);
  process.exit(1);
});
