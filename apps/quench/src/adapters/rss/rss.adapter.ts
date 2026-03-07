import type { ResolvedReleaseAssets } from "../../core/asset-resolver";
import type {
  PlatformPublishOptions,
  ReleasePacket,
} from "../../core/release-packet.types";
import {
  createNotImplementedResult,
  createStubReceipt,
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

  if (!packet.audio_export_id) {
    issues.push({
      code: "AUDIO_EXPORT_REQUIRED",
      message: "RSS requires an audio export.",
      field: "audio_export_id",
    });
  }

  if (options.mode === "premiere") {
    issues.push({
      code: "PREMIERE_UNSUPPORTED",
      message: "RSS does not support premiere mode.",
      field: "mode",
    });
  }

  if (!packet.rss_ready) {
    issues.push({
      code: "RSS_NOT_READY",
      message: "This release packet is not marked rss_ready.",
      field: "rss_ready",
    });
  }

  if (assets?.audio && !assets.audio.public_url) {
    issues.push({
      code: "PUBLIC_AUDIO_URL_REQUIRED",
      message: "RSS requires a public audio URL.",
      field: "audio.public_url",
    });
  }

  return issues;
}

export class RssAdapter implements QuenchPlatformAdapter {
  readonly platform = "rss" as const;

  getCapabilities(): Promise<PlatformCapabilities> {
    return Promise.resolve({
      platform: this.platform,
      supports_video: false,
      supports_audio_only: true,
      supports_schedule: true,
      supports_premiere: false,
      supports_shorts: false,
      supports_ab_testing: false,
    });
  }

  async validate(
    packet: ReleasePacket,
    options: PlatformPublishOptions,
    context?: PublishContext,
  ): Promise<AdapterValidationResult> {
    const errors = buildValidationIssues(packet, options, context?.resolved_assets);
    return {
      ok: errors.length === 0,
      errors,
      warnings: [],
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
      audio_export_id: packet.audio_export_id,
      rss_ready: packet.rss_ready,
    };

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
      message: "RSS adapter stub validated the packet and produced a deterministic receipt.",
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
      message: "RSS adapter retry stub emitted a deterministic retry receipt.",
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
