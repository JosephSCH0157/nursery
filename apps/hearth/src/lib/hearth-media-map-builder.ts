import {
  buildBulletBeatAnchorLabel,
  type EpisodeImageMapEntry,
  type EpisodeMediaMap,
  type EpisodeMediaMapEntry,
  type EpisodePackageV2,
  type EpisodeThumbnailVersion,
} from "./episode-package-v2";
import type { MediaMapGenerationScope } from "./hearth-media-map-conversation";

const MAX_MEDIA_MAP_VISUALS = 18;
export const HEARTH_DEFAULT_NARRATION_WPM = 150;
const MOTION_OR_PROCESS_SIGNAL_RE = /\b(motion|move|moving|camera|pan|zoom|tracking|walk|run|drive|flow|process|workflow|sequence|timeline|action|transition)\b/i;
const STATIC_OR_EXPLAINER_SIGNAL_RE = /\b(static|still|diagram|explainer|explain|emphasis|concept|graphic|chart|map|label|text)\b/i;
const HIGH_VALUE_MOTION_SIGNAL_RE = /\b(harvest|harvesting|pick(?:ing)?|packing(?:\s+line)?|machinery|conveyor|drive|driving|hurricane|storm|wind|flood|handling|processing|operation|moving|transition)\b/i;
const STATIC_SUBJECT_SIGNAL_RE = /\b(historic|historical|archive|archival|grove|roadside stand|packing house|tower|map|document|newspaper|clipping|label|sign|advertisement|symptom|disease|greening|portrait|facility|acreage|timeline|development)\b/i;
const SUBJECT_STOP_WORDS = new Set(["about", "after", "again", "against", "before", "being", "between", "could", "every", "first", "from", "have", "into", "more", "other", "over", "that", "their", "there", "these", "this", "through", "under", "visual", "when", "where", "which", "with", "would"]);

function hasReferenceClipEvidenceSource(entry: { source?: string | null }): boolean {
  return typeof entry.source === "string" && entry.source.trim().length > 0;
}

type PrimaryVisualAssetType = "broll" | "image" | "thumbnail" | "none";

type VisualDedupeOptions = {
  preserveEntryIds?: ReadonlySet<string>;
  preserveBothAnchorKeys?: ReadonlySet<string>;
  existingAttachedTypeByAnchor?: ReadonlyMap<string, PrimaryVisualAssetType>;
};

function normalizeAnchorKey(entry: EpisodeMediaMapEntry): string {
  const mode = entry.anchor.mode;
  const normalizedTarget = entry.anchor.target
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `${mode}::${normalizedTarget}`;
}

function visualSubjectTokens(entry: EpisodeMediaMapEntry): Set<string> {
  return new Set(
    [entry.anchor.target, entry.description]
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !SUBJECT_STOP_WORDS.has(token)),
  );
}

function visualSubjectSimilarity(left: EpisodeMediaMapEntry, right: EpisodeMediaMapEntry): number {
  if (normalizeAnchorKey(left) === normalizeAnchorKey(right)) return 1;
  const leftTokens = visualSubjectTokens(left);
  const rightTokens = visualSubjectTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  if (intersection < 2) return 0;
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function isReferenceEntry(entry: EpisodeMediaMapEntry): boolean {
  return entry.final_media_kind === "contextual_data_composite" || entry.fulfillment_path === "reference_clip";
}

function isExistingEntry(entry: EpisodeMediaMapEntry): boolean {
  return entry.source.status === "selected" || entry.source.status === "attached";
}

function motionSelectionScore(entry: EpisodeMediaMapEntry): number {
  const signature = [entry.anchor.target, entry.description, entry.intent].join(" ");
  let score = 0;
  if (HIGH_VALUE_MOTION_SIGNAL_RE.test(signature)) score += 10;
  if (MOTION_OR_PROCESS_SIGNAL_RE.test(signature)) score += 4;
  if (STATIC_SUBJECT_SIGNAL_RE.test(signature)) score -= 8;
  if (entry.critical) score += 3;
  if (entry.purpose === "coverage") score += 1;
  return score;
}

function consolidateEquivalentSubjects(entries: EpisodeMediaMapEntry[]): EpisodeMediaMapEntry[] {
  const retained: EpisodeMediaMapEntry[] = [];
  for (const candidate of entries) {
    const duplicateIndex = retained.findIndex((current) => visualSubjectSimilarity(current, candidate) >= 0.72);
    if (duplicateIndex < 0) {
      retained.push(candidate);
      continue;
    }
    const current = retained[duplicateIndex]!;
    const candidateWins = (
      (isReferenceEntry(candidate) && !isReferenceEntry(current))
      || (isExistingEntry(candidate) && !isExistingEntry(current))
      || (candidate.final_media_kind === "image" && current.final_media_kind === "b_roll" && motionSelectionScore(current) <= 0)
    );
    if (candidateWins) retained[duplicateIndex] = candidate;
  }
  return retained;
}

export type MediaMapModalitySummary = {
  images: number;
  motionBroll: number;
  generatedMotionBroll: number;
  referenceClips: number;
  dataComposites: number;
  total: number;
  generationBurden: "Low" | "Moderate" | "High";
};

export type FullMediaDurationSource = "explicit_expected_duration" | "configured_narration_wpm" | "default_narration_wpm";

export type FullMediaBudgetPolicy = {
  estimatedDurationSec: number;
  durationSource: FullMediaDurationSource;
  narrationWpm: number;
  wordCount: number | null;
  targetPlacements: number;
  minimumPlacements: number;
  maximumPlacements: number;
  defaultMotionAllowance: number;
};

function countSpeakableWords(scriptText: string): number {
  const withoutTags = scriptText.replace(/\[[^\]]+\]/g, " ");
  return withoutTags.match(/\b[\p{L}\p{N}'’-]+\b/gu)?.length ?? 0;
}

export function deriveFullMediaBudgetPolicy(args: {
  expectedDurationSec?: number | null;
  scriptText?: string | null;
  wordCount?: number | null;
  narrationWpm?: number | null;
}): FullMediaBudgetPolicy {
  const explicitDuration = Number(args.expectedDurationSec);
  const configuredWpm = Number(args.narrationWpm);
  const narrationWpm = Number.isFinite(configuredWpm) && configuredWpm >= 60 && configuredWpm <= 260
    ? configuredWpm
    : HEARTH_DEFAULT_NARRATION_WPM;
  const explicitWordCount = Number(args.wordCount);
  const wordCount = Number.isFinite(explicitWordCount) && explicitWordCount > 0
    ? Math.trunc(explicitWordCount)
    : args.scriptText
      ? countSpeakableWords(args.scriptText)
      : 0;
  const hasExplicitDuration = Number.isFinite(explicitDuration) && explicitDuration > 0;
  const estimatedDurationSec = hasExplicitDuration
    ? explicitDuration
    : wordCount > 0
      ? (wordCount / narrationWpm) * 60
      : 9 * 60;
  const durationSource: FullMediaDurationSource = hasExplicitDuration
    ? "explicit_expected_duration"
    : narrationWpm !== HEARTH_DEFAULT_NARRATION_WPM
      ? "configured_narration_wpm"
      : "default_narration_wpm";
  const durationMinutes = Math.max(0.25, estimatedDurationSec / 60);
  const minimumPlacements = durationMinutes <= 3
    ? Math.max(1, Math.floor(durationMinutes))
    : Math.max(1, Math.floor(durationMinutes * 1.2) + (durationMinutes >= 24 ? 0 : 2));
  const maximumPlacements = durationMinutes <= 3
    ? Math.max(minimumPlacements, Math.ceil(durationMinutes * 1.5))
    : Math.max(minimumPlacements, Math.ceil(durationMinutes * 1.4) + (durationMinutes >= 24 ? 1 : 2));
  const targetPlacements = Math.min(
    maximumPlacements,
    Math.max(minimumPlacements, Math.round(durationMinutes * 1.35)),
  );
  const durationMotionAllowance = Math.max(1, Math.ceil(durationMinutes / 4.5));
  const placementMotionCap = Math.floor(maximumPlacements * 0.2);
  const defaultMotionAllowance = Math.max(0, Math.min(durationMotionAllowance, placementMotionCap));
  return {
    estimatedDurationSec,
    durationSource,
    narrationWpm,
    wordCount: wordCount || null,
    targetPlacements,
    minimumPlacements,
    maximumPlacements,
    defaultMotionAllowance,
  };
}

export function summarizeMediaMapModalities(entries: readonly EpisodeMediaMapEntry[]): MediaMapModalitySummary {
  const referenceClips = entries.filter((entry) => entry.fulfillment_path === "reference_clip").length;
  const dataComposites = entries.filter((entry) => entry.final_media_kind === "contextual_data_composite" && entry.fulfillment_path !== "reference_clip").length;
  const motionEntries = entries.filter((entry) => entry.final_media_kind === "b_roll");
  const generatedMotionBroll = motionEntries.filter((entry) => !isExistingEntry(entry)).length;
  const burdenScore = generatedMotionBroll * 4 + entries.filter((entry) => entry.final_media_kind === "image" && !isExistingEntry(entry)).length;
  return {
    images: entries.filter((entry) => entry.final_media_kind === "image").length,
    motionBroll: motionEntries.length,
    generatedMotionBroll,
    referenceClips,
    dataComposites,
    total: entries.length,
    generationBurden: burdenScore >= 14 ? "High" : burdenScore >= 6 ? "Moderate" : "Low",
  };
}

export function selectBalancedFullMediaEntries(
  entries: EpisodeMediaMapEntry[],
  options: { videoHeavy?: boolean; budgetPolicy?: FullMediaBudgetPolicy } = {},
): EpisodeMediaMapEntry[] {
  const budgetPolicy = options.budgetPolicy ?? deriveFullMediaBudgetPolicy({});
  const consolidated = consolidateEquivalentSubjects(entries);
  const references = consolidated.filter(isReferenceEntry);
  const replacedIds = new Set<string>();
  for (const reference of references) {
    for (const candidate of consolidated) {
      if (candidate.id === reference.id || isReferenceEntry(candidate)) continue;
      if (visualSubjectSimilarity(reference, candidate) >= 0.5) replacedIds.add(candidate.id);
    }
  }

  const eligible = consolidated.filter((entry) => !replacedIds.has(entry.id));
  const existing = eligible.filter((entry) => isExistingEntry(entry) && !isReferenceEntry(entry));
  const images = eligible.filter((entry) => entry.final_media_kind === "image" && !isExistingEntry(entry));
  const motion = eligible
    .filter((entry) => entry.final_media_kind === "b_roll" && !isExistingEntry(entry))
    .sort((left, right) => motionSelectionScore(right) - motionSelectionScore(left));
  const motionBudget = options.videoHeavy
    ? Math.max(budgetPolicy.defaultMotionAllowance, Math.min(
        Math.ceil(budgetPolicy.estimatedDurationSec / 60 / 3),
        Math.floor(budgetPolicy.maximumPlacements * 0.3),
      ))
    : budgetPolicy.defaultMotionAllowance;
  const selectedMotion = motion
    .filter((entry) => motionSelectionScore(entry) > 0)
    .slice(0, motionBudget);

  const selected: EpisodeMediaMapEntry[] = [...references, ...existing, ...selectedMotion];
  const selectedIds = new Set(selected.map((entry) => entry.id));
  for (const image of images) {
    if (selected.length >= budgetPolicy.maximumPlacements) break;
    if (!selectedIds.has(image.id)) {
      selected.push(image);
      selectedIds.add(image.id);
    }
  }

  // If the image planner was sparse, static B-roll candidates become still-image
  // treatments for the same beat rather than inflating the motion plan.
  for (const candidate of motion) {
    if (selected.length >= budgetPolicy.maximumPlacements) break;
    if (selectedIds.has(candidate.id) || selectedMotion.some((entry) => entry.id === candidate.id)) continue;
    selected.push({
      ...candidate,
      id: candidate.id.replace(/^mm_broll_/, "mm_still_"),
      final_media_kind: "image",
      fulfillment_path: null,
    });
  }

  const sourceOrder = new Map(entries.map((entry, index) => [entry.id, index] as const));
  return selected
    .slice(0, budgetPolicy.maximumPlacements)
    .sort((left, right) => {
      const leftSourceId = left.id.replace(/^mm_still_/, "mm_broll_");
      const rightSourceId = right.id.replace(/^mm_still_/, "mm_broll_");
      return (sourceOrder.get(leftSourceId) ?? 0) - (sourceOrder.get(rightSourceId) ?? 0);
    });
}

export function validateFullMediaDistribution(
  entries: readonly EpisodeMediaMapEntry[],
  options: { videoHeavy?: boolean; budgetPolicy?: FullMediaBudgetPolicy } = {},
): { ok: true } | { ok: false; error: string } {
  const summary = summarizeMediaMapModalities(entries);
  const budgetPolicy = options.budgetPolicy ?? deriveFullMediaBudgetPolicy({});
  if (summary.total === 0) return { ok: false, error: "Full Media produced no usable placements." };
  const motionBudget = options.videoHeavy
    ? Math.max(
        budgetPolicy.defaultMotionAllowance,
        Math.min(
          Math.ceil(budgetPolicy.estimatedDurationSec / 60 / 3),
          Math.floor(Math.max(summary.total, budgetPolicy.maximumPlacements) * 0.3),
        ),
      )
    : Math.min(budgetPolicy.defaultMotionAllowance, Math.floor(summary.total * 0.2));
  if (summary.generatedMotionBroll > motionBudget) {
    return { ok: false, error: `Full Media exceeded its motion budget (${summary.generatedMotionBroll}/${motionBudget}).` };
  }
  if (summary.images === 0 && summary.generatedMotionBroll > 0) {
    return { ok: false, error: "Full Media cannot use generated motion without an image backbone." };
  }
  return { ok: true };
}

function resolvePrimaryVisualAssetType(entry: EpisodeMediaMapEntry): PrimaryVisualAssetType {
  const intent = entry.intent.trim().toLowerCase();
  const target = entry.anchor.target.trim().toLowerCase();
  if (intent.includes("thumbnail") || target.startsWith("thumbnail:")) return "thumbnail";
  if (entry.final_media_kind === "b_roll") return "broll";
  if (entry.final_media_kind === "image") return "image";
  return "none";
}

function resolvePreferredVisualType(entries: EpisodeMediaMapEntry[]): PrimaryVisualAssetType | null {
  if (entries.some((entry) => resolvePrimaryVisualAssetType(entry) === "thumbnail")) {
    return "thumbnail";
  }

  let brollScore = 0;
  let imageScore = 0;
  for (const entry of entries) {
    const signature = [entry.intent, entry.description, entry.anchor.target, entry.purpose].join(" ");
    if (MOTION_OR_PROCESS_SIGNAL_RE.test(signature)) brollScore += 2;
    if (STATIC_OR_EXPLAINER_SIGNAL_RE.test(signature)) imageScore += 2;
    if (entry.final_media_kind === "b_roll") brollScore += 1;
    if (entry.final_media_kind === "image") imageScore += 1;
    if (entry.purpose === "explanation" || entry.purpose === "emphasis") imageScore += 1;
  }

  if (brollScore > imageScore) return "broll";
  if (imageScore > brollScore) return "image";
  return null;
}

function resolveExistingAttachedTypeByAnchor(entries: readonly EpisodeMediaMapEntry[]): Map<string, PrimaryVisualAssetType> {
  const map = new Map<string, PrimaryVisualAssetType>();
  for (const entry of entries) {
    if (entry.source.status !== "selected" && entry.source.status !== "attached") continue;
    const type = resolvePrimaryVisualAssetType(entry);
    if (type === "none") continue;
    const anchorKey = normalizeAnchorKey(entry);
    if (!map.has(anchorKey)) map.set(anchorKey, type);
  }
  return map;
}

export function dedupeVisualAssetsByAnchor(
  items: EpisodeMediaMapEntry[],
  options: VisualDedupeOptions = {},
): EpisodeMediaMapEntry[] {
  const preserveEntryIds = options.preserveEntryIds ?? new Set<string>();
  const preserveBothAnchorKeys = options.preserveBothAnchorKeys ?? new Set<string>();
  const existingAttachedTypeByAnchor = options.existingAttachedTypeByAnchor ?? new Map<string, PrimaryVisualAssetType>();
  const grouped = new Map<string, EpisodeMediaMapEntry[]>();

  for (const item of items) {
    const type = resolvePrimaryVisualAssetType(item);
    if (type === "none") continue;
    const key = normalizeAnchorKey(item);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  const seen = new Set<string>();
  const retained = new Set<string>();

  for (const [anchorKey, group] of grouped) {
    group.forEach((entry) => seen.add(entry.id));
    const kinds = new Set(group.map((entry) => resolvePrimaryVisualAssetType(entry)));
    const hasImage = kinds.has("image");
    const hasBroll = kinds.has("broll");
    if (!hasImage || !hasBroll || preserveBothAnchorKeys.has(anchorKey)) {
      group.forEach((entry) => retained.add(entry.id));
      continue;
    }

    const preserveEntries = group.filter((entry) => preserveEntryIds.has(entry.id));
    if (preserveEntries.length > 0) {
      group.forEach((entry) => retained.add(entry.id));
      continue;
    }

    const preferredFromPurpose = resolvePreferredVisualType(group);
    const existingType = existingAttachedTypeByAnchor.get(anchorKey) ?? null;
    const preferredType = preferredFromPurpose ?? existingType ?? resolvePrimaryVisualAssetType(group[0]!);

    for (const entry of group) {
      if (resolvePrimaryVisualAssetType(entry) === preferredType) {
        retained.add(entry.id);
      }
    }
  }

  const untouched = items.filter((entry) => !seen.has(entry.id));
  const deduped = items.filter((entry) => retained.has(entry.id));
  return [...untouched, ...deduped];
}

function scoreMediaMapEntry(entry: EpisodeMediaMapEntry, index: number): number {
  let score = 0;
  if (entry.critical) score += 8;
  if (entry.purpose === "emphasis") score += 7;
  if (entry.purpose === "explanation") score += 6;
  if (entry.final_media_kind === "contextual_data_composite") score += 5;
  if (entry.final_media_kind === "b_roll") score += 3;
  if (entry.source.status === "selected" || entry.source.status === "attached") score += 4;
  if (entry.fulfillment_path) score += 3;
  if (entry.beat_anchor?.beat_index === 1 || index === 0) score += 2;
  if (entry.optional) score -= 4;
  return score;
}

function selectMediaMapVisualBeats(entries: EpisodeMediaMapEntry[]): EpisodeMediaMapEntry[] {
  if (entries.length <= MAX_MEDIA_MAP_VISUALS) return entries;
  return entries
    .map((entry, index) => ({ entry, index, score: scoreMediaMapEntry(entry, index) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .slice(0, MAX_MEDIA_MAP_VISUALS)
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.entry);
}

export function mapImageEntriesToMediaMapEntries(
  entries: EpisodeImageMapEntry[],
  nowIso: string,
  idPrefix: string,
): EpisodeMediaMapEntry[] {
  return entries.map((entry) => ({
    id: `${idPrefix}${entry.id}`,
    final_media_kind: "image",
    purpose: entry.purpose,
    anchor: {
      mode: entry.anchor_scope === "global"
        ? "section_marker"
        : entry.beat_anchor
          ? "speaker_turn"
          : (entry.placement_hint === "exact_timestamp" ? "absolute_time" : "phrase_match"),
      target: entry.anchor_scope === "global"
        ? (entry.section_intent_note?.trim() || "global:image")
        : entry.beat_anchor
          ? buildBulletBeatAnchorLabel(entry.beat_anchor)
          : (entry.anchor || entry.prompt_basis || entry.description || "image:beat"),
    },
    beat_anchor: entry.beat_anchor ?? null,
    timing: {
      in_offset_sec: 0,
      duration_sec: 6,
    },
    description: entry.description || entry.visual_intent || entry.prompt_basis || "Image map visual beat",
    intent: entry.intent || "visual_support",
    source: {
      status: entry.selected_asset_id ? "selected" : "unresolved",
      asset_id: entry.selected_asset_id ?? null,
    },
    confidence: entry.status === "selected" ? "high" : "medium",
    fulfillment_status: entry.selected_asset_id ? "resolved" : "planned",
    fulfillment_path: entry.selected_asset_id
      ? "image"
      : null,
    optional: entry.visual_priority === "optional",
    critical: entry.visual_priority === "primary",
    stale: false,
    created_at: nowIso,
    updated_at: nowIso,
  }));
}

export function buildMediaMapFromExistingPlans(
  current: EpisodePackageV2,
  scriptVersionId: string | null,
  scope: MediaMapGenerationScope,
  options: { videoHeavy?: boolean; budgetPolicy?: FullMediaBudgetPolicy } = {},
): EpisodeMediaMap {
  const nowIso = new Date().toISOString();
  const thumbnailVersionByConceptId = new Map<string, EpisodeThumbnailVersion>();
  for (const version of current.thumbnail.versions) {
    if (!thumbnailVersionByConceptId.has(version.concept_id)) {
      thumbnailVersionByConceptId.set(version.concept_id, version);
    }
  }
  const fromThumbnailPrompts: EpisodeMediaMapEntry[] = current.thumbnail.concepts.map((concept) => {
    const conceptLabel = concept.label.trim();
    const promptText = concept.prompt_text.trim();
    const supportingVersion = thumbnailVersionByConceptId.get(concept.id);
    return {
      id: `mm_thumbnail_${concept.id}`,
      final_media_kind: "image",
      purpose: "emphasis",
      anchor: {
        mode: "section_marker",
        target: conceptLabel ? `thumbnail:${conceptLabel}` : "thumbnail:concept",
      },
      timing: {
        in_offset_sec: 0,
        duration_sec: 6,
      },
      description: promptText || conceptLabel || "Thumbnail concept prompt",
      intent: "thumbnail_concept",
      source: {
        status: supportingVersion?.asset_id ? "selected" : "unresolved",
        asset_id: supportingVersion?.asset_id ?? null,
      },
      confidence: "medium",
      fulfillment_status: supportingVersion?.asset_id ? "resolved" : "planned",
      fulfillment_path: supportingVersion?.asset_id ? "image" : null,
      optional: false,
      critical: true,
      stale: false,
      created_at: nowIso,
      updated_at: nowIso,
    };
  });
  const fromImageMap = mapImageEntriesToMediaMapEntries(current.image_map.entries, nowIso, "mm_imap_");
  const fromBroll: EpisodeMediaMapEntry[] = current.broll_plan.beats.map((beat) => ({
    id: `mm_broll_${beat.id}`,
    final_media_kind: "b_roll",
    purpose: beat.purpose,
    anchor: {
      mode: beat.placement_hint === "exact_timestamp" ? "absolute_time" : "phrase_match",
      target: beat.placement_hint === "exact_timestamp"
        ? String((beat.timestamp_ms ?? 0) / 1000)
        : beat.anchor_text,
    },
    timing: {
      in_offset_sec: 0,
      duration_sec: Math.max(1, (beat.suggested_duration_ms ?? 6000) / 1000),
    },
    description: beat.description,
    intent: beat.motion_intent,
    source: {
      status: beat.selected_asset_id ? "selected" : "unresolved",
      asset_id: beat.selected_asset_id ?? null,
    },
    confidence: "medium",
    fulfillment_status: beat.selected_asset_id ? "resolved" : "planned",
    fulfillment_path: beat.selected_asset_id ? "motion_broll" : null,
    optional: beat.priority === "background",
    critical: beat.priority === "primary",
    stale: false,
    created_at: beat.created_at,
    updated_at: beat.updated_at,
  }));
  const fromReferenceClips: EpisodeMediaMapEntry[] = current.cdc_plan.entries.filter(hasReferenceClipEvidenceSource).map((entry) => ({
    id: `mm_reference_clip_${entry.id}`,
    final_media_kind: "contextual_data_composite",
    purpose: entry.purpose,
    anchor: {
      mode: entry.placement_hint === "exact_timestamp" ? "absolute_time" : "phrase_match",
      target: entry.placement_hint === "exact_timestamp"
        ? String((entry.timestamp_ms ?? 0) / 1000)
        : entry.anchor_text,
    },
    timing: {
      in_offset_sec: 0,
      duration_sec: 6,
    },
    description: entry.description,
    intent: [
      entry.subtype ?? entry.data_type,
      entry.source ? `source:${entry.source}` : null,
      entry.context ? `context:${entry.context}` : null,
      entry.highlight ? `highlight:${entry.highlight}` : null,
    ].filter(Boolean).join(" | "),
    source: {
      status: entry.selected_asset_id ? "selected" : "unresolved",
      asset_id: entry.selected_asset_id ?? null,
    },
    confidence: "medium",
    fulfillment_status: entry.selected_asset_id ? "resolved" : "planned",
    fulfillment_path: "reference_clip",
    optional: false,
    critical: true,
    stale: false,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  }));
  const includeImages = true;
  const includeBroll = scope === "images_broll" || scope === "full_media_plan";
  const includeReferenceClips = scope === "images_reference_clips" || scope === "full_media_plan";
  const merged = [
    ...(includeImages && scope !== "full_media_plan" ? fromThumbnailPrompts : []),
    ...(includeImages ? fromImageMap : []),
    ...(includeBroll ? fromBroll : []),
    ...(includeReferenceClips ? fromReferenceClips : []),
  ];
  const preserveEntryIds = new Set<string>();
  for (const imageEntry of current.image_map.entries) {
    const sourceType = imageEntry.source_type.trim().toLowerCase();
    const origin = imageEntry.origin?.trim().toLowerCase() ?? "";
    const isManualImage = sourceType === "custom"
      || sourceType === "upload"
      || sourceType === "external"
      || sourceType === "hammer_upload"
      || origin === "hammer"
      || origin === "mixed"
      || Boolean(imageEntry.selected_asset_id);
    if (isManualImage) preserveEntryIds.add(`mm_imap_${imageEntry.id}`);
  }
  for (const beat of current.broll_plan.beats) {
    const sourceType = beat.source_type.trim().toLowerCase();
    const origin = beat.origin.trim().toLowerCase();
    const isManualBroll = beat.placement_hint === "manual"
      || sourceType === "upload"
      || sourceType === "external"
      || sourceType === "hammer_upload"
      || origin === "hammer"
      || origin === "mixed"
      || Boolean(beat.selected_asset_id);
    if (isManualBroll) preserveEntryIds.add(`mm_broll_${beat.id}`);
  }

  const preserveBothAnchorKeys = new Set<string>();
  const groupedForPreserve = new Map<string, EpisodeMediaMapEntry[]>();
  for (const entry of merged) {
    const key = normalizeAnchorKey(entry);
    const bucket = groupedForPreserve.get(key);
    if (bucket) bucket.push(entry);
    else groupedForPreserve.set(key, [entry]);
  }
  for (const [anchorKey, group] of groupedForPreserve) {
    const hasPreservedImage = group.some((entry) => preserveEntryIds.has(entry.id) && resolvePrimaryVisualAssetType(entry) === "image");
    const hasPreservedBroll = group.some((entry) => preserveEntryIds.has(entry.id) && resolvePrimaryVisualAssetType(entry) === "broll");
    if (hasPreservedImage && hasPreservedBroll) {
      preserveBothAnchorKeys.add(anchorKey);
    }
  }

  // When purpose preference ties, keep continuity with attached assets already present on this anchor.
  const existingAttachedTypeByAnchor = resolveExistingAttachedTypeByAnchor(current.media_map.entries);

  const deduped = dedupeVisualAssetsByAnchor(merged, {
    preserveEntryIds,
    preserveBothAnchorKeys,
    existingAttachedTypeByAnchor,
  });
  const selected = scope === "full_media_plan"
    ? selectBalancedFullMediaEntries(deduped, options)
    : selectMediaMapVisualBeats(deduped);
  return {
    id: current.media_map.id || "media-map-v1",
    workpiece_id: current.media_map.workpiece_id,
    script_version_id: scriptVersionId,
    status: "review",
    version: Math.max(1, current.media_map.version + 1),
    entries: selected,
    generated_at: nowIso,
  };
}
