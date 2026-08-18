import assert from "node:assert/strict";
import test from "node:test";
import { createHammerWorkspaceVisualSelectionCommand } from "../src/editor/hammerWorkspaceVisualSelectionCommand";
import type { HammerVisualTimelineState } from "../src/visuals/model/hammerVisualTypes";

const timeline: HammerVisualTimelineState = {
  schema_version: 1,
  updated_at: "2026-08-18T12:00:00.000Z",
  debug_origin: "test",
  selected_clip_id: null,
  lanes: [{ lane_id: "images", kind: "image", clip_ids: ["clip-a"] }],
  assets: [],
  clips: [{
    clip_id: "clip-a", lane_id: "images", asset_id: null, start_sec: 0, end_sec: 1,
    source: "manual", system_type: null, visual_mode: "image", label: "A",
    anchor_hint: { anchor_segment_id: null, matched_segment_ids: [] },
    geometry: { x: 0, y: 0, width: 1, height: 1, anchor: "top-left" },
    animation: { preset: "none" },
  }],
};

test("visual selection command preserves canonical selection, fallback, equality, and debug behavior", () => {
  let current: HammerVisualTimelineState | null = structuredClone(timeline);
  const debugRef = { current: null as string | null };
  const logs: unknown[][] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => { logs.push(args); };
  try {
    const select = createHammerWorkspaceVisualSelectionCommand({
      fallbackTimeline: timeline,
      setVisualTimeline: (updater) => { current = typeof updater === "function" ? updater(current) : updater; },
      lastDebugSelectionKeyRef: debugRef,
      debugEnabled: () => true,
      now: () => "2026-08-18T12:01:00.000Z",
    });
    select("clip-a");
    assert.equal(current?.selected_clip_id, "clip-a");
    assert.equal(debugRef.current, "clip-a|clip-a");
    assert.equal(logs.length, 1);
    const selected = current;
    select("clip-a");
    assert.equal(current, selected);
    assert.equal(logs.length, 1);
  } finally {
    console.debug = originalDebug;
  }
});
