import assert from "node:assert/strict";
import {
  buildHammerPreviewPlaybackSourceModel,
  resolveAudioPolishPreviewSrc,
  resolvePreviewMediaSrc,
} from "../src/lib/previewSource";
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
  const previewSrc = resolveAudioPolishPreviewSrc(
    {
      workspace_id: "ws_demo",
      local_root_abs: "D:\\ForgeMedia\\ws_demo",
    },
    {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound", "noise_cleanup", "level_consistency"],
      source_artifact_paths: ["recordings/episode014.wav"],
      settings_summary: {
        supported_source: true,
      },
      source_media_id: "media_local",
      source_media_signature: "sig_014",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-03-14T10:00:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/ws_demo/episode014--abcd.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 8_000,
      failure_code: null,
      failure_reason: null,
      audio_edit: null,
    },
  );

  assert.equal(
    previewSrc,
    "/api/hammer/dev-media?local_root_abs=D%3A%5CForgeMedia%5Cws_demo&local_relpath=hammer%2Fprep%2Faudio-polish%2Fws_demo%2Fepisode014--abcd.wav",
  );
}

{
  const model = buildHammerPreviewPlaybackSourceModel({
    playbackSrc: "/api/hammer/dev-media?polished=1",
    resolvedMediaSrc: "/api/hammer/dev-media?polished=1",
    polishedMediaSrc: "/api/hammer/dev-media?polished=1",
    activeMediaRequiresResolution: true,
    activeMediaDisplayTitle: "One_Weird_Thing_Bus_Drivers_Notice_2026-03-18_15-02-23.webm",
  });

  assert.equal(model.sourceKind, "polished");
  assert.equal(model.sourceLabel, "polished prep");
  assert.equal(model.truthLabel, "Polished prep");
  assert.equal(model.statusLabel, "Polished prep connected");
  assert.equal(model.displayTitle, "Polished prep");
}

{
  const model = buildHammerPreviewPlaybackSourceModel({
    playbackSrc: "/api/hammer/dev-media?launch=1",
    resolvedMediaSrc: "/api/hammer/dev-media?launch=1",
    polishedMediaSrc: null,
    activeMediaRequiresResolution: true,
    activeMediaDisplayTitle: "One_Weird_Thing_Bus_Drivers_Notice_2026-03-18_15-02-23.webm",
  });

  assert.equal(model.sourceKind, "launch");
  assert.equal(model.sourceLabel, "One_Weird_Thing_Bus_Drivers_Notice_2026-03-18_15-02-23.webm");
  assert.equal(model.truthLabel, "Launch media");
  assert.equal(model.statusLabel, "Mapped media connected");
  assert.equal(model.displayTitle, "One_Weird_Thing_Bus_Drivers_Notice_2026-03-18_15-02-23.webm");
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


