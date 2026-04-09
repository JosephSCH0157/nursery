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

function buildMaskCanvas(args: { width: number; height: number; alphaMask: Uint8ClampedArray }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = args.width;
  canvas.height = args.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D not available for matte refinement.");
  const image = ctx.createImageData(args.width, args.height);
  for (let i = 0, px = 0; i < image.data.length; i += 4, px += 1) {
    const a = args.alphaMask[px] ?? 0;
    image.data[i] = 255;
    image.data[i + 1] = 255;
    image.data[i + 2] = 255;
    image.data[i + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function applySubjectExpansion(args: { canvas: HTMLCanvasElement; expansionPx: number }): void {
  const expansionPx = Math.max(0, Math.round(args.expansionPx));
  if (expansionPx <= 0) return;

  const w = args.canvas.width;
  const h = args.canvas.height;
  const ctx = args.canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  if (!scratchCtx) return;

  // Approximate dilation: blur then threshold back to a hard mask.
  scratchCtx.clearRect(0, 0, w, h);
  scratchCtx.filter = `blur(${expansionPx}px)`;
  scratchCtx.drawImage(args.canvas, 0, 0, w, h);
  scratchCtx.filter = "none";

  const image = scratchCtx.getImageData(0, 0, w, h);
  const data = image.data;
  // Low threshold keeps shoulders/hairline more filled while avoiding aggressive growth.
  const threshold = clamp(20, 4, 96);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    const hard = a >= threshold ? 255 : 0;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = hard;
  }

  ctx.putImageData(image, 0, 0);
}

function applyFeather(args: { canvas: HTMLCanvasElement; featherPx: number }): Uint8ClampedArray {
  const featherPx = Math.max(0, Math.round(args.featherPx));
  if (featherPx <= 0) {
    const ctx = args.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return new Uint8ClampedArray(args.canvas.width * args.canvas.height);
    const imageData = ctx.getImageData(0, 0, args.canvas.width, args.canvas.height).data;
    const alpha = new Uint8ClampedArray(args.canvas.width * args.canvas.height);
    for (let i = 0, px = 0; i < imageData.length; i += 4, px += 1) {
      alpha[px] = imageData[i + 3] ?? 0;
    }
    return alpha;
  }

  const w = args.canvas.width;
  const h = args.canvas.height;
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Uint8ClampedArray(w * h);
  ctx.clearRect(0, 0, w, h);
  ctx.filter = `blur(${featherPx}px)`;
  ctx.drawImage(args.canvas, 0, 0, w, h);
  ctx.filter = "none";
  const imageData = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0, px = 0; i < imageData.length; i += 4, px += 1) {
    alpha[px] = imageData[i + 3] ?? 0;
  }
  return alpha;
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

    const baseMask = new Uint8ClampedArray(input.personMask);

    const subjectExpansionPx = clamp(options.subjectExpansionPx, 0, 48);
    const warned: string[] = [];

    // Feather hook via blur of the alpha channel.
    const maskCanvas = buildMaskCanvas({ width, height, alphaMask: baseMask });
    applySubjectExpansion({ canvas: maskCanvas, expansionPx: subjectExpansionPx });
    const feathered = applyFeather({ canvas: maskCanvas, featherPx });

    // Temporal smoothing hook: exponential blend against previous alpha.
    let alphaMask = feathered;
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
        warnings: [...new Set([
          ...input.warnings,
          ...warned,
          ...(resetDecision.reset ? resetDecision.reasons.map((r) => `temporal_reset:${r}`) : []),
        ])],
      },
    };
  }
}
