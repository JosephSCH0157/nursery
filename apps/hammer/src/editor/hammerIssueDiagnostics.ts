import type { HammerMediaPrepOutputsPackage } from "../lib/hammerMediaPrepOutputsPackage";
import type { HammerSessionStateResult } from "./hammerSessionState";

export type HammerIssueSeverity = "info" | "warning" | "error";

export type HammerAffectedArea =
  | "playback"
  | "transcript_editing"
  | "transcript_cleanup"
  | "visuals"
  | "preview_fidelity"
  | "export"
  | "persistence";

export type HammerIssueFixActionId =
  | "reload_latest"
  | "retry_save"
  | "refresh_audio_prep"
  | "refresh_visual_placements";

export interface HammerIssueDiagnostic {
  id: string;
  severity: HammerIssueSeverity;
  title: string;
  summary: string;
  affectedAreas: HammerAffectedArea[];
  safeActions: string[];
  recommendedAction: string;
  canAutoFix: boolean;
  fixActionId: HammerIssueFixActionId | null;
}

const uniq = <T,>(values: T[]): T[] => [...new Set(values)];

const areaLabel: Record<HammerAffectedArea, string> = {
  playback: "Playback",
  transcript_editing: "Transcript editing",
  transcript_cleanup: "Transcript cleanup",
  visuals: "Visuals",
  preview_fidelity: "Preview fidelity",
  export: "Export",
  persistence: "Saving",
};

export function formatAffectedAreas(areas: HammerAffectedArea[]): string {
  const unique = uniq(areas);
  if (unique.length === 0) return "";
  return unique.map((area) => areaLabel[area] ?? area).join(" · ");
}

export function deriveHammerIssueDiagnostics(args: {
  sessionState: HammerSessionStateResult;
  mediaPrepOutputs: HammerMediaPrepOutputsPackage | null;
  mediaLabelMismatchWarning: string | null;
}): HammerIssueDiagnostic[] {
  const issues: HammerIssueDiagnostic[] = [];
  const { sessionState, mediaPrepOutputs, mediaLabelMismatchWarning } = args;

  if (mediaLabelMismatchWarning) {
    issues.push({
      id: "media_label_mismatch",
      severity: "warning",
      title: "Recording mismatch detected",
      summary: `${mediaLabelMismatchWarning} Playback and prep results may be inaccurate until the correct media is bound.`,
      affectedAreas: ["playback", "preview_fidelity", "export"],
      safeActions: ["Transcript review and non-destructive transcript editing are still safe."],
      recommendedAction: "Verify this episode is linked to the correct recording before trusting playback or prep artifacts.",
      canAutoFix: false,
      fixActionId: null,
    });
  }

  switch (sessionState.status) {
    case "reload_required":
      issues.push({
        id: "reload_required",
        severity: "error",
        title: "Reload required",
        summary: sessionState.detail ?? "A newer canonical state is available.",
        affectedAreas: ["persistence"],
        safeActions: ["Edits are blocked until you reload the latest canonical state."],
        recommendedAction: "Reload the latest state before continuing.",
        canAutoFix: true,
        fixActionId: "reload_latest",
      });
      return issues;
    case "recovery_available":
      issues.push({
        id: "recovery_available",
        severity: "warning",
        title: "Recovery available",
        summary: sessionState.detail ?? "Hammer found a recoverable canonical state for this session.",
        affectedAreas: ["persistence"],
        safeActions: ["You can keep looking around, but reload before doing any serious work."],
        recommendedAction: "Reload the latest canonical state to ensure your edits persist correctly.",
        canAutoFix: true,
        fixActionId: "reload_latest",
      });
      return issues;
    case "save_failed":
      issues.push({
        id: "save_failed",
        severity: "warning",
        title: "Saving failed",
        summary: sessionState.detail ?? "Hammer could not persist your latest edits.",
        affectedAreas: ["persistence"],
        safeActions: ["Keep the tab open while you retry saving."],
        recommendedAction: "Retry saving. If this persists, reload and re-apply the last change.",
        canAutoFix: true,
        fixActionId: "retry_save",
      });
      return issues;
    case "unsaved_changes":
      issues.push({
        id: "unsaved_changes",
        severity: "info",
        title: "Unsaved changes",
        summary: sessionState.detail ?? "Edits are waiting to be persisted.",
        affectedAreas: ["persistence"],
        safeActions: ["You can keep editing; Hammer will save automatically."],
        recommendedAction: "Keep this tab open until saving completes.",
        canAutoFix: false,
        fixActionId: null,
      });
      return issues;
    case "media_unresolved": {
      const hasMissingPlayback = sessionState.reasonCodes.includes("media_source_missing");
      const hasUnresolvedVisualAsset = sessionState.reasonCodes.includes("visual_asset_unresolved");
      if (hasMissingPlayback) {
        issues.push({
          id: "media_source_missing",
          severity: "warning",
          title: "Media source missing",
          summary: "Hammer cannot find a playable media source for this episode.",
          affectedAreas: ["playback", "preview_fidelity", "export"],
          safeActions: ["Transcript review is still possible, but playback and export cannot be trusted."],
          recommendedAction: "Rebind the episode to a valid media source and retry prep.",
          canAutoFix: false,
          fixActionId: null,
        });
      }
      if (hasUnresolvedVisualAsset) {
        issues.push({
          id: "visual_asset_unresolved",
          severity: "warning",
          title: "Visual assets unresolved",
          summary: "One or more visual placements reference missing assets.",
          affectedAreas: ["visuals", "preview_fidelity", "export"],
          safeActions: ["Transcript editing and audio review are still safe."],
          recommendedAction: "Restore missing assets or re-run visual placements.",
          canAutoFix: true,
          fixActionId: "refresh_visual_placements",
        });
      }
      return issues;
    }
    case "prep_incomplete":
      issues.push({
        id: "prep_incomplete",
        severity: sessionState.reasonCodes.includes("prep_failed") ? "warning" : "info",
        title: sessionState.reasonCodes.includes("prep_failed") ? "Prep failed" : "Prep in progress",
        summary: sessionState.detail ?? sessionState.humanLabel,
        affectedAreas: ["playback", "preview_fidelity", "export"],
        safeActions: ["Wait for prep to complete, or retry with a different prep option."],
        recommendedAction: "Finish prep to unlock full playback and editing support.",
        canAutoFix: false,
        fixActionId: null,
      });
      return issues;
    case "degraded_mode":
      break;
    default:
      return issues;
  }

  const visualsUncertainCount = mediaPrepOutputs?.visuals.uncertain_placement_count ?? 0;
  const visualsUncertaintyFlags = mediaPrepOutputs?.visuals.uncertainty_flags.length ?? 0;
  const audioFailure = mediaPrepOutputs?.audio.polish.status === "failed"
    ? `${mediaPrepOutputs.audio.polish.failure_code ?? "failed"}${mediaPrepOutputs.audio.polish.failure_reason ? `: ${mediaPrepOutputs.audio.polish.failure_reason}` : ""}`
    : null;

  for (const reason of sessionState.reasonCodes) {
    switch (reason) {
      case "audio_polish_stale":
        issues.push({
          id: "audio_polish_stale",
          severity: "warning",
          title: "Audio prep is out of date",
          summary: "The current audio prep was generated from older media or transcript state. Playback may not reflect the latest edits.",
          affectedAreas: ["playback", "preview_fidelity", "export"],
          safeActions: ["Transcript editing is still safe."],
          recommendedAction: "Refresh audio prep to restore accurate playback.",
          canAutoFix: true,
          fixActionId: "refresh_audio_prep",
        });
        break;
      case "audio_polish_failed":
        issues.push({
          id: "audio_polish_failed",
          severity: "warning",
          title: "Audio prep failed",
          summary: audioFailure
            ? `Hammer could not produce audio prep (${audioFailure}). Playback will fall back to the raw source.`
            : "Hammer could not produce audio prep. Playback will fall back to the raw source.",
          affectedAreas: ["playback", "preview_fidelity", "export"],
          safeActions: ["Transcript editing is still safe."],
          recommendedAction: "Retry audio prep if you want polish-backed playback and review.",
          canAutoFix: true,
          fixActionId: "refresh_audio_prep",
        });
        break;
      case "visuals_stale":
        issues.push({
          id: "visuals_stale",
          severity: "warning",
          title: "Visual placements are out of date",
          summary: "The current visual placements were generated from older transcript state. Preview and export visuals may be inaccurate.",
          affectedAreas: ["visuals", "preview_fidelity", "export"],
          safeActions: ["Transcript editing and audio review are still safe."],
          recommendedAction: "Re-run visual placements to sync visuals to the current transcript.",
          canAutoFix: true,
          fixActionId: "refresh_visual_placements",
        });
        break;
      case "visuals_uncertain": {
        const counts = [
          visualsUncertainCount > 0 ? `${visualsUncertainCount} uncertain placements` : null,
          visualsUncertaintyFlags > 0 ? `${visualsUncertaintyFlags} warning flags` : null,
        ].filter(Boolean).join(" · ");
        issues.push({
          id: "visuals_uncertain",
          severity: "warning",
          title: "Visual placements need review",
          summary: counts
            ? `Some placements no longer match the transcript with high confidence (${counts}).`
            : "Some placements no longer match the transcript with high confidence.",
          affectedAreas: ["visuals", "preview_fidelity", "export"],
          safeActions: ["Transcript editing and audio review are still safe."],
          recommendedAction: "Re-run placements and review any remaining flagged items before exporting.",
          canAutoFix: true,
          fixActionId: "refresh_visual_placements",
        });
        break;
      }
      default:
        break;
    }
  }

  return issues;
}

