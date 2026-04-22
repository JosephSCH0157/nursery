import assert from "node:assert/strict";
import { buildCandidateQueue } from "../src/editor/hammerCandidateQueue";
import { previewQuickClean } from "../src/editor/hammerCleanupTools";
import {
  buildHammerCleanupGoldenFixture,
  hammerCleanupGoldenExpectations,
} from "./fixtures/hammerCleanupGoldenFixture";

async function testQuickCleanMatchesGoldenExpectations() {
  const fixture = buildHammerCleanupGoldenFixture();
  const preview = previewQuickClean({
    segments: fixture.segments,
    retakes: fixture.options.retakes,
    fillers: fixture.options.fillers,
    gaps: fixture.options.gaps,
  });

  assert.deepEqual(preview.summary, hammerCleanupGoldenExpectations.quickClean.summary);
  assert.deepEqual(
    preview.resultSegments.map((segment) => ({
      segment_id: segment.segment_id,
      text: segment.text,
      start_sec: segment.start_sec,
      end_sec: segment.end_sec,
    })),
    hammerCleanupGoldenExpectations.quickClean.resultSegments,
  );
}

async function testRetakeCandidateQueueMatchesGoldenExpectations() {
  const fixture = buildHammerCleanupGoldenFixture();
  const result = buildCandidateQueue({
    kind: "retakes",
    segments: fixture.segments,
    fillerOptions: fixture.options.fillers,
    retakeOptions: fixture.options.retakes,
    handledCandidateIds: new Set<string>(),
  });

  assert.equal(result.cards.length, hammerCleanupGoldenExpectations.candidateQueue.retakeCardCount);
  assert.deepEqual(
    result.cards.map((card) => card.suggestedRemovalText),
    hammerCleanupGoldenExpectations.candidateQueue.suggestedRemovalText,
  );
  assert.deepEqual(
    result.cards.map((card) => card.description),
    hammerCleanupGoldenExpectations.candidateQueue.descriptions,
  );
}

async function run() {
  await testQuickCleanMatchesGoldenExpectations();
  await testRetakeCandidateQueueMatchesGoldenExpectations();
  // eslint-disable-next-line no-console
  console.log("Hammer cleanup golden fixture test passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer cleanup golden fixture test failed:", error);
  process.exit(1);
});
