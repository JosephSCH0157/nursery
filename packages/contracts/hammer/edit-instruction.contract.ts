export type HammerEditInstructionType =
  | "delete"
  | "mute"
  | "trim"
  | "split"
  | "merge";

export interface HammerEditInstructionBase {
  instruction_id: string;
  segment_id: string;
  type: HammerEditInstructionType;
  created_at: string;
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

export type HammerEditInstruction =
  | HammerDeleteInstruction
  | HammerMuteInstruction
  | HammerTrimInstruction
  | HammerSplitInstruction
  | HammerMergeInstruction;

export type HammerCutInstructionType = HammerEditInstructionType;
export type HammerCutInstruction = HammerEditInstruction;

export interface HammerEditInstructionSet {
  media_id: string;
  instructions: HammerEditInstruction[];
}
