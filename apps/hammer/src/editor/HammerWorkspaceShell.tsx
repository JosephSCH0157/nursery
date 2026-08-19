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
import type { HammerPlacementOutboundDiagnostics, HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import type {
  HammerPassId,
  HammerPassStatusMap,
  HammerPersistedAudioPolish,
  HammerPersistedVisualPreviewSettings,
  HammerPersistedStructuredTranscript,
  HammerVisualPlacementRecord,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import {
  selectClipById,
  selectPrimaryActiveClipAtTime,
  selectPreviewClips,
} from "../visuals/state/hammerVisualSelectors";
import type { VisualClipBlockModel } from "../visuals/components/VisualClipBlock";
import type { VisualPreviewOverlayModel } from "../visuals/components/VisualPreviewComposer";
import {
  SEGMENTATION_PROVIDER_DESCRIPTORS,
  resolveSegmentationProviderDescriptor,
} from "../features/visual-effects/providers/segmentationProviderRegistry";
import type { HammerPreparedNextStepActionId } from "./hammerPreparedHandoff";
import {
  DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC,
  SMALL_PLAYHEAD_NUDGE_SEC,
  resolvePreviewLabel,
  resolvePlayheadSegment,
  resolveTranscriptSegmentRange,
  resolveTimelineBoundaryTimes,
  roundToTenth,
  updateSegmentInTimeline,
  type HammerWorkspaceFocusOverride,
} from "./hammerWorkspaceTimeline";
import {
  getEffectiveCutRegions,
  resolveNextAudiblePlaybackTime,
} from "./hammerAudioEditPlayback";
import {
  type HammerAuthorityOp,
} from "./hammerCompositionMutations";
import {
  createHammerTranscriptEditingCommands,
  createHammerTranscriptSelectionCommands,
} from "./useHammerWorkspaceShellTranscriptEditing";
import {
  resolveSelectedSegmentId,
  resolveTranscriptDurationSec,
  updateTranscriptSegmentSpeaker,
} from "./hammerWorkspaceTranscript";
import { useHammerWorkspaceShellSilenceEditing } from "./useHammerWorkspaceShellSilenceEditing";
import {
  type HammerEditorStateSerializable,
  type HammerHistoryEntry,
  type HammerHistoryKind,
  type HammerOutputSelectionState,
} from "./hammerWorkspaceHistory";
import {
  cloneHammerDerivedTextLayers,
  listHammerDerivedTextLayers,
  normalizeHammerOutputSelectionRef,
} from "../macros/hammerDerivedTranscriptLayers";
import { diffWords, isSubtractiveTranscriptWordEdit } from "../lib/hammerWordDiff";
import { useHammerWorkspaceShellMediaPrepPackage } from "./hammerWorkspaceShellMediaPrepPackage";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
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
import {
  useHammerSourceDeskRuntimeState,
  useHammerSourceDeskStoredMediaState,
  useHammerSourceDeskUploadRefs,
  useHammerWorkspaceShellSourceDeskController,
} from "./useHammerWorkspaceShellSourceDeskController";
import { useHammerWorkspaceShellPreviewRuntime } from "./useHammerWorkspaceShellPreviewRuntime";
import {
  deriveHammerAutoPlacementDiagnostics,
  useHammerAutomaticPlacementEvidenceHandler,
  useHammerAutomaticPlacementLifecycle,
  useHammerAutomaticPlacementState,
} from "./useHammerWorkspaceShellAutomaticPlacement";
import {
  useHammerMediaMapBoundObjects,
  useHammerMediaMapDerived,
  useHammerMediaMapState,
} from "./useHammerWorkspaceShellMediaMap";
import { createHammerMediaMapMutationCommands } from "./hammerWorkspaceShellMediaMapCommands";
import {
  clearInvalidHammerOutputSelection,
  selectHammerOutputLayerForExport,
} from "./hammerWorkspaceShellOutputSelectionCommands";
import {
  createHammerVisualLookExposureCommands,
  useHammerBackgroundBlurProjection,
  useHammerVisualPreviewProjection,
  useHammerVisualPreviewState,
} from "./useHammerWorkspaceShellVisualPreview";
import { useHammerWorkspaceShellReleaseBasis, useHammerWorkspaceShellReleasePrep } from "./useHammerWorkspaceShellReleasePrep";
import { useHammerWorkspaceShellVisualEditing } from "./useHammerWorkspaceShellVisualEditing";
import {
  useHammerWorkspaceShellHydration,
  useHammerWorkspaceShellWorkpieceLabelHydration,
  useHammerWorkspaceShellWorkpieceLabelState,
} from "./useHammerWorkspaceShellHydration";
import { useHammerWorkspaceShellTranscriptCleanup } from "./useHammerWorkspaceShellTranscriptCleanup";
import { useHammerWorkspaceShellCleanupCandidateReview } from "./useHammerWorkspaceShellCleanupCandidateReview";
import { useHammerWorkspaceShellRouting } from "./useHammerWorkspaceShellRouting";
import { createHammerWorkspaceShellViewModelComposition } from "./useHammerWorkspaceShellViewModels";
import { useHammerWorkspaceShellReleaseComparison, useHammerWorkspaceShellReleaseReadiness } from "./hammerWorkspaceShellReleaseStatus";
import { createHammerWorkspaceVisualSelectionCommand } from "./hammerWorkspaceVisualSelectionCommand";
import {
  toHammerLinkedSelectionVisualItems,
  type HammerSelectedTranscriptRange,
  type HammerSelectedTranscriptRangeDetail,
} from "./hammerWorkspaceShellSelectionUtils";
import {
  createHammerAudioFinishingCommands,
  createHammerPodcastMasterCommands,
  useHammerAudioFinishingCompareResetEffect,
  useHammerAudioFinishingBackendDerivedState,
  useHammerAudioFinishingEnabledModuleCount,
  useHammerAudioFinishingRackDerivedState,
  useHammerAudioFinishingNativePreviewEffect,
  useHammerAudioFinishingPolishState,
  useHammerAudioFinishingRenderStatusState,
  useHammerAudioFinishingStudioRackState,
} from "./useHammerWorkspaceShellAudioFinishing";
import { createHammerTransitionCommands } from "./hammerWorkspaceShellTransitionCommands";
import { buildHammerMediaBackboneRuntimeSummary } from "../media/hammerMediaBackbone";
import { resolveHammerRecordingIdentityStatus } from "./hammerRecordingIdentity";
import {
  clampImagePlacementTransform,
  clampNumber,
  createVisualPlacementId,
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
import { HAMMER_PREPARED_RELEASE_PACKAGE_PATH } from "../lib/hammerPreparedReleasePackage";
import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
} from "../lib/hammerQuenchReleasePacket";
import {
  projectEditorialAuthorityGraphFromEditPlan,
} from "./hammerRenderAssembly";
import {
  deriveHydratedPassStatus,
  getPassStatus,
  summarizePassStatuses,
  type HammerPassDerivedStatus,
  type HammerPassSelectorContext,
  type HammerPassSelectorResult,
} from "./hammerPassSelectors";
import {
  appendHammerAuthorityInstructionForHistory,
  captureHammerPostHistorySaveRequest,
  executeHammerCompositionHistoryMutation,
  normalizeHammerHistoryCompatibilityState,
} from "./hammerCompositionHistoryCommands";
import HammerWorkspaceShellToolbar from "./HammerWorkspaceShellToolbar";
import HammerWorkspaceShellPreviewBay from "./HammerWorkspaceShellPreviewBay";
import HammerWorkspaceShellTimelineDock from "./HammerWorkspaceShellTimelineDock";
import HammerWorkspaceShellSourceBay from "./HammerWorkspaceShellSourceBay";
import HammerWorkspaceShellToolBay from "./HammerWorkspaceShellToolBay";
import {
  useHammerHistoryCommandAuthority,
  useHammerWorkspaceShellHistoryController,
  type HammerHistoryCommandAuthorityConfig,
  type HammerHistoryPostSaveSnapshotRequest,
} from "./hammerWorkspaceShellHistoryController";
import { buildVisualTimelineDiagnostics } from "./hammerVisualTimelineHydrationGuard";
import { isAutoPlacementDebugFlagEnabled } from "./hammerAutoPlacementDebugFlag";
import {
  useHammerSnapshotImmediatePersistenceSignal,
  useHammerPersistedTranscriptProjection,
  useHammerWorkspaceShellSnapshotAuthority,
  useHammerWorkspaceShellSnapshotEmitter,
} from "./hammerWorkspaceShellSnapshotEmitter";
import {
  createHammerCaptionCommands,
  useHammerCaptionDerivedState,
  useHammerCaptionEditorRefs,
  useHammerCaptionState,
} from "./useHammerWorkspaceShellCaptions";
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
  resolveOutputSelectionFromTranscript,
  toEditorState,
  toShellState,
} from "./hammerWorkspaceShellStateAdapters";
import {
  applyWorkspaceVisualTimelineAction,
  applyWorkspaceVisualTimelineActions,
  captureHammerWorkspaceState,
  createHammerWorkspaceMutationGateway,
  resolveCanonicalWorkspaceVisualTimeline,
  type HammerVisualTimelineAction,
} from "./hammerWorkspaceMutationGateway";
import {
  appendUniquePaths,
  createFallbackEditPlan,
  deriveAssetKind,
  formatBytes,
  inferPlaybackMimeTypeFromPath,
  isSourceDeskAuthMessage,
  readTranscriptSegments,
  resolveMediaRef,
  resolveWorkspaceMapping,
  toErrorMessage,
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

const workspaceViewModelComposition = createHammerWorkspaceShellViewModelComposition();

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
  const {
    visualWhiteBalance, setVisualWhiteBalance, visualColorAmount, setVisualColorAmount,
    visualEyeContactAssistEnabled, setVisualEyeContactAssistEnabled, visualEyeContactAssistStrength, setVisualEyeContactAssistStrength,
    visualBackgroundBlur, setVisualBackgroundBlur, visualBackgroundBlurPx, setVisualBackgroundBlurPx,
    visualBackgroundBlurFeatherPx, setVisualBackgroundBlurFeatherPx, visualBackgroundBlurTemporalSmoothing, setVisualBackgroundBlurTemporalSmoothing,
    visualBackgroundBlurSubjectExpansionPx, setVisualBackgroundBlurSubjectExpansionPx, visualBackgroundBlurQualityMode, setVisualBackgroundBlurQualityMode,
    visualBackgroundBlurFallbackMode, setVisualBackgroundBlurFallbackMode, visualBackgroundBlurProviderId, setVisualBackgroundBlurProviderId,
    visualBackgroundReplaceEnabled, setVisualBackgroundReplaceEnabled, visualBackgroundReplaceMode, setVisualBackgroundReplaceMode,
    visualBackgroundReplaceColor, setVisualBackgroundReplaceColor, visualBackgroundReplaceImageUrl, setVisualBackgroundReplaceImageUrl,
    visualBackgroundReplaceImageAssetPath, setVisualBackgroundReplaceImageAssetPath, visualBackgroundWashEnabled, setVisualBackgroundWashEnabled,
    visualBackgroundWashDimAmount, setVisualBackgroundWashDimAmount, visualBackgroundWashDesaturateAmount, setVisualBackgroundWashDesaturateAmount,
    visualBackgroundBlurDebugMask, setVisualBackgroundBlurDebugMask, visualBackgroundMaskPreviewMode, setVisualBackgroundMaskPreviewMode,
    visualBackgroundMaskPreviewStage, setVisualBackgroundMaskPreviewStage, visualEyeContactAssistDebugOverlay, setVisualEyeContactAssistDebugOverlay,
    visualBackgroundEffectCanvasRef, applyHydratedVisualPreviewSettings,
  } = useHammerVisualPreviewState(props.initialVisualPreviewSettings);
  const { persistNowRequestNonce, requestImmediatePersist } = useHammerSnapshotImmediatePersistenceSignal();
  const { captionFormatting, setCaptionFormatting, selectedCaptionArtifactFormat, setSelectedCaptionArtifactFormat, captionBuildState, setCaptionBuildState, captionEditedState, setCaptionEditedState, activeCaptionArtifactMode, setActiveCaptionArtifactMode, captionBuildFeedback, setCaptionBuildFeedback } = useHammerCaptionState();
  const [detailTag, setDetailTag] = useState("main-edit");
  const [finishingChecklist, setFinishingChecklist] = useState({
    transcriptReviewed: false,
    visualsReviewed: false,
    audioReviewed: false,
  });
  const [storedMediaFiles, setStoredMediaFiles] = useHammerSourceDeskStoredMediaState();
  const timelineUpdateReasonRef = useRef<string>("init");
  const sourceDeskMediaUpdateReasonRef = useRef<string>("init");
  const editableVisualTimelineRef = useRef<HammerVisualTimelineState | null>(props.visualTimeline ?? null);
  const {
    previewAutoPositionOverrides, setPreviewAutoPositionOverrides,
    previewAutoPositionStatus, setPreviewAutoPositionStatus,
    canonicalAutoPlacementEvidence, setCanonicalAutoPlacementEvidence,
    automaticallyPlacedImageIdsRef, fallbackPlacedImageIdsRef,
  } = useHammerAutomaticPlacementState();
  const placementOutboundDiagnosticsRef = useRef<HammerPlacementOutboundDiagnostics>({
    reason: "init",
    source: "shell_boot",
    explicitUserAction: false,
    placementCount: props.visualTimeline?.clips.length ?? props.visualPlacements?.placements.length ?? 0,
    anchorCount: buildVisualTimelineDiagnostics(props.visualTimeline ?? null).anchorCount,
  });
  const { mediaMapBeats, setMediaMapBeats, removedMediaMapSegmentIds, setRemovedMediaMapSegmentIds } = useHammerMediaMapState();
  const {
    sourceDeskLoading, setSourceDeskLoading, sourceDeskError, setSourceDeskError,
    uploadingCategory, setUploadingCategory, sourceDeskPreviewUrls, setSourceDeskPreviewUrls,
    sourceDeskPreviewFailures, setSourceDeskPreviewFailures, sourceDeskRequestedPreviewPaths,
    setSourceDeskRequestedPreviewPaths, sourceDeskVisiblePreviewPaths, setSourceDeskVisiblePreviewPaths,
  } = useHammerSourceDeskRuntimeState();
  const [studioRackRenderStatus, setStudioRackRenderStatus] = useHammerAudioFinishingRenderStatusState();
  const [transcriptTimingHint, setTranscriptTimingHint] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [playbackMediaSrc, setPlaybackMediaSrc] = useState<string | null>(null);
  const [previewVideoSrc, setPreviewVideoSrc] = useState<string | null>(null);
  const { canonicalWorkpieceLabel, hydrationAuthority: workpieceLabelHydrationAuthority } =
    useHammerWorkspaceShellWorkpieceLabelState();
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
  const { imageUploadInputRef, brollUploadInputRef, introOutroUploadInputRef } = useHammerSourceDeskUploadRefs();
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
  }, [visualBackgroundEffectCanvasRef]);
  const workspaceShellRef = useRef<HTMLElement | null>(null);
  const captionEditorRefs = useHammerCaptionEditorRefs();
  const transcriptLineRefs = useRef(new Map<string, HTMLElement>());
  const visualPlacementCardRefs = useRef(new Map<string, HTMLElement>());
  const timelineTrackScrollRef = useRef<HTMLDivElement | null>(null);
  const selectionOriginRef = useRef<"system" | "transcript" | "timeline" | "playhead">("system");
  const selectionRevealFrameRef = useRef<number | null>(null);
  const snapshotAuthority = useHammerWorkspaceShellSnapshotAuthority();
  const historyAuthority = useHammerHistoryCommandAuthority(
    getHistoryAuthorityConfig(),
    HISTORY_PERSIST_DEBOUNCE_MS,
    TEXT_EDIT_COALESCE_MS,
  );
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
  const visualPreviewFilter = useHammerVisualPreviewProjection({
    lookPreset: activeLookPreset,
    exposureAdjustment: activeExposureAdjustment,
    whiteBalance: visualWhiteBalance,
    colorAmount: visualColorAmount,
  });
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

  const { backgroundBlurSettings, previewBackgroundBlurSettings } = useHammerBackgroundBlurProjection({
    enabled: visualBackgroundBlur, blurPx: visualBackgroundBlurPx,
    replacementEnabled: visualBackgroundReplaceEnabled, replacementMode: visualBackgroundReplaceMode,
    replacementColor: visualBackgroundReplaceColor, replacementImageUrl: visualBackgroundReplaceImageUrl,
    washEnabled: visualBackgroundWashEnabled, washDimAmount: visualBackgroundWashDimAmount,
    washDesaturateAmount: visualBackgroundWashDesaturateAmount, edgeFeatherPx: visualBackgroundBlurFeatherPx,
    temporalSmoothing: visualBackgroundBlurTemporalSmoothing, subjectExpansionPx: visualBackgroundBlurSubjectExpansionPx,
    qualityMode: visualBackgroundBlurQualityMode, fallbackMode: visualBackgroundBlurFallbackMode,
  });

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
  const { referenceClipPlannedBeats, unresolvedBrollSuggestionItems, resolvedBrollBindingItems } = useHammerMediaMapDerived({
    mediaMapBeats, setMediaMapBeats, removedSegmentIds: removedMediaMapSegmentIds,
    segments: editableTranscriptSegments, placementsBySegmentId: sourceVisualPlacementBySegmentId,
    editorialOperations: editableEditorialAuthorityGraph?.operations,
    visualPlacements: editableVisualPlacements?.placements,
  });
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
    backgroundReplacementAssetPath: visualBackgroundReplaceImageAssetPath,
    backgroundReplacementPreviewUrl: visualBackgroundReplaceImageUrl,
    setBackgroundReplacementPreviewUrl: setVisualBackgroundReplaceImageUrl,
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
      historyAuthority.installDerivedLayerTransition(historyEntry.id, { before, after, layerLabel });
    },
    normalizeOutputSelection: (selection, transcript) => normalizeHammerOutputSelectionRef({
      selection,
      layers: listHammerDerivedTextLayers(transcript, { includeDiscarded: false }),
    }),
    updateOutputSelection: setEditableOutputSelection,
  });

  const persistedTranscriptProjection = useHammerPersistedTranscriptProjection({
    segments: editableTranscriptSegments,
    existingTranscript: workspaceStructuredTranscript ?? props.structuredTranscript ?? null,
    mediaRef,
    transcriptId: transcriptSourceId,
    derivedTextLayers: editableDerivedTextLayers,
  }); // Transcript hydration reset contract: }, [launchContext.workpiece_id, transcriptSourceId]);
  const mediaPrepOutputs = useHammerWorkspaceShellMediaPrepPackage({
    structuredTranscript: workspaceStructuredTranscript ?? null,
    visualPlacements: null,
    audioPolish: editableAudioPolish,
    mediaRef,
    mediaSourceLabel,
  });
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
    return captureHammerWorkspaceState({
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
    return resolveCanonicalWorkspaceVisualTimeline(state);
  }
  function applyVisualTimelineAction(state: HammerEditorStateSerializable, action: HammerVisualTimelineAction): HammerEditorStateSerializable {
    return applyWorkspaceVisualTimelineAction(state, action);
  }
  function applyVisualTimelineActions(state: HammerEditorStateSerializable, actions: HammerVisualTimelineAction[]): HammerEditorStateSerializable {
    return applyWorkspaceVisualTimelineActions(state, actions);
  }
  function applyWorkspaceState(nextState: HammerEditorStateSerializable, reason = "workspace_state_apply"): void {
    createHammerWorkspaceMutationGateway({
      capture: toShellState(nextState),
      getCurrentTimeline: () => editableVisualTimelineRef.current,
      getMediaUpdateReason: () => sourceDeskMediaUpdateReasonRef.current,
      setTimelineUpdateReason: (value) => { timelineUpdateReasonRef.current = value; },
      setPlacementOutboundDiagnostics: (value) => { placementOutboundDiagnosticsRef.current = value; },
      setTranscriptSegments: setEditableTranscriptSegments, setVisualTimeline: setEditableVisualTimeline,
      setStudioRack: setEditableStudioRack, setEditorialAuthorityGraph: setEditableEditorialAuthorityGraph,
      setOutputSelection: setEditableOutputSelection, setSelectedSegmentId, setPlayheadSec, setTranscriptTimingHint,
      linkedSelectionVisualItems, setLinkedSelection,
      applyAudioEdit: (audioEdit) => setEditableAudioPolish((current) => {
        const base = cloneHammerAudioPolish(current) ?? cloneHammerAudioPolish(props.audioPolish) ?? buildNotStartedHammerAudioPolish();
        base.audio_edit = cloneHammerAudioEdit(audioEdit);
        editableAudioPolishRef.current = base;
        audioPolishHasLocalEditsRef.current = true;
        return base;
      }),
      invalidateCleanupPreview,
      reportBlockedRefresh: (details) => console.error("[hammer][placements] blocked destructive refresh update", details),
    }).applyWorkspaceState(nextState, reason);
  }

  const selectVisualTimelineClipCommand = createHammerWorkspaceVisualSelectionCommand({
    fallbackTimeline: props.visualTimeline ?? null,
    setVisualTimeline: setEditableVisualTimeline,
    lastDebugSelectionKeyRef: lastVisualSelectionLogKeyRef,
    debugEnabled: isHammerVisualSelectionDebugEnabled,
  });
  function setSelectedClipId(clipId: string | null): void {
    selectVisualTimelineClipCommand(clipId);
  }

  function flushPendingPlacementDrafts(): void {
    flushPendingPlacementDraftsFromVisualEditing();
  }

  function appendAuthorityInstructionForState(
    state: HammerEditorStateSerializable,
    instruction: HammerEditInstruction,
  ): HammerEditorialAuthorityGraph {
    return appendHammerAuthorityInstructionForHistory({
      state, instruction,
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
    return executeHammerCompositionHistoryMutation({
      op, applyMutation: applyHistoryMutation, playbackDurationSec: playbackTransportDurationSec,
      waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
      authorityFallback: { graphId: `${launchContext.workpiece_id}:authority`, workspaceId: launchContext.workspace_id,
        workpieceId: launchContext.workpiece_id, sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
        sourceTranscriptId: transcriptSourceId },
    });
  }

  function capturePostHistorySaveRequest(
    document: Parameters<HammerHistoryCommandAuthorityConfig["captureSnapshotRequest"]>[0],
    editorState: HammerEditorStateSerializable,
  ): HammerHistoryPostSaveSnapshotRequest {
    return captureHammerPostHistorySaveRequest({ document, editorState });
  }

  function syncVisualTimelineFromCompatibilityState(
    state: HammerEditorStateSerializable,
  ): HammerEditorStateSerializable {
    return normalizeHammerHistoryCompatibilityState({ state, fallbackTimeline: props.visualTimeline ?? null });
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
      setDerivedLayers: setEditableDerivedTextLayers,
      onHistoryNavigation: () => {
        selectionOriginRef.current = "system";
        setFocusOverride("source-focus");
      },
      getViewingTranscript: () => workspaceStructuredTranscript,
      formatDerivedLayerLabel: formatOutputLayerLabel,
      setHistoryStatus,
      captureSnapshotRequest: capturePostHistorySaveRequest,
      onHistorySaved: snapshotAuthority.produce,
    };
  }

  useEffect(() => {
    clearInvalidHammerOutputSelection({
      layers: outputLayerCandidates,
      currentSelection: editableOutputSelection,
      applyHistoryMutation,
    });
  }, [editableOutputSelection, outputLayerCandidates]);

  useHammerWorkspaceShellWorkpieceLabelHydration({
    workspaceId: launchContext.workspace_id,
    workpieceId: launchContext.workpiece_id,
    hydrationAuthority: workpieceLabelHydrationAuthority,
  });

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


  const {
    moveSegment,
    trimSegmentStart,
    trimSegmentEnd,
    commitTranscriptTextEdits,
    commitDeleteOnlyTranscriptEdits,
    splitSelectedSegmentAtPlayhead,
    deleteSelectedSegmentAndRipple,
    selectAdjacentSegment,
    toggleSelectedSegmentDisabled,
    adjustSelectedSegmentGain,
  } = createHammerTranscriptEditingCommands({
    segments: editableTranscriptSegments,
    selectedSegmentId,
    playbackDurationSec: playbackTransportDurationSec,
    waveformProxy: editableAudioPolish?.analysis?.waveform_proxy ?? null,
    historyAuthority,
    applyHistoryMutation,
    applyCompositionMutation,
    requestImmediatePersist,
    setTimingHint: setTranscriptTimingHint,
    setSelectionAnchor: setTranscriptSelectionAnchorSegmentId,
    setSelectionFocus: setTranscriptSelectionFocusSegmentId,
    focusTime: () => setFocusOverride("time-focus"),
    selectLinkedTimelineRange,
    snapToleranceSec: PLAYHEAD_SNAP_TOLERANCE_SEC,
  });

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

  const {
    applyTranscriptSelection,
    clearTranscriptSelection,
    disableTranscriptSelection,
    cutTranscriptSelection,
  } = createHammerTranscriptSelectionCommands({
    segments: editableTranscriptSegments,
    getSelectedRangeDetail: () => selectedTranscriptRangeDetailRef.current,
    anchorId: transcriptSelectionAnchorSegmentId,
    focusId: transcriptSelectionFocusSegmentId,
    range: transcriptSelectionRange,
    timingHint: transcriptTimingHint,
    hasSelection: hasTranscriptSelection,
    selectLinkedTarget: selectLinkedTranscriptTarget,
    clearLinkedSelection: clearLinkedTranscriptSelection,
    setTimingHint: setTranscriptTimingHint,
    applyCompositionMutation,
    historyAuthority,
    setSelectionAnchor: setTranscriptSelectionAnchorSegmentId,
    setSelectionFocus: setTranscriptSelectionFocusSegmentId,
    focusTime: () => setFocusOverride("time-focus"),
  });

  /*
    Transcript timing-input clamp hint contract:
    - show the hint only when the typed value was adjusted by clamping
    - preserve explicit comparisons like nextStart !== parsed and adjustedEnd !== parsed
  */

  useEffect(() => {
    syncReviewPass(currentPass);
  }, [currentPass, syncReviewPass]);
  useHammerAudioFinishingCompareResetEffect({ rackBypassed: editableStudioRack.is_bypassed, setMode: setAudioFinalizationCompareMode });
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

  const {
    commitVisualAnchorRefinement,
    updatePlacementKindFromMediaMap,
    redoMediaMapFromScript,
    resolveHearthBrollSuggestion,
    discardHearthBrollSuggestion,
    moveResolvedBrollBinding,
    trimResolvedBrollBinding,
    replaceResolvedBrollBinding,
    revertResolvedBrollBinding,
  } = createHammerMediaMapMutationCommands({
    applyHistoryMutation,
    transcriptDurationSec,
    transcriptSegments: editableTranscriptSegments,
    placementsBySegmentId: sourceVisualPlacementBySegmentId,
    createPlacementId: createVisualPlacementId,
    identity: {
      workpieceId: launchContext.workpiece_id,
      workspaceId: launchContext.workspace_id,
      sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
      transcriptSourceId,
    },
    setMediaMapBeats,
    setRemovedMediaMapSegmentIds,
    setTimingHint: setTranscriptTimingHint,
  });

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

  const { addMinimalTransition } = createHammerTransitionCommands({
    transcriptDurationSec,
    applyHistoryMutation,
    appendAuthorityInstruction: appendAuthorityInstructionForState,
  });
  const { applyPodcastMasterPass } = createHammerPodcastMasterCommands({
    applyHistoryMutation,
    appendAuthorityInstruction: appendAuthorityInstructionForState,
  });
  const { applyLookPresetSelection, applyExposureAdjustment } = createHammerVisualLookExposureCommands({
    activeLookPreset,
    activeExposureAdjustment,
    applyHistoryMutation,
    appendAuthorityInstruction: appendAuthorityInstructionForState,
  });
  function selectOutputLayerForExport(layerId: string | null): void {
    selectHammerOutputLayerForExport({
      layerId,
      layers: outputLayerCandidates,
      currentSelection: editableOutputSelection,
      applyHistoryMutation,
    });
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

  const exportBasis = useHammerWorkspaceShellReleaseBasis({
      launchContext,
      previewMode,
      transcriptSourceId,
      transcriptSegments: editableTranscriptSegments,
      structuredTranscript: workspaceStructuredTranscript ?? null,
      outputSelection: editableOutputSelection,
      captionFormatting,
      selectedCaptionArtifactFormat,
      captionBuildState,
      captionEditedState,
      editorialAuthorityGraph: editableEditorialAuthorityGraph,
      visualTimeline: editableVisualTimeline,
      visualPlacements: editableVisualPlacements,
      audioPolish: editableAudioPolish,
      selectedSegmentId,
      selectedClipId,
      mediaRef,
      workspaceMapping,
      mediaSourceLabel,
      visualWhiteBalance,
      visualColorAmount,
      visualBackgroundBlur,
      visualEyeContactAssistEnabled,
      visualEyeContactAssistStrength,
      visualBackgroundBlurPx,
      visualBackgroundBlurFeatherPx,
      visualBackgroundBlurTemporalSmoothing,
      visualBackgroundBlurSubjectExpansionPx,
      visualBackgroundBlurQualityMode,
      visualBackgroundBlurFallbackMode,
      visualBackgroundBlurProviderId,
      visualBackgroundReplaceEnabled,
      visualBackgroundReplaceMode,
      visualBackgroundReplaceColor,
      visualBackgroundReplaceImageUrl,
      visualBackgroundReplaceImageAssetPath,
      selectedBackgroundReplacementAssetId,
      visualBackgroundWashEnabled,
      visualBackgroundWashDimAmount,
      visualBackgroundWashDesaturateAmount,
      ffmpegAvailable: studioRackRenderBackendResolution.ffmpegAvailable,
  });

  const {
    releasePrepStaleReasons, exportTruthState,
    exportStatusLabel, previewTruthPosture, exportTruthPosture, handoffTruthPosture,
    podcastMasterLayer, podcastMasterUiStatus,
  } = useHammerWorkspaceShellReleaseComparison({
    loadedPreparedPackage,
    currentReleasePackage: exportBasis.currentReleasePackage,
    timelineRevision: exportBasis.timelineRevision,
    renderAssembly: exportBasis.renderAssembly,
  });
  const {
    boundObjects,
    boundObjectById,
    selectedBoundBrollInspectorState,
    selectedTransitionBoundObject,
    boundAttentionQueue,
    boundAttentionQueueForGate,
  } = useHammerMediaMapBoundObjects({
    canonicalGraph: editableEditorialAuthorityGraph,
    renderAssembly: exportBasis.renderAssembly,
    selectedOperationId: selectedBoundBrollOperationId,
    resolvedBrollBindingItems,
  });
  const boundAttentionSummary = useMemo(() => ({
    total: boundAttentionQueue.length,
    unresolvedCount: boundAttentionQueue.filter((item) => item.kind === "unresolved_suggestion").length,
    degradedCount: boundAttentionQueue.filter((item) => item.kind === "degraded_binding").length,
    supersededCount: boundAttentionQueue.filter((item) => item.kind === "superseded_binding").length,
    transitionCount: boundAttentionQueue.filter((item) => item.kind === "transition_attention").length,
  }), [boundAttentionQueue]);
  const { readinessGate, readinessVerdict } = useHammerWorkspaceShellReleaseReadiness({
    renderAssembly: exportBasis.renderAssembly,
    canonicalGraph: editableEditorialAuthorityGraph,
    boundAttentionQueue: boundAttentionQueueForGate,
    unresolvedBrollSuggestions: unresolvedBrollSuggestionItems,
    currentReleasePackage: exportBasis.currentReleasePackage,
  });
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
  const timelineDockVM = useMemo(() => workspaceViewModelComposition.timelineDock({
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
  const sourceBayVM = useMemo(() => workspaceViewModelComposition.sourceBay({
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
    selectViewingLayer: historyAuthority.selectViewingLayer,
    editableOutputSelection,
    selectOutputLayerForExport,
    restoreCurrentHistoryState: historyAuthority.restoreCurrentState,
    recentHistoryEntries,
    historyHeadEntryId,
    getDerivedLayerTransition: historyAuthority.getDerivedLayerTransition,
    formatHistoryTimestamp,
    formatHistoryEntryScope,
    jumpToHistoryEntry: historyAuthority.jumpToEntry,
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
    historyAuthority.jumpToEntry,
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
    historyAuthority.restoreCurrentState,
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
    historyAuthority.selectViewingLayer,
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
  const handleCanonicalAutoPlacementResult = useHammerAutomaticPlacementEvidenceHandler({
    selectedPlacement: selectedImagePlacement,
    setEvidence: setCanonicalAutoPlacementEvidence,
  });
  const previewBayVM = useMemo(() => workspaceViewModelComposition.previewBay({
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
  const { previewAutoPosition, resetPreviewAutoPosition } = useHammerAutomaticPlacementLifecycle({
    selectedPlacement: selectedImagePlacement,
    selectedTransform: selectedImagePlacementTransform,
    evidence: canonicalAutoPlacementEvidence,
    setEvidence: setCanonicalAutoPlacementEvidence,
    automaticPlacementEnabled: Boolean(previewBayVM.automaticPlacement?.enabled),
    isPlaybackActive,
    previewVideoRef,
    automaticallyPlacedIds: automaticallyPlacedImageIdsRef,
    fallbackPlacedIds: fallbackPlacedImageIdsRef,
    setOverrides: setPreviewAutoPositionOverrides,
    setStatus: setPreviewAutoPositionStatus,
    commitTransform: commitImagePlacementTransform,
  });
  passSelectorContextRef.current = passSelectorContext;
  const previewDiagnosticsSummary = useMemo(
    () => deriveHammerAutoPlacementDiagnostics(previewBayVM.autoPlacementDiagnostics),
    [previewBayVM.autoPlacementDiagnostics],
  );
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
  const toolbarVM = useMemo(() => workspaceViewModelComposition.toolbar({
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

  const captionDerived = useHammerCaptionDerivedState({
    transcript: exportBasis.transcriptForRelease,
    outputLayerId: editableOutputSelection.layerId,
    outputRecipeRef: editableOutputSelection.sourceRecipeRef,
    sourceLabel: captionSourceLabel,
    formatting: captionFormatting,
    selectedFormat: selectedCaptionArtifactFormat,
    buildState: captionBuildState,
    editedState: captionEditedState,
    requestedMode: activeCaptionArtifactMode,
  });
  const {
    fingerprint: captionBasisFingerprint,
    captionBuildFreshness,
    activeCaptionMode,
    activeCaptionState,
    activeCaptionArtifactText,
    captionArtifactStatusLabel,
    captionReleaseSourceLabel,
    captionBuiltSummary,
    captionEditedSummary,
    captionBuiltTone,
    captionEditedTone,
    captionEditedChangeSummary,
    captionActiveModeLabel,
    captionActiveModeSourceLabel,
    captionRebuildConsequenceLabel,
    captionDiscardConsequenceLabel,
    captionReleasePrepSafetyState,
    captionReleasePrepSafetyLabel,
    captionReleasePrepSafetyDetail,
    captionEditedBasisDetail,
    captionReleasePrepSummaryLine,
  } = captionDerived;
  const captionCommands = createHammerCaptionCommands({
    transcript: exportBasis.transcriptForRelease,
    outputLayerId: editableOutputSelection.layerId,
    sourceLabel: captionSourceLabel,
    fingerprint: captionBasisFingerprint,
    formatting: captionFormatting,
    buildState: captionBuildState,
    editorRefs: captionEditorRefs,
    setBuildState: setCaptionBuildState,
    setEditedState: setCaptionEditedState,
    setActiveMode: setActiveCaptionArtifactMode,
    setFeedback: setCaptionBuildFeedback,
  });
  const {
    rebuildCaptionArtifacts: handleRebuildCaptionArtifacts,
    enableCaptionEdits: handleEnableCaptionEdits,
    editChunkText: handleEditCaptionChunkText,
    splitChunk: handleSplitEditedCaptionChunk,
    mergeChunk: handleMergeEditedCaptionChunk,
    normalizeChunkPunctuation: handleNormalizeEditedCaptionChunkPunctuation,
    toggleChunkSpeakerLabel: handleToggleEditedCaptionChunkSpeakerLabel,
    discardEditedCaptions: handleDiscardEditedCaptions,
  } = captionCommands;

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
    canonicalStructuredTranscript: persistedTranscriptProjection,
    exportCanonicalGraph: editableEditorialAuthorityGraph ?? exportBasis.canonicalGraph,
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

  const toolBayVM = useMemo(() => workspaceViewModelComposition.toolBay({
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
