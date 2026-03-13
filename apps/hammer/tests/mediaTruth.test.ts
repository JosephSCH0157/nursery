import assert from "node:assert/strict";
import { resolvePreviewMediaSrc } from "../src/lib/previewSource";
import { V1HammerMediaResolver } from "../src/media/resolveMedia";

{
  const previewSrc = resolvePreviewMediaSrc({
    resolveResult: {
      status: "unresolved",
      media_id: "media_missing",
      kind: "recording_video",
      reason: "MISSING_LOCAL_FILE",
      user_message: "Media file is missing from the mapped local workspace folder.",
      next_action: "RELINK_MEDIA",
    },
    mediaRef: {
      media_id: "media_missing",
      kind: "recording_video",
      local_relpath: "recordings/missing.mp4",
    },
    workspaceMapping: {
      workspace_id: "ws_demo",
      local_root_abs: "D:\\ForgeMedia\\ws_demo",
    },
    devPlaybackUrl: "/api/hammer/dev-media?local_root_abs=D%3A%5CForgeMedia%5Cws_demo&local_relpath=recordings%2Fmissing.mp4",
  });

  assert.equal(previewSrc, null);
}

{
  const previewSrc = resolvePreviewMediaSrc({
    resolveResult: {
      status: "ok",
      media_id: "media_local",
      kind: "recording_video",
      playable_uri: "D:\\ForgeMedia\\ws_demo\\recordings\\episode014.mp4",
    },
    mediaRef: {
      media_id: "media_local",
      kind: "recording_video",
      local_relpath: "recordings/episode014.mp4",
    },
    workspaceMapping: {
      workspace_id: "ws_demo",
      local_root_abs: "D:\\ForgeMedia\\ws_demo",
    },
  });

  assert.equal(
    previewSrc,
    "/api/hammer/dev-media?local_root_abs=D%3A%5CForgeMedia%5Cws_demo&local_relpath=recordings%2Fepisode014.mp4",
  );
}

{
  const resolver = new V1HammerMediaResolver();
  const result = await resolver.resolveMedia(null, {
    media_id: "media_cloud_only",
    kind: "recording_video",
    cloud_uri: "tongs://media/ws_demo/recordings/remote-guest-9.mp4",
  });

  assert.equal(result.status, "unresolved");
  assert.equal(result.reason, "CLOUD_DISABLED");
  assert.equal(result.next_action, "ENABLE_CLOUD_MEDIA");
}

{
  const resolver = new V1HammerMediaResolver();
  const result = await resolver.resolveMedia(null, {
    media_id: "media_local_only",
    kind: "recording_video",
    local_relpath: "recordings/episode014.mp4",
  });

  assert.equal(result.status, "unresolved");
  assert.equal(result.reason, "NO_WORKSPACE_MAPPING");
  assert.equal(result.next_action, "OPEN_WORKSPACE_SETTINGS");
}

console.log("Hammer media truth tests passed.");
