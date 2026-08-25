export type PreviewPlacementTransform = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

export type AutoPlacementOverlayRect = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

export function previewTransformsEqual(
  left: PreviewPlacementTransform | null | undefined,
  right: PreviewPlacementTransform | null | undefined,
  tolerance = 0.01,
): boolean {
  if (!left || !right) return left === right;
  return Math.abs(left.leftPct - right.leftPct) < tolerance
    && Math.abs(left.topPct - right.topPct) < tolerance
    && Math.abs(left.widthPct - right.widthPct) < tolerance
    && Math.abs(left.heightPct - right.heightPct) < tolerance;
}

export function isAnalysisFrameAtCompositionTime(
  frameSourcePresentationTimeSec: number,
  compositionPresentationTimeSec: number,
): boolean {
  return Math.abs(frameSourcePresentationTimeSec - compositionPresentationTimeSec) <= 0.001;
}

export function toPreviewTransformFromAutoPlacementOverlay(
  overlay: AutoPlacementOverlayRect,
): PreviewPlacementTransform {
  return {
    leftPct: overlay.leftPct,
    topPct: overlay.topPct,
    widthPct: overlay.widthPct,
    heightPct: overlay.heightPct,
  };
}

export function applyPreviewOverride(
  current: Record<string, PreviewPlacementTransform>,
  clipId: string,
  transform: PreviewPlacementTransform,
): Record<string, PreviewPlacementTransform> {
  if (previewTransformsEqual(current[clipId], transform)) return current;
  return {
    ...current,
    [clipId]: transform,
  };
}

export function clearPreviewOverride(
  current: Record<string, PreviewPlacementTransform>,
  clipId: string,
): Record<string, PreviewPlacementTransform> {
  if (!current[clipId]) return current;
  const next = { ...current };
  delete next[clipId];
  return next;
}
