import assert from "node:assert/strict";
import { createDefaultSemanticAnchor, createDefaultVisualAnimation, createDefaultVisualGeometry, createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";
import { buildHammerVisualTimelineSaveRequest } from "../src/visuals/persistence/hammerVisualTimelinePersistence";

const assetId = "11111111-1111-4111-8111-111111111111";
const timeline = createEmptyVisualTimelineState({
  updated_at: "2026-08-26T12:00:00.000Z",
  packaging: {
    version: 1,
    intro_asset_id: assetId,
    outro_asset_id: null,
    intro_source: "manual",
    outro_source: null,
  },
  assets: [{
    asset_id: assetId, asset_ref: "assets/uploads/introoutro/intro.mp4", kind: "broll",
    label: "Intro", path: "assets/uploads/introoutro/intro.mp4", storage_key: null,
    mime_type: "video/mp4", source_mode: "packaging", roles: ["timeline_visual"],
    updated_at: "2026-08-26T12:00:00.000Z",
  }],
  clips: [{
    clip_id: "packaging:intro:projection", asset_id: assetId, lane_id: "lane:primary",
    entry_id: "packaging:intro", system_managed: true, system_type: "intro",
    system_source: "manual", system_asset_id: assetId, label: "Packaging Intro",
    visual_mode: "packaging_intro", confidence: null, placement_status: "placed",
    ingest_state: "approved", uncertainty_flags: [], start_sec: 0, end_sec: 1.25,
    geometry: createDefaultVisualGeometry(), animation: createDefaultVisualAnimation(),
    opacity: 1, z_index: 1, enabled: true, locked: true, source_mode: "packaging",
    anchor_hint: { anchor_segment_id: null, matched_segment_ids: [], anchor_text: null, anchor_label: null, detached: false },
    semantic_anchor: createDefaultSemanticAnchor(), divergence: { state: "not_comparable", start_delta_sec: null, end_delta_sec: null },
    updated_at: "2026-08-26T12:00:00.000Z",
  }],
  lanes: [{ lane_id: "lane:primary", label: "Visuals", clip_ids: ["packaging:intro:projection"] }],
});

const saved = buildHammerVisualTimelineSaveRequest({ timeline }).visual_timeline.data;
assert.equal(saved.packaging.intro_asset_id, assetId);
assert.equal(saved.clips.length, 0);
assert.deepEqual(saved.lanes[0]?.clip_ids, []);
console.log("Hammer packaging intent persistence tests passed.");
