export type ContainedDrawRect = {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

export type HammerPreviewContentGeometry = {
  sourceWidth: number;
  sourceHeight: number;
  destWidth: number;
  destHeight: number;
  contentRect: ContainedDrawRect;
  sourceToDestScale: number;
};

export function resolveSourceSize(source: CanvasImageSource): { width: number; height: number } | null {
  const candidate = source as {
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
    displayWidth?: number;
    displayHeight?: number;
  };
  const width = candidate.videoWidth
    ?? candidate.naturalWidth
    ?? candidate.displayWidth
    ?? candidate.width
    ?? 0;
  const height = candidate.videoHeight
    ?? candidate.naturalHeight
    ?? candidate.displayHeight
    ?? candidate.height
    ?? 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function resolvePreviewContentGeometry(args: {
  source: CanvasImageSource;
  destWidth: number;
  destHeight: number;
}): HammerPreviewContentGeometry | null {
  const sourceSize = resolveSourceSize(args.source);
  if (
    !sourceSize
    || !Number.isFinite(args.destWidth)
    || !Number.isFinite(args.destHeight)
    || args.destWidth <= 0
    || args.destHeight <= 0
  ) return null;
  const sourceToDestScale = Math.min(args.destWidth / sourceSize.width, args.destHeight / sourceSize.height);
  const rawDw = sourceSize.width * sourceToDestScale;
  const rawDh = sourceSize.height * sourceToDestScale;
  const dw = Math.abs(rawDw - args.destWidth) < 1e-9 ? args.destWidth : rawDw;
  const dh = Math.abs(rawDh - args.destHeight) < 1e-9 ? args.destHeight : rawDh;
  const rawDx = (args.destWidth - dw) / 2;
  const rawDy = (args.destHeight - dh) / 2;
  return {
    sourceWidth: sourceSize.width,
    sourceHeight: sourceSize.height,
    destWidth: args.destWidth,
    destHeight: args.destHeight,
    contentRect: {
      dx: Math.abs(rawDx) < 1e-9 ? 0 : rawDx,
      dy: Math.abs(rawDy) < 1e-9 ? 0 : rawDy,
      dw,
      dh,
    },
    sourceToDestScale,
  };
}

export function resolveContainedDrawRect(args: {
  source: CanvasImageSource;
  destWidth: number;
  destHeight: number;
}): ContainedDrawRect | null {
  return resolvePreviewContentGeometry(args)?.contentRect ?? null;
}

export function drawSourceInContentRect(args: {
  ctx: CanvasRenderingContext2D;
  source: CanvasImageSource;
  rect: ContainedDrawRect;
}): void {
  args.ctx.drawImage(args.source, args.rect.dx, args.rect.dy, args.rect.dw, args.rect.dh);
}

export function drawSourceContained(args: {
  ctx: CanvasRenderingContext2D;
  source: CanvasImageSource;
  destWidth: number;
  destHeight: number;
  clear?: boolean;
  clipToContent?: boolean;
  geometry?: HammerPreviewContentGeometry | null;
}): ContainedDrawRect | null {
  const rect = args.geometry?.contentRect ?? resolveContainedDrawRect({
    source: args.source,
    destWidth: args.destWidth,
    destHeight: args.destHeight,
  });
  if (args.clear !== false) {
    args.ctx.clearRect(0, 0, args.destWidth, args.destHeight);
  }
  if (!rect) return null;

  args.ctx.save();
  args.ctx.imageSmoothingEnabled = true;
  if (args.clipToContent) {
    args.ctx.beginPath();
    args.ctx.rect(rect.dx, rect.dy, rect.dw, rect.dh);
    args.ctx.clip();
  }
  drawSourceInContentRect({ ctx: args.ctx, source: args.source, rect });
  args.ctx.restore();
  return rect;
}
