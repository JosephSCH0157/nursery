export type HearthWritingFormat = "full_script" | "bullet_outline";
export type HearthPreferredReadMode = "flow" | "step";
export type HearthShortcutIntent = "outline" | "script" | null;

type HearthWritingFormatProfile = {
  id: HearthWritingFormat;
  label: string;
  shortLabel: string;
  helperText: string;
  shortcutPrompt: string;
  requestInstruction: string;
  preferredReadMode: HearthPreferredReadMode;
};

type ResolvedHearthWritingFormatRequest = {
  appliedFormat: HearthWritingFormat;
  requestContent: string;
  source: "message" | "shortcut" | "default";
};

const HEARTH_WRITING_FORMAT_STORAGE_KEY = "hearth:writing-format:v1";
const FALLBACK_HEARTH_WRITING_FORMAT: HearthWritingFormat = "full_script";
const HEARTH_CHAT_TONE_INSTRUCTION = [
  "Response tone:",
  "Sound like a capable creative operations partner: professional, calm, observant, conversational, and lightly human.",
  "Avoid robotic system phrasing, hype, therapy-style validation, and cheesy enthusiasm.",
].join(" ");

const HEARTH_WRITING_FORMAT_PROFILES: Record<HearthWritingFormat, HearthWritingFormatProfile> = {
  full_script: {
    id: "full_script",
    label: "Full Script",
    shortLabel: "Full script",
    helperText: "Smooth spoken prose you can read straight through.",
    shortcutPrompt: "Let's shape this into a full script.",
    requestInstruction: "Shape the response as a full script with smooth spoken prose.",
    preferredReadMode: "flow",
  },
  bullet_outline: {
    id: "bullet_outline",
    label: "Bullet Outline",
    shortLabel: "Bullet outline",
    helperText: "Loose beats and bullets you can tighten later.",
    shortcutPrompt: "Let's keep this loose with a bullet outline.",
    requestInstruction: "Keep the response as a concise bullet outline, not a full script.",
    preferredReadMode: "step",
  },
};

export const HEARTH_WRITING_FORMATS: HearthWritingFormat[] = ["full_script", "bullet_outline"];

export function getHearthWritingFormatProfile(format: HearthWritingFormat): HearthWritingFormatProfile {
  return HEARTH_WRITING_FORMAT_PROFILES[format] ?? HEARTH_WRITING_FORMAT_PROFILES[FALLBACK_HEARTH_WRITING_FORMAT];
}

export function readLastHearthWritingFormat(): HearthWritingFormat {
  if (typeof window === "undefined") return FALLBACK_HEARTH_WRITING_FORMAT;
  try {
    const raw = window.localStorage.getItem(HEARTH_WRITING_FORMAT_STORAGE_KEY)?.trim();
    if (raw === "full_script" || raw === "bullet_outline") {
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

export function detectExplicitHearthWritingFormat(text: string): HearthWritingFormat | null {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return null;
  if (/\boutline\b/.test(normalized) || /\bbullet points?\b/.test(normalized) || /\bbeats?\b/.test(normalized)) {
    return "bullet_outline";
  }
  if (/\bfull script\b/.test(normalized) || /\bscript\b/.test(normalized) || /\bdraft\b/.test(normalized)) {
    return "full_script";
  }
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

export function resolveHearthWritingFormatRequest(args: {
  requestContent: string;
  selectedFormat: HearthWritingFormat;
  pendingShortcutIntent: HearthShortcutIntent;
}): ResolvedHearthWritingFormatRequest {
  const explicitFormat = detectExplicitHearthWritingFormat(args.requestContent);
  if (explicitFormat) {
    return {
      appliedFormat: explicitFormat,
      requestContent: appendInstruction(args.requestContent, HEARTH_CHAT_TONE_INSTRUCTION),
      source: "message",
    };
  }

  const shortcutFormat = resolveShortcutIntentWritingFormat(args.pendingShortcutIntent);
  if (shortcutFormat) {
    return {
      appliedFormat: shortcutFormat,
      requestContent: appendInstruction(args.requestContent, HEARTH_CHAT_TONE_INSTRUCTION),
      source: "shortcut",
    };
  }

  const profile = getHearthWritingFormatProfile(args.selectedFormat);
  return {
    appliedFormat: args.selectedFormat,
    requestContent: appendInstruction(
      appendInstruction(args.requestContent, HEARTH_CHAT_TONE_INSTRUCTION),
      profile.requestInstruction,
    ),
    source: "default",
  };
}
