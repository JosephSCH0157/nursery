import crypto from "node:crypto";
import { openAiProviderHeaders } from "../../../../packages/tongs/src/providers/openai-forge-project";
import {
  OpenAiTextBoundaryError,
} from "../../../../packages/tongs/src/providers/openai-text-paid-boundary";
import {
  assertOpenAiTextProviderExecutionAuthorization,
  OpenAiTextProviderError,
  PaidOpenAiTextExecutionCoordinator,
  type OpenAiTextGateClient,
  type PaidOpenAiTextExecutionResult,
} from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";
import {
  boundedProviderRequestEvidence,
  buildBoundedOpenAiProviderRequest,
} from "../../../../packages/tongs/src/providers/bounded-provider-request";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

export type HearthPaidExecutionHandle = {
  operationId: string;
  reservationId: string;
  requestFingerprint: string;
};

export type HearthSpendingQuoteAcceptance = {
  operationId: string;
  quoteId: string;
  quoteHash: string;
  requestFingerprint: string;
};

export type HearthCustomerPaidIdentifiers = {
  operationId: string;
  quoteId: string;
  reservationId: string;
  acceptanceId: string;
  requestFingerprint: string;
};

export type PaidHearthChatResult = {
  assistantText: string;
  ops: unknown[];
  scriptText: string | null;
  tagAudit: Record<string, unknown> | null;
};

type HearthProviderPayload = { rawReply: string };

type PaidContext = {
  operationId: string;
  reservationId: string;
  quoteId: string;
  fundingSourceType: "customer_deposit" | "paid_allowance" | "owner_budget" | "none";
  fundingSourceId: string | null;
  credentialFunding: "forge" | "byo_customer";
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
  reservationState: string;
};

export type ExecutePaidHearthChatArgs = {
  gate: OpenAiTextGateClient;
  handle: HearthPaidExecutionHandle;
  userId: string;
  workspaceId: string | null;
  workpieceId: string;
  credentialSource: "forge_managed" | "user_byo" | "org_shared";
  apiKey: string;
  messages: Array<{ role: string; content: string }>;
  signal: AbortSignal;
  providerFetch?: typeof fetch;
  validateAndNormalize: (rawReply: string) => PaidHearthChatResult;
};

type PaidHearthChatSettledOutcome = {
  result: PaidHearthChatResult;
  requestId: string | null;
  attempts: number;
  customerChargeMicros: number;
  inputUnits: number;
  outputUnits: number;
  context: PaidContext;
};

export type PaidHearthChatExecutionOutcome =
  | ({ state: "settled" } & PaidHearthChatSettledOutcome)
  | ({ state: "settled_replay" } & PaidHearthChatSettledOutcome)
  | ({
    state: "failed_released";
    customerChargeMicros: 0;
    supplierCostMicros: number | null;
    requestId: string | null;
    attempts: number;
    context: PaidContext;
  })
  | ({ state: "submission_unknown"; customerChargeMicros: 0; attempts: number; context: PaidContext })
  | ({ state: "duplicate_in_progress"; customerChargeMicros: 0; attempts: number; context: PaidContext });

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new OpenAiTextBoundaryError("funding_context_required");
  return value.trim();
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedInteger(row: Record<string, unknown>, key: string, minimum = 0): number {
  const value = row[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new OpenAiTextBoundaryError("funding_context_required");
  return parsed;
}

function parseContext(value: unknown): PaidContext {
  const row = asRecord(value);
  const fundingSourceType = requiredString(row, "funding_source_type");
  const credentialFunding = requiredString(row, "credential_funding");
  if (!["customer_deposit", "paid_allowance", "owner_budget", "none"].includes(fundingSourceType)) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  if (credentialFunding !== "forge" && credentialFunding !== "byo_customer") {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  return {
    operationId: requiredString(row, "operation_id"),
    reservationId: requiredString(row, "reservation_id"),
    quoteId: requiredString(row, "quote_id"),
    fundingSourceType: fundingSourceType as PaidContext["fundingSourceType"],
    fundingSourceId: nullableString(row, "funding_source_id"),
    credentialFunding,
    model: requiredString(row, "model"),
    maximumInputUnits: boundedInteger(row, "maximum_input_units", 1),
    maximumOutputUnits: boundedInteger(row, "maximum_output_units", 1),
    maximumAttempts: boundedInteger(row, "maximum_attempts", 1),
    maximumFailureExposureMicros: boundedInteger(row, "maximum_failure_exposure_micros"),
    directProviderCeilingMicros: boundedInteger(row, "direct_provider_ceiling_micros"),
    supportingCostCeilingMicros: boundedInteger(row, "supporting_cost_ceiling_micros"),
    inputMicrosPerMillionTokens: boundedInteger(row, "input_micros_per_million_tokens"),
    cachedInputMicrosPerMillionTokens: row.cached_input_micros_per_million_tokens == null
      ? 0
      : boundedInteger(row, "cached_input_micros_per_million_tokens"),
    outputMicrosPerMillionTokens: boundedInteger(row, "output_micros_per_million_tokens"),
    reservationState: requiredString(row, "reservation_state"),
  };
}

export function normalizeHearthPaidExecutionHandle(value: unknown): HearthPaidExecutionHandle | null {
  const row = asRecord(value);
  const operationId = typeof row.operation_id === "string" ? row.operation_id.trim() : "";
  const reservationId = typeof row.reservation_id === "string" ? row.reservation_id.trim() : "";
  const requestFingerprint = typeof row.request_fingerprint === "string" ? row.request_fingerprint.trim().toLowerCase() : "";
  if (operationId.length < 8 || !UUID_RE.test(reservationId) || !SHA256_RE.test(requestFingerprint)) return null;
  return { operationId, reservationId, requestFingerprint };
}

export function normalizeHearthSpendingQuoteAcceptance(value: unknown): HearthSpendingQuoteAcceptance | null {
  const row = asRecord(value);
  const operationId = typeof row.operation_id === "string" ? row.operation_id.trim() : "";
  const quoteId = typeof row.quote_id === "string" ? row.quote_id.trim() : "";
  const quoteHash = typeof row.quote_hash === "string" ? row.quote_hash.trim().toLowerCase() : "";
  const requestFingerprint = typeof row.request_fingerprint === "string"
    ? row.request_fingerprint.trim().toLowerCase()
    : "";
  if (operationId.length < 8 || !UUID_RE.test(quoteId) || !SHA256_RE.test(quoteHash)
    || !SHA256_RE.test(requestFingerprint)) return null;
  return { operationId, quoteId, quoteHash, requestFingerprint };
}

function uuidFromDigest(digest: string): string {
  const value = digest.slice(0, 32).split("");
  value[12] = "4";
  value[16] = ["8", "9", "a", "b"][Number.parseInt(value[16] ?? "0", 16) % 4] ?? "8";
  const joined = value.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

export function deriveHearthCustomerPaidIdentifiers(args: {
  userId: string;
  workspaceId: string;
  requestFingerprint: string;
}): HearthCustomerPaidIdentifiers {
  if (!UUID_RE.test(args.userId) || !UUID_RE.test(args.workspaceId) || !SHA256_RE.test(args.requestFingerprint)) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  const operationDigest = crypto.createHash("sha256").update(
    `hearth-customer-operation:${args.userId}:${args.workspaceId}:${args.requestFingerprint}`,
  ).digest("hex");
  const operationId = `hearth-customer-${operationDigest}`;
  const quoteId = uuidFromDigest(crypto.createHash("sha256").update(`hearth-customer-quote:${operationId}`).digest("hex"));
  return {
    operationId,
    quoteId,
    reservationId: uuidFromDigest(crypto.createHash("sha256").update(`hearth-customer-reservation:${quoteId}`).digest("hex")),
    acceptanceId: uuidFromDigest(crypto.createHash("sha256").update(`hearth-customer-acceptance:${quoteId}`).digest("hex")),
    requestFingerprint: args.requestFingerprint,
  };
}

export function fingerprintPaidHearthChatRequest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readUsage(payload: unknown): { input: number; cachedInput: number; output: number } {
  const usage = asRecord(asRecord(payload).usage);
  const input = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? 0;
  const details = asRecord(usage.prompt_tokens_details ?? usage.input_tokens_details);
  const cachedInput = details.cached_tokens ?? 0;
  return {
    input: Number.isSafeInteger(Number(input)) && Number(input) >= 0 ? Number(input) : 0,
    cachedInput: Number.isSafeInteger(Number(cachedInput)) && Number(cachedInput) >= 0 && Number(cachedInput) <= Number(input) ? Number(cachedInput) : 0,
    output: Number.isSafeInteger(Number(output)) && Number(output) >= 0 ? Number(output) : 0,
  };
}

function extractReply(payload: unknown): string {
  const choices = asRecord(payload).choices;
  if (!Array.isArray(choices)) return "";
  const message = asRecord(asRecord(choices[0]).message);
  return typeof message.content === "string" ? message.content.trim() : "";
}

export async function buildBoundedHearthChatProviderRequest(args: {
  messages: Array<{ role: string; content: string }>;
  model: string;
  maximumOutputTokens: number;
  maximumAttempts: number;
}) {
  return buildBoundedOpenAiProviderRequest({
    body: {
      model: args.model,
      messages: args.messages,
      max_completion_tokens: args.maximumOutputTokens,
    },
    model: args.model,
    maximumOutputTokens: args.maximumOutputTokens,
    maximumAttempts: args.maximumAttempts,
    serviceTier: "standard",
  });
}

function estimateDirectCostMicros(context: PaidContext, input: number, output: number, cachedInput = 0): number {
  const amount = Math.ceil(
    ((input - cachedInput) * context.inputMicrosPerMillionTokens
      + cachedInput * context.cachedInputMicrosPerMillionTokens
      + output * context.outputMicrosPerMillionTokens) / 1_000_000,
  );
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > context.directProviderCeilingMicros) {
    throw new OpenAiTextProviderError("OpenAI usage exceeded accepted direct-provider ceiling", false, amount, {
      reason: "direct_provider_ceiling_exceeded",
    });
  }
  return amount;
}

async function rpc(gate: OpenAiTextGateClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

export async function executePaidHearthChatCompletion(
  args: ExecutePaidHearthChatArgs,
): Promise<PaidHearthChatExecutionOutcome> {
  const resolved = await rpc(args.gate, "resolve_openai_text_paid_execution_context", {
    p_operation_id: args.handle.operationId,
    p_reservation_id: args.handle.reservationId,
    p_user_id: args.userId,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_request_fingerprint: args.handle.requestFingerprint,
    p_route_code: "hearth.chat_completion",
  });
  const context = parseContext(resolved);
  const credentialMatches = context.credentialFunding === "forge"
    ? args.credentialSource === "forge_managed"
    : args.credentialSource === "user_byo";
  if (!credentialMatches) throw new OpenAiTextBoundaryError(
    context.credentialFunding === "byo_customer" ? "byo_credential_required" : "funding_context_required",
  );

  if (context.reservationState === "settled") {
    const stored = asRecord(await rpc(args.gate, "read_hearth_chat_paid_result", {
      p_operation_id: context.operationId,
      p_reservation_id: context.reservationId,
      p_user_id: args.userId,
      p_request_fingerprint: args.handle.requestFingerprint,
    }));
    const replayInputUnits = boundedInteger(stored, "input_units");
    const replayOutputUnits = boundedInteger(stored, "output_units");
    const replayDirectCostMicros = context.credentialFunding === "forge"
      ? estimateDirectCostMicros(context, replayInputUnits, replayOutputUnits)
      : 0;
    await rpc(args.gate, "record_paid_operation_aggregate_outcome", {
      p_reservation_id: context.reservationId,
      p_event_key: `${context.operationId}:aggregate-settled-replay`,
      p_outcome: "settled_unconfirmed",
      p_supplier_obligation_micros: replayDirectCostMicros,
      p_supplier_recovery_micros: null,
      p_evidence_json: {
        provider: "openai",
        recovered_from_settled_replay: true,
        authoritative: false,
        provider_usage_reported: true,
        direct_cost_rounding_risk_micros: context.credentialFunding === "forge" ? 3 : 0,
        nonrealized_supporting_ceiling_micros: context.supportingCostCeilingMicros,
        supporting_cost_disposition: "no_verified_attributable_variable_cost",
      },
    });
    return {
      state: "settled_replay",
      result: asRecord(stored.result_json) as PaidHearthChatResult,
      requestId: nullableString(stored, "provider_request_id"),
      attempts: 0,
      customerChargeMicros: boundedInteger(stored, "customer_charge_micros"),
      inputUnits: boundedInteger(stored, "input_units"),
      outputUnits: boundedInteger(stored, "output_units"),
      context,
    };
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
    return { state: "submission_unknown", customerChargeMicros: 0, attempts: 0, context };
  }
  if (context.reservationState === "provider_attempt_shadowed") {
    return { state: "duplicate_in_progress", customerChargeMicros: 0, attempts: 0, context };
  }
  if (context.reservationState !== "reserved") {
    return {
      state: "failed_released",
      customerChargeMicros: 0,
      supplierCostMicros: null,
      requestId: null,
      attempts: 0,
      context,
    };
  }

  const providerEvidence: {
    latest: { requestId: string | null; input: number; output: number } | null;
  } = { latest: null };
  let normalizedResult: PaidHearthChatResult | null = null;
  const providerFetch = args.providerFetch ?? fetch;
  const boundedRequest = await buildBoundedHearthChatProviderRequest({
    messages: args.messages,
    model: context.model,
    maximumOutputTokens: context.maximumOutputUnits,
    maximumAttempts: context.maximumAttempts,
  });
  if (boundedRequest.boundedInputTokens > context.maximumInputUnits) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
  await rpc(args.gate, "bind_bounded_provider_request", {
    p_reservation_id: context.reservationId,
    p_route_code: "hearth.chat_completion",
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
  const coordinator = new PaidOpenAiTextExecutionCoordinator(args.gate);
  const outcome: PaidOpenAiTextExecutionResult<HearthProviderPayload> = await coordinator.execute({
    routeCode: "hearth.chat_completion",
    reservationId: context.reservationId,
    quoteId: context.quoteId,
    fundingSourceType: context.fundingSourceType,
    fundingSourceId: context.fundingSourceId,
    reservationKey: `${context.operationId}:reservation`,
    attemptKey: `${context.operationId}:openai`,
    settlementId: crypto.randomUUID(),
    settlementKey: `${context.operationId}:settlement`,
    credentialFunding: context.credentialFunding,
    byoCredentialPresent: context.credentialFunding === "byo_customer" && args.credentialSource === "user_byo",
    model: context.model,
    maximumInputUnits: context.maximumInputUnits,
    maximumOutputUnits: context.maximumOutputUnits,
    maximumAttempts: context.maximumAttempts,
    maximumFailureExposureMicros: context.maximumFailureExposureMicros,
    aggregateCallerClass: "interactive",
    aggregateProviderMode: context.credentialFunding === "byo_customer" ? "byo" : "real",
    reservationAlreadyCreated: true,
    executeProvider: async (_attemptNumber, authorization) => {
      assertOpenAiTextProviderExecutionAuthorization(authorization);
      let response: Response;
      try {
        response = await providerFetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { ...openAiProviderHeaders(args.apiKey, context.credentialFunding), "content-type": "application/json" },
          body: boundedRequest.serializedBody,
          signal: args.signal,
        });
      } catch (error) {
        throw new OpenAiTextProviderError("OpenAI submission outcome is uncertain", true, null, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      const providerRequestId = response.headers.get("x-request-id");
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 2_000);
        throw new OpenAiTextProviderError("OpenAI rejected the bounded Hearth request", false, null, {
          provider_reference: providerRequestId,
          status: response.status,
          detail,
        });
      }
      const payload = await response.json() as unknown;
      const usage = readUsage(payload);
      const directCostMicros = context.credentialFunding === "forge"
        ? estimateDirectCostMicros(context, usage.input, usage.output, usage.cachedInput)
        : 0;
      const rawReply = extractReply(payload);
      providerEvidence.latest = { requestId: providerRequestId, input: usage.input, output: usage.output };
      return {
        value: { rawReply },
        requestId: providerRequestId,
        inputUnits: usage.input,
        outputUnits: usage.output,
        supplierCostMicros: directCostMicros,
        supplierCostAuthoritative: false,
        supportingCostMicros: 0,
        supportingCostAuthoritative: true,
        supportingCostEvidence: {
          allocation_kind: "nonrealized_conservative_ceiling",
          component: "bounded_validation_and_persistence",
          amount_micros: 0,
          ceiling_micros: context.supportingCostCeilingMicros,
          evidence_status: "no_verified_attributable_variable_cost",
          obligation_status: "excluded_from_realized_supplier_loss",
        },
        costCoverageComplete: true,
        evidence: {
          provider_reference: providerRequestId,
          provider_usage_reported: true,
          supplier_cost_status: context.credentialFunding === "forge" ? "estimated" : "customer_direct",
          supporting_cost_status: "no_verified_attributable_variable_cost",
          supporting_cost_estimate_micros: 0,
          supporting_cost_ceiling_micros: context.supportingCostCeilingMicros,
          cached_input_units: usage.cachedInput,
          reasoning_output_included: true,
          ...boundedProviderRequestEvidence(boundedRequest),
        },
      };
    },
    validateResult: (value) => {
      if (!value.rawReply) throw new Error("OpenAI returned no usable Hearth result");
      normalizedResult = args.validateAndNormalize(value.rawReply);
      if (!normalizedResult.assistantText.trim() && normalizedResult.ops.length === 0) {
        throw new Error("Hearth result is not usable");
      }
    },
    persistResult: async () => {
      const providerResult = providerEvidence.latest;
      if (!providerResult) throw new Error("Provider evidence missing before persistence");
      if (!normalizedResult) throw new Error("Validated Hearth result missing before persistence");
      const resultJson = {
        assistantText: normalizedResult.assistantText,
        ops: normalizedResult.ops,
        scriptText: normalizedResult.scriptText,
        tagAudit: normalizedResult.tagAudit,
      };
      const resultHash = crypto.createHash("sha256").update(JSON.stringify(resultJson)).digest("hex");
      await rpc(args.gate, "persist_hearth_chat_paid_result", {
        p_result_id: crypto.randomUUID(),
        p_operation_id: context.operationId,
        p_reservation_id: context.reservationId,
        p_user_id: args.userId,
        p_workspace_id: args.workspaceId,
        p_workpiece_id: args.workpieceId,
        p_request_fingerprint: args.handle.requestFingerprint,
        p_provider_request_id: providerResult.requestId,
        p_model: context.model,
        p_input_units: providerResult.input,
        p_output_units: providerResult.output,
        p_result_hash: resultHash,
        p_result_json: resultJson,
      });
    },
  });

  if (outcome.state === "settled") {
    if (!normalizedResult) throw new Error("Settled Hearth operation is missing its validated result");
    return {
      state: "settled",
      result: normalizedResult,
      requestId: outcome.requestId,
      attempts: outcome.attempts,
      customerChargeMicros: outcome.customerChargeMicros,
      inputUnits: providerEvidence.latest?.input ?? 0,
      outputUnits: providerEvidence.latest?.output ?? 0,
      context,
    };
  }
  if (outcome.state === "submission_unknown") {
    return { state: "submission_unknown", customerChargeMicros: 0, attempts: outcome.attempts, context };
  }
  return {
    state: "failed_released",
    customerChargeMicros: 0,
    supplierCostMicros: outcome.supplierCostMicros,
    requestId: providerEvidence.latest?.requestId ?? null,
    attempts: outcome.attempts,
    context,
  };
}
