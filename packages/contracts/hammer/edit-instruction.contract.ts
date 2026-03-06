export type HammerCutInstructionType = "delete" | "mute" | "trim";

export interface HammerCutInstruction {
  instruction_id: string;
  segment_id: string;
  type: HammerCutInstructionType;
  created_at: string;
}

export interface HammerEditInstructionSet {
  media_id: string;
  instructions: HammerCutInstruction[];
}
