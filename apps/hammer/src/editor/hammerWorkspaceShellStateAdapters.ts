import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  HammerEditorialAuthorityGraph,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";
import {
  listHammerDerivedTextLayers,
  normalizeHammerOutputSelectionRef,
} from "../macros/hammerDerivedTranscriptLayers";
import { cloneHammerAudioEdit } from "../prep/hammerAudioPolish";
import type {
  HammerPersistedAudioEdit,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPreviewSettings,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import {
  cloneHammerStudioRackState,
  type HammerStudioRackState,
} from "./hammerStudioRack";
import type {
  HammerEditorStateSerializable,
  HammerOutputSelectionState,
} from "./hammerWorkspaceHistory";

export type HammerShellStateProjection = {
  segments: HammerTranscriptSegment[];
  visualPlacements: HammerPersistedVisualPlacements | null;
  visualTimeline: HammerVisualTimelineState | null;
  audioEdit: HammerPersistedAudioEdit | null;
  studioRack: HammerStudioRackState;
  editorialAuthorityGraph: HammerEditorialAuthorityGraph | null;
  outputSelection: HammerOutputSelectionState;
  selectedSegmentId: string | null;
  playheadSec: number;
  transcriptTimingHint: string | null;
};

export function buildDefaultVisualPreviewSettings(): HammerPersistedVisualPreviewSettings {
  return {
    white_balance: 0,
    color_amount: 0,
    background_blur: false,
    eye_contact_assist_enabled: false,
    eye_contact_assist_strength: 0.25,
    background_blur_px: 14,
    background_blur_feather_px: 6,
    background_blur_temporal_smoothing: 0.25,
    background_blur_subject_expansion_px: 0,
    background_blur_quality_mode: "medium",
    background_blur_fallback_mode: "disable",
    background_blur_provider: "mediapipe_selfie_segmentation",
    background_replace_enabled: false,
    background_replace_mode: "solid",
    background_replace_color: "#2b2b2b",
    background_replace_image_url: null,
    background_replace_image_asset_path: null,
    background_replace_image_asset_id: null,
    background_replace_image_asset_type: null,
    background_wash_enabled: false,
    background_wash_dim_amount: 0.35,
    background_wash_desaturate_amount: 0.25,
  };
}

export function normalizeVisualPreviewSettings(
  value: HammerPersistedVisualPreviewSettings | null | undefined,
): HammerPersistedVisualPreviewSettings {
  if (!value) {
    return buildDefaultVisualPreviewSettings();
  }
  const defaults = buildDefaultVisualPreviewSettings();
  return {
    white_balance: Math.max(-100, Math.min(100, Math.round(value.white_balance))),
    color_amount: Math.max(-100, Math.min(100, Math.round(value.color_amount))),
    background_blur: Boolean(value.background_blur),
    eye_contact_assist_enabled: Boolean(value.eye_contact_assist_enabled ?? defaults.eye_contact_assist_enabled),
    eye_contact_assist_strength: Math.max(0, Math.min(1, Number(value.eye_contact_assist_strength ?? defaults.eye_contact_assist_strength))),
    background_blur_px: Math.max(0, Math.min(64, Number(value.background_blur_px ?? defaults.background_blur_px))),
    background_blur_feather_px: Math.max(0, Math.min(64, Number(value.background_blur_feather_px ?? defaults.background_blur_feather_px))),
    background_blur_temporal_smoothing: Math.max(0, Math.min(1, Number(value.background_blur_temporal_smoothing ?? defaults.background_blur_temporal_smoothing))),
    background_blur_subject_expansion_px: Math.max(-12, Math.min(12, Number(value.background_blur_subject_expansion_px ?? defaults.background_blur_subject_expansion_px))),
    background_blur_quality_mode: value.background_blur_quality_mode === "low" || value.background_blur_quality_mode === "high"
      ? value.background_blur_quality_mode
      : "medium",
    background_blur_fallback_mode: value.background_blur_fallback_mode === "passthrough" ? "passthrough" : "disable",
    background_blur_provider: typeof value.background_blur_provider === "string" ? value.background_blur_provider : defaults.background_blur_provider,
    background_replace_enabled: Boolean(value.background_replace_enabled ?? defaults.background_replace_enabled),
    background_replace_mode: value.background_replace_mode === "image"
      ? "image"
      : value.background_replace_mode === "checkerboard"
      ? "checkerboard"
      : "solid",
    background_replace_color: typeof value.background_replace_color === "string" ? value.background_replace_color : defaults.background_replace_color,
    background_replace_image_url: typeof value.background_replace_image_url === "string" ? value.background_replace_image_url : null,
    background_replace_image_asset_path: typeof value.background_replace_image_asset_path === "string"
      ? value.background_replace_image_asset_path
      : null,
    background_replace_image_asset_id: typeof value.background_replace_image_asset_id === "string"
      ? value.background_replace_image_asset_id
      : null,
    background_replace_image_asset_type: value.background_replace_image_asset_type === "image"
      ? "image"
      : value.background_replace_image_asset_type === "other"
      ? "other"
      : null,
    background_wash_enabled: Boolean(value.background_wash_enabled ?? defaults.background_wash_enabled),
    background_wash_dim_amount: Math.max(0, Math.min(1, Number(value.background_wash_dim_amount ?? defaults.background_wash_dim_amount))),
    background_wash_desaturate_amount: Math.max(0, Math.min(1, Number(value.background_wash_desaturate_amount ?? defaults.background_wash_desaturate_amount))),
  };
}

export function toEditorState(args: HammerShellStateProjection): HammerEditorStateSerializable {
  return {
    transcriptSegments: args.segments.map((segment) => ({ ...segment })),
    visualPlacements: args.visualPlacements
      ? {
        ...args.visualPlacements,
        source_refs: [...args.visualPlacements.source_refs],
        uncertainty_flags: [...args.visualPlacements.uncertainty_flags],
        placements: args.visualPlacements.placements.map((placement) => ({
          ...placement,
          matched_segment_ids: [...placement.matched_segment_ids],
          uncertainty_flags: [...placement.uncertainty_flags],
        })),
      }
      : null,
    visualTimeline: args.visualTimeline
      ? {
        ...args.visualTimeline,
        assets: args.visualTimeline.assets.map((asset) => ({ ...asset })),
        lanes: args.visualTimeline.lanes.map((lane) => ({
          ...lane,
          clip_ids: [...lane.clip_ids],
        })),
        clips: args.visualTimeline.clips.map((clip) => ({
          ...clip,
          uncertainty_flags: [...clip.uncertainty_flags],
          geometry: { ...clip.geometry },
          animation: { ...clip.animation },
          anchor_hint: {
            ...clip.anchor_hint,
            matched_segment_ids: [...clip.anchor_hint.matched_segment_ids],
          },
        })),
      }
      : null,
    audioEdit: cloneHammerAudioEdit(args.audioEdit),
    studioRack: cloneHammerStudioRackState(args.studioRack),
    editorialAuthorityGraph: args.editorialAuthorityGraph
      ? {
        ...args.editorialAuthorityGraph,
        operation_order: [...args.editorialAuthorityGraph.operation_order],
        operations: args.editorialAuthorityGraph.operations.map((operation) => ({
          ...operation,
          instruction: { ...operation.instruction },
          capability_state: {
            ...operation.capability_state,
            reason_codes: [...operation.capability_state.reason_codes],
          },
          truth_posture: {
            preview: {
              ...operation.truth_posture.preview,
              reason_codes: [...operation.truth_posture.preview.reason_codes],
            },
            export: {
              ...operation.truth_posture.export,
              reason_codes: [...operation.truth_posture.export.reason_codes],
            },
            handoff: {
              ...operation.truth_posture.handoff,
              reason_codes: [...operation.truth_posture.handoff.reason_codes],
            },
          },
          provenance: { ...operation.provenance },
        })),
      }
      : null,
    outputSelection: {
      layerId: args.outputSelection.layerId,
      sourceRecipeRef: args.outputSelection.sourceRecipeRef,
    },
    selectedSegmentId: args.selectedSegmentId,
    playheadSec: args.playheadSec,
    transcriptTimingHint: args.transcriptTimingHint,
  };
}

export function toShellState(state: HammerEditorStateSerializable): HammerShellStateProjection {
  return {
    segments: state.transcriptSegments.map((segment) => ({ ...segment })),
    visualPlacements: state.visualTimeline
      ? deriveLegacyVisualPlacementsFromTimeline(state.visualTimeline)
      : state.visualPlacements
        ? {
          ...state.visualPlacements,
          source_refs: [...state.visualPlacements.source_refs],
          uncertainty_flags: [...state.visualPlacements.uncertainty_flags],
          placements: state.visualPlacements.placements.map((placement) => ({
            ...placement,
            matched_segment_ids: [...placement.matched_segment_ids],
            uncertainty_flags: [...placement.uncertainty_flags],
          })),
        }
        : null,
    visualTimeline: state.visualTimeline
      ? {
        ...state.visualTimeline,
        assets: state.visualTimeline.assets.map((asset) => ({ ...asset })),
        lanes: state.visualTimeline.lanes.map((lane) => ({
          ...lane,
          clip_ids: [...lane.clip_ids],
        })),
        clips: state.visualTimeline.clips.map((clip) => ({
          ...clip,
          uncertainty_flags: [...clip.uncertainty_flags],
          geometry: { ...clip.geometry },
          animation: { ...clip.animation },
          anchor_hint: {
            ...clip.anchor_hint,
            matched_segment_ids: [...clip.anchor_hint.matched_segment_ids],
          },
        })),
      }
      : null,
    audioEdit: cloneHammerAudioEdit(state.audioEdit),
    studioRack: cloneHammerStudioRackState(state.studioRack),
    editorialAuthorityGraph: state.editorialAuthorityGraph
      ? {
        ...state.editorialAuthorityGraph,
        operation_order: [...state.editorialAuthorityGraph.operation_order],
        operations: state.editorialAuthorityGraph.operations.map((operation) => ({
          ...operation,
          instruction: { ...operation.instruction },
          capability_state: {
            ...operation.capability_state,
            reason_codes: [...operation.capability_state.reason_codes],
          },
          truth_posture: {
            preview: {
              ...operation.truth_posture.preview,
              reason_codes: [...operation.truth_posture.preview.reason_codes],
            },
            export: {
              ...operation.truth_posture.export,
              reason_codes: [...operation.truth_posture.export.reason_codes],
            },
            handoff: {
              ...operation.truth_posture.handoff,
              reason_codes: [...operation.truth_posture.handoff.reason_codes],
            },
          },
          provenance: { ...operation.provenance },
        })),
      }
      : null,
    outputSelection: {
      layerId: state.outputSelection.layerId,
      sourceRecipeRef: state.outputSelection.sourceRecipeRef,
    },
    selectedSegmentId: state.selectedSegmentId,
    playheadSec: state.playheadSec,
    transcriptTimingHint: state.transcriptTimingHint,
  };
}

export function resolveOutputSelectionFromTranscript(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerOutputSelectionState {
  return normalizeHammerOutputSelectionRef({
    selection: {
      layerId: transcript?.derived_text_layers?.output_layer_id ?? null,
      sourceRecipeRef: null,
    },
    layers: listHammerDerivedTextLayers(transcript, { includeDiscarded: false }),
  });
}
