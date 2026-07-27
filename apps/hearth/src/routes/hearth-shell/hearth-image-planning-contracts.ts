import type { buildHearthImageMapPanelProps } from "../../views/modes/buildHearthImageMapPanelProps";
import type { buildHearthMediaMapPanelProps } from "../../views/modes/buildHearthMediaMapPanelProps";

export type HearthImagePlanningCompletion =
  | { kind: "inactive"; complete: false; brollEligible: false }
  | { kind: "loading"; complete: false; brollEligible: false }
  | { kind: "authority_unavailable"; complete: false; brollEligible: false }
  | { kind: "empty"; complete: false; brollEligible: false }
  | { kind: "count_mismatch"; complete: false; brollEligible: false }
  | { kind: "unresolved"; complete: false; brollEligible: false }
  | { kind: "selection_incomplete"; complete: false; brollEligible: false }
  | { kind: "complete"; complete: true; brollEligible: true };

export type HearthImagePlanningProgress = {
  planned: number;
  canonical: number;
  selected: number;
  unresolved: number;
};

export type HearthImagePlanningController = {
  state: {
    visualPlan: { entryCount: number; stale: boolean };
    imageMap: { entryCount: number; loaded: boolean };
    moments: { planned: number; canonical: number };
    candidates: { selected: number };
    selection: { complete: boolean };
    anchorVerification: { unresolved: number };
    progress: HearthImagePlanningProgress & {
      completion: HearthImagePlanningCompletion;
    };
  };
  commands: {
    retryImagePlanningLoad: () => void;
  };
  status: {
    visualPlan: "idle" | "busy" | "error";
    imageMap: "inactive" | "loading" | "loaded" | "unavailable" | "error";
    repair: "idle" | "busy" | "error";
    generation: "idle" | "busy" | "error";
    upload: "idle" | "busy" | "error";
    selection: "idle" | "busy" | "error";
    authority: "available" | "unavailable";
  };
  surfaces: {
    visualPlan: ReturnType<typeof buildHearthMediaMapPanelProps>;
    episodeImages: ReturnType<typeof buildHearthImageMapPanelProps>;
  };
  brollEligibilityInput: Readonly<{
    eligible: boolean;
    reason: HearthImagePlanningCompletion["kind"];
  }>;
};
