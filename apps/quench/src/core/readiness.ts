import type { ResolvedReleaseAssets } from "./asset-resolver";
import type {
  QuenchPlatform,
  ReleasePacket,
} from "./release-packet.types";
import { isBlank } from "./release-packet.types";

export type ReleaseReadinessCheckKey =
  | "workspace_id"
  | "workpiece_id"
  | "episode_id"
  | "title"
  | "description"
  | "thumbnail"
  | "video_export"
  | "audio_export"
  | "rss_public_audio";

export interface ReleaseReadinessError {
  code: string;
  message: string;
  platform?: QuenchPlatform;
}

export interface ReleaseReadinessResult {
  ready: boolean;
  checks: Record<ReleaseReadinessCheckKey, boolean>;
  missing_requirements: ReleaseReadinessCheckKey[];
  errors: ReleaseReadinessError[];
}

function hasAccessibleAsset(
  assetId: string | null,
  asset: ResolvedReleaseAssets[keyof ResolvedReleaseAssets] | null | undefined,
): boolean {
  if (!assetId) return false;
  if (Array.isArray(asset)) {
    return asset.length > 0 && asset.every((entry) => entry.accessible);
  }
  return asset == null ? true : asset.accessible;
}

function hasPublicAudio(audio: ResolvedReleaseAssets["audio"]): boolean {
  return Boolean(audio?.accessible && audio.public_url);
}

export function validateReleasePacketReadiness(
  packet: ReleasePacket,
  assets: Partial<ResolvedReleaseAssets> = {},
  selectedPlatforms: QuenchPlatform[] = [],
): ReleaseReadinessResult {
  const checks: Record<ReleaseReadinessCheckKey, boolean> = {
    workspace_id: !isBlank(packet.workspace_id),
    workpiece_id: !isBlank(packet.workpiece_id),
    episode_id: !isBlank(packet.episode_id),
    title: !isBlank(packet.title),
    description: !isBlank(packet.description),
    thumbnail: hasAccessibleAsset(packet.thumbnail_asset_id, assets.thumbnail),
    video_export: hasAccessibleAsset(packet.video_export_id, assets.video),
    audio_export: hasAccessibleAsset(packet.audio_export_id, assets.audio),
    rss_public_audio: !selectedPlatforms.includes("rss") || hasPublicAudio(assets.audio ?? null),
  };

  const errors: ReleaseReadinessError[] = [];

  if (!checks.thumbnail) {
    errors.push({
      code: "THUMBNAIL_MISSING",
      message: "No resolvable thumbnail asset is available for this release packet.",
    });
  }

  if (selectedPlatforms.some((platform) => platform === "youtube" || platform === "rumble") && !checks.video_export) {
    errors.push({
      code: "VIDEO_EXPORT_MISSING",
      message: "Video platforms require a resolvable video export.",
    });
  }

  if (selectedPlatforms.some((platform) => platform === "spotify" || platform === "rss") && !checks.audio_export) {
    errors.push({
      code: "AUDIO_EXPORT_MISSING",
      message: "Audio distribution requires a resolvable audio export.",
    });
  }

  if (selectedPlatforms.includes("rss") && !checks.rss_public_audio) {
    errors.push({
      code: "RSS_PUBLIC_AUDIO_REQUIRED",
      message: "RSS publication requires a publicly reachable audio URL.",
      platform: "rss",
    });
  }

  const missingRequirements = (Object.keys(checks) as ReleaseReadinessCheckKey[])
    .filter((key) => !checks[key]);

  return {
    ready: missingRequirements.length === 0 && errors.length === 0,
    checks,
    missing_requirements: missingRequirements,
    errors,
  };
}
