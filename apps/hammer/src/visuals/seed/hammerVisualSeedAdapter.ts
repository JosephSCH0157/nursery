import type { HammerPersistedVisualPlacements } from "../../persistence/hammerPersistenceContract";
import { migrateLegacyPlacementRecordsToTimelineState } from "../model/hammerVisualMigrations";
import type { HammerVisualTimelineState } from "../model/hammerVisualTypes";

export function buildHammerVisualSeedTimelineState(args: {
  visual_placements: HammerPersistedVisualPlacements | null | undefined;
  selected_overlay_row_id?: string | null;
  updated_at?: string;
}): HammerVisualTimelineState {
  return migrateLegacyPlacementRecordsToTimelineState({
    placements: args.visual_placements?.placements ?? [],
    selected_overlay_row_id: args.selected_overlay_row_id,
    updated_at: args.updated_at,
  });
}
