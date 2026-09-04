import assert from "node:assert/strict";
import {
  canExecuteQuenchPublish,
  executeQuenchPublishIfReady,
} from "../src/core/publish-guard";
import { TransistorAdapter } from "../src/adapters/transistor/transistor.adapter";
import { YouTubeAdapter } from "../src/adapters/youtube/youtube.adapter";
import type { PublishContext } from "../src/adapters/adapter.contract";
import type { ReleasePacket } from "../src/core/release-packet.types";

async function run() {
  const matrix = [
    ["ready", true, true],
    ["ready", false, false],
    ["needs_review", true, false],
    ["needs_review", false, false],
    ["blocked", true, false],
    ["blocked", false, false],
  ] as const;
  for (const [status, ready, expected] of matrix) {
    assert.equal(canExecuteQuenchPublish({ status, ready }), expected, `${status}/${ready}`);
    assert.equal(canExecuteQuenchPublish({ status, ready_for_quench: ready }), expected, `${status}/${ready}/handoff`);
  }
  assert.equal(canExecuteQuenchPublish({ status: "ready" }), false);
  assert.equal(canExecuteQuenchPublish({ status: "ready", ready: true, ready_for_quench: false }), false);
  assert.equal(canExecuteQuenchPublish({ status: "ready", ready: false, ready_for_quench: true }), false);
  assert.equal(canExecuteQuenchPublish(null), false);

  let calls = 0;
  const blocked = await executeQuenchPublishIfReady(
    { status: "blocked", ready: false },
    async () => { calls += 1; return "published"; },
  );
  assert.deepEqual(blocked, { executed: false });
  assert.equal(calls, 0, "blocked readiness must never enter adapter execution");

  const ready = await executeQuenchPublishIfReady(
    { status: "ready", ready: true },
    async () => { calls += 1; return "published"; },
  );
  assert.deepEqual(ready, { executed: true, value: "published" });
  assert.equal(calls, 1);

  const packet: ReleasePacket = {
    release_packet_id: "packet",
    workspace_id: "workspace",
    workpiece_id: "workpiece",
    episode_id: "episode",
    title: "Title",
    description: "Description",
    tags: [],
    thumbnail_asset_id: "thumbnail",
    video_export_id: "video",
    audio_export_id: "audio",
    shorts: [],
    asset_source: "cloud",
    rss_ready: true,
    platform_overrides: {},
  };
  const blockedContext: PublishContext = {
    run_mode: "stub",
    now_iso: "2026-07-13T00:00:00.000Z",
    readiness: { status: "blocked", ready: false },
    resolved_assets: {
      video: { asset_id: "video", kind: "video", source: "cloud", uri: "video", accessible: true },
      audio: { asset_id: "audio", kind: "audio", source: "cloud", uri: "audio", accessible: true, public_url: "https://example.test/audio" },
      thumbnail: { asset_id: "thumbnail", kind: "thumbnail", source: "cloud", uri: "thumbnail", accessible: true },
    },
  };
  for (const adapter of [new YouTubeAdapter(), new TransistorAdapter("show_01")]) {
    const denied = await adapter.publish(packet, { enabled: true, mode: "publish" }, blockedContext);
    assert.equal(denied.ok, false, `${adapter.platform} publish must fail closed`);
    assert.match(denied.message, /authority denied/i);
    const retryDenied = await adapter.retry(denied.receipt, blockedContext);
    assert.equal(retryDenied.ok, false, `${adapter.platform} retry must fail closed`);
    assert.match(retryDenied.message, /authority denied/i);
  }
  console.log("Quench publish authority guard tests passed.");
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
