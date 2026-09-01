export type MatteControlScale = {
  contentCssWidth: number;
  contentCssHeight: number;
  maskPixelsPerCssPixel: number;
};

export function resolveMatteControlScale(args: {
  maskWidth: number;
  maskHeight: number;
  surfaceCssWidth: number;
  surfaceCssHeight: number;
}): MatteControlScale {
  const maskWidth = Math.max(1, args.maskWidth);
  const maskHeight = Math.max(1, args.maskHeight);
  const surfaceWidth = Math.max(1, args.surfaceCssWidth);
  const surfaceHeight = Math.max(1, args.surfaceCssHeight);
  const fit = Math.min(surfaceWidth / maskWidth, surfaceHeight / maskHeight);
  const contentCssWidth = maskWidth * fit;
  const contentCssHeight = maskHeight * fit;
  const scaleX = maskWidth / contentCssWidth;
  const scaleY = maskHeight / contentCssHeight;
  return {
    contentCssWidth,
    contentCssHeight,
    maskPixelsPerCssPixel: Math.sqrt(scaleX * scaleY),
  };
}

export function resolveCanvasBackingScale(args: {
  canvasWidth: number;
  canvasHeight: number;
  surfaceCssWidth: number;
  surfaceCssHeight: number;
}): number {
  const scaleX = args.canvasWidth / Math.max(1, args.surfaceCssWidth);
  const scaleY = args.canvasHeight / Math.max(1, args.surfaceCssHeight);
  return Math.sqrt(Math.max(0, scaleX) * Math.max(0, scaleY));
}
