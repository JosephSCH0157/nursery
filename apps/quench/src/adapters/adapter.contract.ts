import type { ResolvedReleaseAssets } from "../core/asset-resolver";
import type {
  PlatformPublishOptions,
  QuenchPlatform,
  ReleasePacket,
} from "../core/release-packet.types";

export interface PlatformCapabilities {
  platform: QuenchPlatform;
  supports_video: boolean;
  supports_audio_only: boolean;
  supports_schedule: boolean;
  supports_premiere: boolean;
  supports_shorts: boolean;
  supports_ab_testing: boolean;
}

export interface AdapterValidationIssue {
  code: string;
  message: string;
  field?: string;
}

export interface AdapterValidationResult {
  ok: boolean;
  errors: AdapterValidationIssue[];
  warnings: AdapterValidationIssue[];
}

export type AdapterPublishState =
  | "queued"
  | "scheduled"
  | "published"
  | "failed"
  | "stubbed";

export interface PlatformReceipt {
  platform: QuenchPlatform;
  external_id: string | null;
  external_url: string | null;
  status: AdapterPublishState;
  published_at?: string;
  scheduled_for?: string;
  payload_summary?: Record<string, unknown>;
  adapter_metadata?: Record<string, unknown>;
  retry_count: number;
}

export interface PublishContext {
  run_mode: "stub" | "live";
  now_iso: string;
  resolved_assets?: Partial<ResolvedReleaseAssets>;
  request_id?: string;
}

export interface AdapterPublishResult {
  ok: boolean;
  state: AdapterPublishState;
  message: string;
  receipt: PlatformReceipt;
}

export interface QuenchPlatformAdapter {
  readonly platform: QuenchPlatform;
  getCapabilities(): Promise<PlatformCapabilities>;
  validate(
    packet: ReleasePacket,
    options: PlatformPublishOptions,
    context?: PublishContext,
  ): Promise<AdapterValidationResult>;
  publish(
    packet: ReleasePacket,
    options: PlatformPublishOptions,
    context: PublishContext,
  ): Promise<AdapterPublishResult>;
  retry(
    receipt: PlatformReceipt,
    context: PublishContext,
  ): Promise<AdapterPublishResult>;
}

export function createStubReceipt(
  platform: QuenchPlatform,
  options: PlatformPublishOptions,
  context: PublishContext,
  summary: Record<string, unknown>,
  status: AdapterPublishState = "stubbed",
): PlatformReceipt {
  return {
    platform,
    external_id: null,
    external_url: null,
    status,
    published_at: status === "published" ? context.now_iso : undefined,
    scheduled_for: options.scheduled_for,
    payload_summary: summary,
    adapter_metadata: {
      run_mode: context.run_mode,
      request_id: context.request_id ?? null,
    },
    retry_count: 0,
  };
}

export function createNotImplementedResult(
  platform: QuenchPlatform,
  options: PlatformPublishOptions,
  context: PublishContext,
  summary: Record<string, unknown>,
): AdapterPublishResult {
  return {
    ok: false,
    state: "failed",
    message: `${platform} live publishing is not implemented yet.`,
    receipt: createStubReceipt(platform, options, context, summary, "failed"),
  };
}
