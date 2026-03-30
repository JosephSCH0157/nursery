import type { ScriptValidationResult } from "@forge/shared/script-tags";
import type { CanonicalSpeakerId, ComposeSetup, ScriptCompletionBadge } from "../domain/compose";

export interface ComposeContentValidationResult {
  ok: boolean;
  badge: ScriptCompletionBadge;
  reasons: string[];
}

type SpeakerContent = {
  bulletCount: number;
  proseLineCount: number;
  totalLines: number;
};

const SPEAKER_TAGS: CanonicalSpeakerId[] = ["s1", "s2", "g1", "g2"];

function parseSpeakerContent(scriptText: string): Record<CanonicalSpeakerId, SpeakerContent> {
  const lines = scriptText.replace(/\r\n?/g, "\n").split("\n");
  const out: Record<CanonicalSpeakerId, SpeakerContent> = {
    s1: { bulletCount: 0, proseLineCount: 0, totalLines: 0 },
    s2: { bulletCount: 0, proseLineCount: 0, totalLines: 0 },
    g1: { bulletCount: 0, proseLineCount: 0, totalLines: 0 },
    g2: { bulletCount: 0, proseLineCount: 0, totalLines: 0 },
  };
  let active: CanonicalSpeakerId | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const open = trimmed.match(/^\[(s1|s2|g1|g2)\]$/i);
    if (open) {
      active = open[1]!.toLowerCase() as CanonicalSpeakerId;
      continue;
    }
    const close = trimmed.match(/^\[\/(s1|s2|g1|g2)\]$/i);
    if (close) {
      active = null;
      continue;
    }
    if (!active || !trimmed) continue;
    out[active].totalLines += 1;
    if (/^[-*]\s+/.test(trimmed)) out[active].bulletCount += 1;
    else out[active].proseLineCount += 1;
  }

  return out;
}

function hasActiveSpeakerCoverage(setup: ComposeSetup, contentBySpeaker: Record<CanonicalSpeakerId, SpeakerContent>): boolean {
  return setup.speakers.every((speaker) => contentBySpeaker[speaker].totalLines > 0);
}

function isProseHeavy(content: SpeakerContent): boolean {
  return content.proseLineCount > 0;
}

export function validateComposeContent(args: {
  setup: ComposeSetup | null;
  scriptText: string;
  tagValidation: ScriptValidationResult;
}): ComposeContentValidationResult {
  if (!args.tagValidation.ok) {
    return {
      ok: false,
      badge: "outline_draft",
      reasons: ["Script tags are invalid."],
    };
  }

  if (!args.setup) {
    return {
      ok: true,
      badge: "outline_draft",
      reasons: ["Compose setup is missing; defaulting to outline badge."],
    };
  }

  const contentBySpeaker = parseSpeakerContent(args.scriptText);
  const reasons: string[] = [];
  if (!hasActiveSpeakerCoverage(args.setup, contentBySpeaker)) {
    reasons.push("At least one active speaker has no content.");
  }

  if (args.setup.mode === "outline_by_speaker") {
    return {
      ok: reasons.length === 0,
      badge: reasons.length === 0 ? "approval_ready" : "outline_draft",
      reasons,
    };
  }

  if (args.setup.mode === "full_script_single_speaker") {
    if (!args.setup.targetSpeaker) {
      return {
        ok: false,
        badge: "partial_script",
        reasons: ["Single-speaker mode requires a target speaker."],
      };
    }
    const target = contentBySpeaker[args.setup.targetSpeaker];
    if (!isProseHeavy(target)) {
      reasons.push(`Target speaker ${args.setup.targetSpeaker} needs prose lines.`);
    }
    return {
      ok: reasons.length === 0,
      badge: "partial_script",
      reasons,
    };
  }

  // full_script_all_speakers
  for (const speaker of args.setup.speakers) {
    if (!isProseHeavy(contentBySpeaker[speaker])) {
      reasons.push(`Speaker ${speaker} needs prose lines for full-all mode.`);
    }
  }
  return {
    ok: reasons.length === 0,
    badge: reasons.length === 0 ? "approval_ready" : "partial_script",
    reasons,
  };
}

export function inferSpeakersFromScript(scriptText: string): CanonicalSpeakerId[] {
  const found = new Set<CanonicalSpeakerId>();
  const lines = scriptText.replace(/\r\n?/g, "\n").split("\n");
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const open = trimmed.match(/^\[(s1|s2|g1|g2)\]$/i);
    if (!open) continue;
    found.add(open[1]!.toLowerCase() as CanonicalSpeakerId);
  }
  return SPEAKER_TAGS.filter((speaker) => found.has(speaker));
}
