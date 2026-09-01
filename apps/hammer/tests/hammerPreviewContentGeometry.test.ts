import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { drawSourceContained, drawSourceInContentRect, resolveContainedDrawRect, resolvePreviewContentGeometry } from "../src/features/visual-effects/effects/mediaFrameGeometry";

const hammerRoot = resolve(import.meta.dirname, "..");

function source(width: number, height: number): CanvasImageSource {
  return { videoWidth: width, videoHeight: height } as unknown as CanvasImageSource;
}

function expectRect(
  sourceSize: [number, number],
  destination: [number, number],
  expected: [number, number, number, number],
): void {
  const geometry = resolvePreviewContentGeometry({
    source: source(...sourceSize),
    destWidth: destination[0],
    destHeight: destination[1],
  });
  assert.ok(geometry);
  const actual = geometry.contentRect;
  const values = [actual.dx, actual.dy, actual.dw, actual.dh];
  values.forEach((value, index) => assert.ok(Math.abs(value - expected[index]!) < 1e-9));
  assert.ok(Math.abs((actual.dw / actual.dh) - (sourceSize[0] / sourceSize[1])) < 1e-9);
}

test("resolves one contained media rectangle for mismatched preview shapes", () => {
  expectRect([1920, 1080], [1000, 1000], [0, 218.75, 1000, 562.5]);
  expectRect([1920, 1080], [600, 1000], [0, 331.25, 600, 337.5]);
  expectRect([1920, 1080], [1200, 400], [244.44444444444446, 0, 711.1111111111111, 400]);
  expectRect([1080, 1920], [1000, 600], [331.25, 0, 337.5, 600]);
});

test("keeps geometry independent from DPR while backing dimensions scale", () => {
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const geometry = resolvePreviewContentGeometry({
      source: source(1920, 1080),
      destWidth: 640 * dpr,
      destHeight: 640 * dpr,
    });
    assert.ok(geometry);
    assert.equal(geometry.contentRect.dx / dpr, 0);
    assert.equal(geometry.contentRect.dy / dpr, 140);
    assert.equal(geometry.contentRect.dw / dpr, 640);
    assert.equal(geometry.contentRect.dh / dpr, 360);
  }
});

test("rejects unavailable source or destination dimensions", () => {
  assert.equal(resolvePreviewContentGeometry({ source: source(0, 1080), destWidth: 640, destHeight: 360 }), null);
  assert.equal(resolvePreviewContentGeometry({ source: source(1920, 1080), destWidth: 0, destHeight: 360 }), null);
  assert.equal(resolvePreviewContentGeometry({ source: source(1920, 1080), destWidth: Number.NaN, destHeight: 360 }), null);
});

test("contained canvas drawing clears, clips, and paints only the media rectangle", () => {
  const calls: Array<[string, ...number[]]> = [];
  const record = (name: string, values: number[] = []) => calls.push([
    name,
    ...values.map((value) => Math.abs(value) < 1e-9 ? 0 : Math.abs(value - 1000) < 1e-9 ? 1000 : value),
  ]);
  const ctx = {
    imageSmoothingEnabled: false,
    clearRect: (...values: number[]) => record("clearRect", values),
    save: () => record("save"),
    beginPath: () => record("beginPath"),
    rect: (...values: number[]) => record("rect", values),
    clip: () => record("clip"),
    drawImage: (_source: CanvasImageSource, ...values: number[]) => record("drawImage", values),
    restore: () => record("restore"),
  } as unknown as CanvasRenderingContext2D;
  const frame = source(1920, 1080);
  const geometry = resolvePreviewContentGeometry({ source: frame, destWidth: 1000, destHeight: 1000 });
  assert.ok(geometry);
  assert.deepEqual(resolveContainedDrawRect({ source: frame, destWidth: 1000, destHeight: 1000 }), geometry.contentRect);

  const rect = drawSourceContained({
    ctx,
    source: frame,
    destWidth: 1000,
    destHeight: 1000,
    clipToContent: true,
    geometry,
  });
  assert.deepEqual(rect, geometry.contentRect);
  assert.deepEqual(calls, [
    ["clearRect", 0, 0, 1000, 1000],
    ["save"],
    ["beginPath"],
    ["rect", 0, 218.75, 1000, 562.5],
    ["clip"],
    ["drawImage", 0, 218.75, 1000, 562.5],
    ["restore"],
  ]);

  calls.length = 0;
  drawSourceInContentRect({ ctx, source: frame, rect: geometry.contentRect });
  assert.deepEqual(calls, [["drawImage", 0, 218.75, 1000, 562.5]]);
});

test("background renderers cannot stretch source frames across the full preview canvas", () => {
  const files = [
    "src/features/visual-effects/effects/backgroundBlurRenderer.ts",
    "src/features/visual-effects/effects/backgroundReplacementRenderer.ts",
    "src/features/visual-effects/effects/backgroundWashRenderer.ts",
  ];
  for (const file of files) {
    const contents = readFileSync(resolve(hammerRoot, file), "utf8");
    assert.doesNotMatch(contents, /drawImage\(args\.source,\s*0,\s*0,\s*w,\s*h\)/);
    assert.match(contents, /geometry/);
  }
});

test("replacement and wash map backgrounds and mattes to the shared content rectangle", () => {
  const replacement = readFileSync(resolve(hammerRoot, "src/features/visual-effects/effects/backgroundReplacementRenderer.ts"), "utf8");
  const wash = readFileSync(resolve(hammerRoot, "src/features/visual-effects/effects/backgroundWashRenderer.ts"), "utf8");
  assert.match(replacement, /outputCtx\.rect\(content\.dx, content\.dy, content\.dw, content\.dh\)/);
  assert.match(replacement, /outputCtx\.drawImage\(this\.subjectCanvas, content\.dx, content\.dy, content\.dw, content\.dh\)/);
  assert.match(wash, /drawSourceInContentRect\(\{ ctx: bgCtx, source: this\.exclusionMatteCanvas, rect: geometry\.contentRect \}\)/);
});
