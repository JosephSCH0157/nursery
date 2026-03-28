export const FORGE_ALLOWED_CHAT_MODELS = ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"] as const;

export const FORGE_BILLING_TOKEN_USD = 18 / 1_000_000;

type ModelPricingPerMillion = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
};

export type OpenAiUsageMetrics = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
};

export type OpenAiCostEstimate = {
  estimatedCostUsd: number;
  effectiveModel: string;
  usage: OpenAiUsageMetrics;
  source: "usage_breakdown" | "total_only";
};

const MODEL_PRICING_USD_PER_MILLION: Record<string, ModelPricingPerMillion> = {
  "gpt-5.4": {
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 15,
    cachedInputUsdPerMillion: 0.625,
  },
  "gpt-5.4-mini": {
    inputUsdPerMillion: 0.5,
    outputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.125,
  },
  "gpt-5.4-nano": {
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.4,
    cachedInputUsdPerMillion: 0.025,
  },
  "gpt-4o-mini-transcribe": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 1.25,
  },
  "gpt-image-1": {
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 5,
  },
  "gpt-4o-mini": {
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.6,
  },
  "gpt-4o": {
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 10,
  },
};

const DEFAULT_SAFE_MODEL = "gpt-5.4";
const USD_MICRO = 1_000_000;

function roundUsd(value: number): number {
  return Math.max(0, Number(value.toFixed(8)));
}

function normalizeNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function resolvePricingModel(model: string | null | undefined): string {
  const normalized = (model ?? "").trim().toLowerCase();
  if (!normalized) return DEFAULT_SAFE_MODEL;
  if (MODEL_PRICING_USD_PER_MILLION[normalized]) return normalized;
  if (normalized.startsWith("gpt-5.4")) return "gpt-5.4";
  if (normalized.startsWith("gpt-4o-mini")) return "gpt-4o-mini";
  if (normalized.startsWith("gpt-4o")) return "gpt-4o";
  return DEFAULT_SAFE_MODEL;
}

export function extractOpenAiUsageMetrics(payload: unknown): OpenAiUsageMetrics | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  const usageRecord = usage as Record<string, unknown>;

  const promptTokens = normalizeNonNegativeNumber(usageRecord.prompt_tokens);
  const completionTokens = normalizeNonNegativeNumber(usageRecord.completion_tokens);
  const totalTokensRaw = normalizeNonNegativeNumber(usageRecord.total_tokens);

  let cachedInputTokens = 0;
  const promptDetails = usageRecord.prompt_tokens_details;
  if (promptDetails && typeof promptDetails === "object") {
    cachedInputTokens = normalizeNonNegativeNumber(
      (promptDetails as Record<string, unknown>).cached_tokens,
    );
  }

  const inputTokens = promptTokens;
  const outputTokens = completionTokens;
  const totalTokens = totalTokensRaw > 0
    ? totalTokensRaw
    : Math.max(0, inputTokens + outputTokens);

  if (totalTokens <= 0 && inputTokens <= 0 && outputTokens <= 0) return null;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
  };
}

export function estimateOpenAiCost(
  model: string | null | undefined,
  usage: OpenAiUsageMetrics,
): OpenAiCostEstimate {
  const effectiveModel = resolvePricingModel(model);
  const pricing = MODEL_PRICING_USD_PER_MILLION[effectiveModel] ?? MODEL_PRICING_USD_PER_MILLION[DEFAULT_SAFE_MODEL];
  const inputTokens = Math.max(0, usage.inputTokens);
  const outputTokens = Math.max(0, usage.outputTokens);
  const totalTokens = Math.max(0, usage.totalTokens);
  const cachedInputTokens = Math.min(Math.max(0, usage.cachedInputTokens), inputTokens);
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);

  if (inputTokens > 0 || outputTokens > 0) {
    const costInput = (uncachedInputTokens / USD_MICRO) * pricing.inputUsdPerMillion;
    const costCachedInput = pricing.cachedInputUsdPerMillion != null
      ? (cachedInputTokens / USD_MICRO) * pricing.cachedInputUsdPerMillion
      : 0;
    const costOutput = (outputTokens / USD_MICRO) * pricing.outputUsdPerMillion;
    return {
      estimatedCostUsd: roundUsd(costInput + costCachedInput + costOutput),
      effectiveModel,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: Math.max(totalTokens, inputTokens + outputTokens),
        cachedInputTokens,
      },
      source: "usage_breakdown",
    };
  }

  const fallbackCost = (totalTokens / USD_MICRO) * pricing.outputUsdPerMillion;
  return {
    estimatedCostUsd: roundUsd(fallbackCost),
    effectiveModel,
    usage: {
      inputTokens: 0,
      outputTokens: totalTokens,
      totalTokens,
      cachedInputTokens: 0,
    },
    source: "total_only",
  };
}

export function estimateOpenAiCostFromPayload(
  model: string | null | undefined,
  payload: unknown,
  fallbackTotalTokens: number,
): OpenAiCostEstimate {
  const fromPayload = extractOpenAiUsageMetrics(payload);
  const usage = fromPayload ?? {
    inputTokens: 0,
    outputTokens: Math.max(0, fallbackTotalTokens),
    totalTokens: Math.max(0, fallbackTotalTokens),
    cachedInputTokens: 0,
  };
  return estimateOpenAiCost(model, usage);
}

export function calculateForgeBillingTokens(actualCostUsd: number): number {
  if (!Number.isFinite(actualCostUsd) || actualCostUsd <= 0) return 0;
  return Math.max(0, Math.ceil(actualCostUsd / FORGE_BILLING_TOKEN_USD));
}