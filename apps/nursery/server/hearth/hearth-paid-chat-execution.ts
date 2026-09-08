import crypto from "node:crypto";
import {
  OpenAiTextBoundaryError,
} from "../../../../packages/tongs/src/providers/openai-text-paid-boundary";
import {
  OpenAiTextProviderError,
  PaidOpenAiTextExecutionCoordinator,
  type OpenAiTextGateClient,
  type PaidOpenAiTextExecutionResult,
} from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

export type HearthPaidExecutionHandle = {
  operationId: string;
  reservationId: string;
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
  | ({ state: "failed_released"; customerChargeMicros: 0; attempts: number; context: PaidContext })
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

export function fingerprintPaidHearthChatRequest(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readUsage(payload: unknown): { input: number; output: number } {
  const usage = asRecord(asRecord(payload).usage);
  const input = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? 0;
  return {
    input: Number.isSafeInteger(Number(input)) && Number(input) >= 0 ? Number(input) : 0,
    output: Number.isSafeInteger(Number(output)) && Number(output) >= 0 ? Number(output) : 0,
  };
}

function extractReply(payload: unknown): string {
  const choices = asRecord(payload).choices;
  if (!Array.isArray(choices)) return "";
  const message = asRecord(asRecord(choices[0]).message);
  return typeof message.content === "string" ? message.content.trim() : "";
}

function estimateDirectCostMicros(context: PaidContext, input: number, output: number): number {
  const amount = Math.ceil(
    (input * context.inputMicrosPerMillionTokens + output * context.outputMicrosPerMillionTokens) / 1_000_000,
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
  const resolved = await rpc(args.gate, "resolve_hearth_chat_paid_execution_context", {
    p_operation_id: args.handle.operationId,
    p_reservation_id: args.handle.reservationId,
    p_user_id: args.userId,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_request_fingerprint: args.handle.requestFingerprint,
  });
  const context = parseContext(resolved);
  // UTF-8 bytes are a conservative upper bound for tokenizer units because an
  // encoded token cannot represent fewer than one input byte. This intentionally
  // rejects borderline requests before any provider boundary.
  const inputByteUpperBound = new TextEncoder().encode(JSON.stringify(args.messages)).byteLength;
  if (inputByteUpperBound > context.maximumInputUnits) {
    throw new OpenAiTextBoundaryError("funding_context_required");
  }
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
    return { state: "submission_unknown", customerChargeMicros: 0, attempts: 0, context };
  }
  if (context.reservationState === "provider_attempt_shadowed") {
    return { state: "duplicate_in_progress", customerChargeMicros: 0, attempts: 0, context };
  }
  if (context.reservationState !== "reserved") {
    return { state: "failed_released", customerChargeMicros: 0, attempts: 0, context };
  }

  const providerEvidence: {
    latest: { requestId: string | null; input: number; output: number } | null;
  } = { latest: null };
  let normalizedResult: PaidHearthChatResult | null = null;
  const providerFetch = args.providerFetch ?? fetch;
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
    reservationAlreadyCreated: true,
    executeProvider: async () => {
      let response: Response;
      try {
        response = await providerFetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${args.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: context.model,
            messages: args.messages,
            max_completion_tokens: context.maximumOutputUnits,
          }),
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
        ? estimateDirectCostMicros(context, usage.input, usage.output)
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
        supportingCostMicros: context.supportingCostCeilingMicros,
        supportingCostAuthoritative: false,
        supportingCostEvidence: {
          allocation_kind: "accepted_fixed_supporting_allocation",
          component: "bounded_validation_and_persistence",
          amount_micros: context.supportingCostCeilingMicros,
          ceiling_micros: context.supportingCostCeilingMicros,
          evidence_status: "estimated",
          obligation_status: "closed_after_canonical_persistence",
        },
        costCoverageComplete: true,
        evidence: {
          provider_reference: providerRequestId,
          provider_usage_reported: true,
          supplier_cost_status: context.credentialFunding === "forge" ? "estimated" : "customer_direct",
          supporting_cost_status: context.supportingCostCeilingMicros === 0 ? "not_applicable" : "estimated_allocation",
          supporting_cost_estimate_micros: context.supportingCostCeilingMicros,
          supporting_cost_ceiling_micros: context.supportingCostCeilingMicros,
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
  return { state: "failed_released", customerChargeMicros: 0, attempts: outcome.attempts, context };
}
