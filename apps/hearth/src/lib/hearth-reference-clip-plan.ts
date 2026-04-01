import type {
  EpisodeContextualDataCompositePlan,
  EpisodeImageMapEntry,
  EpisodeImageMapScriptAnchor,
  EpisodeBulletBeatAnchor,
  EpisodeReferenceClipChartType,
  EpisodeReferenceClipDataType,
  EpisodeReferenceClipFormat,
  EpisodeReferenceClipMotionLevel,
  EpisodeReferenceClipTone,
} from "./episode-package-v2";
import { resolveImageMapDisplayAnchor } from "./episode-package-v2";
import { deriveReferenceClipPurpose } from "./hearth-visual-purpose";

function nowIso(): string {
  return new Date().toISOString();
}

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length ? normalized : null;
}

function toSentence(value: string | null | undefined, fallback: string): string {
  const cleaned = cleanText(value) ?? fallback;
  const capitalized = `${cleaned[0]?.toUpperCase() ?? ""}${cleaned.slice(1)}`;
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function normalizeLookupText(value: string | null | undefined): string {
  return (cleanText(value) ?? "")
    .replace(/^[“”"'`]+|[“”"'`]+$/g, "")
    .toLowerCase();
}

function tokenizeForOverlap(value: string | null | undefined): string[] {
  return normalizeLookupText(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function computeTokenOverlap(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = tokenizeForOverlap(left);
  const rightTokens = new Set(tokenizeForOverlap(right));
  if (leftTokens.length === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / leftTokens.length;
}

function buildReferenceClipChartInstruction(entry: EpisodeContextualDataCompositePlan): string {
  switch (entry.chart_type ?? "line") {
    case "map":
      return "map-style editorial explainer with highlighted geography and no embedded labels";
    case "comparison":
      return "comparison-style editorial explainer with a visibly different two-sided read";
    case "timeline":
      return "timeline-style historical explainer with a clear sense of progression";
    case "bar":
      return "bar-chart-style data composite that reads at a glance";
    case "area":
      return "area-chart-style data composite with strong trend readability";
    case "scatter":
      return "scatter-plot-style explanatory composite with obvious relationship cues";
    case "stat_card":
      return "stat-card-style editorial composite centered on one key takeaway";
    default:
      return entry.data_type === "timeline"
        ? "trend-line editorial composite with a clear over-time read"
        : "data-forward editorial composite with a clear trend read";
  }
}

function buildReferenceClipMatchCorpus(entry: EpisodeContextualDataCompositePlan): string {
  return [
    entry.anchor_text,
    entry.description,
    entry.background_context_description,
    entry.foreground_data_description,
    entry.title ?? "",
    ...(entry.labels ?? []),
    entry.emphasis_key ?? "",
  ].filter(Boolean).join(" ");
}

function buildImageMapMatchCorpus(entry: EpisodeImageMapEntry): string {
  return [
    entry.anchor,
    entry.script_anchor?.span_text ?? "",
    entry.description,
    entry.visual_intent,
    entry.prompt_basis,
    entry.section_intent_note ?? "",
  ].filter(Boolean).join(" ");
}

function scoreReferenceClipSourceImageEntry(
  referenceClipEntry: EpisodeContextualDataCompositePlan,
  imageMapEntry: EpisodeImageMapEntry,
): number {
  const referenceAnchor = normalizeLookupText(referenceClipEntry.anchor_text);
  const imageAnchor = normalizeLookupText(imageMapEntry.anchor);
  const imageSpan = normalizeLookupText(imageMapEntry.script_anchor?.span_text);
  const referenceDescription = normalizeLookupText(referenceClipEntry.description);
  const imageDescription = normalizeLookupText(imageMapEntry.description);
  const imageVisualIntent = normalizeLookupText(imageMapEntry.visual_intent);
  const referenceCorpus = buildReferenceClipMatchCorpus(referenceClipEntry);
  const imageCorpus = buildImageMapMatchCorpus(imageMapEntry);

  let score = 0;
  if (referenceAnchor && (referenceAnchor === imageAnchor || referenceAnchor === imageSpan)) score += 6;
  if (referenceDescription && (referenceDescription === imageDescription || referenceDescription === imageVisualIntent)) score += 4;
  score += computeTokenOverlap(referenceCorpus, imageCorpus) * 3;
  score += computeTokenOverlap(imageCorpus, referenceCorpus) * 2;
  if (imageMapEntry.purpose === "explanation") score += 1;
  if (imageMapEntry.script_anchor || imageMapEntry.beat_anchor) score += 1;
  return score;
}

export function inferReferenceClipSuitabilitySignals(scriptText: string): string[] {
  const lower = scriptText.toLowerCase();
  const signals: string[] = [];
  if (/\bincrease\b|\bdecrease\b|\bdecline\b|\bgrowth\b|\btrend\b/.test(lower)) signals.push("trend");
  if (/\bover the last\b|\bsince \d{4}\b|\byears?\b/.test(lower)) signals.push("over_time");
  if (/\bversus\b|\bcompared to\b|\bcomparison\b/.test(lower)) signals.push("comparison");
  if (/\bmap\b|\bregion\b|\bcity\b|\bcounty\b|\bcountry\b/.test(lower)) signals.push("geographic");
  if (/\bpercent\b|\bpercentage\b|\bstat\b|\bmetric\b|\brate\b/.test(lower)) signals.push("statistics");
  if (/\bpolicy\b|\brollout\b|\bimpact\b/.test(lower)) signals.push("policy_impact");
  return signals;
}

function inferDataType(signals: string[]): EpisodeReferenceClipDataType {
  if (signals.includes("geographic")) return "geographic";
  if (signals.includes("over_time")) return "timeline";
  if (signals.includes("comparison")) return "comparison";
  if (signals.includes("statistics")) return "quantitative";
  return "categorical";
}

function inferChartType(dataType: EpisodeReferenceClipDataType): EpisodeReferenceClipChartType {
  if (dataType === "timeline") return "timeline";
  if (dataType === "geographic") return "map";
  if (dataType === "comparison") return "comparison";
  if (dataType === "categorical") return "bar";
  return "line";
}

function inferTone(signals: string[]): EpisodeReferenceClipTone {
  if (signals.includes("policy_impact")) return "investigative";
  if (signals.includes("trend")) return "analytical";
  return "neutral";
}

function inferMotionLevel(format: EpisodeReferenceClipFormat): EpisodeReferenceClipMotionLevel {
  if (format === "animated" || format === "hybrid") return "full_animation";
  return "static";
}

export function createReferenceClipPlan(args: {
  workpieceId: string;
  anchorText: string;
  description?: string;
  format?: EpisodeReferenceClipFormat;
}): EpisodeContextualDataCompositePlan {
  const generatedAt = nowIso();
  const description = (args.description ?? args.anchorText).trim();
  const signals = inferReferenceClipSuitabilitySignals(description);
  const dataType = inferDataType(signals);
  const chartType = inferChartType(dataType);
  const format = args.format ?? "still";
  return {
    id: createClientId("cdc"),
    workpiece_id: args.workpieceId,
    media_type: "contextual_data_composite",
    anchor_text: args.anchorText.trim(),
    placement_hint: "first_occurrence",
    timestamp_ms: null,
    purpose: deriveReferenceClipPurpose(),
    format,
    data_type: dataType,
    context_type: signals.includes("geographic") ? "location" : "historical",
    tone: inferTone(signals),
    motion_level: inferMotionLevel(format),
    description,
    background_context_description: "",
    foreground_data_description: "",
    visual_style: null,
    chart_type: chartType,
    title: null,
    labels: [],
    values: [],
    emphasis_key: null,
    candidate_assets: [],
    external_request: {
      state: "planned",
      updated_at: generatedAt,
    },
    selected_asset_id: null,
    source_type: "planned",
    origin: "hearth",
    created_at: generatedAt,
    updated_at: generatedAt,
  };
}

export function buildReferenceClipGenerationGuidance(entry: EpisodeContextualDataCompositePlan): {
  visualIntent: string;
  promptBasis: string;
} {
  const description = cleanText(entry.description) ?? cleanText(entry.anchor_text) ?? "Editorial reference visual";
  const background = cleanText(entry.background_context_description);
  const foreground = cleanText(entry.foreground_data_description);
  const title = cleanText(entry.title);
  const emphasis = cleanText(entry.emphasis_key);
  const labels = (entry.labels ?? [])
    .map((label) => cleanText(label))
    .filter((label): label is string => Boolean(label))
    .slice(0, 4);
  const chartInstruction = buildReferenceClipChartInstruction(entry);
  const tone = entry.tone.replace(/_/g, " ");
  const style = cleanText(entry.visual_style?.replace(/_/g, " "));

  return {
    visualIntent: [
      toSentence(description, "Create an editorial reference visual."),
      `Use a ${chartInstruction}.`,
      emphasis ? `Make ${emphasis} the visual takeaway.` : null,
    ].filter(Boolean).join(" "),
    promptBasis: [
      toSentence(description, "Create an editorial reference visual."),
      background ? `Background context: ${background}.` : null,
      foreground ? `Foreground data layer: ${foreground}.` : null,
      `Data treatment: ${chartInstruction}.`,
      title ? `Title cue: ${title}.` : null,
      labels.length ? `Key labels or entities: ${labels.join(", ")}.` : null,
      emphasis ? `Emphasis: ${emphasis}.` : null,
      style ? `Visual style: ${style}.` : null,
      `Tone: ${tone}.`,
      "Keep it grounded, readable, and useful as an editorial explainer with no readable text, labels, or numbers embedded in the image.",
    ].filter(Boolean).join(" "),
  };
}

export function resolveReferenceClipSourceImageEntry(args: {
  entry: EpisodeContextualDataCompositePlan;
  imageMapEntries: EpisodeImageMapEntry[];
  selectedImageMapEntry?: EpisodeImageMapEntry | null;
}): EpisodeImageMapEntry | null {
  const selectedScore = args.selectedImageMapEntry
    ? scoreReferenceClipSourceImageEntry(args.entry, args.selectedImageMapEntry)
    : 0;
  const bestCandidate = args.imageMapEntries
    .map((entry) => ({
      entry,
      score: scoreReferenceClipSourceImageEntry(args.entry, entry),
    }))
    .sort((left, right) => right.score - left.score)[0] ?? null;

  if (args.selectedImageMapEntry && selectedScore >= Math.max(2, bestCandidate?.score ?? 0)) {
    return args.selectedImageMapEntry;
  }
  if ((bestCandidate?.score ?? 0) >= 2) {
    return bestCandidate?.entry ?? null;
  }
  return selectedScore >= 2 ? (args.selectedImageMapEntry ?? null) : null;
}

export function buildReferenceClipImageMapBridgeEntry(args: {
  entry: EpisodeContextualDataCompositePlan;
  tempEntryId: string;
  beatOrder: number;
  sourceEntry?: EpisodeImageMapEntry | null;
  scriptAnchor?: EpisodeImageMapScriptAnchor | null;
  beatAnchor?: EpisodeBulletBeatAnchor | null;
}): EpisodeImageMapEntry {
  const scriptAnchor = args.scriptAnchor ?? args.sourceEntry?.script_anchor ?? null;
  const beatAnchor = args.beatAnchor ?? args.sourceEntry?.beat_anchor ?? null;
  const guidance = buildReferenceClipGenerationGuidance(args.entry);

  return {
    id: args.tempEntryId,
    anchor: resolveImageMapDisplayAnchor(args.sourceEntry?.anchor ?? args.entry.anchor_text, scriptAnchor, beatAnchor),
    script_anchor: scriptAnchor,
    beat_anchor: beatAnchor,
    anchor_scope: scriptAnchor ? "attached" : (beatAnchor ? "beat" : "orphaned"),
    purpose: args.sourceEntry?.purpose ?? args.entry.purpose,
    description: cleanText(args.entry.description) ?? cleanText(args.entry.anchor_text) ?? "Reference clip",
    visual_intent: guidance.visualIntent,
    prompt_basis: guidance.promptBasis,
    style_preset: args.entry.visual_style ?? args.sourceEntry?.style_preset ?? null,
    intent: "graphic",
    source_type: "ai",
    origin: "hearth",
    visual_priority: args.sourceEntry?.visual_priority ?? "supporting",
    visual_type: args.entry.format === "animated" || args.entry.format === "hybrid" ? "motion_graphic" : "diagram",
    section_intent_note: cleanText(args.entry.background_context_description) ?? args.sourceEntry?.section_intent_note ?? null,
    beat_order: args.beatOrder,
    paragraph_beat_order: 1,
    candidate_assets: [],
    selected_asset_id: null,
    status: scriptAnchor || beatAnchor ? "mapped" : "draft",
    placement_hint: args.entry.placement_hint,
  };
}

export const inferCdcSuitabilitySignals = inferReferenceClipSuitabilitySignals;
export const createContextualDataCompositePlan = createReferenceClipPlan;
