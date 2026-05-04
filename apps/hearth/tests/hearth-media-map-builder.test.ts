import assert from "node:assert/strict";
import test from "node:test";
import {
  type EpisodeBrollPlanBeat,
  createEmptyEpisodePackageV2,
  type EpisodeImageMapEntry,
} from "../src/lib/episode-package-v2";
import { buildMediaMapFromExistingPlans, dedupeVisualAssetsByAnchor } from "../src/lib/hearth-media-map-builder";

function createImageEntry(index: number, overrides: Partial<EpisodeImageMapEntry> = {}): EpisodeImageMapEntry {
  return {
    id: `image-map-${String(index).padStart(2, "0")}`,
    anchor: `Visual beat ${index}`,
    anchor_scope: "attached",
    script_anchor: null,
    beat_anchor: {
      mode: "bullet_beat",
      beat_id: `beat-${index}`,
      speaker: "s1",
      beat_index: index,
      beat_label: `visual beat ${index}`,
      cue_phrase: null,
      purpose: index % 3 === 0 ? "explanation" : "coverage",
    },
    purpose: index % 3 === 0 ? "explanation" : "coverage",
    description: `Visual beat ${index}`,
    visual_intent: `Visual beat ${index}`,
    prompt_basis: `Visual beat ${index}`,
    style_preset: "documentary_cinematic",
    intent: index % 3 === 0 ? "graphic" : "cutaway",
    source_type: "stock",
    visual_priority: index <= 4 ? "primary" : "supporting",
    visual_type: index % 3 === 0 ? "diagram" : "still_image",
    section_intent_note: null,
    beat_order: index,
    paragraph_beat_order: 1,
    candidate_assets: [],
    selected_asset_id: null,
    status: "mapped",
    placement_hint: null,
    ...overrides,
  };
}

function createBrollBeat(index: number, anchorText: string, overrides: Partial<EpisodeBrollPlanBeat> = {}): EpisodeBrollPlanBeat {
  return {
    id: `broll-${index}`,
    workpiece_id: "workpiece-1",
    anchor_text: anchorText,
    placement_hint: "first_occurrence",
    timestamp_ms: null,
    purpose: "coverage",
    description: anchorText,
    motion_intent: "broll",
    visual_style: null,
    priority: "supporting",
    keywords: [],
    mood: null,
    shot_type: "mixed",
    motion_suggestion: null,
    suggested_duration_ms: 4000,
    source_type: "planned",
    asset_category: "stock_video",
    data_visual_spec: null,
    selected_asset_id: null,
    candidate_assets: [],
    external_request: null,
    fulfillment_state: "unresolved",
    origin: "hearth",
    created_at: "2026-05-03T00:00:00.000Z",
    updated_at: "2026-05-03T00:00:00.000Z",
    ...overrides,
  };
}

test("hearthMediaMapBuilder: caps media maps at 18 selected visual beats", () => {
  const base = createEmptyEpisodePackageV2();
  const map = buildMediaMapFromExistingPlans({
    ...base,
    image_map: {
      entries: Array.from({ length: 30 }, (_, index) => createImageEntry(index + 1)),
    },
  }, "script-1", "images_only");

  assert.equal(map.entries.length, 18);
  assert.ok(map.entries.some((entry) => entry.critical));
  assert.ok(map.entries.every((entry) => entry.final_media_kind === "image"));
});

test("hearthMediaMapBuilder: rejects unsourced reference clips from handoff maps", () => {
  const base = createEmptyEpisodePackageV2();
  const map = buildMediaMapFromExistingPlans({
    ...base,
    cdc_plan: {
      ...base.cdc_plan,
      entries: [
        {
          id: "cdc-unsourced",
          workpiece_id: "workpiece-1",
          media_type: "contextual_data_composite",
          anchor_text: "Unsourced trend",
          placement_hint: "first_occurrence",
          timestamp_ms: null,
          purpose: "explanation",
          format: "still",
          data_type: "timeline",
          context_type: "historical",
          tone: "neutral",
          motion_level: "static",
          description: "A trend graph with no source.",
          background_context_description: "",
          foreground_data_description: "",
          visual_style: null,
          chart_type: "line",
          title: null,
          labels: [],
          values: [],
          emphasis_key: null,
          candidate_assets: [],
          external_request: null,
          selected_asset_id: null,
          source_type: "planned",
          origin: "hearth",
          created_at: "2026-05-03T00:00:00.000Z",
          updated_at: "2026-05-03T00:00:00.000Z",
        },
        {
          id: "cdc-sourced",
          workpiece_id: "workpiece-1",
          media_type: "contextual_data_composite",
          anchor_text: "Lobbying spend over time",
          placement_hint: "first_occurrence",
          timestamp_ms: null,
          purpose: "explanation",
          format: "still",
          data_type: "timeline",
          context_type: "historical",
          tone: "analytical",
          motion_level: "static",
          description: "Lobbying spend trend.",
          background_context_description: "2000-2024 trend",
          foreground_data_description: "OpenSecrets spend trend",
          visual_style: null,
          chart_type: "timeline",
          subtype: "timeline",
          source: "OpenSecrets",
          context: "2000-2024 trend",
          highlight: "Post-2010 growth spike",
          visual_spec: "Timeline reference clip using OpenSecrets.",
          title: "Lobbying Spend Over Time",
          labels: ["OpenSecrets"],
          values: [],
          emphasis_key: "Post-2010 growth spike",
          candidate_assets: [],
          external_request: null,
          selected_asset_id: null,
          source_type: "planned",
          origin: "hearth",
          created_at: "2026-05-03T00:00:00.000Z",
          updated_at: "2026-05-03T00:00:00.000Z",
        },
      ],
    },
  }, "script-1", "images_reference_clips");

  assert.equal(map.entries.length, 1);
  assert.equal(map.entries[0]?.id, "mm_reference_clip_cdc-sourced");
  assert.equal(map.entries[0]?.final_media_kind, "contextual_data_composite");
  assert.match(map.entries[0]?.intent ?? "", /source:OpenSecrets/);
});

test("hearthMediaMapBuilder: same anchor generated image+broll retains one primary visual asset", () => {
  const base = createEmptyEpisodePackageV2();
  const map = buildMediaMapFromExistingPlans({
    ...base,
    image_map: {
      entries: [
        createImageEntry(1, {
          anchor: "Policy process before vote",
          beat_anchor: null,
          description: "Policy process before vote",
          intent: "cutaway",
          purpose: "coverage",
          source_type: "stock",
          origin: "hearth",
        }),
      ],
    },
    broll_plan: {
      ...base.broll_plan,
      beats: [
        createBrollBeat(1, "Policy process before vote", {
          description: "Action process through a hallway workflow",
          motion_intent: "transition",
        }),
      ],
    },
  }, "script-1", "images_broll");

  const sameAnchorEntries = map.entries.filter((entry) => entry.anchor.target.toLowerCase() === "policy process before vote");
  assert.equal(sameAnchorEntries.length, 1);
});

test("hearthMediaMapBuilder: nearby text anchors are retained as separate beats", () => {
  const base = createEmptyEpisodePackageV2();
  const map = buildMediaMapFromExistingPlans({
    ...base,
    image_map: {
      entries: [createImageEntry(1, { anchor: "Policy process before vote", beat_anchor: null, description: "Policy process before vote" })],
    },
    broll_plan: {
      ...base.broll_plan,
      beats: [createBrollBeat(1, "Policy process after vote")],
    },
  }, "script-1", "images_broll");

  const anchors = new Set(map.entries.map((entry) => entry.anchor.target.toLowerCase()));
  assert.equal(anchors.has("policy process before vote"), true);
  assert.equal(anchors.has("policy process after vote"), true);
});

test("hearthMediaMapBuilder: explicit manual duplicate assets are preserved", () => {
  const base = createEmptyEpisodePackageV2();
  const map = buildMediaMapFromExistingPlans({
    ...base,
    image_map: {
      entries: [
        createImageEntry(1, {
          anchor: "Lobbying pathway",
          beat_anchor: null,
          source_type: "custom",
          origin: "hearth",
        }),
      ],
    },
    broll_plan: {
      ...base.broll_plan,
      beats: [
        createBrollBeat(1, "Lobbying pathway", {
          placement_hint: "manual",
          source_type: "upload",
        }),
      ],
    },
  }, "script-1", "images_broll");

  const sameAnchorEntries = map.entries.filter((entry) => entry.anchor.target.toLowerCase() === "lobbying pathway");
  assert.equal(sameAnchorEntries.length, 2);
  const kinds = new Set(sameAnchorEntries.map((entry) => entry.final_media_kind));
  assert.equal(kinds.has("image"), true);
  assert.equal(kinds.has("b_roll"), true);
});

test("hearthMediaMapBuilder: purpose preference keeps image for static explainer anchors", () => {
  const base = createEmptyEpisodePackageV2();
  const map = buildMediaMapFromExistingPlans({
    ...base,
    image_map: {
      entries: [
        createImageEntry(1, {
          anchor: "Static concept explainer",
          beat_anchor: null,
          description: "Static concept explainer diagram",
          purpose: "explanation",
          intent: "graphic",
          source_type: "stock",
        }),
      ],
    },
    broll_plan: {
      ...base.broll_plan,
      beats: [
        createBrollBeat(1, "Static concept explainer", {
          description: "Static concept explainer still image",
          motion_intent: "broll",
        }),
      ],
    },
  }, "script-1", "images_broll");

  const sameAnchorEntries = map.entries.filter((entry) => entry.anchor.target.toLowerCase() === "static concept explainer");
  assert.equal(sameAnchorEntries.length, 1);
  assert.equal(sameAnchorEntries[0]?.final_media_kind, "image");
});

test("hearthMediaMapBuilder: anchor normalization handles whitespace and case safely", () => {
  const deduped = dedupeVisualAssetsByAnchor([
    {
      id: "image-1",
      final_media_kind: "image",
      purpose: "coverage",
      anchor: { mode: "phrase_match", target: "  Lobbying   Pathway  " },
      timing: { in_offset_sec: 0, duration_sec: 6 },
      description: "concept still",
      intent: "visual_support",
      source: { status: "unresolved", asset_id: null },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: false,
      stale: false,
      created_at: "2026-05-03T00:00:00.000Z",
      updated_at: "2026-05-03T00:00:00.000Z",
    },
    {
      id: "broll-1",
      final_media_kind: "b_roll",
      purpose: "coverage",
      anchor: { mode: "phrase_match", target: "lobbying pathway" },
      timing: { in_offset_sec: 0, duration_sec: 6 },
      description: "action process motion",
      intent: "transition",
      source: { status: "unresolved", asset_id: null },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: false,
      stale: false,
      created_at: "2026-05-03T00:00:00.000Z",
      updated_at: "2026-05-03T00:00:00.000Z",
    },
  ]);

  assert.equal(deduped.length, 1);
});
