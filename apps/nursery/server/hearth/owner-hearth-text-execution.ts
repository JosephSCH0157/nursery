import { Buffer } from "node:buffer";
import {
  ForgeOwnerExecutionCoordinator,
  ForgeOwnerProviderBoundaryError,
  deriveForgeOwnerAttemptIdentity,
  deriveForgeOwnerOperationIdentity,
  forgeOwnerCredentialIdentityHash,
  forgeOwnerSha256,
  type ForgeOwnerOperationIdentity,
  type OwnerAttemptSnapshot,
  type OwnerFinancialEnvironment,
  type OwnerRuntimeEnvironment,
} from "../accounting/forge-owner-execution-coordinator";

type Json = Record<string, unknown>;

type OwnerTextAttemptSnapshot = Json & {
  events?: Json[];
};

type OwnerTextOperationSnapshot = {
  attempts?: OwnerTextAttemptSnapshot[];
};

export const HEARTH_OWNER_TEXT_MODEL = "gpt-5.6-luna" as const;
export const HEARTH_OWNER_TEXT_RATE = Object.freeze({
  inputMicrosPerMillion: 200_000,
  cachedInputMicrosPerMillion: 20_000,
  outputMicrosPerMillion: 1_200_000,
  revisionId: "openai-gpt-5.6-luna-standard-2026-07-30",
  source: "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
});

export type OwnerHearthTextRoute =
  | "hearth.chat_completion"
  | "hearth.script_generation"
  | "hearth.research_synthesis"
  | "hearth.title_generation"
  | "hearth.tag_generation"
  | "hearth.framing_pack_generation"
  | "hearth.thumbnail_direction_generation"
  | "visual.narrative_interpretation";

type OpenAiCapture = {
  status: number;
  body: string;
  headers: Record<string, string>;
  elapsedMs: number;
};

export type OwnerHearthTextResult = {
  result: Json;
  providerRequestId: string | null;
  inputUnits: number;
  outputUnits: number;
};

export type OwnerHearthTextExecutionInput = {
  coordinator: ForgeOwnerExecutionCoordinator;
  gate: { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> };
  authenticatedUserId: string;
  workspaceId: string;
  workpieceId: string;
  routeCode: OwnerHearthTextRoute;
  operationIntentId: string;
  financialEnvironment: OwnerFinancialEnvironment;
  runtimeEnvironment: OwnerRuntimeEnvironment;
  credential: string;
  providerBody: Json;
  providerEndpoint?: "/v1/chat/completions" | "/v1/responses";
  providerService?: "chat_completions" | "responses";
  logicalRequest: unknown;
  attemptNumber?: number;
  operationIdentity?: ForgeOwnerOperationIdentity;
  approval?: { id: string; revision: number; scriptContentHash: string } | null;
  signal?: AbortSignal;
  providerFetch?: typeof fetch;
  now?: () => number;
  parseAndValidate(payload: Json): Json;
  readPersistedResult?: (context: {
    attemptId: string;
    operationId: string;
    operationKey: string;
    requestFingerprint: string;
  }) => Promise<OwnerHearthTextResult | null>;
  persistResult?: (value: OwnerHearthTextResult, context: {
    attemptId: string;
    operationId: string;
    operationKey: string;
    requestFingerprint: string;
  }) => Promise<void>;
};

function object(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function attemptNumber(attempt: OwnerTextAttemptSnapshot): number | null {
  const value = Number(attempt.attempt_number);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function attemptState(attempt: OwnerTextAttemptSnapshot): string | null {
  const events = Array.isArray(attempt.events) ? attempt.events : [];
  return text(events.at(-1)?.lifecycle_state)?.toLowerCase() ?? null;
}

function responseHeaders(headers: Headers): Record<string, string> {
  const evidence: Record<string, string> = {};
  for (const name of ["x-request-id", "request-id", "openai-processing-ms", "x-ratelimit-limit-requests", "x-ratelimit-remaining-requests", "x-ratelimit-reset-requests"]) {
    const value = headers.get(name);
    if (value) evidence[name] = value;
  }
  return evidence;
}

function usage(payload: Json): { input: number; cachedInput: number; output: number } | null {
  const row = object(payload.usage);
  if (!row) return null;
  const input = Number(row.prompt_tokens ?? row.input_tokens);
  const output = Number(row.completion_tokens ?? row.output_tokens);
  const details = object(row.prompt_tokens_details ?? row.input_tokens_details);
  const cachedInput = Number(details?.cached_tokens ?? 0);
  if (![input, output, cachedInput].every((value) => Number.isSafeInteger(value) && value >= 0)
    || cachedInput > input) return null;
  return { input, cachedInput, output };
}

function directCostMicros(value: { input: number; cachedInput: number; output: number }): number {
  return Math.ceil((
    (value.input - value.cachedInput) * HEARTH_OWNER_TEXT_RATE.inputMicrosPerMillion
    + value.cachedInput * HEARTH_OWNER_TEXT_RATE.cachedInputMicrosPerMillion
    + value.output * HEARTH_OWNER_TEXT_RATE.outputMicrosPerMillion
  ) / 1_000_000);
}

function parseCapture(capture: OpenAiCapture): Json {
  const payload = object(JSON.parse(capture.body));
  if (!payload) throw new Error("OpenAI response must be a JSON object");
  return payload;
}

function recoveredCapture(attempt: OwnerAttemptSnapshot): OpenAiCapture | null {
  const response = attempt.events?.find((event) => event.lifecycle_state === "response_captured");
  const evidence = object(response?.private_provider_evidence);
  const body = text(evidence?.response_body);
  const status = Number(evidence?.http_status);
  if (!body || !Number.isSafeInteger(status)) return null;
  return {
    status,
    body,
    headers: object(evidence?.response_headers) as Record<string, string> | null ?? {},
    elapsedMs: Number(evidence?.elapsed_ms ?? 0),
  };
}

function valueFromPersisted(data: unknown): OwnerHearthTextResult | null {
  const row = object(data);
  const result = object(row?.result_json);
  return row && result ? {
    result: { ...result, ...row },
    providerRequestId: text(row.provider_request_id),
    inputUnits: Number(row.input_units ?? 0),
    outputUnits: Number(row.output_units ?? 0),
  } : null;
}

async function rpc(gate: OwnerHearthTextExecutionInput["gate"], name: string, args: Json): Promise<unknown> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message ?? "unknown error"}`);
  return result.data;
}

export function deriveOwnerHearthTextOperation(args: Pick<OwnerHearthTextExecutionInput,
  "financialEnvironment" | "runtimeEnvironment" | "workspaceId" | "workpieceId" | "routeCode" | "operationIntentId" | "logicalRequest">): ForgeOwnerOperationIdentity {
  return deriveForgeOwnerOperationIdentity({
    financialEnvironment: args.financialEnvironment,
    runtimeEnvironment: args.runtimeEnvironment,
    originatingTool: "hearth",
    operationType: args.routeCode,
    stableOperationInput: {
      workspace_id: args.workspaceId,
      workpiece_id: args.workpieceId,
      operation_intent_id: args.operationIntentId,
      route_code: args.routeCode,
    },
    exactRequestInput: args.logicalRequest,
  });
}

export async function selectExplicitOwnerHearthTextAttemptNumber(args: {
  gate: OwnerHearthTextExecutionInput["gate"];
  operationIdentity: ForgeOwnerOperationIdentity;
  credential: string;
  providerBody: Json;
  providerEndpoint?: "/v1/chat/completions" | "/v1/responses";
  providerService?: "chat_completions" | "responses";
}): Promise<number> {
  if (!args.credential.trim()) throw new Error("Hearth owner OpenAI credential is required");
  const model = text(args.providerBody.model);
  if (model !== HEARTH_OWNER_TEXT_MODEL) throw new Error("Hearth owner text model must be gpt-5.6-luna");
  const providerEndpoint = args.providerEndpoint ?? "/v1/chat/completions";
  const providerService = args.providerService ?? "chat_completions";
  const credentialIdentityHash = forgeOwnerCredentialIdentityHash(args.credential);
  const result = await args.gate.rpc("read_owner_cost_operation", {
    p_operation_id: args.operationIdentity.operationId,
  });
  if (result.error) {
    throw new Error(`read_owner_cost_operation: ${result.error.message ?? "unknown error"}`);
  }
  const snapshot = object(result.data) as OwnerTextOperationSnapshot | null;
  const attempts = (snapshot?.attempts ?? [])
    .map((attempt) => ({ attempt, number: attemptNumber(attempt) }))
    .filter((row): row is { attempt: OwnerTextAttemptSnapshot; number: number } => row.number !== null)
    .sort((left, right) => left.number - right.number);
  if (attempts.length === 0) return 1;

  const exactProviderRequest = { method: "POST", path: providerEndpoint, body: args.providerBody };
  for (const row of [...attempts].reverse()) {
    const identity = deriveForgeOwnerAttemptIdentity({
      operation: args.operationIdentity,
      attemptNumber: row.number,
      provider: "openai",
      service: providerService,
      model,
      sku: model,
      credentialIdentityHash,
      exactProviderRequest,
    });
    if (text(row.attempt.request_fingerprint)?.toLowerCase() === identity.requestFingerprint) {
      return row.number;
    }
  }

  const latest = attempts.at(-1)!;
  const state = attemptState(latest.attempt);
  if (["submission_unknown", "authorized", "submitted", "response_captured"].includes(state ?? "")) {
    throw new Error(`Owner provider attempt ${latest.number} is unresolved (${state}) and cannot be retried`);
  }
  if (state !== "definitively_rejected" && state !== "failed") {
    throw new Error(`Owner provider attempt ${latest.number} is not eligible for explicit retry (${state ?? "unknown"})`);
  }
  return latest.number + 1;
}

export async function executeOwnerHearthText(input: OwnerHearthTextExecutionInput) {
  if (!input.credential.trim()) throw new Error("Hearth owner OpenAI credential is required");
  const model = text(input.providerBody.model);
  if (model !== HEARTH_OWNER_TEXT_MODEL) throw new Error("Hearth owner text model must be gpt-5.6-luna");
  const operationIdentity = input.operationIdentity ?? deriveOwnerHearthTextOperation(input);
  if (operationIdentity.operationType !== input.routeCode) throw new Error("Hearth owner operation route mismatch");
  const attemptNumber = input.attemptNumber ?? 1;
  const credentialIdentityHash = forgeOwnerCredentialIdentityHash(input.credential);
  const providerFetch = input.providerFetch ?? fetch;
  const now = input.now ?? Date.now;
  const providerEndpoint = input.providerEndpoint ?? "/v1/chat/completions";
  const providerService = input.providerService ?? "chat_completions";
  const exactProviderRequest = { method: "POST", path: providerEndpoint, body: input.providerBody };
  const attemptIdentity = deriveForgeOwnerAttemptIdentity({
    operation: operationIdentity,
    attemptNumber,
    provider: "openai",
    service: providerService,
    model,
    sku: model,
    credentialIdentityHash,
    exactProviderRequest,
  });

  return input.coordinator.executeAttempt<OpenAiCapture, OwnerHearthTextResult>({
    authenticatedUserId: input.authenticatedUserId,
    routeCode: input.routeCode,
    operation: {
      identity: operationIdentity,
      runtimeEnvironment: input.runtimeEnvironment,
      originatingTool: "hearth",
      operationType: input.routeCode,
      attribution: { workspaceId: input.workspaceId, workpieceId: input.workpieceId },
      creationEvidence: {
        schema: "forge.hearth.owner-text-operation.v1",
        operation_intent_id: input.operationIntentId,
        provider: "openai",
        service: providerService,
        model,
      },
    },
    attempt: {
      attemptNumber,
      provider: "openai",
      service: providerService,
      model,
      sku: model,
      credentialIdentityHash,
      exactProviderRequest,
      defaultCostComponent: "openai_text",
      authorizationEvidence: { schema: "forge.hearth.owner-openai-authorization.v1" },
      submissionEvidence: {
        schema: "forge.hearth.owner-openai-submission.v1",
        request_body_sha256: forgeOwnerSha256(JSON.stringify(input.providerBody)),
      },
    },
    readPersistedResult: async () => {
      const value = input.readPersistedResult
        ? await input.readPersistedResult({
          attemptId: attemptIdentity.attemptId,
          operationId: operationIdentity.operationId,
          operationKey: operationIdentity.operationKey,
          requestFingerprint: operationIdentity.requestFingerprint,
        })
        : valueFromPersisted(await rpc(input.gate, "read_owner_hearth_text_result", {
          p_owner_cost_attempt_id: attemptIdentity.attemptId,
          p_route_code: input.routeCode,
        }));
      return value ? { found: true, value } : { found: false };
    },
    submitProvider: async () => {
      const startedAt = now();
      let response: Response;
      try {
        response = await providerFetch(`https://api.openai.com${providerEndpoint}`, {
          method: "POST",
          headers: { authorization: `Bearer ${input.credential}`, "content-type": "application/json" },
          body: JSON.stringify(input.providerBody),
          signal: input.signal,
        });
      } catch (error) {
        throw new ForgeOwnerProviderBoundaryError({
          message: "OpenAI submission outcome is unknown",
          outcome: "submission_unknown",
          privateProviderEvidence: {
            schema: "forge.hearth.owner-openai-transport-failure.v1",
            elapsed_ms: Math.max(0, now() - startedAt),
            transport_error_name: error instanceof Error ? error.name : "unknown",
          },
          cause: error,
        });
      }
      const headers = responseHeaders(response.headers);
      const providerReferenceId = headers["x-request-id"] ?? headers["request-id"] ?? null;
      let body: string;
      try {
        body = await response.text();
      } catch (error) {
        throw new ForgeOwnerProviderBoundaryError({
          message: "OpenAI response capture is incomplete",
          outcome: "submission_unknown",
          providerReferenceId,
          privateProviderEvidence: { http_status: response.status, response_headers: headers },
          cause: error,
        });
      }
      const bodyBytes = Buffer.byteLength(body, "utf8");
      if (!response.ok) {
        throw new ForgeOwnerProviderBoundaryError({
          message: `OpenAI definitively rejected the request with HTTP ${response.status}`,
          outcome: "definitively_rejected",
          providerReferenceId,
          normalizedUsage: { http_status: response.status },
          privateProviderEvidence: {
            http_status: response.status,
            response_headers: headers,
            response_body_sha256: forgeOwnerSha256(body),
            response_body_excerpt: body.slice(0, 2_048),
            response_bytes: bodyBytes,
            elapsed_ms: Math.max(0, now() - startedAt),
          },
        });
      }
      let parsed: Json | null = null;
      try {
        parsed = object(JSON.parse(body));
      } catch {
        // Capture the successful provider response first. Product parsing and
        // validation happen after the response_captured evidence is durable.
      }
      const measuredUsage = parsed ? usage(parsed) : null;
      const valuations = measuredUsage ? [{
        costComponent: "openai_text",
        basis: "usage_calculated" as const,
        amountMicros: directCostMicros(measuredUsage),
        currency: "USD",
        recognitionMode: "journal_recognized" as const,
        rateRevisionId: HEARTH_OWNER_TEXT_RATE.revisionId,
        normalizedUsage: {
          input_tokens: measuredUsage.input,
          cached_input_tokens: measuredUsage.cachedInput,
          output_tokens: measuredUsage.output,
        },
        privateEvidence: {
          schema: "forge.hearth.owner-openai-rate-evidence.v1",
          rate_source: HEARTH_OWNER_TEXT_RATE.source,
          input_micros_per_million: HEARTH_OWNER_TEXT_RATE.inputMicrosPerMillion,
          cached_input_micros_per_million: HEARTH_OWNER_TEXT_RATE.cachedInputMicrosPerMillion,
          output_micros_per_million: HEARTH_OWNER_TEXT_RATE.outputMicrosPerMillion,
          customer_markup_applied: false,
        },
      }] : [{
        costComponent: "openai_text",
        basis: "estimated" as const,
        amountMicros: 0,
        currency: "USD",
        recognitionMode: "evidence_only" as const,
        unresolvedReason: "openai_response_missing_defensible_usage",
        privateEvidence: { zero_is_not_asserted_provider_cost: true },
      }];
      return {
        capture: { status: response.status, body, headers, elapsedMs: Math.max(0, now() - startedAt) },
        providerReferenceId,
        normalizedUsage: measuredUsage ? {
          input_tokens: measuredUsage.input,
          cached_input_tokens: measuredUsage.cachedInput,
          output_tokens: measuredUsage.output,
          http_status: response.status,
        } : { http_status: response.status },
        privateProviderEvidence: {
          schema: "forge.hearth.owner-openai-response.v1",
          http_status: response.status,
          response_headers: headers,
          response_body: body,
          response_body_sha256: forgeOwnerSha256(body),
          response_bytes: bodyBytes,
          elapsed_ms: Math.max(0, now() - startedAt),
        },
        valuations,
      };
    },
    parseResult: (capture) => {
      const payload = parseCapture(capture);
      const measuredUsage = usage(payload);
      return {
        result: input.parseAndValidate(payload),
        providerRequestId: text(payload.id),
        inputUnits: measuredUsage?.input ?? 0,
        outputUnits: measuredUsage?.output ?? 0,
      };
    },
    validateResult: () => undefined,
    persistResult: async (value, context) => {
      if (input.persistResult) {
        await input.persistResult(value, {
          ...context,
          operationKey: operationIdentity.operationKey,
        });
        return;
      }
      const resultJson = value.result;
      const resultHash = forgeOwnerSha256(JSON.stringify(resultJson));
      await rpc(input.gate, "persist_owner_hearth_text_result", {
        p_owner_cost_attempt_id: context.attemptId,
        p_route_code: input.routeCode,
        p_user_id: input.authenticatedUserId,
        p_workspace_id: input.workspaceId,
        p_workpiece_id: input.workpieceId,
        p_request_fingerprint: context.requestFingerprint,
        p_financial_environment: input.financialEnvironment,
        p_runtime_environment: input.runtimeEnvironment,
        p_provider_request_id: value.providerRequestId,
        p_model: model,
        p_input_units: value.inputUnits,
        p_output_units: value.outputUnits,
        p_result_hash: resultHash,
        p_result_json: resultJson,
        p_approval_id: input.approval?.id ?? null,
        p_approval_revision: input.approval?.revision ?? null,
        p_script_content_hash: input.approval?.scriptContentHash ?? null,
      });
    },
    recoverCapturedResult: async (attempt) => {
      const capture = recoveredCapture(attempt);
      if (!capture) return null;
      const payload = parseCapture(capture);
      const measuredUsage = usage(payload);
      return {
        value: {
          result: input.parseAndValidate(payload),
          providerRequestId: text(payload.id),
          inputUnits: measuredUsage?.input ?? 0,
          outputUnits: measuredUsage?.output ?? 0,
        },
        valuations: measuredUsage ? [{
          costComponent: "openai_text",
          basis: "usage_calculated",
          amountMicros: directCostMicros(measuredUsage),
          currency: "USD",
          recognitionMode: "journal_recognized",
          rateRevisionId: HEARTH_OWNER_TEXT_RATE.revisionId,
          normalizedUsage: measuredUsage,
          privateEvidence: { rate_source: HEARTH_OWNER_TEXT_RATE.source, recovered: true },
        }] : undefined,
      };
    },
  });
}
