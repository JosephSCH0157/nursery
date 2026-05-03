import assert from "node:assert/strict";
import test from "node:test";
import { resolveReferenceClipPlanForMediaMapBootstrap } from "../src/lib/hearth-reference-clip-bootstrap";
import type {
  EpisodeContextualDataCompositePlan,
  EpisodeImageMapEntry,
} from "../src/lib/episode-package-v2";

test("hearthReferenceClipBootstrap: rejects explanatory image beats without an evidence source", () => {
  const imageMapEntries: EpisodeImageMapEntry[] = [
    {
      id: "image-map-1",
      anchor: "Permit timeline gap",
      anchor_scope: "attached",
      script_anchor: null,
      beat_anchor: {
        mode: "bullet_beat",
        beat_id: "beat-1",
        speaker: "s1",
        beat_index: 2,
        beat_label: "permit timeline gap",
        cue_phrase: null,
        purpose: "explanation",
      },
      purpose: "explanation",
      description: "Show the permit timeline the headline skipped.",
      visual_intent: "Permit timeline explainer",
      prompt_basis: "permit dates, march route, enforcement shift",
      style_preset: "documentary_cinematic",
      intent: "graphic",
      source_type: "stock",
      visual_priority: "primary",
      visual_type: "diagram",
      section_intent_note: "Use this when explaining the permit timeline gap.",
      beat_order: 2,
      paragraph_beat_order: 1,
      candidate_assets: [],
      selected_asset_id: null,
      status: "mapped",
      placement_hint: "exact_timestamp",
    },
  ];

  const result = resolveReferenceClipPlanForMediaMapBootstrap({
    workpieceId: "workpiece-1",
    currentEntries: [],
    imageMapEntries,
  });

  assert.equal(result.seededFromImageMap, false);
  assert.equal(result.entries.length, 0);
});

test("hearthReferenceClipBootstrap: seeds structured reference clips only from sourced evidence beats", () => {
  const imageMapEntries: EpisodeImageMapEntry[] = [
    {
      id: "image-map-1",
      anchor: "Lobbying spend over time",
      anchor_scope: "attached",
      script_anchor: null,
      beat_anchor: {
        mode: "bullet_beat",
        beat_id: "beat-1",
        speaker: "s1",
        beat_index: 2,
        beat_label: "lobbying spend over time",
        cue_phrase: null,
        purpose: "explanation",
      },
      purpose: "explanation",
      description: "Source: OpenSecrets. Show lobbying spend over time from 2000-2024.",
      visual_intent: "OpenSecrets lobbying spend trend graph",
      prompt_basis: "OpenSecrets lobbying spending trend 2000-2024",
      style_preset: "documentary_cinematic",
      intent: "graphic",
      source_type: "stock",
      visual_priority: "primary",
      visual_type: "diagram",
      section_intent_note: "Highlight the post-2010 growth spike.",
      beat_order: 2,
      paragraph_beat_order: 1,
      candidate_assets: [],
      selected_asset_id: null,
      status: "mapped",
      placement_hint: "exact_timestamp",
    },
  ];

  const result = resolveReferenceClipPlanForMediaMapBootstrap({
    workpieceId: "workpiece-1",
    currentEntries: [],
    imageMapEntries,
  });

  assert.equal(result.seededFromImageMap, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.anchor_text, "Lobbying spend over time");
  assert.equal(result.entries[0]?.description, "Source: OpenSecrets. Show lobbying spend over time from 2000-2024.");
  assert.equal(result.entries[0]?.placement_hint, "exact_timestamp");
  assert.equal(result.entries[0]?.purpose, "explanation");
  assert.equal(result.entries[0]?.visual_style, "documentary_cinematic");
  assert.equal(result.entries[0]?.source, "OpenSecrets");
  assert.equal(result.entries[0]?.subtype, "timeline");
  assert.match(result.entries[0]?.context ?? "", /2000-2024/i);
  assert.match(result.entries[0]?.highlight ?? "", /post-2010/i);
  assert.match(result.entries[0]?.visual_spec ?? "", /OpenSecrets/i);
});

test("hearthReferenceClipBootstrap: preserves existing reference clips", () => {
  const existingEntries: EpisodeContextualDataCompositePlan[] = [
    {
      id: "cdc-1",
      workpiece_id: "workpiece-1",
      media_type: "contextual_data_composite",
      anchor_text: "Existing reference clip",
      placement_hint: "first_occurrence",
      timestamp_ms: null,
      purpose: "explanation",
      format: "still",
      data_type: "quantitative",
      context_type: "historical",
      tone: "neutral",
      motion_level: "static",
      description: "Existing description",
      background_context_description: "",
      foreground_data_description: "",
      visual_style: null,
      chart_type: "line",
      title: null,
      labels: [],
      values: [],
      emphasis_key: null,
      candidate_assets: [],
      external_request: {
        state: "planned",
        updated_at: "2026-03-30T00:00:00.000Z",
      },
      selected_asset_id: null,
      source_type: "planned",
      origin: "hearth",
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-03-30T00:00:00.000Z",
    },
  ];

  const result = resolveReferenceClipPlanForMediaMapBootstrap({
    workpieceId: "workpiece-1",
    currentEntries: existingEntries,
    imageMapEntries: [],
  });

  assert.equal(result.seededFromImageMap, false);
  assert.deepEqual(result.entries, existingEntries);
});
