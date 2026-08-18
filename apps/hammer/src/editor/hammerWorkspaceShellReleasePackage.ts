import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchSourceMode } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import {
  cloneHammerEditorialAuthorityGraph,
  type HammerEditorialAuthorityGraph,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { createSemanticEditPlanSignature } from "../lib/editPlanSignature";
import { buildHammerCaptionPreviewModel } from "../lib/hammerCaptionPreview";
import { buildHammerReleasePrepPackage, type HammerReleasePrepPackage } from "../lib/hammerReleasePrepPackage";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
  HammerPersistedVisualPreviewSettings,
} from "../persistence/hammerPersistenceContract";
import { preserveTranscriptMetadata } from "../prep/hammerPrep";
import { cloneHammerStructuredTranscript, setHammerDerivedTextLayerOutput } from "../macros/hammerDerivedTranscriptLayers";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import {
  buildHammerRenderAssembly,
  projectEditPlanFromEditorialAuthorityGraph,
  projectEditorialAuthorityGraphFromEditPlan,
  type HammerRenderAssemblyResult,
  type HammerRenderRuntimeCapabilities,
} from "./hammerRenderAssembly";
import {
  projectHammerCaptionsForRelease,
} from "./useHammerWorkspaceShellCaptions";
import type {
  HammerCaptionBuildState,
  HammerCaptionEditedState,
  HammerCaptionFormattingState,
} from "./hammerWorkspaceShellCaptionUtils";

export const HAMMER_RELEASE_RENDER_RUNTIME_CAPABILITIES: HammerRenderRuntimeCapabilities = {
  preview_supported_operation_types: ["delete", "mute", "trim", "split", "merge", "hard_cut", "apply_look", "apply_exposure", "apply_background_effect"],
  export_supported_operation_types: [
    "delete", "mute", "trim", "split", "merge", "hard_cut", "cut_range", "ripple_delete",
    "insert_broll", "overlay_graphic", "crossfade", "dip_to_black", "fade_audio", "audio_duck",
    "apply_look", "apply_exposure",
  ],
  handoff_supported_operation_types: [
    "delete", "mute", "trim", "split", "merge", "hard_cut", "cut_range", "ripple_delete",
    "insert_broll", "overlay_graphic", "crossfade", "dip_to_black", "fade_audio", "audio_duck",
    "apply_look", "apply_exposure", "podcast_master_pass",
  ],
};

export interface HammerWorkspaceShellReleasePackageInput {
  workspaceId: string;
  workpieceId: string;
  sessionId: string | null;
  sourceMode: HammerLaunchSourceMode;
  previewMode: HammerPreviewMode;
  transcriptSourceId: string;
  editPlan: HammerEditPlan;
  transcriptSegments: HammerTranscriptSegment[];
  structuredTranscript: HammerPersistedStructuredTranscript | null;
  transcriptPreparedAt: string;
  outputSelection: { layerId: string | null; sourceRecipeRef: string | null };
  captionFormatting: HammerCaptionFormattingState;
  selectedCaptionArtifactFormat: "srt" | "vtt";
  captionBuildState: HammerCaptionBuildState | null;
  captionEditedState: HammerCaptionEditedState | null;
  editorialAuthorityGraph: HammerEditorialAuthorityGraph | null;
  canonicalGraphUpdatedAt: string;
  visualTimeline: HammerVisualTimelineState | null;
  visualPlacements: HammerPersistedVisualPlacements | null;
  audioPolish: HammerPersistedAudioPolish | null;
  selectedSegmentId: string | null;
  selectedClipId: string | null;
  mediaRef: MediaRef | null;
  workspaceMapping: WorkspaceMediaMapping | null;
  mediaSourceLabel: string | null;
  visualPreview: HammerPersistedVisualPreviewSettings;
  editorLastOpenedAt: string;
  ffmpegAvailable: boolean;
}

export interface HammerWorkspaceShellReleasePackageProjection {
  transcriptForRelease: HammerPersistedStructuredTranscript;
  currentReleasePackage: HammerReleasePrepPackage;
  timelineRevision: string;
  canonicalGraph: HammerEditorialAuthorityGraph;
  renderAssembly: HammerRenderAssemblyResult;
  subtitles: { srt: string | null; vtt: string | null };
}

export function buildHammerWorkspaceShellReleasePackage(
  input: HammerWorkspaceShellReleasePackageInput,
): HammerWorkspaceShellReleasePackageProjection {
  const exportTranscriptSegments = input.transcriptSegments
    .filter((segment) => !segment.is_disabled)
    .map((segment) => ({ ...segment }));
  let transcriptForRelease = preserveTranscriptMetadata(
    exportTranscriptSegments,
    cloneHammerStructuredTranscript(input.structuredTranscript),
    input.mediaRef,
    input.transcriptSourceId,
  );
  transcriptForRelease = {
    ...transcriptForRelease,
    prepared_at: input.transcriptPreparedAt,
  };
  transcriptForRelease = setHammerDerivedTextLayerOutput(
    transcriptForRelease,
    input.outputSelection.layerId,
  );
  const selectedLayer = transcriptForRelease.derived_text_layers?.layers.find(
    (layer) => layer.layer_id === input.outputSelection.layerId && layer.status !== "discarded",
  ) ?? null;
  if (
    selectedLayer?.macro_kind === "speaker_solo"
    || selectedLayer?.macro_kind === "speaker_interview"
    || selectedLayer?.macro_kind === "speaker_monologue"
  ) {
    const suppressedSegmentIds = new Set(
      selectedLayer.changes
        .filter((change) => change.cleaned_text.trim().length === 0)
        .map((change) => change.segment_id),
    );
    transcriptForRelease = {
      ...transcriptForRelease,
      segments: transcriptForRelease.segments.filter((segment) => !suppressedSegmentIds.has(segment.segment_id)),
    };
  }
  transcriptForRelease = projectHammerCaptionsForRelease({
    transcript: transcriptForRelease,
    outputLayerId: input.outputSelection.layerId,
    outputRecipeRef: input.outputSelection.sourceRecipeRef,
    formatting: input.captionFormatting,
    selectedFormat: input.selectedCaptionArtifactFormat,
    buildState: input.captionBuildState,
    editedState: input.captionEditedState,
  });

  const editPlan = structuredClone(input.editPlan);
  const canonicalGraph = input.editorialAuthorityGraph
    ? {
      ...cloneHammerEditorialAuthorityGraph(structuredClone(input.editorialAuthorityGraph)),
      updated_at: input.canonicalGraphUpdatedAt,
    }
    : projectEditorialAuthorityGraphFromEditPlan({
      editPlan,
      workspaceId: input.workspaceId,
      workpieceId: input.workpieceId,
      sessionId: input.sessionId ?? editPlan.session_id ?? `${input.workpieceId}:session`,
    });
  const canonicalEditPlan = projectEditPlanFromEditorialAuthorityGraph({ graph: canonicalGraph, fallback: editPlan });
  const timelineRevision = createSemanticEditPlanSignature(
    input.transcriptSourceId,
    input.previewMode,
    canonicalEditPlan.instructions,
  );
  const runtimeCapabilities: HammerRenderRuntimeCapabilities = {
    ...HAMMER_RELEASE_RENDER_RUNTIME_CAPABILITIES,
    preview_supported_operation_types: [...HAMMER_RELEASE_RENDER_RUNTIME_CAPABILITIES.preview_supported_operation_types],
    export_supported_operation_types: input.ffmpegAvailable
      ? [...HAMMER_RELEASE_RENDER_RUNTIME_CAPABILITIES.export_supported_operation_types, "podcast_master_pass"]
      : [...HAMMER_RELEASE_RENDER_RUNTIME_CAPABILITIES.export_supported_operation_types],
    handoff_supported_operation_types: [...HAMMER_RELEASE_RENDER_RUNTIME_CAPABILITIES.handoff_supported_operation_types],
    podcast_master: {
      available: input.ffmpegAvailable,
      preview_supported: false,
      stages: {
        normalize: input.ffmpegAvailable,
        compress: input.ffmpegAvailable,
        limit: input.ffmpegAvailable,
        noise_cleanup_light: input.ffmpegAvailable,
      },
    },
  };
  const renderAssembly = buildHammerRenderAssembly({
    canonicalGraph,
    runtimeCapabilities,
    transcriptSegments: transcriptForRelease.segments.map((segment) => ({
      segment_id: segment.segment_id,
      start_sec: segment.start_sec,
      end_sec: segment.end_sec,
    })),
    captionChunks: buildHammerCaptionPreviewModel(transcriptForRelease.segments, transcriptForRelease).chunks.map((chunk) => ({
      chunk_id: chunk.chunk_id,
      start_sec: chunk.start_sec,
      end_sec: chunk.end_sec,
      segment_ids: [...chunk.segment_ids],
    })),
  });
  const visualPlacements = input.visualTimeline
    ? deriveLegacyVisualPlacementsFromTimeline(input.visualTimeline)
    : input.visualPlacements;
  const currentReleasePackage = buildHammerReleasePrepPackage({
    workspaceId: input.workspaceId,
    workpieceId: input.workpieceId,
    prepStatus: transcriptForRelease.segments.length > 0 ? "prepared" : "idle",
    alignmentStatus: transcriptForRelease.segments.length > 0 ? "aligned" : "not_started",
    structuredTranscript: transcriptForRelease,
    visualPlacements,
    audioPolish: input.audioPolish,
    editorSession: {
      schema_version: 1,
      session_id: input.sessionId ?? editPlan.session_id ?? `${input.workpieceId}:session`,
      source_mode: input.sourceMode,
      preview_mode: input.previewMode,
      transcript_source_id: input.transcriptSourceId,
      selected_segment_id: input.selectedSegmentId,
      selected_overlay_row_id: input.selectedClipId,
      media_ref: input.mediaRef ? { ...input.mediaRef } : null,
      workspace_mapping: input.workspaceMapping ? { ...input.workspaceMapping } : null,
      media_source_label: input.mediaSourceLabel,
      visual_preview: { ...input.visualPreview },
      last_opened_at: input.editorLastOpenedAt,
    },
  });

  return {
    transcriptForRelease,
    currentReleasePackage,
    timelineRevision,
    canonicalGraph,
    renderAssembly,
    subtitles: {
      srt: currentReleasePackage.text_outputs?.subtitles.srt.artifact?.content ?? null,
      vtt: currentReleasePackage.text_outputs?.subtitles.vtt.artifact?.content ?? null,
    },
  };
}
