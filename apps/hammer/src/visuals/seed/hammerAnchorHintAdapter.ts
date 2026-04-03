import type { HammerVisualPlacementRecord } from "../../persistence/hammerPersistenceContract";
import { normalizeAnchorHint } from "../model/hammerVisualGuards";
import type { HammerVisualAnchorHint } from "../model/hammerVisualTypes";

export function adaptLegacyPlacementToAnchorHint(
  record: HammerVisualPlacementRecord,
): HammerVisualAnchorHint {
  return normalizeAnchorHint({
    anchor_segment_id: record.anchor_segment_id,
    matched_segment_ids: record.matched_segment_ids,
    anchor_text: record.anchor_text,
    anchor_label: record.label ?? record.entry_id,
    detached: false,
  });
}
