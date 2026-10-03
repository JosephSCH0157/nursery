import {
  estimateOpenAiTextDirectCostMicros,
  executePaidOpenAiTextRoute,
  type OpenAiTextCredentialSource,
  type OpenAiTextPaidExecutionHandle,
} from "../../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import {
  assertOpenAiTextProviderExecutionAuthorization,
  OpenAiTextProviderError,
  type OpenAiTextGateClient,
} from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";
import type { OpenAiTextRouteCode } from "../../../../packages/tongs/src/providers/openai-text-paid-boundary";
import type { AggregateAdmissionCallerClass } from "../../../../packages/tongs/src/providers/aggregate-financial-admission";
import {
  boundedProviderRequestEvidence,
  buildBoundedOpenAiProviderRequest,
  type BoundedProviderRequest,
} from "../../../../packages/tongs/src/providers/bounded-provider-request";
import { openAiProviderHeaders } from "../../../../packages/tongs/src/providers/openai-forge-project";

type JsonObject = Record<string, unknown>;

export class PaidJsonOpenAiRouteError extends Error {
  readonly state: "failed_released" | "submission_unknown" | "duplicate_in_progress";
  constructor(state: PaidJsonOpenAiRouteError["state"]) {
    super(state);
    this.name = "PaidJsonOpenAiRouteError";
    this.state = state;
  }
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function readUsage(payload: unknown): { input: number; cachedInput: number; cacheWriteInput: number; output: number } {
  const usage = asObject(asObject(payload).usage);
  const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const output = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
  const inputDetails = asObject(usage.input_tokens_details ?? usage.prompt_tokens_details);
  const cachedInput = Number(inputDetails.cached_tokens ?? 0);
  const cacheWriteInput = Number(
    inputDetails.cache_write_tokens
      ?? inputDetails.cache_creation_tokens
      ?? inputDetails.cache_creation_input_tokens
      ?? 0,
  );
  return {
    input: Number.isSafeInteger(input) && input >= 0 ? input : 0,
    cachedInput: Number.isSafeInteger(cachedInput) && cachedInput >= 0 && cachedInput <= input ? cachedInput : 0,
    cacheWriteInput: Number.isSafeInteger(cacheWriteInput) && cacheWriteInput >= 0 && cacheWriteInput <= input
      ? cacheWriteInput
      : 0,
    output: Number.isSafeInteger(output) && output >= 0 ? output : 0,
  };
}

export function providerBodyWithOutputBound(args: {
  body: JsonObject;
  providerUrl: string;
  maximumOutputTokens: number;
}): JsonObject {
  const body = { ...args.body };
  if (args.providerUrl.endsWith("/responses")) {
    body.max_output_tokens = args.maximumOutputTokens;
    delete body.max_completion_tokens;
  } else {
    body.max_completion_tokens = args.maximumOutputTokens;
    delete body.max_output_tokens;
  }
  return body;
}

export function buildBoundedPaidJsonOpenAiRequest(args: {
  body: JsonObject;
  providerUrl?: string;
  model: string;
  maximumOutputTokens: number;
  maximumAttempts: number;
}) {
  const providerUrl = args.providerUrl ?? "https://api.openai.com/v1/chat/completions";
  return buildBoundedOpenAiProviderRequest({
    body: providerBodyWithOutputBound({
      body: args.body,
      providerUrl,
      maximumOutputTokens: args.maximumOutputTokens,
    }),
    model: args.model,
    maximumOutputTokens: args.maximumOutputTokens,
    maximumAttempts: args.maximumAttempts,
    serviceTier: "standard",
  });
}

export async function executePaidJsonOpenAiRoute<
  TValidated extends Record<string, unknown>,
  TCanonical extends Record<string, unknown> = TValidated,
>(args: {
  gate: OpenAiTextGateClient;
  routeCode: Exclude<OpenAiTextRouteCode, "hearth.chat_completion">;
  handle: OpenAiTextPaidExecutionHandle;
  userId: string;
  workspaceId: string;
  workpieceId: string;
  credentialSource: OpenAiTextCredentialSource;
  callerClass?: AggregateAdmissionCallerClass;
  apiKey: string;
  requestFingerprintPayload: unknown;
  providerRequestBody: (model: string) => JsonObject;
  /** Exact payload durably frozen after supporting work and before submission. */
  frozenRequest?: BoundedProviderRequest;
  providerUrl?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /**
   * Realized attributable variable supporting cost. Omit only for legacy
   * routes whose existing adapter still reports its accepted supporting
   * ceiling as the provisional realized amount.
   */
  realizedSupportingCost?: {
    amountMicros: number;
    authoritative: boolean;
    evidence: JsonObject;
  };
  /** Private validation evidence; the raw response is never returned to customers. */
  validationEvidence?: {
    contractRevision: string;
    recordFailure: (failure: {
      operationId: string;
      reservationId: string;
      providerRequestId: string | null;
      model: string;
      inputUnits: number;
      outputUnits: number;
      rawProviderResponseText: string;
      errorCode: string;
      contractRevision: string;
    }) => Promise<void>;
  };
  validate: (payload: JsonObject) => TValidated;
  persist?: (value: TValidated, payload: JsonObject) => Promise<TCanonical>;
  /**
   * Reads a result already committed by the route's normal domain authority.
   * This is used only to finish billing after a response-loss or settlement
   * failure; it must never manufacture a result or invoke the provider.
   */
  recover?: () => Promise<{
    result: TCanonical;
    providerRequestId: string | null;
    inputUnits: number;
    outputUnits: number;
  } | null>;
}): Promise<{
  result: TCanonical;
  receipt: {
    operation_id: string;
    reservation_id: string;
    funding_source: string;
    customer_charge_micros: number;
    provider_request_id: string | null;
    status: "settled" | "settled_replay";
  };
}> {
  let validated: TValidated | null = null;
  let providerPayload: JsonObject = {};
  let rawProviderResponseText = "";
  let providerRequestId: string | null = null;
  let providerModel = "";
  const providerUrl = args.providerUrl ?? "https://api.openai.com/v1/chat/completions";
  const outcome = await executePaidOpenAiTextRoute<JsonObject, TCanonical>({
    gate: args.gate,
    routeCode: args.routeCode,
    handle: args.handle,
    userId: args.userId,
    workspaceId: args.workspaceId,
    workpieceId: args.workpieceId,
    credentialSource: args.credentialSource,
    callerClass: args.callerClass,
    requestFingerprintPayload: args.requestFingerprintPayload,
    prepareBoundedRequest: async (context) => {
      if (args.frozenRequest) {
        if (args.frozenRequest.model !== context.model
          || args.frozenRequest.maximumOutputTokens !== context.maximumOutputUnits
          || args.frozenRequest.maximumAttempts !== context.maximumAttempts) {
          throw new OpenAiTextProviderError("Frozen OpenAI request does not match accepted authority", false, 0, {
            reason: "frozen_provider_request_authority_mismatch",
          });
        }
        return args.frozenRequest;
      }
      return buildBoundedPaidJsonOpenAiRequest({
        body: args.providerRequestBody(context.model),
        providerUrl,
        model: context.model,
        maximumOutputTokens: context.maximumOutputUnits,
        maximumAttempts: context.maximumAttempts,
      });
    },
    executeProvider: async (context, _attemptNumber, boundedRequest, authorization) => {
      assertOpenAiTextProviderExecutionAuthorization(authorization);
      providerModel = context.model;
      if (!boundedRequest) throw new OpenAiTextProviderError(
        "The exact OpenAI request was not bound before submission",
        false,
        null,
        { reason: "bounded_provider_request_required" },
      );
      let response: Response;
      try {
        response = await (args.fetchImpl ?? fetch)(
          providerUrl,
          {
            method: "POST",
            headers: {
              ...openAiProviderHeaders(args.apiKey, context.credentialFunding),
              "content-type": "application/json",
            },
            body: boundedRequest.serializedBody,
            signal: args.signal,
          },
        );
      } catch (error) {
        throw new OpenAiTextProviderError(
          "OpenAI submission outcome is uncertain",
          true,
          null,
          { error: error instanceof Error ? error.message : String(error) },
        );
      }
      const requestId = response.headers.get("x-request-id");
      const text = await response.text();
      providerRequestId = requestId;
      rawProviderResponseText = text;
      try {
        providerPayload = asObject(JSON.parse(text));
      } catch {
        providerPayload = {};
      }
      if (!response.ok) {
        throw new OpenAiTextProviderError(
          "OpenAI rejected the bounded request",
          false,
          null,
          {
            provider_reference: requestId,
            status: response.status,
            detail: text.slice(0, 2_000),
          },
        );
      }
      const usage = readUsage(providerPayload);
      return {
        value: providerPayload,
        requestId,
        inputUnits: usage.input,
        outputUnits: usage.output,
        supplierCostMicros:
          context.credentialFunding === "forge"
            ? usage.cacheWriteInput > 0
              // The accepted Sol price reserves every bounded input token at
              // the cache-write rate. Until provider invoices make write cost
              // authoritative, record the accepted ceiling rather than
              // understating supplier exposure.
              ? context.directProviderCeilingMicros
              : estimateOpenAiTextDirectCostMicros(
                  context,
                  usage.input,
                  usage.output,
                  usage.cachedInput,
                )
            : 0,
        supplierCostAuthoritative: false,
        supportingCostMicros: args.realizedSupportingCost?.amountMicros
          ?? context.supportingCostCeilingMicros,
        supportingCostAuthoritative: args.realizedSupportingCost?.authoritative ?? false,
        supportingCostEvidence: args.realizedSupportingCost?.evidence ?? {
          allocation_kind: "accepted_fixed_supporting_allocation",
          component: "bounded_validation_and_tongs_persistence",
          evidence_status: "estimated",
        },
        costCoverageComplete: true,
        evidence: {
          provider_reference: requestId,
          supplier_cost_status:
            context.credentialFunding === "forge"
              ? "estimated"
              : "customer_direct",
          route_code: args.routeCode,
          cached_input_units: usage.cachedInput,
          cache_write_input_units: usage.cacheWriteInput,
          reasoning_output_included: true,
          ...boundedProviderRequestEvidence(boundedRequest),
          ...(args.validationEvidence
            ? { validation_contract_revision: args.validationEvidence.contractRevision }
            : {}),
        },
        privateCaptureEvidence: args.validationEvidence
          ? { raw_provider_response_text: text }
          : undefined,
      };
    },
    validateResult: async (payload) => {
      try {
        validated = args.validate(payload);
      } catch (error) {
        if (args.validationEvidence) {
          const usage = readUsage(payload);
          try {
            await args.validationEvidence.recordFailure({
              operationId: args.handle.operationId,
              reservationId: args.handle.reservationId,
              providerRequestId,
              model: providerModel,
              inputUnits: usage.input,
              outputUnits: usage.output,
              rawProviderResponseText,
              errorCode: error instanceof Error ? error.message : String(error),
              contractRevision: args.validationEvidence.contractRevision,
            });
          } catch {
            // The immutable provider capture already retained the raw response.
            // Preserve the original validation failure and zero-charge path.
          }
        }
        throw error;
      }
    },
    persistCanonical: async () => {
      if (!validated) throw new Error("validated route result missing");
      return args.persist
        ? args.persist(validated, providerPayload)
        : (validated as unknown as TCanonical);
    },
    recoverCanonical: args.recover,
  });
  if (outcome.state !== "settled" && outcome.state !== "settled_replay") {
    throw new PaidJsonOpenAiRouteError(outcome.state);
  }
  return {
    result: outcome.result,
    receipt: {
      operation_id: outcome.context.operationId,
      reservation_id: outcome.context.reservationId,
      funding_source: outcome.context.fundingSourceType,
      customer_charge_micros: outcome.customerChargeMicros,
      provider_request_id: outcome.requestId,
      status: outcome.state,
    },
  };
}
