import type {
  SegmentationConfidenceSummary,
  SegmentationProvider,
  SegmentationProviderReadiness,
  SegmentationResult,
} from "../types";

type MediaPipeSelfieSegmentation = {
  setOptions(options: { modelSelection?: 0 | 1 }): void;
  onResults(callback: (results: { segmentationMask: HTMLCanvasElement | HTMLImageElement | ImageBitmap }) => void): void;
  send(input: { image: CanvasImageSource }): Promise<void>;
  close(): void;
};

type SelfieSegmentationModule = {
  SelfieSegmentation: new (args: { locateFile: (file: string) => string }) => MediaPipeSelfieSegmentation;
};

function nowMs(): number {
  return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type SegmentationMaskChannel = "alpha" | "luminance";

type ChannelSignal = {
  histogram: Uint32Array;
  percentile01: number;
  percentile99: number;
  occupiedBins: number;
  nonOpaqueShare: number;
};

function percentileFromHistogram(histogram: Uint32Array, percentile: number, sampleCount: number): number {
  const target = Math.max(0, Math.min(sampleCount - 1, Math.floor((sampleCount - 1) * percentile)));
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value] ?? 0;
    if (seen > target) return value;
  }
  return 0;
}

function summarizeAlphaSignal(rgba: Uint8ClampedArray): ChannelSignal {
  const histogram = new Uint32Array(256);
  const coarseBins = new Uint8Array(16);
  let nonOpaque = 0;
  const sampleCount = Math.floor(rgba.length / 4);
  for (let i = 3; i < rgba.length; i += 4) {
    const alpha = rgba[i] ?? 255;
    histogram[alpha] += 1;
    coarseBins[Math.min(15, alpha >>> 4)] = 1;
    if (alpha <= 247) nonOpaque += 1;
  }
  return {
    histogram,
    percentile01: percentileFromHistogram(histogram, 0.01, sampleCount),
    percentile99: percentileFromHistogram(histogram, 0.99, sampleCount),
    occupiedBins: coarseBins.reduce((sum, occupied) => sum + occupied, 0),
    nonOpaqueShare: sampleCount > 0 ? nonOpaque / sampleCount : 0,
  };
}

/** Selects one confidence channel for the complete MediaPipe result frame. */
export function extractSegmentationMaskFromRgba(rgba: Uint8ClampedArray): {
  mask: Uint8ClampedArray;
  channel: SegmentationMaskChannel;
} {
  const pixelCount = Math.floor(rgba.length / 4);
  const alpha = summarizeAlphaSignal(rgba);
  // Percentiles reject isolated transparent pixels; bin occupancy rejects a binary
  // canvas transparency artifact masquerading as a confidence plane.
  const alphaHasSignal = alpha.nonOpaqueShare >= 0.01
    && (alpha.percentile99 - alpha.percentile01) >= 24
    && alpha.occupiedBins >= 4;
  const channel: SegmentationMaskChannel = alphaHasSignal ? "alpha" : "luminance";
  const mask = new Uint8ClampedArray(pixelCount);
  for (let px = 0; px < pixelCount; px += 1) {
    const i = px * 4;
    if (channel === "alpha") {
      mask[px] = rgba[i + 3] ?? 255;
      continue;
    }
    const red = rgba[i] ?? 0;
    const green = rgba[i + 1] ?? red;
    const blue = rgba[i + 2] ?? red;
    mask[px] = Math.round((red + green + blue) / 3);
  }
  return { mask, channel };
}

function buildConfidenceSummary(args: {
  mask: Uint8ClampedArray;
  threshold: number;
}): SegmentationConfidenceSummary {
  const { mask, threshold } = args;
  if (mask.length === 0) {
    return { score: 0, foregroundRatio: 0, warnings: ["empty_mask"] };
  }
  let foreground = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]! >= threshold) foreground += 1;
  }
  const ratio = foreground / mask.length;
  const warnings: string[] = [];
  if (ratio < 0.01) warnings.push("foreground_too_small");
  if (ratio > 0.95) warnings.push("foreground_too_large");
  // Heuristic score: prefer plausible foreground ratios.
  const centered = 1 - Math.min(1, Math.abs(ratio - 0.35) / 0.35);
  const score = clamp01(centered);
  return { score, foregroundRatio: ratio, warnings };
}

export class MediapipeSelfieSegmentationProvider implements SegmentationProvider {
  public readonly name = "mediapipe_selfie_segmentation";
  private readiness: SegmentationProviderReadiness = { status: "idle" };
  private engine: MediaPipeSelfieSegmentation | null = null;
  private modulePromise: Promise<SelfieSegmentationModule> | null = null;
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskCtx: CanvasRenderingContext2D;
  private readonly options: { cdnBaseUrl?: string; modelSelection?: 0 | 1 } | undefined;

  public constructor(options?: { cdnBaseUrl?: string; modelSelection?: 0 | 1 }) {
    this.options = options;
    this.maskCanvas = document.createElement("canvas");
    const ctx = this.maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D not available for segmentation mask extraction.");
    this.maskCtx = ctx;
  }

  public getReadiness(): SegmentationProviderReadiness {
    return this.readiness;
  }

  public isReady(): boolean {
    return this.readiness.status === "ready" && this.engine != null;
  }

  public async initialize(): Promise<void> {
    if (this.engine) return;
    if (this.readiness.status === "initializing") return;
    this.readiness = { status: "initializing", startedAtMs: nowMs() };

    try {
      if (!this.modulePromise) {
        this.modulePromise = import("@mediapipe/selfie_segmentation");
      }
      const module = await this.modulePromise;
      const cdnBaseUrl = this.options?.cdnBaseUrl?.trim() || "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation";
      const engine = new module.SelfieSegmentation({
        locateFile: (file) => `${cdnBaseUrl}/${file}`,
      });
      engine.setOptions({ modelSelection: this.options?.modelSelection ?? 1 });
      this.engine = engine;
      this.readiness = { status: "ready" };
    } catch (error) {
      this.engine = null;
      this.readiness = {
        status: "failed",
        error: error instanceof Error ? error.message : "Segmentation provider initialization failed.",
      };
    }
  }

  public async dispose(): Promise<void> {
    try {
      this.engine?.close();
    } catch {
      // ignore
    }
    this.engine = null;
    this.readiness = { status: "idle" };
    this.modulePromise = null;
  }

  public async segmentFrame(args: { source: CanvasImageSource; timestampSec: number }): Promise<SegmentationResult> {
    if (!this.engine) {
      await this.initialize();
    }
    if (!this.engine) {
      throw new Error(this.readiness.status === "failed" ? this.readiness.error : "Segmentation provider unavailable.");
    }

    const started = nowMs();
    const engine = this.engine;
    const results = await new Promise<{ segmentationMask: HTMLCanvasElement | HTMLImageElement | ImageBitmap }>((resolve, reject) => {
      engine.onResults((value) => resolve(value));
      void engine.send({ image: args.source }).catch(reject);
    });
    const finished = nowMs();

    // Extract mask pixels into a canonical 0..255 alpha plane.
    const maskSource = results.segmentationMask;
    const width = (maskSource as HTMLCanvasElement).width
      || (maskSource as HTMLImageElement).naturalWidth
      || (maskSource as HTMLImageElement).width
      || 0;
    const height = (maskSource as HTMLCanvasElement).height
      || (maskSource as HTMLImageElement).naturalHeight
      || (maskSource as HTMLImageElement).height
      || 0;
    if (!width || !height) {
      throw new Error("Segmentation provider returned an empty mask.");
    }

    if (this.maskCanvas.width !== width) this.maskCanvas.width = width;
    if (this.maskCanvas.height !== height) this.maskCanvas.height = height;
    this.maskCtx.clearRect(0, 0, width, height);
    this.maskCtx.drawImage(maskSource as CanvasImageSource, 0, 0, width, height);

    const imageData = this.maskCtx.getImageData(0, 0, width, height);
    const rgba = imageData.data;
    const { mask, channel } = extractSegmentationMaskFromRgba(rgba);

    const confidenceSummary = buildConfidenceSummary({ mask, threshold: 128 });
    const warnings = [...confidenceSummary.warnings, `mask_channel_${channel}`];

    return {
      width,
      height,
      personMask: mask,
      confidenceSummary,
      processingMs: Math.max(0, Math.round((finished - started) * 10) / 10),
      sourceTimestampSec: args.timestampSec,
      providerName: this.name,
      warnings,
    };
  }
}
