import type {
  EpisodeBrollDataVisualSpec,
  EpisodeBrollPlanBeat,
} from "../../lib/episode-package-v2";
import type {
  HearthBrollCompletion,
  HearthBrollEligibilityInput,
  HearthBrollProgress,
} from "./hearth-broll-contracts";

export function deriveHearthBrollEligibility(input: {
  active: boolean;
  imagePlanning: HearthBrollEligibilityInput;
  visualPlanApplied: boolean;
  visualPlanStale: boolean;
}): HearthBrollEligibilityInput {
  if (!input.active) return Object.freeze({ eligible: false, reason: "inactive" });
  if (input.visualPlanStale) return Object.freeze({ eligible: false, reason: "stale" });
  if (!input.visualPlanApplied) {
    return Object.freeze({ eligible: false, reason: "visual_plan_unapplied" });
  }
  return input.imagePlanning;
}

export function deriveHearthBrollCompletion(input: {
  active: boolean;
  loaded: boolean;
  failed: boolean;
  eligibility: HearthBrollEligibilityInput;
  progress: HearthBrollProgress;
}): HearthBrollCompletion {
  if (!input.active) return { kind: "inactive", complete: false };
  if (!input.eligibility.eligible) return { kind: "blocked", complete: false };
  if (input.failed || !input.loaded) return { kind: "loading", complete: false };
  if (input.progress.planned === 0) return { kind: "empty", complete: false };
  if (input.progress.selected !== input.progress.planned) {
    return { kind: "selection_incomplete", complete: false };
  }
  if (input.progress.resolved !== input.progress.planned) {
    return { kind: "fulfillment_incomplete", complete: false };
  }
  return { kind: "complete", complete: true };
}

export function buildHearthBrollDataVisualSpec(input: {
  intent: EpisodeBrollPlanBeat["motion_intent"];
  chartType: string;
  title: string;
  labels: string;
  values: string;
  emphasisKey: string;
  animationStyle: string;
}): EpisodeBrollDataVisualSpec | null {
  if (input.intent !== "data_visual") return null;
  const labels = input.labels.split(",").map((entry) => entry.trim()).filter(Boolean);
  const values = input.values
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((value) => Number.isFinite(value));
  return {
    chart_type: (input.chartType.trim() || "bar") as EpisodeBrollDataVisualSpec["chart_type"],
    title: input.title.trim() || null,
    labels,
    values,
    emphasis_key: input.emphasisKey.trim() || null,
    animation_style: input.animationStyle.trim() || null,
  };
}
