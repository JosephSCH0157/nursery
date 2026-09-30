import type {
  OwnerNarrativeInterpretationExecutor,
  OwnerNarrativeInterpretationValue,
} from "../../../../packages/tongs/src/workpiece-commit-api";
import {
  NARRATIVE_INTERPRETATION_MODEL,
  synthesizeConcreteVendorPrompt,
  validateSubstantiveVisualBrief,
  type ImagePromptVisualBrief,
} from "../../../../packages/tongs/src/providers/narrative-interpretation-provider";
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

function parseNarrativeValue(payload: Json): Json {
  const output = responseOutputText(payload);
  if (!output) throw new Error("Narrative interpretation returned no structured output");
  const brief = object(JSON.parse(output)) as ImagePromptVisualBrief | null;
  const invalid = brief ? validateSubstantiveVisualBrief(brief) : ["response"];
  if (!brief || invalid.length) throw new Error(`Narrative interpretation is invalid: ${invalid.join(", ")}`);
  const usage = object(payload.usage);
  return {
    brief,
    model: text(payload.model) ?? NARRATIVE_INTERPRETATION_MODEL,
    provider_request_id: text(payload.id),
    input_tokens: nonNegativeInteger(usage?.input_tokens),
    output_tokens: nonNegativeInteger(usage?.output_tokens),
  };
}

function ownerValue(result: OwnerHearthTextResult): OwnerNarrativeInterpretationValue {
  const brief = object(result.result.brief) as ImagePromptVisualBrief | null;
  if (!brief) throw new Error("Owner narrative result has no visual brief");
  return {
    brief,
    model: text(result.result.model) ?? NARRATIVE_INTERPRETATION_MODEL,
    providerRequestId: result.providerRequestId,
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

export function createOwnerNarrativeInterpretationExecutor(args: {
  gate: OwnerCostRpcGate;
  coordinator: ForgeOwnerExecutionCoordinator;
  authorityReader: OwnerAuthorityReader;
  credential?: string;
  providerFetch?: typeof fetch;
  runtimeEnvironment?: OwnerRuntimeEnvironment;
}): OwnerNarrativeInterpretationExecutor {
  return async (input) => {
    try {
      await requireForgeOwnerExecutionAuthority({
        reader: args.authorityReader,
        authenticatedUserId: input.authenticatedUserId,
        workspaceId: input.workspaceId,
        routeCode: "visual.narrative_interpretation",
      });
    } catch (error) {
      if (error instanceof ForgeOwnerAuthorizationError) return null;
      throw error;
    }
    if (!args.credential?.trim()) throw new Error("The isolated Hearth owner OpenAI credential is unavailable");

    const financial = await financialEnvironment(args.gate);
    const runtime = args.runtimeEnvironment ?? readOwnerRuntimeEnvironment();
    const operationIdentity = deriveForgeOwnerOperationIdentity({
      financialEnvironment: financial,
      runtimeEnvironment: runtime,
      originatingTool: "hearth",
      operationType: "visual.narrative_interpretation",
      stableOperationInput: {
        workspace_id: input.workspaceId,
        workpiece_id: input.workpieceId,
        operation_intent_id: input.operationIntentId,
        route_code: "visual.narrative_interpretation",
      },
      exactRequestInput: input.logicalRequest,
    });
    await input.prepareCanonical(operationIdentity.operationKey, operationIdentity.requestFingerprint);

    let canonicalResult: Record<string, unknown> | null = null;
    const commit = async (value: OwnerHearthTextResult) => {
      canonicalResult = await input.persistCanonical(
        operationIdentity.operationKey,
        operationIdentity.requestFingerprint,
        ownerValue(value),
      );
    };
    const attemptNumber = await selectExplicitOwnerHearthTextAttemptNumber({
      gate: args.gate,
      operationIdentity,
      credential: args.credential,
      providerBody: input.providerBody,
      providerEndpoint: "/v1/responses",
      providerService: "responses",
    });
    const execution = await executeOwnerHearthText({
      coordinator: args.coordinator,
      gate: args.gate,
      authenticatedUserId: input.authenticatedUserId,
      workspaceId: input.workspaceId,
      workpieceId: input.workpieceId,
      routeCode: "visual.narrative_interpretation",
      operationIntentId: input.operationIntentId,
      financialEnvironment: financial,
      runtimeEnvironment: runtime,
      credential: args.credential,
      providerBody: input.providerBody,
      providerEndpoint: "/v1/responses",
      providerService: "responses",
      logicalRequest: input.logicalRequest,
      operationIdentity,
      attemptNumber,
      providerFetch: args.providerFetch,
      parseAndValidate: parseNarrativeValue,
      readPersistedResult: async ({ attemptId }) => {
        const row = object(await rpc(args.gate, "read_owner_visual_narrative_interpretation_result", {
          p_owner_cost_attempt_id: attemptId,
        }));
        const brief = object(row?.visual_brief_json);
        if (!row || !brief) return null;
        const value: OwnerHearthTextResult = {
          result: {
            brief,
            model: row.model,
            provider_request_id: row.provider_request_id,
            input_tokens: row.input_units,
            output_tokens: row.output_units,
          },
          providerRequestId: text(row.provider_request_id),
          inputUnits: nonNegativeInteger(row.input_units),
          outputUnits: nonNegativeInteger(row.output_units),
        };
        await commit(value);
        return value;
      },
      persistResult: async (value, context) => {
        const narrative = ownerValue(value);
        const synthesizedPrompt = synthesizeConcreteVendorPrompt(narrative.brief, input.visualStyle);
        await rpc(args.gate, "stage_owner_visual_narrative_interpretation_result", {
          p_owner_cost_attempt_id: context.attemptId,
          p_user_id: input.authenticatedUserId,
          p_workspace_id: input.workspaceId,
          p_workpiece_id: input.workpieceId,
          p_request_fingerprint: context.requestFingerprint,
          p_financial_environment: financial,
          p_runtime_environment: runtime,
          p_provider_body_sha256: input.providerBodySha256,
          p_provider_request_id: narrative.providerRequestId,
          p_model: narrative.model,
          p_input_units: narrative.inputTokens,
          p_output_units: narrative.outputTokens,
          p_visual_brief_json: narrative.brief,
          p_contracts_json: input.contracts,
          p_image_map_revision_id: input.imageMapRevisionId,
          p_image_map_revision: input.imageMapRevision,
          p_script_approval_id: input.scriptApprovalId,
          p_script_approval_revision: input.scriptApprovalRevision,
          p_creator_direction: input.creatorDirection,
          p_visual_style: input.visualStyle,
          p_synthesized_prompt: synthesizedPrompt,
        });
        await commit(value);
      },
    });
    if (execution.state === "submission_unknown") throw new Error("Owner narrative submission is unresolved and was not retried");
    if (execution.state === "definitively_rejected") throw new Error("Owner narrative request was definitively rejected");
    if (!canonicalResult) await commit(execution.value);
    return canonicalResult;
  };
}
