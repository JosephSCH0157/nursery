import type { ForegroundMatte, MatteBuildOptions, MatteRefiner, SegmentationResult } from "../types";
import {
  blendAlphaEma,
  computeEffectiveTemporalWeight,
  shouldResetTemporalHistory,
  type TemporalMatteHistory,
} from "./temporalMatteSmoothing";

type AlphaMaskBuffer = Uint8ClampedArray<ArrayBufferLike>;

const TOPOLOGY_OCCUPANCY_THRESHOLD = 96;
const STRONG_COMPONENT_PEAK_ALPHA = 220;
const STRONG_COMPONENT_MEAN_ALPHA = 150;
const COMPONENT_SUPPORT_GAP_PX = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function validateSegmentationInput(input: SegmentationResult): void {
  const { width, height, personMask } = input;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Segmentation provider returned invalid mask dimensions.");
  }
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error("Segmentation provider returned non-integer mask dimensions.");
  }
  const expectedLength = width * height;
  if (!personMask || personMask.length === 0 || personMask.length !== expectedLength) {
    throw new Error(`Segmentation provider returned an invalid mask buffer (expected ${expectedLength}, received ${personMask?.length ?? 0}).`);
  }
}

type ForegroundComponent = {
  pixels: number[];
  size: number;
  peakAlpha: number;
  alphaTotal: number;
  touchesFrameEdge: boolean;
};

function collectComponents(args: {
  alpha: AlphaMaskBuffer;
  width: number;
  height: number;
  foreground: boolean;
}): ForegroundComponent[] {
  const { alpha, width, height, foreground } = args;
  const visited = new Uint8Array(alpha.length);
  const components: ForegroundComponent[] = [];
  const queue = new Int32Array(alpha.length);
  for (let start = 0; start < alpha.length; start += 1) {
    const occupied = (alpha[start] ?? 0) >= TOPOLOGY_OCCUPANCY_THRESHOLD;
    if (visited[start] || occupied !== foreground) continue;
    visited[start] = 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    const pixels: number[] = [];
    let peakAlpha = 0;
    let alphaTotal = 0;
    let touchesFrameEdge = false;
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % width;
      const y = Math.floor(index / width);
      const value = alpha[index] ?? 0;
      pixels.push(index);
      peakAlpha = Math.max(peakAlpha, value);
      alphaTotal += value;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesFrameEdge = true;
      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= alpha.length || visited[neighbor]) continue;
        const nx = neighbor % width;
        const ny = Math.floor(neighbor / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        const neighborOccupied = (alpha[neighbor] ?? 0) >= TOPOLOGY_OCCUPANCY_THRESHOLD;
        if (neighborOccupied !== foreground) continue;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    components.push({ pixels, size: pixels.length, peakAlpha, alphaTotal, touchesFrameEdge });
  }
  return components;
}

function isNearSupportedPixel(args: {
  component: ForegroundComponent;
  supported: Uint8Array;
  width: number;
  height: number;
}): boolean {
  for (const index of args.component.pixels) {
    const x = index % args.width;
    const y = Math.floor(index / args.width);
    for (let oy = -COMPONENT_SUPPORT_GAP_PX; oy <= COMPONENT_SUPPORT_GAP_PX; oy += 1) {
      const ny = y + oy;
      if (ny < 0 || ny >= args.height) continue;
      for (let ox = -COMPONENT_SUPPORT_GAP_PX; ox <= COMPONENT_SUPPORT_GAP_PX; ox += 1) {
        const nx = x + ox;
        if (nx < 0 || nx >= args.width) continue;
        if (args.supported[(ny * args.width) + nx]) return true;
      }
    }
  }
  return false;
}

function removeUnsupportedForegroundIslands(args: {
  alpha: AlphaMaskBuffer;
  width: number;
  height: number;
}): AlphaMaskBuffer {
  const out = new Uint8ClampedArray(args.alpha);
  const components = collectComponents({ ...args, foreground: true });
  const meaningfulArea = Math.max(6, Math.floor(args.width * args.height * 0.001));
  const supported = new Uint8Array(out.length);
  for (const component of components) {
    if (component.size >= meaningfulArea || component.touchesFrameEdge) {
      for (const index of component.pixels) supported[index] = 1;
    }
  }
  for (const component of components) {
    if (component.size >= meaningfulArea || component.touchesFrameEdge) continue;
    const meanAlpha = component.alphaTotal / Math.max(1, component.size);
    const hasStrongEvidence = component.size >= 2
      && component.peakAlpha >= STRONG_COMPONENT_PEAK_ALPHA
      && meanAlpha >= STRONG_COMPONENT_MEAN_ALPHA;
    const hasSpatialSupport = isNearSupportedPixel({ component, supported, width: args.width, height: args.height });
    if (hasStrongEvidence || hasSpatialSupport) continue;
    for (const index of component.pixels) out[index] = 0;
  }
  return out;
}

function fillTinyInteriorHoles(args: {
  alpha: AlphaMaskBuffer;
  width: number;
  height: number;
}): AlphaMaskBuffer {
  const out = new Uint8ClampedArray(args.alpha);
  const maxHoleArea = Math.max(4, Math.floor(args.width * args.height * 0.00075));
  const holes = collectComponents({ ...args, foreground: false });
  for (const hole of holes) {
    if (hole.touchesFrameEdge || hole.size > maxHoleArea) continue;
    let boundaryTotal = 0;
    let boundaryCount = 0;
    for (const index of hole.pixels) {
      const x = index % args.width;
      const y = Math.floor(index / args.width);
      const neighbors = [index - 1, index + 1, index - args.width, index + args.width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= out.length) continue;
        const nx = neighbor % args.width;
        const ny = Math.floor(neighbor / args.width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        const value = args.alpha[neighbor] ?? 0;
        if (value >= TOPOLOGY_OCCUPANCY_THRESHOLD) {
          boundaryTotal += value;
          boundaryCount += 1;
        }
      }
    }
    if (boundaryCount === 0) continue;
    const fillAlpha = Math.round(boundaryTotal / boundaryCount);
    for (const index of hole.pixels) out[index] = fillAlpha;
  }
  return out;
}

function blurAlphaSeparable(args: {
  alpha: AlphaMaskBuffer;
  width: number;
  height: number;
  radius: number;
}): AlphaMaskBuffer {
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
  alpha: AlphaMaskBuffer;
  width: number;
  height: number;
  deltaPx: number;
}): AlphaMaskBuffer {
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
  alpha: AlphaMaskBuffer;
  width: number;
  height: number;
  iterations: number;
}): AlphaMaskBuffer {
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
  alpha: AlphaMaskBuffer;
  width: number;
  height: number;
  closeSteps: number;
  openSteps: number;
}): AlphaMaskBuffer {
  let current: AlphaMaskBuffer = new Uint8ClampedArray(args.alpha);
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
  alpha: AlphaMaskBuffer;
  floor: number;
  fadeRange: number;
}): AlphaMaskBuffer {
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
  expandedAlpha: AlphaMaskBuffer;
  featheredAlpha: AlphaMaskBuffer;
  featherPx: number;
}): { refinedAlpha: AlphaMaskBuffer; edgeBandAlpha: AlphaMaskBuffer } {
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
  alpha: AlphaMaskBuffer;
  width: number;
  height: number;
  featherPx: number;
}): AlphaMaskBuffer {
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

function buildNeutralizedBaseMask(input: SegmentationResult): AlphaMaskBuffer {
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
  private previousAlpha: AlphaMaskBuffer | null = null;
  private history: TemporalMatteHistory | null = null;

  public reset(): void {
    this.previousAlpha = null;
    this.history = null;
  }

  public buildMatte(input: SegmentationResult, options: MatteBuildOptions): ForegroundMatte {
    validateSegmentationInput(input);
    const width = input.width;
    const height = input.height;
    const featherPx = clamp(options.featherPx, 0, 64);
    const requestedTemporalWeight = clamp(options.temporalSmoothing, 0, 1);
    const subjectExpansionPx = quantizeExpansionPx(options.subjectExpansionPx);
    const warned: string[] = [];

    const isHigh = options.quality === "high";
    const isMedium = options.quality === "medium";
    const baseMask = buildNeutralizedBaseMask(input);
    const topologyCleaned = fillTinyInteriorHoles({
      alpha: removeUnsupportedForegroundIslands({ alpha: baseMask, width, height }),
      width,
      height,
    });
    const denoisedBase = applyMedian3x3({
      alpha: topologyCleaned,
      width,
      height,
      iterations: isHigh ? 1 : 0,
    });
    const cleanedBase = applyMorphologyPair({
      alpha: denoisedBase,
      width,
      height,
      closeSteps: isHigh ? 1 : 0,
      openSteps: 0,
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
    const refinedAlpha = dampLowAlphaNoise({
      alpha: haloClamped.refinedAlpha,
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
