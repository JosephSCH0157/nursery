import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";
import type { HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerEditInstruction,
} from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import {
  cloneHammerEditorialAuthorityGraph,
  type HammerEditorialAuthorityGraph,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { createSemanticEditPlanSignature } from "../lib/editPlanSignature";
import type { HammerPlacementOutboundDiagnostics, HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import type {
  HammerPassId,
  HammerPassStatusMap,
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
  getEffectiveCutRegions,
  resolveNextAudiblePlaybackTime,
} from "./hammerAudioEditPlayback";
import {
  commitAudioCutSelection,
} from "./hammerAudioEditOperations";
import {
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
  type HammerDeleteOnlyTranscriptDeletion,
} from "./hammerDeleteOnlyTranscriptEditing";
import {
  resolveSelectedSegmentId,
  resolveTranscriptDurationSec,
  updateTranscriptSegmentSpeaker,
} from "./hammerWorkspaceTranscript";
import { useHammerWorkspaceShellSilenceEditing } from "./useHammerWorkspaceShellSilenceEditing";
import {
  cloneEditorState,
  type HammerEditorStateSerializable,
  type HammerHistoryEntry,
  type HammerHistoryKind,
  type HammerOutputSelectionState,
} from "./hammerWorkspaceHistory";
import {
  cloneHammerDerivedTextLayers,
  listHammerDerivedTextLayers,
  normalizeHammerOutputSelectionRef,
  setHammerDerivedTextLayerActive,
  setHammerDerivedTextLayerOutput,
} from "../macros/hammerDerivedTranscriptLayers";
import { diffWords, isSubtractiveTranscriptWordEdit } from "../lib/hammerWordDiff";
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
  type HammerStoredMediaFile,
} from "../lib/hammerSourceDeskMediaApi";
import { deriveStableHammerAssetIdFromPath } from "../lib/hammerAssetIdentity";
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
import { useHammerWorkspaceShellReleasePrep } from "./useHammerWorkspaceShellReleasePrep";
import { useHammerWorkspaceShellVisualEditing } from "./useHammerWorkspaceShellVisualEditing";
import { useHammerWorkspaceShellHydration } from "./useHammerWorkspaceShellHydration";
import { useHammerWorkspaceShellTranscriptCleanup } from "./useHammerWorkspaceShellTranscriptCleanup";
import { useHammerWorkspaceShellCleanupCandidateReview } from "./useHammerWorkspaceShellCleanupCandidateReview";
import { useHammerWorkspaceShellRouting } from "./useHammerWorkspaceShellRouting";
import {
  buildPreviewBayVM,
  buildSourceBayVM,
  buildTimelineDockVM,
  buildToolbarVM,
  buildToolBayVM,
} from "./hammerWorkspaceShellViewModels";
import {
  toHammerLinkedSelectionVisualItems,
  type HammerSelectedTranscriptRange,
  type HammerSelectedTranscriptRangeDetail,
} from "./hammerWorkspaceShellSelectionUtils";
import {
  createHammerAudioFinishingCommands,
  useHammerAudioFinishingCompareResetEffect,
  useHammerAudioFinishingBackendDerivedState,
  useHammerAudioFinishingEnabledModuleCount,
  useHammerAudioFinishingRackDerivedState,
  useHammerAudioFinishingNativePreviewEffect,
  useHammerAudioFinishingPolishState,
  useHammerAudioFinishingRenderStatusState,
  useHammerAudioFinishingStudioRackState,
} from "./useHammerWorkspaceShellAudioFinishing";
import { buildHammerMediaBackboneRuntimeSummary } from "../media/hammerMediaBackbone";
import { preserveTranscriptMetadata } from "../prep/hammerPrep";
import { resolveHammerRecordingIdentityStatus } from "./hammerRecordingIdentity";
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
  resolveImageFirstEditablePreviewMoment,
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
  compareHammerPreparedReleasePackageToCurrent,
} from "../lib/hammerPreparedReleasePackage";
import { loadHammerWorkspaceWorkpieceLabel } from "../app/hammerRuntimeData";
import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
} from "../lib/hammerQuenchReleasePacket";
import { deriveHammerReleaseHandoffPosture } from "../lib/hammerReleaseHandoffPosture";
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
  deriveHydratedPassStatus,
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
import HammerWorkspaceShellToolbar from "./HammerWorkspaceShellToolbar";
import HammerWorkspaceShellPreviewBay from "./HammerWorkspaceShellPreviewBay";
import HammerWorkspaceShellTimelineDock from "./HammerWorkspaceShellTimelineDock";
import HammerWorkspaceShellSourceBay from "./HammerWorkspaceShellSourceBay";
import HammerWorkspaceShellToolBay from "./HammerWorkspaceShellToolBay";
import {
  createHammerHistoryCommandAuthority,
  useHammerWorkspaceShellHistoryController,
  type HammerHistoryCommandAuthorityConfig,
  type HammerHistoryPostSaveSnapshotRequest,
} from "./hammerWorkspaceShellHistoryController";
import { buildVisualTimelineDiagnostics } from "./hammerVisualTimelineHydrationGuard";
import { isAutoPlacementDebugFlagEnabled } from "./hammerAutoPlacementDebugFlag";
import {
  readPlacementDisplaySnapshot,
  type CanonicalAutomaticPlacementResult,
} from "../features/auto-placement";
import { resolveHammerAutomaticPlacementCommand } from "./hammerAutomaticPlacementController";
import {
  clearPreviewOverride,
  type PreviewPlacementTransform,
} from "./hammerAutoPreviewPosition";
import {
  createHammerWorkspaceShellSnapshotAuthority,
  useHammerSnapshotImmediatePersistenceSignal,
  useHammerWorkspaceShellSnapshotEmitter,
} from "./hammerWorkspaceShellSnapshotEmitter";
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
  isHammerVisualSelectionDebugEnabled,
  resolveEditorModeFromPass,
  resolveEditorModeFromSourceTab,
  resolveInitialPassId,
  resolvePassMeta,
  type HammerEditorMode,
  type HammerSourceTabId,
  type HammerVideoPanelRoute,
  type HammerVisualLutPreset,
} from "./hammerWorkspaceShellCore";
import {
  normalizeVisualPreviewSettings,
  resolveOutputSelectionFromTranscript,
  toEditorState,
  toShellState,
} from "./hammerWorkspaceShellStateAdapters";
import {
  appendUniquePaths,
  createFallbackEditPlan,
  deriveAssetKind,
  formatBytes,
  inferPlaybackMimeTypeFromPath,
  isSourceDeskAuthMessage,
  readTranscriptSegments,
  resolveMediaRef,
  resolveMediaMapSuggestionType,
  resolveWorkspaceMapping,
  toErrorMessage,
  type HammerMediaMapSuggestionType,
  type HammerSourceAssetKind,
} from "./hammerWorkspaceShellMediaUtils";
import {
  buildPreparedPackageIdentityFingerprint,
  compactHistoryActionLabel,
  formatHistoryEntryScope,
  formatHistoryTimestamp,
  formatOutputLayerLabel,
  formatStudioRackModuleLabel,
  resolveLaneGaps,
} from "./hammerWorkspaceShellFormatters";
import {
  buildStructuredTranscriptResetKey,
  buildVisualTimelineResetKey,
} from "./hammerWorkspaceShellResetKeys";
import "./HammerWorkspaceShell.css";

const HISTORY_MAX_SIZE = 100;
const HISTORY_PERSIST_DEBOUNCE_MS = 900;
const TEXT_EDIT_COALESCE_MS = 1500;
const PLAYHEAD_SNAP_TOLERANCE_SEC = DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC;
const EMPTY_VISUAL_TIMELINE_CLIPS: HammerVisualTimelineState["clips"] = [];

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
  canonicalMediaPath?: string | null;
  recordingRevisionId?: string | null;
  recordingRevisionHistoryPath?: string | null;
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
  transcriptVersionRegistry?: import("../../../../packages/contracts/hammer/transcript-versions.contract").HammerPersistedTranscriptVersionRegistry | null;
  onHistoryRecoveryStatusChange?: (status: string | null) => void;
  onWorkspaceSnapshotChange?: (
    snapshot: HammerWorkspaceSnapshot,
    options?: { persistNow?: boolean; placementDiagnostics?: HammerPlacementOutboundDiagnostics },
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
  firstVisibleEditableSec: number | null;
  anchorStatus: "anchored" | "anchor_supplied_resolution_failed" | "ambiguous_match" | "detached" | "no_placement_intent";
};

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


type HammerTimelineLaneView = {
  id: string;
  label: string;
  tone: "dialogue" | "music" | "broll" | "stills";
  blocks: HammerTimelineLaneBlock[];
};

type HammerExportTruthState = "never_prepared" | "current" | "stale";
type DerivedLayerHistoryTransition = {
  before: HammerPersistedStructuredTranscript["derived_text_layers"];
  after: HammerPersistedStructuredTranscript["derived_text_layers"];
  layerLabel: string;
};

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
  const structuredTranscriptResetKey = useMemo(
    () => buildStructuredTranscriptResetKey(props.structuredTranscript),
    [props.structuredTranscript],
  );
  const visualTimelineResetKey = useMemo(
    () => buildVisualTimelineResetKey(props.visualTimeline),
    [props.visualTimeline],
  );
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
  const { editableStudioRack, setEditableStudioRack, studioRackOpen, setStudioRackOpen } = useHammerAudioFinishingStudioRackState();
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
  const cleanupCandidateReview = useHammerWorkspaceShellCleanupCandidateReview({
    transcriptSegments: editableTranscriptSegments,
    getDurationSec: () => playbackTransportDurationSec,
    getWaveformProxy: () => editableAudioPolish?.analysis?.waveform_proxy ?? null,
    getFillerOptions: () => fillerCleanupOptions,
    getRetakeOptions: () => retakeCleanupOptions,
    getSelectedRemoval: () => selectedTranscriptRangeDetailRef.current,
    captureState: captureWorkspaceState,
    getCurrentState: () => historyAuthority.getController()?.getState() ?? null,
    applyHistoryMutation,
    clearCleanupPreview: () => clearCleanup(),
    setTranscriptTimingHint: (value) => setTranscriptTimingHint(value),
  });
  const {
    fillerCandidateCards, fillerActiveCandidateIndex, fillerDecisionInFlight,
    retakeCandidateCards, retakeActiveCandidateIndex, retakeDecisionInFlight,
    activeReviewKind, candidateReceiptByKind, candidateProposedRemovalById,
    activeFillerCandidateCard, activeRetakeCandidateCard, candidateSegmentIdSet,
    activeCandidatePrimarySegmentId, activeCandidateSegmentIdSet,
    setActiveReviewKind, setFillerActiveCandidateIndex,
    setRetakeActiveCandidateIndex, updateCandidateProposedRemoval,
    refreshCandidateQueue: refreshCleanupCandidateQueue, handleCandidateDecision, syncReviewPass,
    reconcileFillerIndex, reconcileRetakeIndex,
  } = cleanupCandidateReview;
  const [activeTranscriptToolSection, setActiveTranscriptToolSection] = useState<"fillers" | "retakes" | "silence_gaps">("fillers");
  const [selectedTranscriptRange, setSelectedTranscriptRange] = useState<HammerSelectedTranscriptRange | null>(null);
  const selectedTranscriptRangeDetailRef = useRef<HammerSelectedTranscriptRangeDetail | null>(null);
  const lastVisualSelectionLogKeyRef = useRef<string | null>(null);
  const [linkedSelection, setLinkedSelection] = useState<HammerLinkedSelection | null>(null);
  const { editableAudioPolish, setEditableAudioPolish, audioLevelingEnabled, setAudioLevelingEnabled, audioNoiseReductionEnabled, setAudioNoiseReductionEnabled, audioFinalizationCompareMode, setAudioFinalizationCompareMode } = useHammerAudioFinishingPolishState(props.audioPolish);
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
  const [visualBackgroundReplaceImageAssetPath, setVisualBackgroundReplaceImageAssetPath] = useState<string | null>(
    typeof initialVisualPreviewSettings.background_replace_image_asset_path === "string"
      ? initialVisualPreviewSettings.background_replace_image_asset_path
      : null,
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
  const { persistNowRequestNonce, requestImmediatePersist } = useHammerSnapshotImmediatePersistenceSignal();
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
  const timelineUpdateReasonRef = useRef<string>("init");
  const sourceDeskMediaUpdateReasonRef = useRef<string>("init");
  const editableVisualTimelineRef = useRef<HammerVisualTimelineState | null>(props.visualTimeline ?? null);
  const [previewAutoPositionOverrides, setPreviewAutoPositionOverrides] = useState<Record<string, PreviewPlacementTransform>>({});
  const [previewAutoPositionStatus, setPreviewAutoPositionStatus] = useState<string | null>(null);
  const [canonicalAutoPlacementEvidence, setCanonicalAutoPlacementEvidence] = useState<{
    placementId: string;
    result: CanonicalAutomaticPlacementResult;
  } | null>(null);
  const automaticallyPlacedImageIdsRef = useRef<Set<string>>(new Set());
  const fallbackPlacedImageIdsRef = useRef<Set<string>>(new Set());
  const placementOutboundDiagnosticsRef = useRef<HammerPlacementOutboundDiagnostics>({
    reason: "init",
    source: "shell_boot",
    explicitUserAction: false,
    placementCount: props.visualTimeline?.clips.length ?? props.visualPlacements?.placements.length ?? 0,
    anchorCount: buildVisualTimelineDiagnostics(props.visualTimeline ?? null).anchorCount,
  });
  const [mediaMapBeats, setMediaMapBeats] = useState<HammerMediaMapBeat[]>([]);
  const [removedMediaMapSegmentIds, setRemovedMediaMapSegmentIds] = useState<string[]>([]);
  const [sourceDeskLoading, setSourceDeskLoading] = useState(false);
  const [sourceDeskError, setSourceDeskError] = useState<string | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<"images" | "broll" | "introoutro" | null>(null);
  const [sourceDeskPreviewUrls, setSourceDeskPreviewUrls] = useState<Record<string, string>>({});
  const [sourceDeskPreviewFailures, setSourceDeskPreviewFailures] = useState<Record<string, true>>({});
  const [sourceDeskRequestedPreviewPaths, setSourceDeskRequestedPreviewPaths] = useState<string[]>([]);
  const [sourceDeskVisiblePreviewPaths, setSourceDeskVisiblePreviewPaths] = useState<string[]>([]);
  const [studioRackRenderStatus, setStudioRackRenderStatus] = useHammerAudioFinishingRenderStatusState();
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
  const segmentationSourceVideoRef = useRef<HTMLVideoElement | null>(null);
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
  const transcriptLineRefs = useRef(new Map<string, HTMLElement>());
  const visualPlacementCardRefs = useRef(new Map<string, HTMLElement>());
  const timelineTrackScrollRef = useRef<HTMLDivElement | null>(null);
  const selectionOriginRef = useRef<"system" | "transcript" | "timeline" | "playhead">("system");
  const selectionRevealFrameRef = useRef<number | null>(null);
  const snapshotAuthorityRef = useRef<ReturnType<typeof createHammerWorkspaceShellSnapshotAuthority> | null>(null);
  if (!snapshotAuthorityRef.current) {
    snapshotAuthorityRef.current = createHammerWorkspaceShellSnapshotAuthority();
  }
  const snapshotAuthority = snapshotAuthorityRef.current;
  const historyBaselineStateRef = useRef<HammerEditorStateSerializable | null>(null);
  const baselineDerivedLayersRef = useRef<HammerPersistedStructuredTranscript["derived_text_layers"]>(
    cloneHammerDerivedTextLayers(props.structuredTranscript?.derived_text_layers),
  );
  const derivedLayerHistoryRef = useRef<Map<string, DerivedLayerHistoryTransition>>(new Map());
  const historyAuthorityRef = useRef<ReturnType<typeof createHammerHistoryCommandAuthority> | null>(null);
  if (!historyAuthorityRef.current) {
    historyAuthorityRef.current = createHammerHistoryCommandAuthority(
      getHistoryAuthorityConfig(),
      HISTORY_PERSIST_DEBOUNCE_MS,
      TEXT_EDIT_COALESCE_MS,
    );
  }
  const historyAuthority = historyAuthorityRef.current;
  historyAuthority.configure(getHistoryAuthorityConfig());
  const scrubRectRef = useRef<{ left: number; width: number } | null>(null);
  const scrubAutoPlayRef = useRef(false);
  const scrubReturnToPausedRef = useRef(false);
  const applyLinkedSelectionStateRef = useRef<null | ((args: {
    selection: HammerLinkedSelection | null;
    origin: "system";
    clearTranscriptTextRange: true;
  }) => void)>(null);
  const passSelectorContextRef = useRef<HammerPassSelectorContext | null>(null);
  const currentPassSelectorResultRef = useRef<HammerPassSelectorResult | null>(null);
  const playbackOwnerIdRef = useRef(`hammer-preview-${Math.random().toString(36).slice(2, 10)}`);
  const onHistoryRecoveryStatusChangeRef = useRef(props.onHistoryRecoveryStatusChange);
  useEffect(() => {
    onHistoryRecoveryStatusChangeRef.current = props.onHistoryRecoveryStatusChange;
  }, [props.onHistoryRecoveryStatusChange]);

  useEffect(() => {
    // Avoid render loops when parents pass unstable callback identities.
    onHistoryRecoveryStatusChangeRef.current?.(historyStatus);
  }, [historyStatus]);

  const applyHydratedVisualPreviewSettings = useCallback((settings: HammerPersistedVisualPreviewSettings) => {
    const nextVisualPreviewSettings = normalizeVisualPreviewSettings(settings);
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
    setVisualBackgroundReplaceImageAssetPath(
      typeof nextVisualPreviewSettings.background_replace_image_asset_path === "string"
        ? nextVisualPreviewSettings.background_replace_image_asset_path
        : null,
    );
    setVisualBackgroundWashEnabled(Boolean(nextVisualPreviewSettings.background_wash_enabled ?? false));
    setVisualBackgroundWashDimAmount(Number(nextVisualPreviewSettings.background_wash_dim_amount ?? 0.35));
    setVisualBackgroundWashDesaturateAmount(Number(nextVisualPreviewSettings.background_wash_desaturate_amount ?? 0.25));
  }, []);

  const resetSilenceEditingRef = useRef<() => void>(() => undefined);
  const resetSilenceEditing = useCallback(() => resetSilenceEditingRef.current(), []);

  const { audioPolishHasLocalEditsRef, editableAudioPolishRef } = useHammerWorkspaceShellHydration({
    workspaceId: launchContext.workspace_id,
    workpieceId: launchContext.workpiece_id,
    initialCurrentPass: props.initialCurrentPass,
    initialSelectedSegmentId: props.initialSelectedSegmentId,
    initialVisualPreviewSettings: props.initialVisualPreviewSettings,
    incomingAudioPolish: props.audioPolish,
    transcriptSegments,
    visualTimelineClips: editableVisualTimeline?.clips ?? EMPTY_VISUAL_TIMELINE_CLIPS,
    applyLinkedSelectionStateRef,
    setCurrentPass,
    setPassStatus,
    setEditorMode,
    editableAudioPolish,
    setEditableAudioPolish,
    resetSilenceEditing,
    applyVisualPreviewSettings: applyHydratedVisualPreviewSettings,
  });

  const {
    selectEditorMode,
    selectPass,
    selectVisualTool,
    markCurrentPassComplete,
  } = useHammerWorkspaceShellRouting({
    currentPass,
    editorMode,
    activeTool,
    activeVisualTool,
    selectedSourceTab,
    videoPanelRoute,
    passSelectorContextRef,
    currentPassSelectorResultRef,
    setCurrentPass,
    setPassStatus,
    setEditorMode,
    setFocusOverride,
    setTranscriptTimingHint,
  });

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
  const recordingIdentity = useMemo(() => resolveHammerRecordingIdentityStatus({
    canonicalWorkpieceLabel,
    legacyCaptureLabel,
    canonicalMediaPath: props.canonicalMediaPath ?? null,
    mediaRef,
  }), [canonicalWorkpieceLabel, legacyCaptureLabel, mediaRef, props.canonicalMediaPath]);
  const playbackLocalRootAbs = workspaceMapping?.local_root_abs
    ?? (launchContext.media.kind === "mapped-local" ? (launchContext.media.media_root_abs ?? null) : null);
  const mediaBackboneRuntime = useMemo(
    () => buildHammerMediaBackboneRuntimeSummary(),
    [],
  );
  const audioFinishingBackendDerived = useHammerAudioFinishingBackendDerivedState({ rack: editableStudioRack, runtime: mediaBackboneRuntime });
  const studioRackPlaybackBackendResolution = audioFinishingBackendDerived.playbackBackendResolution;
  const studioRackRenderBackendResolution = audioFinishingBackendDerived.renderBackendResolution;
  const studioRackPlaybackConfig = audioFinishingBackendDerived.playbackConfig;
  const studioRackRenderConfig = audioFinishingBackendDerived.renderConfig;

  const selectedSegment = editableTranscriptSegments.find(
    (segment) => segment.segment_id === (linkedSelection?.anchorId ?? selectedSegmentId),
  ) ?? null;
  const activeFillerCandidateDiffOps = useMemo(() => {
    if (!activeFillerCandidateCard) return null;
    if (activeFillerCandidateCard.afterText == null) return null;
    return diffWords(activeFillerCandidateCard.beforeText, activeFillerCandidateCard.afterText);
  }, [activeFillerCandidateCard?.beforeText, activeFillerCandidateCard?.afterText]);

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
  useHammerAudioFinishingNativePreviewEffect({ mode: audioFinalizationCompareMode, rack: editableStudioRack, mediaSrc: effectivePlaybackMediaSrc, videoRef: previewVideoRef, audioRef: previewAudioRef });
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
  const persistedAudioCutCount = editableAudioPolish?.audio_edit?.operations.length ?? 0;
  const silenceEditing = useHammerWorkspaceShellSilenceEditing({
    identityKey: [
      launchContext.workspace_id,
      launchContext.workpiece_id,
      props.recordingRevisionId ?? "",
      transcriptSourceId,
      structuredTranscriptResetKey,
      JSON.stringify(launchContext.media),
    ].join("::"),
    transcriptSegments: editableTranscriptSegments,
    segmentation: editableAudioPolish?.analysis?.segmentation ?? null,
    durationSec: playbackTransportDurationSec,
    effectiveCutRegions: effectivePlaybackCutRegions,
    playheadSec,
    captureState: () => historyAuthority.getController()?.getState() ?? null,
    applyHistoryMutation,
    setFocusToTime: () => setFocusOverride("time-focus"),
    setTranscriptTimingHint,
  });
  resetSilenceEditingRef.current = silenceEditing.resetForWorkpiece;
  const {
    audioCutSelectionStatus,
    hasPendingAudioCutSelection,
    canMarkAudioCutSelection,
    canApplyAudioCutSelection,
    silenceCutSuggestions,
    visibleSilenceCutSuggestions,
    hasSilenceSuggestionAnalysis,
    silenceSuggestionCount,
    deadAirThresholdSec,
    deadAirAnalysis,
    deadAirApplyInFlight,
    setDeadAirThresholdSec,
    markAudioCutBoundary,
    clearAudioCutSelection,
    applyAudioCutSelection,
    acceptSilenceCutSuggestion,
    dismissSilenceCutSuggestion,
    reconcileDismissedSuggestions,
    invalidateDeadAirAnalysis,
    analyzeDeadAirClosure,
    applyDeadAirClosureBatch,
  } = silenceEditing;
  useEffect(() => {
    reconcileDismissedSuggestions();
  }, [reconcileDismissedSuggestions]);
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
    segmentationVideoSrc: effectivePreviewVideoSrc,
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
    segmentationVideoRef: previewVideoRef,
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
    flushPendingPlacementDrafts: flushPendingPlacementDraftsFromVisualEditing,
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
    requestDurablePersistBoundary: requestImmediatePersist,
    applyHistoryMutation,
    applyVisualTimelineAction,
    applyVisualTimelineActions,
    resolveCanonicalVisualTimeline,
  });
  const removeVisualPlacementWithDiagnostics = useCallback((placementId: string): void => {
    const current = editableVisualTimelineRef.current;
    const currentDiagnostics = buildVisualTimelineDiagnostics(current);
    placementOutboundDiagnosticsRef.current = {
      reason: "user_remove_visual_placement",
      source: "timeline_user_action",
      explicitUserAction: true,
      placementCount: Math.max(0, currentDiagnostics.clipCount - 1),
      anchorCount: Math.max(0, currentDiagnostics.anchorCount - 1),
    };
    removeVisualPlacement(placementId);
  }, [removeVisualPlacement]);
  const removePackagingPlacementWithDiagnostics = useCallback((entryId: string, label: string): void => {
    const current = editableVisualTimelineRef.current;
    const currentDiagnostics = buildVisualTimelineDiagnostics(current);
    placementOutboundDiagnosticsRef.current = {
      reason: "user_remove_packaging_placement",
      source: "timeline_user_action",
      explicitUserAction: true,
      placementCount: Math.max(0, currentDiagnostics.clipCount - 1),
      anchorCount: Math.max(0, currentDiagnostics.anchorCount - 1),
    };
    removePackagingPlacement(entryId, label);
  }, [removePackagingPlacement]);
  const sourceVisualPlacementItems = useMemo<HammerSourceImageItem[]>(() => (
    (compositionVisualTimeline?.clips ?? [])
      .map((clip) => {
        const asset = clip.asset_id ? (visualAssetsById.get(clip.asset_id) ?? null) : null;
        const kind = deriveAssetKind({
          visualMode: clip.visual_mode,
          assetPath: asset?.path ?? null,
        });
        if (kind !== "image" && kind !== "broll" && kind !== "reference_clip") return null;
        const startSec = imagePlacementDraftWindows[clip.clip_id]?.startSec ?? clip.start_sec;
        const endSec = imagePlacementDraftWindows[clip.clip_id]?.endSec ?? clip.end_sec;
        const firstVisibleEditableSec = kind === "image"
          ? resolveImageFirstEditablePreviewMoment({
            startSec,
            endSec,
            animationPreset: clip.animation?.preset ?? null,
          })
          : null;
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
          startSec,
          endSec,
          status: clip.placement_status,
          confidence: clip.confidence,
          visualMode: clip.visual_mode,
          assetPath: asset?.path ?? null,
          firstVisibleEditableSec,
          anchorStatus: clip.semantic_anchor.status,
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
    () => storedMediaFiles.filter((file) => file.kind === "image" && file.roles.includes("timeline_visual")),
    [storedMediaFiles],
  );
  const shellPlacementDiagnostics = useMemo(() => ({
    visualPlacementsCount: editableVisualPlacements?.placements.length ?? 0,
    anchorsCount: buildVisualTimelineDiagnostics(editableVisualTimeline).anchorCount,
    sourceVisualPlacementItemsCount: sourceVisualPlacementItems.length,
    storedImagesCount: sourceImageLibraryItems.length,
  }), [editableVisualPlacements?.placements.length, editableVisualTimeline, sourceImageLibraryItems.length, sourceVisualPlacementItems.length]);
  const shellPlacementDiagnosticsPrevRef = useRef(shellPlacementDiagnostics);
  useEffect(() => {
    const previous = shellPlacementDiagnosticsPrevRef.current;
    const next = shellPlacementDiagnostics;
    if (
      previous.visualPlacementsCount === next.visualPlacementsCount
      && previous.anchorsCount === next.anchorsCount
      && previous.sourceVisualPlacementItemsCount === next.sourceVisualPlacementItemsCount
      && previous.storedImagesCount === next.storedImagesCount
    ) {
      return;
    }
    console.debug("[hammer][placements] state update", {
      reason: timelineUpdateReasonRef.current,
      mediaReason: sourceDeskMediaUpdateReasonRef.current,
      beforeVisualPlacementsCount: previous.visualPlacementsCount,
      afterVisualPlacementsCount: next.visualPlacementsCount,
      beforeAnchorsCount: previous.anchorsCount,
      afterAnchorsCount: next.anchorsCount,
      beforeSourceVisualPlacementItemsCount: previous.sourceVisualPlacementItemsCount,
      afterSourceVisualPlacementItemsCount: next.sourceVisualPlacementItemsCount,
      beforeStoredImagesCount: previous.storedImagesCount,
      afterStoredImagesCount: next.storedImagesCount,
    });
    shellPlacementDiagnosticsPrevRef.current = next;
  }, [shellPlacementDiagnostics]);
  useEffect(() => {
    editableVisualTimelineRef.current = editableVisualTimeline;
  }, [editableVisualTimeline]);
  const selectedBackgroundReplacementAsset = useMemo(
    () => sourceImageLibraryItems.find((item) => item.path === visualBackgroundReplaceImageAssetPath) ?? null,
    [sourceImageLibraryItems, visualBackgroundReplaceImageAssetPath],
  );
  const selectedBackgroundReplacementAssetId = useMemo(
    () => selectedBackgroundReplacementAsset ? deriveStableHammerAssetIdFromPath(selectedBackgroundReplacementAsset.path) : null,
    [selectedBackgroundReplacementAsset],
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
    const previewOverride = previewAutoPositionOverrides[selectedPlacementId];
    if (previewOverride) return previewOverride;
    const draft = imagePlacementTransforms[selectedPlacementId];
    if (draft) return draft;
    if (selectedVisualClip) {
      return geometryToTransform(selectedVisualClip.geometry);
    }
    return geometryToTransform(resolvePlacementGeometry(selectedPlacementRecord));
  }, [imagePlacementTransforms, effectiveSelectedClipId, linkedPrimaryVisualId, previewAutoPositionOverrides, selectedPlacementRecord, selectedVisualClip]);
  const autoPlacementDebugEnabled = useMemo(() => {
    return isAutoPlacementDebugFlagEnabled();
  }, []);
  const selectedAutoPreviewClipId = (linkedPrimaryVisualId ?? effectiveSelectedClipId) as string | null;
  const selectedAutoPreviewActive = Boolean(selectedAutoPreviewClipId && previewAutoPositionOverrides[selectedAutoPreviewClipId]);
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
  const [previewBackgroundBlurSettings, setPreviewBackgroundBlurSettings] = useState<BackgroundBlurSettings>(backgroundBlurSettings);
  const previewBackgroundBlurSettingsFrameRef = useRef<number | null>(null);
  const previewBackgroundBlurSettingsTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (previewBackgroundBlurSettingsFrameRef.current != null) {
      window.cancelAnimationFrame(previewBackgroundBlurSettingsFrameRef.current);
      previewBackgroundBlurSettingsFrameRef.current = null;
    }
    if (previewBackgroundBlurSettingsTimerRef.current != null) {
      window.clearTimeout(previewBackgroundBlurSettingsTimerRef.current);
      previewBackgroundBlurSettingsTimerRef.current = null;
    }
    // Keep interaction responsive while capping heavy blur/matte recompute cadence.
    previewBackgroundBlurSettingsFrameRef.current = window.requestAnimationFrame(() => {
      previewBackgroundBlurSettingsFrameRef.current = null;
      previewBackgroundBlurSettingsTimerRef.current = window.setTimeout(() => {
        previewBackgroundBlurSettingsTimerRef.current = null;
        setPreviewBackgroundBlurSettings(backgroundBlurSettings);
      }, 48);
    });
    return () => {
      if (previewBackgroundBlurSettingsFrameRef.current != null) {
        window.cancelAnimationFrame(previewBackgroundBlurSettingsFrameRef.current);
        previewBackgroundBlurSettingsFrameRef.current = null;
      }
      if (previewBackgroundBlurSettingsTimerRef.current != null) {
        window.clearTimeout(previewBackgroundBlurSettingsTimerRef.current);
        previewBackgroundBlurSettingsTimerRef.current = null;
      }
    };
  }, [backgroundBlurSettings]);

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
        const transform = previewAutoPositionOverrides[clip.clip_id]
          ?? imagePlacementTransforms[clip.clip_id]
          ?? geometryToTransform(clip.geometry);
        return {
          clip_id: clip.clip_id,
          label: clip.label ?? asset?.label ?? asset?.asset_ref ?? clip.entry_id ?? clip.clip_id,
          kind: kind === "image" ? "image" : "broll",
          src: asset?.path ? (sourceDeskPreviewUrls[asset.path] ?? null) : null,
          asset_path: asset?.path ?? null,
          asset_id: clip.asset_id ?? null,
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
    previewAutoPositionOverrides,
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
      // Library cards are path-addressed, while canonical clips usually carry a
      // derived asset id. Group by the durable path when available so a placed
      // clip and its stored-library row project as one item with a real use count.
      const assetKey = placement.asset_path ?? placement.storage_key ?? assetId;
      const existing = byId.get(assetKey);
      const nextKind = deriveAssetKind({
        visualMode: placement.visual_mode,
        assetPath: placement.asset_path,
      });
      if (!existing) {
        byId.set(assetKey, {
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

      byId.set(assetKey, {
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
    currentCompositionPlayheadSec: compositionPlayheadSec,
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
  applyLinkedSelectionStateRef.current = applyLinkedSelectionState;
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
        selectVisualClip({
          clipId: item.id,
          origin: "timeline",
          revealUI: true,
          allowSurfaceSwitch: true,
          snapTarget: {
            editableStartSec: item.startSec,
            editableEndSec: item.endSec,
            firstVisibleEditableSec: item.firstVisibleEditableSec,
            preservePlayheadIfWithinEditableWindow: true,
          },
        });
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
          selectVisualClip({
            clipId: item.id,
            origin: "timeline",
            revealUI: true,
            allowSurfaceSwitch: true,
          });
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
    setStoredMediaFiles: (nextState) => {
      sourceDeskMediaUpdateReasonRef.current = "source_desk_refresh";
      setStoredMediaFiles(nextState);
    },
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
  useEffect(() => {
    if (!visualBackgroundReplaceImageAssetPath || sourceDeskPreviewUrls[visualBackgroundReplaceImageAssetPath]) return;
    requestSourceDeskPreviews([visualBackgroundReplaceImageAssetPath]);
  }, [requestSourceDeskPreviews, sourceDeskPreviewUrls, visualBackgroundReplaceImageAssetPath]);
  useEffect(() => {
    if (!visualBackgroundReplaceImageAssetPath) return;
    const previewUrl = sourceDeskPreviewUrls[visualBackgroundReplaceImageAssetPath] ?? "";
    if (!previewUrl || previewUrl === visualBackgroundReplaceImageUrl) return;
    setVisualBackgroundReplaceImageUrl(previewUrl);
  }, [sourceDeskPreviewUrls, visualBackgroundReplaceImageAssetPath, visualBackgroundReplaceImageUrl]);
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
  const {
    gapCleanupOptions,
    setGapCleanupOptions,
    fillerCleanupOptions,
    setFillerCleanupOptions,
    retakeCleanupOptions,
    setRetakeCleanupOptions,
    speakerSoloOptions,
    setSpeakerSoloOptions,
    speakerInterviewOptions,
    setSpeakerInterviewOptions,
    speakerMonologueOptions,
    setSpeakerMonologueOptions,
    speakerPanelOptions,
    setSpeakerPanelOptions,
    cleanupPreview,
    cleanupPreviewSummary,
    cleanupReceipt,
    setCleanupPreview,
    clearCleanup,
    invalidateCleanupPreview,
    tightenTranscriptSelection,
    applyCleanup,
    previewQuickClean,
    previewRemoveFillers,
    previewRemoveRetakes,
    previewShortenGaps,
    previewSpeakerInterview,
    previewSpeakerMonologue,
    previewSpeakerPanel,
    previewSpeakerSolo,
    reconcileSpeakerSoloOptions,
    reconcileSpeakerMonologueOptions,
    reconcileSpeakerInterviewOptions,
    reconcileSpeakerPanelOptions,
  } = useHammerWorkspaceShellTranscriptCleanup({
    identityKey: [
      launchContext.workpiece_id,
      props.recordingRevisionId ?? "",
      transcriptSourceId,
      structuredTranscriptResetKey,
      JSON.stringify(mediaRef),
      JSON.stringify(editableTranscriptSegments.map((segment) => [
        segment.segment_id,
        segment.speaker,
        segment.text,
        segment.start_sec,
        segment.end_sec,
        segment.is_disabled === true,
      ])),
    ].join("|"),
    workspaceId: launchContext.workspace_id,
    workpieceId: launchContext.workpiece_id,
    transcriptSegments: editableTranscriptSegments,
    selectedSegmentIds: transcriptSelectionRange.segmentIds,
    hasTranscriptSelection,
    workspaceStructuredTranscript,
    editableDerivedTextLayers,
    selectCleanupPass: () => selectPass("transcript_cleanup"),
    focusTool: () => setFocusOverride("tool-focus"),
    setTranscriptTimingHint,
    createCheckpoint: (label) => historyAuthority.createCheckpoint(label),
    applyHistoryMutation,
    applyCompositionCleanup: ({ preview, toolId }) => Boolean(applyCompositionMutation({
      type: "TRANSCRIPT_APPLY_CLEANUP_PREVIEW",
      label: preview.label,
      kind: "cleanup_tool",
      preview,
      toolId,
      immediatePersist: true,
    })),
    installDerivedLayers: ({ historyEntry, before, after, layerLabel }) => {
      setEditableDerivedTextLayers(after);
      derivedLayerHistoryRef.current.set(historyEntry.id, { before, after, layerLabel });
    },
    normalizeOutputSelection: (selection, transcript) => normalizeHammerOutputSelectionRef({
      selection,
      layers: listHammerDerivedTextLayers(transcript, { includeDiscarded: false }),
    }),
    updateOutputSelection: setEditableOutputSelection,
  });

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

  const historyController = historyAuthority.getController();
  const historyHeadEntryId = historyController?.document.headEntryId ?? null;

  const audioFinishingRackDerived = useHammerAudioFinishingRackDerivedState(editableStudioRack);
  const voicePolish = audioFinishingRackDerived.voicePolish;
  const voicePolishHasAnyFixEnabled = audioFinishingRackDerived.voicePolishHasAnyFixEnabled;
  const studioRackHasAudibleProcessing = audioFinishingRackDerived.hasAudibleProcessing;
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
  const mediaLabelMismatchWarning = recordingIdentity.labelMismatchWarning;
  const actualRecordingMismatchWarning = recordingIdentity.actualRecordingMismatchWarning;
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
  const studioRackEnabledModuleCount = useHammerAudioFinishingEnabledModuleCount(editableStudioRack);
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

  function applyWorkspaceState(nextState: HammerEditorStateSerializable, reason = "workspace_state_apply"): void {
    timelineUpdateReasonRef.current = reason;
    const normalized = toShellState(nextState);
    const previousTimeline = editableVisualTimelineRef.current;
    const previousDiagnostics = buildVisualTimelineDiagnostics(previousTimeline);
    const incomingDiagnostics = buildVisualTimelineDiagnostics(normalized.visualTimeline);
    const isDestructiveSourceDeskRefresh = (
      (reason === "history:baseline_init" || reason === "history:mutation_apply")
      && sourceDeskMediaUpdateReasonRef.current === "source_desk_refresh"
      && (previousDiagnostics.anchorCount > 0 || previousDiagnostics.clipCount > 0)
      && incomingDiagnostics.anchorCount === 0
      && incomingDiagnostics.clipCount === 0
    );
    const protectedTimeline = isDestructiveSourceDeskRefresh
      ? previousTimeline
      : normalized.visualTimeline;
    if (isDestructiveSourceDeskRefresh) {
      console.error("[hammer][placements] blocked destructive refresh update", {
        reason,
        mediaReason: sourceDeskMediaUpdateReasonRef.current,
        beforeVisualPlacementsCount: previousDiagnostics.clipCount,
        afterVisualPlacementsCount: incomingDiagnostics.clipCount,
        beforeAnchorsCount: previousDiagnostics.anchorCount,
        afterAnchorsCount: incomingDiagnostics.anchorCount,
      });
    }
    const protectedDiagnostics = buildVisualTimelineDiagnostics(protectedTimeline);
    placementOutboundDiagnosticsRef.current = {
      reason,
      source: sourceDeskMediaUpdateReasonRef.current,
      explicitUserAction: false,
      placementCount: protectedDiagnostics.clipCount,
      anchorCount: protectedDiagnostics.anchorCount,
    };
    setEditableTranscriptSegments(normalized.segments);
    setEditableVisualTimeline(protectedTimeline);
    setEditableStudioRack(normalized.studioRack);
    setEditableEditorialAuthorityGraph(normalized.editorialAuthorityGraph);
    setEditableOutputSelection(normalized.outputSelection);
    setSelectedSegmentId(normalized.selectedSegmentId);
    setPlayheadSec(normalized.playheadSec);
    setTranscriptTimingHint(normalized.transcriptTimingHint);
    setLinkedSelection(
      protectedTimeline?.selected_clip_id
        ? resolveSelectionFromVisual({
          transcriptSegments: normalized.segments,
          visualItems: linkedSelectionVisualItems,
          visualId: protectedTimeline.selected_clip_id,
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
    invalidateCleanupPreview();
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

  function flushPendingPlacementDrafts(): void {
    flushPendingPlacementDraftsFromVisualEditing();
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
              waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
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
              waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
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
              waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
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
              waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
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
              waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
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

  function capturePostHistorySaveRequest(
    document: Parameters<HammerHistoryCommandAuthorityConfig["captureSnapshotRequest"]>[0],
    editorState: HammerEditorStateSerializable,
  ): HammerHistoryPostSaveSnapshotRequest {
    return Object.freeze({
      workpieceId: document.workpieceId,
      sessionId: document.sessionId,
      baseRevisionId: document.baseRevisionId,
      headEntryId: document.headEntryId ?? null,
      undoDepth: document.undoStack.length,
      redoDepth: document.redoStack.length,
      editorState: cloneEditorState(editorState),
    });
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
    return historyAuthority.applyMutation(args);
  }

  function undoHistory(): void {
    historyAuthority.undo();
  }

  function redoHistory(): void {
    historyAuthority.redo();
  }

  function getHistoryAuthorityConfig(): HammerHistoryCommandAuthorityConfig {
    return {
      workspaceId: launchContext.workspace_id,
      workpieceId: launchContext.workpiece_id,
      revisionId: props.recordingRevisionId ?? null,
      selectionSegmentId: selectedSegmentId,
      activeTool,
      captureState: captureWorkspaceState,
      normalizeState: syncVisualTimelineFromCompatibilityState,
      applyState: applyWorkspaceState,
      onUndoRedoEntry: (entry, direction) => {
        const transition = derivedLayerHistoryRef.current.get(entry.id);
        if (transition) {
          setEditableDerivedTextLayers(cloneHammerDerivedTextLayers(
            direction === "undo" ? transition.before : transition.after,
          ));
        }
        selectionOriginRef.current = "system";
        setFocusOverride("source-focus");
      },
      setHistoryStatus,
      captureSnapshotRequest: capturePostHistorySaveRequest,
      onHistorySaved: snapshotAuthority.produce,
    };
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
    reconcileSpeakerSoloOptions(speakerOptions);
  }, [reconcileSpeakerSoloOptions, speakerOptions, speakerSoloOptions.targetSpeaker]);

  useEffect(() => {
    reconcileSpeakerMonologueOptions(speakerOptions);
  }, [reconcileSpeakerMonologueOptions, speakerMonologueOptions.targetSpeaker, speakerOptions]);

  useEffect(() => {
    reconcileSpeakerInterviewOptions(speakerOptions);
  }, [reconcileSpeakerInterviewOptions, speakerOptions]);

  useEffect(() => {
    reconcileSpeakerPanelOptions(speakerOptions);
  }, [reconcileSpeakerPanelOptions, speakerOptions, speakerPanelOptions.hostSpeaker]);

  useHammerWorkspaceShellHistoryController({
    launchContext,
    actualRecordingMismatchWarning,
    recordingRevisionId: props.recordingRevisionId ?? null,
    recordingRevisionHistoryPath: props.recordingRevisionHistoryPath ?? null,
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
    historyAuthority,
    snapshotAuthority,
    historyBaselineStateRef,
    baselineDerivedLayersRef,
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

  const {
    releasePrepSaving,
    releasePrepLoading,
    releasePrepError,
    releasePrepSaved,
    quenchHandoffStatus,
    loadedPreparedPackage,
    sendToQuench,
  } = useHammerWorkspaceShellReleasePrep({
    workpieceId: launchContext.workpiece_id,
    workspaceId: launchContext.workspace_id,
    prepHandoffAction: props.prepHandoffAction,
    setStudioRackRenderStatus,
    selectPass,
    setFocusOverride,
    toErrorMessage,
  });


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
    const controller = historyAuthority.getController();
    if (!controller) {
      return { applied: false, playbackChanged: false };
    }

    const beforeState = controller.getState();
    const updatedSegments = applyDraftTranscriptEdits(beforeState.transcriptSegments, draftTextBySegmentId);
    const textCutSelections = deriveAudioCutsForSubtractiveTextEdits({
      beforeSegments: beforeState.transcriptSegments,
      afterSegments: updatedSegments,
      durationSec: playbackTransportDurationSec,
      waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
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
          waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
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

    requestImmediatePersist();

    const afterState = historyAuthority.getController()?.getState() ?? null;
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
    const controller = historyAuthority.getController();
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

    requestImmediatePersist();

    const afterState = historyAuthority.getController()?.getState() ?? null;
    const afterAudioOpCount = afterState?.audioEdit?.operations?.length ?? beforeAudioOpCount;
    return {
      applied: true,
      playbackChanged: cutSelections.length > 0 && afterAudioOpCount > beforeAudioOpCount,
      deletedTokenCount: uniqueEdits.reduce((count, edit) => count + edit.deletion.deletedTokenCount, 0),
    };
  }

  function splitSelectedSegmentAtPlayhead(): void {
    if (!selectedSegmentId) {
      setTranscriptTimingHint("Select a segment to split.");
      return;
    }

    const state = historyAuthority.getController()?.getState() ?? null;
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

    const nextSelection = historyAuthority.getController()?.getState().selectedSegmentId ?? null;
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

    const nextSelection = historyAuthority.getController()?.getState().selectedSegmentId ?? null;
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

  const {
    applyStudioRackMutation,
    setStudioRackEnabled,
    setStudioRackBypassed,
    setStudioRackBackend,
    setStudioRackModuleEnabled,
    setStudioRackModuleBypassed,
    setAudioFinalizationCompare,
    applyVoicePolishPreset,
    setVoicePolishFixEnabled,
    setVoicePolishDeEsserStrength,
    setVoicePolishEqProfile,
    setVoiceCleanupEnabled,
  } = createHammerAudioFinishingCommands({
    rack: editableStudioRack,
    applyHistoryMutation,
    focusTool: () => setFocusOverride("tool-focus"),
    setCompareMode: setAudioFinalizationCompareMode,
    hasHistoryController: () => Boolean(historyAuthority.getController()),
  });

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

    const state = historyAuthority.getController()?.getState();
    const nextSelection = state?.selectedSegmentId ?? null;
    setTranscriptSelectionAnchorSegmentId(nextSelection);
    setTranscriptSelectionFocusSegmentId(nextSelection);
    setFocusOverride("time-focus");
  }

  useEffect(() => {
    syncReviewPass(currentPass);
  }, [currentPass, syncReviewPass]);
  useHammerAudioFinishingCompareResetEffect({ rackBypassed: editableStudioRack.is_bypassed, setMode: setAudioFinalizationCompareMode });
  useEffect(() => {
  }, [sourceImageItems]);
  useEffect(() => {
    invalidateDeadAirAnalysis();
  }, [deadAirThresholdSec, editableTranscriptSegments, invalidateDeadAirAnalysis]);

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
    reconcileFillerIndex();
  }, [fillerActiveCandidateIndex, fillerCandidateCards.length, reconcileFillerIndex]);
  useEffect(() => {
    reconcileRetakeIndex();
  }, [retakeActiveCandidateIndex, retakeCandidateCards.length, reconcileRetakeIndex]);

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
    const baseline = historyBaselineStateRef.current;
    if (!baseline) return;
    const result = historyAuthority.jumpToEntry(entryId, baseline);
    if (!result) return;
    setEditableDerivedTextLayers(resolveDerivedLayersForUndoStack(result.undoStack));
    setHistoryStatus(result.hasRedo ? "History jump mode: reviewing a past state." : null);
    selectionOriginRef.current = "system";
    setFocusOverride("source-focus");
  }

  function restoreCurrentHistoryState(): void {
    if (!historyAuthority.restoreCurrentState()) return;
    setHistoryStatus("Restored this state. Future history steps were cleared.");
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
          background_replace_image_asset_path: visualBackgroundReplaceImageAssetPath,
          background_replace_image_asset_id: selectedBackgroundReplacementAssetId,
          background_replace_image_asset_type: visualBackgroundReplaceImageAssetPath ? "image" : null,
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
    visualBackgroundReplaceImageAssetPath,
    selectedBackgroundReplacementAssetId,
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
  const timelineDockVM = useMemo(() => buildTimelineDockVM({
    SCRUB_RATE_OPTIONS,
    SMALL_PLAYHEAD_NUDGE_SEC,
    editableAudioPolish,
    isScrubbing,
    setFocusOverride,
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
    setScrubRate,
    zoomTimelineOut,
    zoomTimelineIn,
    resetTimelineZoom,
    timelineZoomPercent,
    nudgePlayhead,
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
    visualTimelineLaneClips,
    timelineDurationSec,
    linkedPrimaryVisualId,
    visualPlacementEditingEnabled,
    visualTimelineFocusNonce,
    selectVisualClip,
    beginTimelineImagePlacementDrag,
    compositionOffsetSec,
    timelineTrackScrollRef,
    handleTimelineTrackWheelZoom,
    editableTranscriptSegments,
    timelineBoardZoomClassName,
    beginTimelineScrub,
    timelineMinorTicks,
    timelineTicks,
    playheadRatioPercent,
    timelineLanes,
    laneGapsById,
    currentPass,
    resolvePlacementAnimationPreset,
    visualPlacementsById,
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
  const sourceBayVM = useMemo(() => buildSourceBayVM({
    props,
    canUndo,
    undoLabel,
    undoLabelCompact,
    undoDepth,
    undoHistory,
    canRedo,
    redoLabel,
    redoLabelCompact,
    redoDepth,
    redoHistory,
    SOURCE_TABS,
    selectedSourceTab,
    selectEditorMode,
    resolveEditorModeFromSourceTab,
    sourceDeskLoading,
    sourceDeskError,
    isSourceDeskAuthMessage,
    activeOutputLayerId,
    workspaceStructuredTranscript,
    outputLayerCandidates,
    formatOutputLayerLabel,
    setFocusOverride,
    selectViewingLayer,
    editableOutputSelection,
    selectOutputLayerForExport,
    restoreCurrentHistoryState,
    recentHistoryEntries,
    historyHeadEntryId,
    derivedLayerHistoryRef,
    formatHistoryTimestamp,
    formatHistoryEntryScope,
    jumpToHistoryEntry,
    editableTranscriptSegments,
    selectedSegment,
    selectedSegmentId,
    linkedSelection,
    linkedTranscriptSegmentIdSet,
    linkedVisualIdSet,
    linkedPrimaryVisualId,
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
    setSelectedTranscriptRangeDetail,
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
    sourceDeskRemainingPreviewPaths,
    requestSourceDeskPreviews,
    reportSourceDeskPreviewLoadError,
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
    introTimelinePlaced: Boolean(packagingIntroPlacement),
    outroTimelinePlaced: Boolean(packagingOutroPlacement),
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
    removeVisualPlacement: removeVisualPlacementWithDiagnostics,
    sourceAssetItems,
    workspaceMapping,
    mediaMapBeats,
    setSelectedVisualFlowStep,
    setMediaMapBeats,
    setRemovedMediaMapSegmentIds,
    unresolvedBrollSuggestionItems,
  }), [
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
  const handleCanonicalAutoPlacementResult = useCallback((result: CanonicalAutomaticPlacementResult | null): void => {
    const placementId = selectedImagePlacement?.id ?? null;
    setCanonicalAutoPlacementEvidence(result && placementId ? { placementId, result } : null);
  }, [selectedImagePlacement?.id]);
  const previewBayVM = useMemo(() => buildPreviewBayVM({
    previewMode,
    activeTool,
    activeVisualTool,
    visualPolishPreviewActive,
    previewSurfaceRef,
    previewVideoRef,
    segmentationSourceVideoRef: previewVideoRef,
    previewAudioRef,
    previewBrollVideoRefs,
    effectivePreviewVideoSrc,
    segmentationSourceVideoSrc: null,
    effectivePlaybackMediaSrc,
    isPlaybackActive,
    playbackWindow,
    handlePlaybackProgressWithOrigin,
    handlePlaybackEnded,
    setIsPlaybackActive,
    setPlaybackWindow,
    togglePlayback,
    playheadSec,
    playbackModeLabel,
    playbackTransportDurationSec,
    playbackSourceLabel,
    mediaLabelMismatchWarning,
    actualRecordingMismatchWarning,
    studioRackPlaybackConfig,
    currentPass,
    selectedImageAnimationLabel,
    audioFinalizationCompareMode,
    studioRackComparePreviewStatusLabel,
    packagingIntroPlacement,
    packagingOutroPlacement,
    packagingLogoPlacement,
    previewSurfaceLabel,
    visualBackgroundBlur,
    visualBackgroundReplaceEnabled,
    visualBackgroundWashEnabled,
    backgroundBlurSettings: previewBackgroundBlurSettings,
    visualBackgroundBlurRuntimeStatus,
    visualBackgroundBlurProviderId,
    visualBackgroundBlurDebugMask,
    visualBackgroundMaskPreviewMode,
    visualBackgroundMaskPreviewStage,
    setVisualBackgroundBlurRuntimeStatus,
    handleBackgroundEffectCanvas,
    visualEyeContactAssistEnabled,
    visualEyeContactAssistStrength,
    visualBackgroundEffectCanvasRef,
    editableAudioPolish,
    mediaPrepOutputs,
    isScrubbing,
    eyeContactUseBackgroundCanvasAsSource,
    visualEyeContactAssistDebugOverlay,
    setVisualEyeContactAssistRuntimeStatus,
    isVisualPreviewAuthority,
    activePreviewOverlays,
    selectedImagePlacement,
    selectedImagePlacementTransform,
    visualPlacementEditingEnabled,
    selectVisualClip,
    beginPreviewCanvasDrag,
    workspaceLoaded: !sourceDeskError,
    workspaceLoadError: sourceDeskError,
    workspaceId: launchContext.workspace_id,
    workpieceId: launchContext.workpiece_id,
    episodeId: (launchContext as any)?.episode_id ?? null,
    expectedMediaPath: preferredPlayback.workpiece_path ?? preferredPlayback.local_relpath ?? mediaRef?.local_relpath ?? null,
    actualMediaPath: effectivePlaybackMediaSrc ?? null,
    onCanonicalAutoPlacementResult: handleCanonicalAutoPlacementResult,
  }), [
    activeTool,
    activeVisualTool,
    activePreviewOverlays,
    audioFinalizationCompareMode,
    previewBackgroundBlurSettings,
    beginPreviewCanvasDrag,
    currentPass,
    eyeContactUseBackgroundCanvasAsSource,
    handleBackgroundEffectCanvas,
    handlePlaybackEnded,
    handlePlaybackProgressWithOrigin,
    isPlaybackActive,
    isVisualPreviewAuthority,
    actualRecordingMismatchWarning,
    handleCanonicalAutoPlacementResult,
    mediaLabelMismatchWarning,
    packagingIntroPlacement,
    packagingLogoPlacement,
    packagingOutroPlacement,
    playbackMediaSrc,
    playbackModeLabel,
    playbackTransportDurationSec,
    playbackSourceLabel,
    playbackWindow,
    playheadSec,
    previewAudioRef,
    previewBrollVideoRefs,
    previewVideoRef,
    segmentationSourceVideoRef,
    previewVideoSrc,
    previewMode,
    previewSurfaceLabel,
    previewSurfaceRef,
    selectedImagePlacement,
    selectedImagePlacementTransform,
    sourceDeskError,
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
    visualBackgroundReplaceMode,
    visualBackgroundReplaceImageAssetPath,
    selectedBackgroundReplacementAssetId,
    visualBackgroundWashEnabled,
    visualEyeContactAssistDebugOverlay,
    visualEyeContactAssistEnabled,
    visualEyeContactAssistStrength,
    visualBackgroundEffectCanvasRef,
    visualBackgroundBlurRuntimeStatus,
    editableAudioPolish,
    mediaPrepOutputs,
    mediaRef?.local_relpath,
    isScrubbing,
    launchContext.workspace_id,
    launchContext.workpiece_id,
    (launchContext as any)?.episode_id,
    preferredPlayback.local_relpath,
    preferredPlayback.workpiece_path,
    visualPlacementEditingEnabled,
  ]);
  const previewAutoPosition = useCallback((): void => {
    const displayedFrame = readPlacementDisplaySnapshot({
      video: previewVideoRef.current,
      playbackActive: isPlaybackActive,
    });
    const command = resolveHammerAutomaticPlacementCommand({
      selectedPlacementId: selectedImagePlacement?.id ?? null,
      authorityResult: canonicalAutoPlacementEvidence
        && canonicalAutoPlacementEvidence.placementId === selectedImagePlacement?.id
        ? canonicalAutoPlacementEvidence.result
        : null,
      displayedFrame,
    });
    if (command.kind === "refused") {
      if (command.invalidateEvidence) setCanonicalAutoPlacementEvidence(null);
      setPreviewAutoPositionStatus(command.status);
      return;
    }
    const committed = commitImagePlacementTransform(
      command.placementId,
      command.transform,
      "Apply automatic visual placement",
    );
    setPreviewAutoPositionOverrides((current) => clearPreviewOverride(current, command.placementId));
    setPreviewAutoPositionStatus(committed
      ? `Automatic placement saved (${command.zone}).`
      : "Automatic placement already matches the canonical saved geometry.");
  }, [canonicalAutoPlacementEvidence, commitImagePlacementTransform, isPlaybackActive, previewVideoRef, selectedImagePlacement]);
  useEffect(() => {
    const placementId = selectedImagePlacement?.id ?? null;
    if (!placementId || automaticallyPlacedImageIdsRef.current.has(placementId)) return;
    if (canonicalAutoPlacementEvidence?.placementId !== placementId) return;
    const stillAtDefaultGeometry = (
      Math.abs(selectedImagePlacementTransform.leftPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.leftPct) < 0.01
      && Math.abs(selectedImagePlacementTransform.topPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.topPct) < 0.01
      && Math.abs(selectedImagePlacementTransform.widthPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) < 0.01
      && Math.abs(selectedImagePlacementTransform.heightPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.heightPct) < 0.01
    );
    const frame = canonicalAutoPlacementEvidence.result.requestedFrameRef;
    const currentRect = {
      x: frame.width * (selectedImagePlacementTransform.leftPct / 100),
      y: frame.height * (selectedImagePlacementTransform.topPct / 100),
      width: frame.width * (selectedImagePlacementTransform.widthPct / 100),
      height: frame.height * (selectedImagePlacementTransform.heightPct / 100),
    };
    const currentlyCoversAHead = canonicalAutoPlacementEvidence.result.headSafeBounds.some((head) => (
      currentRect.x < head.x + head.width
      && currentRect.x + currentRect.width > head.x
      && currentRect.y < head.y + head.height
      && currentRect.y + currentRect.height > head.y
    ));
    if (!stillAtDefaultGeometry && !currentlyCoversAHead && !fallbackPlacedImageIdsRef.current.has(placementId)) {
      // A non-default placement that is already face-safe is treated as user
      // authority, even when it came from an older persisted geometry format.
      automaticallyPlacedImageIdsRef.current.add(placementId);
      return;
    }

    const command = resolveHammerAutomaticPlacementCommand({
      selectedPlacementId: placementId,
      authorityResult: canonicalAutoPlacementEvidence.result,
      displayedFrame: readPlacementDisplaySnapshot({
        video: previewVideoRef.current,
        playbackActive: isPlaybackActive,
      }),
    });
    if (command.kind === "refused") {
      if (command.invalidateEvidence) setCanonicalAutoPlacementEvidence(null);
      return;
    }

    // Automatic placement is initialization, not continuing ownership. Once a
    // clip receives one canonical mask/face-aware position, later user edits win.
    automaticallyPlacedImageIdsRef.current.add(placementId);
    fallbackPlacedImageIdsRef.current.delete(placementId);
    const committed = commitImagePlacementTransform(
      command.placementId,
      command.transform,
      "Apply initial mask-safe visual placement",
    );
    setPreviewAutoPositionOverrides((current) => clearPreviewOverride(current, command.placementId));
    setPreviewAutoPositionStatus(committed
      ? `Mask-safe placement applied automatically (${command.zone}).`
      : "Mask-safe placement already matches the saved geometry.");
  }, [
    canonicalAutoPlacementEvidence,
    commitImagePlacementTransform,
    isPlaybackActive,
    previewVideoRef,
    selectedImagePlacement?.id,
    selectedImagePlacementTransform,
  ]);
  passSelectorContextRef.current = passSelectorContext;
  useEffect(() => {
    const placementId = selectedImagePlacement?.id ?? null;
    if (!placementId || automaticallyPlacedImageIdsRef.current.has(placementId)) return;
    if (!previewBayVM.automaticPlacement?.enabled) return;
    if (canonicalAutoPlacementEvidence?.placementId === placementId && canonicalAutoPlacementEvidence.result.placement) return;

    const stillAtDefaultGeometry = (
      Math.abs(selectedImagePlacementTransform.leftPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.leftPct) < 0.01
      && Math.abs(selectedImagePlacementTransform.topPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.topPct) < 0.01
      && Math.abs(selectedImagePlacementTransform.widthPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) < 0.01
      && Math.abs(selectedImagePlacementTransform.heightPct - DEFAULT_IMAGE_PLACEMENT_TRANSFORM.heightPct) < 0.01
    );
    if (!stillAtDefaultGeometry) return;

    // Face/matte inference can be unavailable or take time to warm up. Never
    // leave an automatically authored image at the centered legacy default:
    // that is precisely where a talking-head face is most likely to be. The
    // canonical resolver may still replace this conservative corner fallback
    // when current-frame evidence arrives.
    const timer = window.setTimeout(() => {
      if (automaticallyPlacedImageIdsRef.current.has(placementId)) return;
      const fallbackTransform = clampImagePlacementTransform({
        leftPct: 4,
        topPct: 6,
        widthPct: 36,
        heightPct: 26,
      });
      fallbackPlacedImageIdsRef.current.add(placementId);
      commitImagePlacementTransform(placementId, fallbackTransform, "Apply conservative visual placement fallback");
      setPreviewAutoPositionStatus("Face-aware analysis unavailable; conservative corner placement applied.");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    canonicalAutoPlacementEvidence,
    commitImagePlacementTransform,
    previewBayVM.automaticPlacement?.enabled,
    selectedImagePlacement?.id,
    selectedImagePlacementTransform,
  ]);
  const previewDiagnosticsSummary = useMemo(() => {
    const diagnostics = previewBayVM.autoPlacementDiagnostics;
    const gateById = new Map((diagnostics?.enabled ? diagnostics.gates : []).map((gate) => [gate.id, gate]));
    const frameGate = gateById.get("current_frame_available");
    const maskGate = gateById.get("segmentation_mask_available");
    return {
      diagnosticsEnabled: Boolean(diagnostics?.enabled),
      resolvedPlacementExists: Boolean(diagnostics?.enabled && diagnostics.overlay),
      diagnosticsResolvedPlacement: diagnostics?.enabled ? diagnostics.resolvedPlacementPresent : false,
      candidateCount: diagnostics?.enabled ? diagnostics.candidateCount : 0,
      maskBoundsCount: diagnostics?.enabled ? diagnostics.maskBoundsCount : 0,
      currentFrameAvailable: frameGate ? frameGate.status === "PASS" : false,
      segmentationMaskAvailable: maskGate ? maskGate.status === "PASS" : false,
      resolverStatus: diagnostics?.enabled ? diagnostics.state : "disabled",
      resolverReason: diagnostics?.enabled
        ? (diagnostics.firstBlockingReason ?? diagnostics.statusLabel)
        : "diagnostics disabled",
      selectedScale: diagnostics?.enabled ? diagnostics.selectedScale : null,
      scaleAttempts: diagnostics?.enabled ? diagnostics.scaleAttempts : [],
    };
  }, [previewBayVM.autoPlacementDiagnostics]);
  const episodeHealthSnapshot = useMemo(() => {
    const diagnostics = previewBayVM.autoPlacementDiagnostics;
    const selectedOverlayAssetId = selectedImagePlacement?.assetPath ?? null;
    return {
      workspaceId: launchContext.workspace_id ?? null,
      workpieceId: launchContext.workpiece_id ?? null,
      episodeId: (launchContext as any)?.episode_id ?? null,
      recordingPath: mediaRef?.local_relpath ?? null,
      playbackMediaPath: preferredPlayback.local_relpath ?? null,
      playbackMediaReady: Boolean(previewBayVM.playbackMediaSrc),
      visualPlacementsCount: editableVisualPlacements?.placements.length ?? 0,
      anchorCount: buildVisualTimelineDiagnostics(editableVisualTimeline).anchorCount,
      selectedPlacementId: selectedImagePlacement?.id ?? null,
      selectedClipId: selectedVisualClip?.clip_id ?? null,
      selectedAssetId: selectedVisualClip?.asset_id ?? null,
      selectedOverlayAssetId,
      frameInputAvailable: previewDiagnosticsSummary.currentFrameAvailable,
      maskBoundsCount: previewDiagnosticsSummary.maskBoundsCount,
      candidateCount: previewDiagnosticsSummary.candidateCount,
      selectedScale: previewDiagnosticsSummary.selectedScale,
      resolvedPlacement: previewDiagnosticsSummary.resolvedPlacementExists,
      resolverStatus: previewDiagnosticsSummary.resolverStatus,
      resolverReason: previewDiagnosticsSummary.resolverReason,
      diagnosticsEnabled: previewDiagnosticsSummary.diagnosticsEnabled,
      diagnosticsState: diagnostics?.enabled ? diagnostics.state : "disabled",
    };
  }, [
    editableVisualPlacements?.placements.length,
    editableVisualTimeline,
    launchContext,
    mediaRef?.local_relpath,
    preferredPlayback.local_relpath,
    previewBayVM.autoPlacementDiagnostics,
    previewBayVM.playbackMediaSrc,
    previewDiagnosticsSummary,
    selectedImagePlacement,
    selectedVisualClip,
  ]);
  const resetPreviewAutoPosition = useCallback((): void => {
    if (!selectedImagePlacement) return;
    setPreviewAutoPositionOverrides((current) => clearPreviewOverride(current, selectedImagePlacement.id));
    setPreviewAutoPositionStatus("Auto preview reset to persisted placement.");
  }, [selectedImagePlacement]);
  useEffect(() => {
    if (!((import.meta as any)?.env?.DEV) || typeof window === "undefined") return;
    const debugOn = isAutoPlacementDebugFlagEnabled();
    if (!debugOn) return;
    console.debug("[hammer][auto-placement][HammerWorkspaceShell] previewBayVM", {
      hasPreviewBayVM: Boolean(previewBayVM),
      hasAutoPlacementDiagnostics: typeof (previewBayVM as any)?.autoPlacementDiagnostics !== "undefined",
      previewMode: previewBayVM?.previewModeLabel,
    });
  }, [previewBayVM]);
  const toolbarVM = useMemo(() => buildToolbarVM({
    editableTranscriptSegments,
    editableVisualPlacements,
    editableVisualTimeline,
    summarizePassStatuses,
    passSelectorResults,
    getPassStatus,
    passSelectorContext,
    activeTool,
    currentPass,
    activeVisualTool,
    selectPass,
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
  currentPassSelectorResultRef.current = currentPassSelectorResult;
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

  const handleSendToQuench = useCallback(async (): Promise<void> => {
    await sendToQuench({
      releasePrepPackage: exportBasis.currentReleasePackage,
      renderAssembly: exportBasis.renderAssembly,
      canonicalGraph: exportBasis.canonicalGraph,
      subtitles: exportBasis.subtitles,
      timelineRevision: exportBasis.timelineRevision,
      readinessGate,
      mediaRef,
      editableStudioRack,
      preferredPlayback: {
        kind: preferredPlayback.kind,
        local_relpath: preferredPlayback.local_relpath ?? null,
        workpiece_path: preferredPlayback.workpiece_path ?? null,
        mime_type: preferredPlayback.mime_type ?? null,
      },
      playbackLocalRootAbs,
      editableTranscriptSegments,
      mediaBackboneRuntime,
    });
  }, [
    editableStudioRack,
    editableTranscriptSegments,
    exportBasis.canonicalGraph,
    exportBasis.currentReleasePackage,
    exportBasis.renderAssembly,
    exportBasis.subtitles,
    exportBasis.timelineRevision,
    mediaBackboneRuntime,
    mediaRef,
    playbackLocalRootAbs,
    preferredPlayback.kind,
    preferredPlayback.local_relpath,
    preferredPlayback.mime_type,
    preferredPlayback.workpiece_path,
    readinessGate,
    sendToQuench,
  ]);

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
    actualRecordingMismatchWarning,
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
      background_replace_image_asset_path: visualBackgroundReplaceImageAssetPath,
      background_replace_image_asset_id: selectedBackgroundReplacementAssetId,
      background_replace_image_asset_type: visualBackgroundReplaceImageAssetPath ? "image" : null,
    },
    visualBackgroundReplaceImageUrl,
    visualTimelineProp: props.visualTimeline ?? null,
    placementOutboundDiagnostics: placementOutboundDiagnosticsRef.current,
    createFallbackEditPlan,
  });

  const toolBayVM = useMemo(() => buildToolBayVM({
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
    setVoiceCleanupEnabled,
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
    handleSourceDeskUpload,
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
    refreshCleanupCandidateQueue,
    releasePrepError,
    releasePrepLoading,
    releasePrepOpenHref,
    releasePrepSaved,
    releasePrepSaving,
    releasePrepStaleReasons,
    removePackagingPlacement: removePackagingPlacementWithDiagnostics,
    removeVisualPlacement: removeVisualPlacementWithDiagnostics,
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
    autoPlacementDebugEnabled,
    selectedAutoPreviewActive,
    previewAutoPositionStatus,
    previewAutoPosition,
    resetPreviewAutoPosition,
    previewDiagnosticsSummary,
    episodeHealthSnapshot,
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
    setVisualBackgroundReplaceImageAssetPath,
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
    visualBackgroundReplaceImageAssetPath,
    selectedBackgroundReplacementAssetId,
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
    uploadingCategory,
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
    setVoiceCleanupEnabled,
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
    handleSourceDeskUpload,
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
    refreshCleanupCandidateQueue,
    releasePrepError,
    releasePrepLoading,
    releasePrepOpenHref,
    releasePrepSaved,
    releasePrepSaving,
    releasePrepStaleReasons,
    removePackagingPlacementWithDiagnostics,
    removeVisualPlacementWithDiagnostics,
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
    autoPlacementDebugEnabled,
    selectedAutoPreviewActive,
    previewAutoPositionStatus,
    previewAutoPosition,
    resetPreviewAutoPosition,
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
    setVisualBackgroundReplaceImageAssetPath,
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
    visualBackgroundReplaceImageAssetPath,
    selectedBackgroundReplacementAssetId,
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
    uploadingCategory,
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
            tabIndex={-1}
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
