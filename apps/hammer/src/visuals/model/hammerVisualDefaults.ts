import {
  HAMMER_VISUAL_DEFAULT_UPDATED_AT,
  HAMMER_VISUAL_TIMELINE_SOURCE_MODE,
  HAMMER_VISUAL_TIMELINE_VERSION,
  type HammerVisualAnimation,
  type HammerVisualGeometry,
  type HammerVisualLane,
  type HammerVisualSemanticAnchor,
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

export function createDefaultSemanticAnchor(
  overrides?: Partial<HammerVisualSemanticAnchor>,
): HammerVisualSemanticAnchor {
  return {
    status: overrides?.status ?? "no_placement_intent",
    hearth_entry_id: overrides?.hearth_entry_id ?? null,
    hearth_beat_id: overrides?.hearth_beat_id ?? null,
    purpose: overrides?.purpose ?? null,
    origin: overrides?.origin ?? "legacy",
    placement_intent: overrides?.placement_intent ?? null,
    script: {
      script_path: overrides?.script?.script_path ?? null,
      script_approval_id: overrides?.script?.script_approval_id ?? null,
      script_approval_revision: overrides?.script?.script_approval_revision ?? null,
      script_content_hash: overrides?.script?.script_content_hash ?? null,
      anchor_contract_version: overrides?.script?.anchor_contract_version ?? null,
      section_id: overrides?.script?.section_id ?? null,
      paragraph_id: overrides?.script?.paragraph_id ?? null,
      sentence_start: overrides?.script?.sentence_start ?? null,
      sentence_end: overrides?.script?.sentence_end ?? null,
      char_start: overrides?.script?.char_start ?? null,
      char_end: overrides?.script?.char_end ?? null,
      quoted_phrase: overrides?.script?.quoted_phrase ?? null,
      resolution_state: overrides?.script?.resolution_state ?? "unresolved",
    },
    transcript: {
      transcript_id: overrides?.transcript?.transcript_id ?? null,
      media_id: overrides?.transcript?.media_id ?? null,
      media_signature: overrides?.transcript?.media_signature ?? null,
      segment_ids: [...(overrides?.transcript?.segment_ids ?? [])],
      start_sec: overrides?.transcript?.start_sec ?? null,
      end_sec: overrides?.transcript?.end_sec ?? null,
      resolution_state: overrides?.transcript?.resolution_state ?? "unresolved",
    },
    resolution_method: overrides?.resolution_method ?? "unresolved",
    resolution_confidence: overrides?.resolution_confidence ?? null,
    resolver_version: overrides?.resolver_version ?? null,
    resolved_at: overrides?.resolved_at ?? null,
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
    assets: (overrides?.assets ?? []).map((asset) => ({
      ...asset,
      roles: asset.roles?.length ? [...asset.roles] : ["timeline_visual"],
    })),
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
        uncertainty_flags: [...clip.uncertainty_flags],
        anchor_hint: {
          ...clip.anchor_hint,
          matched_segment_ids: [...clip.anchor_hint.matched_segment_ids],
        },
        semantic_anchor: createDefaultSemanticAnchor(clip.semantic_anchor),
        divergence: clip.divergence ? { ...clip.divergence } : {
          state: "not_comparable",
          start_delta_sec: null,
          end_delta_sec: null,
        },
      }))
      : [],
    debug_origin: overrides?.debug_origin ?? "empty_init",
    debug_migration_hash: overrides?.debug_migration_hash ?? null,
  };
}
