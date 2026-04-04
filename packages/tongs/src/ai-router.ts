import {
  FORGE_AI_POLICY,
  FORGE_MODEL_ORDER,
  FORGE_REASONING_ORDER,
  type ForgeChatModel,
  type ForgeReasoningEffort,
} from "./ai-policy.js";
import { estimateCost } from "./ai-pricing.js";

export type TaskTier = "tier0" | "tier1" | "tier2" | "tier3";

export type ForgeAiTool = "hearth" | "hammer" | "quench" | "anvil" | "tongs";

export type ForgeAiTaskFeature =
  | "punctuation_fix"
  | "grammar_cleanup"
  | "dedupe_cleanup"
  | "transcript_formatting"
  | "sentence_smoothing"
  | "short_rewrite"
  | "transcript_cleanup_assist"
  | "metadata_draft_simple"
  | "script_draft"
  | "outline_expansion"
  | "segment_rewrite"
  | "transcript_cleanup_complex"
  | "show_notes_draft"
  | "research"
  | "analysis"
  | "argument_structuring"
  | "complex_script_synthesis"
  | "editorial_judgment"
  | "multi_source_reasoning"
  | "chat"
  | "outline"
  | "rewrite"
  | "readiness_check";

export type ForgeAiRoutingInput = {
  tool: ForgeAiTool;
  feature: string | null;
  requestedModel?: string | null;
  requestedReasoningEffort?: string | null;
  estimatedTokens?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type ForgeAiSelection = {
  model: ForgeChatModel;
  reasoning: Exclude<ForgeReasoningEffort, "high">;
};

export type ForgeAiRouteDecision = ForgeAiSelection & {
  taskTier: TaskTier;
  policyEnforced: true;
  overrideIgnored: boolean;
  estimatedCostUsd: number;
};

export const MODEL_LADDER: ReadonlyArray<ForgeAiSelection> = [
  { model: "gpt-5.1", reasoning: "low" },
  { model: "gpt-5.2", reasoning: "low" },
  { model: "gpt-5.2", reasoning: "medium" },
  { model: "gpt-5.3", reasoning: "low" },
  { model: "gpt-5.3", reasoning: "medium" },
] as const;

const TIER_REQUIREMENTS: Record<Exclude<TaskTier, "tier0">, ForgeAiSelection> = {
  tier1: { model: "gpt-5.1", reasoning: "low" },
  tier2: { model: "gpt-5.2", reasoning: "medium" },
  tier3: { model: "gpt-5.3", reasoning: "medium" },
};

const DEFAULT_TOKEN_ESTIMATE = {
  inputTokens: 1200,
  outputTokens: 800,
};

function normalizeFeature(feature: string | null | undefined): string {
  return (feature ?? "").trim().toLowerCase();
}

function normalizeModel(model: string | null | undefined): string {
  return (model ?? "").trim().toLowerCase();
}

function normalizeReasoning(reasoning: string | null | undefined): string {
  return (reasoning ?? "").trim().toLowerCase();
}

function modelOrderIndex(model: string): number {
  return FORGE_MODEL_ORDER.indexOf(model as ForgeChatModel);
}

function reasoningOrderIndex(reasoning: string): number {
  return FORGE_REASONING_ORDER.indexOf(reasoning as ForgeReasoningEffort);
}

function clampModelToPolicy(model: ForgeChatModel): ForgeChatModel {
  const requestedIndex = modelOrderIndex(model);
  const maxIndex = modelOrderIndex(FORGE_AI_POLICY.maxModel);
  if (requestedIndex === -1 || maxIndex === -1) return FORGE_AI_POLICY.maxModel;
  return requestedIndex > maxIndex ? FORGE_AI_POLICY.maxModel : model;
}

function clampReasoningToPolicy(
  reasoning: Exclude<ForgeReasoningEffort, "high">,
): Exclude<ForgeReasoningEffort, "high"> {
  const requestedIndex = reasoningOrderIndex(reasoning);
  const maxIndex = reasoningOrderIndex(FORGE_AI_POLICY.maxReasoning);
  if (requestedIndex === -1 || maxIndex === -1) return "medium";
  if (requestedIndex > maxIndex) return "medium";
  return reasoning;
}

function mapFeatureToTaskTier(feature: string): TaskTier {
  switch (feature) {
    case "punctuation_fix":
    case "grammar_cleanup":
    case "dedupe_cleanup":
    case "transcript_formatting":
      return "tier0";
    case "sentence_smoothing":
    case "short_rewrite":
    case "transcript_cleanup_assist":
    case "metadata_draft_simple":
      return "tier1";
    case "script_draft":
    case "outline_expansion":
    case "segment_rewrite":
    case "transcript_cleanup_complex":
    case "show_notes_draft":
      return "tier2";
    case "research":
    case "analysis":
    case "argument_structuring":
    case "complex_script_synthesis":
    case "editorial_judgment":
    case "multi_source_reasoning":
      return "tier3";
    default:
      return "tier2";
  }
}

function estimateModelCostUsd(
  model: ForgeChatModel,
  estimatedTokens: { inputTokens: number; outputTokens: number },
): number {
  return estimateCost(model, {
    input: estimatedTokens.inputTokens,
    output: estimatedTokens.outputTokens,
  });
}

function meetsTierRequirement(candidate: ForgeAiSelection, tier: Exclude<TaskTier, "tier0">): boolean {
  const required = TIER_REQUIREMENTS[tier];
  const candidateModelIndex = modelOrderIndex(candidate.model);
  const requiredModelIndex = modelOrderIndex(required.model);
  const candidateReasoningIndex = reasoningOrderIndex(candidate.reasoning);
  const requiredReasoningIndex = reasoningOrderIndex(required.reasoning);
  return candidateModelIndex >= requiredModelIndex && candidateReasoningIndex >= requiredReasoningIndex;
}

function classifyHearthFeature(feature: string): TaskTier {
  switch (feature) {
    case "readiness_check":
      return "tier3";
    case "outline":
      return "tier2";
    case "rewrite":
      return "tier2";
    case "research":
      return "tier3";
    case "analysis":
      return "tier3";
    case "chat":
      return "tier2";
    default:
      return mapFeatureToTaskTier(feature);
  }
}

export function classifyTask(input: ForgeAiRoutingInput): TaskTier {
  const feature = normalizeFeature(input.feature);
  if (input.tool === "hearth") {
    return classifyHearthFeature(feature);
  }
  return mapFeatureToTaskTier(feature);
}

export function selectModel(
  tier: TaskTier,
  estimatedTokens: { inputTokens: number; outputTokens: number } = DEFAULT_TOKEN_ESTIMATE,
): ForgeAiSelection {
  if (tier === "tier0") {
    return { model: "gpt-5.1", reasoning: "low" };
  }
  const candidates = MODEL_LADDER.filter((candidate) => meetsTierRequirement(candidate, tier));
  const sorted = [...candidates].sort((a, b) => {
    const aCost = estimateModelCostUsd(a.model, estimatedTokens);
    const bCost = estimateModelCostUsd(b.model, estimatedTokens);
    if (aCost !== bCost) return aCost - bCost;
    return modelOrderIndex(a.model) - modelOrderIndex(b.model);
  });
  return sorted[0] ?? MODEL_LADDER[MODEL_LADDER.length - 1] ?? { model: "gpt-5.3", reasoning: "medium" };
}

export function enforcePolicy(selection: ForgeAiSelection): ForgeAiSelection {
  const boundedModel = clampModelToPolicy(selection.model);
  const boundedReasoning = clampReasoningToPolicy(selection.reasoning);
  return {
    model: boundedModel,
    reasoning: boundedReasoning,
  };
}

export function routeForgeAiRequest(input: ForgeAiRoutingInput): ForgeAiRouteDecision {
  const taskTier = classifyTask(input);
  const estimatedTokens = {
    inputTokens: Math.max(0, Math.floor(input.estimatedTokens?.inputTokens ?? DEFAULT_TOKEN_ESTIMATE.inputTokens)),
    outputTokens: Math.max(0, Math.floor(input.estimatedTokens?.outputTokens ?? DEFAULT_TOKEN_ESTIMATE.outputTokens)),
  };
  const autoSelection = selectModel(taskTier, estimatedTokens);
  const finalSelection = enforcePolicy(autoSelection);
  const estimatedCostUsd = estimateModelCostUsd(finalSelection.model, estimatedTokens);

  if (estimatedCostUsd > FORGE_AI_POLICY.maxCostUsdPerCall) {
    throw new Error("AI cost exceeds allowed budget");
  }

  const requestedModel = normalizeModel(input.requestedModel);
  const requestedReasoning = normalizeReasoning(input.requestedReasoningEffort);
  const overrideIgnored = (
    (requestedModel.length > 0 && requestedModel !== finalSelection.model)
    || (requestedReasoning.length > 0 && requestedReasoning !== finalSelection.reasoning)
  );

  return {
    model: finalSelection.model,
    reasoning: finalSelection.reasoning,
    taskTier,
    policyEnforced: true,
    overrideIgnored,
    estimatedCostUsd,
  };
}
