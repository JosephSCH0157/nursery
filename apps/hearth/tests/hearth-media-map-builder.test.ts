import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyEpisodePackageV2,
  type EpisodeImageMapEntry,
} from "../src/lib/episode-package-v2";
import { buildMediaMapFromExistingPlans } from "../src/lib/hearth-media-map-builder";

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
