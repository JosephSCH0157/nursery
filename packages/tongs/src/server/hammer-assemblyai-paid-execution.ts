import { createHash, randomUUID } from "node:crypto";
import {
  HAMMER_ASSEMBLYAI_MODEL,
  HAMMER_ASSEMBLYAI_OUTPUT_CONTRACT,
  HammerAssemblyAiBoundaryError,
  readBoundedHammerAssemblyAiResult,
  submitBoundedHammerAssemblyAiOnce,
  type AssemblyAiTransport,
  type HammerAssemblyAiExecutionAuthorization,
  type HammerAssemblyAiSourceAuthority,
} from "./hammer-assemblyai-transcription.js";
import {
  HammerAssemblyAiResourceGuard,
  type HammerAssemblyAiCapacityEvidence,
} from "./hammer-assemblyai-resource-policy.js";

export const HAMMER_FIRST_TRANSCRIPTION_RATE_MICROS_PER_HOUR = 230_000n;
export const HAMMER_FIRST_TRANSCRIPTION_BILLING_INCREMENT_MS = 1_000n;
export const HAMMER_FIRST_TRANSCRIPTION_MINIMUM_BILLABLE_MS = 1_000n;
export const HAMMER_FIRST_TRANSCRIPTION_SUPPORTING_CEILING_MICROS = 6_000n;
export const HAMMER_FIRST_TRANSCRIPTION_CREDIT_MICROS = 5_000n;
export const HAMMER_FIRST_TRANSCRIPTION_MARKUP_NUMERATOR = 133n;
export const HAMMER_FIRST_TRANSCRIPTION_MARKUP_DENOMINATOR = 100n;

export type HammerFirstTranscriptionQuoteMath = Readonly<{
  sourceDurationMs: bigint;
  billableDurationMs: bigint;
  supplierCeilingMicros: bigint;
  supportingCeilingMicros: bigint;
  completeWholesaleCeilingMicros: bigint;
  targetCustomerChargeMicros: bigint;
  customerCreditUnits: bigint;
  customerChargeMicros: bigint;
}>;

function ceilDiv(value: bigint, divisor: bigint): bigint {
  if (value < 0n || divisor <= 0n) throw new RangeError("ceilDiv requires non-negative value and positive divisor");
  return (value + divisor - 1n) / divisor;
}

export function calculateHammerFirstTranscriptionQuote(
  durationMs: bigint,
): HammerFirstTranscriptionQuoteMath {
  if (durationMs <= 0n) throw new RangeError("durationMs must be positive");
  const rounded = ceilDiv(durationMs, HAMMER_FIRST_TRANSCRIPTION_BILLING_INCREMENT_MS)
    * HAMMER_FIRST_TRANSCRIPTION_BILLING_INCREMENT_MS;
  const billableDurationMs = rounded < HAMMER_FIRST_TRANSCRIPTION_MINIMUM_BILLABLE_MS
    ? HAMMER_FIRST_TRANSCRIPTION_MINIMUM_BILLABLE_MS
    : rounded;
  const supplierCeilingMicros = ceilDiv(
    billableDurationMs * HAMMER_FIRST_TRANSCRIPTION_RATE_MICROS_PER_HOUR,
    3_600_000n,
  );
  const completeWholesaleCeilingMicros = supplierCeilingMicros
    + HAMMER_FIRST_TRANSCRIPTION_SUPPORTING_CEILING_MICROS;
  const targetCustomerChargeMicros = ceilDiv(
    completeWholesaleCeilingMicros * HAMMER_FIRST_TRANSCRIPTION_MARKUP_NUMERATOR,
    HAMMER_FIRST_TRANSCRIPTION_MARKUP_DENOMINATOR,
  );
  const customerCreditUnits = ceilDiv(targetCustomerChargeMicros, HAMMER_FIRST_TRANSCRIPTION_CREDIT_MICROS);
  return Object.freeze({
    sourceDurationMs: durationMs,
    billableDurationMs,
    supplierCeilingMicros,
    supportingCeilingMicros: HAMMER_FIRST_TRANSCRIPTION_SUPPORTING_CEILING_MICROS,
    completeWholesaleCeilingMicros,
    targetCustomerChargeMicros,
    customerCreditUnits,
    customerChargeMicros: customerCreditUnits * HAMMER_FIRST_TRANSCRIPTION_CREDIT_MICROS,
  });
}

type RpcResult = { data: unknown; error: { message: string } | null };
export type HammerAssemblyAiPaidGate = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
};

type JsonRow = Record<string, unknown>;
function row(value: unknown): JsonRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRow : {};
}
function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}
function requiredPositiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

export type HammerAssemblyAiQuote = Readonly<{
  quoteId: string;
  operationId: string;
  quoteHash: string;
  requestFingerprint: string;
  customerCreditUnits: number;
  maximumCustomerChargeMicros: number;
  fundingEligible: boolean;
  fundingLabel: string;
  expiresAt: string;
  accepted: boolean;
}>;

export class HammerAssemblyAiQuoteRequiredError extends Error {
  constructor(readonly quote: HammerAssemblyAiQuote) {
    super("Explicit acceptance of the fixed Hammer transcription quote is required.");
    this.name = "HammerAssemblyAiQuoteRequiredError";
  }
}

export type HammerAssemblyAiSpendingAcceptance = Readonly<{
  quoteId: string;
  quoteHash: string;
  operationId: string;
  requestFingerprint: string;
}>;

export type HammerAssemblyAiPaidExecutionInput = Readonly<{
  userId: string;
  workspaceId: string;
  workpieceId: string;
  canonicalRecordingId: string;
  recordingRevisionId: string;
  source: HammerAssemblyAiSourceAuthority;
  requestFingerprint: string;
  capacityEvidence: HammerAssemblyAiCapacityEvidence;
  audioUrl: string;
  projectRef: string;
  acceptance?: HammerAssemblyAiSpendingAcceptance | null;
}>;

export type HammerAssemblyAiPaidExecutionResult = Readonly<{
  state: "persisted_awaiting_reconciliation" | "submission_unknown" | "provider_failed";
  operationId: string;
  reservationId: string;
  result?: JsonRow;
}>;

type IdFactory = () => string;

/**
 * Server-only coordinator for the single certified recording. All monetary,
 * source, scope, and attempt authority is re-derived by database RPCs. The
 * caller cannot turn the booleans in this class into provider authority.
 */
export class HammerAssemblyAiPaidExecutionCoordinator {
  constructor(
    private readonly gate: HammerAssemblyAiPaidGate,
    private readonly customerGate: HammerAssemblyAiPaidGate,
    private readonly transport: AssemblyAiTransport,
    private readonly ids: IdFactory = randomUUID,
    private readonly wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  private async rpc(name: string, args: Record<string, unknown>): Promise<JsonRow> {
    const response = await this.gate.rpc(name, args);
    if (response.error) throw new Error(`${name}: ${response.error.message}`);
    return row(response.data);
  }

  private parseQuote(value: unknown): HammerAssemblyAiQuote {
    const quote = row(value);
    return Object.freeze({
      quoteId: requiredText(quote.quote_id, "quote_id"),
      operationId: requiredText(quote.operation_id, "operation_id"),
      quoteHash: requiredText(quote.quote_hash, "quote_hash"),
      requestFingerprint: requiredText(quote.request_fingerprint, "request_fingerprint"),
      customerCreditUnits: requiredPositiveInteger(quote.customer_credit_units, "customer_credit_units"),
      maximumCustomerChargeMicros: requiredPositiveInteger(quote.maximum_customer_charge_micros, "maximum_customer_charge_micros"),
      fundingEligible: quote.funding_eligible === true,
      fundingLabel: requiredText(quote.funding_label, "funding_label"),
      expiresAt: requiredText(quote.expires_at, "expires_at"),
      accepted: quote.accepted === true,
    });
  }

  async execute(input: HammerAssemblyAiPaidExecutionInput): Promise<HammerAssemblyAiPaidExecutionResult> {
    const quoteId = input.acceptance?.quoteId ?? this.ids();
    const acceptedOperationUuid = input.acceptance?.operationId.match(/^hammer-assemblyai:([0-9a-f-]{36})$/i)?.[1] ?? null;
    const operationId = acceptedOperationUuid ?? this.ids();
    const quote = this.parseQuote(await this.rpc("create_hammer_first_transcription_quote", {
      p_quote_id: quoteId,
      p_operation_uuid: operationId,
      p_user_id: input.userId,
      p_workspace_id: input.workspaceId,
      p_workpiece_id: input.workpieceId,
      p_canonical_recording_id: input.canonicalRecordingId,
      p_recording_revision_id: input.recordingRevisionId,
      p_request_fingerprint: input.requestFingerprint,
    }));
    if (!input.acceptance || input.acceptance.quoteId !== quote.quoteId || input.acceptance.quoteHash !== quote.quoteHash
      || input.acceptance.operationId !== quote.operationId
      || input.acceptance.requestFingerprint !== quote.requestFingerprint) {
      throw new HammerAssemblyAiQuoteRequiredError(quote);
    }
    const acceptanceId = this.ids();
    const accepted = await this.customerGate.rpc("accept_quote", {
      p_quote_id: quote.quoteId,
      p_acceptance_id: acceptanceId,
      p_acceptance_key: `hammer:${quote.quoteId}:accepted`,
      p_quote_hash: quote.quoteHash,
    });
    if (accepted.error) throw new Error(`accept_quote: ${accepted.error.message}`);
    const reservationId = this.ids();
    const prepared = await this.rpc("reserve_hammer_first_transcription_quote", {
      p_quote_id: quote.quoteId,
      p_reservation_id: reservationId,
      p_user_id: input.userId,
      p_operation_uuid: operationId,
      p_request_fingerprint: input.requestFingerprint,
      p_idempotency_key: `hammer:${operationId}:reserve`,
    });
    const attemptId = this.ids();
    const attemptKey = `hammer:${operationId}:attempt:1`;
    const authorizationRow = await this.rpc("authorize_hammer_first_transcription_attempt", {
      p_operation_id: requiredText(prepared.operation_id, "operation_id"),
      p_attempt_id: attemptId,
      p_attempt_key: attemptKey,
      p_request_sha256: input.requestFingerprint,
      p_capacity_evidence: input.capacityEvidence,
    });
    if (authorizationRow.provider_execution_authorized !== true) {
      throw new HammerAssemblyAiBoundaryError(
        requiredText(authorizationRow.reason, "authorization_denial_reason"),
        "The exact first-transcription provider attempt is not authorized.",
      );
    }
    const authorization: HammerAssemblyAiExecutionAuthorization = {
      activation: "authorized",
      operationId: requiredText(authorizationRow.operation_id, "operation_id"),
      reservationId,
      requestFingerprint: input.requestFingerprint,
      workspaceId: input.workspaceId,
      workpieceId: input.workpieceId,
      canonicalRecordingId: input.canonicalRecordingId,
      recordingRevisionId: input.recordingRevisionId,
      source: input.source,
      model: HAMMER_ASSEMBLYAI_MODEL,
      maximumProviderAttempts: 1,
      acceptedCustomerChargeMicros: quote.maximumCustomerChargeMicros,
      completeWholesaleCeilingMicros: requiredPositiveInteger(
        authorizationRow.complete_wholesale_ceiling_micros,
        "complete_wholesale_ceiling_micros",
      ),
    };
    const resources = new HammerAssemblyAiResourceGuard();
    let submission;
    try {
      submission = await submitBoundedHammerAssemblyAiOnce({
        authorization,
        audioUrl: input.audioUrl,
        projectRef: input.projectRef,
        capacityEvidence: input.capacityEvidence,
        resources,
        transport: this.transport,
        onSubmissionUnknown: async (error) => {
          await this.rpc("mark_hammer_first_transcription_submission_unknown", {
            p_operation_id: authorization.operationId,
            p_attempt_id: attemptId,
            p_attempt_key: attemptKey,
            p_evidence_json: { transmitted: true, error_class: error instanceof Error ? error.name : "unknown" },
          });
        },
      });
    } catch (error) {
      if (error instanceof HammerAssemblyAiBoundaryError && error.code === "submission_unknown") {
        return { state: "submission_unknown", operationId: authorization.operationId, reservationId };
      }
      throw error;
    }
    await this.rpc("record_hammer_first_transcription_submission", {
      p_operation_id: authorization.operationId,
      p_attempt_id: attemptId,
      p_provider_request_id: submission.id,
      p_evidence_json: { provider_status: submission.status },
    });

    let providerPayload: JsonRow = {};
    for (;;) {
      providerPayload = row(await readBoundedHammerAssemblyAiResult({
        transcriptId: submission.id,
        resources,
        transport: this.transport,
      }));
      const status = requiredText(providerPayload.status, "provider_status");
      if (status === "completed") break;
      if (status === "error") {
        await this.rpc("fail_hammer_first_transcription_attempt", {
          p_operation_id: authorization.operationId,
          p_attempt_id: attemptId,
          p_failure_class: "provider_billed_failure",
          p_evidence_json: { provider_status: status },
        });
        return { state: "provider_failed", operationId: authorization.operationId, reservationId };
      }
      if (!['queued', 'processing'].includes(status)) {
        throw new HammerAssemblyAiBoundaryError("provider_payload_invalid", `Unexpected AssemblyAI status: ${status}`);
      }
      await this.wait(5_000);
    }

    const transcript = normalizeAssemblyAiCanonicalTranscript(providerPayload, authorization, submission.id);
    const transcriptJson = JSON.stringify(transcript);
    resources.recordPersistence(Buffer.byteLength(transcriptJson, "utf8"));
    const transcriptId = this.ids();
    const transcriptSha256 = createHash("sha256").update(transcriptJson).digest("hex");
    await this.rpc("complete_hammer_first_transcription_attempt", {
      p_operation_id: authorization.operationId,
      p_attempt_id: attemptId,
      p_provider_request_id: submission.id,
      p_response_sha256: createHash("sha256").update(JSON.stringify(providerPayload)).digest("hex"),
      p_evidence_json: { provider_status: "completed" },
    });
    await this.rpc("persist_hammer_canonical_transcript_v2", {
      p_operation_id: authorization.operationId,
      p_transcript_id: transcriptId,
      p_provider_attempt_id: attemptId,
      p_provider_request_id: submission.id,
      p_transcript_sha256: transcriptSha256,
      p_transcript_json: transcript,
      p_artifact_path: `hammer/recordings/${input.canonicalRecordingId}/baseline/transcript.v2.json`,
      p_stage_receipt_id: this.ids(),
      p_stage_idempotency_key: `hammer:${authorization.operationId}:canonical-persisted`,
      p_stage_evidence_sha256: transcriptSha256,
    });
    return {
      state: "persisted_awaiting_reconciliation",
      operationId: authorization.operationId,
      reservationId,
      result: transcript,
    };
  }

  async reconcileAndSettle(input: {
    operationId: string;
    actualSupplierCostMicros: number;
    supplierEvidence: Record<string, unknown> & { authoritative: true };
  }): Promise<void> {
    if (!Number.isSafeInteger(input.actualSupplierCostMicros) || input.actualSupplierCostMicros < 0) {
      throw new RangeError("actualSupplierCostMicros must be a non-negative safe integer");
    }
    if (input.supplierEvidence.authoritative !== true) {
      throw new Error("authoritative supplier reconciliation evidence is required");
    }
    await this.rpc("settle_hammer_first_transcription_operation", {
      p_operation_id: input.operationId,
      p_settlement_id: this.ids(),
      p_settlement_key: `hammer:${input.operationId}:settled`,
      p_actual_supplier_cost_micros: input.actualSupplierCostMicros,
      p_supplier_evidence_json: input.supplierEvidence,
    });
  }
}

export function normalizeAssemblyAiCanonicalTranscript(
  payload: unknown,
  authorization: HammerAssemblyAiExecutionAuthorization,
  providerRequestId: string,
): JsonRow {
  const root = row(payload);
  const utterances = Array.isArray(root.utterances) ? root.utterances : [];
  const segments = utterances.map((value, index) => {
    const utterance = row(value);
    return {
      id: `segment-${index + 1}`,
      speaker: requiredText(utterance.speaker, `utterances[${index}].speaker`),
      start_ms: requiredPositiveInteger(utterance.start, `utterances[${index}].start`),
      end_ms: requiredPositiveInteger(utterance.end, `utterances[${index}].end`),
      text: requiredText(utterance.text, `utterances[${index}].text`),
    };
  });
  if (segments.length === 0) throw new HammerAssemblyAiBoundaryError("transcript_invalid", "AssemblyAI returned no diarized utterances.");
  return {
    schema: HAMMER_ASSEMBLYAI_OUTPUT_CONTRACT,
    schema_version: "2",
    recording: {
      canonical_recording_id: authorization.canonicalRecordingId,
      recording_revision_id: authorization.recordingRevisionId,
      completion_id: authorization.source.completionId,
      media_sha256: authorization.source.mediaSha256,
      duration_ms: authorization.source.durationMs,
    },
    provider: {
      provider: "assemblyai",
      model: HAMMER_ASSEMBLYAI_MODEL,
      provider_request_id: providerRequestId,
      speaker_labels: true,
    },
    text: requiredText(root.text, "text"),
    segments,
  };
}
