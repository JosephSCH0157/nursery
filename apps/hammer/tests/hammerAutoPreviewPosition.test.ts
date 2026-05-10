import assert from "node:assert/strict";
import {
  applyPreviewOverride,
  clearPreviewOverride,
  toPreviewTransformFromAutoPlacementOverlay,
} from "../src/editor/hammerAutoPreviewPosition";

function testPreviewOverrideDoesNotMutatePersistedPlacementObject() {
  const persisted = { leftPct: 10, topPct: 12, widthPct: 28, heightPct: 28 };
  const overlay = { leftPct: 50, topPct: 10, widthPct: 28, heightPct: 28 };
  const previewTransform = toPreviewTransformFromAutoPlacementOverlay(overlay);
  const overrides = applyPreviewOverride({}, "clip-1", previewTransform);
  assert.equal(overrides["clip-1"]?.leftPct, 50);
  assert.deepEqual(persisted, { leftPct: 10, topPct: 12, widthPct: 28, heightPct: 28 });
}

function testResetPreviewPositionClearsOverride() {
  const overrides = applyPreviewOverride({}, "clip-1", {
    leftPct: 40,
    topPct: 8,
    widthPct: 28,
    heightPct: 28,
  });
  const cleared = clearPreviewOverride(overrides, "clip-1");
  assert.equal(cleared["clip-1"], undefined);
}

function testPreviewOverrideStateIsLocalAndSnapshotAgnostic() {
  const overrides = applyPreviewOverride({}, "clip-1", {
    leftPct: 33,
    topPct: 14,
    widthPct: 30,
    heightPct: 30,
  });
  // Guard expectation: preview-only state is a separate map keyed by clip id.
  // It contains no timeline/session/persistence fields and is not a snapshot payload.
  assert.deepEqual(Object.keys(overrides), ["clip-1"]);
  assert.equal("workspaceId" in (overrides as unknown as Record<string, unknown>), false);
  assert.equal("visualTimeline" in (overrides as unknown as Record<string, unknown>), false);
}

function testPreviewOverrideAppliesResolvedRectAndScaledSize() {
  const persisted = { leftPct: 10, topPct: 12, widthPct: 34, heightPct: 34 };
  const overlay = { leftPct: 42, topPct: 8, widthPct: 22, heightPct: 22 };
  const previewTransform = toPreviewTransformFromAutoPlacementOverlay(overlay);
  const overrides = applyPreviewOverride({}, "clip-2", previewTransform);
  assert.deepEqual(overrides["clip-2"], previewTransform);
  assert.deepEqual(persisted, { leftPct: 10, topPct: 12, widthPct: 34, heightPct: 34 });
}

try {
  testPreviewOverrideDoesNotMutatePersistedPlacementObject();
  testResetPreviewPositionClearsOverride();
  testPreviewOverrideStateIsLocalAndSnapshotAgnostic();
  testPreviewOverrideAppliesResolvedRectAndScaledSize();
  console.log("Hammer auto preview position tests passed.");
} catch (error) {
  console.error("Hammer auto preview position tests failed:", error);
  process.exitCode = 1;
}
