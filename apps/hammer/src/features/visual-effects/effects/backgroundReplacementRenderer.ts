import type { BackgroundEffectFrameResult, BackgroundEffectRenderer, BackgroundBlurSettings, ForegroundMatte } from "../types";

function nowMs(): number {
  return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
}

function buildCheckerboardPatternCanvas(args: { cellPx: number; light: string; dark: string }): HTMLCanvasElement {
  const cell = Math.max(2, Math.round(args.cellPx));
  const canvas = document.createElement("canvas");
  canvas.width = cell * 2;
  canvas.height = cell * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available for checkerboard.");
  ctx.fillStyle = args.light;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = args.dark;
  ctx.fillRect(0, 0, cell, cell);
  ctx.fillRect(cell, cell, cell, cell);
  return canvas;
}

function buildReplacementMatteCanvas(args: { matte: ForegroundMatte; featherPx: number }): HTMLCanvasElement {
  // Replacement is a harsher inspection mode than blur: reduce haloing by
  // suppressing very-low alpha and slightly hardening the transition curve.
  const canvas = document.createElement("canvas");
  canvas.width = args.matte.width;
  canvas.height = args.matte.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D not available for matte compositing.");
  const image = ctx.createImageData(args.matte.width, args.matte.height);
  const threshold = Math.max(6, Math.min(22, Math.round(8 + (args.featherPx * 0.4))));
  const gamma = 0.78;
  const confidence = Math.max(0, Math.min(1, args.matte.metadata.confidenceScore || 0));
  const edgeFavor = 0.08 + ((1 - confidence) * 0.1);
  for (let i = 0, px = 0; i < image.data.length; i += 4, px += 1) {
    const raw = args.matte.alphaMask[px] ?? 0;
    let a = raw;
    if (a < threshold) {
      a = 0;
    } else {
      const normalized = a / 255;
      a = Math.max(0, Math.min(255, Math.round((normalized ** gamma) * 255)));
      if (a >= 18 && a <= 210) {
        const centered = 1 - (Math.abs(a - 128) / 128);
        const boost = Math.max(0, centered) * edgeFavor;
        a = Math.round(a + ((255 - a) * boost));
      }
    }
    image.data[i] = 255;
    image.data[i + 1] = 255;
    image.data[i + 2] = 255;
    image.data[i + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function applyBoundaryDesaturation(args: {
  canvas: HTMLCanvasElement;
  matte: ForegroundMatte;
}): void {
  const ctx = args.canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, args.canvas.width, args.canvas.height);
  const data = image.data;
  const edgeBand = args.matte.metadata.edgeBandAlphaMask;
  const confidence = Math.max(0, Math.min(1, args.matte.metadata.confidenceScore || 0));
  const factor = 0.06 + ((1 - confidence) * 0.08);
  for (let i = 0, px = 0; i < data.length; i += 4, px += 1) {
    const alpha = data[i + 3] ?? 0;
    if (alpha <= 0) continue;
    if (edgeBand) {
      if ((edgeBand[px] ?? 0) === 0) continue;
    } else if (alpha < 20 || alpha > 220) {
      continue;
    }
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const luma = Math.round((0.2126 * r) + (0.7152 * g) + (0.0722 * b));
    data[i] = Math.round((r * (1 - factor)) + (luma * factor));
    data[i + 1] = Math.round((g * (1 - factor)) + (luma * factor));
    data[i + 2] = Math.round((b * (1 - factor)) + (luma * factor));
  }
  ctx.putImageData(image, 0, 0);
}

function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number): void {
  // Simple cover fit based on intrinsic size when available.
  const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLVideoElement).videoWidth || (img as HTMLCanvasElement).width || w;
  const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLVideoElement).videoHeight || (img as HTMLCanvasElement).height || h;
  if (!iw || !ih) {
    ctx.drawImage(img, 0, 0, w, h);
    return;
  }
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

export class BackgroundReplacementRenderer implements BackgroundEffectRenderer {
  private subjectCanvas: HTMLCanvasElement | null = null;
  private matteCanvas: HTMLCanvasElement | null = null;
  private replacementImageUrl: string | null = null;
  private replacementImage: HTMLImageElement | null = null;
  private replacementImageReady = false;
  private replacementImageError: string | null = null;
  private checkerboardPatternCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
  private checkerboardPatternCanvas: HTMLCanvasElement | null = null;

  private ensureReplacementImage(url: string | null): void {
    const nextUrl = url?.trim() || null;
    if (!nextUrl) {
      this.replacementImageUrl = null;
      this.replacementImage = null;
      this.replacementImageReady = false;
      this.replacementImageError = null;
      return;
    }
    if (this.replacementImageUrl === nextUrl && this.replacementImage) return;
    this.replacementImageUrl = nextUrl;
    this.replacementImageReady = false;
    this.replacementImageError = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.replacementImageReady = true;
    };
    img.onerror = () => {
      this.replacementImageError = "replacement_image_load_failed";
      this.replacementImageReady = false;
    };
    img.src = nextUrl;
    this.replacementImage = img;
  }

  private getCheckerboardPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
    const cached = this.checkerboardPatternCache.get(ctx);
    if (cached) return cached;
    if (!this.checkerboardPatternCanvas) {
      this.checkerboardPatternCanvas = buildCheckerboardPatternCanvas({
        cellPx: 28,
        light: "#383838",
        dark: "#262626",
      });
    }
    const pattern = ctx.createPattern(this.checkerboardPatternCanvas, "repeat");
    if (!pattern) throw new Error("Failed to create checkerboard pattern.");
    this.checkerboardPatternCache.set(ctx, pattern);
    return pattern;
  }

  public render(args: {
    source: CanvasImageSource;
    matte: ForegroundMatte;
    settings: BackgroundBlurSettings;
    output: HTMLCanvasElement;
  }): BackgroundEffectFrameResult {
    const started = nowMs();
    const warnings: string[] = [];

    if (!args.settings.replacementEnabled) {
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

    if (!this.subjectCanvas || this.subjectCanvas.width !== args.matte.width || this.subjectCanvas.height !== args.matte.height) {
      this.subjectCanvas = document.createElement("canvas");
      this.subjectCanvas.width = args.matte.width;
      this.subjectCanvas.height = args.matte.height;
    }
    // Update matte pixels for the current frame.
    this.matteCanvas = buildReplacementMatteCanvas({ matte: args.matte, featherPx: args.settings.edgeFeatherPx });

    const subjCtx = this.subjectCanvas.getContext("2d", { willReadFrequently: true });
    if (!subjCtx) {
      return { compositingMs: 0, droppedFrame: true, degradedReason: "canvas_2d_unavailable", warnings: [] };
    }
    subjCtx.clearRect(0, 0, this.subjectCanvas.width, this.subjectCanvas.height);
    subjCtx.drawImage(args.source, 0, 0, this.subjectCanvas.width, this.subjectCanvas.height);
    subjCtx.globalCompositeOperation = "destination-in";
    subjCtx.drawImage(this.matteCanvas, 0, 0);
    subjCtx.globalCompositeOperation = "source-over";
    applyBoundaryDesaturation({
      canvas: this.subjectCanvas,
      matte: args.matte,
    });

    let degradedReason: string | null = null;
    if (lowConfidence) {
      degradedReason = "segmentation_low_confidence";
    }

    if (args.settings.replacementMode === "image") {
      this.ensureReplacementImage(args.settings.replacementImageUrl);
      if (this.replacementImageError) {
        degradedReason = this.replacementImageError;
      } else if (!this.replacementImageReady || !this.replacementImage) {
        degradedReason = "replacement_image_not_ready";
      }
    }

    outputCtx.clearRect(0, 0, w, h);

    if (degradedReason && args.settings.fallbackMode === "passthrough") {
      // Keep preview honest: show passthrough when degraded and explicitly allowed.
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

    // Draw background replacement.
    if (args.settings.replacementMode === "solid") {
      outputCtx.fillStyle = args.settings.replacementColor || "#2b2b2b";
      outputCtx.fillRect(0, 0, w, h);
    } else if (args.settings.replacementMode === "checkerboard") {
      outputCtx.fillStyle = this.getCheckerboardPattern(outputCtx);
      outputCtx.fillRect(0, 0, w, h);
    } else if (this.replacementImageReady && this.replacementImage) {
      drawCover(outputCtx, this.replacementImage, w, h);
    } else {
      outputCtx.fillStyle = "#2b2b2b";
      outputCtx.fillRect(0, 0, w, h);
      warnings.push("replacement_image_fallback_solid");
    }

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
