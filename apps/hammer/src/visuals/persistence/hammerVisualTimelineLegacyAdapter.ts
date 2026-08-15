import type {
  HammerPersistedVisualPlacements,
  HammerVisualPlacementRecord,
} from "../../persistence/hammerPersistenceContract";
import type {
  HammerVisualAsset,
  HammerVisualClip,
  HammerVisualTimelineState,
} from "../model/hammerVisualTypes";

function resolveAssetById(
  assets: HammerVisualAsset[],
  assetId: string | null,
): HammerVisualAsset | null {
  if (!assetId) return null;
  return assets.find((asset) => asset.asset_id === assetId) ?? null;
}

function derivePlacementRecord(args: {
  clip: HammerVisualClip;
  asset: HammerVisualAsset | null;
}): HammerVisualPlacementRecord {
  const { clip, asset } = args;
  return {
    placement_id: clip.clip_id,
    authority_operation_id: clip.authority_operation_id,
    entry_id: clip.entry_id ?? `clip:${clip.clip_id}`,
    anchor_segment_id: clip.anchor_hint.anchor_segment_id ?? clip.clip_id,
    matched_segment_ids: [...clip.anchor_hint.matched_segment_ids],
    anchor_text: clip.anchor_hint.anchor_text,
    script_path: clip.semantic_anchor.script.script_path,
    script_approval_id: clip.semantic_anchor.script.script_approval_id,
    script_approval_revision: clip.semantic_anchor.script.script_approval_revision,
    script_content_hash: clip.semantic_anchor.script.script_content_hash,
    anchor_contract_version: clip.semantic_anchor.script.anchor_contract_version,
    anchor_section_id: clip.semantic_anchor.script.section_id,
    anchor_paragraph_id: clip.semantic_anchor.script.paragraph_id,
    anchor_sentence_start: clip.semantic_anchor.script.sentence_start,
    anchor_sentence_end: clip.semantic_anchor.script.sentence_end,
    anchor_char_start: clip.semantic_anchor.script.char_start,
    anchor_char_end: clip.semantic_anchor.script.char_end,
    anchor_purpose: clip.semantic_anchor.purpose,
    anchor_origin: clip.semantic_anchor.origin,
    placement_intent: clip.semantic_anchor.placement_intent,
    transcript_id: clip.semantic_anchor.transcript.transcript_id,
    transcript_media_id: clip.semantic_anchor.transcript.media_id,
    transcript_media_signature: clip.semantic_anchor.transcript.media_signature,
    asset_ref: asset?.asset_ref ?? clip.asset_id ?? clip.clip_id,
    asset_id: asset?.asset_id ?? clip.asset_id,
    asset_path: asset?.path ?? null,
    storage_key: asset?.storage_key ?? null,
    label: clip.label,
    visual_mode: clip.visual_mode,
    start_sec: clip.start_sec,
    end_sec: clip.end_sec,
    confidence: clip.confidence,
    timing_source: clip.semantic_anchor.resolution_method === "exact_ordered_words" || clip.semantic_anchor.resolution_method === "fuzzy_text"
      ? "transcript_match"
      : "ordered_fallback",
    status: clip.placement_status,
    ingest_state: clip.ingest_state ?? undefined,
    asset_roles: asset?.roles?.length ? [...asset.roles] : ["timeline_visual"],
    uncertainty_flags: [...clip.uncertainty_flags],
    overlay_geometry: {
      x: clip.geometry.x,
      y: clip.geometry.y,
      width: clip.geometry.width,
      height: clip.geometry.height,
      anchor: clip.geometry.anchor,
    },
    animation_preset: clip.animation.preset,
    overlay_opacity: clip.opacity,
    overlay_z_index: clip.z_index,
    script_cue_id: clip.semantic_anchor.hearth_entry_id,
    placement_authority: "hammer_timeline_anchor",
    alignment: clip.semantic_anchor.transcript.start_sec != null
      && clip.semantic_anchor.transcript.end_sec != null
      && clip.semantic_anchor.transcript.segment_ids[0]
      ? {
        script_cue_id: clip.semantic_anchor.hearth_entry_id ?? clip.entry_id ?? clip.clip_id,
        transcript_segment_id: clip.semantic_anchor.transcript.segment_ids[0],
        transcript_start_sec: clip.semantic_anchor.transcript.start_sec,
        transcript_end_sec: clip.semantic_anchor.transcript.end_sec,
        confidence: clip.semantic_anchor.resolution_confidence,
        match_method: clip.semantic_anchor.resolution_method === "exact_ordered_words"
          ? "deterministic_phrase"
          : clip.semantic_anchor.resolution_method === "fuzzy_text"
            ? "fuzzy_text"
            : "ordered_fallback",
        state: clip.semantic_anchor.status === "anchored"
          ? "aligned"
          : clip.semantic_anchor.status === "anchor_supplied_resolution_failed"
            ? "unresolved"
            : "review_needed",
      }
      : null,
  };
}

export function deriveLegacyVisualPlacementsFromTimeline(
  timeline: HammerVisualTimelineState | null | undefined,
): HammerPersistedVisualPlacements | null {
  if (!timeline) return null;
  const placements = timeline.clips.map((clip) => derivePlacementRecord({
    clip,
    asset: resolveAssetById(timeline.assets, clip.asset_id),
  }));
  return {
    schema_version: 1,
    status: placements.length > 0 ? "prepared" : "not_started",
    source_refs: [`timeline_revision:${timeline.revision}`],
    uncertainty_flags: placements.flatMap((placement) => placement.uncertainty_flags).filter((flag, index, list) => list.indexOf(flag) === index),
    placements,
  };
}
