import type { EpisodeContextualDataCompositePlan } from "../../lib/episode-package-v2";
import type { HearthReferenceClipsProgress } from "./hearth-reference-clips-contracts";

export function buildHearthReferenceClipsProgress(
  entries: readonly EpisodeContextualDataCompositePlan[],
): HearthReferenceClipsProgress {
  return {
    planned: entries.length,
    withCanonicalCandidates: entries.filter((entry) => (entry.candidate_assets?.length ?? 0) > 0).length,
    selected: entries.filter((entry) => (
      Boolean(entry.selected_asset_id)
      && (entry.candidate_assets ?? []).some((candidate) => candidate.asset_id === entry.selected_asset_id)
    )).length,
  };
}
