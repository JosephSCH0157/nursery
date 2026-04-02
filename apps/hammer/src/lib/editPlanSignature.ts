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
    type: "hard_cut" | "cut_range" | "ripple_delete" | "dip_to_black" | "fade_audio";
    segment_id: string;
    start_sec: number;
    end_sec: number;
    fade_curve?: "linear" | "log";
  }
  | {
    type: "insert_broll" | "overlay_graphic";
    segment_id: string;
    asset_ref: string;
    start_sec: number;
    end_sec: number;
    intent_source?: "manual" | "hearth_suggestion";
    intent_ref?: string | null;
    intent_description?: string | null;
    asset_binding_state?: "resolved" | "unresolved";
    duck_preference?: "auto" | "none" | "manual";
    companion_audio_duck_operation_id?: string | null;
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
    linked_broll_operation_id?: string | null;
  }
  | {
    type: "apply_look";
    segment_id: string;
    preset: "clean_daylight" | "warm_studio" | "cool_evening" | "high_contrast" | "soft_documentary";
  }
  | {
    type: "apply_exposure";
    segment_id: string;
    exposure: number;
  }
  | {
    type: "podcast_master_pass";
    segment_id: string;
    preset: "podcast_master_v1";
    noise_cleanup: "off" | "light";
    normalization_lufs: number;
    compression_amount: "light" | "medium";
    limiter_ceiling_dbtp: number;
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
    case "hard_cut":
    case "ripple_delete":
    case "dip_to_black":
    case "fade_audio":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        start_sec: instruction.start_sec,
        end_sec: instruction.end_sec,
        ...(instruction.type === "fade_audio"
          ? { fade_curve: instruction.fade_curve ?? "linear" }
          : {}),
      };
    case "insert_broll":
    case "overlay_graphic":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        asset_ref: instruction.asset_ref,
        start_sec: instruction.start_sec,
        end_sec: instruction.end_sec,
        ...(instruction.type === "insert_broll"
          ? {
            intent_source: instruction.intent_source ?? "manual",
            intent_ref: instruction.intent_ref ?? null,
            intent_description: instruction.intent_description ?? null,
            asset_binding_state: instruction.asset_binding_state ?? "resolved",
            duck_preference: instruction.duck_preference ?? "auto",
            companion_audio_duck_operation_id: instruction.companion_audio_duck_operation_id ?? null,
          }
          : {}),
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
        linked_broll_operation_id: instruction.linked_broll_operation_id ?? null,
      };
    case "apply_look":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        preset: instruction.preset,
      };
    case "apply_exposure":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        exposure: instruction.exposure,
      };
    case "podcast_master_pass":
      return {
        type: instruction.type,
        segment_id: instruction.segment_id,
        preset: instruction.preset,
        noise_cleanup: instruction.noise_cleanup,
        normalization_lufs: instruction.normalization_lufs,
        compression_amount: instruction.compression_amount,
        limiter_ceiling_dbtp: instruction.limiter_ceiling_dbtp,
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
