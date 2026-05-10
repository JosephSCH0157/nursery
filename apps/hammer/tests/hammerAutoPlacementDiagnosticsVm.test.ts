import assert from "node:assert/strict";
import { normalizeSpeakerMaskBoundsToFrame, resolveAutoPlacementDiagnosticsForPreview } from "../src/editor/hammerWorkspaceShellViewModels";
import { intersectionArea } from "../src/features/auto-placement/reservedZones";

function testResolvedWhenBoundsAvailable() {
  const result = resolveAutoPlacementDiagnosticsForPreview({
    debugEnabled: true,
    frameInput: { width: 1920, height: 1080 },
    speakerMaskBounds: [{ x: 700, y: 220, width: 500, height: 700 }],
    playheadSec: 12,
    selectedOverlayForGhost: {
      clipId: "clip-1",
      hasRealAsset: true,
      widthPct: 28,
      heightPct: 24,
    },
    maskResolution: { width: 1920, height: 1080 },
  });
  assert.equal(result.enabled, true);
  if (result.enabled) {
    assert.equal(result.state, "resolved");
    assert.ok(result.overlay);
    assert.equal(typeof result.overlay?.zone, "string");
    assert.ok(result.ghost);
  }
}

function testNoMaskBoundsWhenMissing() {
  const result = resolveAutoPlacementDiagnosticsForPreview({
    debugEnabled: true,
    frameInput: { width: 1920, height: 1080 },
    speakerMaskBounds: [],
    playheadSec: 12,
    maskResolution: { width: 1920, height: 1080 },
  });
  assert.equal(result.enabled, true);
  if (result.enabled) {
    assert.equal(result.state, "no_mask_bounds");
    assert.equal(result.overlay, null);
    assert.equal(result.statusLabel, "auto-placement: no mask bounds available");
  }
}

function testDisabledWhenDebugOff() {
  const result = resolveAutoPlacementDiagnosticsForPreview({
    debugEnabled: false,
    frameInput: { width: 1920, height: 1080 },
    speakerMaskBounds: [{ x: 700, y: 220, width: 500, height: 700 }],
    playheadSec: 12,
    maskResolution: { width: 1920, height: 1080 },
  });
  assert.deepEqual(result, { enabled: false });
}

function testWaitingWhenMaskBoundsPresentButSelectedOverlayMissing() {
  const result = resolveAutoPlacementDiagnosticsForPreview({
    debugEnabled: true,
    frameInput: { width: 1920, height: 1080 },
    speakerMaskBounds: [{ x: 700, y: 220, width: 500, height: 700 }],
    playheadSec: 12,
    selectedOverlayForGhost: null,
    maskResolution: { width: 1920, height: 1080 },
  });
  assert.equal(result.enabled, true);
  if (result.enabled) {
    assert.equal(result.state, "waiting_for_selected_overlay_asset");
    assert.equal(result.statusLabel, "auto-placement: debug enabled, waiting for selected overlay asset");
    assert.equal(result.overlay, null);
    assert.equal(result.ghost, null);
  }
}

function testCenteredSpeakerMaskRejectsCenterRegionAfterScalingTransform() {
  const frameInput = { width: 1920, height: 1080 };
  const maskResolution = { width: 640, height: 360 };
  const maskSpaceBounds = [{ x: 213, y: 80, width: 214, height: 200 }];
  const normalized = normalizeSpeakerMaskBoundsToFrame({
    speakerMaskBounds: maskSpaceBounds,
    frameInput,
    maskResolution,
  });
  assert.equal(normalized.length, 1);
  const center = normalized[0]!;
  assert.ok(center.x > 500 && center.x < 700);
  assert.ok(center.y > 200 && center.y < 300);

  const result = resolveAutoPlacementDiagnosticsForPreview({
    debugEnabled: true,
    frameInput,
    speakerMaskBounds: maskSpaceBounds,
    maskResolution,
    playheadSec: 19,
    selectedOverlayForGhost: {
      clipId: "clip-2",
      hasRealAsset: true,
      widthPct: 26,
      heightPct: 20,
    },
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) return;
  assert.equal(result.state, "resolved");
  assert.ok(result.overlay);
  if (!result.overlay) return;
  const overlayRect = {
    x: (result.overlay.leftPct / 100) * frameInput.width,
    y: (result.overlay.topPct / 100) * frameInput.height,
    width: (result.overlay.widthPct / 100) * frameInput.width,
    height: (result.overlay.heightPct / 100) * frameInput.height,
  };
  const paddedCenter = {
    x: center.x - 20,
    y: center.y - 20,
    width: center.width + 40,
    height: center.height + 40,
  };
  assert.equal(intersectionArea(overlayRect, paddedCenter), 0);
  assert.notEqual(result.overlay.zone, "background_open");
}

try {
  testResolvedWhenBoundsAvailable();
  testNoMaskBoundsWhenMissing();
  testDisabledWhenDebugOff();
  testWaitingWhenMaskBoundsPresentButSelectedOverlayMissing();
  testCenteredSpeakerMaskRejectsCenterRegionAfterScalingTransform();
  console.log("Hammer auto-placement diagnostics VM tests passed.");
} catch (error) {
  console.error("Hammer auto-placement diagnostics VM tests failed:", error);
  process.exitCode = 1;
}
