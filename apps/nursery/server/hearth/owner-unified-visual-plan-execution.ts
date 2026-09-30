import type {
  OwnerUnifiedVisualPlanExecutor,
  OwnerUnifiedVisualPlanValue,
} from "../../../../packages/tongs/src/workpiece-commit-api";
import {
  UNIFIED_VISUAL_PLAN_PROVIDER_CONTRACT_VERSION,
  arbitrateUnifiedVisualPlanCoverage,
  normalizeUnifiedVisualPlanContextAnchors,
  validateUnifiedVisualPlan,
  validateUnifiedVisualPlanScope,
  type UnifiedVisualPlanResult,
} from "../../../../packages/tongs/src/providers/unified-visual-plan-provider";
import {
  ForgeOwnerAuthorizationError,
  ForgeOwnerExecutionCoordinator,
  deriveForgeOwnerOperationIdentity,
  requireForgeOwnerExecutionAuthority,
  type OwnerAuthorityReader,
  type OwnerCostRpcGate,
  type OwnerFinancialEnvironment,
  type OwnerRuntimeEnvironment,
} from "../accounting/forge-owner-execution-coordinator";
import { readOwnerRuntimeEnvironment } from "../accounting/owner-runtime-environment";
import {
  executeOwnerHearthText,
  selectExplicitOwnerHearthTextAttemptNumber,
  type OwnerHearthTextResult,
} from "./owner-hearth-text-execution";

type Json = Record<string, unknown>;

function object(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function responseOutputText(payload: Json): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    const row = object(item);
    if (!Array.isArray(row?.content)) continue;
    for (const part of row.content) {
      const value = text(object(part)?.text);
      if (value) return value;
    }
  }
  return null;
}

function parseProviderValue(input: Parameters<OwnerUnifiedVisualPlanExecutor>[0], payload: Json): Json {
  const output = responseOutputText(payload);
  if (!output) throw new Error("Unified Visual Plan returned no structured output");
  let plan: UnifiedVisualPlanResult;
  try {
    plan = JSON.parse(output) as UnifiedVisualPlanResult;
  } catch {
    throw new Error("Unified Visual Plan returned invalid JSON");
  }
  plan = arbitrateUnifiedVisualPlanCoverage(
    normalizeUnifiedVisualPlanContextAnchors(plan, input.scriptText),
    input.scriptText,
  );
  const invalid = validateUnifiedVisualPlan(plan, input.scriptText, new Set(input.sourceKeys));
  const scopeInvalid = validateUnifiedVisualPlanScope(plan, input.generationScope);
  if (invalid.length || scopeInvalid.length) {
    throw new Error(`Invalid Unified Visual Plan fields: ${[...invalid, ...scopeInvalid].join(", ")}`);
  }
  const usage = object(payload.usage);
  return {
    plan,
    raw_response: payload,
    provider_request_id: text(payload.id),
    model: text(payload.model) ?? "gpt-5.6-luna",
    input_tokens: nonNegativeInteger(usage?.input_tokens),
    output_tokens: nonNegativeInteger(usage?.output_tokens),
  };
}

function ownerValue(result: OwnerHearthTextResult): OwnerUnifiedVisualPlanValue {
  const plan = object(result.result.plan);
  const rawResponse = object(result.result.raw_response);
  if (!plan || !rawResponse) throw new Error("Owner Unified Visual Plan result is incomplete");
  return {
    plan,
    rawResponse,
    providerRequestId: result.providerRequestId ?? text(result.result.provider_request_id),
    model: text(result.result.model) ?? "gpt-5.6-luna",
    inputTokens: result.inputUnits,
    outputTokens: result.outputUnits,
  };
}

async function rpc(gate: OwnerCostRpcGate, name: string, args?: Json): Promise<unknown> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message ?? "unknown error"}`);
  return result.data;
}

async function financialEnvironment(gate: OwnerCostRpcGate): Promise<OwnerFinancialEnvironment> {
  const data = object(await rpc(gate, "read_financial_runtime_environment"));
  const value = data?.financial_environment;
  if (value !== "test" && value !== "live") throw new Error("Owner financial environment is unavailable");
  return value;
}

function persistedValue(row: Json): OwnerHearthTextResult | null {
  const response = object(row.provider_response_json);
  const plan = object(response?.canonical_plan);
  const rawResponse = object(response?.raw_provider_response);
  if (!response || !plan || !rawResponse) return null;
  return {
    result: {
      plan,
      raw_response: rawResponse,
      provider_request_id: response.provider_request_id,
      model: response.model,
      input_tokens: response.input_units,
      output_tokens: response.output_units,
    },
    providerRequestId: text(response.provider_request_id),
    inputUnits: nonNegativeInteger(response.input_units),
    outputUnits: nonNegativeInteger(response.output_units),
  };
}

export function createOwnerUnifiedVisualPlanExecutor(args: {
  gate: OwnerCostRpcGate;
  coordinator: ForgeOwnerExecutionCoordinator;
  authorityReader: OwnerAuthorityReader;
  credential?: string;
  providerFetch?: typeof fetch;
  runtimeEnvironment?: OwnerRuntimeEnvironment;
}): OwnerUnifiedVisualPlanExecutor {
  return async (input) => {
    try {
      await requireForgeOwnerExecutionAuthority({
        reader: args.authorityReader,
        authenticatedUserId: input.authenticatedUserId,
        workspaceId: input.workspaceId,
        routeCode: "visual.unified_plan",
      });
    } catch (error) {
      if (error instanceof ForgeOwnerAuthorizationError && error.code === "owner_authority_not_configured") return null;
      throw error;
    }
    if (!args.credential?.trim()) throw new Error("The isolated Hearth owner OpenAI credential is unavailable");

    const financial = await financialEnvironment(args.gate);
    const runtime = args.runtimeEnvironment ?? readOwnerRuntimeEnvironment();
    const operationIdentity = deriveForgeOwnerOperationIdentity({
      financialEnvironment: financial,
      runtimeEnvironment: runtime,
      originatingTool: "hearth",
      operationType: "visual.unified_plan",
      stableOperationInput: {
        workspace_id: input.workspaceId,
        workpiece_id: input.workpieceId,
        route_code: "visual.unified_plan",
        canonical_visual_plan_fingerprint: input.canonicalInputFingerprint,
      },
      exactRequestInput: input.providerBody,
    });
    const attemptNumber = await selectExplicitOwnerHearthTextAttemptNumber({
      gate: args.gate,
      operationIdentity,
      credential: args.credential,
      providerBody: input.providerBody,
      providerEndpoint: "/v1/responses",
      providerService: "responses",
    });

    let canonicalResult: Record<string, unknown> | null = null;
    const complete = async () => {
      canonicalResult = await input.completeCanonical(
        operationIdentity.operationKey,
        operationIdentity.requestFingerprint,
        input.canonicalInputFingerprint,
      );
    };
    const execution = await executeOwnerHearthText({
      coordinator: args.coordinator,
      gate: args.gate,
      authenticatedUserId: input.authenticatedUserId,
      workspaceId: input.workspaceId,
      workpieceId: input.workpieceId,
      routeCode: "visual.unified_plan",
      operationIntentId: input.canonicalInputFingerprint,
      financialEnvironment: financial,
      runtimeEnvironment: runtime,
      credential: args.credential,
      providerBody: input.providerBody,
      providerEndpoint: "/v1/responses",
      providerService: "responses",
      logicalRequest: input.providerBody,
      operationIdentity,
      attemptNumber,
      providerFetch: args.providerFetch,
      parseAndValidate: (payload) => parseProviderValue(input, payload),
      beforeProviderSubmit: async (context) => {
        const begun = object(await rpc(args.gate, "begin_owner_unified_visual_plan", {
          p_owner_cost_attempt_id: context.attemptId,
          p_user_id: input.authenticatedUserId,
          p_workspace_id: input.workspaceId,
          p_workpiece_id: input.workpieceId,
          p_operation_fingerprint: context.requestFingerprint,
          p_financial_environment: financial,
          p_runtime_environment: runtime,
          p_script_approval_id: input.scriptApprovalId,
          p_expected_image_revision_id: input.expectedImageRevisionId,
          p_expected_image_revision: input.expectedImageRevision,
          p_expected_broll_revision_id: input.expectedBrollRevisionId,
          p_expected_broll_revision: input.expectedBrollRevision,
          p_expected_reference_revision_id: input.expectedReferenceRevisionId,
          p_expected_reference_revision: input.expectedReferenceRevision,
          p_expected_reference_visual_revision_id: input.expectedReferenceVisualRevisionId,
          p_expected_reference_visual_revision: input.expectedReferenceVisualRevision,
          p_normalized_inputs_json: input.normalizedInputs,
          p_model: "gpt-5.6-luna",
        }));
        const disposition = text(begun?.disposition);
        if (disposition !== "reserved" && disposition !== "replay") {
          throw new Error(`Owner Unified Visual Plan canonical establishment failed (${disposition ?? "unknown"})`);
        }
      },
      readPersistedResult: async ({ attemptId }) => {
        const row = object(await rpc(args.gate, "read_owner_unified_visual_plan_operation", {
          p_owner_cost_attempt_id: attemptId,
        }));
        if (!row) return null;
        const value = persistedValue(row);
        if (!value) return null;
        if (text(row.state) !== "verified" || !object(row.receipt_json)) await complete();
        else canonicalResult = row.receipt_json as Record<string, unknown>;
        return value;
      },
      persistResult: async (value) => {
        const result = ownerValue(value);
        await rpc(args.gate, "record_unified_visual_plan_provider_response", {
          p_operation_id: operationIdentity.operationKey,
          p_operation_fingerprint: operationIdentity.requestFingerprint,
          p_provider_response_json: {
            canonical_plan: result.plan,
            raw_provider_response: result.rawResponse,
            provider_request_id: result.providerRequestId,
            model: result.model,
            input_units: result.inputTokens,
            output_units: result.outputTokens,
            validation_contract_revision: UNIFIED_VISUAL_PLAN_PROVIDER_CONTRACT_VERSION,
          },
        });
        await complete();
      },
    });
    if (execution.state === "submission_unknown") throw new Error("Owner Unified Visual Plan submission is unresolved and was not retried");
    if (execution.state === "definitively_rejected") throw new Error("Owner Unified Visual Plan request was definitively rejected");
    if (!canonicalResult) await complete();
    return canonicalResult;
  };
}
