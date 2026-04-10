import type { EyeContactAssistSettings, FaceLandmarksFrame } from "../types";

type RenderMapping =
  | { mode: "stretch" }
  | { mode: "contain"; videoWidth: number; videoHeight: number };

export type EyeContactAssistRenderResult = {
  applied: boolean;
  warnings: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function meanPoint(points: Array<{ x: number; y: number }>): { x: number; y: number } | null {
  if (points.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function computeContainTransform(args: {
  canvasWidth: number;
  canvasHeight: number;
  videoWidth: number;
  videoHeight: number;
}): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(args.canvasWidth / Math.max(1, args.videoWidth), args.canvasHeight / Math.max(1, args.videoHeight));
  const displayW = args.videoWidth * scale;
  const displayH = args.videoHeight * scale;
  const offsetX = (args.canvasWidth - displayW) / 2;
  const offsetY = (args.canvasHeight - displayH) / 2;
  return { scale, offsetX, offsetY };
}

function toCanvasPoint(args: {
  normX: number;
  normY: number;
  output: HTMLCanvasElement;
  mapping: RenderMapping;
}): { x: number; y: number } {
  const x01 = clamp01(args.normX);
  const y01 = clamp01(args.normY);

  if (args.mapping.mode === "stretch") {
    return {
      x: x01 * args.output.width,
      y: y01 * args.output.height,
    };
  }

  const t = computeContainTransform({
    canvasWidth: args.output.width,
    canvasHeight: args.output.height,
    videoWidth: args.mapping.videoWidth,
    videoHeight: args.mapping.videoHeight,
  });

  return {
    x: t.offsetX + (x01 * args.mapping.videoWidth * t.scale),
    y: t.offsetY + (y01 * args.mapping.videoHeight * t.scale),
  };
}

function computeEyeWidthPx(args: {
  eye: FaceLandmarksFrame["leftEye"];
  output: HTMLCanvasElement;
  mapping: RenderMapping;
}): number {
  const pInner = toCanvasPoint({ normX: args.eye.innerCorner.x, normY: args.eye.innerCorner.y, output: args.output, mapping: args.mapping });
  const pOuter = toCanvasPoint({ normX: args.eye.outerCorner.x, normY: args.eye.outerCorner.y, output: args.output, mapping: args.mapping });
  return Math.hypot(pInner.x - pOuter.x, pInner.y - pOuter.y);
}

export class EyeContactAssistRenderer {
  private patchCanvas: HTMLCanvasElement | null = null;
  private patchCtx: CanvasRenderingContext2D | null = null;

  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;

  private ensurePatchCanvases(sizePx: number): void {
    const size = Math.max(1, Math.round(sizePx));
    if (!this.patchCanvas) this.patchCanvas = document.createElement("canvas");
    if (!this.maskCanvas) this.maskCanvas = document.createElement("canvas");
    if (this.patchCanvas.width !== size) this.patchCanvas.width = size;
    if (this.patchCanvas.height !== size) this.patchCanvas.height = size;
    if (this.maskCanvas.width !== size) this.maskCanvas.width = size;
    if (this.maskCanvas.height !== size) this.maskCanvas.height = size;
    if (!this.patchCtx) this.patchCtx = this.patchCanvas.getContext("2d", { willReadFrequently: false });
    if (!this.maskCtx) this.maskCtx = this.maskCanvas.getContext("2d", { willReadFrequently: false });
  }

  public render(args: {
    source: CanvasImageSource;
    output: HTMLCanvasElement;
    frame: FaceLandmarksFrame;
    correction: { x: number; y: number };
    settings: EyeContactAssistSettings;
    mapping: RenderMapping;
    debugOverlay: boolean;
  }): EyeContactAssistRenderResult {
    const warnings: string[] = [];
    const ctx = args.output.getContext("2d");
    if (!ctx) return { applied: false, warnings: ["no_output_context"] };

    ctx.clearRect(0, 0, args.output.width, args.output.height);

    if (!args.settings.enabled || args.settings.strength <= 0) {
      return { applied: false, warnings };
    }

    const eyePatch = (eye: FaceLandmarksFrame["leftEye"], eyeSide: "left" | "right") => {
      const irisCenter = meanPoint(eye.iris) ?? {
        x: (eye.innerCorner.x + eye.outerCorner.x) / 2,
        y: (eye.innerCorner.y + eye.outerCorner.y) / 2,
      };

      const irisCanvas = toCanvasPoint({ normX: irisCenter.x, normY: irisCenter.y, output: args.output, mapping: args.mapping });
      const eyeWidthPx = computeEyeWidthPx({ eye, output: args.output, mapping: args.mapping });
      const baseSize = clamp(eyeWidthPx * 0.48, 16, 72);
      const patchSize = Math.round(baseSize);

      const strength = clamp01(args.settings.strength);
      const maxShiftRatio = 0.18;
      const dx = args.correction.x * eyeWidthPx * strength * maxShiftRatio;
      const dy = args.correction.y * eyeWidthPx * strength * (maxShiftRatio * 0.6);

      if (!Number.isFinite(irisCanvas.x) || !Number.isFinite(irisCanvas.y) || eyeWidthPx <= 0) {
        warnings.push(`bad_eye_geometry:${eyeSide}`);
        return;
      }

      this.ensurePatchCanvases(patchSize);
      if (!this.patchCanvas || !this.patchCtx || !this.maskCanvas || !this.maskCtx) return;

      const sx = irisCanvas.x - (patchSize / 2);
      const sy = irisCanvas.y - (patchSize / 2);
      const destX = sx + dx;
      const destY = sy + dy;

      this.patchCtx.clearRect(0, 0, patchSize, patchSize);
      this.patchCtx.drawImage(args.source, sx, sy, patchSize, patchSize, 0, 0, patchSize, patchSize);

      this.maskCtx.clearRect(0, 0, patchSize, patchSize);
      const r = patchSize / 2;
      const grad = this.maskCtx.createRadialGradient(r, r, r * 0.15, r, r, r);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.55, "rgba(255,255,255,0.92)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      this.maskCtx.fillStyle = grad;
      this.maskCtx.fillRect(0, 0, patchSize, patchSize);

      this.patchCtx.globalCompositeOperation = "destination-in";
      this.patchCtx.drawImage(this.maskCanvas, 0, 0);
      this.patchCtx.globalCompositeOperation = "source-over";

      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.patchCanvas, destX, destY);

      if (args.debugOverlay) {
        ctx.save();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(sx, sy, patchSize, patchSize);
        ctx.stroke();
        ctx.fillStyle = "rgba(244, 114, 182, 0.9)";
        ctx.beginPath();
        ctx.arc(irisCanvas.x, irisCanvas.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(244, 114, 182, 0.9)";
        ctx.beginPath();
        ctx.moveTo(irisCanvas.x, irisCanvas.y);
        ctx.lineTo(irisCanvas.x + dx, irisCanvas.y + dy);
        ctx.stroke();
        ctx.restore();
      }
    };

    eyePatch(args.frame.leftEye, "left");
    eyePatch(args.frame.rightEye, "right");

    return { applied: true, warnings };
  }
}

