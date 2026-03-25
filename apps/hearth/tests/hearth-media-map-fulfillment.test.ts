import assert from "node:assert/strict";
import test from "node:test";
import {
  activateEpisodeMediaMapForFulfillment,
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

test("activateEpisodeMediaMapForFulfillment finalizes map and routes by final media kind", () => {
  const activated = activateEpisodeMediaMapForFulfillment(createFixtureMap());
  assert.equal(activated.status, "activated");
  assert.ok(activated.version > 1);
  const image = activated.entries.find((entry) => entry.id === "mm-1");
  const broll = activated.entries.find((entry) => entry.id === "mm-2");
  assert.equal(image?.fulfillment_path, "image");
  assert.equal(image?.fulfillment_status, "queued");
  assert.equal(broll?.fulfillment_path, "motion_broll");
  assert.equal(broll?.fulfillment_status, "resolved");
});
