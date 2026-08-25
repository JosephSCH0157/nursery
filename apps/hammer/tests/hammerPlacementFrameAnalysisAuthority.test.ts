import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PlacementFrameAnalysisAuthority } from "../src/features/auto-placement/placementFrameAnalysisAuthority";
import type { FaceAnalysisFrame, FaceAnalysisResult, FaceLandmarkProvider } from "../src/features/eye-contact-assist/types";
import type { SegmentationProvider, SegmentationResult } from "../src/features/visual-effects/types";

const frameRef = Object.freeze({ captureEpoch: "epoch", captureRevision: 7, sourceIdentity: "media:rev-1",
  sourcePresentationTimeSec: 67.7, inferenceTimestampMs: 67_700, width: 2, height: 2,
  coordinateSpace: "placement_source_pixels" as const, geometricRevision: "2x2" });

function segmentation(mask: number[], confidence = 0.9, providerName = "fake"): SegmentationResult {
  return { width: 2, height: 2, personMask: new Uint8ClampedArray(mask), confidenceSummary: {
    score: confidence, foregroundRatio: mask.filter(Boolean).length / 4, warnings: [] }, processingMs: 1,
    sourceTimestampSec: 67.7, providerName, warnings: [] };
}

function fakeSegmentationProvider(name: string, result: SegmentationResult, counters: { initialize: number; segment: number; dispose: number }): SegmentationProvider {
  return { name, initialize: async () => { counters.initialize += 1; }, isReady: () => true,
    getReadiness: () => ({ status: "ready" }), segmentFrame: async () => { counters.segment += 1; return result; },
    dispose: async () => { counters.dispose += 1; } };
}

test("one authority owns one bounded face plus primary/fallback segmentation bundle", async () => {
  const faceCounters = { initialize: 0, analyze: 0, dispose: 0 };
  const primaryCounters = { initialize: 0, segment: 0, dispose: 0 };
  const fallbackCounters = { initialize: 0, segment: 0, dispose: 0 };
  const faceProvider: FaceLandmarkProvider = { name: "face", initialize: async () => { faceCounters.initialize += 1; },
    isReady: () => true, getReadiness: () => ({ status: "ready" }), analyzeFrame: async (frame): Promise<FaceAnalysisResult> => {
      faceCounters.analyze += 1; return { kind: "success", frameRef: frame.frameRef, faces: [], warnings: [] };
    }, dispose: async () => { faceCounters.dispose += 1; } };
  const authority = new PlacementFrameAnalysisAuthority({ factories: {
    face: () => faceProvider,
    primarySegmentation: () => fakeSegmentationProvider("primary", segmentation([0, 0, 0, 0], 0.9, "primary"), primaryCounters),
    fallbackSegmentation: () => fakeSegmentationProvider("fallback", segmentation([255, 0, 0, 0], 0.9, "fallback"), fallbackCounters),
  } });
  const frame: FaceAnalysisFrame = { frameRef, pixels: {} as CanvasImageSource, release() {} };
  await authority.analyzeFace(frame);
  const first = await authority.segmentDisplayedFrame({ source: frame.pixels, sourcePresentationTimeSec: 67.7 });
  assert.equal(first.providerSource, "primary");
  assert.equal(fallbackCounters.segment, 0, "all-background primary evidence remains valid and does not invoke fallback");
  authority.requestDisplayedFrame(frameRef);
  const face = await authority.analyzeFace(frame);
  assert.equal(authority.acceptFace(face), null);
  const matte = { kind: "success" as const, frameRef, matte: { width: 2, height: 2,
    alphaMask: new Uint8ClampedArray(4), featherPx: 0, temporalWeight: 0, quality: "medium" as const,
    metadata: { providerName: "primary", confidenceScore: 1, warnings: [] } }, speakerMaskBounds: [] };
  assert.ok(authority.acceptMatte(matte));
  await authority.dispose();
  assert.deepEqual([faceCounters.dispose, primaryCounters.dispose, fallbackCounters.dispose], [1, 1, 1]);
  await authority.dispose();
  assert.deepEqual([faceCounters.dispose, primaryCounters.dispose, fallbackCounters.dispose], [1, 1, 1], "dispose is idempotent");
});

test("invalid or low-confidence primary evidence preserves the existing fallback policy", async () => {
  for (const primary of [segmentation([255], 0.9, "bad-size"), segmentation([255, 0, 0, 0], 0.04, "low-confidence")]) {
    const primaryCounters = { initialize: 0, segment: 0, dispose: 0 };
    const fallbackCounters = { initialize: 0, segment: 0, dispose: 0 };
    const authority = new PlacementFrameAnalysisAuthority({ factories: {
      face: () => ({ name: "face", initialize: async () => {}, isReady: () => true, getReadiness: () => ({ status: "ready" }),
        analyzeFrame: async () => ({ kind: "unavailable", reason: "unused" }), dispose: async () => {} }),
      primarySegmentation: () => fakeSegmentationProvider("primary", primary, primaryCounters),
      fallbackSegmentation: () => fakeSegmentationProvider("fallback", segmentation([255, 0, 0, 0], 0.8, "fallback"), fallbackCounters),
    } });
    const result = await authority.segmentDisplayedFrame({ source: {} as CanvasImageSource, sourcePresentationTimeSec: 67.7 });
    assert.equal(result.providerSource, "secondary");
    assert.equal(result.providerName, "fallback");
    assert.equal(fallbackCounters.segment, 1);
    await authority.dispose();
  }
});

test("shared authority stays analysis-only and presentation consumers construct no providers", () => {
  const root = resolve(import.meta.dirname, "..");
  const authority = readFileSync(resolve(root, "src/features/auto-placement/placementFrameAnalysisAuthority.ts"), "utf8");
  const faceLayer = readFileSync(resolve(root, "src/features/eye-contact-assist/render/faceAnalysisPreviewLayer.tsx"), "utf8");
  const blurLayer = readFileSync(resolve(root, "src/features/visual-effects/render/backgroundBlurPreviewLayer.tsx"), "utf8");
  const authorityImports = authority.split("\n").filter((line) => line.startsWith("import ")).join("\n");
  assert.doesNotMatch(authorityImports, /history|persist|supabase|commitTransform|previewAutoPositionOverrides/i);
  assert.doesNotMatch(faceLayer, /createFaceLandmarkProvider|MediapipeFaceLandmarkerProvider/);
  assert.doesNotMatch(blurLayer, /createSegmentationProvider|MediapipeSelfieSegmentationProvider|new PlacementAnalysisLifecycle/);
  assert.match(faceLayer, /analysisAuthority\.analyzeFace/);
  assert.match(blurLayer, /analysisAuthority\.segmentDisplayedFrame/);
});
