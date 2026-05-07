export interface HammerVisualPlacementOverlayGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: "center" | "top_left";
}

export interface HammerVisualPlacementRecordContract {
  placement_id: string;
  authority_operation_id?: string;
  entry_id: string;
  anchor_segment_id: string;
  matched_segment_ids: string[];
  anchor_text: string | null;
  asset_ref: string;
  asset_id: string | null;
  asset_path: string | null;
  storage_key: string | null;
  label: string | null;
  visual_mode: string | null;
  start_sec: number;
  end_sec: number;
  confidence: number | null;
  timing_source: "transcript_match" | "ordered_fallback";
  status: "placed" | "uncertain";
  ingest_state?: "suggested" | "approved";
  uncertainty_flags: string[];
  overlay_geometry?: HammerVisualPlacementOverlayGeometry | null;
  animation_preset?:
    | "none"
    | "fade_in"
    | "fade_out"
    | "fade_in_out"
    | "flip_in"
    | "flip_out"
    | "shutter_in"
    | "shutter_out"
    | "shutter_in_fade_out"
    | null;
  overlay_opacity?: number | null;
  overlay_z_index?: number | null;
  script_cue_id?: string | null;
  placement_authority?: "hammer_timeline_anchor";
  alignment?: {
    script_cue_id: string;
    transcript_segment_id: string;
    transcript_start_sec: number;
    transcript_end_sec: number;
    confidence: number | null;
    match_method: "deterministic_phrase" | "fuzzy_text" | "ordered_fallback";
    state: "aligned" | "review_needed" | "unresolved";
  } | null;
}

export interface HammerPersistedVisualPlacementsContract {
  schema_version: 1;
  status: "not_started" | "prepared";
  source_refs: string[];
  uncertainty_flags: string[];
  placements: HammerVisualPlacementRecordContract[];
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => readString(value)).filter((value): value is string => Boolean(value)))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeOverlayGeometry(value: unknown): HammerVisualPlacementOverlayGeometry | null {
  const row = readObject(value);
  if (!row) return null;
  const x = readNumber(row.x);
  const y = readNumber(row.y);
  const width = readNumber(row.width);
  const height = readNumber(row.height);
  if (x == null || y == null || width == null || height == null) {
    return null;
  }
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    width: clamp(width, 0.05, 1),
    height: clamp(height, 0.05, 1),
    anchor: row.anchor === "center" ? "center" : "top_left",
  };
}

function normalizeAnimationPreset(value: unknown): HammerVisualPlacementRecordContract["animation_preset"] {
  const preset = readString(value);
  return preset === "none"
    || preset === "fade_in"
    || preset === "fade_out"
    || preset === "fade_in_out"
    || preset === "flip_in"
    || preset === "flip_out"
    || preset === "shutter_in"
    || preset === "shutter_out"
    || preset === "shutter_in_fade_out"
    ? preset
    : null;
}

function normalizePlacementRecord(
  value: unknown,
): HammerVisualPlacementRecordContract | null {
  const row = readObject(value);
  if (!row) return null;
  const placementId = readString(row.placement_id);
  const entryId = readString(row.entry_id);
  const anchorSegmentId = readString(row.anchor_segment_id);
  const assetRef = readString(row.asset_ref);
  const startSec = readNumber(row.start_sec);
  const endSec = readNumber(row.end_sec);
  if (!placementId || !entryId || !anchorSegmentId || !assetRef || startSec == null || endSec == null || endSec < startSec) {
    return null;
  }

  const timingSource = row.timing_source === "ordered_fallback" ? "ordered_fallback" : "transcript_match";
  const status = row.status === "uncertain" ? "uncertain" : "placed";
  const ingestState = row.ingest_state === "approved" ? "approved" : row.ingest_state === "suggested" ? "suggested" : undefined;
  const confidence = readNumber(row.confidence);
  const overlayOpacity = readNumber(row.overlay_opacity);
  const overlayZIndex = readNumber(row.overlay_z_index);
  const scriptCueId = readString(row.script_cue_id);
  const placementAuthority = row.placement_authority === "hammer_timeline_anchor"
    ? "hammer_timeline_anchor"
    : undefined;
  const alignmentRow = readObject(row.alignment);
  const alignment = alignmentRow
    ? (() => {
      const cueId = readString(alignmentRow.script_cue_id);
      const segmentId = readString(alignmentRow.transcript_segment_id);
      const startSec = readNumber(alignmentRow.transcript_start_sec);
      const endSec = readNumber(alignmentRow.transcript_end_sec);
      if (!cueId || !segmentId || startSec == null || endSec == null || endSec < startSec) return null;
      const confidence = readNumber(alignmentRow.confidence);
      const matchMethod = alignmentRow.match_method === "deterministic_phrase"
        ? "deterministic_phrase"
        : alignmentRow.match_method === "fuzzy_text"
          ? "fuzzy_text"
          : "ordered_fallback";
      const state = alignmentRow.state === "aligned"
        ? "aligned"
        : alignmentRow.state === "review_needed"
          ? "review_needed"
          : "unresolved";
      return {
        script_cue_id: cueId,
        transcript_segment_id: segmentId,
        transcript_start_sec: startSec,
        transcript_end_sec: endSec,
        confidence: confidence == null ? null : confidence,
        match_method: matchMethod,
        state,
      } as const;
    })()
    : null;

  return {
    placement_id: placementId,
    ...(readString(row.authority_operation_id) ? { authority_operation_id: readString(row.authority_operation_id) ?? undefined } : {}),
    entry_id: entryId,
    anchor_segment_id: anchorSegmentId,
    matched_segment_ids: uniqueStrings(row.matched_segment_ids),
    anchor_text: readString(row.anchor_text),
    asset_ref: assetRef,
    asset_id: readString(row.asset_id),
    asset_path: readString(row.asset_path),
    storage_key: readString(row.storage_key),
    label: readString(row.label),
    visual_mode: readString(row.visual_mode),
    start_sec: startSec,
    end_sec: endSec,
    confidence: confidence == null ? null : confidence,
    timing_source: timingSource,
    status,
    ...(ingestState ? { ingest_state: ingestState } : {}),
    uncertainty_flags: uniqueStrings(row.uncertainty_flags),
    overlay_geometry: normalizeOverlayGeometry(row.overlay_geometry),
    animation_preset: normalizeAnimationPreset(row.animation_preset),
    overlay_opacity: overlayOpacity == null ? null : clamp(overlayOpacity, 0, 1),
    overlay_z_index: overlayZIndex == null ? null : overlayZIndex,
    script_cue_id: scriptCueId,
    ...(placementAuthority ? { placement_authority: placementAuthority } : {}),
    alignment,
  };
}

export function cloneVisualPlacementsContract(
  placements: HammerPersistedVisualPlacementsContract | null | undefined,
): HammerPersistedVisualPlacementsContract | null {
  if (!placements) return null;
  return {
    schema_version: 1,
    status: placements.status === "prepared" ? "prepared" : "not_started",
    source_refs: uniqueStrings(placements.source_refs),
    uncertainty_flags: uniqueStrings(placements.uncertainty_flags),
    placements: Array.isArray(placements.placements)
      ? placements.placements
        .map((record) => normalizePlacementRecord(record))
        .filter((record): record is HammerVisualPlacementRecordContract => Boolean(record))
      : [],
  };
}

export function normalizeHammerVisualPlacements(
  value: unknown,
): HammerPersistedVisualPlacementsContract | null {
  const row = readObject(value);
  if (!row) return null;
  return cloneVisualPlacementsContract({
    schema_version: 1,
    status: row.status === "prepared" ? "prepared" : "not_started",
    source_refs: uniqueStrings(row.source_refs),
    uncertainty_flags: uniqueStrings(row.uncertainty_flags),
    placements: Array.isArray(row.placements) ? row.placements : [],
  });
}
