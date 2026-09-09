import { supabase } from "../supabase";

export type OpenAiTextModelPreference = {
  preferenceKind: "best_available" | "specific";
  providerModelId: string | null;
  revision: number;
};

export type OpenAiTextModelChoice = {
  providerModelId: string;
  displayName: string;
  tradeoffSummary: string;
  executable: boolean;
  blocker: string | null;
};

export type OpenAiTextModelChoiceSnapshot = {
  catalogRevision: number;
  catalogState: string;
  preference: OpenAiTextModelPreference;
  eligibleChoices: OpenAiTextModelChoice[];
  candidateStatus: OpenAiTextModelChoice[];
  blocker: string | null;
};

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function choice(value: unknown): OpenAiTextModelChoice | null {
  const source = row(value);
  const providerModelId = typeof source.provider_model_id === "string" ? source.provider_model_id : "";
  const displayName = typeof source.display_name === "string" ? source.display_name : "";
  if (!providerModelId || !displayName) return null;
  return {
    providerModelId,
    displayName,
    tradeoffSummary: typeof source.tradeoff_summary === "string" ? source.tradeoff_summary : "",
    executable: source.executable === true,
    blocker: typeof source.blocker === "string" ? source.blocker : null,
  };
}

function preference(value: unknown): OpenAiTextModelPreference {
  const source = row(value);
  return {
    preferenceKind: source.preference_kind === "specific" ? "specific" : "best_available",
    providerModelId: typeof source.provider_model_id === "string" ? source.provider_model_id : null,
    revision: Number.isSafeInteger(Number(source.revision)) ? Number(source.revision) : 0,
  };
}

export function normalizeOpenAiTextModelChoiceSnapshot(value: unknown): OpenAiTextModelChoiceSnapshot {
  const source = row(value);
  return {
    catalogRevision: Number.isSafeInteger(Number(source.catalog_revision)) ? Number(source.catalog_revision) : 0,
    catalogState: typeof source.catalog_state === "string" ? source.catalog_state : "unavailable",
    preference: preference(source.preference),
    eligibleChoices: Array.isArray(source.eligible_choices) ? source.eligible_choices.map(choice).filter((item): item is OpenAiTextModelChoice => item !== null) : [],
    candidateStatus: Array.isArray(source.candidate_status) ? source.candidate_status.map(choice).filter((item): item is OpenAiTextModelChoice => item !== null) : [],
    blocker: typeof source.blocker === "string" ? source.blocker : null,
  };
}

function client(): RpcClient {
  return supabase.schema("tongs") as unknown as RpcClient;
}

export async function loadOpenAiTextModelChoices(): Promise<OpenAiTextModelChoiceSnapshot> {
  const result = await client().rpc("read_openai_text_model_choices", { p_route_code: null });
  if (result.error) throw new Error(result.error.message || "Unable to load model choices.");
  return normalizeOpenAiTextModelChoiceSnapshot(result.data);
}

export async function saveOpenAiTextModelPreference(
  kind: "best_available" | "specific",
  providerModelId: string | null,
  expectedRevision: number,
): Promise<OpenAiTextModelPreference> {
  const result = await client().rpc("set_my_openai_text_model_preference", {
    p_preference_kind: kind,
    p_provider_model_id: kind === "specific" ? providerModelId : null,
    p_expected_revision: expectedRevision,
  });
  if (result.error) throw new Error(result.error.message || "Unable to save model preference.");
  return preference(result.data);
}
