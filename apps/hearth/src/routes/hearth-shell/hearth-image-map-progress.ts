import type { HearthImagePlanningProgress } from "./hearth-image-planning-contracts";

export function buildHearthImageMapProgress(input: {
  planned: number;
  canonical: number;
  selected: number;
  unresolved: number;
}): HearthImagePlanningProgress {
  return {
    planned: Math.max(0, input.planned),
    canonical: Math.max(0, input.canonical),
    selected: Math.max(0, input.selected),
    unresolved: Math.max(0, input.unresolved),
  };
}
