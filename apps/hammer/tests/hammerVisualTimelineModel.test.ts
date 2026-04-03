import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultVisualGeometry,
  createEmptyVisualTimelineState,
} from "../src/visuals/model/hammerVisualDefaults";
import {
  assertValidTimelineState,
  clampOpacity,
  normalizeAnchorHint,
  normalizeGeometry,
  normalizeSecRange,
} from "../src/visuals/model/hammerVisualGuards";

test("geometry defaults are stable", () => {
  assert.deepEqual(createDefaultVisualGeometry(), {
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.4,
    anchor: "center",
  });
});

test("timeline default has version 1 and revision 1", () => {
  const state = createEmptyVisualTimelineState();

  assert.equal(state.version, 1);
  assert.equal(state.revision, 1);
  assert.equal(state.source_mode, "packaging");
  assert.equal(state.lanes.length, 1);
});

test("normalizeSecRange repairs invalid ranges deterministically", () => {
  assert.deepEqual(normalizeSecRange(4, 1), {
    start_sec: 4,
    end_sec: 4.25,
  });
  assert.deepEqual(normalizeSecRange(-3, Number.NaN), {
    start_sec: 0,
    end_sec: 0.25,
  });
});

test("clampOpacity enforces [0, 1]", () => {
  assert.equal(clampOpacity(-0.5), 0);
  assert.equal(clampOpacity(0.25), 0.25);
  assert.equal(clampOpacity(2), 1);
});

test("normalizeAnchorHint always returns array for matched_segment_ids", () => {
  assert.deepEqual(normalizeAnchorHint({
    anchor_segment_id: "seg_001",
    matched_segment_ids: undefined,
    anchor_text: "hello",
  }), {
    anchor_segment_id: "seg_001",
    matched_segment_ids: [],
    anchor_text: "hello",
    anchor_label: null,
    detached: false,
  });
});

test("normalized state passes the full timeline guard", () => {
  const geometry = normalizeGeometry({
    x: 2,
    y: -1,
    width: 0,
    height: 5,
    anchor: "top_left",
  });
  const timing = normalizeSecRange(3, 1);

  const state = createEmptyVisualTimelineState({
    assets: [{
      asset_id: "asset_001",
      asset_ref: "visuals/card-a.png",
      kind: "image",
      label: "Card A",
      path: "visuals/card-a.png",
      storage_key: null,
      mime_type: "image/png",
      source_mode: "packaging",
      updated_at: "2026-04-02T12:00:00.000Z",
    }],
    clips: [{
      clip_id: "clip_001",
      asset_id: "asset_001",
      lane_id: "lane:primary",
      label: "Card A",
      start_sec: timing.start_sec,
      end_sec: timing.end_sec,
      geometry,
      animation: { preset: "none" },
      opacity: clampOpacity(9),
      z_index: 3,
      enabled: true,
      locked: false,
      source_mode: "packaging",
      anchor_hint: normalizeAnchorHint({
        anchor_segment_id: "seg_001",
        matched_segment_ids: ["seg_001", "", "seg_002"],
        anchor_text: "Welcome back",
      }),
      updated_at: "2026-04-02T12:00:00.000Z",
    }],
    lanes: [{
      lane_id: "lane:primary",
      label: "Visuals",
      clip_ids: ["clip_001"],
    }],
    selected_clip_id: "clip_001",
    updated_at: "2026-04-02T12:00:00.000Z",
  });

  assert.equal(assertValidTimelineState(state), state);
});
