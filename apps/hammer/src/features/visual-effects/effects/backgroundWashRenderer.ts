import type { BackgroundEffectFrameResult, BackgroundEffectRenderer, BackgroundBlurSettings, ForegroundMatte } from "../types";

function nowMs(): number {
  return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
}

function buildExclusionMatteCanvas(args: { matte: ForegroundMatte; featherPx: number }): HTMLCanvasElement {
  // Harden mask slightly so background-only treatments don't bleed into the subject edges.
  const canvas = document.createElement("canvas");
  canvas.width = args.matte.width;
  canvas.height = args.matte.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D not available for matte compositing.");
  const image = ctx.createImageData(args.matte.width, args.matte.height);
  const threshold = Math.max(8, Math.min(28, Math.round(10 + (args.featherPx * 0.55))));
  const gamma = 0.75;
  for (let i = 0, px = 0; i < image.data.length; i += 4, px += 1) {
    const raw = args.matte.alphaMask[px] ?? 0;
    let a = raw;
    if (a < threshold) {
      a = 0;
    } else {
      const normalized = a / 255;
      a = Math.max(0, Math.min(255, Math.round((normalized ** gamma) * 255)));
    }
    image.data[i] = 255;
    image.data[i + 1] = 255;
    image.data[i + 2] = 255;
    image.data[i + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export class BackgroundWashRenderer implements BackgroundEffectRenderer {
  private backgroundCanvas: HTMLCanvasElement | null = null;
  private exclusionMatteCanvas: HTMLCanvasElement | null = null;

  public render(args: {
    source: CanvasImageSource;
    matte: ForegroundMatte;
    settings: BackgroundBlurSettings;
    output: HTMLCanvasElement;
  }): BackgroundEffectFrameResult {
    const started = nowMs();
    const warnings: string[] = [];

    if (!args.settings.washEnabled) {
      return { compositingMs: 0, droppedFrame: false, degradedReason: "disabled", warnings: [] };
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

    const confidence = args.matte.metadata.confidenceScore;
    const lowConfidence = confidence < 0.25;

    let degradedReason: string | null = null;
    if (lowConfidence) degradedReason = "segmentation_low_confidence";

    outputCtx.clearRect(0, 0, w, h);

    if (degradedReason && args.settings.fallbackMode === "passthrough") {
      outputCtx.drawImage(args.source, 0, 0, w, h);
      const finished = nowMs();
      return {
        compositingMs: Math.max(0, Math.round((finished - started) * 10) / 10),
        droppedFrame: false,
        degradedReason,
        warnings: [...new Set([...args.matte.metadata.warnings, ...warnings])],
      };
    }

    if (degradedReason) {
      const finished = nowMs();
      return {
        compositingMs: Math.max(0, Math.round((finished - started) * 10) / 10),
        droppedFrame: false,
        degradedReason,
        warnings: [...new Set([...args.matte.metadata.warnings, ...warnings])],
      };
    }

    if (!this.backgroundCanvas || this.backgroundCanvas.width !== w || this.backgroundCanvas.height !== h) {
      this.backgroundCanvas = document.createElement("canvas");
      this.backgroundCanvas.width = w;
      this.backgroundCanvas.height = h;
    }

    // Build an exclusion matte at segmentation resolution, then scale to output.
    this.exclusionMatteCanvas = buildExclusionMatteCanvas({ matte: args.matte, featherPx: args.settings.edgeFeatherPx });

    const bgCtx = this.backgroundCanvas.getContext("2d", { willReadFrequently: true });
    if (!bgCtx) {
      return { compositingMs: 0, droppedFrame: true, degradedReason: "canvas_2d_unavailable", warnings: [] };
    }

    const dim = Math.max(0, Math.min(1, args.settings.washDimAmount));
    const desat = Math.max(0, Math.min(1, args.settings.washDesaturateAmount));
    const saturation = Math.max(0, 1 - (desat * 0.85));

    bgCtx.clearRect(0, 0, w, h);
    bgCtx.filter = desat > 0 ? `saturate(${saturation})` : "none";
    bgCtx.drawImage(args.source, 0, 0, w, h);
    bgCtx.filter = "none";

    // Remove the subject from the background pass using the exclusion matte.
    bgCtx.globalCompositeOperation = "destination-out";
    bgCtx.drawImage(this.exclusionMatteCanvas, 0, 0, w, h);
    bgCtx.globalCompositeOperation = "source-over";

    if (dim > 0.001) {
      bgCtx.fillStyle = `rgba(0, 0, 0, ${dim})`;
      bgCtx.fillRect(0, 0, w, h);
    }

    // Composite: subject from source + washed background behind it.
    outputCtx.drawImage(args.source, 0, 0, w, h);
    outputCtx.drawImage(this.backgroundCanvas, 0, 0, w, h);

    const finished = nowMs();
    return {
      compositingMs: Math.max(0, Math.round((finished - started) * 10) / 10),
      droppedFrame: false,
      degradedReason: null,
      warnings: [...new Set([...args.matte.metadata.warnings, ...warnings])],
    };
  }
}

