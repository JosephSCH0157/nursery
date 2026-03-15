import type {
  HammerPersistedAudioPolish,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import type { HammerMacroReadinessSummary } from "../macros/hammerMacroFramework";

export type HammerPreparedNextStepActionId =
  | "review_transcript"
  | "review_visuals"
  | "review_audio"
  | "review_macros"
  | "begin_manual_editing"
  | "export_later";

export interface HammerPreparedArtifactSummary {
  id: "transcript" | "visuals" | "audio";
  label: string;
  status_label: string;
  detail: string;
  tone: "ready" | "warning" | "fallback";
}

export interface HammerPreparedNextStepAction {
  id: HammerPreparedNextStepActionId;
  label: string;
  detail: string;
  enabled: boolean;
  recommended?: boolean;
  kind: "primary" | "secondary" | "placeholder";
}

export interface HammerPreparedHandoffModel {
  title: string;
  body: string;
  summaries: HammerPreparedArtifactSummary[];
  actions: HammerPreparedNextStepAction[];
}

export interface BuildHammerPreparedHandoffModelArgs {
  transcriptSegmentCount: number;
  transcriptSourceId: string | null;
  visualPlacements: HammerPersistedVisualPlacements | null;
  audioPolish: HammerPersistedAudioPolish | null;
  macroSummary?: HammerMacroReadinessSummary | null;
}

export function buildHammerPreparedHandoffModel(
  args: BuildHammerPreparedHandoffModelArgs,
): HammerPreparedHandoffModel {
  const transcriptReady = args.transcriptSegmentCount > 0 && Boolean(args.transcriptSourceId);
  const visualPlacementCount = args.visualPlacements?.placements.length ?? 0;
  const uncertainVisualCount = args.visualPlacements?.placements.filter((placement) => placement.status === "uncertain").length ?? 0;
  const visualWarnings = args.visualPlacements?.uncertainty_flags.length ?? 0;
  const visualsAvailable = visualPlacementCount > 0;
  const audioPrepared = args.audioPolish?.status === "prepared";
  const audioFailed = args.audioPolish?.status === "failed";
  const macroSummary = args.macroSummary ?? null;
  const macroActionDetail = macroSummary == null || macroSummary.total === 0
    ? "Open the finishing lane and inspect recipe readiness against current prep artifacts."
    : macroSummary.ready > 0
    ? `${macroSummary.ready} macro recipe${macroSummary.ready === 1 ? "" : "s"} are ready for review, with ${macroSummary.warning} needing review and ${macroSummary.blocked} blocked by missing prerequisites.`
    : macroSummary.warning > 0
    ? `${macroSummary.warning} macro recipe${macroSummary.warning === 1 ? "" : "s"} can be reviewed now, but none are fully ready yet.`
    : "Open the finishing lane to see which prerequisites are still missing before finishing macros can run.";

  const transcriptSummary: HammerPreparedArtifactSummary = {
    id: "transcript",
    label: "Transcript",
    status_label: transcriptReady ? "Ready" : "Missing",
    detail: transcriptReady
      ? `${args.transcriptSegmentCount} speaker-structured segment${args.transcriptSegmentCount === 1 ? "" : "s"} are ready for review.`
      : "Hammer does not have a prepared transcript for this workspace yet.",
    tone: transcriptReady ? "ready" : "warning",
  };

  const visualsSummary: HammerPreparedArtifactSummary = visualsAvailable
    ? {
      id: "visuals",
      label: "Image Suggestions",
      status_label: uncertainVisualCount > 0 || visualWarnings > 0 ? "Needs Review" : "Suggested",
      detail: uncertainVisualCount > 0
        ? `${visualPlacementCount} suggestion${visualPlacementCount === 1 ? "" : "s"} placed, with ${uncertainVisualCount} flagged for review.`
        : visualWarnings > 0
        ? `${visualPlacementCount} suggestion${visualPlacementCount === 1 ? "" : "s"} placed, with placement warnings surfaced for review.`
        : `${visualPlacementCount} initial suggestion${visualPlacementCount === 1 ? "" : "s"} are already on the timeline.`,
      tone: uncertainVisualCount > 0 || visualWarnings > 0 ? "warning" : "ready",
    }
    : {
      id: "visuals",
      label: "Image Suggestions",
      status_label: "Unavailable",
      detail: "Hammer did not find reviewable visual anchors for this episode, so the timeline opens without seeded image suggestions.",
      tone: "fallback",
    };

  const audioSummary: HammerPreparedArtifactSummary = audioPrepared
    ? {
      id: "audio",
      label: "Audio Prep",
      status_label: "Polished",
      detail: "Hammer prepared a non-destructive baseline speech polish artifact and prefers it for playback.",
      tone: "ready",
    }
    : audioFailed
    ? {
      id: "audio",
      label: "Audio Prep",
      status_label: "Raw Fallback",
      detail: args.audioPolish?.failure_reason
        ?? "Hammer kept playback on the raw source because baseline polish was not supported for this media.",
      tone: "fallback",
    }
    : {
      id: "audio",
      label: "Audio Prep",
      status_label: "Pending",
      detail: "Hammer does not have a prepared audio polish artifact for this workspace yet.",
      tone: "warning",
    };

  const actions: HammerPreparedNextStepAction[] = [
    {
      id: "review_transcript",
      label: "Review Transcript",
      detail: transcriptReady
        ? "Open the transcript and start checking speaker turns and line timing."
        : "Transcript review is unavailable until Hammer has a prepared transcript.",
      enabled: transcriptReady,
      recommended: !visualsAvailable,
      kind: "primary",
    },
    {
      id: "review_visuals",
      label: visualsAvailable ? "Review Image Suggestions" : "Image Suggestions Unavailable",
      detail: visualsAvailable
        ? "Jump to the visuals-focused workspace and review the seeded timeline suggestions."
        : "Hammer did not seed image suggestions for this workpiece.",
      enabled: visualsAvailable,
      recommended: visualsAvailable,
      kind: "primary",
    },
    {
      id: "review_audio",
      label: audioPrepared ? "Listen to Polished Audio" : audioFailed ? "Review Raw Audio Fallback" : "Open Audio Review",
      detail: audioPrepared
        ? "Open the Audio workspace and listen through the prepared playback path."
        : audioFailed
        ? "Open the Audio workspace with the raw fallback source that Hammer kept intact."
        : "Open the Audio workspace to review the current monitoring path.",
      enabled: transcriptReady,
      kind: "secondary",
    },
    {
      id: "review_macros",
      label: "Review Finishing Macros",
      detail: macroActionDetail,
      enabled: true,
      kind: "secondary",
    },
    {
      id: "begin_manual_editing",
      label: "Begin Manual Editing",
      detail: "Enter Hammer without running any destructive cleanup or macros automatically.",
      enabled: true,
      kind: "secondary",
    },
    {
      id: "export_later",
      label: "Export Preview (Later)",
      detail: "Export remains a later step after you consent to the next editing move.",
      enabled: false,
      kind: "placeholder",
    },
  ];

  return {
    title: "Prepared Handoff",
    body: visualsAvailable
      ? "Hammer finished preparation and stopped before creative consent. Review what was prepared, then choose the next editing move."
      : "Hammer finished preparation and stopped before creative consent. Transcript is ready; visuals and audio reflect the truthful prep state below.",
    summaries: [transcriptSummary, visualsSummary, audioSummary],
    actions,
  };
}
