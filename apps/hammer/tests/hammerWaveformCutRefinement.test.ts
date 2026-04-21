import assert from "node:assert/strict";
import {
  buildAmplitudeEnvelope,
  resolveSmartCutRange,
} from "../src/editor/hammerWaveformCutRefinement";

function assertClose(actual: number, expected: number, epsilon = 0.000001): void {
  assert.ok(Math.abs(actual - expected) < epsilon, `Expected ${expected}, received ${actual}`);
}

function buildProxy(peaks: number[], bucketDurationSec = 0.05) {
  return {
    version: "v1" as const,
    duration_sec: peaks.length * bucketDurationSec,
    bucket_count: peaks.length,
    bucket_duration_sec: bucketDurationSec,
    channel_mode: "mono_mixdown" as const,
    peaks,
  };
}

async function testEnvelopeBuildIsDeterministic() {
  const samples = new Float32Array([0, 0.2, -0.4, 0.1, 0, -0.1, 0.35, -0.2]);
  const first = buildAmplitudeEnvelope({
    monoSamples: samples,
    sampleRate: 8,
    windowSize: 4,
    hopSize: 4,
  });
  const second = buildAmplitudeEnvelope({
    monoSamples: samples,
    sampleRate: 8,
    windowSize: 4,
    hopSize: 4,
  });

  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assertClose(first[0]?.peak ?? 0, 0.4);
  assertClose(first[0]?.meanAbs ?? 0, 0.175);
}

async function testFillerSmartCutSnapsToQuietBoundaries() {
  const peaks = new Array(80).fill(0.45);
  peaks[19] = 0.01; // ~0.975s
  peaks[25] = 0.01; // ~1.275s

  const result = resolveSmartCutRange({
    baseRange: { startSec: 1.0, endSec: 1.2 },
    waveformProxy: buildProxy(peaks),
    editKind: "filler",
  });

  assert.ok(result.range.startSec < 1.0);
  assert.ok(result.range.endSec > 1.2);
  assert.equal(result.debug.fallbackReason, null);
}

async function testRetakeSmartCutPrefersLocalValley() {
  const peaks = new Array(80).fill(0.4);
  peaks[18] = 0.03; // nearer but louder
  peaks[19] = 0.012; // slightly farther but quieter valley
  peaks[24] = 0.03; // nearer but louder
  peaks[25] = 0.012; // slightly farther but quieter valley

  const result = resolveSmartCutRange({
    baseRange: { startSec: 1.0, endSec: 1.2 },
    waveformProxy: buildProxy(peaks),
    editKind: "retake",
  });

  assert.ok(result.range.startSec <= 0.98);
  assert.ok(result.range.endSec >= 1.24);
  assert.equal(result.debug.fallbackReason, null);
}

async function testSmartCutFallsBackWhenQuietRegionMissing() {
  const peaks = new Array(80).fill(0.6);
  const result = resolveSmartCutRange({
    baseRange: { startSec: 1.0, endSec: 1.2 },
    waveformProxy: buildProxy(peaks),
    editKind: "delete_only",
  });

  assertClose(result.range.startSec, 1.0);
  assertClose(result.range.endSec, 1.2);
  assert.equal(result.debug.fallbackReason, "quiet_region_not_found");
}

async function testSmartCutRespectsAdjustmentCaps() {
  const peaks = new Array(120).fill(0.5);
  peaks[17] = 0.01; // outside filler start cap (mid ~0.875)
  peaks[18] = 0.01; // inside filler start cap (mid ~0.925)
  peaks[26] = 0.01; // inside filler end cap (mid ~1.325)
  peaks[27] = 0.01; // outside filler end cap (mid ~1.375)

  const result = resolveSmartCutRange({
    baseRange: { startSec: 1.0, endSec: 1.2 },
    waveformProxy: buildProxy(peaks),
    editKind: "filler",
  });

  assert.ok(result.range.startSec >= 0.88);
  assert.ok(result.range.endSec <= 1.34);
  assert.equal(result.debug.fallbackReason, null);
}

async function testSmartCutNeverReturnsInvertedRange() {
  const result = resolveSmartCutRange({
    baseRange: { startSec: 2.0, endSec: 1.9 },
    editKind: "delete_only",
    waveformProxy: null,
  });

  assert.ok(result.range.endSec >= result.range.startSec);
}

async function testSmartCutProtectsNeighboringSpeech() {
  const peaks = new Array(80).fill(0.5);
  peaks[18] = 0.01; // ~0.925s (too early with neighbor guard)
  peaks[25] = 0.01; // ~1.275s (too late with neighbor guard)

  const result = resolveSmartCutRange({
    baseRange: { startSec: 1.01, endSec: 1.2 },
    waveformProxy: buildProxy(peaks),
    editKind: "filler",
    previousProtectedBoundarySec: 1.0,
    nextProtectedBoundarySec: 1.2,
  });

  assertClose(result.range.startSec, 1.01);
  assertClose(result.range.endSec, 1.2);
  assert.equal(result.debug.fallbackReason, "previous_boundary_guard");
}

async function testSmartCutMissingWaveformFallsBackSafely() {
  const result = resolveSmartCutRange({
    baseRange: { startSec: 2.0, endSec: 2.2 },
    editKind: "retake",
    waveformProxy: null,
  });

  assertClose(result.range.startSec, 2.0);
  assertClose(result.range.endSec, 2.2);
  assert.equal(result.debug.fallbackReason, "waveform_unavailable");
}

await testEnvelopeBuildIsDeterministic();
await testFillerSmartCutSnapsToQuietBoundaries();
await testRetakeSmartCutPrefersLocalValley();
await testSmartCutFallsBackWhenQuietRegionMissing();
await testSmartCutRespectsAdjustmentCaps();
await testSmartCutNeverReturnsInvertedRange();
await testSmartCutProtectsNeighboringSpeech();
await testSmartCutMissingWaveformFallsBackSafely();

console.log("Hammer waveform cut refinement tests passed.");

