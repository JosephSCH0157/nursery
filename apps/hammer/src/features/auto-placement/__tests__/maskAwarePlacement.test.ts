import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMaskAwarePlacementCandidates, resolveMaskAwarePlacement } from "../maskAwarePlacement";
import type { MaskAwarePlacementInput, Rect } from "../types";
import { intersectionArea, isRectInsideFrame } from "../reservedZones";
import { buildPaddedSpeakerBounds, deriveFaceSafeZonesFromSpeakerBounds, scoreCandidate } from "../placementScoring";

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

test("multi speaker prefers bottom-center", () => {
  const input = baseInput();
  input.speakerMaskBounds = [
    { x: 160, y: 180, width: 560, height: 740 },
    { x: 1200, y: 180, width: 560, height: 740 },
  ];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.equal(result?.layoutMode, "multi_person");
  assert.equal(result?.zone, "lower_center");
});

test("single-person recent history alternates side", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
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

test("editorial selection remains deterministic for same seed", () => {
  const inputA = baseInput();
  inputA.selectionSeed = 1;
  inputA.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
  const a1 = resolveMaskAwarePlacement(inputA);
  const a2 = resolveMaskAwarePlacement(inputA);
  assert.ok(a1 && a2);
  assert.equal(a1.zone, a2.zone);
});

test("fixed-size no-safe-placement resolves when scale fallback allowed", () => {
  const input = baseInput();
  input.overlay = { width: 2200, height: 1280 };
  input.speakerMaskBounds = [];
  input.allowScaleFallback = true;
  input.emergencyScaleAllowed = true;
  input.minScale = 0.5;
  input.scaleSteps = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.equal(result?.resolvedWithScaleFallback, true);
  assert.ok((result?.selectedScale ?? 1) < 1);
});

test("unknown mask falls back to bottom-right", () => {
  const input = baseInput();
  input.speakerMaskBounds = [];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.equal(result?.layoutMode, "unknown");
  assert.equal(result?.zone, "lower_right");
  assert.equal(result?.fallbackUsed, true);
  assert.equal(result?.fallbackReason, "no_mask_bounds");
});

test("does not scale when normal size fits", () => {
  const input = baseInput();
  input.allowScaleFallback = true;
  input.minScale = 0.5;
  input.scaleSteps = [1, 0.9, 0.8];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.equal(result?.selectedScale, 1);
  assert.equal(result?.resolvedWithScaleFallback, false);
});

test("returns null when even minScale cannot fit", () => {
  const input = baseInput();
  input.overlay = { width: 1400, height: 840 };
  input.speakerMaskBounds = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  input.reservedZones = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  input.allowScaleFallback = true;
  input.emergencyScaleAllowed = true;
  input.minScale = 0.5;
  input.scaleSteps = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
  const result = resolveMaskAwarePlacement(input);
  assert.equal(result, null);
});

test("scale fallback remains deterministic with same seed", () => {
  const input = baseInput();
  input.overlay = { width: 2200, height: 1280 };
  input.speakerMaskBounds = [];
  input.allowScaleFallback = true;
  input.emergencyScaleAllowed = true;
  input.selectionSeed = 5;
  const first = resolveMaskAwarePlacement(input);
  const second = resolveMaskAwarePlacement(input);
  assert.ok(first && second);
  assert.equal(first.zone, second.zone);
  assert.equal(first.rect.x, second.rect.x);
  assert.equal(first.rect.y, second.rect.y);
  assert.equal(first.selectedScale, second.selectedScale);
});

test("shoulder overlap can beat extreme corner hugging", () => {
  const input = baseInput();
  input.overlay = { width: 420, height: 240 };
  input.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
  const padded = buildPaddedSpeakerBounds(input);
  const reserved: Rect[] = [];
  const shoulderOverlapCandidate = scoreCandidate({
    input,
    paddedSpeakerBounds: padded,
    reservedZones: reserved,
    candidate: { zone: "left_gutter", rect: { x: 220, y: 470, width: 420, height: 240 } },
  });
  const cornerCandidate = scoreCandidate({
    input,
    paddedSpeakerBounds: padded,
    reservedZones: reserved,
    candidate: { zone: "upper_left", rect: { x: 24, y: 24, width: 420, height: 240 } },
  });
  assert.ok(shoulderOverlapCandidate && cornerCandidate);
  assert.ok(shoulderOverlapCandidate.finalScore > cornerCandidate.finalScore);
});

test("face or head overlap is hard rejected", () => {
  const input = baseInput();
  input.overlay = { width: 420, height: 240 };
  input.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
  const padded = buildPaddedSpeakerBounds(input);
  const faceOverlap = scoreCandidate({
    input,
    paddedSpeakerBounds: padded,
    reservedZones: [],
    candidate: { zone: "upper_right", rect: { x: 780, y: 120, width: 420, height: 240 } },
  });
  assert.equal(faceOverlap, null);
});

test("single speaker prefers lower zones over upper corners", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
  input.selectionSeed = 1;
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.ok(result?.zone === "lower_left" || result?.zone === "lower_right");
});

test("single speaker does not choose lower-center while lower sides are valid", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.notEqual(result?.zone, "lower_center");
});

test("single speaker alternates lower zones using recent placement history first", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
  input.recentPlacements = [{ zone: "lower_right", rect: { x: 0, y: 0, width: 420, height: 240 }, count: 1 }];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.equal(result?.zone, "lower_left");
});

test("scale remains >= 0.85 when face is clear and containment is possible", () => {
  const input = baseInput();
  input.overlay = { width: 2050, height: 1200 };
  input.speakerMaskBounds = [];
  input.allowScaleFallback = true;
  input.emergencyScaleAllowed = false;
  input.minScale = 0.5;
  input.scaleSteps = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.ok((result?.selectedScale ?? 1) >= 0.85);
});

test("default resolver does not return below 0.85", () => {
  const input = baseInput();
  input.overlay = { width: 2200, height: 1280 };
  input.allowScaleFallback = true;
  input.emergencyScaleAllowed = false;
  const result = resolveMaskAwarePlacement(input);
  assert.equal(result, null);
});

test("emergency scale below 0.85 requires emergencyScaleAllowed", () => {
  const input = baseInput();
  input.overlay = { width: 2200, height: 1280 };
  input.allowScaleFallback = true;
  input.emergencyScaleAllowed = true;
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.ok((result?.selectedScale ?? 1) < 0.85);
});

test("overlay may overlap lower torso and still resolve", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.ok(result?.zone === "lower_left" || result?.zone === "lower_right");
});

test("derived face zone rejects overlap while body-only overlap allowed", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
  const padded = buildPaddedSpeakerBounds(input);
  const faceSafe = deriveFaceSafeZonesFromSpeakerBounds(input.speakerMaskBounds)[0]!;
  const faceOverlap = scoreCandidate({
    input,
    paddedSpeakerBounds: padded,
    reservedZones: [],
    candidate: {
      zone: "upper_right",
      rect: { x: faceSafe.x, y: faceSafe.y, width: 420, height: 240 },
    },
  });
  assert.equal(faceOverlap, null);
});

test("single-person lower-zone remains readable when only body overlap exists", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 760, y: 90, width: 400, height: 820 }];
  input.selectionSeed = 0;
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.ok(result?.zone === "lower_left" || result?.zone === "lower_right");
  assert.ok((result?.selectedScale ?? 1) >= 0.85);
});

test("nudge into frame occurs before shrinking", () => {
  const input = baseInput();
  input.frame = { width: 1280, height: 720 };
  input.overlay = { width: 1200, height: 300 };
  input.speakerMaskBounds = [];
  input.allowScaleFallback = true;
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.equal(isRectInsideFrame(result!.rect, input.frame), true);
  assert.ok((result?.selectedScale ?? 1) >= 0.85);
});

test("multi-person protects each derived face/head zone", () => {
  const input = baseInput();
  input.speakerMaskBounds = [
    { x: 180, y: 130, width: 460, height: 760 },
    { x: 1260, y: 130, width: 460, height: 760 },
  ];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  const faceZones = deriveFaceSafeZonesFromSpeakerBounds(input.speakerMaskBounds);
  for (const zone of faceZones) {
    assert.equal(intersectionArea(result!.rect, zone), 0);
  }
});

test("intersects_padded_speaker_bounds is never a hard reject reason", () => {
  const input = baseInput();
  input.speakerMaskBounds = [{ x: 740, y: 120, width: 420, height: 760 }];
  const evaluation = evaluateMaskAwarePlacementCandidates(input);
  assert.equal(evaluation.candidates.some((c) => c.rejectionReason === "intersects_padded_speaker_bounds"), false);
});

test("larger readable scale beats tiny perfectly safe placement", () => {
  const input = baseInput();
  input.allowScaleFallback = true;
  input.minScale = 0.5;
  input.scaleSteps = [1, 0.8, 0.6, 0.5];
  input.speakerMaskBounds = [{ x: 860, y: 220, width: 260, height: 520 }];
  const result = resolveMaskAwarePlacement(input);
  assert.ok(result);
  assert.equal(result?.selectedScale, 1);
});

test("balanced placement beats extreme corner when otherwise close", () => {
  const input = baseInput();
  input.overlay = { width: 420, height: 240 };
  input.speakerMaskBounds = [];
  const padded = buildPaddedSpeakerBounds(input);
  const balanced = scoreCandidate({
    input,
    paddedSpeakerBounds: padded,
    reservedZones: [],
    candidate: { zone: "right_gutter", rect: { x: 1180, y: 360, width: 420, height: 240 } },
  });
  const extremeCorner = scoreCandidate({
    input,
    paddedSpeakerBounds: padded,
    reservedZones: [],
    candidate: { zone: "upper_left", rect: { x: 24, y: 24, width: 420, height: 240 } },
  });
  assert.ok(balanced && extremeCorner);
  assert.ok(balanced.finalScore > extremeCorner.finalScore);
});
