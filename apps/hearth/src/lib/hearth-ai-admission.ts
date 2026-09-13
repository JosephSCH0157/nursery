import type { HearthTurnFailureKind } from "./hearth-turn-contract";

export type HearthAiActionAvailability = {
  showArtifactActions: boolean;
  allowAiSubmission: boolean;
};

export function resolveHearthAiActionAvailability(
  failureKind: HearthTurnFailureKind | null,
): HearthAiActionAvailability {
  const admissionBlocked = failureKind === "admission_failure";
  return {
    showArtifactActions: !admissionBlocked,
    allowAiSubmission: !admissionBlocked,
  };
}
