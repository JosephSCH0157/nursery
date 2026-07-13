import {
  createDefaultVisualAnimation,
  createDefaultVisualGeometry,
  createDefaultVisualLane,
  createEmptyVisualTimelineState,
} from "../visuals/model/hammerVisualDefaults";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";

export function createHammerAutoPlacementFixtureTimeline(): HammerVisualTimelineState {
  const updatedAt = "2026-07-11T12:00:00.000Z";
  return createEmptyVisualTimelineState({
    updated_at: updatedAt,
    assets: [{
      asset_id: "step9-asset",
      asset_ref: "/assets/forge-favicon.png",
      kind: "image",
      label: "Step 9 placement fixture",
      path: "/assets/forge-favicon.png",
      storage_key: null,
      mime_type: "image/png",
      source_mode: "manual",
      updated_at: updatedAt,
    }],
    lanes: [createDefaultVisualLane({
      lane_id: "lane:stills",
      label: "Stills",
      clip_ids: ["step9-clip"],
    })],
    clips: [{
      clip_id: "step9-clip",
      asset_id: "step9-asset",
      lane_id: "lane:stills",
      entry_id: "manual:step9-clip",
      label: "Step 9 placement fixture",
      visual_mode: "still_image",
      confidence: 1,
      placement_status: "placed",
      ingest_state: "approved",
      uncertainty_flags: [],
      start_sec: 0,
      end_sec: 32,
      geometry: createDefaultVisualGeometry({ x: 0.05, y: 0.05, width: 0.22, height: 0.16 }),
      animation: createDefaultVisualAnimation(),
      opacity: 1,
      z_index: 1,
      enabled: true,
      locked: false,
      source_mode: "manual",
      anchor_hint: {
        anchor_segment_id: "seg_001",
        matched_segment_ids: ["seg_001"],
        anchor_text: "Let me start with this.",
        anchor_label: "Step 9 fixture",
        detached: false,
      },
      updated_at: updatedAt,
    }],
    selected_clip_id: "step9-clip",
    debug_origin: "empty_init",
  });
}
