export type HammerEditInstructionType =
  | "delete"
  | "mute"
  | "trim"
  | "split"
  | "merge"
  | "hard_cut"
  | "cut_range"
  | "ripple_delete"
  | "insert_broll"
  | "overlay_graphic"
  | "crossfade"
  | "dip_to_black"
  | "fade_audio"
  | "audio_duck"
  | "apply_look"
  | "apply_exposure"
  | "podcast_master_pass";

export type HammerEditInstructionOperationFamily =
  | "transcript_structural"
  | "timeline_structural"
  | "visual_insertion"
  | "audio_shaping"
  | "video_enhancement";

export type HammerEditInstructionCapability =
  | "executable"
  | "degraded"
  | "unavailable";

export type HammerEditInstructionExecutionStatus =
  | "declared"
  | "applied"
  | "deferred";

export type HammerEditInstructionExecutionTarget =
  | "preview"
  | "export"
  | "handoff";

export interface HammerEditInstructionExecutionMetadata {
  operation_family: HammerEditInstructionOperationFamily;
  capability: HammerEditInstructionCapability;
  status: HammerEditInstructionExecutionStatus;
  target: HammerEditInstructionExecutionTarget;
  degradation_reasons?: string[];
}

export interface HammerEditInstructionBase {
  instruction_id: string;
  segment_id: string;
  type: HammerEditInstructionType;
  created_at: string;
  execution?: HammerEditInstructionExecutionMetadata;
}

export interface HammerDeleteInstruction extends HammerEditInstructionBase {
  type: "delete";
}

export interface HammerMuteInstruction extends HammerEditInstructionBase {
  type: "mute";
}

export interface HammerTrimInstruction extends HammerEditInstructionBase {
  type: "trim";
  trim_start_sec?: number;
  trim_end_sec?: number;
}

export interface HammerSplitInstruction extends HammerEditInstructionBase {
  type: "split";
  split_at_sec: number;
}

export interface HammerMergeInstruction extends HammerEditInstructionBase {
  type: "merge";
  merge_with_segment_id: string;
}

export interface HammerCutRangeInstruction extends HammerEditInstructionBase {
  type: "cut_range";
  start_sec: number;
  end_sec: number;
}

export interface HammerHardCutInstruction extends HammerEditInstructionBase {
  type: "hard_cut";
  start_sec: number;
  end_sec: number;
}

export interface HammerRippleDeleteInstruction extends HammerEditInstructionBase {
  type: "ripple_delete";
  start_sec: number;
  end_sec: number;
}

export interface HammerInsertBrollInstruction extends HammerEditInstructionBase {
  type: "insert_broll";
  asset_ref: string;
  start_sec: number;
  end_sec: number;
  intent_source?: "manual" | "hearth_suggestion";
  intent_ref?: string;
  intent_description?: string | null;
  asset_binding_state?: "resolved" | "unresolved";
  duck_preference?: "auto" | "none" | "manual";
  replace_clip_id?: string;
  companion_audio_duck_operation_id?: string | null;
}

export interface HammerOverlayGraphicInstruction extends HammerEditInstructionBase {
  type: "overlay_graphic";
  asset_ref: string;
  start_sec: number;
  end_sec: number;
}

export interface HammerCrossfadeInstruction extends HammerEditInstructionBase {
  type: "crossfade";
  next_segment_id: string;
  duration_sec: number;
  start_sec?: number;
  end_sec?: number;
}

export interface HammerDipToBlackInstruction extends HammerEditInstructionBase {
  type: "dip_to_black";
  start_sec: number;
  end_sec: number;
}

export interface HammerFadeAudioInstruction extends HammerEditInstructionBase {
  type: "fade_audio";
  start_sec: number;
  end_sec: number;
  fade_curve?: "linear" | "log";
}

export interface HammerAudioDuckInstruction extends HammerEditInstructionBase {
  type: "audio_duck";
  start_sec: number;
  end_sec: number;
  duck_gain_db: number;
  linked_broll_operation_id?: string | null;
}

export type HammerLookPreset =
  | "clean_daylight"
  | "warm_studio"
  | "cool_evening"
  | "high_contrast"
  | "soft_documentary";

export interface HammerApplyLookInstruction extends HammerEditInstructionBase {
  type: "apply_look";
  preset: HammerLookPreset;
}

export interface HammerApplyExposureInstruction extends HammerEditInstructionBase {
  type: "apply_exposure";
  exposure: number;
}

export interface HammerPodcastMasterPassInstruction extends HammerEditInstructionBase {
  type: "podcast_master_pass";
  preset: "podcast_master_v1";
  noise_cleanup: "off" | "light";
  normalization_lufs: number;
  compression_amount: "light" | "medium";
  limiter_ceiling_dbtp: number;
}

export type HammerEditInstruction =
  | HammerDeleteInstruction
  | HammerMuteInstruction
  | HammerTrimInstruction
  | HammerSplitInstruction
  | HammerMergeInstruction
  | HammerHardCutInstruction
  | HammerCutRangeInstruction
  | HammerRippleDeleteInstruction
  | HammerInsertBrollInstruction
  | HammerOverlayGraphicInstruction
  | HammerCrossfadeInstruction
  | HammerDipToBlackInstruction
  | HammerFadeAudioInstruction
  | HammerAudioDuckInstruction
  | HammerApplyLookInstruction
  | HammerApplyExposureInstruction
  | HammerPodcastMasterPassInstruction;

export type HammerCutInstructionType = HammerEditInstructionType;
export type HammerCutInstruction = HammerEditInstruction;

export interface HammerEditInstructionSet {
  media_id: string;
  instructions: HammerEditInstruction[];
}
