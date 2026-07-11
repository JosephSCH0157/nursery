import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { intersectionArea } from "../src/features/auto-placement/reservedZones";
import {
  createPlacementMatteOverlapIndex,
  extractSpeakerMaskBoundsFromMatte,
  resolveCanonicalAutomaticPlacement,
} from "../src/features/auto-placement";
import type { FaceAnalysisFrameRef, FaceAnalysisResult } from "../src/features/eye-contact-assist/types";
import { SimpleMatteRefiner } from "../src/features/visual-effects/matte/simpleMatteRefiner";
import type { SegmentationResult } from "../src/features/visual-effects/types";

const hammerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function frameRef(revision = 1): FaceAnalysisFrameRef {
  return {
    captureEpoch: "placement-integration",
    captureRevision: revision,
    sourceIdentity: "synthetic-media",
    sourcePresentationTimeSec: 4,
    inferenceTimestampMs: revision,
    width: 200,
    height: 120,
    coordinateSpace: "placement_source_pixels",
    geometricRevision: "200x120:identity",
  };
}

function fill(mask: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number, alpha = 255): void {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) mask[(row * width) + col] = alpha;
  }
}

function providerResult(mask: Uint8ClampedArray): SegmentationResult {
  return {
    width: 200,
    height: 120,
    personMask: mask,
    confidenceSummary: { score: 0.9, foregroundRatio: 0.25, warnings: [] },
    processingMs: 1,
    sourceTimestampSec: 4,
    providerName: "mock-provider",
    warnings: [],
  };
}

function faces(ref: FaceAnalysisFrameRef): FaceAnalysisResult {
  const bounds = [
    { x: 18, y: 8, width: 22, height: 24 },
    { x: 88, y: 8, width: 22, height: 24 },
    { x: 158, y: 8, width: 22, height: 24 },
  ];
  return {
    kind: "success",
    frameRef: ref,
    warnings: [],
    faces: bounds.map((headSafeBoundsPx, providerIndex) => ({
      providerIndex,
      normalizedLandmarks: Object.freeze([{ x: headSafeBoundsPx.x / ref.width, y: headSafeBoundsPx.y / ref.height }]),
      faceBoundsPx: { x: headSafeBoundsPx.x + 3, y: headSafeBoundsPx.y + 3, width: 16, height: 16 },
      headSafeBoundsPx,
      eyeContactEvidence: null,
    })),
  };
}

test("provider matte and all shared head bounds feed one exact-current placement decision", () => {
  const mask = new Uint8ClampedArray(200 * 120);
  fill(mask, 200, 12, 18, 36, 78);
  fill(mask, 200, 82, 18, 36, 78);
  fill(mask, 200, 152, 18, 36, 78);
  const matte = new SimpleMatteRefiner().buildMatte(providerResult(mask), {
    featherPx: 0,
    subjectExpansionPx: 0,
    temporalSmoothing: 0,
    quality: "low",
  });
  assert.ok(matte.alphaMask[(50 * 200) + 25]! > 0);
  assert.ok(matte.alphaMask[(50 * 200) + 95]! > 0);
  assert.ok(matte.alphaMask[(50 * 200) + 165]! > 0, "canonical matte preserves the third subject");

  const speakerMaskBounds = extractSpeakerMaskBoundsFromMatte({ matte });
  assert.equal(speakerMaskBounds.length, 2, "only downstream speaker extraction applies the two-component limit");
  const ref = frameRef();
  const result = resolveCanonicalAutomaticPlacement({
    requestedFrameRef: ref,
    matteResult: { kind: "success", frameRef: ref, matte, speakerMaskBounds },
    faceResult: faces(ref),
    overlay: { width: 30, height: 16 },
    selectionSeed: 7,
  });
  assert.equal(result.decision.kind, "commit_allowed");
  assert.ok(result.placement);
  assert.equal(result.headSafeBounds.length, 3);
  for (const head of result.headSafeBounds) assert.equal(intersectionArea(result.placement!.rect, head), 0);
  assert.ok(result.placement.matteOverlap);
});

test("matte overlap index maps frame rectangles to exact alpha pixels", () => {
  const alphaMask = new Uint8ClampedArray(4 * 2);
  alphaMask[1] = 255;
  alphaMask[5] = 128;
  const index = createPlacementMatteOverlapIndex({
    frame: { width: 8, height: 4 },
    matte: { width: 4, height: 2, alphaMask },
  });
  assert.ok(index);
  const overlap = index.query({ x: 2, y: 0, width: 2, height: 4 });
  assert.equal(overlap.sampledPixels, 2);
  assert.equal(overlap.coveredForegroundPixels, 1);
  assert.equal(overlap.foregroundPixelRatio, 0.5);
  assert.ok(overlap.alphaWeightedForegroundRatio > 0.74 && overlap.alphaWeightedForegroundRatio < 0.76);
});

test("wrong-frame matte and stale face evidence fail closed", () => {
  const refA = frameRef(1);
  const refB = frameRef(2);
  const matte = new SimpleMatteRefiner().buildMatte(providerResult(new Uint8ClampedArray(200 * 120)), {
    featherPx: 0,
    subjectExpansionPx: 0,
    temporalSmoothing: 0,
    quality: "low",
  });
  const wrongMatte = resolveCanonicalAutomaticPlacement({
    requestedFrameRef: refB,
    matteResult: { kind: "success", frameRef: refA, matte, speakerMaskBounds: [] },
    faceResult: faces(refB),
    overlay: { width: 30, height: 16 },
  });
  assert.equal(wrongMatte.decision.kind, "refused");
  assert.equal(wrongMatte.decision.kind === "refused" ? wrongMatte.decision.reason : null, "matte_wrong_frame");

  const staleFace = resolveCanonicalAutomaticPlacement({
    requestedFrameRef: refB,
    matteResult: { kind: "success", frameRef: refB, matte, speakerMaskBounds: [] },
    faceResult: faces(refA),
    overlay: { width: 30, height: 16 },
  });
  assert.equal(staleFace.decision.kind === "refused" ? staleFace.decision.reason : null, "face_analysis_stale");
});

test("valid all-background and successful zero-face evidence remain eligible", () => {
  const ref = frameRef();
  const matte = new SimpleMatteRefiner().buildMatte(providerResult(new Uint8ClampedArray(200 * 120)), {
    featherPx: 0,
    subjectExpansionPx: 0,
    temporalSmoothing: 0,
    quality: "low",
  });
  const result = resolveCanonicalAutomaticPlacement({
    requestedFrameRef: ref,
    matteResult: { kind: "success", frameRef: ref, matte, speakerMaskBounds: [] },
    faceResult: { kind: "success", frameRef: ref, faces: [], warnings: [] },
    overlay: { width: 30, height: 16 },
  });
  assert.equal(result.decision.kind, "commit_allowed");
  if (result.decision.kind === "commit_allowed") {
    assert.equal(result.decision.matteForeground, "all_background");
    assert.equal(result.decision.faceAnalysisOutcome, "successful_zero_faces");
  }
});

test("live integration shares one capture token and commits only through canonical history persistence", () => {
  const faceLayer = readFileSync(resolve(hammerRoot, "src/features/eye-contact-assist/render/faceAnalysisPreviewLayer.tsx"), "utf8");
  const previewBay = readFileSync(resolve(hammerRoot, "src/editor/HammerWorkspaceShellPreviewBay.tsx"), "utf8");
  const shell = readFileSync(resolve(hammerRoot, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  const toolBay = readFileSync(resolve(hammerRoot, "src/editor/HammerWorkspaceShellToolBay.tsx"), "utf8");
  assert.match(faceLayer, /onCapturedFrame\(cloneFaceAnalysisFrame\(frame\)\)/);
  assert.match(previewBay, /sameFaceAnalysisFrame\(placementPair\.frameRef, analysisFrame\.frameRef\)/);
  assert.match(previewBay, /sourcePresentationTimeSec - automaticPlacementSourceTimeSec/);
  assert.match(previewBay, /\[canonicalPlacementResult, onAutomaticPlacementResult\]/);
  assert.doesNotMatch(previewBay, /\[canonicalPlacementResult, vm\.automaticPlacement\]/);
  assert.match(previewBay, /analysisFrame=\{vm\.automaticPlacement\?\.enabled \? analysisFrame : null\}/);
  assert.match(shell, /commitImagePlacementTransform\([\s\S]*"Apply automatic visual placement"/);
  assert.doesNotMatch(shell, /forcePreviewAutoPosition/);
  assert.doesNotMatch(toolBay, />\s*FORCE PREVIEW\s*</);
});
