import assert from "node:assert/strict";
import test from "node:test";
import { HammerPreviewRuntime, isPreviewCompositeCadenceReady, resolveMatteContinuity, resolvePreviewAnalysisSize, resolvePreviewBackingSize } from "../src/features/visual-effects/render/hammerPreviewRuntime";

type Listener = () => void;

function installAnimationFrameHarness() {
  let next = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    requestAnimationFrame(callback: FrameRequestCallback) { const id = next++; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id: number) { callbacks.delete(id); },
  } });
  return { callbacks, restore: () => Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow }) };
}

function fakeVideo(withRvfc: boolean) {
  const listeners = new Map<string, Set<Listener>>();
  let nextRvfc = 1;
  const rvfc = new Map<number, (now: number, metadata: { mediaTime?: number }) => void>();
  const video = {
    currentTime: 4,
    currentSrc: "preview.mp4",
    src: "preview.mp4",
    addEventListener(name: string, listener: Listener) { const set = listeners.get(name) ?? new Set<Listener>(); set.add(listener); listeners.set(name, set); },
    removeEventListener(name: string, listener: Listener) { listeners.get(name)?.delete(listener); },
    ...(withRvfc ? {
      requestVideoFrameCallback(callback: (now: number, metadata: { mediaTime?: number }) => void) { const id = nextRvfc++; rvfc.set(id, callback); return id; },
      cancelVideoFrameCallback(id: number) { rvfc.delete(id); },
    } : {}),
  };
  return { video: video as unknown as HTMLVideoElement, rvfc, listeners };
}

test("preview runtime uses RVFC as its only continuous scheduler", () => {
  const harness = installAnimationFrameHarness();
  try {
    const frames: string[] = [];
    const source = fakeVideo(true);
    const runtime = new HammerPreviewRuntime((reason) => frames.push(reason));
    runtime.attachSource(source.video, "revision-1");
    assert.equal(runtime.snapshotDiagnostics().scheduler, "request_video_frame_callback");
    assert.equal(source.rvfc.size, 1);
    assert.equal(harness.callbacks.size, 1, "only the explicit initial draw uses RAF");
    const decoded = [...source.rvfc.values()][0]!;
    decoded(0, { mediaTime: 4.1 });
    assert.deepEqual(frames, ["decoded_frame"]);
    assert.equal(source.rvfc.size, 2, "the consumed callback and its single successor are observable in this simple harness");
    runtime.dispose();
    assert.equal(runtime.snapshotDiagnostics().scheduler, "idle");
  } finally { harness.restore(); }
});

test("preview runtime falls back to one RAF scheduler and cancels it", () => {
  const harness = installAnimationFrameHarness();
  try {
    const source = fakeVideo(false);
    const runtime = new HammerPreviewRuntime(() => undefined);
    runtime.attachSource(source.video, "revision-2");
    assert.equal(runtime.snapshotDiagnostics().scheduler, "request_animation_frame");
    assert.equal(harness.callbacks.size, 2, "one continuous RAF and one coalesced explicit draw");
    runtime.dispose();
    assert.equal(harness.callbacks.size, 0);
  } finally { harness.restore(); }
});

test("analysis and backing dimensions remain bounded across DPRs", () => {
  assert.deepEqual(resolvePreviewAnalysisSize({ width: 1920, height: 1080, maxLongEdge: 384 }), { width: 384, height: 216 });
  for (const dpr of [1, 1.25, 1.5, 2, 3]) {
    const size = resolvePreviewBackingSize({ cssWidth: 960, cssHeight: 540, devicePixelRatio: dpr });
    assert.ok(Math.max(size.width, size.height) <= 1280);
    assert.ok(size.effectiveDpr <= 2);
  }
});

test("matte continuity degrades without flashing raw", () => {
  assert.equal(resolveMatteContinuity(null), "missing");
  assert.equal(resolveMatteContinuity(750), "fresh");
  assert.equal(resolveMatteContinuity(751), "degraded");
  assert.equal(resolveMatteContinuity(2_000), "degraded");
  assert.equal(resolveMatteContinuity(2_001), "unavailable");
});

test("30 FPS source cadence is not aliased down by wall-clock jitter", () => {
  assert.equal(isPreviewCompositeCadenceReady({ wallDeltaMs: 29, mediaDeltaSec: 1 / 30 }), true);
  assert.equal(isPreviewCompositeCadenceReady({ wallDeltaMs: 17, mediaDeltaSec: 1 / 60 }), false);
  assert.equal(isPreviewCompositeCadenceReady({ wallDeltaMs: 34, mediaDeltaSec: 0 }), true, "paused control redraws remain available");
});
