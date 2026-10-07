import { aiControlRecord as record, aiControlRpc as rpc } from "./ai-control-rpc";

export const HAMMER_TRANSCRIPT_CLEANUP_OPERATION = "hammer.transcript_cleanup";

export type AiModelChoice = {
  selectionKey: string;
  displayName: string;
  relativeCostClass: "lower_cost" | "mid_range_cost" | "higher_cost";
  creditCharge: number | null;
};

export type AiModelPreference = {
  selectionKey: string | null;
  revision: number;
};

export type AiOperationModelOverride = {
  state: "specific" | "clear";
  selectionKey: string | null;
  revision: number;
};

export type AiModelControlSnapshot = {
  globalPreference: AiModelPreference;
  globalChoices: AiModelChoice[];
  operationOverride: AiOperationModelOverride;
  eligibleChoices: AiModelChoice[];
  blocker: string | null;
};

function relativeCost(value: unknown): AiModelChoice["relativeCostClass"] | null {
  return value === "lower_cost" || value === "mid_range_cost" || value === "higher_cost"
    ? value
    : null;
}

function preference(value: unknown): AiModelPreference {
  const source = record(value);
  const revision = Number(source.revision);
  return {
    selectionKey: typeof source.selection_key === "string" ? source.selection_key : null,
    revision: Number.isSafeInteger(revision) ? revision : 0,
  };
}

function modelChoice(value: unknown, operationSpecific: boolean): AiModelChoice | null {
  const source = record(value);
  const selectionKey = typeof source.selection_key === "string" ? source.selection_key : "";
  const displayName = typeof source.display_name === "string" ? source.display_name : "";
  const costClass = relativeCost(source.relative_cost_class);
  const creditCharge = operationSpecific ? Number(source.credit_charge) : null;
  if (!selectionKey || !displayName || !costClass
    || (operationSpecific && (!Number.isSafeInteger(creditCharge) || (creditCharge as number) < 0))) return null;
  return { selectionKey, displayName, relativeCostClass: costClass, creditCharge };
}

function operationOverride(value: unknown): AiOperationModelOverride {
  const source = record(value);
  const revision = Number(source.revision);
  return {
    state: source.state === "specific" ? source.state : "clear",
    selectionKey: typeof source.selection_key === "string" ? source.selection_key : null,
    revision: Number.isSafeInteger(revision) ? revision : 0,
  };
}

export async function loadAiModelControls(
  operationCode: string,
): Promise<AiModelControlSnapshot> {
  const [globalValue, operationValue] = await Promise.all([
    rpc("read_ai_model_choices"),
    rpc("read_ai_operation_model_choices", { p_operation_code: operationCode }),
  ]);
  const globalSource = record(globalValue);
  const operationSource = record(operationValue);
  return {
    globalPreference: preference(globalSource.preference),
    globalChoices: (Array.isArray(globalSource.choices)
      ? globalSource.choices.map((item) => modelChoice(item, false)).filter(Boolean)
      : []) as AiModelChoice[],
    operationOverride: operationOverride(operationSource.operation_override),
    eligibleChoices: (Array.isArray(operationSource.eligible_choices)
      ? operationSource.eligible_choices.map((item) => modelChoice(item, true)).filter(Boolean)
      : []) as AiModelChoice[],
    blocker: typeof operationSource.blocker === "string" ? operationSource.blocker : null,
  };
}

export function saveGlobalAiModelPreference(
  selectionKey: string,
  expectedRevision: number,
): Promise<unknown> {
  return rpc("set_my_ai_model_preference", {
    p_selection_key: selectionKey,
    p_expected_revision: expectedRevision,
  });
}

export function saveAiOperationModelOverride(
  operationCode: string,
  selectionKey: string,
  expectedRevision: number,
): Promise<unknown> {
  return rpc("set_my_ai_operation_model_override", {
    p_operation_code: operationCode,
    p_selection_key: selectionKey,
    p_expected_revision: expectedRevision,
  });
}

export function clearAiOperationModelOverride(
  operationCode: string,
  expectedRevision: number,
): Promise<unknown> {
  return rpc("clear_my_ai_operation_model_override", {
    p_operation_code: operationCode,
    p_expected_revision: expectedRevision,
  });
}

export function aiRelativeCostLabel(value: AiModelChoice["relativeCostClass"]): string {
  return value === "lower_cost" ? "Lower cost"
    : value === "mid_range_cost" ? "Mid-range cost" : "Higher cost";
}
