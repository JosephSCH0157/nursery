import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReferenceClipGenerationGuidance,
  buildReferenceClipImageMapBridgeEntry,
  createReferenceClipPlan,
  inferReferenceClipSuitabilitySignals,
  resolveReferenceClipSourceImageEntry,
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

test("reference clip generation guidance carries data and context cues into the bridge prompt", () => {
  const entry = {
    ...createReferenceClipPlan({
      workpieceId: "workpiece-1",
      anchorText: "Florida citrus production collapsed over two decades.",
      description: "Florida groves with a decline chart layered into the frame.",
      format: "still",
    }),
    background_context_description: "Show abandoned groves and packing infrastructure in the distance.",
    foreground_data_description: "Use a downward production trend as the foreground data layer.",
    chart_type: "line" as const,
    title: "Florida citrus decline",
    labels: ["2000", "2024", "boxes"],
    emphasis_key: "collapse",
    visual_style: "cinematic_realism" as const,
  };

  const guidance = buildReferenceClipGenerationGuidance(entry);
  assert.match(guidance.visualIntent, /line|trend|collapse/i);
  assert.match(guidance.promptBasis, /abandoned groves|foreground data layer|no readable text/i);
});

test("reference clip bridge resolves the matching explanatory image entry and preserves anchor metadata", () => {
  const referenceClip = {
    ...createReferenceClipPlan({
      workpieceId: "workpiece-1",
      anchorText: "Permit timeline gap",
      description: "Show the permit timeline the headline skipped.",
      format: "still",
    }),
    foreground_data_description: "Permit dates, march route, enforcement shift",
    visual_style: "documentary_cinematic" as const,
  };
  const matchingImageEntry = {
    id: "image-map-1",
    anchor: "Permit timeline gap",
    anchor_scope: "beat" as const,
    script_anchor: null,
    beat_anchor: {
      mode: "bullet_beat" as const,
      beat_id: "beat-1",
      speaker: "s1" as const,
      beat_index: 2,
      beat_label: "permit timeline gap",
      cue_phrase: null,
      purpose: "explanation" as const,
    },
    purpose: "explanation" as const,
    description: "Show the permit timeline the headline skipped.",
    visual_intent: "Permit timeline explainer",
    prompt_basis: "permit dates, march route, enforcement shift",
    style_preset: "documentary_cinematic" as const,
    intent: "graphic",
    source_type: "stock",
    visual_priority: "primary" as const,
    visual_type: "diagram" as const,
    section_intent_note: "Use this when explaining the permit timeline gap.",
    beat_order: 2,
    paragraph_beat_order: 1,
    candidate_assets: [],
    selected_asset_id: null,
    status: "mapped" as const,
    placement_hint: "exact_timestamp",
  };
  const unrelatedImageEntry = {
    ...matchingImageEntry,
    id: "image-map-2",
    anchor: "Unrelated skyline",
    description: "Wide skyline beat",
    visual_intent: "Opening skyline",
    prompt_basis: "city skyline at dawn",
  };

  const sourceEntry = resolveReferenceClipSourceImageEntry({
    entry: referenceClip,
    imageMapEntries: [unrelatedImageEntry, matchingImageEntry],
    selectedImageMapEntry: unrelatedImageEntry,
  });

  assert.equal(sourceEntry?.id, "image-map-1");

  const bridgeEntry = buildReferenceClipImageMapBridgeEntry({
    entry: referenceClip,
    tempEntryId: "rc_temp_reference-1",
    beatOrder: 7,
    sourceEntry,
  });

  assert.equal(bridgeEntry.anchor, "Permit timeline gap");
  assert.equal(bridgeEntry.anchor_scope, "beat");
  assert.equal(bridgeEntry.beat_anchor?.beat_id, "beat-1");
  assert.equal(bridgeEntry.visual_type, "diagram");
  assert.match(bridgeEntry.prompt_basis, /permit timeline|permit dates|no readable text/i);
});
