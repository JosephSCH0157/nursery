import assert from "node:assert/strict";
import { resolveVisualPreviewQualityPolicy } from "../src/features/visual-effects/render/previewQualityPolicy";

async function testPolicyDeterministicAndOrdered() {
  const low = resolveVisualPreviewQualityPolicy("low");
  const medium = resolveVisualPreviewQualityPolicy("medium");
  const high = resolveVisualPreviewQualityPolicy("high");

  assert.equal(low.mode, "low");
  assert.equal(medium.mode, "medium");
  assert.equal(high.mode, "high");

  assert.ok(low.maxSegmentationFps < medium.maxSegmentationFps);
  assert.ok(medium.maxSegmentationFps < high.maxSegmentationFps);

  assert.ok(low.edgeFeatherCapPx < medium.edgeFeatherCapPx);
  assert.ok(medium.edgeFeatherCapPx < high.edgeFeatherCapPx);

  assert.ok(low.temporalSmoothingCap <= medium.temporalSmoothingCap);
  assert.ok(medium.temporalSmoothingCap <= high.temporalSmoothingCap);
}

async function run() {
  await testPolicyDeterministicAndOrdered();
  // eslint-disable-next-line no-console
  console.log("Hammer visual-effects quality policy tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer visual-effects quality policy tests failed:", error);
  process.exit(1);
});

