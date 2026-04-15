export type ReleasePacketStubSummaryStatus = "ready" | "attention" | "blocked";
export type ReleasePacketStubAuthorityStatus = "ready" | "blocked" | "unsafe" | "incompatible";
export type ReleasePacketStubAuthoritySeverity = "critical" | "high" | "medium" | "low";

export type ReleasePacketStubPrepStatus =
  | "ready"
  | "missing"
  | "stale"
  | "failed"
  | "unsupported"
  | "requires_future_ffmpeg";

export type ReleasePacketStubArtifactFreshness = "missing" | "current" | "stale";
export type ReleasePacketStubSubtitleFormat = "srt" | "vtt";
export type ReleasePacketStubOutputSourceKind = "raw" | "derived";
export type ReleasePacketStubMacroKind = "filler_cleanup" | "retake_tightening";
export type ReleasePacketStubPrepLifecycleStatus = "idle" | "preparing" | "prepared" | "prep_failed";
export type ReleasePacketStubAlignmentStatus = "not_started" | "pending" | "aligned" | "needs_review";
export type ReleasePacketStubLaunchSourceMode = "dev" | "mapped" | "tongs";
export type ReleasePacketStubPreviewMode = "raw" | "edit-aware";
export type ReleasePacketStubAudioPlanReadiness = "ready_now" | "requires_future_ffmpeg" | "unsupported";
export type ReleasePacketStubPreferredPlaybackKind = "polished" | "raw" | "none";
export type ReleasePacketStubPreferredPlaybackReason =
  | "prepared_audio_polish"
  | "audio_polish_stale"
  | "audio_polish_failed"
  | "audio_polish_unsupported"
  | "audio_polish_missing"
  | "raw_source_available"
  | "no_media_source";
export type ReleasePacketStubMediaKind =
  | "recording_video"
  | "recording_audio"
  | "export_video"
  | "export_audio"
  | "asset_image"
  | "asset_broll"
  | "asset_audio"
  | "other";
export type ReleasePacketStubMediaSourceHint = "local" | "cloud" | "unknown";
export type ReleasePacketStubVisualPrepStatus = "not_started" | "prepared" | "missing";
export type ReleasePacketStubAudioPrepStatus = "not_started" | "preparing" | "prepared" | "failed" | "missing";
export type ReleasePacketStubAudioFailureCode =
  | "unsupported_source"
  | "source_unavailable"
  | "stuck_preparing"
  | "processing_failed";
export type ReleasePacketStubAudioPass = "studio_sound" | "noise_cleanup" | "level_consistency";
export type ReleasePacketStubCheckId =
  | "transcript_output"
  | "subtitle_srt"
  | "subtitle_vtt"
  | "visuals"
  | "audio_polish";
export type ReleasePacketStubReasonStatus =
  | Exclude<ReleasePacketStubPrepStatus, "ready">
  | "unsafe"
  | "incompatible";

export interface ReleasePacketStubArtifactTimestamp {
  artifact_path: string | null;
  updated_at: string | null;
}

export interface ReleasePacketStubBlockingReason {
  check_id: ReleasePacketStubCheckId | null;
  label: string | null;
  status: ReleasePacketStubReasonStatus;
  detail: string;
}

export interface ReleasePacketStubReadinessFlags {
  ready: boolean;
  missing: boolean;
  stale: boolean;
  failed: boolean;
  unsupported: boolean;
  requires_future_ffmpeg: boolean;
  unsafe: boolean;
  incompatible: boolean;
}

export interface ReleasePacketStubAuthorityIssue {
  code: string;
  severity: ReleasePacketStubAuthoritySeverity;
  priority: number;
  affected_domain: "transcript" | "subtitles" | "visuals" | "audio" | "metadata" | "compatibility" | "policy";
  message: string;
  remediation_code: string | null;
  check_id: ReleasePacketStubCheckId | null;
  label: string | null;
  observed_status: ReleasePacketStubReasonStatus;
}

export interface ReleasePacketStubAuthorityRemediation {
  code: string;
  priority: number;
  action: string;
}

export type ReleasePacketStubRecoveryStatus =
  | "not_needed"
  | "recoverable"
  | "recoverable_with_regeneration"
  | "requires_upstream_action"
  | "incompatible";

export type ReleasePacketStubExecutionStatus =
  | "not_needed"
  | "auto_recoverable"
  | "operator_triggerable"
  | "requires_upstream_action"
  | "incompatible";

export type ReleasePacketStubRecoveryClassification =
  | "recoverable"
  | "recoverable_with_regeneration"
  | "requires_upstream_action"
  | "incompatible";

export type ReleasePacketStubExecutionKind =
  | "auto_recoverable"
  | "operator_triggerable"
  | "requires_upstream_action"
  | "incompatible";

export type ReleasePacketStubActionEligibility =
  | "eligible"
  | "blocked"
  | "not_executable";

export type ReleasePacketStubMachineActionType =
  | "refresh_transcript_output"
  | "regenerate_subtitle_srt"
  | "regenerate_subtitle_vtt"
  | "regenerate_visual_placements"
  | "regenerate_audio_polish"
  | "inspect_audio_failure"
  | "enable_ffmpeg_working_audio"
  | "align_release_target"
  | "restore_canonical_release_identity"
  | "switch_to_supported_source_media"
  | "upgrade_release_handoff_schema"
  | "manual_recovery";

export type ReleasePacketStubAttemptResult =
  | "succeeded"
  | "failed"
  | "blocked";

export type ReleasePacketStubRecoveryDomain =
  | "transcript"
  | "subtitles"
  | "visuals"
  | "audio"
  | "metadata"
  | "compatibility"
  | "policy";

export type ReleasePacketStubRecoveryArtifactCode =
  | "target_identity"
  | "release_identity"
  | "authority_schema"
  | "structured_transcript"
  | "transcript_output"
  | "subtitle_srt"
  | "subtitle_vtt"
  | "visual_placements"
  | "audio_source"
  | "audio_polish";

export interface ReleasePacketStubRecoveryStep {
  code: string;
  domain: ReleasePacketStubRecoveryDomain;
  classification: ReleasePacketStubRecoveryClassification;
  action: string;
  reason: string;
  priority: number;
  automatic: boolean;
  issue_codes: string[];
  depends_on: string[];
  artifact_dependencies: ReleasePacketStubRecoveryArtifactCode[];
}

export interface ReleasePacketStubRecoveryBlocker {
  code: string;
  classification: ReleasePacketStubRecoveryClassification;
  reason: string;
  issue_codes: string[];
}

export interface ReleasePacketStubRecoveryArtifactDependency {
  code: ReleasePacketStubRecoveryArtifactCode;
  domain: ReleasePacketStubRecoveryDomain;
  reason: string;
  required_by: string[];
}

export interface ReleasePacketStubExecutionPrerequisite {
  kind: "step" | "artifact" | "runtime";
  code: string;
  satisfied: boolean;
  detail: string;
}

export interface ReleasePacketStubExecutionBlocker {
  code: string;
  detail: string;
  dependency_code: string | null;
}

export interface ReleasePacketStubExecutionStep {
  action_id: string;
  step_code: string;
  domain: ReleasePacketStubRecoveryDomain;
  human_label: string;
  machine_action_type: ReleasePacketStubMachineActionType;
  execution_kind: ReleasePacketStubExecutionKind;
  eligibility: ReleasePacketStubActionEligibility;
  action: string;
  reason: string;
  priority: number;
  automatic: boolean;
  preview_safe: boolean;
  requires_upstream_prep: boolean;
  issue_codes: string[];
  depends_on: string[];
  artifact_dependencies: ReleasePacketStubRecoveryArtifactCode[];
  prerequisites: ReleasePacketStubExecutionPrerequisite[];
  blocked_by: ReleasePacketStubExecutionBlocker[];
}

export interface ReleasePacketStubExecutionAttempt {
  attempt_id: string;
  action_id: string;
  step_code: string;
  attempted_at: string;
  actor_id: string | null;
  actor_label: string | null;
  result: ReleasePacketStubAttemptResult;
  detail: string;
}

export interface ReleasePacketStubExecutionBlockedReason {
  code: string;
  detail: string;
  step_codes: string[];
}

export interface ReleasePacketStubTranscriptOutput {
  status: ReleasePacketStubPrepStatus;
  ref_kind: "structured_transcript_selection";
  structured_transcript_path: string | null;
  artifact_updated_at: string | null;
  transcript_id: string | null;
  source_kind: ReleasePacketStubOutputSourceKind | null;
  layer_id: string | null;
  recipe_ref: string | null;
  macro_kind: ReleasePacketStubMacroKind | null;
  based_on_transcript_id: string | null;
  full_text: string;
  segment_count: number;
  caption_preview_row_count: number;
  approximate_caption_timing: boolean;
  full_text_present: boolean;
  segments: Array<{
    segment_id: string;
    speaker: string;
    start_sec: number;
    end_sec: number;
    text: string;
  }>;
}

export interface ReleasePacketStubSubtitleEntry {
  format: ReleasePacketStubSubtitleFormat;
  status: ReleasePacketStubPrepStatus;
  freshness: ReleasePacketStubArtifactFreshness;
  ref_kind: "embedded_structured_transcript";
  structured_transcript_path: string | null;
  artifact_updated_at: string | null;
  transcript_id: string | null;
  generated_at: string | null;
  source_transcript_id: string | null;
  source_layer_id: string | null;
  source_kind: ReleasePacketStubOutputSourceKind | null;
  source_recipe_ref: string | null;
  approximate_timing: boolean | null;
  entry_count: number;
  content_present: boolean;
  present: boolean;
  current: boolean;
  stale: boolean;
}

export interface ReleasePacketStubVisualPrep {
  status: ReleasePacketStubPrepStatus;
  ref_kind: "visual_placements_artifact";
  artifact_path: string | null;
  artifact_updated_at: string | null;
  prep_status: ReleasePacketStubVisualPrepStatus;
  freshness: ReleasePacketStubArtifactFreshness;
  transcript_source_ref: string | null;
  source_refs: string[];
  placement_count: number;
  uncertain_placement_count: number;
  uncertainty_flags: string[];
  has_placements: boolean;
}

export interface ReleasePacketStubAudioPrep {
  status: ReleasePacketStubPrepStatus;
  ref_kind: "audio_polish_artifact";
  artifact_path: string | null;
  artifact_updated_at: string | null;
  prep_status: ReleasePacketStubAudioPrepStatus;
  freshness: ReleasePacketStubArtifactFreshness;
  failure_code: ReleasePacketStubAudioFailureCode | null;
  failure_reason: string | null;
  prepared_passes: ReleasePacketStubAudioPass[];
  processor_version: string | null;
  settings_summary: Record<string, string | number | boolean | null>;
  output_local_relpath: string | null;
  output_mime_type: string | null;
  output_duration_ms: number | null;
  preferred_playback: {
    kind: ReleasePacketStubPreferredPlaybackKind;
    reason: ReleasePacketStubPreferredPlaybackReason;
    media_id: string | null;
    local_relpath: string | null;
    cloud_uri: string | null;
    mime_type: string | null;
    source_label: string | null;
  };
  raw_source: {
    media_id: string | null;
    kind: ReleasePacketStubMediaKind | null;
    media_signature: string | null;
    local_relpath: string | null;
    cloud_uri: string | null;
    source_hint: ReleasePacketStubMediaSourceHint | null;
    media_source_label: string | null;
    duration_ms: number | null;
  };
}

export interface ReleasePacketStub {
  schema_version: 1;
  packet_kind: "quench_release_packet_stub";
  source: {
    producer: "tongs";
    derived_from: "tongs_release_handoff_authority";
    target: {
      workspace_id: string;
      workpiece_id: string;
      workspace_name: string | null;
      workpiece_name: string | null;
    };
  };
  assembly: {
    authority_schema_version: 1;
    authority_snapshot_id: string;
    authority_snapshot_created_at: string | null;
    authority_integrity_hash: string;
    release_prep_schema_version: 1;
    deterministic_source_updated_at: string | null;
    source_timestamps: {
      state_updated_at: string | null;
      editor_session: ReleasePacketStubArtifactTimestamp;
      structured_transcript: ReleasePacketStubArtifactTimestamp;
      visual_placements: ReleasePacketStubArtifactTimestamp;
      audio_polish: ReleasePacketStubArtifactTimestamp;
    };
    freshness: {
      transcript_output: ReleasePacketStubPrepStatus;
      subtitle_srt: ReleasePacketStubArtifactFreshness;
      subtitle_vtt: ReleasePacketStubArtifactFreshness;
      visuals: ReleasePacketStubArtifactFreshness;
      audio_polish: ReleasePacketStubArtifactFreshness;
    };
  };
  identity: {
    workspace_id: string;
    workpiece_id: string;
    workspace_name: string | null;
    workpiece_name: string | null;
    editor_session_id: string | null;
    transcript_source_id: string | null;
    media_id: string | null;
  };
  context: {
    prep_status: ReleasePacketStubPrepLifecycleStatus | null;
    alignment_status: ReleasePacketStubAlignmentStatus | null;
    source_mode: ReleasePacketStubLaunchSourceMode | null;
    preview_mode: ReleasePacketStubPreviewMode | null;
  };
  source_media: {
    media_id: string | null;
    kind: ReleasePacketStubMediaKind | null;
    media_signature: string | null;
    source_hint: ReleasePacketStubMediaSourceHint | null;
    local_relpath: string | null;
    cloud_uri: string | null;
    duration_ms: number | null;
    media_source_label: string | null;
    transcript_id: string | null;
    transcript_prepared_at: string | null;
    transcript_segment_count: number;
  };
  authority: {
    status: ReleasePacketStubAuthorityStatus;
    safe_for_downstream_handoff: boolean;
    allow_preview: boolean;
    do_not_publish: boolean;
    compatible_consumers: string[];
    blockers: ReleasePacketStubAuthorityIssue[];
    warnings: ReleasePacketStubAuthorityIssue[];
    remediations: ReleasePacketStubAuthorityRemediation[];
  };
  recovery: {
    recovery_status: ReleasePacketStubRecoveryStatus;
    preview_allowed_during_recovery: boolean;
    publish_blocked_during_recovery: boolean;
    requires_upstream_prep: boolean;
    can_auto_recover: boolean;
    recovery_plan: ReleasePacketStubRecoveryStep[];
    recovery_blockers: ReleasePacketStubRecoveryBlocker[];
    artifact_dependencies: ReleasePacketStubRecoveryArtifactDependency[];
  };
  execution: {
    execution_status: ReleasePacketStubExecutionStatus;
    can_execute_recovery: boolean;
    last_attempt_at: string | null;
    last_attempt_result: ReleasePacketStubAttemptResult | null;
    last_attempt_detail: string | null;
    actionable_steps: ReleasePacketStubExecutionStep[];
    attempted_steps: ReleasePacketStubExecutionAttempt[];
    operator_actions_blocked_by: ReleasePacketStubExecutionBlockedReason[];
  };
  readiness: {
    overall_status: ReleasePacketStubSummaryStatus;
    fully_prepared: boolean;
    ready_check_count: number;
    attention_check_count: number;
    reason_statuses: ReleasePacketStubReasonStatus[];
    blocker_statuses: Array<"failed" | "unsupported" | "requires_future_ffmpeg" | "unsafe" | "incompatible">;
    attention_statuses: Array<"missing" | "stale">;
    status_flags: ReleasePacketStubReadinessFlags;
    message: string;
    reason_details: ReleasePacketStubBlockingReason[];
  };
  summary_flags: {
    safe_for_quench_preview: boolean;
    has_blockers: boolean;
    has_attention_items: boolean;
    has_output_text: boolean;
    has_current_subtitles: boolean;
    has_visual_guidance: boolean;
    has_preferred_audio_path: boolean;
  };
  transcript_output: ReleasePacketStubTranscriptOutput;
  subtitles: {
    last_generated_format: ReleasePacketStubSubtitleFormat | null;
    srt: ReleasePacketStubSubtitleEntry;
    vtt: ReleasePacketStubSubtitleEntry;
  };
  visuals: ReleasePacketStubVisualPrep;
  audio: ReleasePacketStubAudioPrep;
  media_backbone: {
    runtime: {
      preferred_backend: "auto" | "builtin" | "ffmpeg";
      ffmpeg_install_state: "not_configured" | "partial" | "ready";
      ffmpeg_available: boolean;
      ffprobe_available: boolean;
      future_operations: Array<{
        operation: "ensure_working_audio" | "generate_waveform_proxy" | "render_clip_export";
        backend: "ffmpeg";
        install_state: "not_configured" | "partial" | "ready";
        detail: string;
      }>;
    };
    audio_plan: {
      readiness: ReleasePacketStubAudioPlanReadiness | null;
      executable: boolean;
      backend: "builtin" | "ffmpeg" | "none";
      current_strategy: "builtin_wav_v1" | "ffmpeg_working_audio_v1" | null;
      future_strategy: "ffmpeg_working_audio_v1" | null;
      requires_ffmpeg: boolean;
      detail: string | null;
    };
  };
}
