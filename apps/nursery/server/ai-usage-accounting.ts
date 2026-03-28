import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import {
  calculateForgeBillingTokens,
  estimateOpenAiCostFromPayload,
  extractOpenAiUsageMetrics,
} from "./hearth/ai-pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BillingMode = "forge" | "byo";
export type AiUsageStatus = "success" | "error";
export type AiUsageTrigger = "user" | "system";

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
  feature: string;
  subfeature?: string | null;
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
  actionId?: string | null;
  providerRequestId?: string | null;
  correlationId?: string | null;
};

export function normalizeBillingMode(value: unknown, fallback: BillingMode): BillingMode {
  return value === "byo" ? "byo" : value === "forge" ? "forge" : fallback;
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
  billableMode: "forge" | "non-billable";
}): TranscriptionAccounting {
  const totalTokens = extractTotalTokens(args.payload) ?? estimateTranscriptionTokenFallback(args.text);
  const costEstimate = estimateOpenAiCostFromPayload(args.model, args.payload, totalTokens);
  const inputTokens = costEstimate.usage.inputTokens;
  const outputTokens = costEstimate.usage.outputTokens;
  const estimatedCostUsd = costEstimate.estimatedCostUsd;
  const actualCostUsd = estimatedCostUsd;
  const billableTokens = args.billableMode === "forge"
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
  billableMode: "forge" | "non-billable";
}): UsageAccounting {
  const fallbackTotalTokens = Math.max(0, Math.floor(args.fallbackTotalTokens));
  const costEstimate = estimateOpenAiCostFromPayload(args.model, args.payload, fallbackTotalTokens);
  const inputTokens = costEstimate.usage.inputTokens;
  const outputTokens = costEstimate.usage.outputTokens;
  const totalTokens = Math.max(0, costEstimate.usage.totalTokens);
  const estimatedCostUsd = costEstimate.estimatedCostUsd;
  const actualCostUsd = estimatedCostUsd;
  const billableTokens = args.billableMode === "forge"
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

export async function recordAiUsageEvent(args: AiUsageRecordInput): Promise<void> {
  if (!args.supabaseService) return;
  if (!args.userId || !UUID_RE.test(args.userId)) return;

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
