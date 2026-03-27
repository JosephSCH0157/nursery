import assert from "node:assert/strict";
import test from "node:test";
import {
  createReferenceClipPlan,
  inferReferenceClipSuitabilitySignals,
} from "../src/lib/hearth-reference-clip-plan";
import {
  createEmptyEpisodePackageV2,
  ensureCdcPlanV2 as ensureReferenceClipPlanV2,
} from "../src/lib/episode-package-v2";

test("inferReferenceClipSuitabilitySignals detects timeline, statistics, and geographic cues", () => {
  const signals = inferReferenceClipSuitabilitySignals(
    "Since 2005, the county saw a 42 percent decline compared to neighboring regions.",
  );
  assert.ok(signals.includes("over_time"));
  assert.ok(signals.includes("statistics"));
  assert.ok(signals.includes("geographic"));
  assert.ok(signals.includes("comparison"));
});

test("createReferenceClipPlan seeds canonical reference clip defaults", () => {
  const plan = createReferenceClipPlan({
    workpieceId: "workpiece-1",
    anchorText: "Florida citrus production has declined for twenty years.",
    description: "Citrus Tower background with a decline chart.",
    format: "still",
  });

  assert.equal(plan.media_type, "contextual_data_composite");
  assert.equal(plan.workpiece_id, "workpiece-1");
  assert.equal(plan.format, "still");
  assert.ok(["quantitative", "categorical", "timeline", "geographic", "comparison"].includes(plan.data_type));
  assert.ok(["line", "bar", "area", "scatter", "timeline", "map", "stat_card", "comparison"].includes(plan.chart_type ?? "line"));
  assert.equal(Array.isArray(plan.candidate_assets), true);
});

test("ensureReferenceClipPlanV2 preserves reference clip entries as a first-class canonical media plan", () => {
  const base = createEmptyEpisodePackageV2();
  const seeded = {
    ...base,
    cdc_plan: {
      ...base.cdc_plan,
      entries: [
        createReferenceClipPlan({
          workpieceId: base.cdc_plan.workpiece_id,
          anchorText: "Policy rollout changed outcomes over five years.",
          description: "Regional map plus timeline milestones.",
          format: "hybrid",
        }),
      ],
    },
  };

  const normalized = ensureReferenceClipPlanV2(seeded);
  assert.equal(normalized.cdc_plan.entries.length, 1);
  assert.equal(normalized.cdc_plan.entries[0]?.media_type, "contextual_data_composite");
  assert.equal(normalized.cdc_plan.entries[0]?.format, "hybrid");
});
