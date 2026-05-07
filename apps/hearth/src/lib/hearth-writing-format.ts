import { HEARTH_RECORDING_READY_SCRIPT_INSTRUCTION } from "./hearth-recording-ready-script";

export type HearthWritingFormat = "explore_expand" | "full_script" | "bullet_outline";
export type HearthPreferredReadMode = "flow" | "step";
export type HearthShortcutIntent = "outline" | "script" | null;

type HearthWritingFormatProfile = {
  id: HearthWritingFormat;
  label: string;
  shortLabel: string;
  helperText: string;
  shortcutPrompt: string;
  defaultRequestInstruction: string;
  preferredReadMode: HearthPreferredReadMode;
};

type ResolvedHearthWritingFormatRequest = {
  appliedFormat: HearthWritingFormat;
  requestContent: string;
  source: "message" | "shortcut" | "default";
};

const HEARTH_WRITING_FORMAT_STORAGE_KEY = "hearth:writing-format:v1";
const FALLBACK_HEARTH_WRITING_FORMAT: HearthWritingFormat = "explore_expand";
const HEARTH_CHAT_TONE_INSTRUCTION = [
  "Response tone:",
  "Sound like a capable creative operations partner: professional, calm, observant, conversational, and lightly human.",
  "Avoid robotic system phrasing, hype, therapy-style validation, and cheesy enthusiasm.",
].join(" ");
const HEARTH_SINGLE_PERSON_REWRITE_INSTRUCTION = [
  "Single-person rewrite requirement:",
  "Rewrite as one host voice, not two-person banter.",
  "Collapse call-and-response and fake dialogue into a single narrative flow.",
  "Convert back-and-forth jokes into narrator asides while preserving tone, humor, argument, and cadence.",
  "Do not satisfy this by only changing speaker tags.",
].join(" ");

const HEARTH_WRITING_FORMAT_PROFILES: Record<HearthWritingFormat, HearthWritingFormatProfile> = {
  explore_expand: {
    id: "explore_expand",
    label: "Explore & Expand",
    shortLabel: "Explore & expand",
    helperText: "Grow the idea, clarify the angle, and expand the content before drafting.",
    shortcutPrompt: "Let's explore and expand this content first.",
    defaultRequestInstruction: [
      "Help the user explore and expand the content before drafting.",
      "Stay conversational, curious, and practical.",
      "Offer clarifying questions, angle options, stronger framing, and content expansion where helpful.",
      "Do not write a full script or bullet outline unless the user explicitly asks for one.",
    ].join(" "),
    preferredReadMode: "flow",
  },
  full_script: {
    id: "full_script",
    label: "Full Script",
    shortLabel: "Full script",
    helperText: "Smooth spoken prose you can read straight through.",
    shortcutPrompt: "Let's shape this into a full script.",
    defaultRequestInstruction: [
      "The user prefers a full script when they explicitly ask for one.",
      "Until then, stay conversational and planning-first.",
      "Do not draft the script preemptively.",
      "If helpful, ask whether they want you to turn the current thinking into a full script.",
    ].join(" "),
    preferredReadMode: "flow",
  },
  bullet_outline: {
    id: "bullet_outline",
    label: "Bullet Outline",
    shortLabel: "Bullet outline",
    helperText: "Loose beats and bullets you can tighten later.",
    shortcutPrompt: "Let's keep this loose with a bullet outline.",
    defaultRequestInstruction: [
      "Keep the response as a concise bullet outline or planning notes, not a full script.",
      "Do not write the full script unless the user explicitly asks for it.",
    ].join(" "),
    preferredReadMode: "step",
  },
};

export const HEARTH_WRITING_FORMATS: HearthWritingFormat[] = ["explore_expand", "full_script", "bullet_outline"];

export function getHearthWritingFormatProfile(format: HearthWritingFormat): HearthWritingFormatProfile {
  return HEARTH_WRITING_FORMAT_PROFILES[format] ?? HEARTH_WRITING_FORMAT_PROFILES[FALLBACK_HEARTH_WRITING_FORMAT];
}

export function readLastHearthWritingFormat(): HearthWritingFormat {
  if (typeof window === "undefined") return FALLBACK_HEARTH_WRITING_FORMAT;
  try {
    const raw = window.localStorage.getItem(HEARTH_WRITING_FORMAT_STORAGE_KEY)?.trim();
    if (raw === "explore_expand" || raw === "full_script" || raw === "bullet_outline") {
      return raw;
    }
  } catch {
    // ignore storage failures
  }
  return FALLBACK_HEARTH_WRITING_FORMAT;
}

export function writeLastHearthWritingFormat(format: HearthWritingFormat): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HEARTH_WRITING_FORMAT_STORAGE_KEY, format);
  } catch {
    // ignore storage failures
  }
}

function normalizeHearthWritingFormatText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isExplicitHearthOutlineRequest(text: string): boolean {
  const normalized = normalizeHearthWritingFormatText(text);
  if (!normalized) return false;
  return /\boutline\b/.test(normalized)
    || /\bbullet points?\b/.test(normalized)
    || /\bbeats?\b/.test(normalized);
}

export function isExplicitHearthFullScriptRequest(text: string): boolean {
  const normalized = normalizeHearthWritingFormatText(text);
  if (!normalized) return false;
  if (/\bfull script\b/.test(normalized)) return true;
  const explicitDraftPatterns = [
    /\b(?:write|create|make|build|give me)\b[^.!?\n]{0,60}\b(?:script|cold open|segments?)\b/,
    /\bdraft\b[^.!?\n]{0,15}\b(?:me|this|that|it|a|an|the)\b[^.!?\n]{0,40}\b(?:script|cold open|segments?)\b/,
    /\b(?:turn|shape|make)\b[^.!?\n]{0,20}\b(?:this|that|it)\b[^.!?\n]{0,20}\b(?:into|as)\b[^.!?\n]{0,20}\b(?:a )?(?:full )?script\b/,
    /\bscript (?:this|it)\b/,
  ];
  return explicitDraftPatterns.some((pattern) => pattern.test(normalized));
}

export function detectExplicitHearthWritingFormat(text: string): HearthWritingFormat | null {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return null;
  if (isExplicitHearthOutlineRequest(normalized)) return "bullet_outline";
  if (isExplicitHearthFullScriptRequest(normalized)) return "full_script";
  return null;
}

export function resolveShortcutIntentWritingFormat(intent: HearthShortcutIntent): HearthWritingFormat | null {
  if (intent === "outline") return "bullet_outline";
  if (intent === "script") return "full_script";
  return null;
}

export function buildWritingFormatShortcutPrompt(format: HearthWritingFormat): string {
  return getHearthWritingFormatProfile(format).shortcutPrompt;
}

function appendInstruction(requestContent: string, instruction: string): string {
  return `${requestContent}\n\n${instruction}`;
}

function isSinglePersonRewriteRequest(requestContent: string): boolean {
  const normalized = requestContent.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\b(single[\s-]?person|one[\s-]?person|single host|one host|solo host|single narrator|one narrator)\b/.test(normalized)
    && /\b(script|rewrite|anvil|readable)\b/.test(normalized)
  );
}

function appendRecordingReadyInstructionForScriptRequests(
  requestContent: string,
  appliedFormat: HearthWritingFormat,
): string {
  const withSinglePerson = isSinglePersonRewriteRequest(requestContent)
    ? appendInstruction(requestContent, HEARTH_SINGLE_PERSON_REWRITE_INSTRUCTION)
    : requestContent;

  return appliedFormat === "full_script"
    ? appendInstruction(withSinglePerson, HEARTH_RECORDING_READY_SCRIPT_INSTRUCTION)
    : withSinglePerson;
}

export function resolveHearthWritingFormatRequest(args: {
  requestContent: string;
  selectedFormat: HearthWritingFormat;
  pendingShortcutIntent: HearthShortcutIntent;
}): ResolvedHearthWritingFormatRequest {
  const explicitFormat = detectExplicitHearthWritingFormat(args.requestContent);
  if (explicitFormat) {
    return {
      appliedFormat: explicitFormat,
      requestContent: appendRecordingReadyInstructionForScriptRequests(
        appendInstruction(args.requestContent, HEARTH_CHAT_TONE_INSTRUCTION),
        explicitFormat,
      ),
      source: "message",
    };
  }

  const shortcutFormat = resolveShortcutIntentWritingFormat(args.pendingShortcutIntent);
  if (shortcutFormat) {
    return {
      appliedFormat: shortcutFormat,
      requestContent: appendRecordingReadyInstructionForScriptRequests(
        appendInstruction(args.requestContent, HEARTH_CHAT_TONE_INSTRUCTION),
        shortcutFormat,
      ),
      source: "shortcut",
    };
  }

  const profile = getHearthWritingFormatProfile(args.selectedFormat);
  return {
    appliedFormat: args.selectedFormat,
    requestContent: appendInstruction(
      appendInstruction(args.requestContent, HEARTH_CHAT_TONE_INSTRUCTION),
      profile.id === "full_script"
        ? `${profile.defaultRequestInstruction} ${HEARTH_RECORDING_READY_SCRIPT_INSTRUCTION}`
        : profile.defaultRequestInstruction,
    ),
    source: "default",
  };
}
