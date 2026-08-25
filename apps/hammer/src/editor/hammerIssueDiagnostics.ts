import type { HammerMediaPrepOutputsPackage } from "../lib/hammerMediaPrepOutputsPackage";
import { evaluateHammerBrollConsistency, type HammerBrollConsistencyFinding, type HammerBrollConsistencyFindingCode } from "./hammerBrollConsistency";
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

const TRANSCRIPT_PASS_IDS = new Set(["transcript_cleanup", "retakes", "gap_pacing"]);
const VISUAL_ADVISORY_AREAS = new Set<HammerAffectedArea>(["visuals", "preview_fidelity", "export"]);

export function isHammerVisualOnlyAdvisory(issue: HammerIssueDiagnostic): boolean {
  return issue.severity !== "error"
    && issue.affectedAreas.includes("visuals")
    && issue.affectedAreas.every((area) => VISUAL_ADVISORY_AREAS.has(area));
}

export function deriveHammerDiagnosticsPresentation(args: {
  currentPass: string | null;
  issues: HammerIssueDiagnostic[];
  visualDetailsExpanded: boolean;
}): { compactVisualIssues: HammerIssueDiagnostic[]; prominentIssues: HammerIssueDiagnostic[] } {
  const transcriptPassActive = args.currentPass == null || TRANSCRIPT_PASS_IDS.has(args.currentPass);
  if (!transcriptPassActive) return { compactVisualIssues: [], prominentIssues: args.issues };
  const compactVisualIssues = args.issues.filter(isHammerVisualOnlyAdvisory);
  return {
    compactVisualIssues,
    prominentIssues: args.visualDetailsExpanded
      ? args.issues
      : args.issues.filter((issue) => !isHammerVisualOnlyAdvisory(issue)),
  };
}

const brollConsistencyTitle: Record<HammerBrollConsistencyFindingCode, string> = {
  timeline_clip_without_operation: "B-roll projection has no canonical operation",
  operation_without_timeline_clip: "B-roll operation has no visual projection",
  duplicate_operation_projection: "B-roll operation has duplicate projections",
  wrong_operation_type: "B-roll projection references the wrong operation type",
  unresolved_operation_has_clip: "Unresolved B-roll has a visual projection",
  asset_binding_mismatch: "B-roll asset binding diverged",
  timing_mismatch: "B-roll timing diverged",
  anchor_mismatch: "B-roll transcript anchor diverged",
  stale_projection: "Inactive B-roll operation has a stale projection",
  linked_duck_divergence: "B-roll audio duck diverged",
};

export function deriveHammerBrollConsistencyIssueDiagnostics(
  findings: readonly HammerBrollConsistencyFinding[],
): HammerIssueDiagnostic[] {
  return findings.map((finding, index) => ({
    id: `broll_consistency:${finding.code}:${finding.operationId ?? "none"}:${finding.clipId ?? "none"}:${index}`,
    severity: "warning",
    title: brollConsistencyTitle[finding.code],
    summary: finding.detail,
    affectedAreas: ["visuals", "preview_fidelity", "export"],
    safeActions: ["Inspection is safe. Hammer will not reconcile B-roll authority automatically."],
    recommendedAction: "Do not export this B-roll state until its canonical operation and visual projection agree.",
    canAutoFix: false,
    fixActionId: null,
  }));
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

export interface HammerIssueDiagnosticsArgs {
  sessionState: HammerSessionStateResult;
  mediaPrepOutputs: HammerMediaPrepOutputsPackage | null;
  mediaLabelMismatchWarning: string | null;
  actualRecordingMismatchWarning: string | null;
  jobsStatusUnavailable?: { status: number; message: string } | null;
  reopenPersistenceSource?: "persistence" | "launch" | "bootstrap" | "transitional" | "none" | null;
  brollGraph?: Parameters<typeof evaluateHammerBrollConsistency>[0]["graph"];
  brollVisualTimeline?: Parameters<typeof evaluateHammerBrollConsistency>[0]["visualTimeline"];
}

function deriveHammerSessionIssueDiagnostics(args: HammerIssueDiagnosticsArgs): HammerIssueDiagnostic[] {
  const issues: HammerIssueDiagnostic[] = [];
  const {
    sessionState,
    mediaPrepOutputs,
    actualRecordingMismatchWarning,
    jobsStatusUnavailable,
    reopenPersistenceSource,
  } = args;

  if (reopenPersistenceSource === "transitional") {
    issues.push({
      id: "transitional_reopen",
      severity: "warning",
      title: "Reopened in transitional recovery mode",
      summary: "Hammer reopened from persisted transcript data because canonical editorial authority was missing. This is degraded recovery or migration mode, not a normal canonical reopen.",
      affectedAreas: ["persistence", "transcript_editing"],
      safeActions: ["Inspection and cautious continuation are still available."],
      recommendedAction: "Treat this session as degraded recovery. Verify the reopened transcript carefully and restore canonical editorial authority before trusting this as a fully canonical reopen.",
      canAutoFix: false,
      fixActionId: null,
    });
  }

  if (actualRecordingMismatchWarning) {
    issues.push({
      id: "actual_recording_mismatch",
      severity: "error",
      title: "Actual recording mismatch detected",
      summary: `${actualRecordingMismatchWarning} History replay stays blocked until Hammer is reopened against the canonical Tongs-bound recording.`,
      affectedAreas: ["playback", "preview_fidelity", "export", "persistence"],
      safeActions: ["Transcript inspection is safe, but do not trust replayed history or media-derived prep outputs."],
      recommendedAction: "Reopen Hammer from the episode/workpiece whose canonical Tongs binding matches this recording.",
      canAutoFix: false,
      fixActionId: null,
    });
  }

  // Note: mediaLabelMismatchWarning (capture filename vs episode title) is intentionally not
  // surfaced as a diagnostic issue. Capture filenames are internal labels and a mismatch
  // with the episode title is not actionable — it must never block replay, history, or saving,
  // and must not produce a "Fix available issues" prompt.

  if (jobsStatusUnavailable) {
    issues.push({
      id: "jobs_unavailable",
      severity: "warning",
      title: "Background job status temporarily unavailable",
      summary: `${jobsStatusUnavailable.message} (HTTP ${jobsStatusUnavailable.status}). Transcript jobs may run, but status updates may be delayed.`,
      affectedAreas: ["transcript_cleanup", "transcript_editing"],
      safeActions: ["Transcript review and editing are still safe."],
      recommendedAction: "Reload in a moment. If this persists, check the server logs and ensure the workpiece_jobs schema migration is applied.",
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

export function deriveHammerIssueDiagnostics(args: HammerIssueDiagnosticsArgs): HammerIssueDiagnostic[] {
  const ordinaryIssues = deriveHammerSessionIssueDiagnostics(args);
  const consistency = evaluateHammerBrollConsistency({
    graph: args.brollGraph ?? null,
    visualTimeline: args.brollVisualTimeline ?? null,
  });
  return [...ordinaryIssues, ...deriveHammerBrollConsistencyIssueDiagnostics(consistency.findings)];
}

