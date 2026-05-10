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
