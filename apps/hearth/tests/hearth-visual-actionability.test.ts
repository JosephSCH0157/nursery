import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrollBeatBrief,
  buildReferenceClipBrief,
  createManualResultCandidate,
  formatVisualBriefAsText,
  listExternalGenerationProviders,
} from "../src/lib/hearth-visual-actionability";
import {
  createEmptyEpisodePackageV2,
  ensureBrollPlanV2,
  ensureReferenceClipPlanV2,
} from "../src/lib/episode-package-v2";
import { createReferenceClipPlan } from "../src/lib/hearth-reference-clip-plan";

test("brief generation includes required fields for broll and reference clips", () => {
  const brollBrief = buildBrollBeatBrief({
    beat: {
      id: "beat-1",
      workpiece_id: "wp-1",
      anchor_text: "The host describes the flood wall failure.",
      placement_hint: "first_occurrence",
      description: "Wide flood wall and close-up crack detail.",
      motion_intent: "broll",
      priority: "supporting",
      keywords: ["flood", "infrastructure"],
      source_type: "planned",
      asset_category: "stock_video",
      origin: "hearth",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    workpieceId: "wp-1",
    workpieceTitle: "Harbor Infrastructure Episode",
  });
  const brollText = formatVisualBriefAsText(brollBrief);
  assert.equal(brollBrief.asset_class, "broll");
  assert.equal(brollText.includes("Asset Class: broll"), true);
  assert.equal(brollText.includes("Shot Intent / Editorial Purpose"), true);
  assert.equal(brollText.includes("Keywords"), true);

  const referenceBrief = buildReferenceClipBrief({
    entry: createReferenceClipPlan({
      workpieceId: "wp-1",
      anchorText: "By 2024 the region dropped 32 percent in output.",
      description: "Map plus year-over-year line chart",
      format: "hybrid",
    }),
    workpieceId: "wp-1",
    workpieceTitle: "Harbor Infrastructure Episode",
  });
  const referenceText = formatVisualBriefAsText(referenceBrief);
  assert.equal(referenceBrief.asset_class, "reference_clip");
  assert.equal(referenceText.includes("Data Type"), true);
  assert.equal(referenceText.includes("Context Type"), true);
  assert.equal(referenceText.includes("Chart Labels"), true);
});

test("provider registry filters by asset class", () => {
  const brollProviders = listExternalGenerationProviders("broll");
  const referenceProviders = listExternalGenerationProviders("reference_clip");
  assert.ok(brollProviders.length > 0);
  assert.ok(referenceProviders.length > 0);
  assert.ok(brollProviders.every((provider) => provider.supportedAssetClasses.includes("broll")));
  assert.ok(referenceProviders.every((provider) => provider.supportedAssetClasses.includes("reference_clip")));
});

test("manual returned asset candidate preserves beat linkage and class identity", () => {
  const candidate = createManualResultCandidate({
    assetClass: "reference_clip",
    beatId: "ref-1",
    sourceLabel: "Archive desk",
    sourceUrl: "https://example.com/archive/clip-1",
    providerNote: "Sourced from newsroom archive",
    usageNote: "Editorial use cleared",
  });
  assert.equal(candidate.asset_class, "reference_clip");
  assert.equal(candidate.source_beat_id, "ref-1");
  assert.equal(candidate.source, "external");
  assert.equal(candidate.source_url, "https://example.com/archive/clip-1");
});

test("ensure plan normalizers keep class explicit for downstream consumers", () => {
  const base = createEmptyEpisodePackageV2();
  const next = {
    ...base,
    broll_plan: {
      ...base.broll_plan,
      beats: [{
        id: "broll-1",
        workpiece_id: "wp-1",
        anchor_text: "Bridge opens with skyline",
        placement_hint: "first_occurrence",
        description: "Skyline flyover",
        motion_intent: "broll",
        priority: "supporting",
        keywords: [],
        source_type: "external",
        asset_category: "stock_video",
        candidate_assets: [{
          asset_id: "cand-broll",
          source: "external",
        }],
        origin: "hearth",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    },
    cdc_plan: {
      ...base.cdc_plan,
      entries: [{
        ...createReferenceClipPlan({
          workpieceId: "wp-1",
          anchorText: "Regional decline by county",
          description: "County map plus supporting stat card",
          format: "still",
        }),
        id: "ref-1",
        candidate_assets: [{
          asset_id: "cand-ref",
          source: "external",
        }],
      }],
    },
  } as const;

  const brollNormalized = ensureBrollPlanV2(next);
  const referenceNormalized = ensureReferenceClipPlanV2(brollNormalized);

  assert.equal(referenceNormalized.broll_plan.beats[0]?.candidate_assets?.[0]?.asset_class, "broll");
  assert.equal(referenceNormalized.cdc_plan.entries[0]?.candidate_assets?.[0]?.asset_class, "reference_clip");
});
