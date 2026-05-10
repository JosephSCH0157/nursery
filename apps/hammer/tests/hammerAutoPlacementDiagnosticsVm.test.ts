import assert from "node:assert/strict";
import { resolveAutoPlacementDiagnosticsForPreview } from "../src/editor/hammerWorkspaceShellViewModels";

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
  });
  assert.equal(result.enabled, true);
  if (result.enabled) {
    assert.equal(result.state, "waiting_for_selected_overlay_asset");
    assert.equal(result.statusLabel, "auto-placement: debug enabled, waiting for selected overlay asset");
    assert.equal(result.overlay, null);
    assert.equal(result.ghost, null);
  }
}

try {
  testResolvedWhenBoundsAvailable();
  testNoMaskBoundsWhenMissing();
  testDisabledWhenDebugOff();
  testWaitingWhenMaskBoundsPresentButSelectedOverlayMissing();
  console.log("Hammer auto-placement diagnostics VM tests passed.");
} catch (error) {
  console.error("Hammer auto-placement diagnostics VM tests failed:", error);
  process.exitCode = 1;
}
