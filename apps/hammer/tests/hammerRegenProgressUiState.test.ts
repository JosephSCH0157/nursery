import assert from "node:assert/strict";
import { deriveRegenProgressLabel, resolveIngestSelectedSource } from "../src/editor/hammerRegenTranscriptUiState";

async function testRunningAtOnePercentUsesStagedLabel() {
  const label = deriveRegenProgressLabel({
    jobId: "job_1",
    status: "running",
    progressPercent: 1,
    errorMessage: null,
  });
  assert.equal(label, "Receiving transcript chunks…");
}

async function testRunningWithProgressUsesPercentLabel() {
  const label = deriveRegenProgressLabel({
    jobId: "job_1",
    status: "running",
    progressPercent: 42,
    errorMessage: null,
  });
  assert.equal(label, "Progress 42%");
}

async function testResolveIngestSelectedSourceSupportsLegacyAndNewShape() {
  const fromExtra = resolveIngestSelectedSource({
    extra: {
      selected_transcript_source: "prepared_transcript",
    },
  });
  assert.equal(fromExtra, "prepared_transcript");

  const fromRoot = resolveIngestSelectedSource({
    selected_source: "ai_regeneration",
  });
  assert.equal(fromRoot, "ai_regeneration");
}

async function run() {
  await testRunningAtOnePercentUsesStagedLabel();
  await testRunningWithProgressUsesPercentLabel();
  await testResolveIngestSelectedSourceSupportsLegacyAndNewShape();
  // eslint-disable-next-line no-console
  console.log("Hammer regen progress UI state tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer regen progress UI state tests failed:", error);
  process.exit(1);
});
