import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY = Object.freeze({
  schema: "forge.hammer.assemblyai-supporting-cost-policy.v1",
  revision: 1,
  lifecycleState: "draft_review",
  routeCode: "hammer.transcript_prep",
  financialEnvironment: "test",
  fundingClassification: "plan_funded_baseline",
  supportingCostCeilingMicros: 6_000,
  supportingFailureLossCeilingMicros: 6_000,
  maximumConcurrentOperations: 1,
  maximumProviderAttempts: 1,
  automaticRetries: 0,
  exactSourceBytes: 5_341_606,
  exactSourceDurationMs: 47_279,
  maximumSourceReads: 2,
  maximumSourceEgressBytes: 10_683_212,
  maximumFunctionInvocations: 16,
  maximumFunctionDurationMs: 15_000,
  maximumAggregateFunctionDurationMs: 240_000,
  maximumProviderPolls: 12,
  maximumReconciliationWindowMs: 30 * 60 * 1_000,
  maximumProviderPayloadBytes: 1_048_576,
  maximumCanonicalTranscriptBytes: 1_048_576,
  maximumCustomerResponseBytes: 65_536,
  maximumTranscriptReadbacks: 2,
  maximumPersistenceBytes: 8 * 1_048_576,
  requiredNetlifyCreditsMicrounits: 671_178,
  requiredSupabaseEgressBytes: 12_780_364,
  maximumCapacityEvidenceAgeMs: 24 * 60 * 60 * 1_000,
  providerMediaTransport: "direct_signed_supabase_url",
  publishable: false,
  providerExecutionAuthorized: false,
} as const);

export type HammerAssemblyAiCapacityEvidence = {
  evidenceSha256: string;
  checkedAt: string;
  expiresAt: string;
  netlify: { plan: "pro"; remainingCreditsMicrounits: number };
  supabase: {
    plan: "pro";
    spendCapEnabled: true;
    remainingUncachedEgressBytes: number;
    remainingDatabaseBytes: number;
  };
  activeHammerOperationCount: 0;
};

export type HammerAssemblyAiFailureKind =
  | "provider_verified_failure"
  | "submission_unknown"
  | "validation_failure"
  | "persistence_failure"
  | "resource_exhausted";

export class HammerAssemblyAiResourceBoundaryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HammerAssemblyAiResourceBoundaryError";
    this.code = code;
  }
}

export function fingerprintHammerAssemblyAiCapacityEvidence(
  evidence: Omit<HammerAssemblyAiCapacityEvidence, "evidenceSha256">,
): string {
  return createHash("sha256").update(JSON.stringify({
    schema: "forge.hammer.assemblyai-capacity-evidence.v1",
    checked_at: evidence.checkedAt,
    expires_at: evidence.expiresAt,
    netlify: evidence.netlify,
    supabase: evidence.supabase,
    active_hammer_operation_count: evidence.activeHammerOperationCount,
  })).digest("hex");
}

function nonNegativeSafeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HammerAssemblyAiResourceBoundaryError(code, `${code} must be a non-negative safe integer.`);
  }
  return value;
}

function positiveSafeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new HammerAssemblyAiResourceBoundaryError(code, `${code} must be a positive safe integer.`);
  }
  return value;
}

function timestamp(value: string, code: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new HammerAssemblyAiResourceBoundaryError(code, `${code} is invalid.`);
  return result;
}

export function certifyHammerAssemblyAiCapacity(
  evidence: HammerAssemblyAiCapacityEvidence,
  now = new Date(),
): Readonly<HammerAssemblyAiCapacityEvidence> {
  if (
    !/^[0-9a-f]{64}$/.test(evidence.evidenceSha256)
    || evidence.evidenceSha256 !== fingerprintHammerAssemblyAiCapacityEvidence(evidence)
  ) {
    throw new HammerAssemblyAiResourceBoundaryError("capacity_evidence_hash_invalid", "Capacity evidence requires a SHA-256 digest.");
  }
  if (evidence.netlify.plan !== "pro" || evidence.supabase.plan !== "pro" || evidence.supabase.spendCapEnabled !== true) {
    throw new HammerAssemblyAiResourceBoundaryError("capacity_plan_not_certified", "Certified Pro plans and the Supabase spend cap are required.");
  }
  const checkedAt = timestamp(evidence.checkedAt, "capacity_checked_at_invalid");
  const expiresAt = timestamp(evidence.expiresAt, "capacity_expires_at_invalid");
  const nowMs = now.getTime();
  if (checkedAt > nowMs || expiresAt < nowMs || expiresAt <= checkedAt) {
    throw new HammerAssemblyAiResourceBoundaryError("capacity_evidence_not_current", "Capacity evidence is not current.");
  }
  if (
    nowMs - checkedAt > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumCapacityEvidenceAgeMs
    || expiresAt - checkedAt > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumCapacityEvidenceAgeMs
  ) {
    throw new HammerAssemblyAiResourceBoundaryError("capacity_evidence_window_invalid", "Capacity evidence exceeds the approved window.");
  }
  const netlifyCredits = nonNegativeSafeInteger(evidence.netlify.remainingCreditsMicrounits, "netlify_remaining_credits_invalid");
  const supabaseEgress = nonNegativeSafeInteger(evidence.supabase.remainingUncachedEgressBytes, "supabase_remaining_egress_invalid");
  const databaseBytes = nonNegativeSafeInteger(evidence.supabase.remainingDatabaseBytes, "supabase_remaining_database_invalid");
  if (evidence.activeHammerOperationCount !== 0) {
    throw new HammerAssemblyAiResourceBoundaryError("hammer_concurrency_capacity_unverified", "Another Hammer operation is active.");
  }
  if (netlifyCredits < HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.requiredNetlifyCreditsMicrounits) {
    throw new HammerAssemblyAiResourceBoundaryError("netlify_capacity_unverified", "Netlify capacity is below the operation bound.");
  }
  if (supabaseEgress < HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.requiredSupabaseEgressBytes) {
    throw new HammerAssemblyAiResourceBoundaryError("supabase_egress_capacity_unverified", "Supabase egress capacity is below the operation bound.");
  }
  if (databaseBytes < HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumPersistenceBytes) {
    throw new HammerAssemblyAiResourceBoundaryError("supabase_database_capacity_unverified", "Supabase database capacity is below the operation bound.");
  }
  return Object.freeze(structuredClone(evidence));
}

export function assertHammerAssemblyAiDirectSourceUrl(url: string, projectRef: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HammerAssemblyAiResourceBoundaryError("source_url_invalid", "The source URL is invalid.");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== `${projectRef}.supabase.co`
    || !parsed.pathname.startsWith("/storage/v1/object/sign/")
  ) {
    throw new HammerAssemblyAiResourceBoundaryError(
      "source_transport_not_direct",
      "The provider must retrieve the exact canonical object through a signed Supabase URL.",
    );
  }
  return parsed;
}

export function assertHammerAssemblyAiPayloadSize(
  payload: string | Uint8Array,
  maximumBytes: number,
  code = "payload_size_exceeded",
): number {
  const maximum = positiveSafeInteger(maximumBytes, "payload_maximum_invalid");
  const bytes = typeof payload === "string" ? Buffer.byteLength(payload, "utf8") : payload.byteLength;
  if (bytes > maximum) {
    throw new HammerAssemblyAiResourceBoundaryError(code, `${code}: ${bytes} bytes exceeds ${maximum}.`);
  }
  return bytes;
}

export class HammerAssemblyAiResourceGuard {
  readonly startedAtMs: number;
  #sourceReads = 0;
  #sourceEgressBytes = 0;
  #functionInvocations = 0;
  #aggregateFunctionDurationMs = 0;
  #providerPolls = 0;
  #providerAttempts = 0;
  #transcriptReadbacks = 0;
  #persistenceBytes = 0;

  constructor(startedAt = new Date()) {
    if (!Number.isFinite(startedAt.getTime())) {
      throw new HammerAssemblyAiResourceBoundaryError("operation_start_invalid", "Operation start time is invalid.");
    }
    this.startedAtMs = startedAt.getTime();
  }

  recordSourceRead(bytes: number): void {
    const value = positiveSafeInteger(bytes, "source_read_bytes_invalid");
    if (value !== HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactSourceBytes) {
      throw new HammerAssemblyAiResourceBoundaryError("source_identity_changed", "Source bytes no longer match the certified recording.");
    }
    const nextReads = this.#sourceReads + 1;
    const nextBytes = this.#sourceEgressBytes + value;
    if (
      nextReads > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumSourceReads
      || nextBytes > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumSourceEgressBytes
    ) {
      throw new HammerAssemblyAiResourceBoundaryError("source_read_limit_exceeded", "Canonical source-read capacity is exhausted.");
    }
    this.#sourceReads = nextReads;
    this.#sourceEgressBytes = nextBytes;
  }

  recordFunctionInvocation(durationMs: number): void {
    const duration = positiveSafeInteger(durationMs, "function_duration_invalid");
    if (duration > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumFunctionDurationMs) {
      throw new HammerAssemblyAiResourceBoundaryError("function_duration_exceeded", "A function invocation exceeded its duration bound.");
    }
    const nextInvocations = this.#functionInvocations + 1;
    const nextDuration = this.#aggregateFunctionDurationMs + duration;
    if (
      nextInvocations > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumFunctionInvocations
      || nextDuration > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumAggregateFunctionDurationMs
    ) {
      throw new HammerAssemblyAiResourceBoundaryError("function_capacity_exhausted", "Function capacity is exhausted.");
    }
    this.#functionInvocations = nextInvocations;
    this.#aggregateFunctionDurationMs = nextDuration;
  }

  recordProviderAttempt(): void {
    if (this.#providerAttempts >= HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumProviderAttempts) {
      throw new HammerAssemblyAiResourceBoundaryError("provider_attempt_limit_exceeded", "A second provider attempt is forbidden.");
    }
    this.#providerAttempts += 1;
  }

  recordProviderPoll(now = new Date()): void {
    this.assertWithinReconciliationWindow(now);
    if (this.#providerPolls >= HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumProviderPolls) {
      throw new HammerAssemblyAiResourceBoundaryError("provider_poll_limit_exceeded", "Provider polling capacity is exhausted.");
    }
    this.#providerPolls += 1;
  }

  recordTranscriptReadback(bytes: number): void {
    const value = positiveSafeInteger(bytes, "transcript_readback_bytes_invalid");
    if (value > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumCanonicalTranscriptBytes) {
      throw new HammerAssemblyAiResourceBoundaryError("transcript_readback_size_exceeded", "Transcript readback exceeded its payload bound.");
    }
    if (this.#transcriptReadbacks >= HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumTranscriptReadbacks) {
      throw new HammerAssemblyAiResourceBoundaryError("transcript_readback_limit_exceeded", "Transcript readback capacity is exhausted.");
    }
    this.#transcriptReadbacks += 1;
  }

  recordPersistence(bytes: number): void {
    const value = positiveSafeInteger(bytes, "persistence_bytes_invalid");
    const nextBytes = this.#persistenceBytes + value;
    if (nextBytes > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumPersistenceBytes) {
      throw new HammerAssemblyAiResourceBoundaryError("persistence_capacity_exhausted", "Persistence capacity is exhausted.");
    }
    this.#persistenceBytes = nextBytes;
  }

  assertWithinReconciliationWindow(now = new Date()): void {
    const elapsed = now.getTime() - this.startedAtMs;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumReconciliationWindowMs) {
      throw new HammerAssemblyAiResourceBoundaryError("reconciliation_window_exceeded", "Reconciliation must stop at the approved deadline.");
    }
  }

  snapshot(): Readonly<Record<string, number>> {
    return Object.freeze({
      sourceReads: this.#sourceReads,
      sourceEgressBytes: this.#sourceEgressBytes,
      functionInvocations: this.#functionInvocations,
      aggregateFunctionDurationMs: this.#aggregateFunctionDurationMs,
      providerPolls: this.#providerPolls,
      providerAttempts: this.#providerAttempts,
      transcriptReadbacks: this.#transcriptReadbacks,
      persistenceBytes: this.#persistenceBytes,
    });
  }
}

export function planHammerAssemblyAiFailureRelief(kind: HammerAssemblyAiFailureKind): Readonly<{
  customerChargeMicros: 0;
  releaseReservation: boolean;
  retainSupplierExposure: true;
  automaticRetry: false;
  returnToHaltNew: true;
  terminalState: "failed" | "submission_unknown";
}> {
  const ambiguous = kind === "submission_unknown";
  return Object.freeze({
    customerChargeMicros: 0,
    releaseReservation: !ambiguous,
    retainSupplierExposure: true,
    automaticRetry: false,
    returnToHaltNew: true,
    terminalState: ambiguous ? "submission_unknown" : "failed",
  });
}
