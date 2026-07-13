import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePlacementFrameAgainstDisplay,
  PlacementAnalysisLifecycle,
  readPlacementDisplaySnapshot,
  resolveCanonicalAutomaticPlacement,
  type FrameBoundPlacementMatteResult,
  type PlacementDisplaySnapshot,
} from "../src/features/auto-placement";
import { LatestOwnedAnalysisFrameQueue } from "../src/features/eye-contact-assist/analysis/ownedAnalysisFrameQueue";
import type {
  FaceAnalysisFrame,
  FaceAnalysisFrameRef,
  FaceAnalysisResult,
} from "../src/features/eye-contact-assist/types";
import type { ForegroundMatte } from "../src/features/visual-effects/types";

function frameRef(revision: number, overrides: Partial<FaceAnalysisFrameRef> = {}): FaceAnalysisFrameRef {
  return {
    captureEpoch: "step-9",
    captureRevision: revision,
    sourceIdentity: "blob:media-a",
    sourcePresentationTimeSec: 12.5,
    inferenceTimestampMs: revision,
    width: 640,
    height: 360,
    coordinateSpace: "placement_source_pixels",
    geometricRevision: "640x360:identity",
    ...overrides,
  };
}

const allBackgroundMatte: ForegroundMatte = {
  width: 4,
  height: 4,
  alphaMask: new Uint8ClampedArray(16),
  featherPx: 0,
  temporalWeight: 0,
  quality: "low",
  metadata: {
    providerName: "mock",
    confidenceScore: 0,
    warnings: [],
  },
};

function matte(ref: FaceAnalysisFrameRef): FrameBoundPlacementMatteResult {
  return { kind: "success", frameRef: ref, matte: allBackgroundMatte, speakerMaskBounds: [] };
}

function faces(ref: FaceAnalysisFrameRef): FaceAnalysisResult {
  return { kind: "success", frameRef: ref, faces: [], warnings: [] };
}

test("a newer requested frame invalidates an older completed pair even at the same source timestamp", () => {
  const lifecycle = new PlacementAnalysisLifecycle();
  const a = frameRef(1);
  const b = frameRef(2);
  lifecycle.requestFrame(a);
  lifecycle.acceptFace(faces(a));
  assert.ok(lifecycle.acceptMatte(matte(a)));

  assert.equal(lifecycle.requestFrame(b), null);
  assert.equal(lifecycle.acceptMatte(matte(a)), null, "late frame A evidence cannot become current again");
  assert.equal(lifecycle.acceptFace(faces(a)), null);
  lifecycle.acceptFace(faces(b));
  const current = lifecycle.acceptMatte(matte(b));
  assert.ok(current);
  assert.equal(current.frameRef.captureRevision, 2);
});

test("unavailable face analysis becomes an explicit frame-associated refusal", () => {
  const lifecycle = new PlacementAnalysisLifecycle();
  const ref = frameRef(1);
  lifecycle.requestFrame(ref);
  lifecycle.acceptFace({ kind: "unavailable", reason: "provider_not_ready" });
  const pair = lifecycle.acceptMatte(matte(ref));
  assert.ok(pair);
  const result = resolveCanonicalAutomaticPlacement({
    requestedFrameRef: pair.frameRef,
    matteResult: pair.matte,
    faceResult: pair.face,
    overlay: { width: 120, height: 68 },
  });
  assert.equal(result.decision.kind, "refused");
  assert.equal(result.decision.kind === "refused" ? result.decision.reason : null, "face_analysis_unavailable");
});

test("lifecycle retention is bounded and reset removes all prior authority", () => {
  const lifecycle = new PlacementAnalysisLifecycle(2);
  for (let revision = 1; revision <= 5; revision += 1) {
    const ref = frameRef(revision);
    lifecycle.requestFrame(ref);
    lifecycle.acceptFace(faces(ref));
    lifecycle.acceptMatte(matte(ref));
  }
  assert.deepEqual(lifecycle.diagnostics(), {
    currentFrame: "step-9:5",
    retainedMattes: 2,
    retainedFaces: 2,
  });
  lifecycle.reset();
  assert.equal(lifecycle.currentPair(), null);
  assert.deepEqual(lifecycle.diagnostics(), {
    currentFrame: null,
    retainedMattes: 0,
    retainedFaces: 0,
  });
});

test("display evaluation rejects playback, seeks, source changes, resize, and geometry changes", () => {
  const requested = frameRef(1);
  const current: PlacementDisplaySnapshot = {
    sourceIdentity: requested.sourceIdentity,
    sourcePresentationTimeSec: requested.sourcePresentationTimeSec,
    width: requested.width,
    height: requested.height,
    coordinateSpace: requested.coordinateSpace,
    geometricRevision: requested.geometricRevision,
    playbackActive: false,
  };
  const reason = (snapshot: PlacementDisplaySnapshot) => {
    const evaluation = evaluatePlacementFrameAgainstDisplay(requested, snapshot);
    return evaluation.kind === "changed" ? evaluation.reason : null;
  };
  assert.deepEqual(evaluatePlacementFrameAgainstDisplay(requested, current), { kind: "current" });
  assert.equal(reason({ ...current, playbackActive: true }), "playback_active");
  assert.equal(reason({ ...current, sourceIdentity: "blob:media-b" }), "source_changed");
  assert.equal(reason({ ...current, sourcePresentationTimeSec: 13 }), "presentation_time_changed");
  assert.equal(reason({ ...current, width: 1280 }), "dimensions_changed");
  assert.equal(reason({ ...current, coordinateSpace: "placement_source_pixels", geometricRevision: "640x360:mirror-x" }), "geometry_changed");
});

test("display snapshot and owned frame queue preserve exact pixel lifetimes", () => {
  const video = {
    currentSrc: "blob:media-a",
    src: "fallback",
    currentTime: 12.5,
    videoWidth: 640,
    videoHeight: 360,
  } as HTMLVideoElement;
  assert.deepEqual(readPlacementDisplaySnapshot({ video, playbackActive: false }), {
    sourceIdentity: "blob:media-a",
    sourcePresentationTimeSec: 12.5,
    width: 640,
    height: 360,
    coordinateSpace: "placement_source_pixels",
    geometricRevision: "640x360:identity",
    playbackActive: false,
  });
  assert.equal(readPlacementDisplaySnapshot({ video: null, playbackActive: false }), null);

  const released: number[] = [];
  const owned = (revision: number): FaceAnalysisFrame => ({
    pixels: { revision } as unknown as CanvasImageSource,
    frameRef: frameRef(revision),
    release: () => { released.push(revision); },
  });
  const queue = new LatestOwnedAnalysisFrameQueue();
  const a = owned(1);
  const b = owned(2);
  const c = owned(3);
  queue.offer(a);
  queue.offer(b);
  assert.deepEqual(released, [1], "a superseded pending snapshot is released");
  const inFlight = queue.take();
  assert.equal(inFlight, b);
  queue.offer(c);
  assert.deepEqual(released, [1], "offering c cannot mutate or release in-flight b");
  queue.dispose();
  assert.deepEqual(released, [1, 3], "dispose releases only the pending snapshot");
  inFlight?.release();
  assert.deepEqual(released, [1, 3, 2], "the consumer owns in-flight release");
});
