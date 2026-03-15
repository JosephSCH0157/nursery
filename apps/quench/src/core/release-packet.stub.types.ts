export type ReleasePacketStubSummaryStatus = "ready" | "attention" | "blocked";

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
  | "processing_failed";
export type ReleasePacketStubAudioPass = "studio_sound" | "noise_cleanup" | "level_consistency";
export type ReleasePacketStubCheckId =
  | "transcript_output"
  | "subtitle_srt"
  | "subtitle_vtt"
  | "visuals"
  | "audio_polish";

export interface ReleasePacketStubBlockingReason {
  check_id: ReleasePacketStubCheckId;
  label: string;
  status: ReleasePacketStubPrepStatus;
  detail: string;
}

export interface ReleasePacketStubReadinessFlags {
  ready: boolean;
  missing: boolean;
  stale: boolean;
  failed: boolean;
  unsupported: boolean;
  requires_future_ffmpeg: boolean;
}

export interface ReleasePacketStubTranscriptOutput {
  status: ReleasePacketStubPrepStatus;
  ref_kind: "structured_transcript_selection";
  structured_transcript_path: string | null;
  transcript_id: string | null;
  source_kind: ReleasePacketStubOutputSourceKind | null;
  layer_id: string | null;
  recipe_ref: string | null;
  macro_kind: ReleasePacketStubMacroKind | null;
  based_on_transcript_id: string | null;
  segment_count: number;
  caption_preview_row_count: number;
  approximate_caption_timing: boolean;
  full_text_present: boolean;
}

export interface ReleasePacketStubSubtitleEntry {
  format: ReleasePacketStubSubtitleFormat;
  status: ReleasePacketStubPrepStatus;
  freshness: ReleasePacketStubArtifactFreshness;
  ref_kind: "embedded_structured_transcript";
  structured_transcript_path: string | null;
  transcript_id: string | null;
  source_transcript_id: string | null;
  source_layer_id: string | null;
  source_kind: ReleasePacketStubOutputSourceKind | null;
  source_recipe_ref: string | null;
  entry_count: number;
  content_present: boolean;
}

export interface ReleasePacketStubVisualPrep {
  status: ReleasePacketStubPrepStatus;
  ref_kind: "visual_placements_artifact";
  artifact_path: string | null;
  prep_status: ReleasePacketStubVisualPrepStatus;
  freshness: ReleasePacketStubArtifactFreshness;
  transcript_source_ref: string | null;
  source_refs: string[];
  placement_count: number;
  uncertain_placement_count: number;
  uncertainty_flags: string[];
}

export interface ReleasePacketStubAudioPrep {
  status: ReleasePacketStubPrepStatus;
  ref_kind: "audio_polish_artifact";
  artifact_path: string | null;
  prep_status: ReleasePacketStubAudioPrepStatus;
  freshness: ReleasePacketStubArtifactFreshness;
  plan_readiness: ReleasePacketStubAudioPlanReadiness | null;
  plan_detail: string | null;
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
    derived_from: "hammer_release_prep";
    target: {
      workspace_id: string;
      workpiece_id: string;
    };
  };
  identity: {
    workspace_id: string;
    workpiece_id: string;
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
  readiness: {
    summary_status: ReleasePacketStubSummaryStatus;
    safe_to_publish: boolean;
    fully_prepared: boolean;
    ready_count: number;
    attention_count: number;
    blocking_statuses: Exclude<ReleasePacketStubPrepStatus, "ready">[];
    status_flags: ReleasePacketStubReadinessFlags;
    message: string;
    blocking_reasons: ReleasePacketStubBlockingReason[];
  };
  transcript_output: ReleasePacketStubTranscriptOutput;
  subtitles: {
    last_generated_format: ReleasePacketStubSubtitleFormat | null;
    srt: ReleasePacketStubSubtitleEntry;
    vtt: ReleasePacketStubSubtitleEntry;
  };
  visuals: ReleasePacketStubVisualPrep;
  audio: ReleasePacketStubAudioPrep;
}
