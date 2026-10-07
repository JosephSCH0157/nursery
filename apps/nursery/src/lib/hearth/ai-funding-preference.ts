import { aiControlRecord as object, aiControlRpc } from "./ai-control-rpc";

export type AiFundingPayerKind = "personal" | "organization_shared" | "owner_testing";

export type AiFundingOption = {
  kind: AiFundingPayerKind;
  label: string;
  available: boolean;
  requiresActiveBudget: boolean;
};

export type AiFundingOptions = {
  workspaceId: string;
  orgId: string | null;
  selectedPayer: AiFundingPayerKind;
  selectedRevisionId: string | null;
  options: AiFundingOption[];
};

function normalizeKind(value: unknown): AiFundingPayerKind {
  return value === "organization_shared" || value === "owner_testing" ? value : "personal";
}

function normalize(value: unknown): AiFundingOptions {
  const source = object(value);
  const options = Array.isArray(source.options) ? source.options.map((item) => {
    const row = object(item);
    return {
      kind: normalizeKind(row.kind),
      label: typeof row.label === "string" ? row.label : "Funding source",
      available: row.available === true,
      requiresActiveBudget: row.requires_active_budget === true,
    };
  }) : [];
  return {
    workspaceId: typeof source.workspace_id === "string" ? source.workspace_id : "",
    orgId: typeof source.org_id === "string" ? source.org_id : null,
    selectedPayer: normalizeKind(source.selected_payer),
    selectedRevisionId: typeof source.selected_revision_id === "string" ? source.selected_revision_id : null,
    options,
  };
}

export async function loadAiFundingOptions(workspaceId: string): Promise<AiFundingOptions> {
  return normalize(await aiControlRpc(
    "read_my_ai_funding_options",
    { p_workspace_id: workspaceId },
    "Unable to load AI funding options.",
  ));
}

export async function saveAiFundingPreference(
  workspaceId: string,
  payerKind: AiFundingPayerKind,
): Promise<void> {
  const current = await loadAiFundingOptions(workspaceId);
  const selected = current.options.find((option) => option.kind === payerKind);
  if (!selected?.available) throw new Error("That funding source is not authorized for this workspace.");
  await aiControlRpc("set_my_ai_funding_preference", {
    p_workspace_id: workspaceId,
    p_payer_kind: payerKind,
    p_org_id: payerKind === "organization_shared" ? current.orgId : null,
  }, "Unable to save AI funding preference.");
}
