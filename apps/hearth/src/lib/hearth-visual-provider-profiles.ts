import type { EpisodeContextualDataCompositePlan } from "./episode-package-v2";
import {
  buildReferenceClipBrief,
  type ReferenceClipBrief,
} from "./hearth-visual-actionability";
import {
  buildThumbnailPrompts,
  type BuildThumbnailPromptsInput,
  type PromptVariant,
} from "./hearth-thumbnail-prompt-builder";

export const VISUAL_PROVIDER_IDS = ["openart", "gpt_images", "generic"] as const;
export type VisualProviderId = (typeof VISUAL_PROVIDER_IDS)[number];
export type VisualProviderPromptStyle = "descriptive" | "instructional" | "tag-based";

export type PromptPack = {
  prompt: string;
  negative?: string;
  styleTags?: string[];
  notes?: string;
  aspectRatio?: string;
  provider: VisualProviderId;
};

export type VisualProviderProfile = {
  id: VisualProviderId;
  label: string;
  promptStyle: VisualProviderPromptStyle;
  supportsNegative: boolean;
  supportsStyleTags: boolean;
  defaultAspectRatios: string[];
  recommendedStyles: string[];
  buildPrompt: (beat: NormalizedVisualBeat, context: PromptPackContext) => PromptPack;
};

export type VisualProviderOption = {
  id: VisualProviderId;
  label: string;
  helperText: string;
};

export type ResolvedVisualProvider = {
  id: VisualProviderId;
  label: string;
  profile: VisualProviderProfile;
  source: "workpiece_override" | "global_default" | "generic_fallback";
  usedFallback: boolean;
  requestedProviderId: string | null;
  bannerLabel: string;
  helperText: string;
};

export type ThumbnailPromptPackVariant = PromptVariant & {
  pack: PromptPack;
};

export type BuildThumbnailPromptPackVariantsInput = BuildThumbnailPromptsInput & {
  aspectRatio?: string | null;
  providerId?: string | null;
  resolvedProvider?: ResolvedVisualProvider;
};

export type BuildThumbnailPromptPackVariantsOutput = {
  variants: ThumbnailPromptPackVariant[];
  notes?: string;
  provider: ResolvedVisualProvider;
};

type PromptPackContext = {
  aspectRatio?: string | null;
  usedFallback?: boolean;
  notes?: string | null;
  intendedUse?: "thumbnail" | "reference_clip";
};

type NormalizedVisualBeat = {
  scene: string;
  subject: string;
  framing: string;
  tone: string;
  timeOfDay: string | null;
  location: string | null;
  cuePhrase: string | null;
  scenePurpose: string;
  compositionHint: string;
  realismTarget: string;
  useGuidance: string;
  styleHints: string[];
  avoid: string[];
};

const VISUAL_PROVIDER_OPTIONS: VisualProviderOption[] = [
  {
    id: "openart",
    label: "OpenArt",
    helperText: "Descriptive, cinematic packs with negative prompts and style tags.",
  },
  {
    id: "gpt_images",
    label: "GPT Images",
    helperText: "Natural-language packs that read like clear visual instructions.",
  },
  {
    id: "generic",
    label: "Generic",
    helperText: "Safe fallback when no provider is selected or the id is unrecognized.",
  },
];

const DEFAULT_GENERIC_AVOID = [
  "logos",
  "watermarks",
  "branded graphics",
  "readable wall-of-text overlays",
];

function readProviderString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

export function normalizeVisualProviderId(value: unknown): VisualProviderId | null {
  const normalized = readProviderString(value);
  if (normalized === "openart" || normalized === "gpt_images" || normalized === "generic") {
    return normalized;
  }
  return null;
}

export function listVisualProviderOptions(): VisualProviderOption[] {
  return [...VISUAL_PROVIDER_OPTIONS];
}

export function resolveVisualProviderOptionLabel(providerId: VisualProviderId): string {
  return VISUAL_PROVIDER_OPTIONS.find((option) => option.id === providerId)?.label ?? "Generic";
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeWhitespace(value)
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  return normalized.length ? normalized : null;
}

function dedupeStrings(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value)?.toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(cleanText(value) ?? normalized);
  }
  return output;
}

function splitSegments(value: string | null | undefined): string[] {
  const cleaned = cleanText(value);
  if (!cleaned) return [];
  return cleaned
    .split(/\n+|(?<=[.!?;:])\s+/)
    .map((segment) => cleanText(segment))
    .filter(Boolean) as string[];
}

function limitWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value.trim();
  const trimmed = words.slice(0, maxWords).join(" ").replace(/[,:;]$/, "");
  return `${trimmed}.`;
}

function sentenceToClause(value: string | null | undefined, fallback: string): string {
  return toSentence(value, fallback).replace(/[.!?]$/, "");
}

function toSentence(value: string | null | undefined, fallback: string): string {
  const cleaned = cleanText(value)
    ?.replace(/^[,.;:!?-]+/, "")
    .trim();
  const next = cleaned || fallback;
  if (!next) return fallback;
  const capitalized = `${next[0]?.toUpperCase() ?? ""}${next.slice(1)}`;
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function extractTimeOfDay(value: string): string | null {
  const lower = value.toLowerCase();
  if (/\b(after dark|night|nightfall|nighttime)\b/.test(lower)) return "night";
  if (/\b(dawn|sunrise|early morning|morning)\b/.test(lower)) return "morning";
  if (/\b(afternoon|midday|noon)\b/.test(lower)) return "day";
  if (/\b(sunset|dusk|golden hour|evening)\b/.test(lower)) return "evening";
  return null;
}

function extractLocation(value: string): string | null {
  const explicit = value.match(/\b(?:in|at|near)\s+([A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){0,3})/);
  return explicit?.[1]?.trim() ?? null;
}

function inferScenePurpose(source: string): string {
  const normalized = source.toLowerCase();
  if (/\b(vs|versus|split|comparison|contrast|framing|frame|outlet|coverage)\b/.test(normalized)) {
    return "Show the same story through two visibly different editorial reads";
  }
  if (/\b(after dark|escalation|tear gas|riot|arrest|police|clash|chaos)\b/.test(normalized)) {
    return "Emphasize the turn from public gathering to visible escalation";
  }
  if (/\b(map|county|region|geographic|location)\b/.test(normalized)) {
    return "Lead with geographic context and make the location instantly legible";
  }
  if (/\b(chart|line chart|bar chart|timeline|percent|drop|increase|data|stat)\b/.test(normalized)) {
    return "Translate the spoken data point into an immediately readable editorial visual";
  }
  return "Support the spoken point with one grounded editorial image";
}

function inferCompositionHint(source: string, intendedUse: PromptPackContext["intendedUse"]): string {
  const normalized = source.toLowerCase();
  if (/\b(vs|versus|split|comparison|contrast|framing)\b/.test(normalized)) {
    return intendedUse === "thumbnail"
      ? "Use a strong side-to-side comparison with one dominant focal side and a clean text pocket"
      : "Use a clear split composition so the comparison reads immediately under narration";
  }
  if (/\b(map|county|region|geographic)\b/.test(normalized)) {
    return "Use a simple map-first composition with one highlighted region and uncluttered supporting context";
  }
  if (/\b(chart|timeline|percent|data|stat|line chart|bar chart)\b/.test(normalized)) {
    return "Keep the chart or data layer prominent, with the real-world context supporting it rather than competing with it";
  }
  if (/\b(after dark|escalation|tear gas|arrest|police|clash|chaos)\b/.test(normalized)) {
    return "Use a foreground subject with visible environmental tension and readable depth behind them";
  }
  return intendedUse === "thumbnail"
    ? "Keep one dominant focal subject, strong depth separation, and room for a short overlay"
    : "Keep one clear focal subject and a readable background context";
}

function inferRealismTarget(source: string): string {
  const normalized = source.toLowerCase();
  if (/\b(illustration|illustrated|marker|pencil|oil|paint|painting|drawing)\b/.test(normalized)) {
    return "editorial illustration";
  }
  if (/\b(3d|render|animation)\b/.test(normalized)) {
    return "polished editorial render";
  }
  if (/\b(studio|photography|photo)\b/.test(normalized)) {
    return "editorial photography";
  }
  if (/\b(cinematic|documentary|realism|realistic|photoreal)\b/.test(normalized)) {
    return "photoreal documentary still";
  }
  return "photoreal editorial still";
}

function inferUseGuidance(intendedUse: PromptPackContext["intendedUse"]): string {
  if (intendedUse === "thumbnail") {
    return "The frame should stay readable at thumbnail size and leave room for a short text overlay";
  }
  return "The frame should support spoken narration clearly and hold as an editorial reference visual";
}

function buildSparseSceneFallback(intendedUse: PromptPackContext["intendedUse"]): string {
  return intendedUse === "thumbnail"
    ? "A current-events scene with one clear focal subject, readable contrast, and background context that supports the click"
    : "A current-events reference visual with one clear focal subject and enough background context to explain the spoken point";
}

function buildProviderSafeStyleTags(beat: NormalizedVisualBeat): string[] {
  return dedupeStrings([
    beat.realismTarget,
    beat.timeOfDay ? `${beat.timeOfDay} lighting` : "",
    /\bcomparison\b|\bsplit\b/i.test(beat.compositionHint) ? "split composition" : "",
    /\bmap\b/i.test(beat.compositionHint) ? "map-first layout" : "",
    /\bchart\b|\bdata\b/i.test(beat.compositionHint) ? "editorial data composite" : "",
    ...beat.styleHints,
  ]).slice(0, 6);
}

function normalizeVisualBeat(args: {
  primaryText: string;
  secondaryText?: string | null;
  title?: string | null;
  tone?: string | null;
  location?: string | null;
  style?: string | null;
  labels?: readonly string[] | null;
  cuePhrase?: string | null;
  purpose?: string | null;
  intendedUse?: PromptPackContext["intendedUse"];
}): NormalizedVisualBeat {
  const primarySegments = splitSegments(args.primaryText);
  const secondarySegments = splitSegments(args.secondaryText);
  const title = cleanText(args.title);
  const tone = cleanText(args.tone) ?? "neutral editorial";
  const sceneSegments = dedupeStrings([
    ...primarySegments.slice(0, 2),
    ...secondarySegments.slice(0, 2),
  ]);
  const subject = sceneSegments[0] ?? "A current-events scene with a clear focal subject";
  const framing = title
    ? `Support the title "${title}" with a clean editorial read.`
    : cleanText(args.purpose)
      ? `${cleanText(args.purpose)} with a readable visual hierarchy.`
      : "Keep the visual hierarchy clean and the editorial read immediate.";
  const intendedUse = args.intendedUse ?? "thumbnail";
  const combined = dedupeStrings([
    subject,
    ...sceneSegments,
    cleanText(args.secondaryText) ?? "",
    cleanText(args.purpose) ?? "",
    title ?? "",
  ]).join(" ");
  const scenePurpose = inferScenePurpose(combined);
  const compositionHint = inferCompositionHint(combined, intendedUse);
  const realismTarget = inferRealismTarget([
    cleanText(args.style),
    tone,
    combined,
  ].filter(Boolean).join(" "));
  const useGuidance = inferUseGuidance(intendedUse);
  const sparseSceneFallback = buildSparseSceneFallback(intendedUse);

  return {
    scene: limitWords(combined || subject || sparseSceneFallback, 55),
    subject: limitWords(subject, 20),
    framing,
    tone,
    timeOfDay: extractTimeOfDay(combined),
    location: cleanText(args.location) ?? extractLocation(combined),
    cuePhrase: cleanText(args.cuePhrase),
    scenePurpose,
    compositionHint,
    realismTarget,
    useGuidance,
    styleHints: dedupeStrings([
      cleanText(args.style) ?? "",
      tone,
      ...(args.labels ?? []).slice(0, 4),
    ]).slice(0, 5),
    avoid: [...DEFAULT_GENERIC_AVOID],
  };
}

function resolveAspectRatio(context: PromptPackContext, profile: VisualProviderProfile): string {
  const requested = cleanText(context.aspectRatio);
  return requested ?? profile.defaultAspectRatios[0] ?? "16:9";
}

function buildNotes(args: {
  providerLabel: string;
  usedFallback?: boolean;
  extraNotes?: string | null;
  providerHint?: string;
}): string {
  const parts: string[] = [];
  if (args.usedFallback) {
    parts.push("Using: Generic (fallback).");
  } else {
    parts.push(`Using: ${args.providerLabel}.`);
  }
  if (args.providerHint) {
    parts.push(args.providerHint);
  }
  const extra = cleanText(args.extraNotes);
  if (extra) {
    parts.push(extra);
  }
  return parts.join(" ");
}

function buildOpenArtPrompt(beat: NormalizedVisualBeat, context: PromptPackContext): PromptPack {
  const aspectRatio = resolveAspectRatio(context, VISUAL_PROVIDER_PROFILES.openart);
  const prompt = limitWords([
    toSentence(beat.scene, "Editorial documentary scene with one unmistakable focal subject."),
    `Render it as a ${sentenceToClause(beat.realismTarget, "photoreal documentary still")}.`,
    toSentence(beat.scenePurpose, "Support the spoken point with one grounded editorial frame."),
    beat.location ? `Set it in ${beat.location}.` : "",
    beat.timeOfDay ? `Play the light as ${beat.timeOfDay}.` : "",
    toSentence(beat.compositionHint, "Keep the composition legible and editorial."),
    toSentence(beat.useGuidance, "Leave a clean read for editorial use."),
    beat.cuePhrase ? `If text appears anywhere in-scene, keep it subordinate to the cue phrase "${beat.cuePhrase}".` : "",
    "Believable faces and hands, natural documentary textures, layered foreground/background depth, no recognizable outlet branding or chyron graphics.",
  ].filter(Boolean).join(" "), 118);

  return {
    provider: "openart",
    prompt,
    negative: dedupeStrings([
      ...beat.avoid,
      "duplicate subjects",
      "distorted hands",
      "mangled faces",
      "muddy composition",
      "text artifacts",
      "oversaturated color grading",
      "plastic skin",
      "collage layout",
      "fake broadcast logos",
      "unreadable chart text",
    ]).join(", "),
    styleTags: buildProviderSafeStyleTags(beat),
    aspectRatio,
    notes: buildNotes({
      providerLabel: "OpenArt",
      usedFallback: context.usedFallback,
      extraNotes: context.notes,
      providerHint: context.intendedUse === "thumbnail"
        ? "Use this as a production-ready cinematic thumbnail prompt."
        : "Use this as a production-ready editorial reference-image prompt.",
    }),
  };
}

function buildGptImagesPrompt(beat: NormalizedVisualBeat, context: PromptPackContext): PromptPack {
  const aspectRatio = resolveAspectRatio(context, VISUAL_PROVIDER_PROFILES.gpt_images);
  const prompt = limitWords([
    `Create a ${beat.realismTarget} for a ${context.intendedUse === "reference_clip" ? "podcast reference visual" : "podcast thumbnail concept"}.`,
    `Show ${sentenceToClause(beat.scene, "a current-events scene with one clear focal subject")}.`,
    beat.location ? `Place it in ${beat.location}.` : "",
    beat.timeOfDay ? `Let the frame read as ${beat.timeOfDay}.` : "",
    `Make the main subject ${sentenceToClause(beat.subject, "one clear focal subject")}.`,
    toSentence(beat.scenePurpose, "Support the spoken point clearly."),
    toSentence(beat.compositionHint, "Keep the hierarchy simple and readable."),
    toSentence(beat.useGuidance, "Keep it clean and readable."),
    "Keep it realistic, uncluttered, and free of logos, branded lower-thirds, or fake broadcast bugs.",
  ].filter(Boolean).join(" "), 118);

  return {
    provider: "gpt_images",
    prompt,
    aspectRatio,
    notes: buildNotes({
      providerLabel: "GPT Images",
      usedFallback: context.usedFallback,
      extraNotes: context.notes,
      providerHint: "Natural-language instruction pack tuned for direct paste.",
    }),
  };
}

function buildGenericPrompt(beat: NormalizedVisualBeat, context: PromptPackContext): PromptPack {
  const aspectRatio = resolveAspectRatio(context, VISUAL_PROVIDER_PROFILES.generic);
  const prompt = limitWords([
    toSentence(beat.scene, "Editorial still with a clear focal subject."),
    toSentence(beat.scenePurpose, "Support the spoken point clearly."),
    toSentence(beat.compositionHint, "Keep the frame readable at a glance."),
    beat.location ? `Location cue: ${beat.location}.` : "",
    beat.timeOfDay ? `Time cue: ${beat.timeOfDay}.` : "",
    toSentence(beat.useGuidance, "Keep it readable for editorial use."),
    `Aim for a ${sentenceToClause(beat.realismTarget, "photoreal editorial still")}.`,
    "Avoid logos, watermarks, and branded graphics.",
  ].filter(Boolean).join(" "), 98);

  return {
    provider: "generic",
    prompt,
    aspectRatio,
    notes: buildNotes({
      providerLabel: "Generic",
      usedFallback: context.usedFallback ?? true,
      extraNotes: context.notes,
      providerHint: "Safe fallback pack with minimal provider assumptions.",
    }),
  };
}

export const VISUAL_PROVIDER_PROFILES: Record<VisualProviderId, VisualProviderProfile> = {
  openart: {
    id: "openart",
    label: "OpenArt",
    promptStyle: "descriptive",
    supportsNegative: true,
    supportsStyleTags: true,
    defaultAspectRatios: ["16:9", "1:1", "9:16"],
    recommendedStyles: ["documentary realism", "cinematic editorial", "photoreal"],
    buildPrompt: buildOpenArtPrompt,
  },
  gpt_images: {
    id: "gpt_images",
    label: "GPT Images",
    promptStyle: "instructional",
    supportsNegative: false,
    supportsStyleTags: false,
    defaultAspectRatios: ["16:9", "1:1", "9:16"],
    recommendedStyles: ["editorial still", "clear composition"],
    buildPrompt: buildGptImagesPrompt,
  },
  generic: {
    id: "generic",
    label: "Generic",
    promptStyle: "descriptive",
    supportsNegative: false,
    supportsStyleTags: false,
    defaultAspectRatios: ["16:9", "1:1", "9:16"],
    recommendedStyles: ["editorial", "readable composition"],
    buildPrompt: buildGenericPrompt,
  },
};

export function resolveActiveVisualProvider(args: {
  override?: string | null;
  defaultProvider?: string | null;
}): ResolvedVisualProvider {
  const rawOverride = readProviderString(args.override);
  const overrideId = normalizeVisualProviderId(rawOverride);
  if (rawOverride) {
    if (overrideId) {
      return {
        id: overrideId,
        label: VISUAL_PROVIDER_PROFILES[overrideId].label,
        profile: VISUAL_PROVIDER_PROFILES[overrideId],
        source: "workpiece_override",
        usedFallback: false,
        requestedProviderId: rawOverride,
        bannerLabel: `Using: ${VISUAL_PROVIDER_PROFILES[overrideId].label}`,
        helperText: "Episode override",
      };
    }
    return {
      id: "generic",
      label: VISUAL_PROVIDER_PROFILES.generic.label,
      profile: VISUAL_PROVIDER_PROFILES.generic,
      source: "generic_fallback",
      usedFallback: true,
      requestedProviderId: rawOverride,
      bannerLabel: "Using: Generic (fallback)",
      helperText: "Episode override was not recognized, so Hearth fell back to Generic.",
    };
  }

  const rawDefault = readProviderString(args.defaultProvider);
  const defaultId = normalizeVisualProviderId(rawDefault);
  if (defaultId) {
    return {
      id: defaultId,
      label: VISUAL_PROVIDER_PROFILES[defaultId].label,
      profile: VISUAL_PROVIDER_PROFILES[defaultId],
      source: "global_default",
      usedFallback: false,
      requestedProviderId: rawDefault,
      bannerLabel: `Using: ${VISUAL_PROVIDER_PROFILES[defaultId].label}`,
      helperText: "Global default",
    };
  }

  return {
    id: "generic",
    label: VISUAL_PROVIDER_PROFILES.generic.label,
    profile: VISUAL_PROVIDER_PROFILES.generic,
    source: "generic_fallback",
    usedFallback: true,
    requestedProviderId: rawDefault,
    bannerLabel: "Using: Generic (fallback)",
    helperText: rawDefault
      ? "Global visual provider was not recognized, so Hearth fell back to Generic."
      : "No visual provider is set yet, so Hearth is using Generic.",
  };
}

function buildThumbnailVariantNotes(baseNotes: string | undefined, tagline: string | undefined): string | null {
  const parts = [cleanText(tagline), cleanText(baseNotes)].filter(Boolean) as string[];
  return parts.length ? parts.join(" ") : null;
}

export function buildThumbnailPromptPackVariants(
  input: BuildThumbnailPromptPackVariantsInput,
): BuildThumbnailPromptPackVariantsOutput {
  const provider = input.resolvedProvider ?? resolveActiveVisualProvider({ defaultProvider: input.providerId ?? null });
  const base = buildThumbnailPrompts(input);
  return {
    notes: base.notes,
    provider,
    variants: base.variants.map((variant) => {
      const normalizedBeat = normalizeVisualBeat({
        primaryText: variant.prompt,
        secondaryText: input.conceptBrief,
        title: input.title,
        tone: input.tone,
        style: variant.style.replace(/_/g, " "),
        cuePhrase: variant.tagline ?? null,
        intendedUse: "thumbnail",
      });
      const pack = provider.profile.buildPrompt(normalizedBeat, {
        aspectRatio: input.aspectRatio,
        usedFallback: provider.usedFallback,
        notes: buildThumbnailVariantNotes(base.notes, variant.tagline),
        intendedUse: "thumbnail",
      });
      return {
        ...variant,
        pack,
      };
    }),
  };
}

function buildReferenceClipNotes(brief: ReferenceClipBrief): string {
  const parts = [
    cleanText(brief.background_data_notes),
    cleanText(brief.foreground_data_notes),
    brief.chart.title ? `Chart title: ${brief.chart.title}.` : null,
    brief.chart.labels.length ? `Chart labels: ${brief.chart.labels.join(", ")}.` : null,
  ].filter(Boolean) as string[];
  return parts.join(" ");
}

export function buildReferenceClipPromptPack(args: {
  entry: EpisodeContextualDataCompositePlan;
  workpieceId: string;
  workpieceTitle?: string | null;
  providerId?: string | null;
  resolvedProvider?: ResolvedVisualProvider;
  aspectRatio?: string | null;
}): {
  pack: PromptPack;
  provider: ResolvedVisualProvider;
  brief: ReferenceClipBrief;
} {
  const brief = buildReferenceClipBrief({
    entry: args.entry,
    workpieceId: args.workpieceId,
    workpieceTitle: args.workpieceTitle,
  });
  const provider = args.resolvedProvider ?? resolveActiveVisualProvider({ defaultProvider: args.providerId ?? null });
  const normalizedBeat = normalizeVisualBeat({
    primaryText: `${brief.anchor_text}. ${brief.shot_intent}.`,
    secondaryText: [
      brief.background_data_notes,
      brief.foreground_data_notes,
      brief.chart.title,
      brief.chart.labels.join(", "),
    ].filter(Boolean).join(". "),
    title: brief.workpiece_title,
    tone: brief.tone,
    style: brief.style,
    labels: brief.keywords,
    cuePhrase: brief.chart.emphasis_key,
    purpose: brief.framing_mode,
    intendedUse: "reference_clip",
  });
  const pack = provider.profile.buildPrompt(normalizedBeat, {
    aspectRatio: args.aspectRatio ?? "16:9",
    usedFallback: provider.usedFallback,
    notes: buildReferenceClipNotes(brief),
    intendedUse: "reference_clip",
  });
  return { pack, provider, brief };
}

export function serializePromptPack(pack: PromptPack): string {
  return JSON.stringify(pack, null, 2);
}
