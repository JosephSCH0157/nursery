import type { CanonicalSpeakerId, ComposeSetup, ProductionDefaults } from "../domain/compose";

export interface ComposeConflictInputs {
  defaults: ProductionDefaults | null;
  userRequestedCustomize: boolean;
  isSpecialEpisode: boolean;
  importedImpliedSpeakers: CanonicalSpeakerId[] | null;
  selectedMode?: ComposeSetup["mode"] | null;
  selectedTargetSpeaker?: CanonicalSpeakerId | null;
}

export interface ComposeConflictResult {
  shouldPrompt: boolean;
  reasons: string[];
}

function sameSpeakers(a: readonly CanonicalSpeakerId[], b: readonly CanonicalSpeakerId[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; i += 1) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

export function resolveComposeConflicts(input: ComposeConflictInputs): ComposeConflictResult {
  const reasons: string[] = [];
  if (!input.defaults) reasons.push("missing_defaults");
  if (input.userRequestedCustomize) reasons.push("user_requested_customize");
  if (input.isSpecialEpisode) reasons.push("special_episode");

  if (input.defaults && input.importedImpliedSpeakers && input.importedImpliedSpeakers.length > 0) {
    if (!sameSpeakers(input.importedImpliedSpeakers, input.defaults.defaultSpeakers)) {
      reasons.push("imported_speaker_mismatch");
    }
  }

  const mode = input.selectedMode ?? input.defaults?.defaultMode ?? null;
  const targetSpeaker = input.selectedTargetSpeaker ?? input.defaults?.defaultTargetSpeaker ?? null;
  if (mode === "full_script_single_speaker" && !targetSpeaker) {
    reasons.push("missing_target_speaker");
  }

  return {
    shouldPrompt: reasons.length > 0,
    reasons,
  };
}
