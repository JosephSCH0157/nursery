import type {
  HearthImagePlanningCompletion,
  HearthImagePlanningProgress,
} from "./hearth-image-planning-contracts";

export function deriveHearthImagePlanningCompletion(input: {
  active: boolean;
  loaded: boolean;
  authorityAvailable: boolean;
  progress: HearthImagePlanningProgress;
}): HearthImagePlanningCompletion {
  if (!input.active) return { kind: "inactive", complete: false, brollEligible: false };
  if (!input.authorityAvailable) {
    return { kind: "authority_unavailable", complete: false, brollEligible: false };
  }
  if (!input.loaded) return { kind: "loading", complete: false, brollEligible: false };
  if (input.progress.planned === 0) {
    return { kind: "empty", complete: false, brollEligible: false };
  }
  if (input.progress.planned !== input.progress.canonical) {
    return { kind: "count_mismatch", complete: false, brollEligible: false };
  }
  if (input.progress.unresolved > 0) {
    return { kind: "unresolved", complete: false, brollEligible: false };
  }
  if (input.progress.selected !== input.progress.canonical) {
    return { kind: "selection_incomplete", complete: false, brollEligible: false };
  }
  return { kind: "complete", complete: true, brollEligible: true };
}
