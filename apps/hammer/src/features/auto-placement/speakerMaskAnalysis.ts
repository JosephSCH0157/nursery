import type { ForegroundMatte } from "../visual-effects/types";
import type { Rect } from "./types";

export const SPEAKER_MASK_ALPHA_THRESHOLD = 132;
export const SPEAKER_MASK_MIN_AREA_RATIO = 0.0025;
export const SPEAKER_MASK_MIN_PIXELS = 24;
export const MAX_SPEAKER_MASK_COMPONENTS = 2;

export function extractSpeakerMaskBoundsFromMatte(args: {
  matte: ForegroundMatte;
  alphaThreshold?: number;
  maxComponents?: number;
}): Rect[] {
  const threshold = Number.isFinite(args.alphaThreshold) ? Number(args.alphaThreshold) : SPEAKER_MASK_ALPHA_THRESHOLD;
  const maxComponents = Math.max(1, Math.floor(args.maxComponents ?? MAX_SPEAKER_MASK_COMPONENTS));
  const width = args.matte.width;
  const height = args.matte.height;
  const alpha = args.matte.alphaMask;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  if (!alpha || alpha.length !== width * height) return [];
  const minPixels = Math.max(SPEAKER_MASK_MIN_PIXELS, Math.floor((width * height) * SPEAKER_MASK_MIN_AREA_RATIO));
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components: Array<Rect & { pixels: number }> = [];

  for (let start = 0; start < alpha.length; start += 1) {
    if (visited[start]) continue;
    visited[start] = 1;
    if (alpha[start]! < threshold) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let pixels = 0;

    while (head < tail) {
      const idx = queue[head++]!;
      const x = idx % width;
      const y = Math.floor(idx / width);
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const neighbor of [idx - 1, idx + 1, idx - width, idx + width]) {
        if (neighbor < 0 || neighbor >= alpha.length || visited[neighbor]) continue;
        const nx = neighbor % width;
        const ny = Math.floor(neighbor / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        visited[neighbor] = 1;
        if (alpha[neighbor]! >= threshold) queue[tail++] = neighbor;
      }
    }

    if (pixels >= minPixels) {
      components.push({
        x: minX,
        y: minY,
        width: Math.max(1, (maxX - minX) + 1),
        height: Math.max(1, (maxY - minY) + 1),
        pixels,
      });
    }
  }

  return components
    .sort((a, b) => b.pixels - a.pixels)
    .slice(0, maxComponents)
    .map(({ x, y, width: componentWidth, height: componentHeight }) => ({
      x,
      y,
      width: componentWidth,
      height: componentHeight,
    }));
}
