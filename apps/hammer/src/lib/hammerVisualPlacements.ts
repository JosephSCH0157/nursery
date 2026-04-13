import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  EpisodeImageMapAssetRefRecord,
  EpisodeImageMapEntryRecord,
  EpisodeImageMapScriptAnchorRecord,
  EpisodeSpokenBeatRecord,
  WorkpieceImageMapResponseData,
  WorkpieceVisualPackageResponseData,
  WorkpieceVisualPackageSelectedAsset,
} from "../../../../packages/tongs/src/workpiece-commit-api";
import type {
  HammerPersistedVisualPlacements,
  HammerVisualPlacementRecord,
} from "../persistence/hammerPersistenceContract";
import {
  cloneVisualPlacementsContract,
  normalizeHammerVisualPlacements,
} from "../../../../packages/tongs/src/hammer-visual-placements-contract";
import { tongsFetch } from "./tongsFetch";
import { requestHammerVisualAssistPreflight } from "./hammerVisualAssistApi";

const MATCH_WINDOW_MIN_SEGMENTS = 3;
const MATCH_WINDOW_MAX_SEGMENTS = 12;
const MATCH_MIN_SCORE = 0.18;
const MATCH_STRONG_SCORE = 0.72;
const ORDER_PENALTY_PER_SEGMENT = 0.04;
const MIN_VISUAL_HOLD_SEC = 1.6;
const MAX_VISUAL_HOLD_SEC = 6;
const MIN_VISUAL_SLIVER_SEC = 0.25;
const EPISODE_MEDIA_MAP_PATH = "hearth/media_map.v1.json";
const ANCHOR_PLACED_CONFIDENCE = 0.85;
const ANCHOR_UNCERTAIN_CONFIDENCE = 0.5;
const PLACEMENT_DEBUG_TOP_CANDIDATES = 6;

type VisualPackageResult =
  | { ok: true; status: number; data: WorkpieceVisualPackageResponseData }
  | { ok: false; status: number; error: string };

type PlacementCandidate = {
  startIndex: number;
  endIndex: number;
  score: number;
  rawScore: number;
};

type PlacementCandidateDebug = {
  start_index: number;
  end_index: number;
  score: number;
  raw_score: number;
  start_sec: number | null;
  end_sec: number | null;
  start_segment_id: string | null;
  end_segment_id: string | null;
  window_text_sample: string | null;
};

type CandidateSearchDebug = {
  evaluated: number;
  matched: number;
  top_candidates: PlacementCandidateDebug[];
};

type EpisodeMediaMapArtifactEntry = {
  id: string;
  final_media_kind: "image" | "b_roll" | "contextual_data_composite" | "reference_clip";
  anchor: {
    mode: "line_anchor" | "phrase_match" | "speaker_turn" | "section_marker" | "absolute_time";
    target: string;
  };
  source: {
    status: "unresolved" | "selected" | "attached";
    asset_id: string | null;
  };
};

type EpisodeMediaMapArtifact = {
  id: string;
  workpiece_id: string;
  script_version_id: string | null;
  status: "draft" | "review" | "approved" | "fulfilling" | "fulfilled" | "needs_attention";
  generated_at: string;
  entries: EpisodeMediaMapArtifactEntry[];
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeMediaMapArtifact(payload: unknown): EpisodeMediaMapArtifact | null {
  const root = readJsonObject(payload);
  if (!root) return null;
  const mapRoot = readJsonObject(root.data) ?? root;
  const id = readString(mapRoot.id);
  const workpieceId = readString(mapRoot.workpiece_id);
  const status = readString(mapRoot.status);
  const generatedAt = readString(mapRoot.generated_at);
  const entriesRaw = Array.isArray(mapRoot.entries) ? mapRoot.entries : null;
  if (!id || !workpieceId || !status || !generatedAt || !entriesRaw) return null;
  const entries: EpisodeMediaMapArtifactEntry[] = [];
  for (const value of entriesRaw) {
    const row = readJsonObject(value);
    if (!row) continue;
    const entryId = readString(row.id);
    const kind = readString(row.final_media_kind);
    const anchor = readJsonObject(row.anchor);
    const source = readJsonObject(row.source);
    if (!entryId || !kind || !anchor || !source) continue;
    const mode = readString(anchor.mode);
    const target = readString(anchor.target);
    const sourceStatus = readString(source.status);
    const assetId = readString(source.asset_id);
    if (!mode || !target || !sourceStatus) continue;
    if (kind !== "image" && kind !== "b_roll" && kind !== "contextual_data_composite" && kind !== "reference_clip") continue;
    if (
      mode !== "line_anchor"
      && mode !== "phrase_match"
      && mode !== "speaker_turn"
      && mode !== "section_marker"
      && mode !== "absolute_time"
    ) continue;
    if (sourceStatus !== "unresolved" && sourceStatus !== "selected" && sourceStatus !== "attached") continue;
    entries.push({
      id: entryId,
      final_media_kind: kind,
      anchor: {
        mode,
        target,
      },
      source: {
        status: sourceStatus,
        asset_id: assetId,
      },
    });
  }
  return {
    id,
    workpiece_id: workpieceId,
    script_version_id: readString(mapRoot.script_version_id),
    status: (
      status === "draft"
      || status === "review"
      || status === "approved"
      || status === "fulfilling"
      || status === "fulfilled"
      || status === "needs_attention"
    )
      ? status
      : "draft",
    generated_at: generatedAt,
    entries,
  };
}

function normalizeVisualAssetClass(value: unknown): "image" | "broll" | "reference_clip" | null {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === "image" || normalized === "broll" || normalized === "reference_clip") {
    return normalized;
  }
  return null;
}

function resolveFinalMediaKind(args: {
  assetClass: "image" | "broll" | "reference_clip" | null;
  visualMode: string | null;
}): "image" | "b_roll" | "contextual_data_composite" | "reference_clip" {
  if (args.assetClass === "broll") return "b_roll";
  if (args.assetClass === "reference_clip") return "reference_clip";
  if (args.assetClass === "image") return "image";
  const mode = (args.visualMode ?? "").toLowerCase();
  if (mode.includes("reference_clip") || mode.includes("contextual_data_composite") || mode.includes("cdc")) {
    return "reference_clip";
  }
  if (mode.includes("broll") || mode.includes("b_roll")) {
    return "b_roll";
  }
  return "image";
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolvePlacementDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Boolean((import.meta as any)?.env?.DEV)) return true;
  } catch {
    // ignore
  }
  try {
    const runtime = window as unknown as Record<string, unknown>;
    return runtime.__forgeHammerDebugPlacements__ === true;
  } catch {
    return false;
  }
}

function toPlacementCandidateDebug(args: {
  transcriptSegments: HammerTranscriptSegment[];
  startIndex: number;
  endIndex: number;
  score: number;
  rawScore: number;
  windowTextSample: string | null;
}): PlacementCandidateDebug {
  const start = args.transcriptSegments[args.startIndex] ?? null;
  const end = args.transcriptSegments[args.endIndex] ?? null;
  return {
    start_index: args.startIndex,
    end_index: args.endIndex,
    score: Number(args.score.toFixed(3)),
    raw_score: Number(args.rawScore.toFixed(3)),
    start_sec: start?.start_sec ?? null,
    end_sec: end?.end_sec ?? null,
    start_segment_id: start?.segment_id ?? null,
    end_segment_id: end?.segment_id ?? null,
    window_text_sample: args.windowTextSample,
  };
}

function maybeTrackCandidateDebug(args: {
  debug: CandidateSearchDebug | null;
  transcriptSegments: HammerTranscriptSegment[];
  candidate: PlacementCandidate;
  windowText: string;
}): void {
  const debug = args.debug;
  if (!debug) return;

  const trimmed = args.windowText.trim();
  const sample = trimmed
    ? `${trimmed.slice(0, 120)}${trimmed.length > 120 ? "…" : ""}`
    : null;
  const record = toPlacementCandidateDebug({
    transcriptSegments: args.transcriptSegments,
    startIndex: args.candidate.startIndex,
    endIndex: args.candidate.endIndex,
    score: args.candidate.score,
    rawScore: args.candidate.rawScore,
    windowTextSample: sample,
  });

  const current = debug.top_candidates;
  if (current.length < PLACEMENT_DEBUG_TOP_CANDIDATES) {
    current.push(record);
  } else {
    let weakestIndex = 0;
    for (let index = 1; index < current.length; index += 1) {
      const row = current[index];
      const weak = current[weakestIndex];
      if (row.score < weak.score || (row.score === weak.score && row.raw_score < weak.raw_score)) {
        weakestIndex = index;
      }
    }
    const weakest = current[weakestIndex];
    if (record.score > weakest.score || (record.score === weakest.score && record.raw_score > weakest.raw_score)) {
      current[weakestIndex] = record;
    }
  }

  current.sort((left, right) => (right.score - left.score) || (right.raw_score - left.raw_score));
}

function logVisualPlacementDecisionDebug(args: {
  transcriptSegments: HammerTranscriptSegment[];
  entryId: string;
  assetId: string;
  assetPath: string | null;
  anchorText: string;
  matchedText: string;
  searchFloor: number;
  maxWindowSegments: number;
  deterministic: { chosen: PlacementCandidate | null; debug: CandidateSearchDebug | null };
  fuzzy: { chosen: PlacementCandidate | null; debug: CandidateSearchDebug | null };
  chosenCandidate: PlacementCandidate | null;
  confidence: number;
  thresholds: {
    match_min_score: number;
    match_strong_score: number;
    anchor_placed_confidence: number;
    anchor_uncertain_confidence: number;
  };
  downgradeReasons: string[];
  placementFlags: string[];
  timingSource: HammerVisualPlacementRecord["timing_source"];
  classification: "placed" | "uncertain" | "unresolved";
  disposition: "placed" | "placed_with_warning" | "uncertain" | "rejected";
  persistedStatus: "placed" | "uncertain";
}): void {
  if (!resolvePlacementDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.groupCollapsed?.(
    `[Hammer][VisualPlacementDecision] ${args.entryId} → ${args.disposition} (conf=${Number(args.confidence.toFixed(3))})`,
  );
  // eslint-disable-next-line no-console
  console.log({
    entry_id: args.entryId,
    asset_id: args.assetId,
    asset_path: args.assetPath,
    chosen_anchor: args.anchorText,
    chosen_matched_text: args.matchedText,
    search_floor_index: args.searchFloor,
    max_window_segments: args.maxWindowSegments,
    confidence: Number(args.confidence.toFixed(3)),
    threshold_required: args.thresholds,
    candidate_anchors_considered: {
      deterministic: {
        evaluated: args.deterministic.debug?.evaluated ?? null,
        matched: args.deterministic.debug?.matched ?? null,
        top_candidates: args.deterministic.debug?.top_candidates ?? null,
        chosen: args.deterministic.chosen
          ? toPlacementCandidateDebug({
            transcriptSegments: args.transcriptSegments,
            startIndex: args.deterministic.chosen.startIndex,
            endIndex: args.deterministic.chosen.endIndex,
            score: args.deterministic.chosen.score,
            rawScore: args.deterministic.chosen.rawScore,
            windowTextSample: null,
          })
          : null,
      },
      fuzzy: {
        evaluated: args.fuzzy.debug?.evaluated ?? null,
        matched: args.fuzzy.debug?.matched ?? null,
        top_candidates: args.fuzzy.debug?.top_candidates ?? null,
        chosen: args.fuzzy.chosen
          ? toPlacementCandidateDebug({
            transcriptSegments: args.transcriptSegments,
            startIndex: args.fuzzy.chosen.startIndex,
            endIndex: args.fuzzy.chosen.endIndex,
            score: args.fuzzy.chosen.score,
            rawScore: args.fuzzy.chosen.rawScore,
            windowTextSample: null,
          })
          : null,
      },
    },
    chosen_candidate: args.chosenCandidate
      ? {
        start_index: args.chosenCandidate.startIndex,
        end_index: args.chosenCandidate.endIndex,
        score: Number(args.chosenCandidate.score.toFixed(3)),
        raw_score: Number(args.chosenCandidate.rawScore.toFixed(3)),
      }
      : null,
    timing_source: args.timingSource,
    classification: args.classification,
    downgrade_reasons: args.downgradeReasons,
    flags: args.placementFlags,
    final_disposition: args.disposition,
    persisted_status: args.persistedStatus,
  });
  // eslint-disable-next-line no-console
  console.groupEnd?.();
}

function normalizeScriptAnchor(value: unknown): EpisodeImageMapScriptAnchorRecord | null {
  const row = readJsonObject(value);
  const sectionId = readString(row?.section_id);
  const paragraphId = readString(row?.paragraph_id);
  const paragraphOrder = readNumber(row?.paragraph_order);
  const sentenceStart = readNumber(row?.sentence_start);
  const sentenceEnd = readNumber(row?.sentence_end);
  const charStart = readNumber(row?.char_start);
  const charEnd = readNumber(row?.char_end);
  const spanText = readString(row?.span_text);
  if (
    !sectionId
    || !paragraphId
    || paragraphOrder == null
    || sentenceStart == null
    || sentenceEnd == null
    || charStart == null
    || charEnd == null
    || !spanText
  ) {
    return null;
  }

  return {
    section_id: sectionId,
    paragraph_id: paragraphId,
    paragraph_order: paragraphOrder,
    sentence_start: sentenceStart,
    sentence_end: sentenceEnd,
    char_start: charStart,
    char_end: charEnd,
    span_text: spanText,
    speaker_block_id: readString(row?.speaker_block_id),
  };
}

function normalizeImageMapAssetRef(value: unknown): EpisodeImageMapAssetRefRecord | null {
  const row = readJsonObject(value);
  const assetId = readString(row?.asset_id);
  if (!assetId) return null;
  return {
    asset_id: assetId,
    path: readString(row?.path),
    variant_label: readString(row?.variant_label),
    visual_mode: readString(row?.visual_mode),
    mime_type: readString(row?.mime_type),
  };
}

function normalizeImageMapEntry(value: unknown): EpisodeImageMapEntryRecord | null {
  const row = readJsonObject(value);
  const id = readString(row?.id);
  const anchor = readString(row?.anchor);
  const description = readString(row?.description);
  const visualIntent = readString(row?.visual_intent);
  const promptBasis = readString(row?.prompt_basis);
  const intent = readString(row?.intent);
  const sourceType = readString(row?.source_type);
  const beatOrder = readNumber(row?.beat_order);
  const paragraphBeatOrder = readNumber(row?.paragraph_beat_order);
  const status = readString(row?.status);
  const candidateAssets = Array.isArray(row?.candidate_assets)
    ? row.candidate_assets.map(normalizeImageMapAssetRef).filter((asset): asset is EpisodeImageMapAssetRefRecord => Boolean(asset))
    : [];
  if (
    !id
    || !anchor
    || !description
    || !visualIntent
    || !promptBasis
    || !intent
    || !sourceType
    || beatOrder == null
    || paragraphBeatOrder == null
    || !status
  ) {
    return null;
  }
  return {
    id,
    anchor,
    script_anchor: normalizeScriptAnchor(row?.script_anchor),
    description,
    visual_intent: visualIntent,
    prompt_basis: promptBasis,
    style_preset: null,
    intent,
    source_type: sourceType,
    beat_order: beatOrder,
    paragraph_beat_order: paragraphBeatOrder,
    candidate_assets: candidateAssets,
    selected_asset_id: readString(row?.selected_asset_id),
    status,
    placement_hint: readString(row?.placement_hint),
  };
}

function normalizeImageMap(payload: unknown): WorkpieceImageMapResponseData | null {
  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const imageMap = readJsonObject(data?.image_map);
  const workpieceId = readString(imageMap?.workpiece_id);
  const workspaceId = readString(imageMap?.workspace_id);
  const entries = Array.isArray(imageMap?.entries)
    ? imageMap.entries.map(normalizeImageMapEntry).filter((entry): entry is EpisodeImageMapEntryRecord => Boolean(entry))
    : null;
  if (!workpieceId || !workspaceId || !entries) {
    return null;
  }
  const asset = readJsonObject(data?.asset);
  return {
    image_map: {
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      entries,
      spoken_beats: Array.isArray(imageMap?.spoken_beats) ? imageMap.spoken_beats as EpisodeSpokenBeatRecord[] : [],
      metadata_updated_at: readString(imageMap?.metadata_updated_at),
    },
    asset: asset
      ? {
        id: readString(asset.id) ?? "",
        asset_kind: "image_map_json",
        status: "ready",
        path: "assets/image-map/image-map.v1.json",
        storage_bucket: readString(asset.storage_bucket) ?? "",
        storage_key: readString(asset.storage_key) ?? "",
        metadata_json: {
          schema: "forge.image-map.v1",
          entry_count: readNumber(readJsonObject(asset.metadata_json)?.entry_count) ?? 0,
        },
        created_at: readString(asset.created_at) ?? "",
        updated_at: readString(asset.updated_at) ?? "",
        supersedes_asset_id: readString(asset.supersedes_asset_id),
      }
      : null,
  };
}

function normalizeVisualPackage(payload: unknown): WorkpieceVisualPackageResponseData | null {
  const root = readJsonObject(payload);
  const data = readJsonObject(root?.data);
  const workspaceId = readString(data?.workspace_id);
  const workpieceId = readString(data?.workpiece_id);
  const visuals = Array.isArray(data?.visuals) ? data.visuals : null;
  if (!workspaceId || !workpieceId || !visuals) {
    return null;
  }

  const normalizedVisuals = visuals
    .map((value) => {
      const row = readJsonObject(value);
      const entryId = readString(row?.entry_id);
      const beatOrder = readNumber(row?.beat_order);
      const paragraphBeatOrder = readNumber(row?.paragraph_beat_order);
      const status = readString(row?.status);
      if (!entryId || beatOrder == null || paragraphBeatOrder == null || !status) {
        return null;
      }

      const selectedAssetRow = readJsonObject(row?.selected_asset);
      const assetClass = normalizeVisualAssetClass(row?.asset_class);
      const visualMode = readString(row?.visual_mode);
      return {
        asset_class: assetClass
          ?? (resolveFinalMediaKind({ assetClass: null, visualMode }) === "b_roll"
            ? "broll"
            : resolveFinalMediaKind({ assetClass: null, visualMode }) === "reference_clip"
              ? "reference_clip"
              : "image"),
        entry_id: entryId,
        beat_order: beatOrder,
        paragraph_beat_order: paragraphBeatOrder,
        status,
        script_anchor: normalizeScriptAnchor(row?.script_anchor),
        visual_mode: visualMode,
        selected_asset_id: readString(row?.selected_asset_id),
        selected_asset: selectedAssetRow
          ? {
            asset_id: readString(selectedAssetRow.asset_id) ?? "",
            path: readString(selectedAssetRow.path) ?? "",
            storage_bucket: readString(selectedAssetRow.storage_bucket) ?? "",
            storage_key: readString(selectedAssetRow.storage_key) ?? "",
            mime_type: readString(selectedAssetRow.mime_type) ?? "",
            bytes: readNumber(selectedAssetRow.bytes) ?? 0,
            created_at: readString(selectedAssetRow.created_at) ?? "",
            updated_at: readString(selectedAssetRow.updated_at) ?? "",
            variant_label: readString(selectedAssetRow.variant_label),
            visual_mode: readString(selectedAssetRow.visual_mode),
          }
          : null,
      };
    })
    .filter((value): value is WorkpieceVisualPackageResponseData["visuals"][number] => Boolean(value));

  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    script_path: readString(data?.script_path),
    script_updated_at: readString(data?.script_updated_at),
    image_map_updated_at: readString(data?.image_map_updated_at),
    image_map_asset_updated_at: readString(data?.image_map_asset_updated_at),
    visuals: normalizedVisuals,
  };
}

function buildVisualPackageFromMediaMap(
  workpieceId: string,
  mediaMap: EpisodeMediaMapArtifact,
): WorkpieceVisualPackageResponseData | null {
  const visuals: WorkpieceVisualPackageResponseData["visuals"] = mediaMap.entries.map((entry, index) => {
    const assetClass = entry.final_media_kind === "b_roll"
      ? "broll"
      : entry.final_media_kind === "reference_clip" || entry.final_media_kind === "contextual_data_composite"
        ? "reference_clip"
        : "image";
    const hasAsset = Boolean(entry.source.asset_id) && (entry.source.status === "selected" || entry.source.status === "attached");
    return {
      asset_class: assetClass,
      entry_id: entry.id,
      beat_order: index + 1,
      paragraph_beat_order: 1,
      status: hasAsset ? "selected" : "mapped",
      script_anchor: {
        section_id: "emm",
        paragraph_id: entry.id,
        paragraph_order: index + 1,
        sentence_start: 1,
        sentence_end: 1,
        char_start: 0,
        char_end: entry.anchor.target.length,
        span_text: entry.anchor.target,
        speaker_block_id: entry.anchor.mode === "speaker_turn" ? entry.anchor.target : null,
      },
      visual_mode: entry.final_media_kind === "contextual_data_composite" ? "reference_clip" : entry.final_media_kind,
      selected_asset_id: hasAsset ? entry.source.asset_id : null,
      selected_asset: hasAsset
        ? {
          asset_id: entry.source.asset_id ?? "",
          path: "",
          storage_bucket: "forge-workpieces",
          storage_key: "",
          mime_type: "video/mp4",
          bytes: 0,
          created_at: mediaMap.generated_at,
          updated_at: mediaMap.generated_at,
          variant_label: null,
          visual_mode: entry.final_media_kind,
        }
        : null,
    };
  });

  return {
    workspace_id: "",
    workpiece_id: workpieceId,
    script_path: null,
    script_updated_at: mediaMap.script_version_id ? `script_version:${mediaMap.script_version_id}` : null,
    image_map_updated_at: mediaMap.generated_at,
    image_map_asset_updated_at: mediaMap.generated_at,
    visuals,
  };
}

function buildFallbackSelectedAsset(
  asset: EpisodeImageMapAssetRefRecord,
): WorkpieceVisualPackageSelectedAsset | null {
  const path = readString(asset.path);
  if (!path) return null;
  return {
    asset_id: asset.asset_id,
    path,
    storage_bucket: "forge-workpieces",
    storage_key: "",
    mime_type: readString(asset.mime_type) ?? "image/png",
    bytes: 0,
    created_at: "",
    updated_at: "",
    variant_label: readString(asset.variant_label),
    visual_mode: readString(asset.visual_mode),
  };
}

function mergeVisualPackageWithImageMap(
  visualPackage: WorkpieceVisualPackageResponseData,
  imageMap: WorkpieceImageMapResponseData | null,
): WorkpieceVisualPackageResponseData {
  if (!imageMap) {
    return visualPackage;
  }

  const entryById = new Map(imageMap.image_map.entries.map((entry) => [entry.id, entry] as const));
  const mergedVisuals = visualPackage.visuals.map((visual) => {
    if (visual.selected_asset) {
      return visual;
    }
    const entry = entryById.get(visual.entry_id);
    if (!entry) {
      return visual;
    }

    const preferredCandidate = entry.selected_asset_id
      ? (entry.candidate_assets.find((asset) => asset.asset_id === entry.selected_asset_id) ?? null)
      : null;
    const fallbackCandidate = preferredCandidate ?? entry.candidate_assets[0] ?? null;
    const fallbackSelectedAsset = fallbackCandidate ? buildFallbackSelectedAsset(fallbackCandidate) : null;
    if (!fallbackSelectedAsset) {
      return visual;
    }

    return {
      ...visual,
      visual_mode: visual.visual_mode ?? fallbackSelectedAsset.visual_mode ?? null,
      selected_asset_id: visual.selected_asset_id ?? fallbackSelectedAsset.asset_id,
      selected_asset: fallbackSelectedAsset,
    };
  });

  const visualIds = new Set(mergedVisuals.map((visual) => visual.entry_id));
  for (const entry of imageMap.image_map.entries) {
    if (visualIds.has(entry.id)) continue;
    const preferredCandidate = entry.selected_asset_id
      ? (entry.candidate_assets.find((asset) => asset.asset_id === entry.selected_asset_id) ?? null)
      : null;
    const fallbackCandidate = preferredCandidate ?? entry.candidate_assets[0] ?? null;
    const fallbackSelectedAsset = fallbackCandidate ? buildFallbackSelectedAsset(fallbackCandidate) : null;
    if (!fallbackSelectedAsset) continue;
    mergedVisuals.push({
      asset_class: resolveFinalMediaKind({
        assetClass: null,
        visualMode: fallbackSelectedAsset.visual_mode ?? null,
      }) === "b_roll"
        ? "broll"
        : resolveFinalMediaKind({
          assetClass: null,
          visualMode: fallbackSelectedAsset.visual_mode ?? null,
        }) === "reference_clip"
          ? "reference_clip"
          : "image",
      entry_id: entry.id,
      beat_order: entry.beat_order,
      paragraph_beat_order: entry.paragraph_beat_order,
      status: entry.status,
      script_anchor: entry.script_anchor,
      visual_mode: fallbackSelectedAsset.visual_mode ?? null,
      selected_asset_id: entry.selected_asset_id ?? fallbackSelectedAsset.asset_id,
      selected_asset: fallbackSelectedAsset,
    });
  }

  return {
    ...visualPackage,
    image_map_updated_at: visualPackage.image_map_updated_at ?? imageMap.image_map.metadata_updated_at,
    image_map_asset_updated_at: visualPackage.image_map_asset_updated_at ?? imageMap.asset?.updated_at ?? null,
    visuals: mergedVisuals,
  };
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function readErrorMessage(payload: unknown, fallback: string): string {
  const row = readJsonObject(payload);
  const error = readJsonObject(row?.error);
  return readString(error?.message)
    ?? readString(row?.message)
    ?? readString(readJsonObject(row?.data)?.message)
    ?? fallback;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeForMatch(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function buildTokenCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function countTokenOverlap(left: string[], right: string[]): number {
  const leftCounts = buildTokenCounts(left);
  const rightCounts = buildTokenCounts(right);
  let overlap = 0;
  for (const [token, leftCount] of leftCounts.entries()) {
    const rightCount = rightCounts.get(token) ?? 0;
    overlap += Math.min(leftCount, rightCount);
  }
  return overlap;
}

function computeTextMatchScore(anchorText: string, candidateText: string): number {
  const normalizedAnchor = normalizeForMatch(anchorText);
  const normalizedCandidate = normalizeForMatch(candidateText);
  if (!normalizedAnchor || !normalizedCandidate) return 0;

  if (normalizedAnchor === normalizedCandidate) {
    return 1;
  }

  const anchorTokens = tokenize(anchorText);
  const candidateTokens = tokenize(candidateText);
  if (anchorTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const overlap = countTokenOverlap(anchorTokens, candidateTokens);
  if (overlap === 0) {
    return 0;
  }

  const dice = (2 * overlap) / (anchorTokens.length + candidateTokens.length);
  const anchorCoverage = overlap / anchorTokens.length;
  const containsBoost = normalizedCandidate.includes(normalizedAnchor) || normalizedAnchor.includes(normalizedCandidate)
    ? 0.18
    : 0;

  return Math.min(1, Math.max(dice, (dice * 0.7) + (anchorCoverage * 0.3) + containsBoost));
}

type AnchorMatchType = "exact" | "fuzzy";
type AnchorMatchClassification = "placed" | "uncertain" | "unresolved";

function classifyAnchorMatch(args: {
  anchorText: string;
  matchedText: string;
  deterministicCandidate: PlacementCandidate | null;
  candidate: PlacementCandidate | null;
}): {
  matchType: AnchorMatchType;
  confidence: number;
  classification: AnchorMatchClassification;
} {
  const normalizedAnchor = normalizeForMatch(args.anchorText);
  const normalizedMatched = normalizeForMatch(args.matchedText);
  const exact = Boolean(normalizedAnchor && normalizedMatched && normalizedAnchor === normalizedMatched);

  const confidence = args.candidate
    ? args.candidate.rawScore
    : computeTextMatchScore(args.anchorText, args.matchedText);

  if (exact) {
    return { matchType: "exact", confidence: 1, classification: "placed" };
  }

  const classification: AnchorMatchClassification = confidence >= ANCHOR_PLACED_CONFIDENCE
    ? "placed"
    : confidence >= ANCHOR_UNCERTAIN_CONFIDENCE
      ? "uncertain"
      : "unresolved";

  return {
    matchType: args.deterministicCandidate ? "fuzzy" : "fuzzy",
    confidence,
    classification,
  };
}

function buildVisualPlacementSourceRefs(
  transcriptSourceId: string,
  visualPackage: WorkpieceVisualPackageResponseData,
): string[] {
  return [
    `transcript:${transcriptSourceId}`,
    `script:${visualPackage.script_updated_at ?? "none"}`,
    `image-map:${visualPackage.image_map_updated_at ?? "none"}`,
    `image-map-asset:${visualPackage.image_map_asset_updated_at ?? "none"}`,
    ...[...visualPackage.visuals]
      .sort((left, right) => {
        if (left.beat_order !== right.beat_order) {
          return left.beat_order - right.beat_order;
        }
        return left.entry_id.localeCompare(right.entry_id);
      })
      .map((visual) => `visual:${visual.entry_id}:${visual.selected_asset_id ?? "none"}`),
  ];
}

function sameSourceRefs(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function findBestPlacementCandidate(
  anchorText: string,
  transcriptSegments: HammerTranscriptSegment[],
  floorIndex: number,
  maxWindowSegments: number,
  debug: CandidateSearchDebug | null,
): PlacementCandidate | null {
  let best: PlacementCandidate | null = null;

  for (let startIndex = 0; startIndex < transcriptSegments.length; startIndex += 1) {
    for (
      let endIndex = startIndex;
      endIndex < Math.min(transcriptSegments.length, startIndex + maxWindowSegments);
      endIndex += 1
    ) {
      const windowText = transcriptSegments
        .slice(startIndex, endIndex + 1)
        .map((segment) => segment.text)
        .join(" ");
      if (debug) debug.evaluated += 1;
      const rawScore = computeTextMatchScore(anchorText, windowText);
      if (rawScore <= 0) continue;
      if (debug) debug.matched += 1;

      const orderPenalty = startIndex < floorIndex
        ? Math.min(0.28, (floorIndex - startIndex) * ORDER_PENALTY_PER_SEGMENT)
        : 0;
      const score = Math.max(0, rawScore - orderPenalty);
      const candidate: PlacementCandidate = {
        startIndex,
        endIndex,
        score,
        rawScore,
      };
      maybeTrackCandidateDebug({
        debug,
        transcriptSegments,
        candidate,
        windowText,
      });

      if (
        !best
        || candidate.score > best.score
        || (candidate.score === best.score && candidate.rawScore > best.rawScore)
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

function resolveMaxWindowSegments(anchorText: string): number {
  const tokenCount = tokenize(anchorText).length;
  if (tokenCount <= 0) return MATCH_WINDOW_MIN_SEGMENTS;
  const expandedWindow = Math.ceil(tokenCount / 3);
  return Math.min(
    MATCH_WINDOW_MAX_SEGMENTS,
    Math.max(MATCH_WINDOW_MIN_SEGMENTS, expandedWindow),
  );
}

function findDeterministicPlacementCandidate(
  anchorText: string,
  transcriptSegments: HammerTranscriptSegment[],
  floorIndex: number,
  maxWindowSegments: number,
  debug: CandidateSearchDebug | null,
): PlacementCandidate | null {
  const normalizedAnchor = normalizeForMatch(anchorText);
  if (!normalizedAnchor) return null;

  let best: PlacementCandidate | null = null;
  for (let startIndex = Math.max(0, floorIndex); startIndex < transcriptSegments.length; startIndex += 1) {
    for (
      let endIndex = startIndex;
      endIndex < Math.min(transcriptSegments.length, startIndex + maxWindowSegments);
      endIndex += 1
    ) {
      const windowText = transcriptSegments
        .slice(startIndex, endIndex + 1)
        .map((segment) => segment.text)
        .join(" ");
      if (debug) debug.evaluated += 1;
      const normalizedWindow = normalizeForMatch(windowText);
      if (!normalizedWindow || !normalizedWindow.includes(normalizedAnchor)) continue;
      if (debug) debug.matched += 1;

      const exact = normalizedWindow === normalizedAnchor;
      const rawScore = exact ? 1 : 0.98;
      const candidate: PlacementCandidate = {
        startIndex,
        endIndex,
        score: rawScore,
        rawScore,
      };
      maybeTrackCandidateDebug({
        debug,
        transcriptSegments,
        candidate,
        windowText,
      });

      if (!best) {
        best = candidate;
        continue;
      }

      const bestSpan = best.endIndex - best.startIndex;
      const candidateSpan = endIndex - startIndex;
      if (candidate.rawScore > best.rawScore) {
        best = candidate;
      } else if (candidate.rawScore === best.rawScore && candidateSpan < bestSpan) {
        best = candidate;
      } else if (
        candidate.rawScore === best.rawScore
        && candidateSpan === bestSpan
        && candidate.startIndex < best.startIndex
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

function uniqueFlags(flags: string[]): string[] {
  return [...new Set(flags.filter(Boolean))];
}

export function buildUnavailableHammerVisualPlacements(
  transcriptSourceId: string,
  reason: string,
): HammerPersistedVisualPlacements {
  return {
    schema_version: 1,
    status: "not_started",
    source_refs: [
      `transcript:${transcriptSourceId}`,
      `visual-package:${reason}`,
    ],
    uncertainty_flags: [reason],
    placements: [],
  };
}

export function clonePlacementRecord(record: HammerVisualPlacementRecord): HammerVisualPlacementRecord {
  return {
    ...record,
    matched_segment_ids: [...record.matched_segment_ids],
    uncertainty_flags: [...record.uncertainty_flags],
  };
}

export async function loadHammerWorkpieceVisualPackage(
  workpieceId: string,
  workspaceId: string,
): Promise<VisualPackageResult> {
  const preflight = await requestHammerVisualAssistPreflight({
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
  });
  if (!preflight.ok) {
    return {
      ok: false,
      status: preflight.status,
      error: preflight.error,
    };
  }

  const [visualResponse, imageMapResponse] = await Promise.all([
    tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/visual-package`,
      { method: "GET" },
    ),
    tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/image-map`,
      { method: "GET" },
    ),
  ]);
  const [visualPayload, imageMapPayload] = await Promise.all([
    readJsonBody(visualResponse),
    readJsonBody(imageMapResponse),
  ]);

  if (!visualResponse.ok) {
    const mediaMapResponse = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(EPISODE_MEDIA_MAP_PATH)}`,
      { method: "GET" },
    );
    const mediaMapPayload = await readJsonBody(mediaMapResponse);
    if (mediaMapResponse.ok) {
      const mediaMap = normalizeMediaMapArtifact(mediaMapPayload);
      if (
        mediaMap
        && mediaMap.entries.length > 0
        && mediaMap.status !== "draft"
        && mediaMap.status !== "review"
      ) {
        const mapped = buildVisualPackageFromMediaMap(workpieceId, mediaMap);
        if (mapped) {
          return {
            ok: true,
            status: mediaMapResponse.status,
            data: mapped,
          };
        }
      }
    }
    return {
      ok: false,
      status: visualResponse.status,
      error: readErrorMessage(visualPayload, "Failed to load Hammer visual package."),
    };
  }

  const visualPackage = normalizeVisualPackage(visualPayload);
  if (!visualPackage) {
    return {
      ok: false,
      status: visualResponse.status,
      error: "Hammer visual package response was invalid.",
    };
  }

  const imageMap = imageMapResponse.ok ? normalizeImageMap(imageMapPayload) : null;
  const mergedVisualPackage = mergeVisualPackageWithImageMap(visualPackage, imageMap);
  if (mergedVisualPackage.visuals.length > 0) {
    return {
      ok: true,
      status: visualResponse.status,
      data: mergedVisualPackage,
    };
  }

  const mediaMapResponse = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(EPISODE_MEDIA_MAP_PATH)}`,
    { method: "GET" },
  );
  const mediaMapPayload = await readJsonBody(mediaMapResponse);
  if (mediaMapResponse.ok) {
    const mediaMap = normalizeMediaMapArtifact(mediaMapPayload);
    if (
      mediaMap
      && mediaMap.entries.length > 0
      && mediaMap.status !== "draft"
      && mediaMap.status !== "review"
    ) {
      const mapped = buildVisualPackageFromMediaMap(workpieceId, mediaMap);
      if (mapped) {
        return {
          ok: true,
          status: mediaMapResponse.status,
          data: mapped,
        };
      }
    }
  }

  return {
    ok: true,
    status: visualResponse.status,
    data: mergedVisualPackage,
  };
}

export function isReusableHammerVisualPlacements(
  existing: HammerPersistedVisualPlacements | null | undefined,
  transcriptSourceId: string,
  visualPackage: WorkpieceVisualPackageResponseData,
): boolean {
  if (!existing || existing.schema_version !== 1) {
    return false;
  }
  if (!Array.isArray(existing.placements) || !Array.isArray(existing.source_refs)) {
    return false;
  }
  return sameSourceRefs(
    existing.source_refs,
    buildVisualPlacementSourceRefs(transcriptSourceId, visualPackage),
  );
}

export function cloneVisualPlacements(
  placements: HammerPersistedVisualPlacements | null | undefined,
): HammerPersistedVisualPlacements | null {
  return cloneVisualPlacementsContract(placements) as HammerPersistedVisualPlacements | null;
}

export function normalizeHammerVisualPlacementsState(
  value: unknown,
): HammerPersistedVisualPlacements | null {
  return normalizeHammerVisualPlacements(value) as HammerPersistedVisualPlacements | null;
}

export function deriveHammerVisualPlacements(args: {
  transcriptSourceId: string;
  transcriptSegments: HammerTranscriptSegment[];
  visualPackage: WorkpieceVisualPackageResponseData;
}): HammerPersistedVisualPlacements {
  const { transcriptSegments, transcriptSourceId, visualPackage } = args;
  if (transcriptSegments.length === 0) {
    return buildUnavailableHammerVisualPlacements(transcriptSourceId, "transcript_unavailable");
  }

  const visualsWithAssets = visualPackage.visuals
    .filter((visual) => visual.selected_asset)
    .sort((left, right) => {
      if (left.beat_order !== right.beat_order) {
        return left.beat_order - right.beat_order;
      }
      if (left.paragraph_beat_order !== right.paragraph_beat_order) {
        return left.paragraph_beat_order - right.paragraph_beat_order;
      }
      return left.entry_id.localeCompare(right.entry_id);
    });

  if (visualsWithAssets.length === 0) {
    return {
      schema_version: 1,
      status: "not_started",
      source_refs: buildVisualPlacementSourceRefs(transcriptSourceId, visualPackage),
      uncertainty_flags: ["no_selected_visuals"],
      placements: [],
    };
  }

  const placements: HammerVisualPlacementRecord[] = [];
  const globalFlags: string[] = [];
  let searchFloor = 0;
  const transcriptDurationSec = transcriptSegments.at(-1)?.end_sec ?? 0;

  for (const visual of visualsWithAssets) {
    const selectedAsset = visual.selected_asset;
    if (!selectedAsset) continue;

    const anchorText = readString(visual.script_anchor?.span_text);
    if (!anchorText) {
      globalFlags.push(`missing_script_anchor:${visual.entry_id}`);
      continue;
    }

    const maxWindowSegments = resolveMaxWindowSegments(anchorText);
    const debugEnabled = resolvePlacementDebugEnabled();
    const deterministicDebug: CandidateSearchDebug | null = debugEnabled ? {
      evaluated: 0,
      matched: 0,
      top_candidates: [],
    } : null;
    const fuzzyDebug: CandidateSearchDebug | null = debugEnabled ? {
      evaluated: 0,
      matched: 0,
      top_candidates: [],
    } : null;
    const deterministicCandidate = findDeterministicPlacementCandidate(
      anchorText,
      transcriptSegments,
      searchFloor,
      maxWindowSegments,
      deterministicDebug,
    );
    const fuzzyCandidate = deterministicCandidate
      ? null
      : findBestPlacementCandidate(
        anchorText,
        transcriptSegments,
        searchFloor,
        maxWindowSegments,
        fuzzyDebug,
      );
    const candidate = deterministicCandidate ?? fuzzyCandidate;
    const placementFlags: string[] = [];
    let startIndex = searchFloor;
    let endIndex = Math.min(transcriptSegments.length - 1, searchFloor);
    let timingSource: HammerVisualPlacementRecord["timing_source"] = "ordered_fallback";

    if (candidate && candidate.rawScore >= MATCH_MIN_SCORE) {
      startIndex = candidate.startIndex;
      endIndex = candidate.endIndex;
      timingSource = "transcript_match";
      if (!deterministicCandidate && candidate.rawScore < MATCH_STRONG_SCORE) {
        placementFlags.push("low_confidence_match");
      }
      if (candidate.startIndex < searchFloor) {
        placementFlags.push("order_regression_penalty");
      }
    } else {
      placementFlags.push("ordered_fallback");
      globalFlags.push(`match_missing:${visual.entry_id}`);
      startIndex = Math.min(searchFloor, transcriptSegments.length - 1);
      endIndex = startIndex;
    }

    const matchedSegments = transcriptSegments.slice(startIndex, endIndex + 1);
    const matchedText = matchedSegments.map((segment) => segment.text).join(" ");
    const anchorMatch = classifyAnchorMatch({
      anchorText,
      matchedText,
      deterministicCandidate,
      candidate,
    });
    const startSec = matchedSegments[0]?.start_sec ?? 0;
    const endSec = matchedSegments.at(-1)?.end_sec ?? startSec;
    searchFloor = Math.min(transcriptSegments.length - 1, endIndex + 1);

    const promotedCandidate = visual.status !== "selected";
    if (anchorMatch.classification === "unresolved") {
      placementFlags.push("anchor_match_unresolved");
    } else if (anchorMatch.classification === "uncertain") {
      placementFlags.push("anchor_match_uncertain");
    }

    const downgradeReasons: string[] = [];
    if (candidate && candidate.rawScore < MATCH_MIN_SCORE) {
      downgradeReasons.push(`candidate_below_min_score:${candidate.rawScore.toFixed(3)}<${MATCH_MIN_SCORE}`);
    }
    if (anchorMatch.classification !== "placed") {
      downgradeReasons.push(`confidence_below_placed_threshold:${anchorMatch.confidence.toFixed(3)}<${ANCHOR_PLACED_CONFIDENCE}`);
    }
    if (placementFlags.includes("low_confidence_match")) {
      downgradeReasons.push(`below_strong_score:${(candidate?.rawScore ?? 0).toFixed(3)}<${MATCH_STRONG_SCORE}`);
    }
    if (placementFlags.includes("order_regression_penalty")) {
      downgradeReasons.push("order_regression_penalty");
    }
    if (placementFlags.includes("ordered_fallback")) {
      downgradeReasons.push("ordered_fallback_used");
    }
    if (promotedCandidate) {
      downgradeReasons.push("image_map_candidate_promoted");
    }
    if (placementFlags.includes("anchor_match_unresolved")) {
      downgradeReasons.push(`anchor_match_unresolved:<${ANCHOR_UNCERTAIN_CONFIDENCE}`);
    }
    if (placementFlags.includes("anchor_match_uncertain")) {
      downgradeReasons.push(`anchor_match_uncertain:>=${ANCHOR_UNCERTAIN_CONFIDENCE} and <${ANCHOR_PLACED_CONFIDENCE}`);
    }

    const hasWarnings = (
      placementFlags.includes("low_confidence_match")
      || placementFlags.includes("order_regression_penalty")
      || promotedCandidate
    );
    const disposition: "placed" | "placed_with_warning" | "uncertain" | "rejected" = (
      anchorMatch.classification === "placed"
        ? (hasWarnings ? "placed_with_warning" : "placed")
        : anchorMatch.classification === "uncertain"
          ? "uncertain"
          : "rejected"
    );
    const persistedStatus: "placed" | "uncertain" = anchorMatch.classification === "placed" ? "placed" : "uncertain";

    logVisualPlacementDecisionDebug({
      transcriptSegments,
      entryId: visual.entry_id,
      assetId: selectedAsset.asset_id,
      assetPath: selectedAsset.path ?? null,
      anchorText,
      matchedText,
      searchFloor,
      maxWindowSegments,
      deterministic: { chosen: deterministicCandidate, debug: deterministicDebug },
      fuzzy: { chosen: fuzzyCandidate, debug: fuzzyDebug },
      chosenCandidate: candidate,
      confidence: anchorMatch.confidence,
      thresholds: {
        match_min_score: MATCH_MIN_SCORE,
        match_strong_score: MATCH_STRONG_SCORE,
        anchor_placed_confidence: ANCHOR_PLACED_CONFIDENCE,
        anchor_uncertain_confidence: ANCHOR_UNCERTAIN_CONFIDENCE,
      },
      downgradeReasons: uniqueFlags(downgradeReasons),
      placementFlags: uniqueFlags(placementFlags),
      timingSource,
      classification: anchorMatch.classification,
      disposition,
      persistedStatus,
    });

    placements.push({
      placement_id: `placement_${visual.entry_id}`,
      entry_id: visual.entry_id,
      anchor_segment_id: matchedSegments[0]?.segment_id ?? transcriptSegments[0]?.segment_id ?? visual.entry_id,
      matched_segment_ids: matchedSegments.map((segment) => segment.segment_id),
      anchor_text: anchorText,
      asset_ref: selectedAsset.asset_id,
      asset_id: selectedAsset.asset_id,
      asset_path: selectedAsset.path,
      storage_key: selectedAsset.storage_key || selectedAsset.path,
      label: selectedAsset.variant_label ?? visual.visual_mode ?? visual.entry_id,
      visual_mode: visual.asset_class === "broll"
        ? "b_roll"
        : visual.asset_class === "reference_clip"
          ? "reference_clip"
          : visual.visual_mode
            ?? selectedAsset.visual_mode
            ?? "image",
      start_sec: startSec,
      end_sec: endSec,
      confidence: Number(anchorMatch.confidence.toFixed(3)),
      timing_source: timingSource,
      status: persistedStatus,
      ingest_state: visual.status === "selected" ? "approved" : "suggested",
      uncertainty_flags: promotedCandidate
        ? [...placementFlags, "image_map_candidate_promoted"]
        : placementFlags,
    });
  }

  const finalizedPlacements = placements.map((placement, index) => {
    const nextStartSec = placements[index + 1]?.start_sec ?? null;
    const naturalEnd = Math.max(
      placement.end_sec,
      Math.min(transcriptDurationSec, placement.start_sec + MIN_VISUAL_HOLD_SEC),
    );
    const boundedEnd = Math.min(
      naturalEnd,
      Math.min(transcriptDurationSec, placement.start_sec + MAX_VISUAL_HOLD_SEC),
    );
    let resolvedEnd = boundedEnd;
    if (nextStartSec != null && nextStartSec > placement.start_sec) {
      resolvedEnd = Math.min(resolvedEnd, nextStartSec);
    }
    if (resolvedEnd <= placement.start_sec) {
      resolvedEnd = Math.min(transcriptDurationSec, placement.start_sec + MIN_VISUAL_SLIVER_SEC);
    }
    return clonePlacementRecord({
      ...placement,
      end_sec: resolvedEnd,
    });
  });

  return {
    schema_version: 1,
    status: finalizedPlacements.length > 0 ? "prepared" : "not_started",
    source_refs: buildVisualPlacementSourceRefs(transcriptSourceId, visualPackage),
    uncertainty_flags: uniqueFlags(globalFlags),
    placements: finalizedPlacements,
  };
}
