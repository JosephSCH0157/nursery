import assert from "node:assert/strict";
import test from "node:test";
import {
  applyProducerDirectionToMediaMap,
  buildMediaMapBeatCards,
  deriveMediaMapConversationFromScript,
  resolveMediaMapConversationScope,
  resolveMediaMapConversationSummary,
} from "../src/lib/hearth-media-map-conversation";
import type { EpisodeMediaMap } from "../src/lib/episode-package-v2";

function createMap(entries: EpisodeMediaMap["entries"]): EpisodeMediaMap {
  return {
    id: "media-map-1",
    workpiece_id: "episode-1",
    script_version_id: "3",
    status: "draft",
    version: 1,
    entries,
    generated_at: "2026-03-30T12:00:00.000Z",
  };
}

test("hearthMediaMapConversation: media-framing scripts lead with comparison", () => {
  const seed = deriveMediaMapConversationFromScript([
    "[s1]",
    "- Open with the idea that this is a media-framing comparison.",
    "- The same event looks different depending on which outlet is covering it.",
    "[/s1]",
  ].join("\n"));

  assert.equal(seed.derivedFromScript, true);
  assert.match(seed.lead, /media-framing episode/i);
  assert.equal(seed.directions[0]?.id, "comparison");
});

test("hearthMediaMapConversation: escalation-heavy full scripts surface escalation direction", () => {
  const seed = deriveMediaMapConversationFromScript(
    "The march stays peaceful until after dark, when tear gas, arrests, and a very different scene take over the coverage.",
  );

  assert.equal(seed.directions[0]?.id, "escalation");
  assert.match(seed.lead, /escalation story/i);
});

test("hearthMediaMapConversation: conversation scope reacts to lightweight constraints", () => {
  assert.equal(
    resolveMediaMapConversationScope({
      directionId: "comparison",
      constraintsText: "Keep it simple and only 2-3 generated clips.",
      fallbackScope: "full_media_plan",
    }),
    "images_only",
  );

  assert.equal(
    resolveMediaMapConversationScope({
      directionId: "contrast",
      constraintsText: "Heavier on B-roll than graphics.",
      fallbackScope: "images_only",
    }),
    "full_media_plan",
  );
});

test("hearthMediaMapConversation: producer direction shaping is deterministic and can trim simple plans", () => {
  const map = createMap([
    {
      id: "entry-image",
      final_media_kind: "image",
      purpose: "coverage",
      anchor: { mode: "phrase_match", target: "opening scene" },
      timing: { in_offset_sec: 0, duration_sec: 6 },
      description: "Opening protest wide shot",
      intent: "baseline",
      source: { status: "unresolved", asset_id: null },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: false,
      stale: false,
      created_at: "2026-03-30T12:00:00.000Z",
      updated_at: "2026-03-30T12:00:00.000Z",
    },
    {
      id: "entry-ref",
      final_media_kind: "contextual_data_composite",
      purpose: "explanation",
      anchor: { mode: "section_marker", target: "comparison" },
      timing: { in_offset_sec: 0, duration_sec: 6 },
      description: "Fox News versus USA Today framing board",
      intent: "comparison",
      source: { status: "unresolved", asset_id: null },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: false,
      stale: false,
      created_at: "2026-03-30T12:00:00.000Z",
      updated_at: "2026-03-30T12:00:00.000Z",
    },
    {
      id: "entry-broll",
      final_media_kind: "b_roll",
      purpose: "coverage",
      anchor: { mode: "phrase_match", target: "escalation footage" },
      timing: { in_offset_sec: 0, duration_sec: 5 },
      description: "Street confrontation footage",
      intent: "escalation",
      source: { status: "unresolved", asset_id: null },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: false,
      stale: false,
      created_at: "2026-03-30T12:00:00.000Z",
      updated_at: "2026-03-30T12:00:00.000Z",
    },
  ]);

  const next = applyProducerDirectionToMediaMap({
    map,
    directionId: "comparison",
    constraintsText: "Keep it simple and avoid branded visuals.",
  });

  assert.equal(next.entries[0]?.id, "entry-ref");
  assert.equal(next.entries.length, 3);
  assert.match(next.entries[0]?.description ?? "", /cable news outlet|national newspaper outlet/i);
  assert.equal(next.entries[0]?.anchor.mode, "section_marker");
  assert.equal(next.entries[1]?.anchor.mode, "phrase_match");
});

test("hearthMediaMapConversation: beat cards read like a producer-facing plan", () => {
  const cards = buildMediaMapBeatCards(createMap([{
    id: "entry-1",
    final_media_kind: "image",
    purpose: "coverage",
    anchor: { mode: "speaker_turn", target: "s1 beat 1" },
    beat_anchor: {
      mode: "bullet_beat",
      beat_id: "beat-1",
      speaker: "s1",
      beat_index: 1,
      beat_label: "Open with the broad protest image",
      cue_phrase: null,
      purpose: "coverage",
    },
    timing: { in_offset_sec: 0, duration_sec: 6 },
    description: "Open with neutral protest footage.",
    intent: "baseline",
    source: { status: "unresolved", asset_id: null },
    confidence: "medium",
    fulfillment_status: "planned",
    fulfillment_path: null,
    optional: false,
    critical: true,
    stale: false,
    created_at: "2026-03-30T12:00:00.000Z",
    updated_at: "2026-03-30T12:00:00.000Z",
  }]).entries);

  assert.equal(cards.length, 1);
  assert.match(cards[0]?.title ?? "", /s1/i);
  assert.match(cards[0]?.whyHere ?? "", /baseline/i);
  assert.match(cards[0]?.holdLabel ?? "", /5-6 seconds/i);
});

test("hearthMediaMapConversation: summaries can be inferred from the current map", () => {
  const summary = resolveMediaMapConversationSummary({
    entries: createMap([{
      id: "entry-1",
      final_media_kind: "contextual_data_composite",
      purpose: "explanation",
      anchor: { mode: "section_marker", target: "comparison" },
      timing: { in_offset_sec: 0, duration_sec: 6 },
      description: "Comparison board",
      intent: "compare framing",
      source: { status: "unresolved", asset_id: null },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: true,
      stale: false,
      created_at: "2026-03-30T12:00:00.000Z",
      updated_at: "2026-03-30T12:00:00.000Z",
    }]).entries,
  });

  assert.equal(summary?.directionLabel, "Comparison");
  assert.equal(summary?.constraintsLabel, "No extra constraints");
});
