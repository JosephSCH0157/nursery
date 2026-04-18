export type ContainedDrawRect = {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

function resolveSourceSize(source: CanvasImageSource): { width: number; height: number } | null {
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

export function resolveContainedDrawRect(args: {
  source: CanvasImageSource;
  destWidth: number;
  destHeight: number;
}): ContainedDrawRect | null {
  const sourceSize = resolveSourceSize(args.source);
  if (!sourceSize) return null;
  const scale = Math.min(args.destWidth / sourceSize.width, args.destHeight / sourceSize.height);
  const dw = sourceSize.width * scale;
  const dh = sourceSize.height * scale;
  return {
    dx: (args.destWidth - dw) / 2,
    dy: (args.destHeight - dh) / 2,
    dw,
    dh,
  };
}

export function drawSourceContained(args: {
  ctx: CanvasRenderingContext2D;
  source: CanvasImageSource;
  destWidth: number;
  destHeight: number;
  clear?: boolean;
  clipToContent?: boolean;
}): ContainedDrawRect | null {
  const rect = resolveContainedDrawRect({
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
  args.ctx.drawImage(args.source, rect.dx, rect.dy, rect.dw, rect.dh);
  args.ctx.restore();
  return rect;
}