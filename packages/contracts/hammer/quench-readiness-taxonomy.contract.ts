export const HAMMER_QUENCH_CANONICAL_READINESS_STATUSES = ["ready", "needs_review", "blocked"] as const;
export type HammerQuenchCanonicalReadinessStatus = (typeof HAMMER_QUENCH_CANONICAL_READINESS_STATUSES)[number];

export const HAMMER_QUENCH_CANONICAL_READINESS_REASON_SEVERITIES = ["blocking", "review"] as const;
export type HammerQuenchCanonicalReadinessReasonSeverity = (typeof HAMMER_QUENCH_CANONICAL_READINESS_REASON_SEVERITIES)[number];

export const HAMMER_QUENCH_CANONICAL_READINESS_REASON_SOURCES = ["gate", "artifact", "packet", "handoff"] as const;
export type HammerQuenchCanonicalReadinessReasonSource = (typeof HAMMER_QUENCH_CANONICAL_READINESS_REASON_SOURCES)[number];

export const HAMMER_QUENCH_CANONICAL_READINESS_REASON_CODES = [
  "export_posture_unavailable",
  "export_posture_degraded",
  "operation_unavailable",
  "operation_degraded",
  "unresolved_broll_intent",
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
  "handoff_blocked",
  "handoff_needs_review",
] as const;
export type HammerQuenchCanonicalReadinessReasonCode = (typeof HAMMER_QUENCH_CANONICAL_READINESS_REASON_CODES)[number];
