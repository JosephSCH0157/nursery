import { supabase } from "../supabase";

export const HAMMER_TRANSCRIPT_CLEANUP_OPERATION = "hammer.transcript_cleanup";

export type AiModelChoice = {
  selectionKey: string;
  displayName: string;
  relativeCostClass: "lower_cost" | "mid_range_cost" | "higher_cost";
  creditCharge: number | null;
};

export type AiModelPreference = {
  selectionKey: string | null;
  displayName: string | null;
  relativeCostClass: AiModelChoice["relativeCostClass"] | null;
  revision: number;
};

export type AiOperationModelOverride = {
  state: "specific" | "clear";
  selectionKey: string | null;
  displayName: string | null;
  revision: number;
  available: boolean;
};

export type AiModelControlSnapshot = {
  globalPreference: AiModelPreference;
  globalChoices: AiModelChoice[];
  operationCode: string;
  operationOverride: AiOperationModelOverride;
  applicableSource: "operation_override" | "global_preference";
  applicableSelectionKey: string | null;
  applicableAvailable: boolean;
  eligibleChoices: AiModelChoice[];
  blocker: string | null;
};

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function relativeCost(value: unknown): AiModelChoice["relativeCostClass"] | null {
  return value === "lower_cost" || value === "mid_range_cost" || value === "higher_cost"
    ? value
    : null;
}

function preference(value: unknown): AiModelPreference {
  const source = record(value);
  return {
    selectionKey: typeof source.selection_key === "string" ? source.selection_key : null,
    displayName: typeof source.display_name === "string" ? source.display_name : null,
    relativeCostClass: relativeCost(source.relative_cost_class),
    revision: Number.isSafeInteger(Number(source.revision)) ? Number(source.revision) : 0,
  };
}

function modelChoice(value: unknown, operationSpecific: boolean): AiModelChoice | null {
  const source = record(value);
  const selectionKey = typeof source.selection_key === "string" ? source.selection_key : "";
  const displayName = typeof source.display_name === "string" ? source.display_name : "";
  const costClass = relativeCost(source.relative_cost_class);
  const creditCharge = operationSpecific ? Number(source.credit_charge) : null;
  if (!selectionKey || !displayName || !costClass
    || (operationSpecific && (!Number.isSafeInteger(creditCharge) || Number(creditCharge) < 0))) return null;
  return { selectionKey, displayName, relativeCostClass: costClass, creditCharge };
}

function operationOverride(value: unknown): AiOperationModelOverride {
  const source = record(value);
  return {
    state: source.state === "specific" ? "specific" : "clear",
    selectionKey: typeof source.selection_key === "string" ? source.selection_key : null,
    displayName: typeof source.display_name === "string" ? source.display_name : null,
    revision: Number.isSafeInteger(Number(source.revision)) ? Number(source.revision) : 0,
    available: source.available !== false,
  };
}

function client(): RpcClient {
  return supabase.schema("tongs") as unknown as RpcClient;
}

async function rpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const result = await client().rpc(name, args);
  if (result.error) throw new Error(result.error.message || `${name} failed`);
  return result.data;
}

export async function loadAiModelControls(
  operationCode = HAMMER_TRANSCRIPT_CLEANUP_OPERATION,
): Promise<AiModelControlSnapshot> {
  const [globalValue, operationValue] = await Promise.all([
    rpc("read_ai_model_choices"),
    rpc("read_ai_operation_model_choices", { p_operation_code: operationCode }),
  ]);
  const globalSource = record(globalValue);
  const operationSource = record(operationValue);
  return {
    globalPreference: preference(globalSource.preference),
    globalChoices: Array.isArray(globalSource.choices)
      ? globalSource.choices.map((item) => modelChoice(item, false)).filter((item): item is AiModelChoice => item !== null)
      : [],
    operationCode,
    operationOverride: operationOverride(operationSource.operation_override),
    applicableSource: operationSource.applicable_source === "operation_override"
      ? "operation_override"
      : "global_preference",
    applicableSelectionKey: typeof operationSource.applicable_selection_key === "string"
      ? operationSource.applicable_selection_key
      : null,
    applicableAvailable: operationSource.applicable_available === true,
    eligibleChoices: Array.isArray(operationSource.eligible_choices)
      ? operationSource.eligible_choices.map((item) => modelChoice(item, true)).filter((item): item is AiModelChoice => item !== null)
      : [],
    blocker: typeof operationSource.blocker === "string" ? operationSource.blocker : null,
  };
}

export async function saveGlobalAiModelPreference(
  selectionKey: string,
  expectedRevision: number,
): Promise<AiModelPreference> {
  return preference(await rpc("set_my_ai_model_preference", {
    p_selection_key: selectionKey,
    p_expected_revision: expectedRevision,
  }));
}

export async function saveAiOperationModelOverride(
  operationCode: string,
  selectionKey: string,
  expectedRevision: number,
): Promise<AiOperationModelOverride> {
  return operationOverride(await rpc("set_my_ai_operation_model_override", {
    p_operation_code: operationCode,
    p_selection_key: selectionKey,
    p_expected_revision: expectedRevision,
  }));
}

export async function clearAiOperationModelOverride(
  operationCode: string,
  expectedRevision: number,
): Promise<AiOperationModelOverride> {
  return operationOverride(await rpc("clear_my_ai_operation_model_override", {
    p_operation_code: operationCode,
    p_expected_revision: expectedRevision,
  }));
}

export function aiRelativeCostLabel(value: AiModelChoice["relativeCostClass"] | null): string {
  if (value === "lower_cost") return "Lower cost";
  if (value === "mid_range_cost") return "Mid-range cost";
  if (value === "higher_cost") return "Higher cost";
  return "Cost varies by operation";
}
