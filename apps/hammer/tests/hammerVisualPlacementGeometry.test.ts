import assert from "node:assert/strict";
import test from "node:test";
import {
  clampNormalizedGeometry,
  geometryToFrameBox,
  geometryToPercentBox,
  percentBoxToGeometry,
} from "../src/visuals/model/visualPlacementGeometry";
import type { HammerVisualGeometry } from "../src/visuals/model/hammerVisualTypes";

function assertNear(actual: number, expected: number, epsilon = 0.000001): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test("top-left anchor percent round-trip stays stable", () => {
  const geometry: HammerVisualGeometry = {
    x: 0.2,
    y: 0.3,
    width: 0.4,
    height: 0.25,
    anchor: "top_left",
  };
  const percent = geometryToPercentBox(geometry);
  const restored = percentBoxToGeometry(percent, "top_left");

  assertNear(restored.x, geometry.x);
  assertNear(restored.y, geometry.y);
  assertNear(restored.width, geometry.width);
  assertNear(restored.height, geometry.height);
  assert.equal(restored.anchor, "top_left");
});

test("center anchor percent round-trip stays stable", () => {
  const geometry: HammerVisualGeometry = {
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.2,
    anchor: "center",
  };
  const percent = geometryToPercentBox(geometry);
  const restored = percentBoxToGeometry(percent, "center");

  assertNear(restored.x, geometry.x);
  assertNear(restored.y, geometry.y);
  assertNear(restored.width, geometry.width);
  assertNear(restored.height, geometry.height);
  assert.equal(restored.anchor, "center");
});

test("geometry to frame box scales proportionally across frames", () => {
  const geometry: HammerVisualGeometry = {
    x: 0.15,
    y: 0.25,
    width: 0.3,
    height: 0.4,
    anchor: "top_left",
  };
  const box720 = geometryToFrameBox(geometry, { width: 1280, height: 720 });
  const box1080 = geometryToFrameBox(geometry, { width: 1920, height: 1080 });

  assertNear(box1080.x / box720.x, 1.5);
  assertNear(box1080.y / box720.y, 1.5);
  assertNear(box1080.width / box720.width, 1.5);
  assertNear(box1080.height / box720.height, 1.5);
});

test("clamp enforces normalized bounds and keeps anchor semantics", () => {
  const clamped = clampNormalizedGeometry({
    x: -2,
    y: 3,
    width: 2,
    height: 0.01,
    anchor: "center",
  });

  assert.ok(clamped.x >= 0);
  assert.ok(clamped.y >= 0);
  assert.ok(clamped.width <= 0.92);
  assert.ok(clamped.height >= 0.08);
  assert.equal(clamped.anchor, "center");
});
