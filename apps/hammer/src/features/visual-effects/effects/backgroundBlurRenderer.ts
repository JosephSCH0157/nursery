import type { BackgroundEffectRenderer, BackgroundEffectFrameResult, BackgroundBlurSettings, ForegroundMatte } from "../types";
import { drawSourceContained } from "./mediaFrameGeometry";

function nowMs(): number {
  return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildMatteCanvas(args: { matte: ForegroundMatte; featherPx: number }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = args.matte.width;
  canvas.height = args.matte.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D not available for matte compositing.");
  const image = ctx.createImageData(args.matte.width, args.matte.height);
  const threshold = Math.max(4, Math.min(16, Math.round(4 + (args.featherPx * 0.35))));
  const gamma = 0.9;
  const confidence = Math.max(0, Math.min(1, args.matte.metadata.confidenceScore || 0));
  const edgeBoost = 0.03 + ((1 - confidence) * 0.04);
  for (let i = 0, px = 0; i < image.data.length; i += 4, px += 1) {
    const raw = args.matte.alphaMask[px] ?? 0;
    let a = raw;
    if (a < threshold) {
      a = 0;
    } else {
      const normalized = a / 255;
      a = Math.max(0, Math.min(255, Math.round((normalized ** gamma) * 255)));
      if (a >= 16 && a <= 220) {
        const centered = 1 - (Math.abs(a - 138) / 138);
        const boost = Math.max(0, centered) * edgeBoost;
        a = Math.round(a + ((255 - a) * boost));
      }
    }
    if (a < 6) a = 0;
    image.data[i] = 255;
    image.data[i + 1] = 255;
    image.data[i + 2] = 255;
    image.data[i + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export class BackgroundBlurRenderer implements BackgroundEffectRenderer {
  private subjectCanvas: HTMLCanvasElement | null = null;
  private backgroundCanvas: HTMLCanvasElement | null = null;
  private matteCanvas: HTMLCanvasElement | null = null;

  public render(args: {
    source: CanvasImageSource;
    matte: ForegroundMatte;
    settings: BackgroundBlurSettings;
    output: HTMLCanvasElement;
  }): BackgroundEffectFrameResult {
    const started = nowMs();
    const warnings: string[] = [];

    if (!args.settings.enabled) {
      return { compositingMs: 0, droppedFrame: false, degradedReason: "disabled", warnings: [] };
    }

    const confidence = args.matte.metadata.confidenceScore;
    if (confidence < 0.25) {
      const degradedReason = "segmentation_low_confidence";
      const outputCtx = args.output.getContext("2d");
      if (outputCtx && args.settings.fallbackMode === "passthrough") {
        drawSourceContained({
          ctx: outputCtx,
          source: args.source,
          destWidth: args.output.width,
          destHeight: args.output.height,
        });
      }
      return { compositingMs: 0, droppedFrame: false, degradedReason, warnings: [...args.matte.metadata.warnings] };
    }

    const outputCtx = args.output.getContext("2d");
    if (!outputCtx) {
      return { compositingMs: 0, droppedFrame: true, degradedReason: "canvas_2d_unavailable", warnings: [] };
    }

    const w = args.output.width;
    const h = args.output.height;
    if (w <= 0 || h <= 0) {
      return { compositingMs: 0, droppedFrame: true, degradedReason: "canvas_size_unavailable", warnings: [] };
    }

    const blurPx = clamp(args.settings.blurPx, 0, 64);
    if (blurPx <= 0.1) {
      warnings.push("blur_px_zero");
    }

    if (!this.subjectCanvas || this.subjectCanvas.width !== w || this.subjectCanvas.height !== h) {
      this.subjectCanvas = document.createElement("canvas");
      this.subjectCanvas.width = w;
      this.subjectCanvas.height = h;
    }
    if (!this.backgroundCanvas || this.backgroundCanvas.width !== w || this.backgroundCanvas.height !== h) {
      this.backgroundCanvas = document.createElement("canvas");
      this.backgroundCanvas.width = w;
      this.backgroundCanvas.height = h;
    }
    if (!this.matteCanvas || this.matteCanvas.width !== args.matte.width || this.matteCanvas.height !== args.matte.height) {
      this.matteCanvas = buildMatteCanvas({ matte: args.matte, featherPx: args.settings.edgeFeatherPx });
    } else {
      this.matteCanvas = buildMatteCanvas({ matte: args.matte, featherPx: args.settings.edgeFeatherPx });
    }

    const subjCtx = this.subjectCanvas.getContext("2d", { willReadFrequently: true });
    const bgCtx = this.backgroundCanvas.getContext("2d", { willReadFrequently: true });
    if (!subjCtx || !bgCtx) {
      return { compositingMs: 0, droppedFrame: true, degradedReason: "canvas_2d_unavailable", warnings: [] };
    }
    subjCtx.clearRect(0, 0, this.subjectCanvas.width, this.subjectCanvas.height);
    const subjectRect = drawSourceContained({
      ctx: subjCtx,
      source: args.source,
      destWidth: this.subjectCanvas.width,
      destHeight: this.subjectCanvas.height,
      clear: false,
    });
    if (!subjectRect) {
      return { compositingMs: 0, droppedFrame: true, degradedReason: "canvas_size_unavailable", warnings: [] };
    }
    subjCtx.globalCompositeOperation = "destination-in";
    drawSourceContained({
      ctx: subjCtx,
      source: this.matteCanvas,
      destWidth: this.subjectCanvas.width,
      destHeight: this.subjectCanvas.height,
      clear: false,
    });
    subjCtx.globalCompositeOperation = "source-over";

    bgCtx.clearRect(0, 0, w, h);
    bgCtx.save();
    bgCtx.filter = blurPx > 0.1 ? `blur(${blurPx.toFixed(1)}px)` : "none";
    drawSourceContained({
      ctx: bgCtx,
      source: args.source,
      destWidth: w,
      destHeight: h,
      clear: false,
      clipToContent: true,
    });
    bgCtx.restore();

    outputCtx.clearRect(0, 0, w, h);
    outputCtx.drawImage(this.backgroundCanvas, 0, 0, w, h);
    outputCtx.drawImage(this.subjectCanvas, 0, 0, w, h);

    const finished = nowMs();
    return {
      compositingMs: Math.max(0, Math.round((finished - started) * 10) / 10),
      droppedFrame: false,
      degradedReason: null,
      warnings: [...new Set([...args.matte.metadata.warnings, ...warnings])],
    };
  }
}
