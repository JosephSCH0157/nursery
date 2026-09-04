import type { ResolvedAsset } from "../../core/asset-resolver";
import type { PlatformPublishOptions, ReleasePacket } from "../../core/release-packet.types";
import {
  createPublishAuthorityDeniedResult,
  createStubReceipt,
  publishContextAllowsExecution,
  type AdapterPublishResult,
  type AdapterValidationResult,
  type PlatformCapabilities,
  type PlatformReceipt,
  type PublishContext,
  type PublicationExecutionContext,
  type QuenchPlatformAdapter,
} from "../adapter.contract";

export const TRANSISTOR_ADAPTER_ID = "forge.transistor";
export const TRANSISTOR_ADAPTER_VERSION = "1.0.0";

/** Exact capability snapshot persisted on a Transistor show destination. */
export const TRANSISTOR_V1_CAPABILITIES = Object.freeze({
  provider: "transistor",
  audio_upload: true,
  episode_draft_create: true,
  episode_publish: true,
  episode_schedule: true,
  host_owns_rss: true,
  host_owns_directory_distribution: true,
  forge_rss_hosting: false,
  direct_spotify_upload: false,
  idempotent_episode_create: false,
});

export interface TransistorEpisodeSubmission {
  show_id: string;
  title: string;
  description: string;
  keywords: string[];
  audio: ResolvedAsset;
  status: "published" | "scheduled";
  published_at?: string;
  publication_operation_id: string;
  publication_attempt_id: string;
}

export interface TransistorEpisodeEvidence {
  episode_id: string;
  share_url: string | null;
  status: "published" | "scheduled";
  published_at?: string;
  provider_request_id?: string;
  upload_session_id?: string;
}

/** Server-side port. Implementations hold the API key and stream the canonical asset. */
export interface TransistorPublishingClient {
  submitEpisode(submission: TransistorEpisodeSubmission): Promise<TransistorEpisodeEvidence>;
}

export class TransistorAdapter implements QuenchPlatformAdapter {
  readonly platform = "podcast_host" as const;
  private readonly showId: string | null;
  private readonly client: TransistorPublishingClient | undefined;

  constructor(showId: string | null = null, client?: TransistorPublishingClient) {
    this.showId = showId;
    this.client = client;
  }

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

  validate(packet: ReleasePacket, options: PlatformPublishOptions, context?: PublishContext): Promise<AdapterValidationResult> {
    const errors = [];
    if (!packet.audio_export_id) errors.push({ code: "AUDIO_EXPORT_REQUIRED", message: "A podcast host release requires a canonical audio export.", field: "audio_export_id" });
    if (!this.showId) errors.push({ code: "HOST_SHOW_REQUIRED", message: "Select a linked Transistor show destination.", field: "executable_destination_id" });
    if (!context?.resolved_assets?.audio?.accessible) errors.push({ code: "AUDIO_ASSET_INACCESSIBLE", message: "The canonical audio export is not accessible.", field: "audio" });
    if (options.mode === "premiere") errors.push({ code: "PREMIERE_UNSUPPORTED", message: "Transistor does not support premiere mode.", field: "mode" });
    if (options.mode === "schedule" && !options.scheduled_for) errors.push({ code: "SCHEDULE_TIME_REQUIRED", message: "Scheduling requires a publication time.", field: "scheduled_for" });
    return Promise.resolve({ ok: errors.length === 0, errors, warnings: [] });
  }

  async publish(packet: ReleasePacket, options: PlatformPublishOptions, context: PublicationExecutionContext): Promise<AdapterPublishResult> {
    const summary = { episode_id: packet.episode_id, host: "transistor", show_id: this.showId, mode: options.mode, audio_export_id: packet.audio_export_id };
    if (!publishContextAllowsExecution(context)) return createPublishAuthorityDeniedResult(this.platform, options, context, summary);
    const validation = await this.validate(packet, options, context);
    if (!validation.ok) return { ok: false, state: "failed", message: validation.errors.map((issue) => issue.message).join(" "), receipt: createStubReceipt(this.platform, options, context, summary, "failed") };
    if (context.run_mode === "stub") return { ok: true, state: "stubbed", message: "Transistor adapter validated the canonical host submission.", receipt: createStubReceipt(this.platform, options, context, summary) };
    if (!this.client || !this.showId || !context.resolved_assets?.audio) return { ok: false, state: "failed", message: "The server-side Transistor publishing client is unavailable.", receipt: createStubReceipt(this.platform, options, context, summary, "failed") };

    const evidence = await this.client.submitEpisode({
      show_id: this.showId,
      title: options.title_override ?? packet.title,
      description: options.description_override ?? packet.description,
      keywords: packet.tags,
      audio: context.resolved_assets.audio,
      status: options.mode === "schedule" ? "scheduled" : "published",
      published_at: options.scheduled_for,
      publication_operation_id: context.publication_operation_id,
      publication_attempt_id: context.publication_attempt_id,
    });
    return { ok: true, state: evidence.status, message: evidence.status === "scheduled" ? "Episode scheduled on Transistor." : "Episode published on Transistor.", receipt: { platform: this.platform, external_id: evidence.episode_id, external_url: evidence.share_url, status: evidence.status, published_at: evidence.status === "published" ? evidence.published_at ?? context.now_iso : undefined, scheduled_for: evidence.status === "scheduled" ? evidence.published_at ?? options.scheduled_for : undefined, payload_summary: summary, adapter_metadata: { adapter_id: TRANSISTOR_ADAPTER_ID, adapter_version: TRANSISTOR_ADAPTER_VERSION, provider_request_id: evidence.provider_request_id ?? null, provider_upload_session_id: evidence.upload_session_id ?? null, host_authoritative_for_rss: true }, retry_count: 0 } };
  }

  retry(receipt: PlatformReceipt, context: PublicationExecutionContext): Promise<AdapterPublishResult> {
    const options: PlatformPublishOptions = { enabled: true, mode: receipt.scheduled_for ? "schedule" : "publish", scheduled_for: receipt.scheduled_for };
    if (!publishContextAllowsExecution(context)) {
      return Promise.resolve(createPublishAuthorityDeniedResult(this.platform, options, context, { retry_of: receipt.external_id, prior_status: receipt.status }));
    }
    return Promise.resolve({ ok: false, state: "failed", message: "Automatic Transistor retry is unavailable without reconstructing the immutable submission. Reconcile any possible provider side effect before claiming a new attempt.", receipt: { ...createStubReceipt(this.platform, options, context, { retry_of: receipt.external_id, prior_status: receipt.status }, "failed"), retry_count: receipt.retry_count + 1 } });
  }
}
