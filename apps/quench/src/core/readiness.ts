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

export type QuenchReleaseReadinessVerdictStatus = "ready" | "needs_review" | "blocked";

export type QuenchReleaseReadinessReasonCode =
  | "quench_workspace_id_missing"
  | "quench_workpiece_id_missing"
  | "quench_episode_id_missing"
  | "quench_title_missing"
  | "quench_description_missing"
  | "quench_thumbnail_missing"
  | "quench_video_export_missing"
  | "quench_audio_export_missing"
  | "quench_rss_public_audio_required";

export interface QuenchReleaseReadinessReason {
  code: QuenchReleaseReadinessReasonCode;
  label: string;
  severity: "blocking" | "review";
  source: "quench";
  platform?: QuenchPlatform;
}

export interface QuenchReleaseReadinessVerdict {
  status: QuenchReleaseReadinessVerdictStatus;
  ready: boolean;
  checks: Record<ReleaseReadinessCheckKey, boolean>;
  missing_requirements: ReleaseReadinessCheckKey[];
  errors: ReleaseReadinessError[];
  reason_codes: QuenchReleaseReadinessReasonCode[];
  reasons_detail: QuenchReleaseReadinessReason[];
  blocking_reason_codes: QuenchReleaseReadinessReasonCode[];
  blocking_reasons_detail: QuenchReleaseReadinessReason[];
  review_reason_codes: QuenchReleaseReadinessReasonCode[];
  review_reasons_detail: QuenchReleaseReadinessReason[];
}

const CHECK_REASON_CODES: Record<ReleaseReadinessCheckKey, QuenchReleaseReadinessReasonCode> = {
  workspace_id: "quench_workspace_id_missing",
  workpiece_id: "quench_workpiece_id_missing",
  episode_id: "quench_episode_id_missing",
  title: "quench_title_missing",
  description: "quench_description_missing",
  thumbnail: "quench_thumbnail_missing",
  video_export: "quench_video_export_missing",
  audio_export: "quench_audio_export_missing",
  rss_public_audio: "quench_rss_public_audio_required",
};

const CHECK_REASON_LABELS: Record<ReleaseReadinessCheckKey, string> = {
  workspace_id: "Workspace id is missing.",
  workpiece_id: "Workpiece id is missing.",
  episode_id: "Episode id is missing.",
  title: "Release title is missing.",
  description: "Release description is missing.",
  thumbnail: "No resolvable thumbnail asset is available for this release packet.",
  video_export: "Video platforms require a resolvable video export.",
  audio_export: "Audio distribution requires a resolvable audio export.",
  rss_public_audio: "RSS publication requires a publicly reachable audio URL.",
};

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

function computeReleasePacketReadinessBase(
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

export function deriveReleasePacketReadinessVerdict(
  packet: ReleasePacket,
  assets: Partial<ResolvedReleaseAssets> = {},
  selectedPlatforms: QuenchPlatform[] = [],
): QuenchReleaseReadinessVerdict {
  const readiness = computeReleasePacketReadinessBase(packet, assets, selectedPlatforms);
  const seenCodes = new Set<QuenchReleaseReadinessReasonCode>();
  const blockingReasons: QuenchReleaseReadinessReason[] = [];

  for (const key of readiness.missing_requirements) {
    const code = CHECK_REASON_CODES[key];
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);
    blockingReasons.push({
      code,
      label: CHECK_REASON_LABELS[key],
      severity: "blocking",
      source: "quench",
    });
  }

  for (const error of readiness.errors) {
    const code = (() => {
      switch (error.code) {
        case "THUMBNAIL_MISSING":
          return "quench_thumbnail_missing";
        case "VIDEO_EXPORT_MISSING":
          return "quench_video_export_missing";
        case "AUDIO_EXPORT_MISSING":
          return "quench_audio_export_missing";
        case "RSS_PUBLIC_AUDIO_REQUIRED":
          return "quench_rss_public_audio_required";
        default:
          return null;
      }
    })();
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    blockingReasons.push({
      code,
      label: error.message,
      severity: "blocking",
      source: "quench",
      platform: error.platform,
    });
  }

  return {
    status: blockingReasons.length > 0 ? "blocked" : "ready",
    ready: blockingReasons.length === 0,
    checks: readiness.checks,
    missing_requirements: readiness.missing_requirements,
    errors: readiness.errors,
    reason_codes: blockingReasons.map((reason) => reason.code),
    reasons_detail: blockingReasons,
    blocking_reason_codes: blockingReasons.map((reason) => reason.code),
    blocking_reasons_detail: blockingReasons,
    review_reason_codes: [],
    review_reasons_detail: [],
  };
}

export function validateReleasePacketReadiness(
  packet: ReleasePacket,
  assets: Partial<ResolvedReleaseAssets> = {},
  selectedPlatforms: QuenchPlatform[] = [],
): ReleaseReadinessResult {
  const verdict = deriveReleasePacketReadinessVerdict(packet, assets, selectedPlatforms);
  return {
    ready: verdict.ready,
    checks: verdict.checks,
    missing_requirements: verdict.missing_requirements,
    errors: verdict.errors,
  };
}
