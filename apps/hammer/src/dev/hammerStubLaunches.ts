import type { HammerEditPlan } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import { getHammerDevLaunchPreset } from "./hammerLaunchPresets";

export const HAMMER_STUB_LAUNCH_QUERY_KEY = "hammer_stub";

export const HAMMER_STUB_LAUNCH_SCENARIO_IDS = [
  "clean-workpiece",
  "existing-edit-plan",
  "mapped-media-missing",
] as const;

export type HammerStubLaunchScenarioId = (typeof HAMMER_STUB_LAUNCH_SCENARIO_IDS)[number];

export interface HammerProjectOutput {
  id: string;
  label: string;
}

export interface HammerStubLaunchScenario {
  id: HammerStubLaunchScenarioId;
  title: string;
  summary: string;
  poster_label: string;
  poster_tint: string;
  outputs: HammerProjectOutput[];
  launchContext: HammerLaunchContext;
  expectedOutcome: string;
}

const DEFAULT_OUTPUTS: HammerProjectOutput[] = [
  { id: "main-edit", label: "Main Edit" },
  { id: "clips", label: "Clips" },
  { id: "shorts", label: "Shorts" },
  { id: "alternate-cut", label: "Alternate Cut" },
  { id: "trailer", label: "Trailer" },
];

const STUB_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

const STUB_WORKPIECE_IDS: Record<HammerStubLaunchScenarioId, string> = {
  "clean-workpiece": "22222222-2222-4222-8222-222222222222",
  "existing-edit-plan": "33333333-3333-4333-8333-333333333333",
  "mapped-media-missing": "44444444-4444-4444-8444-444444444444",
};

const STUB_SESSION_IDS: Record<HammerStubLaunchScenarioId, string> = {
  "clean-workpiece": "session_tongs_stub_clean",
  "existing-edit-plan": "session_tongs_stub_existing_plan",
  "mapped-media-missing": "session_mapped_media_missing",
};

function cloneEditPlan(plan: HammerEditPlan): HammerEditPlan {
  return {
    ...plan,
    instructions: plan.instructions.map((instruction) => ({ ...instruction })),
  };
}

function cloneWorkspaceMapping(mapping: WorkspaceMediaMapping): WorkspaceMediaMapping {
  return { ...mapping };
}

function cloneLaunchContext(context: HammerLaunchContext): HammerLaunchContext {
  return {
    ...context,
    transcript: context.transcript.kind === "tongs-stub"
      ? {
        ...context.transcript,
        segments: context.transcript.segments.map((segment) => ({ ...segment })),
      }
      : { ...context.transcript },
    media: context.media.kind === "mapped-local"
      ? {
        ...context.media,
        ref: { ...context.media.ref },
      }
      : context.media.kind === "tongs-stub"
      ? {
        ...context.media,
        ref: { ...context.media.ref },
        workspace_mapping: context.media.workspace_mapping
          ? cloneWorkspaceMapping(context.media.workspace_mapping)
          : undefined,
      }
      : { ...context.media },
    edit_plan: context.edit_plan ? cloneEditPlan(context.edit_plan) : undefined,
  };
}

function withRouteIdentity(
  context: HammerLaunchContext,
  scenarioId: HammerStubLaunchScenarioId,
): HammerLaunchContext {
  const workpieceId = STUB_WORKPIECE_IDS[scenarioId];
  const sessionId = STUB_SESSION_IDS[scenarioId];
  const nextContext = cloneLaunchContext(context);

  nextContext.workspace_id = STUB_WORKSPACE_ID;
  nextContext.workpiece_id = workpieceId;
  nextContext.session_id = sessionId;

  if (nextContext.media.kind === "tongs-stub" && nextContext.media.workspace_mapping) {
    nextContext.media.workspace_mapping.workspace_id = STUB_WORKSPACE_ID;
  }

  if (nextContext.edit_plan) {
    nextContext.edit_plan.workspace_id = STUB_WORKSPACE_ID;
    nextContext.edit_plan.workpiece_id = workpieceId;
    nextContext.edit_plan.session_id = sessionId;
  }

  return nextContext;
}

const SCENARIO_INDEX: Record<HammerStubLaunchScenarioId, HammerStubLaunchScenario> = {
  "clean-workpiece": {
    id: "clean-workpiece",
    title: "Clean Workpiece",
    summary: "Simulated Tongs launch with transcript and media resolved, but no existing edit plan.",
    poster_label: "EP 014",
    poster_tint: "linear-gradient(160deg, rgba(14, 116, 144, 0.72), rgba(15, 23, 42, 0.92))",
    outputs: DEFAULT_OUTPUTS,
    launchContext: withRouteIdentity(getHammerDevLaunchPreset("tongs-stub-clean"), "clean-workpiece"),
    expectedOutcome: "Hammer opens in edit-aware preview with a clean plan state and no preloaded instructions.",
  },
  "existing-edit-plan": {
    id: "existing-edit-plan",
    title: "Existing Edit Plan",
    summary: "Simulated Tongs launch with a stored edit plan and preserved preview mode.",
    poster_label: "CUT B",
    poster_tint: "linear-gradient(160deg, rgba(91, 33, 182, 0.7), rgba(15, 23, 42, 0.92))",
    outputs: DEFAULT_OUTPUTS,
    launchContext: withRouteIdentity(getHammerDevLaunchPreset("tongs-stub-with-edit-plan"), "existing-edit-plan"),
    expectedOutcome: "Hammer opens in reloaded state, restores the stored instructions, and keeps the provided preview mode.",
  },
  "mapped-media-missing": {
    id: "mapped-media-missing",
    title: "Mapped Media Missing",
    summary: "Simulated launch where Tongs points Hammer at mapped local media that cannot be resolved on this machine.",
    poster_label: "MISSING",
    poster_tint: "linear-gradient(160deg, rgba(153, 27, 27, 0.7), rgba(15, 23, 42, 0.92))",
    outputs: DEFAULT_OUTPUTS,
    launchContext: withRouteIdentity(getHammerDevLaunchPreset("mapped-media-missing"), "mapped-media-missing"),
    expectedOutcome: "Hammer stays honest about missing media, resolves transcript state, and falls back to dev-tone preview audio.",
  },
};

export function isHammerStubLaunchScenarioId(value: string): value is HammerStubLaunchScenarioId {
  return HAMMER_STUB_LAUNCH_SCENARIO_IDS.includes(value as HammerStubLaunchScenarioId);
}

export function getHammerStubLaunchScenario(
  scenarioId: HammerStubLaunchScenarioId,
): HammerStubLaunchScenario {
  const scenario = SCENARIO_INDEX[scenarioId];
  return {
    ...scenario,
    outputs: scenario.outputs.map((output) => ({ ...output })),
    launchContext: cloneLaunchContext(scenario.launchContext),
  };
}

export function listHammerStubLaunchScenarios(): HammerStubLaunchScenario[] {
  return HAMMER_STUB_LAUNCH_SCENARIO_IDS.map((scenarioId) => getHammerStubLaunchScenario(scenarioId));
}

export function readHammerStubLaunchScenarioId(
  search: string,
): HammerStubLaunchScenarioId | null {
  const params = new URLSearchParams(search);
  const rawValue = params.get(HAMMER_STUB_LAUNCH_QUERY_KEY)?.trim();
  if (!rawValue || !isHammerStubLaunchScenarioId(rawValue)) {
    return null;
  }
  return rawValue;
}
