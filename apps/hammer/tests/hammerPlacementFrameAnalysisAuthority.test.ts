import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PlacementFrameAnalysisAuthority } from "../src/features/auto-placement/placementFrameAnalysisAuthority";
import type { FaceAnalysisFrame, FaceAnalysisResult, FaceLandmarkProvider } from "../src/features/eye-contact-assist/types";
import type { SegmentationProvider, SegmentationResult } from "../src/features/visual-effects/types";
import type { PlacementRandomAccessDecoder } from "../src/features/auto-placement/placementRandomAccessDecoder";

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

test("random-access requests reuse one decoder and retain strict source-media time", async () => {
  let decoderConstructions = 0; let captures = 0; let releases = 0; let decoderDisposals = 0;
  const decoder: PlacementRandomAccessDecoder = {
    capture: async (request) => {
      captures += 1;
      return { frameRef: { ...frameRef, captureRevision: captures,
        sourceIdentity: request.sourceIdentity, sourcePresentationTimeSec: request.sourceMediaTimeSec,
        geometricRevision: request.geometricRevision }, pixels: {} as CanvasImageSource, release: () => { releases += 1; } };
    }, reset() {}, dispose: async () => { decoderDisposals += 1; },
  };
  const counters = { initialize: 0, segment: 0, dispose: 0 };
  const authority = new PlacementFrameAnalysisAuthority({ factories: {
    face: () => ({ name: "face", initialize: async () => {}, isReady: () => true, getReadiness: () => ({ status: "ready" }),
      analyzeFrame: async (frame) => ({ kind: "success", frameRef: frame.frameRef, faces: [], warnings: [] }), dispose: async () => {} }),
    primarySegmentation: () => fakeSegmentationProvider("primary", segmentation([0, 0, 0, 0]), counters),
    fallbackSegmentation: () => fakeSegmentationProvider("fallback", segmentation([0, 0, 0, 0]), counters),
    randomAccessDecoder: () => { decoderConstructions += 1; return decoder; },
  } });
  const request = { requestId: "placement-1:r1", placementId: "placement-1", sourceIdentity: "media:rev-1",
    sourceUrl: "blob:test", compositionPresentationTimeSec: 60, sourceMediaTimeSec: 67.7, expectedMediaRevision: "rev-1",
    geometricRevision: "2x2", matteOptions: { featherPx: 0, subjectExpansionPx: 0, temporalSmoothing: 0, quality: "medium" as const },
    abortSignal: new AbortController().signal };
  const first = await authority.analyze(request);
  const second = await authority.analyze({ ...request, requestId: "placement-2:r1", placementId: "placement-2", compositionPresentationTimeSec: 65, sourceMediaTimeSec: 75.9 });
  assert.deepEqual([first.frameRef.sourcePresentationTimeSec, second.frameRef.sourcePresentationTimeSec], [67.7, 75.9]);
  assert.deepEqual([decoderConstructions, captures, releases], [1, 2, 2]);
  assert.equal(authority.diagnostics().randomAccessDecoderConstructionCount, 1);
  await authority.dispose();
  assert.equal(decoderDisposals, 1);
});

test("random-access analysis rejects a captured frame outside the unchanged 0.001 second guard", async () => {
  let released = 0;
  const authority = new PlacementFrameAnalysisAuthority({ factories: {
    face: () => ({ name: "face", initialize: async () => {}, isReady: () => true, getReadiness: () => ({ status: "ready" }),
      analyzeFrame: async () => ({ kind: "unavailable", reason: "must not run" }), dispose: async () => {} }),
    primarySegmentation: () => fakeSegmentationProvider("primary", segmentation([0, 0, 0, 0]), { initialize: 0, segment: 0, dispose: 0 }),
    fallbackSegmentation: () => fakeSegmentationProvider("fallback", segmentation([0, 0, 0, 0]), { initialize: 0, segment: 0, dispose: 0 }),
    randomAccessDecoder: () => ({ capture: async (request) => ({ pixels: {} as CanvasImageSource,
      frameRef: { ...frameRef, sourceIdentity: request.sourceIdentity, sourcePresentationTimeSec: request.sourceMediaTimeSec + 0.002 },
      release: () => { released += 1; } }), reset() {}, dispose: async () => {} }),
  } });
  await assert.rejects(authority.analyze({ requestId: "wrong", placementId: "p", sourceIdentity: "media", sourceUrl: "blob:test",
    compositionPresentationTimeSec: 10, sourceMediaTimeSec: 12, expectedMediaRevision: "m1", geometricRevision: "g1", abortSignal: new AbortController().signal,
    matteOptions: { featherPx: 0, subjectExpansionPx: 0, temporalSmoothing: 0, quality: "medium" } }), /exact source-media-time/);
  assert.equal(released, 1);
  await authority.dispose();
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
