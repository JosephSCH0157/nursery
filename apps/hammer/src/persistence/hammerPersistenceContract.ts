import type {
  HammerEditPlan,
  HammerPreviewMode,
} from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerLaunchContext,
  HammerLaunchSourceMode,
} from "../../../../packages/contracts/hammer/launch-context.contract";
import type {
  MediaRef,
  WorkspaceMediaMapping,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

export type HammerPrepStatus = "idle" | "preparing" | "prepared" | "prep_failed";
export type HammerAlignmentStatus = "not_started" | "pending" | "aligned" | "needs_review";
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
  last_opened_at: string;
}

export type HammerDerivedTextMacroKind =
  | "filler_cleanup"
  | "retake_tightening";

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
  layers: HammerDerivedTextLayer[];
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
  uncertainty_flags: string[];
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
  | "processing_failed";

export interface HammerPersistedAudioPolish {
  schema_version: 1;
  status: HammerAudioPolishStatus;
  prepared_passes: HammerAudioPolishPass[];
  source_artifact_paths: string[];
  settings_summary: Record<string, string | number | boolean | null>;
  source_media_id: string | null;
  source_media_signature: string | null;
  processor_version: string | null;
  prepared_at: string | null;
  output_local_relpath: string | null;
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
  editor_session_path: string | null;
  transcript_artifact_path: string | null;
  speaker_map_artifact_path: string | null;
  visual_placement_artifact_path: string | null;
  audio_polish_artifact_path: string | null;
  edit_plan_artifact_path: string | null;
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
  speaker_map: HammerPersistedArtifact<HammerPersistedSpeakerMap>;
  visual_placements: HammerPersistedArtifact<HammerPersistedVisualPlacements>;
  audio_polish: HammerPersistedArtifact<HammerPersistedAudioPolish>;
  edit_plan: HammerPersistedArtifact<HammerEditPlan>;
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
  last_opened_at?: string;
  edit_plan_signature?: string | null;
  macro_recipe_ref?: string | null;
  last_macro_run_ref?: string | null;
  editor_session?: HammerArtifactWriteRequest<HammerPersistedEditorSession>;
  structured_transcript?: HammerArtifactWriteRequest<HammerPersistedStructuredTranscript>;
  speaker_map?: HammerArtifactWriteRequest<HammerPersistedSpeakerMap>;
  visual_placements?: HammerArtifactWriteRequest<HammerPersistedVisualPlacements>;
  audio_polish?: HammerArtifactWriteRequest<HammerPersistedAudioPolish>;
  edit_plan?: HammerArtifactWriteRequest<HammerEditPlan>;
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
