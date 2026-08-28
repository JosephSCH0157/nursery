import type { ResolvedReleaseAssets } from "../core/asset-resolver";
import type {
  PlatformPublishOptions,
  QuenchPlatform,
  ReleasePacket,
} from "../core/release-packet.types";
import { canExecuteQuenchPublish, type QuenchPublishAuthorityVerdict } from "../core/publish-guard";

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
  readiness: QuenchPublishAuthorityVerdict;
}

export interface PublicationExecutionContext extends PublishContext {
  publication_operation_id: string;
  publication_attempt_id: string;
  manifest_snapshot_id: string;
  release_decision_id: string;
  executable_destination_id: string;
  destination_capability_revision_id: string;
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
    context: PublicationExecutionContext,
  ): Promise<AdapterPublishResult>;
  retry(
    receipt: PlatformReceipt,
    context: PublicationExecutionContext,
  ): Promise<AdapterPublishResult>;
}

export function createStubReceipt(
  platform: QuenchPlatform,
  options: PlatformPublishOptions,
  context: PublicationExecutionContext,
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
      publication_operation_id: context.publication_operation_id,
      publication_attempt_id: context.publication_attempt_id,
    },
    retry_count: 0,
  };
}

export function createNotImplementedResult(
  platform: QuenchPlatform,
  options: PlatformPublishOptions,
  context: PublicationExecutionContext,
  summary: Record<string, unknown>,
): AdapterPublishResult {
  return {
    ok: false,
    state: "failed",
    message: `${platform} live publishing is not implemented yet.`,
    receipt: createStubReceipt(platform, options, context, summary, "failed"),
  };
}

export function createPublishAuthorityDeniedResult(
  platform: QuenchPlatform,
  options: PlatformPublishOptions,
  context: PublicationExecutionContext,
  summary: Record<string, unknown>,
): AdapterPublishResult {
  return {
    ok: false,
    state: "failed",
    message: "Quench publish authority denied execution because resolved readiness is not ready.",
    receipt: createStubReceipt(platform, options, context, summary, "failed"),
  };
}

export function publishContextAllowsExecution(context: PublishContext): boolean {
  return canExecuteQuenchPublish(context.readiness);
}
