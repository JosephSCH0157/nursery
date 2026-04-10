import type { BackgroundEffectRenderer, BackgroundEffectFrameResult, BackgroundBlurSettings, ForegroundMatte } from "../types";

function nowMs(): number {
  return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildMatteCanvas(matte: ForegroundMatte): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = matte.width;
  canvas.height = matte.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D not available for matte compositing.");
  const image = ctx.createImageData(matte.width, matte.height);
  for (let i = 0, px = 0; i < image.data.length; i += 4, px += 1) {
    const a = matte.alphaMask[px] ?? 0;
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
        outputCtx.clearRect(0, 0, args.output.width, args.output.height);
        outputCtx.drawImage(args.source, 0, 0, args.output.width, args.output.height);
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

    // Prepare scratch canvases sized to the matte dimensions (mask is produced at provider resolution).
    if (!this.subjectCanvas || this.subjectCanvas.width !== args.matte.width || this.subjectCanvas.height !== args.matte.height) {
      this.subjectCanvas = document.createElement("canvas");
      this.subjectCanvas.width = args.matte.width;
      this.subjectCanvas.height = args.matte.height;
    }
    if (!this.matteCanvas || this.matteCanvas.width !== args.matte.width || this.matteCanvas.height !== args.matte.height) {
      this.matteCanvas = buildMatteCanvas(args.matte);
    } else {
      // Update matte pixels for the current frame.
      this.matteCanvas = buildMatteCanvas(args.matte);
    }

    const subjCtx = this.subjectCanvas.getContext("2d", { willReadFrequently: true });
    if (!subjCtx) {
      return { compositingMs: 0, droppedFrame: true, degradedReason: "canvas_2d_unavailable", warnings: [] };
    }
    subjCtx.clearRect(0, 0, this.subjectCanvas.width, this.subjectCanvas.height);
    subjCtx.drawImage(args.source, 0, 0, this.subjectCanvas.width, this.subjectCanvas.height);
    // Apply matte: keep only subject.
    subjCtx.globalCompositeOperation = "destination-in";
    subjCtx.drawImage(this.matteCanvas, 0, 0);
    subjCtx.globalCompositeOperation = "source-over";

    // Draw background blurred (full frame).
    outputCtx.clearRect(0, 0, w, h);
    outputCtx.filter = blurPx > 0.1 ? `blur(${blurPx.toFixed(1)}px)` : "none";
    outputCtx.drawImage(args.source, 0, 0, w, h);
    outputCtx.filter = "none";

    // Composite the sharp subject on top.
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
