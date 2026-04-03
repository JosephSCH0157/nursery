import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import {
  AI_USAGE_LANE,
  assertValidAiUsageFeatureSubfeature,
  isAiUsageLane,
  isAiUsageStatus,
  isAiUsageTrigger,
  type AiUsageFeature,
  type AiUsageLane,
  type AiUsageStatus as TongsAiUsageStatus,
  type AiUsageSubfeature,
  type AiUsageTrigger as TongsAiUsageTrigger,
} from "../../../packages/tongs/src/ai-usage-taxonomy";
import {
  calculateForgeBillingTokens,
  estimateOpenAiCostFromPayload,
  extractOpenAiUsageMetrics,
} from "./hearth/ai-pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BillingMode = AiUsageLane;
export type AiUsageStatus = TongsAiUsageStatus;
export type AiUsageTrigger = TongsAiUsageTrigger;

export type TranscriptionAccounting = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  billableTokens: number;
};

export type UsageAccounting = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  billableTokens: number;
};

export type AiUsageRecordInput = {
  supabaseService: SupabaseClient<Database> | null;
  userId: string | null;
  lane: BillingMode;
  provider: string;
  workspaceId: string | null;
  workpieceId: string | null;
  sessionId: string | null;
  feature: AiUsageFeature;
  subfeature?: AiUsageSubfeature | null;
  model: string;
  reasoningEffort?: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  billableTokens: number;
  trigger: AiUsageTrigger;
  status: AiUsageStatus;
  policyEnforced?: boolean;
  keySource?: "forge" | "byo" | "org_shared" | null;
  effectiveAiKeySource?: "forge_managed" | "user_byo" | "org_shared" | null;
  keyResolutionStatus?: "available" | "missing_required_key" | "provider_not_supported" | "policy_denied" | null;
  effectiveBillingLane?: BillingMode | null;
  policyDecisionType?: "ALLOW" | "SOFT_DENY" | "HARD_DENY" | null;
  policyReasonCode?: string | null;
  policySnapshot?: Record<string, unknown> | null;
  actionId?: string | null;
  providerRequestId?: string | null;
  correlationId?: string | null;
};

export function normalizeBillingMode(value: unknown, fallback: BillingMode): BillingMode {
  return isAiUsageLane(value) ? value : fallback;
}

export function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function readBearerToken(value: string | null | undefined): string | null {
  const normalized = readOptionalString(value);
  if (!normalized) return null;
  if (/^bearer\s+/i.test(normalized)) {
    const token = normalized.replace(/^bearer\s+/i, "").trim();
    return token || null;
  }
  return normalized;
}

export async function resolveUserIdFromAccessToken(args: {
  supabaseService: SupabaseClient<Database> | null;
  accessToken: string | null;
}): Promise<string | null> {
  if (!args.supabaseService || !args.accessToken) return null;
  const { data, error } = await args.supabaseService.auth.getUser(args.accessToken);
  if (error) return null;
  return data.user?.id ?? null;
}

export function estimateTranscriptionTokenFallback(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function extractTotalTokens(payload: unknown): number | null {
  const usage = extractOpenAiUsageMetrics(payload);
  if (!usage) return null;
  return usage.totalTokens > 0 ? usage.totalTokens : null;
}

export function buildTranscriptionAccounting(args: {
  model: string;
  payload: unknown;
  text: string;
  billableMode: AiUsageLane | "non-billable";
}): TranscriptionAccounting {
  const totalTokens = extractTotalTokens(args.payload) ?? estimateTranscriptionTokenFallback(args.text);
  const costEstimate = estimateOpenAiCostFromPayload(args.model, args.payload, totalTokens);
  const inputTokens = costEstimate.usage.inputTokens;
  const outputTokens = costEstimate.usage.outputTokens;
  const estimatedCostUsd = costEstimate.estimatedCostUsd;
  const actualCostUsd = estimatedCostUsd;
  const billableTokens = args.billableMode === AI_USAGE_LANE.FORGE
    ? calculateForgeBillingTokens(actualCostUsd)
    : 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    actualCostUsd,
    billableTokens,
  };
}

export function buildUsageAccounting(args: {
  model: string;
  payload: unknown;
  fallbackTotalTokens: number;
  preflightEstimatedCostUsd?: number | null;
  billableMode: AiUsageLane | "non-billable";
}): UsageAccounting {
  const fallbackTotalTokens = Math.max(0, Math.floor(args.fallbackTotalTokens));
  const costEstimate = estimateOpenAiCostFromPayload(args.model, args.payload, fallbackTotalTokens);
  const inputTokens = costEstimate.usage.inputTokens;
  const outputTokens = costEstimate.usage.outputTokens;
  const totalTokens = Math.max(0, costEstimate.usage.totalTokens);
  const actualCostUsd = costEstimate.estimatedCostUsd;
  const estimatedCostUsd = typeof args.preflightEstimatedCostUsd === "number" && Number.isFinite(args.preflightEstimatedCostUsd)
    ? Math.max(0, Number(args.preflightEstimatedCostUsd.toFixed(8)))
    : actualCostUsd;
  const billableTokens = args.billableMode === AI_USAGE_LANE.FORGE
    ? calculateForgeBillingTokens(actualCostUsd)
    : 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    actualCostUsd,
    billableTokens,
  };
}

function inferKeySourceFromLane(lane: BillingMode): "forge" | "byo" {
  return lane === AI_USAGE_LANE.BYO ? "byo" : "forge";
}

function inferEffectiveAiKeySourceFromLane(lane: BillingMode): "forge_managed" | "user_byo" {
  return lane === AI_USAGE_LANE.BYO ? "user_byo" : "forge_managed";
}

function redactPolicySnapshot(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value) return {};
  const blocklist = new Set([
    "api_key",
    "encrypted_api_key",
    "authorization",
    "access_token",
    "refresh_token",
    "bearer_token",
    "headers",
    "cookie",
  ]);
  const recurse = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map((entry) => recurse(entry));
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (blocklist.has(k.toLowerCase())) {
        out[k] = "[redacted]";
      } else {
        out[k] = recurse(v);
      }
    }
    return out;
  };
  const redacted = recurse(value);
  return redacted && typeof redacted === "object" && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : {};
}

export async function recordAiUsageEvent(args: AiUsageRecordInput): Promise<void> {
  if (!args.supabaseService) return;
  if (!args.userId || !UUID_RE.test(args.userId)) return;
  if (!isAiUsageLane(args.lane)) {
    throw new Error(`Invalid ai_usage_events lane '${String(args.lane)}'`);
  }
  if (!isAiUsageTrigger(args.trigger)) {
    throw new Error(`Invalid ai_usage_events trigger '${String(args.trigger)}'`);
  }
  if (!isAiUsageStatus(args.status)) {
    throw new Error(`Invalid ai_usage_events status '${String(args.status)}'`);
  }
  assertValidAiUsageFeatureSubfeature(args.feature, args.subfeature ?? null);

  const tableClient = args.supabaseService.schema("tongs") as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };

  await tableClient
    .from("ai_usage_events")
    .insert({
      user_id: args.userId,
      lane: args.lane,
      provider: args.provider,
      key_source: args.keySource ?? inferKeySourceFromLane(args.lane),
      effective_ai_key_source: args.effectiveAiKeySource ?? inferEffectiveAiKeySourceFromLane(args.lane),
      key_resolution_status: args.keyResolutionStatus ?? "available",
      effective_billing_lane: args.effectiveBillingLane ?? args.lane,
      policy_decision_type: args.policyDecisionType ?? (args.status === "success" ? "ALLOW" : null),
      policy_reason_code: args.policyReasonCode ?? null,
      policy_snapshot: redactPolicySnapshot(args.policySnapshot),
      workspace_id: args.workspaceId,
      workpiece_id: args.workpieceId,
      session_id: args.sessionId,
      feature: args.feature,
      subfeature: args.subfeature ?? null,
      model: args.model,
      reasoning_effort: args.reasoningEffort ?? null,
      input_tokens: Math.max(0, Math.floor(args.inputTokens)),
      output_tokens: Math.max(0, Math.floor(args.outputTokens)),
      total_tokens: Math.max(0, Math.floor(args.totalTokens)),
      estimated_cost_usd: Number(args.estimatedCostUsd.toFixed(6)),
      actual_cost_usd: Number(args.actualCostUsd.toFixed(6)),
      billable_tokens: Math.max(0, Math.floor(args.billableTokens)),
      policy_enforced: args.policyEnforced ?? true,
      trigger: args.trigger,
      status: args.status,
      action_id: args.actionId ?? null,
      provider_request_id: args.providerRequestId ?? null,
      correlation_id: args.correlationId ?? null,
      occurred_at_ms: Date.now(),
    });
}

export async function applyAiTokenDelta(args: {
  supabaseService: SupabaseClient<Database> | null;
  userId: string;
  spent: number;
  requestId: string;
  openAiRequestId: string | null;
  reason: string;
}): Promise<{ ok: true; tokenBalance: number | null } | { ok: false; warning: string }> {
  if (!args.supabaseService) {
    return { ok: false, warning: "Unable to update credits." };
  }

  const rpcClient = args.supabaseService.schema("tongs") as unknown as {
    rpc: (
      fn: string,
      params: {
        p_user_id: string;
        p_delta: number;
        p_reason: string;
        p_request_id: string;
        p_provider_request_id?: string;
      },
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };

  const { data, error } = await rpcClient.rpc("apply_ai_token_delta", {
    p_user_id: args.userId,
    p_delta: -args.spent,
    p_reason: args.reason,
    p_request_id: args.requestId,
    p_provider_request_id: args.openAiRequestId ?? undefined,
  });

  if (error) {
    return { ok: false, warning: "Unable to update credits." };
  }

  const tokenBalance = extractRpcTokenBalance(data);
  return { ok: true, tokenBalance };
}

function extractRpcTokenBalance(payload: unknown): number | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0];
  if (!row || typeof row !== "object") return null;
  const tokenBalance = (row as Record<string, unknown>).token_balance;
  return typeof tokenBalance === "number" && Number.isFinite(tokenBalance) && tokenBalance >= 0
    ? tokenBalance
    : null;
}
