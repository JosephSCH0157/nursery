export type HammerReadinessVerdictStatus = "ready" | "needs_review" | "blocked";
export type HammerReadinessReasonSeverity = "blocking" | "review";
export type HammerReadinessReasonSource = "gate" | "artifact" | "packet" | "handoff";

export type HammerReadinessReasonCode =
  | "export_posture_unavailable"
  | "export_posture_degraded"
  | "operation_unavailable"
  | "operation_degraded"
  | "unresolved_broll_intent"
  | "bound_attention_video"
  | "bound_attention_audio"
  | "podcast_master_unavailable"
  | "podcast_master_degraded"
  | "podcast_master_export_only"
  | "artifact_transcript_missing"
  | "artifact_transcript_stale"
  | "artifact_transcript_failed"
  | "artifact_subtitles_srt_missing"
  | "artifact_subtitles_srt_stale"
  | "artifact_subtitles_vtt_missing"
  | "artifact_subtitles_vtt_stale"
  | "artifact_visuals_missing"
  | "artifact_visuals_stale"
  | "artifact_audio_missing"
  | "artifact_audio_stale"
  | "artifact_audio_failed"
  | "artifact_audio_unsupported"
  | "artifact_audio_requires_future_ffmpeg"
  | "packet_workpiece_id_missing"
  | "packet_kind_invalid"
  | "packet_editorial_truth_missing"
  | "packet_timeline_snapshot_missing"
  | "handoff_blocked"
  | "handoff_needs_review";

export interface HammerReadinessReason {
  code: HammerReadinessReasonCode;
  label: string;
  severity: HammerReadinessReasonSeverity;
  source: HammerReadinessReasonSource;
  operationId: string | null;
  // Transitional compatibility field for pre-Phase-6 consumers.
  operation_id: string | null;
}

export interface HammerReadinessVerdict {
  status: HammerReadinessVerdictStatus;
  readyForQuench: boolean;
  reasons: HammerReadinessReason[];
  blockingReasons: HammerReadinessReason[];
  reviewReasons: HammerReadinessReason[];
  counts: {
    blocking: number;
    review: number;
  };
  primaryOperationId: string | null;
}

export interface HammerReadinessGateResult extends HammerReadinessVerdict {
  // Transitional compatibility fields for pre-Phase-6 consumers.
  review_count: number;
  blocker_count: number;
  blocking_reasons: HammerReadinessReason[];
  review_reasons: HammerReadinessReason[];
  primary_operation_id: string | null;
}

export function createHammerReadinessReason(args: {
  code: HammerReadinessReasonCode;
  label: string;
  severity: HammerReadinessReasonSeverity;
  source: HammerReadinessReasonSource;
  operationId?: string | null;
}): HammerReadinessReason {
  const operationId = args.operationId ?? null;
  return {
    code: args.code,
    label: args.label,
    severity: args.severity,
    source: args.source,
    operationId,
    operation_id: operationId,
  };
}

export function buildHammerReadinessVerdict(args: {
  blockingReasons: HammerReadinessReason[];
  reviewReasons: HammerReadinessReason[];
}): HammerReadinessGateResult {
  const status: HammerReadinessVerdictStatus = args.blockingReasons.length > 0
    ? "blocked"
    : args.reviewReasons.length > 0
    ? "needs_review"
    : "ready";
  const primaryOperationId = args.blockingReasons[0]?.operationId
    ?? args.reviewReasons[0]?.operationId
    ?? null;
  const reasons = [...args.blockingReasons, ...args.reviewReasons];
  const counts = {
    blocking: args.blockingReasons.length,
    review: args.reviewReasons.length,
  };

  return {
    status,
    readyForQuench: status === "ready",
    reasons,
    blockingReasons: args.blockingReasons,
    reviewReasons: args.reviewReasons,
    counts,
    primaryOperationId,
    review_count: counts.review,
    blocker_count: counts.blocking,
    blocking_reasons: args.blockingReasons,
    review_reasons: args.reviewReasons,
    primary_operation_id: primaryOperationId,
  };
}
