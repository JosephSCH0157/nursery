export const HAMMER_VISUAL_TIMELINE_VERSION = 1 as const;
export const HAMMER_VISUAL_TIMELINE_SOURCE_MODE = "packaging" as const;
export const HAMMER_VISUAL_DEFAULT_UPDATED_AT = "1970-01-01T00:00:00.000Z" as const;
export const HAMMER_VISUAL_DEFAULT_MIN_DURATION_SEC = 0.25 as const;

export type HammerVisualSourceMode = "packaging" | "manual" | "seeded";
export type HammerVisualTimelineDebugOrigin = "canonical_load" | "legacy_migration" | "empty_init";

export type HammerVisualAssetKind =
  | "image"
  | "broll"
  | "reference_clip"
  | "contextual_data_composite";

export type HammerVisualGeometryAnchor = "center" | "top_left";

export type HammerVisualAnimationPreset =
  | "none"
  | "fade_in"
  | "fade_out"
  | "fade_in_out"
  | "flip_in"
  | "flip_out"
  | "shutter_in"
  | "shutter_out"
  | "shutter_in_fade_out";

export interface HammerVisualAsset {
  asset_id: string;
  asset_ref: string;
  kind: HammerVisualAssetKind;
  label: string | null;
  path: string | null;
  storage_key: string | null;
  mime_type: string | null;
  source_mode: HammerVisualSourceMode;
  updated_at: string;
}

export interface HammerVisualGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: HammerVisualGeometryAnchor;
}

export interface HammerVisualAnimation {
  preset: HammerVisualAnimationPreset;
}

export interface HammerVisualAnchorHint {
  anchor_segment_id: string | null;
  matched_segment_ids: string[];
  anchor_text: string | null;
  anchor_label: string | null;
  detached: boolean;
}

export interface HammerVisualClip {
  clip_id: string;
  asset_id: string | null;
  lane_id: string;
  label: string | null;
  start_sec: number;
  end_sec: number;
  geometry: HammerVisualGeometry;
  animation: HammerVisualAnimation;
  opacity: number;
  z_index: number;
  enabled: boolean;
  locked: boolean;
  source_mode: HammerVisualSourceMode;
  anchor_hint: HammerVisualAnchorHint;
  updated_at: string;
}

export interface HammerVisualLane {
  lane_id: string;
  label: string;
  clip_ids: string[];
}

export interface HammerVisualTimelineState {
  version: typeof HAMMER_VISUAL_TIMELINE_VERSION;
  revision: number;
  updated_at: string;
  source_mode: typeof HAMMER_VISUAL_TIMELINE_SOURCE_MODE;
  selected_clip_id: string | null;
  assets: HammerVisualAsset[];
  lanes: HammerVisualLane[];
  clips: HammerVisualClip[];
  debug_origin?: HammerVisualTimelineDebugOrigin;
  debug_migration_hash?: string | null;
}
