import type { HammerRenderJobV1 } from "./hammerRenderJobV1";

export type HammerReleasePacketV2 = Readonly<{
  schema_version: 2;
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  render_job_id: string;
  render_plan_version: string;
  render_plan_fingerprint: string;
  renderer_version: string;
  output_profile_id: string;
  acknowledged_result_fingerprint: string;
  video_master_asset_id: string;
  audio_master_asset_id: string;
  caption_asset_ids: readonly string[];
  transcript_asset_id: string;
  thumbnail_asset_id: string;
  render_manifest_asset_id: string;
  source_fingerprints: Readonly<Record<string, string>>;
  validated_for_quench: true;
}>;

export function buildHammerReleasePacketV2(args: {
  job: HammerRenderJobV1;
  thumbnailAssetId?: string;
}): HammerReleasePacketV2 {
  if (args.job.status !== "acknowledged") throw new Error("render_job_not_acknowledged");
  const find = (kind: HammerRenderJobV1["result_artifacts"][number]["kind"]) => args.job.result_artifacts.filter((row) => row.kind === kind);
  const video = find("video_master")[0];
  const audio = find("audio_master")[0];
  const transcript = find("transcript")[0];
  const thumbnail = find("thumbnail_reference")[0];
  const manifest = find("render_manifest")[0];
  const thumbnailAssetId = thumbnail?.asset_id ?? args.thumbnailAssetId ?? "";
  if (!video || !audio || !transcript || !thumbnailAssetId.trim() || !manifest || !args.job.acknowledged_result_fingerprint) throw new Error("release_packet_incomplete");
  return Object.freeze({
    schema_version: 2,
    workspace_id: args.job.workspace_id,
    workpiece_id: args.job.workpiece_id,
    recording_revision_id: args.job.recording_revision_id,
    composition_revision: args.job.composition_revision,
    composition_fingerprint: args.job.composition_fingerprint,
    render_job_id: args.job.job_id,
    render_plan_version: args.job.render_plan_version,
    render_plan_fingerprint: args.job.render_plan_fingerprint,
    renderer_version: args.job.renderer_version,
    output_profile_id: args.job.output_profile.profile_id,
    acknowledged_result_fingerprint: args.job.acknowledged_result_fingerprint,
    video_master_asset_id: video.asset_id,
    audio_master_asset_id: audio.asset_id,
    caption_asset_ids: find("caption").map((row) => row.asset_id),
    transcript_asset_id: transcript.asset_id,
    thumbnail_asset_id: thumbnailAssetId,
    render_manifest_asset_id: manifest.asset_id,
    source_fingerprints: args.job.source_fingerprints,
    validated_for_quench: true,
  });
}

export type HammerReleasePacketReceiverContext = Readonly<{
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  render_plan_fingerprint: string;
  source_fingerprints: Readonly<Record<string, string>>;
  authorized_asset_ids: ReadonlySet<string>;
}>;

export function validateHammerReleasePacketV2ForQuench(
  packet: HammerReleasePacketV2,
  context: HammerReleasePacketReceiverContext,
): Readonly<{ accepted: true } | { accepted: false; reason: string }> {
  if (packet.workspace_id !== context.workspace_id || packet.workpiece_id !== context.workpiece_id || packet.recording_revision_id !== context.recording_revision_id) {
    return Object.freeze({ accepted: false, reason: "release_packet_identity_mismatch" });
  }
  if (packet.composition_revision !== context.composition_revision || packet.composition_fingerprint !== context.composition_fingerprint) {
    return Object.freeze({ accepted: false, reason: "release_packet_stale" });
  }
  if (packet.render_plan_fingerprint !== context.render_plan_fingerprint) {
    return Object.freeze({ accepted: false, reason: "release_packet_render_plan_mismatch" });
  }
  const expectedSources = Object.entries(context.source_fingerprints);
  if (expectedSources.length !== Object.keys(packet.source_fingerprints).length
    || expectedSources.some(([id, fingerprint]) => packet.source_fingerprints[id] !== fingerprint)) {
    return Object.freeze({ accepted: false, reason: "release_packet_source_mismatch" });
  }
  const assets = [
    packet.video_master_asset_id,
    packet.audio_master_asset_id,
    ...packet.caption_asset_ids,
    packet.transcript_asset_id,
    packet.thumbnail_asset_id,
    packet.render_manifest_asset_id,
  ];
  if (assets.some((assetId) => !context.authorized_asset_ids.has(assetId))) {
    return Object.freeze({ accepted: false, reason: "release_packet_artifact_unauthorized" });
  }
  return Object.freeze({ accepted: true });
}
