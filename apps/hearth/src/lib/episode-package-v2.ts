import {
  DEFAULT_HEARTH_VISUAL_STYLE,
  normalizeHearthVisualStyle,
} from "./hearth-visual-styles";
import type { HearthVisualStyleValue } from "./hearth-visual-styles";

export const EPISODE_PACKAGE_V2_SCHEMA = "forge.episode.package.v2";

const SEO_LABELS = ["A", "B", "C", "D", "E", "F"] as const;

export type EpisodeSeoTitle = {
  id: string;
  label: string;
  text: string;
  is_primary: boolean;
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

export type EpisodeLaunchVariant = {
  id: string;
  title_id: string;
  thumbnail_version_id: string;
  created_at: string;
  updated_at: string;
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
};

export type EpisodeImageMapEntry = {
  id: string;
  anchor: string;
  script_anchor: EpisodeImageMapScriptAnchor | null;
  description: string;
  visual_intent: string;
  prompt_basis: string;
  style_preset?: HearthVisualStyleValue | null;
  intent: string;
  source_type: string;
  beat_order: number;
  paragraph_beat_order: number;
  candidate_assets: EpisodeImageMapAssetRef[];
  selected_asset_id: string | null;
  status: EpisodeImageMapStatus;
  placement_hint?: string | null;
};

export type EpisodeImageMap = {
  entries: EpisodeImageMapEntry[];
};

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
] as const;
export const EPISODE_IMAGE_MAP_STATUS_VALUES = [
  "draft",
  "mapped",
  "candidates_generated",
  "selected",
] as const;

export type EpisodeImageMapIntent = (typeof EPISODE_IMAGE_MAP_INTENT_VALUES)[number];
export type EpisodeImageMapSourceType = (typeof EPISODE_IMAGE_MAP_SOURCE_TYPE_VALUES)[number];
export type EpisodeImageMapStatus = (typeof EPISODE_IMAGE_MAP_STATUS_VALUES)[number];

export type EpisodePackageV2 = {
  schema: typeof EPISODE_PACKAGE_V2_SCHEMA;
  seo: EpisodeSeo;
  thumbnail: EpisodeThumbnail;
  launch_variants: EpisodeLaunchVariant[];
  image_map: EpisodeImageMap;
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

function normalizeIso(value: unknown, fallbackIso?: string): string {
  const raw = readString(value);
  if (!raw) return fallbackIso ?? new Date().toISOString();
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return fallbackIso ?? new Date().toISOString();
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
        id: readString(entry.id) ?? `concept-${String(i + 1).padStart(2, "0")}`,
        label,
        prompt_text: promptText,
        style_preset: normalizeHearthVisualStyle(readString(entry.style_preset) ?? readString(entry.mood_style) ?? null),
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
    out.push({
      id,
      title_id: titleId,
      thumbnail_version_id: thumbnailVersionId,
      created_at: createdAt,
      updated_at: normalizeIso(entry.updated_at, createdAt),
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
    const anchor = resolveImageMapDisplayAnchor(
      readString(entry.anchor) ?? readString(entry.attach_after),
      scriptAnchor,
    );
    const description = typeof entry.description === "string" ? entry.description : "";
    const sourceType = readString(entry.source_type) ?? "stock";
    if (!anchor) continue;
    const candidateAssets = normalizeImageMapAssetRefs(entry.candidate_assets);
    const selectedAssetId = normalizeSelectedImageMapAssetId(readString(entry.selected_asset_id), candidateAssets);
    out.push({
      id: readString(entry.id) ?? `image-map-${String(i + 1).padStart(2, "0")}`,
      anchor,
      script_anchor: scriptAnchor,
      description,
      visual_intent: readString(entry.visual_intent) ?? description,
      prompt_basis: readString(entry.prompt_basis) ?? readString(entry.prompt) ?? description,
      style_preset: normalizeHearthVisualStyle(readString(entry.style_preset) ?? readString(entry.visual_style) ?? null),
      intent: normalizeImageMapIntent(readString(entry.intent)),
      source_type: normalizeImageMapSourceType(sourceType),
      beat_order: readInteger(entry.beat_order) ?? (i + 1),
      paragraph_beat_order: readInteger(entry.paragraph_beat_order) ?? 1,
      candidate_assets: candidateAssets,
      selected_asset_id: selectedAssetId,
      status: normalizeDerivedImageMapStatus(
        normalizeImageMapStatus(readString(entry.status) ?? (scriptAnchor ? "mapped" : "draft")),
        scriptAnchor,
        candidateAssets,
        selectedAssetId,
      ),
      placement_hint: readString(entry.placement_hint) ?? readString(entry.match),
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
  candidateAssets: readonly EpisodeImageMapAssetRef[],
  selectedAssetId: string | null,
): EpisodeImageMapStatus {
  if (selectedAssetId) return "selected";
  if (candidateAssets.length > 0) return "candidates_generated";
  if (value === "selected") {
    return scriptAnchor ? "mapped" : "draft";
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

export function buildImageMapAnchorLabel(anchor: EpisodeImageMapScriptAnchor | null): string {
  if (!anchor) return "";
  const sentenceRange = anchor.sentence_start === anchor.sentence_end
    ? `sent${anchor.sentence_start}`
    : `sent${anchor.sentence_start}-${anchor.sentence_end}`;
  return `${anchor.paragraph_id}#${sentenceRange}`;
}

export function resolveImageMapDisplayAnchor(
  anchor: string | null | undefined,
  scriptAnchor: EpisodeImageMapScriptAnchor | null | undefined,
): string {
  const displayAnchor = readString(anchor);
  const spanText = readString(scriptAnchor?.span_text);
  const structuralAnchorLabel = buildImageMapAnchorLabel(scriptAnchor ?? null);
  if (spanText && (!displayAnchor || displayAnchor === structuralAnchorLabel)) {
    return spanText;
  }
  return displayAnchor ?? spanText ?? structuralAnchorLabel;
}

function normalizeImageMapEntryPatch(args: {
  entry: Partial<EpisodeImageMapEntry>;
  fallbackId?: string;
  fallbackBeatOrder?: number;
  fallbackParagraphBeatOrder?: number;
}): EpisodeImageMapEntry | null {
  const scriptAnchor = normalizeImageMapScriptAnchor(args.entry.script_anchor);
  const anchor = resolveImageMapDisplayAnchor(readString(args.entry.anchor), scriptAnchor);
  const description = typeof args.entry.description === "string" ? args.entry.description : "";
  const id = readString(args.entry.id) ?? args.fallbackId ?? createImageMapEntryId();
  if (!anchor || !id) return null;
  const candidateAssets = normalizeImageMapAssetRefs(args.entry.candidate_assets);
  const selectedAssetId = normalizeSelectedImageMapAssetId(readString(args.entry.selected_asset_id), candidateAssets);
  return {
    id,
    anchor,
    script_anchor: scriptAnchor,
    description,
    visual_intent: readString(args.entry.visual_intent) ?? description,
    prompt_basis: readString(args.entry.prompt_basis) ?? description,
    style_preset: normalizeHearthVisualStyle(args.entry.style_preset ?? null),
    intent: normalizeImageMapIntent(readString(args.entry.intent)),
    source_type: normalizeImageMapSourceType(readString(args.entry.source_type)),
    beat_order: readInteger(args.entry.beat_order) ?? args.fallbackBeatOrder ?? 1,
    paragraph_beat_order: readInteger(args.entry.paragraph_beat_order) ?? args.fallbackParagraphBeatOrder ?? 1,
    candidate_assets: candidateAssets,
    selected_asset_id: selectedAssetId,
    status: normalizeDerivedImageMapStatus(
      normalizeImageMapStatus(readString(args.entry.status) ?? (scriptAnchor ? "mapped" : "draft")),
      scriptAnchor,
      candidateAssets,
      selectedAssetId,
    ),
    placement_hint: readString(args.entry.placement_hint) ?? null,
  };
}

function parseSectionBody(rawText: string, sectionHeader: string): string {
  const lines = rawText.split(/\r?\n/);
  const headerRe = new RegExp(`^\\s*${sectionHeader}\\s*:?\\s*$`, "i");
  const genericHeaderRe = /^\s*[A-Z0-9_ ]{3,}\s*:\s*$/;
  let collecting = false;
  const collected: string[] = [];
  for (const line of lines) {
    if (!collecting) {
      if (headerRe.test(line)) collecting = true;
      continue;
    }
    if (genericHeaderRe.test(line)) break;
    collected.push(line);
  }
  return collected.join("\n").trim();
}

export function parseSeoTitlesFromText(rawText: string): EpisodeSeoTitle[] {
  const body = parseSectionBody(rawText, "SEO_TITLES");
  if (!body) return [];
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const titles: EpisodeSeoTitle[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.replace(/^[-*]\s*/, "") ?? "";
    const labeled = line.match(/^([A-Z0-9_]+)\s*[:|-]\s*(.+)$/i);
    const text = labeled?.[2]?.trim() ?? line.trim();
    if (!text) continue;
    const label = labeled?.[1]?.trim() ?? SEO_LABELS[i] ?? `V${i + 1}`;
    titles.push({
      id: normalizeTitleId(text, i),
      label,
      text,
      is_primary: i === 0,
    });
  }
  return titles;
}

export function parseDescriptionFromSeoText(rawText: string): {
  shortDescription: string | null;
  longDescription: string | null;
} {
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
  const full = parseSectionBody(rawText, "TAGS_FULL");
  if (full) return dedupeTags(parseCsvTags(full));
  const top10 = parseSectionBody(rawText, "TAGS_TOP10");
  if (top10) return dedupeTags(parseCsvTags(top10));
  return [];
}

export function parseThumbnailConceptsFromText(rawText: string): EpisodeThumbnailConcept[] {
  const lines = rawText.split(/\r?\n/);
  const concepts: EpisodeThumbnailConcept[] = [];
  let currentId: string | null = null;
  let headline: string | null = null;
  let imageConcept: string | null = null;
  let moodStyle: string | null = null;

  const flush = () => {
    if (!currentId) return;
    const promptText = [imageConcept, moodStyle].filter(Boolean).join(" | ");
    if (!promptText) {
      currentId = null;
      headline = null;
      imageConcept = null;
      moodStyle = null;
      return;
    }
    concepts.push({
      id: `concept-${currentId.toLowerCase()}`,
      label: headline || `THUMBNAIL_${currentId}`,
      prompt_text: promptText,
      style_preset: normalizeHearthVisualStyle(moodStyle),
    });
    currentId = null;
    headline = null;
    imageConcept = null;
    moodStyle = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const header = line.match(/^THUMBNAIL_(\d{1,3})$/i);
    if (header) {
      flush();
      currentId = header[1]?.padStart(2, "0") ?? "01";
      continue;
    }
    if (!currentId) continue;
    const headlineMatch = line.match(/^Headline:\s*(.+)$/i);
    if (headlineMatch?.[1]) {
      headline = headlineMatch[1].trim();
      continue;
    }
    const imageMatch = line.match(/^Image concept:\s*(.+)$/i);
    if (imageMatch?.[1]) {
      imageConcept = imageMatch[1].trim();
      continue;
    }
    const moodMatch = line.match(/^Mood\/style:\s*(.+)$/i);
    if (moodMatch?.[1]) {
      moodStyle = moodMatch[1].trim();
    }
  }

  flush();
  return concepts;
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
      description,
      visual_intent: description,
      prompt_basis: prompt,
      style_preset: DEFAULT_HEARTH_VISUAL_STYLE,
      intent: "graphic",
      source_type: "stock",
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
        entry.candidate_assets,
        entry.selected_asset_id,
      ),
    };
  });
}

export function createEmptyEpisodePackageV2(): EpisodePackageV2 {
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
    image_map: {
      entries: [],
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

  const concepts = normalizeThumbnailConcepts(thumbnailRoot?.concepts).length
    ? normalizeThumbnailConcepts(thumbnailRoot?.concepts)
    : normalizeThumbnailConcepts(metadata.thumbnail_concepts).length
      ? normalizeThumbnailConcepts(metadata.thumbnail_concepts)
      : normalizeThumbnailConcepts(metadata.thumbnails);

  const versions = normalizeThumbnailVersions(thumbnailRoot?.versions).length
    ? normalizeThumbnailVersions(thumbnailRoot?.versions)
    : normalizeThumbnailVersions(metadata.thumbnail_versions);

  const primaryVersionId = readString(thumbnailRoot?.primary_version_id)
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
    image_map: {
      entries: imageMapEntriesFromRoot.length
        ? imageMapEntriesFromRoot
        : imageMapEntriesFromLegacy.length
          ? imageMapEntriesFromLegacy
          : imageMapEntriesFromBeatSheet,
    },
  };
}

export function mirrorEpisodePackageV2ToLegacy(metadata: Record<string, unknown>): Record<string, unknown> {
  const episode = hydrateEpisodePackageV2(metadata);
  const legacyBeatSheetEntries: ImageBeatLegacyEntry[] = episode.image_map.entries.map((entry) => ({
    id: entry.id,
    attach_after: entry.anchor,
    description: entry.description,
    prompt: entry.prompt_basis || entry.visual_intent || entry.description,
    ...(entry.placement_hint ? { match: entry.placement_hint } : {}),
  }));

  return {
    ...metadata,
    episode,
    seo_titles: episode.seo.titles,
    tags: episode.seo.tags,
    description_short: episode.seo.description_short,
    description_long: episode.seo.description_long,
    thumbnail_concepts: episode.thumbnail.concepts,
    thumbnail_versions: episode.thumbnail.versions,
    primary_thumbnail_version_id: episode.thumbnail.primary_version_id,
    launch_variants: episode.launch_variants,
    image_map_entries: episode.image_map.entries,
    image_beat_sheet: {
      entries: legacyBeatSheetEntries,
    },
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
    image_map: {
      ...episode.image_map,
    },
  };

  if (args.action === "seo") {
    const titles = parseSeoTitlesFromText(args.rawText);
    const descriptions = parseDescriptionFromSeoText(args.rawText);
    if (titles.length) {
      nextEpisode.seo.titles = titles;
    }
    if (descriptions.shortDescription) {
      nextEpisode.seo.description_short = descriptions.shortDescription;
    }
    if (descriptions.longDescription) {
      nextEpisode.seo.description_long = descriptions.longDescription;
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

  return mirrorEpisodePackageV2ToLegacy({
    ...hydrated,
    episode: nextEpisode,
    updated_at: normalizeIso(args.generatedAt, normalizeIso(hydrated.updated_at)),
  });
}

export function normalizeSeoTags(tags: string[]): string[] {
  return dedupeTags(tags);
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
    const paragraphKey = entry.script_anchor?.paragraph_id ?? entry.anchor.toLowerCase();
    const nextParagraphBeatOrder = (paragraphBeatCounts.get(paragraphKey) ?? 0) + 1;
    paragraphBeatCounts.set(paragraphKey, nextParagraphBeatOrder);
    return {
      ...entry,
      beat_order: entry.beat_order || (index + 1),
      paragraph_beat_order: entry.paragraph_beat_order || nextParagraphBeatOrder,
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

export function ensureLaunchVariantsV2(pkg: EpisodePackageV2): EpisodePackageV2 {
  const normalized = ensureSeoV2(pkg);
  const versions = Array.isArray(normalized.thumbnail?.versions) ? normalized.thumbnail.versions : [];
  const launchVariants = normalizeLaunchVariants(normalized.launch_variants, {
    titles: normalized.seo.titles,
    versions,
  });

  return {
    ...normalized,
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
