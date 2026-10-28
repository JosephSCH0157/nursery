import { createHash } from "node:crypto";
import {
  HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY,
  HammerAssemblyAiResourceGuard,
  assertHammerAssemblyAiDirectSourceUrl,
  assertHammerAssemblyAiPayloadSize,
  certifyHammerAssemblyAiCapacity,
  type HammerAssemblyAiCapacityEvidence,
} from "./hammer-assemblyai-resource-policy.js";

// Server-only provider boundary. Browser code must never import this module;
// @forge/tongs exposes it only through the explicit server subpath.

export const HAMMER_ASSEMBLYAI_MODEL = "universal-3-5-pro" as const;
export const HAMMER_ASSEMBLYAI_OUTPUT_CONTRACT = "forge.hammer.canonical-transcript.v2" as const;
export const HAMMER_ASSEMBLYAI_SECRET_NAME = "FORGE_HAMMER_ASSEMBLYAI_API_KEY" as const;
export const HAMMER_ASSEMBLYAI_LEGACY_SECRET_NAME = "ASSEMBLYAI_API_KEY" as const;

export type HammerAssemblyAiCustomerState = "queued" | "processing" | "failed" | "completed";

export type TrustedRecordingCompletionEvidence = {
  completionId: string;
  mediaRevision: number;
  mediaPath: string;
  mediaHash: string;
  completionEvidence: unknown;
};

export type HammerAssemblyAiSourceAuthority = {
  schema: "forge.hammer.transcription-source-authority.v1";
  completionId: string;
  mediaRevision: number;
  mediaPath: string;
  mediaSha256: string;
  mediaBytes: number;
  mediaContentType: string;
  durationMs: number;
  hasAudioStream: true;
  verificationSource: "trusted_tongs_storage_readback";
  probeImplementation: string;
};

export type HammerAssemblyAiExecutionAuthorization = {
  activation: "authorized";
  operationId: string;
  reservationId: string;
  requestFingerprint: string;
  workspaceId: string;
  workpieceId: string;
  canonicalRecordingId: string;
  recordingRevisionId: string;
  source: HammerAssemblyAiSourceAuthority;
  model: typeof HAMMER_ASSEMBLYAI_MODEL;
  maximumProviderAttempts: 1;
  acceptedCustomerChargeMicros: number;
  completeWholesaleCeilingMicros: number;
};

export type AssemblyAiSubmitRequest = {
  audio_url: string;
  speech_models: [typeof HAMMER_ASSEMBLYAI_MODEL];
  speaker_labels: true;
};

export type AssemblyAiSubmitResponse = { id: string; status: string };

export interface AssemblyAiTransport {
  submit(request: AssemblyAiSubmitRequest): Promise<AssemblyAiSubmitResponse>;
  read(transcriptId: string): Promise<unknown>;
}

export type HammerAssemblyAiServerCredential = ReturnType<typeof resolveHammerAssemblyAiServerCredential>;

export class HammerAssemblyAiBoundaryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HammerAssemblyAiBoundaryError";
    this.code = code;
  }
}

export class HammerAssemblyAiSubmissionUnknownError extends HammerAssemblyAiBoundaryError {
  constructor(message = "AssemblyAI submission outcome is unknown; automatic retry is forbidden.") {
    super("submission_unknown", message);
  }
}

type JsonRecord = Record<string, unknown>;

function object(value: unknown, field: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HammerAssemblyAiBoundaryError("source_evidence_invalid", `${field} must be an object.`);
  }
  return value as JsonRecord;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HammerAssemblyAiBoundaryError("source_evidence_invalid", `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HammerAssemblyAiBoundaryError("source_evidence_invalid", `${field} must be a positive safe integer.`);
  }
  return value;
}

function sha256(value: unknown, field: string): string {
  const result = text(value, field);
  if (!/^[0-9a-f]{64}$/.test(result)) {
    throw new HammerAssemblyAiBoundaryError("source_evidence_invalid", `${field} must be a lowercase SHA-256 digest.`);
  }
  return result;
}

/**
 * Resolves duration only from the server's immutable storage readback. Browser
 * duration and the earlier client artifact probe are deliberately ignored.
 */
export function resolveHammerAssemblyAiSourceAuthority(
  evidence: TrustedRecordingCompletionEvidence,
): HammerAssemblyAiSourceAuthority {
  const root = object(evidence.completionEvidence, "completion_evidence");
  const canonical = object(root.canonical_media_verification, "canonical_media_verification");
  const artifact = object(root.artifact_validation, "artifact_validation");
  const canonicalHash = sha256(canonical.sha256, "canonical_media_verification.sha256");
  const canonicalBytes = positiveInteger(canonical.bytes, "canonical_media_verification.bytes");
  const canonicalType = text(canonical.content_type, "canonical_media_verification.content_type");
  if (canonical.source !== "trusted_tongs_storage_readback" || canonical.has_audio_stream !== true) {
    throw new HammerAssemblyAiBoundaryError(
      "untrusted_source_evidence",
      "Canonical media must have trusted storage readback and an audio stream.",
    );
  }
  if (
    text(artifact.path, "artifact_validation.path") !== evidence.mediaPath
    || sha256(artifact.sha256, "artifact_validation.sha256") !== canonicalHash
    || positiveInteger(artifact.bytes, "artifact_validation.bytes") !== canonicalBytes
    || sha256(evidence.mediaHash, "media_hash") !== canonicalHash
  ) {
    throw new HammerAssemblyAiBoundaryError(
      "source_identity_mismatch",
      "Completion evidence does not describe one immutable canonical media object.",
    );
  }
  if (!canonicalType.toLowerCase().startsWith("video/webm")) {
    throw new HammerAssemblyAiBoundaryError("unsupported_source_media", "H2-C accepts the canonical WebM directly.");
  }
  return Object.freeze({
    schema: "forge.hammer.transcription-source-authority.v1",
    completionId: text(evidence.completionId, "completion_id"),
    mediaRevision: positiveInteger(evidence.mediaRevision, "media_revision"),
    mediaPath: evidence.mediaPath,
    mediaSha256: canonicalHash,
    mediaBytes: canonicalBytes,
    mediaContentType: canonicalType,
    durationMs: positiveInteger(canonical.duration_ms, "canonical_media_verification.duration_ms"),
    hasAudioStream: true,
    verificationSource: "trusted_tongs_storage_readback",
    probeImplementation: text(canonical.probe_implementation, "canonical_media_verification.probe_implementation"),
  });
}

export function resolveHammerAssemblyAiServerCredential(env: NodeJS.ProcessEnv): {
  configured: boolean;
  variableName: typeof HAMMER_ASSEMBLYAI_SECRET_NAME | typeof HAMMER_ASSEMBLYAI_LEGACY_SECRET_NAME | null;
  read: () => string;
} {
  const canonical = env[HAMMER_ASSEMBLYAI_SECRET_NAME]?.trim();
  const legacy = env[HAMMER_ASSEMBLYAI_LEGACY_SECRET_NAME]?.trim();
  const value = canonical || legacy || null;
  const variableName = canonical
    ? HAMMER_ASSEMBLYAI_SECRET_NAME
    : legacy
      ? HAMMER_ASSEMBLYAI_LEGACY_SECRET_NAME
      : null;
  return {
    configured: value !== null,
    variableName,
    read: () => {
      if (!value) throw new HammerAssemblyAiBoundaryError("credential_unavailable", "AssemblyAI server credential is unavailable.");
      return value;
    },
  };
}

/**
 * Concrete server-only HTTP transport. Construction is non-networking and does
 * not read the secret. The secret is accessed only inside an authorized call.
 * Retries are intentionally absent; submit ambiguity belongs to the caller.
 */
export function createHammerAssemblyAiHttpTransport(args: {
  credential: HammerAssemblyAiServerCredential;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): AssemblyAiTransport {
  const fetchImpl = args.fetchImpl ?? fetch;
  const baseUrl = (args.baseUrl ?? "https://api.assemblyai.com").replace(/\/$/, "");
  const request = async (url: string, init: RequestInit): Promise<unknown> => {
    const response = await fetchImpl(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumFunctionDurationMs),
      headers: {
        Authorization: args.credential.read(),
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const rawPayload = await response.text();
    assertHammerAssemblyAiPayloadSize(
      rawPayload,
      HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumProviderPayloadBytes,
      "provider_payload_size_exceeded",
    );
    let payload: unknown = null;
    try {
      payload = JSON.parse(rawPayload) as unknown;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new HammerAssemblyAiBoundaryError(
        "provider_http_error",
        `AssemblyAI request failed with HTTP ${response.status}.`,
      );
    }
    return payload;
  };
  return {
    async submit(submission): Promise<AssemblyAiSubmitResponse> {
      const payload = object(await request(`${baseUrl}/v2/transcript`, {
        method: "POST",
        body: JSON.stringify(submission),
      }), "assemblyai_submission_response");
      return {
        id: text(payload.id, "assemblyai_submission_response.id"),
        status: text(payload.status, "assemblyai_submission_response.status"),
      };
    },
    async read(transcriptId): Promise<unknown> {
      const id = text(transcriptId, "transcript_id");
      if (!/^[A-Za-z0-9_-]+$/.test(id)) {
        throw new HammerAssemblyAiBoundaryError("provider_request_invalid", "AssemblyAI transcript ID is invalid.");
      }
      return request(`${baseUrl}/v2/transcript/${encodeURIComponent(id)}`, { method: "GET" });
    },
  };
}

export function fingerprintHammerAssemblyAiRequest(input: {
  workspaceId: string;
  workpieceId: string;
  canonicalRecordingId: string;
  recordingRevisionId: string;
  source: HammerAssemblyAiSourceAuthority;
}): string {
  return createHash("sha256").update(JSON.stringify({
    route_code: "hammer.transcript_prep",
    workspace_id: input.workspaceId,
    workpiece_id: input.workpieceId,
    canonical_recording_id: input.canonicalRecordingId,
    recording_revision_id: input.recordingRevisionId,
    completion_id: input.source.completionId,
    media_revision: input.source.mediaRevision,
    media_sha256: input.source.mediaSha256,
    media_bytes: input.source.mediaBytes,
    duration_ms: input.source.durationMs,
    model: HAMMER_ASSEMBLYAI_MODEL,
    speaker_labels: true,
    output_contract: HAMMER_ASSEMBLYAI_OUTPUT_CONTRACT,
  })).digest("hex");
}

export function assertHammerAssemblyAiExecutionInactive(): never {
  throw new HammerAssemblyAiBoundaryError(
    "hammer_assemblyai_inactive",
    "Hammer AssemblyAI provider execution is inactive pending separate financial and rollout authorization.",
  );
}

/**
 * One-shot primitive for a future authorized coordinator. It performs exactly
 * one submit call. Any thrown submit error is ambiguous and is never retried.
 */
async function submitHammerAssemblyAiOnce(args: {
  authorization: HammerAssemblyAiExecutionAuthorization;
  audioUrl: string;
  transport: AssemblyAiTransport;
  onSubmissionUnknown: (error: unknown) => Promise<void>;
}): Promise<AssemblyAiSubmitResponse> {
  const auth = args.authorization;
  if (
    auth.activation !== "authorized"
    || auth.maximumProviderAttempts !== 1
    || auth.model !== HAMMER_ASSEMBLYAI_MODEL
    || auth.acceptedCustomerChargeMicros <= 0
    || auth.completeWholesaleCeilingMicros <= 0
  ) {
    throw new HammerAssemblyAiBoundaryError("provider_attempt_not_authorized", "Exact bounded provider authority is required.");
  }
  let response: AssemblyAiSubmitResponse;
  try {
    response = await args.transport.submit({
      audio_url: text(args.audioUrl, "audio_url"),
      speech_models: [HAMMER_ASSEMBLYAI_MODEL],
      speaker_labels: true,
    });
  } catch (error) {
    await args.onSubmissionUnknown(error);
    throw new HammerAssemblyAiSubmissionUnknownError();
  }
  if (!response.id?.trim() || !["queued", "processing"].includes(response.status)) {
    await args.onSubmissionUnknown(new Error("malformed_provider_submission_receipt"));
    throw new HammerAssemblyAiSubmissionUnknownError("AssemblyAI returned no trustworthy submission receipt.");
  }
  return { id: response.id.trim(), status: response.status };
}

export async function submitBoundedHammerAssemblyAiOnce(args: {
  authorization: HammerAssemblyAiExecutionAuthorization;
  audioUrl: string;
  projectRef: string;
  capacityEvidence: HammerAssemblyAiCapacityEvidence;
  resources: HammerAssemblyAiResourceGuard;
  transport: AssemblyAiTransport;
  now?: Date;
  clock?: () => number;
  onSubmissionUnknown: (error: unknown) => Promise<void>;
}): Promise<AssemblyAiSubmitResponse> {
  const now = args.now ?? new Date();
  certifyHammerAssemblyAiCapacity(args.capacityEvidence, now);
  assertHammerAssemblyAiDirectSourceUrl(args.audioUrl, args.projectRef, now);
  const certifiedRequestFingerprint = fingerprintHammerAssemblyAiRequest({
    workspaceId: args.authorization.workspaceId,
    workpieceId: args.authorization.workpieceId,
    canonicalRecordingId: args.authorization.canonicalRecordingId,
    recordingRevisionId: args.authorization.recordingRevisionId,
    source: args.authorization.source,
  });
  if (
    args.authorization.workspaceId !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactWorkspaceId
    || args.authorization.workpieceId !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactWorkpieceId
    || args.authorization.canonicalRecordingId !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactCanonicalRecordingId
    || args.authorization.recordingRevisionId !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactRecordingRevisionId
    || args.authorization.source.completionId !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactCompletionId
    || args.authorization.source.mediaRevision !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactMediaRevision
    || args.authorization.source.mediaSha256 !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactMediaSha256
    || args.authorization.source.mediaPath !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactMediaPath
    || args.authorization.source.mediaBytes !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactSourceBytes
    || args.authorization.source.durationMs !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactSourceDurationMs
    || args.authorization.requestFingerprint !== certifiedRequestFingerprint
  ) {
    throw new HammerAssemblyAiBoundaryError("uncertified_first_operation_source", "The operation is not bound to the certified first recording.");
  }
  args.resources.assertWithinReconciliationWindow(now);
  args.resources.recordSourceRead(args.authorization.source.mediaBytes);
  args.resources.recordProviderAttempt();
  const clock = args.clock ?? Date.now;
  const startedAt = clock();
  try {
    return await submitHammerAssemblyAiOnce({
      authorization: args.authorization,
      audioUrl: args.audioUrl,
      transport: args.transport,
      onSubmissionUnknown: args.onSubmissionUnknown,
    });
  } finally {
    args.resources.recordFunctionInvocation(Math.max(1, Math.ceil(clock() - startedAt)));
  }
}

export async function readBoundedHammerAssemblyAiResult(args: {
  transcriptId: string;
  resources: HammerAssemblyAiResourceGuard;
  transport: AssemblyAiTransport;
  now?: Date;
  clock?: () => number;
}): Promise<unknown> {
  const now = args.now ?? new Date();
  args.resources.recordProviderPoll(now);
  const clock = args.clock ?? Date.now;
  const startedAt = clock();
  try {
    const payload = await args.transport.read(args.transcriptId);
    const serializedPayload = JSON.stringify(payload);
    if (typeof serializedPayload !== "string") {
      throw new HammerAssemblyAiBoundaryError(
        "provider_payload_invalid",
        "AssemblyAI returned a payload that cannot be measured safely.",
      );
    }
    assertHammerAssemblyAiPayloadSize(
      serializedPayload,
      HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumProviderPayloadBytes,
      "provider_payload_size_exceeded",
    );
    return payload;
  } finally {
    args.resources.recordFunctionInvocation(Math.max(1, Math.ceil(clock() - startedAt)));
  }
}

export type HammerAssemblyAiEvidenceSnapshot = {
  operation: {
    state: HammerAssemblyAiCustomerState | "submission_unknown";
    providerExecutionAuthorized: boolean;
    maximumProviderAttempts: number;
    acceptedCustomerChargeMicros: number;
    completeWholesaleCeilingMicros: number;
    canonicalTranscriptId: string | null;
    settledAt: string | null;
  };
  reservationState: string | null;
  aggregateState: string | null;
  providerAttempts: Array<{ attemptNumber: number; state: string; providerRequestId: string | null }>;
  stages: string[];
};

export function verifyHammerAssemblyAiEvidence(snapshot: HammerAssemblyAiEvidenceSnapshot): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (snapshot.operation.maximumProviderAttempts !== 1) issues.push("maximum_provider_attempts_not_one");
  if (snapshot.providerAttempts.length > 1 || snapshot.providerAttempts.some((a) => a.attemptNumber !== 1)) {
    issues.push("provider_attempt_bound_violated");
  }
  if (snapshot.operation.acceptedCustomerChargeMicros <= 0 || snapshot.operation.completeWholesaleCeilingMicros <= 0) {
    issues.push("complete_quote_missing");
  }
  if (snapshot.providerAttempts.length > 0 && snapshot.reservationState == null) issues.push("provider_attempt_without_reservation");
  if (snapshot.operation.settledAt && !snapshot.operation.canonicalTranscriptId) issues.push("settlement_before_canonical_persistence");
  if (snapshot.operation.state === "completed" && !snapshot.operation.settledAt) issues.push("completed_without_settlement");
  if (snapshot.operation.state === "submission_unknown" && snapshot.providerAttempts.length !== 1) {
    issues.push("submission_unknown_attempt_evidence_invalid");
  }
  if (!snapshot.operation.providerExecutionAuthorized && snapshot.providerAttempts.length > 0) {
    issues.push("attempt_while_execution_inactive");
  }
  return { ok: issues.length === 0, issues };
}
