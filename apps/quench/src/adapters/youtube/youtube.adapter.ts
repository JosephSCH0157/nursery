import type { ResolvedReleaseAssets } from "../../core/asset-resolver";
import type {
  PlatformPublishOptions,
  ReleasePacket,
} from "../../core/release-packet.types";
import {
  createNotImplementedResult,
  createPublishAuthorityDeniedResult,
  createStubReceipt,
  publishContextAllowsExecution,
  type AdapterPublishResult,
  type AdapterValidationIssue,
  type AdapterValidationResult,
  type PlatformCapabilities,
  type PlatformReceipt,
  type PublishContext,
  type QuenchPlatformAdapter,
} from "../adapter.contract";

function buildValidationIssues(
  packet: ReleasePacket,
  options: PlatformPublishOptions,
  assets: Partial<ResolvedReleaseAssets> | undefined,
): AdapterValidationIssue[] {
  const issues: AdapterValidationIssue[] = [];

  if (!packet.video_export_id) {
    issues.push({
      code: "VIDEO_EXPORT_REQUIRED",
      message: "YouTube requires a video export.",
      field: "video_export_id",
    });
  }

  if (!packet.thumbnail_asset_id) {
    issues.push({
      code: "THUMBNAIL_REQUIRED",
      message: "YouTube requires a thumbnail asset.",
      field: "thumbnail_asset_id",
    });
  }

  if (options.mode === "premiere" && !options.scheduled_for) {
    issues.push({
      code: "PREMIERE_SCHEDULE_REQUIRED",
      message: "YouTube premiere mode requires a scheduled_for timestamp.",
      field: "scheduled_for",
    });
  }

  if (assets?.video && !assets.video.accessible) {
    issues.push({
      code: "VIDEO_ASSET_INACCESSIBLE",
      message: "Resolved video asset is not accessible.",
      field: "video.accessible",
    });
  }

  if (assets?.thumbnail && !assets.thumbnail.accessible) {
    issues.push({
      code: "THUMBNAIL_ASSET_INACCESSIBLE",
      message: "Resolved thumbnail asset is not accessible.",
      field: "thumbnail.accessible",
    });
  }

  return issues;
}

export class YouTubeAdapter implements QuenchPlatformAdapter {
  readonly platform = "youtube" as const;

  getCapabilities(): Promise<PlatformCapabilities> {
    return Promise.resolve({
      platform: this.platform,
      supports_video: true,
      supports_audio_only: false,
      supports_schedule: true,
      supports_premiere: true,
      supports_shorts: true,
      supports_ab_testing: true,
    });
  }

  async validate(
    packet: ReleasePacket,
    options: PlatformPublishOptions,
    context?: PublishContext,
  ): Promise<AdapterValidationResult> {
    const errors = buildValidationIssues(packet, options, context?.resolved_assets);
    const warnings: AdapterValidationIssue[] = [];

    if (!packet.tags.length) {
      warnings.push({
        code: "YT_TAGS_EMPTY",
        message: "YouTube can publish without tags, but discoverability metadata is empty.",
        field: "tags",
      });
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
    };
  }

  async publish(
    packet: ReleasePacket,
    options: PlatformPublishOptions,
    context: PublishContext,
  ): Promise<AdapterPublishResult> {
    const validation = await this.validate(packet, options, context);
    const summary = {
      episode_id: packet.episode_id,
      mode: options.mode,
      visibility: options.visibility ?? "private",
      video_export_id: packet.video_export_id,
      thumbnail_asset_id: packet.thumbnail_asset_id,
    };

    if (!publishContextAllowsExecution(context)) {
      return createPublishAuthorityDeniedResult(this.platform, options, context, summary);
    }

    if (!validation.ok) {
      return {
        ok: false,
        state: "failed",
        message: validation.errors.map((issue) => issue.message).join(" "),
        receipt: createStubReceipt(this.platform, options, context, summary, "failed"),
      };
    }

    if (context.run_mode === "live") {
      return createNotImplementedResult(this.platform, options, context, summary);
    }

    return {
      ok: true,
      state: "stubbed",
      message: "YouTube adapter stub validated the packet and produced a deterministic receipt.",
      receipt: createStubReceipt(this.platform, options, context, summary),
    };
  }

  retry(
    receipt: PlatformReceipt,
    context: PublishContext,
  ): Promise<AdapterPublishResult> {
    const options: PlatformPublishOptions = {
      enabled: true,
      mode: receipt.scheduled_for ? "schedule" : "publish",
      scheduled_for: receipt.scheduled_for,
    };

    if (!publishContextAllowsExecution(context)) {
      return Promise.resolve(createPublishAuthorityDeniedResult(this.platform, options, context, {
        retry_of: receipt.external_id,
        prior_status: receipt.status,
      }));
    }

    if (context.run_mode === "live") {
      return Promise.resolve(
        createNotImplementedResult(this.platform, options, context, {
          retry_of: receipt.external_id,
          prior_status: receipt.status,
        }),
      );
    }

    return Promise.resolve({
      ok: true,
      state: "stubbed",
      message: "YouTube adapter retry stub emitted a deterministic retry receipt.",
      receipt: {
        ...createStubReceipt(this.platform, options, context, {
          retry_of: receipt.external_id,
          prior_status: receipt.status,
        }),
        retry_count: receipt.retry_count + 1,
      },
    });
  }
}
