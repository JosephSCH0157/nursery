import type { CanonicalSpeakerId } from "../domain/compose";
import type { ScriptAuthoringMeta } from "../domain/draft";
import { inferSpeakersFromScript } from "./compose-content-validation";

const FALLBACK_OUTLINE_SPEAKER: CanonicalSpeakerId = "s1";

function toSpeakerCount(speakers: CanonicalSpeakerId[]): 1 | 2 | 3 | 4 {
  const clamped = Math.max(1, Math.min(4, speakers.length));
  if (clamped === 1) return 1;
  if (clamped === 2) return 2;
  if (clamped === 3) return 3;
  return 4;
}

function resolveProposalSpeakers(args: {
  scriptText: string;
  currentMeta?: ScriptAuthoringMeta | null;
}): CanonicalSpeakerId[] {
  const inferredSpeakers = inferSpeakersFromScript(args.scriptText);
  const fallbackSpeakers = args.currentMeta?.speakers?.length
    ? args.currentMeta.speakers
    : [FALLBACK_OUTLINE_SPEAKER];
  const speakers = (inferredSpeakers.length > 0 ? inferredSpeakers : fallbackSpeakers).slice(0, 4);
  return speakers.length > 0 ? speakers : [FALLBACK_OUTLINE_SPEAKER];
}

export function deriveOutlineScriptAuthoringMeta(args: {
  scriptText: string;
  currentMeta?: ScriptAuthoringMeta | null;
}): ScriptAuthoringMeta {
  const normalizedSpeakers = resolveProposalSpeakers(args);
  return {
    composeMode: "outline_by_speaker",
    targetSpeaker: normalizedSpeakers.length === 1 ? normalizedSpeakers[0] : null,
    speakers: normalizedSpeakers,
    speakerCount: toSpeakerCount(normalizedSpeakers),
    isOverrideFromProductionDefault: args.currentMeta?.isOverrideFromProductionDefault ?? true,
    lastComposedAt: new Date().toISOString(),
  };
}

export function deriveFullScriptAuthoringMeta(args: {
  scriptText: string;
  currentMeta?: ScriptAuthoringMeta | null;
}): ScriptAuthoringMeta {
  const normalizedSpeakers = resolveProposalSpeakers(args);
  return {
    composeMode: normalizedSpeakers.length === 1 ? "full_script_single_speaker" : "full_script_all_speakers",
    targetSpeaker: normalizedSpeakers.length === 1 ? normalizedSpeakers[0] : null,
    speakers: normalizedSpeakers,
    speakerCount: toSpeakerCount(normalizedSpeakers),
    isOverrideFromProductionDefault: args.currentMeta?.isOverrideFromProductionDefault ?? true,
    lastComposedAt: new Date().toISOString(),
  };
}
