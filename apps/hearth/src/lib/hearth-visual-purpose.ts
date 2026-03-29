export const HEARTH_VISUAL_PURPOSE_VALUES = [
  "coverage",
  "explanation",
  "emphasis",
] as const;

export type HearthVisualPurpose = (typeof HEARTH_VISUAL_PURPOSE_VALUES)[number];

const EXPLANATION_SIGNAL_RE =
  /\b(\d[\d,.%]*|percent|percentage|stat|metric|data|chart|graph|compare(?:d|s|ison)?|versus|vs\.?|increase|decrease|decline|growth|trend|higher|lower|before|after|since|year|years|month|months|timeline|map|county|city|state|region|country|policy|rollout|impact|rate)\b/i;
const EMPHASIS_SIGNAL_RE =
  /\b(thumbnail|hero|opening image|opening shot|final image|final shot|key visual|close-up|close up|portrait|face|iconic|reveal|hold on|poster)\b/i;

function normalizeValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isPurpose(value: string): value is HearthVisualPurpose {
  return HEARTH_VISUAL_PURPOSE_VALUES.includes(value as HearthVisualPurpose);
}

export function normalizeHearthVisualPurpose(value: string | null | undefined): HearthVisualPurpose | null {
  const normalized = normalizeValue(value);
  return isPurpose(normalized) ? normalized : null;
}

export function formatHearthVisualPurposeLabel(purpose: HearthVisualPurpose): string {
  if (purpose === "coverage") return "Coverage";
  if (purpose === "explanation") return "Explanation";
  return "Emphasis";
}

export function classifyVisualBeatPurpose(text: string | null | undefined): HearthVisualPurpose {
  const normalized = normalizeValue(text);
  if (!normalized) return "coverage";
  if (EMPHASIS_SIGNAL_RE.test(normalized)) return "emphasis";
  if (EXPLANATION_SIGNAL_RE.test(normalized)) return "explanation";
  return "coverage";
}

export function deriveImageMapPurpose(args: {
  rawPurpose?: string | null;
  visualPriority?: string | null;
  visualType?: string | null;
  intent?: string | null;
  description?: string | null;
  visualIntent?: string | null;
  promptBasis?: string | null;
}): HearthVisualPurpose {
  const explicit = normalizeHearthVisualPurpose(args.rawPurpose);
  if (explicit) return explicit;

  const visualPriority = normalizeValue(args.visualPriority);
  if (visualPriority === "primary") return "emphasis";

  const visualType = normalizeValue(args.visualType);
  if (visualType === "diagram" || visualType === "motion_graphic" || visualType === "text_overlay") {
    return "explanation";
  }

  const intent = normalizeValue(args.intent);
  if (intent === "graphic") return "explanation";

  return classifyVisualBeatPurpose([
    args.description,
    args.visualIntent,
    args.promptBasis,
  ].filter(Boolean).join(" "));
}

export function deriveBrollPurpose(args: {
  rawPurpose?: string | null;
  motionIntent?: string | null;
  description?: string | null;
  anchorText?: string | null;
}): HearthVisualPurpose {
  const explicit = normalizeHearthVisualPurpose(args.rawPurpose);
  if (explicit) return explicit;

  const motionIntent = normalizeValue(args.motionIntent);
  if (
    motionIntent === "data_visual"
    || motionIntent === "map"
    || motionIntent === "timeline"
    || motionIntent === "graphic"
    || motionIntent === "explanatory"
  ) {
    return "explanation";
  }

  return classifyVisualBeatPurpose([
    args.description,
    args.anchorText,
  ].filter(Boolean).join(" "));
}

export function deriveReferenceClipPurpose(rawPurpose?: string | null): HearthVisualPurpose {
  return normalizeHearthVisualPurpose(rawPurpose) ?? "explanation";
}

export function deriveMediaMapPurpose(args: {
  rawPurpose?: string | null;
  finalMediaKind?: string | null;
  intent?: string | null;
  description?: string | null;
  anchorTarget?: string | null;
}): HearthVisualPurpose {
  const explicit = normalizeHearthVisualPurpose(args.rawPurpose);
  if (explicit) return explicit;

  const finalMediaKind = normalizeValue(args.finalMediaKind);
  if (finalMediaKind === "contextual_data_composite" || finalMediaKind === "reference_clip") return "explanation";
  if (finalMediaKind === "b_roll") return "coverage";

  const intent = normalizeValue(args.intent);
  const anchorTarget = normalizeValue(args.anchorTarget);
  if (intent === "thumbnail_concept" || anchorTarget.startsWith("thumbnail:")) return "emphasis";

  return classifyVisualBeatPurpose([
    args.description,
    args.intent,
    args.anchorTarget,
  ].filter(Boolean).join(" "));
}
