export type HearthVisualsPanelId =
  | "media_map"
  | "thumbnails"
  | "timeline_images"
  | "broll"
  | "reference_clips";

export const HEARTH_VISUALS_PANEL_SECTION_IDS: Record<HearthVisualsPanelId, string> = {
  media_map: "hearth-media-map-panel",
  thumbnails: "hearth-thumbnail-panel",
  timeline_images: "hearth-image-map-panel",
  broll: "hearth-broll-plan-panel",
  reference_clips: "hearth-reference-clip-plan-panel",
};

export function toggleHearthVisualsPanel(
  current: HearthVisualsPanelId | null,
  target: HearthVisualsPanelId,
): HearthVisualsPanelId | null {
  return current === target ? null : target;
}
