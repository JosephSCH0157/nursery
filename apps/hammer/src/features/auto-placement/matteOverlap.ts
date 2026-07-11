import type {
  PlacementForegroundMatte,
  PlacementMatteOverlap,
  Rect,
} from "./types";

export const PLACEMENT_FOREGROUND_ALPHA_THRESHOLD = 132;

export type PlacementMatteOverlapIndex = Readonly<{
  frameWidth: number;
  frameHeight: number;
  maskWidth: number;
  maskHeight: number;
  query(rect: Rect): PlacementMatteOverlap;
}>;

function summedAreaValue(
  table: Float64Array,
  stride: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  return table[(y1 * stride) + x1]!
    - table[(y0 * stride) + x1]!
    - table[(y1 * stride) + x0]!
    + table[(y0 * stride) + x0]!;
}

export function createPlacementMatteOverlapIndex(args: {
  frame: { width: number; height: number };
  matte: PlacementForegroundMatte;
  alphaThreshold?: number;
}): PlacementMatteOverlapIndex | null {
  const frameWidth = Number(args.frame.width);
  const frameHeight = Number(args.frame.height);
  const maskWidth = Number(args.matte.width);
  const maskHeight = Number(args.matte.height);
  const alpha = args.matte.alphaMask;
  if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) || frameWidth <= 0 || frameHeight <= 0) return null;
  if (!Number.isInteger(maskWidth) || !Number.isInteger(maskHeight) || maskWidth <= 0 || maskHeight <= 0) return null;
  if (!(alpha instanceof Uint8ClampedArray) || alpha.length !== maskWidth * maskHeight) return null;

  const threshold = Number.isFinite(args.alphaThreshold)
    ? Math.max(0, Math.min(255, Number(args.alphaThreshold)))
    : PLACEMENT_FOREGROUND_ALPHA_THRESHOLD;
  const stride = maskWidth + 1;
  const foregroundTable = new Float64Array((maskHeight + 1) * stride);
  const alphaTable = new Float64Array((maskHeight + 1) * stride);

  for (let y = 1; y <= maskHeight; y += 1) {
    let rowForeground = 0;
    let rowAlpha = 0;
    for (let x = 1; x <= maskWidth; x += 1) {
      const value = alpha[((y - 1) * maskWidth) + (x - 1)] ?? 0;
      rowForeground += value >= threshold ? 1 : 0;
      rowAlpha += value;
      foregroundTable[(y * stride) + x] = foregroundTable[((y - 1) * stride) + x]! + rowForeground;
      alphaTable[(y * stride) + x] = alphaTable[((y - 1) * stride) + x]! + rowAlpha;
    }
  }

  const query = (rect: Rect): PlacementMatteOverlap => {
    const left = Math.max(0, Math.min(frameWidth, rect.x));
    const top = Math.max(0, Math.min(frameHeight, rect.y));
    const right = Math.max(left, Math.min(frameWidth, rect.x + rect.width));
    const bottom = Math.max(top, Math.min(frameHeight, rect.y + rect.height));
    const x0 = Math.max(0, Math.min(maskWidth, Math.floor((left / frameWidth) * maskWidth)));
    const y0 = Math.max(0, Math.min(maskHeight, Math.floor((top / frameHeight) * maskHeight)));
    const x1 = Math.max(x0, Math.min(maskWidth, Math.ceil((right / frameWidth) * maskWidth)));
    const y1 = Math.max(y0, Math.min(maskHeight, Math.ceil((bottom / frameHeight) * maskHeight)));
    const sampledPixels = Math.max(0, (x1 - x0) * (y1 - y0));
    if (sampledPixels === 0) {
      return Object.freeze({
        sampledPixels: 0,
        coveredForegroundPixels: 0,
        foregroundPixelRatio: 0,
        alphaWeightedForegroundRatio: 0,
      });
    }
    const coveredForegroundPixels = Math.round(summedAreaValue(foregroundTable, stride, x0, y0, x1, y1));
    const alphaTotal = summedAreaValue(alphaTable, stride, x0, y0, x1, y1);
    return Object.freeze({
      sampledPixels,
      coveredForegroundPixels,
      foregroundPixelRatio: coveredForegroundPixels / sampledPixels,
      alphaWeightedForegroundRatio: alphaTotal / (sampledPixels * 255),
    });
  };

  return Object.freeze({ frameWidth, frameHeight, maskWidth, maskHeight, query });
}
