import type { HammerAudioPolishAnalysisWaveformProxy } from "../persistence/hammerPersistenceContract";

export type HammerCutRange = {
  startSec: number;
  endSec: number;
};

export type HammerSmartCutEditKind = "filler" | "retake" | "delete_only";

export type HammerAmplitudeEnvelopeBucket = {
  index: number;
  startSample: number;
  endSample: number;
  startSec: number;
  endSec: number;
  peak: number;
  meanAbs: number;
};

export type HammerSmartCutRefinementReason =
  | "quiet_bucket"
  | "zero_crossing"
  | "base_range"
  | "waveform_unavailable"
  | "envelope_unavailable"
  | "quiet_region_not_found"
  | "invalid_refined_range"
  | "start_adjustment_exceeded"
  | "end_adjustment_exceeded"
  | "previous_boundary_guard"
  | "next_boundary_guard";

export type HammerSmartCutDebugMetadata = {
  attempted: boolean;
  editKind: HammerSmartCutEditKind;
  baseStartSec: number;
  baseEndSec: number;
  refinedStartSec: number;
  refinedEndSec: number;
  startDeltaSec: number;
  endDeltaSec: number;
  localNoiseFloor: number | null;
  quietThreshold: number | null;
  selectedStartReason: HammerSmartCutRefinementReason;
  selectedEndReason: HammerSmartCutRefinementReason;
  fallbackReason: HammerSmartCutRefinementReason | null;
  maxStartAdjustmentSec: number;
  maxEndAdjustmentSec: number;
};

export type HammerSmartCutResolution = {
  range: HammerCutRange;
  debug: HammerSmartCutDebugMetadata;
};

export type HammerSmartCutContext = {
  baseRange: HammerCutRange;
  editKind: HammerSmartCutEditKind;
  waveformProxy?: HammerAudioPolishAnalysisWaveformProxy | null;
  monoSamples?: Float32Array | null;
  sampleRate?: number | null;
  previousProtectedBoundarySec?: number;
  nextProtectedBoundarySec?: number;
};

type RefinementTuning = {
  maxStartAdjustmentSec: number;
  maxEndAdjustmentSec: number;
  minQuietThreshold: number;
  quietMultiplier: number;
  neighborSafetyMarginSec: number;
};

const MIN_RANGE_SEC = 0.0001;
const DEFAULT_WINDOW_SAMPLES = 256;
const DEFAULT_HOP_SAMPLES = 256;
const ZERO_CROSSING_POLISH_WINDOW_SEC = 0.003;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const normalized = clamp(ratio, 0, 1);
  const index = Math.min(sorted.length - 1, Math.floor(normalized * (sorted.length - 1)));
  return sorted[index] ?? sorted[0] ?? 0;
}

function isValidRange(range: HammerCutRange): boolean {
  return Number.isFinite(range.startSec)
    && Number.isFinite(range.endSec)
    && range.endSec - range.startSec > MIN_RANGE_SEC;
}

function getTuningForEditKind(editKind: HammerSmartCutEditKind): RefinementTuning {
  if (editKind === "filler") {
    return {
      maxStartAdjustmentSec: 0.12,
      maxEndAdjustmentSec: 0.14,
      minQuietThreshold: 0.012,
      quietMultiplier: 1.45,
      neighborSafetyMarginSec: 0.025,
    };
  }
  if (editKind === "retake") {
    return {
      maxStartAdjustmentSec: 0.1,
      maxEndAdjustmentSec: 0.13,
      minQuietThreshold: 0.014,
      quietMultiplier: 1.4,
      neighborSafetyMarginSec: 0.02,
    };
  }
  return {
    maxStartAdjustmentSec: 0.08,
    maxEndAdjustmentSec: 0.1,
    minQuietThreshold: 0.016,
    quietMultiplier: 1.35,
    neighborSafetyMarginSec: 0.018,
  };
}

export function buildAmplitudeEnvelope(args: {
  monoSamples: Float32Array;
  sampleRate: number;
  windowSize?: number;
  hopSize?: number;
}): HammerAmplitudeEnvelopeBucket[] {
  const sampleRate = Number(args.sampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return [];
  if (!args.monoSamples || args.monoSamples.length === 0) return [];

  const requestedWindow = Math.trunc(args.windowSize ?? DEFAULT_WINDOW_SAMPLES);
  const requestedHop = Math.trunc(args.hopSize ?? DEFAULT_HOP_SAMPLES);
  const windowSize = Math.max(1, requestedWindow);
  const hopSize = Math.max(1, requestedHop);
  const samples = args.monoSamples;

  const buckets: HammerAmplitudeEnvelopeBucket[] = [];
  for (let startSample = 0; startSample < samples.length; startSample += hopSize) {
    const endSample = Math.min(samples.length, startSample + windowSize);
    if (endSample <= startSample) continue;

    let peak = 0;
    let sumAbs = 0;
    for (let i = startSample; i < endSample; i += 1) {
      const value = Math.abs(samples[i] ?? 0);
      if (value > peak) peak = value;
      sumAbs += value;
    }

    const meanAbs = sumAbs / Math.max(1, endSample - startSample);
    buckets.push({
      index: buckets.length,
      startSample,
      endSample,
      startSec: startSample / sampleRate,
      endSec: endSample / sampleRate,
      peak,
      meanAbs,
    });
  }

  return buckets;
}

function buildEnvelopeFromWaveformProxy(
  waveformProxy: HammerAudioPolishAnalysisWaveformProxy,
): HammerAmplitudeEnvelopeBucket[] {
  const bucketDurationSec = Number(waveformProxy.bucket_duration_sec);
  if (!Number.isFinite(bucketDurationSec) || bucketDurationSec <= 0) {
    return [];
  }
  if (!Array.isArray(waveformProxy.peaks) || waveformProxy.peaks.length === 0) {
    return [];
  }

  return waveformProxy.peaks.map((peakRaw, index) => {
    const peak = clampNonNegative(Number(peakRaw));
    const startSec = index * bucketDurationSec;
    const endSec = startSec + bucketDurationSec;
    return {
      index,
      startSample: index,
      endSample: index + 1,
      startSec,
      endSec,
      peak,
      meanAbs: peak,
    };
  });
}

function resolveEnvelope(ctx: HammerSmartCutContext): HammerAmplitudeEnvelopeBucket[] {
  if (ctx.monoSamples && Number.isFinite(ctx.sampleRate) && Number(ctx.sampleRate) > 0) {
    return buildAmplitudeEnvelope({
      monoSamples: ctx.monoSamples,
      sampleRate: Number(ctx.sampleRate),
    });
  }
  if (ctx.waveformProxy) {
    return buildEnvelopeFromWaveformProxy(ctx.waveformProxy);
  }
  return [];
}

function resolveLocalNoiseAndThreshold(args: {
  envelope: HammerAmplitudeEnvelopeBucket[];
  aroundStartSec: number;
  aroundEndSec: number;
  tuning: RefinementTuning;
}): { noiseFloor: number; threshold: number } {
  const localStartSec = Math.max(0, args.aroundStartSec - 0.4);
  const localEndSec = args.aroundEndSec + 0.4;
  const localPeaks = args.envelope
    .filter((bucket) => bucket.endSec >= localStartSec && bucket.startSec <= localEndSec)
    .map((bucket) => bucket.peak);
  const population = localPeaks.length > 0 ? localPeaks : args.envelope.map((bucket) => bucket.peak);
  const noiseFloor = percentile(population, 0.2);
  const threshold = Math.max(noiseFloor * args.tuning.quietMultiplier, args.tuning.minQuietThreshold);
  return {
    noiseFloor,
    threshold,
  };
}

function bucketMidSec(bucket: HammerAmplitudeEnvelopeBucket): number {
  return (bucket.startSec + bucket.endSec) * 0.5;
}

function findQuietBucketNearBoundary(args: {
  envelope: HammerAmplitudeEnvelopeBucket[];
  boundarySec: number;
  scanStartSec: number;
  scanEndSec: number;
  threshold: number;
  noiseFloor: number;
  direction: "backward" | "forward";
}): HammerAmplitudeEnvelopeBucket | null {
  const candidates = args.envelope.filter((bucket) => {
    const mid = bucketMidSec(bucket);
    return mid >= args.scanStartSec
      && mid <= args.scanEndSec
      && bucket.peak <= args.threshold
      && bucket.peak <= (args.noiseFloor * 0.98);
  });
  if (candidates.length === 0) return null;

  if (args.direction === "backward") {
    return candidates.reduce((best, bucket) => (
      bucketMidSec(bucket) > bucketMidSec(best) ? bucket : best
    ));
  }
  return candidates.reduce((best, bucket) => (
    bucketMidSec(bucket) < bucketMidSec(best) ? bucket : best
  ));
}

function findNearestZeroCrossingTime(args: {
  samples: Float32Array;
  sampleRate: number;
  targetSec: number;
}): number {
  const sampleRate = Number(args.sampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return args.targetSec;
  const targetIndex = Math.round(args.targetSec * sampleRate);
  const radius = Math.max(1, Math.round(ZERO_CROSSING_POLISH_WINDOW_SEC * sampleRate));
  const start = clamp(targetIndex - radius, 0, args.samples.length - 1);
  const end = clamp(targetIndex + radius, 0, args.samples.length - 1);

  let bestIndex = targetIndex;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = start + 1; i <= end; i += 1) {
    const prev = args.samples[i - 1] ?? 0;
    const current = args.samples[i] ?? 0;
    const crosses = (prev <= 0 && current >= 0) || (prev >= 0 && current <= 0);
    if (!crosses) continue;
    const distance = Math.abs(i - targetIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex / sampleRate;
}

export function refineCutRangeWithWaveform(
  ctx: HammerSmartCutContext,
): { range: HammerCutRange; debug: HammerSmartCutDebugMetadata } | null {
  const tuning = getTuningForEditKind(ctx.editKind);
  const baseRange = {
    startSec: Number(ctx.baseRange.startSec),
    endSec: Number(ctx.baseRange.endSec),
  };
  if (!isValidRange(baseRange)) {
    return null;
  }

  const envelope = resolveEnvelope(ctx);
  if (envelope.length === 0) {
    return null;
  }

  const local = resolveLocalNoiseAndThreshold({
    envelope,
    aroundStartSec: baseRange.startSec,
    aroundEndSec: baseRange.endSec,
    tuning,
  });

  const startQuietBucket = findQuietBucketNearBoundary({
    envelope,
    boundarySec: baseRange.startSec,
    scanStartSec: Math.max(0, baseRange.startSec - tuning.maxStartAdjustmentSec),
    scanEndSec: baseRange.startSec,
    threshold: local.threshold,
    noiseFloor: local.noiseFloor,
    direction: "backward",
  });
  const endQuietBucket = findQuietBucketNearBoundary({
    envelope,
    boundarySec: baseRange.endSec,
    scanStartSec: baseRange.endSec,
    scanEndSec: baseRange.endSec + tuning.maxEndAdjustmentSec,
    threshold: local.threshold,
    noiseFloor: local.noiseFloor,
    direction: "forward",
  });

  if (!startQuietBucket || !endQuietBucket) {
    return null;
  }

  let refinedStartSec = bucketMidSec(startQuietBucket);
  let refinedEndSec = bucketMidSec(endQuietBucket);
  let startReason: HammerSmartCutRefinementReason = "quiet_bucket";
  let endReason: HammerSmartCutRefinementReason = "quiet_bucket";

  if (ctx.monoSamples && Number.isFinite(ctx.sampleRate) && Number(ctx.sampleRate) > 0) {
    refinedStartSec = findNearestZeroCrossingTime({
      samples: ctx.monoSamples,
      sampleRate: Number(ctx.sampleRate),
      targetSec: refinedStartSec,
    });
    refinedEndSec = findNearestZeroCrossingTime({
      samples: ctx.monoSamples,
      sampleRate: Number(ctx.sampleRate),
      targetSec: refinedEndSec,
    });
    startReason = "zero_crossing";
    endReason = "zero_crossing";
  }

  const startDeltaSec = refinedStartSec - baseRange.startSec;
  const endDeltaSec = refinedEndSec - baseRange.endSec;

  if (startDeltaSec < -tuning.maxStartAdjustmentSec) {
    return null;
  }
  if (endDeltaSec > tuning.maxEndAdjustmentSec) {
    return null;
  }
  if (refinedEndSec - refinedStartSec <= MIN_RANGE_SEC) {
    return null;
  }

  if (
    Number.isFinite(ctx.previousProtectedBoundarySec)
    && refinedStartSec < Number(ctx.previousProtectedBoundarySec) - tuning.neighborSafetyMarginSec
  ) {
    return null;
  }
  if (
    Number.isFinite(ctx.nextProtectedBoundarySec)
    && refinedEndSec > Number(ctx.nextProtectedBoundarySec) + tuning.neighborSafetyMarginSec
  ) {
    return null;
  }

  const range = {
    startSec: refinedStartSec,
    endSec: refinedEndSec,
  };

  return {
    range,
    debug: {
      attempted: true,
      editKind: ctx.editKind,
      baseStartSec: baseRange.startSec,
      baseEndSec: baseRange.endSec,
      refinedStartSec,
      refinedEndSec,
      startDeltaSec,
      endDeltaSec,
      localNoiseFloor: local.noiseFloor,
      quietThreshold: local.threshold,
      selectedStartReason: startReason,
      selectedEndReason: endReason,
      fallbackReason: null,
      maxStartAdjustmentSec: tuning.maxStartAdjustmentSec,
      maxEndAdjustmentSec: tuning.maxEndAdjustmentSec,
    },
  };
}

export function resolveSmartCutRange(ctx: HammerSmartCutContext): HammerSmartCutResolution {
  const baseRange = {
    startSec: Number(ctx.baseRange.startSec),
    endSec: Number(ctx.baseRange.endSec),
  };
  const tuning = getTuningForEditKind(ctx.editKind);

  const fallbackDebug: HammerSmartCutDebugMetadata = {
    attempted: true,
    editKind: ctx.editKind,
    baseStartSec: baseRange.startSec,
    baseEndSec: baseRange.endSec,
    refinedStartSec: baseRange.startSec,
    refinedEndSec: baseRange.endSec,
    startDeltaSec: 0,
    endDeltaSec: 0,
    localNoiseFloor: null,
    quietThreshold: null,
    selectedStartReason: "base_range",
    selectedEndReason: "base_range",
    fallbackReason: null,
    maxStartAdjustmentSec: tuning.maxStartAdjustmentSec,
    maxEndAdjustmentSec: tuning.maxEndAdjustmentSec,
  };

  const hasWaveform = Boolean(
    (ctx.waveformProxy && Array.isArray(ctx.waveformProxy.peaks) && ctx.waveformProxy.peaks.length > 0)
    || (ctx.monoSamples && ctx.monoSamples.length > 0 && Number.isFinite(ctx.sampleRate) && Number(ctx.sampleRate) > 0),
  );
  if (!hasWaveform) {
    return {
      range: baseRange,
      debug: {
        ...fallbackDebug,
        fallbackReason: "waveform_unavailable",
      },
    };
  }

  const refined = refineCutRangeWithWaveform(ctx);
  if (!refined) {
    return {
      range: baseRange,
      debug: {
        ...fallbackDebug,
        fallbackReason: "quiet_region_not_found",
      },
    };
  }

  return {
    range: refined.range,
    debug: refined.debug,
  };
}
