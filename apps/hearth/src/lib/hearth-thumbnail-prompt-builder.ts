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
  tagline?: string;
};

export type BuildThumbnailPromptsOutput = {
  variants: PromptVariant[];
  notes?: string;
};

const ENTITY_REPLACEMENTS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bfox news\b/gi, replacement: "bold breaking-news style" },
  { pattern: /\bfox\b/gi, replacement: "bold breaking-news style" },
  { pattern: /\bcbs la\b/gi, replacement: "local news framing" },
  { pattern: /\bcbs los angeles\b/gi, replacement: "local news framing" },
  { pattern: /\bktla\b/gi, replacement: "local news framing" },
  { pattern: /\blocal tv news\b/gi, replacement: "local news framing" },
  { pattern: /\blocal outlet\b/gi, replacement: "local news framing" },
  { pattern: /\babc news?\b/gi, replacement: "clean national broadcast style" },
  { pattern: /\babc\b/gi, replacement: "clean national broadcast style" },
  { pattern: /\bcbs news\b/gi, replacement: "clean national broadcast style" },
  { pattern: /\bcnn\b/gi, replacement: "clean national broadcast style" },
  { pattern: /\bmsnbc\b/gi, replacement: "clean national broadcast style" },
  { pattern: /\bnbc news?\b/gi, replacement: "clean national broadcast style" },
  { pattern: /\busa today\b/gi, replacement: "clean national broadcast style" },
  { pattern: /\bnew york times\b/gi, replacement: "clean national broadcast style" },
  { pattern: /\bwashington post\b/gi, replacement: "clean national broadcast style" },
  { pattern: /\byoutube\b/gi, replacement: "a video platform" },
  { pattern: /\btiktok\b/gi, replacement: "a short-form video platform" },
  { pattern: /\binstagram\b/gi, replacement: "a social photo platform" },
  { pattern: /\bfacebook\b/gi, replacement: "a social media platform" },
  { pattern: /\btwitter\b/gi, replacement: "a social feed" },
  { pattern: /\blogos?\b/gi, replacement: "recognizable branding" },
  { pattern: /\bbrand marks?\b/gi, replacement: "recognizable branding" },
  { pattern: /\bwatermarks?\b/gi, replacement: "visible branding" },
];

const TONE_DESCRIPTORS: Record<string, string> = {
  cinematic_realism: "cinematic realism",
  studio_photography: "studio-lit editorial photography",
  digital_illustration: "clean digital illustration",
  three_d_animation: "polished 3D editorial render",
  stop_motion: "tactile stop-motion miniature",
  marker_render: "bold marker-rendered illustration",
  colored_pencil: "layered colored-pencil illustration",
  oil_painting: "painterly oil-on-canvas illustration",
};

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

function stripImperativePrefix(value: string): string {
  return value
    .replace(/^(show|use|frame|keep|focus on|focus|open with|start with|build around|lean into|make|create|center|support|let)\b[:\s-]*/i, "")
    .replace(/^(the thumbnail around|the frame around)\b[:\s-]*/i, "")
    .trim();
}

function toIdeaSegments(value: string): string[] {
  return normalizeWhitespace(value)
    .split(/\n+|(?<=[.!?;])\s+/)
    .map((segment) => stripImperativePrefix(segment.replace(/^[\-\u2022*]+\s*/, "").trim()))
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
    return "cinematic realism";
  }
  const styleValue = normalizeHearthVisualStyle(normalized);
  if (TONE_DESCRIPTORS[styleValue]) {
    return TONE_DESCRIPTORS[styleValue];
  }
  const definition = resolveHearthVisualStyleDefinition(styleValue);
  if (definition?.label?.trim()) {
    return definition.label.trim().toLowerCase();
  }
  return normalized.replace(/[_-]+/g, " ").trim().toLowerCase();
}

function resolveContrastIntent(source: string): string {
  const normalized = source.toLowerCase();
  if (/\b(vs|versus|split|contrast|framed|frame|comparison)\b/.test(normalized)) {
    return "A visible split between competing reads of the same event.";
  }
  if (/\b(chaos|clash|tear gas|riot|arrest|police|after dark)\b/.test(normalized)) {
    return "A clear turn from public action into a harder law-and-order response.";
  }
  if (/\b(media|coverage|headline|outlet|camera|story)\b/.test(normalized)) {
    return "The gap between what happened and how the story was packaged for viewers.";
  }
  return "One clear point of tension with a strong foreground-versus-background contrast.";
}

function toSentence(value: string, fallback: string): string {
  const cleaned = stripImperativePrefix(abstractRiskyReferences(value))
    .replace(/\s+/g, " ")
    .replace(/^[,.;:!?-]+/, "")
    .trim();
  const next = cleaned || fallback;
  const capped = next[0] ? `${next[0].toUpperCase()}${next.slice(1)}` : fallback;
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

function limitWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value.trim();
  const trimmed = words.slice(0, maxWords).join(" ").replace(/[,:;]$/, "");
  return `${trimmed}.`;
}

function resolveTitleSentence(titleAngle: string): string {
  return `The frame should immediately sell the idea behind "${titleAngle}" without needing extra explanation.`;
}

function resolveFlavorTagline(source: string): string | undefined {
  return /\b(vs|versus|split|framing|frame|comparison|outlet|media)\b/i.test(source)
    ? "Same footage, five different realities."
    : undefined;
}

function buildPromptCopy(args: {
  style: PromptVariant["style"];
  subject: string;
  titleAngle: string;
  secondaryBeat: string;
  contrastIntent: string;
  toneDescriptor: string;
  sourceText: string;
}): PromptVariant {
  const styleLead = `${args.toneDescriptor[0]?.toUpperCase() ?? ""}${args.toneDescriptor.slice(1)}.`;
  const subjectSentence = toSentence(args.subject, "A current-events scene with one unmistakable focal subject.");
  const secondarySentence = toSentence(args.secondaryBeat, "A clear editorial frame that guides the click.");
  const titleSentence = resolveTitleSentence(args.titleAngle);
  const tail = "Clean negative space for a short overlay, one dominant focal point, no readable background text, no logos, no branded graphics.";

  if (args.style === "high_ctr") {
    return {
      id: "high_ctr",
      style: "high_ctr",
      prompt: limitWords([
        styleLead,
        subjectSentence,
        args.contrastIntent,
        titleSentence,
        "Sharper separation, stronger motion, a faster emotional read, and enough visual pressure to feel urgent without becoming cluttered.",
        tail,
      ].join(" "), 95),
      tagline: resolveFlavorTagline(args.sourceText),
    };
  }

  if (args.style === "balanced") {
    return {
      id: "balanced",
      style: "balanced",
      prompt: limitWords([
        styleLead,
        subjectSentence,
        secondarySentence,
        args.contrastIntent,
        "Clear hierarchy, readable composition, and a grounded editorial feel that still plays cleanly at thumbnail size.",
        tail,
      ].join(" "), 90),
    };
  }

  return {
    id: "subtle",
    style: "subtle",
    prompt: limitWords([
      styleLead,
      secondarySentence,
      args.contrastIntent,
      `A quieter read of "${args.titleAngle}" through composition, gesture, and background hierarchy rather than overt spectacle.`,
      "Restrained emotion, spare framing, and a clean pocket for a short overlay.",
      tail,
    ].join(" "), 88),
  };
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
    buildPromptCopy({
      style: "high_ctr",
      subject,
      secondaryBeat,
      titleAngle,
      contrastIntent,
      toneDescriptor,
      sourceText: `${input.conceptBrief} ${input.title}`,
    }),
    buildPromptCopy({
      style: "balanced",
      subject,
      secondaryBeat,
      titleAngle,
      contrastIntent,
      toneDescriptor,
      sourceText: `${input.conceptBrief} ${input.title}`,
    }),
    buildPromptCopy({
      style: "subtle",
      subject: secondaryBeat || subject,
      secondaryBeat,
      titleAngle,
      contrastIntent,
      toneDescriptor,
      sourceText: `${input.conceptBrief} ${input.title}`,
    }),
  ];

  return {
    variants,
    notes: "Generated from the selected concept brief and title. Hearth trimmed the prompts into copy-ready scene descriptions and swapped recognizable media brands for visual archetypes.",
  };
}
