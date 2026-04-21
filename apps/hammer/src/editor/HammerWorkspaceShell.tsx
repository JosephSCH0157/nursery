import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, MouseEvent, WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";
import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerEditInstruction,
} from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import {
  cloneHammerEditorialAuthorityGraph,
  type HammerEditorialAuthorityGraph,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { createSemanticEditPlanSignature } from "../lib/editPlanSignature";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import type {
  HammerPassId,
  HammerPassStatusMap,
  HammerDerivedTextLayer,
  HammerPersistedAudioEdit,
  HammerPersistedAudioPolish,
  HammerPersistedVisualPreviewSettings,
  HammerPersistedStructuredTranscript,
  HammerVisualPlacementRecord,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import { createEmptyVisualTimelineState } from "../visuals/model/hammerVisualDefaults";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import {
  selectClipById,
  selectPrimaryActiveClipAtTime,
  selectPreviewClips,
} from "../visuals/state/hammerVisualSelectors";
import type { VisualClipBlockModel } from "../visuals/components/VisualClipBlock";
import type { VisualPreviewOverlayModel } from "../visuals/components/VisualPreviewComposer";
import type { BackgroundBlurSettings } from "../features/visual-effects/types";
import {
  SEGMENTATION_PROVIDER_DESCRIPTORS,
  resolveSegmentationProviderDescriptor,
} from "../features/visual-effects/providers/segmentationProviderRegistry";
import type { HammerPreparedNextStepActionId } from "./hammerPreparedHandoff";
import {
  DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC,
  SMALL_PLAYHEAD_NUDGE_SEC,
  moveSegmentTiming,
  resolveAdjacentSegmentSelection,
  resolvePreviewLabel,
  resolvePlayheadSegment,
  resolveTranscriptSegmentRange,
  resolveTimelineBoundaryTimes,
  roundToTenth,
  snapPlayheadToBoundary,
  trimSegmentEndTiming,
  trimSegmentStartTiming,
  updateSegmentGain,
  updateSegmentInTimeline,
  type HammerWorkspaceFocusOverride,
} from "./hammerWorkspaceTimeline";
import {
  isTimeRangeFullyCoveredByCuts,
  getEffectiveCutRegions,
  resolveNextAudiblePlaybackTime,
} from "./hammerAudioEditPlayback";
import {
  commitAudioCutSelection,
  normalizeAudioCutSelection,
} from "./hammerAudioEditOperations";
import {
  buildSilenceCutSuggestions,
  filterDismissedSilenceCutSuggestions,
} from "./hammerSilenceCutSuggestions";
import {
  deriveAudioCutsForDeadAirClosure,
  type HammerAudioCutSelection,
  deriveAudioCutsForSubtractiveTextEdits,
} from "./hammerCleanupExecution";
import {
  applyTranscriptCleanupPreviewComposition,
  applyTranscriptDeleteRangeComposition,
  applyTranscriptSplitComposition,
  applyTranscriptTrimSegmentComposition,
  applyTranscriptToggleMuteSegmentsComposition,
  type HammerAuthorityOp,
} from "./hammerCompositionMutations";
import {
  deriveDeleteOnlyTranscriptCutSelection,
  resolveDeleteOnlyTranscriptDeletion,
  type HammerDeleteOnlyTranscriptDeletion,
} from "./hammerDeleteOnlyTranscriptEditing";
import {
  resolveSelectedSegmentId,
  resolveTranscriptDurationSec,
  syncEditableTranscriptSegments,
  updateTranscriptSegmentSpeaker,
} from "./hammerWorkspaceTranscript";
import {
  previewQuickClean,
  previewRemoveFillers,
  previewRemoveRetakes,
  previewSpeakerMonologue,
  previewSpeakerPanel,
  previewSpeakerInterview,
  previewSpeakerSolo,
  previewShortenGaps,
  type HammerCleanupPreview,
  type RetakeCleanupOptions,
  type FillerCleanupOptions,
  type GapCleanupOptions,
  type SpeakerMonologueOptions,
  type SpeakerPanelOptions,
  type SpeakerInterviewOptions,
  type SpeakerSoloOptions,
} from "./hammerCleanupTools";
import { analyzeDeadAirGaps, applyDeadAirClosure, type HammerDeadAirAnalysis } from "./hammerDeadAirClosure";
import { requestHammerTranscriptCleanupAssist } from "./hammerTranscriptCleanupAssistApi";
import {
  buildPolishResultSummaryFromCleanupPreview,
  type HammerPolishResultSummary,
} from "./PolishResultSummary";
import {
  cloneEditorState,
  type HammerEditorStateSerializable,
  type HammerHistoryController,
  type HammerHistoryEntry,
  type HammerHistoryKind,
  type HammerOutputSelectionState,
} from "./hammerWorkspaceHistory";
import {
  appendHammerDerivedTextLayer,
  cloneHammerDerivedTextLayers,
  createHammerDerivedTextLayer,
  listHammerDerivedTextLayers,
  normalizeHammerOutputSelectionRef,
  setHammerDerivedTextLayerActive,
  setHammerDerivedTextLayerOutput,
} from "../macros/hammerDerivedTranscriptLayers";
import {
  saveHammerHistoryDocument,
  saveHammerRevisionHistoryDocument,
} from "../lib/hammerHistoryArtifactApi";
import { diffWords, isSubtractiveTranscriptWordEdit } from "../lib/hammerWordDiff";
import {
  buildCandidateQueue,
  clampActiveCandidateIndex,
  type HammerCandidateCard,
  type HammerCandidateReviewKind,
} from "./hammerCandidateQueue";
import { buildHammerMediaPrepOutputsPackage } from "../lib/hammerMediaPrepOutputsPackage";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import {
  deriveStableHammerVisualAssetId,
  migrateLegacyPlacementRecordToAsset,
  migrateLegacyPlacementRecordToClip,
  migrateLegacyPlacementRecordsToTimelineState,
} from "../visuals/model/hammerVisualMigrations";
import { hammerVisualTimelineReducer } from "../visuals/state/hammerVisualReducer";
import {
  saveHammerSnapshotManifest,
  saveHammerSnapshotPayload,
  type HammerSnapshotManifestV1,
} from "../lib/hammerSnapshotArtifactApi";
import {
  buildHammerHistorySnapshot,
  resolveActiveSnapshotHeadEntryId,
  shouldCreateHammerSnapshot,
  upsertHammerSnapshotManifest,
} from "./hammerSnapshotProduction";
import { type HammerStoredMediaFile } from "../lib/hammerSourceDeskMediaApi";
import {
  buildIntroOutroCandidateItems,
  buildIntroOutroCandidateItemsById,
} from "./hammerIntroOutroState";
import {
  activeMediaTimeToTransportTime,
  compositionTimeToTransportTime,
  isIntroOutroPackagingClip,
  resolvePackagingClipDurationSec,
  resolvePackagingTransport,
  shiftCompositionWindowToTransport,
  transportTimeToActiveMediaTime,
} from "./hammerPackagingTransport";
import {
  buildLinkedSelectionTranscriptSegmentIdSet,
  buildLinkedSelectionVisualIdSet,
  resolveSelectionFromTranscript,
  resolveSelectionFromVisual,
  type HammerLinkedSelection,
} from "./hammerLinkedSelection";
import {
  SCRUB_RATE_OPTIONS,
  SCRUB_SEEK_THRESHOLD_SEC,
  type HammerPlaybackTargetRange,
  type HammerPlaybackWindow,
  type HammerScrubRate,
  type HammerTimelineMarker,
} from "./hammerWorkspaceShellPlaybackUtils";
import { useHammerWorkspaceShellPlayback } from "./useHammerWorkspaceShellPlayback";
import { useHammerWorkspaceShellShortcuts } from "./useHammerWorkspaceShellShortcuts";
import { useHammerWorkspaceShellSelection } from "./useHammerWorkspaceShellSelection";
import { useHammerWorkspaceShellSourceDeskController } from "./useHammerWorkspaceShellSourceDeskController";
import { useHammerWorkspaceShellPreviewRuntime } from "./useHammerWorkspaceShellPreviewRuntime";
import { useHammerWorkspaceShellVisualEditing } from "./useHammerWorkspaceShellVisualEditing";
import {
  toHammerLinkedSelectionVisualItems,
  type HammerSelectedTranscriptRange,
  type HammerSelectedTranscriptRangeDetail,
} from "./hammerWorkspaceShellSelectionUtils";
import {
  cloneHammerStudioRackState,
  createDefaultHammerStudioRackState,
  isHammerStudioRackIdentity,
  normalizeHammerStudioRackState,
  type HammerStudioRackState,
} from "./hammerStudioRack";
import {
  applyHammerVoicePolishPreset,
  createDefaultHammerVoicePolishState,
  setHammerVoicePolishDeEsserStrength,
  setHammerVoicePolishEqProfile,
  setHammerVoicePolishFixEnabled,
  type HammerVoicePolishDeEsserStrength,
  type HammerVoicePolishEqProfile,
  type HammerVoicePolishFixId,
  type HammerVoicePolishPresetId,
} from "./hammerVoicePolish";
import {
  executeDialogueAudioRenderWithBackend,
  processDialogueAudioWithBackend,
  resolveHammerAudioProcessingBackend,
  type HammerDialogueRenderExecutionResult,
} from "./hammerAudioProcessingBackend";
import { buildHammerMediaBackboneRuntimeSummary } from "../media/hammerMediaBackbone";
import { preserveTranscriptMetadata } from "../prep/hammerPrep";
import {
  clampImagePlacementTransform,
  clampNumber,
  createVisualPlacementId,
  DEFAULT_VISUAL_PLACEMENT_GEOMETRY,
  DEFAULT_IMAGE_PLACEMENT_TRANSFORM,
  geometryToTransform,
  IMAGE_ANIMATION_PRESET_OPTIONS,
  LOGO_POSITION_OPTIONS,
  LOGO_SIZE_OPTIONS,
  MIN_IMAGE_PLACEMENT_DURATION_SEC,
  PACKAGING_INTRO_ENTRY_ID,
  PACKAGING_LOGO_ENTRY_ID,
  PACKAGING_OUTRO_ENTRY_ID,
  resolveImageAnimationClass,
  resolvePlacementAnimationPreset,
  resolvePlacementGeometry,
} from "./hammerWorkspaceShellVisualUtils";
import {
  buildNotStartedHammerAudioPolish,
  cloneHammerAudioEdit,
  cloneHammerAudioPolish,
} from "../prep/hammerAudioPolish";
import { buildHammerReleasePrepPackage } from "../lib/hammerReleasePrepPackage";
import {
  HAMMER_PREPARED_RELEASE_PACKAGE_PATH,
  buildHammerPreparedReleasePackage,
  compareHammerPreparedReleasePackageToCurrent,
  type HammerPreparedReleasePackage,
  type HammerPreparedReleaseOverallStatus,
} from "../lib/hammerPreparedReleasePackage";
import {
  loadHammerPreparedReleasePackage,
  saveHammerPreparedReleasePackage,
} from "../lib/hammerPreparedReleasePackageApi";
import { loadHammerWorkspaceWorkpieceLabel } from "../app/hammerRuntimeData";
import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
  buildHammerQuenchReleasePacket,
} from "../lib/hammerQuenchReleasePacket";
import { deriveHammerReleaseHandoffPosture } from "../lib/hammerReleaseHandoffPosture";
import { saveHammerQuenchReleasePacket } from "../lib/hammerQuenchReleasePacketApi";
import {
  buildHammerRenderAssembly,
  projectEditPlanFromEditorialAuthorityGraph,
  projectEditorialAuthorityGraphFromEditPlan,
  type HammerRenderRuntimeCapabilities,
} from "./hammerRenderAssembly";
import {
  deriveHammerBoundAttentionQueue,
  deriveHammerBoundObjects,
  type HammerBoundAttentionQueueItem,
  type HammerBoundObject,
} from "./hammerBoundObjects";
import { resolvePodcastMasterUiStatus } from "./hammerPodcastMasterStatus";
import { evaluateHammerReadinessGate } from "./hammerReadinessGate";
import {
  decideHammerQuenchHandoff,
  type HammerQuenchHandoffStatus,
  validateHammerQuenchPacketForHandoff,
} from "./hammerQuenchHandoff";
import {
  canEnterPass,
  deriveHydratedPassStatus,
  getPassBlockedReason,
  getPassStatus,
  summarizePassStatuses,
  type HammerPassDerivedStatus,
  type HammerPassSelectorContext,
  type HammerPassSelectorResult,
} from "./hammerPassSelectors";
import {
  appendAuthorityInstructionToGraph,
  createApplyExposureInstruction,
  createAudioDuckInstruction,
  createApplyLookInstruction,
  createCrossfadeInstruction,
  createDipToBlackInstruction,
  createFadeAudioInstruction,
  createHardCutInstruction,
  createPodcastMasterPassInstruction,
  resolveInsertBrollSuggestionInGraph,
  setAuthorityOperationLifecycle,
  synchronizeLinkedAudioDuckForBrollOperation,
  updateResolvedInsertBrollOperationInGraph,
} from "./hammerAuthorityOps";
import {
  buildHammerCaptionPreviewModel,
} from "../lib/hammerCaptionPreview";
import HammerWorkspaceShellToolbar, { type HammerWorkspaceShellToolbarPassVM } from "./HammerWorkspaceShellToolbar";
import HammerWorkspaceShellPreviewBay from "./HammerWorkspaceShellPreviewBay";
import HammerWorkspaceShellTimelineDock from "./HammerWorkspaceShellTimelineDock";
import HammerWorkspaceShellSourceBay from "./HammerWorkspaceShellSourceBay";
import HammerWorkspaceShellToolBay from "./HammerWorkspaceShellToolBay";
import { useHammerWorkspaceShellHistoryController } from "./hammerWorkspaceShellHistoryController";
import { useHammerWorkspaceShellSnapshotEmitter } from "./hammerWorkspaceShellSnapshotEmitter";
import {
  buildCaptionBasisFingerprint,
  buildCaptionChunksFromPreview,
  countChangedCaptionBlocks,
  normalizeCaptionPunctuation,
  rebuildCaptionArtifactsFromChunks,
  renderBuiltSrt,
  renderBuiltVtt,
  type HammerCaptionArtifactMode,
  type HammerCaptionBuildState,
  type HammerCaptionBuiltChunk,
  type HammerCaptionEditedState,
  type HammerCaptionFormattingState,
} from "./hammerWorkspaceShellCaptionUtils";
import {
  PASS_ORDER,
  SOURCE_TABS,
  editorModeToSourceTab,
  editorModeToToolSelection,
  editorModeToVisualTool,
  isHammerModeRoutingDebugEnabled,
  isHammerVisualSelectionDebugEnabled,
  normalizePassStatus,
  resolveEditorModeFromPass,
  resolveEditorModeFromSourceTab,
  resolveInitialPassId,
  resolvePassMeta,
  resolveRepresentativePassForEditorMode,
  stableHashToken,
  type HammerEditorMode,
  type HammerSourceTabId,
  type HammerVideoPanelRoute,
  type HammerVisualLutPreset,
  type HammerVisualToolRackId,
} from "./hammerWorkspaceShellCore";
import {
  normalizeVisualPreviewSettings,
  resolveOutputSelectionFromTranscript,
  toEditorState,
  toShellState,
} from "./hammerWorkspaceShellStateAdapters";
import "./HammerWorkspaceShell.css";

const HISTORY_MAX_SIZE = 100;
const HISTORY_PERSIST_DEBOUNCE_MS = 900;
const TEXT_EDIT_COALESCE_MS = 1500;
const PLAYHEAD_SNAP_TOLERANCE_SEC = DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC;

function appendUniquePaths(target: string[], candidates: Array<string | null | undefined>): string[] {
  const seen = new Set(target);
  for (const candidate of candidates) {
    const next = typeof candidate === "string" ? candidate.trim() : "";
    if (!next || seen.has(next)) continue;
    seen.add(next);
    target.push(next);
  }
  return target;
}
const TIMELINE_ZOOM_LEVELS = [100, 125, 150, 200, 300] as const;
const CAPTION_MIN_BLOCK_DURATION_SEC = 0.05;
const HAMMER_RENDER_RUNTIME_CAPABILITIES: HammerRenderRuntimeCapabilities = {
  preview_supported_operation_types: ["delete", "mute", "trim", "split", "merge", "hard_cut", "apply_look", "apply_exposure", "apply_background_effect"],
  export_supported_operation_types: [
    "delete",
    "mute",
    "trim",
    "split",
    "merge",
    "hard_cut",
    "cut_range",
    "ripple_delete",
    "insert_broll",
    "overlay_graphic",
    "crossfade",
    "dip_to_black",
    "fade_audio",
    "audio_duck",
    "apply_look",
    "apply_exposure",
  ],
  handoff_supported_operation_types: [
    "delete",
    "mute",
    "trim",
    "split",
    "merge",
    "hard_cut",
    "cut_range",
    "ripple_delete",
    "insert_broll",
    "overlay_graphic",
    "crossfade",
    "dip_to_black",
    "fade_audio",
    "audio_duck",
    "apply_look",
    "apply_exposure",
    "podcast_master_pass",
  ],
};

type HammerWorkspaceShellProps = {
  launchContext?: HammerLaunchContext;
  recordingRevisionId?: string | null;
  structuredTranscript?: HammerPersistedStructuredTranscript | null;
  editorialAuthorityGraph?: HammerEditorialAuthorityGraph | null;
  visualPlacements?: HammerPersistedVisualPlacements | null;
  visualTimeline?: HammerVisualTimelineState | null;
  audioPolish?: HammerPersistedAudioPolish | null;
  initialVisualPreviewSettings?: HammerPersistedVisualPreviewSettings | null;
  initialCurrentPass?: HammerPassId;
  initialSelectedSegmentId?: string | null;
  initialSelectedOverlayRowId?: string | null;
  releasePrepHref?: string | null;
  selectedMacroRecipeRef?: string | null;
  lastMacroRunRef?: string | null;
  prepHandoffAction?: {
    id: Exclude<HammerPreparedNextStepActionId, "export_later">;
    token: number;
  } | null;
  aiInUse?: boolean;
  resetToRawInFlight?: boolean;
  resetToRawError?: string | null;
  onRequestResetToRaw?: () => void;
  onRequestRegenerateAiTranscript?: () => void;
  regenerateAiTranscriptDisabled?: boolean;
  onHistoryRecoveryStatusChange?: (status: string | null) => void;
  onWorkspaceSnapshotChange?: (
    snapshot: HammerWorkspaceSnapshot,
    options?: { persistNow?: boolean },
  ) => void;
};

function resolveActiveLookPreset(
  graph: HammerEditorialAuthorityGraph | null | undefined,
): HammerVisualLutPreset | null {
  const operation = (graph?.operations ?? []).find((candidate) => (
    candidate.lifecycle === "active" && candidate.instruction.type === "apply_look"
  )) ?? null;
  return operation?.instruction.type === "apply_look" ? operation.instruction.preset : null;
}

function resolveActiveExposureAdjustment(
  graph: HammerEditorialAuthorityGraph | null | undefined,
): number | null {
  const operation = (graph?.operations ?? []).find((candidate) => (
    candidate.lifecycle === "active" && candidate.instruction.type === "apply_exposure"
  )) ?? null;
  return operation?.instruction.type === "apply_exposure" ? operation.instruction.exposure : null;
}

type HammerSourceImageItem = {
  id: string;
  label: string;
  kind: "image" | "broll" | "reference_clip";
  anchorSegmentId: string;
  anchorText: string | null;
  anchorLabel: string | null;
  startSec: number;
  endSec: number;
  status: "placed" | "uncertain";
  confidence: number | null;
  visualMode: string | null;
  assetPath: string | null;
};

type HammerSourceAssetKind = "image" | "broll" | "reference_clip" | "audio" | "other";

type HammerSourceAssetItem = {
  id: string;
  label: string;
  kind: HammerSourceAssetKind;
  assetPath: string | null;
  visualMode: string | null;
  usageCount: number;
  firstStartSec: number;
  lastEndSec: number;
};

type HammerMediaMapSuggestionType = "broll" | "reference_clip";

type HammerMediaMapBeat = {
  id: string;
  segmentId: string;
  sourceText: string;
  suggestedType: HammerMediaMapSuggestionType;
  selectedType: HammerMediaMapSuggestionType;
  reason: string;
  tweak: string;
  linkedPlacementId: string | null;
};

type HammerBrollSuggestionItem = {
  operationId: string;
  segmentId: string;
  startSec: number;
  endSec: number;
  assetRef: string;
  intentRef: string | null;
  intentDescription: string | null;
  bindingState: "resolved" | "unresolved";
  duckPreference: "auto" | "none" | "manual";
};

type HammerResolvedBrollBindingItem = HammerBrollSuggestionItem & {
  bindingState: "resolved";
  assetRef: string;
  linkedPlacementId: string | null;
};

type HammerBoundBrollInspectorState = {
  operationId: string;
  lifecycle: "active" | "reverted" | "superseded";
  intentSource: "manual" | "hearth_suggestion";
  intentDescription: string | null;
  bindingState: "resolved" | "unresolved";
  startSec: number;
  endSec: number;
  assetRef: string;
  previewPosture: "authoritative" | "degraded" | "unavailable";
  exportPosture: "authoritative" | "degraded" | "unavailable";
  handoffPosture: "authoritative" | "degraded" | "unavailable";
  needsAttention: boolean;
  attentionFlags: string[];
  linkedDuck: {
    operationId: string;
    startSec: number;
    endSec: number;
    aligned: boolean;
    capability: "executable" | "degraded" | "unavailable";
    needsAttention: boolean;
  } | null;
};

type HammerBoundAttentionItem = {
  operationId: string;
  kind: "unresolved_suggestion" | "degraded_binding" | "superseded_binding" | "transition_attention";
  label: string;
  reasons: string[];
};

type HammerTimelineLaneBlock = {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  placementId?: string;
  selected: boolean;
  inRange?: boolean;
  disabled?: boolean;
  tone: "dialogue" | "image" | "broll";
  onSelect: () => void;
};

type HammerAudioFinalizationCompareMode = "before" | "after";

type HammerTimelineLaneView = {
  id: string;
  label: string;
  tone: "dialogue" | "music" | "broll" | "stills";
  blocks: HammerTimelineLaneBlock[];
};

type HammerReleasePrepSaveState = {
  preparedAt: string;
  overallStatus: HammerPreparedReleaseOverallStatus;
  subtitleArtifactCount: number;
};

type HammerExportTruthState = "never_prepared" | "current" | "stale";
type DerivedLayerHistoryTransition = {
  before: HammerPersistedStructuredTranscript["derived_text_layers"];
  after: HammerPersistedStructuredTranscript["derived_text_layers"];
  layerLabel: string;
};

function readTranscriptSegments(
  launchContext: HammerLaunchContext,
  structuredTranscript: HammerPersistedStructuredTranscript | null,
): HammerTranscriptSegment[] {
  if (structuredTranscript?.segments?.length) {
    return structuredTranscript.segments.map((segment) => ({ ...segment }));
  }

  if (launchContext.transcript.kind === "tongs-stub") {
    return launchContext.transcript.segments.map((segment) => ({ ...segment }));
  }

  return [];
}

function resolveMediaRef(launchContext: HammerLaunchContext): MediaRef | null {
  if (launchContext.media.kind === "mapped-local" || launchContext.media.kind === "tongs-stub") {
    return { ...launchContext.media.ref };
  }
  return null;
}

function resolveWorkspaceMapping(launchContext: HammerLaunchContext): WorkspaceMediaMapping | null {
  if (launchContext.media.kind === "tongs-stub") {
    return launchContext.media.workspace_mapping ? { ...launchContext.media.workspace_mapping } : null;
  }
  return null;
}

function createFallbackEditPlan(
  launchContext: HammerLaunchContext,
  transcriptSourceId: string,
  previewMode: HammerPreviewMode,
): HammerEditPlan {
  const now = new Date().toISOString();
  const sessionId = launchContext.session_id ?? `${launchContext.workpiece_id}:session`;
  return {
    edit_plan_id: `${launchContext.workpiece_id}:plan`,
    version: "1",
    created_at: now,
    updated_at: now,
    source_transcript_id: transcriptSourceId,
    instructions: [],
    preview_mode: previewMode,
    workspace_id: launchContext.workspace_id,
    workpiece_id: launchContext.workpiece_id,
    session_id: sessionId,
  };
}

function deriveAssetKind(args: {
  visualMode: string | null;
  assetPath: string | null;
}): HammerSourceAssetKind {
  const mode = (args.visualMode ?? "").toLowerCase();
  const path = (args.assetPath ?? "").toLowerCase();
  if (mode.includes("reference_clip") || mode.includes("contextual_data_composite") || mode.includes("cdc")) {
    return "reference_clip";
  }
  if (mode.includes("broll") || path.includes("broll")) return "broll";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".gif")) {
    return "image";
  }
  if (path.endsWith(".mp4") || path.endsWith(".mov") || path.endsWith(".m4v") || path.endsWith(".webm")) {
    return "broll";
  }
  if (path.endsWith(".wav") || path.endsWith(".mp3") || path.endsWith(".aac") || path.endsWith(".m4a")) {
    return "audio";
  }
  return "other";
}

function inferPlaybackMimeTypeFromPath(args: {
  path: string;
  kind: MediaRef["kind"];
}): string {
  const normalized = args.path.toLowerCase();
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".m4v")) return "video/x-m4v";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".webm")) return "video/webm";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".wav")) return "audio/wav";
  if (normalized.endsWith(".aac")) return "audio/aac";
  if (normalized.endsWith(".m4a")) return "audio/mp4";

  if (args.kind === "recording_audio" || args.kind === "export_audio" || args.kind === "asset_audio") {
    return "audio/mpeg";
  }
  if (args.kind === "recording_video" || args.kind === "export_video" || args.kind === "asset_broll") {
    return "video/mp4";
  }
  return "application/octet-stream";
}

const NUMERIC_SIGNAL_RE = /\b(\d+([.,]\d+)?%?|\d{4}|increase|decrease|up|down|trend|timeline|year|month|week|compared|versus|vs\.?)\b/i;
const MOTION_SIGNAL_RE = /\b(move|moving|walk|walking|run|running|drive|driving|enter|entering|exit|transition|story|journey|reveal|show|follow)\b/i;

function resolveMediaMapSuggestionType(text: string): {
  type: HammerMediaMapSuggestionType;
  reason: string;
} {
  if (NUMERIC_SIGNAL_RE.test(text)) {
    return { type: "reference_clip", reason: "numbers detected" };
  }
  if (MOTION_SIGNAL_RE.test(text)) {
    return { type: "broll", reason: "motion detected" };
  }
  return { type: "broll", reason: "story context detected" };
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasTranscriptSegmentChanged(
  previous: HammerTranscriptSegment | undefined,
  next: HammerTranscriptSegment,
): boolean {
  if (!previous) return true;
  return previous.speaker !== next.speaker
    || previous.text !== next.text
    || previous.start_sec !== next.start_sec
    || previous.end_sec !== next.end_sec;
}

function isSourceDeskAuthMessage(message: string | null): boolean {
  if (!message) return false;
  return /(auth|session|token|sign[ -]?in|unauthorized|forbidden)/i.test(message);
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function normalizeLabelForComparison(value: string | null | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSystemMediaLabel(value: string | null | undefined): boolean {
  const raw = value?.trim() ?? "";
  if (!raw) return true;
  return raw.startsWith("tongs:")
    || raw.includes("/")
    || raw.includes("\\");
}

function isSubtractiveTranscriptEdit(previousText: string, nextText: string): boolean {
  return isSubtractiveTranscriptWordEdit(previousText, nextText);
}

function resolveVisualPresetFilter(preset: HammerVisualLutPreset): string {
  switch (preset) {
    case "clean_daylight":
      return "contrast(1.03) saturate(1.05)";
    case "warm_studio":
      return "sepia(0.08) saturate(1.08)";
    case "cool_evening":
      return "hue-rotate(-8deg) saturate(0.95) contrast(1.02)";
    case "high_contrast":
      return "contrast(1.12) saturate(1.04)";
    case "soft_documentary":
      return "brightness(1.02) contrast(0.96) saturate(0.92)";
    case "neutral":
    default:
      return "none";
  }
}

function formatOutputLayerLabelFromRecipeRef(recipeRef: string): string {
  const recipe = recipeRef.trim() || "derived";
  if (recipe.startsWith("speaker_solo:")) {
    const speaker = recipe.split(":", 2)[1]?.trim().toUpperCase() || "Speaker";
    return `Solo Mode - ${speaker}`;
  }
  if (recipe.startsWith("speaker_interview:")) {
    const pair = recipe.split(":", 2)[1] ?? "";
    const [host, respondent] = pair.split("->").map((item) => item.trim().toUpperCase());
    if (host && respondent) {
      return `Interview Mode - ${host} -> ${respondent}`;
    }
    return "Interview Mode";
  }
  if (recipe.startsWith("speaker_monologue:")) {
    const speaker = recipe.split(":", 2)[1]?.trim().toUpperCase() || "Speaker";
    return `Monologue Cleanup - ${speaker}`;
  }
  if (recipe.startsWith("speaker_panel:")) {
    const bias = recipe.split(":", 2)[1]?.trim();
    if (bias === "host_favoring") return "Panel Mode - Host favoring";
    if (bias === "none") return "Panel Mode - No bias";
    return "Panel Mode";
  }
  return `${recipe} output`;
}

function formatOutputLayerLabel(layer: HammerDerivedTextLayer): string {
  return formatOutputLayerLabelFromRecipeRef(layer.recipe_ref);
}

function compactHistoryActionLabel(label: string | null): string {
  if (!label) return "";
  const trimmed = label.trim();
  if (trimmed.length <= 28) return trimmed;
  return `${trimmed.slice(0, 25)}...`;
}

function formatHistoryTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleTimeString();
}

function formatHistoryEntryScope(entry: HammerHistoryEntry): string {
  const segmentCount = entry.affectedSegmentIds?.length ?? 0;
  const placementCount = entry.affectedPlacementIds?.length ?? 0;
  if (segmentCount > 0 && placementCount > 0) {
    return `${segmentCount} segment${segmentCount === 1 ? "" : "s"}, ${placementCount} placement${placementCount === 1 ? "" : "s"}`;
  }
  if (segmentCount > 0) {
    return `${segmentCount} segment${segmentCount === 1 ? "" : "s"}`;
  }
  if (placementCount > 0) {
    return `${placementCount} placement${placementCount === 1 ? "" : "s"}`;
  }
  return "workspace state";
}

function formatStudioRackModuleLabel(moduleId: string): string {
  if (moduleId === "eq") return "Parametric EQ";
  if (moduleId === "reverb") return "Reverb";
  if (moduleId === "tubeMicCharacter") return "Tube Mic Character";
  if (moduleId === "gate") return "Gate";
  if (moduleId === "compressor") return "Compressor";
  return moduleId;
}

function buildPreparedPackageIdentityFingerprint(pkg: HammerPreparedReleasePackage): string {
  const basis = [
    `v:${String(pkg.version)}`,
    `ws:${pkg.workspaceId ?? ""}`,
    `wp:${pkg.workpieceId}`,
    `at:${pkg.preparedAt}`,
    `ts:${pkg.transcript.fingerprint ?? ""}`,
    `srt:${pkg.subtitles.srt.fingerprint ?? ""}`,
    `vtt:${pkg.subtitles.vtt.fingerprint ?? ""}`,
    `m:${pkg.media.fingerprint ?? ""}`,
    `tl:${pkg.provenance.timelineRevision ?? ""}`,
  ].join("|");
  return `hppkg:${stableHashToken(basis)}`;
}

function resolveLaneGaps(blocks: HammerTimelineLaneBlock[], durationSec: number): Array<{ id: string; startSec: number; endSec: number }> {
  const sorted = [...blocks]
    .map((block) => ({
      startSec: Math.max(0, Math.min(durationSec, block.startSec)),
      endSec: Math.max(0, Math.min(durationSec, block.endSec)),
    }))
    .filter((block) => block.endSec > block.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  const gaps: Array<{ id: string; startSec: number; endSec: number }> = [];
  let cursor = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const block = sorted[index];
    if (block.startSec > cursor) {
      gaps.push({
        id: `gap-${index}-${cursor.toFixed(2)}-${block.startSec.toFixed(2)}`,
        startSec: cursor,
        endSec: block.startSec,
      });
    }
    cursor = Math.max(cursor, block.endSec);
  }
  if (cursor < durationSec) {
    gaps.push({
      id: `gap-tail-${cursor.toFixed(2)}-${durationSec.toFixed(2)}`,
      startSec: cursor,
      endSec: durationSec,
    });
  }
  return gaps;
}

export default function HammerWorkspaceShell(props: HammerWorkspaceShellProps): JSX.Element {
  if (!props.launchContext) {
    return (
      <section className="hammer-workspace-shell__missing-context">
        <h2>Hammer needs a workpiece context.</h2>
        <p>Select a workpiece from the Hammer library to open the workspace shell.</p>
      </section>
    );
  }

  return <HammerWorkspaceShellWithContext {...props} launchContext={props.launchContext} />;
}

function HammerWorkspaceShellWithContext(
  props: HammerWorkspaceShellProps & { launchContext: HammerLaunchContext },
): JSX.Element {
  const launchContext = props.launchContext;
  const structuredTranscriptResetKey = useMemo(() => {
    const transcript = props.structuredTranscript;
    if (!transcript) return "structured-transcript:none";
    return `structured-transcript:${stableHashToken(JSON.stringify({
      transcriptId: transcript.transcript_id,
      preparedAt: transcript.prepared_at,
      mediaSignature: transcript.media_signature,
      segmentCount: transcript.segments.length,
      segments: transcript.segments.map((segment) => ({
        id: segment.segment_id,
        speaker: segment.speaker,
        text: segment.text,
        start: segment.start_sec,
        end: segment.end_sec,
        disabled: segment.is_disabled === true,
      })),
      derivedTextLayers: transcript.derived_text_layers
        ? {
          activeLayerId: transcript.derived_text_layers.active_layer_id ?? null,
          outputLayerId: transcript.derived_text_layers.output_layer_id ?? null,
          layerIds: transcript.derived_text_layers.layers.map((layer) => layer.layer_id),
        }
        : null,
    }))}`;
  }, [props.structuredTranscript]);
  const visualTimelineResetKey = useMemo(() => {
    const timeline = props.visualTimeline;
    if (!timeline) return "visual-timeline:none";
    return `visual-timeline:${stableHashToken(JSON.stringify({
      revision: timeline.revision,
      updatedAt: timeline.updated_at,
      selectedClipId: timeline.selected_clip_id,
      clipCount: timeline.clips.length,
      assetCount: timeline.assets.length,
      clipIds: timeline.clips.map((clip) => clip.clip_id),
    }))}`;
  }, [props.visualTimeline]);
  const transcriptSegments = useMemo(
    () => readTranscriptSegments(launchContext, props.structuredTranscript ?? null),
    [launchContext.transcript, structuredTranscriptResetKey],
  );
  const transcriptSourceId = props.structuredTranscript?.transcript_id
    ?? (launchContext.transcript.kind === "tongs-stub" ? launchContext.transcript.transcript_id : "runtime-transcript");

  const initialCurrentPass = resolveInitialPassId(props.initialCurrentPass);
  const [currentPass, setCurrentPass] = useState<HammerPassId>(initialCurrentPass);
  const [passStatus, setPassStatus] = useState<HammerPassStatusMap>(() => deriveHydratedPassStatus(initialCurrentPass));
  const [editorMode, setEditorMode] = useState<HammerEditorMode>(() => resolveEditorModeFromPass(initialCurrentPass));
  const [selectedBoundBrollOperationId, setSelectedBoundBrollOperationId] = useState<string | null>(null);
  const [editableDerivedTextLayers, setEditableDerivedTextLayers] = useState<
    HammerPersistedStructuredTranscript["derived_text_layers"]
  >(() => cloneHammerDerivedTextLayers(props.structuredTranscript?.derived_text_layers));
  const [editableTranscriptSegments, setEditableTranscriptSegments] = useState<HammerTranscriptSegment[]>(
    () => transcriptSegments,
  );
  const [editableVisualTimeline, setEditableVisualTimeline] = useState<HammerVisualTimelineState | null>(
    () => props.visualTimeline ?? null,
  );
  const [editableOutputSelection, setEditableOutputSelection] = useState<HammerOutputSelectionState>(
    () => resolveOutputSelectionFromTranscript(props.structuredTranscript ?? null),
  );
  const [editableEditorialAuthorityGraph, setEditableEditorialAuthorityGraph] = useState<HammerEditorialAuthorityGraph | null>(
    () => {
      if (props.editorialAuthorityGraph) {
        return cloneHammerEditorialAuthorityGraph(props.editorialAuthorityGraph);
      }
      const initialPreviewMode: HammerPreviewMode = launchContext.preview_mode ?? launchContext.edit_plan?.preview_mode ?? "edit-aware";
      const editPlan = launchContext.edit_plan
        ? {
          ...launchContext.edit_plan,
          instructions: launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
        }
        : createFallbackEditPlan(launchContext, transcriptSourceId, initialPreviewMode);
      return projectEditorialAuthorityGraphFromEditPlan({
        editPlan,
        workspaceId: launchContext.workspace_id,
        workpieceId: launchContext.workpiece_id,
        sessionId: launchContext.session_id ?? editPlan.session_id ?? `${launchContext.workpiece_id}:session`,
      });
    },
  );
  const [editableStudioRack, setEditableStudioRack] = useState<HammerStudioRackState>(
    () => createDefaultHammerStudioRackState(),
  );
  const [studioRackOpen, setStudioRackOpen] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    resolveSelectedSegmentId(transcriptSegments, props.initialSelectedSegmentId ?? null),
  );
  const [transcriptSelectionAnchorSegmentId, setTranscriptSelectionAnchorSegmentId] = useState<string | null>(
    resolveSelectedSegmentId(transcriptSegments, props.initialSelectedSegmentId ?? null),
  );
  const [transcriptSelectionFocusSegmentId, setTranscriptSelectionFocusSegmentId] = useState<string | null>(
    resolveSelectedSegmentId(transcriptSegments, props.initialSelectedSegmentId ?? null),
  );
  const [playheadSec, setPlayheadSec] = useState(0);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [playbackWindow, setPlaybackWindow] = useState<HammerPlaybackWindow | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [timelineMarkers, setTimelineMarkers] = useState<HammerTimelineMarker[]>([]);
  const [scrubRate, setScrubRate] = useState<HammerScrubRate>(1);
  const [timelineZoomPercent, setTimelineZoomPercent] = useState<number>(TIMELINE_ZOOM_LEVELS[0]);
  const [focusOverride, setFocusOverride] = useState<HammerWorkspaceFocusOverride>("auto");
  const [polishStrength, setPolishStrength] = useState(60);
  const [gapCleanupOptions, setGapCleanupOptions] = useState<GapCleanupOptions>({
    maxGapSec: 0.4,
    minPauseSec: 0.1,
    preserveDramaticPauses: true,
  });
  const [deadAirThresholdSec, setDeadAirThresholdSec] = useState(1.5);
  const [deadAirAnalysis, setDeadAirAnalysis] = useState<HammerDeadAirAnalysis | null>(null);
  const [deadAirApplyInFlight, setDeadAirApplyInFlight] = useState(false);
  const [fillerCleanupOptions, setFillerCleanupOptions] = useState<FillerCleanupOptions>({
    aggressiveness: "medium",
    protectIntentionalPhrasing: true,
  });
  const [retakeCleanupOptions, setRetakeCleanupOptions] = useState<RetakeCleanupOptions>({
    detection: "normal",
    preferLaterCleanerTake: true,
    honorExplicitRetakePhrases: true,
    sameSpeakerOnly: true,
  });
  const [speakerSoloOptions, setSpeakerSoloOptions] = useState<SpeakerSoloOptions>(() => ({
    targetSpeaker: transcriptSegments[0]?.speaker ?? "S1",
    collapseInterruptions: true,
    compressGaps: false,
    maxInterruptionSec: 0.8,
  }));
  const [speakerInterviewOptions, setSpeakerInterviewOptions] = useState<SpeakerInterviewOptions>(() => ({
    hostSpeaker: transcriptSegments[0]?.speaker ?? "S1",
    respondentSpeaker: transcriptSegments[1]?.speaker ?? transcriptSegments[0]?.speaker ?? "S2",
    tightness: "medium",
    removeBackchannels: true,
    collapseInterruptions: true,
    maxInterruptionSec: 0.8,
  }));
  const [speakerMonologueOptions, setSpeakerMonologueOptions] = useState<SpeakerMonologueOptions>(() => ({
    targetSpeaker: transcriptSegments[0]?.speaker ?? "S1",
    removeBackchannels: true,
    suppressInterruptions: true,
    maxInterruptionSec: 0.8,
    tightenTargetRuns: true,
    compressGaps: false,
  }));
  const [speakerPanelOptions, setSpeakerPanelOptions] = useState<SpeakerPanelOptions>(() => ({
    hostSpeaker: transcriptSegments[0]?.speaker ?? "S1",
    primarySpeakerBias: "balanced",
    removeShortBackchannels: true,
    suppressShortCrossTalk: true,
    maxInterruptionSec: 0.8,
  }));
  const [fillerCandidateCards, setFillerCandidateCards] = useState<HammerCandidateCard[]>([]);
  const [fillerActiveCandidateIndex, setFillerActiveCandidateIndex] = useState(0);
  const [fillerDecisionInFlight, setFillerDecisionInFlight] = useState(false);
  const [retakeCandidateCards, setRetakeCandidateCards] = useState<HammerCandidateCard[]>([]);
  const [retakeActiveCandidateIndex, setRetakeActiveCandidateIndex] = useState(0);
  const [retakeDecisionInFlight, setRetakeDecisionInFlight] = useState(false);
  const [activeReviewKind, setActiveReviewKind] = useState<HammerCandidateReviewKind>("fillers");
  const [activeTranscriptToolSection, setActiveTranscriptToolSection] = useState<"fillers" | "retakes" | "silence_gaps">("fillers");
  const [candidateProposedRemovalById, setCandidateProposedRemovalById] = useState<Record<string, HammerSelectedTranscriptRangeDetail>>({});
  const [candidateReceiptByKind, setCandidateReceiptByKind] = useState<Record<HammerCandidateReviewKind, string | null>>({
    fillers: null,
    retakes: null,
  });
  const [selectedTranscriptRange, setSelectedTranscriptRange] = useState<HammerSelectedTranscriptRange | null>(null);
  const selectedTranscriptRangeDetailRef = useRef<HammerSelectedTranscriptRangeDetail | null>(null);
  const lastVisualSelectionLogKeyRef = useRef<string | null>(null);
  const [linkedSelection, setLinkedSelection] = useState<HammerLinkedSelection | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<HammerCleanupPreview | null>(null);
  const [cleanupReceipt, setCleanupReceipt] = useState<HammerPolishResultSummary | null>(null);
  const [editableAudioPolish, setEditableAudioPolish] = useState<HammerPersistedAudioPolish | null>(
    () => cloneHammerAudioPolish(props.audioPolish),
  );
  const [audioCutSelectionStartSec, setAudioCutSelectionStartSec] = useState<number | null>(null);
  const [audioCutSelectionEndSec, setAudioCutSelectionEndSec] = useState<number | null>(null);
  const [dismissedSilenceSuggestionIds, setDismissedSilenceSuggestionIds] = useState<Set<string>>(() => new Set());
  const [audioLevelingEnabled, setAudioLevelingEnabled] = useState(true);
  const [audioNoiseReductionEnabled, setAudioNoiseReductionEnabled] = useState(true);
  const [audioFinalizationCompareMode, setAudioFinalizationCompareMode] = useState<HammerAudioFinalizationCompareMode>("after");
  const [videoSnapMode, setVideoSnapMode] = useState<"timeline" | "segment">("timeline");
  const initialVisualPreviewSettings = normalizeVisualPreviewSettings(props.initialVisualPreviewSettings);
  const [visualWhiteBalance, setVisualWhiteBalance] = useState(initialVisualPreviewSettings.white_balance);
  const [visualColorAmount, setVisualColorAmount] = useState(initialVisualPreviewSettings.color_amount);
  const [visualEyeContactAssistEnabled, setVisualEyeContactAssistEnabled] = useState<boolean>(
    Boolean(initialVisualPreviewSettings.eye_contact_assist_enabled ?? false),
  );
  const [visualEyeContactAssistStrength, setVisualEyeContactAssistStrength] = useState<number>(
    Number(initialVisualPreviewSettings.eye_contact_assist_strength ?? 0.25),
  );
  const [visualBackgroundBlur, setVisualBackgroundBlur] = useState(initialVisualPreviewSettings.background_blur);
  const [visualBackgroundBlurPx, setVisualBackgroundBlurPx] = useState<number>(
    Number(initialVisualPreviewSettings.background_blur_px ?? 14),
  );
  const [visualBackgroundBlurFeatherPx, setVisualBackgroundBlurFeatherPx] = useState<number>(
    Number(initialVisualPreviewSettings.background_blur_feather_px ?? 6),
  );
  const [visualBackgroundBlurTemporalSmoothing, setVisualBackgroundBlurTemporalSmoothing] = useState<number>(
    Number(initialVisualPreviewSettings.background_blur_temporal_smoothing ?? 0.25),
  );
  const [visualBackgroundBlurSubjectExpansionPx, setVisualBackgroundBlurSubjectExpansionPx] = useState<number>(
    Number(initialVisualPreviewSettings.background_blur_subject_expansion_px ?? 0),
  );
  const [visualBackgroundBlurQualityMode, setVisualBackgroundBlurQualityMode] = useState<BackgroundBlurSettings["qualityMode"]>(
    (initialVisualPreviewSettings.background_blur_quality_mode as BackgroundBlurSettings["qualityMode"]) ?? "medium",
  );
  const [visualBackgroundBlurFallbackMode, setVisualBackgroundBlurFallbackMode] = useState<BackgroundBlurSettings["fallbackMode"]>(
    (initialVisualPreviewSettings.background_blur_fallback_mode as BackgroundBlurSettings["fallbackMode"]) ?? "disable",
  );
  const [visualBackgroundBlurProviderId, setVisualBackgroundBlurProviderId] = useState<string | null>(
    typeof initialVisualPreviewSettings.background_blur_provider === "string"
      ? initialVisualPreviewSettings.background_blur_provider
      : "mediapipe_selfie_segmentation",
  );
  const [visualBackgroundReplaceEnabled, setVisualBackgroundReplaceEnabled] = useState<boolean>(
    Boolean(initialVisualPreviewSettings.background_replace_enabled ?? false),
  );
  const [visualBackgroundReplaceMode, setVisualBackgroundReplaceMode] = useState<"solid" | "image" | "checkerboard">(
    (initialVisualPreviewSettings.background_replace_mode === "image"
      ? "image"
      : initialVisualPreviewSettings.background_replace_mode === "checkerboard"
      ? "checkerboard"
      : "solid"),
  );
  const [visualBackgroundReplaceColor, setVisualBackgroundReplaceColor] = useState<string>(
    String(initialVisualPreviewSettings.background_replace_color ?? "#2b2b2b"),
  );
  const [visualBackgroundReplaceImageUrl, setVisualBackgroundReplaceImageUrl] = useState<string>(
    String(initialVisualPreviewSettings.background_replace_image_url ?? ""),
  );
  const [visualBackgroundWashEnabled, setVisualBackgroundWashEnabled] = useState<boolean>(
    Boolean(initialVisualPreviewSettings.background_wash_enabled ?? false),
  );
  const [visualBackgroundWashDimAmount, setVisualBackgroundWashDimAmount] = useState<number>(
    Number(initialVisualPreviewSettings.background_wash_dim_amount ?? 0.35),
  );
  const [visualBackgroundWashDesaturateAmount, setVisualBackgroundWashDesaturateAmount] = useState<number>(
    Number(initialVisualPreviewSettings.background_wash_desaturate_amount ?? 0.25),
  );
  const [visualBackgroundBlurDebugMask, setVisualBackgroundBlurDebugMask] = useState(false);
  const [visualBackgroundMaskPreviewMode, setVisualBackgroundMaskPreviewMode] = useState(false);
  const [visualBackgroundMaskPreviewStage, setVisualBackgroundMaskPreviewStage] = useState<"raw" | "expanded" | "feathered" | "refined" | "final_composite">("raw");
  const [visualEyeContactAssistDebugOverlay, setVisualEyeContactAssistDebugOverlay] = useState(false);
  const visualBackgroundEffectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [persistNowRequestNonce, setPersistNowRequestNonce] = useState(0);
  const [captionFormatting, setCaptionFormatting] = useState<HammerCaptionFormattingState>({
    style: "sentence",
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2,
    includeSpeakerLabels: false,
    punctuationMode: "preserve",
    readingSpeed: "standard",
  });
  const [selectedCaptionArtifactFormat, setSelectedCaptionArtifactFormat] = useState<"srt" | "vtt">("srt");
  const [captionBuildState, setCaptionBuildState] = useState<HammerCaptionBuildState | null>(null);
  const [captionEditedState, setCaptionEditedState] = useState<HammerCaptionEditedState | null>(null);
  const [activeCaptionArtifactMode, setActiveCaptionArtifactMode] = useState<HammerCaptionArtifactMode>("built");
  const [captionBuildFeedback, setCaptionBuildFeedback] = useState<string | null>(null);
  const [detailTag, setDetailTag] = useState("main-edit");
  const [finishingChecklist, setFinishingChecklist] = useState({
    transcriptReviewed: false,
    visualsReviewed: false,
    audioReviewed: false,
  });
  const [storedMediaFiles, setStoredMediaFiles] = useState<HammerStoredMediaFile[]>([]);
  const [mediaMapBeats, setMediaMapBeats] = useState<HammerMediaMapBeat[]>([]);
  const [removedMediaMapSegmentIds, setRemovedMediaMapSegmentIds] = useState<string[]>([]);
  const [sourceDeskLoading, setSourceDeskLoading] = useState(false);
  const [sourceDeskError, setSourceDeskError] = useState<string | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<"images" | "broll" | "introoutro" | null>(null);
  const [sourceDeskPreviewUrls, setSourceDeskPreviewUrls] = useState<Record<string, string>>({});
  const [sourceDeskPreviewFailures, setSourceDeskPreviewFailures] = useState<Record<string, true>>({});
  const [sourceDeskRequestedPreviewPaths, setSourceDeskRequestedPreviewPaths] = useState<string[]>([]);
  const [sourceDeskVisiblePreviewPaths, setSourceDeskVisiblePreviewPaths] = useState<string[]>([]);
  const [releasePrepSaving, setReleasePrepSaving] = useState(false);
  const [releasePrepLoading, setReleasePrepLoading] = useState(false);
  const [releasePrepError, setReleasePrepError] = useState<string | null>(null);
  const [releasePrepSaved, setReleasePrepSaved] = useState<HammerReleasePrepSaveState | null>(null);
  const [quenchHandoffStatus, setQuenchHandoffStatus] = useState<{
    status: HammerQuenchHandoffStatus;
    message: string;
  } | null>(null);
  const [loadedPreparedPackage, setLoadedPreparedPackage] = useState<HammerPreparedReleasePackage | null>(null);
  const [studioRackRenderStatus, setStudioRackRenderStatus] = useState<HammerDialogueRenderExecutionResult | null>(null);
  const [transcriptTimingHint, setTranscriptTimingHint] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [playbackMediaSrc, setPlaybackMediaSrc] = useState<string | null>(null);
  const [previewVideoSrc, setPreviewVideoSrc] = useState<string | null>(null);
  const [canonicalWorkpieceLabel, setCanonicalWorkpieceLabel] = useState<string | null>(null);
  const [visualTimelineFocusNonce, setVisualTimelineFocusNonce] = useState(0);
  const currentPassMeta = useMemo(() => resolvePassMeta(currentPass), [currentPass]);
  const modeToolSelection = useMemo(() => editorModeToToolSelection(editorMode), [editorMode]);
  // TODO: DEPRECATE - derived from editorMode
  const activeTool = currentPassMeta.toolId === "export" ? currentPassMeta.toolId : modeToolSelection.activeTool;
  // TODO: DEPRECATE - derived from editorMode
  const selectedSourceTab = useMemo(() => editorModeToSourceTab(editorMode), [editorMode]);
  // TODO: DEPRECATE - derived from editorMode
  const activeVisualTool = useMemo(
    () => modeToolSelection.activeVisualTool ?? editorModeToVisualTool(editorMode, currentPass),
    [currentPass, editorMode, modeToolSelection.activeVisualTool],
  );
  // TODO: DEPRECATE - derived from editorMode
  const videoPanelRoute = useMemo<HammerVideoPanelRoute>(() => {
    if (activeTool !== "video") return "non_video";
    return modeToolSelection.videoPanelRoute === "non_video"
      ? activeVisualTool
      : modeToolSelection.videoPanelRoute;
  }, [activeTool, activeVisualTool, modeToolSelection.videoPanelRoute]);
  const editableVisualPlacements = useMemo(
    () => deriveLegacyVisualPlacementsFromTimeline(editableVisualTimeline),
    [editableVisualTimeline],
  );
  const compositionVisualTimeline = useMemo(() => {
    if (!editableVisualTimeline) return null;
    const clips = editableVisualTimeline.clips.filter((clip) => !isIntroOutroPackagingClip(clip));
    const clipIds = new Set(clips.map((clip) => clip.clip_id));
    return {
      ...editableVisualTimeline,
      selected_clip_id: editableVisualTimeline.selected_clip_id && clipIds.has(editableVisualTimeline.selected_clip_id)
        ? editableVisualTimeline.selected_clip_id
        : null,
      lanes: editableVisualTimeline.lanes.map((lane) => ({
        ...lane,
        clip_ids: lane.clip_ids.filter((clipId) => clipIds.has(clipId)),
      })),
      clips,
    };
  }, [editableVisualTimeline]);
  const introPackagingClip = useMemo(
    () => editableVisualTimeline?.clips.find((clip) => clip.system_type === "intro") ?? null,
    [editableVisualTimeline],
  );
  const outroPackagingClip = useMemo(
    () => editableVisualTimeline?.clips.find((clip) => clip.system_type === "outro") ?? null,
    [editableVisualTimeline],
  );
  const packagingIntroAssetPath = useMemo(
    () => introPackagingClip?.asset_id
      ? (editableVisualTimeline?.assets.find((asset) => asset.asset_id === introPackagingClip.asset_id)?.path ?? null)
      : null,
    [editableVisualTimeline?.assets, introPackagingClip?.asset_id],
  );
  const packagingOutroAssetPath = useMemo(
    () => outroPackagingClip?.asset_id
      ? (editableVisualTimeline?.assets.find((asset) => asset.asset_id === outroPackagingClip.asset_id)?.path ?? null)
      : null,
    [editableVisualTimeline?.assets, outroPackagingClip?.asset_id],
  );
  const selectedClipId = compositionVisualTimeline?.selected_clip_id ?? null;
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const brollUploadInputRef = useRef<HTMLInputElement | null>(null);
  const introOutroUploadInputRef = useRef<HTMLInputElement | null>(null);
  const previewAudioRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoHardSeekAtMsRef = useRef<number>(0);
  const previewSurfaceRef = useRef<HTMLDivElement | null>(null);
  const imageAnimationContextMenuRef = useRef<HTMLDivElement | null>(null);
  const previewBrollVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const cutSeekFadeRef = useRef<{
    token: number;
    timerId: number | null;
  }>({
    token: 0,
    timerId: null,
  });
  const handleBackgroundEffectCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    visualBackgroundEffectCanvasRef.current = canvas;
  }, []);
  const workspaceShellRef = useRef<HTMLElement | null>(null);
  const captionEditorRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const lastHandledHandoffTokenRef = useRef<number | null>(null);
  const transcriptLineRefs = useRef(new Map<string, HTMLElement>());
  const visualPlacementCardRefs = useRef(new Map<string, HTMLElement>());
  const timelineTrackScrollRef = useRef<HTMLDivElement | null>(null);
  const selectionOriginRef = useRef<"system" | "transcript" | "timeline" | "playhead">("system");
  const selectionRevealFrameRef = useRef<number | null>(null);
  const historyControllerRef = useRef<HammerHistoryController | null>(null);
  const historyPersistTimerRef = useRef<number | null>(null);
  const snapshotManifestRef = useRef<HammerSnapshotManifestV1 | null>(null);
  const lastSnapshottedHeadEntryIdRef = useRef<string | null>(null);
  const historyBaselineStateRef = useRef<HammerEditorStateSerializable | null>(null);
  const baselineDerivedLayersRef = useRef<HammerPersistedStructuredTranscript["derived_text_layers"]>(
    cloneHammerDerivedTextLayers(props.structuredTranscript?.derived_text_layers),
  );
  const derivedLayerHistoryRef = useRef<Map<string, DerivedLayerHistoryTransition>>(new Map());
  const scrubRectRef = useRef<{ left: number; width: number } | null>(null);
  const scrubAutoPlayRef = useRef(false);
  const scrubReturnToPausedRef = useRef(false);
  const hydratedVisualPreviewSettingsRef = useRef<string | null>(null);
  const playbackOwnerIdRef = useRef(`hammer-preview-${Math.random().toString(36).slice(2, 10)}`);
  const handledCandidateIdsRef = useRef<{ fillers: Set<string>; retakes: Set<string> }>({
    fillers: new Set(),
    retakes: new Set(),
  });
  const candidateDecisionInFlightRef = useRef<{ fillers: boolean; retakes: boolean }>({
    fillers: false,
    retakes: false,
  });
  const lastHandledCandidateIdRef = useRef<{ fillers: string | null; retakes: string | null }>({
    fillers: null,
    retakes: null,
  });
  const audioPolishHasLocalEditsRef = useRef(false);
  const editableAudioPolishRef = useRef<HammerPersistedAudioPolish | null>(
    cloneHammerAudioPolish(props.audioPolish),
  );
  const onHistoryRecoveryStatusChangeRef = useRef(props.onHistoryRecoveryStatusChange);
  useEffect(() => {
    onHistoryRecoveryStatusChangeRef.current = props.onHistoryRecoveryStatusChange;
  }, [props.onHistoryRecoveryStatusChange]);

  useEffect(() => {
    // Avoid render loops when parents pass unstable callback identities.
    onHistoryRecoveryStatusChangeRef.current?.(historyStatus);
  }, [historyStatus]);

  useEffect(() => {
    audioPolishHasLocalEditsRef.current = false;
    editableAudioPolishRef.current = null;
    setEditableAudioPolish(null);
    setAudioCutSelectionStartSec(null);
    setAudioCutSelectionEndSec(null);
    setDismissedSilenceSuggestionIds(new Set());
  }, [launchContext.workpiece_id]);

  useEffect(() => {
    setEditableAudioPolish((current) => {
      if (!props.audioPolish) {
        const next = audioPolishHasLocalEditsRef.current ? current : null;
        editableAudioPolishRef.current = next;
        return next;
      }

      const incoming = cloneHammerAudioPolish(props.audioPolish);
      if (!incoming) {
        const next = audioPolishHasLocalEditsRef.current ? current : null;
        editableAudioPolishRef.current = next;
        return next;
      }
      if (!audioPolishHasLocalEditsRef.current) {
        editableAudioPolishRef.current = incoming;
        return incoming;
      }

      const next = {
        ...incoming,
        audio_edit: cloneHammerAudioEdit(current?.audio_edit ?? null) ?? cloneHammerAudioEdit(incoming.audio_edit),
      };
      editableAudioPolishRef.current = next;
      return next;
    });
  }, [props.audioPolish]);
  useEffect(() => {
    editableAudioPolishRef.current = editableAudioPolish;
  }, [editableAudioPolish]);

  useEffect(() => {
    const nextInitialPass = resolveInitialPassId(props.initialCurrentPass);
    const nextSelectedSegmentId = resolveSelectedSegmentId(transcriptSegments, props.initialSelectedSegmentId ?? null);
    setCurrentPass(nextInitialPass);
    setPassStatus(deriveHydratedPassStatus(nextInitialPass));
    setEditorMode(resolveEditorModeFromPass(nextInitialPass));
    applyLinkedSelectionState({
      selection: resolveSelectionFromTranscript({
        transcriptSegments,
        visualItems: (editableVisualTimeline?.clips ?? []).map((clip) => ({
          id: clip.clip_id,
          anchorSegmentId: clip.anchor_hint.anchor_segment_id
            ?? clip.anchor_hint.matched_segment_ids[0]
            ?? nextSelectedSegmentId,
          startSec: clip.start_sec,
          endSec: clip.end_sec,
        })),
        anchorSegmentId: nextSelectedSegmentId,
        focusSegmentId: nextSelectedSegmentId,
      }),
      origin: "system",
      clearTranscriptTextRange: true,
    });
  }, [
    editableVisualTimeline?.clips,
    launchContext.workspace_id,
    launchContext.workpiece_id,
    props.initialCurrentPass,
    props.initialSelectedSegmentId,
    transcriptSegments,
  ]);

  useEffect(() => {
    hydratedVisualPreviewSettingsRef.current = null;
  }, [launchContext.workpiece_id]);

  useEffect(() => {
    if (props.initialVisualPreviewSettings == null) return;
    if (hydratedVisualPreviewSettingsRef.current === launchContext.workpiece_id) return;
    hydratedVisualPreviewSettingsRef.current = launchContext.workpiece_id;

    const nextVisualPreviewSettings = normalizeVisualPreviewSettings(props.initialVisualPreviewSettings);
    setVisualWhiteBalance(nextVisualPreviewSettings.white_balance);
    setVisualColorAmount(nextVisualPreviewSettings.color_amount);
    setVisualEyeContactAssistEnabled(Boolean(nextVisualPreviewSettings.eye_contact_assist_enabled ?? false));
    setVisualEyeContactAssistStrength(Math.max(0, Math.min(1, Number(nextVisualPreviewSettings.eye_contact_assist_strength ?? 0.25))));
    setVisualBackgroundBlur(nextVisualPreviewSettings.background_blur);
    setVisualBackgroundBlurPx(Number(nextVisualPreviewSettings.background_blur_px ?? 14));
    setVisualBackgroundBlurFeatherPx(Number(nextVisualPreviewSettings.background_blur_feather_px ?? 6));
    setVisualBackgroundBlurTemporalSmoothing(Number(nextVisualPreviewSettings.background_blur_temporal_smoothing ?? 0.25));
    setVisualBackgroundBlurSubjectExpansionPx(Number(nextVisualPreviewSettings.background_blur_subject_expansion_px ?? 0));
    setVisualBackgroundBlurQualityMode((nextVisualPreviewSettings.background_blur_quality_mode as BackgroundBlurSettings["qualityMode"]) ?? "medium");
    setVisualBackgroundBlurFallbackMode((nextVisualPreviewSettings.background_blur_fallback_mode as BackgroundBlurSettings["fallbackMode"]) ?? "disable");
    setVisualBackgroundBlurProviderId(
      typeof nextVisualPreviewSettings.background_blur_provider === "string"
        ? nextVisualPreviewSettings.background_blur_provider
        : "mediapipe_selfie_segmentation",
    );
    setVisualBackgroundReplaceEnabled(Boolean(nextVisualPreviewSettings.background_replace_enabled ?? false));
    setVisualBackgroundReplaceMode(
      nextVisualPreviewSettings.background_replace_mode === "image"
        ? "image"
        : nextVisualPreviewSettings.background_replace_mode === "checkerboard"
        ? "checkerboard"
        : "solid",
    );
    setVisualBackgroundReplaceColor(String(nextVisualPreviewSettings.background_replace_color ?? "#2b2b2b"));
    setVisualBackgroundReplaceImageUrl(String(nextVisualPreviewSettings.background_replace_image_url ?? ""));
    setVisualBackgroundWashEnabled(Boolean(nextVisualPreviewSettings.background_wash_enabled ?? false));
    setVisualBackgroundWashDimAmount(Number(nextVisualPreviewSettings.background_wash_dim_amount ?? 0.35));
    setVisualBackgroundWashDesaturateAmount(Number(nextVisualPreviewSettings.background_wash_desaturate_amount ?? 0.25));
  }, [launchContext.workpiece_id, props.initialVisualPreviewSettings]);

  useEffect(() => {
    setPassStatus((previous) => {
      const normalized = normalizePassStatus(previous, currentPass);
      return normalized;
    });
  }, [currentPass]);

  const selectEditorMode = useCallback((nextMode: HammerEditorMode, options?: {
    preferredPass?: HammerPassId;
    focusOverride?: HammerWorkspaceFocusOverride;
  }) => {
    setEditorMode(nextMode);
    const targetPass = options?.preferredPass ?? resolveRepresentativePassForEditorMode(nextMode);
    if (targetPass !== currentPass) {
      setCurrentPass(targetPass);
      setPassStatus((previous) => {
        const normalized = normalizePassStatus(previous, targetPass);
        if (normalized[targetPass] === "not_started") {
          normalized[targetPass] = "in_progress";
        }
        return normalized;
      });
    }
    if (options?.focusOverride) {
      setFocusOverride(options.focusOverride);
    }
  }, [currentPass]);

  function selectPass(passId: HammerPassId): void {
    const nextPassResult = getPassStatus(passId, passSelectorContext);
    if (!canEnterPass(passId, passSelectorContext)) {
      const blockedReason = getPassBlockedReason(passId, passSelectorContext);
      setTranscriptTimingHint(
        blockedReason
          ? `${resolvePassMeta(passId).label} blocked: ${nextPassResult.humanLabel}.`
          : `${resolvePassMeta(passId).label} is currently blocked.`,
      );
      return;
    }
    const nextMeta = resolvePassMeta(passId);
    if (isHammerModeRoutingDebugEnabled()) {
      console.debug("[HammerModeRouting] selectPass", {
        passId,
        label: nextMeta.label,
        sourceTab: nextMeta.sourceTab,
        toolId: nextMeta.toolId,
      });
    }
    setCurrentPass(passId);
    setEditorMode(resolveEditorModeFromPass(passId));
    setPassStatus((previous) => {
      const normalized = normalizePassStatus(previous, passId);
      if (normalized[passId] === "not_started") {
        normalized[passId] = "in_progress";
      }
      return normalized;
    });
    setFocusOverride("tool-focus");
  }

  function selectVisualTool(nextTool: HammerVisualToolRackId): void {
    if (nextTool === "polish") {
      selectEditorMode("images", { preferredPass: "visual_finishing", focusOverride: "tool-focus" });
      return;
    }
    if (nextTool === "images") {
      selectEditorMode("images", { preferredPass: "image_placement", focusOverride: "tool-focus" });
      return;
    }
    selectEditorMode("broll", { preferredPass: "image_animation", focusOverride: "tool-focus" });
  }

  useEffect(() => {
    if (!isHammerModeRoutingDebugEnabled()) return;
    console.debug("[HammerModeRouting] state", {
      editorMode,
      currentPass,
      activeTool,
      activeVisualTool,
      selectedSourceTab,
      videoPanelRoute,
    });
  }, [activeTool, activeVisualTool, currentPass, editorMode, selectedSourceTab, videoPanelRoute]);

  function isTextEditingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (target.isContentEditable) return true;
    const role = target.getAttribute("role")?.toLowerCase() ?? "";
    if (role === "textbox" || role === "combobox") return true;
    return false;
  }

  function markCurrentPassComplete(): void {
    if (currentPassSelectorResult.isBlocking || currentPassSelectorResult.isDegraded) {
      setTranscriptTimingHint(
        `${currentPassMeta.label} cannot be marked complete: ${currentPassSelectorResult.humanLabel}.`,
      );
      return;
    }
    setPassStatus((previous) => {
      const normalized = normalizePassStatus(previous, currentPass);
      normalized[currentPass] = "completed";
      const currentIndex = PASS_ORDER.findIndex((pass) => pass.id === currentPass);
      const nextPass = currentIndex >= 0 ? PASS_ORDER[currentIndex + 1] : null;
      if (nextPass && normalized[nextPass.id] === "not_started") {
        normalized[nextPass.id] = "in_progress";
      }
      return normalized;
    });
    const currentIndex = PASS_ORDER.findIndex((pass) => pass.id === currentPass);
    const nextPass = currentIndex >= 0 ? PASS_ORDER[currentIndex + 1] : null;
    if (nextPass) {
      selectPass(nextPass.id);
    }
  }

  const pauseAuxiliaryMediaPlayback = useCallback((): void => {
    const primaryPreviewAudio = previewAudioRef.current;
    const primaryPreviewVideo = previewVideoRef.current;
    const previewBrollVideos = new Set(previewBrollVideoRefs.current.values());
    const mediaNodes = document.querySelectorAll("audio,video");
    mediaNodes.forEach((node) => {
      if (!(node instanceof HTMLMediaElement)) return;
      if (primaryPreviewAudio && node === primaryPreviewAudio) return;
      if (primaryPreviewVideo && node === primaryPreviewVideo) return;
      if (node instanceof HTMLVideoElement && previewBrollVideos.has(node)) return;
      node.pause();
      if (!node.ended) {
        node.currentTime = 0;
      }
      if (node instanceof HTMLVideoElement) {
        node.muted = true;
      }
    });
  }, []);

  const previewMode: HammerPreviewMode = launchContext.preview_mode ?? launchContext.edit_plan?.preview_mode ?? "edit-aware";
  const visualPolishPreviewActive = activeTool === "video" && activeVisualTool === "polish";
  const mediaRef = useMemo(
    () => resolveMediaRef(launchContext),
    [launchContext.media],
  );
  const workspaceMapping = useMemo(
    () => resolveWorkspaceMapping(launchContext),
    [launchContext.media],
  );
  const mediaSourceLabel = launchContext.media.kind === "dev-tone"
    ? "Dev tone"
    : mediaRef?.local_relpath ?? launchContext.media.label ?? null;
  const legacyCaptureLabel = launchContext.media.kind === "dev-tone"
    ? null
    : launchContext.media.label ?? null;
  const playbackLocalRootAbs = workspaceMapping?.local_root_abs
    ?? (launchContext.media.kind === "mapped-local" ? (launchContext.media.media_root_abs ?? null) : null);
  const mediaBackboneRuntime = useMemo(
    () => buildHammerMediaBackboneRuntimeSummary(),
    [],
  );
  const studioRackPlaybackBackendResolution = useMemo(
    () => resolveHammerAudioProcessingBackend({
      requestedBackend: editableStudioRack.backend_preference,
      mode: "playback",
      runtimeSummary: mediaBackboneRuntime,
    }),
    [editableStudioRack.backend_preference, mediaBackboneRuntime],
  );
  const studioRackRenderBackendResolution = useMemo(
    () => resolveHammerAudioProcessingBackend({
      requestedBackend: editableStudioRack.backend_preference,
      mode: "render",
      runtimeSummary: mediaBackboneRuntime,
    }),
    [editableStudioRack.backend_preference, mediaBackboneRuntime],
  );
  const studioRackPlaybackConfig = useMemo(
    () => processDialogueAudioWithBackend({
      rackState: editableStudioRack,
      mode: "playback",
      runtimeSummary: mediaBackboneRuntime,
    }),
    [editableStudioRack, mediaBackboneRuntime],
  );
  const studioRackRenderConfig = useMemo(
    () => processDialogueAudioWithBackend({
      rackState: editableStudioRack,
      mode: "render",
      runtimeSummary: mediaBackboneRuntime,
    }),
    [editableStudioRack, mediaBackboneRuntime],
  );

  const selectedSegment = editableTranscriptSegments.find(
    (segment) => segment.segment_id === (linkedSelection?.anchorId ?? selectedSegmentId),
  ) ?? null;
  const activeFillerCandidateCard = fillerCandidateCards[fillerActiveCandidateIndex] ?? null;
  const activeRetakeCandidateCard = retakeCandidateCards[retakeActiveCandidateIndex] ?? null;
  const activeCandidateCard = activeReviewKind === "retakes" ? activeRetakeCandidateCard : activeFillerCandidateCard;
  const activeFillerCandidateDiffOps = useMemo(() => {
    if (!activeFillerCandidateCard) return null;
    if (activeFillerCandidateCard.afterText == null) return null;
    return diffWords(activeFillerCandidateCard.beforeText, activeFillerCandidateCard.afterText);
  }, [activeFillerCandidateCard?.beforeText, activeFillerCandidateCard?.afterText]);
  const candidateSegmentIdSet = useMemo(
    () => new Set([
      ...fillerCandidateCards.flatMap((card) => card.segmentIds),
      ...retakeCandidateCards.flatMap((card) => card.segmentIds),
    ]),
    [fillerCandidateCards, retakeCandidateCards],
  );
  const activeCandidatePrimarySegmentId = activeCandidateCard?.primarySegmentId ?? null;
  const activeCandidateSegmentIdSet = useMemo(
    () => new Set(activeCandidateCard ? activeCandidateCard.segmentIds : []),
    [activeCandidateCard],
  );

  function setSelectedTranscriptRangeDetail(nextRange: HammerSelectedTranscriptRangeDetail | null): void {
    selectedTranscriptRangeDetailRef.current = nextRange;
    setSelectedTranscriptRange(nextRange ? {
      start: nextRange.start,
      end: nextRange.end,
      text: nextRange.text,
    } : null);
    if (nextRange?.segments.length) {
      selectLinkedTranscriptTarget({
        anchorSegmentId: nextRange.segments[0]?.segmentId ?? null,
        focusSegmentId: nextRange.segments[nextRange.segments.length - 1]?.segmentId ?? null,
        textRange: nextRange,
      });
    }
  }

  function createCandidateRemovalDraft(card: HammerCandidateCard | null): HammerSelectedTranscriptRangeDetail | null {
    if (!card || card.suggestedRemoval.length === 0) return null;
    const text = card.suggestedRemovalText.trim()
      ? card.suggestedRemovalText
      : card.suggestedRemoval.map((item) => item.text).join("\n");
    return {
      start: 0,
      end: text.length,
      text,
      segments: card.suggestedRemoval.map((item) => ({
        segmentId: item.segmentId,
        selectionStart: item.selectionStart,
        selectionEnd: item.selectionEnd,
        text: item.text,
      })),
    };
  }

  function resolveCandidateRemovalDraft(card: HammerCandidateCard | null): HammerSelectedTranscriptRangeDetail | null {
    if (!card) return null;
    return candidateProposedRemovalById[card.id] ?? createCandidateRemovalDraft(card);
  }

  function updateCandidateProposedRemoval(kind: HammerCandidateReviewKind): void {
    setActiveReviewKind(kind);
    const card = kind === "retakes" ? activeRetakeCandidateCard : activeFillerCandidateCard;
    const selectedRangeDetail = selectedTranscriptRangeDetailRef.current;
    if (!card) return;
    if (!selectedRangeDetail || selectedRangeDetail.segments.length === 0 || !selectedRangeDetail.text.trim()) {
      setTranscriptTimingHint("Select transcript text, then choose Update Proposed Removal.");
      return;
    }
    setCandidateProposedRemovalById((current) => ({
      ...current,
      [card.id]: {
        start: selectedRangeDetail.start,
        end: selectedRangeDetail.end,
        text: selectedRangeDetail.text,
        segments: selectedRangeDetail.segments.map((segment) => ({ ...segment })),
      },
    }));
    setTranscriptTimingHint(null);
  }
  const isTranscriptCandidateReviewPass = activeTool === "polish"
    && (currentPass === "transcript_cleanup" || currentPass === "retakes");
  const isTranscriptToolSurface = activeTool === "polish"
    && (currentPass === "transcript_cleanup" || currentPass === "retakes" || currentPass === "gap_pacing");
  const transcriptSelectionRange = useMemo(
    () => resolveTranscriptSegmentRange({
      segments: editableTranscriptSegments,
      anchorSegmentId: transcriptSelectionAnchorSegmentId,
      focusSegmentId: transcriptSelectionFocusSegmentId,
    }),
    [editableTranscriptSegments, transcriptSelectionAnchorSegmentId, transcriptSelectionFocusSegmentId],
  );
  const transcriptSelectionSegmentIdSet = useMemo(
    () => new Set(transcriptSelectionRange.segmentIds),
    [transcriptSelectionRange.segmentIds],
  );
  const hasTranscriptSelection = transcriptSelectionRange.segmentIds.length > 0;
  const activeTranscriptTargetRange = useMemo(() => {
    if (
      transcriptSelectionRange.startSec != null
      && transcriptSelectionRange.endSec != null
      && transcriptSelectionRange.endSec > transcriptSelectionRange.startSec
    ) {
      return {
        startSec: transcriptSelectionRange.startSec,
        endSec: transcriptSelectionRange.endSec,
        label: `${transcriptSelectionRange.segmentIds.length} selected segment${transcriptSelectionRange.segmentIds.length === 1 ? "" : "s"}`,
      };
    }
    if (selectedSegment && selectedSegment.end_sec > selectedSegment.start_sec) {
      return {
        startSec: selectedSegment.start_sec,
        endSec: selectedSegment.end_sec,
        label: `Segment ${selectedSegment.segment_id}`,
      };
    }
    return null;
  }, [selectedSegment, transcriptSelectionRange]);
  const activeLookPreset = useMemo(
    () => resolveActiveLookPreset(editableEditorialAuthorityGraph),
    [editableEditorialAuthorityGraph],
  );
  const activeExposureAdjustment = useMemo(
    () => resolveActiveExposureAdjustment(editableEditorialAuthorityGraph),
    [editableEditorialAuthorityGraph],
  );
  const visualPreviewFilter = useMemo(() => {
    const base = resolveVisualPresetFilter(activeLookPreset ?? "neutral");
    const exposureBoost = 1 + ((activeExposureAdjustment ?? 0) / 100) * 0.35;
    const temperatureShift = visualWhiteBalance / 3;
    const colorBoost = 1 + (visualColorAmount / 100) * 0.25;
    const filterParts = [
      base !== "none" ? base : "",
      `brightness(${exposureBoost.toFixed(2)})`,
      `hue-rotate(${temperatureShift.toFixed(1)}deg)`,
      `saturate(${colorBoost.toFixed(2)})`,
    ].filter(Boolean);
    return filterParts.join(" ");
  }, [activeExposureAdjustment, activeLookPreset, visualColorAmount, visualWhiteBalance]);
  const transcriptSegmentsById = useMemo(() => {
    const byId = new Map<string, HammerTranscriptSegment>();
    for (const segment of editableTranscriptSegments) {
      byId.set(segment.segment_id, segment);
    }
    return byId;
  }, [editableTranscriptSegments]);
  const transcriptSelectionAllDisabled = useMemo(() => (
    hasTranscriptSelection && transcriptSelectionRange.segmentIds.every(
      (segmentId) => transcriptSegmentsById.get(segmentId)?.is_disabled === true,
    )
  ), [hasTranscriptSelection, transcriptSelectionRange.segmentIds, transcriptSegmentsById]);
  useEffect(() => {
    if (!activeCandidatePrimarySegmentId) return;
    if (!editableTranscriptSegments.some((segment) => segment.segment_id === activeCandidatePrimarySegmentId)) return;
    selectLinkedTranscriptTarget({
      anchorSegmentId: activeCandidatePrimarySegmentId,
      focusSegmentId: activeCandidatePrimarySegmentId,
    });
  }, [activeCandidatePrimarySegmentId, editableTranscriptSegments]);
  const transcriptDurationSec = resolveTranscriptDurationSec(editableTranscriptSegments);
  const packagingTransport = useMemo(() => resolvePackagingTransport({
    introDurationSec: resolvePackagingClipDurationSec(introPackagingClip),
    outroDurationSec: resolvePackagingClipDurationSec(outroPackagingClip),
    compositionDurationSec: transcriptDurationSec,
    playheadSec,
  }), [introPackagingClip, outroPackagingClip, playheadSec, transcriptDurationSec]);
  const compositionPlayheadSec = packagingTransport.compositionPlayheadSec;
  const compositionOffsetSec = packagingTransport.compositionOffsetSec;
  const transportTranscriptTargetRange = useMemo(() => {
    if (!activeTranscriptTargetRange) return null;
    return {
      ...shiftCompositionWindowToTransport({
        startSec: activeTranscriptTargetRange.startSec,
        endSec: activeTranscriptTargetRange.endSec,
        compositionOffsetSec,
      }),
      label: activeTranscriptTargetRange.label,
    };
  }, [activeTranscriptTargetRange, compositionOffsetSec]);
  const playheadSegment = resolvePlayheadSegment(editableTranscriptSegments, compositionPlayheadSec);
  const playheadPrimaryVisualClip = useMemo(
    () => (compositionVisualTimeline ? selectPrimaryActiveClipAtTime(compositionVisualTimeline, compositionPlayheadSec) : null),
    [compositionPlayheadSec, compositionVisualTimeline],
  );
  const playheadPrimaryClipId = playheadPrimaryVisualClip?.clip_id ?? null;
  const effectiveSelectedClipId = (isPlaybackActive || isScrubbing)
    ? (playheadPrimaryClipId ?? selectedClipId)
    : selectedClipId;
  const timelineDurationSec = Math.max(packagingTransport.totalDurationSec, 1);
  const playbackTransportDurationSec = packagingTransport.totalDurationSec;
  const playbackTranscriptSegments = useMemo(
    () => editableTranscriptSegments.map((segment) => ({
      ...segment,
      start_sec: compositionTimeToTransportTime(segment.start_sec, compositionOffsetSec),
      end_sec: compositionTimeToTransportTime(segment.end_sec, compositionOffsetSec),
    })),
    [compositionOffsetSec, editableTranscriptSegments],
  );
  const activePackagingMediaPath = packagingTransport.phase === "intro"
    ? packagingIntroAssetPath
    : packagingTransport.phase === "outro"
    ? packagingOutroAssetPath
    : null;
  const activePackagingMediaSrc = activePackagingMediaPath
    ? (sourceDeskPreviewUrls[activePackagingMediaPath] ?? null)
    : null;
  const effectivePreviewVideoSrc = activePackagingMediaPath ? activePackagingMediaSrc : previewVideoSrc;
  const effectivePlaybackMediaSrc = activePackagingMediaPath ? activePackagingMediaSrc : playbackMediaSrc;
  const resolveActiveMediaTimeForTransportTime = useCallback(
    (transportTimeSec: number) => transportTimeToActiveMediaTime({
      transport: packagingTransport,
      timeSec: transportTimeSec,
    }),
    [packagingTransport],
  );
  const resolveTransportTimeForActiveMediaTime = useCallback(
    (mediaTimeSec: number) => activeMediaTimeToTransportTime({
      transport: packagingTransport,
      timeSec: mediaTimeSec,
    }),
    [packagingTransport],
  );
  const effectivePlaybackCutRegions = useMemo(
    () => getEffectiveCutRegions(editableAudioPolish?.audio_edit ?? null, transcriptDurationSec).map((region) => ({
      ...region,
      startSec: compositionTimeToTransportTime(region.startSec, compositionOffsetSec),
      endSec: compositionTimeToTransportTime(region.endSec, compositionOffsetSec),
    })),
    [compositionOffsetSec, editableAudioPolish?.audio_edit, transcriptDurationSec],
  );
  const resolveAudibleTransportTime = useCallback((requestedTimeSec: number): number | null => {
    if (playbackTransportDurationSec <= 0) return null;
    const clamped = Math.max(0, Math.min(playbackTransportDurationSec, requestedTimeSec));
    if (clamped >= playbackTransportDurationSec) {
      return null;
    }
    const compositionStartSec = compositionOffsetSec;
    const compositionEndSec = compositionOffsetSec + transcriptDurationSec;
    if (clamped < compositionStartSec || clamped >= compositionEndSec) {
      return clamped;
    }
    return resolveNextAudiblePlaybackTime({
      requestedTimeSec: clamped,
      durationSec: playbackTransportDurationSec,
      effectiveCutRegions: effectivePlaybackCutRegions,
      transcriptSegments: playbackTranscriptSegments,
    });
  }, [
    compositionOffsetSec,
    effectivePlaybackCutRegions,
    playbackTranscriptSegments,
    playbackTransportDurationSec,
    transcriptDurationSec,
  ]);
  const audioCutSelection = useMemo(() => normalizeAudioCutSelection({
    selection: {
      startSec: audioCutSelectionStartSec,
      endSec: audioCutSelectionEndSec,
    },
    durationSec: playbackTransportDurationSec,
  }), [audioCutSelectionEndSec, audioCutSelectionStartSec, playbackTransportDurationSec]);
  const hasPendingAudioCutSelection = audioCutSelectionStartSec != null || audioCutSelectionEndSec != null;
  const persistedAudioCutCount = editableAudioPolish?.audio_edit?.operations.length ?? 0;
  const isAudioCutSelectionCovered = useMemo(() => {
    if (!audioCutSelection) {
      return false;
    }
    return isTimeRangeFullyCoveredByCuts({
      effectiveCutRegions: effectivePlaybackCutRegions,
      startSec: audioCutSelection.startSec,
      endSec: audioCutSelection.endSec,
    });
  }, [audioCutSelection, effectivePlaybackCutRegions]);
  const audioCutSelectionStatus = useMemo(() => {
    if (playbackTransportDurationSec <= 0) {
      return "Timeline duration unavailable. Cut selection is disabled.";
    }
    if (audioCutSelection && isAudioCutSelectionCovered) {
      return `Selection ${audioCutSelection.startSec.toFixed(1)}s-${audioCutSelection.endSec.toFixed(1)}s is already covered by an existing cut.`;
    }
    if (audioCutSelection) {
      return `Cut selection ready: ${audioCutSelection.startSec.toFixed(1)}s-${audioCutSelection.endSec.toFixed(1)}s.`;
    }
    if (audioCutSelectionStartSec != null && audioCutSelectionEndSec != null) {
      return "Selection must be longer than 0.0s to create a cut.";
    }
    if (audioCutSelectionStartSec != null) {
      return `In point marked at ${audioCutSelectionStartSec.toFixed(1)}s. Move the playhead and mark out.`;
    }
    if (audioCutSelectionEndSec != null) {
      return `Out point marked at ${audioCutSelectionEndSec.toFixed(1)}s. Move the playhead and mark in.`;
    }
    return "Use the current playhead to mark in, mark out, and create one persisted cut.";
  }, [
    audioCutSelection,
    audioCutSelectionEndSec,
    audioCutSelectionStartSec,
    isAudioCutSelectionCovered,
    playbackTransportDurationSec,
  ]);
  const canMarkAudioCutSelection = playbackTransportDurationSec > 0;
  const canApplyAudioCutSelection = audioCutSelection != null && !isAudioCutSelectionCovered;
  const silenceCutSuggestions = useMemo(() => buildSilenceCutSuggestions({
    segmentation: editableAudioPolish?.analysis?.segmentation ?? null,
    durationSec: playbackTransportDurationSec,
    effectiveCutRegions: effectivePlaybackCutRegions,
  }), [
    editableAudioPolish?.analysis?.segmentation,
    effectivePlaybackCutRegions,
    playbackTransportDurationSec,
  ]);
  const visibleSilenceCutSuggestions = useMemo(() => filterDismissedSilenceCutSuggestions({
    suggestions: silenceCutSuggestions,
    dismissedSuggestionIds: dismissedSilenceSuggestionIds,
  }), [dismissedSilenceSuggestionIds, silenceCutSuggestions]);
  const hasSilenceSuggestionAnalysis = editableAudioPolish?.analysis?.segmentation != null;
  const silenceSuggestionCount = visibleSilenceCutSuggestions.length;
  useEffect(() => {
    if (dismissedSilenceSuggestionIds.size === 0) return;
    const activeSuggestionIds = new Set(silenceCutSuggestions.map((suggestion) => suggestion.id));
    let changed = false;
    const nextDismissedIds = new Set<string>();
    for (const suggestionId of dismissedSilenceSuggestionIds) {
      if (activeSuggestionIds.has(suggestionId)) {
        nextDismissedIds.add(suggestionId);
      } else {
        changed = true;
      }
    }
    if (!changed) return;
    setDismissedSilenceSuggestionIds(nextDismissedIds);
  }, [dismissedSilenceSuggestionIds, silenceCutSuggestions]);
  const playheadBoundaryTimesSec = useMemo(
    () => resolveTimelineBoundaryTimes(editableTranscriptSegments).map((timeSec) => (
      compositionTimeToTransportTime(timeSec, compositionOffsetSec)
    )),
    [compositionOffsetSec, editableTranscriptSegments],
  );
  const {
    isLoopPlaybackActive,
    playbackModeLabel,
    sortedTimelineMarkers,
    handlePlaybackProgress,
    handlePlaybackEnded,
    togglePlayback,
    seekPlayheadToTime: seekTransportPlayheadToTime,
    jumpToSelectionBoundary,
    jumpToEditPoint,
    addMarkerAtPlayhead,
    removeMarker,
    jumpToMarker,
    jumpToMarkerById,
    toggleSelectionLoopPlayback,
    playSelectionWithRoll,
    beginTimelineScrub,
    nudgePlayhead,
  } = useHammerWorkspaceShellPlayback({
    editableTranscriptSegments: playbackTranscriptSegments,
    effectivePlaybackCutRegions,
    timelineDurationSec,
    playbackTransportDurationSec,
    playheadBoundaryTimesSec,
    activeTranscriptTargetRange: transportTranscriptTargetRange as HammerPlaybackTargetRange | null,
    resolveAudibleTransportTime,
    resolveMediaTimeForTransportTime: resolveActiveMediaTimeForTransportTime,
    resolveTransportTimeForMediaTime: resolveTransportTimeForActiveMediaTime,
    playbackMediaSrc: effectivePlaybackMediaSrc,
    previewVideoSrc: effectivePreviewVideoSrc,
    visualPolishPreviewActive,
    focusOverride,
    playheadSec,
    isPlaybackActive,
    playbackWindow,
    isScrubbing,
    timelineMarkers,
    scrubRate,
    selectionOriginRef,
    previewAudioRef,
    previewVideoRef,
    previewVideoHardSeekAtMsRef,
    cutSeekFadeRef,
    scrubRectRef,
    scrubAutoPlayRef,
    scrubReturnToPausedRef,
    playbackOwnerIdRef,
    setPlayheadSec,
    setIsPlaybackActive,
    setPlaybackWindow,
    setIsScrubbing,
    setTimelineMarkers,
    setFocusOverride,
    setTranscriptTimingHint,
    pauseAuxiliaryMediaPlayback,
  });
  const handlePlaybackProgressWithOrigin = useCallback((nextTimeSec: number): void => {
    selectionOriginRef.current = "playhead";
    handlePlaybackProgress(nextTimeSec);
  }, [handlePlaybackProgress]);
  const seekPlayheadToTime = useCallback((
    nextTimeSec: number,
    origin: "timeline" | "playhead" = "timeline",
    options?: { snapToBoundary?: boolean },
  ): void => {
    seekTransportPlayheadToTime(
      compositionTimeToTransportTime(nextTimeSec, compositionOffsetSec),
      origin,
      options,
    );
  }, [compositionOffsetSec, seekTransportPlayheadToTime]);
  const visualAssetsById = useMemo(() => {
    const byId = new Map<string, NonNullable<HammerVisualTimelineState["assets"]>[number]>();
    for (const asset of editableVisualTimeline?.assets ?? []) {
      byId.set(asset.asset_id, asset);
    }
    return byId;
  }, [editableVisualTimeline?.assets]);
  const {
    selectedVisualFlowStep,
    setSelectedVisualFlowStep,
    imagePlacementDraftWindows,
    setImagePlacementDraftWindows,
    setTimelineImageDragState,
    imagePlacementTransforms,
    setImagePlacementTransforms,
    setPreviewCanvasDragState,
    imageAnimationContextMenu,
    setImageAnimationContextMenu,
    introOutroSelection,
    setIntroOutroSelection,
    packagingLogoAssetPath,
    setPackagingLogoAssetPath,
    packagingLogoPosition,
    setPackagingLogoPosition,
    packagingLogoSize,
    setPackagingLogoSize,
    savingIntroOutro,
    workspaceIntroOutroDefaults,
    setWorkspaceIntroOutroDefaults,
    savingWorkspaceIntroOutroDefaults,
    applyIntroOutroSelectionToFutureEpisodes,
    setApplyIntroOutroSelectionToFutureEpisodes,
    applyWorkspaceIntroOutroDefaultsToWorkpiece,
    reconcileIntroOutroSelectionWithPackaging,
    persistIntroOutroSelection,
    persistWorkspaceIntroOutroDefaultsNow,
    commitVisualPlacementWindow,
    updateVisualPlacementTiming,
    updateImagePlacementTransform,
    commitImagePlacementTransform,
    beginTimelineImagePlacementDrag,
    beginPreviewCanvasDrag,
    openImageAnimationContextMenu,
    applyImageAnimationPreset,
    removeVisualPlacement,
    removePackagingPlacement,
    addImagePlacementFromLibrary,
    addVisualAssetPlacementFromLibrary,
    applyIntroPlacement,
    applyOutroPlacement,
    toggleLogoOverlay,
    applyLogoOverlayStyle,
    flushPendingPlacementDrafts,
  } = useHammerWorkspaceShellVisualEditing({
    workpieceId: launchContext.workpiece_id,
    workspaceId: launchContext.workspace_id,
    currentPass,
    transcriptDurationSec,
    timelineDurationSec,
    visualPlacementEditingEnabled: activeTool === "video" && activeVisualTool === "images",
    storedMediaFiles,
    editableVisualTimeline,
    editableVisualPlacements,
    previewSurfaceRef,
    setFocusOverride,
    setTranscriptTimingHint,
    setSourceDeskError,
    setSelectedClipId,
    seekPlayheadToTime,
    requestDurablePersistBoundary,
    applyHistoryMutation,
    applyVisualTimelineAction,
    applyVisualTimelineActions,
    resolveCanonicalVisualTimeline,
  });
  const sourceVisualPlacementItems = useMemo<HammerSourceImageItem[]>(() => (
    (compositionVisualTimeline?.clips ?? [])
      .map((clip) => {
        const asset = clip.asset_id ? (visualAssetsById.get(clip.asset_id) ?? null) : null;
        const kind = deriveAssetKind({
          visualMode: clip.visual_mode,
          assetPath: asset?.path ?? null,
        });
        if (kind !== "image" && kind !== "broll" && kind !== "reference_clip") return null;
        const fallbackAnchorSegmentId = clip.anchor_hint.anchor_segment_id
          ?? clip.anchor_hint.matched_segment_ids[0]
          ?? selectedSegmentId
          ?? editableTranscriptSegments[0]?.segment_id
          ?? "segment:unknown";
        return {
          id: clip.clip_id,
          label: clip.label ?? asset?.label ?? asset?.asset_ref ?? clip.entry_id ?? clip.clip_id,
          kind,
          anchorSegmentId: fallbackAnchorSegmentId,
          anchorText: clip.anchor_hint.anchor_text ?? null,
          anchorLabel: clip.anchor_hint.anchor_label ?? null,
          startSec: imagePlacementDraftWindows[clip.clip_id]?.startSec ?? clip.start_sec,
          endSec: imagePlacementDraftWindows[clip.clip_id]?.endSec ?? clip.end_sec,
          status: clip.placement_status,
          confidence: clip.confidence,
          visualMode: clip.visual_mode,
          assetPath: asset?.path ?? null,
        };
      })
      .filter((item): item is HammerSourceImageItem => Boolean(item))
  ), [compositionVisualTimeline?.clips, editableTranscriptSegments, imagePlacementDraftWindows, selectedSegmentId, visualAssetsById]);
  const linkedSelectionVisualItems = useMemo(
    () => toHammerLinkedSelectionVisualItems(sourceVisualPlacementItems),
    [sourceVisualPlacementItems],
  );
  const linkedTranscriptSegmentIdSet = useMemo(
    () => buildLinkedSelectionTranscriptSegmentIdSet(linkedSelection),
    [linkedSelection],
  );
  const linkedVisualIdSet = useMemo(
    () => buildLinkedSelectionVisualIdSet(linkedSelection),
    [linkedSelection],
  );
  const linkedPrimaryVisualId = linkedSelection?.primaryVisualId ?? null;
  const visualPlacementEditingEnabled = activeTool === "video"
    && activeVisualTool === "images";
  const sourceImageItems = useMemo(
    () => sourceVisualPlacementItems.filter((item) => item.kind === "image"),
    [sourceVisualPlacementItems],
  );
  const sourceBrollPlacementItems = useMemo(
    () => sourceVisualPlacementItems.filter((item) => item.kind === "broll" || item.kind === "reference_clip"),
    [sourceVisualPlacementItems],
  );
  const isVisualPreviewAuthority = (
    currentPass === "visual_finishing"
    || currentPass === "image_placement"
    || currentPass === "image_animation"
  );
  useEffect(() => {
    if (!isVisualPreviewAuthority) return;

    const candidateIds = sourceVisualPlacementItems.map((item) => item.id);
    const preferredId = compositionVisualTimeline?.selected_clip_id ?? props.initialSelectedOverlayRowId ?? null;
    const nextClipId = candidateIds.length === 0
      ? null
      : preferredId && candidateIds.includes(preferredId)
        ? preferredId
        : (candidateIds[0] ?? null);
    if (nextClipId === (selectedClipId ?? null)) {
      return;
    }
    setSelectedClipId(nextClipId);
  }, [
    compositionVisualTimeline?.selected_clip_id,
    currentPass,
    isVisualPreviewAuthority,
    launchContext.workspace_id,
    launchContext.workpiece_id,
    props.initialSelectedOverlayRowId,
    selectedClipId,
    selectedSourceTab,
    sourceVisualPlacementItems,
  ]);
  const sourceVisualPlacementBySegmentId = useMemo(() => {
    const bySegment = new Map<string, HammerSourceImageItem>();
    for (const item of sourceBrollPlacementItems) {
      if (!bySegment.has(item.anchorSegmentId)) {
        bySegment.set(item.anchorSegmentId, item);
      }
    }
    return bySegment;
  }, [sourceBrollPlacementItems]);
  const visualPlacementsById = useMemo(() => {
    const byId = new Map<string, HammerVisualPlacementRecord>();
    for (const placement of editableVisualPlacements?.placements ?? []) {
      byId.set(placement.placement_id, placement);
    }
    return byId;
  }, [editableVisualPlacements?.placements]);
  const selectedVisualClip = useMemo(
    () => (compositionVisualTimeline ? selectClipById(compositionVisualTimeline, linkedPrimaryVisualId ?? effectiveSelectedClipId) : null),
    [compositionVisualTimeline, effectiveSelectedClipId, linkedPrimaryVisualId],
  );
  const selectedImagePlacement = useMemo(
    () => sourceVisualPlacementItems.find((item) => item.id === (linkedPrimaryVisualId ?? effectiveSelectedClipId)) ?? null,
    [effectiveSelectedClipId, linkedPrimaryVisualId, sourceVisualPlacementItems],
  );
  const workspaceLayoutMode = "default";
  const selectedPlacementRecord = (linkedPrimaryVisualId ?? effectiveSelectedClipId)
    ? (visualPlacementsById.get((linkedPrimaryVisualId ?? effectiveSelectedClipId) as string) ?? null)
    : null;
  const sourceImageLibraryItems = useMemo(
    () => storedMediaFiles.filter((file) => file.kind === "image"),
    [storedMediaFiles],
  );
  const introOutroCandidateItems = useMemo(
    () => buildIntroOutroCandidateItems(storedMediaFiles),
    [storedMediaFiles],
  );
  const introOutroCandidateItemsById = useMemo(() => {
    return buildIntroOutroCandidateItemsById(introOutroCandidateItems);
  }, [introOutroCandidateItems]);
  const packagingIntroPlacement = useMemo(
    () => (editableVisualPlacements?.placements ?? []).find((item) => item.entry_id === PACKAGING_INTRO_ENTRY_ID) ?? null,
    [editableVisualPlacements?.placements],
  );
  const packagingOutroPlacement = useMemo(
    () => (editableVisualPlacements?.placements ?? []).find((item) => item.entry_id === PACKAGING_OUTRO_ENTRY_ID) ?? null,
    [editableVisualPlacements?.placements],
  );
  const packagingLogoPlacement = useMemo(
    () => (editableVisualPlacements?.placements ?? []).find((item) => item.entry_id === PACKAGING_LOGO_ENTRY_ID) ?? null,
    [editableVisualPlacements?.placements],
  );
  useEffect(() => {
    if (!imageAnimationContextMenuRef.current || !imageAnimationContextMenu) return;
    const viewportPaddingPx = 12;
    const menuNode = imageAnimationContextMenuRef.current;
    const menuWidth = menuNode.offsetWidth;
    const menuHeight = menuNode.offsetHeight;
    const clampedLeft = Math.min(
      Math.max(viewportPaddingPx, imageAnimationContextMenu.x),
      Math.max(viewportPaddingPx, window.innerWidth - menuWidth - viewportPaddingPx),
    );
    const clampedTop = Math.min(
      Math.max(viewportPaddingPx, imageAnimationContextMenu.y),
      Math.max(viewportPaddingPx, window.innerHeight - menuHeight - viewportPaddingPx),
    );
    menuNode.style.left = `${clampedLeft}px`;
    menuNode.style.top = `${clampedTop}px`;
  }, [imageAnimationContextMenu]);
  const selectedImagePlacementTransform = useMemo(() => {
    if (!(linkedPrimaryVisualId ?? effectiveSelectedClipId)) return DEFAULT_IMAGE_PLACEMENT_TRANSFORM;
    const selectedPlacementId = (linkedPrimaryVisualId ?? effectiveSelectedClipId) as string;
    const draft = imagePlacementTransforms[selectedPlacementId];
    if (draft) return draft;
    if (selectedVisualClip) {
      return geometryToTransform(selectedVisualClip.geometry);
    }
    return geometryToTransform(resolvePlacementGeometry(selectedPlacementRecord));
  }, [imagePlacementTransforms, effectiveSelectedClipId, linkedPrimaryVisualId, selectedPlacementRecord, selectedVisualClip]);
  const selectedImageAnimationPreset = selectedVisualClip?.animation.preset ?? resolvePlacementAnimationPreset(selectedPlacementRecord);
  const selectedImageAnimationLabel = IMAGE_ANIMATION_PRESET_OPTIONS.find(
    (option) => option.id === selectedImageAnimationPreset,
  )?.label ?? "None";
  const selectedVisualAnchorSegmentId = selectedVisualClip?.anchor_hint.anchor_segment_id
    ?? selectedVisualClip?.anchor_hint.matched_segment_ids[0]
    ?? null;
  const selectedVisualAnchorSegment = selectedVisualAnchorSegmentId
    ? (transcriptSegmentsById.get(selectedVisualAnchorSegmentId) ?? null)
    : null;
  const [anchorTextDraft, setAnchorTextDraft] = useState("");
  const [anchorLabelDraft, setAnchorLabelDraft] = useState("");
  useEffect(() => {
    if (!selectedVisualClip) {
      setAnchorTextDraft("");
      setAnchorLabelDraft("");
      return;
    }
    setAnchorTextDraft(selectedVisualClip.anchor_hint.anchor_text ?? "");
    setAnchorLabelDraft(selectedVisualClip.anchor_hint.anchor_label ?? "");
  }, [
    selectedVisualClip?.clip_id,
    selectedVisualClip?.anchor_hint.anchor_text,
    selectedVisualClip?.anchor_hint.anchor_label,
  ]);
  const previewSurfaceLabel = useMemo(() => {
    if (packagingTransport.phase === "intro") {
      return `Packaging intro (${packagingTransport.introDurationSec.toFixed(1)}s)`;
    }
    if (packagingTransport.phase === "outro") {
      return `Packaging outro (${packagingTransport.outroDurationSec.toFixed(1)}s)`;
    }
    if (playheadPrimaryVisualClip && isVisualPreviewAuthority) {
      const visualLabel = playheadPrimaryVisualClip.label?.trim() || playheadPrimaryVisualClip.clip_id;
      return `Active visual: ${visualLabel} (${playheadPrimaryVisualClip.start_sec.toFixed(1)}s-${playheadPrimaryVisualClip.end_sec.toFixed(1)}s)`;
    }
    const fallback = resolvePreviewLabel(playheadSegment, compositionPlayheadSec);
    return fallback.length > 120 ? `${fallback.slice(0, 117)}...` : fallback;
  }, [compositionPlayheadSec, isVisualPreviewAuthority, packagingTransport.introDurationSec, packagingTransport.outroDurationSec, packagingTransport.phase, playheadPrimaryVisualClip, playheadSegment]);

  useEffect(() => {
    if (!previewSurfaceRef.current) return;
    previewSurfaceRef.current.style.filter = visualPreviewFilter || "";
  }, [visualPreviewFilter]);

  const backgroundBlurSettings = useMemo<BackgroundBlurSettings>(() => ({
    enabled: visualBackgroundBlur,
    blurPx: Math.max(0, Math.min(64, Number(visualBackgroundBlurPx) || 0)),
    replacementEnabled: visualBackgroundReplaceEnabled,
    replacementMode: visualBackgroundReplaceMode,
    replacementColor: visualBackgroundReplaceColor,
    replacementImageUrl: visualBackgroundReplaceImageUrl.trim() ? visualBackgroundReplaceImageUrl.trim() : null,
    washEnabled: visualBackgroundWashEnabled,
    washDimAmount: Math.max(0, Math.min(1, Number(visualBackgroundWashDimAmount) || 0)),
    washDesaturateAmount: Math.max(0, Math.min(1, Number(visualBackgroundWashDesaturateAmount) || 0)),
    edgeFeatherPx: Math.max(0, Math.min(64, Number(visualBackgroundBlurFeatherPx) || 0)),
    temporalSmoothing: Math.max(0, Math.min(1, Number(visualBackgroundBlurTemporalSmoothing) || 0)),
    subjectExpansionPx: Math.max(-12, Math.min(12, Number(visualBackgroundBlurSubjectExpansionPx) || 0)),
    qualityMode: visualBackgroundBlurQualityMode,
    fallbackMode: visualBackgroundBlurFallbackMode,
  }), [
    visualBackgroundBlur,
    visualBackgroundBlurFeatherPx,
    visualBackgroundBlurFallbackMode,
    visualBackgroundBlurPx,
    visualBackgroundBlurProviderId,
    visualBackgroundBlurQualityMode,
    visualBackgroundBlurSubjectExpansionPx,
    visualBackgroundBlurTemporalSmoothing,
    visualBackgroundReplaceColor,
    visualBackgroundReplaceEnabled,
    visualBackgroundReplaceImageUrl,
    visualBackgroundReplaceMode,
    visualBackgroundWashDesaturateAmount,
    visualBackgroundWashDimAmount,
    visualBackgroundWashEnabled,
  ]);

  const backgroundBlurProviderDescriptor = useMemo(
    () => resolveSegmentationProviderDescriptor(visualBackgroundBlurProviderId) ?? resolveSegmentationProviderDescriptor("mediapipe_selfie_segmentation"),
    [visualBackgroundBlurProviderId],
  );

  const activePreviewOverlays = useMemo<VisualPreviewOverlayModel[]>(() => {
    if (!compositionVisualTimeline) return [];
    if (packagingTransport.phase !== "composition") return [];
    const clipCandidates = selectPreviewClips({
      state: compositionVisualTimeline,
      playheadSec: compositionPlayheadSec,
      isPlaybackActive,
      isScrubbing,
    });
    const overlays = clipCandidates
      .map((clip): VisualPreviewOverlayModel | null => {
        const asset = clip.asset_id ? (visualAssetsById.get(clip.asset_id) ?? null) : null;
        const kind = deriveAssetKind({
          visualMode: clip.visual_mode,
          assetPath: asset?.path ?? null,
        });
        if (kind !== "image" && kind !== "broll" && kind !== "reference_clip") return null;
        const transform = imagePlacementTransforms[clip.clip_id] ?? geometryToTransform(clip.geometry);
        return {
          clip_id: clip.clip_id,
          label: clip.label ?? asset?.label ?? asset?.asset_ref ?? clip.entry_id ?? clip.clip_id,
          kind: kind === "image" ? "image" : "broll",
          src: asset?.path ? (sourceDeskPreviewUrls[asset.path] ?? null) : null,
          left_pct: transform.leftPct,
          top_pct: transform.topPct,
          width_pct: transform.widthPct,
          height_pct: transform.heightPct,
          z_index: clip.z_index,
          opacity: clip.opacity,
          fit_mode: clip.fit_mode ?? "contain",
          animation_class: resolveImageAnimationClass(clip.animation.preset),
          selected: clip.clip_id === linkedPrimaryVisualId,
          dimmed: linkedVisualIdSet.size > 0 && !linkedVisualIdSet.has(clip.clip_id),
        };
      })
      .filter((item): item is VisualPreviewOverlayModel => item !== null);
    return overlays.sort((left, right) => left.z_index - right.z_index);
  }, [
    compositionPlayheadSec,
    compositionVisualTimeline,
    imagePlacementTransforms,
    isPlaybackActive,
    isScrubbing,
    packagingTransport.phase,
    effectiveSelectedClipId,
    selectedClipId,
    linkedPrimaryVisualId,
    linkedVisualIdSet,
    sourceDeskPreviewUrls,
    visualAssetsById,
  ]);

  useEffect(() => {
    if (isPlaybackActive || isScrubbing) return;
    if (!linkedPrimaryVisualId) return;
    if (editorMode !== "images") return;
    const node = visualPlacementCardRefs.current.get(linkedPrimaryVisualId) ?? null;
    if (!node) return;
    node.scrollIntoView({ block: "nearest" });
  }, [editorMode, isPlaybackActive, isScrubbing, linkedPrimaryVisualId]);

  useEffect(() => {
    if (!selectedClipId) return;
    if (sourceVisualPlacementItems.some((item) => item.id === selectedClipId)) return;
    setSelectedClipId(null);
  }, [selectedClipId, sourceVisualPlacementItems]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const expectedClipId = playheadPrimaryClipId;
    const renderedClipId = activePreviewOverlays.at(-1)?.clip_id ?? null;
    if (!expectedClipId) {
      if (renderedClipId) {
        console.warn("[HammerVisuals] preview rendered without an active timeline clip", {
          rendered_clip_id: renderedClipId,
          playhead_sec: playheadSec,
        });
      }
      return;
    }
    const activeTimelineClip = compositionVisualTimeline
      ? selectClipById(compositionVisualTimeline, expectedClipId)
      : null;
    if (!activeTimelineClip) {
      console.warn("[HammerVisuals] active playhead clip is missing from canonical timeline", {
        active_clip_id: expectedClipId,
        playhead_sec: playheadSec,
      });
      return;
    }
    if (renderedClipId !== activeTimelineClip.clip_id) {
      console.warn("[HammerVisuals] preview render mismatch", {
        active_clip_id: activeTimelineClip.clip_id,
        rendered_clip_id: renderedClipId,
        playhead_sec: playheadSec,
      });
    }
  }, [activePreviewOverlays, compositionPlayheadSec, compositionVisualTimeline, playheadPrimaryClipId]);
  useEffect(() => {
    if (currentPass !== "image_placement") return;
    if (selectedClipId) return;
    const firstItem = sourceImageItems[0] ?? null;
    if (!firstItem) return;
    setSelectedClipId(firstItem.id);
  }, [currentPass, selectedClipId, sourceImageItems]);
  useEffect(() => {
    for (const overlay of activePreviewOverlays) {
      if (overlay.kind !== "broll") continue;
      const node = previewBrollVideoRefs.current.get(overlay.clip_id) ?? null;
      if (!node) continue;
      const clip = compositionVisualTimeline
        ? selectClipById(compositionVisualTimeline, overlay.clip_id)
        : null;
      if (!clip) continue;
      const localTime = Math.max(0, compositionPlayheadSec - clip.start_sec);
      const seekThresholdSec = isScrubbing ? 0.015 : SCRUB_SEEK_THRESHOLD_SEC;
      if (Math.abs(node.currentTime - localTime) > seekThresholdSec) {
        node.currentTime = localTime;
      }
      node.playbackRate = isScrubbing ? scrubRate : 1;
      if (isPlaybackActive || isScrubbing) {
        void node.play().catch(() => undefined);
      } else {
        node.pause();
      }
    }
  }, [activePreviewOverlays, compositionPlayheadSec, compositionVisualTimeline, isPlaybackActive, isScrubbing, scrubRate]);
  const activePreviewOverlayAssetPaths = useMemo(() => {
    if (!compositionVisualTimeline) return [] as string[];
    const paths: string[] = [];
    for (const overlay of activePreviewOverlays) {
      const clip = selectClipById(compositionVisualTimeline, overlay.clip_id);
      const assetPath = clip?.asset_id
        ? (visualAssetsById.get(clip.asset_id)?.path ?? null)
        : null;
      if (assetPath) {
        appendUniquePaths(paths, [assetPath]);
      }
    }
    return paths;
  }, [activePreviewOverlays, compositionVisualTimeline, visualAssetsById]);
  const sourceAssetItems = useMemo<HammerSourceAssetItem[]>(() => {
    const byId = new Map<string, HammerSourceAssetItem>();
    for (const placement of editableVisualPlacements?.placements ?? []) {
      const assetId = placement.asset_id ?? placement.asset_ref ?? placement.asset_path ?? placement.placement_id;
      const existing = byId.get(assetId);
      const nextKind = deriveAssetKind({
        visualMode: placement.visual_mode,
        assetPath: placement.asset_path,
      });
      if (!existing) {
        byId.set(assetId, {
          id: assetId,
          label: placement.label ?? placement.asset_ref ?? placement.asset_path ?? assetId,
          kind: nextKind,
          assetPath: placement.asset_path,
          visualMode: placement.visual_mode,
          usageCount: 1,
          firstStartSec: placement.start_sec,
          lastEndSec: placement.end_sec,
        });
        continue;
      }

      byId.set(assetId, {
        ...existing,
        usageCount: existing.usageCount + 1,
        firstStartSec: Math.min(existing.firstStartSec, placement.start_sec),
        lastEndSec: Math.max(existing.lastEndSec, placement.end_sec),
      });
    }

    if (mediaRef) {
      const mediaPath = mediaRef.local_relpath ?? null;
      const mediaKind: HammerSourceAssetKind = mediaRef.kind === "recording_audio" ? "audio" : "other";
      const existing = byId.get(mediaRef.media_id);
      if (!existing) {
        byId.set(mediaRef.media_id, {
          id: mediaRef.media_id,
          label: mediaPath ?? mediaRef.media_id,
          kind: mediaKind,
          assetPath: mediaPath,
          visualMode: null,
          usageCount: 1,
          firstStartSec: 0,
          lastEndSec: transcriptDurationSec,
        });
      }
    }

    for (const file of storedMediaFiles) {
      if (byId.has(file.path)) continue;
      byId.set(file.path, {
        id: file.path,
        label: file.name,
        kind: file.kind,
        assetPath: file.path,
        visualMode: "stored",
        usageCount: 0,
        firstStartSec: 0,
        lastEndSec: transcriptDurationSec,
      });
    }

    return [...byId.values()].sort((a, b) => a.firstStartSec - b.firstStartSec);
  }, [editableVisualPlacements?.placements, mediaRef, storedMediaFiles, transcriptDurationSec]);
  const sourceBrollItems = useMemo(
    () => sourceAssetItems.filter((item) => item.kind === "broll" || item.kind === "reference_clip"),
    [sourceAssetItems],
  );
  const sourceReferenceClipItems = useMemo(
    () => sourceBrollItems.filter((item) => item.kind === "reference_clip"),
    [sourceBrollItems],
  );
  const sourceBrollOnlyItems = useMemo(
    () => sourceBrollItems.filter((item) => item.kind === "broll"),
    [sourceBrollItems],
  );
  const referenceClipPlannedBeats = useMemo(
    () => mediaMapBeats.filter((beat) => beat.selectedType === "reference_clip"),
    [mediaMapBeats],
  );
  const brollSuggestionItems = useMemo<HammerBrollSuggestionItem[]>(() => {
    const operations = editableEditorialAuthorityGraph?.operations ?? [];
    return operations.flatMap((operation) => {
      if (operation.lifecycle !== "active") return [];
      if (operation.instruction.type !== "insert_broll") return [];
      return [{
        operationId: operation.operation_id,
        segmentId: operation.instruction.segment_id,
        startSec: operation.instruction.start_sec,
        endSec: operation.instruction.end_sec,
        assetRef: operation.instruction.asset_ref,
        intentRef: operation.instruction.intent_ref ?? null,
        intentDescription: operation.instruction.intent_description ?? null,
        bindingState: operation.instruction.asset_binding_state === "unresolved" ? "unresolved" : "resolved",
        duckPreference: operation.instruction.duck_preference ?? "auto",
      }];
    });
  }, [editableEditorialAuthorityGraph?.operations]);
  const unresolvedBrollSuggestionItems = useMemo(
    () => brollSuggestionItems.filter((item) => item.bindingState === "unresolved"),
    [brollSuggestionItems],
  );
  const resolvedBrollBindingItems = useMemo<HammerResolvedBrollBindingItem[]>(() => {
    const placementsByOperationId = new Map<string, HammerVisualPlacementRecord>();
    for (const placement of editableVisualPlacements?.placements ?? []) {
      if (!placement.authority_operation_id) continue;
      placementsByOperationId.set(placement.authority_operation_id, placement);
    }
    return brollSuggestionItems
      .filter((item): item is HammerBrollSuggestionItem & { bindingState: "resolved" } => item.bindingState === "resolved")
      .map((item) => {
        const linkedPlacement = placementsByOperationId.get(item.operationId) ?? null;
        return {
          ...item,
          bindingState: "resolved",
          assetRef: linkedPlacement?.asset_ref ?? item.assetRef,
          linkedPlacementId: linkedPlacement?.placement_id ?? null,
        };
      });
  }, [brollSuggestionItems, editableVisualPlacements?.placements]);

  useEffect(() => {
    const removedSet = new Set(removedMediaMapSegmentIds);
    setMediaMapBeats((current) => {
      const nextBase = editableTranscriptSegments
        .slice(0, 12)
        .filter((segment) => !removedSet.has(segment.segment_id))
        .map((segment) => {
          const suggested = resolveMediaMapSuggestionType(segment.text);
          const existing = current.find((item) => item.segmentId === segment.segment_id) ?? null;
          const linkedPlacement = sourceVisualPlacementBySegmentId.get(segment.segment_id) ?? null;
          const linkedType: HammerMediaMapSuggestionType | null = linkedPlacement
            ? (linkedPlacement.kind === "reference_clip" ? "reference_clip" : "broll")
            : null;
          return {
            id: existing?.id ?? `map:${segment.segment_id}`,
            segmentId: segment.segment_id,
            sourceText: segment.text,
            suggestedType: suggested.type,
            selectedType: linkedType ?? existing?.selectedType ?? suggested.type,
            reason: suggested.reason,
            tweak: existing?.tweak ?? "",
            linkedPlacementId: linkedPlacement?.id ?? null,
          } satisfies HammerMediaMapBeat;
        });
      const changed = JSON.stringify(current) !== JSON.stringify(nextBase);
      return changed ? nextBase : current;
    });
  }, [editableTranscriptSegments, removedMediaMapSegmentIds, sourceVisualPlacementBySegmentId]);
  const introOutroSelectedIntroItem = useMemo(() => {
    const assetId = introOutroSelection.intro_asset_id;
    if (!assetId) return null;
    return introOutroCandidateItemsById.get(assetId) ?? null;
  }, [introOutroCandidateItemsById, introOutroSelection.intro_asset_id]);
  const introOutroSelectedOutroItem = useMemo(() => {
    const assetId = introOutroSelection.outro_asset_id;
    if (!assetId) return null;
    return introOutroCandidateItemsById.get(assetId) ?? null;
  }, [introOutroCandidateItemsById, introOutroSelection.outro_asset_id]);
  const introOutroSelectedIntroPath = introOutroSelectedIntroItem?.path ?? null;
  const introOutroSelectedOutroPath = introOutroSelectedOutroItem?.path ?? null;
  const timelineTicks = useMemo(() => {
    const tickCount = 10;
    return Array.from({ length: tickCount + 1 }).map((_, index) => {
      const ratio = index / tickCount;
      return {
        ratio,
        timeSec: ratio * timelineDurationSec,
      };
    });
  }, [timelineDurationSec]);
  const timelineMinorTicks = useMemo(() => {
    const tickCount = 50;
    return Array.from({ length: tickCount + 1 })
      .map((_, index) => ({
        ratio: index / tickCount,
        isMajor: index % 5 === 0,
      }))
      .filter((tick) => !tick.isMajor);
  }, []);

  const revealBottomTimelineAtTime = useCallback((timeSec: number) => {
    const container = timelineTrackScrollRef.current;
    if (!container) return;
    const transportTimeSec = compositionTimeToTransportTime(timeSec, compositionOffsetSec);
    const clamped = Math.max(0, Math.min(timelineDurationSec, transportTimeSec));
    const ratio = timelineDurationSec > 0 ? (clamped / timelineDurationSec) : 0;
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const target = Math.max(0, Math.min(maxScrollLeft, (container.scrollWidth * ratio) - (container.clientWidth / 2)));
    container.scrollTo({ left: target, behavior: "smooth" });
  }, [compositionOffsetSec, timelineDurationSec]);

  const selection = useHammerWorkspaceShellSelection({
    transcriptSegments: editableTranscriptSegments,
    visualPlacementItems: sourceVisualPlacementItems,
    linkedSelection,
    selectionOriginRef,
    selectedTranscriptRangeDetailRef,
    setLinkedSelection,
    setFocusOverride,
    setSelectedSegmentId,
    setTranscriptSelectionAnchorSegmentId,
    setTranscriptSelectionFocusSegmentId,
    setSelectedClipId,
    setSelectedTranscriptRange,
    setVisualTimelineFocusNonce,
    seekPlayheadToTime,
    revealBottomTimelineAtTime,
    revealVisualSelectionUI: (placement) => {
      selectEditorMode(placement.kind === "image" ? "images" : "broll", {
        preferredPass: placement.kind === "image" ? "image_placement" : "image_animation",
      });
    },
  });
  const {
    applyLinkedSelectionState,
    clearTranscriptSelection: clearLinkedTranscriptSelection,
    selectLinkedTimelineRange,
    selectLinkedTranscriptTarget,
    selectVisualClip,
  } = selection;
  const dialogueLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    editableTranscriptSegments.map((segment) => ({
      id: `dialogue:${segment.segment_id}`,
      label: segment.is_disabled ? `${segment.speaker} (disabled)` : segment.speaker,
      startSec: compositionTimeToTransportTime(segment.start_sec, compositionOffsetSec),
      endSec: compositionTimeToTransportTime(segment.end_sec, compositionOffsetSec),
      selected: linkedSelection?.anchorId === segment.segment_id,
      inRange: linkedTranscriptSegmentIdSet.has(segment.segment_id),
      disabled: segment.is_disabled === true,
      tone: "dialogue",
      onSelect: () => {
        selectLinkedTimelineRange({
          startSec: segment.start_sec,
          endSec: segment.end_sec,
          segmentIds: [segment.segment_id],
          anchorId: segment.segment_id,
        });
      },
    }))
  ), [compositionOffsetSec, editableTranscriptSegments, linkedSelection?.anchorId, linkedTranscriptSegmentIdSet, selectLinkedTimelineRange]);
  const imageLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    sourceImageItems.map((item) => ({
      id: `image:${item.id}`,
      placementId: item.id,
      label: item.label,
      startSec: compositionTimeToTransportTime(item.startSec, compositionOffsetSec),
      endSec: compositionTimeToTransportTime(item.endSec, compositionOffsetSec),
      selected: item.id === linkedPrimaryVisualId,
      inRange: linkedVisualIdSet.has(item.id),
      tone: "image",
      onSelect: () => {
        selectVisualClip({ clipId: item.id, origin: "timeline", revealUI: true });
      },
    }))
  ), [compositionOffsetSec, linkedPrimaryVisualId, linkedVisualIdSet, selectVisualClip, sourceImageItems]);
  const brollLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    sourceBrollPlacementItems
      .map((item) => ({
        id: `broll-placement:${item.id}`,
        placementId: item.id,
        label: item.label,
        startSec: compositionTimeToTransportTime(item.startSec, compositionOffsetSec),
        endSec: compositionTimeToTransportTime(item.endSec, compositionOffsetSec),
        selected: item.id === linkedPrimaryVisualId,
        inRange: linkedVisualIdSet.has(item.id),
        tone: "broll",
        onSelect: () => {
          selectVisualClip({ clipId: item.id, origin: "timeline", revealUI: true });
        },
      }))
  ), [compositionOffsetSec, linkedPrimaryVisualId, linkedVisualIdSet, selectVisualClip, sourceBrollPlacementItems]);
  const visualTimelineLaneClips = useMemo<VisualClipBlockModel[]>(() => (
    [...sourceImageItems, ...sourceBrollPlacementItems]
      .map((item) => ({
        clipId: item.id,
        label: item.label,
        startSec: compositionTimeToTransportTime(item.startSec, compositionOffsetSec),
        endSec: compositionTimeToTransportTime(item.endSec, compositionOffsetSec),
        selected: item.id === linkedPrimaryVisualId,
      }))
      .sort((left, right) => left.startSec - right.startSec)
  ), [compositionOffsetSec, linkedPrimaryVisualId, sourceBrollPlacementItems, sourceImageItems]);
  const timelineLanes = useMemo<HammerTimelineLaneView[]>(() => ([
    { id: "dialogue", label: "Dialogue", tone: "dialogue", blocks: dialogueLaneBlocks },
    { id: "music", label: "Music", tone: "music", blocks: [] },
    { id: "broll", label: "B-roll", tone: "broll", blocks: brollLaneBlocks },
    { id: "stills", label: "Stills", tone: "stills", blocks: imageLaneBlocks },
  ]), [brollLaneBlocks, dialogueLaneBlocks, imageLaneBlocks]);
  const laneGapsById = useMemo(() => {
    const byLane = new Map<string, Array<{ id: string; startSec: number; endSec: number }>>();
    for (const lane of timelineLanes) {
      byLane.set(lane.id, resolveLaneGaps(lane.blocks, timelineDurationSec));
    }
    return byLane;
  }, [timelineDurationSec, timelineLanes]);
  const timelineBoardZoomClassName = useMemo(
    () => `is-zoom-${timelineZoomPercent}`,
    [timelineZoomPercent],
  );
  const playheadRatioPercent = Math.min(100, (playheadSec / timelineDurationSec) * 100);
  const sourceTranscriptById = useMemo(() => {
    const byId = new Map<string, HammerTranscriptSegment>();
    for (const segment of transcriptSegments) {
      byId.set(segment.segment_id, segment);
    }
    return byId;
  }, [transcriptSegments]);
  const modifiedTranscriptSegmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const segment of editableTranscriptSegments) {
      if (hasTranscriptSegmentChanged(sourceTranscriptById.get(segment.segment_id), segment)) {
        ids.add(segment.segment_id);
      }
    }
    return ids;
  }, [editableTranscriptSegments, sourceTranscriptById]);
  const modifiedSegmentCount = modifiedTranscriptSegmentIds.size;
  const selectedSourceDeskPreviewAssetPath = selectedVisualClip?.asset_id
    ? (visualAssetsById.get(selectedVisualClip.asset_id)?.path ?? null)
    : null;
  const imageUsageByPath = useMemo(() => {
    const usage = new Map<string, number>();
    for (const item of sourceImageItems) {
      if (!item.assetPath) continue;
      usage.set(item.assetPath, (usage.get(item.assetPath) ?? 0) + 1);
    }
    return usage;
  }, [sourceImageItems]);
  /*
    Source Desk preview orchestration lives in useHammerWorkspaceShellSourceDeskController,
    but the shell-level contract remains:

    const sourceDeskPreviewFetchKey = useMemo(
      () => buildSourceDeskPreviewFetchKey(sourceDeskPreviewFetchPaths),
      [sourceDeskPreviewFetchPaths],
    );

    useHammerWorkspaceShellSourceDeskPreviews({
      fetchKey: sourceDeskPreviewFetchKey,
    });
  */
  const {
    sourceDeskRequestedPreviewPathSet,
    sourceDeskPreviewPendingPathSet,
    sourceDeskRemainingPreviewPaths,
    requestSourceDeskPreviews,
    reportSourceDeskPreviewLoadError,
    reportVisibleSourceDeskPreviewPaths,
    handleSourceDeskUpload,
  } = useHammerWorkspaceShellSourceDeskController({
    workspaceId: launchContext.workspace_id,
    workpieceId: launchContext.workpiece_id,
    isPlaybackActive,
    sourceImageLibraryItems,
    sourceImageItems,
    sourceBrollItems,
    selectedImagePlacement,
    activePreviewOverlayAssetPaths,
    selectedSourceDeskPreviewAssetPath,
    introOutroSelectedIntroPath,
    introOutroSelectedOutroPath,
    packagingIntroAssetPath,
    packagingOutroAssetPath,
    storedMediaFiles,
    setStoredMediaFiles,
    sourceDeskLoading,
    setSourceDeskLoading,
    sourceDeskError,
    setSourceDeskError,
    uploadingCategory,
    setUploadingCategory,
    introOutroSelection,
    setIntroOutroSelection,
    workspaceIntroOutroDefaults,
    setWorkspaceIntroOutroDefaults,
    sourceDeskPreviewUrls,
    setSourceDeskPreviewUrls,
    sourceDeskPreviewFailures,
    setSourceDeskPreviewFailures,
    sourceDeskRequestedPreviewPaths,
    setSourceDeskRequestedPreviewPaths,
    sourceDeskVisiblePreviewPaths,
    setSourceDeskVisiblePreviewPaths,
    applyWorkspaceIntroOutroDefaultsToWorkpiece,
    reconcileIntroOutroSelectionWithPackaging,
  });
  const speakerOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const segment of editableTranscriptSegments) {
      const label = segment.speaker.trim();
      if (label) labels.add(label);
    }
    return [...labels];
  }, [editableTranscriptSegments]);
  const workspaceStructuredTranscript = useMemo(() => {
    if (!props.structuredTranscript) return null;
    return {
      ...props.structuredTranscript,
      derived_text_layers: cloneHammerDerivedTextLayers(editableDerivedTextLayers),
    };
  }, [editableDerivedTextLayers, props.structuredTranscript]);

  const canonicalStructuredTranscriptForPersistence = useMemo(() => {
    const base = preserveTranscriptMetadata(
      editableTranscriptSegments,
      workspaceStructuredTranscript ?? props.structuredTranscript ?? null,
      mediaRef,
      transcriptSourceId,
    );
    return {
      ...base,
      derived_text_layers: cloneHammerDerivedTextLayers(editableDerivedTextLayers),
    };
  }, [
    editableDerivedTextLayers,
    editableTranscriptSegments,
    mediaRef,
    props.structuredTranscript,
    transcriptSourceId,
    workspaceStructuredTranscript,
  ]);
  /*
    Transcript source-boundary sync contract:
    useEffect(() => {
      // reset editable transcript state only when the authoritative source boundary changes
    }, [launchContext.workpiece_id, transcriptSourceId]);
  */
  const mediaPrepOutputs = useMemo(
    () => buildHammerMediaPrepOutputsPackage({
      structuredTranscript: workspaceStructuredTranscript ?? null,
      visualPlacements: null,
      audioPolish: editableAudioPolish,
      mediaRef,
      mediaSourceLabel,
    }),
    [
      editableAudioPolish,
      mediaRef,
      mediaSourceLabel,
      workspaceStructuredTranscript,
    ],
  );
  const preferredPlayback = mediaPrepOutputs.audio.preferred_playback;
  const playbackSourceLabel = useMemo(() => {
    if (packagingTransport.phase === "intro") {
      return packagingIntroAssetPath ?? "Packaging intro";
    }
    if (packagingTransport.phase === "outro") {
      return packagingOutroAssetPath ?? "Packaging outro";
    }
    if (preferredPlayback.kind === "polished") {
      return preferredPlayback.workpiece_path
        ?? preferredPlayback.local_relpath
        ?? preferredPlayback.source_label
        ?? mediaSourceLabel;
    }
    if (preferredPlayback.kind === "raw") {
      return preferredPlayback.local_relpath
        ?? preferredPlayback.workpiece_path
        ?? preferredPlayback.source_label
        ?? mediaSourceLabel;
    }
    return mediaSourceLabel;
  }, [mediaSourceLabel, packagingIntroAssetPath, packagingOutroAssetPath, packagingTransport.phase, preferredPlayback.kind, preferredPlayback.local_relpath, preferredPlayback.source_label, preferredPlayback.workpiece_path]);

  const historyController = historyControllerRef.current;
  const historyHeadEntryId = historyController?.document.headEntryId ?? null;

  const voicePolish = useMemo(
    () => editableStudioRack.voice_polish ?? createDefaultHammerVoicePolishState(),
    [editableStudioRack.voice_polish],
  );
  const voicePolishHasAnyFixEnabled = useMemo(
    () => Object.values(voicePolish.fixes).some(Boolean),
    [voicePolish.fixes],
  );
  const studioRackHasAudibleProcessing = useMemo(
    () => (
      editableStudioRack.is_enabled
      && !editableStudioRack.is_bypassed
      && !isHammerStudioRackIdentity(editableStudioRack)
    ),
    [editableStudioRack],
  );
  const {
    studioRackComparePreviewStatusLabel,
    eyeContactUseBackgroundCanvasAsSource,
    visualBackgroundBlurRuntimeStatus,
    setVisualBackgroundBlurRuntimeStatus,
    visualBackgroundBlurStatusSummary,
    visualEyeContactAssistRuntimeStatus,
    setVisualEyeContactAssistRuntimeStatus,
    visualEyeContactAssistStatusSummary,
  } = useHammerWorkspaceShellPreviewRuntime({
    activeTool,
    currentPass,
    audioFinalizationCompareMode,
    editableStudioRack,
    editableTranscriptSegments,
    launchContext,
    historyHeadEntryId,
    mediaBackboneRuntime,
    mediaRef,
    playbackLocalRootAbs,
    preferredPlayback,
    studioRackHasAudibleProcessing,
    studioRackRenderBackendFfmpegAvailable: studioRackRenderBackendResolution.ffmpegAvailable,
    playbackMediaSrc,
    previewVideoSrc,
    visualBackgroundBlur,
    visualBackgroundReplaceEnabled,
    visualBackgroundWashEnabled,
    visualBackgroundBlurProviderId,
    visualBackgroundBlurDebugMask,
    visualBackgroundBlurFallbackMode: backgroundBlurSettings.fallbackMode,
    visualEyeContactAssistDebugOverlay,
    setPlaybackMediaSrc,
    setPreviewVideoSrc,
    setStudioRackRenderStatus,
    inferPlaybackMimeTypeFromPath,
  });
  const mediaLabelMismatchWarning = useMemo(() => {
    const canonical = normalizeLabelForComparison(canonicalWorkpieceLabel);
    const legacy = normalizeLabelForComparison(legacyCaptureLabel);
    if (!canonical || !legacy) return null;
    if (isSystemMediaLabel(legacyCaptureLabel)) return null;
    if (canonical.includes(legacy) || legacy.includes(canonical)) return null;
    return `Capture label "${legacyCaptureLabel}" does not match this episode title "${canonicalWorkpieceLabel}".`;
  }, [canonicalWorkpieceLabel, legacyCaptureLabel]);
  const canUndo = historyController?.canUndo() ?? false;
  const canRedo = historyController?.canRedo() ?? false;
  const undoLabel = historyController?.peekUndoEntry()?.label ?? null;
  const redoLabel = historyController?.peekRedoEntry()?.label ?? null;
  const undoDepth = historyController?.document.undoStack.length ?? 0;
  const redoDepth = historyController?.document.redoStack.length ?? 0;
  const recentHistoryEntries = useMemo(
    () => [...(historyController?.document.entries ?? [])].slice(-12).reverse(),
    [historyController?.document.entries],
  );
  const historyEntryById = useMemo(() => {
    const byId = new Map<string, HammerHistoryEntry>();
    for (const entry of historyController?.document.entries ?? []) {
      byId.set(entry.id, entry);
    }
    return byId;
  }, [historyController?.document.entries]);
  const undoLabelCompact = compactHistoryActionLabel(undoLabel);
  const redoLabelCompact = compactHistoryActionLabel(redoLabel);
  const outputLayerCandidates = useMemo(
    () => listHammerDerivedTextLayers(workspaceStructuredTranscript ?? null, { includeDiscarded: false }),
    [workspaceStructuredTranscript],
  );
  const activeOutputLayerId = workspaceStructuredTranscript?.derived_text_layers?.active_layer_id ?? null;
  const activeOutputLayer = outputLayerCandidates.find((layer) => layer.layer_id === activeOutputLayerId) ?? null;
  const selectedOutputLayer = outputLayerCandidates.find(
    (layer) => layer.layer_id === editableOutputSelection.layerId,
  ) ?? null;
  const outputSelectionSummary = selectedOutputLayer
    ? formatOutputLayerLabel(selectedOutputLayer)
    : "Raw transcript";
  const viewingModeSummary = activeOutputLayer
    ? `Derived - ${formatOutputLayerLabel(activeOutputLayer)}`
    : "Raw transcript";
  const captionSourceLabel = selectedOutputLayer
    ? formatOutputLayerLabel(selectedOutputLayer)
    : "Raw transcript";
  const cleanupPreviewSummary = useMemo(
    () => (cleanupPreview ? buildPolishResultSummaryFromCleanupPreview(cleanupPreview) : null),
    [cleanupPreview],
  );
  const studioRackEnabledModuleCount = useMemo(
    () => Object.values(editableStudioRack.modules).filter((module) => module.is_enabled && !module.is_bypassed).length,
    [editableStudioRack.modules],
  );
  const studioRackRenderAppliedModules = useMemo(() => {
    const summary = studioRackRenderStatus?.rawResponse?.settings_summary ?? null;
    const raw = typeof summary?.applied_modules === "string" ? summary.applied_modules : "";
    if (!raw.trim()) return [] as string[];
    return raw.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((moduleId) => formatStudioRackModuleLabel(moduleId));
  }, [studioRackRenderStatus]);
  const studioRackRenderDeferredModules = useMemo(() => {
    const summary = studioRackRenderStatus?.rawResponse?.settings_summary ?? null;
    if (!summary) return [] as string[];
    const moduleIds = ["eq", "reverb", "tubeMicCharacter"];
    const deferred: string[] = [];
    for (const moduleId of moduleIds) {
      const requested = summary[`${moduleId}_requested`];
      const applied = summary[`${moduleId}_applied`];
      if (requested === true && applied !== true) {
        deferred.push(formatStudioRackModuleLabel(moduleId));
      }
    }
    return deferred;
  }, [studioRackRenderStatus]);
  function captureWorkspaceState(): HammerEditorStateSerializable {
    return toEditorState({
      segments: editableTranscriptSegments,
      visualPlacements: editableVisualPlacements,
      visualTimeline: editableVisualTimeline,
      audioEdit: editableAudioPolish?.audio_edit ?? null,
      studioRack: editableStudioRack,
      editorialAuthorityGraph: editableEditorialAuthorityGraph,
      outputSelection: editableOutputSelection,
      selectedSegmentId,
      playheadSec,
      transcriptTimingHint,
    });
  }

  function resolveCanonicalVisualTimeline(state: HammerEditorStateSerializable): HammerVisualTimelineState {
    if (state.visualTimeline) {
      return state.visualTimeline;
    }
    if (state.visualPlacements) {
      return migrateLegacyPlacementRecordsToTimelineState({
        placements: state.visualPlacements.placements,
        selected_overlay_row_id: null,
        updated_at: new Date().toISOString(),
      });
    }
    return createEmptyVisualTimelineState({
      updated_at: new Date().toISOString(),
      debug_origin: "empty_init",
    });
  }

  function applyVisualTimelineAction(
    state: HammerEditorStateSerializable,
    action: Parameters<typeof hammerVisualTimelineReducer>[1],
  ): HammerEditorStateSerializable {
    const nextTimeline = hammerVisualTimelineReducer(resolveCanonicalVisualTimeline(state), action);
    return {
      ...state,
      visualTimeline: nextTimeline,
      visualPlacements: deriveLegacyVisualPlacementsFromTimeline(nextTimeline),
    };
  }

  function applyVisualTimelineActions(
    state: HammerEditorStateSerializable,
    actions: Parameters<typeof hammerVisualTimelineReducer>[1][],
  ): HammerEditorStateSerializable {
    return actions.reduce(
      (current, action) => applyVisualTimelineAction(current, action),
      state,
    );
  }

  function replaceVisualTimelineState(
    state: HammerEditorStateSerializable,
    updater: (timeline: HammerVisualTimelineState) => HammerVisualTimelineState,
  ): HammerEditorStateSerializable {
    const nextTimeline = hammerVisualTimelineReducer(
      resolveCanonicalVisualTimeline(state),
      { type: "LOAD_TIMELINE", timeline: updater(resolveCanonicalVisualTimeline(state)) },
    );
    return {
      ...state,
      visualTimeline: nextTimeline,
      visualPlacements: deriveLegacyVisualPlacementsFromTimeline(nextTimeline),
    };
  }

  function applyWorkspaceState(nextState: HammerEditorStateSerializable): void {
    const normalized = toShellState(nextState);
    setEditableTranscriptSegments(normalized.segments);
    setEditableVisualTimeline(normalized.visualTimeline);
    setEditableStudioRack(normalized.studioRack);
    setEditableEditorialAuthorityGraph(normalized.editorialAuthorityGraph);
    setEditableOutputSelection(normalized.outputSelection);
    setSelectedSegmentId(normalized.selectedSegmentId);
    setPlayheadSec(normalized.playheadSec);
    setTranscriptTimingHint(normalized.transcriptTimingHint);
    setLinkedSelection(
      normalized.visualTimeline?.selected_clip_id
        ? resolveSelectionFromVisual({
          transcriptSegments: normalized.segments,
          visualItems: linkedSelectionVisualItems,
          visualId: normalized.visualTimeline.selected_clip_id,
        })
        : resolveSelectionFromTranscript({
          transcriptSegments: normalized.segments,
          visualItems: linkedSelectionVisualItems,
          anchorSegmentId: normalized.selectedSegmentId,
          focusSegmentId: normalized.selectedSegmentId,
        }),
    );
    setEditableAudioPolish((current) => {
      const base = cloneHammerAudioPolish(current)
        ?? cloneHammerAudioPolish(props.audioPolish)
        ?? buildNotStartedHammerAudioPolish();
      base.audio_edit = cloneHammerAudioEdit(normalized.audioEdit);
      editableAudioPolishRef.current = base;
      audioPolishHasLocalEditsRef.current = true;
      return base;
    });
    setCleanupPreview(null);
  }

  function setSelectedClipId(clipId: string | null): void {
    setEditableVisualTimeline((current) => {
      const base = current ?? props.visualTimeline ?? createEmptyVisualTimelineState({
        updated_at: new Date().toISOString(),
        debug_origin: "empty_init",
      });
      if (base.selected_clip_id === clipId) {
        return current ?? base;
      }
      const next = hammerVisualTimelineReducer(base, {
        type: "SELECT_CLIP",
        clip_id: clipId,
      });
      if (isHammerVisualSelectionDebugEnabled() && clipId) {
        const resolved = selectClipById(next, clipId);
        const selectionLogKey = `${clipId}|${resolved?.clip_id ?? ""}`;
        if (selectionLogKey !== lastVisualSelectionLogKeyRef.current) {
          lastVisualSelectionLogKeyRef.current = selectionLogKey;
          console.debug("[HammerVisuals] clip selection", {
            clicked_clip_id: clipId,
            resolved_selected_clip_id: resolved?.clip_id ?? null,
          });
        }
      }
      return next;
    });
  }

  function requestDurablePersistBoundary(): void {
    setPersistNowRequestNonce((current) => current + 1);
  }

  function appendAuthorityInstructionForState(
    state: HammerEditorStateSerializable,
    instruction: HammerEditInstruction,
  ): HammerEditorialAuthorityGraph {
    return appendAuthorityInstructionToGraph({
      graph: state.editorialAuthorityGraph,
      instruction,
      fallback: {
        graphId: `${launchContext.workpiece_id}:authority`,
        workspaceId: launchContext.workspace_id,
        workpieceId: launchContext.workpiece_id,
        sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
        sourceTranscriptId: transcriptSourceId,
      },
    });
  }

  function applyCompositionMutation(op: HammerAuthorityOp): HammerHistoryEntry | null {
    switch (op.type) {
      case "TRANSCRIPT_DELETE_RANGE":
        return applyHistoryMutation({
          label: op.label,
          kind: op.kind ?? "segment_structure",
          toolId: op.toolId,
          affectedSegments: op.segmentIds,
          immediatePersist: op.immediatePersist === true,
          computeAfter: (before) => applyTranscriptDeleteRangeComposition({
            before,
            op,
            context: {
              playbackDurationSec: playbackTransportDurationSec,
              authorityFallback: {
                graphId: `${launchContext.workpiece_id}:authority`,
                workspaceId: launchContext.workspace_id,
                workpieceId: launchContext.workpiece_id,
                sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
                sourceTranscriptId: transcriptSourceId,
              },
            },
          }),
        });
      case "TRANSCRIPT_APPLY_CLEANUP_PREVIEW":
        return applyHistoryMutation({
          label: op.label,
          kind: op.kind ?? "cleanup_tool",
          toolId: op.toolId,
          affectedSegments: op.preview.suggestions.map((suggestion) => suggestion.segmentId),
          immediatePersist: op.immediatePersist === true,
          computeAfter: (before) => applyTranscriptCleanupPreviewComposition({
            before,
            op,
            context: {
              playbackDurationSec: playbackTransportDurationSec,
              authorityFallback: {
                graphId: `${launchContext.workpiece_id}:authority`,
                workspaceId: launchContext.workspace_id,
                workpieceId: launchContext.workpiece_id,
                sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
                sourceTranscriptId: transcriptSourceId,
              },
            },
          }),
        });
      case "TRANSCRIPT_TOGGLE_MUTE_SEGMENTS":
        return applyHistoryMutation({
          label: op.label,
          kind: op.kind ?? "segment_structure",
          toolId: op.toolId,
          affectedSegments: op.segmentIds,
          immediatePersist: op.immediatePersist === true,
          computeAfter: (before) => applyTranscriptToggleMuteSegmentsComposition({
            before,
            op,
            context: {
              playbackDurationSec: playbackTransportDurationSec,
              authorityFallback: {
                graphId: `${launchContext.workpiece_id}:authority`,
                workspaceId: launchContext.workspace_id,
                workpieceId: launchContext.workpiece_id,
                sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
                sourceTranscriptId: transcriptSourceId,
              },
            },
          }),
        });
      case "TRANSCRIPT_SPLIT":
        return applyHistoryMutation({
          label: op.label,
          kind: op.kind ?? "segment_structure",
          toolId: op.toolId,
          affectedSegments: [op.segmentId],
          immediatePersist: op.immediatePersist === true,
          computeAfter: (before) => applyTranscriptSplitComposition({
            before,
            op,
            context: {
              playbackDurationSec: playbackTransportDurationSec,
              authorityFallback: {
                graphId: `${launchContext.workpiece_id}:authority`,
                workspaceId: launchContext.workspace_id,
                workpieceId: launchContext.workpiece_id,
                sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
                sourceTranscriptId: transcriptSourceId,
              },
            },
          }),
        });
      case "TRANSCRIPT_TRIM_SEGMENT":
        return applyHistoryMutation({
          label: op.label,
          kind: op.kind ?? "timing_adjustment",
          toolId: op.toolId,
          affectedSegments: [op.segmentId],
          immediatePersist: op.immediatePersist === true,
          computeAfter: (before) => applyTranscriptTrimSegmentComposition({
            before,
            op,
            context: {
              playbackDurationSec: playbackTransportDurationSec,
              authorityFallback: {
                graphId: `${launchContext.workpiece_id}:authority`,
                workspaceId: launchContext.workspace_id,
                workpieceId: launchContext.workpiece_id,
                sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
                sourceTranscriptId: transcriptSourceId,
              },
            },
          }),
        });
      default:
        return null;
    }
  }

  function buildHistoryPathToEntry(entryId: string): string[] {
    const path: string[] = [];
    const visited = new Set<string>();
    let cursor: string | null = entryId;
    while (cursor && !visited.has(cursor)) {
      const entry: HammerHistoryEntry | null = historyEntryById.get(cursor) ?? null;
      if (!entry) break;
      path.push(entry.id);
      visited.add(cursor);
      cursor = entry.parentEntryId ?? null;
    }
    return path.reverse();
  }

  function resolveDerivedLayersForUndoStack(
    undoStack: readonly string[],
  ): HammerPersistedStructuredTranscript["derived_text_layers"] {
    let next = cloneHammerDerivedTextLayers(baselineDerivedLayersRef.current);
    for (const entryId of undoStack) {
      const transition = derivedLayerHistoryRef.current.get(entryId);
      if (!transition) continue;
      next = cloneHammerDerivedTextLayers(transition.after);
    }
    return next;
  }

  function clearPersistTimer(): void {
    if (historyPersistTimerRef.current != null) {
      window.clearTimeout(historyPersistTimerRef.current);
      historyPersistTimerRef.current = null;
    }
  }

  async function persistHistoryDocument(): Promise<void> {
    const controller = historyControllerRef.current;
    if (!controller) return;

    controller.document.metadata = {
      ...(controller.document.metadata ?? {}),
      lastKnownSelectionSegmentId: selectedSegmentId,
      lastKnownTool: activeTool,
    };
    controller.document.updatedAt = new Date().toISOString();

    const result = props.recordingRevisionId
      ? await saveHammerRevisionHistoryDocument({
        workspaceId: launchContext.workspace_id,
        workpieceId: launchContext.workpiece_id,
        revisionId: props.recordingRevisionId,
        document: controller.document,
      })
      : await saveHammerHistoryDocument({
        workpieceId: launchContext.workpiece_id,
        document: controller.document,
      });
    if (!result.ok) {
      setHistoryStatus(result.error);
      return;
    }
    setHistoryStatus(null);

    if (props.recordingRevisionId) {
      return;
    }

    const headEntryId = controller.document.headEntryId ?? null;
    const undoDepth = controller.document.undoStack.length;
    const redoDepth = controller.document.redoStack.length;
    const shouldSnapshot = shouldCreateHammerSnapshot({
      undoDepth,
      headEntryId,
      lastSnapshottedHeadEntryId: lastSnapshottedHeadEntryIdRef.current,
    });
    if (!shouldSnapshot) return;

    const snapshot = buildHammerHistorySnapshot({
      workpieceId: launchContext.workpiece_id,
      sessionId: controller.document.sessionId,
      baseRevisionId: controller.document.baseRevisionId,
      headEntryId,
      undoDepth,
      redoDepth,
      editorState: controller.getState(),
    });

    const payloadSaved = await saveHammerSnapshotPayload({
      workpieceId: launchContext.workpiece_id,
      snapshot,
    });
    if (!payloadSaved.ok) {
      console.warn("Hammer snapshot payload write skipped", {
        workpieceId: launchContext.workpiece_id,
        status: payloadSaved.status,
        error: payloadSaved.error,
      });
      return;
    }

    const nextManifest = upsertHammerSnapshotManifest({
      manifest: snapshotManifestRef.current,
      workpieceId: launchContext.workpiece_id,
      snapshot,
    });
    const manifestSaved = await saveHammerSnapshotManifest({
      workpieceId: launchContext.workpiece_id,
      manifest: nextManifest,
    });
    if (!manifestSaved.ok) {
      console.warn("Hammer snapshot manifest write skipped", {
        workpieceId: launchContext.workpiece_id,
        status: manifestSaved.status,
        error: manifestSaved.error,
      });
      return;
    }

    snapshotManifestRef.current = manifestSaved.data ?? nextManifest;
    lastSnapshottedHeadEntryIdRef.current = resolveActiveSnapshotHeadEntryId(snapshotManifestRef.current);
  }

  function scheduleHistoryPersist(immediate = false): void {
    clearPersistTimer();
    if (immediate) {
      void persistHistoryDocument();
      return;
    }

    historyPersistTimerRef.current = window.setTimeout(() => {
      historyPersistTimerRef.current = null;
      void persistHistoryDocument();
    }, HISTORY_PERSIST_DEBOUNCE_MS);
  }

  function syncVisualTimelineFromCompatibilityState(
    state: HammerEditorStateSerializable,
  ): HammerEditorStateSerializable {
    if (state.visualTimeline) {
      return {
        ...state,
        visualPlacements: deriveLegacyVisualPlacementsFromTimeline(state.visualTimeline),
      };
    }
    if (!state.visualPlacements) {
      return {
        ...state,
        visualTimeline: props.visualTimeline ?? null,
      };
    }
    return {
      ...state,
      visualTimeline: migrateLegacyPlacementRecordsToTimelineState({
        placements: state.visualPlacements.placements,
        selected_overlay_row_id: null,
        updated_at: new Date().toISOString(),
      }),
    };
  }

  function applyHistoryMutation(args: {
    label: string;
    kind?: HammerHistoryKind;
    affectedSegments?: string[];
    affectedPlacementIds?: string[];
    toolId?: string;
    transactionId?: string;
    allowCoalesce?: boolean;
    immediatePersist?: boolean;
    computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable;
  }): HammerHistoryEntry | null {
    const controller = historyControllerRef.current;
    if (!controller) return null;

    const before = captureWorkspaceState();
    const after = cloneEditorState(syncVisualTimelineFromCompatibilityState(
      args.computeAfter(cloneEditorState(before)),
    ));

    const entry = controller.applyMutation({
      label: args.label,
      kind: args.kind,
      toolId: args.toolId,
      affectedSegmentIds: args.affectedSegments,
      affectedPlacementIds: args.affectedPlacementIds,
      transactionId: args.transactionId ?? null,
      allowCoalesce: args.allowCoalesce,
      coalesceWindowMs: TEXT_EDIT_COALESCE_MS,
      nextState: after,
    });
    if (!entry) return null;

    applyWorkspaceState(controller.getState());
    scheduleHistoryPersist(args.immediatePersist === true);
    return entry;
  }

  function undoHistory(): void {
    const controller = historyControllerRef.current;
    if (!controller) return;
    const entry = controller.undo();
    if (!entry) return;
    const derivedTransition = derivedLayerHistoryRef.current.get(entry.id);
    if (derivedTransition) {
      setEditableDerivedTextLayers(cloneHammerDerivedTextLayers(derivedTransition.before));
    }
    applyWorkspaceState(controller.getState());
    selectionOriginRef.current = "system";
    setFocusOverride("source-focus");
    scheduleHistoryPersist();
  }

  function redoHistory(): void {
    const controller = historyControllerRef.current;
    if (!controller) return;
    const entry = controller.redo();
    if (!entry) return;
    const derivedTransition = derivedLayerHistoryRef.current.get(entry.id);
    if (derivedTransition) {
      setEditableDerivedTextLayers(cloneHammerDerivedTextLayers(derivedTransition.after));
    }
    applyWorkspaceState(controller.getState());
    selectionOriginRef.current = "system";
    setFocusOverride("source-focus");
    scheduleHistoryPersist();
  }

  useEffect(() => {
    if (!editableOutputSelection.layerId) return;

    const normalized = normalizeHammerOutputSelectionRef({
      selection: editableOutputSelection,
      layers: outputLayerCandidates,
    });

    if (
      normalized.layerId === editableOutputSelection.layerId
      && normalized.sourceRecipeRef === editableOutputSelection.sourceRecipeRef
    ) {
      return;
    }

    applyHistoryMutation({
      label: "Clear invalid export output selection",
      kind: "output_selection",
      toolId: "export",
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        outputSelection: normalized,
      }),
    });
  }, [editableOutputSelection, outputLayerCandidates]);

  useEffect(() => {
    let active = true;
    setCanonicalWorkpieceLabel(null);
    void loadHammerWorkspaceWorkpieceLabel(launchContext.workspace_id, launchContext.workpiece_id)
      .then((label) => {
        if (!active) return;
        setCanonicalWorkpieceLabel(label?.trim() || null);
      })
      .catch(() => {
        if (!active) return;
        setCanonicalWorkpieceLabel(null);
      });
    return () => {
      active = false;
    };
  }, [launchContext.workspace_id, launchContext.workpiece_id]);

  useEffect(() => {
    if (speakerOptions.length === 0) return;
    if (speakerOptions.includes(speakerSoloOptions.targetSpeaker)) return;
    setSpeakerSoloOptions((current) => ({
      ...current,
      targetSpeaker: speakerOptions[0] ?? "S1",
    }));
  }, [speakerOptions, speakerSoloOptions.targetSpeaker]);

  useEffect(() => {
    if (speakerOptions.length === 0) return;
    if (speakerOptions.includes(speakerMonologueOptions.targetSpeaker)) return;
    setSpeakerMonologueOptions((current) => ({
      ...current,
      targetSpeaker: speakerOptions[0] ?? "S1",
    }));
  }, [speakerMonologueOptions.targetSpeaker, speakerOptions]);

  useEffect(() => {
    if (speakerOptions.length === 0) return;
    setSpeakerInterviewOptions((current) => {
      let nextHost = current.hostSpeaker;
      let nextRespondent = current.respondentSpeaker;
      if (!speakerOptions.includes(nextHost)) {
        nextHost = speakerOptions[0] ?? "S1";
      }
      if (!speakerOptions.includes(nextRespondent) || nextRespondent === nextHost) {
        nextRespondent = speakerOptions.find((speaker) => speaker !== nextHost) ?? nextHost;
      }
      if (nextHost === current.hostSpeaker && nextRespondent === current.respondentSpeaker) {
        return current;
      }
      return {
        ...current,
        hostSpeaker: nextHost,
        respondentSpeaker: nextRespondent,
      };
    });
  }, [speakerOptions]);

  useEffect(() => {
    if (speakerOptions.length === 0) return;
    if (speakerOptions.includes(speakerPanelOptions.hostSpeaker)) return;
    setSpeakerPanelOptions((current) => ({
      ...current,
      hostSpeaker: speakerOptions[0] ?? "S1",
    }));
  }, [speakerOptions, speakerPanelOptions.hostSpeaker]);

  useHammerWorkspaceShellHistoryController({
    launchContext,
    recordingRevisionId: props.recordingRevisionId ?? null,
    editorialAuthorityGraph: props.editorialAuthorityGraph ?? null,
    structuredTranscriptResetKey,
    visualTimelineResetKey,
    transcriptSourceId,
    previewMode,
    audioEdit: props.audioPolish?.audio_edit ?? null,
    maxUndoSteps: HISTORY_MAX_SIZE,
    playheadSec,
    selectedSegmentId,
    transcriptSegments,
    structuredTranscript: props.structuredTranscript ?? null,
    visualPlacements: props.visualPlacements ?? null,
    visualTimeline: props.visualTimeline ?? null,
    clearPersistTimer,
    snapshotManifestRef,
    lastSnapshottedHeadEntryIdRef,
    historyBaselineStateRef,
    baselineDerivedLayersRef,
    historyControllerRef,
    derivedLayerHistoryRef,
    applyWorkspaceState,
    setHistoryStatus,
    toErrorMessage,
    setTimelineMarkers: (markers) => setTimelineMarkers(markers),
    setSelectedClipId,
    setImagePlacementDraftWindows,
    setTimelineImageDragState,
    setImagePlacementTransforms,
    setPreviewCanvasDragState,
    setImageAnimationContextMenu,
    setEditableDerivedTextLayers,
    setCaptionBuildState,
    setCaptionEditedState,
    setActiveCaptionArtifactMode,
    setAudioFinalizationCompareMode,
    setPackagingLogoAssetPath,
    setPackagingLogoPosition,
    setPackagingLogoSize,
    setCaptionBuildFeedback,
    createFallbackEditPlan,
    resolveOutputSelectionFromTranscript,
    toEditorState,
    cloneHammerDerivedTextLayers,
  });

  useEffect(() => {
    if (linkedSelection?.kind === "visual" && !linkedSelection.isLinked) return;
    const selectedStillExists = selectedSegmentId
      ? editableTranscriptSegments.some((segment) => segment.segment_id === selectedSegmentId)
      : false;
    if (selectedStillExists) return;

    const fallbackSegment = resolvePlayheadSegment(editableTranscriptSegments, playheadSec)
      ?? editableTranscriptSegments[0]
      ?? null;
    const nextSegmentId = fallbackSegment?.segment_id ?? null;
    if (nextSegmentId === selectedSegmentId) return;
    applyLinkedSelectionState({
      selection: resolveSelectionFromTranscript({
        transcriptSegments: editableTranscriptSegments,
        visualItems: linkedSelectionVisualItems,
        anchorSegmentId: nextSegmentId,
        focusSegmentId: nextSegmentId,
        currentPrimaryVisualId: linkedSelection?.primaryVisualId ?? null,
      }),
      origin: "system",
      clearTranscriptTextRange: true,
    });
  }, [editableTranscriptSegments, linkedSelection, playheadSec, selectedSegmentId, sourceVisualPlacementItems]);

  useEffect(() => {
    if (linkedSelection?.kind === "visual" && !linkedSelection.isLinked) return;
    if (!transcriptSelectionAnchorSegmentId && !transcriptSelectionFocusSegmentId) return;

    const anchorExists = transcriptSelectionAnchorSegmentId
      ? editableTranscriptSegments.some((segment) => segment.segment_id === transcriptSelectionAnchorSegmentId)
      : false;
    const focusExists = transcriptSelectionFocusSegmentId
      ? editableTranscriptSegments.some((segment) => segment.segment_id === transcriptSelectionFocusSegmentId)
      : false;
    if (anchorExists && focusExists) return;

    const fallbackSegmentId = selectedSegmentId && editableTranscriptSegments.some(
      (segment) => segment.segment_id === selectedSegmentId,
    )
      ? selectedSegmentId
      : editableTranscriptSegments[0]?.segment_id ?? null;
    applyLinkedSelectionState({
      selection: resolveSelectionFromTranscript({
        transcriptSegments: editableTranscriptSegments,
        visualItems: linkedSelectionVisualItems,
        anchorSegmentId: fallbackSegmentId,
        focusSegmentId: fallbackSegmentId,
        currentPrimaryVisualId: linkedSelection?.primaryVisualId ?? null,
      }),
      origin: "system",
      clearTranscriptTextRange: true,
    });
  }, [
    editableTranscriptSegments,
    linkedSelection,
    selectedSegmentId,
    sourceVisualPlacementItems,
    transcriptSelectionAnchorSegmentId,
    transcriptSelectionFocusSegmentId,
  ]);

  useEffect(() => {
    setPlayheadSec((current) => (
      current > timelineDurationSec ? roundToTenth(timelineDurationSec) : current
    ));
  }, [timelineDurationSec]);

  useEffect(() => {
    setTimelineMarkers((current) => {
      const seen = new Set<number>();
      let changed = false;
      const next = current
        .map((marker) => {
          const clamped = Math.max(0, Math.min(timelineDurationSec, roundToTenth(marker.timeSec)));
          if (clamped !== marker.timeSec) changed = true;
          return {
            ...marker,
            timeSec: clamped,
          };
        })
        .filter((marker) => {
          if (seen.has(marker.timeSec)) {
            changed = true;
            return false;
          }
          seen.add(marker.timeSec);
          return true;
        });
      return changed ? next : current;
    });
  }, [timelineDurationSec]);

  useEffect(() => {
    if (!selectedSegmentId) return;
    const selected = editableTranscriptSegments.find((segment) => segment.segment_id === selectedSegmentId);
    if (!selected) return;

    const origin = selectionOriginRef.current;
    if (origin === "system") return;
    if (selectionRevealFrameRef.current != null) {
      window.cancelAnimationFrame(selectionRevealFrameRef.current);
      selectionRevealFrameRef.current = null;
    }

    selectionRevealFrameRef.current = window.requestAnimationFrame(() => {
      const line = transcriptLineRefs.current.get(selectedSegmentId) ?? null;
      if (line) {
        const parentScroll = line.closest(".hammer-bay-body");
        if (parentScroll instanceof HTMLElement) {
          const lineTop = line.offsetTop;
          const lineBottom = lineTop + line.offsetHeight;
          const viewTop = parentScroll.scrollTop;
          const viewBottom = viewTop + parentScroll.clientHeight;
          const comfortPadding = Math.min(84, Math.floor(parentScroll.clientHeight * 0.2));
          const inComfortBand = lineTop >= (viewTop + comfortPadding) && lineBottom <= (viewBottom - comfortPadding);
          if (origin !== "playhead" || !inComfortBand) {
            line.scrollIntoView({ block: "center", behavior: origin === "playhead" ? "auto" : "smooth" });
          }
        }
      }

      const trackScroll = timelineTrackScrollRef.current;
      if (trackScroll && timelineDurationSec > 0) {
        const midpoint = compositionTimeToTransportTime((selected.start_sec + selected.end_sec) / 2, compositionOffsetSec);
        const ratio = Math.max(0, Math.min(1, midpoint / timelineDurationSec));
        const targetPixel = ratio * trackScroll.scrollWidth;
        const viewLeft = trackScroll.scrollLeft;
        const viewRight = viewLeft + trackScroll.clientWidth;
        const comfortLeft = viewLeft + (trackScroll.clientWidth * 0.2);
        const comfortRight = viewRight - (trackScroll.clientWidth * 0.2);
        const inComfortBand = targetPixel >= comfortLeft && targetPixel <= comfortRight;
        if (origin !== "playhead" || !inComfortBand) {
          const centeredLeft = Math.max(0, targetPixel - (trackScroll.clientWidth / 2));
          trackScroll.scrollTo({
            left: centeredLeft,
            behavior: origin === "playhead" ? "auto" : "smooth",
          });
        }
      }

      selectionOriginRef.current = "system";
      selectionRevealFrameRef.current = null;
    });

    return () => {
      if (selectionRevealFrameRef.current != null) {
        window.cancelAnimationFrame(selectionRevealFrameRef.current);
        selectionRevealFrameRef.current = null;
      }
    };
  }, [compositionOffsetSec, editableTranscriptSegments, selectedSegmentId, timelineDurationSec]);

  const previousPlacementBoundaryRef = useRef<{
    selectedClipId: string | null;
    selectedSourceTab: HammerSourceTabId;
    currentPass: HammerPassId;
    initialized: boolean;
  }>({
    selectedClipId: null,
    selectedSourceTab,
    currentPass,
    initialized: false,
  });

  useEffect(() => {
    const previous = previousPlacementBoundaryRef.current;
    const placementBoundaryChanged = previous.initialized && (
      previous.selectedClipId !== selectedClipId
      || previous.selectedSourceTab !== selectedSourceTab
      || previous.currentPass !== currentPass
    );
    if (placementBoundaryChanged) {
      flushPendingPlacementDrafts();
    }
    previousPlacementBoundaryRef.current = {
      selectedClipId,
      selectedSourceTab,
      currentPass,
      initialized: true,
    };
  }, [currentPass, selectedClipId, selectedSourceTab]);

  useEffect(() => {
    let active = true;
    setReleasePrepLoading(true);
    setReleasePrepError(null);
    setLoadedPreparedPackage(null);
    setReleasePrepSaved(null);
    setStudioRackRenderStatus(null);

    void loadHammerPreparedReleasePackage(launchContext.workpiece_id)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setReleasePrepError(result.error);
          setReleasePrepLoading(false);
          return;
        }
        setLoadedPreparedPackage(result.exists ? (result.data ?? null) : null);
        setReleasePrepLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setReleasePrepError(toErrorMessage(error, "Hammer could not load prepared release package state."));
        setReleasePrepLoading(false);
      });

    return () => {
      active = false;
    };
  }, [launchContext.workpiece_id]);


  function updateSegmentTiming(
    segmentId: string,
    label: string,
    updater: (segment: HammerTranscriptSegment) => HammerTranscriptSegment,
    playheadUpdater?: (currentPlayheadSec: number) => number,
  ): void {
    applyHistoryMutation({
      label,
      kind: "timing_adjustment",
      affectedSegments: [segmentId],
      computeAfter: (before) => ({
        ...before,
        transcriptSegments: updateSegmentInTimeline(before.transcriptSegments, segmentId, updater),
        playheadSec: playheadUpdater ? playheadUpdater(before.playheadSec) : before.playheadSec,
        transcriptTimingHint: null,
      }),
    });
  }

  function moveSegment(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(
      segmentId,
      "Adjust segment timing",
      (segment) => moveSegmentTiming(segment, deltaSec),
      (current) => Math.max(0, roundToTenth(current + deltaSec)),
    );
  }

  function trimSegmentStart(segmentId: string, deltaSec: number): void {
    const segment = editableTranscriptSegments.find((candidate) => candidate.segment_id === segmentId) ?? null;
    if (!segment) return;
    const trimmed = trimSegmentStartTiming(segment, deltaSec);
    applyCompositionMutation({
      type: "TRANSCRIPT_TRIM_SEGMENT",
      label: "Trim segment start",
      kind: "timing_adjustment",
      segmentId,
      trimStartSec: trimmed.start_sec,
      trimEndSec: trimmed.end_sec,
    });
  }

  function trimSegmentEnd(segmentId: string, deltaSec: number): void {
    const segment = editableTranscriptSegments.find((candidate) => candidate.segment_id === segmentId) ?? null;
    if (!segment) return;
    const trimmed = trimSegmentEndTiming(segment, deltaSec);
    applyCompositionMutation({
      type: "TRANSCRIPT_TRIM_SEGMENT",
      label: "Trim segment end",
      kind: "timing_adjustment",
      segmentId,
      trimStartSec: trimmed.start_sec,
      trimEndSec: trimmed.end_sec,
    });
  }

  function markAudioCutBoundary(boundary: "start" | "end"): void {
    if (playbackTransportDurationSec <= 0) return;
    const markerTimeSec = Math.max(0, Math.min(playbackTransportDurationSec, roundToTenth(playheadSec)));
    if (boundary === "start") {
      setAudioCutSelectionStartSec(markerTimeSec);
      return;
    }
    setAudioCutSelectionEndSec(markerTimeSec);
  }

  function clearAudioCutSelection(): void {
    setAudioCutSelectionStartSec(null);
    setAudioCutSelectionEndSec(null);
  }

  function commitEditableAudioCut(args: {
    startSec: number | null;
    endSec: number | null;
    operationId?: string;
  }): boolean {
    const controller = historyControllerRef.current;
    if (!controller) return false;

    const beforeState = controller.getState();
    if (args.operationId) {
      const existing = beforeState.audioEdit?.operations ?? [];
      if (existing.some((op) => op.id === args.operationId)) {
        return false;
      }
    }

    const committed = commitAudioCutSelection({
      audioPolish: {
        ...buildNotStartedHammerAudioPolish(),
        audio_edit: cloneHammerAudioEdit(beforeState.audioEdit),
      },
      selection: {
        startSec: args.startSec,
        endSec: args.endSec,
      },
      durationSec: playbackTransportDurationSec,
      operationId: args.operationId,
    });
    if (!committed) return false;

    const applied = applyHistoryMutation({
      label: "Add audio cut",
      kind: "timing_adjustment",
      toolId: "polish",
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        audioEdit: cloneHammerAudioEdit(committed.audioPolish.audio_edit),
        transcriptTimingHint: null,
      }),
    });
    if (!applied) return false;

    setFocusOverride("time-focus");
    return true;
  }

  function applyCutSelectionsToAudioEdit(args: {
    audioEdit: HammerPersistedAudioEdit | null | undefined;
    cutSelections: Array<{ startSec: number; endSec: number }>;
    operationIdPrefix: string;
  }): HammerPersistedAudioEdit | null {
    let nextAudioEdit = cloneHammerAudioEdit(args.audioEdit);
    if (args.cutSelections.length === 0) {
      return nextAudioEdit;
    }

    let audioPolish = {
      ...buildNotStartedHammerAudioPolish(),
      audio_edit: cloneHammerAudioEdit(args.audioEdit),
    };
    for (let index = 0; index < args.cutSelections.length; index += 1) {
      const committed = commitAudioCutSelection({
        audioPolish,
        selection: args.cutSelections[index],
        durationSec: playbackTransportDurationSec,
        operationId: `${args.operationIdPrefix}:${index}`,
      });
      if (committed) {
        audioPolish = committed.audioPolish;
      }
    }
    nextAudioEdit = cloneHammerAudioEdit(audioPolish.audio_edit);
    return nextAudioEdit;
  }

  function applyDraftTranscriptEdits(
    segments: HammerTranscriptSegment[],
    draftTextBySegmentId: Record<string, string>,
  ): HammerTranscriptSegment[] {
    let updatedSegments = segments;
    for (const [segmentId, draftText] of Object.entries(draftTextBySegmentId)) {
      updatedSegments = updateSegmentInTimeline(
        updatedSegments,
        segmentId,
        (segment) => ({ ...segment, text: draftText }),
      );
    }
    return updatedSegments;
  }

  function commitTranscriptTextEdits(draftTextBySegmentId: Record<string, string>): {
    applied: boolean;
    playbackChanged: boolean;
  } {
    const controller = historyControllerRef.current;
    if (!controller) {
      return { applied: false, playbackChanged: false };
    }

    const beforeState = controller.getState();
    const updatedSegments = applyDraftTranscriptEdits(beforeState.transcriptSegments, draftTextBySegmentId);
    const textCutSelections = deriveAudioCutsForSubtractiveTextEdits({
      beforeSegments: beforeState.transcriptSegments,
      afterSegments: updatedSegments,
      durationSec: playbackTransportDurationSec,
    });
    const beforeAudioOpCount = beforeState.audioEdit?.operations?.length ?? 0;

    const applied = applyHistoryMutation({
      label: "Edit transcript",
      kind: "transcript_text_edit",
      affectedSegments: Object.keys(draftTextBySegmentId),
      immediatePersist: true,
      computeAfter: (before) => {
        const nextSegments = applyDraftTranscriptEdits(before.transcriptSegments, draftTextBySegmentId);
        const nextTextCutSelections = deriveAudioCutsForSubtractiveTextEdits({
          beforeSegments: before.transcriptSegments,
          afterSegments: nextSegments,
          durationSec: playbackTransportDurationSec,
        });
        return {
          ...before,
          transcriptSegments: nextSegments,
          audioEdit: applyCutSelectionsToAudioEdit({
            audioEdit: before.audioEdit,
            cutSelections: nextTextCutSelections,
            operationIdPrefix: "transcript-edit",
          }),
          transcriptTimingHint: null,
        };
      },
    });
    if (!applied) {
      return { applied: false, playbackChanged: false };
    }

    requestDurablePersistBoundary();

    const afterState = historyControllerRef.current?.getState() ?? null;
    const afterAudioOpCount = afterState?.audioEdit?.operations?.length ?? beforeAudioOpCount;
    return {
      applied: true,
      playbackChanged: textCutSelections.length > 0 && afterAudioOpCount > beforeAudioOpCount,
    };
  }

  function commitDeleteOnlyTranscriptEdits(edits: Array<{
    segmentId: string;
    nextText: string;
    deletion: HammerDeleteOnlyTranscriptDeletion;
    cutSelection: HammerAudioCutSelection | null;
  }>): {
    applied: boolean;
    playbackChanged: boolean;
    deletedTokenCount: number;
  } {
    const controller = historyControllerRef.current;
    if (!controller || edits.length === 0) {
      return { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    }

    const beforeState = controller.getState();
    const uniqueEdits = edits.filter((edit, index, allEdits) => (
      allEdits.findIndex((candidate) => candidate.segmentId === edit.segmentId) === index
    ));
    if (uniqueEdits.length === 0) {
      return { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    }

    const cutSelections = uniqueEdits
      .map((edit) => edit.cutSelection)
      .filter((selection): selection is HammerAudioCutSelection => Boolean(selection));
    if (cutSelections.length !== uniqueEdits.length) {
      return { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    }
    const transcriptChanged = uniqueEdits.some((edit) => {
      const baseline = beforeState.transcriptSegments.find((segment) => segment.segment_id === edit.segmentId)?.text ?? null;
      return baseline != null && baseline !== edit.nextText;
    });
    if (!transcriptChanged && cutSelections.length === 0) {
      return { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    }

    const beforeAudioOpCount = beforeState.audioEdit?.operations?.length ?? 0;
    const applied = applyHistoryMutation({
      label: "Delete transcript tokens",
      kind: "transcript_text_edit",
      affectedSegments: uniqueEdits.map((edit) => edit.segmentId),
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        transcriptSegments: uniqueEdits.reduce((segments, edit) => updateSegmentInTimeline(
          segments,
          edit.segmentId,
          (segment) => ({ ...segment, text: edit.nextText }),
        ), before.transcriptSegments),
        audioEdit: applyCutSelectionsToAudioEdit({
          audioEdit: before.audioEdit,
          cutSelections,
          operationIdPrefix: "transcript-delete",
        }),
        transcriptTimingHint: null,
      }),
    });
    if (!applied) {
      return { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    }

    requestDurablePersistBoundary();

    const afterState = historyControllerRef.current?.getState() ?? null;
    const afterAudioOpCount = afterState?.audioEdit?.operations?.length ?? beforeAudioOpCount;
    return {
      applied: true,
      playbackChanged: cutSelections.length > 0 && afterAudioOpCount > beforeAudioOpCount,
      deletedTokenCount: uniqueEdits.reduce((count, edit) => count + edit.deletion.deletedTokenCount, 0),
    };
  }

  function applyAudioCutSelection(): void {
    const applied = commitEditableAudioCut({
      startSec: audioCutSelectionStartSec,
      endSec: audioCutSelectionEndSec,
    });
    if (!applied) {
      return;
    }
    setAudioCutSelectionStartSec(null);
    setAudioCutSelectionEndSec(null);
  }

  function acceptSilenceCutSuggestion(suggestionId: string): void {
    const suggestion = visibleSilenceCutSuggestions.find((item) => item.id === suggestionId) ?? null;
    if (!suggestion) {
      return;
    }
    const applied = commitEditableAudioCut({
      startSec: suggestion.startSec,
      endSec: suggestion.endSec,
    });
    if (!applied) {
      return;
    }
    setDismissedSilenceSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestionId);
      return next;
    });
  }

  function dismissSilenceCutSuggestion(suggestionId: string): void {
    setDismissedSilenceSuggestionIds((current) => {
      const next = new Set(current);
      next.add(suggestionId);
      return next;
    });
  }

  function splitSelectedSegmentAtPlayhead(): void {
    if (!selectedSegmentId) {
      setTranscriptTimingHint("Select a segment to split.");
      return;
    }

    const state = historyControllerRef.current?.getState() ?? null;
    if (!state) {
      setTranscriptTimingHint("Split could not resolve the current workspace state.");
      return;
    }
    const boundaries = resolveTimelineBoundaryTimes(state.transcriptSegments);
    const snappedPlayhead = snapPlayheadToBoundary({
      nextPlayheadSec: state.playheadSec,
      boundaryTimesSec: boundaries,
      toleranceSec: PLAYHEAD_SNAP_TOLERANCE_SEC,
    });

    const applied = applyCompositionMutation({
      type: "TRANSCRIPT_SPLIT",
      label: "Split segment at playhead",
      kind: "segment_structure",
      segmentId: selectedSegmentId,
      splitTimeSec: snappedPlayhead,
      immediatePersist: true,
    });

    if (!applied) {
      setTranscriptTimingHint("Playhead must sit within the selected segment to split.");
      return;
    }

    const nextSelection = historyControllerRef.current?.getState().selectedSegmentId ?? null;
    setTranscriptSelectionAnchorSegmentId(nextSelection);
    setTranscriptSelectionFocusSegmentId(nextSelection);
    setFocusOverride("time-focus");
  }

  function deleteSelectedSegmentAndRipple(): void {
    if (!selectedSegmentId) {
      setTranscriptTimingHint("Select a segment to delete.");
      return;
    }

    const applied = applyCompositionMutation({
      type: "TRANSCRIPT_DELETE_RANGE",
      label: "Delete segment and ripple",
      kind: "segment_structure",
      segmentIds: [selectedSegmentId],
      immediatePersist: true,
    });

    if (!applied) {
      setTranscriptTimingHint("Selected segment could not be deleted.");
      return;
    }

    const nextSelection = historyControllerRef.current?.getState().selectedSegmentId ?? null;
    setTranscriptSelectionAnchorSegmentId(nextSelection);
    setTranscriptSelectionFocusSegmentId(nextSelection);
    setFocusOverride("time-focus");
  }

  function selectAdjacentSegment(direction: "previous" | "next"): void {
    const nextSegmentId = resolveAdjacentSegmentSelection(
      editableTranscriptSegments,
      selectedSegmentId,
      direction,
    );
    if (!nextSegmentId || nextSegmentId === selectedSegmentId) return;
    const nextSegment = editableTranscriptSegments.find((segment) => segment.segment_id === nextSegmentId) ?? null;
    if (!nextSegment) return;
    selectLinkedTimelineRange({
      startSec: nextSegment.start_sec,
      endSec: nextSegment.end_sec,
      segmentIds: [nextSegmentId],
      anchorId: nextSegmentId,
    });
  }

  function toggleSelectedSegmentDisabled(): void {
    if (!selectedSegmentId) {
      setTranscriptTimingHint("Select a segment to disable.");
      return;
    }

    const selected = editableTranscriptSegments.find((segment) => segment.segment_id === selectedSegmentId) ?? null;
    applyCompositionMutation({
      type: "TRANSCRIPT_TOGGLE_MUTE_SEGMENTS",
      label: selected?.is_disabled ? "Enable segment" : "Disable segment",
      kind: "segment_structure",
      segmentIds: [selectedSegmentId],
      disabled: selected?.is_disabled !== true,
      immediatePersist: true,
    });
  }

  function adjustSelectedSegmentGain(deltaDb: number): void {
    if (!selectedSegmentId) {
      setTranscriptTimingHint("Select a segment to adjust gain.");
      return;
    }

    applyHistoryMutation({
      label: deltaDb > 0 ? "Increase segment gain" : "Decrease segment gain",
      kind: "editor_state_change",
      toolId: "audio",
      affectedSegments: [selectedSegmentId],
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        transcriptSegments: updateSegmentInTimeline(
          before.transcriptSegments,
          selectedSegmentId,
          (segment) => updateSegmentGain(segment, deltaDb),
        ),
        transcriptTimingHint: null,
      }),
    });
  }

  function applyStudioRackMutation(
    label: string,
    updater: (current: HammerStudioRackState) => HammerStudioRackState,
  ): void {
    applyHistoryMutation({
      label,
      kind: "editor_state_change",
      toolId: "audio",
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        studioRack: normalizeHammerStudioRackState(
          updater(cloneHammerStudioRackState(before.studioRack)),
        ),
      }),
    });
    setFocusOverride("tool-focus");
  }

  function setStudioRackEnabled(nextEnabled: boolean): void {
    applyStudioRackMutation(nextEnabled ? "Enable Studio Rack" : "Disable Studio Rack", (current) => ({
      ...current,
      is_enabled: nextEnabled,
    }));
  }

  function setStudioRackBypassed(nextBypassed: boolean): void {
    applyStudioRackMutation(nextBypassed ? "Bypass Studio Rack" : "Un-bypass Studio Rack", (current) => ({
      ...current,
      is_bypassed: nextBypassed,
    }));
  }

  function setStudioRackBackend(nextBackend: "native" | "ffmpeg"): void {
    applyStudioRackMutation(
      nextBackend === "ffmpeg" ? "Set Studio Rack backend to FFmpeg" : "Set Studio Rack backend to native",
      (current) => ({
        ...current,
        backend_preference: nextBackend,
      }),
    );
  }

  function setStudioRackModuleEnabled(moduleId: keyof HammerStudioRackState["modules"], nextEnabled: boolean): void {
    applyStudioRackMutation(nextEnabled ? `Enable ${moduleId}` : `Disable ${moduleId}`, (current) => ({
      ...current,
      modules: {
        ...current.modules,
        [moduleId]: {
          ...current.modules[moduleId],
          is_enabled: nextEnabled,
        },
      },
    }));
  }

  function setStudioRackModuleBypassed(moduleId: keyof HammerStudioRackState["modules"], nextBypassed: boolean): void {
    applyStudioRackMutation(nextBypassed ? `Bypass ${moduleId}` : `Un-bypass ${moduleId}`, (current) => ({
      ...current,
      modules: {
        ...current.modules,
        [moduleId]: {
          ...current.modules[moduleId],
          is_bypassed: nextBypassed,
        },
      },
    }));
  }

  function setAudioFinalizationCompare(nextMode: HammerAudioFinalizationCompareMode): void {
    if (import.meta.env.DEV) {
      console.info("[Hammer][AudioFinalization] compare", {
        nextMode,
        hasHistoryController: Boolean(historyControllerRef.current),
      });
    }
    setAudioFinalizationCompareMode(nextMode);
    setStudioRackBypassed(nextMode === "before");
  }

  function applyVoicePolishPreset(nextPresetId: HammerVoicePolishPresetId): void {
    if (import.meta.env.DEV) {
      console.info("[Hammer][AudioFinalization] preset", {
        nextPresetId,
        hasHistoryController: Boolean(historyControllerRef.current),
        currentVoicePolish: editableStudioRack.voice_polish ?? null,
      });
    }
    applyStudioRackMutation("Apply audio preset", (current) => {
      const nextVoicePolish = applyHammerVoicePolishPreset(
        current.voice_polish ?? createDefaultHammerVoicePolishState(),
        nextPresetId,
      );
      return {
        ...current,
        is_enabled: true,
        is_bypassed: false,
        voice_polish: nextVoicePolish,
      };
    });
    applyPodcastMasterPass();
    setAudioFinalizationCompareMode("after");
  }

  function setVoicePolishFixEnabled(fixId: HammerVoicePolishFixId, nextEnabled: boolean): void {
    if (import.meta.env.DEV) {
      console.info("[Hammer][AudioFinalization] fix", {
        fixId,
        nextEnabled,
        hasHistoryController: Boolean(historyControllerRef.current),
        currentVoicePolish: editableStudioRack.voice_polish ?? null,
      });
    }
    applyStudioRackMutation(nextEnabled ? `Enable ${fixId}` : `Disable ${fixId}`, (current) => ({
      ...current,
      is_enabled: true,
      is_bypassed: false,
      voice_polish: setHammerVoicePolishFixEnabled(
        current.voice_polish ?? createDefaultHammerVoicePolishState(),
        fixId,
        nextEnabled,
      ),
    }));
    applyPodcastMasterPass();
    setAudioFinalizationCompareMode("after");
  }

  function setVoicePolishDeEsserStrength(nextStrength: HammerVoicePolishDeEsserStrength): void {
    applyStudioRackMutation("Update de-esser strength", (current) => ({
      ...current,
      is_enabled: true,
      is_bypassed: false,
      voice_polish: setHammerVoicePolishDeEsserStrength(
        current.voice_polish ?? createDefaultHammerVoicePolishState(),
        nextStrength,
      ),
    }));
    applyPodcastMasterPass();
    setAudioFinalizationCompareMode("after");
  }

  function setVoicePolishEqProfile(nextProfile: HammerVoicePolishEqProfile): void {
    applyStudioRackMutation("Update EQ profile", (current) => ({
      ...current,
      is_enabled: true,
      is_bypassed: false,
      voice_polish: setHammerVoicePolishEqProfile(
        current.voice_polish ?? createDefaultHammerVoicePolishState(),
        nextProfile,
      ),
    }));
    applyPodcastMasterPass();
    setAudioFinalizationCompareMode("after");
  }

  function applyTranscriptSelection(segmentId: string, extendRange: boolean): void {
    const segment = editableTranscriptSegments.find((item) => item.segment_id === segmentId) ?? null;
    if (!segment) return;

    const selectedRangeDetail = selectedTranscriptRangeDetailRef.current;
    const isSameSingleSegmentSelection = !extendRange
      && transcriptSelectionAnchorSegmentId === segmentId
      && transcriptSelectionFocusSegmentId === segmentId
      && transcriptSelectionRange.segmentIds.length === 1
      && transcriptSelectionRange.segmentIds[0] === segmentId
      && !selectedRangeDetail;
    if (isSameSingleSegmentSelection) {
      if (transcriptTimingHint) {
        setTranscriptTimingHint(null);
      }
      return;
    }

    const anchorSegmentId = extendRange && transcriptSelectionAnchorSegmentId
      ? transcriptSelectionAnchorSegmentId
      : segmentId;
    selectLinkedTranscriptTarget({
      anchorSegmentId,
      focusSegmentId: segmentId,
    });
    setTranscriptTimingHint(null);
  }

  function clearTranscriptSelection(): void {
    clearLinkedTranscriptSelection();
    setTranscriptTimingHint(null);
  }

  /*
    Transcript timing-input clamp hint contract:
    - show the hint only when the typed value was adjusted by clamping
    - preserve explicit comparisons like nextStart !== parsed and adjustedEnd !== parsed
  */

  function disableTranscriptSelection(): void {
    if (!hasTranscriptSelection) {
      setTranscriptTimingHint("Select transcript segments to disable.");
      return;
    }

    const selectedIdSet = new Set(transcriptSelectionRange.segmentIds);
    const selectedSegments = editableTranscriptSegments.filter((segment) => selectedIdSet.has(segment.segment_id));
    const targetDisabled = !selectedSegments.every((segment) => segment.is_disabled === true);

    applyCompositionMutation({
      type: "TRANSCRIPT_TOGGLE_MUTE_SEGMENTS",
      label: targetDisabled ? "Disable transcript selection" : "Enable transcript selection",
      kind: "segment_structure",
      segmentIds: transcriptSelectionRange.segmentIds,
      disabled: targetDisabled,
      immediatePersist: true,
    });
  }

  function cutTranscriptSelection(): void {
    if (!hasTranscriptSelection) {
      setTranscriptTimingHint("Select transcript segments to cut.");
      return;
    }

    const applied = applyCompositionMutation({
      type: "TRANSCRIPT_DELETE_RANGE",
      label: "Cut transcript selection",
      kind: "segment_structure",
      segmentIds: transcriptSelectionRange.segmentIds,
      immediatePersist: true,
    });

    if (!applied) {
      setTranscriptTimingHint("Transcript selection cut did not change the timeline.");
      return;
    }

    const state = historyControllerRef.current?.getState();
    const nextSelection = state?.selectedSegmentId ?? null;
    setTranscriptSelectionAnchorSegmentId(nextSelection);
    setTranscriptSelectionFocusSegmentId(nextSelection);
    setFocusOverride("time-focus");
  }

  function tightenTranscriptSelection(): void {
    if (!hasTranscriptSelection) {
      setTranscriptTimingHint("Select transcript segments to tighten.");
      return;
    }

    setFocusOverride("tool-focus");
  selectPass("transcript_cleanup");
    setCleanupReceipt(null);
    void (async () => {
      try {
        const assisted = await requestHammerTranscriptCleanupAssist({
          workspace_id: launchContext.workspace_id,
          workpiece_id: launchContext.workpiece_id,
          segments: editableTranscriptSegments,
          segment_ids: transcriptSelectionRange.segmentIds,
        });
        setCleanupPreview(assisted.preview);
        setTranscriptTimingHint(null);
      } catch (error) {
        setTranscriptTimingHint(
          error instanceof Error && error.message.trim()
            ? error.message
            : "Hammer could not run transcript cleanup assist.",
        );
      }
    })();
  }

  function resetHandledCandidates(kind: HammerCandidateReviewKind): void {
    handledCandidateIdsRef.current[kind] = new Set();
    lastHandledCandidateIdRef.current[kind] = null;
  }

  function rebuildCandidateQueue(args: {
    kind: HammerCandidateReviewKind;
    segments: HammerTranscriptSegment[];
    resetHandled?: boolean;
    preserveIndex?: number;
  }): void {
    if (args.resetHandled) {
      resetHandledCandidates(args.kind);
    }

    const handled = handledCandidateIdsRef.current[args.kind];
    const { cards } = buildCandidateQueue({
      kind: args.kind,
      segments: args.segments,
      fillerOptions: fillerCleanupOptions,
      retakeOptions: retakeCleanupOptions,
      handledCandidateIds: handled,
    });

    if (args.kind === "fillers") {
      setFillerCandidateCards(cards);
      setFillerActiveCandidateIndex((previous) => clampActiveCandidateIndex(
        args.preserveIndex ?? previous,
        cards.length,
      ));
    } else {
      setRetakeCandidateCards(cards);
      setRetakeActiveCandidateIndex((previous) => clampActiveCandidateIndex(
        args.preserveIndex ?? previous,
        cards.length,
      ));
    }
    // Avoid mixing queue review with one-off preview summaries.
    setCleanupPreview(null);
    setCleanupReceipt(null);
  }

  function refreshCandidateQueue(kind: HammerCandidateReviewKind): void {
    setActiveReviewKind(kind);
    setCandidateProposedRemovalById({});
    setCandidateReceiptByKind((current) => ({ ...current, [kind]: null }));
    rebuildCandidateQueue({
      kind,
      segments: editableTranscriptSegments,
      resetHandled: true,
      preserveIndex: 0,
    });
  }

  function handleCandidateDecision(
    kind: HammerCandidateReviewKind,
    approve: boolean,
  ): void {
    setActiveReviewKind(kind);
    const card = kind === "retakes" ? activeRetakeCandidateCard : activeFillerCandidateCard;
    if (!card) return;
    if (candidateDecisionInFlightRef.current[kind]) return;
    if (lastHandledCandidateIdRef.current[card.kind] === card.id) return;

    candidateDecisionInFlightRef.current[kind] = true;
    if (kind === "fillers") setFillerDecisionInFlight(true);
    else setRetakeDecisionInFlight(true);

    try {
      const preserveIndex = kind === "retakes" ? retakeActiveCandidateIndex : fillerActiveCandidateIndex;

      const beforeState = captureWorkspaceState();
      let nextSegments = beforeState.transcriptSegments;

      if (approve) {
        const removalDraft = resolveCandidateRemovalDraft(card);
        if (!removalDraft || removalDraft.segments.length === 0) {
          setTranscriptTimingHint("No proposed removal is available for this candidate.");
          lastHandledCandidateIdRef.current[card.kind] = null;
          return;
        }

        const uniqueRemovalSlices = removalDraft.segments.filter((slice, index, allSlices) => (
          allSlices.findIndex((candidate) => candidate.segmentId === slice.segmentId) === index
        ));
        const removalEdits = uniqueRemovalSlices.flatMap((slice) => {
          const segment = beforeState.transcriptSegments.find((item) => item.segment_id === slice.segmentId) ?? null;
          if (!segment) return [];
          const deletion = resolveDeleteOnlyTranscriptDeletion({
            text: String(segment.text ?? ""),
            selectionStart: slice.selectionStart,
            selectionEnd: slice.selectionEnd,
            direction: "selection",
          });
          if (!deletion) return [];
          const cutSelection = deriveDeleteOnlyTranscriptCutSelection({
            segment,
            deletion,
            audioDurationSec: playbackTransportDurationSec,
          });
          if (!cutSelection) return [];
          return [{
            segmentId: slice.segmentId,
            nextText: deletion.nextText,
            deletion,
            cutSelection,
          }];
        });

        if (removalEdits.length === 0) {
          setTranscriptTimingHint("Proposed removal did not resolve to a valid transcript deletion.");
          lastHandledCandidateIdRef.current[card.kind] = null;
          return;
        }

        const transcriptWouldChange = removalEdits.some((edit) => {
          const baseline = beforeState.transcriptSegments.find((segment) => segment.segment_id === edit.segmentId)?.text ?? null;
          return baseline != null && baseline !== edit.nextText;
        });
        const cutSelections = removalEdits.map((edit) => edit.cutSelection);

        if (!transcriptWouldChange && cutSelections.length === 0) {
          setCandidateReceiptByKind((current) => ({
            ...current,
            [card.kind]: "No-op: candidate approval produced no transcript or playback changes.",
          }));
          lastHandledCandidateIdRef.current[card.kind] = null;
          return;
        }

        const beforeAudioOpCount = beforeState.audioEdit?.operations?.length ?? 0;

        const applied = applyHistoryMutation({
          label: card.kind === "fillers" ? "Approve filler removal" : "Approve retake removal",
          kind: "cleanup_tool",
          toolId: "polish",
          affectedSegments: card.segmentIds,
          immediatePersist: true,
          computeAfter: (before) => {
            const remainingSegments = before.transcriptSegments.flatMap((segment) => {
              const edit = removalEdits.find((candidate) => candidate.segmentId === segment.segment_id) ?? null;
              if (!edit) return [segment];
              if (!edit.nextText.trim()) return [];
              return [{
                ...segment,
                text: edit.nextText,
              }];
            });
            const synced = syncEditableTranscriptSegments(remainingSegments, before.selectedSegmentId);
            const nextAudioEdit = applyCutSelectionsToAudioEdit({
              audioEdit: before.audioEdit,
              cutSelections,
              operationIdPrefix: `cleanup:${card.kind}:${card.id}`,
            });
            const afterAudioOpCount = nextAudioEdit?.operations?.length ?? 0;
            const changesCommitted = transcriptWouldChange || afterAudioOpCount !== (before.audioEdit?.operations?.length ?? 0);
            return {
              ...before,
              transcriptSegments: synced.segments,
              selectedSegmentId: synced.selectedSegmentId,
              audioEdit: nextAudioEdit,
              transcriptTimingHint: changesCommitted ? null : before.transcriptTimingHint,
            };
          },
        });
        if (!applied) {
          setCandidateReceiptByKind((current) => ({
            ...current,
            [card.kind]: "No-op: candidate approval did not commit any canonical changes.",
          }));
          lastHandledCandidateIdRef.current[card.kind] = null;
          return;
        }

        const afterState = historyControllerRef.current?.getState() ?? null;
        const afterAudioOpCount = afterState?.audioEdit?.operations?.length ?? beforeAudioOpCount;
        const committedCutCount = Math.max(0, afterAudioOpCount - beforeAudioOpCount);

        handledCandidateIdsRef.current[card.kind].add(card.id);
        lastHandledCandidateIdRef.current[card.kind] = card.id;

        if (import.meta.env.DEV && typeof window !== "undefined") {
          const enabled = Boolean((window as any).__forgeHammerDebugCandidateApproval__);
          if (enabled) {
            const effectiveRegions = getEffectiveCutRegions(afterState?.audioEdit ?? null, playbackTransportDurationSec);
            const seekTarget = afterState
              ? resolveNextAudiblePlaybackTime({
                requestedTimeSec: afterState.playheadSec,
                durationSec: playbackTransportDurationSec,
                effectiveCutRegions: effectiveRegions,
                transcriptSegments: afterState.transcriptSegments,
              })
              : null;
            // eslint-disable-next-line no-console
            console.debug("[HammerCandidateApproval]", {
              kind: card.kind,
              cardId: card.id,
              primarySegmentId: card.primarySegmentId,
              transcriptWouldChange,
              removalEdits: removalEdits.map((edit) => ({
                segmentId: edit.segmentId,
                deletedText: edit.deletion.deletedText,
                nextText: edit.nextText,
              })),
              plannedCutCount: cutSelections.length,
              beforeAudioOpCount,
              afterAudioOpCount,
              committedCutCount,
              effectiveCutRegions: effectiveRegions.length,
              seekTarget,
            });
          }
        }

        setCandidateReceiptByKind((current) => ({
          ...current,
          [card.kind]: committedCutCount > 0
            ? `Applied cleanup + ${committedCutCount} timeline cut${committedCutCount === 1 ? "" : "s"}.`
            : "Applied transcript cleanup (no new timeline cuts committed).",
        }));
        nextSegments = afterState?.transcriptSegments ?? nextSegments;
      } else {
        handledCandidateIdsRef.current[card.kind].add(card.id);
        lastHandledCandidateIdRef.current[card.kind] = card.id;
        setCandidateReceiptByKind((current) => ({
          ...current,
          [card.kind]: "Candidate discarded (no transcript or audio change).",
        }));
      }

      // Queue is always rebuilt from the current transcript state, not any cached candidate list.
      rebuildCandidateQueue({
        kind: card.kind,
        segments: nextSegments,
        preserveIndex,
      });
      // Keep the other queue in sync with the new canonical transcript without resetting handled/index.
      const otherKind: HammerCandidateReviewKind = kind === "fillers" ? "retakes" : "fillers";
      const otherIndex = otherKind === "retakes" ? retakeActiveCandidateIndex : fillerActiveCandidateIndex;
      rebuildCandidateQueue({
        kind: otherKind,
        segments: nextSegments,
        preserveIndex: otherIndex,
      });
    } finally {
      candidateDecisionInFlightRef.current[kind] = false;
      if (kind === "fillers") setFillerDecisionInFlight(false);
      else setRetakeDecisionInFlight(false);
    }
  }

  function analyzeDeadAirClosure(): void {
    setDeadAirAnalysis(analyzeDeadAirGaps(editableTranscriptSegments, deadAirThresholdSec));
  }

  function applyDeadAirClosureBatch(): void {
    if (deadAirApplyInFlight) return;
    setDeadAirApplyInFlight(true);
    try {
      const { segments: updated, analysis } = applyDeadAirClosure({
        segments: editableTranscriptSegments,
        thresholdSec: deadAirThresholdSec,
      });
      setDeadAirAnalysis(analysis);
      if (analysis.eligibleGapCount === 0) return;

      const cutSelections = deriveAudioCutsForDeadAirClosure({
        analysis,
        durationSec: playbackTransportDurationSec,
      });

      const affected = new Set<string>();
      for (const gap of analysis.gaps) {
        affected.add(gap.currentSegmentId);
        affected.add(gap.nextSegmentId);
      }

      const applied = applyHistoryMutation({
        label: `Trim dead air (${analysis.thresholdSec.toFixed(1)}s threshold)`,
        kind: "timing_adjustment",
        toolId: "polish",
        affectedSegments: Array.from(affected),
        immediatePersist: true,
        computeAfter: (before) => {
          const synced = syncEditableTranscriptSegments(updated, before.selectedSegmentId);
          let nextAudioEdit = cloneHammerAudioEdit(before.audioEdit);
          if (cutSelections.length > 0) {
            let audioPolish = {
              ...buildNotStartedHammerAudioPolish(),
              audio_edit: cloneHammerAudioEdit(before.audioEdit),
            };
            for (let index = 0; index < cutSelections.length; index += 1) {
              const selection = cutSelections[index];
              const operationId = `dead_air:${analysis.thresholdSec.toFixed(1)}:${index}`;
              const committed = commitAudioCutSelection({
                audioPolish,
                selection: { startSec: selection.startSec, endSec: selection.endSec },
                durationSec: playbackTransportDurationSec,
                operationId,
              });
              if (committed) {
                audioPolish = committed.audioPolish;
              }
            }
            nextAudioEdit = cloneHammerAudioEdit(audioPolish.audio_edit);
          }
          return {
            ...before,
            transcriptSegments: synced.segments,
            selectedSegmentId: synced.selectedSegmentId,
            audioEdit: nextAudioEdit,
            transcriptTimingHint: null,
          };
        },
      });
      if (!applied) return;
      setTranscriptTimingHint(`${analysis.eligibleGapCount} gap${analysis.eligibleGapCount === 1 ? "" : "s"} exceed ${analysis.thresholdSec.toFixed(1)}s; removed ${analysis.totalRemovableSec.toFixed(1)}s of dead air.`);
    } finally {
      setDeadAirApplyInFlight(false);
    }
  }

  useEffect(() => {
    if (currentPass === "transcript_cleanup" || currentPass === "retakes") {
      const nextActive: HammerCandidateReviewKind = currentPass === "retakes" ? "retakes" : "fillers";
      setActiveReviewKind(nextActive);
      rebuildCandidateQueue({
        kind: "fillers",
        segments: editableTranscriptSegments,
        resetHandled: true,
        preserveIndex: 0,
      });
      rebuildCandidateQueue({
        kind: "retakes",
        segments: editableTranscriptSegments,
        resetHandled: true,
        preserveIndex: 0,
      });
      return;
    }

    setFillerCandidateCards([]);
    setFillerActiveCandidateIndex(0);
    setFillerDecisionInFlight(false);
    setRetakeCandidateCards([]);
    setRetakeActiveCandidateIndex(0);
    setRetakeDecisionInFlight(false);
  }, [currentPass]);
  useEffect(() => {
    setAudioFinalizationCompareMode(editableStudioRack.is_bypassed ? "before" : "after");
  }, [editableStudioRack.is_bypassed]);
  useEffect(() => {
  }, [sourceImageItems]);
  useEffect(() => {
    setDeadAirAnalysis(null);
  }, [deadAirThresholdSec, editableTranscriptSegments]);

  const stepTimelineZoom = useCallback((direction: -1 | 1) => {
    setTimelineZoomPercent((current) => {
      const currentIndex = TIMELINE_ZOOM_LEVELS.findIndex((zoom) => zoom === current);
      const fallbackIndex = TIMELINE_ZOOM_LEVELS.findIndex((zoom) => zoom >= current);
      const resolvedIndex = currentIndex >= 0
        ? currentIndex
        : fallbackIndex >= 0
        ? fallbackIndex
        : TIMELINE_ZOOM_LEVELS.length - 1;
      const nextIndex = clampNumber(resolvedIndex + direction, 0, TIMELINE_ZOOM_LEVELS.length - 1);
      return TIMELINE_ZOOM_LEVELS[nextIndex] ?? current;
    });
  }, []);

  const zoomTimelineIn = useCallback(() => {
    stepTimelineZoom(1);
  }, [stepTimelineZoom]);

  const zoomTimelineOut = useCallback(() => {
    stepTimelineZoom(-1);
  }, [stepTimelineZoom]);

  const resetTimelineZoom = useCallback(() => {
    setTimelineZoomPercent(TIMELINE_ZOOM_LEVELS[0]);
  }, []);

  const handleTimelineTrackWheelZoom = useCallback((event: ReactWheelEvent<HTMLDivElement>): void => {
    if (isTextEditingTarget(event.target)) return;
    if (!(event.target instanceof Element)) return;
    const isOverTimelineSurface = Boolean(
      event.target.closest(".hammer-timeline-ruler, .hammer-timeline-lane__track"),
    );
    if (!isOverTimelineSurface) return;
    if (!event.ctrlKey) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    if (event.deltaY < 0) {
      zoomTimelineIn();
      return;
    }
    zoomTimelineOut();
  }, [zoomTimelineIn, zoomTimelineOut]);

  useEffect(() => {
    if (fillerCandidateCards.length === 0 && fillerActiveCandidateIndex !== 0) {
      setFillerActiveCandidateIndex(0);
      return;
    }
    if (fillerActiveCandidateIndex >= fillerCandidateCards.length && fillerCandidateCards.length > 0) {
      setFillerActiveCandidateIndex(fillerCandidateCards.length - 1);
    }
  }, [fillerActiveCandidateIndex, fillerCandidateCards.length]);
  useEffect(() => {
    if (retakeCandidateCards.length === 0 && retakeActiveCandidateIndex !== 0) {
      setRetakeActiveCandidateIndex(0);
      return;
    }
    if (retakeActiveCandidateIndex >= retakeCandidateCards.length && retakeCandidateCards.length > 0) {
      setRetakeActiveCandidateIndex(retakeCandidateCards.length - 1);
    }
  }, [retakeActiveCandidateIndex, retakeCandidateCards.length]);

  function applyCleanup(preview: HammerCleanupPreview): void {
    const toolId = preview.label.toLowerCase().replace(/\s+/g, "-");
    const summary = buildPolishResultSummaryFromCleanupPreview(preview);
    historyControllerRef.current?.createCheckpoint(`Before ${preview.label}`);
    const isSpeakerSoloApply = Boolean(preview.metadata?.speakerSolo);
    const isSpeakerInterviewApply = Boolean(preview.metadata?.speakerInterview);
    const isSpeakerMonologueApply = Boolean(preview.metadata?.speakerMonologue);
    const isSpeakerPanelApply = Boolean(preview.metadata?.speakerPanel);
    if ((isSpeakerSoloApply || isSpeakerInterviewApply || isSpeakerMonologueApply || isSpeakerPanelApply) && workspaceStructuredTranscript) {
      const nextLayerChanges = editableTranscriptSegments
        .map((segment) => {
          const nextSegment = preview.resultSegments.find((item) => item.segment_id === segment.segment_id) ?? null;
          if (!nextSegment) return null;
          const newlySuppressed = Boolean(nextSegment.is_disabled === true && segment.is_disabled !== true);
          const textChanged = nextSegment.text !== segment.text;
          if (!newlySuppressed && !textChanged) return null;
          const cleanedText = newlySuppressed ? "" : nextSegment.text;
          return {
            segment_id: segment.segment_id,
            original_text: segment.text,
            cleaned_text: cleanedText,
            operations: [{
              kind: newlySuppressed ? "retake_fragment_removed" as const : "filler_removed" as const,
              value: segment.text,
              start: 0,
              end: segment.text.length,
            }],
          };
        })
        .filter((change): change is NonNullable<typeof change> => Boolean(change));
      if (nextLayerChanges.length === 0) {
        setTranscriptTimingHint(
          isSpeakerSoloApply
            ? "Solo Mode found no non-target segments to suppress."
            : isSpeakerInterviewApply
            ? "Interview Mode found no respondent changes to apply."
            : isSpeakerPanelApply
            ? "Panel Mode found no low-signal cross-talk or backchannels to suppress."
            : "Monologue Cleanup found no qualifying interruptions or target-speaker cleanup to apply.",
        );
        return;
      }

      const nowIso = new Date().toISOString();
      const recipeRef = isSpeakerSoloApply
        ? `speaker_solo:${preview.metadata?.speakerSolo?.targetSpeaker.trim().toLowerCase() || "speaker"}`
        : isSpeakerInterviewApply
        ? `speaker_interview:${preview.metadata?.speakerInterview?.hostSpeaker.trim().toLowerCase() || "host"}->${preview.metadata?.speakerInterview?.respondentSpeaker.trim().toLowerCase() || "guest"}`
        : isSpeakerPanelApply
        ? `speaker_panel:${preview.metadata?.speakerPanel?.primarySpeakerBias ?? "balanced"}`
        : `speaker_monologue:${preview.metadata?.speakerMonologue?.targetSpeaker.trim().toLowerCase() || "speaker"}`;
      const layerLabel = formatOutputLayerLabelFromRecipeRef(recipeRef);
      const macroKind = isSpeakerSoloApply
        ? "speaker_solo" as const
        : isSpeakerInterviewApply
        ? "speaker_interview" as const
        : isSpeakerPanelApply
        ? "speaker_panel" as const
        : "speaker_monologue" as const;
      const layer = createHammerDerivedTextLayer({
        transcriptId: workspaceStructuredTranscript.transcript_id,
        recipeRef,
        macroKind,
        changes: nextLayerChanges,
        nowIso,
      });
      const beforeDerived = cloneHammerDerivedTextLayers(editableDerivedTextLayers);
      const withLayer = appendHammerDerivedTextLayer(workspaceStructuredTranscript, layer);
      const withLayerActive = setHammerDerivedTextLayerActive(withLayer, layer.layer_id);
      const afterDerived = cloneHammerDerivedTextLayers(withLayerActive.derived_text_layers);

      const historyEntry = applyHistoryMutation({
        label: `Apply ${layerLabel} as derived layer`,
        kind: "cleanup_tool",
        affectedSegments: nextLayerChanges.map((change) => change.segment_id),
        toolId,
        immediatePersist: true,
        computeAfter: (before) => ({
          ...before,
          transcriptTimingHint: null,
        }),
      });
      if (!historyEntry) return;

      setEditableDerivedTextLayers(afterDerived);
      derivedLayerHistoryRef.current.set(historyEntry.id, {
        before: beforeDerived,
        after: afterDerived,
        layerLabel,
      });
      setEditableOutputSelection((current) => normalizeHammerOutputSelectionRef({
        selection: current,
        layers: listHammerDerivedTextLayers(withLayerActive, { includeDiscarded: false }),
      }));
      setCleanupReceipt(summary);
      setTranscriptTimingHint("Applied as a derived transcript layer. Playback of source media is unchanged until a timeline edit or render is committed.");
      return;
    }

    const applied = applyCompositionMutation({
      type: "TRANSCRIPT_APPLY_CLEANUP_PREVIEW",
      label: preview.label,
      kind: "cleanup_tool",
      preview,
      toolId,
      immediatePersist: true,
    });
    if (applied) {
      setCleanupReceipt(summary);
      if (summary.estimatedSecondsSaved > 0) {
        setTranscriptTimingHint(`Applied ${preview.label}. Playback now follows the shortened timeline (${summary.estimatedSecondsSaved.toFixed(1)}s saved).`);
      } else {
        setTranscriptTimingHint(`Applied ${preview.label}. Playback is unchanged because this edit only changed transcript text.`);
      }
    }
  }

  function commitVisualAnchorRefinement(args: {
    clipId: string;
    anchorText: string;
    anchorLabel: string;
    detached: boolean;
    label: string;
  }): void {
    const nextAnchorText = args.anchorText.trim();
    const nextAnchorLabel = args.anchorLabel.trim();
    applyHistoryMutation({
      label: args.label,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [args.clipId],
      immediatePersist: true,
      computeAfter: (before) => {
        const timeline = resolveCanonicalVisualTimeline(before);
        const clip = selectClipById(timeline, args.clipId);
        if (!clip) return before;
        return applyVisualTimelineAction(before, {
          type: "RELABEL_CLIP_ANCHOR",
          clip_id: args.clipId,
          anchor_hint: {
            ...clip.anchor_hint,
            anchor_text: nextAnchorText.length > 0 ? nextAnchorText : null,
            anchor_label: nextAnchorLabel.length > 0 ? nextAnchorLabel : null,
            detached: args.detached,
          },
          updated_at: new Date().toISOString(),
        });
      },
    });
  }

  function updatePlacementKindFromMediaMap(placementId: string, nextType: HammerMediaMapSuggestionType): void {
    applyHistoryMutation({
      label: `Change visual type to ${nextType === "reference_clip" ? "Reference Clip" : "B-roll"}`,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => replaceVisualTimelineState(before, (timeline) => ({
        ...timeline,
        clips: timeline.clips.map((clip) => (
          clip.clip_id === placementId
            ? {
              ...clip,
              visual_mode: nextType === "reference_clip" ? "reference_clip" : "broll",
              label: clip.label ?? (nextType === "reference_clip" ? "Reference Clip" : "B-roll"),
            }
            : clip
        )),
      })),
    });
  }

  function redoMediaMapFromScript(): void {
    setRemovedMediaMapSegmentIds([]);
    const nextBeats = editableTranscriptSegments.slice(0, 12).map((segment) => {
      const suggested = resolveMediaMapSuggestionType(segment.text);
      const linkedPlacement = sourceVisualPlacementBySegmentId.get(segment.segment_id) ?? null;
      const linkedType: HammerMediaMapSuggestionType | null = linkedPlacement
        ? (linkedPlacement.kind === "reference_clip" ? "reference_clip" : "broll")
        : null;
      return {
        id: `map:${segment.segment_id}`,
        segmentId: segment.segment_id,
        sourceText: segment.text,
        suggestedType: suggested.type,
        selectedType: linkedType ?? suggested.type,
        reason: suggested.reason,
        tweak: "",
        linkedPlacementId: linkedPlacement?.id ?? null,
      } satisfies HammerMediaMapBeat;
    });
    setMediaMapBeats(nextBeats);
    setTranscriptTimingHint("Media Map regenerated from current transcript.");
  }

  function resolveHearthBrollSuggestion(args: {
    operationId: string;
    assetPath: string;
    label: string;
  }): void {
    const placementId = createVisualPlacementId();
    applyHistoryMutation({
      label: "Resolve Hearth B-roll suggestion",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const operation = graph.operations.find((item) => item.operation_id === args.operationId) ?? null;
        if (!operation || operation.instruction.type !== "insert_broll") return before;
        const startSec = Math.max(0, roundToTenth(operation.instruction.start_sec));
        const endSec = Math.max(startSec + 0.5, Math.min(transcriptDurationSec, roundToTenth(operation.instruction.end_sec)));
        const resolvedGraph = resolveInsertBrollSuggestionInGraph({
          graph,
          operationId: args.operationId,
          assetRef: args.assetPath,
          startSec,
          endSec,
        });
        if (!resolvedGraph) return before;
        const anchorSegment = before.transcriptSegments.find((segment) => segment.segment_id === operation.instruction.segment_id)
          ?? before.transcriptSegments[0]
          ?? null;
        if (!anchorSegment) return before;

        let nextGraph = resolvedGraph;
        if ((operation.instruction.duck_preference ?? "auto") === "auto") {
          nextGraph = appendAuthorityInstructionToGraph({
            graph: nextGraph,
            instruction: createAudioDuckInstruction({
              segmentId: anchorSegment.segment_id,
              startSec,
              endSec,
              duckGainDb: -9,
              linkedBrollOperationId: args.operationId,
            }),
            fallback: {
              graphId: `${launchContext.workpiece_id}:authority`,
              workspaceId: launchContext.workspace_id,
              workpieceId: launchContext.workpiece_id,
              sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
              sourceTranscriptId: transcriptSourceId,
            },
          });
          const duckOperationId = nextGraph.operations.at(-1)?.operation_id ?? null;
          nextGraph = updateResolvedInsertBrollOperationInGraph({
            graph: nextGraph,
            operationId: args.operationId,
            changes: {
              companion_audio_duck_operation_id: duckOperationId,
            },
          }) ?? nextGraph;
        }

        const brollPlacement: HammerVisualPlacementRecord = {
          placement_id: placementId,
          authority_operation_id: args.operationId,
          entry_id: `manual:${placementId}`,
          anchor_segment_id: anchorSegment.segment_id,
          matched_segment_ids: [anchorSegment.segment_id],
          anchor_text: anchorSegment.text,
          asset_ref: args.assetPath,
          asset_id: null,
          asset_path: args.assetPath,
          storage_key: args.assetPath,
          label: args.label,
          visual_mode: "broll",
          start_sec: startSec,
          end_sec: endSec,
          confidence: null,
          timing_source: "ordered_fallback",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
          overlay_geometry: {
            ...DEFAULT_VISUAL_PLACEMENT_GEOMETRY,
            x: 0.08,
            y: 0.08,
            width: 0.84,
            height: 0.84,
          },
          animation_preset: "none",
          overlay_opacity: 1,
          overlay_z_index: resolveCanonicalVisualTimeline(before).clips.length + 1,
        };
        const updatedAt = new Date().toISOString();
        const assetId = deriveStableHammerVisualAssetId(brollPlacement);
        const nextClip = migrateLegacyPlacementRecordToClip({
          record: brollPlacement,
          asset_id: assetId,
          updated_at: updatedAt,
        });
        const asset = migrateLegacyPlacementRecordToAsset({
          record: brollPlacement,
          asset_id: assetId,
          updated_at: updatedAt,
        });
        return applyVisualTimelineActions({
          ...before,
          editorialAuthorityGraph: nextGraph,
        }, [
          {
            type: "UPSERT_ASSETS",
            assets: [asset],
            updated_at: updatedAt,
          },
          {
            type: "CREATE_CLIP",
            clip: nextClip,
            updated_at: updatedAt,
          },
        ]);
      },
    });
  }

  function discardHearthBrollSuggestion(operationId: string): void {
    applyHistoryMutation({
      label: "Discard Hearth B-roll suggestion",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const next = setAuthorityOperationLifecycle({
          graph,
          operationId,
          lifecycle: "reverted",
        });
        if (!next) return before;
        return {
          ...before,
          editorialAuthorityGraph: next,
        };
      },
    });
  }

  function moveResolvedBrollBinding(operationId: string, deltaSec: number): void {
    applyHistoryMutation({
      label: "Move resolved b-roll binding",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const op = graph.operations.find((item) => item.operation_id === operationId) ?? null;
        if (!op || op.instruction.type !== "insert_broll" || op.instruction.asset_binding_state === "unresolved") {
          return before;
        }
        const duration = Math.max(0.5, roundToTenth(op.instruction.end_sec - op.instruction.start_sec));
        const candidateStart = Math.max(0, roundToTenth(op.instruction.start_sec + deltaSec));
        const maxStart = Math.max(0, roundToTenth(transcriptDurationSec - duration));
        const nextStart = Math.min(candidateStart, maxStart);
        const nextEnd = Math.min(transcriptDurationSec, roundToTenth(nextStart + duration));
        const nextGraph = updateResolvedInsertBrollOperationInGraph({
          graph,
          operationId,
          changes: {
            start_sec: nextStart,
            end_sec: nextEnd,
          },
        });
        if (!nextGraph) return before;
        const synchronizedGraph = synchronizeLinkedAudioDuckForBrollOperation({
          graph: nextGraph,
          brollOperationId: operationId,
        }) ?? nextGraph;
        return replaceVisualTimelineState({
          ...before,
          editorialAuthorityGraph: synchronizedGraph,
        }, (timeline) => ({
          ...timeline,
          clips: timeline.clips.map((clip) => (
            clip.authority_operation_id === operationId
              ? {
                ...clip,
                start_sec: nextStart,
                end_sec: nextEnd,
              }
              : clip
          )),
        }));
      },
    });
  }

  function trimResolvedBrollBinding(
    operationId: string,
    edge: "start" | "end",
    deltaSec: number,
  ): void {
    applyHistoryMutation({
      label: edge === "start" ? "Trim b-roll in point" : "Trim b-roll out point",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const op = graph.operations.find((item) => item.operation_id === operationId) ?? null;
        if (!op || op.instruction.type !== "insert_broll" || op.instruction.asset_binding_state === "unresolved") {
          return before;
        }
        let nextStart = op.instruction.start_sec;
        let nextEnd = op.instruction.end_sec;
        if (edge === "start") {
          nextStart = Math.max(0, roundToTenth(nextStart + deltaSec));
          nextStart = Math.min(nextStart, roundToTenth(nextEnd - 0.5));
        } else {
          nextEnd = Math.min(transcriptDurationSec, roundToTenth(nextEnd + deltaSec));
          nextEnd = Math.max(nextEnd, roundToTenth(nextStart + 0.5));
        }
        if (nextEnd <= nextStart) return before;
        const nextGraph = updateResolvedInsertBrollOperationInGraph({
          graph,
          operationId,
          changes: {
            start_sec: nextStart,
            end_sec: nextEnd,
          },
        });
        if (!nextGraph) return before;
        const synchronizedGraph = synchronizeLinkedAudioDuckForBrollOperation({
          graph: nextGraph,
          brollOperationId: operationId,
        }) ?? nextGraph;
        return replaceVisualTimelineState({
          ...before,
          editorialAuthorityGraph: synchronizedGraph,
        }, (timeline) => ({
          ...timeline,
          clips: timeline.clips.map((clip) => (
            clip.authority_operation_id === operationId
              ? {
                ...clip,
                start_sec: nextStart,
                end_sec: nextEnd,
              }
              : clip
          )),
        }));
      },
    });
  }

  function replaceResolvedBrollBinding(operationId: string, assetPath: string): void {
    applyHistoryMutation({
      label: "Replace resolved b-roll asset",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const op = graph.operations.find((item) => item.operation_id === operationId) ?? null;
        if (!op || op.instruction.type !== "insert_broll" || op.instruction.asset_binding_state === "unresolved") {
          return before;
        }
        const nextGraph = updateResolvedInsertBrollOperationInGraph({
          graph,
          operationId,
          changes: {
            asset_ref: assetPath,
          },
        });
        if (!nextGraph) return before;
        const synchronizedGraph = synchronizeLinkedAudioDuckForBrollOperation({
          graph: nextGraph,
          brollOperationId: operationId,
        }) ?? nextGraph;
        return replaceVisualTimelineState({
          ...before,
          editorialAuthorityGraph: synchronizedGraph,
        }, (timeline) => {
          const clip = timeline.clips.find((candidate) => candidate.authority_operation_id === operationId) ?? null;
          if (!clip) return timeline;
          const nextRecord: HammerVisualPlacementRecord = {
            placement_id: clip.clip_id,
            authority_operation_id: clip.authority_operation_id,
            entry_id: clip.entry_id ?? `manual:${clip.clip_id}`,
            anchor_segment_id: clip.anchor_hint.anchor_segment_id ?? "",
            matched_segment_ids: [...clip.anchor_hint.matched_segment_ids],
            anchor_text: clip.anchor_hint.anchor_text ?? null,
            asset_ref: assetPath,
            asset_id: null,
            asset_path: assetPath,
            storage_key: assetPath,
            label: clip.label,
            visual_mode: clip.visual_mode,
            start_sec: clip.start_sec,
            end_sec: clip.end_sec,
            confidence: clip.confidence,
            timing_source: "ordered_fallback",
            status: clip.placement_status,
            ingest_state: clip.ingest_state ?? undefined,
            uncertainty_flags: [...clip.uncertainty_flags],
            overlay_geometry: { ...clip.geometry },
            animation_preset: clip.animation.preset,
            overlay_opacity: clip.opacity,
            overlay_z_index: clip.z_index,
          };
          const assetId = deriveStableHammerVisualAssetId(nextRecord);
          const asset = migrateLegacyPlacementRecordToAsset({ record: nextRecord, asset_id: assetId, updated_at: new Date().toISOString() });
          return {
            ...timeline,
            assets: timeline.assets.some((item) => item.asset_id === assetId)
              ? timeline.assets.map((item) => (item.asset_id === assetId ? asset : item))
              : [...timeline.assets, asset],
            clips: timeline.clips.map((candidate) => (
              candidate.authority_operation_id === operationId
                ? {
                  ...candidate,
                  asset_id: assetId,
                  updated_at: asset.updated_at,
                }
                : candidate
            )),
          };
        });
      },
    });
  }

  function revertResolvedBrollBinding(operationId: string): void {
    applyHistoryMutation({
      label: "Revert resolved b-roll binding",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const brollOperation = graph.operations.find((item) => item.operation_id === operationId) ?? null;
        if (!brollOperation || brollOperation.instruction.type !== "insert_broll") return before;
        let nextGraph = setAuthorityOperationLifecycle({
          graph,
          operationId,
          lifecycle: "reverted",
        }) ?? graph;
        const companionDuckId = brollOperation.instruction.companion_audio_duck_operation_id ?? null;
        if (companionDuckId) {
          nextGraph = setAuthorityOperationLifecycle({
            graph: nextGraph,
            operationId: companionDuckId,
            lifecycle: "reverted",
          }) ?? nextGraph;
        }
        return replaceVisualTimelineState({
          ...before,
          editorialAuthorityGraph: nextGraph,
        }, (timeline) => ({
          ...timeline,
          clips: timeline.clips.filter((clip) => clip.authority_operation_id !== operationId),
          lanes: timeline.lanes.map((lane) => ({
            ...lane,
            clip_ids: lane.clip_ids.filter((clipId) => (
              timeline.clips.find((clip) => clip.clip_id === clipId)?.authority_operation_id !== operationId
            )),
          })),
          selected_clip_id: timeline.selected_clip_id
            && timeline.clips.find((clip) => clip.clip_id === timeline.selected_clip_id)?.authority_operation_id === operationId
            ? null
            : timeline.selected_clip_id,
        }));
      },
    });
  }

  function focusBoundAttentionOperation(operationId: string): void {
    selectPass("image_animation");
    setFocusOverride("tool-focus");
    setSelectedBoundBrollOperationId(operationId);
    const object = boundObjectById.get(operationId) ?? null;
    if (object) {
      seekPlayheadToTime(object.placement_window.start_sec, "playhead");
    }
  }

  function navigateBoundAttention(direction: "next" | "previous"): void {
    if (boundAttentionQueue.length === 0) return;
    const currentIndex = selectedAttentionIndex;
    const nextIndex = direction === "next"
      ? (currentIndex >= 0 ? (currentIndex + 1) % boundAttentionQueue.length : 0)
      : (currentIndex >= 0 ? (currentIndex - 1 + boundAttentionQueue.length) % boundAttentionQueue.length : boundAttentionQueue.length - 1);
    const target = boundAttentionQueue[nextIndex] ?? null;
    if (!target) return;
    focusBoundAttentionOperation(target.operationId);
  }

  function focusReadinessIssue(): void {
    const operationId = readinessVerdict.primaryOperationId
      ?? readinessGate.primary_operation_id
      ?? boundAttentionQueue[0]?.operationId
      ?? unresolvedBrollSuggestionItems[0]?.operationId
      ?? null;
    if (!operationId) return;
    focusBoundAttentionOperation(operationId);
  }

  function addMinimalTransition(transitionType: "hard_cut" | "crossfade" | "dip_to_black" | "fade_audio"): void {
    applyHistoryMutation({
      label: `Add ${transitionType.replace("_", " ")}`,
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const segment = before.selectedSegmentId
          ? before.transcriptSegments.find((item) => item.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!segment) return before;
        const startSec = Math.max(0, roundToTenth(before.playheadSec));
        const defaultDuration = transitionType === "hard_cut" ? 0.1 : transitionType === "crossfade" ? 0.6 : 0.5;
        const endSec = Math.min(transcriptDurationSec, roundToTenth(startSec + defaultDuration));
        const instruction = transitionType === "hard_cut"
          ? createHardCutInstruction({
            segmentId: segment.segment_id,
            startSec,
            endSec: Math.max(startSec + 0.1, endSec),
          })
          : transitionType === "crossfade"
          ? createCrossfadeInstruction({
            segmentId: segment.segment_id,
            nextSegmentId: before.transcriptSegments.find((item) => item.start_sec >= segment.end_sec)?.segment_id ?? segment.segment_id,
            durationSec: Math.max(0.1, endSec - startSec),
            startSec,
            endSec: Math.max(startSec + 0.1, endSec),
          })
          : transitionType === "dip_to_black"
          ? createDipToBlackInstruction({
            segmentId: segment.segment_id,
            startSec,
            endSec: Math.max(startSec + 0.1, endSec),
          })
          : createFadeAudioInstruction({
            segmentId: segment.segment_id,
            startSec,
            endSec: Math.max(startSec + 0.1, endSec),
            fadeCurve: "linear",
          });
        const nextGraph = appendAuthorityInstructionForState(before, instruction);
        return {
          ...before,
          editorialAuthorityGraph: nextGraph,
        };
      },
    });
  }

  function applyPodcastMasterPass(): void {
    applyHistoryMutation({
      label: "Apply Podcast Master pass",
      kind: "editor_state_change",
      toolId: "audio",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const existingActive = graph.operations.find((operation) => (
          operation.lifecycle === "active"
          && operation.instruction.type === "podcast_master_pass"
        ));
        if (existingActive) return before;
        const segment = before.selectedSegmentId
          ? before.transcriptSegments.find((item) => item.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!segment) return before;
        const instruction = createPodcastMasterPassInstruction({
          segmentId: segment.segment_id,
          noiseCleanup: "light",
          normalizationLufs: -16,
          compressionAmount: "medium",
          limiterCeilingDbtp: -1,
        });
        return {
          ...before,
          editorialAuthorityGraph: appendAuthorityInstructionForState(before, instruction),
        };
      },
    });
  }

  function applyLookPresetSelection(preset: HammerVisualLutPreset | "neutral"): void {
    if ((activeLookPreset ?? "neutral") === preset) {
      return;
    }

    applyHistoryMutation({
      label: preset === "neutral"
        ? "Clear look preset"
        : `Apply ${preset.replace(/_/g, " ")} look`,
      kind: "editor_state_change",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        let graph = before.editorialAuthorityGraph;
        if (!graph) return before;

        for (const operation of graph.operations) {
          if (operation.lifecycle !== "active" || operation.instruction.type !== "apply_look") continue;
          graph = setAuthorityOperationLifecycle({
            graph,
            operationId: operation.operation_id,
            lifecycle: "superseded",
          }) ?? graph;
        }

        if (preset === "neutral") {
          return {
            ...before,
            editorialAuthorityGraph: graph,
          };
        }

        const segment = before.selectedSegmentId
          ? before.transcriptSegments.find((item) => item.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!segment) {
          return {
            ...before,
            editorialAuthorityGraph: graph,
          };
        }

        const instruction = createApplyLookInstruction({
          segmentId: segment.segment_id,
          preset,
        });

        return {
          ...before,
          editorialAuthorityGraph: appendAuthorityInstructionForState({
            ...before,
            editorialAuthorityGraph: graph,
          }, instruction),
        };
      },
    });
  }

  function applyExposureAdjustment(nextExposure: number): void {
    const normalizedExposure = Math.max(-100, Math.min(100, Math.round(nextExposure)));
    if ((activeExposureAdjustment ?? 0) === normalizedExposure) {
      return;
    }

    applyHistoryMutation({
      label: normalizedExposure === 0
        ? "Reset exposure"
        : `Set exposure to ${normalizedExposure > 0 ? "+" : ""}${normalizedExposure}`,
      kind: "editor_state_change",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        let graph = before.editorialAuthorityGraph;
        if (!graph) return before;

        for (const operation of graph.operations) {
          if (operation.lifecycle !== "active" || operation.instruction.type !== "apply_exposure") continue;
          graph = setAuthorityOperationLifecycle({
            graph,
            operationId: operation.operation_id,
            lifecycle: "superseded",
          }) ?? graph;
        }

        if (normalizedExposure === 0) {
          return {
            ...before,
            editorialAuthorityGraph: graph,
          };
        }

        const segment = before.selectedSegmentId
          ? before.transcriptSegments.find((item) => item.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!segment) {
          return {
            ...before,
            editorialAuthorityGraph: graph,
          };
        }

        const instruction = createApplyExposureInstruction({
          segmentId: segment.segment_id,
          exposure: normalizedExposure,
        });

        return {
          ...before,
          editorialAuthorityGraph: appendAuthorityInstructionForState({
            ...before,
            editorialAuthorityGraph: graph,
          }, instruction),
        };
      },
    });
  }

  function selectOutputLayerForExport(layerId: string | null): void {
    const targetLayer = layerId
      ? outputLayerCandidates.find((layer) => layer.layer_id === layerId) ?? null
      : null;
    const nextSelection: HammerOutputSelectionState = {
      layerId: targetLayer?.layer_id ?? null,
      sourceRecipeRef: targetLayer?.recipe_ref ?? null,
    };
    if (
      nextSelection.layerId === editableOutputSelection.layerId
      && nextSelection.sourceRecipeRef === editableOutputSelection.sourceRecipeRef
    ) {
      return;
    }

    applyHistoryMutation({
      label: targetLayer
        ? `Set export output to ${formatOutputLayerLabel(targetLayer)}`
        : "Set export output to Raw transcript",
      kind: "output_selection",
      toolId: "export",
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        outputSelection: {
          layerId: nextSelection.layerId,
          sourceRecipeRef: nextSelection.sourceRecipeRef,
        },
      }),
    });
  }

  function selectViewingLayer(layerId: string | null): void {
    if (!workspaceStructuredTranscript) return;
    const currentLayerId = workspaceStructuredTranscript.derived_text_layers?.active_layer_id ?? null;
    if (currentLayerId === layerId) return;

    const withActiveLayer = setHammerDerivedTextLayerActive(workspaceStructuredTranscript, layerId);
    const beforeDerived = cloneHammerDerivedTextLayers(workspaceStructuredTranscript.derived_text_layers);
    const afterDerived = cloneHammerDerivedTextLayers(withActiveLayer.derived_text_layers);
    const targetLayer = layerId
      ? listHammerDerivedTextLayers(withActiveLayer, { includeDiscarded: false }).find((layer) => layer.layer_id === layerId) ?? null
      : null;
    const layerLabel = targetLayer ? formatOutputLayerLabel(targetLayer) : "Raw transcript";

    const historyEntry = applyHistoryMutation({
      label: targetLayer ? `Switch viewing layer to ${layerLabel}` : "Switch viewing layer to Raw transcript",
      kind: "editor_state_change",
      toolId: "polish",
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        transcriptTimingHint: null,
      }),
    });
    if (!historyEntry) return;

    setEditableDerivedTextLayers(afterDerived);
    derivedLayerHistoryRef.current.set(historyEntry.id, {
      before: beforeDerived,
      after: afterDerived,
      layerLabel,
    });
  }

  function jumpToHistoryEntry(entryId: string): void {
    const controller = historyControllerRef.current;
    const baseline = historyBaselineStateRef.current;
    if (!controller || !baseline) return;
    if (!historyEntryById.has(entryId)) return;

    const currentPath = [
      ...controller.document.undoStack,
      ...[...controller.document.redoStack].reverse(),
    ];
    const targetIndex = currentPath.indexOf(entryId);
    const targetPath = targetIndex >= 0
      ? currentPath.slice(0, targetIndex + 1)
      : buildHistoryPathToEntry(entryId);
    const nextRedo = targetIndex >= 0
      ? currentPath.slice(targetIndex + 1).reverse()
      : [];
    const replayed = controller.getReplayStateFromBaseline(baseline, entryId);

    controller.document.undoStack = [...targetPath];
    controller.document.redoStack = [...nextRedo];
    controller.document.headEntryId = entryId;
    controller.document.updatedAt = new Date().toISOString();
    controller.replaceState(replayed);

    applyWorkspaceState(replayed);
    setEditableDerivedTextLayers(resolveDerivedLayersForUndoStack(targetPath));
    setHistoryStatus(nextRedo.length > 0 ? "History jump mode: reviewing a past state." : null);
    selectionOriginRef.current = "system";
    setFocusOverride("source-focus");
    scheduleHistoryPersist();
  }

  function restoreCurrentHistoryState(): void {
    const controller = historyControllerRef.current;
    if (!controller || controller.document.redoStack.length === 0) return;
    controller.document.redoStack = [];
    controller.document.updatedAt = new Date().toISOString();
    setHistoryStatus("Restored this state. Future history steps were cleared.");
    scheduleHistoryPersist(true);
  }

  const { workspaceFocusMode } = useHammerWorkspaceShellShortcuts({
    activeTool,
    focusOverride,
    isTranscriptCandidateReviewPass,
    isTranscriptToolSurface,
    activeTranscriptToolSection,
    activeReviewKind,
    activeFillerCandidateCard,
    activeRetakeCandidateCard,
    fillerCandidateCardsLength: fillerCandidateCards.length,
    retakeCandidateCardsLength: retakeCandidateCards.length,
    fillerDecisionInFlight,
    retakeDecisionInFlight,
    deadAirAnalysis,
    deadAirApplyInFlight,
    zoomTimelineIn,
    zoomTimelineOut,
    setActiveReviewKind,
    setActiveTranscriptToolSection,
    setFocusOverride,
    setFillerActiveCandidateIndex,
    setRetakeActiveCandidateIndex,
    handleCandidateDecision,
    selectPass,
    analyzeDeadAirClosure,
    applyDeadAirClosureBatch,
    nudgePlayhead,
    selectAdjacentSegment,
    jumpToSelectionBoundary,
    jumpToEditPoint,
    jumpToMarker,
    togglePlayback,
    splitSelectedSegmentAtPlayhead,
    toggleSelectionLoopPlayback,
    playSelectionWithRoll,
    addMarkerAtPlayhead,
    deleteSelectedSegmentAndRipple,
    clearTranscriptSelection,
    toggleSelectedSegmentDisabled,
    adjustSelectedSegmentGain,
    undoHistory,
    redoHistory,
  });

  const exportBasis = useMemo(() => {
    const exportTranscriptSegments = editableTranscriptSegments.filter((segment) => !segment.is_disabled);
    const transcriptForReleaseBase = preserveTranscriptMetadata(
      exportTranscriptSegments,
      workspaceStructuredTranscript ?? null,
      mediaRef,
      transcriptSourceId,
    );
    let transcriptForRelease = setHammerDerivedTextLayerOutput(
      transcriptForReleaseBase,
      editableOutputSelection.layerId,
    );
    const selectedLayer = transcriptForRelease.derived_text_layers?.layers.find(
      (layer) => layer.layer_id === editableOutputSelection.layerId && layer.status !== "discarded",
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
    const captionBasisFingerprint = buildCaptionBasisFingerprint({
      transcript: transcriptForRelease,
      outputLayerId: editableOutputSelection.layerId,
      outputRecipeRef: editableOutputSelection.sourceRecipeRef,
      formatting: captionFormatting,
    });
    const hasCurrentCaptionBuild = captionBuildState?.fingerprint === captionBasisFingerprint;
    const hasCurrentEditedCaptions = captionEditedState?.baseFingerprint === captionBasisFingerprint;
    const captionForRelease = hasCurrentEditedCaptions && captionEditedState
      ? {
        generatedAt: captionEditedState.updatedAt,
        approximateTiming: captionEditedState.approximateTiming,
        entryCount: captionEditedState.chunkCount,
        srt: captionEditedState.srt,
        vtt: captionEditedState.vtt,
      }
      : hasCurrentCaptionBuild && captionBuildState
      ? {
        generatedAt: captionBuildState.builtAt,
        approximateTiming: captionBuildState.approximateTiming,
        entryCount: captionBuildState.chunkCount,
        srt: captionBuildState.srt,
        vtt: captionBuildState.vtt,
      }
      : null;
    if (captionForRelease) {
      transcriptForRelease = {
        ...transcriptForRelease,
        subtitle_outputs: {
          schema_version: 1,
          last_generated_format: selectedCaptionArtifactFormat,
          srt: {
            format: "srt",
            generated_at: captionForRelease.generatedAt,
            source_transcript_id: transcriptForRelease.transcript_id,
            source_layer_id: editableOutputSelection.layerId ?? null,
            source_kind: editableOutputSelection.layerId ? "derived" : "raw",
            source_recipe_ref: editableOutputSelection.sourceRecipeRef ?? null,
            approximate_timing: captionForRelease.approximateTiming,
            entry_count: captionForRelease.entryCount,
            content: captionForRelease.srt,
          },
          vtt: {
            format: "vtt",
            generated_at: captionForRelease.generatedAt,
            source_transcript_id: transcriptForRelease.transcript_id,
            source_layer_id: editableOutputSelection.layerId ?? null,
            source_kind: editableOutputSelection.layerId ? "derived" : "raw",
            source_recipe_ref: editableOutputSelection.sourceRecipeRef ?? null,
            approximate_timing: captionForRelease.approximateTiming,
            entry_count: captionForRelease.entryCount,
            content: captionForRelease.vtt,
          },
        },
      };
    }
    const editPlan = launchContext.edit_plan
      ? {
        ...launchContext.edit_plan,
        instructions: launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
      }
      : createFallbackEditPlan(launchContext, transcriptSourceId, previewMode);
    const canonicalGraph = editableEditorialAuthorityGraph
      ? {
        ...editableEditorialAuthorityGraph,
        updated_at: new Date().toISOString(),
      }
      : projectEditorialAuthorityGraphFromEditPlan({
        editPlan,
        workspaceId: launchContext.workspace_id,
        workpieceId: launchContext.workpiece_id,
        sessionId: launchContext.session_id ?? editPlan.session_id ?? `${launchContext.workpiece_id}:session`,
      });
    const canonicalEditPlan = projectEditPlanFromEditorialAuthorityGraph({
      graph: canonicalGraph,
      fallback: editPlan,
    });
    const timelineRevision = createSemanticEditPlanSignature(
      transcriptSourceId,
      previewMode,
      canonicalEditPlan.instructions,
    );
    const renderAssembly = buildHammerRenderAssembly({
      canonicalGraph,
      runtimeCapabilities: {
        ...HAMMER_RENDER_RUNTIME_CAPABILITIES,
        export_supported_operation_types: studioRackRenderBackendResolution.ffmpegAvailable
          ? [...HAMMER_RENDER_RUNTIME_CAPABILITIES.export_supported_operation_types, "podcast_master_pass"]
          : HAMMER_RENDER_RUNTIME_CAPABILITIES.export_supported_operation_types,
        podcast_master: {
          available: studioRackRenderBackendResolution.ffmpegAvailable,
          preview_supported: false,
          stages: {
            normalize: studioRackRenderBackendResolution.ffmpegAvailable,
            compress: studioRackRenderBackendResolution.ffmpegAvailable,
            limit: studioRackRenderBackendResolution.ffmpegAvailable,
            noise_cleanup_light: studioRackRenderBackendResolution.ffmpegAvailable,
          },
        },
      },
      transcriptSegments: transcriptForRelease.segments.map((segment) => ({
        segment_id: segment.segment_id,
        start_sec: segment.start_sec,
        end_sec: segment.end_sec,
      })),
      captionChunks: buildHammerCaptionPreviewModel(
        transcriptForRelease.segments,
        transcriptForRelease,
      ).chunks.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        start_sec: chunk.start_sec,
        end_sec: chunk.end_sec,
        segment_ids: [...chunk.segment_ids],
      })),
    });
    const currentReleasePackage = buildHammerReleasePrepPackage({
      workspaceId: launchContext.workspace_id,
      workpieceId: launchContext.workpiece_id,
      prepStatus: transcriptForRelease.segments.length > 0 ? "prepared" : "idle",
      alignmentStatus: transcriptForRelease.segments.length > 0 ? "aligned" : "not_started",
      structuredTranscript: transcriptForRelease,
      visualPlacements: editableVisualTimeline
        ? deriveLegacyVisualPlacementsFromTimeline(editableVisualTimeline)
        : editableVisualPlacements,
      audioPolish: editableAudioPolish,
      editorSession: {
        schema_version: 1,
        session_id: launchContext.session_id ?? editPlan.session_id ?? `${launchContext.workpiece_id}:session`,
        source_mode: launchContext.source_mode,
        preview_mode: previewMode,
        transcript_source_id: transcriptSourceId,
        selected_segment_id: selectedSegmentId,
        selected_overlay_row_id: selectedClipId,
        media_ref: mediaRef ? { ...mediaRef } : null,
        workspace_mapping: workspaceMapping ? { ...workspaceMapping } : null,
        media_source_label: mediaSourceLabel,
        visual_preview: {
          white_balance: visualWhiteBalance,
          color_amount: visualColorAmount,
          background_blur: visualBackgroundBlur,
          eye_contact_assist_enabled: visualEyeContactAssistEnabled,
          eye_contact_assist_strength: visualEyeContactAssistStrength,
          background_blur_px: visualBackgroundBlurPx,
          background_blur_feather_px: visualBackgroundBlurFeatherPx,
          background_blur_temporal_smoothing: visualBackgroundBlurTemporalSmoothing,
          background_blur_subject_expansion_px: visualBackgroundBlurSubjectExpansionPx,
          background_blur_quality_mode: visualBackgroundBlurQualityMode,
          background_blur_fallback_mode: visualBackgroundBlurFallbackMode,
          background_blur_provider: visualBackgroundBlurProviderId ?? "mediapipe_selfie_segmentation",
          background_replace_enabled: visualBackgroundReplaceEnabled,
          background_replace_mode: visualBackgroundReplaceMode,
          background_replace_color: visualBackgroundReplaceColor,
          background_replace_image_url: visualBackgroundReplaceImageUrl.trim() ? visualBackgroundReplaceImageUrl.trim() : null,
          background_wash_enabled: visualBackgroundWashEnabled,
          background_wash_dim_amount: visualBackgroundWashDimAmount,
          background_wash_desaturate_amount: visualBackgroundWashDesaturateAmount,
        },
        last_opened_at: new Date().toISOString(),
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
  }, [
    captionBuildState,
    captionEditedState,
    captionFormatting,
    editableOutputSelection.layerId,
    editableOutputSelection.sourceRecipeRef,
    editableTranscriptSegments,
    launchContext,
    mediaRef,
    mediaSourceLabel,
    previewMode,
    workspaceStructuredTranscript,
    editableVisualPlacements,
    editableAudioPolish,
    selectedCaptionArtifactFormat,
    selectedSegmentId,
    visualBackgroundBlur,
    visualBackgroundBlurFallbackMode,
    visualBackgroundBlurFeatherPx,
    visualBackgroundBlurPx,
    visualBackgroundBlurProviderId,
    visualBackgroundBlurQualityMode,
    visualBackgroundBlurSubjectExpansionPx,
    visualBackgroundBlurTemporalSmoothing,
    visualBackgroundReplaceColor,
    visualBackgroundReplaceEnabled,
    visualBackgroundReplaceImageUrl,
    visualBackgroundReplaceMode,
    visualColorAmount,
    visualEyeContactAssistEnabled,
    visualEyeContactAssistStrength,
    visualWhiteBalance,
    transcriptSourceId,
    workspaceMapping,
    editableEditorialAuthorityGraph,
    studioRackRenderBackendResolution.ffmpegAvailable,
  ]);

  const releasePrepComparison = useMemo(
    () => compareHammerPreparedReleasePackageToCurrent(
      loadedPreparedPackage,
      exportBasis.currentReleasePackage,
      { timelineRevision: exportBasis.timelineRevision },
    ),
    [exportBasis.currentReleasePackage, exportBasis.timelineRevision, loadedPreparedPackage],
  );
  const timelineRevisionChanged = useMemo(() => {
    if (!loadedPreparedPackage) return false;
    const previous = loadedPreparedPackage.provenance.timelineRevision ?? null;
    const current = exportBasis.timelineRevision ?? null;
    return previous !== current;
  }, [exportBasis.timelineRevision, loadedPreparedPackage]);
  const releasePrepStaleReasons = useMemo(() => {
    const reasons = [...releasePrepComparison.staleReasons];
    if (timelineRevisionChanged) reasons.push("Timeline revision changed");
    return reasons;
  }, [releasePrepComparison.staleReasons, timelineRevisionChanged]);
  const exportTruthState: HammerExportTruthState = !loadedPreparedPackage
    ? "never_prepared"
    : releasePrepComparison.preparedStatus === "current" && !timelineRevisionChanged
    ? "current"
    : "stale";
  const exportStatusLabel = exportTruthState === "never_prepared"
    ? "Never exported"
    : exportTruthState === "current"
    ? "Exported and current"
    : "Exported, but stale";
  const previewTruthPosture = exportBasis.renderAssembly.preview.posture;
  const exportTruthPosture = exportBasis.renderAssembly.export_timeline.export_posture;
  const handoffTruthPosture = exportBasis.renderAssembly.handoff.posture;
  const podcastMasterLayer = useMemo(
    () => exportBasis.renderAssembly.export_timeline.audio_layers.find((layer) => layer.kind === "podcast_master_pass") ?? null,
    [exportBasis.renderAssembly.export_timeline.audio_layers],
  );
  const podcastMasterUiStatus = useMemo(
    () => resolvePodcastMasterUiStatus({
      declared: Boolean(podcastMasterLayer),
      posture: podcastMasterLayer?.posture,
      capability: podcastMasterLayer?.capability,
      preview_mode: podcastMasterLayer?.meta?.preview_mode,
      applied_stages: podcastMasterLayer?.meta?.applied_stages,
      skipped_stages: podcastMasterLayer?.meta?.skipped_stages,
    }),
    [podcastMasterLayer],
  );
  const boundObjects = useMemo(
    () => deriveHammerBoundObjects({
      canonical_graph: editableEditorialAuthorityGraph,
      render_assembly: exportBasis.renderAssembly,
    }),
    [editableEditorialAuthorityGraph, exportBasis.renderAssembly],
  );
  const boundObjectById = useMemo(() => {
    const byId = new Map<string, HammerBoundObject>();
    for (const object of boundObjects) {
      byId.set(object.object_id, object);
    }
    return byId;
  }, [boundObjects]);
  const selectedBoundBrollInspectorState = useMemo<HammerBoundBrollInspectorState | null>(() => {
    const selectedOperationId = selectedBoundBrollOperationId
      ?? resolvedBrollBindingItems[0]?.operationId
      ?? null;
    if (!selectedOperationId) return null;
    const selectedBoundObject = boundObjectById.get(selectedOperationId) ?? null;
    if (!selectedBoundObject || selectedBoundObject.type !== "broll") return null;
    const linkedDuckObject = selectedBoundObject.linked_object_ids
      .map((linkedObjectId) => boundObjectById.get(linkedObjectId) ?? null)
      .find((linkedObject): linkedObject is HammerBoundObject => Boolean(linkedObject && linkedObject.type === "audio_duck"))
      ?? null;
    const attentionFlags = [
      ...(selectedBoundObject.attention_flags.includes("operation_conflict")
        ? ["Adjusted by structural remap; review recommended."]
        : []),
      ...(selectedBoundObject.lifecycle_state === "superseded"
        ? ["Removed by structural edit."]
        : []),
      ...(selectedBoundObject.binding_state === "unresolved"
        ? ["Unresolved suggestion: not yet media truth."]
        : []),
      ...(linkedDuckObject && linkedDuckObject.capability === "degraded"
        ? ["Linked duck companion requires review."]
        : []),
    ];
    const duckAligned = linkedDuckObject && linkedDuckObject.type === "audio_duck"
      ? (
        linkedDuckObject.placement_window.start_sec === selectedBoundObject.placement_window.start_sec
        && linkedDuckObject.placement_window.end_sec === selectedBoundObject.placement_window.end_sec
      )
      : false;
    return {
      operationId: selectedOperationId,
      lifecycle: selectedBoundObject.lifecycle_state,
      intentSource: selectedBoundObject.intent_source === "system" ? "manual" : selectedBoundObject.intent_source,
      intentDescription: selectedBoundObject.payload.intent_description ?? null,
      bindingState: selectedBoundObject.binding_state === "unresolved" ? "unresolved" : "resolved",
      startSec: selectedBoundObject.placement_window.start_sec,
      endSec: selectedBoundObject.placement_window.end_sec,
      assetRef: selectedBoundObject.payload.asset_ref,
      previewPosture: selectedBoundObject.posture.preview,
      exportPosture: selectedBoundObject.posture.export,
      handoffPosture: selectedBoundObject.posture.handoff,
      needsAttention: attentionFlags.length > 0,
      attentionFlags,
      linkedDuck: linkedDuckObject && linkedDuckObject.type === "audio_duck"
        ? {
          operationId: linkedDuckObject.object_id,
          startSec: linkedDuckObject.placement_window.start_sec,
          endSec: linkedDuckObject.placement_window.end_sec,
          aligned: duckAligned,
          capability: linkedDuckObject.capability,
          needsAttention: !duckAligned || linkedDuckObject.attention_flags.length > 0,
        }
        : null,
    };
  }, [
    boundObjectById,
    resolvedBrollBindingItems,
    selectedBoundBrollOperationId,
  ]);
  const selectedTransitionBoundObject = useMemo(() => {
    const selectedOperationId = selectedBoundBrollOperationId ?? null;
    if (!selectedOperationId) return null;
    const selectedBoundObject = boundObjectById.get(selectedOperationId) ?? null;
    if (!selectedBoundObject || selectedBoundObject.type !== "transition") return null;
    return selectedBoundObject;
  }, [boundObjectById, selectedBoundBrollOperationId]);
  const boundAttentionQueue = useMemo<HammerBoundAttentionItem[]>(() => {
    const queue = deriveHammerBoundAttentionQueue(boundObjects);
    return queue.map((item) => ({
      operationId: item.object_id,
      kind: item.object_type === "transition"
        ? "transition_attention"
        : item.reasons.includes("awaiting_resolution")
        ? "unresolved_suggestion"
        : item.reasons.includes("superseded_by_structural_edit")
        ? "superseded_binding"
        : "degraded_binding",
      label: item.label,
      reasons: item.reasons,
    }));
  }, [boundObjects]);
  const boundAttentionQueueForGate = useMemo<HammerBoundAttentionQueueItem[]>(
    () => deriveHammerBoundAttentionQueue(boundObjects),
    [boundObjects],
  );
  const boundAttentionSummary = useMemo(() => ({
    total: boundAttentionQueue.length,
    unresolvedCount: boundAttentionQueue.filter((item) => item.kind === "unresolved_suggestion").length,
    degradedCount: boundAttentionQueue.filter((item) => item.kind === "degraded_binding").length,
    supersededCount: boundAttentionQueue.filter((item) => item.kind === "superseded_binding").length,
    transitionCount: boundAttentionQueue.filter((item) => item.kind === "transition_attention").length,
  }), [boundAttentionQueue]);
  const readinessGate = useMemo(() => evaluateHammerReadinessGate({
    renderAssembly: exportBasis.renderAssembly,
    canonicalGraph: editableEditorialAuthorityGraph,
    boundAttentionQueue: boundAttentionQueueForGate,
    unresolvedBrollSuggestionOperationIds: unresolvedBrollSuggestionItems.map((item) => item.operationId),
  }), [
    exportBasis.renderAssembly,
    editableEditorialAuthorityGraph,
    boundAttentionQueueForGate,
    unresolvedBrollSuggestionItems,
  ]);
  const handoffPosture = useMemo(() => deriveHammerReleaseHandoffPosture({
    releasePrepPackage: exportBasis.currentReleasePackage,
    readinessGate,
  }), [exportBasis.currentReleasePackage, readinessGate]);
  const readinessVerdict = handoffPosture.verdict;
  const passSelectorContext = useMemo<HammerPassSelectorContext>(() => ({
    currentPass,
    passStatus,
    prepStatus: exportBasis.currentReleasePackage.identity.prep_status,
    alignmentStatus: exportBasis.currentReleasePackage.identity.alignment_status,
    structuredTranscript: exportBasis.transcriptForRelease,
    visualPlacements: editableVisualPlacements,
    audioPolish: editableAudioPolish,
    introPath: introOutroSelectedIntroPath,
    outroPath: introOutroSelectedOutroPath,
    packagingLogoEnabled: Boolean(packagingLogoPlacement),
    readinessVerdict,
    readinessGate,
  }), [
    currentPass,
    passStatus,
    exportBasis.currentReleasePackage.identity.alignment_status,
    exportBasis.currentReleasePackage.identity.prep_status,
    exportBasis.transcriptForRelease,
    editableAudioPolish,
    editableVisualPlacements,
    introOutroSelectedIntroPath,
    introOutroSelectedOutroPath,
    packagingLogoPlacement,
    readinessVerdict,
    readinessGate,
  ]);
  const passSelectorResults = useMemo(() => {
    const byPass = new Map<HammerPassId, HammerPassSelectorResult>();
    for (const pass of PASS_ORDER) {
      byPass.set(pass.id, getPassStatus(pass.id, passSelectorContext));
    }
    return byPass;
  }, [passSelectorContext]);
  const timelineDockVM = useMemo(() => ({
    isScrubbing,
    setFocusOverride,
    waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
    playbackTransportDurationSec,
    effectivePlaybackCutRegions,
    playheadSec,
    seekPlayheadToTime,
    togglePlayback,
    isPlaybackActive,
    toggleSelectionLoopPlayback,
    isLoopPlaybackActive,
    playSelectionWithRoll,
    selectedSegment,
    selectAdjacentSegment,
    jumpToSelectionBoundary,
    jumpToEditPoint,
    sortedTimelineMarkers,
    jumpToMarker,
    addMarkerAtPlayhead,
    scrubRate,
    scrubRateOptions: SCRUB_RATE_OPTIONS,
    setScrubRate: (rate: number) => {
      if (!SCRUB_RATE_OPTIONS.includes(rate as HammerScrubRate)) return;
      setScrubRate(rate as HammerScrubRate);
    },
    zoomTimelineOut,
    zoomTimelineIn,
    resetTimelineZoom,
    timelineZoomPercent,
    nudgePlayhead,
    smallPlayheadNudgeSec: SMALL_PLAYHEAD_NUDGE_SEC,
    splitSelectedSegmentAtPlayhead,
    deleteSelectedSegmentAndRipple,
    toggleSelectedSegmentDisabled,
    transcriptDurationSec,
    audioCutSelectionStatus,
    persistedAudioCutCount,
    canMarkAudioCutSelection,
    canApplyAudioCutSelection,
    hasPendingAudioCutSelection,
    markAudioCutBoundary,
    applyAudioCutSelection,
    clearAudioCutSelection,
    jumpToMarkerById,
    removeMarker,
    moveSegment,
    trimSegmentStart,
    trimSegmentEnd,
    adjustSelectedSegmentGain,
    visualTimelineDock: {
      clips: visualTimelineLaneClips,
      playheadSec,
      durationSec: timelineDurationSec,
      selectedClipId: linkedPrimaryVisualId,
      editable: visualPlacementEditingEnabled,
      focusToken: visualTimelineFocusNonce,
      onSelectClip: (clipId: string) => {
        selectVisualClip({ clipId, origin: "timeline", revealUI: true });
      },
      onMoveClip: (event: MouseEvent, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!visualPlacementEditingEnabled) return;
        beginTimelineImagePlacementDrag(event as unknown as MouseEvent<HTMLElement | SVGElement>, {
          placementId: clip.clipId,
          mode: "move",
          startSec: Math.max(0, clip.startSec - compositionOffsetSec),
          endSec: Math.max(0, clip.endSec - compositionOffsetSec),
        });
      },
      onTrimClipStart: (event: MouseEvent, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!visualPlacementEditingEnabled) return;
        beginTimelineImagePlacementDrag(event as unknown as MouseEvent<HTMLElement | SVGElement>, {
          placementId: clip.clipId,
          mode: "resize_start",
          startSec: Math.max(0, clip.startSec - compositionOffsetSec),
          endSec: Math.max(0, clip.endSec - compositionOffsetSec),
        });
      },
      onTrimClipEnd: (event: MouseEvent, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!visualPlacementEditingEnabled) return;
        beginTimelineImagePlacementDrag(event as unknown as MouseEvent<HTMLElement | SVGElement>, {
          placementId: clip.clipId,
          mode: "resize_end",
          startSec: Math.max(0, clip.startSec - compositionOffsetSec),
          endSec: Math.max(0, clip.endSec - compositionOffsetSec),
        });
      },
    },
    timelineTrackScrollRef,
    handleTimelineTrackWheelZoom,
    editableTranscriptSegmentsLength: editableTranscriptSegments.length,
    timelineBoardZoomClassName,
    beginTimelineScrub,
    timelineMinorTicks,
    timelineTicks,
    timelineDurationSec,
    playheadRatioPercent,
    timelineLanes,
    laneGapsById,
    visualPlacementEditingEnabled,
    currentPass,
    resolvePlacementAnimationPreset,
    visualPlacementsById,
    beginTimelineImagePlacementDrag,
    openImageAnimationContextMenu,
  }), [
    acceptSilenceCutSuggestion,
    addMarkerAtPlayhead,
    adjustSelectedSegmentGain,
    applyAudioCutSelection,
    audioCutSelectionStatus,
    beginTimelineImagePlacementDrag,
    beginTimelineScrub,
    canApplyAudioCutSelection,
    canMarkAudioCutSelection,
    clearAudioCutSelection,
    compositionOffsetSec,
    currentPass,
    deleteSelectedSegmentAndRipple,
    dismissSilenceCutSuggestion,
    editableAudioPolish?.analysis?.waveform_proxy,
    editableTranscriptSegments.length,
    effectivePlaybackCutRegions,
    effectiveSelectedClipId,
    handleTimelineTrackWheelZoom,
    hasPendingAudioCutSelection,
    hasSilenceSuggestionAnalysis,
    isLoopPlaybackActive,
    isPlaybackActive,
    isScrubbing,
    jumpToEditPoint,
    jumpToMarker,
    jumpToMarkerById,
    jumpToSelectionBoundary,
    laneGapsById,
    markAudioCutBoundary,
    moveSegment,
    nudgePlayhead,
    openImageAnimationContextMenu,
    persistedAudioCutCount,
    playSelectionWithRoll,
    playbackTransportDurationSec,
    playheadRatioPercent,
    playheadSec,
    removeMarker,
    resetTimelineZoom,
    resolvePlacementAnimationPreset,
    scrubRate,
    seekPlayheadToTime,
    selectAdjacentSegment,
    selectVisualClip,
    selectedSegment,
    setFocusOverride,
    setScrubRate,
    silenceCutSuggestions,
    silenceSuggestionCount,
    sortedTimelineMarkers,
    splitSelectedSegmentAtPlayhead,
    timelineBoardZoomClassName,
    timelineDurationSec,
    timelineLanes,
    timelineMinorTicks,
    timelineTicks,
    timelineTrackScrollRef,
    timelineZoomPercent,
    togglePlayback,
    toggleSelectedSegmentDisabled,
    toggleSelectionLoopPlayback,
    transcriptDurationSec,
    trimSegmentEnd,
    trimSegmentStart,
    visibleSilenceCutSuggestions,
    visualPlacementEditingEnabled,
    visualPlacementsById,
    visualTimelineFocusNonce,
    visualTimelineLaneClips,
    zoomTimelineIn,
    zoomTimelineOut,
  ]);
  const sourceBayVM = useMemo(() => {
    const layerOptions = outputLayerCandidates.map((layer) => ({
      id: layer.layer_id,
      label: formatOutputLayerLabel(layer),
    }));
    const historyEntries = recentHistoryEntries.map((entry) => {
      const isCurrent = entry.id === historyHeadEntryId;
      const derivedTransition = derivedLayerHistoryRef.current.get(entry.id) ?? null;
      const derivedLayerCreated = Boolean(derivedTransition);
      return {
        id: entry.id,
        label: entry.label,
        timestampLabel: formatHistoryTimestamp(entry.timestamp),
        scopeLabel: formatHistoryEntryScope(entry),
        layerActionLabel: derivedLayerCreated ? "yes" : "no",
        derivedLayerLabel: derivedLayerCreated ? "yes" : "no",
        layerLabel: derivedTransition?.layerLabel ?? null,
        isCurrent,
        isLayerTransition: derivedLayerCreated,
        isActiveLayerTransition: Boolean(isCurrent && derivedTransition),
        onSelect: () => {
          setFocusOverride("source-focus");
          jumpToHistoryEntry(entry.id);
        },
      };
    });

    return {
      aiInUse: Boolean(props.aiInUse),
      onRequestRegenerateAiTranscript: props.onRequestRegenerateAiTranscript,
      regenerateAiTranscriptDisabled: props.regenerateAiTranscriptDisabled ?? false,
      undo: {
        canUndo,
        label: undoLabel,
        compactLabel: undoLabelCompact,
        depth: undoDepth,
        onUndo: undoHistory,
      },
      redo: {
        canRedo,
        label: redoLabel,
        compactLabel: redoLabelCompact,
        depth: redoDepth,
        onRedo: redoHistory,
      },
      tabs: SOURCE_TABS.map((tab) => ({
        id: tab.id,
        label: tab.label,
        isActive: selectedSourceTab === tab.id,
        onSelect: () => selectEditorMode(resolveEditorModeFromSourceTab(tab.id), { focusOverride: "source-focus" }),
      })),
      sourceDeskLoading,
      sourceDeskError: sourceDeskError
        ? {
          message: sourceDeskError,
          className: isSourceDeskAuthMessage(sourceDeskError)
            ? "hammer-source-status hammer-source-status--info"
            : "hammer-source-status hammer-source-status--error",
        }
        : null,
      viewingLayer: {
        value: activeOutputLayerId ?? "__raw__",
        disabled: !workspaceStructuredTranscript,
        options: layerOptions,
        onChange: (nextLayerId: string | null) => {
          setFocusOverride("source-focus");
          selectViewingLayer(nextLayerId);
        },
      },
      exportBasis: {
        value: editableOutputSelection.layerId ?? "__raw__",
        options: layerOptions,
        onChange: (nextLayerId: string | null) => {
          setFocusOverride("source-focus");
          selectOutputLayerForExport(nextLayerId);
        },
      },
      historyPanel: {
        canRestoreState: canRedo,
        onRestoreState: restoreCurrentHistoryState,
        shownCountLabel: `${recentHistoryEntries.length} shown`,
        resetToRaw: props.onRequestResetToRaw ? {
          inFlight: Boolean(props.resetToRawInFlight),
          error: props.resetToRawError ?? null,
          onRequest: () => props.onRequestResetToRaw?.(),
        } : null,
        entries: historyEntries,
      },

      selectedSourceTab,
      editableTranscriptSegments,
      selectedSegment,
      selectedSegmentId,
      linkedSelection,
      linkedTranscriptSegmentIdSet,
      linkedVisualIdSet,
      linkedPrimaryVisualId,
      setFocusOverride,
      roundToTenth,
      applyHistoryMutation,
      updateSegmentInTimeline,
      transcriptTimingHint,
      activeTool,
      updateTranscriptSegmentSpeaker,
      applyTranscriptSelection,
      disableTranscriptSelection,
      cutTranscriptSelection,
      tightenTranscriptSelection,
      clearTranscriptSelection,
      hasTranscriptSelection,
      transcriptSelectionAllDisabled,
      transcriptSelectionRange,
      transcriptSelectionSegmentIdSet,
      modifiedTranscriptSegmentIds,
      modifiedSegmentCount,
      candidateSegmentIdSet,
      activeCandidateSegmentIdSet,
      transcriptLineRefs,
      selectedTranscriptRange,
      onTranscriptSelection: setSelectedTranscriptRangeDetail,
      isSubtractiveTranscriptEdit,
      commitTranscriptTextEdits,
      commitDeleteOnlyTranscriptEdits,
      setTranscriptTimingHint,

      formatBytes,
      selectedVisualFlowStep,
      uploadingCategory,
      savingIntroOutro,
      workspaceIntroOutroDefaults,
      savingWorkspaceIntroOutroDefaults,
      applyIntroOutroSelectionToFutureEpisodes,
      setApplyIntroOutroSelectionToFutureEpisodes,
      persistWorkspaceIntroOutroDefaultsNow,
      sourceDeskPreviewUrls,
      sourceDeskPreviewFailures,
      sourceDeskRequestedPreviewPathSet,
      sourceDeskPreviewPendingPathSet,
      sourceDeskRemainingPreviewCount: sourceDeskRemainingPreviewPaths.length,
      requestSourceDeskPreviews,
      reportSourceDeskPreviewLoadError,
      loadRemainingSourceDeskPreviews: () => requestSourceDeskPreviews(sourceDeskRemainingPreviewPaths),
      reportVisibleSourceDeskPreviewPaths,
      imageUploadInputRef,
      brollUploadInputRef,
      introOutroUploadInputRef,
      sourceImageItems,
      sourceImageLibraryItems,
      imageUsageByPath,
      handleSourceDeskUpload,
      persistIntroOutroSelection,
      addImagePlacementFromLibrary,
      addVisualAssetPlacementFromLibrary,
      updatePlacementKindFromMediaMap,
      redoMediaMapFromScript,
      sourceReferenceClipItems,
      sourceBrollOnlyItems,
      referenceClipPlannedBeats,
      seekPlayheadToTime,
      introOutroSelection,
      introOutroSelectedIntroPath,
      introOutroSelectedOutroPath,
      introOutroCandidateItems,

      transcriptSegmentsById,
      visualPlacementCardRefs,
      effectiveSelectedClipId,
      selectVisualClip,
      selectionOriginRef,
      setSelectedClipId,
      setSelectedSegmentId,
      setTranscriptSelectionAnchorSegmentId,
      setTranscriptSelectionFocusSegmentId,
      setVisualTimelineFocusNonce,
      updateVisualPlacementTiming,
      removeVisualPlacement,
      sourceAssetItems,
      workspaceMapping,
      mediaMapBeats,
      setSelectedVisualFlowStep,
      setMediaMapBeats,
      setRemovedMediaMapSegmentIds,
      unresolvedBrollSuggestionItems,
    };
  }, [
    activeOutputLayerId,
    canRedo,
    canUndo,
    candidateSegmentIdSet,
    clearTranscriptSelection,
    cutTranscriptSelection,
    disableTranscriptSelection,
    editableTranscriptSegments,
    formatHistoryEntryScope,
    formatHistoryTimestamp,
    formatBytes,
    hasTranscriptSelection,
    handleSourceDeskUpload,
    imageUploadInputRef,
    imageUsageByPath,
    introOutroCandidateItems,
    introOutroSelection,
    introOutroSelectedIntroPath,
    introOutroSelectedOutroPath,
    introOutroUploadInputRef,
    isSubtractiveTranscriptEdit,
    jumpToHistoryEntry,
    modifiedSegmentCount,
    modifiedTranscriptSegmentIds,
    outputLayerCandidates,
    props.aiInUse,
    props.onRequestResetToRaw,
    props.resetToRawError,
    props.resetToRawInFlight,
    redoMediaMapFromScript,
    redoDepth,
    redoHistory,
    redoLabel,
    redoLabelCompact,
    recentHistoryEntries,
    restoreCurrentHistoryState,
    roundToTenth,
    savingIntroOutro,
    workspaceIntroOutroDefaults,
    savingWorkspaceIntroOutroDefaults,
    applyIntroOutroSelectionToFutureEpisodes,
    persistWorkspaceIntroOutroDefaultsNow,
    selectedSegment,
    selectedSegmentId,
    selectedSourceTab,
    selectedVisualFlowStep,
    selectEditorMode,
    setFocusOverride,
    setTranscriptTimingHint,
    selectOutputLayerForExport,
    selectViewingLayer,
    sourceDeskError,
    sourceDeskLoading,
    sourceDeskPreviewFailures,
    sourceDeskPreviewUrls,
    sourceImageItems,
    sourceImageLibraryItems,
    sourceReferenceClipItems,
    sourceBrollOnlyItems,
    tightenTranscriptSelection,
    transcriptSelectionAllDisabled,
    transcriptSelectionRange,
    transcriptSelectionSegmentIdSet,
    transcriptTimingHint,
    updatePlacementKindFromMediaMap,
    undoDepth,
    undoHistory,
    undoLabel,
    undoLabelCompact,
    uploadingCategory,
    updateTranscriptSegmentSpeaker,
    updateSegmentInTimeline,
    workspaceStructuredTranscript,
    historyHeadEntryId,
    editableOutputSelection.layerId,
    activeCandidateSegmentIdSet,
    addImagePlacementFromLibrary,
    addVisualAssetPlacementFromLibrary,
    applyHistoryMutation,
    applyTranscriptSelection,
    activeTool,
    transcriptLineRefs,
    brollUploadInputRef,
    persistIntroOutroSelection,
    referenceClipPlannedBeats,
    seekPlayheadToTime,
    sourceDeskPreviewUrls,
    reportSourceDeskPreviewLoadError,
    updateTranscriptSegmentSpeaker,
    sourceDeskPreviewFailures,
    brollUploadInputRef,
    imageUploadInputRef,
    redoMediaMapFromScript,
    updatePlacementKindFromMediaMap,
    persistIntroOutroSelection,
    addImagePlacementFromLibrary,
    addVisualAssetPlacementFromLibrary,
    referenceClipPlannedBeats,
    seekPlayheadToTime,
    introOutroSelection,
    introOutroSelectedIntroPath,
    introOutroSelectedOutroPath,
    introOutroCandidateItems,
  ]);
  const previewBayVM = useMemo(() => ({
    previewModeLabel: previewMode,
    activeVisualTool: activeTool === "video" ? activeVisualTool : null,
    visualPolishPreviewActive,
    previewSurfaceRef,
    previewVideoRef,
    previewAudioRef,
    previewBrollVideoRefs,
    previewVideoSrc: effectivePreviewVideoSrc,
    playbackMediaSrc: effectivePlaybackMediaSrc,
    isPlaybackActive,
    playbackWindow,
    handlePlaybackProgress: handlePlaybackProgressWithOrigin,
    handlePlaybackEnded,
    setIsPlaybackActive,
    clearPlaybackWindow: () => setPlaybackWindow(null),
    togglePlayback,
    playheadSec,
    playbackModeLabel,
    playbackSourceLabel,
    mediaLabelMismatchWarning,
    playbackBackendLabel: studioRackPlaybackConfig.backend,
    currentPassId: currentPass,
    selectedImageAnimationLabel,
    audioFinalizationCompareModeLabel: audioFinalizationCompareMode === "before" ? "Before" : "After",
    audioComparePreviewStatusLabel: studioRackComparePreviewStatusLabel,
    packagingSummaryLabel: currentPass === "packaging"
      ? `Packaging: intro ${packagingIntroPlacement ? "on" : "off"} · outro ${packagingOutroPlacement ? "on" : "off"} · logo ${packagingLogoPlacement ? "on" : "off"}`
      : null,
    previewSurfaceLabel,
    backgroundEffect: {
      enabled: visualPolishPreviewActive && (visualBackgroundBlur || visualBackgroundReplaceEnabled || visualBackgroundWashEnabled),
      settings: backgroundBlurSettings,
      providerId: visualBackgroundBlurProviderId,
      debugMasks: visualBackgroundBlurDebugMask,
      maskPreviewMode: visualBackgroundMaskPreviewMode,
      maskPreviewStage: visualBackgroundMaskPreviewStage,
      onStatus: setVisualBackgroundBlurRuntimeStatus,
      onCanvas: handleBackgroundEffectCanvas,
    },
    eyeContactAssist: {
      enabled: visualPolishPreviewActive && visualEyeContactAssistEnabled,
      strength: Math.max(0, Math.min(1, Number(visualEyeContactAssistStrength) || 0)),
      backgroundCanvasRef: visualBackgroundEffectCanvasRef,
      useBackgroundCanvasAsSource: eyeContactUseBackgroundCanvasAsSource,
      debugOverlay: visualEyeContactAssistDebugOverlay,
      onStatus: setVisualEyeContactAssistRuntimeStatus,
    },
    visualPreview: {
      isAuthority: isVisualPreviewAuthority,
      overlays: activePreviewOverlays,
      editable: visualPlacementEditingEnabled,
      onSelectClip: (clipId: string) => {
        selectVisualClip({ clipId, origin: "preview", revealUI: true, snapPlayhead: false });
      },
      onBeginMove: (event: MouseEvent, clipId: string) => {
        beginPreviewCanvasDrag(event as any, {
          placementId: clipId,
          mode: "move",
        });
      },
      onBeginResize: (event: MouseEvent, clipId: string) => {
        beginPreviewCanvasDrag(event as any, {
          placementId: clipId,
          mode: "resize",
        });
      },
    },
  }), [
    activeTool,
    activeVisualTool,
    activePreviewOverlays,
    audioFinalizationCompareMode,
    backgroundBlurSettings,
    beginPreviewCanvasDrag,
    currentPass,
    eyeContactUseBackgroundCanvasAsSource,
    handleBackgroundEffectCanvas,
    handlePlaybackEnded,
    handlePlaybackProgressWithOrigin,
    isPlaybackActive,
    isVisualPreviewAuthority,
    mediaLabelMismatchWarning,
    packagingIntroPlacement,
    packagingLogoPlacement,
    packagingOutroPlacement,
    playbackMediaSrc,
    playbackModeLabel,
    playbackSourceLabel,
    playbackWindow,
    playheadSec,
    previewAudioRef,
    previewBrollVideoRefs,
    previewVideoRef,
    previewVideoSrc,
    previewMode,
    previewSurfaceLabel,
    previewSurfaceRef,
    selectVisualClip,
    selectedImageAnimationLabel,
    setIsPlaybackActive,
    setPlaybackWindow,
    setVisualBackgroundBlurRuntimeStatus,
    setVisualEyeContactAssistRuntimeStatus,
    studioRackPlaybackConfig.backend,
    studioRackComparePreviewStatusLabel,
    togglePlayback,
    visualPolishPreviewActive,
    visualBackgroundBlur,
    visualBackgroundBlurDebugMask,
    visualBackgroundMaskPreviewMode,
    visualBackgroundBlurProviderId,
    visualBackgroundReplaceEnabled,
    visualBackgroundWashEnabled,
    visualEyeContactAssistDebugOverlay,
    visualEyeContactAssistEnabled,
    visualEyeContactAssistStrength,
    visualBackgroundEffectCanvasRef,
    visualPlacementEditingEnabled,
  ]);
  const toolbarVM = useMemo(() => ({
    stats: [
      {
        id: "transcript",
        label: "Tx",
        value: String(editableTranscriptSegments.length),
        title: `Transcript: ${editableTranscriptSegments.length} segments`,
      },
      {
        id: "visuals",
        label: "Vis",
        value: (() => {
          const total = editableVisualPlacements?.placements.length ?? editableVisualTimeline?.clips.length ?? 0;
          const uncertain = (editableVisualPlacements?.placements ?? []).reduce(
            (count, placement) => count + (placement.status === "uncertain" ? 1 : 0),
            0,
          );
          return uncertain > 0 ? `${total}/${uncertain}?` : String(total);
        })(),
        title: (() => {
          const total = editableVisualPlacements?.placements.length ?? editableVisualTimeline?.clips.length ?? 0;
          const uncertain = (editableVisualPlacements?.placements ?? []).reduce(
            (count, placement) => count + (placement.status === "uncertain" ? 1 : 0),
            0,
          );
          return uncertain > 0
            ? `Visual placements: ${total} (${uncertain} uncertain)`
            : `Visual placements: ${total}`;
        })(),
      },
    ],
    passes: (() => {
      const summarize = (passIds: HammerPassId[]): HammerPassDerivedStatus => summarizePassStatuses(
        passIds.map((passId) => passSelectorResults.get(passId)?.status ?? getPassStatus(passId, passSelectorContext).status),
      );
      const transcriptPassIds: HammerPassId[] = ["transcript_cleanup", "retakes", "gap_pacing"];
      const visualPassIds: HammerPassId[] = ["visual_finishing", "image_placement", "image_animation"];
      const transcriptRepresentativePass: HammerPassId = activeTool === "polish" && transcriptPassIds.includes(currentPass)
        ? currentPass
        : "transcript_cleanup";
      const visualRepresentativePass: HammerPassId = activeVisualTool === "images"
        ? "image_placement"
        : activeVisualTool === "broll"
        ? "image_animation"
        : "visual_finishing";
      const visiblePasses: HammerWorkspaceShellToolbarPassVM[] = [
        {
          id: transcriptRepresentativePass,
          shortLabel: "T",
          label: "Transcript",
          toolId: "polish",
          statusLabel: summarize(transcriptPassIds),
          isActive: activeTool === "polish",
        },
        {
          id: visualRepresentativePass,
          shortLabel: "V",
          label: "Visuals",
          toolId: "video",
          statusLabel: summarize(visualPassIds),
          isActive: activeTool === "video",
        },
        {
          id: "audio_finalization",
          shortLabel: "A",
          label: "Audio",
          toolId: "audio",
          statusLabel: passSelectorResults.get("audio_finalization")?.humanLabel
            ?? getPassStatus("audio_finalization", passSelectorContext).humanLabel,
          isActive: activeTool === "audio",
        },
        {
          id: "packaging",
          shortLabel: "P",
          label: "Packaging",
          toolId: "finishing",
          statusLabel: passSelectorResults.get("packaging")?.humanLabel
            ?? getPassStatus("packaging", passSelectorContext).humanLabel,
          isActive: currentPass === "packaging",
        },
      ];
      return visiblePasses;
    })(),
    onSelectPass: selectPass,
  }), [
    activeTool,
    activeVisualTool,
    currentPass,
    editableTranscriptSegments.length,
    editableVisualPlacements?.placements,
    editableVisualTimeline?.clips.length,
    passSelectorContext,
    passSelectorResults,
    selectPass,
  ]);
  const currentPassSelectorResult = passSelectorResults.get(currentPass) ?? getPassStatus(currentPass, passSelectorContext);
const readinessStatusLabel = readinessVerdict.status === "ready"
    ? "Ready for export"
    : readinessVerdict.status === "blocked"
    ? "Blocked"
    : `Needs review (${readinessVerdict.counts.review})`;
  const sendToQuenchButtonLabel = readinessVerdict.status === "blocked"
    ? "Blocked — Resolve Issues"
    : readinessVerdict.status === "needs_review"
    ? "Send to Quench (Needs Review)"
    : exportTruthState === "stale"
    ? "Send Updated Packet to Quench"
    : "Send to Quench";
  const readySummaryAreas = useMemo(() => {
    const summarize = (passIds: HammerPassId[]): HammerPassDerivedStatus => summarizePassStatuses(
      passIds.map((passId) => passSelectorResults.get(passId)?.status ?? "not_started"),
    );
    return [
      {
        id: "transcript",
        label: "Transcript Cleanup + Retakes",
        status: summarize(["transcript_cleanup", "retakes"]),
      },
      {
        id: "pacing",
        label: "Pacing",
        status: summarize(["gap_pacing"]),
      },
      {
        id: "visual_finishing",
        label: "Visual Polish",
        status: summarize(["visual_finishing"]),
      },
      {
        id: "image_placement",
        label: "Image Placement",
        status: summarize(["image_placement"]),
      },
      {
        id: "broll",
        label: "B-roll",
        status: summarize(["image_animation"]),
      },
      {
        id: "audio",
        label: "Audio Finalization",
        status: summarize(["audio_finalization"]),
      },
      {
        id: "packaging",
        label: "Packaging",
        status: summarize(["packaging"]),
      },
    ] as const;
  }, [passSelectorResults]);
  const selectedAttentionIndex = useMemo(
    () => boundAttentionQueue.findIndex((item) => item.operationId === selectedBoundBrollOperationId),
    [boundAttentionQueue, selectedBoundBrollOperationId],
  );
  useEffect(() => {
    const selectableObjects = boundObjects.filter((object) => object.type === "broll" || object.type === "transition");
    if (selectableObjects.length === 0) {
      if (selectedBoundBrollOperationId != null) {
        setSelectedBoundBrollOperationId(null);
      }
      return;
    }
    if (!selectedBoundBrollOperationId) {
      const preferredAttention = boundAttentionQueue[0]?.operationId ?? null;
      const firstObject = selectableObjects[0]?.object_id ?? null;
      setSelectedBoundBrollOperationId(preferredAttention ?? firstObject);
      return;
    }
    const stillExists = selectableObjects.some((object) => object.object_id === selectedBoundBrollOperationId);
    if (!stillExists) {
      const preferredAttention = boundAttentionQueue[0]?.operationId ?? null;
      const firstObject = selectableObjects[0]?.object_id ?? null;
      setSelectedBoundBrollOperationId(preferredAttention ?? firstObject);
    }
  }, [boundAttentionQueue, boundObjects, selectedBoundBrollOperationId]);
  const releasePrepOpenHref = useMemo(() => {
    if (!props.releasePrepHref || !loadedPreparedPackage) return null;
    try {
      const parsed = new URL(props.releasePrepHref, "https://forge.local");
      parsed.searchParams.set("quench_open", "prepared_release");
      parsed.searchParams.set("prepared_package_path", HAMMER_PREPARED_RELEASE_PACKAGE_PATH);
      parsed.searchParams.set("release_packet_manifest_path", HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH);
      parsed.searchParams.set("prepared_package_version", String(loadedPreparedPackage.version));
      parsed.searchParams.set(
        "prepared_package_fingerprint",
        buildPreparedPackageIdentityFingerprint(loadedPreparedPackage),
      );
      if (loadedPreparedPackage.preparedAt) {
        parsed.searchParams.set("prepared_package_prepared_at", loadedPreparedPackage.preparedAt);
      } else {
        parsed.searchParams.delete("prepared_package_prepared_at");
      }
      parsed.searchParams.set("prepared_package_state", exportTruthState);
      const search = parsed.searchParams.toString();
      return search ? `${parsed.pathname}?${search}` : parsed.pathname;
    } catch {
      return props.releasePrepHref;
    }
  }, [exportTruthState, loadedPreparedPackage, props.releasePrepHref]);

  function handleRebuildCaptionArtifacts(): void {
    const preview = buildHammerCaptionPreviewModel(
      exportBasis.transcriptForRelease.segments,
      exportBasis.transcriptForRelease,
    );
    const formattedChunks = buildCaptionChunksFromPreview({
      chunks: preview.chunks,
      formatting: captionFormatting,
    });
    const builtAt = new Date().toISOString();
    const nextBuild: HammerCaptionBuildState = {
      builtAt,
      sourceLayerId: editableOutputSelection.layerId ?? null,
      sourceLabel: captionSourceLabel,
      fingerprint: captionBasisFingerprint,
      chunkCount: formattedChunks.length,
      segmentCount: preview.segment_count,
      approximateTiming: formattedChunks.some((chunk) => chunk.approximateTiming),
      chunks: formattedChunks,
      srt: renderBuiltSrt(formattedChunks),
      vtt: renderBuiltVtt(formattedChunks),
    };
    setCaptionBuildState(nextBuild);
    setCaptionBuildFeedback(`Built ${formattedChunks.length} caption rows from ${captionSourceLabel}.`);
  }

  function handleEnableCaptionEdits(): void {
    if (!captionBuildState) return;
    const now = new Date().toISOString();
    setCaptionEditedState({
      createdAt: now,
      updatedAt: now,
      baseFingerprint: captionBasisFingerprint,
      sourceLayerId: captionBuildState.sourceLayerId,
      sourceLabel: captionBuildState.sourceLabel,
      chunkCount: captionBuildState.chunkCount,
      segmentCount: captionBuildState.segmentCount,
      approximateTiming: captionBuildState.approximateTiming,
      chunks: captionBuildState.chunks.map((chunk) => ({ ...chunk, sourceSegmentIds: [...chunk.sourceSegmentIds] })),
      srt: captionBuildState.srt,
      vtt: captionBuildState.vtt,
    });
    setActiveCaptionArtifactMode("edited");
    setCaptionBuildFeedback("Created editable caption artifact from the current build.");
  }

  function handleEditCaptionChunkText(chunkId: string, nextText: string): void {
    setCaptionEditedState((current) => {
      if (!current) return current;
      const normalized = nextText.replace(/\r\n/g, "\n").trim();
      const nextChunks = current.chunks.map((chunk) => (
        chunk.id === chunkId
          ? {
            ...chunk,
            text: normalized,
            lineCount: normalized ? normalized.split("\n").filter(Boolean).length : 0,
            charCount: normalized.replace(/\n/g, "").length,
          }
          : chunk
      ));
      const rebuilt = rebuildCaptionArtifactsFromChunks(nextChunks);
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        chunkCount: rebuilt.chunkCount,
        approximateTiming: rebuilt.approximateTiming,
        chunks: nextChunks,
        srt: rebuilt.srt,
        vtt: rebuilt.vtt,
      };
    });
  }

  function handleSplitEditedCaptionChunk(chunkId: string): void {
    setCaptionEditedState((current) => {
      if (!current) return current;
      const index = current.chunks.findIndex((chunk) => chunk.id === chunkId);
      if (index < 0) return current;
      const chunk = current.chunks[index];
      const editor = captionEditorRefs.current.get(chunkId) ?? null;
      const caret = editor ? Math.max(0, Math.min(chunk.text.length, editor.selectionStart ?? 0)) : Math.floor(chunk.text.length / 2);
      const leftRaw = chunk.text.slice(0, caret).trim();
      const rightRaw = chunk.text.slice(caret).trim();
      if (!leftRaw || !rightRaw) {
        setCaptionBuildFeedback("Split needs text on both sides of the caret.");
        return current;
      }

      const duration = Math.max(chunk.endSec - chunk.startSec, CAPTION_MIN_BLOCK_DURATION_SEC * 2);
      const leftWeight = Math.max(leftRaw.replace(/\s+/g, "").length, 1);
      const rightWeight = Math.max(rightRaw.replace(/\s+/g, "").length, 1);
      const totalWeight = leftWeight + rightWeight;
      let splitSec = chunk.startSec + (duration * (leftWeight / totalWeight));
      const minSplit = chunk.startSec + CAPTION_MIN_BLOCK_DURATION_SEC;
      const maxSplit = chunk.endSec - CAPTION_MIN_BLOCK_DURATION_SEC;
      splitSec = Math.max(minSplit, Math.min(maxSplit, splitSec));
      if (!(splitSec > chunk.startSec && splitSec < chunk.endSec)) {
        setCaptionBuildFeedback("Split skipped because the block is too short.");
        return current;
      }

      const leftChunk: HammerCaptionBuiltChunk = {
        ...chunk,
        id: `${chunk.id}:a`,
        text: leftRaw,
        startSec: chunk.startSec,
        endSec: splitSec,
        lineCount: leftRaw.split("\n").filter(Boolean).length,
        charCount: leftRaw.replace(/\n/g, "").length,
        approximateTiming: true,
      };
      const rightChunk: HammerCaptionBuiltChunk = {
        ...chunk,
        id: `${chunk.id}:b`,
        text: rightRaw,
        startSec: splitSec,
        endSec: chunk.endSec,
        lineCount: rightRaw.split("\n").filter(Boolean).length,
        charCount: rightRaw.replace(/\n/g, "").length,
        approximateTiming: true,
      };
      const nextChunks = [
        ...current.chunks.slice(0, index),
        leftChunk,
        rightChunk,
        ...current.chunks.slice(index + 1),
      ];
      const rebuilt = rebuildCaptionArtifactsFromChunks(nextChunks);
      setCaptionBuildFeedback("Split caption block in edited captions.");
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        chunkCount: rebuilt.chunkCount,
        approximateTiming: rebuilt.approximateTiming,
        chunks: nextChunks,
        srt: rebuilt.srt,
        vtt: rebuilt.vtt,
      };
    });
  }

  function handleMergeEditedCaptionChunk(args: { chunkId: string; direction: "up" | "down" }): void {
    setCaptionEditedState((current) => {
      if (!current) return current;
      const index = current.chunks.findIndex((chunk) => chunk.id === args.chunkId);
      if (index < 0) return current;
      const primary = current.chunks[index];
      const neighborIndex = args.direction === "up" ? index - 1 : index + 1;
      const neighbor = current.chunks[neighborIndex];
      if (!neighbor) {
        setCaptionBuildFeedback("No adjacent block available to merge.");
        return current;
      }

      const first = args.direction === "up" ? neighbor : primary;
      const second = args.direction === "up" ? primary : neighbor;
      const mergedText = `${first.text.trim()} ${second.text.trim()}`.replace(/\s+/g, " ").trim();
      const mergedChunk: HammerCaptionBuiltChunk = {
        ...first,
        id: `${first.id}:${second.id}:m`,
        text: mergedText,
        startSec: first.startSec,
        endSec: second.endSec,
        lineCount: mergedText.split("\n").filter(Boolean).length,
        charCount: mergedText.replace(/\n/g, "").length,
        sourceSegmentIds: [...new Set([...first.sourceSegmentIds, ...second.sourceSegmentIds])],
        approximateTiming: true,
      };

      const startIndex = Math.min(index, neighborIndex);
      const nextChunks = [
        ...current.chunks.slice(0, startIndex),
        mergedChunk,
        ...current.chunks.slice(startIndex + 2),
      ];
      const rebuilt = rebuildCaptionArtifactsFromChunks(nextChunks);
      setCaptionBuildFeedback(args.direction === "up"
        ? "Merged caption block with previous."
        : "Merged caption block with next.");
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        chunkCount: rebuilt.chunkCount,
        approximateTiming: rebuilt.approximateTiming,
        chunks: nextChunks,
        srt: rebuilt.srt,
        vtt: rebuilt.vtt,
      };
    });
  }

  function handleNormalizeEditedCaptionChunkPunctuation(chunkId: string): void {
    setCaptionEditedState((current) => {
      if (!current) return current;
      const nextChunks = current.chunks.map((chunk) => (
        chunk.id === chunkId
          ? {
            ...chunk,
            text: normalizeCaptionPunctuation(chunk.text),
            lineCount: normalizeCaptionPunctuation(chunk.text).split("\n").filter(Boolean).length,
            charCount: normalizeCaptionPunctuation(chunk.text).replace(/\n/g, "").length,
          }
          : chunk
      ));
      const rebuilt = rebuildCaptionArtifactsFromChunks(nextChunks);
      setCaptionBuildFeedback("Normalized punctuation for selected caption block.");
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        chunkCount: rebuilt.chunkCount,
        approximateTiming: rebuilt.approximateTiming,
        chunks: nextChunks,
        srt: rebuilt.srt,
        vtt: rebuilt.vtt,
      };
    });
  }

  function handleToggleEditedCaptionChunkSpeakerLabel(chunkId: string): void {
    setCaptionEditedState((current) => {
      if (!current) return current;
      const nextChunks = current.chunks.map((chunk) => {
        if (chunk.id !== chunkId) return chunk;
        const prefix = `${chunk.speaker}: `;
        const nextText = chunk.text.startsWith(prefix)
          ? chunk.text.slice(prefix.length).trimStart()
          : `${prefix}${chunk.text}`.trim();
        return {
          ...chunk,
          text: nextText,
          lineCount: nextText.split("\n").filter(Boolean).length,
          charCount: nextText.replace(/\n/g, "").length,
        };
      });
      const rebuilt = rebuildCaptionArtifactsFromChunks(nextChunks);
      setCaptionBuildFeedback("Toggled speaker label for selected caption block.");
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        chunkCount: rebuilt.chunkCount,
        approximateTiming: rebuilt.approximateTiming,
        chunks: nextChunks,
        srt: rebuilt.srt,
        vtt: rebuilt.vtt,
      };
    });
  }

  function handleDiscardEditedCaptions(): void {
    setCaptionEditedState(null);
    setActiveCaptionArtifactMode("built");
    setCaptionBuildFeedback("Discarded edited caption artifact. Built captions remain available.");
  }

  const captionBasisFingerprint = useMemo(
    () => buildCaptionBasisFingerprint({
      transcript: exportBasis.transcriptForRelease,
      outputLayerId: editableOutputSelection.layerId,
      outputRecipeRef: editableOutputSelection.sourceRecipeRef,
      formatting: captionFormatting,
    }),
    [
      captionFormatting,
      editableOutputSelection.layerId,
      editableOutputSelection.sourceRecipeRef,
      exportBasis.transcriptForRelease,
    ],
  );
  const captionBuildFreshness: "missing" | "current" | "stale" = !captionBuildState
    ? "missing"
    : captionBuildState.fingerprint === captionBasisFingerprint
    ? "current"
    : "stale";
  const captionBuildStatusLabel = captionBuildFreshness === "missing"
    ? "Missing caption build"
    : captionBuildFreshness === "current"
    ? "Up to date"
    : "Needs refresh";
  const captionEditedFreshness: "missing" | "current" | "stale" = !captionEditedState
    ? "missing"
    : captionEditedState.baseFingerprint === captionBasisFingerprint
    ? "current"
    : "stale";
  const captionEditedStatusLabel = captionEditedFreshness === "missing"
    ? "No edits"
    : captionEditedFreshness === "current"
    ? "Current"
    : "Stale";
  const hasEditableCaptionArtifact = Boolean(captionEditedState);
  const activeCaptionMode: HammerCaptionArtifactMode = hasEditableCaptionArtifact
    ? activeCaptionArtifactMode
    : "built";
  const activeCaptionState = activeCaptionMode === "edited" ? captionEditedState : captionBuildState;
  const activeCaptionArtifactText = selectedCaptionArtifactFormat === "srt"
    ? (activeCaptionState?.srt ?? "")
    : (activeCaptionState?.vtt ?? "");
  const captionArtifactStatusLabel = activeCaptionMode === "edited"
    ? `Edited captions (${captionEditedStatusLabel})`
    : `Built captions (${captionBuildStatusLabel})`;
  const captionReleaseSourceLabel = captionEditedFreshness === "current"
    ? "Edited captions"
    : captionBuildFreshness === "current"
    ? "Built captions"
    : "No current caption artifact";
  const captionBuiltSummary = captionBuildFreshness === "current"
    ? "Up to date"
    : captionBuildFreshness === "stale"
    ? "Stale"
    : "Missing";
  const captionEditedSummary = captionEditedFreshness === "current"
    ? "Valid"
    : captionEditedFreshness === "stale"
    ? "Stale"
    : "No edits";
  const captionBuiltTone = captionBuildFreshness === "current"
    ? "safe"
    : captionBuildFreshness === "stale"
    ? "warn"
    : "neutral";
  const captionEditedTone = captionEditedFreshness === "current"
    ? "safe"
    : captionEditedFreshness === "stale"
    ? "warn"
    : "neutral";
  const captionEditedComparisonBase = useMemo(
    () => captionBuildState && captionEditedState && captionBuildState.fingerprint === captionEditedState.baseFingerprint
      ? captionBuildState
      : null,
    [captionBuildState, captionEditedState],
  );
  const captionEditedModifiedBlockCount = useMemo(
    () => captionEditedState && captionEditedComparisonBase
      ? countChangedCaptionBlocks(captionEditedComparisonBase.chunks, captionEditedState.chunks)
      : null,
    [captionEditedComparisonBase, captionEditedState],
  );
  const captionEditedChangeSummary = !captionEditedState
    ? "No edited caption artifact."
    : captionEditedModifiedBlockCount == null
    ? "Manual changes present."
    : captionEditedModifiedBlockCount > 0
    ? `Manual changes present (${captionEditedModifiedBlockCount} blocks modified).`
    : "Edited artifact created. No manual changes yet.";
  const captionActiveModeLabel = activeCaptionMode === "edited"
    ? "Editing: Edited captions"
    : "Viewing: Built captions (read-only)";
  const captionActiveModeSourceLabel = `Source: ${activeCaptionState?.sourceLabel ?? captionSourceLabel}`;
  const captionRebuildConsequenceLabel = captionEditedState
    ? "Rebuild replaces built captions. Edited captions are preserved."
    : "Rebuild replaces built captions.";
  const captionDiscardConsequenceLabel = captionEditedState
    ? "Discard edits returns to built captions."
    : null;
  const captionReleasePrepSafetyState: "safe" | "blocked" = captionEditedFreshness === "current" || captionBuildFreshness === "current"
    ? "safe"
    : "blocked";
  const captionReleasePrepSafetyLabel = captionReleasePrepSafetyState === "safe"
    ? "Safe for release prep"
    : "Not safe for release prep";
  const captionReleasePrepSafetyDetail = captionEditedFreshness === "current"
    ? "Edited captions match the current export basis and will be used for release prep."
    : captionBuildFreshness === "current" && captionEditedFreshness === "stale"
    ? "Edited captions do not match the current export basis. Release prep will use built captions until edits are refreshed."
    : captionBuildFreshness === "current"
    ? "Built captions match the current export basis and are safe to ship."
    : captionEditedFreshness === "stale"
    ? "Edited captions do not match the current export basis. Refresh captions or discard edits to proceed."
    : "Generate captions from the current export basis to proceed."
  const captionEditedBasisDetail = captionEditedFreshness === "current"
    ? "Matches export basis"
    : captionEditedFreshness === "stale"
    ? "Basis changed"
    : "No edited artifact";
  const captionReleasePrepSummaryLine = `Using ${captionReleaseSourceLabel} · Built ${captionBuiltSummary} · Edited ${captionEditedSummary}`;

  async function handleSendToQuench(): Promise<void> {
    if (releasePrepSaving) return;

    setReleasePrepSaving(true);
    setReleasePrepError(null);
    setReleasePrepSaved(null);
    setQuenchHandoffStatus(null);

    try {
      const releasePrepPackageSnapshot = exportBasis.currentReleasePackage;
      const renderAssemblySnapshot = exportBasis.renderAssembly;
      const canonicalGraphSnapshot = exportBasis.canonicalGraph;
      const subtitlesSnapshot = exportBasis.subtitles;
      const timelineRevisionSnapshot = exportBasis.timelineRevision;
      const handoffDecision = decideHammerQuenchHandoff({
        releasePrepPackage: releasePrepPackageSnapshot,
        readinessGate,
      });
      if (handoffDecision.status === "blocked") {
        setQuenchHandoffStatus({
          status: "blocked",
          message: handoffDecision.reasons.join(" "),
        });
        return;
      }
      if (handoffDecision.status === "requires_confirmation") {
        const proceed = window.confirm(
          `This episode still needs review (${readinessGate.review_count} item${readinessGate.review_count === 1 ? "" : "s"}). Send to Quench anyway?`,
        );
        if (!proceed) {
          setQuenchHandoffStatus({
            status: "blocked",
            message: "Handoff cancelled. Resolve review items before sending.",
          });
          return;
        }
      }

      let renderExecution: HammerDialogueRenderExecutionResult;
      if (!mediaRef) {
        renderExecution = {
          status: "skipped",
          requestedBackend: editableStudioRack.backend_preference,
          resolvedBackend: "native",
          mode: "render",
          message: "No canonical source media is attached to this workpiece. Studio Rack render was skipped.",
          outputLocalRelpath: null,
          outputWorkpiecePath: null,
          outputMimeType: null,
          outputDurationMs: null,
          rawResponse: null,
        };
      } else {
        const renderLocalRelpath = preferredPlayback.kind === "polished"
          ? (preferredPlayback.local_relpath ?? mediaRef.local_relpath ?? null)
          : (mediaRef.local_relpath ?? null);
        const renderCanonicalWorkpiecePath = preferredPlayback.kind === "polished"
          ? (preferredPlayback.workpiece_path ?? null)
          : (mediaRef.local_relpath ?? null);
        const renderMimeType = preferredPlayback.kind === "polished"
          ? (preferredPlayback.mime_type ?? null)
          : null;
        renderExecution = await executeDialogueAudioRenderWithBackend({
          workspaceId: launchContext.workspace_id,
          workpieceId: launchContext.workpiece_id,
          mediaKind: mediaRef.kind,
          timelineSegments: editableTranscriptSegments.map((segment) => ({
            segment_id: segment.segment_id,
            start_sec: segment.start_sec,
            end_sec: segment.end_sec,
            is_disabled: segment.is_disabled,
            gain_db: segment.gain_db,
          })),
          rackState: editableStudioRack,
          localRootAbs: playbackLocalRootAbs,
          localRelpath: renderLocalRelpath,
          canonicalWorkpiecePath: renderCanonicalWorkpiecePath,
          mimeType: renderMimeType,
          runtimeSummary: mediaBackboneRuntime,
        });
      }
      setStudioRackRenderStatus(renderExecution);

      const preparedPackage = buildHammerPreparedReleasePackage({
        current: releasePrepPackageSnapshot,
        timelineRevision: timelineRevisionSnapshot,
      });

      const result = await saveHammerPreparedReleasePackage({
        workpieceId: launchContext.workpiece_id,
        pkg: preparedPackage,
        subtitles: subtitlesSnapshot,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }

      const quenchPacket = buildHammerQuenchReleasePacket({
        releasePrepPackage: releasePrepPackageSnapshot,
        readinessGate,
        preparedAt: preparedPackage.preparedAt,
        canonicalGraph: canonicalGraphSnapshot,
        renderAssembly: renderAssemblySnapshot,
      });
      const packetValidation = validateHammerQuenchPacketForHandoff({
        releasePrepPackage: releasePrepPackageSnapshot,
        packet: quenchPacket,
        renderAssembly: renderAssemblySnapshot,
        readinessGate,
      });
      if (!packetValidation.ok) {
        setQuenchHandoffStatus({
          status: "failed_validation",
          message: packetValidation.reasons.join(" "),
        });
        return;
      }
      const packetSave = await saveHammerQuenchReleasePacket({
        workpieceId: launchContext.workpiece_id,
        packet: quenchPacket,
      });
      if (!packetSave.ok) {
        setQuenchHandoffStatus({
          status: "failed_handoff",
          message: packetSave.error,
        });
        return;
      }

      const subtitleArtifactCount = Number(Boolean(preparedPackage.subtitles.srt.artifactPath))
        + Number(Boolean(preparedPackage.subtitles.vtt.artifactPath));

      setReleasePrepSaved({
        preparedAt: preparedPackage.preparedAt,
        overallStatus: preparedPackage.overallStatus,
        subtitleArtifactCount,
      });
      setLoadedPreparedPackage(result.data ?? preparedPackage);
      setQuenchHandoffStatus({
        status: "sent",
        message: "Sent to Quench successfully.",
      });
    } catch (error) {
      const message = toErrorMessage(error, "Hammer could not send the Quench release packet.");
      setReleasePrepError(message);
      setQuenchHandoffStatus({
        status: "failed_persistence",
        message,
      });
    } finally {
      setReleasePrepSaving(false);
    }
  }

  useEffect(() => {
    if (!props.prepHandoffAction) return;
    if (props.prepHandoffAction.token === lastHandledHandoffTokenRef.current) return;

    lastHandledHandoffTokenRef.current = props.prepHandoffAction.token;

    switch (props.prepHandoffAction.id) {
      case "review_transcript":
      case "begin_manual_editing":
        selectPass("transcript_cleanup");
        setFocusOverride("source-focus");
        break;
      case "review_visuals":
        selectPass("image_placement");
        setFocusOverride("tool-focus");
        break;
      case "review_audio":
        selectPass("audio_finalization");
        setFocusOverride("tool-focus");
        break;
      case "review_macros":
        selectPass("packaging");
        setFocusOverride("tool-focus");
        break;
      default:
        break;
    }
  }, [props.prepHandoffAction]);

  useHammerWorkspaceShellSnapshotEmitter({
    onWorkspaceSnapshotChange: props.onWorkspaceSnapshotChange,
    persistNowRequestNonce,
    launchContext,
    transcriptSourceId,
    previewMode,
    mediaRef,
    workspaceMapping,
    mediaSourceLabel,
    canonicalWorkpieceLabel,
    legacyCaptureLabel,
    mediaLabelMismatchWarning,
    selectedMacroRecipeRef: props.selectedMacroRecipeRef ?? null,
    lastMacroRunRef: props.lastMacroRunRef ?? null,
    canonicalStructuredTranscript: canonicalStructuredTranscriptForPersistence,
    exportCanonicalGraph: exportBasis.canonicalGraph,
    currentPass,
    passStatus,
    editableTranscriptSegments,
    selectedSegmentId,
    selectedOverlayRowId: selectedClipId,
    editableVisualPlacements,
    editableVisualTimeline,
    editableAudioPolish,
    visualPreviewSettings: {
      white_balance: visualWhiteBalance,
      color_amount: visualColorAmount,
      background_blur: visualBackgroundBlur,
      eye_contact_assist_enabled: visualEyeContactAssistEnabled,
      eye_contact_assist_strength: visualEyeContactAssistStrength,
      background_blur_px: visualBackgroundBlurPx,
      background_blur_feather_px: visualBackgroundBlurFeatherPx,
      background_blur_temporal_smoothing: visualBackgroundBlurTemporalSmoothing,
      background_blur_subject_expansion_px: visualBackgroundBlurSubjectExpansionPx,
      background_blur_quality_mode: visualBackgroundBlurQualityMode,
      background_blur_fallback_mode: visualBackgroundBlurFallbackMode,
      background_blur_provider: visualBackgroundBlurProviderId ?? "mediapipe_selfie_segmentation",
      background_replace_enabled: visualBackgroundReplaceEnabled,
      background_replace_mode: visualBackgroundReplaceMode,
      background_replace_color: visualBackgroundReplaceColor,
    },
    visualBackgroundReplaceImageUrl,
    visualTimelineProp: props.visualTimeline ?? null,
    createFallbackEditPlan,
  });

  const toolBayVM = useMemo(() => ({
    passLabel: currentPassMeta.label,
    passStatus: currentPassSelectorResult.status,
    onMarkComplete: markCurrentPassComplete,
    activeVisualTool,
    onSelectVisualTool: selectVisualTool,
    shellProps: props,
    hasSilenceSuggestionAnalysis,
    silenceSuggestionCount,
    silenceCutSuggestions,
    visibleSilenceCutSuggestions,
    acceptSilenceCutSuggestion,
    dismissSilenceCutSuggestion,
    seekPlayheadToTime,
    activeCaptionArtifactText,
    activeCaptionMode,
    activeCaptionState,
    activeExposureAdjustment,
    activeFillerCandidateCard,
    activeFillerCandidateDiffOps,
    activeLookPreset,
    activeRetakeCandidateCard,
    activeReviewKind,
    activeTool,
    addMinimalTransition,
    analyzeDeadAirClosure,
    anchorLabelDraft,
    anchorTextDraft,
    applyCleanup,
    applyDeadAirClosureBatch,
    applyExposureAdjustment,
    applyIntroPlacement,
    applyLogoOverlayStyle,
    applyLookPresetSelection,
    applyOutroPlacement,
    applyPodcastMasterPass,
    applyStudioRackMutation,
    applyVoicePolishPreset,
    audioFinalizationCompareMode,
    audioLevelingEnabled,
    audioNoiseReductionEnabled,
    setVoicePolishDeEsserStrength,
    setVoicePolishEqProfile,
    setVoicePolishFixEnabled,
    voicePolish,
    voicePolishHasAnyFixEnabled: voicePolishHasAnyFixEnabled,
    backgroundBlurProviderDescriptor,
    boundAttentionQueue,
    boundAttentionSummary,
    candidateProposedRemovalById,
    candidateReceiptByKind,
    selectedTranscriptRange,
    captionActiveModeLabel,
    captionActiveModeSourceLabel,
    captionArtifactStatusLabel,
    captionBuildFeedback,
    captionBuildFreshness,
    captionBuildState,
    captionBuiltSummary,
    captionBuiltTone,
    captionDiscardConsequenceLabel,
    captionEditedBasisDetail,
    captionEditedChangeSummary,
    captionEditedState,
    captionEditedSummary,
    captionEditedTone,
    captionEditorRefs,
    captionFormatting,
    captionRebuildConsequenceLabel,
    captionReleasePrepSafetyDetail,
    captionReleasePrepSafetyLabel,
    captionReleasePrepSafetyState,
    captionReleasePrepSummaryLine,
    captionReleaseSourceLabel,
    captionSourceLabel,
    clampImagePlacementTransform,
    cleanupPreview,
    cleanupPreviewSummary,
    cleanupReceipt,
    commitImagePlacementTransform,
    commitVisualAnchorRefinement,
    commitVisualPlacementWindow,
    currentPass,
    deadAirAnalysis,
    deadAirApplyInFlight,
    deadAirThresholdSec,
    DEFAULT_IMAGE_PLACEMENT_TRANSFORM,
    detailTag,
    discardHearthBrollSuggestion,
    editableAudioPolish,
    editableStudioRack,
    editableTranscriptSegments,
    editableVisualPlacements,
    effectivePlaybackCutRegions,
    exportStatusLabel,
    exportTruthPosture,
    exportTruthState,
    fillerActiveCandidateIndex,
    fillerCandidateCards,
    fillerCleanupOptions,
    fillerDecisionInFlight,
    finishingChecklist,
    focusBoundAttentionOperation,
    focusReadinessIssue,
    gapCleanupOptions,
    handleCandidateDecision,
    handleDiscardEditedCaptions,
    handleEditCaptionChunkText,
    handleEnableCaptionEdits,
    handleMergeEditedCaptionChunk,
    handleNormalizeEditedCaptionChunkPunctuation,
    handleRebuildCaptionArtifacts,
    handleSendToQuench,
    handleSplitEditedCaptionChunk,
    handleToggleEditedCaptionChunkSpeakerLabel,
    handoffTruthPosture,
    hasTranscriptSelection,
    introOutroSelectedIntroPath,
    introOutroSelectedOutroPath,
    introOutroSelection,
    loadedPreparedPackage,
    LOGO_POSITION_OPTIONS,
    LOGO_SIZE_OPTIONS,
    MIN_IMAGE_PLACEMENT_DURATION_SEC,
    moveResolvedBrollBinding,
    navigateBoundAttention,
    outputSelectionSummary,
    PACKAGING_INTRO_ENTRY_ID,
    PACKAGING_OUTRO_ENTRY_ID,
    packagingIntroPlacement,
    packagingLogoAssetPath,
    packagingLogoPlacement,
    packagingLogoPosition,
    packagingLogoSize,
    packagingOutroPlacement,
    persistedAudioCutCount,
    podcastMasterLayer,
    podcastMasterUiStatus,
    polishStrength,
    previewQuickClean,
    previewRemoveFillers,
    previewRemoveRetakes,
    previewShortenGaps,
    previewSpeakerInterview,
    previewSpeakerMonologue,
    previewSpeakerPanel,
    previewSpeakerSolo,
    previewTruthPosture,
    props,
    quenchHandoffStatus,
    readinessStatusLabel,
    readinessVerdict,
    readySummaryAreas,
    refreshCandidateQueue,
    releasePrepError,
    releasePrepLoading,
    releasePrepOpenHref,
    releasePrepSaved,
    releasePrepSaving,
    releasePrepStaleReasons,
    removePackagingPlacement,
    removeVisualPlacement,
    replaceResolvedBrollBinding,
    resolvedBrollBindingItems,
    resolveHearthBrollSuggestion,
    retakeActiveCandidateIndex,
    retakeCandidateCards,
    retakeCleanupOptions,
    retakeDecisionInFlight,
    revertResolvedBrollBinding,
    roundToTenth,
    SEGMENTATION_PROVIDER_DESCRIPTORS,
    selectedBoundBrollInspectorState,
    selectedBoundBrollOperationId,
    selectedCaptionArtifactFormat,
    selectedImageAnimationLabel,
    selectedImagePlacement,
    selectedImagePlacementTransform,
    selectedTransitionBoundObject,
    selectedVisualAnchorSegment,
    selectedVisualAnchorSegmentId,
    selectedVisualClip,
    sendToQuenchButtonLabel,
    setActiveCaptionArtifactMode,
    setActiveReviewKind,
    setActiveTranscriptToolSection,
    setAnchorLabelDraft,
    setAnchorTextDraft,
    setAudioFinalizationCompare,
    setAudioLevelingEnabled,
    setAudioNoiseReductionEnabled,
    updateCandidateProposedRemoval,
    setCaptionFormatting,
    setCleanupPreview,
    setDeadAirThresholdSec,
    setDetailTag,
    setFillerCleanupOptions,
    setFinishingChecklist,
    setFocusOverride,
    setGapCleanupOptions,
    setPolishStrength,
    setRetakeCleanupOptions,
    setSelectedCaptionArtifactFormat,
    setSpeakerInterviewOptions,
    setSpeakerMonologueOptions,
    setSpeakerPanelOptions,
    setSpeakerSoloOptions,
    setStudioRackBackend,
    setStudioRackBypassed,
    setStudioRackEnabled,
    setStudioRackModuleBypassed,
    setStudioRackModuleEnabled,
    setStudioRackOpen,
    setTranscriptTimingHint,
    setVideoSnapMode,
    setVisualBackgroundBlur,
    setVisualBackgroundBlurDebugMask,
    setVisualBackgroundMaskPreviewMode,
    setVisualBackgroundMaskPreviewStage,
    setVisualBackgroundBlurFallbackMode,
    setVisualBackgroundBlurFeatherPx,
    setVisualBackgroundBlurSubjectExpansionPx,
    setVisualBackgroundBlurProviderId,
    setVisualBackgroundBlurPx,
    setVisualBackgroundBlurQualityMode,
    setVisualBackgroundBlurRuntimeStatus,
    setVisualBackgroundBlurTemporalSmoothing,
    setVisualBackgroundReplaceColor,
    setVisualBackgroundReplaceEnabled,
    setVisualBackgroundReplaceImageUrl,
    setVisualBackgroundReplaceMode,
    setVisualBackgroundWashDesaturateAmount,
    setVisualBackgroundWashDimAmount,
    setVisualBackgroundWashEnabled,
    setVisualColorAmount,
    setVisualEyeContactAssistDebugOverlay,
    setVisualEyeContactAssistEnabled,
    setVisualEyeContactAssistRuntimeStatus,
    setVisualEyeContactAssistStrength,
    setVisualWhiteBalance,
    sourceBrollItems,
    sourceImageLibraryItems,
    speakerInterviewOptions,
    speakerMonologueOptions,
    speakerOptions,
    speakerPanelOptions,
    speakerSoloOptions,
    studioRackEnabledModuleCount,
    studioRackOpen,
    studioRackPlaybackBackendResolution,
    studioRackPlaybackConfig,
    studioRackRenderAppliedModules,
    studioRackRenderBackendResolution,
    studioRackRenderConfig,
    studioRackRenderDeferredModules,
    studioRackRenderStatus,
    studioRackComparePreviewStatusLabel,
    toggleLogoOverlay,
    transcriptSegmentsById,
    transcriptSelectionRange,
    trimResolvedBrollBinding,
    unresolvedBrollSuggestionItems,
    updateImagePlacementTransform,
    updateVisualPlacementTiming,
    videoSnapMode,
    viewingModeSummary,
    visualBackgroundBlur,
    visualBackgroundBlurDebugMask,
    visualBackgroundMaskPreviewMode,
    visualBackgroundMaskPreviewStage,
    visualBackgroundBlurFallbackMode,
    visualBackgroundBlurFeatherPx,
    visualBackgroundBlurSubjectExpansionPx,
    visualBackgroundBlurPx,
    visualBackgroundBlurQualityMode,
    visualBackgroundBlurRuntimeStatus,
    visualBackgroundBlurStatusSummary,
    visualBackgroundBlurTemporalSmoothing,
    visualBackgroundReplaceColor,
    visualBackgroundReplaceEnabled,
    visualBackgroundReplaceImageUrl,
    visualBackgroundReplaceMode,
    visualBackgroundWashDesaturateAmount,
    visualBackgroundWashDimAmount,
    visualBackgroundWashEnabled,
    visualColorAmount,
    visualEyeContactAssistDebugOverlay,
    visualEyeContactAssistEnabled,
    visualEyeContactAssistRuntimeStatus,
    visualEyeContactAssistStatusSummary,
    visualEyeContactAssistStrength,
    visualWhiteBalance,
    workspaceFocusMode,
  }), [
    activeVisualTool,
    currentPassMeta.label,
    currentPassSelectorResult.status,
    markCurrentPassComplete,
    props,
    activeCaptionArtifactText,
    activeCaptionMode,
    activeCaptionState,
    activeExposureAdjustment,
    activeFillerCandidateCard,
    activeFillerCandidateDiffOps,
    activeLookPreset,
    activeRetakeCandidateCard,
    activeReviewKind,
    activeTool,
    addMinimalTransition,
    analyzeDeadAirClosure,
    anchorLabelDraft,
    anchorTextDraft,
    applyCleanup,
    applyDeadAirClosureBatch,
    applyExposureAdjustment,
    applyIntroPlacement,
    applyLogoOverlayStyle,
    applyLookPresetSelection,
    applyOutroPlacement,
    applyPodcastMasterPass,
    applyStudioRackMutation,
    applyVoicePolishPreset,
    audioFinalizationCompareMode,
    audioLevelingEnabled,
    audioNoiseReductionEnabled,
    setVoicePolishDeEsserStrength,
    setVoicePolishEqProfile,
    setVoicePolishFixEnabled,
    voicePolish,
    voicePolishHasAnyFixEnabled,
    backgroundBlurProviderDescriptor,
    boundAttentionQueue,
    boundAttentionSummary,
    candidateProposedRemovalById,
    candidateReceiptByKind,
    selectedTranscriptRange,
    captionActiveModeLabel,
    captionActiveModeSourceLabel,
    captionArtifactStatusLabel,
    captionBuildFeedback,
    captionBuildFreshness,
    captionBuildState,
    captionBuiltSummary,
    captionBuiltTone,
    captionDiscardConsequenceLabel,
    captionEditedBasisDetail,
    captionEditedChangeSummary,
    captionEditedState,
    captionEditedSummary,
    captionEditedTone,
    captionEditorRefs,
    captionFormatting,
    captionRebuildConsequenceLabel,
    captionReleasePrepSafetyDetail,
    captionReleasePrepSafetyLabel,
    captionReleasePrepSafetyState,
    captionReleasePrepSummaryLine,
    captionReleaseSourceLabel,
    captionSourceLabel,
    clampImagePlacementTransform,
    cleanupPreview,
    cleanupPreviewSummary,
    cleanupReceipt,
    commitImagePlacementTransform,
    commitVisualAnchorRefinement,
    commitVisualPlacementWindow,
    currentPass,
    deadAirAnalysis,
    deadAirApplyInFlight,
    deadAirThresholdSec,
    DEFAULT_IMAGE_PLACEMENT_TRANSFORM,
    detailTag,
    discardHearthBrollSuggestion,
    editableAudioPolish,
    editableStudioRack,
    editableTranscriptSegments,
    editableVisualPlacements,
    effectivePlaybackCutRegions,
    exportStatusLabel,
    exportTruthPosture,
    exportTruthState,
    fillerActiveCandidateIndex,
    fillerCandidateCards,
    fillerCleanupOptions,
    fillerDecisionInFlight,
    finishingChecklist,
    focusBoundAttentionOperation,
    focusReadinessIssue,
    gapCleanupOptions,
    handleCandidateDecision,
    handleDiscardEditedCaptions,
    handleEditCaptionChunkText,
    handleEnableCaptionEdits,
    handleMergeEditedCaptionChunk,
    handleNormalizeEditedCaptionChunkPunctuation,
    handleRebuildCaptionArtifacts,
    handleSendToQuench,
    handleSplitEditedCaptionChunk,
    handleToggleEditedCaptionChunkSpeakerLabel,
    handoffTruthPosture,
    hasTranscriptSelection,
    introOutroSelectedIntroPath,
    introOutroSelectedOutroPath,
    introOutroSelection,
    loadedPreparedPackage,
    LOGO_POSITION_OPTIONS,
    LOGO_SIZE_OPTIONS,
    MIN_IMAGE_PLACEMENT_DURATION_SEC,
    moveResolvedBrollBinding,
    navigateBoundAttention,
    outputSelectionSummary,
    PACKAGING_INTRO_ENTRY_ID,
    PACKAGING_OUTRO_ENTRY_ID,
    packagingIntroPlacement,
    packagingLogoAssetPath,
    packagingLogoPlacement,
    packagingLogoPosition,
    packagingLogoSize,
    packagingOutroPlacement,
    persistedAudioCutCount,
    podcastMasterLayer,
    podcastMasterUiStatus,
    polishStrength,
    previewQuickClean,
    previewRemoveFillers,
    previewRemoveRetakes,
    previewShortenGaps,
    previewSpeakerInterview,
    previewSpeakerMonologue,
    previewSpeakerPanel,
    previewSpeakerSolo,
    previewTruthPosture,
    props,
    quenchHandoffStatus,
    readinessStatusLabel,
    readinessVerdict,
    readySummaryAreas,
    refreshCandidateQueue,
    releasePrepError,
    releasePrepLoading,
    releasePrepOpenHref,
    releasePrepSaved,
    releasePrepSaving,
    releasePrepStaleReasons,
    removePackagingPlacement,
    removeVisualPlacement,
    replaceResolvedBrollBinding,
    resolvedBrollBindingItems,
    resolveHearthBrollSuggestion,
    retakeActiveCandidateIndex,
    retakeCandidateCards,
    retakeCleanupOptions,
    retakeDecisionInFlight,
    revertResolvedBrollBinding,
    roundToTenth,
    SEGMENTATION_PROVIDER_DESCRIPTORS,
    selectedBoundBrollInspectorState,
    selectedBoundBrollOperationId,
    selectedCaptionArtifactFormat,
    selectedImageAnimationLabel,
    selectedImagePlacement,
    selectedImagePlacementTransform,
    selectedTransitionBoundObject,
    selectedVisualAnchorSegment,
    selectedVisualAnchorSegmentId,
    selectedVisualClip,
    sendToQuenchButtonLabel,
    setActiveCaptionArtifactMode,
    setActiveReviewKind,
    setActiveTranscriptToolSection,
    setAnchorLabelDraft,
    setAnchorTextDraft,
    setAudioFinalizationCompare,
    setAudioLevelingEnabled,
    setAudioNoiseReductionEnabled,
    updateCandidateProposedRemoval,
    setCaptionFormatting,
    setCleanupPreview,
    setDeadAirThresholdSec,
    setDetailTag,
    setFillerCleanupOptions,
    setFinishingChecklist,
    setFocusOverride,
    setGapCleanupOptions,
    setPolishStrength,
    setRetakeCleanupOptions,
    setSelectedCaptionArtifactFormat,
    setSpeakerInterviewOptions,
    setSpeakerMonologueOptions,
    setSpeakerPanelOptions,
    setSpeakerSoloOptions,
    setStudioRackBackend,
    setStudioRackBypassed,
    setStudioRackEnabled,
    setStudioRackModuleBypassed,
    setStudioRackModuleEnabled,
    setStudioRackOpen,
    setTranscriptTimingHint,
    setVideoSnapMode,
    setVisualBackgroundBlur,
    setVisualBackgroundBlurDebugMask,
    setVisualBackgroundMaskPreviewMode,
    setVisualBackgroundMaskPreviewStage,
    setVisualBackgroundBlurFallbackMode,
    setVisualBackgroundBlurFeatherPx,
    setVisualBackgroundBlurSubjectExpansionPx,
    setVisualBackgroundBlurProviderId,
    setVisualBackgroundBlurPx,
    setVisualBackgroundBlurQualityMode,
    setVisualBackgroundBlurRuntimeStatus,
    setVisualBackgroundBlurTemporalSmoothing,
    setVisualBackgroundReplaceColor,
    setVisualBackgroundReplaceEnabled,
    setVisualBackgroundReplaceImageUrl,
    setVisualBackgroundReplaceMode,
    setVisualBackgroundWashDesaturateAmount,
    setVisualBackgroundWashDimAmount,
    setVisualBackgroundWashEnabled,
    setVisualColorAmount,
    setVisualEyeContactAssistDebugOverlay,
    setVisualEyeContactAssistEnabled,
    setVisualEyeContactAssistRuntimeStatus,
    setVisualEyeContactAssistStrength,
    setVisualWhiteBalance,
    silenceSuggestionCount,
    selectVisualTool,
    sourceBrollItems,
    sourceImageLibraryItems,
    speakerInterviewOptions,
    speakerMonologueOptions,
    speakerOptions,
    speakerPanelOptions,
    speakerSoloOptions,
    studioRackEnabledModuleCount,
    studioRackOpen,
    studioRackPlaybackBackendResolution,
    studioRackPlaybackConfig,
    studioRackRenderAppliedModules,
    studioRackRenderBackendResolution,
    studioRackRenderConfig,
    studioRackRenderDeferredModules,
    studioRackRenderStatus,
    studioRackComparePreviewStatusLabel,
    toggleLogoOverlay,
    transcriptSegmentsById,
    transcriptSelectionRange,
    trimResolvedBrollBinding,
    unresolvedBrollSuggestionItems,
    updateImagePlacementTransform,
    updateVisualPlacementTiming,
    videoSnapMode,
    viewingModeSummary,
    visualBackgroundBlur,
    visualBackgroundBlurDebugMask,
    visualBackgroundMaskPreviewMode,
    visualBackgroundMaskPreviewStage,
    visualBackgroundBlurFallbackMode,
    visualBackgroundBlurFeatherPx,
    visualBackgroundBlurSubjectExpansionPx,
    visualBackgroundBlurPx,
    visualBackgroundBlurQualityMode,
    visualBackgroundBlurRuntimeStatus,
    visualBackgroundBlurStatusSummary,
    visualBackgroundBlurTemporalSmoothing,
    visualBackgroundReplaceColor,
    visualBackgroundReplaceEnabled,
    visualBackgroundReplaceImageUrl,
    visualBackgroundReplaceMode,
    visualBackgroundWashDesaturateAmount,
    visualBackgroundWashDimAmount,
    visualBackgroundWashEnabled,
    visualColorAmount,
    visualEyeContactAssistDebugOverlay,
    visualEyeContactAssistEnabled,
    visualEyeContactAssistRuntimeStatus,
    visualEyeContactAssistStatusSummary,
    visualEyeContactAssistStrength,
    visualWhiteBalance,
    workspaceFocusMode,
  ]);

  return (
    <section
      ref={workspaceShellRef}
      data-layout-mode={workspaceLayoutMode}
      className={[
        "hammer-workspace-shell",
        workspaceFocusMode === "source-focus" ? "is-source-focus" : "",
        workspaceFocusMode === "tool-focus" ? "is-tool-focus" : "",
        workspaceFocusMode === "time-focus" ? "is-time-focus" : "",
        workspaceFocusMode === "balanced" ? "is-balanced" : "",
        currentPass === "visual_finishing" ? "is-visual-finishing" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="hammer-workspace-shell__main">
        <div className="hammer-workspace-shell__top">
          <section className="hammer-source-bay">
            <HammerWorkspaceShellSourceBay vm={sourceBayVM} />
          </section>

          <section className="hammer-preview-bay">
            <HammerWorkspaceShellPreviewBay vm={previewBayVM} />
          </section>

          <section className="hammer-tool-bay">
            <HammerWorkspaceShellToolBay vm={toolBayVM} />
          </section>
        </div>

        <section className="hammer-timeline-dock">
          <HammerWorkspaceShellTimelineDock vm={timelineDockVM} />
        </section>
      </div>
      {imageAnimationContextMenu && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={imageAnimationContextMenuRef}
            className="hammer-context-menu"
            role="menu"
            aria-label="Image animation preset menu"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            {IMAGE_ANIMATION_PRESET_OPTIONS.map((option) => (
              <button
                key={`anim:${option.id}`}
                type="button"
                role="menuitem"
                className={(
                  resolvePlacementAnimationPreset(visualPlacementsById.get(imageAnimationContextMenu.placementId))
                ) === option.id
                  ? "hammer-context-menu__item is-active"
                  : "hammer-context-menu__item"}
                onClick={() => applyImageAnimationPreset(imageAnimationContextMenu.placementId, option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )
        : null}

      <nav className="hammer-toolbar" aria-label="Hammer pass toolbar">
        <HammerWorkspaceShellToolbar vm={toolbarVM} />
      </nav>
    </section>
  );
}
