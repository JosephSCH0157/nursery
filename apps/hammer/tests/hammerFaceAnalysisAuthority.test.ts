import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FaceAnalysisFrameCapture,
  deriveFaceBoundsPx,
  deriveHeadSafeBoundsPx,
  evaluateFaceAnalysis,
  sameFaceAnalysisFrame,
  selectEyeContactEvidence,
  acceptFaceAnalysisForFrame,
  cloneFaceAnalysisFrame,
} from "../src/features/eye-contact-assist/analysis/faceAnalysisAuthority";
import type { FaceAnalysisFrameRef, FaceAnalysisResult } from "../src/features/eye-contact-assist/types";
const hammerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function ref(overrides: Partial<FaceAnalysisFrameRef> = {}): FaceAnalysisFrameRef {
  return {
    captureEpoch: "epoch-a",
    captureRevision: 1,
    sourceIdentity: "media-a",
    sourcePresentationTimeSec: 4,
    inferenceTimestampMs: 1,
    width: 100,
    height: 80,
    coordinateSpace: "placement_source_pixels",
    geometricRevision: "100x80:identity",
    ...overrides,
  };
}

test("face and head-safe bounds map into analyzed pixel coordinates", () => {
  const face = deriveFaceBoundsPx([{ x: 0.2, y: 0.25 }, { x: 0.6, y: 0.75 }], ref());
  assert.deepEqual(face, { x: 20, y: 20, width: 40, height: 40 });
  const head = deriveHeadSafeBoundsPx(face!, ref());
  assert.deepEqual(head, { x: 12, y: 6, width: 56, height: 61.2 });
  assert.ok(head.x <= face!.x && head.y <= face!.y);
  assert.ok(head.x + head.width >= face!.x + face!.width);
  assert.ok(head.y + head.height >= face!.y + face!.height);
});

test("bounds clamp to frame edges and malformed coordinates fail", () => {
  const face = deriveFaceBoundsPx([{ x: -0.2, y: -0.1 }, { x: 1.2, y: 1.1 }], ref());
  assert.deepEqual(face, { x: 0, y: 0, width: 100, height: 80 });
  assert.deepEqual(deriveHeadSafeBoundsPx(face!, ref()), face);
  assert.equal(deriveFaceBoundsPx([{ x: Number.NaN, y: 0 }, { x: 1, y: 1 }], ref()), null);
  assert.equal(deriveFaceBoundsPx([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.7 }], ref()), null);
});

test("exact reference evaluation distinguishes current and stale", () => {
  const result: FaceAnalysisResult = { kind: "success", frameRef: ref(), faces: [], warnings: [] };
  assert.equal(evaluateFaceAnalysis(result, ref()).kind, "current");
  assert.equal(evaluateFaceAnalysis(result, ref({ captureRevision: 2 })).kind, "stale");
  assert.equal(evaluateFaceAnalysis(result, ref({ sourcePresentationTimeSec: 9 })).kind, "stale");
  assert.equal(evaluateFaceAnalysis(result, ref({ geometricRevision: "mirror-x" })).kind, "stale");
  assert.equal(sameFaceAnalysisFrame(ref(), ref({ inferenceTimestampMs: 999 })), true, "inference time is not freshness authority");
  assert.equal(acceptFaceAnalysisForFrame(result, ref()), result);
  assert.equal(acceptFaceAnalysisForFrame(result, ref({ captureRevision: 2 })), null);
});

test("capture epochs, revisions, timestamps, and pixels remain isolated", () => {
  type FakeCanvas = { width: number; height: number; snapshot: unknown; getContext(): { drawImage(source: unknown): void } };
  const canvases: FakeCanvas[] = [];
  const factory = () => {
    const canvas: FakeCanvas = {
      width: 0,
      height: 0,
      snapshot: null,
      getContext() { return { drawImage: (source: unknown) => { canvas.snapshot = source; } }; },
    };
    canvases.push(canvas);
    return canvas as unknown as HTMLCanvasElement;
  };
  const capture = new FaceAnalysisFrameCapture(() => "fixed-epoch", factory);
  const sourceA = { id: "pixels-a" } as unknown as CanvasImageSource;
  const sourceB = { id: "pixels-b" } as unknown as CanvasImageSource;
  const a = capture.capture({ source: sourceA, sourceIdentity: "media", sourcePresentationTimeSec: 8, width: 20, height: 10 });
  const b = capture.capture({ source: sourceB, sourceIdentity: "media", sourcePresentationTimeSec: 2, width: 20, height: 10 });
  assert.equal(a.frameRef.captureEpoch, "fixed-epoch");
  assert.equal(a.frameRef.captureRevision, 1);
  assert.equal(b.frameRef.captureRevision, 2);
  assert.ok(b.frameRef.inferenceTimestampMs > a.frameRef.inferenceTimestampMs);
  assert.equal(canvases[0]!.snapshot, sourceA);
  assert.equal(canvases[1]!.snapshot, sourceB);
  assert.notEqual(a.pixels, b.pixels);
  b.release();
  assert.equal(canvases[1]!.width, 0);
  assert.equal(canvases[0]!.width, 20);
});

test("new producer epochs prevent revision collisions", () => {
  let epoch = 0;
  const factory = () => `epoch-${++epoch}`;
  const canvasFactory = () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) }) as unknown as HTMLCanvasElement;
  const first = new FaceAnalysisFrameCapture(factory, canvasFactory).capture({ source: {} as CanvasImageSource, sourceIdentity: "m", sourcePresentationTimeSec: 1, width: 2, height: 2 });
  const second = new FaceAnalysisFrameCapture(factory, canvasFactory).capture({ source: {} as CanvasImageSource, sourceIdentity: "m", sourcePresentationTimeSec: 1, width: 2, height: 2 });
  assert.equal(first.frameRef.captureRevision, second.frameRef.captureRevision);
  assert.notEqual(first.frameRef.captureEpoch, second.frameRef.captureEpoch);
});

test("a shared analysis clone owns independent pixels with the exact same immutable reference", () => {
  type FakeCanvas = { width: number; height: number; snapshot: unknown; getContext(): { drawImage(source: unknown): void } };
  const canvases: FakeCanvas[] = [];
  const factory = () => {
    const canvas: FakeCanvas = {
      width: 0,
      height: 0,
      snapshot: null,
      getContext() { return { drawImage: (source: unknown) => { canvas.snapshot = source; } }; },
    };
    canvases.push(canvas);
    return canvas as unknown as HTMLCanvasElement;
  };
  const original = new FaceAnalysisFrameCapture(() => "clone-epoch", factory).capture({
    source: { id: "frame-a" } as unknown as CanvasImageSource,
    sourceIdentity: "media",
    sourcePresentationTimeSec: 1,
    width: 20,
    height: 10,
  });
  const clone = cloneFaceAnalysisFrame(original, factory);
  assert.equal(clone.frameRef, original.frameRef);
  assert.notEqual(clone.pixels, original.pixels);
  assert.equal(canvases[1]!.snapshot, original.pixels);
  original.release();
  original.release();
  assert.equal(canvases[0]!.width, 0);
  assert.equal(canvases[1]!.width, 20, "releasing the face-provider capture cannot mutate the segmentation snapshot");
  clone.release();
  clone.release();
  assert.equal(canvases[1]!.width, 0);
});

test("shared analysis clone uses browser canvas ownership and rejects unavailable canvas contexts", () => {
  const original = {
    pixels: { id: "immutable-source" } as unknown as CanvasImageSource,
    frameRef: ref({ width: 4, height: 3 }),
    release: () => {},
  };
  const previousDocument = globalThis.document;
  const browserCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
  } as unknown as HTMLCanvasElement;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => browserCanvas },
  });
  try {
    const clone = cloneFaceAnalysisFrame(original);
    assert.equal(clone.pixels, browserCanvas);
    clone.release();
    assert.equal(browserCanvas.width, 0);
    assert.throws(
      () => cloneFaceAnalysisFrame(original, () => ({ width: 0, height: 0, getContext: () => null }) as unknown as HTMLCanvasElement),
      /clone canvas unavailable/i,
    );
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
  }
});

test("eye contact selects the first eligible face without truncating canonical geometry", () => {
  const evidence = { providerName: "mock" } as never;
  const faces = [
    { providerIndex: 0, normalizedLandmarks: [], faceBoundsPx: { x: 1, y: 1, width: 2, height: 2 }, headSafeBoundsPx: { x: 0, y: 0, width: 4, height: 4 }, eyeContactEvidence: null },
    { providerIndex: 1, normalizedLandmarks: [], faceBoundsPx: { x: 5, y: 1, width: 2, height: 2 }, headSafeBoundsPx: { x: 4, y: 0, width: 4, height: 4 }, eyeContactEvidence: evidence },
  ];
  assert.equal(selectEyeContactEvidence(faces), evidence);
  assert.equal(faces.length, 2);
  assert.equal(faces[0]!.eyeContactEvidence, null);
});

test("neutral preview owner owns provider and demand independently of eye contact", () => {
  const neutral = readFileSync(resolve(hammerRoot, "src/features/eye-contact-assist/render/faceAnalysisPreviewLayer.tsx"), "utf8");
  const eye = readFileSync(resolve(hammerRoot, "src/features/eye-contact-assist/render/eyeContactAssistPreviewLayer.tsx"), "utf8");
  const preview = readFileSync(resolve(hammerRoot, "src/editor/HammerWorkspaceShellPreviewBay.tsx"), "utf8");
  assert.match(neutral, /createFaceLandmarkProvider/);
  assert.match(neutral, /demand: boolean/);
  assert.match(neutral, /provider\.analyzeFrame\(frame\)/);
  assert.doesNotMatch(eye, /createFaceLandmarkProvider|provider\.analyzeFrame|FaceAnalysisFrameCapture/);
  assert.match(preview, /faceAnalysisDemand \?\? vm\.eyeContactAssist\.enabled/);
  assert.match(preview, /faceAnalysisResult=\{faceAnalysisResult\}/);
});
