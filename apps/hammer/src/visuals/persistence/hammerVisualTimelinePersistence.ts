import type {
  HammerPersistenceSaveRequest,
  HammerPersistenceSnapshot,
} from "../../persistence/hammerPersistenceContract";
import { HAMMER_RUNTIME_WRITTEN_BY } from "../../prep/hammerPrep";
import { createDefaultVisualLane, createEmptyVisualTimelineState } from "../model/hammerVisualDefaults";
import {
  assertValidTimelineState,
  clampOpacity,
  normalizeAssetRoles,
  normalizeAnchorHint,
  normalizeAnimation,
  normalizeGeometry,
  normalizeFitMode,
  normalizeSecRange,
  normalizeSemanticAnchor,
  normalizeZIndex,
} from "../model/hammerVisualGuards";
import { migratePersistedVisualState } from "../model/hammerVisualMigrations";
import type {
  HammerVisualAsset,
  HammerVisualAssetKind,
  HammerVisualClip,
  HammerVisualSourceMode,
  HammerVisualTimelineState,
} from "../model/hammerVisualTypes";
import { isHammerDevConsoleEnabled } from "../../lib/hammerDevConsole";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stableNormalizationFingerprint(value: unknown): string {
  const input = JSON.stringify(value) ?? "null";
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v2-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeAssetKind(value: unknown): HammerVisualAssetKind {
  return value === "broll" || value === "reference_clip" || value === "contextual_data_composite"
    ? value
    : "image";
}

function normalizeSourceMode(value: unknown): HammerVisualSourceMode {
  return value === "manual" || value === "seeded" ? value : "packaging";
}

function normalizeCanonicalTimeline(value: unknown): HammerVisualTimelineState | null {
  const row = readRecord(value);
  if (!row) return null;
  const requiresV2Normalization = row.version !== 2;

  const assetsRaw = Array.isArray(row.assets) ? row.assets : [];
  const clipsRaw = Array.isArray(row.clips) ? row.clips : [];
  const lanesRaw = Array.isArray(row.lanes) ? row.lanes : [];

  const assets: HammerVisualAsset[] = assetsRaw
    .map((entry): HammerVisualAsset | null => {
      const asset = readRecord(entry);
      if (!asset) return null;
      const assetId = readString(asset?.asset_id);
      const assetRef = readString(asset?.asset_ref);
      if (!assetId || !assetRef) return null;
      return {
        asset_id: assetId,
        asset_ref: assetRef,
        kind: normalizeAssetKind(asset.kind),
        label: readString(asset.label),
        path: readString(asset.path),
        storage_key: readString(asset.storage_key),
        mime_type: readString(asset.mime_type),
        source_mode: normalizeSourceMode(asset.source_mode),
        roles: normalizeAssetRoles(asset.roles, ["timeline_visual"]),
        updated_at: readString(asset.updated_at) ?? "1970-01-01T00:00:00.000Z",
      };
    })
    .filter((asset): asset is HammerVisualAsset => Boolean(asset));

  const clips: HammerVisualClip[] = clipsRaw
    .map((entry): HammerVisualClip | null => {
      const clip = readRecord(entry);
      if (!clip) return null;
      const clipId = readString(clip?.clip_id);
      const laneId = readString(clip?.lane_id);
      if (!clipId || !laneId) return null;
      const timing = normalizeSecRange(readNumber(clip.start_sec) ?? 0, readNumber(clip.end_sec) ?? 0);
      const anchorHint = normalizeAnchorHint(readRecord(clip.anchor_hint) as Partial<HammerVisualClip["anchor_hint"]> | null);
      const semanticRow = readRecord(clip.semantic_anchor);
      const semanticAnchor = semanticRow
        ? normalizeSemanticAnchor(semanticRow as Partial<HammerVisualClip["semantic_anchor"]>)
        : normalizeSemanticAnchor({
          status: anchorHint.anchor_text || anchorHint.anchor_segment_id ? "anchor_supplied_resolution_failed" : "no_placement_intent",
          origin: "legacy",
          hearth_entry_id: readString(clip.entry_id),
          placement_intent: readString(clip.visual_mode),
          script: {
            script_path: null, script_approval_id: null, script_approval_revision: null, script_content_hash: null,
            anchor_contract_version: null, section_id: null, paragraph_id: null, sentence_start: null, sentence_end: null,
            char_start: null, char_end: null, quoted_phrase: anchorHint.anchor_text, resolution_state: "unresolved",
          },
          transcript: {
            transcript_id: null, media_id: null, media_signature: null, segment_ids: anchorHint.matched_segment_ids,
            start_sec: null, end_sec: null, resolution_state: "unresolved",
          },
        });
      return {
        clip_id: clipId,
        asset_id: readString(clip.asset_id),
        lane_id: laneId,
        entry_id: readString(clip.entry_id),
        ...(clip.system_managed === true ? { system_managed: true } : {}),
        ...(clip.system_type === "intro" || clip.system_type === "outro" ? { system_type: clip.system_type } : {}),
        ...(clip.system_source === "profile" || clip.system_source === "episode" || clip.system_source === "manual"
          ? { system_source: clip.system_source }
          : {}),
        ...(typeof clip.system_asset_id === "string" || clip.system_asset_id === null
          ? { system_asset_id: readString(clip.system_asset_id) }
          : {}),
        label: readString(clip.label),
        visual_mode: readString(clip.visual_mode),
        confidence: readNumber(clip.confidence),
        placement_status: clip.placement_status === "uncertain" ? "uncertain" : "placed",
        ingest_state: clip.ingest_state === "approved" ? "approved" : clip.ingest_state === "suggested" ? "suggested" : null,
        uncertainty_flags: Array.isArray(clip.uncertainty_flags)
          ? clip.uncertainty_flags.map(readString).filter((flag): flag is string => Boolean(flag))
          : [],
        ...(readString(clip.authority_operation_id) ? { authority_operation_id: readString(clip.authority_operation_id) ?? undefined } : {}),
        start_sec: timing.start_sec,
        end_sec: timing.end_sec,
        geometry: normalizeGeometry(readRecord(clip.geometry) as Partial<HammerVisualClip["geometry"]> | null),
        fit_mode: normalizeFitMode(clip.fit_mode as HammerVisualClip["fit_mode"]),
        animation: normalizeAnimation(readRecord(clip.animation) as Partial<HammerVisualClip["animation"]> | null),
        opacity: clampOpacity(readNumber(clip.opacity)),
        z_index: normalizeZIndex(readNumber(clip.z_index)),
        enabled: clip.enabled !== false,
        locked: clip.locked === true,
        source_mode: normalizeSourceMode(clip.source_mode),
        anchor_hint: anchorHint,
        semantic_anchor: semanticAnchor,
        divergence: (() => {
          const row = readRecord(clip.divergence);
          const state = row?.state === "aligned" || row?.state === "review_needed" ? row.state : "not_comparable";
          return {
            state,
            start_delta_sec: readNumber(row?.start_delta_sec),
            end_delta_sec: readNumber(row?.end_delta_sec),
          };
        })(),
        updated_at: readString(clip.updated_at) ?? "1970-01-01T00:00:00.000Z",
      };
    })
    .filter((clip): clip is HammerVisualClip => Boolean(clip));

  const lanes = lanesRaw.length > 0
    ? lanesRaw.map((entry) => {
      const lane = readRecord(entry);
      return createDefaultVisualLane({
        lane_id: readString(lane?.lane_id) ?? "lane:primary",
        label: readString(lane?.label) ?? "Visuals",
        clip_ids: Array.isArray(lane?.clip_ids)
          ? lane.clip_ids.map((clipId) => readString(clipId)).filter((clipId): clipId is string => Boolean(clipId))
          : [],
      });
    })
    : [createDefaultVisualLane({
      clip_ids: clips.map((clip) => clip.clip_id),
    })];

  try {
    return assertValidTimelineState(createEmptyVisualTimelineState({
      version: 2,
      revision: typeof row.revision === "number" && Number.isInteger(row.revision) && row.revision > 0 ? row.revision : 1,
      updated_at: readString(row.updated_at) ?? "1970-01-01T00:00:00.000Z",
      selected_clip_id: readString(row.selected_clip_id),
      assets,
      clips,
      lanes,
      debug_origin: requiresV2Normalization || row.debug_origin === "legacy_migration"
        ? "legacy_migration"
        : row.debug_origin === "empty_init" ? "empty_init" : "canonical_load",
      debug_migration_hash: requiresV2Normalization
        ? stableNormalizationFingerprint(row)
        : readString(row.debug_migration_hash),
    }));
  } catch {
    return null;
  }
}

export function loadHammerVisualTimelineStateFromSnapshot(
  snapshot: HammerPersistenceSnapshot | null | undefined,
): HammerVisualTimelineState {
  const updatedAt = snapshot?.visual_timeline.updated_at
    ?? snapshot?.visual_placements.updated_at
    ?? snapshot?.editor_session.updated_at
    ?? "1970-01-01T00:00:00.000Z";
  const rawCanonical = snapshot?.visual_timeline.data ?? null;
  let canonical: HammerVisualTimelineState | null = null;
  if (rawCanonical) {
    try {
      canonical = assertValidTimelineState({ ...rawCanonical, debug_origin: "canonical_load" });
    } catch {
      canonical = normalizeCanonicalTimeline(rawCanonical);
    }
  }
  const timeline = migratePersistedVisualState({
    canonical_timeline: canonical,
    legacy_visual_placements: snapshot?.visual_placements.data ?? null,
    selected_overlay_row_id: snapshot?.editor_session.data?.selected_overlay_row_id ?? null,
    updated_at: updatedAt,
  });
  if (isHammerDevConsoleEnabled() && typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[hammer:migration]", {
      debug_origin: timeline.debug_origin,
      assets: timeline.assets.length,
      clips: timeline.clips.length,
      revision: timeline.revision,
    });
  }
  return timeline;
}

export function buildHammerVisualTimelineSaveRequest(args: {
  timeline: HammerVisualTimelineState;
  active_session_id?: string | null;
  last_opened_at?: string;
}): Pick<HammerPersistenceSaveRequest, "written_by" | "active_session_id" | "last_opened_at" | "visual_timeline"> {
  return {
    written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
    active_session_id: args.active_session_id ?? null,
    last_opened_at: args.last_opened_at,
    visual_timeline: {
      data: assertValidTimelineState(createEmptyVisualTimelineState({
        ...args.timeline,
        debug_origin: "canonical_load",
      })),
    },
  };
}

/**
 * Strict compatibility boundary for revision-owned canonical v1 timelines.
 * Unlike snapshot recovery, this never drops malformed entries or synthesizes
 * missing lanes. It returns only a complete v2 projection suitable for the
 * canonical installation guard.
 */
export function normalizeLegacyCanonicalVisualTimelineV1(value: unknown): HammerVisualTimelineState | null {
  const row = readRecord(value);
  if (!row || row.version !== 1 || row.source_mode !== "packaging") return null;
  if (!Number.isInteger(row.revision) || Number(row.revision) < 1 || !readString(row.updated_at)) return null;
  if (!Array.isArray(row.assets) || !Array.isArray(row.clips) || !Array.isArray(row.lanes)) return null;
  if (row.selected_clip_id !== null && typeof row.selected_clip_id !== "undefined" && !readString(row.selected_clip_id)) return null;

  const assetIds = new Set<string>();
  for (const entry of row.assets) {
    const asset = readRecord(entry);
    const assetId = readString(asset?.asset_id);
    if (!asset || !assetId || !readString(asset.asset_ref) || assetIds.has(assetId)) return null;
    if (!["image", "broll", "reference_clip", "contextual_data_composite"].includes(String(asset.kind))) return null;
    if (!["packaging", "manual", "seeded"].includes(String(asset.source_mode)) || !readString(asset.updated_at)) return null;
    if (typeof asset.roles !== "undefined") {
      if (!Array.isArray(asset.roles) || JSON.stringify(normalizeAssetRoles(asset.roles)) !== JSON.stringify(asset.roles)) return null;
    }
    assetIds.add(assetId);
  }

  const laneIds = new Set<string>();
  const mountedClipIds = new Set<string>();
  for (const entry of row.lanes) {
    const lane = readRecord(entry);
    const laneId = readString(lane?.lane_id);
    if (!lane || !laneId || !readString(lane.label) || laneIds.has(laneId) || !Array.isArray(lane.clip_ids)) return null;
    laneIds.add(laneId);
    for (const value of lane.clip_ids) {
      const clipId = readString(value);
      if (!clipId || mountedClipIds.has(clipId)) return null;
      mountedClipIds.add(clipId);
    }
  }

  const clipIds = new Set<string>();
  for (const entry of row.clips) {
    const clip = readRecord(entry);
    const clipId = readString(clip?.clip_id);
    const laneId = readString(clip?.lane_id);
    const assetId = clip?.asset_id == null ? null : readString(clip.asset_id);
    if (!clip || !clipId || !laneId || clipIds.has(clipId) || !laneIds.has(laneId) || !mountedClipIds.has(clipId)) return null;
    if (clip.asset_id != null && (!assetId || !assetIds.has(assetId))) return null;
    if (!Number.isFinite(clip.start_sec) || !Number.isFinite(clip.end_sec) || !readString(clip.updated_at)) return null;
    const geometry = readRecord(clip.geometry) as Partial<HammerVisualClip["geometry"]> | null;
    const animation = readRecord(clip.animation) as Partial<HammerVisualClip["animation"]> | null;
    const normalizedGeometry = normalizeGeometry(geometry);
    if (!geometry
      || normalizedGeometry.x !== geometry.x
      || normalizedGeometry.y !== geometry.y
      || normalizedGeometry.width !== geometry.width
      || normalizedGeometry.height !== geometry.height
      || normalizedGeometry.anchor !== geometry.anchor) return null;
    if (!animation || normalizeAnimation(animation).preset !== animation.preset) return null;
    const timing = normalizeSecRange(Number(clip.start_sec), Number(clip.end_sec));
    if (timing.start_sec !== Number(clip.start_sec) || timing.end_sec !== Number(clip.end_sec)) return null;
    if (clampOpacity(readNumber(clip.opacity)) !== clip.opacity || normalizeZIndex(readNumber(clip.z_index)) !== clip.z_index) return null;
    if (!["packaging", "manual", "seeded"].includes(String(clip.source_mode))) return null;
    if (clip.fit_mode != null && clip.fit_mode !== "contain" && clip.fit_mode !== "cover") return null;
    const anchorHint = readRecord(clip.anchor_hint) as Partial<HammerVisualClip["anchor_hint"]> | null;
    const normalizedAnchorHint = normalizeAnchorHint(anchorHint);
    if (!anchorHint
      || normalizedAnchorHint.anchor_segment_id !== anchorHint.anchor_segment_id
      || normalizedAnchorHint.anchor_text !== anchorHint.anchor_text
      || normalizedAnchorHint.anchor_label !== anchorHint.anchor_label
      || normalizedAnchorHint.detached !== anchorHint.detached
      || !Array.isArray(anchorHint.matched_segment_ids)
      || normalizedAnchorHint.matched_segment_ids.length !== anchorHint.matched_segment_ids.length
      || normalizedAnchorHint.matched_segment_ids.some((segmentId, index) => segmentId !== anchorHint.matched_segment_ids?.[index])) return null;
    if (!Array.isArray(clip.uncertainty_flags) || clip.uncertainty_flags.some((flag) => !readString(flag))) return null;
    clipIds.add(clipId);
  }
  if ([...mountedClipIds].some((clipId) => !clipIds.has(clipId))) return null;
  const selectedClipId = readString(row.selected_clip_id);
  if (selectedClipId && !clipIds.has(selectedClipId)) return null;

  const normalized = normalizeCanonicalTimeline(row);
  if (!normalized || normalized.assets.length !== row.assets.length || normalized.clips.length !== row.clips.length || normalized.lanes.length !== row.lanes.length) return null;
  return normalized;
}
