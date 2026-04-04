import { canManageOrgWorkspaceAccess, normalizeOrgRole } from "../../features/orgs/types";

export type AdminUsageByFeature = {
  feature: string;
  subfeature: string | null;
  callCount: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  billableTokens: number;
};

export type AdminUsageByLane = {
  lane: string;
  callCount: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  billableTokens: number;
};

export type AdminOverview = {
  totalUsageToday: number;
  totalEstimatedCostToday: number;
  totalActualCostToday: number;
  totalBillableTokensToday: number;
  usageByFeature: AdminUsageByFeature[];
  usageByLane: AdminUsageByLane[];
};

export type AdminUsageEvent = {
  createdAt: string;
  userId: string;
  workspaceId: string | null;
  feature: string;
  subfeature: string | null;
  lane: string;
  status: string;
  estimatedCostUsd: number;
  actualCostUsd: number;
  billableTokens: number;
  model: string;
  provider: string | null;
  actionId: string | null;
  effectiveAiKeySource: string | null;
  effectiveBillingLane: string | null;
  policyDecisionType: string | null;
  keyResolutionStatus: string | null;
};

export type AdminUserInspection = {
  targetUserId: string;
  profileTier: string | null;
  activePlanCode: string | null;
  foundersClubFlag: boolean;
  isFounderEntitled: boolean;
  isStudioEntitled: boolean;
  orgToolboxAllowed: boolean;
  orgRole: string | null;
  workspaceRole: string | null;
  orgPolicyDefaultMode: string;
  orgSharedAiEnabled: boolean;
  orgMemberByoAllowed: boolean;
  memberModeOverride: string | null;
  memberAllowHeavyTasks: boolean;
  byoConfigured: boolean;
  byoProvider: string | null;
  policyDecisionType: string;
  policyReasonCode: string | null;
  selectedFundingSource: string | null;
  effectiveAiKeySource: string | null;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
  effectivePolicySnapshot: Record<string, unknown>;
};

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function canAccessAdminPanel(myOrgRole: string | null | undefined): boolean {
  return canManageOrgWorkspaceAccess(normalizeOrgRole(myOrgRole));
}

export function parseAdminOverview(value: unknown): AdminOverview {
  const row = (value && typeof value === "object") ? (value as Record<string, unknown>) : {};
  const rawFeatureRows = Array.isArray(row.usage_by_feature) ? row.usage_by_feature : [];
  const rawLaneRows = Array.isArray(row.usage_by_lane) ? row.usage_by_lane : [];

  const usageByFeature = rawFeatureRows
    .filter((entry) => !!entry && typeof entry === "object")
    .map((entry) => {
      const typed = entry as Record<string, unknown>;
      return {
        feature: readString(typed.feature) ?? "unknown",
        subfeature: readString(typed.subfeature),
        callCount: Math.max(0, Math.trunc(readNumber(typed.call_count))),
        estimatedCostUsd: Math.max(0, readNumber(typed.total_estimated_cost_usd)),
        actualCostUsd: Math.max(0, readNumber(typed.total_actual_cost_usd)),
        billableTokens: Math.max(0, Math.trunc(readNumber(typed.total_billable_tokens))),
      } satisfies AdminUsageByFeature;
    });

  const usageByLane = rawLaneRows
    .filter((entry) => !!entry && typeof entry === "object")
    .map((entry) => {
      const typed = entry as Record<string, unknown>;
      return {
        lane: readString(typed.lane) ?? "unknown",
        callCount: Math.max(0, Math.trunc(readNumber(typed.call_count))),
        estimatedCostUsd: Math.max(0, readNumber(typed.total_estimated_cost_usd)),
        actualCostUsd: Math.max(0, readNumber(typed.total_actual_cost_usd)),
        billableTokens: Math.max(0, Math.trunc(readNumber(typed.total_billable_tokens))),
      } satisfies AdminUsageByLane;
    });

  return {
    totalUsageToday: Math.max(0, Math.trunc(readNumber(row.total_usage_today))),
    totalEstimatedCostToday: Math.max(0, readNumber(row.total_estimated_cost_today)),
    totalActualCostToday: Math.max(0, readNumber(row.total_actual_cost_today)),
    totalBillableTokensToday: Math.max(0, Math.trunc(readNumber(row.total_billable_tokens_today))),
    usageByFeature,
    usageByLane,
  };
}

export function parseAdminUsageEvents(value: unknown): AdminUsageEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => !!row && typeof row === "object")
    .map((row) => {
      const typed = row as Record<string, unknown>;
      return {
        createdAt: readString(typed.created_at) ?? "",
        userId: readString(typed.user_id) ?? "",
        workspaceId: readString(typed.workspace_id),
        feature: readString(typed.feature) ?? "unknown",
        subfeature: readString(typed.subfeature),
        lane: readString(typed.lane) ?? "unknown",
        status: readString(typed.status) ?? "unknown",
        estimatedCostUsd: Math.max(0, readNumber(typed.estimated_cost_usd)),
        actualCostUsd: Math.max(0, readNumber(typed.actual_cost_usd)),
        billableTokens: Math.max(0, Math.trunc(readNumber(typed.billable_tokens))),
        model: readString(typed.model) ?? "unknown",
        provider: readString(typed.provider),
        actionId: readString(typed.action_id),
        effectiveAiKeySource: readString(typed.effective_ai_key_source),
        effectiveBillingLane: readString(typed.effective_billing_lane),
        policyDecisionType: readString(typed.policy_decision_type),
        keyResolutionStatus: readString(typed.key_resolution_status),
      } satisfies AdminUsageEvent;
    })
    .filter((row) => row.createdAt !== "" && row.userId !== "");
}

export function parseAdminUserInspection(value: unknown): AdminUserInspection | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const typed = row as Record<string, unknown>;

  const targetUserId = readString(typed.target_user_id);
  if (!targetUserId) return null;

  return {
    targetUserId,
    profileTier: readString(typed.profile_tier),
    activePlanCode: readString(typed.active_plan_code),
    foundersClubFlag: readBoolean(typed.founders_club_flag),
    isFounderEntitled: readBoolean(typed.is_founder_entitled),
    isStudioEntitled: readBoolean(typed.is_studio_entitled),
    orgToolboxAllowed: readBoolean(typed.org_toolbox_allowed),
    orgRole: readString(typed.org_role),
    workspaceRole: readString(typed.workspace_role),
    orgPolicyDefaultMode: readString(typed.org_policy_default_mode) ?? "ORG_FIRST_PERSONAL_FALLBACK",
    orgSharedAiEnabled: readBoolean(typed.org_shared_ai_enabled),
    orgMemberByoAllowed: readBoolean(typed.org_member_byo_allowed),
    memberModeOverride: readString(typed.member_mode_override),
    memberAllowHeavyTasks: readBoolean(typed.member_allow_heavy_tasks),
    byoConfigured: readBoolean(typed.byo_configured),
    byoProvider: readString(typed.byo_provider),
    policyDecisionType: readString(typed.policy_decision_type) ?? "HARD_DENY",
    policyReasonCode: readString(typed.policy_reason_code),
    selectedFundingSource: readString(typed.selected_funding_source),
    effectiveAiKeySource: readString(typed.effective_ai_key_source),
    fallbackAvailable: readBoolean(typed.fallback_available),
    fallbackUsed: readBoolean(typed.fallback_used),
    effectivePolicySnapshot: readObject(typed.effective_policy_snapshot),
  };
}
