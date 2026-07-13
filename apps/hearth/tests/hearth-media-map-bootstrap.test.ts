import assert from "node:assert/strict";
import test from "node:test";
import { resolveImageMapEntriesForMediaMapBootstrap } from "../src/lib/hearth-media-map-bootstrap";
import type { EpisodeImageMapEntry } from "../src/lib/episode-package-v2";

test("hearthMediaMapBootstrap: bullet scripts seed timeline image beats when image map is empty", () => {
  const result = resolveImageMapEntriesForMediaMapBootstrap({
    currentEntries: [],
    currentSpokenBeats: [],
    scriptText: [
      "[s1]",
      "- Open with the basic fact: the No Kings protests hit multiple cities, but the story changes depending on which outlet is showing it.",
      "- Frame the episode around one clean idea: this isn't just a protest recap, it's a media-framing comparison.",
      "[/s1]",
      "",
      "[s2]",
      "- Shift to USA Today for the raw street-level footage.",
      "- Keep the focus on atmosphere: chanting, confrontation, volatility, and the messy energy of the crowd.",
      "[/s2]",
    ].join("\n"),
  });

  assert.equal(result.seededFromScript, true);
  assert.equal(result.anchorMode, "bullet_beat");
  assert.ok(result.entries.length > 0);
  assert.ok(result.spokenBeats.length > 0);
  assert.ok(result.entries.every((entry) => entry.beat_anchor?.speaker === "s1" || entry.beat_anchor?.speaker === "s2"));
  assert.ok(result.entries.every((entry) => entry.script_anchor == null));
});

test("hearthMediaMapBootstrap: existing image-map entries are reused as-is", () => {
  const existingEntries: EpisodeImageMapEntry[] = [{
    id: "image-map-01",
    anchor: "Opening skyline",
    anchor_scope: "attached",
    script_anchor: {
      section_id: "s1",
      paragraph_id: "s1:p1",
      paragraph_order: 1,
      sentence_start: 1,
      sentence_end: 1,
      char_start: 0,
      char_end: 15,
      span_text: "Opening skyline",
      speaker_block_id: "s1",
    },
    purpose: "coverage",
    description: "Opening skyline",
    visual_intent: "Opening skyline",
    prompt_basis: "Opening skyline",
    style_preset: "cinematic_realism",
    intent: "cutaway",
    source_type: "stock",
    visual_priority: "supporting",
    visual_type: "still_image",
    section_intent_note: null,
    beat_order: 1,
    paragraph_beat_order: 1,
    candidate_assets: [],
    selected_asset_id: null,
    status: "mapped",
    placement_hint: null,
  }];

  const result = resolveImageMapEntriesForMediaMapBootstrap({
    currentEntries: existingEntries,
    currentSpokenBeats: [],
    scriptText: "[s1]\n- Replacement bullet\n[/s1]",
  });

  assert.equal(result.seededFromScript, false);
  assert.equal(result.anchorMode, "script_text");
  assert.deepEqual(result.entries, existingEntries);
});

test("hearthMediaMapBootstrap: bullet script visual seeding caps selected beats", () => {
  const bulletLines = Array.from({ length: 30 }, (_, index) => (
    `- Beat ${index + 1}: compare the sourced claim, document, statistic, or example so the visual map has a ranked candidate.`
  ));

  const result = resolveImageMapEntriesForMediaMapBootstrap({
    currentEntries: [],
    currentSpokenBeats: [],
    scriptText: ["[s1]", ...bulletLines, "[/s1]"].join("\n"),
  });

  assert.equal(result.seededFromScript, true);
  assert.equal(result.spokenBeats.length, 30);
  assert.equal(result.entries.length, 18);
  assert.ok(result.entries.every((entry) => entry.beat_anchor?.mode === "bullet_beat"));
});
