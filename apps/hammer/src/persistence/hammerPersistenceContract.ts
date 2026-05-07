import type {
  HammerEditPlan,
  HammerPreviewMode,
} from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import type {
  HammerLaunchContext,
  HammerLaunchSourceMode,
} from "../../../../packages/contracts/hammer/launch-context.contract";
import type {
  MediaRef,
  WorkspaceMediaMapping,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedTranscriptVersionRegistry } from "../../../../packages/contracts/hammer/transcript-versions.contract";

export type { HammerPersistedTranscriptVersionRegistry };
export type { HammerTranscriptVersionEntry, HammerTranscriptVersionSource } from "../../../../packages/contracts/hammer/transcript-versions.contract";
import type {
  HammerAudioEditOperation,
  HammerAudioEditCutOperation,
  HammerPersistedAudioEdit,
} from "../../../../packages/tongs/src/hammer-audio-edit-contract";
import type {
  HammerAlignmentStatus,
  HammerPassId,
  HammerPassState,
  HammerPassStatusMap,
  HammerPrepStatus,
} from "../../../../packages/tongs/src/hammer-orchestration-contract";
import { HAMMER_PASS_ORDER_VERSION } from "../../../../packages/tongs/src/hammer-orchestration-contract";

export type {
  HammerAudioEditOperation,
  HammerAudioEditCutOperation,
  HammerPersistedAudioEdit,
};
export type {
  HammerAlignmentStatus,
  HammerPassId,
  HammerPassState,
  HammerPassStatusMap,
  HammerPrepStatus,
};
export { HAMMER_PASS_ORDER_VERSION };

export type HammerPresenceMode = "viewing" | "editing";

export interface HammerPersistenceTarget {
  workspaceId: string;
  workpieceId: string;
}

export interface HammerPersistedArtifact<T> {
  path: string | null;
  updated_at: string | null;
  data: T | null;
}

export interface HammerPersistedEditorSession {
  schema_version: 1;
  session_id: string;
  source_mode: HammerLaunchSourceMode;
  preview_mode: HammerPreviewMode;
  transcript_source_id: string;
  selected_segment_id: string | null;
  selected_overlay_row_id: string | null;
  media_ref: MediaRef | null;
  workspace_mapping: WorkspaceMediaMapping | null;
  media_source_label: string | null;
  visual_preview: HammerPersistedVisualPreviewSettings;
  last_opened_at: string;
}

export interface HammerPersistedVisualPreviewSettings {
  white_balance: number;
  color_amount: number;
  background_blur: boolean;
  eye_contact_assist_enabled?: boolean;
  eye_contact_assist_strength?: number; // 0..1
  background_blur_px?: number;
  background_blur_feather_px?: number;
  background_blur_temporal_smoothing?: number;
  background_blur_subject_expansion_px?: number;
  background_blur_quality_mode?: "low" | "medium" | "high";
  background_blur_fallback_mode?: "disable" | "passthrough";
  background_blur_provider?: string | null;
  background_replace_enabled?: boolean;
  background_replace_mode?: "solid" | "image" | "checkerboard";
  background_replace_color?: string;
  background_replace_image_url?: string | null;
  background_replace_image_asset_path?: string | null;
  background_replace_image_asset_id?: string | null;
  background_replace_image_asset_type?: "image" | "other" | null;
  background_wash_enabled?: boolean;
  background_wash_dim_amount?: number;
  background_wash_desaturate_amount?: number;
}

export type HammerDerivedTextMacroKind =
  | "filler_cleanup"
  | "retake_tightening"
  | "speaker_solo"
  | "speaker_interview"
  | "speaker_monologue"
  | "speaker_panel";

export type HammerDerivedTextOperationKind =
  | "filler_removed"
  | "retake_fragment_removed";

export interface HammerDerivedTextOperation {
  kind: HammerDerivedTextOperationKind;
  value: string;
  start: number;
  end: number;
}

export interface HammerDerivedTextChange {
  segment_id: string;
  original_text: string;
  cleaned_text: string;
  operations: HammerDerivedTextOperation[];
}

export interface HammerDerivedTextLayer {
  layer_id: string;
  recipe_ref: string;
  macro_kind: HammerDerivedTextMacroKind;
  status: "review" | "active" | "discarded";
  created_at: string;
  based_on_transcript_id: string;
  summary: {
    changed_segment_count: number;
    removal_count: number;
    untouched_segment_count: number;
  };
  changes: HammerDerivedTextChange[];
}

export interface HammerPersistedDerivedTextLayers {
  schema_version: 1;
  active_layer_id: string | null;
  output_layer_id: string | null;
  layers: HammerDerivedTextLayer[];
}

export type HammerSubtitleFormat = "srt" | "vtt";

export interface HammerPersistedSubtitleArtifact {
  format: HammerSubtitleFormat;
  generated_at: string;
  source_transcript_id: string;
  source_layer_id: string | null;
  source_kind: "raw" | "derived";
  source_recipe_ref: string | null;
  approximate_timing: boolean;
  entry_count: number;
  content: string;
}

export interface HammerPersistedSubtitleOutputs {
  schema_version: 1;
  last_generated_format: HammerSubtitleFormat | null;
  srt: HammerPersistedSubtitleArtifact | null;
  vtt: HammerPersistedSubtitleArtifact | null;
}

export interface HammerPersistedStructuredTranscript {
  schema_version: 1;
  transcript_id: string;
  media_id: string | null;
  media_signature: string | null;
  prepared_at: string;
  structure: "speaker_turns";
  source_media_ref: MediaRef | null;
  diarization: {
    label_scheme: "forge-neutral-speakers.v1";
    labels: string[];
    raw_labels: string[];
    version: string | null;
    provider: "openai";
    provider_request_id: string | null;
    model: string | null;
  };
  confidence_flags: Array<{
    turn_id: string;
    code: "speaker_boundary_low_confidence";
    detail: string;
  }>;
  segments: HammerTranscriptSegment[];
  derived_text_layers?: HammerPersistedDerivedTextLayers;
  subtitle_outputs?: HammerPersistedSubtitleOutputs;
}

export interface HammerPersistedSpeakerMap {
  schema_version: 1;
  default_labels: string[];
  mappings: Array<{
    speaker_label: string;
    display_name: string | null;
    source: "default" | "user";
  }>;
}

export interface HammerVisualPlacementRecord {
  placement_id: string;
  authority_operation_id?: string;
  entry_id: string;
  anchor_segment_id: string;
  matched_segment_ids: string[];
  anchor_text: string | null;
  asset_ref: string;
  asset_id: string | null;
  asset_path: string | null;
  storage_key: string | null;
  label: string | null;
  visual_mode: string | null;
  start_sec: number;
  end_sec: number;
  confidence: number | null;
  timing_source: "transcript_match" | "ordered_fallback";
  status: "placed" | "uncertain";
  ingest_state?: "suggested" | "approved";
  uncertainty_flags: string[];
  overlay_geometry?: {
    x: number;
    y: number;
    width: number;
    height: number;
    anchor?: "center" | "top_left";
  } | null;
  animation_preset?:
    | "none"
    | "fade_in"
    | "fade_out"
    | "fade_in_out"
    | "flip_in"
    | "flip_out"
    | "shutter_in"
    | "shutter_out"
    | "shutter_in_fade_out"
    | null;
  overlay_opacity?: number | null;
  overlay_z_index?: number | null;
  script_cue_id?: string | null;
  placement_authority?: "hammer_timeline_anchor";
  alignment?: {
    script_cue_id: string;
    transcript_segment_id: string;
    transcript_start_sec: number;
    transcript_end_sec: number;
    confidence: number | null;
    match_method: "deterministic_phrase" | "fuzzy_text" | "ordered_fallback";
    state: "aligned" | "review_needed" | "unresolved";
  } | null;
}

export interface HammerPersistedVisualPlacements {
  schema_version: 1;
  status: "not_started" | "prepared";
  source_refs: string[];
  uncertainty_flags: string[];
  placements: HammerVisualPlacementRecord[];
}

export type HammerAudioPolishPass = "studio_sound" | "noise_cleanup" | "level_consistency";
export type HammerAudioPolishStatus = "not_started" | "preparing" | "prepared" | "failed";
export type HammerAudioPolishFailureCode =
  | "unsupported_source"
  | "source_unavailable"
  | "stuck_preparing"
  | "processing_failed";

export interface HammerAudioPolishAnalysisLoudness {
  integrated_lufs: number | null;
  loudness_range_lu: number | null;
  true_peak_dbtp: number | null;
  rms_dbfs: number | null;
}

export interface HammerAudioPolishAnalysisSegmentationRegion {
  id: string;
  start_sec: number;
  end_sec: number;
  kind: "speech" | "silence";
  confidence: number | null;
}

export interface HammerAudioPolishAnalysisSegmentation {
  strategy: "ffmpeg_silencedetect_v1";
  noise_floor_db: number | null;
  min_silence_sec: number;
  regions: HammerAudioPolishAnalysisSegmentationRegion[];
  speech_region_count: number;
  silence_region_count: number;
}

export interface HammerAudioPolishAnalysisTranscriptPrepChunk {
  id: string;
  chunk_index: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  boundary_reason: "silence_boundary" | "hard_max_split" | "short_file";
  source: "silence_boundary" | "hard_max_split" | "short_file";
}

export interface HammerAudioPolishAnalysisTranscriptPrep {
  strategy: "fixed_chunk_with_silence_bias_v1";
  target_chunk_sec: number;
  max_chunk_sec: number;
  chunks: HammerAudioPolishAnalysisTranscriptPrepChunk[];
  chunk_count: number;
}

export interface HammerAudioPolishAnalysisChannelCharacterization {
  channel_count: number;
  silent_channel: "left" | "right" | null;
  dual_mono: boolean;
  phase_correlation: number | null;
  phase_concern: boolean;
}

export interface HammerAudioPolishAnalysisWaveformProxy {
  version: "v1";
  duration_sec: number;
  bucket_count: number;
  bucket_duration_sec: number;
  channel_mode: "mono_mixdown";
  peaks: number[];
}

export interface HammerAudioPolishAnalysis {
  schema_version: 1;
  source_ref: string | null;
  analyzed_at: string;
  loudness: HammerAudioPolishAnalysisLoudness;
  segmentation: HammerAudioPolishAnalysisSegmentation;
  transcript_prep: HammerAudioPolishAnalysisTranscriptPrep;
  channel_characterization: HammerAudioPolishAnalysisChannelCharacterization | null;
  waveform_proxy: HammerAudioPolishAnalysisWaveformProxy | null;
}

export interface HammerPersistedAudioPolish {
  schema_version: 1;
  status: HammerAudioPolishStatus;
  prepared_passes: HammerAudioPolishPass[];
  source_artifact_paths: string[];
  settings_summary: Record<string, string | number | boolean | null>;
  analysis: HammerAudioPolishAnalysis | null;
  audio_edit: HammerPersistedAudioEdit | null;
  source_media_id: string | null;
  source_media_signature: string | null;
  processor_version: string | null;
  prepared_at: string | null;
  output_local_relpath: string | null;
  output_workpiece_path: string | null;
  output_mime_type: string | null;
  output_duration_ms: number | null;
  failure_code: HammerAudioPolishFailureCode | null;
  failure_reason: string | null;
}

export interface HammerPersistedMacroHooks {
  recipe_ref: string | null;
  last_run_ref: string | null;
}

export interface HammerPersistedStateRecord {
  workspace_id: string;
  workpiece_id: string;
  active_session_id: string | null;
  current_pass: HammerPassId;
  pass_order_version: number;
  pass_status: HammerPassStatusMap;
  editor_session_path: string | null;
  transcript_artifact_path: string | null;
  transcript_versions_artifact_path: string | null;
  speaker_map_artifact_path: string | null;
  visual_placement_artifact_path: string | null;
  visual_timeline_artifact_path?: string | null;
  audio_polish_artifact_path: string | null;
  edit_plan_artifact_path: string | null;
  editorial_authority_artifact_path: string | null;
  edit_plan_signature: string | null;
  prep_status: HammerPrepStatus;
  alignment_status: HammerAlignmentStatus;
  macro_recipe_ref: string | null;
  last_macro_run_ref: string | null;
  last_opened_at: string;
  updated_at: string;
  updated_by: string;
}

export interface HammerPersistenceSnapshot {
  schema_version: 1;
  state: HammerPersistedStateRecord | null;
  editor_session: HammerPersistedArtifact<HammerPersistedEditorSession>;
  structured_transcript: HammerPersistedArtifact<HammerPersistedStructuredTranscript>;
  transcript_version_registry: HammerPersistedArtifact<HammerPersistedTranscriptVersionRegistry>;
  speaker_map: HammerPersistedArtifact<HammerPersistedSpeakerMap>;
  visual_placements: HammerPersistedArtifact<HammerPersistedVisualPlacements>;
  visual_timeline: HammerPersistedArtifact<HammerVisualTimelineState>;
  audio_polish: HammerPersistedArtifact<HammerPersistedAudioPolish>;
  edit_plan: HammerPersistedArtifact<HammerEditPlan>;
  editorial_authority: HammerPersistedArtifact<HammerEditorialAuthorityGraph>;
  macro_hooks: HammerPersistedMacroHooks;
}

export interface HammerArtifactWriteRequest<T> {
  path?: string;
  expected_previous_updated_at?: string | null;
  data: T;
}

export interface HammerPersistenceSaveRequest {
  written_by: {
    tool: string;
    tool_version: string;
    lane: string;
  };
  active_session_id?: string | null;
  prep_status?: HammerPrepStatus;
  alignment_status?: HammerAlignmentStatus;
  current_pass?: HammerPassId;
  pass_order_version?: number;
  pass_status?: HammerPassStatusMap;
  last_opened_at?: string;
  edit_plan_signature?: string | null;
  macro_recipe_ref?: string | null;
  last_macro_run_ref?: string | null;
  editor_session?: HammerArtifactWriteRequest<HammerPersistedEditorSession>;
  structured_transcript?: HammerArtifactWriteRequest<HammerPersistedStructuredTranscript>;
  transcript_version_registry?: HammerArtifactWriteRequest<HammerPersistedTranscriptVersionRegistry>;
  speaker_map?: HammerArtifactWriteRequest<HammerPersistedSpeakerMap>;
  visual_placements?: HammerArtifactWriteRequest<HammerPersistedVisualPlacements>;
  visual_timeline?: HammerArtifactWriteRequest<HammerVisualTimelineState>;
  audio_polish?: HammerArtifactWriteRequest<HammerPersistedAudioPolish>;
  edit_plan?: HammerArtifactWriteRequest<HammerEditPlan>;
  editorial_authority?: HammerArtifactWriteRequest<HammerEditorialAuthorityGraph>;
}

export interface HammerPresenceRow {
  workspace_id: string;
  workpiece_id: string;
  user_id: string;
  session_id: string | null;
  display_name: string | null;
  mode: HammerPresenceMode;
  last_seen_at: string;
  created_at: string;
}

export interface HammerPresenceRequest {
  mode: HammerPresenceMode;
  display_name?: string | null;
  session_id?: string | null;
}

export interface HammerHydratedLaunchContext {
  launchContext: HammerLaunchContext;
  source: "launch" | "persistence";
}
