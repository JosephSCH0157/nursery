import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SimpleMatteRefiner } from "../src/features/visual-effects/matte/simpleMatteRefiner";
import type { MatteBuildOptions, SegmentationResult } from "../src/features/visual-effects/types";

const options: MatteBuildOptions = {
  featherPx: 0,
  subjectExpansionPx: 0,
  temporalSmoothing: 0,
  quality: "low",
};
const hammerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function segmentation(width: number, height: number, personMask: Uint8ClampedArray): SegmentationResult {
  const foreground = Array.from(personMask).filter((value) => value >= 128).length;
  return {
    width,
    height,
    personMask,
    confidenceSummary: { score: 0.9, foregroundRatio: foreground / Math.max(1, personMask.length), warnings: [] },
    processingMs: 1,
    sourceTimestampSec: 1,
    providerName: "synthetic",
    warnings: [],
  };
}

function fillRect(mask: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number, alpha = 255): void {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) mask[(row * width) + col] = alpha;
  }
}

test("removes unsupported speckles while preserving a primary subject", () => {
  const width = 40;
  const mask = new Uint8ClampedArray(width * 30);
  fillRect(mask, width, 12, 5, 16, 22);
  mask[(2 * width) + 2] = 180;
  const matte = new SimpleMatteRefiner().buildMatte(segmentation(width, 30, mask), options);
  assert.equal(matte.alphaMask[(2 * width) + 2], 0);
  assert.ok(matte.alphaMask[(15 * width) + 20]! > 200);
});

test("preserves every meaningful subject without a component-count limit", () => {
  const width = 60;
  const mask = new Uint8ClampedArray(width * 30);
  fillRect(mask, width, 3, 5, 12, 20);
  fillRect(mask, width, 24, 5, 12, 20);
  fillRect(mask, width, 45, 5, 12, 20);
  const matte = new SimpleMatteRefiner().buildMatte(segmentation(width, 30, mask), options);
  assert.ok(matte.alphaMask[(15 * width) + 8]! > 200);
  assert.ok(matte.alphaMask[(15 * width) + 29]! > 200);
  assert.ok(matte.alphaMask[(15 * width) + 50]! > 200);
});

test("fills tiny enclosed holes but preserves major negative space", () => {
  const width = 40;
  const mask = new Uint8ClampedArray(width * 30);
  fillRect(mask, width, 5, 4, 30, 22);
  mask[(12 * width) + 15] = 0;
  fillRect(mask, width, 24, 8, 6, 10, 0);
  const matte = new SimpleMatteRefiner().buildMatte(segmentation(width, 30, mask), options);
  assert.ok(matte.alphaMask[(12 * width) + 15]! > 200);
  assert.equal(matte.alphaMask[(12 * width) + 26], 0);
});

test("preserves frame-edge components and nearby high-confidence details", () => {
  const width = 40;
  const mask = new Uint8ClampedArray(width * 30);
  fillRect(mask, width, 12, 6, 16, 20);
  mask[10 * width] = 160;
  mask[(14 * width) + 29] = 245;
  mask[(14 * width) + 30] = 245;
  const matte = new SimpleMatteRefiner().buildMatte(segmentation(width, 30, mask), options);
  assert.ok(matte.alphaMask[10 * width]! > 0);
  assert.ok(matte.alphaMask[(14 * width) + 29]! > 200);
});

test("preserves graduated edge evidence and is deterministic", () => {
  const width = 30;
  const mask = new Uint8ClampedArray(width * 20);
  fillRect(mask, width, 8, 4, 14, 14);
  mask[(8 * width) + 7] = 80;
  const first = new SimpleMatteRefiner().buildMatte(segmentation(width, 20, mask), options);
  const second = new SimpleMatteRefiner().buildMatte(segmentation(width, 20, mask), options);
  assert.ok(first.alphaMask[(8 * width) + 7]! > 0 && first.alphaMask[(8 * width) + 7]! < 255);
  assert.deepEqual(first.alphaMask, second.alphaMask);
});

test("keeps a correctly sized all-background mask valid", () => {
  const matte = new SimpleMatteRefiner().buildMatte(segmentation(20, 10, new Uint8ClampedArray(200)), options);
  assert.equal(matte.width, 20);
  assert.equal(matte.height, 10);
  assert.equal(matte.alphaMask.length, 200);
  assert.equal(matte.alphaMask.some((value) => value !== 0), false);
});

test("rejects malformed provider buffers and dimensions", () => {
  const refiner = new SimpleMatteRefiner();
  assert.throws(() => refiner.buildMatte(segmentation(10, 10, new Uint8ClampedArray(0)), options), /invalid mask buffer/i);
  assert.throws(() => refiner.buildMatte(segmentation(10, 10, new Uint8ClampedArray(99)), options), /invalid mask buffer/i);
  assert.throws(() => refiner.buildMatte(segmentation(Number.NaN, 10, new Uint8ClampedArray(100)), options), /invalid mask dimensions/i);
});

test("blur, replacement, and placement derive from canonical alphaMask", () => {
  const blur = readFileSync(resolve(hammerRoot, "src/features/visual-effects/effects/backgroundBlurRenderer.ts"), "utf8");
  const replacement = readFileSync(resolve(hammerRoot, "src/features/visual-effects/effects/backgroundReplacementRenderer.ts"), "utf8");
  const previewLayer = readFileSync(resolve(hammerRoot, "src/features/visual-effects/render/backgroundBlurPreviewLayer.tsx"), "utf8");
  const speakerAnalysis = readFileSync(resolve(hammerRoot, "src/features/auto-placement/speakerMaskAnalysis.ts"), "utf8");
  assert.match(blur, /args\.matte\.alphaMask\[px\]/);
  assert.match(replacement, /args\.matte\.alphaMask\[px\]/);
  assert.match(previewLayer, /extractSpeakerMaskBoundsFromMatte\(\{\s*matte:\s*cachedMatte\.matte,/s);
  assert.match(speakerAnalysis, /const alpha = args\.matte\.alphaMask;/);
  assert.match(previewLayer, /from "\.\.\/\.\.\/auto-placement\/speakerMaskAnalysis"/);
  assert.doesNotMatch(previewLayer, /extractSpeakerMaskBoundsFromMatte\(\{[^}]*debugPlanes/s);
  assert.doesNotMatch(previewLayer, /extractSpeakerMaskBoundsFromMatte\(\{[^}]*personMask/s);
});
