import assert from "node:assert/strict";
import test from "node:test";
import {
  syncImageMapEntryFromMediaMapEntry,
  syncMediaMapImageEntriesFromImageMap,
} from "../src/lib/hearth-media-map-sync";
import type {
  EpisodeImageMapEntry,
  EpisodeImageMapScriptAnchor,
  EpisodeMediaMap,
  EpisodeMediaMapEntry,
} from "../src/lib/episode-package-v2";

function createScriptAnchor(): EpisodeImageMapScriptAnchor {
  return {
    section_id: "s1",
    paragraph_id: "s1:p1",
    paragraph_order: 1,
    sentence_start: 1,
    sentence_end: 1,
    char_start: 0,
    char_end: 24,
    span_text: "Matched exact script span",
    speaker_block_id: null,
  };
}

function createImageEntry(overrides: Partial<EpisodeImageMapEntry> = {}): EpisodeImageMapEntry {
  return {
    id: "image-1",
    anchor: "Matched exact script span",
    script_anchor: createScriptAnchor(),
    beat_anchor: null,
    anchor_scope: "attached",
    purpose: "coverage",
    description: "Original description",
    visual_intent: "Original description",
    prompt_basis: "Original description",
    style_preset: null,
    intent: "cutaway",
    source_type: "stock",
    origin: "hearth",
    visual_priority: "primary",
    visual_type: "still_image",
    section_intent_note: null,
    beat_order: 1,
    paragraph_beat_order: 1,
    candidate_assets: [],
    selected_asset_id: null,
    status: "mapped",
    placement_hint: "exact_timestamp",
    ...overrides,
  };
}

function createMediaEntry(overrides: Partial<EpisodeMediaMapEntry> = {}): EpisodeMediaMapEntry {
  const nowIso = "2026-03-31T12:00:00.000Z";
  return {
    id: "mm_imap_image-1",
    final_media_kind: "image",
    purpose: "coverage",
    anchor: {
      mode: "phrase_match",
      target: "Matched exact script span",
    },
    beat_anchor: null,
    timing: {
      in_offset_sec: 0,
      duration_sec: 6,
    },
    description: "Updated description",
    intent: "cutaway",
    source: {
      status: "unresolved",
      asset_id: null,
    },
    confidence: "medium",
    fulfillment_status: "planned",
    fulfillment_path: null,
    optional: false,
    critical: false,
    stale: false,
    created_at: nowIso,
    updated_at: nowIso,
    ...overrides,
  };
}

test("syncMediaMapImageEntriesFromImageMap refreshes derived entries and flags activated maps for reapply", () => {
  const nowIso = "2026-03-31T12:30:00.000Z";
  const mediaMap: EpisodeMediaMap = {
    id: "media-map-1",
    workpiece_id: "workpiece-1",
    script_version_id: "22",
    status: "activated",
    version: 4,
    generated_at: "2026-03-31T10:00:00.000Z",
    entries: [
      createMediaEntry({
        description: "Outdated image beat",
        created_at: "2026-03-31T10:00:00.000Z",
        updated_at: "2026-03-31T10:00:00.000Z",
      }),
      {
        ...createMediaEntry({
          id: "mm_broll_b1",
          final_media_kind: "b_roll",
          description: "Keep this b-roll beat",
        }),
      },
    ],
  };

  const synced = syncMediaMapImageEntriesFromImageMap({
    mediaMap,
    imageEntries: [
      createImageEntry({
        description: "Fresh image beat from visuals fine tune",
        visual_intent: "Fresh image beat from visuals fine tune",
        prompt_basis: "Fresh image beat from visuals fine tune",
        visual_priority: "optional",
      }),
    ],
    nowIso,
  });

  const syncedImage = synced.entries.find((entry) => entry.id === "mm_imap_image-1");
  const syncedBroll = synced.entries.find((entry) => entry.id === "mm_broll_b1");

  assert.equal(synced.status, "needs_attention");
  assert.equal(synced.generated_at, nowIso);
  assert.equal(syncedImage?.description, "Fresh image beat from visuals fine tune");
  assert.equal(syncedImage?.critical, false);
  assert.equal(syncedImage?.optional, true);
  assert.equal(syncedImage?.stale, true);
  assert.equal(syncedBroll?.description, "Keep this b-roll beat");
});

test("syncImageMapEntryFromMediaMapEntry carries fine-tuned global image settings back into the image map", () => {
  const synced = syncImageMapEntryFromMediaMapEntry({
    mediaEntry: createMediaEntry({
      anchor: {
        mode: "section_marker",
        target: "Act 2 visual reset",
      },
      description: "Global explainer beat",
      intent: "graphic",
      optional: true,
      critical: false,
    }),
    existingEntry: createImageEntry(),
    beatOrder: 3,
  });

  assert.equal(synced.anchor_scope, "global");
  assert.equal(synced.script_anchor, null);
  assert.equal(synced.beat_anchor, null);
  assert.equal(synced.section_intent_note, "Act 2 visual reset");
  assert.equal(synced.visual_priority, "optional");
  assert.equal(synced.status, "draft");
  assert.equal(synced.placement_hint, null);
  assert.equal(synced.description, "Global explainer beat");
});

test("syncImageMapEntryFromMediaMapEntry preserves structured anchors when the media-map beat keeps the same phrase match", () => {
  const synced = syncImageMapEntryFromMediaMapEntry({
    mediaEntry: createMediaEntry(),
    existingEntry: createImageEntry({
      placement_hint: null,
    }),
    beatOrder: 1,
  });

  assert.equal(synced.anchor_scope, "attached");
  assert.deepEqual(synced.script_anchor, createScriptAnchor());
  assert.equal(synced.status, "mapped");
  assert.equal(synced.visual_priority, "primary");
});
