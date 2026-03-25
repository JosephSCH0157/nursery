import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrollPlanFromScript,
  buildStockCandidatesForBrollBeat,
  regenerateBrollBeatFromDescription,
} from "../src/lib/hearth-broll-plan";
import type { EpisodeBrollPlanBeat } from "../src/lib/episode-package-v2";

test("buildBrollPlanFromScript creates episode-wide beats with canonical defaults", () => {
  const scriptText = [
    "In 1986 the city rebuilt the old rail bridge after two floods.",
    "For example, riders now scan once and transfer across all lines.",
    "Meanwhile, the weekend schedule shifts to late-night service.",
    "The numbers show a 34 percent increase in nightly ridership.",
    "The result feels calmer for new commuters.",
  ].join(" ");

  const plan = buildBrollPlanFromScript({
    workpieceId: "workpiece-1",
    scriptText,
  });

  assert.equal(plan.workpiece_id, "workpiece-1");
  assert.ok(plan.beats.length > 0);
  assert.ok(plan.generated_at.length > 0);
  assert.ok(["low", "medium", "high"].includes(plan.coverage_strength ?? "low"));

  for (const beat of plan.beats) {
    assert.equal(beat.workpiece_id, "workpiece-1");
    assert.equal(typeof beat.anchor_text, "string");
    assert.equal(typeof beat.description, "string");
    assert.equal(Array.isArray(beat.keywords), true);
    assert.ok(["planned", "stock", "upload", "external", "hearth_ai", "hammer_upload"].includes(beat.source_type));
    assert.ok([
      "stock_video",
      "ai_video",
      "uploaded_video",
      "animated_chart",
      "animated_graphic",
      "timeline_graphic",
      "map_animation",
      "stat_card",
    ].includes(beat.asset_category ?? "stock_video"));
    assert.ok(["unresolved", "candidate_assets_available", "resolved", "stale"].includes(beat.fulfillment_state));
  }
});

test("buildBrollPlanFromScript preserves prior beat identity and selected assets", () => {
  const now = new Date().toISOString();
  const previousBeat: EpisodeBrollPlanBeat = {
    id: "broll-1",
    workpiece_id: "workpiece-1",
    anchor_text: "For example, riders now scan once and transfer across all lines.",
    placement_hint: "first_occurrence",
    timestamp_ms: null,
    description: "Transit gate close-up",
    motion_intent: "explanatory",
    visual_style: null,
    priority: "primary",
    keywords: ["riders", "transfer"],
    mood: "calm",
    shot_type: "close",
    motion_suggestion: "Use a close shot of people tapping in.",
    suggested_duration_ms: 4000,
    source_type: "stock",
    asset_category: "stock_video",
    selected_asset_id: "asset-123",
    candidate_assets: [{
      asset_id: "asset-123",
      source: "stock",
      label: "Stock candidate",
      uri: "https://example.com/stock.mp4",
      created_at: now,
    }],
    fulfillment_state: "resolved",
    origin: "hearth",
    created_at: now,
    updated_at: now,
  };
  const scriptText = [
    "For example, riders now scan once and transfer across all lines.",
    "The result feels calmer for new commuters.",
  ].join(" ");

  const plan = buildBrollPlanFromScript({
    workpieceId: "workpiece-1",
    scriptText,
    previousPlan: {
      id: "broll-plan-v1",
      workpiece_id: "workpiece-1",
      version: 1,
      beats: [previousBeat],
      coverage_strength: "low",
      generated_at: now,
    },
  });

  const matched = plan.beats.find((beat) => beat.id === "broll-1");
  assert.ok(matched);
  assert.equal(matched?.selected_asset_id, "asset-123");
  assert.equal(matched?.fulfillment_state, "resolved");
  assert.equal(matched?.source_type, "stock");
  assert.equal(matched?.asset_category, "stock_video");
});

test("regenerateBrollBeatFromDescription marks resolved beats as stale and refreshes metadata", () => {
  const now = "2020-01-01T00:00:00.000Z";
  const beat: EpisodeBrollPlanBeat = {
    id: "broll-1",
    workpiece_id: "workpiece-1",
    anchor_text: "A joke lands in the room.",
    placement_hint: "first_occurrence",
    timestamp_ms: null,
    description: "A joke lands in the room.",
    motion_intent: "broll",
    visual_style: null,
    priority: "supporting",
    keywords: ["joke"],
    mood: null,
    shot_type: "mixed",
    motion_suggestion: null,
    suggested_duration_ms: 3000,
    source_type: "upload",
    asset_category: "uploaded_video",
    selected_asset_id: "asset-abc",
    candidate_assets: [],
    fulfillment_state: "resolved",
    origin: "mixed",
    created_at: now,
    updated_at: now,
  };

  const regenerated = regenerateBrollBeatFromDescription(beat);

  assert.equal(regenerated.id, beat.id);
  assert.equal(regenerated.selected_asset_id, "asset-abc");
  assert.equal(regenerated.fulfillment_state, "stale");
  assert.notEqual(regenerated.updated_at, beat.updated_at);
});

test("buildBrollPlanFromScript emits structured data visual beats when script is metrics-heavy", () => {
  const scriptText = [
    "The data shows a 42 percent retention increase after launch.",
    "Our chart compares baseline versus the current week.",
    "Each metric trend confirms the same pattern.",
  ].join(" ");

  const plan = buildBrollPlanFromScript({
    workpieceId: "workpiece-2",
    scriptText,
  });

  const dataBeat = plan.beats.find((beat) => beat.motion_intent === "data_visual");
  assert.ok(dataBeat);
  assert.equal(dataBeat?.asset_category, "animated_chart");
  assert.ok(dataBeat?.data_visual_spec);
  assert.ok(["bar", "line", "area", "pie", "timeline", "stat"].includes(dataBeat?.data_visual_spec?.chart_type ?? "bar"));
});

test("buildStockCandidatesForBrollBeat creates stock candidate links", () => {
  const beat: EpisodeBrollPlanBeat = {
    id: "broll-2",
    workpiece_id: "workpiece-1",
    anchor_text: "A downtown skyline opens the segment.",
    placement_hint: "first_occurrence",
    timestamp_ms: null,
    description: "Downtown skyline during sunrise",
    motion_intent: "establishing",
    visual_style: null,
    priority: "primary",
    keywords: ["downtown", "skyline", "sunrise"],
    mood: "calm",
    shot_type: "wide",
    motion_suggestion: null,
    suggested_duration_ms: 5000,
    source_type: "planned",
    asset_category: "stock_video",
    selected_asset_id: null,
    candidate_assets: [],
    fulfillment_state: "unresolved",
    origin: "hearth",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const candidates = buildStockCandidatesForBrollBeat(beat);
  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((candidate) => candidate.source === "stock"));
  assert.ok(candidates.every((candidate) => candidate.asset_category != null));
  assert.ok(candidates.every((candidate) => candidate.uri?.startsWith("https://")));
});
