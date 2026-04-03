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
    asset_ref: asset?.asset_ref ?? clip.asset_id ?? clip.clip_id,
    asset_id: asset?.asset_id ?? clip.asset_id,
    asset_path: asset?.path ?? null,
    storage_key: asset?.storage_key ?? null,
    label: clip.label,
    visual_mode: clip.visual_mode,
    start_sec: clip.start_sec,
    end_sec: clip.end_sec,
    confidence: clip.confidence,
    timing_source: "ordered_fallback",
    status: clip.placement_status,
    ingest_state: clip.ingest_state ?? undefined,
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
