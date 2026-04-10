import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, MouseEvent, WheelEvent as ReactWheelEvent } from "react";
import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerEditInstruction,
  HammerLookPreset,
} from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import {
  normalizeHammerPassId as normalizeCanonicalPassId,
  normalizeHammerPassStatusMap as normalizeCanonicalPassStatusMap,
} from "../../../../packages/tongs/src/hammer-orchestration-contract";
import { createSemanticEditPlanSignature } from "../lib/editPlanSignature";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import type {
  HammerPassId,
  HammerPassStatusMap,
  HammerDerivedTextLayer,
  HammerPersistedAudioPolish,
  HammerPersistedVisualPreviewSettings,
  HammerPersistedStructuredTranscript,
  HammerVisualPlacementRecord,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import { createEmptyVisualTimelineState } from "../visuals/model/hammerVisualDefaults";
import type { HammerVisualClip, HammerVisualGeometry, HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import {
  HAMMER_VISUAL_DEFAULT_GEOMETRY,
  HAMMER_VISUAL_DEFAULT_PERCENT_BOX,
  clampNormalizedGeometry,
  geometryToPercentBox,
  percentBoxToGeometry,
} from "../visuals/model/visualPlacementGeometry";
import {
  selectClipById,
  selectPrimaryActiveClipAtTime,
  selectPreviewClips,
} from "../visuals/state/hammerVisualSelectors";
import type { VisualClipBlockModel } from "../visuals/components/VisualClipBlock";
import type { VisualPreviewOverlayModel } from "../visuals/components/VisualPreviewComposer";
import type { HammerBackgroundBlurRuntimeStatus } from "../features/visual-effects/render/backgroundBlurPreviewLayer";
import { summarizeBackgroundEffectRuntimeStatus } from "../features/visual-effects/render/backgroundEffectStatusSummary";
import type { HammerEyeContactAssistRuntimeStatus } from "../features/eye-contact-assist/render/eyeContactAssistPreviewLayer";
import { summarizeEyeContactAssistRuntimeStatus } from "../features/eye-contact-assist/render/eyeContactAssistStatusSummary";
import type { BackgroundBlurSettings } from "../features/visual-effects/types";
import {
  SEGMENTATION_PROVIDER_DESCRIPTORS,
  resolveSegmentationProviderDescriptor,
} from "../features/visual-effects/providers/segmentationProviderRegistry";
import type { HammerPreparedNextStepActionId } from "./hammerPreparedHandoff";
import {
  DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC,
  LARGE_PLAYHEAD_NUDGE_SEC,
  SMALL_PLAYHEAD_NUDGE_SEC,
  cutSegmentRangeAndRipple,
  deleteSegmentAndRipple,
  moveSegmentTiming,
  resolveAdjacentJumpPointTime,
  resolveAdjacentSegmentSelection,
  resolveFocusAfterPlayheadChange,
  resolvePlayheadAfterDelete,
  resolvePlayheadAfterRangeCut,
  resolvePreviewLabel,
  resolvePlayheadSegment,
  remapPlacementForRippleDelete,
  resolveSelectedSegmentAfterDelete,
  resolveTranscriptSegmentRange,
  resolveTimelineBoundaryTimes,
  resolveWorkspaceFocusMode,
  roundToTenth,
  snapPlayheadToBoundary,
  splitSegmentAtTime,
  toggleSegmentDisabled,
  trimSegmentEndTiming,
  trimSegmentStartTiming,
  updateSegmentGain,
  updateSegmentInTimeline,
  type HammerWorkspaceFocusOverride,
  type HammerWorkspaceToolId,
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
  deriveAudioCutsForRemovedSegments,
  HAMMER_FILLER_CUT_PAD_AFTER_SEC,
  HAMMER_FILLER_CUT_PAD_BEFORE_SEC,
  HAMMER_FILLER_CUT_SEAM_FADE_SEC,
} from "./hammerCleanupExecution";
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
import { diffWords } from "../lib/hammerWordDiff";
import {
  buildCandidateQueue,
  clampActiveCandidateIndex,
  type HammerCandidateCard,
  type HammerCandidateReviewKind,
} from "./hammerCandidateQueue";
import {
  buildHammerDevMediaUrl,
  loadCanonicalAudioPolishPreviewUrl,
} from "../lib/previewSource";
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
import { buildSourceDeskPreviewFetchKey } from "./sourceDeskPreviewChurn";
import {
  buildHammerHistorySnapshot,
  resolveActiveSnapshotHeadEntryId,
  shouldCreateHammerSnapshot,
  upsertHammerSnapshotManifest,
} from "./hammerSnapshotProduction";
import {
  listWorkpieceStoredMedia,
  loadIntroOutroSelection,
  readHammerMediaPreviewErrorDiagnostics,
  loadWorkpieceMediaPreviewUrl,
  saveIntroOutroSelection,
  uploadWorkpieceMediaFile,
  type HammerIntroOutroSelection,
  type HammerStoredMediaFile,
} from "../lib/hammerSourceDeskMediaApi";
import { deriveStableHammerAssetIdFromPath } from "../lib/hammerAssetIdentity";
import {
  cloneHammerStudioRackState,
  createDefaultHammerStudioRackState,
  normalizeHammerStudioRackState,
  type HammerStudioRackState,
} from "./hammerStudioRack";
import {
  executeDialogueAudioRenderWithBackend,
  processDialogueAudioWithBackend,
  resolveHammerAudioProcessingBackend,
  type HammerDialogueRenderExecutionResult,
} from "./hammerAudioProcessingBackend";
import { buildHammerMediaBackboneRuntimeSummary } from "../media/hammerMediaBackbone";
import { normalizeWorkpieceRelativePath } from "../../../../packages/contracts/workpiece-paths";
import { preserveTranscriptMetadata } from "../prep/hammerPrep";
import {
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
  createHearthBrollSuggestionInstruction,
  createAudioDuckInstruction,
  createApplyLookInstruction,
  createCrossfadeInstruction,
  createDipToBlackInstruction,
  createFadeAudioInstruction,
  createHardCutInstruction,
  createPodcastMasterPassInstruction,
  createRippleDeleteInstruction,
  remapResolvedBrollOperationsForRippleDelete,
  resolveInsertBrollSuggestionInGraph,
  setAuthorityOperationLifecycle,
  synchronizeLinkedAudioDuckForBrollOperation,
  updateResolvedInsertBrollOperationInGraph,
} from "./hammerAuthorityOps";
import {
  buildHammerCaptionPreviewModel,
  type HammerCaptionPreviewChunk,
} from "../lib/hammerCaptionPreview";
import {
  analyzeReferenceClipInput,
  generateReferenceClipPng,
  type ReferenceClipInput,
} from "./hammerReferenceClipGeneratorV1";
import HammerWorkspaceShellToolbar from "./HammerWorkspaceShellToolbar";
import HammerWorkspaceShellPreviewBay from "./HammerWorkspaceShellPreviewBay";
import HammerWorkspaceShellTimelineDock from "./HammerWorkspaceShellTimelineDock";
import HammerWorkspaceShellSourceBay from "./HammerWorkspaceShellSourceBay";
import HammerWorkspaceShellToolBay from "./HammerWorkspaceShellToolBay";
import { useHammerWorkspaceShellHistoryController } from "./hammerWorkspaceShellHistoryController";
import { useHammerWorkspaceShellSourceDeskPreviews } from "./hammerWorkspaceShellSourceDeskPreviews";
import { useHammerWorkspaceShellSnapshotEmitter } from "./hammerWorkspaceShellSnapshotEmitter";
import "./HammerWorkspaceShell.css";

const SOURCE_DESK_PREVIEW_FETCH_CONCURRENCY = 4;
const SOURCE_DESK_PREVIEW_MAX_ITEMS = 48;
const HISTORY_MAX_SIZE = 100;
const HISTORY_PERSIST_DEBOUNCE_MS = 900;
const TEXT_EDIT_COALESCE_MS = 1500;
const PLAYHEAD_SNAP_TOLERANCE_SEC = DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC;
const PRE_ROLL_SEC = 2;
const POST_ROLL_SEC = 1;
const SCRUB_SEEK_THRESHOLD_SEC = 0.05;
const PLAYHEAD_WINDOW_EPSILON_SEC = 0.001;
const MIN_IMAGE_PLACEMENT_DURATION_SEC = 0.5;
const IMAGE_PLACEMENT_TIME_PRECISION = 100;
const IMAGE_PLACEMENT_FINE_STEP_SEC = 0.01;
const IMAGE_PLACEMENT_COARSE_STEP_SEC = 0.1;

function roundImagePlacementTime(value: number): number {
  return Math.round(value * IMAGE_PLACEMENT_TIME_PRECISION) / IMAGE_PLACEMENT_TIME_PRECISION;
}

function snapImagePlacementTime(value: number, stepSec: number): number {
  if (!Number.isFinite(stepSec) || stepSec <= 0) return roundImagePlacementTime(value);
  return roundImagePlacementTime(Math.round(value / stepSec) * stepSec);
}
const SCRUB_RATE_OPTIONS = [1, 0.75, 0.5] as const;
const TIMELINE_ZOOM_LEVELS = [100, 125, 150, 200, 300] as const;
const CAPTION_MIN_BLOCK_DURATION_SEC = 0.05;
type HammerPlaybackAuthorityWindow = Window & typeof globalThis & {
  __forgeHammerActivePreviewOwnerId__?: string;
  __forgeHammerActivePreviewAudio__?: HTMLMediaElement;
};
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

type HammerToolId = HammerWorkspaceToolId;
type HammerSourceTabId = "transcript" | "images" | "assets" | "broll" | "introoutro";
type HammerPlaybackWindowMode = "loop" | "roll";
type HammerPlaybackWindow = {
  mode: HammerPlaybackWindowMode;
  startSec: number;
  endSec: number;
  label: string;
};
type HammerTimelineMarker = {
  id: string;
  label: string;
  timeSec: number;
};
type HammerScrubRate = (typeof SCRUB_RATE_OPTIONS)[number];

type HammerWorkspaceShellProps = {
  launchContext?: HammerLaunchContext;
  recordingRevisionId?: string | null;
  structuredTranscript?: HammerPersistedStructuredTranscript | null;
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
  onHistoryRecoveryStatusChange?: (status: string | null) => void;
  onWorkspaceSnapshotChange?: (snapshot: HammerWorkspaceSnapshot) => void;
};

const SOURCE_TABS: Array<{ id: HammerSourceTabId; label: string }> = [
  { id: "transcript", label: "Transcript" },
  { id: "images", label: "Images" },
  { id: "assets", label: "Assets" },
  { id: "broll", label: "B-roll" },
  { id: "introoutro", label: "Intro/Outro" },
];

const PASS_ORDER: Array<{
  id: HammerPassId;
  shortLabel: string;
  label: string;
  toolId: HammerToolId;
  sourceTab: HammerSourceTabId;
}> = [
  { id: "transcript_cleanup", shortLabel: "T1", label: "Transcript Cleanup", toolId: "polish", sourceTab: "transcript" },
  { id: "retakes", shortLabel: "T2", label: "Retakes", toolId: "polish", sourceTab: "transcript" },
  { id: "gap_pacing", shortLabel: "T3", label: "Silence Gaps", toolId: "polish", sourceTab: "transcript" },
  { id: "visual_finishing", shortLabel: "V1", label: "Visual Finishing", toolId: "video", sourceTab: "images" },
  { id: "image_placement", shortLabel: "V2", label: "Image Placement", toolId: "video", sourceTab: "images" },
  { id: "image_animation", shortLabel: "V3", label: "Image Animation", toolId: "video", sourceTab: "images" },
  { id: "audio_finalization", shortLabel: "A", label: "Audio Finalization", toolId: "audio", sourceTab: "assets" },
  { id: "packaging", shortLabel: "P", label: "Packaging", toolId: "finishing", sourceTab: "introoutro" },
  { id: "ready", shortLabel: "R", label: "Ready", toolId: "export", sourceTab: "transcript" },
];

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

function resolvePassMeta(passId: HammerPassId): (typeof PASS_ORDER)[number] {
  return PASS_ORDER.find((pass) => pass.id === passId) ?? PASS_ORDER[0];
}

function normalizePassStatus(
  value: HammerPassStatusMap | null | undefined,
  currentPass: HammerPassId,
): HammerPassStatusMap {
  return normalizeCanonicalPassStatusMap(value, currentPass);
}

function resolveDefaultPassForTool(toolId: HammerToolId): HammerPassId {
  return PASS_ORDER.find((pass) => pass.toolId === toolId)?.id ?? PASS_ORDER[0].id;
}

function resolveInitialPassId(value: HammerPassId | undefined): HammerPassId {
  return normalizeCanonicalPassId(value);
}

function buildDefaultVisualPreviewSettings(): HammerPersistedVisualPreviewSettings {
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
    background_wash_enabled: false,
    background_wash_dim_amount: 0.35,
    background_wash_desaturate_amount: 0.25,
  };
}

function normalizeVisualPreviewSettings(
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
    background_blur_subject_expansion_px: Math.max(0, Math.min(48, Number(value.background_blur_subject_expansion_px ?? defaults.background_blur_subject_expansion_px))),
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
    background_wash_enabled: Boolean(value.background_wash_enabled ?? defaults.background_wash_enabled),
    background_wash_dim_amount: Math.max(0, Math.min(1, Number(value.background_wash_dim_amount ?? defaults.background_wash_dim_amount))),
    background_wash_desaturate_amount: Math.max(0, Math.min(1, Number(value.background_wash_desaturate_amount ?? defaults.background_wash_desaturate_amount))),
  };
}

type HammerVisualLutPreset = HammerLookPreset | "neutral";

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

type HammerVisualFlowStepId = "media_map" | "images" | "broll" | "reference_clips";

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

type HammerImagePlacementDraftWindow = {
  startSec: number;
  endSec: number;
};

type HammerImagePlacementTransform = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

type HammerTimelineImageDragState = {
  placementId: string;
  mode: "move" | "resize_start" | "resize_end";
  pointerStartX: number;
  originStartSec: number;
  originEndSec: number;
  pxToSec: number;
};

type HammerPreviewCanvasDragState = {
  placementId: string;
  mode: "move" | "resize";
  pointerStartX: number;
  pointerStartY: number;
  origin: HammerImagePlacementTransform;
  originAspectRatio: number;
};

type HammerImageAnimationPreset =
  | "none"
  | "fade_in"
  | "fade_out"
  | "fade_in_out"
  | "flip_in"
  | "flip_out"
  | "shutter_in"
  | "shutter_out"
  | "shutter_in_fade_out";

type HammerImageAnimationContextMenuState = {
  placementId: string;
  x: number;
  y: number;
};

type HammerAudioFinalizationCompareMode = "before" | "after";
type HammerLogoOverlayPosition = "top_left" | "top_right" | "bottom_left" | "bottom_right";
type HammerLogoOverlaySize = "small" | "medium" | "large";

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

type HammerCaptionReadingSpeed = "slow" | "standard" | "fast";
type HammerCaptionPunctuationMode = "preserve" | "normalize";

type HammerCaptionFormattingState = {
  style: "sentence" | "title" | "upper";
  maxCharsPerLine: number;
  maxLinesPerCaption: number;
  includeSpeakerLabels: boolean;
  punctuationMode: HammerCaptionPunctuationMode;
  readingSpeed: HammerCaptionReadingSpeed;
};

type HammerCaptionBuiltChunk = {
  id: string;
  speaker: string;
  startSec: number;
  endSec: number;
  text: string;
  lineCount: number;
  charCount: number;
  sourceSegmentIds: string[];
  approximateTiming: boolean;
};

type HammerCaptionBuildState = {
  builtAt: string;
  sourceLayerId: string | null;
  sourceLabel: string;
  fingerprint: string;
  chunkCount: number;
  segmentCount: number;
  approximateTiming: boolean;
  chunks: HammerCaptionBuiltChunk[];
  srt: string;
  vtt: string;
};

type HammerCaptionEditedState = {
  createdAt: string;
  updatedAt: string;
  baseFingerprint: string;
  sourceLayerId: string | null;
  sourceLabel: string;
  chunkCount: number;
  segmentCount: number;
  approximateTiming: boolean;
  chunks: HammerCaptionBuiltChunk[];
  srt: string;
  vtt: string;
};

type HammerCaptionArtifactMode = "built" | "edited";

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

const NUMERIC_SIGNAL_RE = /\b(\d+([.,]\d+)?%?|\d{4}|increase|decrease|up|down|trend|timeline|year|month|week|compared|versus|vs\.?)\b/i;
const MOTION_SIGNAL_RE = /\b(move|moving|walk|walking|run|running|drive|driving|enter|entering|exit|transition|story|journey|reveal|show|follow)\b/i;
const PACING_TOKEN_RE = /\[(pause|beat|reflective pause)\]/gi;
const EXTERNAL_PROVIDER_LAUNCH_URL = "https://chat.openai.com/";

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

function buildMediaMapPrompt(args: {
  type: HammerMediaMapSuggestionType;
  text: string;
  tweak: string;
}): string {
  const base = args.type === "reference_clip"
    ? `Reference clip: visualize factual context for "${args.text}".`
    : `B-roll: support story motion for "${args.text}".`;
  const tweak = args.tweak.trim();
  return tweak ? `${base} Tweak: ${tweak}` : base;
}

function buildTimelineImagePrompt(args: { text: string; tweak: string }): string {
  const tweak = args.tweak.trim();
  const base = `Timeline image: still frame that supports "${args.text}".`;
  return tweak ? `${base} Tweak: ${tweak}` : base;
}

function sanitizePromptForCopy(prompt: string): string {
  return prompt
    .replace(PACING_TOKEN_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  if (nextText.length > previousText.length) return false;
  let cursor = 0;
  for (const char of nextText) {
    const matchedIndex = previousText.indexOf(char, cursor);
    if (matchedIndex < 0) return false;
    cursor = matchedIndex + 1;
  }
  return true;
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

function isKeyboardEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function stableHashToken(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function toEditorState(args: {
  segments: HammerTranscriptSegment[];
  visualPlacements: HammerPersistedVisualPlacements | null;
  visualTimeline: HammerVisualTimelineState | null;
  studioRack: HammerStudioRackState;
  editorialAuthorityGraph: HammerEditorialAuthorityGraph | null;
  outputSelection: HammerOutputSelectionState;
  selectedSegmentId: string | null;
  playheadSec: number;
  transcriptTimingHint: string | null;
}): HammerEditorStateSerializable {
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

function toShellState(state: HammerEditorStateSerializable): {
  segments: HammerTranscriptSegment[];
  visualPlacements: HammerPersistedVisualPlacements | null;
  visualTimeline: HammerVisualTimelineState | null;
  studioRack: HammerStudioRackState;
  editorialAuthorityGraph: HammerEditorialAuthorityGraph | null;
  outputSelection: HammerOutputSelectionState;
  selectedSegmentId: string | null;
  playheadSec: number;
  transcriptTimingHint: string | null;
} {
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

function resolveOutputSelectionFromTranscript(
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

function createVisualPlacementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `placement:${crypto.randomUUID()}`;
  }
  return `placement:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function createTimelineMarkerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `marker:${crypto.randomUUID()}`;
  }
  return `marker:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_IMAGE_PLACEMENT_TRANSFORM: HammerImagePlacementTransform = {
  ...HAMMER_VISUAL_DEFAULT_PERCENT_BOX,
};

const DEFAULT_VISUAL_PLACEMENT_GEOMETRY: HammerVisualGeometry = {
  ...HAMMER_VISUAL_DEFAULT_GEOMETRY,
};

function clampImagePlacementTransform(transform: HammerImagePlacementTransform): HammerImagePlacementTransform {
  return geometryToPercentBox(percentBoxToGeometry(transform, "top_left"));
}

function resolvePlacementGeometry(
  placement: HammerVisualPlacementRecord | null | undefined,
): HammerVisualGeometry {
  const candidate = placement?.overlay_geometry ?? null;
  if (!candidate) {
    return DEFAULT_VISUAL_PLACEMENT_GEOMETRY;
  }
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return DEFAULT_VISUAL_PLACEMENT_GEOMETRY;
  }
  return clampNormalizedGeometry({
    x,
    y,
    width,
    height,
    anchor: candidate.anchor === "center" ? "center" : "top_left",
  });
}

function geometryToTransform(geometry: HammerVisualGeometry): HammerImagePlacementTransform {
  return geometryToPercentBox(geometry);
}

function transformToGeometry(transform: HammerImagePlacementTransform): HammerVisualGeometry {
  return percentBoxToGeometry(transform, "top_left");
}

function resolvePlacementAnimationPreset(
  placement: HammerVisualPlacementRecord | null | undefined,
): HammerImageAnimationPreset {
  const preset = placement?.animation_preset ?? null;  return (
    preset === "fade_in"
    || preset === "fade_out"
    || preset === "fade_in_out"
    || preset === "flip_in"
    || preset === "flip_out"
    || preset === "shutter_in"
    || preset === "shutter_out"
    || preset === "shutter_in_fade_out"
    || preset === "none"
  ) ? preset : "none";
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function scaleToPercent(value: number, min: number, max: number): number {
  const safe = clampNumber(value, min, max);
  const span = max - min;
  if (span <= 0) return 0;
  return Math.round(((safe - min) / span) * 100);
}

function percentToScale(percent: number, min: number, max: number): number {
  const safePercent = clampNumber(percent, 0, 100);
  const span = max - min;
  return clampNumber(min + (span * (safePercent / 100)), min, max);
}

const IMAGE_ANIMATION_PRESET_OPTIONS: Array<{ id: HammerImageAnimationPreset; label: string }> = [
  { id: "none", label: "None" },
  { id: "fade_in", label: "Fade In" },
  { id: "fade_out", label: "Fade Out" },
  { id: "fade_in_out", label: "Fade In + Out" },
  { id: "flip_in", label: "Flip In" },
  { id: "flip_out", label: "Flip Out" },
  { id: "shutter_in", label: "Shutter In" },
  { id: "shutter_out", label: "Shutter Out" },
  { id: "shutter_in_fade_out", label: "Shutter In + Fade Out" },
];
const PACKAGING_INTRO_ENTRY_ID = "packaging:intro";
const PACKAGING_OUTRO_ENTRY_ID = "packaging:outro";
const PACKAGING_LOGO_ENTRY_ID = "packaging:logo";
const LOGO_POSITION_OPTIONS: Array<{ id: HammerLogoOverlayPosition; label: string }> = [
  { id: "top_left", label: "Top Left" },
  { id: "top_right", label: "Top Right" },
  { id: "bottom_left", label: "Bottom Left" },
  { id: "bottom_right", label: "Bottom Right" },
];
const LOGO_SIZE_OPTIONS: Array<{ id: HammerLogoOverlaySize; label: string }> = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

function positionFromLogoOption(
  position: HammerLogoOverlayPosition,
  size: HammerLogoOverlaySize,
): HammerVisualGeometry {
  const edgePadding = 0.04;
  const sizeValue = size === "small" ? 0.12 : size === "large" ? 0.24 : 0.18;
  const width = sizeValue;
  const height = sizeValue;
  const x = position === "top_right" || position === "bottom_right"
    ? 1 - width - edgePadding
    : edgePadding;
  const y = position === "bottom_left" || position === "bottom_right"
    ? 1 - height - edgePadding
    : edgePadding;
  return clampNormalizedGeometry({
    x,
    y,
    width,
    height,
    anchor: "top_left",
  });
}

function resolveImageAnimationClass(preset: HammerImageAnimationPreset): string {
  if (preset === "fade_in") return "is-anim-fade-in";
  if (preset === "fade_out") return "is-anim-fade-out";
  if (preset === "fade_in_out") return "is-anim-fade-in-out";
  if (preset === "flip_in") return "is-anim-flip-in";
  if (preset === "flip_out") return "is-anim-flip-out";
  if (preset === "shutter_in") return "is-anim-shutter-in";
  if (preset === "shutter_out") return "is-anim-shutter-out";
  if (preset === "shutter_in_fade_out") return "is-anim-shutter-in-fade-out";
  return "";
}

function toTitleCaseText(value: string): string {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function applyCaptionStyle(value: string, style: HammerCaptionFormattingState["style"]): string {
  if (style === "upper") return value.toUpperCase();
  if (style === "title") return toTitleCaseText(value.toLowerCase());
  return value;
}

function normalizeCaptionPunctuation(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,.!?;:]){2,}/g, "$1")
    .trim();
}

function splitCaptionWordsByLimit(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxChars) {
      chunks.push(current);
      current = word;
      continue;
    }
    current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapCaptionLines(text: string, maxCharsPerLine: number, maxLines: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let index = 0;
  while (index < words.length && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      lines.push(words.slice(index).join(" "));
      break;
    }
    let line = words[index] ?? "";
    index += 1;
    while (index < words.length) {
      const candidate = `${line} ${words[index]}`;
      if (candidate.length > maxCharsPerLine) break;
      line = candidate;
      index += 1;
    }
    lines.push(line);
  }
  return lines.slice(0, maxLines).join("\n");
}

function resolveCaptionCharsPerSecond(speed: HammerCaptionReadingSpeed): number {
  if (speed === "slow") return 12;
  if (speed === "fast") return 20;
  return 16;
}

function buildCaptionChunksFromPreview(args: {
  chunks: HammerCaptionPreviewChunk[];
  formatting: HammerCaptionFormattingState;
}): HammerCaptionBuiltChunk[] {
  const results: HammerCaptionBuiltChunk[] = [];
  const cpsLimit = resolveCaptionCharsPerSecond(args.formatting.readingSpeed);
  let cursor = 0;
  for (const chunk of args.chunks) {
    const duration = Math.max(0.1, chunk.end_sec - chunk.start_sec);
    const layoutCap = Math.max(18, args.formatting.maxCharsPerLine * args.formatting.maxLinesPerCaption);
    const speedCap = Math.max(18, Math.floor(duration * cpsLimit));
    const maxChars = Math.max(18, Math.min(layoutCap, speedCap));
    const baseText = args.formatting.includeSpeakerLabels
      ? `${chunk.speaker}: ${chunk.text}`
      : chunk.text;
    const punctuated = args.formatting.punctuationMode === "normalize"
      ? normalizeCaptionPunctuation(baseText)
      : baseText.replace(/\s+/g, " ").trim();
    const styled = applyCaptionStyle(punctuated, args.formatting.style);
    const parts = splitCaptionWordsByLimit(styled, maxChars);
    const totalWeight = Math.max(parts.reduce((sum, part) => sum + Math.max(part.length, 1), 0), 1);
    let offset = chunk.start_sec;
    let consumed = 0;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      consumed += Math.max(part.length, 1);
      const nextEnd = index < parts.length - 1
        ? chunk.start_sec + (duration * (consumed / totalWeight))
        : chunk.end_sec;
      const wrapped = wrapCaptionLines(part, args.formatting.maxCharsPerLine, args.formatting.maxLinesPerCaption);
      const lines = wrapped.split("\n").filter(Boolean);
      results.push({
        id: `${chunk.chunk_id}:${index}:${cursor}`,
        speaker: chunk.speaker,
        startSec: offset,
        endSec: Math.max(nextEnd, offset + 0.05),
        text: wrapped,
        lineCount: lines.length,
        charCount: wrapped.replace(/\n/g, "").length,
        sourceSegmentIds: [...chunk.segment_ids],
        approximateTiming: chunk.approximate_timing || parts.length > 1,
      });
      offset = Math.max(nextEnd, offset + 0.05);
      cursor += 1;
    }
  }
  return results;
}

function formatCaptionTimestamp(totalSeconds: number, format: "srt" | "vtt"): string {
  const clampedMs = Math.max(Math.round(totalSeconds * 1000), 0);
  const hours = Math.floor(clampedMs / 3_600_000);
  const minutes = Math.floor((clampedMs % 3_600_000) / 60_000);
  const seconds = Math.floor((clampedMs % 60_000) / 1000);
  const milliseconds = clampedMs % 1000;
  const separator = format === "srt" ? "," : ".";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(milliseconds).padStart(3, "0")}`;
}

function renderBuiltSrt(chunks: HammerCaptionBuiltChunk[]): string {
  return chunks.map((chunk, index) => [
    String(index + 1),
    `${formatCaptionTimestamp(chunk.startSec, "srt")} --> ${formatCaptionTimestamp(chunk.endSec, "srt")}`,
    chunk.text,
  ].join("\n")).join("\n\n");
}

function renderBuiltVtt(chunks: HammerCaptionBuiltChunk[]): string {
  const body = chunks.map((chunk) => [
    `${formatCaptionTimestamp(chunk.startSec, "vtt")} --> ${formatCaptionTimestamp(chunk.endSec, "vtt")}`,
    chunk.text,
  ].join("\n")).join("\n\n");
  return body ? `WEBVTT\n\n${body}` : "WEBVTT\n";
}

function rebuildCaptionArtifactsFromChunks(chunks: HammerCaptionBuiltChunk[]): {
  chunkCount: number;
  approximateTiming: boolean;
  srt: string;
  vtt: string;
} {
  return {
    chunkCount: chunks.length,
    approximateTiming: chunks.some((chunk) => chunk.approximateTiming),
    srt: renderBuiltSrt(chunks),
    vtt: renderBuiltVtt(chunks),
  };
}

function countChangedCaptionBlocks(
  baseChunks: readonly HammerCaptionBuiltChunk[],
  nextChunks: readonly HammerCaptionBuiltChunk[],
): number {
  const comparisonLength = Math.max(baseChunks.length, nextChunks.length);
  let changedBlocks = 0;

  for (let index = 0; index < comparisonLength; index += 1) {
    const base = baseChunks[index] ?? null;
    const next = nextChunks[index] ?? null;
    if (!base || !next) {
      changedBlocks += 1;
      continue;
    }

    if (
      base.id !== next.id
      || base.speaker !== next.speaker
      || base.startSec !== next.startSec
      || base.endSec !== next.endSec
      || base.text !== next.text
      || base.lineCount !== next.lineCount
      || base.charCount !== next.charCount
    ) {
      changedBlocks += 1;
    }
  }

  return changedBlocks;
}

function buildCaptionBasisFingerprint(args: {
  transcript: HammerPersistedStructuredTranscript;
  outputLayerId: string | null;
  outputRecipeRef: string | null;
  formatting: HammerCaptionFormattingState;
}): string {
  return stableHashToken(JSON.stringify({
    transcriptId: args.transcript.transcript_id,
    outputLayerId: args.outputLayerId,
    outputRecipeRef: args.outputRecipeRef,
    formatting: args.formatting,
    segments: args.transcript.segments.map((segment) => ({
      id: segment.segment_id,
      speaker: segment.speaker,
      text: segment.text,
      start: segment.start_sec,
      end: segment.end_sec,
      disabled: segment.is_disabled === true,
    })),
  }));
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
  const initialPassMeta = resolvePassMeta(initialCurrentPass);
  const [currentPass, setCurrentPass] = useState<HammerPassId>(initialCurrentPass);
  const [passStatus, setPassStatus] = useState<HammerPassStatusMap>(() => deriveHydratedPassStatus(initialCurrentPass));
  const [selectedSourceTab, setSelectedSourceTab] = useState<HammerSourceTabId>(initialPassMeta.sourceTab);
  const [selectedVisualFlowStep, setSelectedVisualFlowStep] = useState<HammerVisualFlowStepId>("media_map");
  const [activeTool, setActiveTool] = useState<HammerToolId>(initialPassMeta.toolId);
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
  const [candidateEditModeById, setCandidateEditModeById] = useState<Record<string, boolean>>({});
  const [candidateProposedTextById, setCandidateProposedTextById] = useState<Record<string, string>>({});
  const [candidateCutEnabledById, setCandidateCutEnabledById] = useState<Record<string, boolean>>({});
  const [candidateCutDraftById, setCandidateCutDraftById] = useState<Record<string, { startSec: string; endSec: string }>>({});
  const [candidateReceiptByKind, setCandidateReceiptByKind] = useState<Record<HammerCandidateReviewKind, string | null>>({
    fillers: null,
    retakes: null,
  });
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
  const [visualBackgroundBlurRuntimeStatus, setVisualBackgroundBlurRuntimeStatus] = useState<HammerBackgroundBlurRuntimeStatus | null>(null);
  const [visualEyeContactAssistDebugOverlay, setVisualEyeContactAssistDebugOverlay] = useState(false);
  const [visualEyeContactAssistRuntimeStatus, setVisualEyeContactAssistRuntimeStatus] = useState<HammerEyeContactAssistRuntimeStatus | null>(null);
  const visualBackgroundEffectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imagePlacementDraftWindows, setImagePlacementDraftWindows] = useState<Record<string, HammerImagePlacementDraftWindow>>({});
  const [timelineImageDragState, setTimelineImageDragState] = useState<HammerTimelineImageDragState | null>(null);
  const [imagePlacementTransforms, setImagePlacementTransforms] = useState<Record<string, HammerImagePlacementTransform>>({});
  const [previewCanvasDragState, setPreviewCanvasDragState] = useState<HammerPreviewCanvasDragState | null>(null);
  const [imageAnimationContextMenu, setImageAnimationContextMenu] = useState<HammerImageAnimationContextMenuState | null>(null);
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
  const [copiedPromptKey, setCopiedPromptKey] = useState<string | null>(null);
  const [generatingReferenceBeatId, setGeneratingReferenceBeatId] = useState<string | null>(null);
  const [sourceDeskLoading, setSourceDeskLoading] = useState(false);
  const [sourceDeskError, setSourceDeskError] = useState<string | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<"images" | "broll" | "introoutro" | null>(null);
  const [introOutroSelection, setIntroOutroSelection] = useState<HammerIntroOutroSelection>({
    schema_version: 1,
    intro_asset_id: null,
    outro_asset_id: null,
    updated_at: new Date().toISOString(),
  });
  const [packagingLogoAssetPath, setPackagingLogoAssetPath] = useState<string | null>(null);
  const [packagingLogoPosition, setPackagingLogoPosition] = useState<HammerLogoOverlayPosition>("top_right");
  const [packagingLogoSize, setPackagingLogoSize] = useState<HammerLogoOverlaySize>("medium");
  const [savingIntroOutro, setSavingIntroOutro] = useState(false);
  const [sourceDeskPreviewUrls, setSourceDeskPreviewUrls] = useState<Record<string, string>>({});
  const [sourceDeskPreviewFailures, setSourceDeskPreviewFailures] = useState<Record<string, true>>({});
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
  const [thumbnailPromptDraft, setThumbnailPromptDraft] = useState("");
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [playbackMediaSrc, setPlaybackMediaSrc] = useState<string | null>(null);
  const [canonicalWorkpieceLabel, setCanonicalWorkpieceLabel] = useState<string | null>(null);
  const [visualTimelineFocusNonce, setVisualTimelineFocusNonce] = useState(0);
  const editableVisualPlacements = useMemo(
    () => deriveLegacyVisualPlacementsFromTimeline(editableVisualTimeline),
    [editableVisualTimeline],
  );
  const selectedClipId = editableVisualTimeline?.selected_clip_id ?? null;
  const playheadPrimaryVisualClip = useMemo(
    () => (editableVisualTimeline ? selectPrimaryActiveClipAtTime(editableVisualTimeline, playheadSec) : null),
    [editableVisualTimeline, playheadSec],
  );
  const playheadPrimaryClipId = playheadPrimaryVisualClip?.clip_id ?? null;
  const effectiveSelectedClipId = (isPlaybackActive || isScrubbing)
    ? (playheadPrimaryClipId ?? selectedClipId)
    : selectedClipId;
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const brollUploadInputRef = useRef<HTMLInputElement | null>(null);
  const introOutroUploadInputRef = useRef<HTMLInputElement | null>(null);
  const previewAudioRef = useRef<HTMLVideoElement | null>(null);
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
  const lastPlaybackMediaSrcRef = useRef<string | null>(null);
  const captionEditorRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const lastHandledHandoffTokenRef = useRef<number | null>(null);
  const transcriptLineRefs = useRef(new Map<string, HTMLButtonElement>());
  const visualPlacementCardRefs = useRef(new Map<string, HTMLElement>());
  const timelineTrackScrollRef = useRef<HTMLDivElement | null>(null);
  const selectionOriginRef = useRef<"system" | "transcript" | "timeline" | "playhead">("system");
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
  const copiedPromptTimerRef = useRef<number | null>(null);
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
  const imagePlacementDraftWindowsRef = useRef<Record<string, HammerImagePlacementDraftWindow>>({});
  const audioPolishHasLocalEditsRef = useRef(false);
  const editableAudioPolishRef = useRef<HammerPersistedAudioPolish | null>(
    cloneHammerAudioPolish(props.audioPolish),
  );
  const currentPassMeta = useMemo(() => resolvePassMeta(currentPass), [currentPass]);

  useEffect(() => {
    props.onHistoryRecoveryStatusChange?.(historyStatus);
  }, [historyStatus, props]);

  useEffect(() => {
    audioPolishHasLocalEditsRef.current = false;
    editableAudioPolishRef.current = null;
    setEditableAudioPolish(null);
    setAudioCutSelectionStartSec(null);
    setAudioCutSelectionEndSec(null);
    setDismissedSilenceSuggestionIds(new Set());
  }, [launchContext.workpiece_id]);

  const seekPreviewAudioWithOptionalSeamFade = useCallback((args: {
    audio: HTMLVideoElement;
    targetTime: number;
    applySeamFade: boolean;
  }): void => {
    const targetTime = args.targetTime;
    if (!Number.isFinite(targetTime) || targetTime < 0) {
      args.audio.currentTime = 0;
      return;
    }

    if (!args.applySeamFade || args.audio.muted || args.audio.volume <= 0) {
      args.audio.currentTime = targetTime;
      return;
    }

    const restoreVolume = args.audio.volume;
    const ref = cutSeekFadeRef.current;
    ref.token += 1;
    const token = ref.token;
    if (ref.timerId != null) {
      window.clearTimeout(ref.timerId);
      ref.timerId = null;
    }

    // Use a near-silent volume rather than exactly 0, so downstream "restore volume if 0" guards don't break the seam fade.
    const nearSilent = 0.0001;
    args.audio.volume = nearSilent;
    args.audio.currentTime = targetTime;

    ref.timerId = window.setTimeout(() => {
      if (cutSeekFadeRef.current.token !== token) return;
      const audio = args.audio;
      if (!audio) return;
      if (!audio.muted) {
        audio.volume = restoreVolume;
      }
      cutSeekFadeRef.current.timerId = null;
    }, Math.max(0, Math.round(HAMMER_FILLER_CUT_SEAM_FADE_SEC * 1000)));
  }, [HAMMER_FILLER_CUT_SEAM_FADE_SEC]);

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
    const nextMeta = resolvePassMeta(nextInitialPass);
    setActiveTool(nextMeta.toolId);
    setSelectedSourceTab(nextMeta.sourceTab);
    setSelectedSegmentId(nextSelectedSegmentId);
    setTranscriptSelectionAnchorSegmentId(nextSelectedSegmentId);
    setTranscriptSelectionFocusSegmentId(nextSelectedSegmentId);
  }, [
    launchContext.workspace_id,
    launchContext.workpiece_id,
    props.initialCurrentPass,
    props.initialSelectedSegmentId,
    transcriptSegments,
  ]);

  useEffect(() => {
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
  }, [props.initialVisualPreviewSettings]);

  useEffect(() => {
    setPassStatus((previous) => {
      const normalized = normalizePassStatus(previous, currentPass);
      return normalized;
    });
  }, [currentPass]);

  useEffect(() => {
    if (resolvePassMeta(currentPass).toolId !== activeTool) {
      setCurrentPass(resolveDefaultPassForTool(activeTool));
    }
  }, [activeTool, currentPass]);

  useEffect(() => {
    if (!imageAnimationContextMenuRef.current || !imageAnimationContextMenu) return;
    imageAnimationContextMenuRef.current.style.left = `${imageAnimationContextMenu.x}px`;
    imageAnimationContextMenuRef.current.style.top = `${imageAnimationContextMenu.y}px`;
  }, [imageAnimationContextMenu]);

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
    setCurrentPass(passId);
    if (activeTool !== nextMeta.toolId) {
      setActiveTool(nextMeta.toolId);
    }
    if (selectedSourceTab !== nextMeta.sourceTab) {
      setSelectedSourceTab(nextMeta.sourceTab);
    }
    setPassStatus((previous) => {
      const normalized = normalizePassStatus(previous, passId);
      if (normalized[passId] === "not_started") {
        normalized[passId] = "in_progress";
      }
      return normalized;
    });
    setFocusOverride("tool-focus");
  }

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
    const mediaNodes = document.querySelectorAll("audio,video");
    mediaNodes.forEach((node) => {
      if (!(node instanceof HTMLMediaElement)) return;
      if (primaryPreviewAudio && node === primaryPreviewAudio) return;
      node.pause();
      if (!node.ended) {
        node.currentTime = 0;
      }
      if (node instanceof HTMLVideoElement) {
        node.muted = true;
      }
    });
  }, []);

  const claimGlobalPlaybackAuthority = useCallback((previewAudio: HTMLMediaElement): void => {
    const runtimeWindow = window as HammerPlaybackAuthorityWindow;
    const activePreviewAudio = runtimeWindow.__forgeHammerActivePreviewAudio__;
    if (activePreviewAudio && activePreviewAudio !== previewAudio) {
      activePreviewAudio.pause();
      if (!activePreviewAudio.ended) {
        activePreviewAudio.currentTime = 0;
      }
    }
    runtimeWindow.__forgeHammerActivePreviewAudio__ = previewAudio;
    runtimeWindow.__forgeHammerActivePreviewOwnerId__ = playbackOwnerIdRef.current;
    pauseAuxiliaryMediaPlayback();
  }, [pauseAuxiliaryMediaPlayback]);

  const releaseGlobalPlaybackAuthority = useCallback((previewAudio: HTMLMediaElement | null): void => {
    const runtimeWindow = window as HammerPlaybackAuthorityWindow;
    if (
      runtimeWindow.__forgeHammerActivePreviewOwnerId__ === playbackOwnerIdRef.current
      && runtimeWindow.__forgeHammerActivePreviewAudio__ === previewAudio
    ) {
      runtimeWindow.__forgeHammerActivePreviewAudio__ = undefined;
      runtimeWindow.__forgeHammerActivePreviewOwnerId__ = undefined;
    }
  }, []);

  const previewMode: HammerPreviewMode = launchContext.preview_mode ?? launchContext.edit_plan?.preview_mode ?? "edit-aware";
  const workspaceFocusMode = focusOverride === "auto" ? resolveWorkspaceFocusMode(activeTool) : focusOverride;
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

  const selectedSegment = editableTranscriptSegments.find((segment) => segment.segment_id === selectedSegmentId) ?? null;
  const activeFillerCandidateCard = fillerCandidateCards[fillerActiveCandidateIndex] ?? null;
  const activeRetakeCandidateCard = retakeCandidateCards[retakeActiveCandidateIndex] ?? null;
  const activeCandidateCard = activeReviewKind === "retakes" ? activeRetakeCandidateCard : activeFillerCandidateCard;
  useEffect(() => {
    if (!activeCandidateCard) return;
    setCandidateProposedTextById((current) => {
      if (Object.prototype.hasOwnProperty.call(current, activeCandidateCard.id)) return current;
      return {
        ...current,
        [activeCandidateCard.id]: activeCandidateCard.afterText ?? "",
      };
    });
  }, [activeCandidateCard]);
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
  const isLoopPlaybackActive = playbackWindow?.mode === "loop";
  const playbackModeLabel = isScrubbing
    ? "Scrubbing"
    : playbackWindow?.mode === "loop"
    ? `Looping ${playbackWindow.label}`
    : playbackWindow?.mode === "roll"
    ? `Auditioning ${playbackWindow.label}`
    : isPlaybackActive
    ? "Playing"
    : "Paused";
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
  useEffect(() => {
    if (!activeCandidateCard) return;
    const candidateId = activeCandidateCard.id;
    const defaultCutEnabled = activeCandidateCard.apply.removeSegmentIds.length > 0;
    setCandidateCutEnabledById((current) => (
      Object.prototype.hasOwnProperty.call(current, candidateId)
        ? current
        : { ...current, [candidateId]: defaultCutEnabled }
    ));
    setCandidateCutDraftById((current) => {
      if (Object.prototype.hasOwnProperty.call(current, candidateId)) return current;
      const suggested = resolveCandidateSuggestedCut(activeCandidateCard);
      if (!suggested) return current;
      return {
        ...current,
        [candidateId]: {
          startSec: String(suggested.startSec),
          endSec: String(suggested.endSec),
        },
      };
    });
  }, [activeCandidateCard, transcriptSegmentsById]);
  const transcriptSelectionAllDisabled = useMemo(() => (
    hasTranscriptSelection && transcriptSelectionRange.segmentIds.every(
      (segmentId) => transcriptSegmentsById.get(segmentId)?.is_disabled === true,
    )
  ), [hasTranscriptSelection, transcriptSelectionRange.segmentIds, transcriptSegmentsById]);
  useEffect(() => {
    if (!activeCandidatePrimarySegmentId) return;
    if (!editableTranscriptSegments.some((segment) => segment.segment_id === activeCandidatePrimarySegmentId)) return;
    setSelectedSegmentId(activeCandidatePrimarySegmentId);
    setTranscriptSelectionAnchorSegmentId(activeCandidatePrimarySegmentId);
    setTranscriptSelectionFocusSegmentId(activeCandidatePrimarySegmentId);
  }, [activeCandidatePrimarySegmentId, editableTranscriptSegments]);
  useEffect(() => {
    imagePlacementDraftWindowsRef.current = imagePlacementDraftWindows;
  }, [imagePlacementDraftWindows]);
  const playheadSegment = resolvePlayheadSegment(editableTranscriptSegments, playheadSec);
  const transcriptDurationSec = resolveTranscriptDurationSec(editableTranscriptSegments);
  const playbackTransportDurationSec = transcriptDurationSec;
  const effectivePlaybackCutRegions = useMemo(
    () => getEffectiveCutRegions(editableAudioPolish?.audio_edit ?? null, playbackTransportDurationSec),
    [editableAudioPolish?.audio_edit, playbackTransportDurationSec],
  );
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
    () => resolveTimelineBoundaryTimes(editableTranscriptSegments),
    [editableTranscriptSegments],
  );
  const resolveAudibleSeekTarget = useCallback((requestedTimeSec: number): number | null => (
    resolveNextAudiblePlaybackTime({
      requestedTimeSec,
      durationSec: playbackTransportDurationSec,
      effectiveCutRegions: effectivePlaybackCutRegions,
      transcriptSegments: editableTranscriptSegments,
    })
  ), [editableTranscriptSegments, effectivePlaybackCutRegions, playbackTransportDurationSec]);
  useEffect(() => {
    if (playbackTransportDurationSec <= 0) return;

    const audibleTarget = resolveAudibleSeekTarget(playheadSec);
    if (audibleTarget == null) {
      const terminalPlayheadSec = roundToTenth(playbackTransportDurationSec);
      if (Math.abs(playheadSec - terminalPlayheadSec) >= SCRUB_SEEK_THRESHOLD_SEC) {
        setPlayheadSec(terminalPlayheadSec);
      }
    if (
      previewAudioRef.current
      && Math.abs(previewAudioRef.current.currentTime - playbackTransportDurationSec) > SCRUB_SEEK_THRESHOLD_SEC
    ) {
      previewAudioRef.current.currentTime = playbackTransportDurationSec;
    }
      if (isPlaybackActive) {
        setIsPlaybackActive(false);
      }
      if (playbackWindow?.mode === "roll") {
        setPlaybackWindow(null);
      }
      return;
    }

    if (Math.abs(playheadSec - audibleTarget) < SCRUB_SEEK_THRESHOLD_SEC) {
      return;
    }

    const nextPlayheadSec = roundToTenth(audibleTarget);
    setPlayheadSec(nextPlayheadSec);
    if (
      previewAudioRef.current
      && Math.abs(previewAudioRef.current.currentTime - audibleTarget) > SCRUB_SEEK_THRESHOLD_SEC
    ) {
      previewAudioRef.current.currentTime = audibleTarget;
    }
  }, [
    effectivePlaybackCutRegions,
    isPlaybackActive,
    playbackTransportDurationSec,
    playbackWindow?.mode,
    playheadSec,
    resolveAudibleSeekTarget,
  ]);
  const resolvePlaybackTransportProgress = useCallback((requestedTimeSec: number): {
    nextPlayheadSec: number;
    shouldLoop: boolean;
    shouldStop: boolean;
    shouldSyncMediaTime: boolean;
  } => {
    if (playbackTransportDurationSec <= 0) {
      return {
        nextPlayheadSec: 0,
        shouldLoop: false,
        shouldStop: true,
        shouldSyncMediaTime: false,
      };
    }

    let candidate = Math.max(0, Math.min(playbackTransportDurationSec, requestedTimeSec));
    let shouldLoop = false;
    let shouldSyncMediaTime = false;
    const maxIterations = Math.max(2, effectivePlaybackCutRegions.length + 4);

    for (let index = 0; index < maxIterations; index += 1) {
      const audibleTarget = resolveNextAudiblePlaybackTime({
        requestedTimeSec: candidate,
        durationSec: playbackTransportDurationSec,
        effectiveCutRegions: effectivePlaybackCutRegions,
        transcriptSegments: editableTranscriptSegments,
      });

      if (audibleTarget == null) {
        return {
          nextPlayheadSec: playbackTransportDurationSec,
          shouldLoop: false,
          shouldStop: true,
          shouldSyncMediaTime: true,
        };
      }

      if (Math.abs(audibleTarget - candidate) > PLAYHEAD_WINDOW_EPSILON_SEC) {
        shouldSyncMediaTime = true;
      }

      const windowProgress = resolvePlaybackWindowProgress(audibleTarget);
      if (windowProgress.shouldStop) {
        return {
          nextPlayheadSec: windowProgress.nextPlayheadSec,
          shouldLoop: false,
          shouldStop: true,
          shouldSyncMediaTime: shouldSyncMediaTime
            || Math.abs(windowProgress.nextPlayheadSec - audibleTarget) > PLAYHEAD_WINDOW_EPSILON_SEC,
        };
      }

      if (
        windowProgress.shouldLoop
        || Math.abs(windowProgress.nextPlayheadSec - audibleTarget) > PLAYHEAD_WINDOW_EPSILON_SEC
      ) {
        candidate = windowProgress.nextPlayheadSec;
        shouldLoop = shouldLoop || windowProgress.shouldLoop;
        shouldSyncMediaTime = true;
        continue;
      }

      return {
        nextPlayheadSec: audibleTarget,
        shouldLoop,
        shouldStop: false,
        shouldSyncMediaTime,
      };
    }

    return {
      nextPlayheadSec: candidate,
      shouldLoop,
      shouldStop: false,
      shouldSyncMediaTime,
    };
  }, [
    editableTranscriptSegments,
    effectivePlaybackCutRegions,
    playbackTransportDurationSec,
    playbackWindow,
  ]);
  const sortedTimelineMarkers = useMemo(
    () => [...timelineMarkers].sort((left, right) => left.timeSec - right.timeSec),
    [timelineMarkers],
  );
  const markerTimesSec = useMemo(
    () => sortedTimelineMarkers.map((marker) => marker.timeSec),
    [sortedTimelineMarkers],
  );
  const visualAssetsById = useMemo(() => {
    const byId = new Map<string, NonNullable<HammerVisualTimelineState["assets"]>[number]>();
    for (const asset of editableVisualTimeline?.assets ?? []) {
      byId.set(asset.asset_id, asset);
    }
    return byId;
  }, [editableVisualTimeline?.assets]);
  const sourceVisualPlacementItems = useMemo<HammerSourceImageItem[]>(() => (
    (editableVisualTimeline?.clips ?? [])
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
  ), [editableTranscriptSegments, editableVisualTimeline?.clips, imagePlacementDraftWindows, selectedSegmentId, visualAssetsById]);
  const sourceImageItems = useMemo(
    () => sourceVisualPlacementItems.filter((item) => item.kind === "image"),
    [sourceVisualPlacementItems],
  );
  const sourceBrollPlacementItems = useMemo(
    () => sourceVisualPlacementItems.filter((item) => item.kind === "broll" || item.kind === "reference_clip"),
    [sourceVisualPlacementItems],
  );
  const isVisualPreviewAuthority = (
    selectedSourceTab === "images"
    || selectedSourceTab === "broll"
    || currentPass === "visual_finishing"
    || currentPass === "image_placement"
    || currentPass === "image_animation"
  );
  useEffect(() => {
    if (!isVisualPreviewAuthority) return;

    const candidateIds = sourceVisualPlacementItems.map((item) => item.id);
    const preferredId = editableVisualTimeline?.selected_clip_id ?? props.initialSelectedOverlayRowId ?? null;
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
    editableVisualTimeline?.selected_clip_id,
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
    () => (editableVisualTimeline ? selectClipById(editableVisualTimeline, effectiveSelectedClipId) : null),
    [editableVisualTimeline, effectiveSelectedClipId],
  );
  // Visual placements should be editable whenever the operator is explicitly in the Images posture,
  // even if the current "pass" is something else (reduces mode confusion and matches editor intent).
  const visualPlacementEditingEnabled = currentPass === "image_placement"
    || currentPass === "image_animation"
    || selectedSourceTab === "images";
  const selectedImagePlacement = useMemo(
    () => sourceVisualPlacementItems.find((item) => item.id === effectiveSelectedClipId) ?? null,
    [effectiveSelectedClipId, sourceVisualPlacementItems],
  );
  const selectedPlacementRecord = effectiveSelectedClipId
    ? (visualPlacementsById.get(effectiveSelectedClipId) ?? null)
    : null;
  const selectedImagePlacementTransform = useMemo(() => {
    if (!effectiveSelectedClipId) return DEFAULT_IMAGE_PLACEMENT_TRANSFORM;
    const draft = imagePlacementTransforms[effectiveSelectedClipId];
    if (draft) return draft;
    if (selectedVisualClip) {
      return geometryToTransform(selectedVisualClip.geometry);
    }
    return geometryToTransform(resolvePlacementGeometry(selectedPlacementRecord));
  }, [imagePlacementTransforms, effectiveSelectedClipId, selectedPlacementRecord, selectedVisualClip]);
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
    if (selectedVisualClip && isVisualPreviewAuthority) {
      const visualLabel = selectedVisualClip.label?.trim() || selectedVisualClip.clip_id;
      return `Selected visual: ${visualLabel} (${selectedVisualClip.start_sec.toFixed(1)}s-${selectedVisualClip.end_sec.toFixed(1)}s)`;
    }
    const fallback = resolvePreviewLabel(playheadSegment, playheadSec);
    return fallback.length > 120 ? `${fallback.slice(0, 117)}...` : fallback;
  }, [isVisualPreviewAuthority, playheadSec, playheadSegment, selectedVisualClip]);

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
    subjectExpansionPx: Math.max(0, Math.min(48, Number(visualBackgroundBlurSubjectExpansionPx) || 0)),
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
  const visualBackgroundBlurStatusSummary = useMemo(() => {
    if (!visualBackgroundBlurRuntimeStatus) return null;
    return summarizeBackgroundEffectRuntimeStatus({
      status: visualBackgroundBlurRuntimeStatus,
      providerLabel: backgroundBlurProviderDescriptor?.displayName ?? null,
      showDebugDetails: visualBackgroundBlurDebugMask,
    });
  }, [backgroundBlurProviderDescriptor, visualBackgroundBlurDebugMask, visualBackgroundBlurRuntimeStatus]);

  const eyeContactUseBackgroundCanvasAsSource = useMemo(() => {
    if (!(visualBackgroundBlur || visualBackgroundReplaceEnabled || visualBackgroundWashEnabled)) return false;
    if (!visualBackgroundBlurRuntimeStatus) return false;
    if (backgroundBlurSettings.fallbackMode === "passthrough") return true;
    return visualBackgroundBlurRuntimeStatus.degradedReason == null;
  }, [
    backgroundBlurSettings.fallbackMode,
    visualBackgroundBlur,
    visualBackgroundBlurRuntimeStatus,
    visualBackgroundReplaceEnabled,
    visualBackgroundWashEnabled,
  ]);

  const visualEyeContactAssistStatusSummary = useMemo(() => {
    if (!visualEyeContactAssistRuntimeStatus) return null;
    return summarizeEyeContactAssistRuntimeStatus({
      status: visualEyeContactAssistRuntimeStatus,
      showDebugDetails: visualEyeContactAssistDebugOverlay,
    });
  }, [visualEyeContactAssistDebugOverlay, visualEyeContactAssistRuntimeStatus]);

  const activePreviewOverlays = useMemo<VisualPreviewOverlayModel[]>(() => {
    if (!isVisualPreviewAuthority) return [];
    if (!editableVisualTimeline) return [];
    const focusSelectedClipWhenPaused = (
      currentPass === "visual_finishing"
      || currentPass === "image_placement"
      || currentPass === "image_animation"
    );
    const clipCandidates = selectPreviewClips({
      state: editableVisualTimeline,
      playheadSec,
      selectedClipId,
      focusSelectedClipWhenPaused,
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
          selected: clip.clip_id === effectiveSelectedClipId,
          dimmed: false,
        };
      })
      .filter((item): item is VisualPreviewOverlayModel => item !== null);
    return overlays.sort((left, right) => left.z_index - right.z_index);
  }, [
    currentPass,
    editableVisualTimeline,
    imagePlacementTransforms,
    isPlaybackActive,
    isScrubbing,
    isVisualPreviewAuthority,
    playheadSec,
    effectiveSelectedClipId,
    selectedClipId,
    sourceDeskPreviewUrls,
    visualAssetsById,
  ]);

  useEffect(() => {
    if (isPlaybackActive || isScrubbing) return;
    if (!effectiveSelectedClipId) return;
    if (selectedSourceTab !== "images") return;
    const node = visualPlacementCardRefs.current.get(effectiveSelectedClipId) ?? null;
    if (!node) return;
    node.scrollIntoView({ block: "nearest" });
  }, [effectiveSelectedClipId, isPlaybackActive, isScrubbing, selectedSourceTab]);

  useEffect(() => {
    if (!selectedClipId) return;
    if (sourceVisualPlacementItems.some((item) => item.id === selectedClipId)) return;
    setSelectedClipId(null);
  }, [selectedClipId, sourceVisualPlacementItems]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const expectedClipId = (isPlaybackActive || isScrubbing) ? effectiveSelectedClipId : selectedClipId;
    if (!expectedClipId) return;
    const selectedTimelineClip = editableVisualTimeline
      ? selectClipById(editableVisualTimeline, expectedClipId)
      : null;
    const renderedClipId = activePreviewOverlays.find((overlay) => overlay.selected)?.clip_id ?? null;
    if (!selectedTimelineClip) {
      console.warn("[HammerVisuals] selected clip is missing from canonical timeline", {
        selected_clip_id: expectedClipId,
      });
      return;
    }
    if (renderedClipId && renderedClipId !== selectedTimelineClip.clip_id) {
      console.warn("[HammerVisuals] preview render mismatch", {
        selected_clip_id: selectedTimelineClip.clip_id,
        rendered_clip_id: renderedClipId,
      });
    }
  }, [activePreviewOverlays, editableVisualTimeline, effectiveSelectedClipId, isPlaybackActive, isScrubbing, selectedClipId]);
  useEffect(() => {
    if (currentPass !== "image_placement" && currentPass !== "image_animation") return;
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
      const clip = editableVisualTimeline
        ? selectClipById(editableVisualTimeline, overlay.clip_id)
        : null;
      if (!clip) continue;
      const localTime = Math.max(0, playheadSec - clip.start_sec);
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
  }, [activePreviewOverlays, editableVisualTimeline, isPlaybackActive, isScrubbing, playheadSec, scrubRate]);
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
  const sourceImageLibraryItems = useMemo(
    () => storedMediaFiles.filter((file) => file.kind === "image"),
    [storedMediaFiles],
  );
  const introOutroCandidateItems = useMemo(() => (
    storedMediaFiles
      .filter((file) => file.kind === "broll" || file.kind === "reference_clip" || file.kind === "audio" || file.kind === "other")
      .map((file) => ({
        ...file,
        assetId: deriveStableHammerAssetIdFromPath(file.path),
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  ), [storedMediaFiles]);
  const introOutroCandidateItemsById = useMemo(() => {
    const byId = new Map<string, (typeof introOutroCandidateItems)[number]>();
    for (const item of introOutroCandidateItems) {
      byId.set(item.assetId, item);
    }
    return byId;
  }, [introOutroCandidateItems]);
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
  const timelineDurationSec = Math.max(transcriptDurationSec, 1);
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
    const clamped = Math.max(0, Math.min(timelineDurationSec, timeSec));
    const ratio = timelineDurationSec > 0 ? (clamped / timelineDurationSec) : 0;
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const target = Math.max(0, Math.min(maxScrollLeft, (container.scrollWidth * ratio) - (container.clientWidth / 2)));
    container.scrollTo({ left: target, behavior: "smooth" });
  }, [timelineDurationSec]);

  const selectVisualClip = useCallback((args: {
    clipId: string;
    origin: "tool_window" | "timeline" | "preview";
    snapPlayhead?: boolean;
    revealUI?: boolean;
  }) => {
    const placement = sourceVisualPlacementItems.find((item) => item.id === args.clipId) ?? null;
    const anchorSegmentId = placement?.anchorSegmentId ?? null;
    const startSec = placement?.startSec ?? null;

    if (args.revealUI && placement) {
      setSelectedSourceTab(placement.kind === "image" ? "images" : "broll");
    }

    selectionOriginRef.current = "timeline";
    setFocusOverride("time-focus");
    setSelectedClipId(args.clipId);
    setVisualTimelineFocusNonce((current) => current + 1);

    if (anchorSegmentId) {
      setSelectedSegmentId(anchorSegmentId);
      setTranscriptSelectionAnchorSegmentId(anchorSegmentId);
      setTranscriptSelectionFocusSegmentId(anchorSegmentId);
    }

    if (args.snapPlayhead !== false && startSec != null) {
      seekPlayheadToTime(startSec, "timeline", { snapToBoundary: false });
      revealBottomTimelineAtTime(startSec);
    }
  }, [
    revealBottomTimelineAtTime,
    sourceVisualPlacementItems,
    seekPlayheadToTime,
    setSelectedClipId,
    setSelectedSegmentId,
    setSelectedSourceTab,
    setTranscriptSelectionAnchorSegmentId,
    setTranscriptSelectionFocusSegmentId,
  ]);
  const dialogueLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    editableTranscriptSegments.map((segment) => ({
      id: `dialogue:${segment.segment_id}`,
      label: segment.is_disabled ? `${segment.speaker} (disabled)` : segment.speaker,
      startSec: segment.start_sec,
      endSec: segment.end_sec,
      selected: segment.segment_id === selectedSegmentId,
      inRange: transcriptSelectionSegmentIdSet.has(segment.segment_id),
      disabled: segment.is_disabled === true,
      tone: "dialogue",
      onSelect: () => {
        selectionOriginRef.current = "timeline";
        setFocusOverride("time-focus");
        setSelectedSegmentId(segment.segment_id);
        setTranscriptSelectionAnchorSegmentId(segment.segment_id);
        setTranscriptSelectionFocusSegmentId(segment.segment_id);
        seekPlayheadToTime(segment.start_sec, "playhead");
      },
    }))
  ), [editableTranscriptSegments, selectedSegmentId, transcriptSelectionSegmentIdSet]);
  const imageLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    sourceImageItems.map((item) => ({
      id: `image:${item.id}`,
      placementId: item.id,
      label: item.label,
      startSec: item.startSec,
      endSec: item.endSec,
      selected: item.id === effectiveSelectedClipId,
      tone: "image",
      onSelect: () => {
        selectVisualClip({ clipId: item.id, origin: "timeline", revealUI: true });
      },
    }))
  ), [effectiveSelectedClipId, selectVisualClip, sourceImageItems]);
  const brollLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    sourceBrollPlacementItems
      .map((item) => ({
        id: `broll-placement:${item.id}`,
        placementId: item.id,
        label: item.label,
        startSec: item.startSec,
        endSec: item.endSec,
        selected: item.id === effectiveSelectedClipId,
        tone: "broll",
        onSelect: () => {
          selectVisualClip({ clipId: item.id, origin: "timeline", revealUI: true });
        },
      }))
  ), [effectiveSelectedClipId, selectVisualClip, sourceBrollPlacementItems]);
  const visualTimelineLaneClips = useMemo<VisualClipBlockModel[]>(() => (
    [...sourceImageItems, ...sourceBrollPlacementItems]
      .map((item) => ({
        clipId: item.id,
        label: item.label,
        startSec: item.startSec,
        endSec: item.endSec,
        selected: item.id === effectiveSelectedClipId,
      }))
      .sort((left, right) => left.startSec - right.startSec)
  ), [effectiveSelectedClipId, sourceBrollPlacementItems, sourceImageItems]);
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
  const sourceDeskPreviewPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const item of sourceImageLibraryItems) {
      paths.add(item.path);
    }
    for (const item of sourceImageItems) {
      if (item.assetPath) paths.add(item.assetPath);
    }
    for (const item of sourceBrollItems) {
      if (item.assetPath) paths.add(item.assetPath);
    }
    return [...paths];
  }, [sourceBrollItems, sourceImageItems, sourceImageLibraryItems]);
  const sourceDeskPreviewFetchPaths = useMemo(
    () => sourceDeskPreviewPaths.slice(0, SOURCE_DESK_PREVIEW_MAX_ITEMS),
    [sourceDeskPreviewPaths],
  );
  const sourceDeskPreviewFetchKey = useMemo(
    () => buildSourceDeskPreviewFetchKey(sourceDeskPreviewFetchPaths),
    [sourceDeskPreviewFetchPaths],
  );
  const imageUsageByPath = useMemo(() => {
    const usage = new Map<string, number>();
    for (const item of sourceImageItems) {
      if (!item.assetPath) continue;
      usage.set(item.assetPath, (usage.get(item.assetPath) ?? 0) + 1);
    }
    return usage;
  }, [sourceImageItems]);
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
  }, [mediaSourceLabel, preferredPlayback.kind, preferredPlayback.local_relpath, preferredPlayback.source_label, preferredPlayback.workpiece_path]);
  const mediaLabelMismatchWarning = useMemo(() => {
    const canonical = normalizeLabelForComparison(canonicalWorkpieceLabel);
    const legacy = normalizeLabelForComparison(legacyCaptureLabel);
    if (!canonical || !legacy) return null;
    if (isSystemMediaLabel(legacyCaptureLabel)) return null;
    if (canonical.includes(legacy) || legacy.includes(canonical)) return null;
    return `Capture label "${legacyCaptureLabel}" does not match this episode title "${canonicalWorkpieceLabel}".`;
  }, [canonicalWorkpieceLabel, legacyCaptureLabel]);
  const historyController = historyControllerRef.current;
  const canUndo = historyController?.canUndo() ?? false;
  const canRedo = historyController?.canRedo() ?? false;
  const undoLabel = historyController?.peekUndoEntry()?.label ?? null;
  const redoLabel = historyController?.peekRedoEntry()?.label ?? null;
  const undoDepth = historyController?.document.undoStack.length ?? 0;
  const redoDepth = historyController?.document.redoStack.length ?? 0;
  const historyHeadEntryId = historyController?.document.headEntryId ?? null;
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
  const audioFinalizationWarmth = useMemo(
    () => scaleToPercent(editableStudioRack.modules.tubeMicCharacter.warmth, -1, 1),
    [editableStudioRack.modules.tubeMicCharacter.warmth],
  );
  const audioFinalizationPresence = useMemo(
    () => scaleToPercent(editableStudioRack.modules.eq.mid_gain_db, -6, 6),
    [editableStudioRack.modules.eq.mid_gain_db],
  );
  const audioFinalizationHarshness = useMemo(
    () => scaleToPercent(editableStudioRack.modules.eq.high_shelf_gain_db, -8, 4),
    [editableStudioRack.modules.eq.high_shelf_gain_db],
  );
  const audioFinalizationOutputLevel = useMemo(
    () => scaleToPercent(editableStudioRack.modules.compressor.makeup_gain_db, -6, 12),
    [editableStudioRack.modules.compressor.makeup_gain_db],
  );
  const audioStudioSoundApplied = useMemo(
    () => editableStudioRack.is_enabled
      && editableStudioRack.modules.compressor.is_enabled
      && editableStudioRack.modules.eq.is_enabled
      && editableStudioRack.modules.tubeMicCharacter.is_enabled,
    [
      editableStudioRack.is_enabled,
      editableStudioRack.modules.compressor.is_enabled,
      editableStudioRack.modules.eq.is_enabled,
      editableStudioRack.modules.tubeMicCharacter.is_enabled,
    ],
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
    setCleanupPreview(null);
  }

  function setSelectedClipId(clipId: string | null): void {
    setEditableVisualTimeline((current) => {
      const base = current ?? props.visualTimeline ?? createEmptyVisualTimelineState({
        updated_at: new Date().toISOString(),
        debug_origin: "empty_init",
      });
      const next = hammerVisualTimelineReducer(base, {
        type: "SELECT_CLIP",
        clip_id: clipId,
      });
      if (import.meta.env.DEV && clipId) {
        const resolved = selectClipById(next, clipId);
        console.debug("[HammerVisuals] clip selection", {
          clicked_clip_id: clipId,
          resolved_selected_clip_id: resolved?.clip_id ?? null,
        });
      }
      return next;
    });
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
    structuredTranscriptResetKey,
    visualTimelineResetKey,
    transcriptSourceId,
    previewMode,
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
    const selectedStillExists = selectedSegmentId
      ? editableTranscriptSegments.some((segment) => segment.segment_id === selectedSegmentId)
      : false;
    if (selectedStillExists) return;

    const fallbackSegment = resolvePlayheadSegment(editableTranscriptSegments, playheadSec)
      ?? editableTranscriptSegments[0]
      ?? null;
    const nextSegmentId = fallbackSegment?.segment_id ?? null;
    if (nextSegmentId === selectedSegmentId) return;
    selectionOriginRef.current = "system";
    setSelectedSegmentId(nextSegmentId);
    setTranscriptSelectionAnchorSegmentId(nextSegmentId);
    setTranscriptSelectionFocusSegmentId(nextSegmentId);
  }, [editableTranscriptSegments, playheadSec, selectedSegmentId]);

  useEffect(() => {
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
    setTranscriptSelectionAnchorSegmentId(fallbackSegmentId);
    setTranscriptSelectionFocusSegmentId(fallbackSegmentId);
  }, [
    editableTranscriptSegments,
    selectedSegmentId,
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
    let active = true;
    let objectUrlToRevoke: string | null = null;

    const resolveRawPlaybackSrc = async (): Promise<void> => {
      const localRelpath = mediaRef?.local_relpath ?? null;
      if (!localRelpath) {
        setPlaybackMediaSrc(null);
        return;
      }

      if (playbackLocalRootAbs) {
        setPlaybackMediaSrc(buildHammerDevMediaUrl(playbackLocalRootAbs, localRelpath));
        return;
      }

      try {
        const previewUrl = await loadWorkpieceMediaPreviewUrl({
          workpieceId: launchContext.workpiece_id,
          path: localRelpath,
          mimeType: mediaRef?.kind === "recording_audio" ? "audio/mpeg" : "video/webm",
          surface: "unknown",
        });
        if (!active) {
          URL.revokeObjectURL(previewUrl);
          return;
        }
        objectUrlToRevoke = previewUrl;
        setPlaybackMediaSrc(previewUrl);
      } catch {
        if (!active) return;
        setPlaybackMediaSrc(null);
      }
    };

    (async () => {
      if (preferredPlayback.kind === "polished") {
        if (preferredPlayback.local_relpath && playbackLocalRootAbs) {
          setPlaybackMediaSrc(
            buildHammerDevMediaUrl(playbackLocalRootAbs, preferredPlayback.local_relpath),
          );
          return;
        }

        if (preferredPlayback.workpiece_path) {
          try {
            const previewUrl = await loadCanonicalAudioPolishPreviewUrl({
              workpieceId: launchContext.workpiece_id,
              workpiecePath: preferredPlayback.workpiece_path,
              mimeType: preferredPlayback.mime_type,
            });
            if (!active) {
              URL.revokeObjectURL(previewUrl);
              return;
            }
            objectUrlToRevoke = previewUrl;
            setPlaybackMediaSrc(previewUrl);
            return;
          } catch {
            if (!active) return;
          }
        }
      }

      await resolveRawPlaybackSrc();
    })();

    return () => {
      active = false;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [
    launchContext.workpiece_id,
    mediaRef?.kind,
    mediaRef?.local_relpath,
    playbackLocalRootAbs,
    preferredPlayback.kind,
    preferredPlayback.local_relpath,
    preferredPlayback.mime_type,
    preferredPlayback.workpiece_path,
  ]);

  useEffect(() => {
    const previewAudio = previewAudioRef.current;
    if (!previewAudio) return;
    const runtimeWindow = window as HammerPlaybackAuthorityWindow;
    const activeOwnerId = runtimeWindow.__forgeHammerActivePreviewOwnerId__;
    if (isPlaybackActive && activeOwnerId && activeOwnerId !== playbackOwnerIdRef.current) {
      previewAudio.pause();
      setIsPlaybackActive(false);
      return;
    }

    const srcChanged = lastPlaybackMediaSrcRef.current !== playbackMediaSrc;
    if (srcChanged) {
      lastPlaybackMediaSrcRef.current = playbackMediaSrc;
      previewAudio.pause();
    }

    if (!playbackMediaSrc) {
      previewAudio.pause();
      previewAudio.removeAttribute("src");
      previewAudio.load();
      if (isPlaybackActive) setIsPlaybackActive(false);
      return;
    }

    const transportProgress = isPlaybackActive
      ? resolvePlaybackTransportProgress(playheadSec)
      : {
        nextPlayheadSec: resolveAudibleSeekTarget(playheadSec) ?? playbackTransportDurationSec,
        shouldLoop: false,
        shouldStop: false,
        shouldSyncMediaTime: false,
      };
    const targetTime = Math.max(
      0,
      Math.min(
        transportProgress.nextPlayheadSec,
        playbackTransportDurationSec > 0 ? playbackTransportDurationSec : transportProgress.nextPlayheadSec,
      ),
    );
    if (Math.abs(playheadSec - targetTime) >= SCRUB_SEEK_THRESHOLD_SEC) {
      setPlayheadSec(roundToTenth(targetTime));
    }
    const shouldSynchronizeCurrentTime = srcChanged || !isPlaybackActive || isScrubbing || transportProgress.shouldSyncMediaTime;
    if (shouldSynchronizeCurrentTime && Math.abs(previewAudio.currentTime - targetTime) > SCRUB_SEEK_THRESHOLD_SEC) {
      seekPreviewAudioWithOptionalSeamFade({
        audio: previewAudio,
        targetTime,
        applySeamFade: transportProgress.shouldSyncMediaTime,
      });
    }

    if (transportProgress.shouldStop) {
      previewAudio.pause();
      if (isPlaybackActive) setIsPlaybackActive(false);
      if (playbackWindow?.mode === "roll") {
        setPlaybackWindow(null);
      }
      return;
    }

    if (!isPlaybackActive) {
      previewAudio.pause();
      return;
    }

    // Guard against stale mute state from cross-media coordination.
    previewAudio.muted = false;
    if (previewAudio.volume <= 0) {
      previewAudio.volume = 1;
    }
    claimGlobalPlaybackAuthority(previewAudio);
    if (previewAudio.paused) {
      void previewAudio.play().catch(() => {
        setIsPlaybackActive(false);
      });
    }
  }, [
    claimGlobalPlaybackAuthority,
    isPlaybackActive,
    isScrubbing,
    playbackMediaSrc,
    playbackTransportDurationSec,
    playheadSec,
    playbackWindow,
    resolveAudibleSeekTarget,
    resolvePlaybackTransportProgress,
  ]);

  useEffect(() => () => {
    const previewAudio = previewAudioRef.current;
    previewAudio?.pause();
    releaseGlobalPlaybackAuthority(previewAudio);
    pauseAuxiliaryMediaPlayback();
  }, [pauseAuxiliaryMediaPlayback, releaseGlobalPlaybackAuthority]);

  useEffect(() => () => {
    const timerId = cutSeekFadeRef.current.timerId;
    if (timerId != null) {
      window.clearTimeout(timerId);
      cutSeekFadeRef.current.timerId = null;
    }
    cutSeekFadeRef.current.token += 1;
  }, []);

  useEffect(() => {
    if (isPlaybackActive) return;
    releaseGlobalPlaybackAuthority(previewAudioRef.current);
  }, [isPlaybackActive, releaseGlobalPlaybackAuthority]);

  useEffect(() => {
    const previewAudio = previewAudioRef.current;
    if (!previewAudio) return;
    previewAudio.playbackRate = isScrubbing ? scrubRate : 1;
  }, [isScrubbing, scrubRate]);

  useEffect(() => {
    if (!isPlaybackActive) return;
    if (transcriptDurationSec <= 0) {
      setIsPlaybackActive(false);
      return;
    }
    if (playbackMediaSrc) return;

    const intervalId = window.setInterval(() => {
      setPlayheadSec((current) => {
        const next = Math.min(roundToTenth(current + SMALL_PLAYHEAD_NUDGE_SEC), transcriptDurationSec);
        const transportProgress = resolvePlaybackTransportProgress(next);
        if (transportProgress.shouldStop) {
          window.clearInterval(intervalId);
          setIsPlaybackActive(false);
          if (playbackWindow?.mode === "roll") {
            setPlaybackWindow(null);
          }
        }
        if (!playbackWindow && transportProgress.nextPlayheadSec >= transcriptDurationSec) {
          window.clearInterval(intervalId);
          setIsPlaybackActive(false);
        }
        return roundToTenth(transportProgress.nextPlayheadSec);
      });
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    isPlaybackActive,
    playbackMediaSrc,
    playbackWindow,
    resolvePlaybackTransportProgress,
    transcriptDurationSec,
  ]);

  useEffect(() => {
    if (!selectedSegmentId) return;
    const selected = editableTranscriptSegments.find((segment) => segment.segment_id === selectedSegmentId);
    if (!selected) return;

    const origin = selectionOriginRef.current;
    if (origin === "system") return;
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
      const midpoint = (selected.start_sec + selected.end_sec) / 2;
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
  }, [editableTranscriptSegments, selectedSegmentId, timelineDurationSec]);

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (event: globalThis.MouseEvent): void => {
      if (event.buttons === 0) {
        endTimelineScrub();
        return;
      }
      seekPlayheadFromScrubClientX(event.clientX);
    };

    const handleMouseUp = (): void => {
      endTimelineScrub();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isScrubbing]);
  useEffect(() => {
    if (!timelineImageDragState) return;

    const handleMouseMove = (event: globalThis.MouseEvent): void => {
      if (event.buttons === 0) {
        setTimelineImageDragState(null);
        return;
      }
      const dragStepSec = event.shiftKey ? IMAGE_PLACEMENT_COARSE_STEP_SEC : IMAGE_PLACEMENT_FINE_STEP_SEC;
      const deltaSec = snapImagePlacementTime(
        (event.clientX - timelineImageDragState.pointerStartX) * timelineImageDragState.pxToSec,
        dragStepSec,
      );
      const originalDuration = Math.max(
        MIN_IMAGE_PLACEMENT_DURATION_SEC,
        roundImagePlacementTime(timelineImageDragState.originEndSec - timelineImageDragState.originStartSec),
      );

      let startSec = timelineImageDragState.originStartSec;
      let endSec = timelineImageDragState.originEndSec;
      if (timelineImageDragState.mode === "move") {
        const tentativeStart = snapImagePlacementTime(timelineImageDragState.originStartSec + deltaSec, dragStepSec);
        const maxStart = Math.max(0, snapImagePlacementTime(timelineDurationSec - originalDuration, dragStepSec));
        startSec = Math.max(0, Math.min(maxStart, tentativeStart));
        endSec = Math.min(timelineDurationSec, snapImagePlacementTime(startSec + originalDuration, dragStepSec));
      } else if (timelineImageDragState.mode === "resize_start") {
        const maxStart = snapImagePlacementTime(
          timelineImageDragState.originEndSec - MIN_IMAGE_PLACEMENT_DURATION_SEC,
          dragStepSec,
        );
        startSec = Math.max(
          0,
          Math.min(
            maxStart,
            snapImagePlacementTime(timelineImageDragState.originStartSec + deltaSec, dragStepSec),
          ),
        );
        endSec = timelineImageDragState.originEndSec;
      } else {
        const minEnd = snapImagePlacementTime(
          timelineImageDragState.originStartSec + MIN_IMAGE_PLACEMENT_DURATION_SEC,
          dragStepSec,
        );
        endSec = Math.max(
          minEnd,
          Math.min(
            timelineDurationSec,
            snapImagePlacementTime(timelineImageDragState.originEndSec + deltaSec, dragStepSec),
          ),
        );
        startSec = timelineImageDragState.originStartSec;
      }

      setImagePlacementDraftWindows((current) => ({
        ...current,
        [timelineImageDragState.placementId]: { startSec, endSec },
      }));
      seekPlayheadToTime(startSec, "playhead", { snapToBoundary: false });
    };

    const handleMouseUp = (): void => {
      const draft = imagePlacementDraftWindowsRef.current[timelineImageDragState.placementId] ?? null;
      if (draft) {
        commitVisualPlacementWindow(timelineImageDragState.placementId, {
          startSec: draft.startSec,
          endSec: draft.endSec,
          label: timelineImageDragState.mode === "move" ? "Move image clip" : "Resize image clip",
        });
      }
      setImagePlacementDraftWindows((current) => {
        if (!current[timelineImageDragState.placementId]) return current;
        const next = { ...current };
        delete next[timelineImageDragState.placementId];
        return next;
      });
      setTimelineImageDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [timelineDurationSec, timelineImageDragState]);
  useEffect(() => {
    if (!previewCanvasDragState) return;

    const handleMouseMove = (event: globalThis.MouseEvent): void => {
      if (event.buttons === 0) {
        setPreviewCanvasDragState(null);
        return;
      }
      const canvasRect = previewSurfaceRef.current?.getBoundingClientRect() ?? null;
      if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) return;
      const deltaXPct = ((event.clientX - previewCanvasDragState.pointerStartX) / canvasRect.width) * 100;
      const deltaYPct = ((event.clientY - previewCanvasDragState.pointerStartY) / canvasRect.height) * 100;
      if (previewCanvasDragState.mode === "move") {
        updateImagePlacementTransform(previewCanvasDragState.placementId, (current) => ({
          ...current,
          leftPct: previewCanvasDragState.origin.leftPct + deltaXPct,
          topPct: previewCanvasDragState.origin.topPct + deltaYPct,
        }));
        return;
      }
      const safeAspectRatio = Number.isFinite(previewCanvasDragState.originAspectRatio)
        && previewCanvasDragState.originAspectRatio > 0
        ? previewCanvasDragState.originAspectRatio
        : previewCanvasDragState.origin.widthPct / Math.max(1, previewCanvasDragState.origin.heightPct);
      const dominantDeltaPct = Math.abs(deltaXPct) >= Math.abs(deltaYPct * safeAspectRatio)
        ? deltaXPct
        : deltaYPct * safeAspectRatio;
      const maxWidthPct = Math.min(92, 100 - previewCanvasDragState.origin.leftPct);
      const maxHeightPct = Math.min(92, 100 - previewCanvasDragState.origin.topPct);
      const maxWidthFromHeight = maxHeightPct * safeAspectRatio;
      const nextWidthPct = clampNumber(
        previewCanvasDragState.origin.widthPct + dominantDeltaPct,
        8,
        Math.min(maxWidthPct, maxWidthFromHeight),
      );
      const nextHeightPct = clampNumber(nextWidthPct / safeAspectRatio, 8, maxHeightPct);
      updateImagePlacementTransform(previewCanvasDragState.placementId, (current) => ({
        ...current,
        widthPct: nextWidthPct,
        heightPct: nextHeightPct,
      }));
    };

    const handleMouseUp = (): void => {
      const draft = imagePlacementTransforms[previewCanvasDragState.placementId] ?? null;
      if (draft) {
        commitImagePlacementTransform(previewCanvasDragState.placementId, draft, "Adjust visual overlay geometry");
      }
      setImagePlacementTransforms((current) => {
        if (!current[previewCanvasDragState.placementId]) return current;
        const next = { ...current };
        delete next[previewCanvasDragState.placementId];
        return next;
      });
      setPreviewCanvasDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [commitImagePlacementTransform, imagePlacementTransforms, previewCanvasDragState]);

  async function refreshSourceDeskMedia(): Promise<void> {
    setSourceDeskLoading(true);
    setSourceDeskError(null);
    try {
      const [mediaFiles, selection] = await Promise.all([
        listWorkpieceStoredMedia(launchContext.workpiece_id),
        loadIntroOutroSelection(launchContext.workpiece_id),
      ]);
      setStoredMediaFiles(mediaFiles);
      setIntroOutroSelection(selection ?? {
        schema_version: 1,
        intro_asset_id: null,
        outro_asset_id: null,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      setSourceDeskError(error instanceof Error ? error.message : "Hammer could not load Source Desk media.");
    } finally {
      setSourceDeskLoading(false);
    }
  }

  useEffect(() => {
    void refreshSourceDeskMedia();
    // launchContext workpiece is the canonical scope boundary for stored media.
  }, [launchContext.workpiece_id]);

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

  useHammerWorkspaceShellSourceDeskPreviews({
    workpieceId: launchContext.workpiece_id,
    previewPaths: sourceDeskPreviewFetchPaths,
    requestedPreviewPathCount: sourceDeskPreviewPaths.length,
    fetchKey: sourceDeskPreviewFetchKey,
    maxItems: SOURCE_DESK_PREVIEW_MAX_ITEMS,
    concurrency: SOURCE_DESK_PREVIEW_FETCH_CONCURRENCY,
    loadWorkpieceMediaPreviewUrl,
    readHammerMediaPreviewErrorDiagnostics,
    normalizeWorkpieceRelativePath,
    setPreviewUrls: setSourceDeskPreviewUrls,
    setPreviewFailures: setSourceDeskPreviewFailures,
    previewUrls: sourceDeskPreviewUrls,
  });

  async function handleSourceDeskUpload(
    category: "images" | "broll" | "introoutro",
    fileList: FileList | null,
  ): Promise<void> {
    const file = fileList?.[0] ?? null;
    if (!file) return;
    setUploadingCategory(category);
    setSourceDeskError(null);
    try {
      await uploadWorkpieceMediaFile({
        workpieceId: launchContext.workpiece_id,
        file,
        category,
      });
      await refreshSourceDeskMedia();
    } catch (error) {
      setSourceDeskError(error instanceof Error ? error.message : "Hammer could not upload the selected file.");
    } finally {
      setUploadingCategory(null);
    }
  }

  async function persistIntroOutroSelection(next: HammerIntroOutroSelection): Promise<void> {
    setSavingIntroOutro(true);
    setSourceDeskError(null);
    try {
      await saveIntroOutroSelection({
        workpieceId: launchContext.workpiece_id,
        selection: next,
      });
      setIntroOutroSelection(next);
    } catch (error) {
      setSourceDeskError(error instanceof Error ? error.message : "Hammer could not save intro/outro selection.");
    } finally {
      setSavingIntroOutro(false);
    }
  }

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
    updateSegmentTiming(
      segmentId,
      "Trim segment start",
      (segment) => trimSegmentStartTiming(segment, deltaSec),
      (current) => Math.max(0, roundToTenth(current + deltaSec)),
    );
  }

  function trimSegmentEnd(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(segmentId, "Trim segment end", (segment) => trimSegmentEndTiming(segment, deltaSec));
  }

  function seekPlayheadToTime(
    nextTimeSec: number,
    origin: "timeline" | "playhead" = "timeline",
    options?: { snapToBoundary?: boolean },
  ): void {
    const clamped = Math.max(0, Math.min(timelineDurationSec, roundToTenth(nextTimeSec)));
    const snapped = options?.snapToBoundary === false
      ? clamped
      : snapPlayheadToBoundary({
        nextPlayheadSec: clamped,
        boundaryTimesSec: playheadBoundaryTimesSec,
        toleranceSec: PLAYHEAD_SNAP_TOLERANCE_SEC,
      });
    const audibleTarget = resolveAudibleSeekTarget(snapped);
    selectionOriginRef.current = origin;
    setPlayheadSec(roundToTenth(audibleTarget ?? playbackTransportDurationSec));
    setFocusOverride(resolveFocusAfterPlayheadChange(focusOverride));
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
    if (args.operationId) {
      const existing = editableAudioPolishRef.current?.audio_edit?.operations ?? [];
      if (existing.some((op) => op.id === args.operationId)) {
        return false;
      }
    }
    const committed = commitAudioCutSelection({
      audioPolish: editableAudioPolishRef.current,
      selection: {
        startSec: args.startSec,
        endSec: args.endSec,
      },
      durationSec: playbackTransportDurationSec,
      operationId: args.operationId,
    });
    if (!committed) {
      return false;
    }

    audioPolishHasLocalEditsRef.current = true;
    editableAudioPolishRef.current = committed.audioPolish;
    setEditableAudioPolish(committed.audioPolish);
    setFocusOverride("time-focus");
    return true;
  }

  function commitAudioCuts(
    selections: Array<{ startSec: number; endSec: number }>,
    options?: { operationIdPrefix?: string },
  ): number {
    if (!Array.isArray(selections) || selections.length === 0) return 0;
    let appliedCount = 0;
    for (let index = 0; index < selections.length; index += 1) {
      const selection = selections[index];
      const operationId = options?.operationIdPrefix
        ? `${options.operationIdPrefix}:${index}`
        : undefined;
      const applied = commitEditableAudioCut({
        startSec: selection.startSec,
        endSec: selection.endSec,
        operationId,
      });
      if (applied) {
        appliedCount += 1;
      }
    }
    return appliedCount;
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

  function resolvePlaybackWindowProgress(nextTimeSec: number): {
    nextPlayheadSec: number;
    shouldLoop: boolean;
    shouldStop: boolean;
  } {
    const clamped = Math.max(0, Math.min(timelineDurationSec, roundToTenth(nextTimeSec)));
    if (!playbackWindow) {
      return {
        nextPlayheadSec: clamped,
        shouldLoop: false,
        shouldStop: false,
      };
    }

    const windowStart = Math.max(0, Math.min(timelineDurationSec, roundToTenth(playbackWindow.startSec)));
    const windowEnd = Math.max(windowStart, Math.min(timelineDurationSec, roundToTenth(playbackWindow.endSec)));
    if (clamped < windowStart) {
      return {
        nextPlayheadSec: windowStart,
        shouldLoop: false,
        shouldStop: false,
      };
    }
    if (clamped >= windowEnd) {
      if (playbackWindow.mode === "loop") {
        return {
          nextPlayheadSec: windowStart,
          shouldLoop: true,
          shouldStop: false,
        };
      }
      return {
        nextPlayheadSec: windowEnd,
        shouldLoop: false,
        shouldStop: true,
      };
    }

    return {
      nextPlayheadSec: clamped,
      shouldLoop: false,
      shouldStop: false,
    };
  }

  function resolveSelectionPlaybackRange(args: { preRollSec: number; postRollSec: number; labelPrefix: string }): HammerPlaybackWindow | null {
    if (!activeTranscriptTargetRange) return null;
    const startSec = Math.max(0, roundToTenth(activeTranscriptTargetRange.startSec - args.preRollSec));
    const endSec = Math.min(timelineDurationSec, roundToTenth(activeTranscriptTargetRange.endSec + args.postRollSec));
    if (endSec <= startSec) return null;
    return {
      mode: "roll",
      startSec,
      endSec,
      label: `${args.labelPrefix} ${activeTranscriptTargetRange.label}`,
    };
  }

  function jumpToSelectionBoundary(boundary: "start" | "end"): void {
    if (!activeTranscriptTargetRange) {
      setTranscriptTimingHint("Select one or more segments to jump to selection boundaries.");
      return;
    }
    setTranscriptTimingHint(null);
    seekPlayheadToTime(boundary === "start" ? activeTranscriptTargetRange.startSec : activeTranscriptTargetRange.endSec, "playhead");
  }

  function jumpToEditPoint(direction: "previous" | "next"): void {
    if (playheadBoundaryTimesSec.length === 0) return;
    const target = resolveAdjacentJumpPointTime({
      jumpPointsSec: playheadBoundaryTimesSec,
      playheadSec,
      direction,
    });
    seekPlayheadToTime(target, "playhead");
  }

  function addMarkerAtPlayhead(): void {
    const markerTimeSec = roundToTenth(playheadSec);
    const markerAtTime = timelineMarkers.find((marker) => marker.timeSec === markerTimeSec) ?? null;
    if (markerAtTime) {
      setTranscriptTimingHint(`Marker already exists at ${markerTimeSec.toFixed(1)}s.`);
      return;
    }

    setTimelineMarkers((current) => {
      const nextIndex = current.length + 1;
      return [
        ...current,
        {
          id: createTimelineMarkerId(),
          label: `M${nextIndex}`,
          timeSec: markerTimeSec,
        },
      ];
    });
    setTranscriptTimingHint(`Added marker at ${markerTimeSec.toFixed(1)}s.`);
  }

  function removeMarker(markerId: string): void {
    setTimelineMarkers((current) => current.filter((marker) => marker.id !== markerId));
  }

  function jumpToMarker(direction: "previous" | "next"): void {
    if (markerTimesSec.length === 0) {
      setTranscriptTimingHint("No timeline markers are set.");
      return;
    }
    const target = resolveAdjacentJumpPointTime({
      jumpPointsSec: markerTimesSec,
      playheadSec,
      direction,
    });
    seekPlayheadToTime(target, "playhead");
    setTranscriptTimingHint(null);
  }

  function jumpToMarkerById(markerId: string): void {
    const marker = sortedTimelineMarkers.find((item) => item.id === markerId) ?? null;
    if (!marker) return;
    seekPlayheadToTime(marker.timeSec, "playhead");
    setTranscriptTimingHint(null);
  }

  function toggleSelectionLoopPlayback(): void {
    if (isLoopPlaybackActive) {
      setPlaybackWindow(null);
      setTranscriptTimingHint("Loop playback disabled.");
      return;
    }
    if (!playbackMediaSrc) {
      setTranscriptTimingHint("Mapped media unavailable. Check workspace media mapping or source media link.");
      return;
    }
    if (!activeTranscriptTargetRange) {
      setTranscriptTimingHint("Select one or more segments to loop playback.");
      return;
    }

    const nextWindow: HammerPlaybackWindow = {
      mode: "loop",
      startSec: activeTranscriptTargetRange.startSec,
      endSec: activeTranscriptTargetRange.endSec,
      label: activeTranscriptTargetRange.label,
    };

    setPlaybackWindow(nextWindow);
    seekPlayheadToTime(nextWindow.startSec, "playhead");
    setIsPlaybackActive(true);
    setFocusOverride("time-focus");
    setTranscriptTimingHint(null);
  }

  function playSelectionWithRoll(): void {
    if (!playbackMediaSrc) {
      setTranscriptTimingHint("Mapped media unavailable. Check workspace media mapping or source media link.");
      return;
    }
    const nextWindow = resolveSelectionPlaybackRange({
      preRollSec: PRE_ROLL_SEC,
      postRollSec: POST_ROLL_SEC,
      labelPrefix: "Pre/Post Roll",
    });
    if (!nextWindow) {
      setTranscriptTimingHint("Select one or more segments to audition with pre/post roll.");
      return;
    }

    setPlaybackWindow(nextWindow);
    seekPlayheadToTime(nextWindow.startSec, "playhead", { snapToBoundary: false });
    setIsPlaybackActive(true);
    setFocusOverride("time-focus");
    setTranscriptTimingHint(null);
  }

  function seekPlayheadFromScrubClientX(clientX: number): void {
    const rect = scrubRectRef.current;
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekPlayheadToTime(ratio * timelineDurationSec, "playhead", { snapToBoundary: false });
  }

  function beginTimelineScrub(event: MouseEvent<HTMLElement>): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".hammer-timeline-block")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    event.preventDefault();
    scrubRectRef.current = { left: rect.left, width: rect.width };
    scrubAutoPlayRef.current = false;
    scrubReturnToPausedRef.current = !isPlaybackActive;
    setFocusOverride("time-focus");
    setIsScrubbing(true);
    seekPlayheadFromScrubClientX(event.clientX);

    if (!isPlaybackActive && playbackMediaSrc && previewAudioRef.current) {
      const previewAudio = previewAudioRef.current;
      claimGlobalPlaybackAuthority(previewAudio);
      previewAudio.playbackRate = scrubRate;
      void previewAudio.play()
        .then(() => {
          scrubAutoPlayRef.current = true;
        })
        .catch(() => {
          scrubAutoPlayRef.current = false;
          releaseGlobalPlaybackAuthority(previewAudio);
        });
    }
  }

  function endTimelineScrub(): void {
    setIsScrubbing(false);
    scrubRectRef.current = null;
    if (previewAudioRef.current) {
      previewAudioRef.current.playbackRate = 1;
    }
    if (scrubAutoPlayRef.current && scrubReturnToPausedRef.current) {
      previewAudioRef.current?.pause();
      releaseGlobalPlaybackAuthority(previewAudioRef.current);
      setIsPlaybackActive(false);
    }
    scrubAutoPlayRef.current = false;
    scrubReturnToPausedRef.current = false;
  }

  function splitSelectedSegmentAtPlayhead(): void {
    if (!selectedSegmentId) {
      setTranscriptTimingHint("Select a segment to split.");
      return;
    }

    const applied = applyHistoryMutation({
      label: "Split segment at playhead",
      kind: "segment_structure",
      affectedSegments: [selectedSegmentId],
      immediatePersist: true,
      computeAfter: (before) => {
        const boundaries = resolveTimelineBoundaryTimes(before.transcriptSegments);
        const snappedPlayhead = snapPlayheadToBoundary({
          nextPlayheadSec: before.playheadSec,
          boundaryTimesSec: boundaries,
          toleranceSec: PLAYHEAD_SNAP_TOLERANCE_SEC,
        });
        const split = splitSegmentAtTime(before.transcriptSegments, selectedSegmentId, snappedPlayhead);
        if (!split.changed || split.splitSec == null) return before;
        return {
          ...before,
          transcriptSegments: split.segments,
          selectedSegmentId: split.rightSegmentId ?? split.leftSegmentId ?? before.selectedSegmentId,
          playheadSec: split.splitSec,
          transcriptTimingHint: null,
        };
      },
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

    const applied = applyHistoryMutation({
      label: "Delete segment and ripple",
      kind: "segment_structure",
      affectedSegments: [selectedSegmentId],
      immediatePersist: true,
      computeAfter: (before) => {
        const deleted = deleteSegmentAndRipple(before.transcriptSegments, selectedSegmentId);
        if (!deleted.changed || !deleted.removedSegment) return before;

        const fallbackSelection = resolveSelectedSegmentAfterDelete({
          segmentsAfterDelete: deleted.segments,
          removedIndex: deleted.removedIndex,
        });
        const nextSelection = before.selectedSegmentId === selectedSegmentId
          ? fallbackSelection
          : before.selectedSegmentId;

        return {
          ...before,
          transcriptSegments: deleted.segments,
          selectedSegmentId: nextSelection,
          playheadSec: resolvePlayheadAfterDelete(before.playheadSec, deleted.removedSegment, deleted.shiftSec),
          transcriptTimingHint: null,
        };
      },
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
    selectionOriginRef.current = "timeline";
    setSelectedSegmentId(nextSegmentId);
    setTranscriptSelectionAnchorSegmentId(nextSegmentId);
    setTranscriptSelectionFocusSegmentId(nextSegmentId);
    if (nextSegment) {
      seekPlayheadToTime(nextSegment.start_sec, "playhead");
    }
    setFocusOverride("time-focus");
  }

  function nudgePlayhead(deltaSec: number): void {
    seekPlayheadToTime(playheadSec + deltaSec, "playhead");
  }

  function toggleSelectedSegmentDisabled(): void {
    if (!selectedSegmentId) {
      setTranscriptTimingHint("Select a segment to disable.");
      return;
    }

    applyHistoryMutation({
      label: "Toggle segment disable",
      kind: "segment_structure",
      affectedSegments: [selectedSegmentId],
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        transcriptSegments: updateSegmentInTimeline(
          before.transcriptSegments,
          selectedSegmentId,
          (segment) => toggleSegmentDisabled(segment),
        ),
        transcriptTimingHint: null,
      }),
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

  function applyStudioSoundProfile(): void {
    applyStudioRackMutation("Apply Studio Sound", (current) => ({
      ...current,
      is_enabled: true,
      is_bypassed: false,
      modules: {
        ...current.modules,
        compressor: {
          ...current.modules.compressor,
          is_enabled: true,
          is_bypassed: false,
          threshold_db: -23,
          ratio: 2.2,
          makeup_gain_db: 2,
        },
        eq: {
          ...current.modules.eq,
          is_enabled: true,
          is_bypassed: false,
          low_shelf_gain_db: -1.2,
          mid_gain_db: 1.6,
          high_shelf_gain_db: 1,
        },
        tubeMicCharacter: {
          ...current.modules.tubeMicCharacter,
          is_enabled: true,
          is_bypassed: false,
          amount: 0.24,
          warmth: 0.32,
          air: 0.18,
        },
      },
    }));
    applyPodcastMasterPass();
    setAudioFinalizationCompareMode("after");
  }

  function setAudioFinalizationCompare(nextMode: HammerAudioFinalizationCompareMode): void {
    setAudioFinalizationCompareMode(nextMode);
    setStudioRackBypassed(nextMode === "before");
  }

  function updateAudioFinalizationWarmth(nextPercent: number): void {
    applyStudioRackMutation("Adjust warmth", (current) => ({
      ...current,
      modules: {
        ...current.modules,
        tubeMicCharacter: {
          ...current.modules.tubeMicCharacter,
          is_enabled: true,
          is_bypassed: false,
          warmth: percentToScale(nextPercent, -1, 1),
          amount: clampNumber(0.18 + (nextPercent / 100) * 0.2, 0, 1),
        },
      },
    }));
  }

  function updateAudioFinalizationPresence(nextPercent: number): void {
    applyStudioRackMutation("Adjust presence", (current) => ({
      ...current,
      modules: {
        ...current.modules,
        eq: {
          ...current.modules.eq,
          is_enabled: true,
          is_bypassed: false,
          mid_gain_db: percentToScale(nextPercent, -6, 6),
        },
      },
    }));
  }

  function updateAudioFinalizationHarshness(nextPercent: number): void {
    applyStudioRackMutation("Adjust harshness", (current) => ({
      ...current,
      modules: {
        ...current.modules,
        eq: {
          ...current.modules.eq,
          is_enabled: true,
          is_bypassed: false,
          high_shelf_gain_db: percentToScale(nextPercent, -8, 4),
        },
      },
    }));
  }

  function updateAudioFinalizationOutputLevel(nextPercent: number): void {
    applyStudioRackMutation("Adjust output level", (current) => ({
      ...current,
      modules: {
        ...current.modules,
        compressor: {
          ...current.modules.compressor,
          is_enabled: true,
          is_bypassed: false,
          makeup_gain_db: percentToScale(nextPercent, -6, 12),
        },
      },
    }));
  }

  function applyTranscriptSelection(segmentId: string, extendRange: boolean): void {
    const segment = editableTranscriptSegments.find((item) => item.segment_id === segmentId) ?? null;
    if (!segment) return;

    if (extendRange && transcriptSelectionAnchorSegmentId) {
      setTranscriptSelectionFocusSegmentId(segmentId);
    } else {
      setTranscriptSelectionAnchorSegmentId(segmentId);
      setTranscriptSelectionFocusSegmentId(segmentId);
    }
    selectionOriginRef.current = "transcript";
    setFocusOverride("source-focus");
    setSelectedSegmentId(segmentId);
    setTranscriptTimingHint(null);
    seekPlayheadToTime(segment.start_sec, "playhead");
  }

  function clearTranscriptSelection(): void {
    setTranscriptSelectionAnchorSegmentId(null);
    setTranscriptSelectionFocusSegmentId(null);
    setTranscriptTimingHint(null);
  }

  function disableTranscriptSelection(): void {
    if (!hasTranscriptSelection) {
      setTranscriptTimingHint("Select transcript segments to disable.");
      return;
    }

    const selectedIdSet = new Set(transcriptSelectionRange.segmentIds);
    const selectedSegments = editableTranscriptSegments.filter((segment) => selectedIdSet.has(segment.segment_id));
    const targetDisabled = !selectedSegments.every((segment) => segment.is_disabled === true);

    applyHistoryMutation({
      label: targetDisabled ? "Disable transcript selection" : "Enable transcript selection",
      kind: "segment_structure",
      affectedSegments: transcriptSelectionRange.segmentIds,
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        transcriptSegments: before.transcriptSegments.map((segment) => (
          selectedIdSet.has(segment.segment_id)
            ? { ...segment, is_disabled: targetDisabled }
            : segment
        )),
        transcriptTimingHint: null,
      }),
    });
  }

  function cutTranscriptSelection(): void {
    if (!hasTranscriptSelection) {
      setTranscriptTimingHint("Select transcript segments to cut.");
      return;
    }

    const applied = applyHistoryMutation({
      label: "Cut transcript selection",
      kind: "segment_structure",
      affectedSegments: transcriptSelectionRange.segmentIds,
      immediatePersist: true,
      computeAfter: (before) => {
        const cut = cutSegmentRangeAndRipple({
          segments: before.transcriptSegments,
          segmentIds: transcriptSelectionRange.segmentIds,
        });
        if (!cut.changed || cut.removedStartSec == null || cut.removedEndSec == null) return before;
        const authorityInstruction = createRippleDeleteInstruction({
          segmentId: transcriptSelectionRange.segmentIds[0] ?? before.selectedSegmentId ?? "segment:unknown",
          startSec: cut.removedStartSec,
          endSec: cut.removedEndSec,
        });
        const withRippleDelete = appendAuthorityInstructionForState(before, authorityInstruction);
        const rippleDeleteOperationId = withRippleDelete.operations.at(-1)?.operation_id ?? null;
        const remapped = rippleDeleteOperationId
          ? remapResolvedBrollOperationsForRippleDelete({
            graph: withRippleDelete,
            rippleDeleteOperationId,
            removedStartSec: cut.removedStartSec,
            removedEndSec: cut.removedEndSec,
          })
          : {
            graph: withRippleDelete,
            summary: {
              adjustedOperationIds: [] as string[],
              removedOperationIds: [] as string[],
              attentionOperationIds: [] as string[],
              adjustedDuckOperationIds: [] as string[],
              removedDuckOperationIds: [] as string[],
              orphanedDuckOperationIds: [] as string[],
              adjustedTransitionOperationIds: [] as string[],
              removedTransitionOperationIds: [] as string[],
              degradedTransitionOperationIds: [] as string[],
            },
          };

        const nextSelection = resolveSelectedSegmentAfterDelete({
          segmentsAfterDelete: cut.segments,
          removedIndex: cut.removedStartIndex,
        });
        const nextState = {
          ...before,
          transcriptSegments: cut.segments,
          editorialAuthorityGraph: remapped.graph,
          selectedSegmentId: nextSelection,
          playheadSec: resolvePlayheadAfterRangeCut({
            playheadSec: before.playheadSec,
            removedStartSec: cut.removedStartSec,
            removedEndSec: cut.removedEndSec,
            shiftSec: cut.shiftSec,
          }),
          transcriptTimingHint: null,
        };
        return replaceVisualTimelineState(nextState, (timeline) => ({
          ...timeline,
          clips: timeline.clips.flatMap((clip) => {
            const operationId = clip.authority_operation_id;
            if (!operationId) return [clip];
            if (remapped.summary.removedOperationIds.includes(operationId)) {
              return [];
            }
            if (!remapped.summary.adjustedOperationIds.includes(operationId)) {
              return [clip];
            }
            const placementRemap = remapPlacementForRippleDelete({
              startSec: clip.start_sec,
              endSec: clip.end_sec,
              removedStartSec: cut.removedStartSec ?? 0,
              removedEndSec: cut.removedEndSec ?? 0,
            });
            if (placementRemap.kind === "removed") {
              return [];
            }
            return [{
              ...clip,
              start_sec: placementRemap.startSec,
              end_sec: placementRemap.endSec,
              placement_status: placementRemap.needsAttention ? "uncertain" : clip.placement_status,
              uncertainty_flags: placementRemap.needsAttention
                ? Array.from(new Set([...clip.uncertainty_flags, "timeline_remap_review"]))
                : [...clip.uncertainty_flags],
            }];
          }),
          lanes: timeline.lanes.map((lane) => ({
            ...lane,
            clip_ids: lane.clip_ids.filter((clipId) => (
              !remapped.summary.removedOperationIds.includes(
                timeline.clips.find((clip) => clip.clip_id === clipId)?.authority_operation_id ?? "",
              )
            )),
          })),
          selected_clip_id: timeline.selected_clip_id
            && remapped.summary.removedOperationIds.includes(
              timeline.clips.find((clip) => clip.clip_id === timeline.selected_clip_id)?.authority_operation_id ?? "",
            )
            ? null
            : timeline.selected_clip_id,
        }));
      },
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
    setActiveTool("polish");
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

  function resolveCandidateSuggestedCut(card: HammerCandidateCard): { startSec: number; endSec: number } | null {
    if (!card) return null;
    const ids = card.apply.removeSegmentIds.length > 0 ? card.apply.removeSegmentIds : card.segmentIds;
    if (ids.length === 0) return null;
    let startSec: number | null = null;
    let endSec: number | null = null;
    for (const segmentId of ids) {
      const segment = transcriptSegmentsById.get(segmentId) ?? null;
      if (!segment) continue;
      const segStart = Number(segment.start_sec);
      const segEnd = Number(segment.end_sec);
      if (!Number.isFinite(segStart) || !Number.isFinite(segEnd)) continue;
      startSec = startSec == null ? segStart : Math.min(startSec, segStart);
      endSec = endSec == null ? segEnd : Math.max(endSec, segEnd);
    }
    if (startSec == null || endSec == null) return null;
    if (endSec <= startSec) return null;
    return { startSec: roundToTenth(startSec), endSec: roundToTenth(endSec) };
  }

  function resolveCandidateCutOverride(card: HammerCandidateCard): { startSec: number; endSec: number } | null {
    const enabled = candidateCutEnabledById[card.id] === true;
    if (!enabled) return null;
    const draft = candidateCutDraftById[card.id] ?? null;
    if (!draft) return null;
    const normalized = normalizeAudioCutSelection({
      selection: {
        startSec: Number(draft.startSec),
        endSec: Number(draft.endSec),
      },
      durationSec: playbackTransportDurationSec,
    });
    return normalized ? { startSec: normalized.startSec, endSec: normalized.endSec } : null;
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
    setCandidateEditModeById({});
    setCandidateProposedTextById({});
    setCandidateCutEnabledById({});
    setCandidateCutDraftById({});
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
    options?: { useEditedProposal?: boolean; editedProposalText?: string | null; cutOverride?: { startSec: number; endSec: number } | null },
  ): void {
    setActiveReviewKind(kind);
    const card = kind === "retakes" ? activeRetakeCandidateCard : activeFillerCandidateCard;
    if (!card) return;
    if (candidateDecisionInFlightRef.current[kind]) return;
    if (lastHandledCandidateIdRef.current[card.kind] === card.id) return;

    candidateDecisionInFlightRef.current[kind] = true;
    lastHandledCandidateIdRef.current[card.kind] = card.id;
    if (kind === "fillers") setFillerDecisionInFlight(true);
    else setRetakeDecisionInFlight(true);

    try {
      handledCandidateIdsRef.current[card.kind].add(card.id);
      const preserveIndex = kind === "retakes" ? retakeActiveCandidateIndex : fillerActiveCandidateIndex;

      const beforeState = captureWorkspaceState();
      let nextSegments = beforeState.transcriptSegments;

      if (approve) {
        const useEdited = options?.useEditedProposal === true;
        const editedTextRaw = options?.editedProposalText ?? null;
        const editedText = editedTextRaw != null ? String(editedTextRaw) : null;
        const editedTrimmed = editedText != null ? editedText.trim() : null;
        const keepSegmentId = card.segmentIds[card.segmentIds.length - 1] ?? null;

        const approvePlan = (() => {
          if (!useEdited || editedTrimmed == null) {
            return {
              removeSegmentIds: card.apply.removeSegmentIds,
              updateSegments: card.apply.updateSegments,
            };
          }

          if (kind === "retakes") {
            if (!keepSegmentId) return null;
            if (!editedTrimmed) {
              setTranscriptTimingHint("Edited proposal cannot be empty for a retake approval.");
              return null;
            }
            return {
              removeSegmentIds: card.apply.removeSegmentIds,
              updateSegments: [{ segmentId: keepSegmentId, text: editedTrimmed }],
            };
          }

          if (!editedTrimmed) {
            return {
              removeSegmentIds: [card.primarySegmentId],
              updateSegments: [],
            };
          }

          return {
            removeSegmentIds: [],
            updateSegments: [{ segmentId: card.primarySegmentId, text: editedTrimmed }],
          };
        })();

        if (!approvePlan) {
          candidateDecisionInFlightRef.current[kind] = false;
          if (kind === "fillers") setFillerDecisionInFlight(false);
          else setRetakeDecisionInFlight(false);
          return;
        }

        const computeAfter = (before: HammerEditorStateSerializable): HammerEditorStateSerializable => {
          let updatedSegments = before.transcriptSegments.filter((segment) => (
            !approvePlan.removeSegmentIds.includes(segment.segment_id)
          ));
          for (const update of approvePlan.updateSegments) {
            updatedSegments = updateSegmentInTimeline(updatedSegments, update.segmentId, (segment) => ({
              ...segment,
              text: update.text ?? segment.text,
            }));
          }
          const synced = syncEditableTranscriptSegments(updatedSegments, before.selectedSegmentId);
          return {
            ...before,
            transcriptSegments: synced.segments,
            selectedSegmentId: synced.selectedSegmentId,
            transcriptTimingHint: null,
          };
        };

        const applied = applyHistoryMutation({
          label: card.kind === "fillers" ? "Approve filler removal" : "Approve retake removal",
          kind: "cleanup_tool",
          toolId: "polish",
          affectedSegments: card.segmentIds,
          immediatePersist: true,
          computeAfter,
        });
        if (!applied) return;

        const cutOverride = options?.cutOverride ?? null;
        let committedCutCount = 0;
        if (cutOverride) {
          committedCutCount = 1;
          commitAudioCuts([cutOverride], { operationIdPrefix: `cleanup:${card.kind}:${card.id}:override` });
        } else {
          const cutSelections = deriveAudioCutsForRemovedSegments({
            segments: beforeState.transcriptSegments,
            removeSegmentIds: approvePlan.removeSegmentIds,
            durationSec: playbackTransportDurationSec,
            ...(kind === "fillers"
              ? {
                padBeforeSec: HAMMER_FILLER_CUT_PAD_BEFORE_SEC,
                padAfterSec: HAMMER_FILLER_CUT_PAD_AFTER_SEC,
              }
              : {}),
          });
          committedCutCount = cutSelections.length;
          commitAudioCuts(cutSelections, { operationIdPrefix: `cleanup:${card.kind}:${card.id}` });
        }
        setCandidateReceiptByKind((current) => ({
          ...current,
          [card.kind]: committedCutCount === 0
            ? "Applied transcript cleanup only (audio unchanged). To change playback, enable a Cut Span and commit time coordinates."
            : `Applied transcript cleanup + ${committedCutCount} timeline cut${committedCutCount === 1 ? "" : "s"}.`,
        }));
        nextSegments = computeAfter(cloneEditorState(beforeState)).transcriptSegments;
      } else {
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
      commitAudioCuts(cutSelections, { operationIdPrefix: `dead_air:${analysis.thresholdSec.toFixed(1)}` });

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
          return {
            ...before,
            transcriptSegments: synced.segments,
            selectedSegmentId: synced.selectedSegmentId,
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
    if (currentPass === "image_placement") return;
    setTimelineImageDragState(null);
    setPreviewCanvasDragState(null);
    setImagePlacementDraftWindows({});
  }, [currentPass]);
  useEffect(() => {
    setAudioFinalizationCompareMode(editableStudioRack.is_bypassed ? "before" : "after");
  }, [editableStudioRack.is_bypassed]);
  useEffect(() => () => {
    if (copiedPromptTimerRef.current != null) {
      window.clearTimeout(copiedPromptTimerRef.current);
      copiedPromptTimerRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (packagingLogoAssetPath) return;
    const preferred = packagingLogoPlacement?.asset_path
      ?? sourceImageLibraryItems[0]?.path
      ?? null;
    if (!preferred) return;
    setPackagingLogoAssetPath(preferred);
  }, [packagingLogoAssetPath, packagingLogoPlacement?.asset_path, sourceImageLibraryItems]);
  useEffect(() => {
    if (!packagingLogoPlacement) return;
    const positionFlag = packagingLogoPlacement.uncertainty_flags.find((flag) => flag.startsWith("logo_position:")) ?? null;
    const sizeFlag = packagingLogoPlacement.uncertainty_flags.find((flag) => flag.startsWith("logo_size:")) ?? null;
    const nextPosition = positionFlag?.slice("logo_position:".length) as HammerLogoOverlayPosition | undefined;
    const nextSize = sizeFlag?.slice("logo_size:".length) as HammerLogoOverlaySize | undefined;
    if (nextPosition && LOGO_POSITION_OPTIONS.some((option) => option.id === nextPosition)) {
      setPackagingLogoPosition(nextPosition);
    }
    if (nextSize && LOGO_SIZE_OPTIONS.some((option) => option.id === nextSize)) {
      setPackagingLogoSize(nextSize);
    }
    if (packagingLogoPlacement.asset_path) {
      setPackagingLogoAssetPath(packagingLogoPlacement.asset_path);
    }
  }, [packagingLogoPlacement]);
  useEffect(() => {
    if (thumbnailPromptDraft.trim().length > 0) return;
    const sourceText = selectedSegment?.text
      ?? editableTranscriptSegments[0]?.text
      ?? "podcast episode cover concept";
    setThumbnailPromptDraft(`Thumbnail: bold podcast cover frame for "${sourceText}".`);
  }, [editableTranscriptSegments, selectedSegment?.text, thumbnailPromptDraft]);
  useEffect(() => {
    if (!imageAnimationContextMenu) return;
    const closeMenu = (): void => setImageAnimationContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setImageAnimationContextMenu(null);
    };
    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [imageAnimationContextMenu]);
  useEffect(() => {
    if (currentPass === "image_animation") return;
    setImageAnimationContextMenu(null);
  }, [currentPass]);
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
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    if (event.deltaY < 0) {
      zoomTimelineIn();
      return;
    }
    zoomTimelineOut();
  }, [zoomTimelineIn, zoomTimelineOut]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) return;
      if (isTextEditingTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key;
      const lower = key.toLowerCase();

      const isTimelineZoomInKey = event.code === "NumpadAdd" || key === "+" || key === "=";
      const isTimelineZoomOutKey = event.code === "NumpadSubtract" || key === "-" || key === "_";
      if (isTimelineZoomInKey || isTimelineZoomOutKey) {
        event.preventDefault();
        if (isTimelineZoomInKey) {
          zoomTimelineIn();
        } else {
          zoomTimelineOut();
        }
        return;
      }

      if (isTranscriptCandidateReviewPass) {
        if (!event.shiftKey && (key === "1" || key === "2")) {
          if (event.repeat) return;
          event.preventDefault();
          const nextKind = key === "1" ? "fillers" : "retakes";
          setActiveReviewKind(nextKind);
          setActiveTranscriptToolSection(nextKind);
          setFocusOverride("tool-focus");
          return;
        }

        if (!event.shiftKey && (lower === "j" || lower === "k")) {
          event.preventDefault();
          const kind = activeReviewKind;
          if (kind === "fillers") {
            const length = fillerCandidateCards.length;
            if (length <= 1) return;
            setFillerActiveCandidateIndex((previous) => clampActiveCandidateIndex(
              previous + (lower === "j" ? 1 : -1),
              length,
            ));
          } else {
            const length = retakeCandidateCards.length;
            if (length <= 1) return;
            setRetakeActiveCandidateIndex((previous) => clampActiveCandidateIndex(
              previous + (lower === "j" ? 1 : -1),
              length,
            ));
          }
          setFocusOverride("tool-focus");
          return;
        }

        if (!event.shiftKey && (lower === "a" || lower === "r")) {
          if (event.repeat) return;
          event.preventDefault();
          const kind = activeReviewKind;
          setActiveTranscriptToolSection(kind);
          const activeCard = kind === "retakes" ? activeRetakeCandidateCard : activeFillerCandidateCard;
          const inFlight = kind === "retakes" ? retakeDecisionInFlight : fillerDecisionInFlight;
          if (!activeCard) return;
          if (inFlight) return;
          handleCandidateDecision(kind, lower === "a");
          return;
        }
      }

      if (event.shiftKey && lower === "d") {
        if (event.repeat) return;
        event.preventDefault();
        selectPass("gap_pacing");
        setActiveTranscriptToolSection("silence_gaps");
        return;
      }

      if (isTranscriptToolSurface && activeTranscriptToolSection === "silence_gaps") {
        if (event.shiftKey && lower === "a") {
          if (event.repeat) return;
          event.preventDefault();
          analyzeDeadAirClosure();
          return;
        }

        if (!event.shiftKey && key === "Enter") {
          if (event.repeat) return;
          event.preventDefault();
          if (!deadAirAnalysis) return;
          if (deadAirApplyInFlight) return;
          if (deadAirAnalysis.eligibleGapCount === 0) return;
          applyDeadAirClosureBatch();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeFillerCandidateCard,
    activeReviewKind,
    activeRetakeCandidateCard,
    deadAirAnalysis,
    deadAirApplyInFlight,
    fillerCandidateCards.length,
    fillerDecisionInFlight,
    isTranscriptCandidateReviewPass,
    isTranscriptToolSurface,
    activeTranscriptToolSection,
    retakeCandidateCards.length,
    retakeDecisionInFlight,
    zoomTimelineIn,
    zoomTimelineOut,
  ]);
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

  function handlePlaybackProgress(nextTimeSec: number): void {
    const transportProgress = resolvePlaybackTransportProgress(nextTimeSec);
    const nextPlayhead = roundToTenth(transportProgress.nextPlayheadSec);

    setPlayheadSec((current) => (
      Math.abs(current - nextPlayhead) >= SCRUB_SEEK_THRESHOLD_SEC ? nextPlayhead : current
    ));

    if (
      previewAudioRef.current
      && (transportProgress.shouldLoop || transportProgress.shouldSyncMediaTime)
      && Math.abs(previewAudioRef.current.currentTime - transportProgress.nextPlayheadSec) > SCRUB_SEEK_THRESHOLD_SEC
    ) {
      previewAudioRef.current.currentTime = transportProgress.nextPlayheadSec;
    }

    if (transportProgress.shouldLoop) {
      return;
    }

    if (transportProgress.shouldStop) {
      setIsPlaybackActive(false);
      if (playbackWindow?.mode === "roll") {
        setPlaybackWindow(null);
      }
    }
  }

  function togglePlayback(): void {
    if (editableTranscriptSegments.length === 0) return;
    if (!playbackMediaSrc) {
      setTranscriptTimingHint("Mapped media unavailable. Check workspace media mapping or source media link.");
      return;
    }
    setIsPlaybackActive((current) => {
      if (current && playbackWindow?.mode === "roll") {
        setPlaybackWindow(null);
      }
      return !current;
    });
    setFocusOverride("time-focus");
  }

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
      return;
    }

    const applied = applyHistoryMutation({
      label: preview.label,
      kind: "cleanup_tool",
      affectedSegments: preview.suggestions.map((suggestion) => suggestion.segmentId),
      toolId,
      immediatePersist: true,
      computeAfter: (before) => {
        const synced = syncEditableTranscriptSegments(preview.resultSegments, before.selectedSegmentId);
        const selected = synced.selectedSegmentId
          ? synced.segments.find((segment) => segment.segment_id === synced.selectedSegmentId) ?? null
          : null;
        return {
          ...before,
          transcriptSegments: synced.segments,
          selectedSegmentId: synced.selectedSegmentId,
          playheadSec: selected ? selected.start_sec : before.playheadSec,
          transcriptTimingHint: null,
        };
      },
    });
    if (applied) {
      setCleanupReceipt(summary);
    }
  }

  function commitVisualPlacementWindow(
    placementId: string,
    args: { startSec: number; endSec: number; label: string },
  ): void {
    const clampedStart = Math.max(0, Math.min(timelineDurationSec, roundImagePlacementTime(args.startSec)));
    const clampedEnd = Math.max(
      roundImagePlacementTime(clampedStart + MIN_IMAGE_PLACEMENT_DURATION_SEC),
      Math.min(timelineDurationSec, roundImagePlacementTime(args.endSec)),
    );
    applyHistoryMutation({
      label: args.label,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => applyVisualTimelineAction(before, {
        type: "UPDATE_CLIP_TIMING",
        clip_id: placementId,
        start_sec: clampedStart,
        end_sec: clampedEnd,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  function updateVisualPlacementTiming(placementId: string, deltaSec: number): void {
    const placement = sourceVisualPlacementItems.find((item) => item.id === placementId) ?? null;
    if (!placement) return;
    const duration = Math.max(MIN_IMAGE_PLACEMENT_DURATION_SEC, roundImagePlacementTime(placement.endSec - placement.startSec));
    const nextStart = Math.max(0, roundImagePlacementTime(placement.startSec + deltaSec));
    const maxStart = Math.max(0, roundImagePlacementTime(timelineDurationSec - duration));
    const clampedStart = Math.min(nextStart, maxStart);
    const nextEnd = Math.min(timelineDurationSec, roundImagePlacementTime(clampedStart + duration));
    commitVisualPlacementWindow(placementId, {
      startSec: clampedStart,
      endSec: nextEnd,
      label: "Adjust visual placement timing",
    });
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

  function updateImagePlacementTransform(
    placementId: string,
    updater: (current: HammerImagePlacementTransform) => HammerImagePlacementTransform,
  ): void {
    setImagePlacementTransforms((current) => {
      const clip = editableVisualTimeline
        ? selectClipById(editableVisualTimeline, placementId)
        : null;
      const base = current[placementId]
        ?? (clip
          ? geometryToTransform(clip.geometry)
          : geometryToTransform(resolvePlacementGeometry(visualPlacementsById.get(placementId))));
      const next = clampImagePlacementTransform(updater(base));
      return {
        ...current,
        [placementId]: next,
      };
    });
  }

  function commitImagePlacementTransform(
    placementId: string,
    transform: HammerImagePlacementTransform,
    label: string,
  ): void {
    const nextGeometry = transformToGeometry(transform);
    applyHistoryMutation({
      label,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => applyVisualTimelineAction(before, {
        type: "UPDATE_CLIP_GEOMETRY",
        clip_id: placementId,
        geometry: nextGeometry,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  function beginTimelineImagePlacementDrag(
    event: MouseEvent<HTMLElement | SVGElement>,
    args: {
      placementId: string;
      mode: HammerTimelineImageDragState["mode"];
      startSec: number;
      endSec: number;
    },
  ): void {
    if (!visualPlacementEditingEnabled) return;
    const button = (event as unknown as { button?: number }).button;
    if (button != null && button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const currentTarget = event.currentTarget as Element;
    const laneTrack = currentTarget.closest(".hammer-visual-timeline-lane__track, .hammer-timeline-lane__track");
    const ownerSvg = currentTarget instanceof SVGElement ? currentTarget.ownerSVGElement : null;
    const trackRect = laneTrack instanceof HTMLElement
      ? laneTrack.getBoundingClientRect()
      : ownerSvg?.getBoundingClientRect() ?? currentTarget.getBoundingClientRect();
    if (trackRect.width <= 0) return;
    setFocusOverride("time-focus");
    setSelectedClipId(args.placementId);
    setTimelineImageDragState({
      placementId: args.placementId,
      mode: args.mode,
      pointerStartX: event.clientX,
      originStartSec: args.startSec,
      originEndSec: args.endSec,
      pxToSec: timelineDurationSec / trackRect.width,
    });
  }

  function beginPreviewCanvasDrag(
    event: MouseEvent<HTMLElement>,
    args: { placementId: string; mode: HammerPreviewCanvasDragState["mode"] },
  ): void {
    if (!visualPlacementEditingEnabled) return;
    if (event.button !== 0) return;
    const clip = editableVisualTimeline
      ? selectClipById(editableVisualTimeline, args.placementId)
      : null;
    const activeTransform = imagePlacementTransforms[args.placementId]
      ?? (clip
        ? geometryToTransform(clip.geometry)
        : geometryToTransform(resolvePlacementGeometry(visualPlacementsById.get(args.placementId))));
    event.preventDefault();
    event.stopPropagation();
    setFocusOverride("tool-focus");
    setSelectedClipId(args.placementId);
    setPreviewCanvasDragState({
      placementId: args.placementId,
      mode: args.mode,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      origin: activeTransform,
      originAspectRatio: activeTransform.widthPct / Math.max(1, activeTransform.heightPct),
    });
  }

  function openImageAnimationContextMenu(event: MouseEvent<SVGGElement>, placementId: string): void {
    if (currentPass !== "image_animation") return;
    event.preventDefault();
    event.stopPropagation();
    setFocusOverride("time-focus");
    setSelectedClipId(placementId);
    setImageAnimationContextMenu({
      placementId,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function applyImageAnimationPreset(placementId: string, preset: HammerImageAnimationPreset): void {
    applyHistoryMutation({
      label: "Set image animation preset",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => applyVisualTimelineAction(before, {
        type: "UPDATE_CLIP_ANIMATION",
        clip_id: placementId,
        animation: { preset },
        updated_at: new Date().toISOString(),
      }),
    });
    setImageAnimationContextMenu(null);
  }

  function removeVisualPlacement(placementId: string): void {
    const placement = editableVisualPlacements?.placements.find((item) => item.placement_id === placementId) ?? null;
    applyHistoryMutation({
      label: "Remove image placement",
      kind: "visual_adjustment",
      toolId: "video",
      affectedSegments: placement ? [placement.anchor_segment_id] : undefined,
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => applyVisualTimelineAction(before, {
        type: "DELETE_CLIP",
        clip_id: placementId,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  function addImagePlacementFromLibrary(args: {
    assetPath: string;
    label: string;
  }): void {
    const placementId = createVisualPlacementId();

    applyHistoryMutation({
      label: "Add image placement",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const anchorSegment = before.selectedSegmentId
          ? before.transcriptSegments.find((segment) => segment.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;

        const nextStart = Math.max(0, roundToTenth(before.playheadSec));
        const nextEnd = Math.max(nextStart + 0.5, Math.min(transcriptDurationSec, roundToTenth(nextStart + 3)));
        const visualTimeline = resolveCanonicalVisualTimeline(before);
        const updatedAt = new Date().toISOString();
        const nextPlacement: HammerVisualPlacementRecord = {
          placement_id: placementId,
          entry_id: `manual:${placementId}`,
          anchor_segment_id: anchorSegment.segment_id,
          matched_segment_ids: [anchorSegment.segment_id],
          anchor_text: anchorSegment.text,
          asset_ref: args.assetPath,
          asset_id: null,
          asset_path: args.assetPath,
          storage_key: args.assetPath,
          label: args.label,
          visual_mode: "still_image",
          start_sec: nextStart,
          end_sec: nextEnd,
          confidence: null,
          timing_source: "ordered_fallback",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
          overlay_geometry: DEFAULT_VISUAL_PLACEMENT_GEOMETRY,
          animation_preset: "none",
          overlay_opacity: 1,
          overlay_z_index: visualTimeline.clips.length + 1,
        };
        const assetId = deriveStableHammerVisualAssetId(nextPlacement);
        return applyVisualTimelineActions({
          ...before,
          selectedSegmentId: anchorSegment.segment_id,
        }, [
          {
            type: "UPSERT_ASSETS",
            assets: [migrateLegacyPlacementRecordToAsset({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt })],
            updated_at: updatedAt,
          },
          {
            type: "CREATE_CLIP",
            clip: migrateLegacyPlacementRecordToClip({
              record: nextPlacement,
              asset_id: assetId,
              updated_at: updatedAt,
            }),
            updated_at: updatedAt,
          },
        ]);
      },
    });
  }

  function upsertPackagingPlacement(args: {
    entryId: string;
    assetPath: string;
    assetId?: string;
    label: string;
    startSec: number;
    endSec: number;
    visualMode: string;
    uncertaintyFlags?: string[];
    overlayGeometry?: HammerVisualGeometry;
    systemMeta?: {
      system_managed: true;
      system_type: "intro" | "outro";
      system_source: "profile" | "episode" | "manual";
      system_asset_id: string;
    };
  }): void {
    applyHistoryMutation({
      label: `Apply ${args.label}`,
      kind: "visual_adjustment",
      toolId: "finishing",
      immediatePersist: true,
      computeAfter: (before) => {
        const anchorSegment = before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;
        const visualTimeline = resolveCanonicalVisualTimeline(before);
        const existingClip = visualTimeline.clips.find((clip) => clip.entry_id === args.entryId) ?? null;
        const placementId = existingClip
          ? existingClip.clip_id
          : createVisualPlacementId();
        const updatedAt = new Date().toISOString();
        const nextPlacement: HammerVisualPlacementRecord = {
          placement_id: placementId,
          entry_id: args.entryId,
          anchor_segment_id: anchorSegment.segment_id,
          matched_segment_ids: [anchorSegment.segment_id],
          anchor_text: anchorSegment.text,
          asset_ref: args.assetPath,
          asset_id: null,
          asset_path: args.assetPath,
          storage_key: args.assetPath,
          label: args.label,
          visual_mode: args.visualMode,
          start_sec: Math.max(0, roundToTenth(args.startSec)),
          end_sec: Math.max(
            roundToTenth(args.startSec + MIN_IMAGE_PLACEMENT_DURATION_SEC),
            roundToTenth(args.endSec),
          ),
          confidence: null,
          timing_source: "ordered_fallback",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: args.uncertaintyFlags ?? [],
          overlay_geometry: args.entryId === PACKAGING_LOGO_ENTRY_ID
            ? (
              args.overlayGeometry ?? positionFromLogoOption(packagingLogoPosition, packagingLogoSize)
            )
            : {
              ...DEFAULT_VISUAL_PLACEMENT_GEOMETRY,
              x: 0,
              y: 0,
              width: 1,
              height: 1,
            },
          animation_preset: "none",
          overlay_opacity: 1,
          overlay_z_index: existingClip?.z_index ?? (visualTimeline.clips.length + 1),
        };
        const assetId = args.assetId ?? deriveStableHammerVisualAssetId(nextPlacement);
        const nextClipBase = migrateLegacyPlacementRecordToClip({
          record: nextPlacement,
          asset_id: assetId,
          updated_at: updatedAt,
        });
        const nextClip: HammerVisualClip = args.systemMeta
          ? {
            ...nextClipBase,
            system_managed: true,
            system_type: args.systemMeta.system_type,
            system_source: args.systemMeta.system_source,
            system_asset_id: args.systemMeta.system_asset_id,
          }
          : nextClipBase;
        if (existingClip) {
          let nextState = applyVisualTimelineAction(before, {
            type: "UPDATE_CLIP_TIMING",
            clip_id: existingClip.clip_id,
            start_sec: nextClip.start_sec,
            end_sec: nextClip.end_sec,
            updated_at: updatedAt,
          });
          nextState = applyVisualTimelineAction(nextState, {
            type: "UPDATE_CLIP_GEOMETRY",
            clip_id: existingClip.clip_id,
            geometry: nextClip.geometry,
            updated_at: updatedAt,
          });
          nextState = applyVisualTimelineAction(nextState, {
            type: "UPDATE_CLIP_ANIMATION",
            clip_id: existingClip.clip_id,
            animation: nextClip.animation,
            updated_at: updatedAt,
          });
          const nextTimeline = resolveCanonicalVisualTimeline(nextState);
          return {
            ...nextState,
            visualTimeline: {
              ...nextTimeline,
              assets: nextTimeline.assets.some((asset) => asset.asset_id === assetId)
                ? nextTimeline.assets.map((asset) => (asset.asset_id === assetId
                  ? migrateLegacyPlacementRecordToAsset({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt })
                  : asset))
                : [...nextTimeline.assets, migrateLegacyPlacementRecordToAsset({
                  record: nextPlacement,
                  asset_id: assetId,
                  updated_at: updatedAt,
                })],
              clips: nextTimeline.clips.map((clip) => (
                clip.clip_id === existingClip.clip_id
                  ? {
                    ...clip,
                    asset_id: assetId,
                    entry_id: nextClip.entry_id,
                    system_managed: args.systemMeta?.system_managed ?? clip.system_managed,
                    system_type: args.systemMeta?.system_type ?? clip.system_type,
                    system_source: args.systemMeta?.system_source ?? clip.system_source,
                    system_asset_id: args.systemMeta?.system_asset_id ?? clip.system_asset_id,
                    label: nextClip.label,
                    visual_mode: nextClip.visual_mode,
                    confidence: nextClip.confidence,
                    placement_status: nextClip.placement_status,
                    ingest_state: nextClip.ingest_state,
                    uncertainty_flags: [...nextClip.uncertainty_flags],
                    source_mode: nextClip.source_mode,
                    opacity: nextClip.opacity,
                    z_index: nextClip.z_index,
                    enabled: nextClip.enabled,
                    locked: nextClip.locked,
                    anchor_hint: {
                      ...nextClip.anchor_hint,
                      matched_segment_ids: [...nextClip.anchor_hint.matched_segment_ids],
                    },
                    authority_operation_id: nextClip.authority_operation_id,
                    updated_at: updatedAt,
                  }
                  : clip
              )),
            },
            visualPlacements: deriveLegacyVisualPlacementsFromTimeline({
              ...resolveCanonicalVisualTimeline(nextState),
              assets: resolveCanonicalVisualTimeline(nextState).assets.some((asset) => asset.asset_id === assetId)
                ? resolveCanonicalVisualTimeline(nextState).assets.map((asset) => (asset.asset_id === assetId
                  ? migrateLegacyPlacementRecordToAsset({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt })
                  : asset))
                : [...resolveCanonicalVisualTimeline(nextState).assets, migrateLegacyPlacementRecordToAsset({
                  record: nextPlacement,
                  asset_id: assetId,
                  updated_at: updatedAt,
                })],
              clips: resolveCanonicalVisualTimeline(nextState).clips.map((clip) => (
                clip.clip_id === existingClip.clip_id
                  ? {
                    ...clip,
                    asset_id: assetId,
                    entry_id: nextClip.entry_id,
                    label: nextClip.label,
                    visual_mode: nextClip.visual_mode,
                    confidence: nextClip.confidence,
                    placement_status: nextClip.placement_status,
                    ingest_state: nextClip.ingest_state,
                    uncertainty_flags: [...nextClip.uncertainty_flags],
                    source_mode: nextClip.source_mode,
                    opacity: nextClip.opacity,
                    z_index: nextClip.z_index,
                    enabled: nextClip.enabled,
                    locked: nextClip.locked,
                    anchor_hint: {
                      ...nextClip.anchor_hint,
                      matched_segment_ids: [...nextClip.anchor_hint.matched_segment_ids],
                    },
                    authority_operation_id: nextClip.authority_operation_id,
                    updated_at: updatedAt,
                  }
                  : clip
              )),
            }),
          };
        }
        return applyVisualTimelineActions(before, [
          {
            type: "UPSERT_ASSETS",
            assets: [migrateLegacyPlacementRecordToAsset({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt })],
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

  function removePackagingPlacement(entryId: string, label: string): void {
    applyHistoryMutation({
      label,
      kind: "visual_adjustment",
      toolId: "finishing",
      immediatePersist: true,
      computeAfter: (before) => {
        const clip = resolveCanonicalVisualTimeline(before).clips.find((candidate) => candidate.entry_id === entryId) ?? null;
        if (!clip) return before;
        return applyVisualTimelineAction(before, {
          type: "DELETE_CLIP",
          clip_id: clip.clip_id,
          updated_at: new Date().toISOString(),
        });
      },
    });
  }

  function applyIntroToTimeline(
    assetId: string,
    source: "profile" | "episode" | "manual",
  ): void {
    const resolved = introOutroCandidateItemsById.get(assetId) ?? null;
    if (!resolved?.path) {
      setTranscriptTimingHint("Intro asset is unavailable. Re-upload or re-select it in Intro/Outro Source Desk.");
      return;
    }
    const introDurationSec = Math.min(6, Math.max(2, roundToTenth(Math.max(2, transcriptDurationSec * 0.1))));
    upsertPackagingPlacement({
      entryId: PACKAGING_INTRO_ENTRY_ID,
      assetPath: resolved.path,
      assetId,
      label: "Packaging Intro",
      startSec: 0,
      endSec: introDurationSec,
      visualMode: "packaging_intro",
      uncertaintyFlags: ["packaging:intro"],
      systemMeta: {
        system_managed: true,
        system_type: "intro",
        system_source: source,
        system_asset_id: assetId,
      },
    });
  }

  function applyOutroToTimeline(
    assetId: string,
    source: "profile" | "episode" | "manual",
  ): void {
    const resolved = introOutroCandidateItemsById.get(assetId) ?? null;
    if (!resolved?.path) {
      setTranscriptTimingHint("Outro asset is unavailable. Re-upload or re-select it in Intro/Outro Source Desk.");
      return;
    }
    const outroDurationSec = Math.min(6, Math.max(2, roundToTenth(Math.max(2, transcriptDurationSec * 0.1))));
    const startSec = Math.max(0, roundToTenth(transcriptDurationSec - outroDurationSec));
    upsertPackagingPlacement({
      entryId: PACKAGING_OUTRO_ENTRY_ID,
      assetPath: resolved.path,
      assetId,
      label: "Packaging Outro",
      startSec,
      endSec: transcriptDurationSec,
      visualMode: "packaging_outro",
      uncertaintyFlags: ["packaging:outro"],
      systemMeta: {
        system_managed: true,
        system_type: "outro",
        system_source: source,
        system_asset_id: assetId,
      },
    });
  }

  function applyIntroPlacement(): void {
    const assetId = introOutroSelection.intro_asset_id;
    if (!assetId) {
      setTranscriptTimingHint("Select an intro asset first in Intro/Outro Source Desk.");
      return;
    }
    applyIntroToTimeline(assetId, "manual");
  }

  function applyOutroPlacement(): void {
    const assetId = introOutroSelection.outro_asset_id;
    if (!assetId) {
      setTranscriptTimingHint("Select an outro asset first in Intro/Outro Source Desk.");
      return;
    }
    applyOutroToTimeline(assetId, "manual");
  }

  function toggleLogoOverlay(): void {
    if (packagingLogoPlacement) {
      removePackagingPlacement(PACKAGING_LOGO_ENTRY_ID, "Remove logo overlay");
      return;
    }
    if (!packagingLogoAssetPath) {
      setTranscriptTimingHint("Select a logo asset before enabling overlay.");
      return;
    }
    upsertPackagingPlacement({
      entryId: PACKAGING_LOGO_ENTRY_ID,
      assetPath: packagingLogoAssetPath,
      label: `Logo Overlay (${packagingLogoPosition.replace("_", " ")}, ${packagingLogoSize})`,
      startSec: 0,
      endSec: transcriptDurationSec,
      visualMode: "overlay_graphic",
      overlayGeometry: positionFromLogoOption(packagingLogoPosition, packagingLogoSize),
      uncertaintyFlags: [
        "packaging:logo",
        `logo_position:${packagingLogoPosition}`,
        `logo_size:${packagingLogoSize}`,
      ],
    });
  }

  function applyLogoOverlayStyle(next: {
    position?: HammerLogoOverlayPosition;
    size?: HammerLogoOverlaySize;
    assetPath?: string | null;
  }): void {
    if (next.position) setPackagingLogoPosition(next.position);
    if (next.size) setPackagingLogoSize(next.size);
    if (typeof next.assetPath !== "undefined") setPackagingLogoAssetPath(next.assetPath);
    if (!packagingLogoPlacement) return;
    const position = next.position ?? packagingLogoPosition;
    const size = next.size ?? packagingLogoSize;
    const assetPath = next.assetPath ?? packagingLogoAssetPath ?? packagingLogoPlacement.asset_path ?? "";
    if (!assetPath) return;
    upsertPackagingPlacement({
      entryId: PACKAGING_LOGO_ENTRY_ID,
      assetPath,
      label: `Logo Overlay (${position.replace("_", " ")}, ${size})`,
      startSec: 0,
      endSec: transcriptDurationSec,
      visualMode: "overlay_graphic",
      overlayGeometry: positionFromLogoOption(position, size),
      uncertaintyFlags: [
        "packaging:logo",
        `logo_position:${position}`,
        `logo_size:${size}`,
      ],
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

  function markPromptCopied(key: string): void {
    setCopiedPromptKey(key);
    if (copiedPromptTimerRef.current != null) {
      window.clearTimeout(copiedPromptTimerRef.current);
    }
    copiedPromptTimerRef.current = window.setTimeout(() => {
      setCopiedPromptKey((current) => (current === key ? null : current));
      copiedPromptTimerRef.current = null;
    }, 1400);
  }

  async function copyPromptToClipboard(args: { key: string; prompt: string }): Promise<boolean> {
    const cleanedPrompt = sanitizePromptForCopy(args.prompt);
    if (!cleanedPrompt) {
      setTranscriptTimingHint("Prompt is empty. Add text before copying.");
      return false;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setTranscriptTimingHint("Clipboard is unavailable in this browser context.");
      return false;
    }
    try {
      await navigator.clipboard.writeText(cleanedPrompt);
      markPromptCopied(args.key);
      setTranscriptTimingHint("Prompt copied.");
      return true;
    } catch {
      setTranscriptTimingHint("Prompt copy failed. Check clipboard permissions.");
      return false;
    }
  }

  async function sendPromptToProvider(args: {
    key: string;
    prompt: string;
    label: string;
  }): Promise<void> {
    const copied = await copyPromptToClipboard({ key: args.key, prompt: args.prompt });
    if (!copied) return;
    window.open(EXTERNAL_PROVIDER_LAUNCH_URL, "_blank", "noopener,noreferrer");
    setTranscriptTimingHint(`Opened provider bridge for ${args.label}. Prompt copied for paste.`);
  }

  async function generateReferenceClipFromBeat(beat: HammerMediaMapBeat): Promise<void> {
    if (generatingReferenceBeatId) return;
    const referencePlacementId = beat.linkedPlacementId ?? createVisualPlacementId();
    const input: ReferenceClipInput = {
      beatId: beat.id,
      anchorText: beat.sourceText,
      promptBasis: buildMediaMapPrompt({
        type: "reference_clip",
        text: beat.sourceText,
        tweak: beat.tweak,
      }),
      chartType: "auto",
    };
    const analysis = analyzeReferenceClipInput(input);
    setGeneratingReferenceBeatId(beat.id);
    setSourceDeskError(null);
    try {
      const generated = await generateReferenceClipPng(input);
      const file = new File(
        [generated.blob],
        `reference_clip-${beat.segmentId}-${generated.outputType}-${Date.now()}.png`,
        { type: generated.mimeType },
      );
      const uploaded = await uploadWorkpieceMediaFile({
        workpieceId: launchContext.workpiece_id,
        file,
        category: "images",
      });
      await refreshSourceDeskMedia();

      applyHistoryMutation({
        label: beat.linkedPlacementId ? "Regenerate reference clip" : "Generate reference clip",
        kind: "visual_adjustment",
        toolId: "video",
        affectedSegments: [beat.segmentId],
        affectedPlacementIds: [referencePlacementId],
        immediatePersist: true,
        computeAfter: (before) => {
          const segment = before.transcriptSegments.find((item) => item.segment_id === beat.segmentId) ?? null;
          if (!segment) return before;
          const startSec = Math.max(0, roundToTenth(segment.start_sec));
          const endSec = Math.max(startSec + 0.5, roundToTenth(Math.min(transcriptDurationSec, segment.end_sec + 1.2)));
          const visualTimeline = resolveCanonicalVisualTimeline(before);
          const updatedAt = new Date().toISOString();
          const nextRecord: HammerVisualPlacementRecord = {
            placement_id: referencePlacementId,
            entry_id: `reference:${referencePlacementId}`,
            anchor_segment_id: segment.segment_id,
            matched_segment_ids: [segment.segment_id],
            anchor_text: segment.text,
            asset_ref: uploaded.path,
            asset_id: null,
            asset_path: uploaded.path,
            storage_key: uploaded.path,
            label: analysis.title,
            visual_mode: "reference_clip",
            start_sec: startSec,
            end_sec: endSec,
            confidence: null,
            timing_source: "ordered_fallback",
            status: "placed",
            ingest_state: "approved",
            uncertainty_flags: [
              "reference_clip_generated_in_house",
              `cdc_v1_type:${generated.outputType}`,
              `cdc_v1_summary:${analysis.summary.slice(0, 120)}`,
            ],
            overlay_geometry: DEFAULT_VISUAL_PLACEMENT_GEOMETRY,
            animation_preset: "none",
            overlay_opacity: 1,
            overlay_z_index: visualTimeline.clips.find((clip) => clip.clip_id === referencePlacementId)?.z_index ?? (visualTimeline.clips.length + 1),
          };
          const assetId = deriveStableHammerVisualAssetId(nextRecord);
          const nextClip = migrateLegacyPlacementRecordToClip({
            record: nextRecord,
            asset_id: assetId,
            updated_at: updatedAt,
          });
          const asset = migrateLegacyPlacementRecordToAsset({
            record: nextRecord,
            asset_id: assetId,
            updated_at: updatedAt,
          });
          const nextState = {
            ...before,
            selectedSegmentId: segment.segment_id,
          };
          const existingClip = visualTimeline.clips.find((clip) => clip.clip_id === referencePlacementId) ?? null;
          if (existingClip) {
            return replaceVisualTimelineState(nextState, (timeline) => ({
              ...timeline,
              assets: timeline.assets.some((item) => item.asset_id === assetId)
                ? timeline.assets.map((item) => (item.asset_id === assetId ? asset : item))
                : [...timeline.assets, asset],
              clips: timeline.clips.map((clip) => (
                clip.clip_id === referencePlacementId
                  ? {
                    ...clip,
                    ...nextClip,
                    uncertainty_flags: [...nextClip.uncertainty_flags],
                    geometry: { ...nextClip.geometry },
                    animation: { ...nextClip.animation },
                    anchor_hint: {
                      ...nextClip.anchor_hint,
                      matched_segment_ids: [...nextClip.anchor_hint.matched_segment_ids],
                    },
                  }
                  : clip
              )),
            }));
          }
          return applyVisualTimelineActions(nextState, [
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
      setMediaMapBeats((current) => current.map((item) => (
        item.id === beat.id ? { ...item, linkedPlacementId: referencePlacementId, selectedType: "reference_clip" } : item
      )));
      setTranscriptTimingHint(`Reference clip generated (${generated.outputType}).`);
    } catch (error) {
      setSourceDeskError(error instanceof Error ? error.message : "Reference clip generation failed.");
    } finally {
      setGeneratingReferenceBeatId(null);
    }
  }

  function queueMediaMapBeatSuggestion(beat: HammerMediaMapBeat): void {
    applyHistoryMutation({
      label: "Queue Media Map suggestion",
      kind: "visual_adjustment",
      toolId: "video",
      affectedSegments: [beat.segmentId],
      immediatePersist: true,
      computeAfter: (before) => {
        const segment = before.transcriptSegments.find((item) => item.segment_id === beat.segmentId) ?? null;
        if (!segment) return before;
        const startSec = Math.max(0, roundToTenth(segment.start_sec));
        const endSec = Math.max(startSec + 0.5, roundToTenth(Math.min(transcriptDurationSec, segment.end_sec + 0.8)));
        const prompt = buildMediaMapPrompt({
          type: beat.selectedType,
          text: beat.sourceText,
          tweak: beat.tweak,
        });
        const suggestion = createHearthBrollSuggestionInstruction({
          segmentId: beat.segmentId,
          intentRef: `media-map:${beat.id}:${Date.now().toString(36)}`,
          intentDescription: prompt,
          startSec,
          endSec,
          duckPreference: "auto",
        });
        return {
          ...before,
          selectedSegmentId: beat.segmentId,
          editorialAuthorityGraph: appendAuthorityInstructionForState(before, suggestion),
        };
      },
    });
    setSelectedVisualFlowStep(beat.selectedType === "reference_clip" ? "reference_clips" : "broll");
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
    setSelectedSourceTab("broll");
    setActiveTool("video");
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

  useEffect(() => {
    function handleKeyboardHistory(event: KeyboardEvent): void {
      if (isKeyboardEditingTarget(event.target)) return;

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          nudgePlayhead(event.shiftKey ? -LARGE_PLAYHEAD_NUDGE_SEC : -SMALL_PLAYHEAD_NUDGE_SEC);
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          nudgePlayhead(event.shiftKey ? LARGE_PLAYHEAD_NUDGE_SEC : SMALL_PLAYHEAD_NUDGE_SEC);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          selectAdjacentSegment("previous");
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          selectAdjacentSegment("next");
          return;
        }

        if (event.key === "Home") {
          event.preventDefault();
          event.stopPropagation();
          jumpToSelectionBoundary("start");
          return;
        }

        if (event.key === "End") {
          event.preventDefault();
          event.stopPropagation();
          jumpToSelectionBoundary("end");
          return;
        }

        if (event.key === ",") {
          event.preventDefault();
          event.stopPropagation();
          jumpToEditPoint("previous");
          return;
        }

        if (event.key === ".") {
          event.preventDefault();
          event.stopPropagation();
          jumpToEditPoint("next");
          return;
        }

        if (event.key === "PageUp") {
          event.preventDefault();
          event.stopPropagation();
          jumpToMarker("previous");
          return;
        }

        if (event.key === "PageDown") {
          event.preventDefault();
          event.stopPropagation();
          jumpToMarker("next");
          return;
        }

        if (event.key === " " || event.code === "Space") {
          event.preventDefault();
          event.stopPropagation();
          togglePlayback();
          return;
        }

        if (event.key.toLowerCase() === "s") {
          event.preventDefault();
          event.stopPropagation();
          splitSelectedSegmentAtPlayhead();
          return;
        }

        if (event.key.toLowerCase() === "l") {
          event.preventDefault();
          event.stopPropagation();
          toggleSelectionLoopPlayback();
          return;
        }

        if (event.key.toLowerCase() === "p") {
          event.preventDefault();
          event.stopPropagation();
          playSelectionWithRoll();
          return;
        }

        if (event.key.toLowerCase() === "k") {
          event.preventDefault();
          event.stopPropagation();
          addMarkerAtPlayhead();
          return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          deleteSelectedSegmentAndRipple();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          clearTranscriptSelection();
          return;
        }

        if (event.key.toLowerCase() === "m") {
          event.preventDefault();
          event.stopPropagation();
          toggleSelectedSegmentDisabled();
          return;
        }

        if (event.key === "[" || event.key === "]") {
          event.preventDefault();
          event.stopPropagation();
          adjustSelectedSegmentGain(event.key === "]" ? 1 : -1);
          return;
        }
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();

      const wantsUndo = key === "z" && !event.shiftKey;
      const wantsRedo = (key === "z" && event.shiftKey) || key === "y";
      if (!wantsUndo && !wantsRedo) return;

      event.preventDefault();
      event.stopPropagation();

      if (wantsUndo) {
        undoHistory();
        return;
      }
      redoHistory();
    }

    window.addEventListener("keydown", handleKeyboardHistory);
    return () => {
      window.removeEventListener("keydown", handleKeyboardHistory);
    };
  }, [
    addMarkerAtPlayhead,
    adjustSelectedSegmentGain,
    clearTranscriptSelection,
    deleteSelectedSegmentAndRipple,
    jumpToEditPoint,
    jumpToMarker,
    jumpToSelectionBoundary,
    nudgePlayhead,
    playSelectionWithRoll,
    redoHistory,
    selectAdjacentSegment,
    splitSelectedSegmentAtPlayhead,
    togglePlayback,
    toggleSelectionLoopPlayback,
    toggleSelectedSegmentDisabled,
    undoHistory,
  ]);

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
    hasSilenceSuggestionAnalysis,
    silenceSuggestionCount,
    silenceCutSuggestions,
    visibleSilenceCutSuggestions,
    acceptSilenceCutSuggestion,
    dismissSilenceCutSuggestion,
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
      selectedClipId: effectiveSelectedClipId,
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
          startSec: clip.startSec,
          endSec: clip.endSec,
        });
      },
      onTrimClipStart: (event: MouseEvent, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!visualPlacementEditingEnabled) return;
        beginTimelineImagePlacementDrag(event as unknown as MouseEvent<HTMLElement | SVGElement>, {
          placementId: clip.clipId,
          mode: "resize_start",
          startSec: clip.startSec,
          endSec: clip.endSec,
        });
      },
      onTrimClipEnd: (event: MouseEvent, clip: { clipId: string; startSec: number; endSec: number }) => {
        if (!visualPlacementEditingEnabled) return;
        beginTimelineImagePlacementDrag(event as unknown as MouseEvent<HTMLElement | SVGElement>, {
          placementId: clip.clipId,
          mode: "resize_end",
          startSec: clip.startSec,
          endSec: clip.endSec,
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
        onSelect: () => setSelectedSourceTab(tab.id),
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
      isSubtractiveTranscriptEdit,
      setTranscriptTimingHint,

      buildTimelineImagePrompt,
      formatBytes,
      selectedVisualFlowStep,
      uploadingCategory,
      savingIntroOutro,
      sourceDeskPreviewUrls,
      sourceDeskPreviewFailures,
      imageUploadInputRef,
      brollUploadInputRef,
      introOutroUploadInputRef,
      sourceImageItems,
      sourceImageLibraryItems,
      imageUsageByPath,
      handleSourceDeskUpload,
      persistIntroOutroSelection,
      addImagePlacementFromLibrary,
      updatePlacementKindFromMediaMap,
      generateReferenceClipFromBeat,
      queueMediaMapBeatSuggestion,
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
      copyPromptToClipboard,
      copiedPromptKey,
      sendPromptToProvider,
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
      buildMediaMapPrompt,
      setMediaMapBeats,
      setRemovedMediaMapSegmentIds,
      unresolvedBrollSuggestionItems,
      analyzeReferenceClipInput,
      visualPlacementsById,
      generatingReferenceBeatId,
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
    buildTimelineImagePrompt,
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
    selectedSegment,
    selectedSegmentId,
    selectedSourceTab,
    selectedVisualFlowStep,
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
    applyHistoryMutation,
    applyTranscriptSelection,
    activeTool,
    transcriptLineRefs,
    brollUploadInputRef,
    generateReferenceClipFromBeat,
    persistIntroOutroSelection,
    queueMediaMapBeatSuggestion,
    referenceClipPlannedBeats,
    seekPlayheadToTime,
    sourceDeskPreviewUrls,
    updateTranscriptSegmentSpeaker,
    sourceDeskPreviewFailures,
    brollUploadInputRef,
    imageUploadInputRef,
    queueMediaMapBeatSuggestion,
    redoMediaMapFromScript,
    updatePlacementKindFromMediaMap,
    generateReferenceClipFromBeat,
    persistIntroOutroSelection,
    addImagePlacementFromLibrary,
    referenceClipPlannedBeats,
    seekPlayheadToTime,
    introOutroSelection,
    introOutroSelectedIntroPath,
    introOutroSelectedOutroPath,
    introOutroCandidateItems,
  ]);
  const previewBayVM = useMemo(() => ({
    previewModeLabel: previewMode,
    previewSurfaceRef,
    previewAudioRef,
    previewBrollVideoRefs,
    playbackMediaSrc,
    isPlaybackActive,
    playbackWindow,
    handlePlaybackProgress,
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
    packagingSummaryLabel: currentPass === "packaging"
      ? `Packaging: intro ${packagingIntroPlacement ? "on" : "off"} · outro ${packagingOutroPlacement ? "on" : "off"} · logo ${packagingLogoPlacement ? "on" : "off"}`
      : null,
    previewSurfaceLabel,
    backgroundEffect: {
      enabled: visualBackgroundBlur || visualBackgroundReplaceEnabled || visualBackgroundWashEnabled,
      settings: backgroundBlurSettings,
      providerId: visualBackgroundBlurProviderId,
      debugMasks: visualBackgroundBlurDebugMask,
      onStatus: setVisualBackgroundBlurRuntimeStatus,
      onCanvas: handleBackgroundEffectCanvas,
    },
    eyeContactAssist: {
      enabled: visualEyeContactAssistEnabled,
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
    activePreviewOverlays,
    audioFinalizationCompareMode,
    backgroundBlurSettings,
    beginPreviewCanvasDrag,
    currentPass,
    eyeContactUseBackgroundCanvasAsSource,
    handleBackgroundEffectCanvas,
    handlePlaybackProgress,
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
    togglePlayback,
    visualBackgroundBlur,
    visualBackgroundBlurDebugMask,
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
    passes: PASS_ORDER.map((pass) => {
      const passResult = passSelectorResults.get(pass.id) ?? getPassStatus(pass.id, passSelectorContext);
      return {
        id: pass.id,
        shortLabel: pass.shortLabel,
        label: pass.label,
        toolId: pass.toolId,
        statusLabel: passResult.humanLabel,
        isActive: currentPass === pass.id,
      };
    }),
    onSelectPass: selectPass,
  }), [currentPass, passSelectorContext, passSelectorResults, selectPass]);
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
        label: "Visual Finishing",
        status: summarize(["visual_finishing"]),
      },
      {
        id: "image",
        label: "Image Placement + Animation",
        status: summarize(["image_placement", "image_animation"]),
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
          localRelpath: mediaRef.local_relpath ?? null,
          canonicalWorkpiecePath: mediaRef.local_relpath ?? null,
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
        setSelectedSourceTab("transcript");
        setFocusOverride("source-focus");
        break;
      case "review_visuals":
        setSelectedSourceTab("images");
        setActiveTool("video");
        setFocusOverride("tool-focus");
        break;
      case "review_audio":
        setActiveTool("audio");
        setFocusOverride("tool-focus");
        break;
      case "review_macros":
        setActiveTool("finishing");
        setFocusOverride("tool-focus");
        break;
      default:
        break;
    }
  }, [props.prepHandoffAction]);

  useHammerWorkspaceShellSnapshotEmitter({
    onWorkspaceSnapshotChange: props.onWorkspaceSnapshotChange,
    launchContext,
    transcriptSourceId,
    previewMode,
    mediaRef,
    workspaceMapping,
    mediaSourceLabel,
    selectedMacroRecipeRef: props.selectedMacroRecipeRef ?? null,
    lastMacroRunRef: props.lastMacroRunRef ?? null,
    exportTranscriptForRelease: exportBasis.transcriptForRelease,
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
    shellProps: props,
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
    applyStudioSoundProfile,
    audioFinalizationCompareMode,
    audioFinalizationHarshness,
    audioFinalizationOutputLevel,
    audioFinalizationPresence,
    audioFinalizationWarmth,
    audioLevelingEnabled,
    audioNoiseReductionEnabled,
    audioStudioSoundApplied,
    backgroundBlurProviderDescriptor,
    boundAttentionQueue,
    boundAttentionSummary,
    candidateCutDraftById,
    candidateCutEnabledById,
    candidateEditModeById,
    candidateProposedTextById,
    candidateReceiptByKind,
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
    copiedPromptKey,
    copyPromptToClipboard,
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
    resolveCandidateCutOverride,
    resolveCandidateSuggestedCut,
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
    sendPromptToProvider,
    sendToQuenchButtonLabel,
    setActiveCaptionArtifactMode,
    setActiveReviewKind,
    setActiveTranscriptToolSection,
    setAnchorLabelDraft,
    setAnchorTextDraft,
    setAudioFinalizationCompare,
    setAudioLevelingEnabled,
    setAudioNoiseReductionEnabled,
    setCandidateCutDraftById,
    setCandidateCutEnabledById,
    setCandidateEditModeById,
    setCandidateProposedTextById,
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
    setThumbnailPromptDraft,
    setTranscriptTimingHint,
    setVideoSnapMode,
    setVisualBackgroundBlur,
    setVisualBackgroundBlurDebugMask,
    setVisualBackgroundBlurFallbackMode,
    setVisualBackgroundBlurFeatherPx,
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
    thumbnailPromptDraft,
    toggleLogoOverlay,
    transcriptSegmentsById,
    transcriptSelectionRange,
    trimResolvedBrollBinding,
    unresolvedBrollSuggestionItems,
    updateAudioFinalizationHarshness,
    updateAudioFinalizationOutputLevel,
    updateAudioFinalizationPresence,
    updateAudioFinalizationWarmth,
    updateImagePlacementTransform,
    updateVisualPlacementTiming,
    videoSnapMode,
    viewingModeSummary,
    visualBackgroundBlur,
    visualBackgroundBlurDebugMask,
    visualBackgroundBlurFallbackMode,
    visualBackgroundBlurFeatherPx,
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
    applyStudioSoundProfile,
    audioFinalizationCompareMode,
    audioFinalizationHarshness,
    audioFinalizationOutputLevel,
    audioFinalizationPresence,
    audioFinalizationWarmth,
    audioLevelingEnabled,
    audioNoiseReductionEnabled,
    audioStudioSoundApplied,
    backgroundBlurProviderDescriptor,
    boundAttentionQueue,
    boundAttentionSummary,
    candidateCutDraftById,
    candidateCutEnabledById,
    candidateEditModeById,
    candidateProposedTextById,
    candidateReceiptByKind,
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
    copiedPromptKey,
    copyPromptToClipboard,
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
    resolveCandidateCutOverride,
    resolveCandidateSuggestedCut,
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
    sendPromptToProvider,
    sendToQuenchButtonLabel,
    setActiveCaptionArtifactMode,
    setActiveReviewKind,
    setActiveTranscriptToolSection,
    setAnchorLabelDraft,
    setAnchorTextDraft,
    setAudioFinalizationCompare,
    setAudioLevelingEnabled,
    setAudioNoiseReductionEnabled,
    setCandidateCutDraftById,
    setCandidateCutEnabledById,
    setCandidateEditModeById,
    setCandidateProposedTextById,
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
    setThumbnailPromptDraft,
    setTranscriptTimingHint,
    setVideoSnapMode,
    setVisualBackgroundBlur,
    setVisualBackgroundBlurDebugMask,
    setVisualBackgroundBlurFallbackMode,
    setVisualBackgroundBlurFeatherPx,
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
    thumbnailPromptDraft,
    toggleLogoOverlay,
    transcriptSegmentsById,
    transcriptSelectionRange,
    trimResolvedBrollBinding,
    unresolvedBrollSuggestionItems,
    updateAudioFinalizationHarshness,
    updateAudioFinalizationOutputLevel,
    updateAudioFinalizationPresence,
    updateAudioFinalizationWarmth,
    updateImagePlacementTransform,
    updateVisualPlacementTiming,
    videoSnapMode,
    viewingModeSummary,
    visualBackgroundBlur,
    visualBackgroundBlurDebugMask,
    visualBackgroundBlurFallbackMode,
    visualBackgroundBlurFeatherPx,
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
      {imageAnimationContextMenu ? (
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
        </div>
      ) : null}

      <nav className="hammer-toolbar" aria-label="Hammer pass toolbar">
        <HammerWorkspaceShellToolbar vm={toolbarVM} />
      </nav>
    </section>
  );
}
