import type { HearthHenrySignal, HenryContext, HenryMode } from "@forge/shared/henry";

type HenryModeInput = {
  context: HenryContext;
  hearthSignal: HearthHenrySignal | null;
};

export function deriveHenryMode(input: HenryModeInput): HenryMode | null {
  const { context, hearthSignal } = input;
  if (context.surface !== "hearth") return null;
  if (!hearthSignal) return null;

  if (!context.workpieceId && !hearthSignal.hasActiveSpark) return "idle";
  if (hearthSignal.hasActiveSpark && !hearthSignal.hasDraft) return "warming";
  if (hearthSignal.hasDraft && hearthSignal.tagValidationOk === false) return "blocked";
  if (hearthSignal.isApprovedOrReady && hearthSignal.hasDraft) return "reviewing";

  if (hearthSignal.hasDraft && hearthSignal.tagValidationOk === true) {
    if (hearthSignal.hasPacingCues === true) return "recording_ready";
    return "structuring";
  }

  if (hearthSignal.hasDraft) return "structuring";
  return "idle";
}

