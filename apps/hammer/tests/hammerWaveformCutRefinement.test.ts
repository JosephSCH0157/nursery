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

async function testSmartCutSnapsOutwardToQuietBuckets() {
  const peaks = new Array(80).fill(0.45);
  peaks[19] = 0.01; // 0.95s
  peaks[25] = 0.01; // 1.25s

  const result = resolveSmartCutRange({
    baseRange: { startSec: 1.0, endSec: 1.2 },
    waveformProxy: buildProxy(peaks),
    editKind: "filler",
  });

  assert.ok(result.range.startSec < 1.0);
  assert.ok(result.range.endSec > 1.2);
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

async function testSmartCutRespectsNeighborSafety() {
  const peaks = new Array(80).fill(0.5);
  peaks[18] = 0.01; // 0.90s
  peaks[25] = 0.01; // 1.25s

  const result = resolveSmartCutRange({
    baseRange: { startSec: 1.01, endSec: 1.2 },
    waveformProxy: buildProxy(peaks),
    editKind: "filler",
    previousProtectedBoundarySec: 1.0,
    nextProtectedBoundarySec: 1.2,
  });

  assertClose(result.range.startSec, 1.01);
  assertClose(result.range.endSec, 1.2);
  assert.equal(result.debug.fallbackReason, "quiet_region_not_found");
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
await testSmartCutSnapsOutwardToQuietBuckets();
await testSmartCutFallsBackWhenQuietRegionMissing();
await testSmartCutRespectsNeighborSafety();
await testSmartCutMissingWaveformFallsBackSafely();

console.log("Hammer waveform cut refinement tests passed.");
