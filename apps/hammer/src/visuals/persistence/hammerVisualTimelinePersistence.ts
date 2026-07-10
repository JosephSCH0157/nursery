import type {
  HammerPersistenceSaveRequest,
  HammerPersistenceSnapshot,
} from "../../persistence/hammerPersistenceContract";
import { HAMMER_RUNTIME_WRITTEN_BY } from "../../prep/hammerPrep";
import { createDefaultVisualLane, createEmptyVisualTimelineState } from "../model/hammerVisualDefaults";
import {
  assertValidTimelineState,
  clampOpacity,
  normalizeAnchorHint,
  normalizeAnimation,
  normalizeGeometry,
  normalizeSecRange,
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

  const assetsRaw = Array.isArray(row.assets) ? row.assets : [];
  const clipsRaw = Array.isArray(row.clips) ? row.clips : [];
  const lanesRaw = Array.isArray(row.lanes) ? row.lanes : [];

  const assets: HammerVisualAsset[] = assetsRaw
    .map((entry) => {
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
        updated_at: readString(asset.updated_at) ?? "1970-01-01T00:00:00.000Z",
      };
    })
    .filter((asset): asset is HammerVisualAsset => Boolean(asset));

  const clips: HammerVisualClip[] = clipsRaw
    .map((entry) => {
      const clip = readRecord(entry);
      if (!clip) return null;
      const clipId = readString(clip?.clip_id);
      const laneId = readString(clip?.lane_id);
      if (!clipId || !laneId) return null;
      const timing = normalizeSecRange(readNumber(clip.start_sec) ?? 0, readNumber(clip.end_sec) ?? 0);
      return {
        clip_id: clipId,
        asset_id: readString(clip.asset_id),
        lane_id: laneId,
        label: readString(clip.label),
        start_sec: timing.start_sec,
        end_sec: timing.end_sec,
        geometry: normalizeGeometry(readRecord(clip.geometry) as Partial<HammerVisualClip["geometry"]> | null),
        animation: normalizeAnimation(readRecord(clip.animation) as Partial<HammerVisualClip["animation"]> | null),
        opacity: clampOpacity(readNumber(clip.opacity)),
        z_index: normalizeZIndex(readNumber(clip.z_index)),
        enabled: clip.enabled !== false,
        locked: clip.locked === true,
        source_mode: normalizeSourceMode(clip.source_mode),
        anchor_hint: normalizeAnchorHint(readRecord(clip.anchor_hint) as Partial<HammerVisualClip["anchor_hint"]> | null),
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
      version: row.version === 1 ? 1 : 1,
      revision: typeof row.revision === "number" && Number.isInteger(row.revision) && row.revision > 0 ? row.revision : 1,
      updated_at: readString(row.updated_at) ?? "1970-01-01T00:00:00.000Z",
      selected_clip_id: readString(row.selected_clip_id),
      assets,
      clips,
      lanes,
      debug_origin: row.debug_origin === "legacy_migration" || row.debug_origin === "empty_init" ? row.debug_origin : "canonical_load",
      debug_migration_hash: readString(row.debug_migration_hash),
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
      canonical = assertValidTimelineState(createEmptyVisualTimelineState({
        ...rawCanonical,
        debug_origin: "canonical_load",
      }));
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
      data: assertValidTimelineState(createEmptyVisualTimelineState(args.timeline)),
    },
  };
}
