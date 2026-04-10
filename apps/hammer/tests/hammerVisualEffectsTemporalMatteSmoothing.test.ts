import assert from "node:assert/strict";
import type { SegmentationConfidenceSummary } from "../src/features/visual-effects/types";
import {
  blendAlphaEma,
  computeEffectiveTemporalWeight,
  shouldResetTemporalHistory,
  type TemporalMatteHistory,
} from "../src/features/visual-effects/matte/temporalMatteSmoothing";

function conf(score: number, ratio = 0.35, warnings: string[] = []): SegmentationConfidenceSummary {
  return { score, foregroundRatio: ratio, warnings };
}

async function testBlendAlphaEmaDeterministic() {
  const prev = new Uint8ClampedArray([0, 255, 0, 255]);
  const next = new Uint8ClampedArray([255, 0, 255, 0]);
  const out = blendAlphaEma({ previousAlpha: prev, nextAlpha: next, previousWeight: 0.5 });
  assert.deepEqual(Array.from(out), [128, 128, 128, 128]);
}

async function testEffectiveTemporalWeightBacksOffOnLowConfidence() {
  assert.equal(computeEffectiveTemporalWeight({ requestedWeight: 0.6, previousConfidenceScore: 0.8, nextConfidenceScore: 0.2 }), 0);
}

async function testEffectiveTemporalWeightBacksOffOnInstability() {
  const weight = computeEffectiveTemporalWeight({ requestedWeight: 0.6, previousConfidenceScore: 0.8, nextConfidenceScore: 0.5 });
  assert.ok(weight <= 0.3, "Unstable confidence should reduce smoothing weight");
}

async function testResetOnTimestampJump() {
  const prev: TemporalMatteHistory = {
    width: 10,
    height: 10,
    providerName: "p",
    lastTimestampSec: 1,
    lastConfidenceScore: 0.8,
    lastForegroundRatio: 0.35,
  };
  const res = shouldResetTemporalHistory({
    previous: prev,
    next: { width: 10, height: 10, providerName: "p", timestampSec: 5.2, confidence: conf(0.8) },
  });
  assert.equal(res.reset, true);
  assert.ok(res.reasons.includes("timestamp_jump"));
}

async function testResetOnProviderChange() {
  const prev: TemporalMatteHistory = {
    width: 10,
    height: 10,
    providerName: "p1",
    lastTimestampSec: 1,
    lastConfidenceScore: 0.8,
    lastForegroundRatio: 0.35,
  };
  const res = shouldResetTemporalHistory({
    previous: prev,
    next: { width: 10, height: 10, providerName: "p2", timestampSec: 1.1, confidence: conf(0.8) },
  });
  assert.equal(res.reset, true);
  assert.ok(res.reasons.includes("provider_change"));
}

async function run() {
  await testBlendAlphaEmaDeterministic();
  await testEffectiveTemporalWeightBacksOffOnLowConfidence();
  await testEffectiveTemporalWeightBacksOffOnInstability();
  await testResetOnTimestampJump();
  await testResetOnProviderChange();
  // eslint-disable-next-line no-console
  console.log("Hammer visual-effects temporal matte smoothing tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer visual-effects temporal matte smoothing tests failed:", error);
  process.exit(1);
});

