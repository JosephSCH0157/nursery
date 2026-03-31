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
};

type NormalizedVisualBeat = {
  scene: string;
  subject: string;
  framing: string;
  tone: string;
  timeOfDay: string | null;
  location: string | null;
  cuePhrase: string | null;
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
  const combined = dedupeStrings([
    subject,
    ...sceneSegments,
    cleanText(args.secondaryText) ?? "",
  ]).join(" ");

  return {
    scene: limitWords(combined || subject, 55),
    subject: limitWords(subject, 20),
    framing,
    tone,
    timeOfDay: extractTimeOfDay(combined),
    location: cleanText(args.location) ?? extractLocation(combined),
    cuePhrase: cleanText(args.cuePhrase),
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
    beat.location ? `Set it in ${beat.location}.` : "",
    beat.timeOfDay ? `Play the light as ${beat.timeOfDay}.` : "",
    toSentence(beat.framing, "Keep the composition legible and editorial."),
    "Photoreal documentary still, strong focal separation, layered foreground/background depth, clean negative space for a short overlay, no recognizable outlet branding.",
  ].filter(Boolean).join(" "), 105);

  return {
    provider: "openart",
    prompt,
    negative: dedupeStrings([
      ...beat.avoid,
      "duplicate subjects",
      "distorted hands",
      "mangled faces",
      "muddy composition",
      "unreadable chart text",
    ]).join(", "),
    styleTags: dedupeStrings([
      "documentary realism",
      "cinematic editorial",
      ...beat.styleHints,
    ]).slice(0, 5),
    aspectRatio,
    notes: buildNotes({
      providerLabel: "OpenArt",
      usedFallback: context.usedFallback,
      extraNotes: context.notes,
      providerHint: "Descriptive pack with negative prompt and optional style tags.",
    }),
  };
}

function buildGptImagesPrompt(beat: NormalizedVisualBeat, context: PromptPackContext): PromptPack {
  const aspectRatio = resolveAspectRatio(context, VISUAL_PROVIDER_PROFILES.gpt_images);
  const prompt = limitWords([
    `An editorial image showing ${beat.scene}.`,
    beat.location ? `Place it in ${beat.location}.` : "",
    beat.timeOfDay ? `Let the frame read as ${beat.timeOfDay}.` : "",
    `The main subject is ${beat.subject}.`,
    toSentence(beat.framing, "Keep the hierarchy simple and readable."),
    "Keep it realistic, uncluttered, and free of logos or branded lower-thirds.",
  ].filter(Boolean).join(" "), 110);

  return {
    provider: "gpt_images",
    prompt,
    aspectRatio,
    notes: buildNotes({
      providerLabel: "GPT Images",
      usedFallback: context.usedFallback,
      extraNotes: context.notes,
      providerHint: "Natural-language pack tuned for direct paste.",
    }),
  };
}

function buildGenericPrompt(beat: NormalizedVisualBeat, context: PromptPackContext): PromptPack {
  const aspectRatio = resolveAspectRatio(context, VISUAL_PROVIDER_PROFILES.generic);
  const prompt = limitWords([
    toSentence(beat.scene, "Editorial still with a clear focal subject."),
    toSentence(beat.framing, "Keep the frame readable at a glance."),
    beat.location ? `Location cue: ${beat.location}.` : "",
    beat.timeOfDay ? `Time cue: ${beat.timeOfDay}.` : "",
    "Avoid logos, watermarks, and branded graphics.",
  ].filter(Boolean).join(" "), 90);

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
      });
      const pack = provider.profile.buildPrompt(normalizedBeat, {
        aspectRatio: input.aspectRatio,
        usedFallback: provider.usedFallback,
        notes: buildThumbnailVariantNotes(base.notes, variant.tagline),
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
  });
  const pack = provider.profile.buildPrompt(normalizedBeat, {
    aspectRatio: args.aspectRatio ?? "16:9",
    usedFallback: provider.usedFallback,
    notes: buildReferenceClipNotes(brief),
  });
  return { pack, provider, brief };
}

export function serializePromptPack(pack: PromptPack): string {
  return JSON.stringify(pack, null, 2);
}
