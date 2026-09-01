import assert from "node:assert/strict";
import test from "node:test";
import { extractSegmentationMaskFromRgba } from "../src/features/visual-effects/providers/mediapipeSelfieSegmentationProvider";
import { resolveCanvasBackingScale, resolveMatteControlScale } from "../src/features/visual-effects/render/visualEffectCssSpace";
import { buildDefaultVisualPreviewSettings, normalizeVisualPreviewSettings } from "../src/editor/hammerWorkspaceShellStateAdapters";

function rgbaFrame(pixelCount: number, pixel: (index: number) => [number, number, number, number]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let px = 0; px < pixelCount; px += 1) rgba.set(pixel(px), px * 4);
  return rgba;
}

test("selects informative alpha once for the complete frame", () => {
  const rgba = rgbaFrame(100, (px) => [17, 17, 17, Math.round((px / 99) * 255)]);
  const result = extractSegmentationMaskFromRgba(rgba);
  assert.equal(result.channel, "alpha");
  assert.equal(result.mask[0], 0);
  assert.equal(result.mask[99], 255, "opaque foreground must not switch to RGB");
});

test("uses luminance when alpha is an opaque transport channel", () => {
  const rgba = rgbaFrame(100, (px) => {
    const confidence = Math.round((px / 99) * 255);
    return [confidence, confidence, confidence, 255];
  });
  const result = extractSegmentationMaskFromRgba(rgba);
  assert.equal(result.channel, "luminance");
  assert.equal(result.mask[0], 0);
  assert.equal(result.mask[99], 255);
});

test("does not treat one transparent alpha outlier as a segmentation plane", () => {
  const rgba = rgbaFrame(100, (px) => {
    const confidence = px < 50 ? 0 : 255;
    return [confidence, confidence, confidence, px === 0 ? 0 : 255];
  });
  const result = extractSegmentationMaskFromRgba(rgba);
  assert.equal(result.channel, "luminance");
  assert.equal(result.mask[0], 0);
  assert.equal(result.mask[99], 255);
});

test("keeps matte controls stable in CSS space across mask resolution and DPR", () => {
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const backingScale = resolveCanvasBackingScale({
      canvasWidth: 640 * dpr,
      canvasHeight: 360 * dpr,
      surfaceCssWidth: 640,
      surfaceCssHeight: 360,
    });
    assert.ok(Math.abs(backingScale - dpr) < 1e-9);

    for (const [maskWidth, maskHeight] of [[640, 360], [256, 144]]) {
      const scale = resolveMatteControlScale({ maskWidth, maskHeight, surfaceCssWidth: 640, surfaceCssHeight: 360 });
      const featherMaskPx = 3 * scale.maskPixelsPerCssPixel;
      const displayedCssPx = featherMaskPx * (scale.contentCssWidth / maskWidth);
      assert.ok(Math.abs(displayedCssPx - 3) < 1e-9);
    }
  }
});

test("retunes only the complete legacy blur defaults", () => {
  const current = buildDefaultVisualPreviewSettings();
  assert.equal(current.background_blur_feather_px, 3);
  assert.equal(current.background_blur_subject_expansion_px, 5);

  const legacy = normalizeVisualPreviewSettings({
    ...current,
    background_blur_px: 14,
    background_blur_feather_px: 6,
    background_blur_temporal_smoothing: 0.25,
    background_blur_subject_expansion_px: 0,
    background_blur_quality_mode: "medium",
  });
  assert.equal(legacy.background_blur_feather_px, 3);
  assert.equal(legacy.background_blur_subject_expansion_px, 5);

  const customized = normalizeVisualPreviewSettings({
    ...current,
    background_blur_px: 14,
    background_blur_feather_px: 6,
    background_blur_temporal_smoothing: 0.4,
    background_blur_subject_expansion_px: 0,
    background_blur_quality_mode: "medium",
  });
  assert.equal(customized.background_blur_feather_px, 6);
  assert.equal(customized.background_blur_subject_expansion_px, 0);
});
