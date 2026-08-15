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
