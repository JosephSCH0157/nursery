import type { HammerEditInstruction } from "./edit-instruction.contract";

export type HammerPreviewMode = "raw" | "edit-aware";

export interface HammerEditPlan {
  edit_plan_id: string;
  version: string;
  created_at: string;
  updated_at: string;
  source_transcript_id: string;
  instructions: HammerEditInstruction[];
  preview_mode?: HammerPreviewMode;
  tool_version?: string;
  workspace_id?: string;
  workpiece_id?: string;
  session_id?: string;
}
