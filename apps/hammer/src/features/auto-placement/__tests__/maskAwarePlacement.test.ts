// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { resolveMaskAwarePlacement } from "../maskAwarePlacement";
import type { MaskAwarePlacementInput, Rect } from "../types";
import { intersectionArea, isRectInsideFrame } from "../reservedZones";

const frame = { width: 1920, height: 1080 };
const overlay = { width: 420, height: 240 };

function baseInput(): MaskAwarePlacementInput {
  return {
    frame,
    overlay,
    speakerMaskBounds: [],
    safeMarginPx: 24,
    speakerPaddingPx: 20,
    topK: 3,
    selectionSeed: 7,
  };
}

test("centered speaker avoidance", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 640, y: 250, width: 640, height: 520 }];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  const padded: Rect = { x: 620, y: 230, width: 680, height: 560 };
  assert.equal(intersectionArea(result.rect, padded), 0);
});

test("bottom caption band avoidance", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 760, y: 180, width: 400, height: 560 }];
  input.reservedZones = [{ x: 0, y: 900, width: 1920, height: 180 }];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.equal(intersectionArea(result.rect, input.reservedZones[0]!), 0);
});

test("two-speaker avoidance", () => {
  const input = baseInput();
  input.speakerMaskBounds = [
    { x: 140, y: 210, width: 520, height: 700 },
    { x: 1260, y: 210, width: 520, height: 700 },
  ];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  for (const speaker of input.speakerMaskBounds) {
    const padded = {
      x: speaker.x - 20,
      y: speaker.y - 20,
      width: speaker.width + 40,
      height: speaker.height + 40,
    };
    assert.equal(intersectionArea(result.rect, padded), 0);
  }
});

test("repeated placement penalty shifts zone", () => {
  const input = baseInput();
  input.selectionSeed = 0;
  const first = resolveMaskAwarePlacement(input);
  assert.ok(first);
  input.recentPlacements = [{ zone: first.zone, rect: first.rect, count: 4 }];
  const second = resolveMaskAwarePlacement(input);
  assert.ok(second);
  assert.notEqual(second.zone, first.zone);
});

test("frame bounds safety", () => {
  const input = baseInput();
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.equal(isRectInsideFrame(result.rect, frame), true);
});

test("no-safe-placement null return", () => {
  const input = baseInput();
  input.overlay = { width: 800, height: 500 };
  input.speakerMaskBounds = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  input.reservedZones = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  const result = resolveMaskAwarePlacement(input);
  assert.equal(result, null);
});

test("top-k seeded variation is deterministic and seed-sensitive", () => {
  const inputA = baseInput();
  inputA.selectionSeed = 1;
  const inputB = baseInput();
  inputB.selectionSeed = 2;
  const a1 = resolveMaskAwarePlacement(inputA);
  const a2 = resolveMaskAwarePlacement(inputA);
  const b1 = resolveMaskAwarePlacement(inputB);
  assert.ok(a1 && a2 && b1);
  assert.equal(a1.zone, a2.zone);
  assert.ok(a1.zone !== b1.zone || a1.rect.x !== b1.rect.x || a1.rect.y !== b1.rect.y);
});
