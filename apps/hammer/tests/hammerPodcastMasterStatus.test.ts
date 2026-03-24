import assert from "node:assert/strict";
import { resolvePodcastMasterUiStatus } from "../src/editor/hammerPodcastMasterStatus";

async function testNotDeclaredState() {
  const status = resolvePodcastMasterUiStatus({ declared: false });
  assert.equal(status.action_label.includes("Declare"), true);
}

async function testUnavailableRuntimeState() {
  const status = resolvePodcastMasterUiStatus({
    declared: true,
    posture: "unavailable",
    capability: "unavailable",
    preview_mode: "export_only",
  });
  assert.equal(status.headline.includes("unavailable"), true);
  assert.equal(status.detail.includes("supported export runtime"), true);
}

async function testDegradedStageSummaryState() {
  const status = resolvePodcastMasterUiStatus({
    declared: true,
    posture: "degraded",
    capability: "degraded",
    preview_mode: "export_only",
    applied_stages: ["normalize", "limit"],
    skipped_stages: ["compress", "noise_cleanup_light"],
  });
  assert.equal(status.detail.includes("Applied: normalize, limit."), true);
  assert.equal(status.detail.includes("Skipped: compress, light noise cleanup."), true);
}

async function run() {
  await testNotDeclaredState();
  await testUnavailableRuntimeState();
  await testDegradedStageSummaryState();
  // eslint-disable-next-line no-console
  console.log("Hammer podcast master status tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer podcast master status tests failed:", error);
  process.exit(1);
});
