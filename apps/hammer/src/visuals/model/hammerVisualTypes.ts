export const HAMMER_VISUAL_TIMELINE_VERSION = 2 as const;
export const HAMMER_VISUAL_ANCHOR_RESOLVER_VERSION = "hammer.semantic-anchor.v1" as const;
export const HAMMER_VISUAL_TIMELINE_SOURCE_MODE = "packaging" as const;
export const HAMMER_VISUAL_DEFAULT_UPDATED_AT = "1970-01-01T00:00:00.000Z" as const;
export const HAMMER_VISUAL_DEFAULT_MIN_DURATION_SEC = 0.25 as const;

export type HammerVisualSourceMode = "packaging" | "manual" | "seeded";
export type HammerVisualTimelineDebugOrigin = "canonical_load" | "legacy_migration" | "empty_init";
export type HammerVisualAssetRole = "thumbnail" | "timeline_visual";
export type HammerVisualAnchorStatus =
  | "anchored"
  | "anchor_supplied_resolution_failed"
  | "ambiguous_match"
  | "detached"
  | "no_placement_intent";
export type HammerVisualAnchorResolutionMethod = "exact_ordered_words" | "fuzzy_text" | "manual_transcript" | "unresolved";

export type HammerVisualAssetKind =
  | "image"
  | "broll"
  | "reference_clip"
  | "contextual_data_composite";

export type HammerVisualGeometryAnchor = "center" | "top_left";
export type HammerVisualFitMode = "contain" | "cover";

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
  roles: HammerVisualAssetRole[];
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

export interface HammerVisualScriptEvidence {
  script_path: string | null;
  script_approval_id: string | null;
  script_approval_revision: number | null;
  script_content_hash: string | null;
  anchor_contract_version: string | null;
  section_id: string | null;
  paragraph_id: string | null;
  sentence_start: number | null;
  sentence_end: number | null;
  char_start: number | null;
  char_end: number | null;
  quoted_phrase: string | null;
  resolution_state: "resolved" | "unresolved" | "stale";
}

export interface HammerVisualTranscriptEvidence {
  transcript_id: string | null;
  media_id: string | null;
  media_signature: string | null;
  segment_ids: string[];
  start_sec: number | null;
  end_sec: number | null;
  resolution_state: "resolved" | "unresolved" | "stale";
}

export interface HammerVisualSemanticAnchor {
  status: HammerVisualAnchorStatus;
  hearth_entry_id: string | null;
  hearth_beat_id: string | null;
  purpose: "coverage" | "explanation" | "emphasis" | null;
  origin: "hearth" | "hammer_transcript" | "hammer_timeline" | "legacy";
  placement_intent: string | null;
  script: HammerVisualScriptEvidence;
  transcript: HammerVisualTranscriptEvidence;
  resolution_method: HammerVisualAnchorResolutionMethod;
  resolution_confidence: number | null;
  resolver_version: string | null;
  resolved_at: string | null;
}

export interface HammerVisualDivergence {
  state: "aligned" | "review_needed" | "not_comparable";
  start_delta_sec: number | null;
  end_delta_sec: number | null;
}

export interface HammerVisualClip {
  clip_id: string;
  asset_id: string | null;
  lane_id: string;
  entry_id: string | null;
  system_managed?: boolean;
  system_type?: "intro" | "outro";
  system_source?: "profile" | "episode" | "manual";
  system_asset_id?: string | null;
  label: string | null;
  visual_mode: string | null;
  confidence: number | null;
  placement_status: "placed" | "uncertain";
  ingest_state: "suggested" | "approved" | null;
  uncertainty_flags: string[];
  authority_operation_id?: string;
  start_sec: number;
  end_sec: number;
  geometry: HammerVisualGeometry;
  fit_mode?: HammerVisualFitMode;
  animation: HammerVisualAnimation;
  opacity: number;
  z_index: number;
  enabled: boolean;
  locked: boolean;
  source_mode: HammerVisualSourceMode;
  anchor_hint: HammerVisualAnchorHint;
  semantic_anchor: HammerVisualSemanticAnchor;
  divergence: HammerVisualDivergence;
  updated_at: string;
}

export interface HammerVisualLane {
  lane_id: string;
  label: string;
  clip_ids: string[];
}

export type HammerPackagingIntentSource = "profile" | "episode" | "manual" | "legacy";

export interface HammerPackagingIntentV1 {
  version: 1;
  intro_asset_id: string | null;
  outro_asset_id: string | null;
  intro_source: HammerPackagingIntentSource | null;
  outro_source: HammerPackagingIntentSource | null;
}

export interface HammerVisualTimelineState {
  version: typeof HAMMER_VISUAL_TIMELINE_VERSION;
  revision: number;
  updated_at: string;
  source_mode: typeof HAMMER_VISUAL_TIMELINE_SOURCE_MODE;
  selected_clip_id: string | null;
  packaging: HammerPackagingIntentV1;
  assets: HammerVisualAsset[];
  lanes: HammerVisualLane[];
  clips: HammerVisualClip[];
  debug_origin?: HammerVisualTimelineDebugOrigin;
  debug_migration_hash?: string | null;
}
