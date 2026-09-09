import type { OpenAiTextRouteCode } from "./openai-text-paid-boundary.js";

export type OpenAiTextRouteContract = {
  routeCode: OpenAiTextRouteCode;
  costPolicyRevisionId: string;
  runtimeModels: readonly string[];
  maximumInputUnits: number;
  maximumOutputUnits: number;
  maximumAttempts: number;
  usableResultRequires: readonly ("validation" | "canonical_persistence")[];
  activationReady: false;
  activationBlocker: "supporting_cost_policy_unpriced";
};

const CONTRACTS: Record<OpenAiTextRouteCode, OpenAiTextRouteContract> = {
  "hearth.chat_completion": {
    routeCode: "hearth.chat_completion", costPolicyRevisionId: "10000000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-5.3-chat-latest"], maximumInputUnits: 384000, maximumOutputUnits: 49152,
    maximumAttempts: 3, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
  "hearth.research_synthesis": {
    routeCode: "hearth.research_synthesis", costPolicyRevisionId: "11000000-0000-4000-8000-000000000002",
    runtimeModels: ["gpt-5.3"], maximumInputUnits: 128000, maximumOutputUnits: 16384,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
  "visual.unified_plan": {
    routeCode: "visual.unified_plan", costPolicyRevisionId: "11000000-0000-4000-8000-000000000003",
    runtimeModels: ["gpt-5-mini"], maximumInputUnits: 64000, maximumOutputUnits: 16384,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
  "visual.narrative_interpretation": {
    routeCode: "visual.narrative_interpretation", costPolicyRevisionId: "11000000-0000-4000-8000-000000000004",
    runtimeModels: ["gpt-5-mini"], maximumInputUnits: 32000, maximumOutputUnits: 8000,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
  "motion.broll_interpretation": {
    routeCode: "motion.broll_interpretation", costPolicyRevisionId: "11000000-0000-4000-8000-000000000005",
    runtimeModels: ["gpt-5-mini"], maximumInputUnits: 32000, maximumOutputUnits: 8000,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
  "hammer.transcript_cleanup": {
    routeCode: "hammer.transcript_cleanup", costPolicyRevisionId: "11000000-0000-4000-8000-000000000006",
    runtimeModels: ["gpt-5.3"], maximumInputUnits: 128000, maximumOutputUnits: 16384,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
  "shorts.discovery": {
    routeCode: "shorts.discovery", costPolicyRevisionId: "11000000-0000-4000-8000-000000000007",
    runtimeModels: ["gpt-5.3"], maximumInputUnits: 64000, maximumOutputUnits: 16384,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
  "quench.metadata": {
    routeCode: "quench.metadata", costPolicyRevisionId: "11000000-0000-4000-8000-000000000008",
    runtimeModels: ["gpt-5.3"], maximumInputUnits: 32000, maximumOutputUnits: 8000,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
};

export function getOpenAiTextRouteContract(routeCode: OpenAiTextRouteCode): OpenAiTextRouteContract {
  return CONTRACTS[routeCode];
}

export function listOpenAiTextRouteContracts(): readonly OpenAiTextRouteContract[] {
  return Object.values(CONTRACTS);
}
