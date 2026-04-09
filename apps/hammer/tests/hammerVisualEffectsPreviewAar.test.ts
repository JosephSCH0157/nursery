import assert from "node:assert/strict";
import { summarizeBackgroundEffectAar, type BackgroundEffectAarSample } from "../src/features/visual-effects/render/previewPerformanceAar";

async function testSummarizeComputesRatesAndHistograms() {
  const samples: BackgroundEffectAarSample[] = [
    {
      capturedAtMs: 1000,
      mode: "replacement",
      qualityMode: "medium",
      debugMasksEnabled: false,
      providerReadiness: "ready",
      degradedReason: null,
      lastSegmentationMs: 12,
      lastCompositeMs: 4,
      droppedFrames: 1,
    },
    {
      capturedAtMs: 1500,
      mode: "replacement",
      qualityMode: "medium",
      debugMasksEnabled: false,
      providerReadiness: "ready",
      degradedReason: "segmentation_busy",
      lastSegmentationMs: 14,
      lastCompositeMs: 5,
      droppedFrames: 3,
    },
  ];

  const summary = summarizeBackgroundEffectAar(samples);
  assert.ok(summary);
  assert.equal(summary.mode, "replacement");
  assert.equal(summary.qualityMode, "medium");
  assert.equal(summary.sampleCount, 2);
  assert.equal(summary.droppedFramesDelta, 2);
  assert.equal(summary.degradedHistogram.segmentation_busy, 1);
  assert.ok(summary.degradedRate > 0.4 && summary.degradedRate < 0.6);
  assert.equal(summary.providerReadinessHistogram.ready, 2);
}

async function run() {
  await testSummarizeComputesRatesAndHistograms();
  // eslint-disable-next-line no-console
  console.log("Hammer visual-effects preview AAR tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer visual-effects preview AAR tests failed:", error);
  process.exit(1);
});

