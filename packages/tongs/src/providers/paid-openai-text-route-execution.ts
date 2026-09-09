import {
  OpenAiTextBoundaryError,
  type OpenAiTextRouteCode,
} from "./openai-text-paid-boundary.js";
import {
  OpenAiTextPostPersistenceContinuationError,
  PaidOpenAiTextExecutionCoordinator,
  type OpenAiCredentialFunding,
  type OpenAiTextGateClient,
  type OpenAiTextProviderResult,
} from "./paid-openai-text-execution-coordinator.js";

export type OpenAiTextPaidExecutionHandle = {
  operationId: string;
  reservationId: string;
  requestFingerprint: string;
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
  return operationId.length >= 8 &&
    UUID_RE.test(reservationId) &&
    SHA256_RE.test(requestFingerprint)
    ? { operationId, reservationId, requestFingerprint }
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
  routeCode: OpenAiTextRouteCode;
  fundingSourceType:
    | "customer_deposit"
    | "paid_allowance"
    | "owner_budget"
    | "none";
  fundingSourceId: string | null;
  credentialFunding: OpenAiCredentialFunding;
  model: string;
  maximumInputUnits: number;
  maximumOutputUnits: number;
  maximumAttempts: number;
  maximumFailureExposureMicros: number;
  directProviderCeilingMicros: number;
  supportingCostCeilingMicros: number;
  inputMicrosPerMillionTokens: number;
  outputMicrosPerMillionTokens: number;
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
  gate: OpenAiTextGateClient;
  routeCode: Exclude<OpenAiTextRouteCode, "hearth.chat_completion">;
  handle: OpenAiTextPaidExecutionHandle;
  userId: string;
  workspaceId: string | null;
  workpieceId: string;
  credentialSource: OpenAiTextCredentialSource;
  /** A conservative pre-provider upper bound, normally UTF-8 request bytes. */
  inputUnitUpperBound: number;
  /** Exact canonical caller inputs (including the requested route/model). */
  requestFingerprintPayload: unknown;
  executeProvider: (
    context: PaidOpenAiTextRouteContext,
    attemptNumber: number,
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
  const routeCode = requiredString(row, "route_code") as OpenAiTextRouteCode;
  const fundingSourceType = requiredString(row, "funding_source_type");
  const credentialFunding = requiredString(row, "credential_funding");
  if (
    !["customer_deposit", "paid_allowance", "owner_budget", "none"].includes(
      fundingSourceType,
    ) ||
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
    outputMicrosPerMillionTokens: boundedInteger(
      row,
      "output_micros_per_million_tokens",
    ),
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
): number {
  const amount = Math.ceil(
    (inputUnits * context.inputMicrosPerMillionTokens +
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
 * Completes one accepted OpenAI text operation. The route callback must return
 * only after its creator-facing result has been validated and persisted in
 * Tongs. This function then writes the generic replay receipt and settles once.
 */
export async function executePaidOpenAiTextRoute<
  TProvider,
  TCanonical extends Record<string, unknown>,
>(
  args: ExecutePaidOpenAiTextRouteArgs<TProvider, TCanonical>,
): Promise<PaidOpenAiTextRouteOutcome<TCanonical>> {
  const resolved = await rpc(
    args.gate,
    "resolve_openai_text_paid_execution_context",
    {
      p_route_code: args.routeCode,
      p_operation_id: args.handle.operationId,
      p_reservation_id: args.handle.reservationId,
      p_user_id: args.userId,
      p_workspace_id: args.workspaceId,
      p_workpiece_id: args.workpieceId,
      p_request_fingerprint: args.handle.requestFingerprint,
    },
  );
  const context = parseContext(resolved);
  if (context.routeCode !== args.routeCode) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  const expectedRequestFingerprint = await sha256Hex(
    args.requestFingerprintPayload,
  );
  if (expectedRequestFingerprint !== args.handle.requestFingerprint) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  if (
    !Number.isSafeInteger(args.inputUnitUpperBound) ||
    args.inputUnitUpperBound < 0 ||
    args.inputUnitUpperBound > context.maximumInputUnits
  ) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
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
    return {
      state: "submission_unknown",
      customerChargeMicros: 0,
      attempts: 0,
      context,
    };
  }
  if (context.reservationState === "provider_attempt_shadowed") {
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
    reservationAlreadyCreated: true,
    executeProvider: async (attemptNumber) => {
      const result = await args.executeProvider(context, attemptNumber);
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
