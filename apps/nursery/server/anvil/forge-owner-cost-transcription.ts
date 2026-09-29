import crypto from "node:crypto";
import { Buffer } from "node:buffer";

export type OwnerCostFinancialEnvironment = "test" | "live";
export type OwnerCostRuntimeEnvironment = "production" | "preview" | "development";

export type OwnerCostRpcGate = {
  rpc(name: string, args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};

export type OpenAiOwnerCostAttribution = {
  workspaceId: string | null;
  workpieceId: string | null;
  recordingSessionId: string | null;
  recordingCaptureAuthorityId: string | null;
  anvilCaptureExecutionId: string | null;
};

export type OpenAiOwnerCostIdentity = {
  operationId: string;
  operationKey: string;
  requestFingerprint: string;
  sourceSha256: string;
  createdAt: string;
};

export type OpenAiOwnerCostAttempt = {
  attemptId: string;
  attemptNumber: number;
  submittedEventId: string;
  responseEventId: string;
  terminalEventId: string;
  valuationId: string;
  valuationKey: string;
};

export type OpenAiOwnerCostRate = {
  revisionId: string;
  providerModelId: string;
  audioInputMicrosPerMillionTokens: bigint;
  textInputMicrosPerMillionTokens: bigint;
  outputMicrosPerMillionTokens: bigint;
};

type OpenAiTranscriptionUsage = {
  audioInputTokens: number;
  textInputTokens: number;
  outputTokens: number;
  durationSeconds: number | null;
  providerReported: boolean;
};

const OPENAI_TRANSCRIPTION_RATES: Record<string, OpenAiOwnerCostRate> = {
  "gpt-4o-mini-transcribe": {
    revisionId: "4a000000-0000-4000-8000-000000000001",
    providerModelId: "gpt-4o-mini-transcribe",
    audioInputMicrosPerMillionTokens: 1_250_000n,
    textInputMicrosPerMillionTokens: 1_250_000n,
    outputMicrosPerMillionTokens: 5_000_000n,
  },
  "gpt-4o-transcribe": {
    revisionId: "4a000000-0000-4000-8000-000000000002",
    providerModelId: "gpt-4o-transcribe",
    audioInputMicrosPerMillionTokens: 2_500_000n,
    textInputMicrosPerMillionTokens: 2_500_000n,
    outputMicrosPerMillionTokens: 10_000_000n,
  },
  "gpt-4o-transcribe-diarize": {
    revisionId: "4a000000-0000-4000-8000-000000000003",
    providerModelId: "gpt-4o-transcribe-diarize",
    audioInputMicrosPerMillionTokens: 2_500_000n,
    textInputMicrosPerMillionTokens: 2_500_000n,
    outputMicrosPerMillionTokens: 10_000_000n,
  },
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sha256Hex(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function deterministicUuid(value: string): string {
  const bytes = Buffer.from(sha256Hex(value).slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeModel(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (OPENAI_TRANSCRIPTION_RATES[normalized]) return normalized;
  const prefix = Object.keys(OPENAI_TRANSCRIPTION_RATES)
    .sort((left, right) => right.length - left.length)
    .find((known) => normalized.startsWith(`${known}-`));
  if (prefix) return prefix;
  return normalized;
}

export function resolveOpenAiOwnerCostRate(model: string): OpenAiOwnerCostRate | null {
  return OPENAI_TRANSCRIPTION_RATES[normalizeModel(model)] ?? null;
}

export function deriveOpenAiOwnerCostIdentity(args: {
  financialEnvironment: OwnerCostFinancialEnvironment;
  model: string;
  sourceBytes: Uint8Array;
  sourceAssetRevision: string;
  language: string | null;
  prompt: string | null;
  asrLane: string | null;
  attribution: OpenAiOwnerCostAttribution;
  operationCreatedAt: string;
}): OpenAiOwnerCostIdentity {
  const sourceSha256 = sha256Hex(args.sourceBytes);
  const logicalChunk = {
    financial_environment: args.financialEnvironment,
    originating_tool: "anvil",
    operation_type: "openai_asr_chunk",
    provider: "openai",
    model: args.model,
    source_asset_revision: args.sourceAssetRevision,
    source_sha256: sourceSha256,
    workspace_id: args.attribution.workspaceId,
    workpiece_id: args.attribution.workpieceId,
    recording_session_id: args.attribution.recordingSessionId,
    recording_capture_authority_id: args.attribution.recordingCaptureAuthorityId,
    anvil_capture_execution_id: args.attribution.anvilCaptureExecutionId,
  };
  const operationDigest = sha256Hex(canonicalJson(logicalChunk));
  const operationKey = `anvil:openai-asr:${args.financialEnvironment}:${operationDigest}`;
  const requestFingerprint = sha256Hex(canonicalJson({
    ...logicalChunk,
    language: args.language,
    prompt_sha256: args.prompt ? sha256Hex(args.prompt) : null,
    asr_lane: args.asrLane,
    response_format: "json",
  }));
  const createdAt = new Date(args.operationCreatedAt).toISOString();
  return {
    operationId: deterministicUuid(`owner-cost-operation:${operationKey}`),
    operationKey,
    requestFingerprint,
    sourceSha256,
    createdAt,
  };
}

export function deriveOpenAiOwnerCostAttempt(
  identity: OpenAiOwnerCostIdentity,
  attemptNumber: number,
): OpenAiOwnerCostAttempt {
  const attemptId = deterministicUuid(`owner-cost-attempt:${identity.operationId}:${attemptNumber}`);
  return {
    attemptId,
    attemptNumber,
    submittedEventId: deterministicUuid(`owner-cost-attempt-event:${attemptId}:submitted`),
    responseEventId: deterministicUuid(`owner-cost-attempt-event:${attemptId}:response`),
    terminalEventId: deterministicUuid(`owner-cost-attempt-event:${attemptId}:terminal`),
    valuationId: deterministicUuid(`owner-cost-valuation:${attemptId}:openai_asr`),
    valuationKey: `owner-cost:${attemptId}:openai-asr:1`,
  };
}

function stableTimestamp(createdAt: string, offsetMs: number): string {
  return new Date(new Date(createdAt).getTime() + offsetMs).toISOString();
}

function readOpenAiTranscriptionUsage(payload: unknown): OpenAiTranscriptionUsage {
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const usage = root.usage && typeof root.usage === "object" && !Array.isArray(root.usage)
    ? root.usage as Record<string, unknown>
    : {};
  const inputDetails = usage.input_token_details && typeof usage.input_token_details === "object"
    ? usage.input_token_details as Record<string, unknown>
    : usage.input_tokens_details && typeof usage.input_tokens_details === "object"
      ? usage.input_tokens_details as Record<string, unknown>
      : {};
  const bounded = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  };
  const duration = Number(root.duration ?? usage.duration_seconds);
  return {
    audioInputTokens: bounded(inputDetails.audio_tokens ?? usage.audio_input_tokens),
    textInputTokens: bounded(inputDetails.text_tokens ?? usage.text_input_tokens),
    outputTokens: bounded(usage.output_tokens ?? usage.completion_tokens),
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
    providerReported: Object.keys(usage).length > 0,
  };
}

async function rpc(gate: OwnerCostRpcGate, name: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await gate.rpc(name, args);
  if (result.error) {
    const error = new Error(`${name} failed: ${result.error.message ?? "unknown owner-cost error"}`) as Error & { code?: string };
    error.code = result.error.code;
    throw error;
  }
  return result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as Record<string, unknown>
    : {};
}

export async function readOwnerCostFinancialEnvironment(gate: OwnerCostRpcGate): Promise<OwnerCostFinancialEnvironment> {
  const result = await rpc(gate, "read_financial_runtime_environment");
  if (result.financial_environment !== "test" && result.financial_environment !== "live") {
    throw new Error("Owner-cost financial environment is unavailable");
  }
  return result.financial_environment;
}

export async function establishOpenAiOwnerCostOperation(args: {
  gate: OwnerCostRpcGate;
  identity: OpenAiOwnerCostIdentity;
  financialEnvironment: OwnerCostFinancialEnvironment;
  runtimeEnvironment: OwnerCostRuntimeEnvironment;
  model: string;
  sourceAssetRevision: string;
  attribution: OpenAiOwnerCostAttribution;
}): Promise<void> {
  await rpc(args.gate, "establish_owner_cost_operation", {
    p_operation_id: args.identity.operationId,
    p_operation_key: args.identity.operationKey,
    p_request_fingerprint: args.identity.requestFingerprint,
    p_financial_environment: args.financialEnvironment,
    p_runtime_environment: args.runtimeEnvironment,
    p_originating_tool: "anvil",
    p_operation_type: "openai_asr_chunk",
    p_workspace_id: args.attribution.workspaceId,
    p_workpiece_id: args.attribution.workpieceId,
    p_recording_session_id: args.attribution.recordingSessionId,
    p_recording_capture_authority_id: args.attribution.recordingCaptureAuthorityId,
    p_anvil_capture_execution_id: args.attribution.anvilCaptureExecutionId,
    p_owner_operating_budget_id: null,
    p_creation_evidence: {
      schema: "forge.anvil.owner-cost-operation.v1",
      provider: "openai",
      service: "audio_transcriptions",
      model: args.model,
      source_asset_revision: args.sourceAssetRevision,
      source_sha256: args.identity.sourceSha256,
      customer_finance_involved: false,
    },
    p_created_at: args.identity.createdAt,
  });
}

export async function authorizeOpenAiOwnerCostAttempt(args: {
  gate: OwnerCostRpcGate;
  identity: OpenAiOwnerCostIdentity;
  attempt: OpenAiOwnerCostAttempt;
  model: string;
  credentialIdentityHash: string;
  requestFingerprint: string;
}): Promise<boolean> {
  await rpc(args.gate, "authorize_owner_cost_provider_attempt", {
    p_attempt_id: args.attempt.attemptId,
    p_operation_id: args.identity.operationId,
    p_attempt_number: args.attempt.attemptNumber,
    p_attempt_key: `openai-asr-attempt:${args.identity.operationId}:${args.attempt.attemptNumber}`,
    p_request_fingerprint: args.requestFingerprint,
    p_provider: "openai",
    p_service: "audio_transcriptions",
    p_model: args.model,
    p_sku: args.model,
    p_credential_identity_hash: args.credentialIdentityHash,
    p_private_authorization_evidence: {
      schema: "forge.anvil.owner-cost-attempt-authorization.v1",
      credential_source: "forge_managed",
      customer_finance_involved: false,
    },
    p_authorized_at: stableTimestamp(args.identity.createdAt, args.attempt.attemptNumber * 10),
  });
  const submitted = await rpc(args.gate, "append_owner_cost_attempt_event", {
    p_attempt_event_id: args.attempt.submittedEventId,
    p_attempt_id: args.attempt.attemptId,
    p_event_sequence: 2,
    p_lifecycle_state: "submitted",
    p_provider_reference_id: null,
    p_normalized_usage_evidence: {},
    p_private_provider_evidence: {
      schema: "forge.anvil.owner-cost-provider-submission.v1",
      provider: "openai",
      service: "audio_transcriptions",
      model: args.model,
    },
    p_occurred_at: stableTimestamp(args.identity.createdAt, args.attempt.attemptNumber * 10 + 1),
  });
  return submitted.provider_submission_created === true;
}

export async function appendOpenAiOwnerCostEvent(args: {
  gate: OwnerCostRpcGate;
  identity: OpenAiOwnerCostIdentity;
  attempt: OpenAiOwnerCostAttempt;
  sequence: 3 | 4;
  state: "response_captured" | "succeeded" | "definitively_rejected" | "failed" | "submission_unknown";
  providerRequestId: string | null;
  normalizedUsage?: Record<string, unknown>;
  privateEvidence?: Record<string, unknown>;
}): Promise<void> {
  await rpc(args.gate, "append_owner_cost_attempt_event", {
    p_attempt_event_id: args.sequence === 3 ? args.attempt.responseEventId : args.attempt.terminalEventId,
    p_attempt_id: args.attempt.attemptId,
    p_event_sequence: args.sequence,
    p_lifecycle_state: args.state,
    p_provider_reference_id: args.providerRequestId,
    p_normalized_usage_evidence: args.normalizedUsage ?? {},
    p_private_provider_evidence: args.privateEvidence ?? {},
    p_occurred_at: stableTimestamp(args.identity.createdAt, args.attempt.attemptNumber * 10 + args.sequence),
  });
}

export function normalizeOpenAiOwnerCostUsage(payload: unknown): Record<string, unknown> {
  const usage = readOpenAiTranscriptionUsage(payload);
  return {
    audio_input_tokens: usage.audioInputTokens,
    text_input_tokens: usage.textInputTokens,
    output_tokens: usage.outputTokens,
    duration_seconds: usage.durationSeconds,
    provider_reported_usage: usage.providerReported,
  };
}

export function calculateOpenAiOwnerCostValuation(model: string, payload: unknown): {
  amountMicros: number;
  basis: "estimated" | "usage_calculated";
  recognitionMode: "evidence_only" | "journal_recognized";
  normalizedUsage: Record<string, unknown>;
  privateEvidence: Record<string, unknown>;
} {
  const usage = readOpenAiTranscriptionUsage(payload);
  const normalizedUsage = normalizeOpenAiOwnerCostUsage(payload);
  const rate = resolveOpenAiOwnerCostRate(model);
  if (!rate || !usage.providerReported) {
    return {
      amountMicros: 0,
      basis: "estimated",
      recognitionMode: "evidence_only",
      normalizedUsage,
      privateEvidence: {
        schema: "forge.anvil.owner-cost-valuation.v1",
        monetary_amount_unresolved: true,
        reason: rate ? "provider_usage_missing" : "provider_rate_missing",
        provider_reported_cost: false,
      },
    };
  }
  const numerator = BigInt(usage.audioInputTokens) * rate.audioInputMicrosPerMillionTokens
    + BigInt(usage.textInputTokens) * rate.textInputMicrosPerMillionTokens
    + BigInt(usage.outputTokens) * rate.outputMicrosPerMillionTokens;
  const amount = (numerator + 999_999n) / 1_000_000n;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("OpenAI owner-cost valuation exceeds safe integer range");
  return {
    amountMicros: Number(amount),
    basis: "usage_calculated",
    recognitionMode: amount > 0n ? "journal_recognized" : "evidence_only",
    normalizedUsage,
    privateEvidence: {
      schema: "forge.anvil.owner-cost-valuation.v1",
      provider_rate_revision_id: rate.revisionId,
      provider_model_id: rate.providerModelId,
      audio_input_micros_per_million_tokens: Number(rate.audioInputMicrosPerMillionTokens),
      text_input_micros_per_million_tokens: Number(rate.textInputMicrosPerMillionTokens),
      output_micros_per_million_tokens: Number(rate.outputMicrosPerMillionTokens),
      calculated_not_provider_actual: true,
      provider_reported_cost: false,
    },
  };
}

export async function recordOpenAiOwnerCostValuation(args: {
  gate: OwnerCostRpcGate;
  identity: OpenAiOwnerCostIdentity;
  attempt: OpenAiOwnerCostAttempt;
  model: string;
  payload: unknown;
}): Promise<ReturnType<typeof calculateOpenAiOwnerCostValuation>> {
  const valuation = calculateOpenAiOwnerCostValuation(args.model, args.payload);
  await rpc(args.gate, "record_owner_cost_valuation", {
    p_valuation_id: args.attempt.valuationId,
    p_valuation_key: args.attempt.valuationKey,
    p_attempt_id: args.attempt.attemptId,
    p_cost_component: "openai_asr",
    p_prior_valuation_id: null,
    p_valuation_basis: valuation.basis,
    p_amount_micros: valuation.amountMicros,
    p_currency: "usd",
    p_recognition_mode: valuation.recognitionMode,
    p_reconciliation_reference: null,
    p_normalized_usage_evidence: valuation.normalizedUsage,
    p_private_valuation_evidence: valuation.privateEvidence,
    p_valued_at: stableTimestamp(args.identity.createdAt, args.attempt.attemptNumber * 10 + 3),
  });
  return valuation;
}

export function resolveOwnerCostRuntimeEnvironment(value: string | null | undefined): OwnerCostRuntimeEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production") return "production";
  if (normalized === "deploy-preview" || normalized === "preview") return "preview";
  return "development";
}
