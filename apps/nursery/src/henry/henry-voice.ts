import type { HenryMode } from "@forge/shared/henry";

const BLOCKED_PHRASES = [
  /\bI generated\b/i,
  /\boptimi[sz]e\b/i,
  /\bI scheduled\b/i,
  /\bI recorded\b/i,
  /\bI published\b/i,
  /\bI edited the media\b/i,
];

const HEARTH_MODE_LABELS: Record<HenryMode, string> = {
  idle: "Idle",
  warming: "Heating this idea",
  structuring: "Checking read-aloud shape",
  recording_ready: "Ready when you are",
  blocked: "Needs script cleanup",
  reviewing: "Reviewing draft",
};

export function resolveHenryStatusLabel(mode: HenryMode | null): string {
  if (!mode) return "available";
  return HEARTH_MODE_LABELS[mode];
}

export function normalizeHenryVoice(text: string): string {
  let next = text.trim();
  for (const phrase of BLOCKED_PHRASES) {
    next = next.replace(phrase, "I can help");
  }
  return next;
}

