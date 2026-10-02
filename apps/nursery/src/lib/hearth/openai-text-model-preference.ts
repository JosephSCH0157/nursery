import { supabase } from "../supabase";

export type OpenAiTextModelPreference = {
  preferenceKind: "best_available" | "specific";
  selectionKey: string | null;
  displayName: string | null;
  revision: number;
  available: boolean;
};

export type OpenAiTextModelChoice = {
  selectionKey: string;
  displayName: string;
  tradeoffSummary: string;
  selectionState: "selectable" | "recommended" | "retiring";
  creditCharge: number;
};

export type OpenAiTextModelChoiceSnapshot = {
  routeCode: OpenAiTextModelRouteCode;
  catalogRevision: number;
  catalogState: string;
  preference: OpenAiTextModelPreference;
  eligibleChoices: OpenAiTextModelChoice[];
  selectionUnavailable: boolean;
  blocker: string | null;
};

export type OpenAiTextModelRouteCode = "hammer.transcript_cleanup";
export const HAMMER_TRANSCRIPT_CLEANUP_MODEL_ROUTE: OpenAiTextModelRouteCode = "hammer.transcript_cleanup";

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function choice(value: unknown): OpenAiTextModelChoice | null {
  const source = row(value);
  const selectionKey = typeof source.selection_key === "string" ? source.selection_key : "";
  const displayName = typeof source.display_name === "string" ? source.display_name : "";
  const selectionState = source.selection_state === "recommended" || source.selection_state === "retiring"
    ? source.selection_state
    : "selectable";
  const creditCharge = Number(source.credit_charge);
  if (!selectionKey || !displayName || !Number.isSafeInteger(creditCharge) || creditCharge < 0) return null;
  return {
    selectionKey,
    displayName,
    tradeoffSummary: typeof source.tradeoff_summary === "string" ? source.tradeoff_summary : "",
    selectionState,
    creditCharge,
  };
}

function preference(value: unknown): OpenAiTextModelPreference {
  const source = row(value);
  return {
    preferenceKind: source.preference_kind === "specific" ? "specific" : "best_available",
    selectionKey: typeof source.selection_key === "string" ? source.selection_key : null,
    displayName: typeof source.display_name === "string" ? source.display_name : null,
    revision: Number.isSafeInteger(Number(source.revision)) ? Number(source.revision) : 0,
    available: source.available !== false,
  };
}

export function normalizeOpenAiTextModelChoiceSnapshot(
  value: unknown,
  routeCode: OpenAiTextModelRouteCode,
): OpenAiTextModelChoiceSnapshot {
  const source = row(value);
  return {
    routeCode,
    catalogRevision: Number.isSafeInteger(Number(source.catalog_revision)) ? Number(source.catalog_revision) : 0,
    catalogState: typeof source.catalog_state === "string" ? source.catalog_state : "unavailable",
    preference: preference(source.preference),
    eligibleChoices: Array.isArray(source.eligible_choices) ? source.eligible_choices.map(choice).filter((item): item is OpenAiTextModelChoice => item !== null) : [],
    selectionUnavailable: source.selection_unavailable === true,
    blocker: typeof source.blocker === "string" ? source.blocker : null,
  };
}

function client(): RpcClient {
  return supabase.schema("tongs") as unknown as RpcClient;
}

export async function loadOpenAiTextModelChoices(
  routeCode: OpenAiTextModelRouteCode,
): Promise<OpenAiTextModelChoiceSnapshot> {
  const result = await client().rpc("read_openai_text_model_choices", { p_route_code: routeCode });
  if (result.error) throw new Error(result.error.message || "Unable to load model choices.");
  return normalizeOpenAiTextModelChoiceSnapshot(result.data, routeCode);
}

export async function saveOpenAiTextModelPreference(
  routeCode: OpenAiTextModelRouteCode,
  kind: "best_available" | "specific",
  selectionKey: string | null,
  expectedRevision: number,
): Promise<OpenAiTextModelPreference> {
  const result = await client().rpc("set_my_openai_text_model_preference", {
    p_route_code: routeCode,
    p_preference_kind: kind,
    p_selection_key: kind === "specific" ? selectionKey : null,
    p_expected_revision: expectedRevision,
  });
  if (result.error) throw new Error(result.error.message || "Unable to save model preference.");
  return preference(result.data);
}
