import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  EpisodeImageMapAssetRefRecord,
  EpisodeImageMapEntryRecord,
  EpisodeImageMapScriptAnchorRecord,
  WorkpieceImageMapResponseData,
  WorkpieceVisualPackageResponseData,
  WorkpieceVisualPackageSelectedAsset,
} from "../../../../packages/tongs/src/workpiece-commit-api";
import type {
  HammerPersistedVisualPlacements,
  HammerVisualPlacementRecord,
} from "../persistence/hammerPersistenceContract";
import { tongsFetch } from "./tongsFetch";

const MATCH_WINDOW_MAX_SEGMENTS = 3;
const MATCH_MIN_SCORE = 0.18;
const MATCH_STRONG_SCORE = 0.72;
const ORDER_PENALTY_PER_SEGMENT = 0.04;
const MIN_VISUAL_HOLD_SEC = 1.6;
const MAX_VISUAL_HOLD_SEC = 6;
const MIN_VISUAL_SLIVER_SEC = 0.25;

type VisualPackageResult =
  | { ok: true; status: number; data: WorkpieceVisualPackageResponseData }
  | { ok: false; status: number; error: string };

type PlacementCandidate = {
  startIndex: number;
  endIndex: number;
  score: number;
  rawScore: number;
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

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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
      return {
        entry_id: entryId,
        beat_order: beatOrder,
        paragraph_beat_order: paragraphBeatOrder,
        status,
        script_anchor: normalizeScriptAnchor(row?.script_anchor),
        visual_mode: readString(row?.visual_mode),
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
): PlacementCandidate | null {
  let best: PlacementCandidate | null = null;

  for (let startIndex = 0; startIndex < transcriptSegments.length; startIndex += 1) {
    for (
      let endIndex = startIndex;
      endIndex < Math.min(transcriptSegments.length, startIndex + MATCH_WINDOW_MAX_SEGMENTS);
      endIndex += 1
    ) {
      const windowText = transcriptSegments
        .slice(startIndex, endIndex + 1)
        .map((segment) => segment.text)
        .join(" ");
      const rawScore = computeTextMatchScore(anchorText, windowText);
      if (rawScore <= 0) continue;

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

function clonePlacementRecord(record: HammerVisualPlacementRecord): HammerVisualPlacementRecord {
  return {
    ...record,
    matched_segment_ids: [...record.matched_segment_ids],
    uncertainty_flags: [...record.uncertainty_flags],
  };
}

export async function loadHammerWorkpieceVisualPackage(
  workpieceId: string,
): Promise<VisualPackageResult> {
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
  if (!placements) return null;
  return {
    ...placements,
    source_refs: [...placements.source_refs],
    uncertainty_flags: [...placements.uncertainty_flags],
    placements: placements.placements.map((record) => clonePlacementRecord(record)),
  };
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

    const candidate = findBestPlacementCandidate(anchorText, transcriptSegments, searchFloor);
    const placementFlags: string[] = [];
    let startIndex = searchFloor;
    let endIndex = Math.min(transcriptSegments.length - 1, searchFloor);
    let confidence: number | null = null;
    let timingSource: HammerVisualPlacementRecord["timing_source"] = "ordered_fallback";

    if (candidate && candidate.rawScore >= MATCH_MIN_SCORE) {
      startIndex = candidate.startIndex;
      endIndex = candidate.endIndex;
      confidence = Number(candidate.rawScore.toFixed(3));
      timingSource = "transcript_match";
      if (candidate.rawScore < MATCH_STRONG_SCORE) {
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
    const startSec = matchedSegments[0]?.start_sec ?? 0;
    const endSec = matchedSegments.at(-1)?.end_sec ?? startSec;
    searchFloor = Math.min(transcriptSegments.length - 1, endIndex + 1);

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
      visual_mode: visual.visual_mode ?? selectedAsset.visual_mode,
      start_sec: startSec,
      end_sec: endSec,
      confidence,
      timing_source: timingSource,
      status: placementFlags.length > 0 || visual.status !== "selected" ? "uncertain" : "placed",
      uncertainty_flags: visual.status !== "selected"
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
