import {
  estimateOpenAiTextDirectCostMicros,
  executePaidOpenAiTextRoute,
  type OpenAiTextCredentialSource,
  type OpenAiTextPaidExecutionHandle,
} from "../../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import {
  OpenAiTextProviderError,
  type OpenAiTextGateClient,
} from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";
import type { OpenAiTextRouteCode } from "../../../../packages/tongs/src/providers/openai-text-paid-boundary";

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

function readUsage(payload: unknown): { input: number; output: number } {
  const usage = asObject(asObject(payload).usage);
  const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const output = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
  return {
    input: Number.isSafeInteger(input) && input >= 0 ? input : 0,
    output: Number.isSafeInteger(output) && output >= 0 ? output : 0,
  };
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
  apiKey: string;
  requestFingerprintPayload: unknown;
  providerRequestBody: (model: string) => JsonObject;
  providerUrl?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  validate: (payload: JsonObject) => TValidated;
  persist?: (value: TValidated, payload: JsonObject) => Promise<TCanonical>;
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
  const bodyForBound = args.providerRequestBody("model-bound-by-accepted-quote");
  const outcome = await executePaidOpenAiTextRoute<JsonObject, TCanonical>({
    gate: args.gate,
    routeCode: args.routeCode,
    handle: args.handle,
    userId: args.userId,
    workspaceId: args.workspaceId,
    workpieceId: args.workpieceId,
    credentialSource: args.credentialSource,
    inputUnitUpperBound: new TextEncoder().encode(JSON.stringify(bodyForBound)).byteLength,
    requestFingerprintPayload: args.requestFingerprintPayload,
    executeProvider: async (context) => {
      let response: Response;
      try {
        response = await (args.fetchImpl ?? fetch)(
          args.providerUrl ?? "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${args.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(args.providerRequestBody(context.model)),
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
            ? estimateOpenAiTextDirectCostMicros(
                context,
                usage.input,
                usage.output,
              )
            : 0,
        supplierCostAuthoritative: false,
        supportingCostMicros: context.supportingCostCeilingMicros,
        supportingCostAuthoritative: false,
        supportingCostEvidence: {
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
        },
      };
    },
    validateResult: (payload) => {
      validated = args.validate(payload);
    },
    persistCanonical: async (_payload) => {
      if (!validated) throw new Error("validated route result missing");
      return args.persist
        ? args.persist(validated, providerPayload)
        : (validated as unknown as TCanonical);
    },
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
