import type { SupabaseClient } from "@supabase/supabase-js";

export const AI_MODES = [
  "AI_DISABLED",
  "ORG_ONLY",
  "PERSONAL_ONLY",
  "ORG_FIRST_PERSONAL_FALLBACK",
] as const;

export const AI_DECISION_TYPES = ["ALLOW", "SOFT_DENY", "HARD_DENY"] as const;

export const AI_FEATURE_FLAGS = [
  "heavy_tasks",
  "image_generation",
  "research_flows",
] as const;

export const AI_FUNDING_SOURCES = [
  "org_byo_key",
  "org_shared_credits",
  "personal_byo_key",
  "personal_credits",
  "forge_managed_credits",
] as const;

export const AI_REASON_CODES = [
  "ORG_AI_DISABLED",
  "ORG_MEMBER_NOT_AUTHORIZED",
  "PERSONAL_AI_REQUIRED_NOT_CONFIGURED",
  "ORG_CAP_EXCEEDED",
  "FEATURE_DISABLED_HEAVY_TASKS",
  "FEATURE_DISABLED_IMAGE",
  "FEATURE_DISABLED_RESEARCH",
  "NO_VALID_FUNDING_SOURCE",
  "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
] as const;

export type AiMode = (typeof AI_MODES)[number];
export type AiDecisionType = (typeof AI_DECISION_TYPES)[number];
export type AiFeatureFlag = (typeof AI_FEATURE_FLAGS)[number];
export type AiFundingSource = (typeof AI_FUNDING_SOURCES)[number];
export type AiReasonCode = (typeof AI_REASON_CODES)[number];

export type MembershipEntitlement = {
  profileTier: string | null;
  activePlanCode: string | null;
  foundersClubFlag: boolean;
  isFounderEntitled: boolean;
  isStudioEntitled: boolean;
  orgToolboxAllowed: boolean;
  workspaceRole: string | null;
  orgRole: string | null;
  sourceMeta: Record<string, unknown>;
};

export type AiPolicyResolveInput = {
  orgId: string | null;
  workspaceId: string | null;
  userId: string;
  tool: string;
  feature?: string | null;
  action?: string | null;
  requestedMode?: AiMode | null;
  personalAiConfigured?: boolean;
  orgAiAvailable?: boolean;
  requestedFundingSource?: AiFundingSource | null;
  estimatedCostUsd?: number | null;
  provider?: string | null;
  model?: string | null;
  requestId?: string | null;
  writeLedger?: boolean;
};

export type AiPolicyResolveResult = {
  decisionType: AiDecisionType;
  reasonCode: AiReasonCode | null;
  selectedFundingSource: AiFundingSource | null;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
  effectivePolicySnapshot: Record<string, unknown>;
};

export const AI_REASON_MESSAGES: Record<AiReasonCode, string> = {
  ORG_AI_DISABLED: "Organization AI is currently disabled for this context.",
  ORG_MEMBER_NOT_AUTHORIZED:
    "You are not authorized to use organization-funded AI for this action.",
  PERSONAL_AI_REQUIRED_NOT_CONFIGURED:
    "This action requires your personal AI connection, but it is not configured yet.",
  ORG_CAP_EXCEEDED:
    "The available AI spending cap has been exceeded for the current period.",
  FEATURE_DISABLED_HEAVY_TASKS:
    "Heavy AI tasks are disabled by your current organization policy.",
  FEATURE_DISABLED_IMAGE:
    "Image generation is disabled by your current organization policy.",
  FEATURE_DISABLED_RESEARCH:
    "Research flows are disabled by your current organization policy.",
  NO_VALID_FUNDING_SOURCE:
    "No valid AI funding source is currently available for this request.",
  MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER:
    "An active paid membership (Creator, Pro, or Studio) or Founder access is required for AI actions.",
};

type RpcMembershipRow = {
  profile_tier: string | null;
  active_plan_code: string | null;
  founders_club_flag: boolean | null;
  is_founder_entitled: boolean | null;
  is_studio_entitled: boolean | null;
  org_toolbox_allowed: boolean | null;
  workspace_role: string | null;
  org_role: string | null;
  source_meta: Record<string, unknown> | null;
};

type RpcResolvePolicyRow = {
  decision_type: AiDecisionType;
  reason_code: AiReasonCode | null;
  selected_funding_source: AiFundingSource | null;
  fallback_available: boolean;
  fallback_used: boolean;
  effective_policy_snapshot: Record<string, unknown> | null;
};

function normalizeMembershipRow(row: RpcMembershipRow): MembershipEntitlement {
  return {
    profileTier: row.profile_tier,
    activePlanCode: row.active_plan_code,
    foundersClubFlag: Boolean(row.founders_club_flag),
    isFounderEntitled: Boolean(row.is_founder_entitled),
    isStudioEntitled: Boolean(row.is_studio_entitled),
    orgToolboxAllowed: Boolean(row.org_toolbox_allowed),
    workspaceRole: row.workspace_role,
    orgRole: row.org_role,
    sourceMeta: row.source_meta ?? {},
  };
}

function normalizeResolvePolicyRow(row: RpcResolvePolicyRow): AiPolicyResolveResult {
  return {
    decisionType: row.decision_type,
    reasonCode: row.reason_code,
    selectedFundingSource: row.selected_funding_source,
    fallbackAvailable: Boolean(row.fallback_available),
    fallbackUsed: Boolean(row.fallback_used),
    effectivePolicySnapshot: row.effective_policy_snapshot ?? {},
  };
}

export function getAiReasonMessage(code: AiReasonCode): string {
  return AI_REASON_MESSAGES[code];
}

export function isAiAllowDecision(result: AiPolicyResolveResult): boolean {
  return result.decisionType === "ALLOW";
}

export async function getMembershipEntitlement(
  supabase: SupabaseClient,
  args: {
    userId: string;
    orgId: string | null;
    workspaceId?: string | null;
  },
): Promise<MembershipEntitlement> {
  const { data, error } = await supabase.rpc("resolve_membership_entitlement", {
    p_user_id: args.userId,
    p_org_id: args.orgId,
    p_workspace_id: args.workspaceId ?? null,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? (data[0] as RpcMembershipRow | undefined) : undefined;
  if (!row) {
    return {
      profileTier: null,
      activePlanCode: null,
      foundersClubFlag: false,
      isFounderEntitled: false,
      isStudioEntitled: false,
      orgToolboxAllowed: false,
      workspaceRole: null,
      orgRole: null,
      sourceMeta: {},
    };
  }

  return normalizeMembershipRow(row);
}

export async function resolveAiPolicy(
  supabase: SupabaseClient,
  input: AiPolicyResolveInput,
): Promise<AiPolicyResolveResult> {
  const { data, error } = await supabase.rpc("resolve_ai_policy", {
    p_org_id: input.orgId,
    p_workspace_id: input.workspaceId,
    p_user_id: input.userId,
    p_tool: input.tool,
    p_feature: input.feature ?? null,
    p_action: input.action ?? null,
    p_requested_mode: input.requestedMode ?? null,
    p_personal_ai_configured: input.personalAiConfigured ?? false,
    p_org_ai_available: input.orgAiAvailable ?? true,
    p_requested_funding_source: input.requestedFundingSource ?? null,
    p_estimated_cost_usd: input.estimatedCostUsd ?? null,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null,
    p_request_id: input.requestId ?? null,
    p_write_ledger: input.writeLedger ?? true,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? (data[0] as RpcResolvePolicyRow | undefined) : undefined;
  if (!row) {
    throw new Error("resolve_ai_policy returned no rows");
  }

  return normalizeResolvePolicyRow(row);
}
