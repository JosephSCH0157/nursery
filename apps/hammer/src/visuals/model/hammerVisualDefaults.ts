import {
  HAMMER_VISUAL_DEFAULT_UPDATED_AT,
  HAMMER_VISUAL_TIMELINE_SOURCE_MODE,
  HAMMER_VISUAL_TIMELINE_VERSION,
  type HammerVisualAnimation,
  type HammerVisualGeometry,
  type HammerVisualLane,
  type HammerVisualTimelineState,
} from "./hammerVisualTypes";

export function createDefaultVisualGeometry(
  overrides?: Partial<HammerVisualGeometry>,
): HammerVisualGeometry {
  return {
    x: overrides?.x ?? 0.5,
    y: overrides?.y ?? 0.5,
    width: overrides?.width ?? 0.4,
    height: overrides?.height ?? 0.4,
    anchor: overrides?.anchor ?? "center",
  };
}

export function createDefaultVisualAnimation(
  overrides?: Partial<HammerVisualAnimation>,
): HammerVisualAnimation {
  return {
    preset: overrides?.preset ?? "none",
  };
}

export function createDefaultVisualLane(
  overrides?: Partial<HammerVisualLane>,
): HammerVisualLane {
  return {
    lane_id: overrides?.lane_id ?? "lane:primary",
    label: overrides?.label ?? "Visuals",
    clip_ids: [...(overrides?.clip_ids ?? [])],
  };
}

export function createEmptyVisualTimelineState(
  overrides?: Partial<HammerVisualTimelineState>,
): HammerVisualTimelineState {
  return {
    version: HAMMER_VISUAL_TIMELINE_VERSION,
    revision: overrides?.revision ?? 1,
    updated_at: overrides?.updated_at ?? HAMMER_VISUAL_DEFAULT_UPDATED_AT,
    source_mode: HAMMER_VISUAL_TIMELINE_SOURCE_MODE,
    selected_clip_id: overrides?.selected_clip_id ?? null,
    assets: [...(overrides?.assets ?? [])],
    lanes: overrides?.lanes
      ? overrides.lanes.map((lane) => ({
        ...lane,
        clip_ids: [...lane.clip_ids],
      }))
      : [createDefaultVisualLane()],
    clips: overrides?.clips
      ? overrides.clips.map((clip) => ({
        ...clip,
        geometry: { ...clip.geometry },
        animation: { ...clip.animation },
        anchor_hint: {
          ...clip.anchor_hint,
          matched_segment_ids: [...clip.anchor_hint.matched_segment_ids],
        },
      }))
      : [],
    debug_origin: overrides?.debug_origin ?? "empty_init",
    debug_migration_hash: overrides?.debug_migration_hash ?? null,
  };
}
