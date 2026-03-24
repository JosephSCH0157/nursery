export type HammerEditInstructionType =
  | "delete"
  | "mute"
  | "trim"
  | "split"
  | "merge"
  | "cut_range"
  | "ripple_delete"
  | "insert_broll"
  | "overlay_graphic"
  | "crossfade"
  | "audio_duck";

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
  replace_clip_id?: string;
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
}

export interface HammerAudioDuckInstruction extends HammerEditInstructionBase {
  type: "audio_duck";
  start_sec: number;
  end_sec: number;
  duck_gain_db: number;
}

export type HammerEditInstruction =
  | HammerDeleteInstruction
  | HammerMuteInstruction
  | HammerTrimInstruction
  | HammerSplitInstruction
  | HammerMergeInstruction
  | HammerCutRangeInstruction
  | HammerRippleDeleteInstruction
  | HammerInsertBrollInstruction
  | HammerOverlayGraphicInstruction
  | HammerCrossfadeInstruction
  | HammerAudioDuckInstruction;

export type HammerCutInstructionType = HammerEditInstructionType;
export type HammerCutInstruction = HammerEditInstruction;

export interface HammerEditInstructionSet {
  media_id: string;
  instructions: HammerEditInstruction[];
}
