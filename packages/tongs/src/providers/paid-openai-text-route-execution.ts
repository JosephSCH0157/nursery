import {
  OpenAiTextBoundaryError,
  type OpenAiTextRouteCode,
} from "./openai-text-paid-boundary.js";
import {
  OpenAiTextPostPersistenceContinuationError,
  PaidOpenAiTextExecutionCoordinator,
  type OpenAiCredentialFunding,
  type OpenAiTextGateClient,
  type OpenAiTextProviderExecutionAuthorization,
  type OpenAiTextProviderResult,
} from "./paid-openai-text-execution-coordinator.js";
import type { AggregateAdmissionCallerClass } from "./aggregate-financial-admission.js";
import type { BoundedProviderRequest } from "./bounded-provider-request.js";
import type { OpenAiTranscriptionRouteCode } from "./openai-transcription-paid-boundary.js";

export type CoordinatedOpenAiRouteCode =
  | OpenAiTextRouteCode
  | OpenAiTranscriptionRouteCode;

export type OpenAiTextPaidExecutionHandle = {
  operationId: string;
  reservationId: string;
  requestFingerprint: string;
  fundingEnvironment: "test" | "live" | "owner_internal";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

export function normalizeOpenAiTextPaidExecutionHandle(
  value: unknown,
): OpenAiTextPaidExecutionHandle | null {
  const row = asRecord(value);
  const operationId =
    typeof row.operation_id === "string" ? row.operation_id.trim() : "";
  const reservationId =
    typeof row.reservation_id === "string" ? row.reservation_id.trim() : "";
  const requestFingerprint =
    typeof row.request_fingerprint === "string"
      ? row.request_fingerprint.trim().toLowerCase()
      : "";
  const fundingEnvironment = typeof row.funding_environment === "string"
    ? row.funding_environment.trim()
    : "";
  return operationId.length >= 8 &&
    UUID_RE.test(reservationId) &&
    SHA256_RE.test(requestFingerprint) &&
    ["test", "live", "owner_internal"].includes(fundingEnvironment)
    ? {
        operationId,
        reservationId,
        requestFingerprint,
        fundingEnvironment: fundingEnvironment as OpenAiTextPaidExecutionHandle["fundingEnvironment"],
      }
    : null;
}

export async function fingerprintOpenAiTextPaidRequest(
  value: unknown,
): Promise<string> {
  return sha256Hex(value);
}

export type OpenAiTextCredentialSource =
  | "forge_managed"
  | "user_byo"
  | "org_shared";

export type PaidOpenAiTextRouteContext = {
  operationId: string;
  reservationId: string;
  quoteId: string;
  routeCode: CoordinatedOpenAiRouteCode;
  fundingSourceType:
    | "customer_deposit"
    | "paid_allowance"
    | "beta_grant"
    | "owner_budget"
    | "none";
  fundingSourceId: string | null;
  fundingEnvironment: "test" | "live" | "owner_internal";
  credentialFunding: OpenAiCredentialFunding;
  model: string;
  maximumInputUnits: number;
  maximumOutputUnits: number;
  maximumAttempts: number;
  maximumFailureExposureMicros: number;
  directProviderCeilingMicros: number;
  supportingCostCeilingMicros: number;
  inputMicrosPerMillionTokens: number;
  cachedInputMicrosPerMillionTokens: number;
  outputMicrosPerMillionTokens: number;
  audioInputMicrosPerMillionTokens: number;
  textInputMicrosPerMillionTokens: number;
  reservationState: string;
};

export type PaidOpenAiTextRouteOutcome<T> =
  | {
      state: "settled" | "settled_replay";
      result: T;
      requestId: string | null;
      attempts: number;
      customerChargeMicros: number;
      context: PaidOpenAiTextRouteContext;
    }
  | {
      state: "failed_released" | "submission_unknown" | "duplicate_in_progress";
      customerChargeMicros: 0;
      attempts: number;
      context: PaidOpenAiTextRouteContext;
    };

type ExecutePaidOpenAiTextRouteArgs<TProvider, TCanonical extends Record<string, unknown>> = {
  /** Server-only continuation: immutable binding and captured evidence, never submission. */
  recoveryOnly?: boolean;
  gate: OpenAiTextGateClient;
  routeCode: Exclude<CoordinatedOpenAiRouteCode, "hearth.chat_completion">;
  handle: OpenAiTextPaidExecutionHandle;
  userId: string;
  workspaceId: string | null;
  workpieceId: string;
  credentialSource: OpenAiTextCredentialSource;
  callerClass?: AggregateAdmissionCallerClass;
  /**
   * Legacy callers may still provide a conservative unit bound. Coordinated
   * JSON callers must prepare and bind the exact serialized provider request.
   */
  inputUnitUpperBound?: number;
  prepareBoundedRequest?: (
    context: PaidOpenAiTextRouteContext,
  ) => Promise<BoundedProviderRequest>;
  /** Exact canonical caller inputs (including the requested route/model). */
  requestFingerprintPayload: unknown;
  executeProvider: (
    context: PaidOpenAiTextRouteContext,
    attemptNumber: number,
    boundedRequest: BoundedProviderRequest | undefined,
    authorization: OpenAiTextProviderExecutionAuthorization,
  ) => Promise<OpenAiTextProviderResult<TProvider>>;
  validateResult: (value: TProvider) => Promise<void> | void;
  persistCanonical: (value: TProvider) => Promise<TCanonical>;
  recoverCanonical?: () => Promise<{
    result: TCanonical;
    providerRequestId: string | null;
    inputUnits: number;
    outputUnits: number;
  } | null>;
};

type ReadSettledOpenAiTextRouteReplayArgs = {
  gate: OpenAiTextGateClient;
  routeCode: Exclude<CoordinatedOpenAiRouteCode, "hearth.chat_completion">;
  handle: OpenAiTextPaidExecutionHandle;
  userId: string;
  workspaceId: string | null;
  workpieceId: string;
  credentialSource: OpenAiTextCredentialSource;
  /** Exact canonical caller inputs used to create the accepted operation. */
  requestFingerprintPayload: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  return value.trim();
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedInteger(
  row: Record<string, unknown>,
  key: string,
  minimum = 0,
): number {
  const value = row[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  return parsed;
}

function parseContext(value: unknown): PaidOpenAiTextRouteContext {
  const row = asRecord(value);
  const routeCode = requiredString(row, "route_code") as CoordinatedOpenAiRouteCode;
  const fundingSourceType = requiredString(row, "funding_source_type");
  const fundingEnvironment = requiredString(row, "funding_environment");
  const credentialFunding = requiredString(row, "credential_funding");
  if (
    !["customer_deposit", "paid_allowance", "beta_grant", "owner_budget", "none"].includes(
      fundingSourceType,
    ) ||
    !["test", "live", "owner_internal"].includes(fundingEnvironment) ||
    (credentialFunding !== "forge" && credentialFunding !== "byo_customer")
  ) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  return {
    operationId: requiredString(row, "operation_id"),
    reservationId: requiredString(row, "reservation_id"),
    quoteId: requiredString(row, "quote_id"),
    routeCode,
    fundingSourceType:
      fundingSourceType as PaidOpenAiTextRouteContext["fundingSourceType"],
    fundingSourceId: nullableString(row, "funding_source_id"),
    fundingEnvironment: fundingEnvironment as PaidOpenAiTextRouteContext["fundingEnvironment"],
    credentialFunding,
    model: requiredString(row, "model"),
    maximumInputUnits: boundedInteger(row, "maximum_input_units", 1),
    maximumOutputUnits: boundedInteger(row, "maximum_output_units", 1),
    maximumAttempts: boundedInteger(row, "maximum_attempts", 1),
    maximumFailureExposureMicros: boundedInteger(
      row,
      "maximum_failure_exposure_micros",
    ),
    directProviderCeilingMicros: boundedInteger(
      row,
      "direct_provider_ceiling_micros",
    ),
    supportingCostCeilingMicros: boundedInteger(
      row,
      "supporting_cost_ceiling_micros",
    ),
    inputMicrosPerMillionTokens: boundedInteger(
      row,
      "input_micros_per_million_tokens",
    ),
    cachedInputMicrosPerMillionTokens: row.cached_input_micros_per_million_tokens == null
      ? 0
      : boundedInteger(row, "cached_input_micros_per_million_tokens"),
    outputMicrosPerMillionTokens: boundedInteger(
      row,
      "output_micros_per_million_tokens",
    ),
    audioInputMicrosPerMillionTokens: row.audio_input_micros_per_million_tokens == null
      ? boundedInteger(row, "input_micros_per_million_tokens")
      : boundedInteger(row, "audio_input_micros_per_million_tokens"),
    textInputMicrosPerMillionTokens: row.text_input_micros_per_million_tokens == null
      ? boundedInteger(row, "input_micros_per_million_tokens")
      : boundedInteger(row, "text_input_micros_per_million_tokens"),
    reservationState: requiredString(row, "reservation_state"),
  };
}

async function rpc(
  gate: OpenAiTextGateClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function estimateOpenAiTextDirectCostMicros(
  context: PaidOpenAiTextRouteContext,
  inputUnits: number,
  outputUnits: number,
  cachedInputUnits = 0,
): number {
  if (!Number.isSafeInteger(cachedInputUnits) || cachedInputUnits < 0 || cachedInputUnits > inputUnits) {
    throw new OpenAiTextBoundaryError("pricing_not_configured");
  }
  const amount = Math.ceil(
    ((inputUnits - cachedInputUnits) * context.inputMicrosPerMillionTokens +
      cachedInputUnits * context.cachedInputMicrosPerMillionTokens +
      outputUnits * context.outputMicrosPerMillionTokens) /
      1_000_000,
  );
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount > context.directProviderCeilingMicros
  ) {
    throw new OpenAiTextBoundaryError("pricing_not_configured");
  }
  return amount;
}

/**
 * Reads an already-settled canonical result before a caller reconstructs any
 * mutable or supplier-backed execution inputs. The paid execution context RPC
 * remains the authorization boundary: it verifies the operation, reservation,
 * user, workspace, workpiece, and immutable request fingerprint together.
 *
 * This lookup is deliberately read-only. In particular it does not bind a new
 * provider request, acquire admission, write aggregate state, settle, or grant
 * failure relief. Unsettled operations return null and continue through their
 * normal execution lifecycle.
 */
export async function readSettledOpenAiTextRouteReplay<
  TCanonical extends Record<string, unknown>,
>(
  args: ReadSettledOpenAiTextRouteReplayArgs,
): Promise<(
  Omit<Extract<PaidOpenAiTextRouteOutcome<TCanonical>, { state: "settled" | "settled_replay" }>, "state">
  & { state: "settled_replay" }
) | null> {
  const binding = {
    p_route_code: args.routeCode,
    p_operation_id: args.handle.operationId,
    p_reservation_id: args.handle.reservationId,
    p_user_id: args.userId,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_request_fingerprint: args.handle.requestFingerprint,
  };
  const initial = await args.gate.rpc("resolve_openai_text_paid_execution_context", binding);
  const resolved = initial.error
    ? await rpc(args.gate, "resolve_openai_text_recovery_context", binding)
    : initial.data;
  const context = parseContext(resolved);
  if (
    context.routeCode !== args.routeCode ||
    context.fundingEnvironment !== args.handle.fundingEnvironment
  ) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  const expectedRequestFingerprint = await sha256Hex(args.requestFingerprintPayload);
  if (expectedRequestFingerprint !== args.handle.requestFingerprint) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  const credentialMatches = context.credentialFunding === "forge"
    ? args.credentialSource === "forge_managed"
    : args.credentialSource === "user_byo";
  if (!credentialMatches) {
    throw new OpenAiTextBoundaryError(
      context.credentialFunding === "byo_customer"
        ? "byo_credential_required"
        : "funding_context_required",
    );
  }
  if (context.reservationState !== "settled") return null;

  const stored = asRecord(await rpc(args.gate, "read_openai_text_paid_result", {
    p_route_code: args.routeCode,
    p_operation_id: context.operationId,
    p_reservation_id: context.reservationId,
    p_user_id: args.userId,
    p_request_fingerprint: args.handle.requestFingerprint,
  }));
  return {
    state: "settled_replay",
    result: asRecord(stored.result_json) as TCanonical,
    requestId: nullableString(stored, "provider_request_id"),
    attempts: 0,
    customerChargeMicros: boundedInteger(stored, "customer_charge_micros"),
    context,
  };
}

/**
 * Completes one accepted OpenAI text operation. The route callback must return
 * only after its creator-facing result has been validated and persisted in
 * Tongs. This function then writes the generic replay receipt and settles once.
 */
async function executePaidOpenAiTextRouteInternal<
  TProvider,
  TCanonical extends Record<string, unknown>,
>(
  args: ExecutePaidOpenAiTextRouteArgs<TProvider, TCanonical>,
): Promise<PaidOpenAiTextRouteOutcome<TCanonical>> {
  const binding = {
      p_route_code: args.routeCode,
      p_operation_id: args.handle.operationId,
      p_reservation_id: args.handle.reservationId,
      p_user_id: args.userId,
      p_workspace_id: args.workspaceId,
      p_workpiece_id: args.workpieceId,
      p_request_fingerprint: args.handle.requestFingerprint,
    };
  let recoveryOnly = false;
  const initial = await args.gate.rpc(args.recoveryOnly ? "resolve_openai_text_recovery_context" : "resolve_openai_text_paid_execution_context", binding);
  recoveryOnly = args.recoveryOnly === true;
  let resolved = initial.data;
  if (initial.error) {
    resolved = await rpc(args.gate, "resolve_openai_text_recovery_context", binding);
    recoveryOnly = true;
  }
  const context = parseContext(resolved);
  if (context.routeCode !== args.routeCode ||
      context.fundingEnvironment !== args.handle.fundingEnvironment) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  const expectedRequestFingerprint = await sha256Hex(
    args.requestFingerprintPayload,
  );
  if (!args.recoveryOnly && expectedRequestFingerprint !== args.handle.requestFingerprint) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  if (args.inputUnitUpperBound !== undefined && (
    !Number.isSafeInteger(args.inputUnitUpperBound) ||
    args.inputUnitUpperBound < 0 ||
    args.inputUnitUpperBound > context.maximumInputUnits
  )) throw new OpenAiTextBoundaryError("funding_context_required");
  const credentialMatches =
    context.credentialFunding === "forge"
      ? args.credentialSource === "forge_managed"
      : args.credentialSource === "user_byo";
  if (!credentialMatches) {
    throw new OpenAiTextBoundaryError(
      context.credentialFunding === "byo_customer"
        ? "byo_credential_required"
        : "funding_context_required",
    );
  }

  if (context.reservationState === "settled") {
    const stored = asRecord(
      await rpc(args.gate, "read_openai_text_paid_result", {
        p_route_code: args.routeCode,
        p_operation_id: context.operationId,
        p_reservation_id: context.reservationId,
        p_user_id: args.userId,
        p_request_fingerprint: args.handle.requestFingerprint,
      }),
    );
    const replayInputUnits = stored.input_units;
    const replayOutputUnits = stored.output_units;
    const replayUsageIsComplete =
      Number.isSafeInteger(replayInputUnits) &&
      Number(replayInputUnits) >= 0 &&
      Number.isSafeInteger(replayOutputUnits) &&
      Number(replayOutputUnits) >= 0;
    const replayDirectCostMicros = context.credentialFunding === "forge" && replayUsageIsComplete
      ? estimateOpenAiTextDirectCostMicros(
          context,
          Number(replayInputUnits),
          Number(replayOutputUnits),
        )
      : context.credentialFunding === "forge"
        ? null
        : 0;
    // Repair the aggregate side of a crash that occurred after economic
    // settlement but before the aggregate outcome write. This event is
    // idempotent and cannot reopen an already reconciled hold.
    await rpc(args.gate, "record_paid_operation_aggregate_outcome", {
      p_reservation_id: context.reservationId,
      p_event_key: `${context.operationId}:aggregate-settled-replay`,
      p_outcome: "settled_unconfirmed",
      p_supplier_obligation_micros: replayDirectCostMicros == null
        ? null
        : replayDirectCostMicros + context.supportingCostCeilingMicros,
      p_supplier_recovery_micros: null,
      p_evidence_json: {
        provider: "openai",
        recovered_from_settled_replay: true,
        authoritative: false,
        usage_evidence_complete: replayUsageIsComplete,
        provider_usage_reported: replayUsageIsComplete,
        direct_cost_rounding_risk_micros: context.credentialFunding === "forge" ? 3 : 0,
      },
    });
    return {
      state: "settled_replay",
      result: asRecord(stored.result_json) as TCanonical,
      requestId: nullableString(stored, "provider_request_id"),
      attempts: 0,
      customerChargeMicros: boundedInteger(
        stored,
        "customer_charge_micros",
      ),
      context,
    };
  }

  // A domain authority can commit successfully immediately before the generic
  // paid-result or settlement write loses its response. Recover that exact
  // domain record first and finish the economic settlement without authorizing
  // another provider attempt or creating another domain revision.
  if (args.recoverCanonical &&
      (context.reservationState === "reserved" ||
       context.reservationState === "attempt_started" ||
       context.reservationState === "provider_attempt_shadowed")) {
    const recovered = await args.recoverCanonical();
    if (recovered) {
      const resultHash = await sha256Hex(recovered.result);
      await rpc(args.gate, "persist_openai_text_paid_result", {
        p_result_id: crypto.randomUUID(),
        p_route_code: args.routeCode,
        p_operation_id: context.operationId,
        p_reservation_id: context.reservationId,
        p_user_id: args.userId,
        p_workspace_id: args.workspaceId,
        p_workpiece_id: args.workpieceId,
        p_request_fingerprint: args.handle.requestFingerprint,
        p_provider_request_id: recovered.providerRequestId,
        p_model: context.model,
        p_input_units: recovered.inputUnits,
        p_output_units: recovered.outputUnits,
        p_result_hash: resultHash,
        p_result_json: recovered.result,
      });
      const directCostMicros = context.credentialFunding === "forge"
        ? estimateOpenAiTextDirectCostMicros(context, recovered.inputUnits, recovered.outputUnits)
        : 0;
      const settleRpc = context.fundingSourceType === "owner_budget"
        ? "settle_owner_operation"
        : "settle_operation";
      const settlement = asRecord(await rpc(args.gate, settleRpc, {
        p_reservation_id: context.reservationId,
        p_settlement_id: crypto.randomUUID(),
        p_settlement_key: `${context.operationId}:settlement`,
        p_outcome: "success",
        p_failure_class: null,
        p_actual_fulfillment_cost_micros: directCostMicros + context.supportingCostCeilingMicros,
        p_evidence_json: {
          provider: "openai",
          provider_request_id: recovered.providerRequestId,
          authoritative: false,
          cost_coverage: "estimated",
          recovered_after_domain_persistence: true,
        },
      }));
      await rpc(args.gate, "record_paid_operation_aggregate_outcome", {
        p_reservation_id: context.reservationId,
        p_event_key: `${context.operationId}:aggregate-recovered-success`,
        p_outcome: "settled_unconfirmed",
        p_supplier_obligation_micros: directCostMicros + context.supportingCostCeilingMicros,
        p_supplier_recovery_micros: null,
        p_evidence_json: {
          provider: "openai",
          recovered_after_domain_persistence: true,
          authoritative: false,
          provider_usage_reported: true,
          direct_cost_rounding_risk_micros: context.credentialFunding === "forge" ? 3 : 0,
        },
      });
      return {
        state: "settled",
        result: recovered.result,
        requestId: recovered.providerRequestId,
        attempts: 0,
        customerChargeMicros: boundedInteger(settlement, "customer_charge_micros"),
        context,
      };
    }
  }
  if (context.reservationState === "submission_unknown") {
    await rpc(args.gate, "record_paid_operation_aggregate_outcome", {
      p_reservation_id: context.reservationId,
      p_event_key: `${context.operationId}:aggregate-unknown-replay`,
      p_outcome: "ambiguous",
      p_supplier_obligation_micros: null,
      p_supplier_recovery_micros: null,
      p_evidence_json: {
        provider: "openai",
        recovered_from_submission_unknown: true,
        authoritative: false,
      },
    });
    return {
      state: "submission_unknown",
      customerChargeMicros: 0,
      attempts: 0,
      context,
    };
  }
  if (context.reservationState === "provider_attempt_shadowed" || context.reservationState === "attempt_started") {
    return {
      state: "duplicate_in_progress",
      customerChargeMicros: 0,
      attempts: 0,
      context,
    };
  }
  if (context.reservationState !== "reserved") {
    return {
      state: "failed_released",
      customerChargeMicros: 0,
      attempts: 0,
      context,
    };
  }

  if (recoveryOnly) throw new OpenAiTextBoundaryError("funding_context_required");

  const boundedRequest = args.prepareBoundedRequest
    ? await args.prepareBoundedRequest(context)
    : undefined;
  if (boundedRequest) {
    if (boundedRequest.model !== context.model ||
        boundedRequest.boundedInputTokens > context.maximumInputUnits ||
        boundedRequest.maximumOutputTokens !== context.maximumOutputUnits ||
        boundedRequest.maximumAttempts !== context.maximumAttempts) {
      throw new OpenAiTextBoundaryError("funding_context_required");
    }
    await rpc(args.gate, "bind_bounded_provider_request", {
      p_reservation_id: context.reservationId,
      p_route_code: context.routeCode,
      p_request_fingerprint: args.handle.requestFingerprint,
      p_model: context.model,
      p_service_tier: boundedRequest.serviceTier,
      p_estimator_revision: boundedRequest.estimatorRevision,
      p_tokenizer_revision: boundedRequest.tokenizerRevision,
      p_serialized_body_sha256: boundedRequest.serializedBodySha256,
      p_serialized_bytes: boundedRequest.serializedBytes,
      p_tokenizer_input_tokens: boundedRequest.tokenizerInputTokens,
      p_protocol_overhead_tokens: boundedRequest.protocolOverheadTokens,
      p_utf8_byte_token_upper_bound: boundedRequest.utf8ByteTokenUpperBound,
      p_bounded_input_tokens: boundedRequest.boundedInputTokens,
      p_maximum_output_tokens: boundedRequest.maximumOutputTokens,
      p_maximum_attempts: boundedRequest.maximumAttempts,
    });
  }

  let canonicalResult: TCanonical | null = null;
  let providerEvidence: OpenAiTextProviderResult<TProvider> | null = null;
  const coordinator = new PaidOpenAiTextExecutionCoordinator(args.gate);
  const outcome = await coordinator.execute({
    routeCode: args.routeCode,
    reservationId: context.reservationId,
    quoteId: context.quoteId,
    fundingSourceType: context.fundingSourceType,
    fundingSourceId: context.fundingSourceId,
    reservationKey: `${context.operationId}:reservation`,
    attemptKey: `${context.operationId}:openai`,
    settlementId: crypto.randomUUID(),
    settlementKey: `${context.operationId}:settlement`,
    credentialFunding: context.credentialFunding,
    byoCredentialPresent:
      context.credentialFunding === "byo_customer" &&
      args.credentialSource === "user_byo",
    model: context.model,
    maximumInputUnits: context.maximumInputUnits,
    maximumOutputUnits: context.maximumOutputUnits,
    maximumAttempts: context.maximumAttempts,
    maximumFailureExposureMicros: context.maximumFailureExposureMicros,
    supportingCostCeilingMicros: context.supportingCostCeilingMicros,
    aggregateCallerClass: args.callerClass ?? "interactive",
    aggregateProviderMode: context.credentialFunding === "byo_customer" ? "byo" : "real",
    reservationAlreadyCreated: true,
    executeProvider: async (attemptNumber, authorization) => {
      const result = await args.executeProvider(context, attemptNumber, boundedRequest, authorization);
      providerEvidence = result;
      return result;
    },
    validateResult: args.validateResult,
    persistResult: async (value) => {
      canonicalResult = await args.persistCanonical(value);
      const evidence = providerEvidence;
      if (!evidence) throw new Error("provider evidence missing before persistence");
      const resultHash = await sha256Hex(canonicalResult);
      try {
        await rpc(args.gate, "persist_openai_text_paid_result", {
          p_result_id: crypto.randomUUID(),
          p_route_code: args.routeCode,
          p_operation_id: context.operationId,
          p_reservation_id: context.reservationId,
          p_user_id: args.userId,
          p_workspace_id: args.workspaceId,
          p_workpiece_id: args.workpieceId,
          p_request_fingerprint: args.handle.requestFingerprint,
          p_provider_request_id: evidence.requestId,
          p_model: context.model,
          p_input_units: evidence.inputUnits,
          p_output_units: evidence.outputUnits,
          p_result_hash: resultHash,
          p_result_json: canonicalResult,
        });
      } catch (error) {
        throw new OpenAiTextPostPersistenceContinuationError(
          "canonical domain result persisted but billing continuation failed",
          { cause: error },
        );
      }
    },
  });

  if (outcome.state === "settled") {
    if (!canonicalResult) {
      throw new Error("settled paid OpenAI text route has no canonical result");
    }
    return {
      state: "settled",
      result: canonicalResult,
      requestId: outcome.requestId,
      attempts: outcome.attempts,
      customerChargeMicros: outcome.customerChargeMicros,
      context,
    };
  }
  return {
    state: outcome.state,
    customerChargeMicros: 0,
    attempts: outcome.attempts,
    context,
  };
}

/** Financial continuation uses service authority. Returning content is a
 * separate decision checked against current membership, after settlement. */
export async function executePaidOpenAiTextRoute<TProvider, TCanonical extends Record<string, unknown>>(
  args: ExecutePaidOpenAiTextRouteArgs<TProvider, TCanonical>,
): Promise<PaidOpenAiTextRouteOutcome<TCanonical>> {
  const outcome = await executePaidOpenAiTextRouteInternal(args);
  if (outcome.state === "settled" || outcome.state === "settled_replay") {
    await rpc(args.gate, "assert_openai_result_delivery_access", {
      p_user_id: args.userId, p_workspace_id: args.workspaceId,
      p_workpiece_id: args.workpieceId,
    });
  }
  return outcome;
}
