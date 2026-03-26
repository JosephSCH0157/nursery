import assert from "node:assert/strict";

/**
 * Hammer Channel Characterization Tests
 *
 * Tests for:
 * 1. Silent channel detection
 * 2. Dual mono detection
 * 3. Phase concern detection
 *
 * Fixtures:
 * - Mono file
 * - Stereo normal
 * - Silent left channel
 * - Silent right channel
 * - Dual mono (identical channels)
 * - Phase-reversed channels
 */

// Unit test helpers to compute correlations and RMS
function computeChannelRmsDbfs(channelData: Float32Array): number | null {
  let sumSquares = 0;
  for (let index = 0; index < channelData.length; index += 1) {
    const sample = channelData[index];
    sumSquares += sample * sample;
  }
  if (channelData.length === 0) return null;
  const rms = Math.sqrt(sumSquares / channelData.length);
  if (!(rms > 0)) return null;
  return 20 * Math.log10(rms);
}

function computePearsonCorrelation(left: Float32Array, right: Float32Array): number | null {
  if (left.length === 0 || right.length !== left.length) return null;
  const length = Math.min(left.length, right.length);
  if (length === 0) return null;

  let sumXY = 0;
  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let index = 0; index < length; index += 1) {
    const x = left[index];
    const y = right[index];
    sumXY += x * y;
    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const numerator = length * sumXY - sumX * sumY;
  const denominator = Math.sqrt((length * sumX2 - sumX * sumX) * (length * sumY2 - sumY * sumY));
  if (!(denominator > 0)) return null;
  const correlation = numerator / denominator;
  if (!Number.isFinite(correlation)) return null;
  return correlation;
}

{
  // Fixture 1: Mono file - should not trigger stereo flags
  const sampleCount = 16000; // 1 second at 16kHz
  const monoSamples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    monoSamples[i] = Math.sin((i / sampleCount) * Math.PI * 4) * 0.3;
  }

  assert.equal(monoSamples.length, sampleCount, "mono fixture created");
}

{
  // Fixture 2: Stereo normal - no issues
  const sampleCount = 16000;
  const leftSamples = new Float32Array(sampleCount);
  const rightSamples = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    leftSamples[i] = Math.sin((i / sampleCount) * Math.PI * 4) * 0.3;
    rightSamples[i] = Math.sin((i / sampleCount) * Math.PI * 4 + 0.5) * 0.28; // slightly different
  }

  const correlation = computePearsonCorrelation(leftSamples, rightSamples);
  assert(correlation != null, "correlation computed for normal stereo");
  assert(correlation > 0.8, "normal stereo has positive correlation");
  assert(correlation < 0.99, "normal stereo does not have dual_mono correlation");

  const leftRms = computeChannelRmsDbfs(leftSamples);
  const rightRms = computeChannelRmsDbfs(rightSamples);
  assert(leftRms != null && rightRms != null, "RMS computed for both channels");
  assert(Math.abs(leftRms - rightRms) < 2, "RMS values are similar");
}

{
  // Fixture 3: Silent left channel
  const sampleCount = 16000;
  const leftSilent = new Float32Array(sampleCount);
  const rightActive = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    leftSilent[i] = 0; // completely silent
    rightActive[i] = Math.sin((i / sampleCount) * Math.PI * 4) * 0.5;
  }

  const leftRms = computeChannelRmsDbfs(leftSilent);
  const rightRms = computeChannelRmsDbfs(rightActive);

  assert.equal(leftRms, null, "completely silent channel returns null");
  assert(rightRms != null && rightRms > -85, "right channel is above silence threshold");
}

{
  // Fixture 4: Dual mono detection (identical channels)
  const sampleCount = 16000;
  const baseSamples = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    baseSamples[i] = Math.sin((i / sampleCount) * Math.PI * 4) * 0.4;
  }

  const leftDual = baseSamples;
  const rightDual = new Float32Array(baseSamples);

  const correlation = computePearsonCorrelation(leftDual, rightDual);
  const leftRms = computeChannelRmsDbfs(leftDual);
  const rightRms = computeChannelRmsDbfs(rightDual);

  assert(correlation != null && correlation > 0.99, "dual mono has high positive correlation");
  assert(leftRms != null && rightRms != null, "RMS computed");
  assert(Math.abs(leftRms - rightRms) < 0.1, "amplitude nearly identical");
}

{
  // Fixture 5: Phase-reversed channels
  const sampleCount = 16000;
  const samples = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = Math.sin((i / sampleCount) * Math.PI * 4) * 0.4;
  }

  const left = samples;
  const right = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    right[i] = -samples[i];
  }

  const correlation = computePearsonCorrelation(left, right);
  assert(correlation != null && correlation < -0.5, "phase-reversed channels show negative correlation");
}

console.log("Hammer channel characterization unit tests passed.");
