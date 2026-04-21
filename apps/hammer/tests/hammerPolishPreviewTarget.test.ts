import assert from "node:assert/strict";
import {
  resolveHammerPolishPreviewTarget,
  resolveVisualPreviewEmptyStateMessage,
} from "../src/editor/hammerPolishPreviewTarget";

{
  const target = resolveHammerPolishPreviewTarget({
    visualPolishPreviewActive: true,
    previewVideoSrc: "blob:preview-video",
    activePreviewOverlays: [],
  });
  assert.equal(target.source, "preview_monitor_frame");
  assert.equal(target.hasFrame, true);
  assert.equal(target.hasActiveOverlay, false);
  assert.equal(target.segmentationEligible, true);
  assert.equal(
    resolveVisualPreviewEmptyStateMessage({ target }),
    "No active visual overlay at this playhead time. Base-frame polish preview remains active.",
  );
}

{
  const target = resolveHammerPolishPreviewTarget({
    visualPolishPreviewActive: true,
    previewVideoSrc: null,
    activePreviewOverlays: [{ clip_id: "clip-1" } as any],
  });
  assert.equal(target.source, "none");
  assert.equal(target.hasFrame, false);
  assert.equal(target.hasActiveOverlay, true);
  assert.equal(target.activeOverlayClipId, "clip-1");
  assert.equal(target.segmentationEligible, false);
}

{
  const target = resolveHammerPolishPreviewTarget({
    visualPolishPreviewActive: false,
    previewVideoSrc: "blob:preview-video",
    activePreviewOverlays: [],
  });
  assert.equal(target.segmentationEligible, false);
  assert.equal(
    resolveVisualPreviewEmptyStateMessage({ target }),
    "No active visual overlay at this playhead time.",
  );
}

// eslint-disable-next-line no-console
console.log("Hammer polish preview target tests passed.");
