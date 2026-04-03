import { normalizeHammerPassStatusMap } from "../../../../packages/tongs/src/hammer-orchestration-contract";
import type { HammerReadinessGateResult } from "./hammerReadinessGate";
import type { HammerReadinessReasonCode } from "./hammerReadinessTypes";
import type {
  HammerAlignmentStatus,
  HammerPassId,
  HammerPassState,
  HammerPassStatusMap,
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
  HammerPrepStatus,
} from "../persistence/hammerPersistenceContract";

export type HammerPassDerivedStatus =
  | "blocked"
  | "degraded"
  | "not_started"
  | "in_progress"
  | "completed";

export type HammerPassReasonCode =
  | "structured_transcript_missing"
  | "transcript_prep_incomplete"
  | "transcript_needs_review"
  | "transcript_alignment_needs_review"
  | "visual_placements_missing"
  | "visual_placements_uncertain"
  | "image_media_unresolved"
  | "image_animation_target_missing"
  | "audio_polish_missing"
  | "audio_polish_preparing"
  | "audio_polish_failed"
  | "packaging_basis_missing"
  | "packaging_selection_missing"
  | "packaging_asset_unresolved"
  | HammerReadinessReasonCode;

export interface HammerPassReloadExpectation {
  code:
    | "restore_transcript_basis"
    | "restore_candidate_review"
    | "restore_timing_basis"
    | "restore_visual_basis"
    | "restore_image_animation"
    | "restore_audio_basis"
    | "restore_packaging_basis"
    | "recompute_readiness";
  label: string;
}

export interface HammerPassSelectorContext {
  currentPass: HammerPassId;
  passStatus: HammerPassStatusMap | null | undefined;
  prepStatus?: HammerPrepStatus | null;
  alignmentStatus?: HammerAlignmentStatus | null;
  structuredTranscript?: HammerPersistedStructuredTranscript | null;
  visualPlacements?: HammerPersistedVisualPlacements | null;
  audioPolish?: HammerPersistedAudioPolish | null;
  introPath?: string | null;
  outroPath?: string | null;
  packagingLogoEnabled?: boolean;
  readinessVerdict?: Pick<
    HammerReadinessGateResult,
    "status" | "blocker_count" | "review_count" | "reasons" | "blockingReasons" | "reviewReasons"
  > | null;
  readinessGate?: Pick<HammerReadinessGateResult, "status" | "blocker_count" | "review_count"> | null;
}

export interface HammerPassSelectorResult {
  passId: HammerPassId;
  status: HammerPassDerivedStatus;
  canonicalState: HammerPassState;
  reasonCodes: HammerPassReasonCode[];
  humanLabel: string;
  isBlocking: boolean;
  isDegraded: boolean;
  isComplete: boolean;
}

function readCanonicalPassState(
  context: HammerPassSelectorContext,
  passId: HammerPassId,
): HammerPassState {
  return normalizeHammerPassStatusMap(context.passStatus, context.currentPass)[passId] ?? "not_started";
}

function hasStructuredTranscript(
  context: HammerPassSelectorContext,
): boolean {
  return Boolean(context.structuredTranscript?.segments.length);
}

function transcriptReasonCodes(
  context: HammerPassSelectorContext,
): HammerPassReasonCode[] {
  if (!hasStructuredTranscript(context)) {
    return context.prepStatus === "preparing"
      ? ["transcript_prep_incomplete"]
      : ["structured_transcript_missing"];
  }

  const reasons: HammerPassReasonCode[] = [];
  if ((context.structuredTranscript?.confidence_flags.length ?? 0) > 0) {
    reasons.push("transcript_needs_review");
  }
  if (context.alignmentStatus === "needs_review") {
    reasons.push("transcript_alignment_needs_review");
  }
  return reasons;
}

function imagePlacementReasonCodes(
  context: HammerPassSelectorContext,
): HammerPassReasonCode[] {
  if (!hasStructuredTranscript(context)) {
    return transcriptReasonCodes(context);
  }
  if (!context.visualPlacements) {
    return ["visual_placements_missing"];
  }

  const reasons: HammerPassReasonCode[] = [];
  if ((context.visualPlacements.uncertainty_flags.length ?? 0) > 0) {
    reasons.push("visual_placements_uncertain");
  }
  if (context.visualPlacements.placements.some((placement) => placement.status === "uncertain")) {
    reasons.push("visual_placements_uncertain");
  }
  if (context.visualPlacements.placements.some((placement) => !placement.asset_path && !placement.storage_key)) {
    reasons.push("image_media_unresolved");
  }
  return [...new Set(reasons)];
}

function hasImagePlacementTargets(
  context: HammerPassSelectorContext,
): boolean {
  return (context.visualPlacements?.placements ?? []).some((placement) => (
    placement.visual_mode !== "packaging_intro"
    && placement.visual_mode !== "packaging_outro"
  ));
}

function audioReasonCodes(
  context: HammerPassSelectorContext,
): HammerPassReasonCode[] {
  if (!context.audioPolish) {
    return ["audio_polish_missing"];
  }
  if (context.audioPolish.status === "preparing") {
    return ["audio_polish_preparing"];
  }
  if (context.audioPolish.status === "failed") {
    return ["audio_polish_failed"];
  }
  return [];
}

function packagingReasonCodes(
  context: HammerPassSelectorContext,
): HammerPassReasonCode[] {
  if (!hasStructuredTranscript(context)) {
    return ["packaging_basis_missing"];
  }

  const introEnabled = Boolean(context.introPath)
    || (context.visualPlacements?.placements ?? []).some((placement) => placement.entry_id === "packaging:intro");
  const outroEnabled = Boolean(context.outroPath)
    || (context.visualPlacements?.placements ?? []).some((placement) => placement.entry_id === "packaging:outro");
  const logoEnabled = Boolean(context.packagingLogoEnabled)
    || (context.visualPlacements?.placements ?? []).some((placement) => placement.entry_id === "packaging:logo");

  if (!introEnabled && !outroEnabled && !logoEnabled) {
    return ["packaging_selection_missing"];
  }

  const unresolvedPackagingPlacement = (context.visualPlacements?.placements ?? []).some((placement) => (
    placement.entry_id.startsWith("packaging:")
    && !placement.asset_path
    && !placement.storage_key
  ));
  return unresolvedPackagingPlacement ? ["packaging_asset_unresolved"] : [];
}

function readyReasonCodes(
  context: HammerPassSelectorContext,
): HammerPassReasonCode[] {
  if (context.readinessVerdict) {
    return [...new Set(context.readinessVerdict.reasons.map((reason) => reason.code))];
  }
  if (context.readinessGate?.status === "blocked" || (context.readinessGate?.blocker_count ?? 0) > 0) {
    return ["handoff_blocked"];
  }
  if (context.readinessGate?.status === "needs_review" || (context.readinessGate?.review_count ?? 0) > 0) {
    return ["handoff_needs_review"];
  }
  return [];
}

function resolveHumanLabel(
  passId: HammerPassId,
  status: HammerPassDerivedStatus,
  reasonCodes: HammerPassReasonCode[],
): string {
  const reason = reasonCodes[0] ?? null;
  if (status === "blocked") {
    switch (reason) {
      case "structured_transcript_missing":
        return "Blocked: transcript missing";
      case "transcript_prep_incomplete":
        return "Blocked: transcript prep incomplete";
      case "visual_placements_missing":
        return "Blocked: visual placements missing";
      case "image_animation_target_missing":
        return "Blocked: no animatable image placement";
      case "audio_polish_missing":
        return "Blocked: audio prep missing";
      case "packaging_basis_missing":
        return "Blocked: packaging basis missing";
      case "packaging_selection_missing":
        return "Blocked: packaging selection missing";
      case "handoff_blocked":
      case "export_posture_unavailable":
      case "artifact_transcript_missing":
      case "artifact_subtitles_srt_missing":
      case "artifact_subtitles_vtt_missing":
      case "artifact_visuals_missing":
      case "artifact_audio_missing":
        return "Blocked: not ready for Quench";
      default:
        return `Blocked: ${passId.replaceAll("_", " ")}`;
    }
  }

  if (status === "degraded") {
    switch (reason) {
      case "transcript_needs_review":
      case "transcript_alignment_needs_review":
        return "Needs review";
      case "visual_placements_uncertain":
      case "image_media_unresolved":
        return "Degraded: visuals need review";
      case "audio_polish_failed":
      case "audio_polish_preparing":
        return "Degraded: audio not finalized";
      case "packaging_asset_unresolved":
        return "Degraded: packaging asset unresolved";
      case "handoff_needs_review":
      case "export_posture_degraded":
      case "operation_degraded":
      case "unresolved_broll_intent":
      case "podcast_master_degraded":
      case "podcast_master_export_only":
      case "bound_attention_video":
      case "bound_attention_audio":
        return "Needs review before Ready";
      default:
        return "Degraded";
    }
  }

  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In progress";
  return "Not started";
}

export function getPassReloadExpectation(
  passId: HammerPassId,
): HammerPassReloadExpectation {
  switch (passId) {
    case "transcript_cleanup":
      return { code: "restore_transcript_basis", label: "Restore transcript-backed cleanup state and reason posture." };
    case "retakes":
      return { code: "restore_candidate_review", label: "Restore candidate-review posture from canonical transcript basis." };
    case "gap_pacing":
      return { code: "restore_timing_basis", label: "Restore transcript timing state from canonical edit basis." };
    case "visual_finishing":
    case "image_placement":
      return { code: "restore_visual_basis", label: "Restore canonical visual placement state and unresolved-media posture." };
    case "image_animation":
      return { code: "restore_image_animation", label: "Restore persisted image animation state and animatable target posture." };
    case "audio_finalization":
      return { code: "restore_audio_basis", label: "Restore canonical audio polish and audio edit state." };
    case "packaging":
      return { code: "restore_packaging_basis", label: "Restore persisted intro/outro/logo packaging state." };
    case "ready":
      return { code: "recompute_readiness", label: "Recompute readiness from canonical export and handoff truth." };
    default:
      return { code: "restore_transcript_basis", label: "Restore canonical Hammer state." };
  }
}

export function deriveHydratedPassStatus(
  currentPass: HammerPassId,
): HammerPassStatusMap {
  return normalizeHammerPassStatusMap(null, currentPass);
}

export function getPassBlockedReason(
  passId: HammerPassId,
  context: HammerPassSelectorContext,
): HammerPassReasonCode | null {
  const result = getPassStatus(passId, context);
  return result.isBlocking ? (result.reasonCodes[0] ?? null) : null;
}

export function canEnterPass(
  passId: HammerPassId,
  context: HammerPassSelectorContext,
): boolean {
  if (passId === "packaging" || passId === "ready") {
    return hasStructuredTranscript(context);
  }
  return !getPassStatus(passId, context).isBlocking;
}

export function getPassStatus(
  passId: HammerPassId,
  context: HammerPassSelectorContext,
): HammerPassSelectorResult {
  const canonicalState = readCanonicalPassState(context, passId);
  let reasonCodes: HammerPassReasonCode[] = [];

  switch (passId) {
    case "transcript_cleanup":
    case "retakes":
    case "gap_pacing":
      reasonCodes = transcriptReasonCodes(context);
      break;
    case "visual_finishing":
    case "image_placement":
      reasonCodes = imagePlacementReasonCodes(context);
      break;
    case "image_animation":
      reasonCodes = !hasImagePlacementTargets(context)
        ? ["image_animation_target_missing"]
        : imagePlacementReasonCodes(context);
      break;
    case "audio_finalization":
      reasonCodes = audioReasonCodes(context);
      break;
    case "packaging":
      reasonCodes = packagingReasonCodes(context);
      break;
    case "ready":
      reasonCodes = readyReasonCodes(context);
      break;
    default:
      reasonCodes = [];
      break;
  }

  const isBlocking = reasonCodes.some((reason) => (
    reason === "structured_transcript_missing"
    || reason === "transcript_prep_incomplete"
    || reason === "visual_placements_missing"
    || reason === "image_animation_target_missing"
    || reason === "audio_polish_missing"
    || reason === "packaging_basis_missing"
    || reason === "packaging_selection_missing"
    || reason === "handoff_blocked"
    || reason === "export_posture_unavailable"
    || reason === "operation_unavailable"
    || reason === "podcast_master_unavailable"
    || reason === "artifact_transcript_missing"
    || reason === "artifact_transcript_stale"
    || reason === "artifact_transcript_failed"
    || reason === "artifact_subtitles_srt_missing"
    || reason === "artifact_subtitles_srt_stale"
    || reason === "artifact_subtitles_vtt_missing"
    || reason === "artifact_subtitles_vtt_stale"
    || reason === "artifact_visuals_missing"
    || reason === "artifact_visuals_stale"
    || reason === "artifact_audio_missing"
    || reason === "artifact_audio_stale"
    || reason === "artifact_audio_failed"
    || reason === "artifact_audio_unsupported"
    || reason === "artifact_audio_requires_future_ffmpeg"
  ));
  const isDegraded = !isBlocking && reasonCodes.length > 0;

  const status: HammerPassDerivedStatus = isBlocking
    ? "blocked"
    : isDegraded
    ? "degraded"
    : canonicalState;

  return {
    passId,
    status,
    canonicalState,
    reasonCodes,
    humanLabel: resolveHumanLabel(passId, status, reasonCodes),
    isBlocking,
    isDegraded,
    isComplete: status === "completed",
  };
}

export function summarizePassStatuses(
  statuses: HammerPassDerivedStatus[],
): HammerPassDerivedStatus {
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.some((status) => status === "degraded")) return "degraded";
  if (statuses.every((status) => status === "completed")) return "completed";
  if (statuses.some((status) => status === "in_progress" || status === "completed")) return "in_progress";
  return "not_started";
}
