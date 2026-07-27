import { useBrollWorkspace } from "../../hooks/visuals/useBrollWorkspace";
import { useBrollCoreActions } from "../../hooks/visuals/useBrollCoreActions";
import { useBrollBridgeActions } from "../../hooks/visuals/useBrollBridgeActions";
import { buildHearthBrollPanelProps } from "../../views/modes/buildHearthBrollPanelProps";
import type { EpisodeBrollPlanBeat } from "../../lib/episode-package-v2";
import type {
  HearthBrollController,
  HearthBrollEligibilityInput,
} from "./hearth-broll-contracts";
import { buildHearthBrollProgress } from "./hearth-broll-progress";
import {
  deriveHearthBrollCompletion,
  deriveHearthBrollEligibility,
} from "./buildHearthBrollViewModel";

export const useHearthBrollWorkspaceState = useBrollWorkspace;
export const useHearthBrollCoreCommands = useBrollCoreActions;
export const useHearthBrollBridgeCommands = useBrollBridgeActions;

export function buildHearthBrollController(args: {
  active: boolean;
  loaded: boolean;
  loadFailed: boolean;
  authorityAvailable: boolean;
  visualPlanApplied: boolean;
  visualPlanStale: boolean;
  imagePlanningEligibility: HearthBrollEligibilityInput;
  beats: readonly EpisodeBrollPlanBeat[];
  coverageStrength: string | null;
  busy: boolean;
  error: boolean;
  retryBrollLoad: () => void;
  surfaceInput: Parameters<typeof buildHearthBrollPanelProps>[0];
}): HearthBrollController {
  const eligibility = deriveHearthBrollEligibility({
    active: args.active,
    imagePlanning: args.imagePlanningEligibility,
    visualPlanApplied: args.visualPlanApplied,
    visualPlanStale: args.visualPlanStale,
  });
  const progress = buildHearthBrollProgress(args.beats);
  const completion = deriveHearthBrollCompletion({
    active: args.active,
    loaded: args.loaded,
    failed: args.loadFailed,
    eligibility,
    progress,
  });
  return {
    state: {
      plan: { beatCount: args.beats.length, coverageStrength: args.coverageStrength },
      moments: { orderedIds: Object.freeze(args.beats.map((beat) => beat.id)) },
      assets: { selectedCount: progress.selected },
      progress: { ...progress, completion },
      eligibility,
    },
    commands: { retryBrollLoad: args.retryBrollLoad },
    status: {
      load: !args.active
        ? "inactive"
        : !eligibility.eligible
          ? "blocked"
          : args.loadFailed
            ? "error"
            : args.loaded
              ? "loaded"
              : "loading",
      generation: args.error ? "error" : args.busy ? "busy" : "idle",
      upload: args.error ? "error" : args.busy ? "busy" : "idle",
      selection: args.error ? "error" : args.busy ? "busy" : "idle",
      authority: args.authorityAvailable ? "available" : "unavailable",
    },
    surface: buildHearthBrollPanelProps(args.surfaceInput),
  };
}
