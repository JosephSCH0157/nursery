import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultVisualAnimation, createDefaultVisualGeometry, createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";
import { deriveLegacyVisualPlacementsFromTimeline } from "../src/visuals/persistence/hammerVisualTimelineLegacyAdapter";

test("timeline compatibility adapter preserves clip and packaging metadata for shell reads", () => {
  const timeline = createEmptyVisualTimelineState({
    assets: [{
      asset_id: "asset_001",
      asset_ref: "visuals/hero.png",
      kind: "image",
      label: "Hero",
      path: "visuals/hero.png",
      storage_key: "visuals/hero.png",
      mime_type: "image/png",
      source_mode: "packaging",
      updated_at: "2026-04-03T10:00:00.000Z",
    }],
    clips: [{
      clip_id: "placement_packaging_logo",
      asset_id: "asset_001",
      lane_id: "lane:primary",
      entry_id: "packaging:logo",
      label: "Brand Logo",
      visual_mode: "packaging_logo",
      confidence: null,
      placement_status: "placed",
      ingest_state: "approved",
      uncertainty_flags: [],
      start_sec: 0,
      end_sec: 8,
      geometry: createDefaultVisualGeometry(),
      animation: createDefaultVisualAnimation(),
      opacity: 1,
      z_index: 3,
      enabled: true,
      locked: false,
      source_mode: "packaging",
      anchor_hint: {
        anchor_segment_id: "seg_001",
        matched_segment_ids: ["seg_001"],
        anchor_text: "hello",
        anchor_label: "Brand Logo",
        detached: false,
      },
      updated_at: "2026-04-03T10:00:00.000Z",
    }],
    lanes: [{
      lane_id: "lane:primary",
      label: "Visuals",
      clip_ids: ["placement_packaging_logo"],
    }],
  });

  const placements = deriveLegacyVisualPlacementsFromTimeline(timeline);

  assert.equal(placements?.placements[0]?.placement_id, "placement_packaging_logo");
  assert.equal(placements?.placements[0]?.entry_id, "packaging:logo");
  assert.equal(placements?.placements[0]?.visual_mode, "packaging_logo");
  assert.equal(placements?.placements[0]?.asset_path, "visuals/hero.png");
});
