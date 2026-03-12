export type HammerVisualPlacementMatchType =
  | "exact"
  | "overlap"
  | "ordered_fallback"
  | "progress_fallback"
  | "unmatched";

export interface HammerVisualPlacement {
  entry_id: string;
  beat_order: number;
  paragraph_beat_order: number;
  visual_mode: string | null;
  selected_asset_id: string | null;
  start_sec: number | null;
  end_sec: number | null;
  confidence: number;
  match_type: HammerVisualPlacementMatchType;
  matched_segment_ids: string[];
  anchor_text_used: string | null;
}

export interface HammerVisualPlacementResult {
  workspace_id: string;
  workpiece_id: string;
  transcript_segment_count: number;
  placements: HammerVisualPlacement[];
}
