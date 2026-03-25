import assert from "node:assert/strict";
import test from "node:test";
import {
  approveEpisodeMediaMap,
  distributeEpisodeMediaMapForFulfillment,
} from "../src/lib/hearth-media-map-fulfillment";
import type { EpisodeMediaMap } from "../src/lib/episode-package-v2";

function createFixtureMap(): EpisodeMediaMap {
  const now = new Date().toISOString();
  return {
    id: "media-map-v1",
    workpiece_id: "workpiece-1",
    script_version_id: "12",
    status: "review",
    version: 1,
    generated_at: now,
    entries: [
      {
        id: "mm-1",
        final_media_kind: "image",
        anchor: { mode: "phrase_match", target: "City skyline at sunset" },
        timing: { in_offset_sec: 0, duration_sec: 6 },
        description: "Skyline still",
        intent: "establish_context",
        source: { status: "unresolved", asset_id: null },
        confidence: "medium",
        fulfillment_status: "planned",
        fulfillment_path: null,
        optional: false,
        critical: true,
        stale: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: "mm-2",
        final_media_kind: "b_roll",
        anchor: { mode: "phrase_match", target: "Factory conveyor belt" },
        timing: { in_offset_sec: 0, duration_sec: 5 },
        description: "Factory motion",
        intent: "explanatory",
        source: { status: "selected", asset_id: "asset-xyz" },
        confidence: "high",
        fulfillment_status: "approved",
        fulfillment_path: null,
        optional: false,
        critical: false,
        stale: false,
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

test("approveEpisodeMediaMap marks map authoritative and beat statuses approved", () => {
  const approved = approveEpisodeMediaMap(createFixtureMap());
  assert.equal(approved.status, "approved");
  assert.ok(approved.version > 1);
  assert.equal(approved.entries[0]?.fulfillment_status, "approved");
  assert.equal(approved.entries[1]?.fulfillment_status, "approved");
});

test("distributeEpisodeMediaMapForFulfillment routes by final media kind", () => {
  const approved = approveEpisodeMediaMap(createFixtureMap());
  const distributed = distributeEpisodeMediaMapForFulfillment(approved);

  assert.equal(distributed.status, "fulfilling");
  const image = distributed.entries.find((entry) => entry.id === "mm-1");
  const broll = distributed.entries.find((entry) => entry.id === "mm-2");
  assert.equal(image?.fulfillment_path, "image");
  assert.equal(image?.fulfillment_status, "queued");
  assert.equal(broll?.fulfillment_path, "motion_broll");
  assert.equal(broll?.fulfillment_status, "resolved");
});
