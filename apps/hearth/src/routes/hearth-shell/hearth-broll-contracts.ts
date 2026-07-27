import type { buildHearthBrollPanelProps } from "../../views/modes/buildHearthBrollPanelProps";

export type HearthBrollEligibilityInput = Readonly<{
  eligible: boolean;
  reason:
    | "inactive"
    | "loading"
    | "authority_unavailable"
    | "empty"
    | "visual_plan_unapplied"
    | "image_planning_incomplete"
    | "count_mismatch"
    | "selection_incomplete"
    | "unresolved"
    | "stale"
    | "complete";
}>;

export type HearthBrollProgress = {
  planned: number;
  selected: number;
  resolved: number;
};

export type HearthBrollCompletion =
  | { kind: "inactive"; complete: false }
  | { kind: "blocked"; complete: false }
  | { kind: "loading"; complete: false }
  | { kind: "empty"; complete: false }
  | { kind: "selection_incomplete"; complete: false }
  | { kind: "fulfillment_incomplete"; complete: false }
  | { kind: "complete"; complete: true };

export type HearthBrollController = {
  state: {
    plan: { beatCount: number; coverageStrength: string | null };
    moments: { orderedIds: readonly string[] };
    assets: { selectedCount: number };
    progress: HearthBrollProgress & { completion: HearthBrollCompletion };
    eligibility: HearthBrollEligibilityInput;
  };
  commands: {
    retryBrollLoad: () => void;
  };
  status: {
    load: "inactive" | "blocked" | "loading" | "loaded" | "error";
    generation: "idle" | "busy" | "error";
    upload: "idle" | "busy" | "error";
    selection: "idle" | "busy" | "error";
    authority: "available" | "unavailable";
  };
  surface: ReturnType<typeof buildHearthBrollPanelProps>;
};
