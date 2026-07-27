import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHearthBrollDataVisualSpec,
  deriveHearthBrollCompletion,
  deriveHearthBrollEligibility,
} from "../src/routes/hearth-shell/buildHearthBrollViewModel";
import { buildHearthBrollProgress } from "../src/routes/hearth-shell/hearth-broll-progress";
import { resolveHearthCanonicalBrollPreviewPath } from "../src/routes/hearth-shell/hearth-broll-preview";
import type { EpisodeBrollPlanBeat } from "../src/lib/episode-package-v2";

const eligible = Object.freeze({ eligible: true, reason: "complete" as const });
const blocked = Object.freeze({ eligible: false, reason: "image_planning_incomplete" as const });

function beat(input: Partial<EpisodeBrollPlanBeat> = {}): EpisodeBrollPlanBeat {
  return {
    id: "beat-1",
    anchor_text: "Anchor",
    description: "Description",
    motion_intent: "broll",
    asset_category: "stock_video",
    priority: "supporting",
    keywords: [],
    mood: null,
    shot_type: "mixed",
    motion_suggestion: null,
    suggested_duration_ms: null,
    placement_hint: "first_occurrence",
    data_visual_spec: null,
    fulfillment_state: "planned",
    candidate_assets: [],
    selected_asset_id: null,
    external_request: null,
    ...input,
  };
}

test("inactive and image-planning failures preserve explicit B-roll reasons", () => {
  assert.deepEqual(deriveHearthBrollEligibility({
    active: false, imagePlanning: eligible, visualPlanApplied: true, visualPlanStale: false,
  }), { eligible: false, reason: "inactive" });
  assert.equal(deriveHearthBrollEligibility({
    active: true, imagePlanning: blocked, visualPlanApplied: true, visualPlanStale: false,
  }).reason, "image_planning_incomplete");
  assert.equal(deriveHearthBrollEligibility({
    active: true, imagePlanning: eligible, visualPlanApplied: true, visualPlanStale: true,
  }).reason, "stale");
});

test("eligibility remains distinct from generation, selection, and completion", () => {
  assert.deepEqual(deriveHearthBrollCompletion({
    active: true,
    loaded: true,
    failed: false,
    eligibility: eligible,
    progress: { planned: 1, selected: 0, resolved: 0 },
  }), { kind: "selection_incomplete", complete: false });
});

test("empty, failed, partial, and blocked B-roll cannot complete", () => {
  assert.equal(deriveHearthBrollCompletion({
    active: true, loaded: true, failed: false, eligibility: eligible,
    progress: { planned: 0, selected: 0, resolved: 0 },
  }).kind, "empty");
  assert.equal(deriveHearthBrollCompletion({
    active: true, loaded: false, failed: true, eligibility: eligible,
    progress: { planned: 1, selected: 1, resolved: 1 },
  }).complete, false);
  assert.equal(deriveHearthBrollCompletion({
    active: true, loaded: true, failed: false, eligibility: blocked,
    progress: { planned: 1, selected: 1, resolved: 1 },
  }).kind, "blocked");
});

test("completion requires every canonical beat selected and resolved", () => {
  const beats = [
    beat({ id: "beat-2", selected_asset_id: "asset-2", fulfillment_state: "resolved" }),
    beat({ id: "beat-1", selected_asset_id: "asset-1", fulfillment_state: "resolved" }),
  ];
  const progress = buildHearthBrollProgress(beats);
  assert.deepEqual(progress, { planned: 2, selected: 2, resolved: 2 });
  assert.deepEqual(deriveHearthBrollCompletion({
    active: true, loaded: true, failed: false, eligibility: eligible, progress,
  }), { kind: "complete", complete: true });
  assert.deepEqual(beats.map((entry) => entry.id), ["beat-2", "beat-1"]);
});

test("B-roll data-visual projection preserves creator fields without changing other intents", () => {
  assert.equal(buildHearthBrollDataVisualSpec({
    intent: "broll", chartType: "bar", title: "", labels: "", values: "",
    emphasisKey: "", animationStyle: "",
  }), null);
  assert.deepEqual(buildHearthBrollDataVisualSpec({
    intent: "data_visual",
    chartType: "line",
    title: "Growth",
    labels: "A, B",
    values: "1, 2",
    emphasisKey: "B",
    animationStyle: "draw",
  }), {
    chart_type: "line",
    title: "Growth",
    labels: ["A", "B"],
    values: [1, 2],
    emphasis_key: "B",
    animation_style: "draw",
  });
});

test("canonical preview resolution is honest and does not invent video previews", () => {
  assert.equal(resolveHearthCanonicalBrollPreviewPath({
    previewPath: " canonical/poster.jpg ", thumbnailPath: "thumb.jpg", assetPath: "video.mp4", video: true,
  }), "canonical/poster.jpg");
  assert.equal(resolveHearthCanonicalBrollPreviewPath({
    previewPath: null, thumbnailPath: " canonical/thumb.jpg ", assetPath: "video.mp4", video: true,
  }), "canonical/thumb.jpg");
  assert.equal(resolveHearthCanonicalBrollPreviewPath({
    previewPath: null, thumbnailPath: null, assetPath: "video.mp4", video: true,
  }), null);
});
