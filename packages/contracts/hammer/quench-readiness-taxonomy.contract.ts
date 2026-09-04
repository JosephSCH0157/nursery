export const HAMMER_QUENCH_CANONICAL_READINESS_STATUSES = ["ready", "needs_review", "blocked"] as const;
export type HammerQuenchCanonicalReadinessStatus = (typeof HAMMER_QUENCH_CANONICAL_READINESS_STATUSES)[number];

export const HAMMER_QUENCH_CANONICAL_READINESS_REASON_SEVERITIES = ["blocking", "review"] as const;
export type HammerQuenchCanonicalReadinessReasonSeverity = (typeof HAMMER_QUENCH_CANONICAL_READINESS_REASON_SEVERITIES)[number];

export const HAMMER_QUENCH_CANONICAL_READINESS_REASON_SOURCES = ["gate", "artifact", "packet", "handoff", "quench"] as const;
export type HammerQuenchCanonicalReadinessReasonSource = (typeof HAMMER_QUENCH_CANONICAL_READINESS_REASON_SOURCES)[number];

export const HAMMER_QUENCH_CANONICAL_READINESS_REASON_CODES = [
  "export_posture_unavailable",
  "export_posture_degraded",
  "operation_unavailable",
  "operation_degraded",
  "unresolved_broll_intent",
  "broll_timeline_clip_without_operation",
  "broll_operation_without_timeline_clip",
  "broll_duplicate_operation_projection",
  "broll_wrong_operation_type",
  "broll_unresolved_operation_has_clip",
  "broll_asset_binding_mismatch",
  "broll_timing_mismatch",
  "broll_anchor_mismatch",
  "broll_stale_projection",
  "broll_linked_duck_divergence",
  "bound_attention_video",
  "bound_attention_audio",
  "podcast_master_unavailable",
  "podcast_master_degraded",
  "podcast_master_export_only",
  "artifact_transcript_missing",
  "artifact_transcript_stale",
  "artifact_transcript_failed",
  "artifact_subtitles_srt_missing",
  "artifact_subtitles_srt_stale",
  "artifact_subtitles_vtt_missing",
  "artifact_subtitles_vtt_stale",
  "artifact_visuals_missing",
  "artifact_visuals_stale",
  "artifact_audio_missing",
  "artifact_audio_stale",
  "artifact_audio_failed",
  "artifact_audio_unsupported",
  "artifact_audio_requires_future_ffmpeg",
  "packet_workpiece_id_missing",
  "packet_kind_invalid",
  "packet_editorial_truth_missing",
  "packet_timeline_snapshot_missing",
  "packet_final_audio_master_missing",
  "packet_final_video_master_missing",
  "packet_final_video_master_forbidden",
  "exact_audio_receipt_missing",
  "exact_audio_receipt_fingerprint_mismatch",
  "exact_audio_dsp_identity_mismatch",
  "exact_audio_render_identity_mismatch",
  "exact_audio_algorithm_obsolete",
  "exact_audio_operation_incomplete",
  "exact_audio_operation_order_invalid",
  "exact_audio_loudness_evidence_missing",
  "exact_audio_loudness_out_of_tolerance",
  "exact_audio_true_peak_exceeded",
  "exact_audio_output_identity_mismatch",
  "handoff_blocked",
  "handoff_needs_review",
  "quench_audio_reference_unresolved",
  "quench_transcript_missing",
  "quench_captions_missing",
  "quench_visuals_missing",
  "quench_visuals_invalid",
] as const;
export type HammerQuenchCanonicalReadinessReasonCode = (typeof HAMMER_QUENCH_CANONICAL_READINESS_REASON_CODES)[number];

export interface HammerQuenchReadinessReasonLike {
  code: string;
  severity: HammerQuenchCanonicalReadinessReasonSeverity;
  source: string;
  operationId?: string | null;
  operation_id?: string | null;
  clipId?: string | null;
  clip_id?: string | null;
}

export interface HammerQuenchReadinessEvidence<T extends HammerQuenchReadinessReasonLike = HammerQuenchReadinessReasonLike> {
  status: HammerQuenchCanonicalReadinessStatus;
  reasons: readonly T[];
}

export interface HammerQuenchResolvedReadiness<T extends HammerQuenchReadinessReasonLike = HammerQuenchReadinessReasonLike> {
  status: HammerQuenchCanonicalReadinessStatus;
  reasons: T[];
  readyForQuench: boolean;
}

const READINESS_RANK: Record<HammerQuenchCanonicalReadinessStatus, number> = {
  ready: 0,
  needs_review: 1,
  blocked: 2,
};

export function maxHammerQuenchReadinessStatus(
  left: HammerQuenchCanonicalReadinessStatus,
  right: HammerQuenchCanonicalReadinessStatus,
): HammerQuenchCanonicalReadinessStatus {
  return READINESS_RANK[left] >= READINESS_RANK[right] ? left : right;
}

export function readinessStatusForReasons(
  reasons: readonly HammerQuenchReadinessReasonLike[],
): HammerQuenchCanonicalReadinessStatus {
  if (reasons.some((reason) => reason.severity === "blocking")) return "blocked";
  if (reasons.some((reason) => reason.severity === "review")) return "needs_review";
  return "ready";
}

export function mergeReadinessReasons<T extends HammerQuenchReadinessReasonLike>(
  upstream: readonly T[],
  downstream: readonly T[],
): T[] {
  const byIdentity = new Map<string, T>();
  for (const reason of [...upstream, ...downstream]) {
    const operationId = reason.operationId ?? reason.operation_id ?? "";
    const clipId = reason.clipId ?? reason.clip_id ?? "";
    const identity = `${reason.source}\u0000${reason.code}\u0000${operationId}\u0000${clipId}`;
    const existing = byIdentity.get(identity);
    if (!existing || (existing.severity === "review" && reason.severity === "blocking")) {
      byIdentity.set(identity, reason);
    }
  }
  return [...byIdentity.values()];
}

export function resolveMonotonicReadiness<T extends HammerQuenchReadinessReasonLike>(args: {
  upstreamStatus: HammerQuenchCanonicalReadinessStatus;
  upstreamReasons: readonly T[];
  downstreamReasons: readonly T[];
}): HammerQuenchResolvedReadiness<T> {
  const reasons = mergeReadinessReasons(args.upstreamReasons, args.downstreamReasons);
  const upstreamStatus = maxHammerQuenchReadinessStatus(
    args.upstreamStatus,
    readinessStatusForReasons(args.upstreamReasons),
  );
  const status = maxHammerQuenchReadinessStatus(upstreamStatus, readinessStatusForReasons(args.downstreamReasons));
  return { status, reasons, readyForQuench: status === "ready" };
}
