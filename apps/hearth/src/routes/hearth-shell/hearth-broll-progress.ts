import type { EpisodeBrollPlanBeat } from "../../lib/episode-package-v2";
import type { HearthBrollProgress } from "./hearth-broll-contracts";

export function buildHearthBrollProgress(
  beats: readonly EpisodeBrollPlanBeat[],
): HearthBrollProgress {
  return {
    planned: beats.length,
    selected: beats.filter((beat) => Boolean(beat.selected_asset_id)).length,
    resolved: beats.filter(
      (beat) => beat.fulfillment_state === "resolved" && Boolean(beat.selected_asset_id),
    ).length,
  };
}
