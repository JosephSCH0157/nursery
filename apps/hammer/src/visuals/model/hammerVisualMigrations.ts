import { createDefaultSemanticAnchor, createDefaultVisualAnimation, createDefaultVisualGeometry, createDefaultVisualLane, createEmptyVisualTimelineState } from "./hammerVisualDefaults";
import {
  assertValidTimelineState,
  clampOpacity,
  normalizeAnchorHint,
  normalizeAnimation,
  normalizeGeometry,
  normalizeSecRange,
  normalizeZIndex,
} from "./hammerVisualGuards";
import {
  HAMMER_VISUAL_DEFAULT_UPDATED_AT,
  HAMMER_VISUAL_ANCHOR_RESOLVER_VERSION,
  type HammerVisualAsset,
  type HammerVisualAssetKind,
  type HammerVisualClip,
  type HammerVisualSourceMode,
  type HammerVisualTimelineState,
} from "./hammerVisualTypes";
import type {
  HammerPersistedVisualPlacements,
  HammerVisualPlacementRecord,
} from "../../persistence/hammerPersistenceContract";
import { deriveStableHammerAssetIdFromPath, normalizeHammerAssetIdentitySource } from "../../lib/hammerAssetIdentity";

function inferMimeType(path: string | null): string | null {
  const normalized = path?.toLowerCase() ?? "";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  return null;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAnchorOrigin(value: unknown): "hearth" | "hammer_transcript" | "hammer_timeline" | "legacy" {
  const normalized = readTrimmedString(value);
  return normalized === "hearth" || normalized === "hammer_transcript" || normalized === "hammer_timeline"
    ? normalized
    : "legacy";
}

function resolveLegacyAssetIdentitySource(record: HammerVisualPlacementRecord): string {
  return normalizeHammerAssetIdentitySource(record.asset_path)
    ?? normalizeHammerAssetIdentitySource(record.storage_key)
    ?? readTrimmedString(record.asset_id)
    ?? normalizeHammerAssetIdentitySource(record.asset_ref)
    ?? `placement:${record.placement_id}`;
}

function resolveLegacySourceMode(record: HammerVisualPlacementRecord): HammerVisualSourceMode {
  const entryId = (record.entry_id ?? "").toLowerCase();
  const visualMode = (record.visual_mode ?? "").toLowerCase();
  if (entryId.startsWith("packaging:") || visualMode.startsWith("packaging_")) {
    return "packaging";
  }
  if (record.authority_operation_id || record.ingest_state === "approved") {
    return "manual";
  }
  return "seeded";
}

function resolveLegacyAssetKind(record: HammerVisualPlacementRecord): HammerVisualAssetKind {
  const visualMode = (record.visual_mode ?? "").toLowerCase();
  if (visualMode.includes("b_roll") || visualMode.includes("broll")) return "broll";
  if (visualMode.includes("reference_clip")) return "reference_clip";
  if (visualMode.includes("contextual_data_composite") || visualMode.includes("cdc")) return "contextual_data_composite";
  return "image";
}

export function deriveStableHammerVisualAssetId(record: HammerVisualPlacementRecord): string {
  // Stable id contract: derived from a normalized identity source (primarily path-like fields).
  return deriveStableHammerAssetIdFromPath(resolveLegacyAssetIdentitySource(record));
}

export function migrateLegacyPlacementRecordToClip(args: {
  record: HammerVisualPlacementRecord;
  asset_id: string;
  lane_id?: string;
  updated_at?: string;
}): HammerVisualClip {
  const updatedAt = args.updated_at ?? HAMMER_VISUAL_DEFAULT_UPDATED_AT;
  const timing = normalizeSecRange(args.record.start_sec, args.record.end_sec);
  const hasAnchorEvidence = Boolean(readTrimmedString(args.record.anchor_text) || readTrimmedString(args.record.script_cue_id));
  const alignment = args.record.alignment ?? null;
  const transcriptResolved = Boolean(alignment && alignment.state === "aligned" && alignment.transcript_segment_id);
  const resolutionConfidence = alignment?.confidence ?? args.record.confidence ?? null;
  const flags = new Set(args.record.uncertainty_flags);
  const detached = flags.has("anchor_provenance_stale");
  const ambiguous = flags.has("anchor_match_ambiguous") || flags.has("anchor_match_uncertain");
  const anchorStatus = detached
    ? "detached"
    : ambiguous
      ? "ambiguous_match"
      : transcriptResolved
        ? "anchored"
        : hasAnchorEvidence
          ? "anchor_supplied_resolution_failed"
          : "no_placement_intent";
  return {
    clip_id: readTrimmedString(args.record.placement_id) ?? `clip_${args.asset_id}`,
    asset_id: args.asset_id,
    lane_id: args.lane_id ?? "lane:primary",
    entry_id: readTrimmedString(args.record.entry_id),
    label: readTrimmedString(args.record.label) ?? readTrimmedString(args.record.entry_id),
    visual_mode: readTrimmedString(args.record.visual_mode),
    confidence: args.record.confidence ?? null,
    placement_status: args.record.status === "uncertain" ? "uncertain" : "placed",
    ingest_state: args.record.ingest_state ?? null,
    uncertainty_flags: [...args.record.uncertainty_flags],
    authority_operation_id: readTrimmedString(args.record.authority_operation_id) ?? undefined,
    start_sec: timing.start_sec,
    end_sec: timing.end_sec,
    geometry: normalizeGeometry(args.record.overlay_geometry ?? createDefaultVisualGeometry()),
    fit_mode: "contain",
    animation: normalizeAnimation({
      preset: args.record.animation_preset ?? createDefaultVisualAnimation().preset,
    }),
    opacity: clampOpacity(args.record.overlay_opacity),
    z_index: normalizeZIndex(args.record.overlay_z_index),
    enabled: true,
    locked: false,
    source_mode: resolveLegacySourceMode(args.record),
    anchor_hint: normalizeAnchorHint({
      anchor_segment_id: args.record.anchor_segment_id,
      matched_segment_ids: args.record.matched_segment_ids,
      anchor_text: args.record.anchor_text,
      anchor_label: args.record.label ?? args.record.entry_id,
      detached: false,
    }),
    semantic_anchor: createDefaultSemanticAnchor({
      status: anchorStatus,
      hearth_entry_id: readTrimmedString(args.record.entry_id),
      origin: normalizeAnchorOrigin(args.record.anchor_origin),
      purpose: args.record.anchor_purpose ?? null,
      placement_intent: readTrimmedString(args.record.placement_intent) ?? readTrimmedString(args.record.visual_mode),
      script: {
        script_path: readTrimmedString(args.record.script_path),
        script_approval_id: readTrimmedString(args.record.script_approval_id),
        script_approval_revision: args.record.script_approval_revision ?? null,
        script_content_hash: readTrimmedString(args.record.script_content_hash),
        anchor_contract_version: readTrimmedString(args.record.anchor_contract_version),
        section_id: readTrimmedString(args.record.anchor_section_id),
        paragraph_id: readTrimmedString(args.record.anchor_paragraph_id),
        sentence_start: args.record.anchor_sentence_start ?? null,
        sentence_end: args.record.anchor_sentence_end ?? null,
        char_start: args.record.anchor_char_start ?? null,
        char_end: args.record.anchor_char_end ?? null,
        quoted_phrase: readTrimmedString(args.record.anchor_text),
        resolution_state: detached
          ? "stale"
          : flags.has("anchor_script_current") ? "resolved" : "unresolved",
      },
      transcript: {
        transcript_id: readTrimmedString(args.record.transcript_id),
        media_id: readTrimmedString(args.record.transcript_media_id),
        media_signature: readTrimmedString(args.record.transcript_media_signature),
        segment_ids: [...args.record.matched_segment_ids],
        start_sec: alignment?.transcript_start_sec ?? null,
        end_sec: alignment?.transcript_end_sec ?? null,
        resolution_state: transcriptResolved ? "resolved" : "unresolved",
      },
      resolution_method: alignment?.match_method === "deterministic_phrase"
        ? "exact_ordered_words"
        : alignment?.match_method === "fuzzy_text"
          ? "fuzzy_text"
          : "unresolved",
      resolution_confidence: resolutionConfidence,
      resolver_version: alignment ? HAMMER_VISUAL_ANCHOR_RESOLVER_VERSION : null,
      resolved_at: transcriptResolved ? updatedAt : null,
    }),
    divergence: transcriptResolved ? {
      state: "aligned",
      start_delta_sec: Number((timing.start_sec - (alignment?.transcript_start_sec ?? timing.start_sec)).toFixed(3)),
      end_delta_sec: Number((timing.end_sec - (alignment?.transcript_end_sec ?? timing.end_sec)).toFixed(3)),
    } : {
      state: "not_comparable",
      start_delta_sec: null,
      end_delta_sec: null,
    },
    updated_at: updatedAt,
  };
}

export function migrateLegacyPlacementRecordToAsset(args: {
  record: HammerVisualPlacementRecord;
  asset_id: string;
  updated_at?: string;
}): HammerVisualAsset {
  const updatedAt = args.updated_at ?? HAMMER_VISUAL_DEFAULT_UPDATED_AT;
  const path = readTrimmedString(args.record.asset_path);
  const storageKey = readTrimmedString(args.record.storage_key);
  return {
    asset_id: args.asset_id,
    asset_ref: readTrimmedString(args.record.asset_ref) ?? path ?? storageKey ?? args.asset_id,
    kind: resolveLegacyAssetKind(args.record),
    label: readTrimmedString(args.record.label) ?? readTrimmedString(args.record.entry_id),
    path,
    storage_key: storageKey,
    mime_type: inferMimeType(path ?? storageKey),
    source_mode: resolveLegacySourceMode(args.record),
    roles: args.record.asset_roles?.length ? [...args.record.asset_roles] : ["timeline_visual"],
    updated_at: updatedAt,
  };
}

function buildMigrationHash(records: HammerVisualPlacementRecord[]): string {
  const seed = records.map((record) => {
    const pathIdentity = resolveLegacyAssetIdentitySource(record);
    return [
      record.placement_id,
      pathIdentity,
      record.start_sec,
      record.end_sec,
      record.overlay_z_index ?? "",
    ].join("|");
  }).join("::");
  return records.length > 0 ? deriveStableHammerAssetIdFromPath(seed) : "empty";
}

export function migrateLegacyPlacementRecordsToTimelineState(args: {
  placements: HammerVisualPlacementRecord[];
  selected_overlay_row_id?: string | null;
  updated_at?: string;
}): HammerVisualTimelineState {
  const updatedAt = args.updated_at ?? HAMMER_VISUAL_DEFAULT_UPDATED_AT;
  const lane = createDefaultVisualLane();
  const assetsById = new Map<string, HammerVisualAsset>();
  const clips: HammerVisualClip[] = [];

  for (const record of args.placements) {
    const assetId = deriveStableHammerVisualAssetId(record);
    if (!assetsById.has(assetId)) {
      assetsById.set(assetId, migrateLegacyPlacementRecordToAsset({
        record,
        asset_id: assetId,
        updated_at: updatedAt,
      }));
    }
    const clip = migrateLegacyPlacementRecordToClip({
      record,
      asset_id: assetId,
      lane_id: lane.lane_id,
      updated_at: updatedAt,
    });
    clips.push(clip);
    lane.clip_ids.push(clip.clip_id);
  }

  const selectedClipId = readTrimmedString(args.selected_overlay_row_id);
  const timeline = createEmptyVisualTimelineState({
    revision: 1,
    updated_at: updatedAt,
    assets: [...assetsById.values()],
    clips,
    lanes: [lane],
    selected_clip_id: selectedClipId && clips.some((clip) => clip.clip_id === selectedClipId)
      ? selectedClipId
      : null,
    debug_origin: "legacy_migration",
    debug_migration_hash: buildMigrationHash(args.placements),
  });

  return assertValidTimelineState(timeline);
}

export function migratePersistedVisualState(args: {
  canonical_timeline?: HammerVisualTimelineState | null;
  legacy_visual_placements?: HammerPersistedVisualPlacements | null;
  selected_overlay_row_id?: string | null;
  updated_at?: string;
}): HammerVisualTimelineState {
  const updatedAt = args.updated_at ?? HAMMER_VISUAL_DEFAULT_UPDATED_AT;
  if (args.canonical_timeline) {
    return assertValidTimelineState(createEmptyVisualTimelineState({
      ...args.canonical_timeline,
      debug_origin: args.canonical_timeline.debug_origin === "legacy_migration"
        ? "legacy_migration"
        : "canonical_load",
    }));
  }

  const legacyPlacements = args.legacy_visual_placements?.placements ?? [];
  if (legacyPlacements.length > 0) {
    return migrateLegacyPlacementRecordsToTimelineState({
      placements: legacyPlacements,
      selected_overlay_row_id: args.selected_overlay_row_id,
      updated_at: updatedAt,
    });
  }

  return assertValidTimelineState(createEmptyVisualTimelineState({
    updated_at: updatedAt,
    debug_origin: "empty_init",
  }));
}
