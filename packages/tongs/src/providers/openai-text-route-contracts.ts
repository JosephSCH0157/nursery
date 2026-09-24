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
  activationBlocker: "supporting_cost_policy_unpriced" | "test_canary_only";
};

const CONTRACTS: Record<OpenAiTextRouteCode, OpenAiTextRouteContract> = {
  "hearth.chat_completion": {
    routeCode: "hearth.chat_completion", costPolicyRevisionId: "10000000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-5.3-chat-latest"], maximumInputUnits: 384000, maximumOutputUnits: 49152,
    maximumAttempts: 3, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
  "hearth.title_generation": {
    routeCode: "hearth.title_generation", costPolicyRevisionId: "14000000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-5.6-luna"], maximumInputUnits: 12000, maximumOutputUnits: 512,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "test_canary_only",
  },
  "hearth.tag_generation": {
    routeCode: "hearth.tag_generation", costPolicyRevisionId: "15000000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-5.6-luna"], maximumInputUnits: 12000, maximumOutputUnits: 256,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "test_canary_only",
  },
  "hearth.framing_pack_generation": {
    routeCode: "hearth.framing_pack_generation", costPolicyRevisionId: "16000000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-5.6-luna"], maximumInputUnits: 12000, maximumOutputUnits: 2048,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "test_canary_only",
  },
  "hearth.thumbnail_direction_generation": {
    routeCode: "hearth.thumbnail_direction_generation", costPolicyRevisionId: "18000000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-5.6-luna"], maximumInputUnits: 16000, maximumOutputUnits: 2048,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "test_canary_only",
  },
  "hearth.thumbnail_base_generation": {
    routeCode: "hearth.thumbnail_base_generation", costPolicyRevisionId: "19630000-0000-4000-8000-000000000002",
    runtimeModels: ["gpt-image-2-2026-04-21"], maximumInputUnits: 16384, maximumOutputUnits: 1,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "test_canary_only",
  },
  "hearth.timeline_image_generation": {
    routeCode: "hearth.timeline_image_generation", costPolicyRevisionId: "19670000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-image-2-2026-04-21"], maximumInputUnits: 16384, maximumOutputUnits: 2,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "test_canary_only",
  },
  "hearth.script_generation": {
    routeCode: "hearth.script_generation", costPolicyRevisionId: "13000000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-5.6-luna"], maximumInputUnits: 32000, maximumOutputUnits: 8000,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "test_canary_only",
  },
  "hearth.research_synthesis": {
    routeCode: "hearth.research_synthesis", costPolicyRevisionId: "11000000-0000-4000-8000-000000000002",
    runtimeModels: ["gpt-5.3"], maximumInputUnits: 128000, maximumOutputUnits: 16384,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "supporting_cost_policy_unpriced",
  },
  "visual.unified_plan": {
    routeCode: "visual.unified_plan", costPolicyRevisionId: "17000000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-5.6-luna"], maximumInputUnits: 32000, maximumOutputUnits: 6144,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "test_canary_only",
  },
  "visual.narrative_interpretation": {
    routeCode: "visual.narrative_interpretation", costPolicyRevisionId: "19000000-0000-4000-8000-000000000001",
    runtimeModels: ["gpt-5.6-luna"], maximumInputUnits: 4096, maximumOutputUnits: 1024,
    maximumAttempts: 1, usableResultRequires: ["validation", "canonical_persistence"], activationReady: false,
    activationBlocker: "test_canary_only",
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
