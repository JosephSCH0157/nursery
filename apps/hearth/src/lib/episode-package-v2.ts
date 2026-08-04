import {
  DEFAULT_HEARTH_VISUAL_STYLE,
  normalizeHearthVisualStyle,
} from "./hearth-visual-styles";
import type { HearthVisualStyleValue } from "./hearth-visual-styles";
import {
  DEFAULT_TITLE_STYLE,
  normalizeEpisodeThumbnailTitleStyle,
} from "./hearth-title-fonts";
import type { EpisodeThumbnailTitleStyle } from "./hearth-title-fonts";
import {
  deriveHearthThumbnailOverlayText,
  resolveHearthThumbnailOverlayText,
} from "./hearth-thumbnail-title-contract";
import {
  deriveBrollPurpose,
  deriveImageMapPurpose,
  deriveMediaMapPurpose,
  deriveReferenceClipPurpose,
  type HearthVisualPurpose,
} from "./hearth-visual-purpose";

export const EPISODE_PACKAGE_V2_SCHEMA = "forge.episode.package.v2";

const SEO_LABELS = ["A", "B", "C", "D", "E", "F"] as const;

export type EpisodeSeoTitle = {
  id: string;
  label: string;
  text: string;
  is_primary: boolean;
  thumbnail_text?: string | null;
};

export type EpisodeSeo = {
  titles: EpisodeSeoTitle[];
  tags: string[];
  description_short: string | null;
  description_long: string | null;
};

export type EpisodeThumbnailConcept = {
  id: string;
  label: string;
  prompt_text: string;
  style_preset?: HearthVisualStyleValue | null;
  title_style?: EpisodeThumbnailTitleStyle | null;
  brand_template_id?: string | null;
  has_face?: boolean;
  emotion_intensity?: number | null;
  text_length?: number | null;
  contrast_score?: number | null;
  novelty_score?: number | null;
  topic_relevance?: number | null;
};

export type EpisodeThumbnailVersion = {
  id: string;
  concept_id: string;
  created_at: string;
  provider: string;
  prompt: string;
  asset_id: string;
  status: string;
  provider_request_id?: string | null;
  asset_path?: string | null;
  mime_type?: string | null;
  error?: string | null;
};

export type EpisodeThumbnail = {
  concepts: EpisodeThumbnailConcept[];
  versions: EpisodeThumbnailVersion[];
  primary_version_id: string | null;
};

export const EPISODE_LAUNCH_VARIANT_STATUS_VALUES = [
  "draft",
  "ready",
  "tested",
  "winner",
] as const;

export type EpisodeLaunchVariantStatus = (typeof EPISODE_LAUNCH_VARIANT_STATUS_VALUES)[number];

export type EpisodeLaunchVariant = {
  id: string;
  title_id: string;
  thumbnail_version_id: string;
  created_at: string;
  updated_at: string;
  status: EpisodeLaunchVariantStatus;
  notes: string | null;
  last_tested_at: string | null;
  winner_selected_at: string | null;
};

export type EpisodeImageMapScriptAnchor = {
  section_id: string;
  paragraph_id: string;
  paragraph_order: number;
  sentence_start: number;
  sentence_end: number;
  char_start: number;
  char_end: number;
  span_text: string;
  speaker_block_id?: string | null;
};

export const EPISODE_SPOKEN_BEAT_SPEAKER_VALUES = ["s1", "s2", "g1", "g2"] as const;
export type EpisodeSpokenBeatSpeaker = (typeof EPISODE_SPOKEN_BEAT_SPEAKER_VALUES)[number];

export const EPISODE_SPOKEN_BEAT_FORMAT_VALUES = ["bullet_outline"] as const;
export type EpisodeSpokenBeatFormat = (typeof EPISODE_SPOKEN_BEAT_FORMAT_VALUES)[number];

export type EpisodeSpokenBeat = {
  id: string;
  speaker: EpisodeSpokenBeatSpeaker;
  format: EpisodeSpokenBeatFormat;
  order: number;
  speaker_order: number;
  speaker_turn: number;
  text: string;
  normalized_label: string;
  cue_phrase: string | null;
};

export type EpisodeBulletBeatAnchor = {
  mode: "bullet_beat";
  beat_id: string;
  speaker: EpisodeSpokenBeatSpeaker;
  beat_index: number;
  speaker_order: number;
  speaker_turn: number;
  beat_label: string | null;
  cue_phrase: string | null;
  purpose: HearthVisualPurpose;
};

export const EPISODE_IMAGE_MAP_VISUAL_MODE_VALUES = [
  "comparison",
  "map",
  "location",
  "event_scene",
  "concept_illustration",
  "person_figure",
  "object_detail",
] as const;

export type EpisodeImageMapVisualMode = (typeof EPISODE_IMAGE_MAP_VISUAL_MODE_VALUES)[number];

export type EpisodeImageMapAssetRef = {
  asset_id: string;
  path?: string | null;
  variant_label?: string | null;
  visual_mode?: EpisodeImageMapVisualMode | null;
  mime_type?: string | null;
  source?: EpisodeImageMapAssetSource | null;
};

export const EPISODE_IMAGE_MAP_ASSET_SOURCE_VALUES = [
  "ai",
  "stock",
  "upload",
  "external",
  "hammer_upload",
] as const;

export type EpisodeImageMapAssetSource = (typeof EPISODE_IMAGE_MAP_ASSET_SOURCE_VALUES)[number];

export const EPISODE_IMAGE_MAP_ORIGIN_VALUES = [
  "hearth",
  "hammer",
  "mixed",
] as const;

export type EpisodeImageMapOrigin = (typeof EPISODE_IMAGE_MAP_ORIGIN_VALUES)[number];

export type EpisodeImageMapEntry = {
  id: string;
  anchor: string;
  script_anchor: EpisodeImageMapScriptAnchor | null;
  beat_anchor?: EpisodeBulletBeatAnchor | null;
  anchor_scope?: EpisodeImageMapAnchorScope;
  purpose: HearthVisualPurpose;
  description: string;
  visual_intent: string;
  prompt_basis: string;
  style_preset?: HearthVisualStyleValue | null;
  intent: string;
  source_type: string;
  origin?: EpisodeImageMapOrigin;
  visual_priority?: EpisodeImageMapVisualPriority;
  visual_type?: EpisodeImageMapVisualType;
  section_intent_note?: string | null;
  beat_order: number;
  paragraph_beat_order: number;
  candidate_assets: EpisodeImageMapAssetRef[];
  selected_asset_id: string | null;
  status: EpisodeImageMapStatus;
  placement_hint?: string | null;
  canonical_anchor_assessment?: {
    state: "current" | "stale" | "unresolved" | "provenance_unknown";
    reason: string | null;
    exact_anchor: EpisodeImageMapScriptAnchor | null;
    evidence: Record<string, unknown>;
  };
};

export type EpisodeImageMap = {
  entries: EpisodeImageMapEntry[];
};

export const CANONICAL_MEDIA_TYPE_VALUES = [
  "thumbnail",
  "timeline_image",
  "b_roll",
  "illustration",
  "screen_capture",
  "archival_media",
  "contextual_data_composite",
] as const;

export type CanonicalMediaType = (typeof CANONICAL_MEDIA_TYPE_VALUES)[number];
export type EpisodeMediaMapMediaType = "image" | "b_roll" | "contextual_data_composite";
export type EpisodeMediaMapAnchorMode = "line_anchor" | "phrase_match" | "speaker_turn" | "section_marker" | "absolute_time";
export type EpisodeMediaMapSourceStatus = "unresolved" | "selected" | "attached";
export type EpisodeMediaMapConfidence = "high" | "medium" | "low";
export type EpisodeMediaMapStatus = "draft" | "review" | "activated" | "fulfilling" | "fulfilled" | "needs_attention";
export type EpisodeMediaMapBeatFulfillmentStatus = "planned" | "approved" | "queued" | "generating" | "resolved" | "needs_attention";
export type EpisodeMediaMapFulfillmentPath = "image" | "motion_broll" | "reference_clip";

export type EpisodeMediaMapAnchor = {
  mode: EpisodeMediaMapAnchorMode;
  target: string;
};

export type EpisodeMediaMapTiming = {
  in_offset_sec: number;
  duration_sec: number;
};

export type EpisodeMediaMapSource = {
  status: EpisodeMediaMapSourceStatus;
  asset_id: string | null;
};

export type EpisodeMediaMapEntry = {
  id: string;
  final_media_kind: EpisodeMediaMapMediaType;
  purpose: HearthVisualPurpose;
  anchor: EpisodeMediaMapAnchor;
  beat_anchor?: EpisodeBulletBeatAnchor | null;
  timing: EpisodeMediaMapTiming;
  description: string;
  intent: string;
  source: EpisodeMediaMapSource;
  confidence: EpisodeMediaMapConfidence;
  fulfillment_status: EpisodeMediaMapBeatFulfillmentStatus;
  fulfillment_path: EpisodeMediaMapFulfillmentPath | null;
  optional: boolean;
  critical: boolean;
  stale: boolean;
  created_at: string;
  updated_at: string;
};

export type EpisodeMediaMap = {
  id: string;
  workpiece_id: string;
  script_version_id: string | null;
  status: EpisodeMediaMapStatus;
  version: number;
  entries: EpisodeMediaMapEntry[];
  generated_at: string;
};

export const EPISODE_BROLL_PLAN_MOTION_INTENT_VALUES = [
  "broll",
  "establishing",
  "cutaway",
  "reaction",
  "ambient",
  "explanatory",
  "graphic",
  "data_visual",
  "map",
  "timeline",
  "transition",
] as const;

export const EPISODE_BROLL_PLAN_SOURCE_TYPE_VALUES = [
  "planned",
  "stock",
  "upload",
  "external",
  "hearth_ai",
  "generated",
  "hammer_upload",
] as const;

export const EPISODE_BROLL_PLAN_MOTION_ASSET_CATEGORY_VALUES = [
  "stock_video",
  "ai_video",
  "uploaded_video",
  "animated_chart",
  "animated_graphic",
  "timeline_graphic",
  "map_animation",
  "stat_card",
] as const;

export const EPISODE_BROLL_PLAN_COVERAGE_STRENGTH_VALUES = [
  "low",
  "medium",
  "high",
] as const;

export const EPISODE_BROLL_PLAN_FULFILLMENT_STATE_VALUES = [
  "unresolved",
  "candidate_assets_available",
  "resolved",
  "stale",
] as const;
export const EPISODE_VISUAL_ASSET_CLASS_VALUES = ["broll", "reference_clip"] as const;
export const EPISODE_EXTERNAL_REQUEST_STATE_VALUES = [
  "planned",
  "brief_exported",
  "sent_external",
  "awaiting_result",
  "asset_attached",
  "resolved",
] as const;

export type EpisodeBrollMotionIntent = (typeof EPISODE_BROLL_PLAN_MOTION_INTENT_VALUES)[number];
export type EpisodeBrollSourceType = (typeof EPISODE_BROLL_PLAN_SOURCE_TYPE_VALUES)[number];
export type EpisodeBrollMotionAssetCategory = (typeof EPISODE_BROLL_PLAN_MOTION_ASSET_CATEGORY_VALUES)[number];
export type EpisodeBrollCoverageStrength = (typeof EPISODE_BROLL_PLAN_COVERAGE_STRENGTH_VALUES)[number];
export type EpisodeBrollFulfillmentState = (typeof EPISODE_BROLL_PLAN_FULFILLMENT_STATE_VALUES)[number];
export type EpisodeVisualAssetClass = (typeof EPISODE_VISUAL_ASSET_CLASS_VALUES)[number];
export type EpisodeExternalRequestState = (typeof EPISODE_EXTERNAL_REQUEST_STATE_VALUES)[number];

export type EpisodeBrollShotType = "close" | "medium" | "wide" | "macro" | "aerial" | "mixed";
export type EpisodeBrollPriority = "primary" | "supporting" | "background";
export type EpisodeBrollPlacementHint = "first_occurrence" | "exact_timestamp" | "manual";
export type EpisodeBrollOrigin = "hearth" | "hammer" | "mixed";
export type EpisodeBrollDataVisualChartType = "bar" | "line" | "area" | "pie" | "timeline" | "stat";

export type EpisodeBrollDataVisualSpec = {
  chart_type?: EpisodeBrollDataVisualChartType | null;
  title?: string | null;
  labels?: string[];
  values?: number[];
  emphasis_key?: string | null;
  animation_style?: string | null;
};

export type EpisodeBrollAssetCandidate = {
  asset_id: string;
  source: EpisodeBrollSourceType;
  asset_class?: EpisodeVisualAssetClass | null;
  source_beat_id?: string | null;
  source_label?: string | null;
  source_url?: string | null;
  provider_note?: string | null;
  usage_note?: string | null;
  ingest_status?: "processing" | "ready" | "failed" | null;
  ingest_error?: string | null;
  thumbnail_path?: string | null;
  preview_path?: string | null;
  attached_at?: string | null;
  asset_category?: EpisodeBrollMotionAssetCategory | null;
  label?: string | null;
  path?: string | null;
  uri?: string | null;
  mime_type?: string | null;
  duration_ms?: number | null;
  data_visual_spec?: EpisodeBrollDataVisualSpec | null;
  created_at?: string | null;
};

export type EpisodeExternalRequestTracker = {
  state: EpisodeExternalRequestState;
  provider_id?: string | null;
  source_url?: string | null;
  provider_note?: string | null;
  usage_note?: string | null;
  result_metadata?: string | null;
  attached_asset_id?: string | null;
  updated_at: string;
};

export type EpisodeBrollPlanBeat = {
  id: string;
  workpiece_id: string;
  anchor_text: string;
  placement_hint: EpisodeBrollPlacementHint;
  timestamp_ms?: number | null;
  purpose: HearthVisualPurpose;
  description: string;
  motion_intent: EpisodeBrollMotionIntent;
  visual_style?: HearthVisualStyleValue | null;
  priority: EpisodeBrollPriority;
  keywords: string[];
  mood?: string | null;
  shot_type?: EpisodeBrollShotType | null;
  motion_suggestion?: string | null;
  suggested_duration_ms?: number | null;
  source_type: EpisodeBrollSourceType;
  asset_category?: EpisodeBrollMotionAssetCategory | null;
  data_visual_spec?: EpisodeBrollDataVisualSpec | null;
  selected_asset_id?: string | null;
  candidate_assets?: EpisodeBrollAssetCandidate[];
  external_request?: EpisodeExternalRequestTracker | null;
  fulfillment_state?: EpisodeBrollFulfillmentState;
  origin: EpisodeBrollOrigin;
  created_at: string;
  updated_at: string;
};

export type EpisodeBrollPlan = {
  id: string;
  workpiece_id: string;
  version: number;
  beats: EpisodeBrollPlanBeat[];
  coverage_strength?: EpisodeBrollCoverageStrength;
  generated_at: string;
};

export const EPISODE_CDC_FORMAT_VALUES = ["still", "animated", "hybrid"] as const;
export const EPISODE_CDC_DATA_TYPE_VALUES = ["quantitative", "categorical", "timeline", "geographic", "comparison"] as const;
export const EPISODE_CDC_CONTEXT_TYPE_VALUES = ["location", "object", "historical", "subject", "conceptual"] as const;
export const EPISODE_CDC_TONE_VALUES = ["neutral", "investigative", "nostalgic", "dramatic", "analytical"] as const;
export const EPISODE_CDC_MOTION_LEVEL_VALUES = ["static", "subtle", "full_animation"] as const;
export const EPISODE_CDC_CHART_TYPE_VALUES = ["line", "bar", "area", "scatter", "timeline", "map", "stat_card", "comparison"] as const;
export const EPISODE_REFERENCE_CLIP_FORMAT_VALUES = EPISODE_CDC_FORMAT_VALUES;
export const EPISODE_REFERENCE_CLIP_DATA_TYPE_VALUES = EPISODE_CDC_DATA_TYPE_VALUES;
export const EPISODE_REFERENCE_CLIP_CONTEXT_TYPE_VALUES = EPISODE_CDC_CONTEXT_TYPE_VALUES;
export const EPISODE_REFERENCE_CLIP_TONE_VALUES = EPISODE_CDC_TONE_VALUES;
export const EPISODE_REFERENCE_CLIP_MOTION_LEVEL_VALUES = EPISODE_CDC_MOTION_LEVEL_VALUES;
export const EPISODE_REFERENCE_CLIP_CHART_TYPE_VALUES = EPISODE_CDC_CHART_TYPE_VALUES;

export type EpisodeCdcFormat = (typeof EPISODE_CDC_FORMAT_VALUES)[number];
export type EpisodeCdcDataType = (typeof EPISODE_CDC_DATA_TYPE_VALUES)[number];
export type EpisodeCdcContextType = (typeof EPISODE_CDC_CONTEXT_TYPE_VALUES)[number];
export type EpisodeCdcTone = (typeof EPISODE_CDC_TONE_VALUES)[number];
export type EpisodeCdcMotionLevel = (typeof EPISODE_CDC_MOTION_LEVEL_VALUES)[number];
export type EpisodeCdcChartType = (typeof EPISODE_CDC_CHART_TYPE_VALUES)[number];
export type EpisodeReferenceClipFormat = EpisodeCdcFormat;
export type EpisodeReferenceClipDataType = EpisodeCdcDataType;
export type EpisodeReferenceClipContextType = EpisodeCdcContextType;
export type EpisodeReferenceClipTone = EpisodeCdcTone;
export type EpisodeReferenceClipMotionLevel = EpisodeCdcMotionLevel;
export type EpisodeReferenceClipChartType = EpisodeCdcChartType;
export type EpisodeReferenceClipSubtype = "graph" | "document" | "timeline";

export type EpisodeContextualDataCompositePlan = {
  id: string;
  workpiece_id: string;
  media_type: "contextual_data_composite";
  anchor_text: string;
  placement_hint: EpisodeBrollPlacementHint;
  timestamp_ms?: number | null;
  purpose: HearthVisualPurpose;
  format: EpisodeCdcFormat;
  data_type: EpisodeCdcDataType;
  context_type: EpisodeCdcContextType;
  tone: EpisodeCdcTone;
  motion_level: EpisodeCdcMotionLevel;
  description: string;
  background_context_description: string;
  foreground_data_description: string;
  visual_style?: HearthVisualStyleValue | null;
  chart_type?: EpisodeCdcChartType | null;
  subtype?: EpisodeReferenceClipSubtype | null;
  source?: string | null;
  context?: string | null;
  highlight?: string | null;
  visual_spec?: string | null;
  title?: string | null;
  labels?: string[];
  values?: Array<number | string>;
  emphasis_key?: string | null;
  candidate_assets?: EpisodeBrollAssetCandidate[];
  external_request?: EpisodeExternalRequestTracker | null;
  selected_asset_id?: string | null;
  source_type: EpisodeBrollSourceType;
  origin: EpisodeBrollOrigin;
  created_at: string;
  updated_at: string;
};

export type EpisodeCdcPlan = {
  id: string;
  workpiece_id: string;
  version: number;
  entries: EpisodeContextualDataCompositePlan[];
  generated_at: string;
};
export type EpisodeReferenceClipPlan = EpisodeCdcPlan;

export const EPISODE_IMAGE_MAP_INTENT_VALUES = [
  "broll",
  "graphic",
  "lower-third",
  "archival",
  "cutaway",
  "other",
] as const;

export const EPISODE_IMAGE_MAP_SOURCE_TYPE_VALUES = [
  "ai",
  "stock",
  "archival",
  "custom",
  "upload",
  "external",
  "hammer_upload",
] as const;
export const EPISODE_IMAGE_MAP_STATUS_VALUES = [
  "draft",
  "mapped",
  "candidates_generated",
  "selected",
] as const;

export const EPISODE_IMAGE_MAP_ANCHOR_SCOPE_VALUES = [
  "attached",
  "beat",
  "orphaned",
  "global",
] as const;

export const EPISODE_IMAGE_MAP_VISUAL_PRIORITY_VALUES = [
  "primary",
  "supporting",
  "optional",
] as const;

export const EPISODE_IMAGE_MAP_VISUAL_TYPE_VALUES = [
  "b_roll",
  "still_image",
  "text_overlay",
  "diagram",
  "archival",
  "motion_graphic",
] as const;

export type EpisodeImageMapIntent = (typeof EPISODE_IMAGE_MAP_INTENT_VALUES)[number];
export type EpisodeImageMapSourceType = (typeof EPISODE_IMAGE_MAP_SOURCE_TYPE_VALUES)[number];
export type EpisodeImageMapStatus = (typeof EPISODE_IMAGE_MAP_STATUS_VALUES)[number];
export type EpisodeImageMapAnchorScope = (typeof EPISODE_IMAGE_MAP_ANCHOR_SCOPE_VALUES)[number];
export type EpisodeImageMapVisualPriority = (typeof EPISODE_IMAGE_MAP_VISUAL_PRIORITY_VALUES)[number];
export type EpisodeImageMapVisualType = (typeof EPISODE_IMAGE_MAP_VISUAL_TYPE_VALUES)[number];

export type EpisodePackageV2 = {
  schema: typeof EPISODE_PACKAGE_V2_SCHEMA;
  seo: EpisodeSeo;
  thumbnail: EpisodeThumbnail;
  launch_variants: EpisodeLaunchVariant[];
  spoken_beats: EpisodeSpokenBeat[];
  media_map: EpisodeMediaMap;
  image_map: EpisodeImageMap;
  broll_plan: EpisodeBrollPlan;
  cdc_plan: EpisodeCdcPlan;
};

export type ProductionArtifactAction = "seo" | "tags" | "thumbnails" | "image_beat_sheet";

type ImageBeatLegacyEntry = {
  id: string;
  attach_after: string;
  description: string;
  prompt: string;
  match?: string;
};

const SEO_CORE_LABELS = ["A", "B", "C"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const str = readString(entry);
    if (str) out.push(str);
  }
  return out;
}

function readInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeIso(value: unknown, fallbackIso?: string): string {
  const raw = readString(value);
  if (!raw) return fallbackIso ?? new Date().toISOString();
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return fallbackIso ?? new Date().toISOString();
  return new Date(timestamp).toISOString();
}

function normalizeOptionalIso(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function normalizeTag(tag: string): string | null {
  const cleaned = tag
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || null;
}

function parseCsvTags(text: string): string[] {
  return text
    .split(/[,\n]/g)
    .map((entry) => normalizeTag(entry))
    .filter(Boolean) as string[];
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeTitleId(input: string, index: number): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `seo-title-${slug}` : `seo-title-${index + 1}`;
}

function normalizeSeoTitles(value: unknown): EpisodeSeoTitle[] {
  if (!Array.isArray(value)) return [];
  const out: EpisodeSeoTitle[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (isRecord(entry)) {
      const text = readString(entry.text);
      if (!text) continue;
      const label = readString(entry.label) ?? SEO_LABELS[i] ?? `V${i + 1}`;
      out.push({
        id: readString(entry.id) ?? normalizeTitleId(text, i),
        label,
        text,
        is_primary: Boolean(entry.is_primary),
        thumbnail_text: readString(entry.thumbnail_text) ?? deriveHearthThumbnailOverlayText(text),
      });
      continue;
    }
    const text = readString(entry);
    if (!text) continue;
    out.push({
      id: normalizeTitleId(text, i),
      label: SEO_LABELS[i] ?? `V${i + 1}`,
      text,
      is_primary: false,
      thumbnail_text: deriveHearthThumbnailOverlayText(text),
    });
  }
  if (out.length && !out.some((title) => title.is_primary)) {
    out[0] = { ...out[0], is_primary: true };
  }
  return out;
}

function normalizeLegacyTitleVariants(value: unknown): EpisodeSeoTitle[] {
  if (!isRecord(value)) return [];
  const variants: EpisodeSeoTitle[] = [];
  for (const label of ["A", "B", "C"] as const) {
    const text = readString(value[label]);
    if (!text) continue;
    variants.push({
      id: `seo-title-${label.toLowerCase()}`,
      label,
      text,
      is_primary: label === "A",
      thumbnail_text: deriveHearthThumbnailOverlayText(text),
    });
  }
  return variants;
}

function normalizeThumbnailConcepts(value: unknown): EpisodeThumbnailConcept[] {
  if (!Array.isArray(value)) return [];
  const out: EpisodeThumbnailConcept[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (isRecord(entry)) {
      const promptText = readString(entry.prompt_text)
        ?? readString(entry.prompt)
        ?? readString(entry.image_concept);
      if (!promptText) continue;
      const label = readString(entry.label)
        ?? readString(entry.headline)
        ?? `Concept ${i + 1}`;
      out.push({
        id: readString(entry.id) ?? readString(entry.concept_revision_id) ?? `concept-${String(i + 1).padStart(2, "0")}`,
        label,
        prompt_text: promptText,
        style_preset: normalizeHearthVisualStyle(readString(entry.style_preset) ?? readString(entry.mood_style) ?? null),
        title_style: normalizeEpisodeThumbnailTitleStyle(entry.title_style),
        brand_template_id: readString(entry.brand_template_id),
        has_face: typeof entry.has_face === "boolean"
          ? entry.has_face
          : typeof entry.hasFace === "boolean"
            ? entry.hasFace
            : undefined,
        emotion_intensity: readNumber(entry.emotion_intensity) ?? readNumber(entry.emotionIntensity),
        text_length: readNumber(entry.text_length) ?? readNumber(entry.textLength),
        contrast_score: readNumber(entry.contrast_score) ?? readNumber(entry.contrastScore),
        novelty_score: readNumber(entry.novelty_score) ?? readNumber(entry.noveltyScore),
        topic_relevance: readNumber(entry.topic_relevance) ?? readNumber(entry.topicRelevance),
      });
      continue;
    }
    const promptText = readString(entry);
    if (!promptText) continue;
    out.push({
      id: `concept-${String(i + 1).padStart(2, "0")}`,
      label: `Concept ${i + 1}`,
      prompt_text: promptText,
      style_preset: DEFAULT_HEARTH_VISUAL_STYLE,
      title_style: DEFAULT_TITLE_STYLE,
      brand_template_id: null,
      has_face: undefined,
      emotion_intensity: null,
      text_length: null,
      contrast_score: null,
      novelty_score: null,
      topic_relevance: null,
    });
  }
  return out;
}

function normalizeThumbnailVersions(value: unknown): EpisodeThumbnailVersion[] {
  if (!Array.isArray(value)) return [];
  const out: EpisodeThumbnailVersion[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (!isRecord(entry)) continue;
    const conceptId = readString(entry.concept_id);
    const provider = readString(entry.provider);
    const prompt = readString(entry.prompt);
    const assetId = readString(entry.asset_id);
    const status = readString(entry.status);
    if (!conceptId || !provider || !prompt || !assetId || !status) continue;
    out.push({
      id: readString(entry.id) ?? `thumb-version-${i + 1}`,
      concept_id: conceptId,
      created_at: normalizeIso(entry.created_at),
      provider,
      prompt,
      asset_id: assetId,
      status,
      provider_request_id: readString(entry.provider_request_id),
      asset_path: readString(entry.asset_path),
      mime_type: readString(entry.mime_type),
      error: readString(entry.error),
    });
  }
  return out;
}

function normalizeLaunchVariants(
  value: unknown,
  args: {
    titles: readonly EpisodeSeoTitle[];
    versions: readonly EpisodeThumbnailVersion[];
  },
): EpisodeLaunchVariant[] {
  if (!Array.isArray(value)) return [];
  const titleIds = new Set(args.titles.map((title) => title.id));
  const versionIds = new Set(args.versions.map((version) => version.id));
  const seen = new Set<string>();
  const out: EpisodeLaunchVariant[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (!isRecord(entry)) continue;
    const id = readString(entry.id) ?? `launch-variant-${String(i + 1).padStart(2, "0")}`;
    const titleId = readString(entry.title_id) ?? readString(entry.seo_title_id);
    const thumbnailVersionId = readString(entry.thumbnail_version_id) ?? readString(entry.version_id);
    if (!titleId || !thumbnailVersionId) continue;
    if (!titleIds.has(titleId) || !versionIds.has(thumbnailVersionId) || seen.has(id)) continue;
    seen.add(id);
    const createdAt = normalizeIso(entry.created_at);
    const status = EPISODE_LAUNCH_VARIANT_STATUS_VALUES.includes(entry.status as EpisodeLaunchVariantStatus)
      ? entry.status as EpisodeLaunchVariantStatus
      : "draft";
    const notes = readString(entry.notes) ?? null;
    const lastTestedAt = normalizeOptionalIso(entry.last_tested_at);
    const winnerSelectedAt = status === "winner" ? normalizeOptionalIso(entry.winner_selected_at) : null;
    out.push({
      id,
      title_id: titleId,
      thumbnail_version_id: thumbnailVersionId,
      created_at: createdAt,
      updated_at: normalizeIso(entry.updated_at, createdAt),
      status,
      notes,
      last_tested_at: lastTestedAt,
      winner_selected_at: winnerSelectedAt,
    });
  }

  return out;
}

function normalizeImageMapEntries(value: unknown): EpisodeImageMapEntry[] {
  if (!Array.isArray(value)) return [];
  const out: EpisodeImageMapEntry[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (!isRecord(entry)) continue;
    const scriptAnchor = normalizeImageMapScriptAnchor(entry.script_anchor);
    const rawPurpose = readString(entry.purpose) as HearthVisualPurpose | null;
    const beatAnchor = normalizeBulletBeatAnchor(entry.beat_anchor, rawPurpose ?? undefined);
    const anchor = resolveImageMapDisplayAnchor(
      readString(entry.anchor) ?? readString(entry.attach_after),
      scriptAnchor,
      beatAnchor,
    );
    const description = typeof entry.description === "string" ? entry.description : "";
    const sourceType = readString(entry.source_type) ?? "stock";
    if (!anchor) continue;
    const candidateAssets = normalizeImageMapAssetRefs(entry.candidate_assets);
    const selectedAssetId = normalizeSelectedImageMapAssetId(readString(entry.selected_asset_id), candidateAssets);
    const visualIntent = readString(entry.visual_intent) ?? description;
    const promptBasis = readString(entry.prompt_basis) ?? readString(entry.prompt) ?? description;
    const intent = normalizeImageMapIntent(readString(entry.intent));
    const visualPriority = normalizeImageMapVisualPriority(readString(entry.visual_priority));
    const visualType = normalizeImageMapVisualType(readString(entry.visual_type));
    const assessment = isRecord(entry.canonical_anchor_assessment) ? entry.canonical_anchor_assessment : null;
    const assessmentState = assessment && ["current", "stale", "unresolved", "provenance_unknown"].includes(String(assessment.state))
      ? assessment.state as "current" | "stale" | "unresolved" | "provenance_unknown"
      : null;
    out.push({
      id: readString(entry.id) ?? `image-map-${String(i + 1).padStart(2, "0")}`,
      anchor,
      script_anchor: scriptAnchor,
      beat_anchor: beatAnchor,
      anchor_scope: normalizeImageMapAnchorScope(readString(entry.anchor_scope), scriptAnchor, beatAnchor),
      purpose: deriveImageMapPurpose({
        rawPurpose: readString(entry.purpose),
        visualPriority,
        visualType,
        intent,
        description,
        visualIntent,
        promptBasis,
      }),
      description,
      visual_intent: visualIntent,
      prompt_basis: promptBasis,
      style_preset: normalizeHearthVisualStyle(readString(entry.style_preset) ?? readString(entry.visual_style) ?? null),
      intent,
      source_type: normalizeImageMapSourceType(sourceType),
      origin: normalizeImageMapOrigin(readString(entry.origin)),
      visual_priority: visualPriority,
      visual_type: visualType,
      section_intent_note: readString(entry.section_intent_note),
      beat_order: readInteger(entry.beat_order) ?? (i + 1),
      paragraph_beat_order: readInteger(entry.paragraph_beat_order) ?? 1,
      candidate_assets: candidateAssets,
      selected_asset_id: selectedAssetId,
      status: normalizeDerivedImageMapStatus(
        normalizeImageMapStatus(readString(entry.status) ?? (scriptAnchor || beatAnchor ? "mapped" : "draft")),
        scriptAnchor,
        beatAnchor,
        candidateAssets,
        selectedAssetId,
      ),
      placement_hint: readString(entry.placement_hint) ?? readString(entry.match),
      ...(assessmentState ? { canonical_anchor_assessment: { state: assessmentState, reason: readString(assessment!.reason), exact_anchor: normalizeImageMapScriptAnchor(assessment!.exact_anchor), evidence: isRecord(assessment!.evidence) ? assessment!.evidence : {} } } : {}),
    });
  }
  return out;
}

function createImageMapEntryId(prefix = "image-map"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeImageMapIntent(value: string | null | undefined): EpisodeImageMapIntent {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "other";
  if (EPISODE_IMAGE_MAP_INTENT_VALUES.includes(normalized as EpisodeImageMapIntent)) {
    return normalized as EpisodeImageMapIntent;
  }
  return "other";
}

function normalizeImageMapSourceType(value: string | null | undefined): EpisodeImageMapSourceType {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "stock";
  if (EPISODE_IMAGE_MAP_SOURCE_TYPE_VALUES.includes(normalized as EpisodeImageMapSourceType)) {
    return normalized as EpisodeImageMapSourceType;
  }
  return "stock";
}

function normalizeImageMapStatus(value: string | null | undefined): EpisodeImageMapStatus {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "draft";
  if (EPISODE_IMAGE_MAP_STATUS_VALUES.includes(normalized as EpisodeImageMapStatus)) {
    return normalized as EpisodeImageMapStatus;
  }
  return "draft";
}

function normalizeImageMapAnchorScope(
  value: string | null | undefined,
  scriptAnchor: EpisodeImageMapScriptAnchor | null,
  beatAnchor: EpisodeBulletBeatAnchor | null,
): EpisodeImageMapAnchorScope {
  const normalized = value?.trim().toLowerCase();
  if (normalized && EPISODE_IMAGE_MAP_ANCHOR_SCOPE_VALUES.includes(normalized as EpisodeImageMapAnchorScope)) {
    return normalized as EpisodeImageMapAnchorScope;
  }
  if (beatAnchor) return "beat";
  return scriptAnchor ? "attached" : "orphaned";
}

function normalizeImageMapVisualPriority(value: string | null | undefined): EpisodeImageMapVisualPriority {
  const normalized = value?.trim().toLowerCase();
  if (normalized && EPISODE_IMAGE_MAP_VISUAL_PRIORITY_VALUES.includes(normalized as EpisodeImageMapVisualPriority)) {
    return normalized as EpisodeImageMapVisualPriority;
  }
  return "supporting";
}

function normalizeImageMapVisualType(value: string | null | undefined): EpisodeImageMapVisualType {
  const normalized = value?.trim().toLowerCase();
  if (normalized && EPISODE_IMAGE_MAP_VISUAL_TYPE_VALUES.includes(normalized as EpisodeImageMapVisualType)) {
    return normalized as EpisodeImageMapVisualType;
  }
  return "still_image";
}

function normalizeImageMapAssetSource(value: string | null | undefined): EpisodeImageMapAssetSource | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (EPISODE_IMAGE_MAP_ASSET_SOURCE_VALUES.includes(normalized as EpisodeImageMapAssetSource)) {
    return normalized as EpisodeImageMapAssetSource;
  }
  return null;
}

function normalizeImageMapOrigin(value: string | null | undefined): EpisodeImageMapOrigin {
  const normalized = value?.trim().toLowerCase();
  if (normalized && EPISODE_IMAGE_MAP_ORIGIN_VALUES.includes(normalized as EpisodeImageMapOrigin)) {
    return normalized as EpisodeImageMapOrigin;
  }
  return "hearth";
}

function normalizeImageMapAssetRefs(value: unknown): EpisodeImageMapAssetRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: EpisodeImageMapAssetRef[] = [];
  for (const entry of value) {
    if (isRecord(entry)) {
      const assetId = readString(entry.asset_id) ?? readString(entry.id);
      if (!assetId || seen.has(assetId)) continue;
      seen.add(assetId);
      out.push({
        asset_id: assetId,
        path: readString(entry.path),
        variant_label: readString(entry.variant_label),
        visual_mode: normalizeImageMapVisualMode(readString(entry.visual_mode)),
        mime_type: readString(entry.mime_type),
        source: normalizeImageMapAssetSource(readString(entry.source)),
      });
      continue;
    }
    const assetId = readString(entry);
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    out.push({
      asset_id: assetId,
      path: null,
      variant_label: null,
      visual_mode: null,
      mime_type: null,
      source: null,
    });
  }
  return out;
}

function normalizeImageMapVisualMode(value: string | null | undefined): EpisodeImageMapVisualMode | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (EPISODE_IMAGE_MAP_VISUAL_MODE_VALUES.includes(normalized as EpisodeImageMapVisualMode)) {
    return normalized as EpisodeImageMapVisualMode;
  }
  return null;
}

function normalizeSelectedImageMapAssetId(
  value: string | null | undefined,
  candidateAssets: readonly EpisodeImageMapAssetRef[],
): string | null {
  const selectedAssetId = readString(value);
  if (!selectedAssetId) return null;
  return candidateAssets.some((asset) => asset.asset_id === selectedAssetId) ? selectedAssetId : null;
}

function normalizeDerivedImageMapStatus(
  value: EpisodeImageMapStatus,
  scriptAnchor: EpisodeImageMapScriptAnchor | null,
  beatAnchor: EpisodeBulletBeatAnchor | null,
  candidateAssets: readonly EpisodeImageMapAssetRef[],
  selectedAssetId: string | null,
): EpisodeImageMapStatus {
  if (selectedAssetId) return "selected";
  if (candidateAssets.length > 0) return "candidates_generated";
  if (value === "selected") {
    return scriptAnchor || beatAnchor ? "mapped" : "draft";
  }
  return value;
}

function normalizeImageMapScriptAnchor(value: unknown): EpisodeImageMapScriptAnchor | null {
  if (!isRecord(value)) return null;
  const sectionId = readString(value.section_id);
  const paragraphId = readString(value.paragraph_id);
  const paragraphOrder = readInteger(value.paragraph_order);
  const sentenceStart = readInteger(value.sentence_start);
  const sentenceEnd = readInteger(value.sentence_end);
  const charStart = readInteger(value.char_start);
  const charEnd = readInteger(value.char_end);
  const spanText = readString(value.span_text);
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
  if (paragraphOrder < 1 || sentenceStart < 1 || sentenceEnd < sentenceStart || charStart < 0 || charEnd <= charStart) {
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
    speaker_block_id: readString(value.speaker_block_id) ?? null,
  };
}

function normalizeSpokenBeatSpeaker(value: string | null | undefined): EpisodeSpokenBeatSpeaker | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (EPISODE_SPOKEN_BEAT_SPEAKER_VALUES.includes(normalized as EpisodeSpokenBeatSpeaker)) {
    return normalized as EpisodeSpokenBeatSpeaker;
  }
  return null;
}

function normalizeSpokenBeatFormat(value: string | null | undefined): EpisodeSpokenBeatFormat {
  const normalized = value?.trim().toLowerCase();
  if (normalized && EPISODE_SPOKEN_BEAT_FORMAT_VALUES.includes(normalized as EpisodeSpokenBeatFormat)) {
    return normalized as EpisodeSpokenBeatFormat;
  }
  return "bullet_outline";
}

function normalizeSpokenBeat(value: unknown, fallbackOrder: number): EpisodeSpokenBeat | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const speaker = normalizeSpokenBeatSpeaker(readString(value.speaker));
  const text = readString(value.text);
  const normalizedLabel = readString(value.normalized_label);
  if (!id || !speaker || !text || !normalizedLabel) return null;

  const order = Math.max(1, readInteger(value.order) ?? fallbackOrder);
  const speakerOrder = Math.max(1, readInteger(value.speaker_order) ?? 1);
  const speakerTurn = Math.max(1, readInteger(value.speaker_turn) ?? 1);
  return {
    id,
    speaker,
    format: normalizeSpokenBeatFormat(readString(value.format)),
    order,
    speaker_order: speakerOrder,
    speaker_turn: speakerTurn,
    text,
    normalized_label: normalizedLabel,
    cue_phrase: readString(value.cue_phrase),
  };
}

function normalizeSpokenBeats(value: unknown): EpisodeSpokenBeat[] {
  if (!Array.isArray(value)) return [];
  const out: EpisodeSpokenBeat[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const beat = normalizeSpokenBeat(value[index], index + 1);
    if (!beat || seen.has(beat.id)) continue;
    seen.add(beat.id);
    out.push(beat);
  }
  return out;
}

function normalizeBulletBeatAnchor(
  value: unknown,
  fallbackPurpose?: HearthVisualPurpose,
): EpisodeBulletBeatAnchor | null {
  if (!isRecord(value)) return null;
  const beatId = readString(value.beat_id);
  const speaker = normalizeSpokenBeatSpeaker(readString(value.speaker));
  if (readString(value.mode)?.toLowerCase() !== "bullet_beat" || !beatId || !speaker) {
    return null;
  }

  return {
    mode: "bullet_beat",
    beat_id: beatId,
    speaker,
    beat_index: Math.max(1, readInteger(value.beat_index) ?? 1),
    speaker_order: Math.max(1, readInteger(value.speaker_order) ?? 1),
    speaker_turn: Math.max(1, readInteger(value.speaker_turn) ?? 1),
    beat_label: readString(value.beat_label),
    cue_phrase: readString(value.cue_phrase),
    purpose: deriveImageMapPurpose({
      rawPurpose: readString(value.purpose) ?? fallbackPurpose,
      visualPriority: null,
      visualType: null,
      intent: null,
      description: readString(value.beat_label),
      visualIntent: readString(value.beat_label),
      promptBasis: readString(value.cue_phrase),
    }),
  };
}

export function buildImageMapAnchorLabel(anchor: EpisodeImageMapScriptAnchor | null): string {
  if (!anchor) return "";
  const sentenceRange = anchor.sentence_start === anchor.sentence_end
    ? `sent${anchor.sentence_start}`
    : `sent${anchor.sentence_start}-${anchor.sentence_end}`;
  return `${anchor.paragraph_id}#${sentenceRange}`;
}

export function buildBulletBeatAnchorLabel(anchor: EpisodeBulletBeatAnchor | null): string {
  if (!anchor) return "";
  const beatLabel = readString(anchor.beat_label) ?? readString(anchor.cue_phrase);
  if (beatLabel) {
    return `${anchor.speaker} beat ${anchor.beat_index}: ${beatLabel}`;
  }
  return `${anchor.speaker} beat ${anchor.beat_index}`;
}

export function resolveImageMapDisplayAnchor(
  anchor: string | null | undefined,
  scriptAnchor: EpisodeImageMapScriptAnchor | null | undefined,
  beatAnchor?: EpisodeBulletBeatAnchor | null | undefined,
): string {
  const displayAnchor = readString(anchor);
  const spanText = readString(scriptAnchor?.span_text);
  const beatLabel = beatAnchor ? buildBulletBeatAnchorLabel(beatAnchor) : null;
  const structuralAnchorLabel = buildImageMapAnchorLabel(scriptAnchor ?? null);
  if (spanText && (!displayAnchor || displayAnchor === structuralAnchorLabel)) {
    return spanText;
  }
  return displayAnchor ?? spanText ?? beatLabel ?? structuralAnchorLabel;
}

function normalizeImageMapEntryPatch(args: {
  entry: Partial<EpisodeImageMapEntry>;
  fallbackId?: string;
  fallbackBeatOrder?: number;
  fallbackParagraphBeatOrder?: number;
}): EpisodeImageMapEntry | null {
  const scriptAnchor = normalizeImageMapScriptAnchor(args.entry.script_anchor);
  const beatAnchor = normalizeBulletBeatAnchor(args.entry.beat_anchor, args.entry.purpose);
  const anchor = resolveImageMapDisplayAnchor(readString(args.entry.anchor), scriptAnchor, beatAnchor);
  const description = typeof args.entry.description === "string" ? args.entry.description : "";
  const id = readString(args.entry.id) ?? args.fallbackId ?? createImageMapEntryId();
  if (!anchor || !id) return null;
  const candidateAssets = normalizeImageMapAssetRefs(args.entry.candidate_assets);
  const selectedAssetId = normalizeSelectedImageMapAssetId(readString(args.entry.selected_asset_id), candidateAssets);
  const visualIntent = readString(args.entry.visual_intent) ?? description;
  const promptBasis = readString(args.entry.prompt_basis) ?? description;
  const intent = normalizeImageMapIntent(readString(args.entry.intent));
  const visualPriority = normalizeImageMapVisualPriority(readString(args.entry.visual_priority));
  const visualType = normalizeImageMapVisualType(readString(args.entry.visual_type));
  const assessment = isRecord(args.entry.canonical_anchor_assessment) ? args.entry.canonical_anchor_assessment : null;
  const assessmentState = assessment && ["current", "stale", "unresolved", "provenance_unknown"].includes(String(assessment.state))
    ? assessment.state as "current" | "stale" | "unresolved" | "provenance_unknown"
    : null;
  return {
    id,
    anchor,
    script_anchor: scriptAnchor,
    beat_anchor: beatAnchor,
    anchor_scope: normalizeImageMapAnchorScope(readString(args.entry.anchor_scope), scriptAnchor, beatAnchor),
    purpose: deriveImageMapPurpose({
      rawPurpose: readString(args.entry.purpose),
      visualPriority,
      visualType,
      intent,
      description,
      visualIntent,
      promptBasis,
    }),
    description,
    visual_intent: visualIntent,
    prompt_basis: promptBasis,
    style_preset: normalizeHearthVisualStyle(args.entry.style_preset ?? null),
    intent,
    source_type: normalizeImageMapSourceType(readString(args.entry.source_type)),
    origin: normalizeImageMapOrigin(readString(args.entry.origin)),
    visual_priority: visualPriority,
    visual_type: visualType,
    section_intent_note: readString(args.entry.section_intent_note),
    beat_order: readInteger(args.entry.beat_order) ?? args.fallbackBeatOrder ?? 1,
    paragraph_beat_order: readInteger(args.entry.paragraph_beat_order) ?? args.fallbackParagraphBeatOrder ?? 1,
    candidate_assets: candidateAssets,
    selected_asset_id: selectedAssetId,
    status: normalizeDerivedImageMapStatus(
      normalizeImageMapStatus(readString(args.entry.status) ?? (scriptAnchor || beatAnchor ? "mapped" : "draft")),
      scriptAnchor,
      beatAnchor,
      candidateAssets,
      selectedAssetId,
    ),
    placement_hint: readString(args.entry.placement_hint) ?? null,
    ...(assessmentState ? {
      canonical_anchor_assessment: {
        state: assessmentState,
        reason: readString(assessment!.reason),
        exact_anchor: normalizeImageMapScriptAnchor(assessment!.exact_anchor),
        evidence: isRecord(assessment!.evidence) ? assessment!.evidence : {},
      },
    } : {}),
  };
}

function parseSectionBody(rawText: string, sectionHeader: string): string {
  const lines = rawText.split(/\r?\n/);
  const flexibleHeader = sectionHeader.replace(/_/g, "[\\s_-]+");
  const headerRe = new RegExp(`^\\s*${flexibleHeader}\\s*:?\\s*$`, "i");
  const genericHeaderRe = /^\s*[A-Z0-9_ ]{3,}\s*:\s*$/;
  let collecting = false;
  const collected: string[] = [];
  for (const line of lines) {
    const normalizedLine = line
      .replace(/^\s*#{1,6}\s*/, "")
      .replace(/^\s*\*\*(.*?)\*\*\s*$/, "$1")
      .trim();
    if (!collecting) {
      if (headerRe.test(normalizedLine)) collecting = true;
      continue;
    }
    if (genericHeaderRe.test(normalizedLine)) break;
    collected.push(line);
  }
  return collected.join("\n").trim();
}

function projectV3BaseVersions(value: unknown): EpisodeThumbnailVersion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const id = readString(entry.id) ?? `thumb-base-${index + 1}`;
    const conceptId = readString(entry.concept_revision_id);
    const assetId = readString(entry.asset_id);
    const status = readString(entry.status);
    if (!conceptId || !assetId || !status) return [];
    const errorDetails = isRecord(entry.error_details) ? entry.error_details : null;
    return [{
      id, concept_id: conceptId, created_at: normalizeIso(entry.created_at),
      provider: readString(entry.provider_id) ?? readString(entry.source_type) ?? "unknown",
      prompt: "", asset_id: assetId, status,
      provider_request_id: readString(entry.provider_request_id), asset_path: readString(entry.asset_path),
      mime_type: readString(entry.mime_type), error: errorDetails ? JSON.stringify(errorDetails) : null,
    }];
  });
}

function parseProductionJson(rawText: string): Record<string, unknown> | null {
  const trimmed = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readProductionArray(rawText: string, keys: string[]): unknown[] {
  const parsed = parseProductionJson(rawText);
  if (!parsed) return [];
  for (const key of keys) {
    if (Array.isArray(parsed[key])) return parsed[key] as unknown[];
  }
  for (const containerKey of ["seo", "framing", "result", "data"]) {
    const container = parsed[containerKey];
    if (!container || typeof container !== "object" || Array.isArray(container)) continue;
    for (const key of keys) {
      const value = (container as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function readProductionString(rawText: string, keys: string[]): string | null {
  const parsed = parseProductionJson(rawText);
  if (!parsed) return null;
  for (const key of keys) {
    const value = readString(parsed[key]);
    if (value) return value;
  }
  for (const containerKey of ["seo", "framing", "result", "data", "descriptions"]) {
    const container = parsed[containerKey];
    if (!container || typeof container !== "object" || Array.isArray(container)) continue;
    for (const key of keys) {
      const value = readString((container as Record<string, unknown>)[key]);
      if (value) return value;
    }
  }
  return null;
}

export function parseSeoTitlesFromText(rawText: string): EpisodeSeoTitle[] {
  const jsonTitles = readProductionArray(rawText, ["titles", "seo_titles", "seoTitles"])
    .map((value) => typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? readString((value as Record<string, unknown>).text) ?? readString((value as Record<string, unknown>).title)
        : null)
    .filter((value): value is string => Boolean(value));
  const body = parseSectionBody(rawText, "SEO_TITLES");
  if (!body && jsonTitles.length === 0) return [];
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (jsonTitles.length) lines.push(...jsonTitles);
  const titles: EpisodeSeoTitle[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i]?.replace(/^(?:[-*]|\d+[.)])\s*/, "") ?? "")
      .replace(/\*\*/g, "")
      .trim();
    if (!line || /^```/.test(line)) continue;
    const labeled = line.match(/^([A-Z0-9_]+)\s*(?::|\||-|—|–)\s*(.+)$/i);
    const text = labeled?.[2]?.trim() ?? line.trim();
    if (!text) continue;
    const label = labeled?.[1]?.trim() ?? SEO_LABELS[i] ?? `V${i + 1}`;
    titles.push({
      id: normalizeTitleId(text, i),
      label,
      text,
      is_primary: i === 0,
      thumbnail_text: deriveHearthThumbnailOverlayText(text),
    });
  }
  return titles;
}

export function parseDescriptionFromSeoText(rawText: string): {
  shortDescription: string | null;
  longDescription: string | null;
} {
  const jsonShort = readProductionString(rawText, ["short_description", "description_short", "shortDescription"]);
  const jsonLong = readProductionString(rawText, ["long_description", "description_long", "longDescription", "description"]);
  if (jsonShort || jsonLong) {
    return { shortDescription: jsonShort, longDescription: jsonLong };
  }
  const explicitShort = parseSectionBody(rawText, "SHORT_DESCRIPTION").trim() || null;
  const explicitLong = parseSectionBody(rawText, "LONG_DESCRIPTION").trim() || null;
  if (explicitShort || explicitLong) {
    return {
      shortDescription: explicitShort,
      longDescription: explicitLong,
    };
  }
  const body = parseSectionBody(rawText, "DESCRIPTION");
  if (!body) return { shortDescription: null, longDescription: null };
  const longDescription = body.trim() || null;
  if (!longDescription) return { shortDescription: null, longDescription: null };
  const shortDescription = longDescription.length > 180
    ? `${longDescription.slice(0, 177).trimEnd()}...`
    : longDescription;
  return {
    shortDescription,
    longDescription,
  };
}

export function parseTagsFromText(rawText: string): string[] {
  const jsonTags = readProductionArray(rawText, ["tags", "full_tags", "tags_full", "top_tags", "tags_top10"])
    .map((value) => typeof value === "string" ? value : null)
    .filter((value): value is string => Boolean(value));
  if (jsonTags.length) return dedupeTags(jsonTags);
  const full = parseSectionBody(rawText, "TAGS_FULL");
  if (full) return dedupeTags(parseCsvTags(full.replace(/^(?:[-*]|\d+[.)])\s*/gm, "")));
  const top10 = parseSectionBody(rawText, "TAGS_TOP10");
  if (top10) return dedupeTags(parseCsvTags(top10.replace(/^(?:[-*]|\d+[.)])\s*/gm, "")));
  const generic = parseSectionBody(rawText, "TAGS");
  if (generic) return dedupeTags(parseCsvTags(generic.replace(/^(?:[-*]|\d+[.)])\s*/gm, "")));
  return [];
}

export type ThumbnailConceptParseDiagnostic = {
  branch: "line_blocks";
  concepts: EpisodeThumbnailConcept[];
  recognizedHeaders: number;
  completeBlocks: number;
  structuralErrors: string[];
};

export function diagnoseThumbnailConceptParsing(rawText: string): ThumbnailConceptParseDiagnostic {
  const lines = rawText.split(/\r?\n/);
  const concepts: EpisodeThumbnailConcept[] = [];
  let recognizedHeaders = 0;
  let currentId: string | null = null;
  let headline: string | null = null;
  let imageConcept: string | null = null;
  let moodStyle: string | null = null;

  const flush = () => {
    if (!currentId) return;
    const promptText = [imageConcept, moodStyle].filter(Boolean).join(" | ");
    if (!headline || !imageConcept || !moodStyle) {
      currentId = null;
      headline = null;
      imageConcept = null;
      moodStyle = null;
      return;
    }
    concepts.push({
      id: `concept-${currentId.toLowerCase()}`,
      label: headline,
      prompt_text: promptText,
      style_preset: normalizeHearthVisualStyle(moodStyle),
      title_style: DEFAULT_TITLE_STYLE,
      brand_template_id: null,
    });
    currentId = null;
    headline = null;
    imageConcept = null;
    moodStyle = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim()
      .replace(/^#{1,6}\s*/, "")
      .replace(/^(?:[-+*>]|\d+[.)])\s+/, "")
      .replace(/\*\*|__/g, "")
      .trim();
    if (!line) continue;
    const header = line.match(/^THUMBNAIL[_\s-]*(\d{1,3})\s*[:.-]?$/i);
    if (header) {
      flush();
      recognizedHeaders += 1;
      currentId = header[1]?.padStart(2, "0") ?? "01";
      continue;
    }
    if (!currentId) continue;
    const headlineMatch = line.match(/^(?:Headline|Title|Hook):\s*(.+)$/i);
    if (headlineMatch?.[1]) {
      headline = headlineMatch[1].trim();
      continue;
    }
    const imageMatch = line.match(/^(?:Image concept|Visual concept|Render direction|Image|Visual):\s*(.+)$/i);
    if (imageMatch?.[1]) {
      imageConcept = imageMatch[1].trim();
      continue;
    }
    const moodMatch = line.match(/^(?:Mood\s*\/\s*style|Mood and style|Mood|Style):\s*(.+)$/i);
    if (moodMatch?.[1]) {
      moodStyle = moodMatch[1].trim();
    }
  }

  flush();
  const structuralErrors: string[] = [];
  if (recognizedHeaders === 0) {
    structuralErrors.push("No THUMBNAIL 1-5 concept headers were present in the stored response.");
  } else if (concepts.length !== recognizedHeaders) {
    structuralErrors.push(`${recognizedHeaders - concepts.length} recognized concept block(s) were missing a headline, image concept, or mood/style field.`);
  }
  if (concepts.length !== 5) structuralErrors.push(`Expected exactly 5 complete, distinct concept blocks; recognized ${concepts.length}.`);
  return { branch: "line_blocks", concepts, recognizedHeaders, completeBlocks: concepts.length, structuralErrors };
}

export function parseThumbnailConceptsFromText(rawText: string): EpisodeThumbnailConcept[] {
  return diagnoseThumbnailConceptParsing(rawText).concepts;
}

export type ParsedThumbnailCreativeAuthority = {
  strategy: {
    episodePromise: string;
    intendedViewer: string;
    curiosityMechanism: string;
    editorialPositioning: string;
    truthfulConnection: string;
    prohibitedExaggerations: string[];
  };
  briefs: Array<{
    subjectDirection: string;
    focalAction: string;
    compositionDirection: string;
    emotionalTone: string;
    visualHierarchy: string;
    titleCompatibility: string;
    expectationIntegrityRationale: string;
    providerNeutralRenderDirection: string;
  }>;
};

export function parseThumbnailCreativeAuthorityFromText(rawText: string): ParsedThumbnailCreativeAuthority | null {
  const fields = new Map<string, string>();
  const briefFields: Array<Map<string, string>> = [];
  let currentBrief: Map<string, string> | null = null;
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^#{1,6}\s*/, "").replace(/\*\*|__/g, "").trim();
    const header = line.match(/^THUMBNAIL[_\s-]*(\d{1,3})\s*[:.-]?$/i);
    if (header) {
      currentBrief = new Map<string, string>();
      briefFields[Number(header[1]) - 1] = currentBrief;
      continue;
    }
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match?.[1] || !match[2]) continue;
    const key = match[1].trim().toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
    (currentBrief ?? fields).set(key, match[2].trim());
  }
  const strategyValues = ["episode_promise", "intended_viewer", "curiosity_mechanism", "editorial_positioning", "truthful_connection"];
  if (strategyValues.some((key) => !fields.get(key)?.trim()) || briefFields.length !== 5) return null;
  const briefs = briefFields.map((brief) => ({
    subjectDirection: brief?.get("subject") ?? "",
    focalAction: brief?.get("focal_action") ?? "",
    compositionDirection: brief?.get("composition") ?? "",
    emotionalTone: brief?.get("emotional_tone") ?? brief?.get("mood_style") ?? "",
    visualHierarchy: brief?.get("visual_hierarchy") ?? "",
    titleCompatibility: brief?.get("title_compatibility") ?? "",
    expectationIntegrityRationale: brief?.get("integrity_rationale") ?? "",
    providerNeutralRenderDirection: brief?.get("render_direction") ?? brief?.get("image_concept") ?? "",
  }));
  if (briefs.some((brief) => Object.values(brief).some((value) => !value.trim()))) return null;
  return {
    strategy: {
      episodePromise: fields.get("episode_promise")!, intendedViewer: fields.get("intended_viewer")!,
      curiosityMechanism: fields.get("curiosity_mechanism")!, editorialPositioning: fields.get("editorial_positioning")!,
      truthfulConnection: fields.get("truthful_connection")!,
      prohibitedExaggerations: (fields.get("prohibited_exaggerations") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    },
    briefs,
  };
}

export function parseImageMapEntriesFromText(rawText: string): EpisodeImageMapEntry[] {
  const lines = rawText.split(/\r?\n/);
  const entries: EpisodeImageMapEntry[] = [];
  let currentId: string | null = null;
  let anchor: string | null = null;
  let description: string | null = null;
  let prompt: string | null = null;
  let matchHint: string | null = null;

  const flush = () => {
    if (!currentId || !anchor || !description || !prompt) {
      currentId = null;
      anchor = null;
      description = null;
      prompt = null;
      matchHint = null;
      return;
    }
    entries.push({
      id: `image-map-${currentId.toLowerCase()}`,
      anchor,
      script_anchor: null,
      anchor_scope: "orphaned",
      purpose: deriveImageMapPurpose({
        visualType: "still_image",
        intent: "graphic",
        description,
        visualIntent: description,
        promptBasis: prompt,
      }),
      description,
      visual_intent: description,
      prompt_basis: prompt,
      style_preset: DEFAULT_HEARTH_VISUAL_STYLE,
      intent: "graphic",
      source_type: "stock",
      visual_priority: "supporting",
      visual_type: "still_image",
      section_intent_note: null,
      beat_order: entries.length + 1,
      paragraph_beat_order: 1,
      candidate_assets: [],
      selected_asset_id: null,
      status: "mapped",
      placement_hint: matchHint,
    });
    currentId = null;
    anchor = null;
    description = null;
    prompt = null;
    matchHint = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const header = line.match(/^IMAGE_(\d{1,3})$/i);
    if (header) {
      flush();
      currentId = header[1]?.padStart(2, "0") ?? "01";
      continue;
    }
    if (!currentId) continue;
    const anchorMatch = line.match(/^Attach after:\s*["“](.+)["”]\s*$/i);
    if (anchorMatch?.[1]) {
      anchor = anchorMatch[1].trim();
      continue;
    }
    const descriptionMatch = line.match(/^Description:\s*(.+)$/i);
    if (descriptionMatch?.[1]) {
      description = descriptionMatch[1].trim();
      continue;
    }
    const promptMatch = line.match(/^Prompt:\s*(.+)$/i);
    if (promptMatch?.[1]) {
      prompt = promptMatch[1].trim();
      continue;
    }
    const matchMatch = line.match(/^Match:\s*(.+)$/i);
    if (matchMatch?.[1]) {
      matchHint = matchMatch[1].trim();
    }
  }

  flush();
  return entries;
}

function normalizeImageMapImportLookupText(rawText: string | null | undefined): string {
  return (rawText ?? "")
    .replace(/^[“”"'`]+|[“”"'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function rehydrateImportedImageBeatSheetEntries(args: {
  importedEntries: EpisodeImageMapEntry[];
  existingEntries: readonly EpisodeImageMapEntry[];
  resolveImageMapScriptAnchor?: ((anchorText: string, matchHint?: string | null) => EpisodeImageMapScriptAnchor | null) | null;
}): EpisodeImageMapEntry[] {
  return args.importedEntries.map((entry) => {
    const resolvedAnchor = args.resolveImageMapScriptAnchor?.(entry.anchor, entry.placement_hint ?? null)
      ?? (() => {
        const target = normalizeImageMapImportLookupText(entry.anchor);
        if (!target) return null;
        const existing = args.existingEntries.find((candidate) => {
          if (!candidate.script_anchor) return false;
          return (
            normalizeImageMapImportLookupText(candidate.script_anchor.span_text) === target
            || normalizeImageMapImportLookupText(candidate.anchor) === target
          );
        }) ?? null;
        return existing?.script_anchor ?? null;
      })();

    if (!resolvedAnchor) {
      return {
        ...entry,
        status: normalizeDerivedImageMapStatus(
          "draft",
          null,
          entry.beat_anchor ?? null,
          entry.candidate_assets,
          entry.selected_asset_id,
        ),
      };
    }

    return {
      ...entry,
      anchor: resolveImageMapDisplayAnchor(entry.anchor, resolvedAnchor),
      script_anchor: resolvedAnchor,
      status: normalizeDerivedImageMapStatus(
        "mapped",
        resolvedAnchor,
        entry.beat_anchor ?? null,
        entry.candidate_assets,
        entry.selected_asset_id,
      ),
    };
  });
}

function normalizeBrollPlacementHint(value: unknown): EpisodeBrollPlacementHint {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === "exact_timestamp") return "exact_timestamp";
  if (normalized === "manual") return "manual";
  return "first_occurrence";
}

function normalizeBrollMotionIntent(value: unknown): EpisodeBrollMotionIntent {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_BROLL_PLAN_MOTION_INTENT_VALUES.includes(normalized as EpisodeBrollMotionIntent)) {
    return normalized as EpisodeBrollMotionIntent;
  }
  return "broll";
}

function normalizeBrollSourceType(value: unknown): EpisodeBrollSourceType {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_BROLL_PLAN_SOURCE_TYPE_VALUES.includes(normalized as EpisodeBrollSourceType)) {
    return normalized as EpisodeBrollSourceType;
  }
  return "planned";
}

function normalizeBrollMotionAssetCategory(value: unknown): EpisodeBrollMotionAssetCategory | null {
  const normalized = readString(value)?.toLowerCase();
  if (
    normalized
    && EPISODE_BROLL_PLAN_MOTION_ASSET_CATEGORY_VALUES.includes(normalized as EpisodeBrollMotionAssetCategory)
  ) {
    return normalized as EpisodeBrollMotionAssetCategory;
  }
  return null;
}

function normalizeBrollCoverageStrength(value: unknown): EpisodeBrollCoverageStrength | undefined {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_BROLL_PLAN_COVERAGE_STRENGTH_VALUES.includes(normalized as EpisodeBrollCoverageStrength)) {
    return normalized as EpisodeBrollCoverageStrength;
  }
  return undefined;
}

function normalizeBrollPriority(value: unknown): EpisodeBrollPriority {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === "primary" || normalized === "supporting" || normalized === "background") {
    return normalized;
  }
  return "supporting";
}

function normalizeBrollShotType(value: unknown): EpisodeBrollShotType | null {
  const normalized = readString(value)?.toLowerCase();
  if (
    normalized === "close" || normalized === "medium" || normalized === "wide"
    || normalized === "macro" || normalized === "aerial" || normalized === "mixed"
  ) {
    return normalized;
  }
  return null;
}

function normalizeBrollOrigin(value: unknown): EpisodeBrollOrigin {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === "hearth" || normalized === "hammer" || normalized === "mixed") {
    return normalized;
  }
  return "hearth";
}

function normalizeBrollKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 24);
}

function normalizeBrollDataVisualSpec(value: unknown): EpisodeBrollDataVisualSpec | null {
  if (!isRecord(value)) return null;
  const chartTypeRaw = readString(value.chart_type)?.toLowerCase();
  const chartType = (
    chartTypeRaw === "bar"
    || chartTypeRaw === "line"
    || chartTypeRaw === "area"
    || chartTypeRaw === "pie"
    || chartTypeRaw === "timeline"
    || chartTypeRaw === "stat"
  ) ? chartTypeRaw : null;
  const labels = readStringArray(value.labels).slice(0, 24);
  const values = Array.isArray(value.values)
    ? value.values
      .map((entry) => readNumber(entry))
      .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
      .slice(0, 24)
    : [];
  const normalized: EpisodeBrollDataVisualSpec = {
    chart_type: chartType,
    title: readString(value.title),
    labels,
    values,
    emphasis_key: readString(value.emphasis_key),
    animation_style: readString(value.animation_style),
  };
  const hasContent = Boolean(
    normalized.chart_type
    || normalized.title
    || normalized.labels?.length
    || normalized.values?.length
    || normalized.emphasis_key
    || normalized.animation_style,
  );
  return hasContent ? normalized : null;
}

function deriveBrollAssetCategoryFromSource(args: {
  sourceType: EpisodeBrollSourceType;
  motionIntent: EpisodeBrollMotionIntent;
  mimeType?: string | null;
}): EpisodeBrollMotionAssetCategory {
  if (args.motionIntent === "data_visual") return "animated_chart";
  if (args.motionIntent === "map") return "map_animation";
  if (args.motionIntent === "timeline") return "timeline_graphic";
  if (args.motionIntent === "graphic") return "animated_graphic";
  if (args.motionIntent === "explanatory") return "stat_card";

  if (args.sourceType === "stock") return "stock_video";
  if (args.sourceType === "hearth_ai" || args.sourceType === "generated") return "ai_video";
  if (args.sourceType === "upload" || args.sourceType === "hammer_upload") return "uploaded_video";

  const mime = readString(args.mimeType)?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "uploaded_video";
  return "animated_graphic";
}

function normalizeBrollCandidateAssets(value: unknown): EpisodeBrollAssetCandidate[] {
  if (!Array.isArray(value)) return [];
  const candidates: EpisodeBrollAssetCandidate[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRecord(entry)) continue;
    const assetId = readString(entry.asset_id) ?? readString(entry.id) ?? `broll-asset-${String(index + 1).padStart(2, "0")}`;
    const source = normalizeBrollSourceType(entry.source);
    const mimeType = readString(entry.mime_type);
    const ingestStatusRaw = readString(entry.ingest_status)?.toLowerCase();
    const ingestStatus = ingestStatusRaw === "processing" || ingestStatusRaw === "ready" || ingestStatusRaw === "failed"
      ? ingestStatusRaw
      : null;
    candidates.push({
      asset_id: assetId,
      source,
      asset_class: normalizeVisualAssetClass(entry.asset_class),
      source_beat_id: readString(entry.source_beat_id),
      source_label: readString(entry.source_label),
      source_url: readString(entry.source_url),
      provider_note: readString(entry.provider_note),
      usage_note: readString(entry.usage_note),
      ingest_status: ingestStatus,
      ingest_error: readString(entry.ingest_error),
      thumbnail_path: readString(entry.thumbnail_path),
      preview_path: readString(entry.preview_path),
      attached_at: normalizeOptionalIso(entry.attached_at),
      asset_category: normalizeBrollMotionAssetCategory(entry.asset_category)
        ?? deriveBrollAssetCategoryFromSource({
          sourceType: source,
          motionIntent: "broll",
          mimeType,
        }),
      label: readString(entry.label) ?? readString(entry.variant_label),
      path: readString(entry.path),
      uri: readString(entry.uri),
      mime_type: mimeType,
      duration_ms: readInteger(entry.duration_ms),
      data_visual_spec: normalizeBrollDataVisualSpec(entry.data_visual_spec),
      created_at: normalizeOptionalIso(entry.created_at),
    });
  }
  return candidates;
}

function normalizeVisualAssetClass(value: unknown): EpisodeVisualAssetClass | null {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_VISUAL_ASSET_CLASS_VALUES.includes(normalized as EpisodeVisualAssetClass)) {
    return normalized as EpisodeVisualAssetClass;
  }
  return null;
}

function normalizeExternalRequestState(value: unknown): EpisodeExternalRequestState {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_EXTERNAL_REQUEST_STATE_VALUES.includes(normalized as EpisodeExternalRequestState)) {
    return normalized as EpisodeExternalRequestState;
  }
  return "planned";
}

function normalizeExternalRequestTracker(value: unknown): EpisodeExternalRequestTracker | null {
  if (!isRecord(value)) return null;
  return {
    state: normalizeExternalRequestState(value.state),
    provider_id: readString(value.provider_id),
    source_url: readString(value.source_url),
    provider_note: readString(value.provider_note),
    usage_note: readString(value.usage_note),
    result_metadata: readString(value.result_metadata),
    attached_asset_id: readString(value.attached_asset_id),
    updated_at: normalizeIso(value.updated_at),
  };
}

function normalizeBrollFulfillmentState(
  value: unknown,
  candidateAssets: readonly EpisodeBrollAssetCandidate[],
  selectedAssetId: string | null,
): EpisodeBrollFulfillmentState {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_BROLL_PLAN_FULFILLMENT_STATE_VALUES.includes(normalized as EpisodeBrollFulfillmentState)) {
    return normalized as EpisodeBrollFulfillmentState;
  }
  if (selectedAssetId && candidateAssets.some((asset) => asset.asset_id === selectedAssetId)) {
    return "resolved";
  }
  if (candidateAssets.length > 0) {
    return "candidate_assets_available";
  }
  return "unresolved";
}

function normalizeBrollPlanBeat(value: unknown, fallbackId: string, fallbackWorkpieceId: string): EpisodeBrollPlanBeat | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id) ?? fallbackId;
  const workpieceId = readString(value.workpiece_id) ?? fallbackWorkpieceId;
  const anchorText = readString(value.anchor_text) ?? readString(value.anchor) ?? "";
  const description = readString(value.description) ?? "";
  const candidateAssets = normalizeBrollCandidateAssets(value.candidate_assets);
  const selectedAssetId = readString(value.selected_asset_id);
  const motionIntent = normalizeBrollMotionIntent(value.motion_intent);
  const sourceType = normalizeBrollSourceType(value.source_type);
  const externalRequest = normalizeExternalRequestTracker(value.external_request);
  const assetCategory = normalizeBrollMotionAssetCategory(value.asset_category)
    ?? deriveBrollAssetCategoryFromSource({
      sourceType,
      motionIntent,
      mimeType: null,
    });
  return {
    id,
    workpiece_id: workpieceId,
    anchor_text: anchorText,
    placement_hint: normalizeBrollPlacementHint(value.placement_hint),
    timestamp_ms: readInteger(value.timestamp_ms),
    purpose: deriveBrollPurpose({
      rawPurpose: readString(value.purpose),
      motionIntent,
      description,
      anchorText,
    }),
    description,
    motion_intent: motionIntent,
    visual_style: normalizeHearthVisualStyle(value.visual_style),
    priority: normalizeBrollPriority(value.priority),
    keywords: normalizeBrollKeywords(value.keywords),
    mood: readString(value.mood),
    shot_type: normalizeBrollShotType(value.shot_type),
    motion_suggestion: readString(value.motion_suggestion),
    suggested_duration_ms: readInteger(value.suggested_duration_ms),
    source_type: sourceType,
    asset_category: assetCategory,
    data_visual_spec: normalizeBrollDataVisualSpec(value.data_visual_spec),
    selected_asset_id: selectedAssetId,
    candidate_assets: candidateAssets.map((candidate) => ({
      ...candidate,
      asset_class: candidate.asset_class ?? "broll",
      source_beat_id: candidate.source_beat_id ?? id,
      asset_category: candidate.asset_category
        ?? deriveBrollAssetCategoryFromSource({
          sourceType: candidate.source,
          motionIntent,
          mimeType: candidate.mime_type ?? null,
        }),
    })),
    external_request: externalRequest,
    fulfillment_state: normalizeBrollFulfillmentState(value.fulfillment_state, candidateAssets, selectedAssetId),
    origin: normalizeBrollOrigin(value.origin),
    created_at: normalizeIso(value.created_at),
    updated_at: normalizeIso(value.updated_at),
  };
}

function normalizeBrollPlan(value: unknown): EpisodeBrollPlan {
  const nowIso = new Date().toISOString();
  const root = isRecord(value) ? value : null;
  const beatsRaw = Array.isArray(root?.beats) ? root.beats : [];
  const workpieceId = readString(root?.workpiece_id) ?? "";
  const beats = beatsRaw
    .map((entry, index) => normalizeBrollPlanBeat(
      entry,
      `broll-beat-${String(index + 1).padStart(2, "0")}`,
      workpieceId,
    ))
    .filter((entry): entry is EpisodeBrollPlanBeat => Boolean(entry));
  return {
    id: readString(root?.id) ?? "broll-plan-v1",
    workpiece_id: workpieceId,
    version: Math.max(1, readInteger(root?.version) ?? 1),
    beats,
    coverage_strength: normalizeBrollCoverageStrength(root?.coverage_strength),
    generated_at: normalizeIso(root?.generated_at, nowIso),
  };
}

function normalizeCdcFormat(value: unknown): EpisodeCdcFormat {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_CDC_FORMAT_VALUES.includes(normalized as EpisodeCdcFormat)) {
    return normalized as EpisodeCdcFormat;
  }
  return "still";
}

function normalizeCdcDataType(value: unknown): EpisodeCdcDataType {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_CDC_DATA_TYPE_VALUES.includes(normalized as EpisodeCdcDataType)) {
    return normalized as EpisodeCdcDataType;
  }
  return "quantitative";
}

function normalizeCdcContextType(value: unknown): EpisodeCdcContextType {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_CDC_CONTEXT_TYPE_VALUES.includes(normalized as EpisodeCdcContextType)) {
    return normalized as EpisodeCdcContextType;
  }
  return "conceptual";
}

function normalizeCdcTone(value: unknown): EpisodeCdcTone {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_CDC_TONE_VALUES.includes(normalized as EpisodeCdcTone)) {
    return normalized as EpisodeCdcTone;
  }
  return "analytical";
}

function normalizeCdcMotionLevel(value: unknown): EpisodeCdcMotionLevel {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_CDC_MOTION_LEVEL_VALUES.includes(normalized as EpisodeCdcMotionLevel)) {
    return normalized as EpisodeCdcMotionLevel;
  }
  return "static";
}

function normalizeCdcChartType(value: unknown): EpisodeCdcChartType | null {
  const normalized = readString(value)?.toLowerCase();
  if (normalized && EPISODE_CDC_CHART_TYPE_VALUES.includes(normalized as EpisodeCdcChartType)) {
    return normalized as EpisodeCdcChartType;
  }
  return null;
}

function normalizeReferenceClipSubtype(value: unknown): EpisodeReferenceClipSubtype | null {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === "graph" || normalized === "document" || normalized === "timeline") {
    return normalized;
  }
  return null;
}

function normalizeCdcValues(value: unknown): Array<number | string> {
  if (!Array.isArray(value)) return [];
  const next: Array<number | string> = [];
  for (const entry of value) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      next.push(entry);
      continue;
    }
    const str = readString(entry);
    if (str) next.push(str);
  }
  return next.slice(0, 32);
}

function normalizeCdcEntry(value: unknown, fallbackId: string, fallbackWorkpieceId: string): EpisodeContextualDataCompositePlan | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id) ?? fallbackId;
  const workpieceId = readString(value.workpiece_id) ?? fallbackWorkpieceId;
  const candidateAssets = normalizeBrollCandidateAssets(value.candidate_assets);
  const selectedAssetId = readString(value.selected_asset_id);
  const externalRequest = normalizeExternalRequestTracker(value.external_request);
  return {
    id,
    workpiece_id: workpieceId,
    media_type: "contextual_data_composite",
    anchor_text: readString(value.anchor_text) ?? "",
    placement_hint: normalizeBrollPlacementHint(value.placement_hint),
    timestamp_ms: readInteger(value.timestamp_ms),
    purpose: deriveReferenceClipPurpose(readString(value.purpose)),
    format: normalizeCdcFormat(value.format),
    data_type: normalizeCdcDataType(value.data_type),
    context_type: normalizeCdcContextType(value.context_type),
    tone: normalizeCdcTone(value.tone),
    motion_level: normalizeCdcMotionLevel(value.motion_level),
    description: readString(value.description) ?? "",
    background_context_description: readString(value.background_context_description) ?? "",
    foreground_data_description: readString(value.foreground_data_description) ?? "",
    visual_style: normalizeHearthVisualStyle(value.visual_style),
    chart_type: normalizeCdcChartType(value.chart_type),
    subtype: normalizeReferenceClipSubtype(value.subtype),
    source: readString(value.source),
    context: readString(value.context),
    highlight: readString(value.highlight),
    visual_spec: readString(value.visual_spec),
    title: readString(value.title),
    labels: readStringArray(value.labels).slice(0, 32),
    values: normalizeCdcValues(value.values),
    emphasis_key: readString(value.emphasis_key),
    candidate_assets: candidateAssets.map((candidate) => ({
      ...candidate,
      asset_class: candidate.asset_class ?? "reference_clip",
      source_beat_id: candidate.source_beat_id ?? id,
    })),
    external_request: externalRequest,
    selected_asset_id: selectedAssetId,
    source_type: normalizeBrollSourceType(value.source_type),
    origin: normalizeBrollOrigin(value.origin),
    created_at: normalizeIso(value.created_at),
    updated_at: normalizeIso(value.updated_at),
  };
}

function normalizeCdcPlan(value: unknown): EpisodeCdcPlan {
  const nowIso = new Date().toISOString();
  const root = isRecord(value) ? value : null;
  const entriesRaw = Array.isArray(root?.entries) ? root.entries : [];
  const workpieceId = readString(root?.workpiece_id) ?? "";
  const entries = entriesRaw
    .map((entry, index) => normalizeCdcEntry(entry, `cdc-entry-${String(index + 1).padStart(2, "0")}`, workpieceId))
    .filter((entry): entry is EpisodeContextualDataCompositePlan => Boolean(entry));
  return {
    id: readString(root?.id) ?? "cdc-plan-v1",
    workpiece_id: workpieceId,
    version: Math.max(1, readInteger(root?.version) ?? 1),
    entries,
    generated_at: normalizeIso(root?.generated_at, nowIso),
  };
}

function normalizeMediaMapType(value: unknown): EpisodeMediaMapMediaType {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === "b_roll" || normalized === "contextual_data_composite" || normalized === "image") {
    return normalized;
  }
  if (normalized === "reference_clip") return "contextual_data_composite";
  if (normalized === "broll") return "b_roll";
  if (normalized === "cdc") return "contextual_data_composite";
  return "image";
}

function normalizeMediaMapAnchorMode(value: unknown): EpisodeMediaMapAnchorMode {
  const normalized = readString(value)?.toLowerCase();
  if (
    normalized === "line_anchor"
    || normalized === "phrase_match"
    || normalized === "speaker_turn"
    || normalized === "section_marker"
    || normalized === "absolute_time"
  ) {
    return normalized;
  }
  return "phrase_match";
}

function normalizeMediaMapSourceStatus(value: unknown): EpisodeMediaMapSourceStatus {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === "unresolved" || normalized === "selected" || normalized === "attached") {
    return normalized;
  }
  return "unresolved";
}

function normalizeMediaMapConfidence(value: unknown): EpisodeMediaMapConfidence {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "medium";
}

function normalizeMediaMapStatus(value: unknown): EpisodeMediaMapStatus {
  const normalized = readString(value)?.toLowerCase();
  if (
    normalized === "draft"
    || normalized === "review"
    || normalized === "activated"
    || normalized === "fulfilling"
    || normalized === "fulfilled"
    || normalized === "needs_attention"
  ) {
    return normalized;
  }
  if (normalized === "approved") {
    return "activated";
  }
  return "draft";
}

function normalizeMediaMapBeatFulfillmentStatus(value: unknown): EpisodeMediaMapBeatFulfillmentStatus {
  const normalized = readString(value)?.toLowerCase();
  if (
    normalized === "planned"
    || normalized === "approved"
    || normalized === "queued"
    || normalized === "generating"
    || normalized === "resolved"
    || normalized === "needs_attention"
  ) {
    return normalized;
  }
  return "planned";
}

function normalizeMediaMapFulfillmentPath(value: unknown): EpisodeMediaMapFulfillmentPath | null {
  const normalized = readString(value)?.toLowerCase();
  if (normalized === "image" || normalized === "motion_broll" || normalized === "reference_clip") {
    return normalized;
  }
  if (normalized === "cdc") return "reference_clip";
  return null;
}

function normalizeMediaMapEntry(value: unknown, fallbackId: string): EpisodeMediaMapEntry | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id) ?? fallbackId;
  const anchorRoot = isRecord(value.anchor) ? value.anchor : null;
  const timingRoot = isRecord(value.timing) ? value.timing : null;
  const sourceRoot = isRecord(value.source) ? value.source : null;
  const inOffset = readNumber(timingRoot?.in_offset_sec) ?? 0;
  const duration = readNumber(timingRoot?.duration_sec) ?? 6;
  const rawPurpose = readString(value.purpose) as HearthVisualPurpose | null;
  const beatAnchor = normalizeBulletBeatAnchor(value.beat_anchor, rawPurpose ?? undefined);
  return {
    id,
    final_media_kind: normalizeMediaMapType(value.final_media_kind ?? value.type),
    purpose: deriveMediaMapPurpose({
      rawPurpose: readString(value.purpose),
      finalMediaKind: readString(value.final_media_kind ?? value.type),
      intent: readString(value.intent),
      description: readString(value.description),
      anchorTarget: readString(anchorRoot?.target),
    }),
    anchor: {
      mode: normalizeMediaMapAnchorMode(anchorRoot?.mode),
      target: readString(anchorRoot?.target) ?? "",
    },
    beat_anchor: beatAnchor,
    timing: {
      in_offset_sec: Math.max(0, inOffset),
      duration_sec: Math.max(0, duration),
    },
    description: readString(value.description) ?? "",
    intent: readString(value.intent) ?? "",
    source: {
      status: normalizeMediaMapSourceStatus(sourceRoot?.status),
      asset_id: readString(sourceRoot?.asset_id),
    },
    confidence: normalizeMediaMapConfidence(value.confidence),
    fulfillment_status: normalizeMediaMapBeatFulfillmentStatus(value.fulfillment_status),
    fulfillment_path: normalizeMediaMapFulfillmentPath(value.fulfillment_path),
    optional: value.optional === true,
    critical: value.critical === true,
    stale: value.stale === true,
    created_at: normalizeIso(value.created_at),
    updated_at: normalizeIso(value.updated_at),
  };
}

function normalizeMediaMap(value: unknown): EpisodeMediaMap {
  const nowIso = new Date().toISOString();
  const root = isRecord(value) ? value : null;
  const entriesRaw = Array.isArray(root?.entries) ? root.entries : [];
  const entries = entriesRaw
    .map((entry, index) => normalizeMediaMapEntry(entry, `media-map-entry-${String(index + 1).padStart(2, "0")}`))
    .filter((entry): entry is EpisodeMediaMapEntry => Boolean(entry));
  return {
    id: readString(root?.id) ?? "media-map-v1",
    workpiece_id: readString(root?.workpiece_id) ?? "",
    script_version_id: readString(root?.script_version_id),
    status: normalizeMediaMapStatus(root?.status),
    version: Math.max(1, readInteger(root?.version) ?? 1),
    entries,
    generated_at: normalizeIso(root?.generated_at, nowIso),
  };
}

export function createEmptyEpisodePackageV2(): EpisodePackageV2 {
  const nowIso = new Date().toISOString();
  return {
    schema: EPISODE_PACKAGE_V2_SCHEMA,
    seo: {
      titles: [],
      tags: [],
      description_short: null,
      description_long: null,
    },
    thumbnail: {
      concepts: [],
      versions: [],
      primary_version_id: null,
    },
    launch_variants: [],
    spoken_beats: [],
    media_map: {
      id: "media-map-v1",
      workpiece_id: "",
      script_version_id: null,
      status: "draft",
      version: 1,
      entries: [],
      generated_at: nowIso,
    },
    image_map: {
      entries: [],
    },
    broll_plan: {
      id: "broll-plan-v1",
      workpiece_id: "",
      version: 1,
      beats: [],
      generated_at: nowIso,
    },
    cdc_plan: {
      id: "cdc-plan-v1",
      workpiece_id: "",
      version: 1,
      entries: [],
      generated_at: nowIso,
    },
  };
}

export function hydrateEpisodePackageV2(metadata: Record<string, unknown>): EpisodePackageV2 {
  const empty = createEmptyEpisodePackageV2();

  const episodeRoot = isRecord(metadata.episode) ? metadata.episode : null;
  const seoRoot = isRecord(episodeRoot?.seo) ? episodeRoot.seo : isRecord(metadata.seo) ? metadata.seo : null;
  const thumbnailRoot = isRecord(episodeRoot?.thumbnail)
    ? episodeRoot.thumbnail
    : isRecord(metadata.thumbnail)
      ? metadata.thumbnail
      : null;
  const imageMapRoot = isRecord(episodeRoot?.image_map)
    ? episodeRoot.image_map
    : isRecord(metadata.image_map)
      ? metadata.image_map
      : null;
  const brollPlanRoot = isRecord(episodeRoot?.broll_plan)
    ? episodeRoot.broll_plan
    : isRecord(metadata.broll_plan)
      ? metadata.broll_plan
      : null;
  const cdcPlanRoot = isRecord(episodeRoot?.cdc_plan)
    ? episodeRoot.cdc_plan
    : isRecord(metadata.cdc_plan)
      ? metadata.cdc_plan
      : null;
  const mediaMapRoot = isRecord(episodeRoot?.media_map)
    ? episodeRoot.media_map
    : isRecord(metadata.media_map)
      ? metadata.media_map
      : null;

  const fromSeoTitles = normalizeSeoTitles(seoRoot?.titles);
  const fromLegacySeoTitles = normalizeSeoTitles(metadata.seo_titles);
  const fromLegacyTitleVariants = normalizeLegacyTitleVariants(metadata.title_variants);
  const titles = fromSeoTitles.length
    ? fromSeoTitles
    : fromLegacySeoTitles.length
      ? fromLegacySeoTitles
      : fromLegacyTitleVariants;

  const tags = dedupeTags([
    ...readStringArray(seoRoot?.tags),
    ...readStringArray(metadata.tags),
    ...parseCsvTags(readString(metadata.tags_top10) ?? ""),
    ...parseCsvTags(readString(metadata.tags_full) ?? ""),
  ]);

  const descriptionLong = readString(seoRoot?.description_long)
    ?? readString(metadata.description_long)
    ?? readString(metadata.description)
    ?? null;
  const descriptionShort = readString(seoRoot?.description_short)
    ?? readString(metadata.description_short)
    ?? (descriptionLong
      ? (descriptionLong.length > 180 ? `${descriptionLong.slice(0, 177).trimEnd()}...` : descriptionLong)
      : null);

  const v3Concepts = normalizeThumbnailConcepts(thumbnailRoot?.concept_revisions);
  const concepts = normalizeThumbnailConcepts(thumbnailRoot?.concepts).length
    ? normalizeThumbnailConcepts(thumbnailRoot?.concepts)
    : v3Concepts.length
      ? v3Concepts
    : normalizeThumbnailConcepts(metadata.thumbnail_concepts).length
      ? normalizeThumbnailConcepts(metadata.thumbnail_concepts)
      : normalizeThumbnailConcepts(metadata.thumbnails);

  const v3BaseVersions = projectV3BaseVersions(thumbnailRoot?.base_versions);
  const versions = normalizeThumbnailVersions(thumbnailRoot?.versions).length
    ? normalizeThumbnailVersions(thumbnailRoot?.versions)
    : v3BaseVersions.length
      ? v3BaseVersions
    : normalizeThumbnailVersions(metadata.thumbnail_versions);

  const primaryVersionId = readString(thumbnailRoot?.primary_version_id)
    ?? readString(thumbnailRoot?.primary_base_version_id)
    ?? readString(metadata.primary_thumbnail_version_id)
    ?? null;
  const launchVariants = normalizeLaunchVariants(
    Array.isArray(episodeRoot?.launch_variants)
      ? episodeRoot.launch_variants
      : metadata.launch_variants,
    {
      titles,
      versions,
    },
  );

  const imageMapEntriesFromRoot = normalizeImageMapEntries(imageMapRoot?.entries);
  const imageMapEntriesFromLegacy = normalizeImageMapEntries(metadata.image_map_entries);
  const imageMapEntriesFromBeatSheet = normalizeImageMapEntries(
    isRecord(metadata.image_beat_sheet) ? metadata.image_beat_sheet.entries : undefined,
  );
  const spokenBeats = normalizeSpokenBeats(episodeRoot?.spoken_beats ?? metadata.spoken_beats);

  return {
    schema: EPISODE_PACKAGE_V2_SCHEMA,
    seo: {
      titles: titles.length ? titles : empty.seo.titles,
      tags,
      description_short: descriptionShort,
      description_long: descriptionLong,
    },
    thumbnail: {
      concepts,
      versions,
      primary_version_id: primaryVersionId,
    },
    launch_variants: launchVariants,
    spoken_beats: spokenBeats,
    media_map: normalizeMediaMap(mediaMapRoot),
    image_map: {
      entries: imageMapEntriesFromRoot.length
        ? imageMapEntriesFromRoot
        : imageMapEntriesFromLegacy.length
          ? imageMapEntriesFromLegacy
          : imageMapEntriesFromBeatSheet,
    },
    broll_plan: normalizeBrollPlan(brollPlanRoot),
    cdc_plan: normalizeCdcPlan(cdcPlanRoot),
  };
}

export function mirrorEpisodePackageV2ToLegacy(metadata: Record<string, unknown>): Record<string, unknown> {
  const episode = hydrateEpisodePackageV2(metadata);
  const originalEpisode = isRecord(metadata.episode) ? metadata.episode : null;
  const canonicalEpisode = originalEpisode?.schema === "forge.episode.package.v3" ? originalEpisode : episode;
  const legacyBeatSheetEntries: ImageBeatLegacyEntry[] = episode.image_map.entries.map((entry) => ({
    id: entry.id,
    attach_after: entry.anchor,
    description: entry.description,
    prompt: entry.prompt_basis || entry.visual_intent || entry.description,
    ...(entry.placement_hint ? { match: entry.placement_hint } : {}),
  }));

  return {
    ...metadata,
    episode: canonicalEpisode,
    seo_titles: episode.seo.titles,
    tags: episode.seo.tags,
    description_short: episode.seo.description_short,
    description_long: episode.seo.description_long,
    thumbnail_concepts: episode.thumbnail.concepts,
    thumbnail_versions: episode.thumbnail.versions,
    primary_thumbnail_version_id: episode.thumbnail.primary_version_id,
    launch_variants: episode.launch_variants,
    spoken_beats: episode.spoken_beats,
    media_map: episode.media_map,
    image_map_entries: episode.image_map.entries,
    image_beat_sheet: {
      entries: legacyBeatSheetEntries,
    },
    broll_plan: episode.broll_plan,
    cdc_plan: episode.cdc_plan,
  };
}

export function applyProductionArtifactToEpisodePackage(args: {
  metadata: Record<string, unknown>;
  action: ProductionArtifactAction;
  rawText: string;
  generatedAt?: string;
  resolveImageMapScriptAnchor?: ((anchorText: string, matchHint?: string | null) => EpisodeImageMapScriptAnchor | null) | null;
}): Record<string, unknown> {
  const hydrated = mirrorEpisodePackageV2ToLegacy(args.metadata);
  const episode = hydrateEpisodePackageV2(hydrated);
  const nextEpisode: EpisodePackageV2 = {
    ...episode,
    seo: {
      ...episode.seo,
    },
    thumbnail: {
      ...episode.thumbnail,
    },
    media_map: {
      ...episode.media_map,
    },
    image_map: {
      ...episode.image_map,
    },
  };

  if (args.action === "seo") {
    const titles = parseSeoTitlesFromText(args.rawText);
    if (titles.length) {
      nextEpisode.seo.titles = mergeGeneratedSeoTitlesIntoSlots(nextEpisode.seo.titles, titles);
    }
  }

  if (args.action === "tags") {
    const tags = parseTagsFromText(args.rawText);
    if (tags.length) {
      nextEpisode.seo.tags = tags;
    }
  }

  if (args.action === "thumbnails") {
    const concepts = parseThumbnailConceptsFromText(args.rawText);
    if (concepts.length) {
      nextEpisode.thumbnail.concepts = concepts;
    }
  }

  if (args.action === "image_beat_sheet") {
    const entries = rehydrateImportedImageBeatSheetEntries({
      importedEntries: parseImageMapEntriesFromText(args.rawText),
      existingEntries: episode.image_map.entries,
      resolveImageMapScriptAnchor: args.resolveImageMapScriptAnchor ?? null,
    });
    if (entries.length) {
      nextEpisode.image_map.entries = entries;
    }
  }

  const originalEpisode = isRecord(args.metadata.episode) ? args.metadata.episode : null;
  if (originalEpisode?.schema === "forge.episode.package.v3") {
    const priorSeo = isRecord(originalEpisode.seo) ? originalEpisode.seo : {};
    const priorTitles = Array.isArray(priorSeo.titles) ? priorSeo.titles : [];
    const titles = nextEpisode.seo.titles.map((title) => {
      const prior = priorTitles.find((entry) => isRecord(entry) && entry.id === title.id);
      const priorRevision = isRecord(prior) && typeof prior.revision === "number" ? Math.max(1, Math.trunc(prior.revision)) : 1;
      const changed = !isRecord(prior) || prior.text !== title.text || (prior.thumbnail_text ?? null) !== (title.thumbnail_text ?? null);
      return { ...title, revision: changed && prior ? priorRevision + 1 : priorRevision };
    });
    return {
      ...args.metadata,
      updated_at: normalizeIso(args.generatedAt, normalizeIso(args.metadata.updated_at)),
      episode: {
        ...originalEpisode,
        schema: "forge.episode.package.v3",
        seo: { ...nextEpisode.seo, titles },
        spoken_beats: nextEpisode.spoken_beats,
        media_map: nextEpisode.media_map,
        image_map: nextEpisode.image_map,
        broll_plan: nextEpisode.broll_plan,
        cdc_plan: nextEpisode.cdc_plan,
      },
    };
  }

  return mirrorEpisodePackageV2ToLegacy({
    ...hydrated,
    episode: nextEpisode,
    updated_at: normalizeIso(args.generatedAt, normalizeIso(hydrated.updated_at)),
  });
}

export function normalizeSeoTags(tags: string[]): string[] {
  return dedupeTags(tags);
}

export function mergeGeneratedSeoTitlesIntoSlots(
  currentTitles: EpisodeSeoTitle[],
  generatedTitles: EpisodeSeoTitle[],
): EpisodeSeoTitle[] {
  const normalized = ensureSeoV2({
    ...createEmptyEpisodePackageV2(),
    seo: { ...createEmptyEpisodePackageV2().seo, titles: currentTitles },
  }).seo.titles;
  const slots = normalized.filter((title) => SEO_CORE_LABELS.includes(title.label as (typeof SEO_CORE_LABELS)[number]));
  return [
    ...slots.map((slot, index) => ({
      ...slot,
      text: generatedTitles[index]?.text ?? slot.text,
      thumbnail_text: generatedTitles[index]?.thumbnail_text ?? slot.thumbnail_text,
    })),
    ...generatedTitles.slice(3),
  ];
}

export function ensureSeoV2(pkg: EpisodePackageV2): EpisodePackageV2 {
  const incoming = Array.isArray(pkg.seo?.titles) ? pkg.seo.titles : [];
  const normalizedIncoming = incoming.map((title, index) => {
    const label = readString(title.label)?.toUpperCase() ?? SEO_CORE_LABELS[index] ?? `V${index + 1}`;
    const id = readString(title.id) ?? `seo-title-${label.toLowerCase()}`;
    return {
      id,
      label,
      text: typeof title.text === "string" ? title.text : "",
      is_primary: Boolean(title.is_primary),
      thumbnail_text: resolveHearthThumbnailOverlayText({
        text: typeof title.text === "string" ? title.text : "",
        thumbnail_text: typeof title.thumbnail_text === "string" ? title.thumbnail_text : null,
      }),
    };
  });

  const byLabel = new Map(normalizedIncoming.map((title) => [title.label, title] as const));
  const baseTitles = SEO_CORE_LABELS.map((label) => (
    byLabel.get(label) ?? {
      id: `seo-title-${label.toLowerCase()}`,
      label,
      text: "",
      is_primary: label === "A",
    }
  ));
  const extras = normalizedIncoming.filter((title) => !SEO_CORE_LABELS.includes(title.label as (typeof SEO_CORE_LABELS)[number]));
  const mergedTitles = [...baseTitles, ...extras];
  const primaryId = mergedTitles.find((title) => title.is_primary)?.id ?? mergedTitles[0]?.id ?? null;
  const titles = mergedTitles.map((title) => ({
    ...title,
    is_primary: primaryId != null && title.id === primaryId,
  }));

  return {
    ...pkg,
    seo: {
      ...pkg.seo,
      titles,
      tags: normalizeSeoTags(pkg.seo.tags ?? []),
      description_short: readString(pkg.seo.description_short) ?? null,
      description_long: readString(pkg.seo.description_long) ?? null,
    },
  };
}

export function ensureSpokenBeatsV2(pkg: EpisodePackageV2): EpisodePackageV2 {
  return {
    ...pkg,
    spoken_beats: normalizeSpokenBeats(pkg.spoken_beats),
  };
}

export function resolvePrimarySeoTitle(titles: readonly EpisodeSeoTitle[]): EpisodeSeoTitle | null {
  const populated = titles.filter((title) => typeof title.text === "string" && title.text.trim().length > 0);
  return populated.find((title) => title.is_primary) ?? populated[0] ?? null;
}

export function ensureImageMapV2(pkg: EpisodePackageV2): EpisodePackageV2 {
  const entries = Array.isArray(pkg.image_map?.entries) ? pkg.image_map.entries : [];
  const paragraphBeatCounts = new Map<string, number>();
  const normalizedEntries = entries
    .map((entry, index) => normalizeImageMapEntryPatch({
      entry,
      fallbackId: readString(entry.id) ?? `image-map-${String(index + 1).padStart(2, "0")}`,
      fallbackBeatOrder: index + 1,
    }))
    .filter((entry): entry is EpisodeImageMapEntry => Boolean(entry));

  const hydratedEntries = normalizedEntries.map((entry, index) => {
    const paragraphKey = entry.script_anchor?.paragraph_id
      ?? (entry.beat_anchor ? `beat:${entry.beat_anchor.beat_id}` : entry.anchor.toLowerCase());
    const nextParagraphBeatOrder = (paragraphBeatCounts.get(paragraphKey) ?? 0) + 1;
    paragraphBeatCounts.set(paragraphKey, nextParagraphBeatOrder);
    return {
      ...entry,
      beat_order: entry.beat_order || (index + 1),
      paragraph_beat_order: entry.paragraph_beat_order || nextParagraphBeatOrder,
      purpose: deriveImageMapPurpose({
        rawPurpose: entry.purpose,
        visualPriority: entry.visual_priority,
        visualType: entry.visual_type,
        intent: entry.intent,
        description: entry.description,
        visualIntent: entry.visual_intent,
        promptBasis: entry.prompt_basis,
      }),
      status: normalizeImageMapStatus(entry.status),
    };
  });

  return {
    ...pkg,
    image_map: {
      entries: hydratedEntries,
    },
  };
}

export function ensureBrollPlanV2(pkg: EpisodePackageV2): EpisodePackageV2 {
  const normalizedPlan = normalizeBrollPlan(pkg.broll_plan);
  const normalizedBeats = normalizedPlan.beats.map((beat) => ({
    ...beat,
    workpiece_id: beat.workpiece_id || normalizedPlan.workpiece_id,
    keywords: dedupeTags(beat.keywords),
    candidate_assets: normalizeBrollCandidateAssets(beat.candidate_assets).map((candidate) => ({
      ...candidate,
      asset_class: candidate.asset_class ?? "broll",
      source_beat_id: candidate.source_beat_id ?? beat.id,
      asset_category: candidate.asset_category
        ?? deriveBrollAssetCategoryFromSource({
          sourceType: candidate.source,
          motionIntent: normalizeBrollMotionIntent(beat.motion_intent),
          mimeType: candidate.mime_type ?? null,
        }),
    })),
    data_visual_spec: normalizeBrollDataVisualSpec(beat.data_visual_spec),
    fulfillment_state: normalizeBrollFulfillmentState(
      beat.fulfillment_state,
      normalizeBrollCandidateAssets(beat.candidate_assets),
      beat.selected_asset_id ?? null,
    ),
    source_type: normalizeBrollSourceType(beat.source_type),
    external_request: normalizeExternalRequestTracker(beat.external_request) ?? {
      state: beat.selected_asset_id ? "resolved" : "planned",
      attached_asset_id: beat.selected_asset_id ?? null,
      updated_at: normalizeIso(beat.updated_at, beat.created_at),
    },
    purpose: deriveBrollPurpose({
      rawPurpose: beat.purpose,
      motionIntent: normalizeBrollMotionIntent(beat.motion_intent),
      description: beat.description,
      anchorText: beat.anchor_text,
    }),
    motion_intent: normalizeBrollMotionIntent(beat.motion_intent),
    asset_category: normalizeBrollMotionAssetCategory(beat.asset_category)
      ?? deriveBrollAssetCategoryFromSource({
        sourceType: normalizeBrollSourceType(beat.source_type),
        motionIntent: normalizeBrollMotionIntent(beat.motion_intent),
        mimeType: null,
      }),
    priority: normalizeBrollPriority(beat.priority),
    placement_hint: normalizeBrollPlacementHint(beat.placement_hint),
    origin: normalizeBrollOrigin(beat.origin),
    updated_at: normalizeIso(beat.updated_at, beat.created_at),
  }));

  const coverageStrength = normalizedPlan.coverage_strength
    ?? (normalizedBeats.length >= 12 ? "high" : normalizedBeats.length >= 5 ? "medium" : "low");

  return {
    ...pkg,
    broll_plan: {
      ...normalizedPlan,
      beats: normalizedBeats,
      coverage_strength: coverageStrength,
    },
  };
}

export function ensureCdcPlanV2(pkg: EpisodePackageV2): EpisodePackageV2 {
  const normalizedPlan = normalizeCdcPlan(pkg.cdc_plan);
  const normalizedEntries = normalizedPlan.entries.map((entry) => ({
    ...entry,
    media_type: "contextual_data_composite" as const,
    workpiece_id: entry.workpiece_id || normalizedPlan.workpiece_id,
    placement_hint: normalizeBrollPlacementHint(entry.placement_hint),
    format: normalizeCdcFormat(entry.format),
    data_type: normalizeCdcDataType(entry.data_type),
    context_type: normalizeCdcContextType(entry.context_type),
    tone: normalizeCdcTone(entry.tone),
    motion_level: normalizeCdcMotionLevel(entry.motion_level),
    chart_type: normalizeCdcChartType(entry.chart_type),
    labels: readStringArray(entry.labels).slice(0, 32),
    values: normalizeCdcValues(entry.values),
    candidate_assets: normalizeBrollCandidateAssets(entry.candidate_assets).map((candidate) => ({
      ...candidate,
      asset_class: candidate.asset_class ?? "reference_clip",
      source_beat_id: candidate.source_beat_id ?? entry.id,
    })),
    purpose: deriveReferenceClipPurpose(entry.purpose),
    external_request: normalizeExternalRequestTracker(entry.external_request) ?? {
      state: entry.selected_asset_id ? "resolved" : "planned",
      attached_asset_id: entry.selected_asset_id ?? null,
      updated_at: normalizeIso(entry.updated_at, entry.created_at),
    },
    selected_asset_id: readString(entry.selected_asset_id),
    source_type: normalizeBrollSourceType(entry.source_type),
    origin: normalizeBrollOrigin(entry.origin),
    updated_at: normalizeIso(entry.updated_at, entry.created_at),
  }));
  return {
    ...pkg,
    cdc_plan: {
      ...normalizedPlan,
      entries: normalizedEntries,
    },
  };
}

export const ensureReferenceClipPlanV2 = ensureCdcPlanV2;

export function ensureMediaMapV2(pkg: EpisodePackageV2): EpisodePackageV2 {
    const normalizedMap = normalizeMediaMap(pkg.media_map);
  const normalizedEntries = normalizedMap.entries.map((entry) => ({
    ...entry,
    final_media_kind: normalizeMediaMapType(entry.final_media_kind),
    purpose: deriveMediaMapPurpose({
      rawPurpose: entry.purpose,
      finalMediaKind: entry.final_media_kind,
      intent: entry.intent,
      description: entry.description,
      anchorTarget: entry.anchor?.target,
    }),
    anchor: {
      mode: normalizeMediaMapAnchorMode(entry.anchor?.mode),
      target: readString(entry.anchor?.target) ?? "",
    },
    beat_anchor: normalizeBulletBeatAnchor(entry.beat_anchor, entry.purpose),
    timing: {
      in_offset_sec: Math.max(0, readNumber(entry.timing?.in_offset_sec) ?? 0),
      duration_sec: Math.max(0, readNumber(entry.timing?.duration_sec) ?? 6),
    },
    source: {
      status: normalizeMediaMapSourceStatus(entry.source?.status),
      asset_id: readString(entry.source?.asset_id),
    },
    confidence: normalizeMediaMapConfidence(entry.confidence),
    fulfillment_status: normalizeMediaMapBeatFulfillmentStatus(entry.fulfillment_status),
    fulfillment_path: normalizeMediaMapFulfillmentPath(entry.fulfillment_path),
    created_at: normalizeIso(entry.created_at),
    updated_at: normalizeIso(entry.updated_at, entry.created_at),
  }));
  return {
    ...pkg,
    media_map: {
      ...normalizedMap,
      status: normalizeMediaMapStatus(normalizedMap.status),
      entries: normalizedEntries,
    },
  };
}

export function ensureLaunchVariantsV2(pkg: EpisodePackageV2): EpisodePackageV2 {
  const normalized = ensureMediaMapV2(
    ensureCdcPlanV2(
      ensureBrollPlanV2(
        ensureImageMapV2(
          ensureSeoV2(ensureSpokenBeatsV2(pkg)),
        ),
      ),
    ),
  );
  const concepts = Array.isArray(normalized.thumbnail?.concepts)
    ? normalized.thumbnail.concepts.map((concept, index) => ({
        ...concept,
        id: readString(concept.id) ?? `concept-${String(index + 1).padStart(2, "0")}`,
        label: readString(concept.label) ?? `Concept ${index + 1}`,
        prompt_text: readString(concept.prompt_text) ?? "",
        style_preset: normalizeHearthVisualStyle(concept.style_preset ?? null),
        title_style: normalizeEpisodeThumbnailTitleStyle(concept.title_style),
        brand_template_id: readString(concept.brand_template_id),
        has_face: typeof concept.has_face === "boolean" ? concept.has_face : undefined,
        emotion_intensity: readNumber(concept.emotion_intensity),
        text_length: readNumber(concept.text_length),
        contrast_score: readNumber(concept.contrast_score),
        novelty_score: readNumber(concept.novelty_score),
        topic_relevance: readNumber(concept.topic_relevance),
      }))
    : [];
  const versions = Array.isArray(normalized.thumbnail?.versions) ? normalized.thumbnail.versions : [];
  const launchVariants = normalizeLaunchVariants(normalized.launch_variants, {
    titles: normalized.seo.titles,
    versions,
  });

  return {
    ...normalized,
    thumbnail: {
      ...normalized.thumbnail,
      concepts,
    },
    launch_variants: launchVariants,
  };
}

export function addImageMapEntry(
  pkg: EpisodePackageV2,
  entryPartial: Partial<EpisodeImageMapEntry>,
): EpisodePackageV2 {
  const normalized = ensureImageMapV2(pkg);
  const nextEntry = normalizeImageMapEntryPatch({
    entry: {
      ...entryPartial,
      id: readString(entryPartial.id) ?? createImageMapEntryId(),
    },
    fallbackBeatOrder: normalized.image_map.entries.length + 1,
    fallbackParagraphBeatOrder: 1,
  });
  if (!nextEntry) return normalized;

  return {
    ...normalized,
    image_map: {
      entries: [...normalized.image_map.entries, nextEntry],
    },
  };
}

export function updateImageMapEntry(
  pkg: EpisodePackageV2,
  entryId: string,
  patch: Partial<EpisodeImageMapEntry>,
): EpisodePackageV2 {
  const normalized = ensureImageMapV2(pkg);
  const targetId = readString(entryId);
  if (!targetId) return normalized;

  return {
    ...normalized,
    image_map: {
      entries: normalized.image_map.entries.map((entry) => {
        if (entry.id !== targetId) return entry;
        const next = normalizeImageMapEntryPatch({
          entry: {
            ...entry,
            ...patch,
            id: entry.id,
          },
          fallbackId: entry.id,
        });
        return next ?? entry;
      }),
    },
  };
}

export function removeImageMapEntry(pkg: EpisodePackageV2, entryId: string): EpisodePackageV2 {
  const normalized = ensureImageMapV2(pkg);
  const targetId = readString(entryId);
  if (!targetId) return normalized;
  return {
    ...normalized,
    image_map: {
      entries: normalized.image_map.entries.filter((entry) => entry.id !== targetId),
    },
  };
}

export function buildDefaultMetadataDocument(args: {
  schema?: string;
  workpieceId: string;
  workspaceId: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  notes?: unknown;
  origin?: unknown;
  contentCategory?: string | null;
}): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const base: Record<string, unknown> = {
    schema: readString(args.schema) ?? "forge.metadata.v1",
    workpiece_id: args.workpieceId,
    workspace_id: args.workspaceId,
    created_at: normalizeIso(args.createdAt, nowIso),
    updated_at: normalizeIso(args.updatedAt, nowIso),
    status: readString(args.status) ?? "draft",
    notes: args.notes ?? null,
    origin: args.origin ?? null,
    content_category: args.contentCategory ?? null,
    episode: createEmptyEpisodePackageV2(),
  };
  return mirrorEpisodePackageV2ToLegacy(base);
}
