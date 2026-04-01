import {
  buildBulletBeatAnchorLabel,
  type EpisodeMediaMap,
  type EpisodeMediaMapEntry,
} from "./episode-package-v2";
import { formatHearthVisualPurposeLabel } from "./hearth-visual-purpose";

export type MediaMapGenerationScope = "images_only" | "images_broll" | "images_reference_clips" | "full_media_plan";

export type MediaMapConversationDirectionId = "comparison" | "escalation" | "contrast";

export type MediaMapConversationDirection = {
  id: MediaMapConversationDirectionId;
  label: string;
  lead: string;
  plan: string;
};

export type MediaMapConversationSeed = {
  lead: string;
  ask: string;
  derivedFromScript: boolean;
  directions: MediaMapConversationDirection[];
};

export type MediaMapConversationSummary = {
  directionLabel: string;
  constraintsLabel: string;
  sourceLabel: string;
};

export type MediaMapBeatCard = {
  id: string;
  title: string;
  description: string;
  whatItDoes: string;
  whyHere: string;
  holdLabel: string;
  mediaKindLabel: string;
  purposeLabel: string;
};

const BRANDED_LANGUAGE_REPLACEMENTS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bfox news\b/gi, replacement: "a cable news outlet" },
  { pattern: /\bcnn\b/gi, replacement: "a cable news outlet" },
  { pattern: /\bmsnbc\b/gi, replacement: "a cable news outlet" },
  { pattern: /\babc news?\b/gi, replacement: "a network news outlet" },
  { pattern: /\babc\b/gi, replacement: "a network news outlet" },
  { pattern: /\bcbs (news|la|los angeles)\b/gi, replacement: "a local TV news outlet" },
  { pattern: /\bktla\b/gi, replacement: "a local TV news outlet" },
  { pattern: /\busa today\b/gi, replacement: "a national newspaper outlet" },
  { pattern: /\bnew york times\b/gi, replacement: "a national newspaper outlet" },
  { pattern: /\bwashington post\b/gi, replacement: "a national newspaper outlet" },
  { pattern: /\blogos?\b/gi, replacement: "branding" },
];

const DIRECTION_LIBRARY: Record<MediaMapConversationDirectionId, Omit<MediaMapConversationDirection, "id">> = {
  comparison: {
    label: "Comparison",
    lead: "Lean into outlet-to-outlet framing shifts and let the visual package compare the same event through different editorial lenses.",
    plan: "I’ll structure the plan around framing changes, explanatory beats, and visual handoffs that make the comparison legible.",
  },
  escalation: {
    label: "Escalation",
    lead: "Build the visual package as a rising sequence from baseline footage into sharper conflict, so the viewer feels the turn.",
    plan: "I’ll lay this out like a progression: establish the baseline, then tighten the plan as the scene hardens.",
  },
  contrast: {
    label: "Contrast",
    lead: "Use visual oppositions so the audience can feel the split: calm versus volatile, broad claim versus street-level reality.",
    plan: "I’ll shape the plan around visual pairings and tension points so the contrast lands cleanly.",
  },
};

export function normalizeMediaMapGenerationScope(value: string | null | undefined): MediaMapGenerationScope {
  if (value === "images_reference_clips" || value === "images_cdc") return "images_reference_clips";
  if (value === "images_broll") return "images_broll";
  if (value === "images_only") return "images_only";
  return "full_media_plan";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function abstractBrandedLanguage(value: string): string {
  let next = value;
  for (const replacement of BRANDED_LANGUAGE_REPLACEMENTS) {
    next = next.replace(replacement.pattern, replacement.replacement);
  }
  return normalizeWhitespace(next);
}

function countMatches(source: string, patterns: readonly RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(source) ? 1 : 0), 0);
}

function resolveDirectionPriority(scriptText: string): MediaMapConversationDirectionId[] {
  const normalized = scriptText.toLowerCase();
  const scored: Array<{ id: MediaMapConversationDirectionId; score: number }> = [
    {
      id: "comparison",
      score: countMatches(normalized, [
        /\bcompare\b/,
        /\bcomparison\b/,
        /\bframe\b/,
        /\bframing\b/,
        /\boutlet\b/,
        /\bcoverage\b/,
        /\bheadline\b/,
        /\bmedia\b/,
        /\blens\b/,
        /\bversus\b/,
        /\bvs\b/,
      ]),
    },
    {
      id: "escalation",
      score: countMatches(normalized, [
        /\bescalat/,
        /\btear gas\b/,
        /\barrests?\b/,
        /\bclash/,
        /\bvolatile\b/,
        /\bchaos\b/,
        /\bafter dark\b/,
        /\bconfront/,
        /\briot/,
      ]),
    },
    {
      id: "contrast",
      score: countMatches(normalized, [
        /\bcontrast\b/,
        /\bpeaceful\b/,
        /\blater\b/,
        /\bflashpoint\b/,
        /\bshift\b/,
        /\bsplit\b/,
        /\bdifferent scene\b/,
        /\bbefore\b/,
        /\bafter\b/,
      ]),
    },
  ];
  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const order: MediaMapConversationDirectionId[] = ["comparison", "escalation", "contrast"];
      return order.indexOf(a.id) - order.indexOf(b.id);
    })
    .map((entry) => entry.id);
}

export function deriveMediaMapConversationFromScript(scriptText: string | null | undefined): MediaMapConversationSeed {
  const trimmed = scriptText?.trim() ?? "";
  const derivedFromScript = trimmed.length > 0;
  const orderedDirectionIds = resolveDirectionPriority(trimmed);
  const directions = orderedDirectionIds.map((id) => ({
    id,
    ...DIRECTION_LIBRARY[id],
  }));
  const primary = orderedDirectionIds[0] ?? "comparison";
  const lead = primary === "comparison"
    ? "I'm reading this as a media-framing episode."
    : primary === "escalation"
      ? "I'm reading this as an escalation story with a visible turn."
      : "I'm reading this as a contrast-driven episode where the split is the story.";
  const fallbackLead = "I can see a few workable visual packages here even before we fine-tune the beats.";

  return {
    lead: derivedFromScript ? lead : fallbackLead,
    ask: "Visually, we could lean comparison, escalation, or contrast. Which direction feels closest?",
    derivedFromScript,
    directions,
  };
}

function parseConstraintFlags(constraintsText: string) {
  const normalized = constraintsText.toLowerCase();
  const explicitLimitMatch = normalized.match(/\b(\d+)\s*(?:-|to)?\s*(\d+)?\s*(?:generated\s+)?(?:clips|visuals|beats)\b/);
  const explicitLimit = explicitLimitMatch
    ? Number(explicitLimitMatch[2] ?? explicitLimitMatch[1] ?? "0")
    : null;
  return {
    simple: /\bkeep it simple\b|\bsimple\b|\bminimal\b|\bminimalist\b/.test(normalized),
    brollHeavy: /\bheavier on b-?roll\b|\bmore b-?roll\b|\bb-?roll heavy\b/.test(normalized),
    referenceClipHeavy: /\bheavier on reference clips\b|\bmore reference clips\b/.test(normalized),
    avoidBrandedVisuals: /\bavoid branded visuals\b|\bavoid branded\b|\bno logos\b|\bavoid logos\b/.test(normalized),
    limit: explicitLimit && Number.isFinite(explicitLimit) ? Math.max(1, explicitLimit) : null,
  };
}

export function resolveMediaMapConversationScope(args: {
  directionId: MediaMapConversationDirectionId;
  constraintsText: string;
  fallbackScope?: MediaMapGenerationScope;
}): MediaMapGenerationScope {
  const flags = parseConstraintFlags(args.constraintsText);
  if (flags.referenceClipHeavy) return "images_reference_clips";
  if (flags.brollHeavy) return "full_media_plan";
  if (flags.simple || flags.limit) return "images_only";
  if (args.directionId === "escalation") return "images_broll";
  return args.fallbackScope ?? "full_media_plan";
}

function resolveMediaKindRank(
  entry: EpisodeMediaMapEntry,
  directionId: MediaMapConversationDirectionId,
  flags: ReturnType<typeof parseConstraintFlags>,
): number {
  if (flags.brollHeavy && entry.final_media_kind === "b_roll") return 0;
  if (directionId === "comparison") {
    if (entry.final_media_kind === "contextual_data_composite") return 0;
    if (entry.purpose === "explanation") return 1;
    if (entry.final_media_kind === "image") return 2;
    return 3;
  }
  if (directionId === "escalation") {
    if (entry.purpose === "coverage") return 0;
    if (entry.final_media_kind === "b_roll") return 1;
    if (entry.purpose === "emphasis") return 2;
    return 3;
  }
  if (entry.purpose === "coverage") return 0;
  if (entry.purpose === "explanation") return 1;
  if (entry.final_media_kind === "contextual_data_composite") return 2;
  return 3;
}

function resolvePurposeRank(entry: EpisodeMediaMapEntry): number {
  if (entry.purpose === "coverage") return 0;
  if (entry.purpose === "explanation") return 1;
  return 2;
}

function limitEntries(
  entries: readonly EpisodeMediaMapEntry[],
  flags: ReturnType<typeof parseConstraintFlags>,
): EpisodeMediaMapEntry[] {
  const desiredCount = flags.limit ?? (flags.simple ? 5 : null);
  if (!desiredCount || desiredCount >= entries.length) {
    return [...entries];
  }
  return entries.slice(0, desiredCount);
}

export function applyProducerDirectionToMediaMap(args: {
  map: EpisodeMediaMap;
  directionId: MediaMapConversationDirectionId;
  constraintsText: string;
}): EpisodeMediaMap {
  const flags = parseConstraintFlags(args.constraintsText);
  const ranked = args.map.entries
    .map((entry, index) => ({
      entry: {
        ...entry,
        description: flags.avoidBrandedVisuals ? abstractBrandedLanguage(entry.description) : entry.description,
        intent: flags.avoidBrandedVisuals ? abstractBrandedLanguage(entry.intent) : entry.intent,
      },
      index,
    }))
    .sort((a, b) => {
      const kindRank = resolveMediaKindRank(a.entry, args.directionId, flags) - resolveMediaKindRank(b.entry, args.directionId, flags);
      if (kindRank !== 0) return kindRank;
      const purposeRank = resolvePurposeRank(a.entry) - resolvePurposeRank(b.entry);
      if (purposeRank !== 0) return purposeRank;
      return a.index - b.index;
    })
    .map((item) => item.entry);
  const limited = limitEntries(ranked, flags).map((entry, index) => ({
    ...entry,
    critical: index === 0 ? true : entry.critical,
    optional: flags.simple && index >= 3 ? true : entry.optional,
  }));
  return {
    ...args.map,
    entries: limited,
  };
}

function resolveDirectionFromEntries(entries: readonly EpisodeMediaMapEntry[]): MediaMapConversationDirectionId {
  const comparisonSignals = entries.filter((entry) => entry.purpose === "explanation" || entry.final_media_kind === "contextual_data_composite").length;
  const escalationSignals = entries.filter((entry) => entry.final_media_kind === "b_roll").length;
  if (comparisonSignals >= escalationSignals && comparisonSignals > 0) return "comparison";
  if (escalationSignals > 0) return "escalation";
  return "contrast";
}

export function resolveMediaMapConversationSummary(args: {
  entries: readonly EpisodeMediaMapEntry[];
  directionId?: MediaMapConversationDirectionId | null;
  constraintsText?: string | null;
  derivedFromScript?: boolean;
}): MediaMapConversationSummary | null {
  if (args.entries.length === 0 && !args.directionId) return null;
  const directionId = args.directionId ?? resolveDirectionFromEntries(args.entries);
  const constraints = normalizeWhitespace(args.constraintsText ?? "");
  return {
    directionLabel: DIRECTION_LIBRARY[directionId].label,
    constraintsLabel: constraints || "No extra constraints",
    sourceLabel: args.derivedFromScript == null
      ? "Current map"
      : args.derivedFromScript
        ? "Derived from script"
        : "Chosen manually",
  };
}

function resolveMediaKindLabel(kind: EpisodeMediaMapEntry["final_media_kind"]): string {
  if (kind === "b_roll") return "B-roll";
  if (kind === "contextual_data_composite") return "Reference Clip";
  return "Image";
}

function resolveBeatTitle(entry: EpisodeMediaMapEntry, index: number): string {
  const beatLabel = entry.beat_anchor ? buildBulletBeatAnchorLabel(entry.beat_anchor) : null;
  const description = normalizeWhitespace(entry.description);
  if (beatLabel) return beatLabel;
  if (description) {
    const firstSentence = description.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (firstSentence) return firstSentence;
  }
  if (entry.anchor.target.trim()) return entry.anchor.target.trim();
  return `Visual beat ${index + 1}`;
}

function resolveWhatItDoes(entry: EpisodeMediaMapEntry): string {
  if (entry.final_media_kind === "b_roll") {
    return entry.purpose === "coverage"
      ? "Keeps live motion on screen while the narration moves."
      : "Adds kinetic movement so the sequence does not stall.";
  }
  if (entry.final_media_kind === "contextual_data_composite") {
    return "Clarifies the comparison with a more explicit reference or explainer moment.";
  }
  if (entry.purpose === "emphasis") {
    return "Acts as the hero visual that locks the main point in place.";
  }
  if (entry.purpose === "explanation") {
    return "Makes the editorial angle legible without stopping the flow.";
  }
  return "Supports the spoken beat with a grounded visual handoff.";
}

function resolveWhyHere(entry: EpisodeMediaMapEntry, index: number): string {
  if (index === 0 && entry.purpose === "coverage") {
    return "Sets the baseline before the comparison or escalation starts.";
  }
  if (entry.purpose === "explanation") {
    return "This is here to clarify context, structure, or the comparison the audience needs to track.";
  }
  if (entry.purpose === "emphasis") {
    return "This is here to underline the point the viewer should remember after the line lands.";
  }
  return "This keeps the viewer oriented while the narration advances to the next beat.";
}

function resolveHoldLabel(durationSec: number): string {
  if (!Number.isFinite(durationSec) || durationSec <= 1.5) {
    return "Hold about 1-2 seconds.";
  }
  const upper = Math.max(2, Math.round(durationSec));
  const lower = Math.max(1, upper - 1);
  return `Hold about ${lower}-${upper} seconds.`;
}

export function buildMediaMapBeatCards(entries: readonly EpisodeMediaMapEntry[]): MediaMapBeatCard[] {
  return entries.map((entry, index) => ({
    id: entry.id,
    title: resolveBeatTitle(entry, index),
    description: normalizeWhitespace(entry.description) || "Visual beat ready for refinement.",
    whatItDoes: resolveWhatItDoes(entry),
    whyHere: resolveWhyHere(entry, index),
    holdLabel: resolveHoldLabel(entry.timing.duration_sec),
    mediaKindLabel: resolveMediaKindLabel(entry.final_media_kind),
    purposeLabel: formatHearthVisualPurposeLabel(entry.purpose),
  }));
}
