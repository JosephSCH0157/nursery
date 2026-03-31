import {
  normalizeHearthVisualStyle,
  resolveHearthVisualStyleDefinition,
} from "./hearth-visual-styles";

export type BuildThumbnailPromptsInput = {
  conceptBrief: string;
  title: string;
  tone?: string;
};

export type PromptVariant = {
  id: string;
  style: "high_ctr" | "balanced" | "subtle";
  prompt: string;
};

export type BuildThumbnailPromptsOutput = {
  variants: PromptVariant[];
  notes?: string;
};

const ENTITY_REPLACEMENTS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bfox news\b/gi, replacement: "a cable news outlet" },
  { pattern: /\bcnn\b/gi, replacement: "a 24-hour cable news outlet" },
  { pattern: /\bmsnbc\b/gi, replacement: "a progressive cable news outlet" },
  { pattern: /\babc news?\b/gi, replacement: "a network news outlet" },
  { pattern: /\babc\b/gi, replacement: "a network news outlet" },
  { pattern: /\bcbs (news|la|los angeles)\b/gi, replacement: "a local TV news outlet" },
  { pattern: /\bktla\b/gi, replacement: "a local TV news outlet" },
  { pattern: /\busa today\b/gi, replacement: "a national newspaper outlet" },
  { pattern: /\bnew york times\b/gi, replacement: "a national newspaper outlet" },
  { pattern: /\bwashington post\b/gi, replacement: "a national newspaper outlet" },
  { pattern: /\byoutube\b/gi, replacement: "a video platform" },
  { pattern: /\btiktok\b/gi, replacement: "a short-form video platform" },
  { pattern: /\binstagram\b/gi, replacement: "a social photo platform" },
  { pattern: /\bfacebook\b/gi, replacement: "a social media platform" },
  { pattern: /\btwitter\b/gi, replacement: "a social feed" },
  { pattern: /\bx\b/gi, replacement: "a social feed" },
  { pattern: /\blogos?\b/gi, replacement: "recognizable branding" },
  { pattern: /\bbrand marks?\b/gi, replacement: "recognizable branding" },
  { pattern: /\bwatermarks?\b/gi, replacement: "visible branding" },
];

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function abstractRiskyReferences(value: string): string {
  let next = normalizeWhitespace(value);
  for (const entry of ENTITY_REPLACEMENTS) {
    next = next.replace(entry.pattern, entry.replacement);
  }
  return next
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function toIdeaSegments(value: string): string[] {
  return normalizeWhitespace(value)
    .split(/\n+|(?<=[.!?;])\s+/)
    .map((segment) => segment.replace(/^[\-\u2022*]+\s*/, "").trim())
    .filter(Boolean)
    .map((segment) => abstractRiskyReferences(segment));
}

function trimClause(value: string, maxLength: number, fallback: string): string {
  const cleaned = abstractRiskyReferences(value).replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= maxLength) return cleaned;
  const shortened = cleaned.slice(0, Math.max(0, maxLength - 1)).trim();
  return `${shortened}.`;
}

function resolveToneDescriptor(tone?: string): string {
  const normalized = tone?.trim();
  if (!normalized) {
    return "cinematic realism with strong editorial clarity";
  }
  const definition = resolveHearthVisualStyleDefinition(normalizeHearthVisualStyle(normalized));
  if (definition?.promptHint?.trim()) {
    return definition.promptHint.trim();
  }
  return normalized.replace(/[_-]+/g, " ").trim();
}

function resolveContrastIntent(source: string): string {
  const normalized = source.toLowerCase();
  if (/\b(vs|versus|split|contrast|framed|frame|comparison)\b/.test(normalized)) {
    return "a clear visual split between competing interpretations of the same story";
  }
  if (/\b(chaos|clash|tear gas|riot|arrest|police|after dark)\b/.test(normalized)) {
    return "a visible tension between public action and a harder law-and-order response";
  }
  if (/\b(media|coverage|headline|outlet|camera|story)\b/.test(normalized)) {
    return "the gap between what happened and how the event was packaged for viewers";
  }
  return "one clear point of tension with a strong foreground-versus-background contrast";
}

function buildPromptCopy(args: {
  style: PromptVariant["style"];
  subject: string;
  titleAngle: string;
  contrastIntent: string;
  toneDescriptor: string;
}): string {
  const commonTail = "Leave clean negative space for short overlay text, keep one clear focal subject, avoid readable text, avoid logos, avoid watermarks, and use generic visual archetypes instead of recognizable brands or public figures.";

  if (args.style === "high_ctr") {
    return [
      `Create a high-contrast YouTube thumbnail in ${args.toneDescriptor}.`,
      `Center ${args.subject}.`,
      `Build the frame around the title angle "${args.titleAngle}".`,
      `Push ${args.contrastIntent}.`,
      "Make it bold, emotionally immediate, and legible at a glance with crisp subject separation and dramatic lighting.",
      commonTail,
    ].join(" ");
  }

  if (args.style === "balanced") {
    return [
      `Create a clean editorial thumbnail in ${args.toneDescriptor}.`,
      `Focus on ${args.subject}.`,
      `Support the title angle "${args.titleAngle}" with a grounded current-events composition.`,
      `Show ${args.contrastIntent}.`,
      "Keep it specific, credible, and sharp without turning it into spectacle.",
      commonTail,
    ].join(" ");
  }

  return [
    `Create a restrained magazine-style thumbnail in ${args.toneDescriptor}.`,
    `Use ${args.subject} as the central image idea.`,
    `Let the frame quietly suggest "${args.titleAngle}".`,
    `Hint at ${args.contrastIntent} through composition, gesture, and setting rather than overt drama.`,
    "Keep the image calm, intelligent, and visually spare while still readable at small size.",
    commonTail,
  ].join(" ");
}

export function buildThumbnailPrompts(
  input: BuildThumbnailPromptsInput,
): BuildThumbnailPromptsOutput {
  const conceptSegments = toIdeaSegments(input.conceptBrief);
  const abstractedTitle = trimClause(input.title, 84, "a sharp, curiosity-driven episode angle");
  const subject = trimClause(
    conceptSegments[0] ?? "",
    140,
    "a current-events scene with one unmistakable focal subject",
  );
  const secondaryBeat = trimClause(
    conceptSegments[1] ?? conceptSegments[0] ?? "",
    120,
    "a clear editorial frame that guides the click",
  );
  const contrastIntent = resolveContrastIntent(`${input.title} ${input.conceptBrief}`);
  const toneDescriptor = resolveToneDescriptor(input.tone);
  const titleAngle = abstractedTitle || secondaryBeat;

  const variants: PromptVariant[] = [
    {
      id: "high_ctr",
      style: "high_ctr",
      prompt: buildPromptCopy({
        style: "high_ctr",
        subject,
        titleAngle,
        contrastIntent,
        toneDescriptor,
      }),
    },
    {
      id: "balanced",
      style: "balanced",
      prompt: buildPromptCopy({
        style: "balanced",
        subject,
        titleAngle,
        contrastIntent,
        toneDescriptor,
      }),
    },
    {
      id: "subtle",
      style: "subtle",
      prompt: buildPromptCopy({
        style: "subtle",
        subject: secondaryBeat || subject,
        titleAngle,
        contrastIntent,
        toneDescriptor,
      }),
    },
  ];

  return {
    variants,
    notes: "Generated from the selected concept brief and title. Hearth abstracted recognizable brands into generic visual roles and optimized the prompts for thumbnail composition.",
  };
}
