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
  distanceWeight: number;
  energyWeight: number;
};

type LocalThreshold = {
  noiseFloor: number;
  threshold: number;
};

const MIN_RANGE_SEC = 0.0001;
const TOLERANCE_SEC = 0.000001;
const DEFAULT_WINDOW_SAMPLES = 256;
const DEFAULT_HOP_SAMPLES = 256;
const LOCAL_ANALYSIS_RADIUS_SEC = 0.4;
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidRange(range: HammerCutRange): boolean {
  return Number.isFinite(range.startSec)
    && Number.isFinite(range.endSec)
    && range.endSec - range.startSec > MIN_RANGE_SEC;
}

function normalizeRange(rawRange: HammerCutRange): HammerCutRange {
  const startSec = Number(rawRange.startSec);
  const endSec = Number(rawRange.endSec);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    return { startSec: 0, endSec: 0 };
  }
  return {
    startSec: Math.min(startSec, endSec),
    endSec: Math.max(startSec, endSec),
  };
}

function getTuningForEditKind(editKind: HammerSmartCutEditKind): RefinementTuning {
  if (editKind === "filler") {
    return {
      maxStartAdjustmentSec: 0.12,
      maxEndAdjustmentSec: 0.14,
      minQuietThreshold: 0.012,
      quietMultiplier: 1.45,
      neighborSafetyMarginSec: 0.025,
      distanceWeight: 1.15,
      energyWeight: 0.55,
    };
  }
  if (editKind === "retake") {
    return {
      maxStartAdjustmentSec: 0.1,
      maxEndAdjustmentSec: 0.13,
      minQuietThreshold: 0.014,
      quietMultiplier: 1.4,
      neighborSafetyMarginSec: 0.02,
      distanceWeight: 0.75,
      energyWeight: 1.2,
    };
  }
  return {
    maxStartAdjustmentSec: 0.08,
    maxEndAdjustmentSec: 0.1,
    minQuietThreshold: 0.016,
    quietMultiplier: 1.35,
    neighborSafetyMarginSec: 0.018,
    distanceWeight: 1,
    energyWeight: 0.8,
  };
}

function hasValidMonoInput(ctx: HammerSmartCutContext): boolean {
  return Boolean(
    ctx.monoSamples
    && ctx.monoSamples.length > 1
    && Number.isFinite(ctx.sampleRate)
    && Number(ctx.sampleRate) > 0,
  );
}

function hasValidWaveformProxy(proxy: HammerAudioPolishAnalysisWaveformProxy | null | undefined): boolean {
  return Boolean(
    proxy
    && Number.isFinite(proxy.bucket_duration_sec)
    && proxy.bucket_duration_sec > 0
    && Array.isArray(proxy.peaks)
    && proxy.peaks.length > 0,
  );
}

function createDebug(args: {
  editKind: HammerSmartCutEditKind;
  baseRange: HammerCutRange;
  refinedRange?: HammerCutRange;
  localNoiseFloor: number | null;
  quietThreshold: number | null;
  selectedStartReason: HammerSmartCutRefinementReason;
  selectedEndReason: HammerSmartCutRefinementReason;
  fallbackReason: HammerSmartCutRefinementReason | null;
  tuning: RefinementTuning;
}): HammerSmartCutDebugMetadata {
  const refinedRange = args.refinedRange ?? args.baseRange;
  return {
    attempted: true,
    editKind: args.editKind,
    baseStartSec: args.baseRange.startSec,
    baseEndSec: args.baseRange.endSec,
    refinedStartSec: refinedRange.startSec,
    refinedEndSec: refinedRange.endSec,
    startDeltaSec: refinedRange.startSec - args.baseRange.startSec,
    endDeltaSec: refinedRange.endSec - args.baseRange.endSec,
    localNoiseFloor: args.localNoiseFloor,
    quietThreshold: args.quietThreshold,
    selectedStartReason: args.selectedStartReason,
    selectedEndReason: args.selectedEndReason,
    fallbackReason: args.fallbackReason,
    maxStartAdjustmentSec: args.tuning.maxStartAdjustmentSec,
    maxEndAdjustmentSec: args.tuning.maxEndAdjustmentSec,
  };
}

function createFallbackResolution(args: {
  editKind: HammerSmartCutEditKind;
  baseRange: HammerCutRange;
  fallbackReason: HammerSmartCutRefinementReason;
  tuning: RefinementTuning;
  localNoiseFloor?: number | null;
  quietThreshold?: number | null;
  selectedStartReason?: HammerSmartCutRefinementReason;
  selectedEndReason?: HammerSmartCutRefinementReason;
}): HammerSmartCutResolution {
  return {
    range: args.baseRange,
    debug: createDebug({
      editKind: args.editKind,
      baseRange: args.baseRange,
      localNoiseFloor: args.localNoiseFloor ?? null,
      quietThreshold: args.quietThreshold ?? null,
      selectedStartReason: args.selectedStartReason ?? "base_range",
      selectedEndReason: args.selectedEndReason ?? "base_range",
      fallbackReason: args.fallbackReason,
      tuning: args.tuning,
    }),
  };
}

function bucketEnergy(bucket: HammerAmplitudeEnvelopeBucket): number {
  return Math.max(clampNonNegative(bucket.peak), clampNonNegative(bucket.meanAbs));
}

function bucketMidSec(bucket: HammerAmplitudeEnvelopeBucket): number {
  return (bucket.startSec + bucket.endSec) * 0.5;
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
    for (let index = startSample; index < endSample; index += 1) {
      const sample = Math.abs(samples[index] ?? 0);
      if (sample > peak) peak = sample;
      sumAbs += sample;
    }

    buckets.push({
      index: buckets.length,
      startSample,
      endSample,
      startSec: startSample / sampleRate,
      endSec: endSample / sampleRate,
      peak,
      meanAbs: sumAbs / Math.max(1, endSample - startSample),
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

  const buckets: HammerAmplitudeEnvelopeBucket[] = [];
  for (let index = 0; index < waveformProxy.peaks.length; index += 1) {
    const peakRaw = waveformProxy.peaks[index];
    if (!isFiniteNumber(peakRaw)) continue;
    const peak = clampNonNegative(peakRaw);
    const startSec = index * bucketDurationSec;
    buckets.push({
      index,
      startSample: index,
      endSample: index + 1,
      startSec,
      endSec: startSec + bucketDurationSec,
      peak,
      meanAbs: peak,
    });
  }
  return buckets;
}

function resolveEnvelope(ctx: HammerSmartCutContext): HammerAmplitudeEnvelopeBucket[] {
  if (hasValidMonoInput(ctx)) {
    return buildAmplitudeEnvelope({
      monoSamples: ctx.monoSamples!,
      sampleRate: Number(ctx.sampleRate),
    });
  }
  if (ctx.waveformProxy && hasValidWaveformProxy(ctx.waveformProxy)) {
    return buildEnvelopeFromWaveformProxy(ctx.waveformProxy);
  }
  return [];
}

function resolveLocalNoiseAndThreshold(args: {
  envelope: HammerAmplitudeEnvelopeBucket[];
  aroundStartSec: number;
  aroundEndSec: number;
  tuning: RefinementTuning;
}): LocalThreshold {
  const localStartSec = Math.max(0, args.aroundStartSec - LOCAL_ANALYSIS_RADIUS_SEC);
  const localEndSec = args.aroundEndSec + LOCAL_ANALYSIS_RADIUS_SEC;
  const localEnergies = args.envelope
    .filter((bucket) => bucket.endSec >= localStartSec && bucket.startSec <= localEndSec)
    .map(bucketEnergy);

  const population = localEnergies.length > 0
    ? localEnergies
    : args.envelope.map(bucketEnergy);
  const noiseFloor = percentile(population, 0.2);
  const medianEnergy = percentile(population, 0.5);
  const adaptiveThreshold = Math.max(args.tuning.minQuietThreshold, noiseFloor * args.tuning.quietMultiplier);
  const ceilingThreshold = Math.max(args.tuning.minQuietThreshold, medianEnergy * 0.88);
  const threshold = Math.min(adaptiveThreshold, ceilingThreshold);
  return { noiseFloor, threshold };
}

function findQuietBucketNearBoundary(args: {
  envelope: HammerAmplitudeEnvelopeBucket[];
  boundarySec: number;
  scanStartSec: number;
  scanEndSec: number;
  threshold: number;
  tuning: RefinementTuning;
  direction: "backward" | "forward";
}): HammerAmplitudeEnvelopeBucket | null {
  const candidates = args.envelope.filter((bucket) => {
    const mid = bucketMidSec(bucket);
    const energy = bucketEnergy(bucket);
    if (mid < args.scanStartSec || mid > args.scanEndSec) return false;
    return energy <= args.threshold;
  });
  if (candidates.length === 0) return null;

  let bestCandidate = candidates[0] ?? null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!bestCandidate) {
      bestCandidate = candidate;
      bestScore = Number.POSITIVE_INFINITY;
    }
    const candidateMidSec = bucketMidSec(candidate);
    const distanceSec = args.direction === "backward"
      ? Math.max(0, args.boundarySec - candidateMidSec)
      : Math.max(0, candidateMidSec - args.boundarySec);
    const normalizedEnergy = args.threshold > TOLERANCE_SEC
      ? bucketEnergy(candidate) / args.threshold
      : bucketEnergy(candidate);
    const score = (distanceSec * args.tuning.distanceWeight) + (normalizedEnergy * args.tuning.energyWeight);
    const bestMidSec = bucketMidSec(bestCandidate);
    const bestDistanceSec = args.direction === "backward"
      ? Math.max(0, args.boundarySec - bestMidSec)
      : Math.max(0, bestMidSec - args.boundarySec);

    if (
      score < bestScore - TOLERANCE_SEC
      || (Math.abs(score - bestScore) <= TOLERANCE_SEC && distanceSec < bestDistanceSec - TOLERANCE_SEC)
      || (
        Math.abs(score - bestScore) <= TOLERANCE_SEC
        && Math.abs(distanceSec - bestDistanceSec) <= TOLERANCE_SEC
        && candidate.index < bestCandidate.index
      )
    ) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestCandidate;
}

function findNearestZeroCrossingTime(args: {
  samples: Float32Array;
  sampleRate: number;
  targetSec: number;
}): number {
  const sampleRate = Number(args.sampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return args.targetSec;
  }
  if (!args.samples || args.samples.length === 0) {
    return args.targetSec;
  }

  const targetIndex = Math.round(args.targetSec * sampleRate);
  const radius = Math.max(1, Math.round(ZERO_CROSSING_POLISH_WINDOW_SEC * sampleRate));
  const startIndex = Math.max(0, targetIndex - radius);
  const endIndex = Math.min(args.samples.length - 1, targetIndex + radius);

  let bestIndex = clamp(targetIndex, 0, args.samples.length - 1);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const previous = args.samples[index - 1] ?? 0;
    const current = args.samples[index] ?? 0;
    const crossesZero = (previous <= 0 && current >= 0) || (previous >= 0 && current <= 0);
    if (!crossesZero) continue;
    const distance = Math.abs(index - targetIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex / sampleRate;
}

export function refineCutRangeWithWaveform(
  ctx: HammerSmartCutContext,
): HammerSmartCutResolution {
  const baseRange = normalizeRange(ctx.baseRange);
  const tuning = getTuningForEditKind(ctx.editKind);

  if (!isValidRange(baseRange)) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "invalid_refined_range",
      tuning,
    });
  }

  const envelope = resolveEnvelope(ctx);
  if (envelope.length === 0) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "envelope_unavailable",
      tuning,
    });
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
    tuning,
    direction: "backward",
  });
  const endQuietBucket = findQuietBucketNearBoundary({
    envelope,
    boundarySec: baseRange.endSec,
    scanStartSec: baseRange.endSec,
    scanEndSec: baseRange.endSec + tuning.maxEndAdjustmentSec,
    threshold: local.threshold,
    tuning,
    direction: "forward",
  });

  if (!startQuietBucket || !endQuietBucket) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "quiet_region_not_found",
      tuning,
      localNoiseFloor: local.noiseFloor,
      quietThreshold: local.threshold,
    });
  }

  let refinedStartSec = bucketMidSec(startQuietBucket);
  let refinedEndSec = bucketMidSec(endQuietBucket);
  let selectedStartReason: HammerSmartCutRefinementReason = "quiet_bucket";
  let selectedEndReason: HammerSmartCutRefinementReason = "quiet_bucket";

  if (hasValidMonoInput(ctx)) {
    refinedStartSec = findNearestZeroCrossingTime({
      samples: ctx.monoSamples!,
      sampleRate: Number(ctx.sampleRate),
      targetSec: refinedStartSec,
    });
    refinedEndSec = findNearestZeroCrossingTime({
      samples: ctx.monoSamples!,
      sampleRate: Number(ctx.sampleRate),
      targetSec: refinedEndSec,
    });
    selectedStartReason = "zero_crossing";
    selectedEndReason = "zero_crossing";
  }

  // Keep transcript timing as intent authority by only allowing outward expansion.
  refinedStartSec = Math.min(refinedStartSec, baseRange.startSec);
  refinedEndSec = Math.max(refinedEndSec, baseRange.endSec);

  const refinedRange = {
    startSec: refinedStartSec,
    endSec: refinedEndSec,
  };
  const startDeltaSec = refinedRange.startSec - baseRange.startSec;
  const endDeltaSec = refinedRange.endSec - baseRange.endSec;

  if (startDeltaSec < -(tuning.maxStartAdjustmentSec + TOLERANCE_SEC)) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "start_adjustment_exceeded",
      tuning,
      localNoiseFloor: local.noiseFloor,
      quietThreshold: local.threshold,
      selectedStartReason,
      selectedEndReason,
    });
  }
  if (endDeltaSec > tuning.maxEndAdjustmentSec + TOLERANCE_SEC) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "end_adjustment_exceeded",
      tuning,
      localNoiseFloor: local.noiseFloor,
      quietThreshold: local.threshold,
      selectedStartReason,
      selectedEndReason,
    });
  }
  if (!isValidRange(refinedRange)) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "invalid_refined_range",
      tuning,
      localNoiseFloor: local.noiseFloor,
      quietThreshold: local.threshold,
      selectedStartReason,
      selectedEndReason,
    });
  }
  if (
    isFiniteNumber(ctx.previousProtectedBoundarySec)
    && refinedRange.startSec < (ctx.previousProtectedBoundarySec - tuning.neighborSafetyMarginSec)
  ) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "previous_boundary_guard",
      tuning,
      localNoiseFloor: local.noiseFloor,
      quietThreshold: local.threshold,
      selectedStartReason,
      selectedEndReason,
    });
  }
  if (
    isFiniteNumber(ctx.nextProtectedBoundarySec)
    && refinedRange.endSec > (ctx.nextProtectedBoundarySec + tuning.neighborSafetyMarginSec)
  ) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "next_boundary_guard",
      tuning,
      localNoiseFloor: local.noiseFloor,
      quietThreshold: local.threshold,
      selectedStartReason,
      selectedEndReason,
    });
  }

  return {
    range: refinedRange,
    debug: createDebug({
      editKind: ctx.editKind,
      baseRange,
      refinedRange,
      localNoiseFloor: local.noiseFloor,
      quietThreshold: local.threshold,
      selectedStartReason,
      selectedEndReason,
      fallbackReason: null,
      tuning,
    }),
  };
}

export function resolveSmartCutRange(ctx: HammerSmartCutContext): HammerSmartCutResolution {
  const baseRange = normalizeRange(ctx.baseRange);
  const tuning = getTuningForEditKind(ctx.editKind);

  if (!isValidRange(baseRange)) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "invalid_refined_range",
      tuning,
    });
  }

  if (!hasValidMonoInput(ctx) && !hasValidWaveformProxy(ctx.waveformProxy ?? null)) {
    return createFallbackResolution({
      editKind: ctx.editKind,
      baseRange,
      fallbackReason: "waveform_unavailable",
      tuning,
    });
  }

  return refineCutRangeWithWaveform({
    ...ctx,
    baseRange,
  });
}
