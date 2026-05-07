import type { ForegroundMatte, MatteBuildOptions, MatteRefiner, SegmentationResult } from "../types";
import {
  blendAlphaEma,
  computeEffectiveTemporalWeight,
  shouldResetTemporalHistory,
  type TemporalMatteHistory,
} from "./temporalMatteSmoothing";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function blurAlphaSeparable(args: {
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  radius: number;
}): Uint8ClampedArray {
  const radius = Math.max(0, Math.floor(args.radius));
  if (radius <= 0) return new Uint8ClampedArray(args.alpha);
  const { width, height } = args;
  const src = args.alpha;
  const tmp = new Float32Array(width * height);
  const out = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      for (let k = left; k <= right; k += 1) {
        sum += src[rowStart + k] ?? 0;
        count += 1;
      }
      tmp[rowStart + x] = count > 0 ? (sum / count) : 0;
    }
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      let count = 0;
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius);
      for (let k = top; k <= bottom; k += 1) {
        sum += tmp[(k * width) + x] ?? 0;
        count += 1;
      }
      out[(y * width) + x] = Math.round(count > 0 ? (sum / count) : 0);
    }
  }

  return out;
}

function applyMorphology(args: {
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  deltaPx: number;
}): Uint8ClampedArray {
  const delta = Math.round(args.deltaPx);
  if (delta === 0) return new Uint8ClampedArray(args.alpha);
  const steps = Math.max(1, Math.abs(delta));
  let current = new Uint8ClampedArray(args.alpha);
  const { width, height } = args;
  const dilate = delta > 0;

  for (let step = 0; step < steps; step += 1) {
    const next = new Uint8ClampedArray(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let acc = dilate ? 0 : 255;
        for (let oy = -1; oy <= 1; oy += 1) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) continue;
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = x + ox;
            if (nx < 0 || nx >= width) continue;
            const value = current[(ny * width) + nx] ?? 0;
            if (dilate) {
              if (value > acc) acc = value;
            } else if (value < acc) {
              acc = value;
            }
          }
        }
        next[(y * width) + x] = acc;
      }
    }
    current = next;
  }

  return current;
}

function applyMedian3x3(args: {
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  iterations: number;
}): Uint8ClampedArray {
  let current = new Uint8ClampedArray(args.alpha);
  const steps = Math.max(0, Math.floor(args.iterations));
  if (steps <= 0) return current;
  const { width, height } = args;
  const window = new Uint8Array(9);
  for (let step = 0; step < steps; step += 1) {
    const next = new Uint8ClampedArray(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let count = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) continue;
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = x + ox;
            if (nx < 0 || nx >= width) continue;
            window[count] = current[(ny * width) + nx] ?? 0;
            count += 1;
          }
        }
        for (let i = 1; i < count; i += 1) {
          const key = window[i]!;
          let j = i - 1;
          while (j >= 0 && window[j]! > key) {
            window[j + 1] = window[j]!;
            j -= 1;
          }
          window[j + 1] = key;
        }
        next[(y * width) + x] = window[Math.floor(count * 0.5)] ?? 0;
      }
    }
    current = next;
  }
  return current;
}

function applyMorphologyPair(args: {
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  closeSteps: number;
  openSteps: number;
}): Uint8ClampedArray {
  let current = new Uint8ClampedArray(args.alpha);
  for (let i = 0; i < Math.max(0, Math.floor(args.closeSteps)); i += 1) {
    current = applyMorphology({ alpha: current, width: args.width, height: args.height, deltaPx: 1 });
    current = applyMorphology({ alpha: current, width: args.width, height: args.height, deltaPx: -1 });
  }
  for (let i = 0; i < Math.max(0, Math.floor(args.openSteps)); i += 1) {
    current = applyMorphology({ alpha: current, width: args.width, height: args.height, deltaPx: -1 });
    current = applyMorphology({ alpha: current, width: args.width, height: args.height, deltaPx: 1 });
  }
  return current;
}

function dampLowAlphaNoise(args: {
  alpha: Uint8ClampedArray;
  floor: number;
  fadeRange: number;
}): Uint8ClampedArray {
  const floor = clamp(Math.round(args.floor), 0, 255);
  const fadeRange = Math.max(1, Math.round(args.fadeRange));
  const out = new Uint8ClampedArray(args.alpha.length);
  for (let i = 0; i < out.length; i += 1) {
    const value = args.alpha[i] ?? 0;
    if (value <= floor) {
      out[i] = 0;
      continue;
    }
    if (value < (floor + fadeRange)) {
      const t = (value - floor) / fadeRange;
      out[i] = Math.round(value * t);
      continue;
    }
    out[i] = value;
  }
  return out;
}

function applyHaloClamp(args: {
  expandedAlpha: Uint8ClampedArray;
  featheredAlpha: Uint8ClampedArray;
  featherPx: number;
}): { refinedAlpha: Uint8ClampedArray; edgeBandAlpha: Uint8ClampedArray } {
  const refined = new Uint8ClampedArray(args.featheredAlpha.length);
  const edgeBand = new Uint8ClampedArray(args.featheredAlpha.length);
  const allowance = Math.round(3 + (Math.max(0, args.featherPx) * 0.65));

  for (let i = 0; i < refined.length; i += 1) {
    const expanded = args.expandedAlpha[i] ?? 0;
    const feathered = args.featheredAlpha[i] ?? 0;
    let next = feathered;
    if (expanded < 192) {
      next = Math.min(next, expanded + allowance);
    }
    if (expanded < 150 && next > 0) {
      next = Math.round(next * 0.9);
    }
    if (expanded < 96 && next > 0) {
      next = Math.min(next, Math.round(expanded * 0.88) + allowance);
    }
    if (next < 10) next = 0;
    refined[i] = clamp(next, 0, 255);
    edgeBand[i] = (refined[i] >= 22 && refined[i] <= 210) ? 255 : 0;
  }

  return { refinedAlpha: refined, edgeBandAlpha: edgeBand };
}

function applyFeather(args: {
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  featherPx: number;
}): Uint8ClampedArray {
  const featherPx = Math.max(0, Math.round(args.featherPx));
  if (featherPx <= 0) {
    return new Uint8ClampedArray(args.alpha);
  }

  const small = blurAlphaSeparable({
    alpha: args.alpha,
    width: args.width,
    height: args.height,
    radius: Math.max(1, Math.round(featherPx * 0.35)),
  });
  const wide = blurAlphaSeparable({
    alpha: small,
    width: args.width,
    height: args.height,
    radius: Math.max(1, Math.round(featherPx * 0.55)),
  });
  const out = new Uint8ClampedArray(args.alpha.length);
  const smoothMix = clamp(0.18 + (featherPx * 0.015), 0.22, 0.38);
  const sourceMix = 1 - smoothMix;
  for (let i = 0; i < out.length; i += 1) {
    const source = args.alpha[i] ?? 0;
    const smooth = wide[i] ?? 0;
    const mixed = Math.round((source * sourceMix) + (smooth * smoothMix));
    out[i] = clamp(mixed, 0, 255);
  }
  return out;
}

function buildNeutralizedBaseMask(input: SegmentationResult): Uint8ClampedArray {
  const radius = input.confidenceSummary.score < 0.4 ? 1 : 0;
  if (radius <= 0) return new Uint8ClampedArray(input.personMask);
  return blurAlphaSeparable({
    alpha: input.personMask,
    width: input.width,
    height: input.height,
    radius,
  });
}

function quantizeExpansionPx(value: number): number {
  const clamped = clamp(value, -12, 12);
  if (Math.abs(clamped) < 0.2) return 0;
  return Math.round(clamped * 2) / 2;
}

function shouldIncludeDebugPlanes(): boolean {
  return true;
}

export class SimpleMatteRefiner implements MatteRefiner {
  private previousAlpha: Uint8ClampedArray | null = null;
  private history: TemporalMatteHistory | null = null;

  public reset(): void {
    this.previousAlpha = null;
    this.history = null;
  }

  public buildMatte(input: SegmentationResult, options: MatteBuildOptions): ForegroundMatte {
    const width = input.width;
    const height = input.height;
    const featherPx = clamp(options.featherPx, 0, 64);
    const requestedTemporalWeight = clamp(options.temporalSmoothing, 0, 1);
    const subjectExpansionPx = quantizeExpansionPx(options.subjectExpansionPx);
    const warned: string[] = [];

    const isHigh = options.quality === "high";
    const isMedium = options.quality === "medium";
    const baseMask = buildNeutralizedBaseMask(input);
    const denoisedBase = applyMedian3x3({
      alpha: baseMask,
      width,
      height,
      iterations: isHigh ? 2 : isMedium ? 1 : 0,
    });
    const cleanedBase = applyMorphologyPair({
      alpha: denoisedBase,
      width,
      height,
      closeSteps: isHigh ? 2 : 1,
      openSteps: isHigh ? 1 : 0,
    });

    // Expansion happens after cleanup so we do not amplify speckles/holes.
    // Negative shrink is softened to avoid eating into edges too aggressively.
    const expansionApplied = subjectExpansionPx < 0
      ? Math.ceil(subjectExpansionPx * 0.5)
      : subjectExpansionPx;
    const expandedAlpha = applyMorphology({
      alpha: cleanedBase,
      width,
      height,
      deltaPx: expansionApplied,
    });
    const featheredAlpha = applyFeather({
      alpha: expandedAlpha,
      width,
      height,
      featherPx,
    });
    const haloClamped = applyHaloClamp({
      expandedAlpha,
      featheredAlpha,
      featherPx,
    });
    const refinedDenoised = applyMedian3x3({
      alpha: haloClamped.refinedAlpha,
      width,
      height,
      iterations: isHigh ? 1 : 0,
    });
    const refinedAlpha = dampLowAlphaNoise({
      alpha: refinedDenoised,
      floor: isHigh ? 4 : isMedium ? 5 : 6,
      fadeRange: isHigh ? 14 : 10,
    });

    // Temporal smoothing hook: exponential blend against previous alpha.
    let alphaMask = refinedAlpha;
    const resetDecision = shouldResetTemporalHistory({
      previous: this.history,
      next: {
        width,
        height,
        providerName: input.providerName,
        timestampSec: input.sourceTimestampSec,
        confidence: input.confidenceSummary,
      },
    });
    if (resetDecision.reset) {
      this.previousAlpha = null;
      this.history = null;
    }

    const effectiveTemporalWeight = computeEffectiveTemporalWeight({
      requestedWeight: requestedTemporalWeight,
      previousConfidenceScore: this.history?.lastConfidenceScore ?? null,
      nextConfidenceScore: input.confidenceSummary.score,
    });

    if (effectiveTemporalWeight > 0 && this.previousAlpha && this.previousAlpha.length === alphaMask.length) {
      alphaMask = blendAlphaEma({
        previousAlpha: this.previousAlpha,
        nextAlpha: alphaMask,
        previousWeight: effectiveTemporalWeight,
      });
    }

    this.previousAlpha = alphaMask;
    this.history = {
      width,
      height,
      providerName: input.providerName,
      lastTimestampSec: input.sourceTimestampSec,
      lastConfidenceScore: input.confidenceSummary.score,
      lastForegroundRatio: input.confidenceSummary.foregroundRatio,
    };

    return {
      width,
      height,
      alphaMask,
      featherPx: roundToTenth(featherPx),
      temporalWeight: roundToTenth(effectiveTemporalWeight),
      quality: options.quality,
      metadata: {
        providerName: input.providerName,
        confidenceScore: input.confidenceSummary.score,
        expansionPxApplied: expansionApplied,
        haloClampStrength: roundToTenth(Math.max(0, Math.min(1, featherPx / 24))),
        edgeBandAlphaMask: haloClamped.edgeBandAlpha,
        debugPlanes: shouldIncludeDebugPlanes()
          ? {
            expandedAlphaMask: expandedAlpha,
            featheredAlphaMask: featheredAlpha,
            refinedAlphaMask: refinedAlpha,
          }
          : undefined,
        warnings: [...new Set([
          ...input.warnings,
          ...warned,
          ...(resetDecision.reset ? resetDecision.reasons.map((r) => `temporal_reset:${r}`) : []),
        ])],
      },
    };
  }
}
