import type { VisualPreviewOverlayModel } from "../visuals/components/VisualPreviewComposer";

export type HammerPolishPreviewTarget = {
  source: "preview_monitor_frame" | "none";
  hasFrame: boolean;
  visualPolishActive: boolean;
  hasActiveOverlay: boolean;
  activeOverlayClipId: string | null;
  segmentationEligible: boolean;
};

export function resolveHammerPolishPreviewTarget(args: {
  visualPolishPreviewActive: boolean;
  previewVideoSrc: string | null | undefined;
  activePreviewOverlays: readonly VisualPreviewOverlayModel[];
}): HammerPolishPreviewTarget {
  const hasFrame = typeof args.previewVideoSrc === "string" && args.previewVideoSrc.trim().length > 0;
  const hasActiveOverlay = args.activePreviewOverlays.length > 0;
  const activeOverlayClipId = hasActiveOverlay
    ? (args.activePreviewOverlays.at(-1)?.clip_id ?? null)
    : null;

  return {
    source: hasFrame ? "preview_monitor_frame" : "none",
    hasFrame,
    visualPolishActive: args.visualPolishPreviewActive,
    hasActiveOverlay,
    activeOverlayClipId,
    segmentationEligible: args.visualPolishPreviewActive && hasFrame,
  };
}

export function resolveVisualPreviewEmptyStateMessage(args: {
  target: HammerPolishPreviewTarget;
}): string {
  if (args.target.segmentationEligible) {
    return "No active visual overlay at this playhead time. Base-frame polish preview remains active.";
  }
  return "No active visual overlay at this playhead time.";
}
