import crypto from "node:crypto";
import type { OpenAiTextGateClient } from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";
import type { BoundedProviderRequest } from "../../../../packages/tongs/src/providers/bounded-provider-request";
import type { HearthPaidExecutionHandle } from "./hearth-paid-chat-execution";

type RpcResult = { data: unknown; error: { message: string } | null };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uuidFrom(value: string): string {
  const chars = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16] ?? "0", 16) % 4] ?? "8";
  const joined = chars.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

async function checkedRpc(gate: OpenAiTextGateClient, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return record(result.data);
}

export async function readOwnerHearthExecutionRequirement(args: {
  gate: OpenAiTextGateClient;
  userId: string;
  workspaceId: string;
}): Promise<Record<string, unknown>> {
  return checkedRpc(args.gate, "read_owner_hearth_execution_requirement", {
    p_owner_user_id: args.userId,
    p_workspace_id: args.workspaceId,
    p_route_code: "hearth.chat_completion",
  });
}

export async function prepareOwnerHearthOperation(args: {
  gate: OpenAiTextGateClient;
  userId: string;
  workspaceId: string;
  workpieceId: string;
  requestedProviderModelId: string | null;
  requestFingerprint: string;
  buildRequest: (model: string, maximumOutputTokens: number, maximumAttempts: number) => Promise<BoundedProviderRequest>;
}): Promise<{ handle: Omit<HearthPaidExecutionHandle, "fundingEnvironment">; model: string; boundedRequest: BoundedProviderRequest; authorizationKind: string }> {
  const exactModels = new Set([
    "gpt-6-astra",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.4-mini-2026-03-17",
    "gpt-5.6-luna",
  ]);
  const modelRow = await checkedRpc(args.gate, "resolve_owner_hearth_model_for_operation", {
    p_owner_user_id: args.userId,
    p_workspace_id: args.workspaceId,
    p_requested_provider_model_id: args.requestedProviderModelId && exactModels.has(args.requestedProviderModelId)
      ? args.requestedProviderModelId
      : null,
  });
  const model = typeof modelRow.provider_model_id === "string" ? modelRow.provider_model_id : "";
  const authorizationKind = typeof modelRow.authorization_kind === "string" ? modelRow.authorization_kind : "";
  const maximumOutputTokens = authorizationKind === "compatibility_batch" ? 512 : 8_000;
  if (!model || !["compatibility_batch", "creator_session"].includes(authorizationKind)) {
    throw new Error("owner Hearth model authority is incomplete");
  }
  const boundedRequest = await args.buildRequest(model, maximumOutputTokens, 1);
  const identity = `${args.userId}:${args.workspaceId}:${args.workpieceId}:${args.requestFingerprint}:${model}:${boundedRequest.serializedBodySha256}`;
  const operationId = `owner-hearth-${crypto.createHash("sha256").update(identity).digest("hex")}`;
  const operationAuthorizationId = uuidFrom(`owner-hearth-operation-authorization:${operationId}`);
  const quoteId = uuidFrom(`owner-hearth-quote:${operationId}`);
  const acceptanceId = uuidFrom(`owner-hearth-acceptance:${operationId}`);
  const reservationId = uuidFrom(`owner-hearth-reservation:${operationId}`);
  const prepared = await checkedRpc(args.gate, "prepare_owner_hearth_operation", {
    p_operation_authorization_id: operationAuthorizationId,
    p_quote_id: quoteId,
    p_acceptance_id: acceptanceId,
    p_reservation_id: reservationId,
    p_owner_user_id: args.userId,
    p_workspace_id: args.workspaceId,
    p_workpiece_id: args.workpieceId,
    p_operation_id: operationId,
    p_provider_model_id: model,
    p_request_fingerprint: args.requestFingerprint,
    p_serialized_body_sha256: boundedRequest.serializedBodySha256,
    p_serialized_bytes: boundedRequest.serializedBytes,
    p_tokenizer_input_tokens: boundedRequest.tokenizerInputTokens,
    p_protocol_overhead_tokens: boundedRequest.protocolOverheadTokens,
    p_bounded_input_tokens: boundedRequest.boundedInputTokens,
    p_maximum_output_tokens: boundedRequest.maximumOutputTokens,
    p_maximum_attempts: boundedRequest.maximumAttempts,
    p_estimator_revision: boundedRequest.estimatorRevision,
    p_tokenizer_revision: boundedRequest.tokenizerRevision,
    p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  return {
    handle: {
      operationId: String(prepared.operation_id ?? operationId),
      reservationId: String(prepared.reservation_id ?? reservationId),
      requestFingerprint: String(prepared.request_fingerprint ?? args.requestFingerprint),
    },
    model,
    boundedRequest,
    authorizationKind,
  };
}

/** Maps only the three admission RPCs to the owner-scoped authority. All capture,
 * persistence, settlement, relief, and reconciliation RPCs remain the shared path. */
export function ownerHearthExecutionGate(gate: OpenAiTextGateClient): OpenAiTextGateClient {
  const names: Record<string, string> = {
    resolve_openai_text_paid_execution_context: "resolve_owner_hearth_paid_execution_context",
    acquire_openai_text_aggregate_admission: "acquire_owner_hearth_aggregate_admission",
    authorize_openai_text_provider_attempt_with_aggregate: "authorize_owner_hearth_provider_attempt_with_aggregate",
    settle_owner_operation: "settle_owner_hearth_operation",
  };
  return {
    rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
      if (name === "resolve_openai_text_paid_execution_context") {
        const ownerArgs = { ...args };
        delete ownerArgs.p_route_code;
        return gate.rpc(names[name], ownerArgs);
      }
      return gate.rpc(names[name] ?? name, args);
    },
  };
}

export async function recordOwnerCompatibilityOutcome(args: {
  gate: OpenAiTextGateClient;
  reservationId: string;
  status: "passed" | "definitive_rejection" | "billed_failure" | "ambiguous";
  providerRequestId: string | null;
  estimatedSupplierExpenseMicros: number | null;
  evidence: Record<string, unknown>;
}): Promise<void> {
  await checkedRpc(args.gate, "record_owner_hearth_compatibility_result", {
    p_reservation_id: args.reservationId,
    p_result_key: `owner-hearth-compatibility:${args.reservationId}`,
    p_status: args.status,
    p_provider_request_id: args.providerRequestId,
    p_estimated_supplier_expense_micros: args.estimatedSupplierExpenseMicros,
    p_authoritative_supplier_expense_micros: null,
    p_evidence_json: { ...args.evidence, authoritative: false },
  });
}
