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
  style_preset?: string | null;
};

export type EpisodeThumbnailVersion = {
  id: string;
  concept_id: string;
  created_at: string;
  provider: string;
  prompt: string;
  asset_id: string;
  status: string;
};

export type EpisodeThumbnail = {
  concepts: EpisodeThumbnailConcept[];
  versions: EpisodeThumbnailVersion[];
  primary_version_id: string | null;
};

export type EpisodeImageMapEntry = {
  id: string;
  anchor: string;
  description: string;
  intent: string;
  source_type: string;
  placement_hint?: string | null;
};

export type EpisodeImageMap = {
  entries: EpisodeImageMapEntry[];
};

export type EpisodePackageV2 = {
  schema: typeof EPISODE_PACKAGE_V2_SCHEMA;
  seo: EpisodeSeo;
  thumbnail: EpisodeThumbnail;
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
        style_preset: readString(entry.style_preset) ?? readString(entry.mood_style),
      });
      continue;
    }
    const promptText = readString(entry);
    if (!promptText) continue;
    out.push({
      id: `concept-${String(i + 1).padStart(2, "0")}`,
      label: `Concept ${i + 1}`,
      prompt_text: promptText,
      style_preset: null,
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
    const anchor = readString(entry.anchor) ?? readString(entry.attach_after);
    const description = readString(entry.description);
    const intent = readString(entry.intent) ?? readString(entry.prompt);
    const sourceType = readString(entry.source_type) ?? "script";
    if (!anchor || !description || !intent) continue;
    out.push({
      id: readString(entry.id) ?? `image-map-${String(i + 1).padStart(2, "0")}`,
      anchor,
      description,
      intent,
      source_type: sourceType,
      placement_hint: readString(entry.placement_hint) ?? readString(entry.match),
    });
  }
  return out;
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
      style_preset: moodStyle,
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
      description,
      intent: prompt,
      source_type: "approved_script_quote",
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
    prompt: entry.intent,
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
    const entries = parseImageMapEntriesFromText(args.rawText);
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

