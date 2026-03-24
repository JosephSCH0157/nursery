import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";

type SemanticEditInstruction =
  | {
    type: "delete" | "mute";
    segment_id: string;
  }
  | {
    type: "trim";
    segment_id: string;
    trim_start_sec: number | null;
    trim_end_sec: number | null;
  }
  | {
    type: "split";
    segment_id: string;
    split_at_sec: number;
  }
  | {
    type: "merge";
    segment_id: string;
    merge_with_segment_id: string;
  }
  | {
    type: "cut_range" | "ripple_delete";
    segment_id: string;
    start_sec: number;
    end_sec: number;
  }
  | {
    type: "insert_broll" | "overlay_graphic";
    segment_id: string;
    asset_ref: string;
    start_sec: number;
    end_sec: number;
  }
  | {
    type: "crossfade";
    segment_id: string;
    next_segment_id: string;
    duration_sec: number;
  }
  | {
    type: "audio_duck";
    segment_id: string;
    start_sec: number;
    end_sec: number;
    duck_gain_db: number;
  };

function toSemanticEditInstruction(
  instruction: HammerEditInstruction,
): SemanticEditInstruction {
  switch (instruction.type) {
    case "delete":
    case "mute":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
      };
    case "trim":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        trim_start_sec: instruction.trim_start_sec ?? null,
        trim_end_sec: instruction.trim_end_sec ?? null,
      };
    case "split":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        split_at_sec: instruction.split_at_sec,
      };
    case "merge":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        merge_with_segment_id: instruction.merge_with_segment_id,
      };
    case "cut_range":
    case "ripple_delete":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        start_sec: instruction.start_sec,
        end_sec: instruction.end_sec,
      };
    case "insert_broll":
    case "overlay_graphic":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        asset_ref: instruction.asset_ref,
        start_sec: instruction.start_sec,
        end_sec: instruction.end_sec,
      };
    case "crossfade":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        next_segment_id: instruction.next_segment_id,
        duration_sec: instruction.duration_sec,
      };
    case "audio_duck":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        start_sec: instruction.start_sec,
        end_sec: instruction.end_sec,
        duck_gain_db: instruction.duck_gain_db,
      };
  }
}

function compareSemanticInstructions(
  left: SemanticEditInstruction,
  right: SemanticEditInstruction,
): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

export function createSemanticEditPlanSignature(
  sourceTranscriptId: string,
  previewMode: HammerPreviewMode,
  instructions: HammerEditInstruction[],
): string {
  const semanticInstructions = instructions
    .map((instruction) => toSemanticEditInstruction(instruction))
    .sort(compareSemanticInstructions);

  return JSON.stringify({
    source_transcript_id: sourceTranscriptId,
    preview_mode: previewMode,
    instructions: semanticInstructions,
  });
}
