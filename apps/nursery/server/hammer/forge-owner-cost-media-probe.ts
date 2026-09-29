import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import {
  ForgeFfmpegMediaProbeError,
  probeMediaWithForgeFfmpeg,
  type ForgeFfmpegClientConfig,
  type ForgeFfmpegMediaInspection,
} from "../forge-ffmpeg-client";

export type HammerOwnerCostRpcGate = {
  rpc(name: string, args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};

export type HammerSourceDeskProbeContext = {
  workspaceId: string;
  workpieceId: string;
  path: string;
  sourceAssetId: string | null;
  contentType: string;
};

export type HammerOwnerCostProbeResult = ForgeFfmpegMediaInspection & {
  ownerCostOperationId: string;
};

type RuntimeEnvironment = "production" | "preview" | "development";
type FinancialEnvironment = "live" | "test";

type OwnerCostIdentity = {
  operationId: string;
  operationKey: string;
  requestFingerprint: string;
  sourceSha256: string;
  assetRole: "intro" | "outro" | "introoutro_upload";
  sourceIdentity: string;
};

type ExistingOwnerCost = {
  operation?: Record<string, unknown>;
  attempts?: Array<Record<string, unknown> & {
    events?: Array<Record<string, unknown>>;
    valuations?: Array<Record<string, unknown>>;
  }>;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hammerOwnerCostSha256(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deterministicUuid(value: string): string {
  const bytes = Buffer.from(hammerOwnerCostSha256(value).slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableTimestamp(createdAt: string, offsetMs: number): string {
  return new Date(new Date(createdAt).getTime() + offsetMs).toISOString();
}

async function rpc(
  gate: HammerOwnerCostRpcGate,
  name: string,
  args?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await gate.rpc(name, args);
  if (result.error) {
    const error = new Error(`${name} failed: ${result.error.message ?? "unknown owner-cost error"}`) as Error & { code?: string };
    error.code = result.error.code;
    throw error;
  }
  return readObject(result.data) ?? {};
}

async function readExistingOperation(
  gate: HammerOwnerCostRpcGate,
  operationId: string,
): Promise<ExistingOwnerCost | null> {
  const result = await gate.rpc("read_owner_cost_operation", { p_operation_id: operationId });
  if (result.error) {
    const error = new Error(`read_owner_cost_operation failed: ${result.error.message ?? "unknown owner-cost error"}`) as Error & { code?: string };
    error.code = result.error.code;
    throw error;
  }
  return readObject(result.data) as ExistingOwnerCost | null;
}

export function resolveHammerSourceDeskAssetRole(path: string): OwnerCostIdentity["assetRole"] {
  const filename = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (/^workspace-default-intro(?:\.|$)/.test(filename)) return "intro";
  if (/^workspace-default-outro(?:\.|$)/.test(filename)) return "outro";
  return "introoutro_upload";
}

export function deriveHammerOwnerCostProbeIdentity(args: {
  financialEnvironment: FinancialEnvironment;
  sourceBytes: Uint8Array;
  context: HammerSourceDeskProbeContext;
}): OwnerCostIdentity {
  const sourceSha256 = hammerOwnerCostSha256(args.sourceBytes);
  const assetRole = resolveHammerSourceDeskAssetRole(args.context.path);
  const sourceIdentity = args.context.sourceAssetId ?? "direct_upload";
  const logicalInspection = {
    financial_environment: args.financialEnvironment,
    originating_tool: "hammer",
    operation_type: "source_desk_media_probe",
    workspace_id: args.context.workspaceId,
    workpiece_id: args.context.workpieceId,
    asset_role: assetRole,
    source_identity: sourceIdentity,
    source_sha256: sourceSha256,
  };
  const operationDigest = hammerOwnerCostSha256(canonicalJson(logicalInspection));
  const operationKey = `hammer:fly-media-probe:${args.financialEnvironment}:${operationDigest}`;
  return {
    operationId: deterministicUuid(`owner-cost-operation:${operationKey}`),
    operationKey,
    sourceSha256,
    assetRole,
    sourceIdentity,
    requestFingerprint: hammerOwnerCostSha256(canonicalJson({
      ...logicalInspection,
      input_bytes: args.sourceBytes.byteLength,
      content_type: args.context.contentType.toLowerCase(),
      route: "/probe/media",
    })),
  };
}

async function readFinancialEnvironment(gate: HammerOwnerCostRpcGate): Promise<FinancialEnvironment> {
  const result = await rpc(gate, "read_financial_runtime_environment");
  if (result.financial_environment !== "live" && result.financial_environment !== "test") {
    throw new Error("Hammer owner-cost financial environment is unavailable");
  }
  return result.financial_environment;
}

function resolveRuntimeEnvironment(value: string | null | undefined): RuntimeEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production") return "production";
  if (normalized === "deploy-preview" || normalized === "preview") return "preview";
  return "development";
}

function attemptIdentity(operationId: string) {
  const attemptId = deterministicUuid(`owner-cost-attempt:${operationId}:1`);
  return {
    attemptId,
    submittedEventId: deterministicUuid(`owner-cost-attempt-event:${attemptId}:submitted`),
    responseEventId: deterministicUuid(`owner-cost-attempt-event:${attemptId}:response`),
    terminalEventId: deterministicUuid(`owner-cost-attempt-event:${attemptId}:terminal`),
    valuationId: deterministicUuid(`owner-cost-valuation:${attemptId}:fly_media_probe`),
    valuationKey: `owner-cost:${attemptId}:fly-media-probe:1`,
  };
}

function normalizedUsage(args: {
  sourceBytes: number;
  responseBytes: number | null;
  elapsedMs: number;
  responseStatus: number | null;
  inspection?: Pick<ForgeFfmpegMediaInspection, "width" | "height" | "durationMs" | "hasAudio">;
}): Record<string, unknown> {
  return {
    input_bytes: args.sourceBytes,
    response_bytes: args.responseBytes,
    elapsed_ms: args.elapsedMs,
    response_status: args.responseStatus,
    media_duration_ms: args.inspection?.durationMs ?? null,
    media_width: args.inspection?.width ?? null,
    media_height: args.inspection?.height ?? null,
    has_audio_stream: args.inspection?.hasAudio ?? null,
    has_video_stream: args.inspection ? true : null,
  };
}

async function recordEvidenceOnlyValuation(args: {
  gate: HammerOwnerCostRpcGate;
  identity: OwnerCostIdentity;
  attempt: ReturnType<typeof attemptIdentity>;
  createdAt: string;
  usage: Record<string, unknown>;
  providerRequestId: string | null;
  outcome: string;
}): Promise<void> {
  await rpc(args.gate, "record_owner_cost_valuation", {
    p_valuation_id: args.attempt.valuationId,
    p_valuation_key: args.attempt.valuationKey,
    p_attempt_id: args.attempt.attemptId,
    p_cost_component: "fly_media_probe",
    p_prior_valuation_id: null,
    p_valuation_basis: "estimated",
    p_amount_micros: 0,
    p_currency: "usd",
    p_recognition_mode: "evidence_only",
    p_reconciliation_reference: null,
    p_normalized_usage_evidence: args.usage,
    p_private_valuation_evidence: {
      schema: "forge.hammer.owner-cost-valuation.v1",
      provider: "forge_ffmpeg_fly_io",
      service: "media_probe",
      route: "/probe/media",
      provider_request_id: args.providerRequestId,
      provider_reported_cost: false,
      monetary_amount_unresolved: true,
      zero_is_not_asserted_provider_cost: true,
      outcome: args.outcome,
    },
    p_valued_at: stableTimestamp(args.createdAt, 13),
  });
}

function reconstructInspection(existing: ExistingOwnerCost | null): ForgeFfmpegMediaInspection | null {
  const attempt = existing?.attempts?.find((entry) => entry.attempt_number === 1);
  const events = attempt?.events ?? [];
  if (events.some((event) => event.lifecycle_state === "failed"
    || event.lifecycle_state === "definitively_rejected"
    || event.lifecycle_state === "submission_unknown")) return null;
  const response = events.find((event) => event.lifecycle_state === "response_captured");
  if (!response) return null;
  const evidence = readObject(response.private_provider_evidence);
  const inspection = readObject(evidence?.inspection);
  const usage = readObject(response.normalized_usage_evidence);
  const width = Number(inspection?.width);
  const height = Number(inspection?.height);
  const durationMs = Number(inspection?.duration_ms);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0
    || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return {
    width,
    height,
    durationMs,
    hasAudio: inspection?.has_audio === true,
    requestId: readString(response.provider_reference_id),
    responseStatus: Number(usage?.response_status) || 200,
    elapsedMs: Number(usage?.elapsed_ms) || 0,
    responseBytes: Number(usage?.response_bytes) || 0,
  };
}

export async function probeHammerSourceDeskMediaWithOwnerCost(args: {
  gate: HammerOwnerCostRpcGate;
  client: ForgeFfmpegClientConfig;
  sourceBytes: Uint8Array;
  context: HammerSourceDeskProbeContext;
  runtimeEnvironment?: RuntimeEnvironment;
  probe?: typeof probeMediaWithForgeFfmpeg;
  now?: () => Date;
}): Promise<HammerOwnerCostProbeResult> {
  const financialEnvironment = await readFinancialEnvironment(args.gate);
  const identity = deriveHammerOwnerCostProbeIdentity({
    financialEnvironment,
    sourceBytes: args.sourceBytes,
    context: args.context,
  });
  const prior = await readExistingOperation(args.gate, identity.operationId);
  const createdAt = readString(prior?.operation?.created_at) ?? (args.now?.() ?? new Date()).toISOString();
  const runtimeEnvironment = args.runtimeEnvironment
    ?? resolveRuntimeEnvironment(process.env.CONTEXT ?? process.env.NODE_ENV);

  await rpc(args.gate, "establish_owner_cost_operation", {
    p_operation_id: identity.operationId,
    p_operation_key: identity.operationKey,
    p_request_fingerprint: identity.requestFingerprint,
    p_financial_environment: financialEnvironment,
    p_runtime_environment: runtimeEnvironment,
    p_originating_tool: "hammer",
    p_operation_type: "source_desk_media_probe",
    p_workspace_id: args.context.workspaceId,
    p_workpiece_id: args.context.workpieceId,
    p_recording_session_id: null,
    p_recording_capture_authority_id: null,
    p_anvil_capture_execution_id: null,
    p_owner_operating_budget_id: null,
    p_creation_evidence: {
      schema: "forge.hammer.owner-cost-operation.v1",
      provider: "forge_ffmpeg_fly_io",
      service: "media_probe",
      route: "/probe/media",
      asset_role: identity.assetRole,
      source_identity: identity.sourceIdentity,
      source_sha256: identity.sourceSha256,
      input_bytes: args.sourceBytes.byteLength,
      content_type: args.context.contentType.toLowerCase(),
      customer_finance_involved: false,
    },
    p_created_at: createdAt,
  });

  const attempt = attemptIdentity(identity.operationId);
  const credentialIdentityHash = hammerOwnerCostSha256(args.client.serviceToken);
  await rpc(args.gate, "authorize_owner_cost_provider_attempt", {
    p_attempt_id: attempt.attemptId,
    p_operation_id: identity.operationId,
    p_attempt_number: 1,
    p_attempt_key: `fly-media-probe-attempt:${identity.operationId}:1`,
    p_request_fingerprint: hammerOwnerCostSha256(canonicalJson({
      operation_request_fingerprint: identity.requestFingerprint,
      provider: "forge_ffmpeg_fly_io",
      service: "media_probe",
      route: "/probe/media",
      credential_identity_hash: credentialIdentityHash,
    })),
    p_provider: "forge_ffmpeg_fly_io",
    p_service: "media_probe",
    p_model: null,
    p_sku: "/probe/media",
    p_credential_identity_hash: credentialIdentityHash,
    p_private_authorization_evidence: {
      schema: "forge.hammer.owner-cost-attempt-authorization.v1",
      route: "/probe/media",
      caller_id: args.client.callerId,
      credential_source: "forge_managed",
      customer_finance_involved: false,
    },
    p_authorized_at: stableTimestamp(createdAt, 10),
  });
  const submitted = await rpc(args.gate, "append_owner_cost_attempt_event", {
    p_attempt_event_id: attempt.submittedEventId,
    p_attempt_id: attempt.attemptId,
    p_event_sequence: 2,
    p_lifecycle_state: "submitted",
    p_provider_reference_id: null,
    p_normalized_usage_evidence: { input_bytes: args.sourceBytes.byteLength },
    p_private_provider_evidence: {
      schema: "forge.hammer.owner-cost-provider-submission.v1",
      provider: "forge_ffmpeg_fly_io",
      service: "media_probe",
      route: "/probe/media",
      caller_id: args.client.callerId,
    },
    p_occurred_at: stableTimestamp(createdAt, 11),
  });

  if (submitted.provider_submission_created !== true) {
    const existing = await readExistingOperation(args.gate, identity.operationId);
    const recovered = reconstructInspection(existing);
    if (!recovered) {
      throw new Error("Hammer media probe owner-cost submission already exists and cannot be resubmitted safely.");
    }
    const usage = normalizedUsage({
      sourceBytes: args.sourceBytes.byteLength,
      responseBytes: recovered.responseBytes,
      elapsedMs: recovered.elapsedMs,
      responseStatus: recovered.responseStatus,
      inspection: recovered,
    });
    await recordEvidenceOnlyValuation({
      gate: args.gate, identity, attempt, createdAt, usage,
      providerRequestId: recovered.requestId, outcome: "succeeded",
    });
    const existingAttempt = existing?.attempts?.find((entry) => entry.attempt_number === 1);
    if (!existingAttempt?.events?.some((event) => event.lifecycle_state === "succeeded")) {
      await rpc(args.gate, "append_owner_cost_attempt_event", {
        p_attempt_event_id: attempt.terminalEventId,
        p_attempt_id: attempt.attemptId,
        p_event_sequence: 4,
        p_lifecycle_state: "succeeded",
        p_provider_reference_id: recovered.requestId,
        p_normalized_usage_evidence: usage,
        p_private_provider_evidence: { schema: "forge.hammer.owner-cost-provider-terminal.v1", recovered: true },
        p_occurred_at: stableTimestamp(createdAt, 14),
      });
    }
    return { ...recovered, ownerCostOperationId: identity.operationId };
  }

  let inspected: ForgeFfmpegMediaInspection;
  try {
    inspected = await (args.probe ?? probeMediaWithForgeFfmpeg)({
      client: args.client,
      sourceBytes: args.sourceBytes,
      sourceFilename: args.context.contentType === "video/mp4" ? "source-desk.mp4" : "source-desk.webm",
      contentType: args.context.contentType,
    });
  } catch (error) {
    const probeError = error instanceof ForgeFfmpegMediaProbeError
      ? error
      : new ForgeFfmpegMediaProbeError({
          message: error instanceof Error ? error.message : "Forge FFmpeg media probe failed.",
          outcome: "submission_unknown",
          elapsedMs: 0,
          cause: error,
        });
    const usage = normalizedUsage({
      sourceBytes: args.sourceBytes.byteLength,
      responseBytes: probeError.responseBytes,
      elapsedMs: probeError.elapsedMs,
      responseStatus: probeError.responseStatus,
    });
    const lifecycleState = probeError.outcome === "definitively_rejected"
      ? "definitively_rejected"
      : probeError.outcome === "submission_unknown" ? "submission_unknown" : "response_captured";
    await rpc(args.gate, "append_owner_cost_attempt_event", {
      p_attempt_event_id: attempt.responseEventId,
      p_attempt_id: attempt.attemptId,
      p_event_sequence: 3,
      p_lifecycle_state: lifecycleState,
      p_provider_reference_id: probeError.requestId,
      p_normalized_usage_evidence: usage,
      p_private_provider_evidence: {
        schema: "forge.hammer.owner-cost-provider-failure.v1",
        route: "/probe/media",
        caller_id: args.client.callerId,
        outcome: probeError.outcome,
        message: probeError.message,
      },
      p_occurred_at: stableTimestamp(createdAt, 12),
    });
    await recordEvidenceOnlyValuation({
      gate: args.gate, identity, attempt, createdAt, usage,
      providerRequestId: probeError.requestId, outcome: probeError.outcome,
    });
    if (probeError.outcome === "response_invalid") {
      await rpc(args.gate, "append_owner_cost_attempt_event", {
        p_attempt_event_id: attempt.terminalEventId,
        p_attempt_id: attempt.attemptId,
        p_event_sequence: 4,
        p_lifecycle_state: "failed",
        p_provider_reference_id: probeError.requestId,
        p_normalized_usage_evidence: usage,
        p_private_provider_evidence: { schema: "forge.hammer.owner-cost-provider-terminal.v1", outcome: "response_invalid" },
        p_occurred_at: stableTimestamp(createdAt, 14),
      });
    }
    throw probeError;
  }

  const usage = normalizedUsage({
    sourceBytes: args.sourceBytes.byteLength,
    responseBytes: inspected.responseBytes,
    elapsedMs: inspected.elapsedMs,
    responseStatus: inspected.responseStatus,
    inspection: inspected,
  });
  await rpc(args.gate, "append_owner_cost_attempt_event", {
    p_attempt_event_id: attempt.responseEventId,
    p_attempt_id: attempt.attemptId,
    p_event_sequence: 3,
    p_lifecycle_state: "response_captured",
    p_provider_reference_id: inspected.requestId,
    p_normalized_usage_evidence: usage,
    p_private_provider_evidence: {
      schema: "forge.hammer.owner-cost-provider-response.v1",
      route: "/probe/media",
      caller_id: args.client.callerId,
      response_status: inspected.responseStatus,
      inspection: {
        width: inspected.width,
        height: inspected.height,
        duration_ms: inspected.durationMs,
        has_audio: inspected.hasAudio,
        has_video: true,
      },
    },
    p_occurred_at: stableTimestamp(createdAt, 12),
  });
  await recordEvidenceOnlyValuation({
    gate: args.gate, identity, attempt, createdAt, usage,
    providerRequestId: inspected.requestId, outcome: "succeeded",
  });
  await rpc(args.gate, "append_owner_cost_attempt_event", {
    p_attempt_event_id: attempt.terminalEventId,
    p_attempt_id: attempt.attemptId,
    p_event_sequence: 4,
    p_lifecycle_state: "succeeded",
    p_provider_reference_id: inspected.requestId,
    p_normalized_usage_evidence: usage,
    p_private_provider_evidence: { schema: "forge.hammer.owner-cost-provider-terminal.v1" },
    p_occurred_at: stableTimestamp(createdAt, 14),
  });
  return { ...inspected, ownerCostOperationId: identity.operationId };
}
