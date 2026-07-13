import assert from "node:assert/strict";
import test from "node:test";
import { buildBrollPlanFromScript } from "../src/lib/hearth-broll-plan";
import { generateImageMapEntriesFromScript } from "../src/lib/hearth-image-map-beats";
import { createReferenceClipPlan } from "../src/lib/hearth-reference-clip-plan";
import {
  createEmptyEpisodePackageV2,
  ensureMediaMapV2,
} from "../src/lib/episode-package-v2";
import {
  classifyVisualBeatPurpose,
  deriveBrollPurpose,
  deriveImageMapPurpose,
} from "../src/lib/hearth-visual-purpose";

test("classifyVisualBeatPurpose stays deterministic across coverage, explanation, and emphasis cues", () => {
  assert.equal(classifyVisualBeatPurpose("He walks through the factory and opens the loading door."), "coverage");
  assert.equal(classifyVisualBeatPurpose("By 2024 the region saw a 32 percent decline compared to 2019."), "explanation");
  assert.equal(classifyVisualBeatPurpose("Use this as the hero opening image for the segment."), "emphasis");
});

test("generateImageMapEntriesFromScript stamps a persisted purpose onto visual beats", () => {
  const entries = generateImageMapEntriesFromScript([
    "The host walks through the market before sunrise.",
    "By 2024 the city saw a 42 percent increase in nighttime visitors.",
  ].join(" "));

  assert.ok(entries.length > 0);
  assert.ok(entries.every((entry) => entry.purpose === "coverage" || entry.purpose === "explanation" || entry.purpose === "emphasis"));
  assert.ok(entries.some((entry) => entry.purpose === "explanation"));
});

test("buildBrollPlanFromScript keeps beat purpose attached even when motion intent becomes explanatory", () => {
  const plan = buildBrollPlanFromScript({
    workpieceId: "workpiece-1",
    scriptText: [
      "The chart compares baseline versus the current week.",
      "The host walks the floor while the room fills up.",
    ].join(" "),
  });

  assert.ok(plan.beats.length > 0);
  assert.ok(plan.beats.every((beat) => beat.purpose === deriveBrollPurpose({
    motionIntent: beat.motion_intent,
    description: beat.description,
    anchorText: beat.anchor_text,
  })));
  assert.ok(plan.beats.some((beat) => beat.purpose === "explanation"));
});

test("createReferenceClipPlan always records explanation purpose", () => {
  const plan = createReferenceClipPlan({
    workpieceId: "workpiece-1",
    anchorText: "Since 2005, the county has seen a 20 percent decline.",
  });

  assert.equal(plan.purpose, "explanation");
});

test("ensureMediaMapV2 backfills purpose for older media-map entries", () => {
  const base = createEmptyEpisodePackageV2();
  const legacyEntries = [
    {
      id: "mm-1",
      final_media_kind: "image",
      anchor: { mode: "section_marker", target: "thumbnail:hero" },
      timing: { in_offset_sec: 0, duration_sec: 6 },
      description: "Hero image",
      intent: "thumbnail_concept",
      source: { status: "unresolved", asset_id: null },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: true,
      stale: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "mm-2",
      final_media_kind: "contextual_data_composite",
      anchor: { mode: "phrase_match", target: "The county dropped 20 percent." },
      timing: { in_offset_sec: 0, duration_sec: 6 },
      description: "County decline chart",
      intent: "comparison",
      source: { status: "unresolved", asset_id: null },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: true,
      stale: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ] as unknown as typeof base.media_map.entries;
  const normalized = ensureMediaMapV2({
    ...base,
    media_map: {
      ...base.media_map,
      entries: legacyEntries,
    },
  });

  assert.equal(normalized.media_map.entries[0]?.purpose, "emphasis");
  assert.equal(normalized.media_map.entries[1]?.purpose, "explanation");
});

test("deriveImageMapPurpose promotes primary hero beats to emphasis", () => {
  assert.equal(deriveImageMapPurpose({
    visualPriority: "primary",
    visualType: "still_image",
    intent: "cutaway",
    description: "Close-up hero frame",
  }), "emphasis");
});
