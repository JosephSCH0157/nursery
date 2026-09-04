import assert from "node:assert/strict";
import { deriveReleasePacketReadinessVerdict } from "../src/core/readiness";
import type { ReleasePacket } from "../src/core/release-packet.types";

const basePacket: ReleasePacket = {
  release_packet_id: "rp_01",
  workspace_id: "ws_01",
  workpiece_id: "wp_01",
  episode_id: "ep_01",
  title: "Ready packet",
  description: "Release description",
  tags: [],
  thumbnail_asset_id: "thumb_01",
  video_export_id: "video_01",
  audio_export_id: "audio_01",
  shorts: [],
  asset_source: "cloud",
  rss_ready: true,
  platform_overrides: {},
};

function testReadyVerdict() {
  const verdict = deriveReleasePacketReadinessVerdict(basePacket, {
    thumbnail: {
      asset_id: "thumb_01",
      kind: "thumbnail",
      source: "cloud",
      uri: "thumb://01",
      accessible: true,
    },
    video: {
      asset_id: "video_01",
      kind: "video",
      source: "cloud",
      uri: "video://01",
      accessible: true,
    },
    audio: {
      asset_id: "audio_01",
      kind: "audio",
      source: "cloud",
      uri: "audio://01",
      public_url: "https://cdn.example/audio.mp3",
      accessible: true,
    },
    shorts: [],
  }, ["youtube", "podcast_host"]);

  assert.equal(verdict.status, "ready");
  assert.deepEqual(verdict.reason_codes, []);
}

function testBlockedVerdict() {
  const verdict = deriveReleasePacketReadinessVerdict({
    ...basePacket,
    thumbnail_asset_id: null,
    audio_export_id: null,
  }, {
    thumbnail: null,
    video: {
      asset_id: "video_01",
      kind: "video",
      source: "cloud",
      uri: "video://01",
      accessible: true,
    },
    audio: null,
    shorts: [],
  }, ["youtube", "podcast_host"]);

  assert.equal(verdict.status, "blocked");
  assert.equal(verdict.reason_codes.includes("quench_thumbnail_missing"), true);
  assert.equal(verdict.reason_codes.includes("quench_audio_export_missing"), true);
}

testReadyVerdict();
testBlockedVerdict();

console.log("Quench release readiness verdict tests passed.");
