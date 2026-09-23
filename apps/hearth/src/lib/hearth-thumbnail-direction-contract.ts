export const HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT = "thumbnail_directions_three.v1" as const;
export const HEARTH_THUMBNAIL_DIRECTION_MAX_RESPONSE_BYTES = 24_576;

export const THUMBNAIL_DIRECTION_KEYS = ["A", "B", "C"] as const;
export type ThumbnailDirectionKey = typeof THUMBNAIL_DIRECTION_KEYS[number];

export type PaidThumbnailDirectionStrategy = {
  episodePromise: string;
  intendedViewer: string;
  curiosityMechanism: string;
  editorialPositioning: string;
  truthfulConnection: string;
  prohibitedExaggerations: string[];
};

export type PaidThumbnailDirection = {
  key: ThumbnailDirectionKey;
  headline: string;
  subjectDirection: string;
  focalAction: string;
  compositionDirection: string;
  emotionalTone: string;
  visualHierarchy: string;
  titleCompatibility: string;
  integrityRationale: string;
  renderDirection: string;
  moodStyle: string;
  subjectClassification: string;
  compositionClassification: string;
  dominantColors: string[];
};

export type PaidThumbnailDirectionOutput = {
  text: string;
  strategy: PaidThumbnailDirectionStrategy;
  directions: [PaidThumbnailDirection, PaidThumbnailDirection, PaidThumbnailDirection];
};

const STRATEGY_FIELDS = [
  "Episode promise",
  "Intended viewer",
  "Curiosity mechanism",
  "Editorial positioning",
  "Truthful connection",
  "Prohibited exaggerations",
] as const;

const DIRECTION_FIELDS = [
  "Headline",
  "Subject direction",
  "Focal action",
  "Composition direction",
  "Emotional tone",
  "Visual hierarchy",
  "Title compatibility",
  "Integrity rationale",
  "Render direction",
  "Mood/style",
  "Subject classification",
  "Composition classification",
  "Dominant colors",
] as const;

const SECTION_HEADERS = new Set(["THUMBNAIL_STRATEGY", "THUMBNAIL_A", "THUMBNAIL_B", "THUMBNAIL_C"]);

function normalizeList(value: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of value.split(",")) {
    const normalized = item.trim().replace(/\s+/g, " ");
    const identity = normalized.normalize("NFKC").toLocaleLowerCase();
    if (!normalized || seen.has(identity)) continue;
    seen.add(identity);
    values.push(normalized);
  }
  return values;
}

function normalizedWords(value: string): Set<string> {
  return new Set(value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter((word) => word.length > 2));
}

function similarity(left: string, right: string): number {
  const a = normalizedWords(left);
  const b = normalizedWords(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function placeholder(value: string): boolean {
  return /<[^>\r\n]{1,200}>/.test(value)
    || /\b(?:todo|tbd|placeholder|lorem ipsum|insert (?:text|content) here)\b/i.test(value)
    || /^\s*(?:none|n\/?a)\s*[.!]?\s*$/i.test(value);
}

function parseSections(text: string): Map<string, Map<string, string>> | null {
  const sections = new Map<string, Map<string, string>>();
  let current: string | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (/^THUMBNAIL_[A-Z0-9_]+$/.test(line)) {
      if (!SECTION_HEADERS.has(line) || sections.has(line)) return null;
      current = line;
      sections.set(line, new Map());
      continue;
    }
    if (!current) return null;
    const match = /^([^:]+):[\t ]*(.+)$/.exec(line);
    if (!match) return null;
    const fields = sections.get(current)!;
    const label = match[1]!.trim();
    const value = match[2]!.trim().replace(/\s+/g, " ");
    if (!value || placeholder(value) || fields.has(label)) return null;
    fields.set(label, value);
  }
  return sections;
}

function exactFields(fields: Map<string, string>, expected: readonly string[]): boolean {
  return fields.size === expected.length
    && [...fields.keys()].every((field, index) => field === expected[index]);
}

function materiallyDistinct(directions: readonly PaidThumbnailDirection[]): boolean {
  for (let left = 0; left < directions.length; left += 1) {
    for (let right = left + 1; right < directions.length; right += 1) {
      const a = directions[left]!;
      const b = directions[right]!;
      const fieldSimilarities = [
        similarity(a.subjectDirection, b.subjectDirection),
        similarity(a.focalAction, b.focalAction),
        similarity(a.compositionDirection, b.compositionDirection),
      ];
      const nearIdenticalFields = fieldSimilarities.filter((score) => score >= 0.65).length;
      const compositeA = `${a.headline} ${a.subjectDirection} ${a.focalAction} ${a.compositionDirection} ${a.renderDirection}`;
      const compositeB = `${b.headline} ${b.subjectDirection} ${b.focalAction} ${b.compositionDirection} ${b.renderDirection}`;
      if (nearIdenticalFields >= 2 || similarity(compositeA, compositeB) >= 0.72) return false;
    }
  }
  return true;
}

function renderCanonical(output: Omit<PaidThumbnailDirectionOutput, "text">): string {
  const strategy = output.strategy;
  const strategyLines = [
    "THUMBNAIL_STRATEGY",
    `Episode promise: ${strategy.episodePromise}`,
    `Intended viewer: ${strategy.intendedViewer}`,
    `Curiosity mechanism: ${strategy.curiosityMechanism}`,
    `Editorial positioning: ${strategy.editorialPositioning}`,
    `Truthful connection: ${strategy.truthfulConnection}`,
    `Prohibited exaggerations: ${strategy.prohibitedExaggerations.join(", ")}`,
  ];
  const directionBlocks = output.directions.map((direction) => [
    `THUMBNAIL_${direction.key}`,
    `Headline: ${direction.headline}`,
    `Subject direction: ${direction.subjectDirection}`,
    `Focal action: ${direction.focalAction}`,
    `Composition direction: ${direction.compositionDirection}`,
    `Emotional tone: ${direction.emotionalTone}`,
    `Visual hierarchy: ${direction.visualHierarchy}`,
    `Title compatibility: ${direction.titleCompatibility}`,
    `Integrity rationale: ${direction.integrityRationale}`,
    `Render direction: ${direction.renderDirection}`,
    `Mood/style: ${direction.moodStyle}`,
    `Subject classification: ${direction.subjectClassification}`,
    `Composition classification: ${direction.compositionClassification}`,
    `Dominant colors: ${direction.dominantColors.join(", ")}`,
  ].join("\n"));
  return [strategyLines.join("\n"), ...directionBlocks].join("\n\n");
}

export type PaidThumbnailDirectionValidation =
  | { ok: true; output: PaidThumbnailDirectionOutput }
  | { ok: false; error: string };

export function validatePaidThumbnailDirectionOutput(value: unknown): PaidThumbnailDirectionValidation {
  if (typeof value !== "string") return { ok: false, error: "invalid_thumbnail_direction_output" };
  if (new TextEncoder().encode(value).byteLength > HEARTH_THUMBNAIL_DIRECTION_MAX_RESPONSE_BYTES) {
    return { ok: false, error: "thumbnail_direction_output_oversized" };
  }
  const text = value.replace(/\r\n?/g, "\n")
    .split("\n").map((line) => line.replace(/[\t ]+$/g, "")).join("\n").trim();
  if (!text || /```|^\s*#{1,6}\s/m.test(text)) return { ok: false, error: "invalid_thumbnail_direction_wrapper" };
  const sections = parseSections(text);
  if (!sections || sections.size !== 4
    || [...sections.keys()].some((header, index) => header !== [...SECTION_HEADERS][index])) {
    return { ok: false, error: "invalid_thumbnail_direction_sections" };
  }
  const strategyFields = sections.get("THUMBNAIL_STRATEGY")!;
  if (!exactFields(strategyFields, STRATEGY_FIELDS)) return { ok: false, error: "invalid_thumbnail_strategy_fields" };
  const prohibitedExaggerations = normalizeList(strategyFields.get("Prohibited exaggerations")!);
  if (!prohibitedExaggerations.length) return { ok: false, error: "invalid_thumbnail_strategy_list" };
  const strategy: PaidThumbnailDirectionStrategy = {
    episodePromise: strategyFields.get("Episode promise")!,
    intendedViewer: strategyFields.get("Intended viewer")!,
    curiosityMechanism: strategyFields.get("Curiosity mechanism")!,
    editorialPositioning: strategyFields.get("Editorial positioning")!,
    truthfulConnection: strategyFields.get("Truthful connection")!,
    prohibitedExaggerations,
  };
  const directions = THUMBNAIL_DIRECTION_KEYS.map((key): PaidThumbnailDirection | null => {
    const fields = sections.get(`THUMBNAIL_${key}`)!;
    if (!exactFields(fields, DIRECTION_FIELDS)) return null;
    const dominantColors = normalizeList(fields.get("Dominant colors")!);
    if (dominantColors.length < 2 || dominantColors.length > 4) return null;
    return {
      key,
      headline: fields.get("Headline")!, subjectDirection: fields.get("Subject direction")!,
      focalAction: fields.get("Focal action")!, compositionDirection: fields.get("Composition direction")!,
      emotionalTone: fields.get("Emotional tone")!, visualHierarchy: fields.get("Visual hierarchy")!,
      titleCompatibility: fields.get("Title compatibility")!, integrityRationale: fields.get("Integrity rationale")!,
      renderDirection: fields.get("Render direction")!, moodStyle: fields.get("Mood/style")!,
      subjectClassification: fields.get("Subject classification")!,
      compositionClassification: fields.get("Composition classification")!, dominantColors,
    };
  });
  if (directions.some((direction) => !direction)) return { ok: false, error: "invalid_thumbnail_direction_fields" };
  const exactDirections = directions as [PaidThumbnailDirection, PaidThumbnailDirection, PaidThumbnailDirection];
  if (!materiallyDistinct(exactDirections)) return { ok: false, error: "duplicate_thumbnail_directions" };
  const result = { strategy, directions: exactDirections };
  return { ok: true, output: { ...result, text: renderCanonical(result) } };
}
