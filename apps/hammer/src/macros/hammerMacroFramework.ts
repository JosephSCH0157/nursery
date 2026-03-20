import type { MediaKind } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";

export type HammerMacroCategory =
  | "audio_cleanup"
  | "speech_cleanup"
  | "visual_cleanup"
  | "structural_cleanup";

export type HammerMacroRequirementKind =
  | "prepared_transcript"
  | "audio_monitoring"
  | "polished_audio"
  | "video_source"
  | "visual_suggestions";

export type HammerMacroRequirementImportance = "required" | "recommended";
export type HammerMacroReadinessStatus = "ready" | "warning" | "blocked";

export interface HammerFinishingMacroRequirement {
  kind: HammerMacroRequirementKind;
  label: string;
  detail: string;
  importance: HammerMacroRequirementImportance;
}

export interface HammerFinishingMacroRecipe {
  ref: string;
  name: string;
  version: string;
  category: HammerMacroCategory;
  description: string;
  intended_actions: string[];
  requirements: HammerFinishingMacroRequirement[];
}

export interface HammerMacroReadinessInput {
  transcriptSegmentCount: number;
  activeMediaKind: MediaKind | null;
  playbackSourceAvailable: boolean;
  audioPolish: HammerPersistedAudioPolish | null;
  visualPlacements: HammerPersistedVisualPlacements | null;
}

export interface HammerMacroRequirementResult extends HammerFinishingMacroRequirement {
  satisfied: boolean;
  resolution: string;
}

export interface HammerMacroReadiness {
  recipe: HammerFinishingMacroRecipe;
  status: HammerMacroReadinessStatus;
  status_label: "Ready" | "Needs Review" | "Blocked";
  detail: string;
  dry_run_summary: string;
  requirement_results: HammerMacroRequirementResult[];
}

export interface HammerMacroReadinessSummary {
  total: number;
  ready: number;
  warning: number;
  blocked: number;
}

export const HAMMER_FINISHING_MACRO_RECIPES: HammerFinishingMacroRecipe[] = [
  {
    ref: "macro:podcast_cleanup.v1",
    name: "Podcast Cleanup",
    version: "1",
    category: "speech_cleanup",
    description: "Generate a derived transcript cleanup layer that removes conservative filler words while preserving raw transcript truth and media timing.",
    intended_actions: [
      "Review filler-word removals",
      "Inspect before/after transcript changes",
      "Accept or discard the derived review layer",
    ],
    requirements: [
      {
        kind: "prepared_transcript",
        label: "Prepared transcript",
        detail: "A structured transcript is required so finishing macros can stay anchored to transcript truth.",
        importance: "required",
      },
      {
        kind: "audio_monitoring",
        label: "Monitorable audio",
        detail: "Hammer needs a real playback path before any speech cleanup can be reviewed safely.",
        importance: "required",
      },
      {
        kind: "polished_audio",
        label: "Baseline audio polish",
        detail: "Prepared studio-sound playback improves speech-cleanup review, but raw fallback can still be used later.",
        importance: "recommended",
      },
    ],
  },
  {
    ref: "macro:video_polish.v1",
    name: "Video Polish",
    version: "1",
    category: "visual_cleanup",
    description: "Queue future visual cleanup moves such as background blur, eye contact correction, and framing review from one place.",
    intended_actions: [
      "Review background blur eligibility",
      "Review eye contact correction eligibility",
      "Review light framing cleanup opportunities",
    ],
    requirements: [
      {
        kind: "video_source",
        label: "Video source",
        detail: "Visual cleanup macros only make sense when the workpiece has real video attached.",
        importance: "required",
      },
      {
        kind: "prepared_transcript",
        label: "Prepared transcript",
        detail: "Transcript anchoring keeps future visual cleanup aligned with the current edit context.",
        importance: "recommended",
      },
      {
        kind: "visual_suggestions",
        label: "Image suggestion context",
        detail: "Seeded visual suggestions help future polish recipes stay aware of current visual timing.",
        importance: "recommended",
      },
    ],
  },
  {
    ref: "macro:interview_tight_cut.v1",
    name: "Interview Tight Cut",
    version: "1",
    category: "structural_cleanup",
    description: "Generate a derived transcript tightening layer that removes conservative false starts and repeated restarts without changing raw transcript truth or media timing.",
    intended_actions: [
      "Review false-start trims",
      "Inspect repeated-start and restart cleanup candidates",
      "Accept or discard the derived review layer",
    ],
    requirements: [
      {
        kind: "prepared_transcript",
        label: "Prepared transcript",
        detail: "Transcript turns are required before Hammer can safely describe structural cleanup candidates.",
        importance: "required",
      },
      {
        kind: "audio_monitoring",
        label: "Monitorable audio",
        detail: "A usable playback path is required before any cadence-sensitive cleanup should be attempted.",
        importance: "required",
      },
      {
        kind: "polished_audio",
        label: "Baseline audio polish",
        detail: "Prepared polished playback is preferred for judging cadence and false starts.",
        importance: "recommended",
      },
    ],
  },
];

function isVideoMediaKind(kind: MediaKind | null): boolean {
  return kind === "recording_video" || kind === "export_video";
}

function buildRequirementResult(
  requirement: HammerFinishingMacroRequirement,
  input: HammerMacroReadinessInput,
): HammerMacroRequirementResult {
  switch (requirement.kind) {
    case "prepared_transcript":
      return {
        ...requirement,
        satisfied: input.transcriptSegmentCount > 0,
        resolution: input.transcriptSegmentCount > 0
          ? `${input.transcriptSegmentCount} transcript segment${input.transcriptSegmentCount === 1 ? "" : "s"} are prepared.`
          : "Hammer needs transcript prep before this macro can describe finishing moves truthfully.",
      };
    case "audio_monitoring":
      return {
        ...requirement,
        satisfied: input.playbackSourceAvailable,
        resolution: input.playbackSourceAvailable
          ? "Hammer has a playback path for monitoring future cleanup decisions."
          : "Hammer needs a playable audio path before this macro can be reviewed safely.",
      };
    case "polished_audio":
      return {
        ...requirement,
        satisfied: input.audioPolish?.status === "prepared",
        resolution: input.audioPolish?.status === "prepared"
          ? "Baseline audio polish is prepared and available for review."
          : input.audioPolish?.status === "failed"
          ? input.audioPolish.failure_reason ?? "Hammer is still on the raw audio fallback."
          : "Baseline audio polish is not prepared yet.",
      };
    case "video_source":
      return {
        ...requirement,
        satisfied: isVideoMediaKind(input.activeMediaKind),
        resolution: isVideoMediaKind(input.activeMediaKind)
          ? "A real video source is attached for visual cleanup review."
          : "This workpiece is not currently attached to video, so visual polish remains unavailable.",
      };
    case "visual_suggestions": {
      const suggestionCount = input.visualPlacements?.placements.length ?? 0;
      return {
        ...requirement,
        satisfied: suggestionCount > 0,
        resolution: suggestionCount > 0
          ? `${suggestionCount} visual suggestion${suggestionCount === 1 ? "" : "s"} are available for context.`
          : "Hammer does not have seeded visual suggestions for this workpiece yet.",
      };
    }
    default:
      return {
        ...requirement,
        satisfied: false,
        resolution: "Requirement status is unavailable.",
      };
  }
}

function buildMacroReadinessDetail(
  recipe: HammerFinishingMacroRecipe,
  requirementResults: HammerMacroRequirementResult[],
): Pick<HammerMacroReadiness, "status" | "status_label" | "detail" | "dry_run_summary"> {
  const missingRequired = requirementResults.filter((result) => (
    result.importance === "required" && !result.satisfied
  ));
  const missingRecommended = requirementResults.filter((result) => (
    result.importance === "recommended" && !result.satisfied
  ));

  if (missingRequired.length > 0) {
    return {
      status: "blocked",
      status_label: "Blocked",
      detail: `${recipe.name} is blocked until ${missingRequired.map((result) => result.label.toLowerCase()).join(" and ")} ${missingRequired.length === 1 ? "is" : "are"} available.`,
      dry_run_summary: "Hammer can show the recipe intent now, but execution stays unavailable until blocking prerequisites are satisfied.",
    };
  }

  if (missingRecommended.length > 0) {
    return {
      status: "warning",
      status_label: "Needs Review",
      detail: `${recipe.name} can be reviewed now, but ${missingRecommended.map((result) => result.label.toLowerCase()).join(" and ")} ${missingRecommended.length === 1 ? "is" : "are"} still missing.`,
      dry_run_summary: "Hammer can describe the recipe and execute a conservative derived transcript pass now, with some prep quality signals still pending.",
    };
  }

  return {
    status: "ready",
    status_label: "Ready",
    detail: `${recipe.name} has the current prerequisites it needs for a truthful future run review.`,
    dry_run_summary: "Hammer can describe the recipe, execute a derived review layer, and keep raw transcript truth untouched.",
  };
}

export function listHammerFinishingMacroRecipes(): HammerFinishingMacroRecipe[] {
  return HAMMER_FINISHING_MACRO_RECIPES.map((recipe) => ({
    ...recipe,
    intended_actions: [...recipe.intended_actions],
    requirements: recipe.requirements.map((requirement) => ({ ...requirement })),
  }));
}

export function findHammerFinishingMacroRecipe(
  recipeRef: string | null | undefined,
): HammerFinishingMacroRecipe | null {
  if (!recipeRef) return null;
  return HAMMER_FINISHING_MACRO_RECIPES.find((recipe) => recipe.ref === recipeRef) ?? null;
}

export function evaluateHammerMacroReadiness(
  recipe: HammerFinishingMacroRecipe,
  input: HammerMacroReadinessInput,
): HammerMacroReadiness {
  const requirementResults = recipe.requirements.map((requirement) => buildRequirementResult(requirement, input));
  const detail = buildMacroReadinessDetail(recipe, requirementResults);
  return {
    recipe: {
      ...recipe,
      intended_actions: [...recipe.intended_actions],
      requirements: recipe.requirements.map((requirement) => ({ ...requirement })),
    },
    requirement_results: requirementResults,
    ...detail,
  };
}

export function evaluateHammerMacroCatalogReadiness(
  input: HammerMacroReadinessInput,
): HammerMacroReadiness[] {
  return listHammerFinishingMacroRecipes().map((recipe) => evaluateHammerMacroReadiness(recipe, input));
}

export function summarizeHammerMacroReadiness(
  readiness: HammerMacroReadiness[],
): HammerMacroReadinessSummary {
  return readiness.reduce<HammerMacroReadinessSummary>((summary, item) => {
    summary.total += 1;
    if (item.status === "ready") summary.ready += 1;
    if (item.status === "warning") summary.warning += 1;
    if (item.status === "blocked") summary.blocked += 1;
    return summary;
  }, {
    total: 0,
    ready: 0,
    warning: 0,
    blocked: 0,
  });
}
