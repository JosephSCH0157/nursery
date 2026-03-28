import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, MouseEvent } from "react";
import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { createSemanticEditPlanSignature } from "../lib/editPlanSignature";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import { HAMMER_PASS_ORDER_VERSION } from "../persistence/hammerPersistenceContract";
import type {
  HammerPassId,
  HammerPassStatusMap,
  HammerDerivedTextLayer,
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
  HammerVisualPlacementRecord,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
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
  resolveEffectivePlaybackTime,
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
  previewTightenSelection,
  type HammerCleanupPreview,
  type RetakeCleanupOptions,
  type FillerCleanupOptions,
  type GapCleanupOptions,
  type SpeakerMonologueOptions,
  type SpeakerPanelOptions,
  type SpeakerInterviewOptions,
  type SpeakerSoloOptions,
} from "./hammerCleanupTools";
import { requestHammerTranscriptCleanupAssist } from "./hammerTranscriptCleanupAssistApi";
import PolishResultSummary, {
  buildPolishResultSummaryFromCleanupPreview,
  type HammerPolishResultSummary,
} from "./PolishResultSummary";
import { HammerWaveformLane } from "./HammerWaveformLane";
import {
  createHammerHistoryController,
  createHammerHistoryDocument,
  hashEditorState,
  normalizeHammerHistoryDocument,
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
  loadHammerHistoryDocument,
  saveHammerHistoryDocument,
} from "../lib/hammerHistoryArtifactApi";
import {
  buildHammerDevMediaUrl,
  loadCanonicalAudioPolishPreviewUrl,
} from "../lib/previewSource";
import { buildHammerMediaPrepOutputsPackage } from "../lib/hammerMediaPrepOutputsPackage";
import {
  loadHammerSnapshotManifest,
  loadHammerSnapshotPayload,
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
import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
  buildHammerQuenchReleasePacket,
} from "../lib/hammerQuenchReleasePacket";
import { saveHammerQuenchReleasePacket } from "../lib/hammerQuenchReleasePacketApi";
import {
  buildHammerRenderAssembly,
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
  appendAuthorityInstructionToGraph,
  createHearthBrollSuggestionInstruction,
  createAudioDuckInstruction,
  createCrossfadeInstruction,
  createDipToBlackInstruction,
  createFadeAudioInstruction,
  createHardCutInstruction,
  createInsertBrollInstruction,
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
const SCRUB_RATE_OPTIONS = [1, 0.75, 0.5] as const;
const CAPTION_MIN_BLOCK_DURATION_SEC = 0.05;
type HammerPlaybackAuthorityWindow = Window & typeof globalThis & {
  __forgeHammerActivePreviewOwnerId__?: string;
  __forgeHammerActivePreviewAudio__?: HTMLMediaElement;
};
const HAMMER_RENDER_RUNTIME_CAPABILITIES: HammerRenderRuntimeCapabilities = {
  preview_supported_operation_types: ["delete", "mute", "trim", "split", "merge", "hard_cut"],
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
  structuredTranscript?: HammerPersistedStructuredTranscript | null;
  visualPlacements?: HammerPersistedVisualPlacements | null;
  audioPolish?: HammerPersistedAudioPolish | null;
  initialCurrentPass?: HammerPassId;
  initialPassStatus?: HammerPassStatusMap | null;
  releasePrepHref?: string | null;
  selectedMacroRecipeRef?: string | null;
  lastMacroRunRef?: string | null;
  prepHandoffAction?: {
    id: Exclude<HammerPreparedNextStepActionId, "export_later">;
    token: number;
  } | null;
  aiInUse?: boolean;
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
  { id: "gap_pacing", shortLabel: "T3", label: "Gap/Pacing", toolId: "polish", sourceTab: "transcript" },
  { id: "visual_finishing", shortLabel: "V1", label: "Visual Finishing", toolId: "video", sourceTab: "images" },
  { id: "image_placement", shortLabel: "V2", label: "Image Placement", toolId: "video", sourceTab: "images" },
  { id: "image_animation", shortLabel: "V3", label: "Image Animation", toolId: "video", sourceTab: "images" },
  { id: "audio_finalization", shortLabel: "A", label: "Audio Finalization", toolId: "audio", sourceTab: "assets" },
  { id: "packaging", shortLabel: "P", label: "Packaging", toolId: "finishing", sourceTab: "introoutro" },
  { id: "ready", shortLabel: "R", label: "Ready", toolId: "export", sourceTab: "transcript" },
];

const PASS_ID_SET = new Set<HammerPassId>(PASS_ORDER.map((pass) => pass.id));

function resolveDefaultPassStatus(currentPass: HammerPassId): HammerPassStatusMap {
  const status: HammerPassStatusMap = {};
  for (const pass of PASS_ORDER) {
    status[pass.id] = pass.id === currentPass ? "in_progress" : "not_started";
  }
  return status;
}

function normalizePassStatus(
  value: HammerPassStatusMap | null | undefined,
  currentPass: HammerPassId,
): HammerPassStatusMap {
  const fallback = resolveDefaultPassStatus(currentPass);
  if (!value) return fallback;
  const next: HammerPassStatusMap = { ...fallback };
  for (const pass of PASS_ORDER) {
    const status = value[pass.id];
    if (status === "not_started" || status === "in_progress" || status === "completed") {
      next[pass.id] = status;
    }
  }
  if (next[currentPass] === "not_started") {
    next[currentPass] = "in_progress";
  }
  return next;
}

function resolvePassMeta(passId: HammerPassId): (typeof PASS_ORDER)[number] {
  return PASS_ORDER.find((pass) => pass.id === passId) ?? PASS_ORDER[0];
}

function resolveDefaultPassForTool(toolId: HammerToolId): HammerPassId {
  return PASS_ORDER.find((pass) => pass.toolId === toolId)?.id ?? PASS_ORDER[0].id;
}

function resolveInitialPassId(value: HammerPassId | undefined): HammerPassId {
  return value && PASS_ID_SET.has(value) ? value : PASS_ORDER[0].id;
}

type HammerCandidateReviewKind = "fillers" | "retakes";

type HammerCandidateCard = {
  id: string;
  kind: HammerCandidateReviewKind;
  segmentId: string;
  description: string;
  beforeText: string;
  afterText: string | null;
  confidence: number;
  timeSavedSec: number;
};

type HammerVisualLutPreset =
  | "neutral"
  | "clean_daylight"
  | "warm_studio"
  | "cool_evening"
  | "high_contrast"
  | "soft_documentary";

type HammerSourceImageItem = {
  id: string;
  label: string;
  kind: "image" | "broll" | "reference_clip";
  anchorSegmentId: string;
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

type HammerVisualPlacementGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: "center" | "top_left";
};

type HammerPreviewVisualOverlay = {
  placementId: string;
  label: string;
  kind: "image" | "broll";
  src: string | null;
  startSec: number;
  endSec: number;
  transform: HammerImagePlacementTransform;
  animationPreset: HammerImageAnimationPreset;
  zIndex: number;
  opacity: number;
  isSelected: boolean;
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

function formatAssetKindLabel(kind: HammerSourceAssetKind): string {
  if (kind === "broll") return "B-roll";
  if (kind === "reference_clip") return "Reference Clip";
  if (kind === "image") return "Image";
  if (kind === "audio") return "Audio";
  return "Other";
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
  studioRack: HammerStudioRackState;
  editorialAuthorityGraph: HammerEditorialAuthorityGraph | null;
  outputSelection: HammerOutputSelectionState;
  selectedSegmentId: string | null;
  playheadSec: number;
  transcriptTimingHint: string | null;
} {
  return {
    segments: state.transcriptSegments.map((segment) => ({ ...segment })),
    visualPlacements: state.visualPlacements
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
  leftPct: 28,
  topPct: 22,
  widthPct: 44,
  heightPct: 34,
};

const DEFAULT_VISUAL_PLACEMENT_GEOMETRY: HammerVisualPlacementGeometry = {
  x: 0.28,
  y: 0.22,
  width: 0.44,
  height: 0.34,
  anchor: "top_left",
};

function clampImagePlacementTransform(transform: HammerImagePlacementTransform): HammerImagePlacementTransform {
  const widthPct = Math.max(8, Math.min(92, transform.widthPct));
  const heightPct = Math.max(8, Math.min(92, transform.heightPct));
  const leftPct = Math.max(0, Math.min(100 - widthPct, transform.leftPct));
  const topPct = Math.max(0, Math.min(100 - heightPct, transform.topPct));
  return { leftPct, topPct, widthPct, heightPct };
}

function clampVisualPlacementGeometry(
  geometry: HammerVisualPlacementGeometry,
): HammerVisualPlacementGeometry {
  const width = Math.max(0.08, Math.min(0.92, geometry.width));
  const height = Math.max(0.08, Math.min(0.92, geometry.height));
  const x = Math.max(0, Math.min(1 - width, geometry.x));
  const y = Math.max(0, Math.min(1 - height, geometry.y));
  return {
    x,
    y,
    width,
    height,
    anchor: geometry.anchor === "center" ? "center" : "top_left",
  };
}

function resolvePlacementGeometry(
  placement: HammerVisualPlacementRecord | null | undefined,
): HammerVisualPlacementGeometry {
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
  return clampVisualPlacementGeometry({
    x,
    y,
    width,
    height,
    anchor: candidate.anchor === "center" ? "center" : "top_left",
  });
}

function geometryToTransform(geometry: HammerVisualPlacementGeometry): HammerImagePlacementTransform {
  return clampImagePlacementTransform({
    leftPct: geometry.x * 100,
    topPct: geometry.y * 100,
    widthPct: geometry.width * 100,
    heightPct: geometry.height * 100,
  });
}

function transformToGeometry(transform: HammerImagePlacementTransform): HammerVisualPlacementGeometry {
  const clamped = clampImagePlacementTransform(transform);
  return clampVisualPlacementGeometry({
    x: clamped.leftPct / 100,
    y: clamped.topPct / 100,
    width: clamped.widthPct / 100,
    height: clamped.heightPct / 100,
    anchor: "top_left",
  });
}

function resolvePlacementAnimationPreset(
  placement: HammerVisualPlacementRecord | null | undefined,
): HammerImageAnimationPreset {
  const preset = placement?.animation_preset ?? null;
  return (
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

function isPlacementActiveAtPlayhead(
  placement: HammerVisualPlacementRecord,
  playheadSec: number,
): boolean {
  const startSec = Number.isFinite(placement.start_sec) ? placement.start_sec : 0;
  const rawEndSec = Number.isFinite(placement.end_sec) ? placement.end_sec : startSec;
  const endSec = Math.max(startSec, rawEndSec - PLAYHEAD_WINDOW_EPSILON_SEC);
  return playheadSec >= (startSec - PLAYHEAD_WINDOW_EPSILON_SEC) && playheadSec <= endSec;
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
): HammerVisualPlacementGeometry {
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
  return clampVisualPlacementGeometry({
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
  const visualPlacementsResetKey = useMemo(() => {
    const placements = props.visualPlacements;
    if (!placements) return "visual-placements:none";
    return `visual-placements:${stableHashToken(JSON.stringify({
      placementCount: placements.placements.length,
      sourceRefs: placements.source_refs,
      uncertaintyFlags: placements.uncertainty_flags,
      placements: placements.placements.map((placement) => ({
        id: placement.placement_id,
        authorityOperationId: placement.authority_operation_id ?? null,
        assetRef: placement.asset_ref,
        start: placement.start_sec,
        end: placement.end_sec,
      })),
    }))}`;
  }, [props.visualPlacements]);
  const transcriptSegments = useMemo(
    () => readTranscriptSegments(launchContext, props.structuredTranscript ?? null),
    [launchContext.transcript, structuredTranscriptResetKey],
  );
  const transcriptSourceId = props.structuredTranscript?.transcript_id
    ?? (launchContext.transcript.kind === "tongs-stub" ? launchContext.transcript.transcript_id : "runtime-transcript");

  const initialCurrentPass = resolveInitialPassId(props.initialCurrentPass);
  const initialPassMeta = resolvePassMeta(initialCurrentPass);
  const [currentPass, setCurrentPass] = useState<HammerPassId>(initialCurrentPass);
  const [passStatus, setPassStatus] = useState<HammerPassStatusMap>(() => (
    normalizePassStatus(props.initialPassStatus, initialCurrentPass)
  ));
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
  const [editableVisualPlacements, setEditableVisualPlacements] = useState<HammerPersistedVisualPlacements | null>(
    () => props.visualPlacements ?? null,
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
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(transcriptSegments[0]?.segment_id ?? null);
  const [transcriptSelectionAnchorSegmentId, setTranscriptSelectionAnchorSegmentId] = useState<string | null>(
    transcriptSegments[0]?.segment_id ?? null,
  );
  const [transcriptSelectionFocusSegmentId, setTranscriptSelectionFocusSegmentId] = useState<string | null>(
    transcriptSegments[0]?.segment_id ?? null,
  );
  const [playheadSec, setPlayheadSec] = useState(0);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [playbackWindow, setPlaybackWindow] = useState<HammerPlaybackWindow | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [timelineMarkers, setTimelineMarkers] = useState<HammerTimelineMarker[]>([]);
  const [scrubRate, setScrubRate] = useState<HammerScrubRate>(1);
  const [focusOverride, setFocusOverride] = useState<HammerWorkspaceFocusOverride>("auto");
  const [polishStrength, setPolishStrength] = useState(60);
  const [gapCleanupOptions, setGapCleanupOptions] = useState<GapCleanupOptions>({
    maxGapSec: 0.4,
    minPauseSec: 0.1,
    preserveDramaticPauses: true,
  });
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
  const [candidateCards, setCandidateCards] = useState<HammerCandidateCard[]>([]);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const [cleanupPreview, setCleanupPreview] = useState<HammerCleanupPreview | null>(null);
  const [cleanupReceipt, setCleanupReceipt] = useState<HammerPolishResultSummary | null>(null);
  const [audioLevelingEnabled, setAudioLevelingEnabled] = useState(true);
  const [audioNoiseReductionEnabled, setAudioNoiseReductionEnabled] = useState(true);
  const [audioFinalizationCompareMode, setAudioFinalizationCompareMode] = useState<HammerAudioFinalizationCompareMode>("after");
  const [videoSnapMode, setVideoSnapMode] = useState<"timeline" | "segment">("timeline");
  const [visualLutPreset, setVisualLutPreset] = useState<HammerVisualLutPreset>("neutral");
  const [visualWhiteBalance, setVisualWhiteBalance] = useState(0);
  const [visualColorAmount, setVisualColorAmount] = useState(0);
  const [visualBackgroundBlur, setVisualBackgroundBlur] = useState(false);
  const [visualEyeContact, setVisualEyeContact] = useState(false);
  const [selectedImagePlacementId, setSelectedImagePlacementId] = useState<string | null>(null);
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
    intro_path: null,
    outro_path: null,
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
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const brollUploadInputRef = useRef<HTMLInputElement | null>(null);
  const introOutroUploadInputRef = useRef<HTMLInputElement | null>(null);
  const previewAudioRef = useRef<HTMLVideoElement | null>(null);
  const previewSurfaceRef = useRef<HTMLDivElement | null>(null);
  const imageAnimationContextMenuRef = useRef<HTMLDivElement | null>(null);
  const previewBrollVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const workspaceShellRef = useRef<HTMLElement | null>(null);
  const lastPlaybackMediaSrcRef = useRef<string | null>(null);
  const captionEditorRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const lastHandledHandoffTokenRef = useRef<number | null>(null);
  const transcriptLineRefs = useRef(new Map<string, HTMLButtonElement>());
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
  const lastGapAutoApplySignatureRef = useRef<string | null>(null);
  const imagePlacementDraftWindowsRef = useRef<Record<string, HammerImagePlacementDraftWindow>>({});
  const currentPassMeta = useMemo(() => resolvePassMeta(currentPass), [currentPass]);

  useEffect(() => {
    const nextInitialPass = resolveInitialPassId(props.initialCurrentPass);
    setCurrentPass(nextInitialPass);
    setPassStatus(normalizePassStatus(props.initialPassStatus, nextInitialPass));
    const nextMeta = resolvePassMeta(nextInitialPass);
    setActiveTool(nextMeta.toolId);
    setSelectedSourceTab(nextMeta.sourceTab);
  }, [
    launchContext.workspace_id,
    launchContext.workpiece_id,
    props.initialCurrentPass,
    props.initialPassStatus,
  ]);

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

  function markCurrentPassComplete(): void {
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
    : launchContext.media.label ?? mediaRef?.local_relpath ?? null;
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
  const activeCandidateCard = candidateCards[activeCandidateIndex] ?? null;
  const candidateSegmentIdSet = useMemo(
    () => new Set(candidateCards.map((card) => card.segmentId)),
    [candidateCards],
  );
  const activeCandidateSegmentId = activeCandidateCard?.segmentId ?? null;
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
  const visualPreviewFilter = useMemo(() => {
    const base = resolveVisualPresetFilter(visualLutPreset);
    const temperatureShift = visualWhiteBalance / 3;
    const colorBoost = 1 + (visualColorAmount / 100) * 0.25;
    const blurPx = visualBackgroundBlur ? 1.4 : 0;
    const filterParts = [
      base !== "none" ? base : "",
      `hue-rotate(${temperatureShift.toFixed(1)}deg)`,
      `saturate(${colorBoost.toFixed(2)})`,
      blurPx > 0 ? `blur(${blurPx.toFixed(1)}px)` : "",
    ].filter(Boolean);
    return filterParts.join(" ");
  }, [visualBackgroundBlur, visualColorAmount, visualLutPreset, visualWhiteBalance]);
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
    if (!activeCandidateSegmentId) return;
    if (!editableTranscriptSegments.some((segment) => segment.segment_id === activeCandidateSegmentId)) return;
    setSelectedSegmentId(activeCandidateSegmentId);
    setTranscriptSelectionAnchorSegmentId(activeCandidateSegmentId);
    setTranscriptSelectionFocusSegmentId(activeCandidateSegmentId);
  }, [activeCandidateSegmentId, editableTranscriptSegments]);
  useEffect(() => {
    imagePlacementDraftWindowsRef.current = imagePlacementDraftWindows;
  }, [imagePlacementDraftWindows]);
  const playheadSegment = resolvePlayheadSegment(editableTranscriptSegments, playheadSec);
  const transcriptDurationSec = resolveTranscriptDurationSec(editableTranscriptSegments);
  const playheadBoundaryTimesSec = useMemo(
    () => resolveTimelineBoundaryTimes(editableTranscriptSegments),
    [editableTranscriptSegments],
  );
  const sortedTimelineMarkers = useMemo(
    () => [...timelineMarkers].sort((left, right) => left.timeSec - right.timeSec),
    [timelineMarkers],
  );
  const markerTimesSec = useMemo(
    () => sortedTimelineMarkers.map((marker) => marker.timeSec),
    [sortedTimelineMarkers],
  );
  const sourceVisualPlacementItems = useMemo<HammerSourceImageItem[]>(() => (
    (editableVisualPlacements?.placements ?? [])
      .map((placement) => {
        const kind = deriveAssetKind({
          visualMode: placement.visual_mode,
          assetPath: placement.asset_path,
        });
        if (kind !== "image" && kind !== "broll" && kind !== "reference_clip") return null;
        return {
          id: placement.placement_id,
          label: placement.label ?? placement.asset_ref ?? placement.asset_path ?? placement.entry_id,
          kind,
          anchorSegmentId: placement.anchor_segment_id,
          startSec: imagePlacementDraftWindows[placement.placement_id]?.startSec ?? placement.start_sec,
          endSec: imagePlacementDraftWindows[placement.placement_id]?.endSec ?? placement.end_sec,
          status: placement.status,
          confidence: placement.confidence,
          visualMode: placement.visual_mode,
          assetPath: placement.asset_path,
        };
      })
      .filter((item): item is HammerSourceImageItem => Boolean(item))
  ), [editableVisualPlacements?.placements, imagePlacementDraftWindows]);
  const sourceImageItems = useMemo(
    () => sourceVisualPlacementItems.filter((item) => item.kind === "image"),
    [sourceVisualPlacementItems],
  );
  const sourceBrollPlacementItems = useMemo(
    () => sourceVisualPlacementItems.filter((item) => item.kind === "broll" || item.kind === "reference_clip"),
    [sourceVisualPlacementItems],
  );
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
  const selectedImagePlacement = useMemo(
    () => sourceVisualPlacementItems.find((item) => item.id === selectedImagePlacementId) ?? null,
    [selectedImagePlacementId, sourceVisualPlacementItems],
  );
  const selectedPlacementRecord = selectedImagePlacementId
    ? (visualPlacementsById.get(selectedImagePlacementId) ?? null)
    : null;
  const selectedImagePlacementTransform = useMemo(() => {
    if (!selectedImagePlacementId) return DEFAULT_IMAGE_PLACEMENT_TRANSFORM;
    const draft = imagePlacementTransforms[selectedImagePlacementId];
    if (draft) return draft;
    return geometryToTransform(resolvePlacementGeometry(selectedPlacementRecord));
  }, [imagePlacementTransforms, selectedImagePlacementId, selectedPlacementRecord]);
  const selectedImageAnimationPreset = resolvePlacementAnimationPreset(selectedPlacementRecord);
  const selectedImageAnimationLabel = IMAGE_ANIMATION_PRESET_OPTIONS.find(
    (option) => option.id === selectedImageAnimationPreset,
  )?.label ?? "None";

  useEffect(() => {
    if (!previewSurfaceRef.current) return;
    previewSurfaceRef.current.style.filter = visualPreviewFilter || "";
  }, [visualPreviewFilter]);

  const activePreviewOverlays = useMemo<HammerPreviewVisualOverlay[]>(() => (
    (editableVisualPlacements?.placements ?? [])
      .filter((placement) => isPlacementActiveAtPlayhead(placement, playheadSec))
      .map((placement, index) => {
        const kind = deriveAssetKind({
          visualMode: placement.visual_mode,
          assetPath: placement.asset_path,
        });
        if (kind !== "image" && kind !== "broll") return null;
        const animationPreset = resolvePlacementAnimationPreset(placement);
        return {
          placementId: placement.placement_id,
          label: placement.label ?? placement.asset_ref ?? placement.asset_path ?? placement.entry_id,
          kind,
          src: placement.asset_path ? (sourceDeskPreviewUrls[placement.asset_path] ?? null) : null,
          startSec: placement.start_sec,
          endSec: placement.end_sec,
          transform: geometryToTransform(resolvePlacementGeometry(placement)),
          animationPreset,
          zIndex: Math.round(Number.isFinite(placement.overlay_z_index ?? NaN) ? Number(placement.overlay_z_index) : index + 1),
          opacity: Math.max(0, Math.min(1, Number.isFinite(placement.overlay_opacity ?? NaN) ? Number(placement.overlay_opacity) : 1)),
          isSelected: placement.placement_id === selectedImagePlacementId,
        };
      })
      .filter((item): item is HammerPreviewVisualOverlay => Boolean(item))
      .sort((left, right) => left.zIndex - right.zIndex)
  ), [editableVisualPlacements?.placements, playheadSec, selectedImagePlacementId, sourceDeskPreviewUrls]);

  function applyPreviewOverlayStyle(node: HTMLDivElement | null, overlay: HammerPreviewVisualOverlay): void {
    if (!node) return;
    node.style.left = `${overlay.transform.leftPct}%`;
    node.style.top = `${overlay.transform.topPct}%`;
    node.style.width = `${overlay.transform.widthPct}%`;
    node.style.height = `${overlay.transform.heightPct}%`;
    node.style.zIndex = String(overlay.zIndex);
    node.style.opacity = String(overlay.opacity);
  }

  useEffect(() => {
    if (!selectedImagePlacementId) return;
    if (sourceVisualPlacementItems.some((item) => item.id === selectedImagePlacementId)) return;
    setSelectedImagePlacementId(null);
  }, [selectedImagePlacementId, sourceVisualPlacementItems]);
  useEffect(() => {
    if (currentPass !== "image_placement" && currentPass !== "image_animation") return;
    if (selectedImagePlacementId) return;
    const firstItem = sourceImageItems[0] ?? null;
    if (!firstItem) return;
    setSelectedImagePlacementId(firstItem.id);
  }, [currentPass, selectedImagePlacementId, sourceImageItems]);
  useEffect(() => {
    for (const overlay of activePreviewOverlays) {
      if (overlay.kind !== "broll") continue;
      const node = previewBrollVideoRefs.current.get(overlay.placementId) ?? null;
      if (!node) continue;
      const localTime = Math.max(0, playheadSec - overlay.startSec);
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
  }, [activePreviewOverlays, isPlaybackActive, isScrubbing, playheadSec, scrubRate]);
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
  const introOutroCandidateItems = useMemo(
    () => storedMediaFiles.filter((file) => file.kind === "broll" || file.kind === "reference_clip" || file.kind === "audio" || file.kind === "other"),
    [storedMediaFiles],
  );
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
      selected: item.id === selectedImagePlacementId,
      tone: "image",
      onSelect: () => {
        selectionOriginRef.current = "timeline";
        setFocusOverride("time-focus");
        setSelectedImagePlacementId(item.id);
        setSelectedSegmentId(item.anchorSegmentId);
        setTranscriptSelectionAnchorSegmentId(item.anchorSegmentId);
        setTranscriptSelectionFocusSegmentId(item.anchorSegmentId);
        seekPlayheadToTime(item.startSec, "playhead");
      },
    }))
  ), [selectedImagePlacementId, sourceImageItems]);
  const brollLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    sourceBrollPlacementItems
      .map((item) => ({
        id: `broll-placement:${item.id}`,
        placementId: item.id,
        label: item.label,
        startSec: item.startSec,
        endSec: item.endSec,
        selected: item.id === selectedImagePlacementId,
        tone: "broll",
        onSelect: () => {
          selectionOriginRef.current = "timeline";
          setFocusOverride("time-focus");
          setSelectedImagePlacementId(item.id);
          setSelectedSegmentId(item.anchorSegmentId);
          setTranscriptSelectionAnchorSegmentId(item.anchorSegmentId);
          setTranscriptSelectionFocusSegmentId(item.anchorSegmentId);
          seekPlayheadToTime(item.startSec, "playhead");
        },
      }))
  ), [selectedImagePlacementId, sourceBrollPlacementItems]);
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
      audioPolish: props.audioPolish ?? null,
      mediaRef,
      mediaSourceLabel,
    }),
    [
      mediaRef,
      mediaSourceLabel,
      props.audioPolish,
      workspaceStructuredTranscript,
    ],
  );
  const preferredPlayback = mediaPrepOutputs.audio.preferred_playback;
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
      studioRack: editableStudioRack,
      editorialAuthorityGraph: editableEditorialAuthorityGraph,
      outputSelection: editableOutputSelection,
      selectedSegmentId,
      playheadSec,
      transcriptTimingHint,
    });
  }

  function applyWorkspaceState(nextState: HammerEditorStateSerializable): void {
    const normalized = toShellState(nextState);
    setEditableTranscriptSegments(normalized.segments);
    setEditableVisualPlacements(normalized.visualPlacements);
    setEditableStudioRack(normalized.studioRack);
    setEditableEditorialAuthorityGraph(normalized.editorialAuthorityGraph);
    setEditableOutputSelection(normalized.outputSelection);
    setSelectedSegmentId(normalized.selectedSegmentId);
    setPlayheadSec(normalized.playheadSec);
    setTranscriptTimingHint(normalized.transcriptTimingHint);
    setCleanupPreview(null);
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

    const result = await saveHammerHistoryDocument({
      workpieceId: launchContext.workpiece_id,
      document: controller.document,
    });
    if (!result.ok) {
      setHistoryStatus(result.error);
      return;
    }
    setHistoryStatus(null);

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
    const after = cloneEditorState(args.computeAfter(cloneEditorState(before)));

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

  useEffect(() => {
    let active = true;
    clearPersistTimer();
    snapshotManifestRef.current = null;
    lastSnapshottedHeadEntryIdRef.current = null;

    const synced = syncEditableTranscriptSegments(transcriptSegments, selectedSegmentId);
    const baselineOutputSelection = resolveOutputSelectionFromTranscript(props.structuredTranscript ?? null);
    const baselineEditPlan = launchContext.edit_plan
      ? {
        ...launchContext.edit_plan,
        instructions: launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
      }
      : createFallbackEditPlan(launchContext, transcriptSourceId, previewMode);
    const baselineAuthorityGraph = projectEditorialAuthorityGraphFromEditPlan({
      editPlan: baselineEditPlan,
      workspaceId: launchContext.workspace_id,
      workpieceId: launchContext.workpiece_id,
      sessionId: launchContext.session_id ?? baselineEditPlan.session_id ?? `${launchContext.workpiece_id}:session`,
    });
    const baselineState = toEditorState({
      segments: synced.segments,
      visualPlacements: props.visualPlacements ?? null,
      studioRack: createDefaultHammerStudioRackState(),
      editorialAuthorityGraph: baselineAuthorityGraph,
      outputSelection: baselineOutputSelection,
      selectedSegmentId: synced.selectedSegmentId,
      playheadSec: Math.max(0, Math.min(playheadSec, resolveTranscriptDurationSec(synced.segments))),
      transcriptTimingHint: null,
    });
    historyBaselineStateRef.current = cloneEditorState(baselineState);
    baselineDerivedLayersRef.current = cloneHammerDerivedTextLayers(props.structuredTranscript?.derived_text_layers);
    const baseRevisionId = hashEditorState(baselineState);

    historyControllerRef.current = createHammerHistoryController({
      document: createHammerHistoryDocument({
        workpieceId: launchContext.workpiece_id,
        sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
        baseRevisionId,
      }),
      initialState: baselineState,
      maxUndoSteps: HISTORY_MAX_SIZE,
    });

    applyWorkspaceState(baselineState);
    selectionOriginRef.current = "system";
    setTimelineMarkers([]);
    setSelectedImagePlacementId(null);
    setImagePlacementDraftWindows({});
    setTimelineImageDragState(null);
    setImagePlacementTransforms({});
    setPreviewCanvasDragState(null);
    setImageAnimationContextMenu(null);
    setEditableDerivedTextLayers(cloneHammerDerivedTextLayers(props.structuredTranscript?.derived_text_layers));
    derivedLayerHistoryRef.current.clear();
    setCaptionBuildState(null);
    setCaptionEditedState(null);
    setActiveCaptionArtifactMode("built");
    setAudioFinalizationCompareMode("after");
    setPackagingLogoAssetPath(null);
    setPackagingLogoPosition("top_right");
    setPackagingLogoSize("medium");
    setCaptionBuildFeedback(null);

    void (async () => {
      const [historyResult, snapshotManifestResult] = await Promise.all([
        loadHammerHistoryDocument(launchContext.workpiece_id),
        loadHammerSnapshotManifest(launchContext.workpiece_id),
      ]);
      if (!active) return;

      let snapshotRecoveryStatus: string | null = null;
      if (!snapshotManifestResult.ok) {
        snapshotManifestRef.current = null;
        lastSnapshottedHeadEntryIdRef.current = null;
        snapshotRecoveryStatus = "Snapshot fallback: manifest unavailable. Opened with full history replay.";
      } else {
        snapshotManifestRef.current = snapshotManifestResult.exists ? (snapshotManifestResult.data ?? null) : null;
        lastSnapshottedHeadEntryIdRef.current = resolveActiveSnapshotHeadEntryId(snapshotManifestRef.current);
      }

      if (!historyResult.ok) {
        setHistoryStatus(historyResult.error);
        return;
      }
      if (!historyResult.exists || !historyResult.data) {
        setHistoryStatus(snapshotRecoveryStatus);
        return;
      }

      const loaded = normalizeHammerHistoryDocument(historyResult.data, {
        workpieceId: launchContext.workpiece_id,
        sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
        baseRevisionId,
      });

      if (loaded.baseRevisionId !== baseRevisionId) {
        setHistoryStatus("History base revision mismatch detected. Opened baseline without replay.");
        return;
      }

      const controller = createHammerHistoryController({
        document: loaded,
        initialState: baselineState,
        maxUndoSteps: HISTORY_MAX_SIZE,
      });
      let replayed = controller.getReplayStateFromBaseline(baselineState);

      const manifest = snapshotManifestRef.current;
      const activeSnapshotRef = manifest?.activeSnapshotRef ?? null;
      if (activeSnapshotRef) {
        const activeSnapshotEntry = manifest?.snapshots.find((entry) => entry.snapshotRef === activeSnapshotRef) ?? null;
        if (!activeSnapshotEntry) {
          snapshotRecoveryStatus = "Snapshot fallback: active snapshot missing from manifest. Opened with full history replay.";
        } else {
          const snapshotPayloadResult = await loadHammerSnapshotPayload({
            workpieceId: launchContext.workpiece_id,
            snapshotRef: activeSnapshotRef,
          });
          if (!active) return;
          if (!snapshotPayloadResult.ok) {
            snapshotRecoveryStatus = "Snapshot fallback: payload unavailable. Opened with full history replay.";
          } else if (!snapshotPayloadResult.exists || !snapshotPayloadResult.data) {
            snapshotRecoveryStatus = "Snapshot fallback: payload missing. Opened with full history replay.";
          } else {
            const snapshot = snapshotPayloadResult.data;
            const workpieceMatches = snapshot.workpieceId === launchContext.workpiece_id;
            const baseRevisionMatches = snapshot.baseRevisionId === baseRevisionId;
            const headExistsInLedger = snapshot.headEntryId == null || loaded.undoStack.includes(snapshot.headEntryId);
            if (!workpieceMatches || !baseRevisionMatches || !headExistsInLedger) {
              const reason = !workpieceMatches
                ? "workpiece mismatch"
                : !baseRevisionMatches
                ? "base revision mismatch"
                : "snapshot head not found in ledger";
              snapshotRecoveryStatus = `Snapshot fallback: ${reason}. Opened with full history replay.`;
            } else {
              replayed = controller.getReplayStateFromBaseline(
                snapshot.editorState,
                snapshot.headEntryId,
              );
              snapshotRecoveryStatus = null;
            }
          }
        }
      }

      controller.replaceState(replayed);
      historyControllerRef.current = controller;
      applyWorkspaceState(replayed);
      setHistoryStatus(snapshotRecoveryStatus);
    })().catch((error) => {
      if (!active) return;
      setHistoryStatus(toErrorMessage(error, "Hammer could not recover persistent history."));
    });

    return () => {
      active = false;
      clearPersistTimer();
    };
  }, [launchContext.workpiece_id, structuredTranscriptResetKey, transcriptSourceId, visualPlacementsResetKey]);

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

    const playbackTarget = resolvePlaybackWindowProgress(playheadSec).nextPlayheadSec;
    const targetTime = Math.max(0, Math.min(playbackTarget, transcriptDurationSec > 0 ? transcriptDurationSec : playbackTarget));
    const shouldSynchronizeCurrentTime = srcChanged || !isPlaybackActive || isScrubbing;
    if (shouldSynchronizeCurrentTime && Math.abs(previewAudio.currentTime - targetTime) > SCRUB_SEEK_THRESHOLD_SEC) {
      previewAudio.currentTime = targetTime;
    }

    if (!isPlaybackActive) {
      previewAudio.pause();
      return;
    }

    claimGlobalPlaybackAuthority(previewAudio);
    void previewAudio.play().catch(() => {
      setIsPlaybackActive(false);
    });
  }, [claimGlobalPlaybackAuthority, isPlaybackActive, isScrubbing, playbackMediaSrc, playheadSec, transcriptDurationSec, playbackWindow]);

  useEffect(() => () => {
    const previewAudio = previewAudioRef.current;
    previewAudio?.pause();
    releaseGlobalPlaybackAuthority(previewAudio);
    pauseAuxiliaryMediaPlayback();
  }, [pauseAuxiliaryMediaPlayback, releaseGlobalPlaybackAuthority]);

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
        const effectiveNext = resolveEffectivePlaybackTime(editableTranscriptSegments, next);
        const windowProgress = resolvePlaybackWindowProgress(effectiveNext);
        if (windowProgress.shouldStop) {
          window.clearInterval(intervalId);
          setIsPlaybackActive(false);
          if (playbackWindow?.mode === "roll") {
            setPlaybackWindow(null);
          }
        }
        if (!playbackWindow && effectiveNext >= transcriptDurationSec) {
          window.clearInterval(intervalId);
          setIsPlaybackActive(false);
        }
        return roundToTenth(windowProgress.nextPlayheadSec);
      });
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    editableTranscriptSegments,
    isPlaybackActive,
    playbackMediaSrc,
    playbackWindow,
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
      const deltaSec = roundToTenth((event.clientX - timelineImageDragState.pointerStartX) * timelineImageDragState.pxToSec);
      const originalDuration = Math.max(
        MIN_IMAGE_PLACEMENT_DURATION_SEC,
        roundToTenth(timelineImageDragState.originEndSec - timelineImageDragState.originStartSec),
      );

      let startSec = timelineImageDragState.originStartSec;
      let endSec = timelineImageDragState.originEndSec;
      if (timelineImageDragState.mode === "move") {
        const tentativeStart = roundToTenth(timelineImageDragState.originStartSec + deltaSec);
        const maxStart = Math.max(0, roundToTenth(timelineDurationSec - originalDuration));
        startSec = Math.max(0, Math.min(maxStart, tentativeStart));
        endSec = Math.min(timelineDurationSec, roundToTenth(startSec + originalDuration));
      } else if (timelineImageDragState.mode === "resize_start") {
        const maxStart = roundToTenth(timelineImageDragState.originEndSec - MIN_IMAGE_PLACEMENT_DURATION_SEC);
        startSec = Math.max(0, Math.min(maxStart, roundToTenth(timelineImageDragState.originStartSec + deltaSec)));
        endSec = timelineImageDragState.originEndSec;
      } else {
        const minEnd = roundToTenth(timelineImageDragState.originStartSec + MIN_IMAGE_PLACEMENT_DURATION_SEC);
        endSec = Math.max(minEnd, Math.min(timelineDurationSec, roundToTenth(timelineImageDragState.originEndSec + deltaSec)));
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
        intro_path: null,
        outro_path: null,
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

  useEffect(() => {
    let active = true;
    const nextUrls: Record<string, string> = {};
    const nextFailures: Record<string, true> = {};
    const previewPaths = sourceDeskPreviewFetchPaths;

    if (sourceDeskPreviewPaths.length > SOURCE_DESK_PREVIEW_MAX_ITEMS) {
      console.info("Hammer Source Desk preview load capped", {
        workpieceId: launchContext.workpiece_id,
        requested: sourceDeskPreviewPaths.length,
        loaded: previewPaths.length,
      });
    }

    async function loadPreviewBatch(paths: string[]): Promise<void> {
      await Promise.all(paths.map(async (path) => {
        try {
          const url = await loadWorkpieceMediaPreviewUrl({
            workpieceId: launchContext.workpiece_id,
            path,
          });
          nextUrls[path] = url;
        } catch (error) {
          nextFailures[path] = true;
          const diagnostics = readHammerMediaPreviewErrorDiagnostics(error);
          console.warn("Hammer Source Desk preview unavailable", {
            workpieceId: launchContext.workpiece_id,
            originalPath: diagnostics?.originalPath ?? path,
            normalizedPath: diagnostics?.normalizedPath
              ?? normalizeWorkpieceRelativePath(launchContext.workpiece_id, path),
            status: diagnostics?.status ?? null,
            error,
          });
        }
      }));
    }

    void (async () => {
      for (let index = 0; index < previewPaths.length; index += SOURCE_DESK_PREVIEW_FETCH_CONCURRENCY) {
        if (!active) break;
        const batch = previewPaths.slice(index, index + SOURCE_DESK_PREVIEW_FETCH_CONCURRENCY);
        await loadPreviewBatch(batch);
      }

      if (!active) {
        for (const url of Object.values(nextUrls)) URL.revokeObjectURL(url);
        return;
      }
      setSourceDeskPreviewUrls((previous) => {
        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(nextUrls);
        const unchanged = previousKeys.length === nextKeys.length
          && nextKeys.every((key) => previous[key] === nextUrls[key]);
        if (unchanged) return previous;
        for (const url of Object.values(previous)) URL.revokeObjectURL(url);
        return nextUrls;
      });
      setSourceDeskPreviewFailures((previous) => {
        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(nextFailures);
        const unchanged = previousKeys.length === nextKeys.length
          && nextKeys.every((key) => previous[key] === nextFailures[key]);
        return unchanged ? previous : nextFailures;
      });
    })();

    return () => {
      active = false;
    };
  }, [launchContext.workpiece_id, sourceDeskPreviewFetchKey]);

  useEffect(() => () => {
    for (const url of Object.values(sourceDeskPreviewUrls)) URL.revokeObjectURL(url);
  }, [sourceDeskPreviewUrls]);

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
    selectionOriginRef.current = origin;
    setPlayheadSec(snapped);
    setFocusOverride(resolveFocusAfterPlayheadChange(focusOverride));
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

        const currentPlacements = before.visualPlacements;
        const remappedPlacements = currentPlacements
          ? currentPlacements.placements.flatMap((placement) => {
            const operationId = placement.authority_operation_id;
            if (!operationId) return [placement];
            if (remapped.summary.removedOperationIds.includes(operationId)) {
              return [];
            }
            if (!remapped.summary.adjustedOperationIds.includes(operationId)) {
              return [placement];
            }
            const placementRemap = remapPlacementForRippleDelete({
              startSec: placement.start_sec,
              endSec: placement.end_sec,
              removedStartSec: cut.removedStartSec ?? 0,
              removedEndSec: cut.removedEndSec ?? 0,
            });
            if (placementRemap.kind === "removed") {
              return [];
            }
            return [{
              ...placement,
              start_sec: placementRemap.startSec,
              end_sec: placementRemap.endSec,
              status: placementRemap.needsAttention ? "uncertain" : placement.status,
              uncertainty_flags: placementRemap.needsAttention
                ? Array.from(new Set([...placement.uncertainty_flags, "timeline_remap_review"]))
                : placement.uncertainty_flags,
            }];
          })
          : null;

        const nextSelection = resolveSelectedSegmentAfterDelete({
          segmentsAfterDelete: cut.segments,
          removedIndex: cut.removedStartIndex,
        });

        return {
          ...before,
          transcriptSegments: cut.segments,
          editorialAuthorityGraph: remapped.graph,
          selectedSegmentId: nextSelection,
          visualPlacements: currentPlacements
            ? {
              ...currentPlacements,
              placements: remappedPlacements ?? currentPlacements.placements,
            }
            : before.visualPlacements,
          playheadSec: resolvePlayheadAfterRangeCut({
            playheadSec: before.playheadSec,
            removedStartSec: cut.removedStartSec,
            removedEndSec: cut.removedEndSec,
            shiftSec: cut.shiftSec,
          }),
          transcriptTimingHint: null,
        };
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

  function buildCandidateCardsFromPreview(
    kind: HammerCandidateReviewKind,
    preview: HammerCleanupPreview,
  ): HammerCandidateCard[] {
    const beforeById = new Map(editableTranscriptSegments.map((segment) => [segment.segment_id, segment] as const));
    const afterById = new Map(preview.resultSegments.map((segment) => [segment.segment_id, segment] as const));
    const cards: HammerCandidateCard[] = [];
    for (const suggestion of preview.suggestions) {
      const matchesKind = kind === "fillers"
        ? suggestion.type === "filler_remove"
        : suggestion.type === "retake_remove";
      if (!matchesKind) continue;
      const before = beforeById.get(suggestion.segmentId);
      if (!before) continue;
      const after = afterById.get(suggestion.segmentId) ?? null;
      cards.push({
        id: suggestion.id,
        kind,
        segmentId: suggestion.segmentId,
        description: suggestion.description,
        beforeText: before.text,
        afterText: after ? after.text : null,
        confidence: suggestion.confidence,
        timeSavedSec: suggestion.timeSavedSec,
      });
    }
    return cards;
  }

  function refreshCandidateQueue(kind: HammerCandidateReviewKind): void {
    const preview = kind === "fillers"
      ? previewRemoveFillers(editableTranscriptSegments, fillerCleanupOptions)
      : previewRemoveRetakes(editableTranscriptSegments, retakeCleanupOptions);
    const cards = buildCandidateCardsFromPreview(kind, preview);
    setCandidateCards(cards);
    setActiveCandidateIndex(0);
    setCleanupPreview(preview);
    setCleanupReceipt(null);
    setTranscriptTimingHint(cards.length === 0
      ? `No ${kind === "fillers" ? "filler" : "retake"} candidates detected in this pass.`
      : null);
  }

  function handleCandidateDecision(approve: boolean): void {
    const card = activeCandidateCard;
    if (!card) return;
    if (approve) {
      applyHistoryMutation({
        label: card.kind === "fillers" ? "Approve filler removal" : "Approve retake removal",
        kind: "cleanup_tool",
        toolId: "polish",
        affectedSegments: [card.segmentId],
        immediatePersist: true,
        computeAfter: (before) => {
          let nextSegments = before.transcriptSegments;
          if (card.afterText == null) {
            nextSegments = before.transcriptSegments.filter((segment) => segment.segment_id !== card.segmentId);
          } else {
            nextSegments = updateSegmentInTimeline(before.transcriptSegments, card.segmentId, (segment) => ({
              ...segment,
              text: card.afterText ?? segment.text,
            }));
          }
          const synced = syncEditableTranscriptSegments(nextSegments, before.selectedSegmentId);
          return {
            ...before,
            transcriptSegments: synced.segments,
            selectedSegmentId: synced.selectedSegmentId,
            transcriptTimingHint: null,
          };
        },
      });
      window.setTimeout(() => {
        refreshCandidateQueue(card.kind);
      }, 0);
    }
    setCandidateCards((previous) => previous.filter((item) => item.id !== card.id));
    setActiveCandidateIndex((previous) => Math.max(0, previous - (previous > 0 ? 1 : 0)));
  }

  function applyGapPacingAuto(): void {
    const preview = previewShortenGaps(editableTranscriptSegments, gapCleanupOptions);
    const signature = stableHashToken(JSON.stringify({
      pass: currentPass,
      options: gapCleanupOptions,
      summary: preview.summary,
    }));
    if (signature === lastGapAutoApplySignatureRef.current) return;
    lastGapAutoApplySignatureRef.current = signature;
    if (preview.suggestions.length === 0) {
      setTranscriptTimingHint("Gap/Pacing is already within the selected max pause length.");
      return;
    }
    const applied = applyHistoryMutation({
      label: "Auto apply gap pacing",
      kind: "timing_adjustment",
      toolId: "polish",
      affectedSegments: preview.suggestions.map((suggestion) => suggestion.segmentId),
      immediatePersist: true,
      computeAfter: (before) => {
        const synced = syncEditableTranscriptSegments(preview.resultSegments, before.selectedSegmentId);
        return {
          ...before,
          transcriptSegments: synced.segments,
          selectedSegmentId: synced.selectedSegmentId,
          transcriptTimingHint: null,
        };
      },
    });
    if (!applied) return;
    setCleanupReceipt(buildPolishResultSummaryFromCleanupPreview(preview));
    setCleanupPreview(null);
    setTranscriptTimingHint(`Gap pacing applied to ${preview.summary.changedSegments} segment${preview.summary.changedSegments === 1 ? "" : "s"}.`);
  }

  useEffect(() => {
    if (currentPass === "transcript_cleanup") {
      refreshCandidateQueue("fillers");
      return;
    }
    if (currentPass === "retakes") {
      refreshCandidateQueue("retakes");
      return;
    }
    setCandidateCards([]);
    setActiveCandidateIndex(0);
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
    if (currentPass !== "gap_pacing") return;
    const timerId = window.setTimeout(() => {
      applyGapPacingAuto();
    }, 180);
    return () => window.clearTimeout(timerId);
  }, [currentPass, gapCleanupOptions, editableTranscriptSegments]);
  useEffect(() => {
    if (candidateCards.length === 0 && activeCandidateIndex !== 0) {
      setActiveCandidateIndex(0);
      return;
    }
    if (activeCandidateIndex >= candidateCards.length && candidateCards.length > 0) {
      setActiveCandidateIndex(candidateCards.length - 1);
    }
  }, [activeCandidateIndex, candidateCards.length]);

  function handlePlaybackProgress(nextTimeSec: number): void {
    const effectiveNext = resolveEffectivePlaybackTime(editableTranscriptSegments, nextTimeSec);
    const windowProgress = resolvePlaybackWindowProgress(effectiveNext);
    const nextPlayhead = roundToTenth(windowProgress.nextPlayheadSec);

    setPlayheadSec((current) => (
      Math.abs(current - nextPlayhead) >= SCRUB_SEEK_THRESHOLD_SEC ? nextPlayhead : current
    ));

    if (windowProgress.shouldLoop && previewAudioRef.current) {
      previewAudioRef.current.currentTime = nextPlayhead;
      return;
    }

    if (windowProgress.shouldStop) {
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
    applyHistoryMutation({
      label: args.label,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;
        const nextPlacements = current.placements.map((placement) => {
          if (placement.placement_id !== placementId) return placement;
          const clampedStart = Math.max(0, Math.min(timelineDurationSec, roundToTenth(args.startSec)));
          const clampedEnd = Math.max(
            roundToTenth(clampedStart + MIN_IMAGE_PLACEMENT_DURATION_SEC),
            Math.min(timelineDurationSec, roundToTenth(args.endSec)),
          );
          return {
            ...placement,
            start_sec: clampedStart,
            end_sec: clampedEnd,
          };
        });

        return {
          ...before,
          visualPlacements: {
            ...current,
            placements: nextPlacements,
          },
        };
      },
    });
  }

  function updateVisualPlacementTiming(placementId: string, deltaSec: number): void {
    const placement = sourceVisualPlacementItems.find((item) => item.id === placementId) ?? null;
    if (!placement) return;
    const duration = Math.max(MIN_IMAGE_PLACEMENT_DURATION_SEC, roundToTenth(placement.endSec - placement.startSec));
    const nextStart = Math.max(0, roundToTenth(placement.startSec + deltaSec));
    const maxStart = Math.max(0, roundToTenth(timelineDurationSec - duration));
    const clampedStart = Math.min(nextStart, maxStart);
    const nextEnd = Math.min(timelineDurationSec, roundToTenth(clampedStart + duration));
    commitVisualPlacementWindow(placementId, {
      startSec: clampedStart,
      endSec: nextEnd,
      label: "Adjust visual placement timing",
    });
  }

  function updateImagePlacementTransform(
    placementId: string,
    updater: (current: HammerImagePlacementTransform) => HammerImagePlacementTransform,
  ): void {
    setImagePlacementTransforms((current) => {
      const base = current[placementId]
        ?? geometryToTransform(resolvePlacementGeometry(visualPlacementsById.get(placementId)));
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
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;
        return {
          ...before,
          visualPlacements: {
            ...current,
            placements: current.placements.map((placement) => (
              placement.placement_id === placementId
                ? {
                  ...placement,
                  overlay_geometry: nextGeometry,
                }
                : placement
            )),
          },
        };
      },
    });
  }

  function beginTimelineImagePlacementDrag(
    event: MouseEvent<SVGGElement | SVGRectElement>,
    args: {
      placementId: string;
      mode: HammerTimelineImageDragState["mode"];
      startSec: number;
      endSec: number;
    },
  ): void {
    if (currentPass !== "image_placement") return;
    if (event.button !== 0) return;
    const trackRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
      ?? event.currentTarget.getBoundingClientRect();
    if (trackRect.width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    setFocusOverride("time-focus");
    setSelectedImagePlacementId(args.placementId);
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
    if (currentPass !== "image_placement") return;
    if (event.button !== 0) return;
    const activeTransform = imagePlacementTransforms[args.placementId]
      ?? geometryToTransform(resolvePlacementGeometry(visualPlacementsById.get(args.placementId)));
    event.preventDefault();
    event.stopPropagation();
    setFocusOverride("tool-focus");
    setSelectedImagePlacementId(args.placementId);
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
    setSelectedImagePlacementId(placementId);
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
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;
        return {
          ...before,
          visualPlacements: {
            ...current,
            placements: current.placements.map((placement) => (
              placement.placement_id === placementId
                ? {
                  ...placement,
                  animation_preset: preset,
                }
                : placement
            )),
          },
        };
      },
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
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;

        return {
          ...before,
          visualPlacements: {
            ...current,
            placements: current.placements.filter((item) => item.placement_id !== placementId),
          },
        };
      },
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
        const current = before.visualPlacements;
        if (!current) return before;

        const anchorSegment = before.selectedSegmentId
          ? before.transcriptSegments.find((segment) => segment.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;

        const nextStart = Math.max(0, roundToTenth(before.playheadSec));
        const nextEnd = Math.max(nextStart + 0.5, Math.min(transcriptDurationSec, roundToTenth(nextStart + 3)));
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
          overlay_z_index: current.placements.length + 1,
        };

        return {
          ...before,
          selectedSegmentId: anchorSegment.segment_id,
          visualPlacements: {
            ...current,
            placements: [...current.placements, nextPlacement],
          },
        };
      },
    });
  }

  function upsertPackagingPlacement(args: {
    entryId: string;
    assetPath: string;
    label: string;
    startSec: number;
    endSec: number;
    visualMode: string;
    uncertaintyFlags?: string[];
    overlayGeometry?: HammerVisualPlacementGeometry;
  }): void {
    applyHistoryMutation({
      label: `Apply ${args.label}`,
      kind: "visual_adjustment",
      toolId: "finishing",
      immediatePersist: true,
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;
        const anchorSegment = before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;
        const hasExisting = current.placements.some((placement) => placement.entry_id === args.entryId);
        const placementId = hasExisting
          ? current.placements.find((placement) => placement.entry_id === args.entryId)?.placement_id ?? createVisualPlacementId()
          : createVisualPlacementId();
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
          overlay_z_index: current.placements.length + 1,
        };
        const basePlacements = current.placements.filter((placement) => placement.entry_id !== args.entryId);
        return {
          ...before,
          visualPlacements: {
            ...current,
            placements: [...basePlacements, nextPlacement],
          },
        };
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
        const current = before.visualPlacements;
        if (!current) return before;
        return {
          ...before,
          visualPlacements: {
            ...current,
            placements: current.placements.filter((placement) => placement.entry_id !== entryId),
          },
        };
      },
    });
  }

  function applyIntroPlacement(): void {
    if (!introOutroSelection.intro_path) {
      setTranscriptTimingHint("Select an intro asset first in Intro/Outro Source Desk.");
      return;
    }
    const introDurationSec = Math.min(6, Math.max(2, roundToTenth(Math.max(2, transcriptDurationSec * 0.1))));
    upsertPackagingPlacement({
      entryId: PACKAGING_INTRO_ENTRY_ID,
      assetPath: introOutroSelection.intro_path,
      label: "Packaging Intro",
      startSec: 0,
      endSec: introDurationSec,
      visualMode: "packaging_intro",
      uncertaintyFlags: ["packaging:intro"],
    });
  }

  function applyOutroPlacement(): void {
    if (!introOutroSelection.outro_path) {
      setTranscriptTimingHint("Select an outro asset first in Intro/Outro Source Desk.");
      return;
    }
    const outroDurationSec = Math.min(6, Math.max(2, roundToTenth(Math.max(2, transcriptDurationSec * 0.1))));
    const startSec = Math.max(0, roundToTenth(transcriptDurationSec - outroDurationSec));
    upsertPackagingPlacement({
      entryId: PACKAGING_OUTRO_ENTRY_ID,
      assetPath: introOutroSelection.outro_path,
      label: "Packaging Outro",
      startSec,
      endSec: transcriptDurationSec,
      visualMode: "packaging_outro",
      uncertaintyFlags: ["packaging:outro"],
    });
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

  function insertBrollFromLibrary(args: {
    assetPath: string;
    label: string;
  }): void {
    const placementId = createVisualPlacementId();

    applyHistoryMutation({
      label: "Insert b-roll",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;
        const anchorSegment = before.selectedSegmentId
          ? before.transcriptSegments.find((segment) => segment.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;

        const nextStart = Math.max(0, roundToTenth(before.playheadSec));
        const nextEnd = Math.max(nextStart + 0.5, Math.min(transcriptDurationSec, roundToTenth(nextStart + 3)));
        const brollPlacement: HammerVisualPlacementRecord = {
          placement_id: placementId,
          authority_operation_id: undefined,
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
          start_sec: nextStart,
          end_sec: nextEnd,
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
          overlay_z_index: current.placements.length + 1,
        };

        const brollInstruction = createInsertBrollInstruction({
          segmentId: anchorSegment.segment_id,
          assetRef: args.assetPath,
          startSec: nextStart,
          endSec: nextEnd,
          intentSource: "manual",
          intentDescription: args.label,
          assetBindingState: "resolved",
          duckPreference: "auto",
        });
        const withBroll = appendAuthorityInstructionForState(before, brollInstruction);
        const brollOperationId = withBroll.operations.at(-1)?.operation_id ?? null;
        const duckInstruction = createAudioDuckInstruction({
          segmentId: anchorSegment.segment_id,
          startSec: nextStart,
          endSec: nextEnd,
          duckGainDb: -9,
          linkedBrollOperationId: brollOperationId,
        });
        const withDuck = appendAuthorityInstructionToGraph({
          graph: withBroll,
          instruction: duckInstruction,
          fallback: {
            graphId: `${launchContext.workpiece_id}:authority`,
            workspaceId: launchContext.workspace_id,
            workpieceId: launchContext.workpiece_id,
            sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
            sourceTranscriptId: transcriptSourceId,
          },
        });
        const duckOperationId = withDuck.operations.at(-1)?.operation_id ?? null;
        const withLinkedDuck = brollOperationId
          ? (updateResolvedInsertBrollOperationInGraph({
            graph: withDuck,
            operationId: brollOperationId,
            changes: {
              companion_audio_duck_operation_id: duckOperationId,
            },
          }) ?? withDuck)
          : withDuck;

        brollPlacement.authority_operation_id = brollOperationId ?? undefined;
        return {
          ...before,
          editorialAuthorityGraph: withLinkedDuck,
          selectedSegmentId: anchorSegment.segment_id,
          visualPlacements: {
            ...current,
            placements: [...current.placements, brollPlacement],
          },
        };
      },
    });
  }

  function ingestHearthBrollSuggestion(): void {
    const anchorSegment = selectedSegment ?? editableTranscriptSegments[0] ?? null;
    if (!anchorSegment) {
      setTranscriptTimingHint("Cannot ingest B-roll suggestion without transcript segments.");
      return;
    }
    const suggestionStart = Math.max(0, roundToTenth(playheadSec));
    const suggestionEnd = Math.max(suggestionStart + 0.5, Math.min(transcriptDurationSec, roundToTenth(suggestionStart + 3)));
    const suggestion = createHearthBrollSuggestionInstruction({
      segmentId: anchorSegment.segment_id,
      intentRef: `hearth-suggestion:${Date.now().toString(36)}`,
      intentDescription: `B-roll suggestion near "${anchorSegment.text.slice(0, 48)}"`,
      startSec: suggestionStart,
      endSec: suggestionEnd,
      duckPreference: "auto",
    });
    applyHistoryMutation({
      label: "Ingest Hearth B-roll suggestion",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => ({
        ...before,
        editorialAuthorityGraph: appendAuthorityInstructionForState(before, suggestion),
      }),
    });
  }

  function updatePlacementKindFromMediaMap(placementId: string, nextType: HammerMediaMapSuggestionType): void {
    applyHistoryMutation({
      label: `Change visual type to ${nextType === "reference_clip" ? "Reference Clip" : "B-roll"}`,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;
        const nextPlacements = current.placements.map((placement) => (
          placement.placement_id === placementId
            ? {
              ...placement,
              visual_mode: nextType === "reference_clip" ? "reference_clip" : "broll",
              label: placement.label ?? (nextType === "reference_clip" ? "Reference Clip" : "B-roll"),
            }
            : placement
        ));
        return {
          ...before,
          visualPlacements: {
            ...current,
            placements: nextPlacements,
          },
        };
      },
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
          const current = before.visualPlacements;
          if (!current) return before;
          const segment = before.transcriptSegments.find((item) => item.segment_id === beat.segmentId) ?? null;
          if (!segment) return before;
          const startSec = Math.max(0, roundToTenth(segment.start_sec));
          const endSec = Math.max(startSec + 0.5, roundToTenth(Math.min(transcriptDurationSec, segment.end_sec + 1.2)));
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
            overlay_z_index: current.placements.length + 1,
          };
          const existingIndex = current.placements.findIndex((item) => item.placement_id === referencePlacementId);
          const nextPlacements = existingIndex >= 0
            ? current.placements.map((item, index) => (index === existingIndex ? nextRecord : item))
            : [...current.placements, nextRecord];
          return {
            ...before,
            selectedSegmentId: segment.segment_id,
            visualPlacements: {
              ...current,
              placements: nextPlacements,
            },
          };
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
        const current = before.visualPlacements;
        const graph = before.editorialAuthorityGraph;
        if (!current || !graph) return before;
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
          overlay_z_index: current.placements.length + 1,
        };

        return {
          ...before,
          editorialAuthorityGraph: nextGraph,
          visualPlacements: {
            ...current,
            placements: [...current.placements, brollPlacement],
          },
        };
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
        const current = before.visualPlacements;
        if (!graph || !current) return before;
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
        const nextPlacements = current.placements.map((placement) => {
          if (placement.authority_operation_id !== operationId) return placement;
          return {
            ...placement,
            start_sec: nextStart,
            end_sec: nextEnd,
          };
        });
        return {
          ...before,
          editorialAuthorityGraph: synchronizedGraph,
          visualPlacements: {
            ...current,
            placements: nextPlacements,
          },
        };
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
        const current = before.visualPlacements;
        if (!graph || !current) return before;
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
        const nextPlacements = current.placements.map((placement) => {
          if (placement.authority_operation_id !== operationId) return placement;
          return {
            ...placement,
            start_sec: nextStart,
            end_sec: nextEnd,
          };
        });
        return {
          ...before,
          editorialAuthorityGraph: synchronizedGraph,
          visualPlacements: {
            ...current,
            placements: nextPlacements,
          },
        };
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
        const current = before.visualPlacements;
        if (!graph || !current) return before;
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
        const nextPlacements = current.placements.map((placement) => {
          if (placement.authority_operation_id !== operationId) return placement;
          return {
            ...placement,
            asset_ref: assetPath,
            asset_path: assetPath,
            storage_key: assetPath,
          };
        });
        return {
          ...before,
          editorialAuthorityGraph: synchronizedGraph,
          visualPlacements: {
            ...current,
            placements: nextPlacements,
          },
        };
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
        const current = before.visualPlacements;
        if (!graph || !current) return before;
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
        const nextPlacements = current.placements.filter((placement) => placement.authority_operation_id !== operationId);
        return {
          ...before,
          editorialAuthorityGraph: nextGraph,
          visualPlacements: {
            ...current,
            placements: nextPlacements,
          },
        };
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
    const operationId = readinessGate.primary_operation_id
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
    const timelineRevision = createSemanticEditPlanSignature(
      transcriptSourceId,
      previewMode,
      editPlan.instructions,
    );
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
      visualPlacements: editableVisualPlacements,
      audioPolish: props.audioPolish ?? null,
      editorSession: {
        schema_version: 1,
        session_id: launchContext.session_id ?? editPlan.session_id ?? `${launchContext.workpiece_id}:session`,
        source_mode: launchContext.source_mode,
        preview_mode: previewMode,
        transcript_source_id: transcriptSourceId,
        selected_segment_id: selectedSegmentId,
        selected_overlay_row_id: selectedSegmentId,
        media_ref: mediaRef ? { ...mediaRef } : null,
        workspace_mapping: workspaceMapping ? { ...workspaceMapping } : null,
        media_source_label: mediaSourceLabel,
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
    props.audioPolish,
    workspaceStructuredTranscript,
    editableVisualPlacements,
    selectedCaptionArtifactFormat,
    selectedSegmentId,
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
  const readinessStatusLabel = readinessGate.status === "ready"
    ? "Ready for export"
    : readinessGate.status === "blocked"
    ? "Blocked"
    : `Needs review (${readinessGate.review_count})`;
  const sendToQuenchButtonLabel = readinessGate.status === "blocked"
    ? "Blocked — Resolve Issues"
    : readinessGate.status === "needs_review"
    ? "Send to Quench (Needs Review)"
    : exportTruthState === "stale"
    ? "Send Updated Packet to Quench"
    : "Send to Quench";
  const readySummaryAreas = useMemo(() => {
    const statusRank = (value: HammerPassStatusMap[HammerPassId] | undefined): number => (
      value === "completed" ? 2 : value === "in_progress" ? 1 : 0
    );
    const summarize = (statuses: Array<HammerPassStatusMap[HammerPassId] | undefined>): "completed" | "in_progress" | "not_started" => {
      const minRank = Math.min(...statuses.map((status) => statusRank(status)));
      if (minRank >= 2) return "completed";
      if (statuses.some((status) => status === "in_progress" || status === "completed")) return "in_progress";
      return "not_started";
    };
    return [
      {
        id: "transcript",
        label: "Transcript Cleanup + Retakes",
        status: summarize([passStatus.transcript_cleanup, passStatus.retakes]),
      },
      {
        id: "pacing",
        label: "Pacing",
        status: summarize([passStatus.gap_pacing]),
      },
      {
        id: "visual_finishing",
        label: "Visual Finishing",
        status: summarize([passStatus.visual_finishing]),
      },
      {
        id: "image",
        label: "Image Placement + Animation",
        status: summarize([passStatus.image_placement, passStatus.image_animation]),
      },
      {
        id: "audio",
        label: "Audio Finalization",
        status: summarize([passStatus.audio_finalization]),
      },
      {
        id: "packaging",
        label: "Packaging",
        status: summarize([passStatus.packaging]),
      },
    ] as const;
  }, [passStatus]);
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
      const handoffDecision = decideHammerQuenchHandoff({ readinessGate });
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
        current: exportBasis.currentReleasePackage,
        timelineRevision: exportBasis.timelineRevision,
      });

      const result = await saveHammerPreparedReleasePackage({
        workpieceId: launchContext.workpiece_id,
        pkg: preparedPackage,
        subtitles: exportBasis.subtitles,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }

      const quenchPacket = buildHammerQuenchReleasePacket({
        releasePrepPackage: exportBasis.currentReleasePackage,
        preparedAt: preparedPackage.preparedAt,
        canonicalGraph: exportBasis.canonicalGraph,
        renderAssembly: exportBasis.renderAssembly,
      });
      const packetValidation = validateHammerQuenchPacketForHandoff({
        packet: quenchPacket,
        renderAssembly: exportBasis.renderAssembly,
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

  useEffect(() => {
    if (!props.onWorkspaceSnapshotChange) return;

    const editPlan = launchContext.edit_plan
      ? {
        ...launchContext.edit_plan,
        instructions: launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
      }
      : createFallbackEditPlan(launchContext, transcriptSourceId, previewMode);

    const snapshot: HammerWorkspaceSnapshot = {
      workspaceId: launchContext.workspace_id,
      workpieceId: launchContext.workpiece_id,
      sessionId: launchContext.session_id ?? editPlan.session_id ?? `${launchContext.workpiece_id}:session`,
      sourceMode: launchContext.source_mode,
      previewMode,
      editPlanStatus: "clean",
      editPlanSignature: createSemanticEditPlanSignature(transcriptSourceId, previewMode, editPlan.instructions),
      transcriptSourceId: transcriptSourceId,
      currentPass,
      passOrderVersion: HAMMER_PASS_ORDER_VERSION,
      passStatus,
      transcriptSegments: editableTranscriptSegments,
      selectedSegmentId,
      selectedOverlayRowId: selectedSegmentId,
      mediaRef,
      workspaceMapping,
      mediaSourceLabel,
      selectedMacroRecipeRef: props.selectedMacroRecipeRef ?? null,
      lastMacroRunRef: props.lastMacroRunRef ?? null,
      structuredTranscript: exportBasis.transcriptForRelease,
      editPlan,
      editorialAuthorityGraph: exportBasis.canonicalGraph,
      visualPlacements: editableVisualPlacements,
      audioPolish: props.audioPolish ?? null,
    };

    props.onWorkspaceSnapshotChange(snapshot);
  }, [
    launchContext,
    mediaRef,
    mediaSourceLabel,
    previewMode,
    props.audioPolish,
    props.lastMacroRunRef,
    props.onWorkspaceSnapshotChange,
    props.selectedMacroRecipeRef,
    exportBasis.transcriptForRelease,
    editableVisualPlacements,
    currentPass,
    passStatus,
    selectedSegmentId,
    editableTranscriptSegments,
    transcriptSourceId,
    workspaceMapping,
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
            <header className="hammer-bay-head">
              <strong>Source Desk</strong>
              {props.aiInUse ? (
                <div className="hammer-tool-hint" role="status" aria-live="polite">
                  AI in use now. Live processing is active.
                </div>
              ) : null}
              <div className="hammer-bay-tabs">
                <button
                  type="button"
                  onClick={undoHistory}
                  disabled={!canUndo}
                  title={undoLabel ? `Undo ${undoLabel}` : "Undo"}
                >
                  {canUndo && undoLabelCompact ? `Undo ${undoLabelCompact}` : "Undo"}
                </button>
                <button
                  type="button"
                  onClick={redoHistory}
                  disabled={!canRedo}
                  title={redoLabel ? `Redo ${redoLabel}` : "Redo"}
                >
                  {canRedo && redoLabelCompact ? `Redo ${redoLabelCompact}` : "Redo"}
                </button>
              </div>
              <div className="hammer-bay-tabs">
                {SOURCE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={selectedSourceTab === tab.id ? "is-active" : ""}
                    onClick={() => setSelectedSourceTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </header>
            <div className="hammer-bay-body">
              {sourceDeskLoading ? (
                <div className="hammer-source-status">Loading stored Source Desk media...</div>
              ) : null}
              {sourceDeskError ? (
                <div
                  className={isSourceDeskAuthMessage(sourceDeskError)
                    ? "hammer-source-status hammer-source-status--info"
                    : "hammer-source-status hammer-source-status--error"}
                  role="status"
                >
                  {sourceDeskError}
                </div>
              ) : null}
              {historyStatus ? (
                <div className="hammer-source-status hammer-source-status--info" role="status">
                  {historyStatus}
                </div>
              ) : null}
              <div className="hammer-source-status hammer-source-status--info" role="status">
                History: {undoDepth} undo / {redoDepth} redo
              </div>
              <section className="hammer-layer-selector" aria-label="Layer state">
                <header className="hammer-layer-selector__head">
                  <strong>Layer State</strong>
                </header>
                <label className="hammer-layer-selector__field">
                  <span>Viewing layer</span>
                  <select
                    value={activeOutputLayerId ?? "__raw__"}
                    onChange={(event) => {
                      setFocusOverride("source-focus");
                      const nextLayerId = event.target.value === "__raw__" ? null : event.target.value;
                      selectViewingLayer(nextLayerId);
                    }}
                    disabled={!workspaceStructuredTranscript}
                  >
                    <option value="__raw__">Raw transcript</option>
                    {outputLayerCandidates.map((layer) => (
                      <option key={layer.layer_id} value={layer.layer_id}>
                        {formatOutputLayerLabel(layer)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hammer-layer-selector__field">
                  <span>Export basis</span>
                  <select
                    value={editableOutputSelection.layerId ?? "__raw__"}
                    onChange={(event) => {
                      setFocusOverride("source-focus");
                      const nextLayerId = event.target.value === "__raw__" ? null : event.target.value;
                      selectOutputLayerForExport(nextLayerId);
                    }}
                  >
                    <option value="__raw__">Raw transcript</option>
                    {outputLayerCandidates.map((layer) => (
                      <option key={layer.layer_id} value={layer.layer_id}>
                        {formatOutputLayerLabel(layer)}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              <section className="hammer-history-panel" aria-label="Edit history">
                <header className="hammer-history-panel__head">
                  <strong>History</strong>
                  <div className="hammer-history-panel__head-actions">
                    {canRedo ? (
                      <button
                        type="button"
                        onClick={restoreCurrentHistoryState}
                        className="hammer-history-panel__action"
                      >
                        Restore this state
                      </button>
                    ) : null}
                    <span>{recentHistoryEntries.length} shown</span>
                  </div>
                </header>
                {recentHistoryEntries.length === 0 ? (
                  <div className="hammer-history-panel__empty">No edits recorded yet.</div>
                ) : (
                  <div className="hammer-history-panel__list">
                    {recentHistoryEntries.map((entry) => {
                      const isCurrent = entry.id === historyHeadEntryId;
                      const derivedTransition = derivedLayerHistoryRef.current.get(entry.id) ?? null;
                      const derivedLayerCreated = Boolean(derivedTransition);
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className={[
                            "hammer-history-panel__item",
                            isCurrent ? "is-current" : "",
                            derivedLayerCreated ? "is-layer-transition" : "",
                          ].filter(Boolean).join(" ")}
                          onClick={() => {
                            setFocusOverride("source-focus");
                            jumpToHistoryEntry(entry.id);
                          }}
                        >
                          <div className="hammer-history-panel__row">
                            <strong>{entry.label}</strong>
                            <span>{formatHistoryTimestamp(entry.timestamp)}</span>
                          </div>
                          <div className="hammer-history-panel__meta">
                            <span>Scope: {formatHistoryEntryScope(entry)}</span>
                            <span>Layer action: {derivedLayerCreated ? "yes" : "no"}</span>
                            <span>Derived layer: {derivedLayerCreated ? "yes" : "no"}</span>
                            {derivedTransition ? <span>Layer: {derivedTransition.layerLabel}</span> : null}
                            {isCurrent ? <span>Current head</span> : null}
                            {isCurrent && derivedTransition ? <span>Active layer transition</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {selectedSourceTab === "transcript" ? (
                editableTranscriptSegments.length > 0 ? (
                  <>
                    {selectedSegment ? (
                      <section className="hammer-transcript-editor" aria-label="Selected transcript segment editor">
                        <div className="hammer-transcript-editor__meta">
                          <span>{selectedSegment.start_sec.toFixed(1)}s - {selectedSegment.end_sec.toFixed(1)}s</span>
                          <span>{selectedSegment.segment_id}</span>
                        </div>
                        <div className="hammer-transcript-editor__meta">
                          <label className="hammer-transcript-editor__field">
                            <span>Start (s)</span>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={selectedSegment.start_sec}
                              onFocus={() => setFocusOverride("source-focus")}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                if (!Number.isFinite(parsed)) return;
                                const nextStart = Math.max(0, roundToTenth(parsed));
                                setFocusOverride("source-focus");
                                applyHistoryMutation({
                                  label: "Adjust segment start",
                                  kind: "timing_adjustment",
                                  affectedSegments: [selectedSegment.segment_id],
                                  computeAfter: (before) => ({
                                    ...before,
                                    transcriptSegments: updateSegmentInTimeline(
                                      before.transcriptSegments,
                                      selectedSegment.segment_id,
                                      (segment) => {
                                        const endFloor = roundToTenth(nextStart + 0.1);
                                        return {
                                          ...segment,
                                          start_sec: nextStart,
                                          end_sec: Math.max(roundToTenth(segment.end_sec), endFloor),
                                        };
                                      },
                                    ),
                                    selectedSegmentId: selectedSegment.segment_id,
                                    playheadSec: nextStart,
                                    transcriptTimingHint: nextStart !== parsed
                                      ? `Start adjusted to ${nextStart.toFixed(1)}s to stay on the timeline grid.`
                                      : null,
                                  }),
                                });
                              }}
                            />
                          </label>
                          <label className="hammer-transcript-editor__field">
                            <span>End (s)</span>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={selectedSegment.end_sec}
                              onFocus={() => setFocusOverride("source-focus")}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                if (!Number.isFinite(parsed)) return;
                                const nextEnd = Math.max(0, roundToTenth(parsed));
                                const minimumEnd = roundToTenth(selectedSegment.start_sec + 0.1);
                                const adjustedEnd = Math.max(nextEnd, minimumEnd);
                                setFocusOverride("source-focus");
                                applyHistoryMutation({
                                  label: "Adjust segment end",
                                  kind: "timing_adjustment",
                                  affectedSegments: [selectedSegment.segment_id],
                                  computeAfter: (before) => ({
                                    ...before,
                                    transcriptSegments: updateSegmentInTimeline(
                                      before.transcriptSegments,
                                      selectedSegment.segment_id,
                                      (segment) => ({
                                        ...segment,
                                        end_sec: Math.max(adjustedEnd, roundToTenth(segment.start_sec + 0.1)),
                                      }),
                                    ),
                                    selectedSegmentId: selectedSegment.segment_id,
                                    transcriptTimingHint: adjustedEnd !== parsed
                                      ? `End adjusted to ${adjustedEnd.toFixed(1)}s to remain after start time.`
                                      : null,
                                  }),
                                });
                              }}
                            />
                          </label>
                        </div>
                        {transcriptTimingHint ? (
                          <div className="hammer-transcript-editor__hint" role="status">
                            {transcriptTimingHint}
                          </div>
                        ) : null}
                        <label className="hammer-transcript-editor__field">
                          <span>Speaker</span>
                          <input
                            type="text"
                            value={selectedSegment.speaker}
                            onFocus={() => setFocusOverride("source-focus")}
                            onChange={(event) => {
                              setFocusOverride("source-focus");
                              applyHistoryMutation({
                                label: "Edit speaker label",
                                kind: "speaker_edit",
                                affectedSegments: [selectedSegment.segment_id],
                                transactionId: `speaker:${selectedSegment.segment_id}:${activeTool}:${selectedSourceTab}`,
                                allowCoalesce: true,
                                computeAfter: (before) => ({
                                  ...before,
                                  transcriptSegments: updateTranscriptSegmentSpeaker(
                                    before.transcriptSegments,
                                    selectedSegment.segment_id,
                                    event.target.value,
                                  ),
                                  transcriptTimingHint: null,
                                }),
                              });
                            }}
                          />
                        </label>
                        <label className="hammer-transcript-editor__field">
                          <span>Text</span>
                          <textarea
                            value={selectedSegment.text}
                            onFocus={() => setFocusOverride("source-focus")}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (!isSubtractiveTranscriptEdit(selectedSegment.text, nextValue)) {
                                setTranscriptTimingHint("Hammer v2 allows subtractive transcript edits only (deletions, no additions).");
                                return;
                              }
                              setFocusOverride("source-focus");
                              applyHistoryMutation({
                                label: "Delete transcript text",
                                kind: "transcript_text_edit",
                                affectedSegments: [selectedSegment.segment_id],
                                transactionId: `text:${selectedSegment.segment_id}:${activeTool}:${selectedSourceTab}`,
                                allowCoalesce: true,
                                computeAfter: (before) => ({
                                  ...before,
                                  transcriptSegments: updateSegmentInTimeline(
                                    before.transcriptSegments,
                                    selectedSegment.segment_id,
                                    (segment) => ({
                                      ...segment,
                                      text: nextValue,
                                    }),
                                  ),
                                  transcriptTimingHint: null,
                                }),
                              });
                            }}
                          />
                          <small className="hammer-transcript-editor__hint">
                            Subtractive-only editing: delete words/phrases, but you cannot add new words.
                          </small>
                        </label>
                      </section>
                    ) : null}
                    <section className="hammer-transcript-selection-actions" aria-label="Transcript structural actions">
                      {hasTranscriptSelection ? (
                        <div className="hammer-transcript-selection-actions__meta">
                          <span>
                            Selected {transcriptSelectionRange.segmentIds.length} segment
                            {transcriptSelectionRange.segmentIds.length === 1 ? "" : "s"}
                            {transcriptSelectionRange.startSec != null && transcriptSelectionRange.endSec != null
                              ? ` · ${transcriptSelectionRange.startSec.toFixed(1)}s-${transcriptSelectionRange.endSec.toFixed(1)}s`
                              : ""}
                          </span>
                          <span>Affects timeline span and transcript-linked structural edits.</span>
                        </div>
                      ) : (
                        <div className="hammer-transcript-selection-actions__meta">
                          <span>Select transcript segments to drive timeline edits.</span>
                          <span>Shift-click extends the range. Escape clears selection.</span>
                        </div>
                      )}
                      <div className="hammer-transcript-selection-actions__buttons">
                        <button type="button" onClick={cutTranscriptSelection} disabled={!hasTranscriptSelection}>
                          Cut Selection
                        </button>
                        <button type="button" onClick={disableTranscriptSelection} disabled={!hasTranscriptSelection}>
                          {transcriptSelectionAllDisabled ? "Enable Selection" : "Disable Selection"}
                        </button>
                        <button type="button" onClick={tightenTranscriptSelection} disabled={!hasTranscriptSelection}>
                          Tighten Selection
                        </button>
                        <button type="button" onClick={clearTranscriptSelection} disabled={!hasTranscriptSelection}>
                          Clear Selection
                        </button>
                      </div>
                    </section>
                    <div className="hammer-transcript-status-rail" role="status">
                      <span>{editableTranscriptSegments.length} segments</span>
                      <span>{modifiedSegmentCount} modified</span>
                      <span>{modifiedSegmentCount > 0 ? "recompute needed" : "in sync"}</span>
                    </div>
                    <article className="hammer-transcript-document" aria-label="Transcript document">
                      {editableTranscriptSegments.map((segment) => (
                        <button
                          key={segment.segment_id}
                          type="button"
                          className={[
                            "hammer-transcript-line",
                            segment.segment_id === selectedSegmentId ? "is-active" : "",
                            transcriptSelectionSegmentIdSet.has(segment.segment_id) ? "is-range" : "",
                            modifiedTranscriptSegmentIds.has(segment.segment_id) ? "is-modified" : "",
                            candidateSegmentIdSet.has(segment.segment_id) ? "is-candidate" : "",
                            activeCandidateSegmentId === segment.segment_id ? "is-candidate-active" : "",
                            segment.is_disabled ? "is-disabled" : "",
                          ].filter(Boolean).join(" ")}
                          onClick={(event) => {
                            applyTranscriptSelection(segment.segment_id, event.shiftKey);
                          }}
                          ref={(element) => {
                            if (element) {
                              transcriptLineRefs.current.set(segment.segment_id, element);
                            } else {
                              transcriptLineRefs.current.delete(segment.segment_id);
                            }
                          }}
                        >
                          <span className="hammer-transcript-line__meta">
                            {segment.start_sec.toFixed(1)}s - {segment.end_sec.toFixed(1)}s
                            {" · "}
                            {(segment.end_sec - segment.start_sec).toFixed(1)}s
                            {modifiedTranscriptSegmentIds.has(segment.segment_id) ? " · modified" : ""}
                            {segment.is_disabled ? " · disabled" : ""}
                            {segment.gain_db != null && segment.gain_db !== 0 ? ` · gain ${segment.gain_db.toFixed(1)}dB` : ""}
                          </span>
                          <span className="hammer-transcript-line__speaker">{segment.speaker}:</span>
                          <span className="hammer-transcript-line__text">{segment.text}</span>
                        </button>
                      ))}
                    </article>
                  </>
                ) : <div className="hammer-empty-state">Transcript is not loaded yet.</div>
              ) : null}

              {selectedSourceTab === "images" ? (
                sourceImageItems.length > 0 || sourceImageLibraryItems.length > 0 ? (
                  <>
                    <div className="hammer-source-summary">
                      <span>{sourceImageItems.length} placements</span>
                      <span>{sourceImageItems.filter((item) => item.status === "uncertain").length} uncertain</span>
                    </div>
                    <div className="hammer-source-summary">
                      <span>{sourceImageLibraryItems.length} stored images</span>
                      <button
                        type="button"
                        className="hammer-source-upload-button is-secondary"
                        onClick={() => imageUploadInputRef.current?.click()}
                        disabled={uploadingCategory != null}
                      >
                        {uploadingCategory === "images" ? "Uploading..." : "Upload Image"}
                      </button>
                    </div>
                    <input
                      ref={imageUploadInputRef}
                      type="file"
                      aria-label="Upload source desk image file"
                      accept="image/*"
                      className="hammer-source-upload-input"
                      onChange={(event) => {
                        void handleSourceDeskUpload("images", event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                    />
                    {sourceImageItems.map((item) => (
                      (() => {
                        const anchorSegment = transcriptSegmentsById.get(item.anchorSegmentId) ?? null;
                        const timelinePrompt = buildTimelineImagePrompt({
                          text: anchorSegment?.text ?? item.label,
                          tweak: "",
                        });
                        const imageCopyKey = `timeline-image:${item.id}`;
                        return (
                          <article
                            key={item.id}
                            className={selectedImagePlacementId === item.id ? "hammer-source-card is-selected" : "hammer-source-card"}
                          >
                            {item.assetPath && sourceDeskPreviewUrls[item.assetPath] ? (
                              <img
                                className="hammer-source-card__thumb"
                                src={sourceDeskPreviewUrls[item.assetPath]}
                                alt={item.label}
                              />
                            ) : (
                              <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">
                                {item.assetPath && sourceDeskPreviewFailures[item.assetPath] ? "Preview unavailable" : "No thumbnail"}
                              </div>
                            )}
                            <header className="hammer-source-card__head">
                              <strong>{item.label}</strong>
                              <span className={item.status === "uncertain" ? "is-warning" : "is-ready"}>{item.status}</span>
                            </header>
                            <div className="hammer-source-card__meta">
                              <span>Type: image</span>
                              <span>{item.startSec.toFixed(1)}s - {item.endSec.toFixed(1)}s</span>
                              <span>Uses: 1</span>
                              <span>{item.visualMode ?? "visual"}</span>
                              <span>{item.confidence != null ? `${Math.round(item.confidence * 100)}% match` : "match n/a"}</span>
                            </div>
                            <div className="hammer-source-card__path">Prompt: {timelinePrompt}</div>
                            <div className="hammer-source-card__actions">
                              <button
                                type="button"
                                onClick={() => {
                                  void copyPromptToClipboard({
                                    key: imageCopyKey,
                                    prompt: timelinePrompt,
                                  });
                                }}
                              >
                                {copiedPromptKey === imageCopyKey ? "Copied" : "Copy Prompt"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void sendPromptToProvider({
                                    key: imageCopyKey,
                                    prompt: timelinePrompt,
                                    label: "timeline image",
                                  });
                                }}
                              >
                                Send to Provider
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  selectionOriginRef.current = "timeline";
                                  setFocusOverride("time-focus");
                                  setSelectedImagePlacementId(item.id);
                                  setSelectedSegmentId(item.anchorSegmentId);
                                  setTranscriptSelectionAnchorSegmentId(item.anchorSegmentId);
                                  setTranscriptSelectionFocusSegmentId(item.anchorSegmentId);
                                  seekPlayheadToTime(item.startSec, "playhead");
                                }}
                              >
                                Jump to timeline
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFocusOverride("time-focus");
                                  updateVisualPlacementTiming(item.id, -0.5);
                                }}
                              >
                                -0.5s
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFocusOverride("time-focus");
                                  updateVisualPlacementTiming(item.id, 0.5);
                                }}
                              >
                                +0.5s
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFocusOverride("tool-focus");
                                  removeVisualPlacement(item.id);
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </article>
                        );
                      })()
                    ))}
                    {sourceImageLibraryItems.map((file) => (
                      <article key={file.path} className="hammer-source-card">
                        {sourceDeskPreviewUrls[file.path] ? (
                          <img
                            className="hammer-source-card__thumb"
                            src={sourceDeskPreviewUrls[file.path]}
                            alt={file.name}
                          />
                        ) : (
                          <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">
                            {sourceDeskPreviewFailures[file.path] ? "Preview unavailable" : "No thumbnail"}
                          </div>
                        )}
                        <header className="hammer-source-card__head">
                          <strong>{file.name}</strong>
                          <span>stored</span>
                        </header>
                        <div className="hammer-source-card__meta">
                          <span>Type: image</span>
                          <span>Uses: {imageUsageByPath.get(file.path) ?? 0}</span>
                          <span>{formatBytes(file.bytes)}</span>
                          <span>{file.updatedAt ?? "updated time unavailable"}</span>
                        </div>
                        <div className="hammer-source-card__path">{file.path}</div>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("tool-focus");
                              addImagePlacementFromLibrary({
                                assetPath: file.path,
                                label: file.name,
                              });
                            }}
                          >
                            Add placement
                          </button>
                        </div>
                      </article>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="hammer-source-summary">
                      <span>No image placements are available yet.</span>
                      <button
                        type="button"
                        className="hammer-source-upload-button is-secondary"
                        onClick={() => imageUploadInputRef.current?.click()}
                        disabled={uploadingCategory != null}
                      >
                        {uploadingCategory === "images" ? "Uploading..." : "Upload Image"}
                      </button>
                    </div>
                    <input
                      ref={imageUploadInputRef}
                      type="file"
                      aria-label="Upload source desk image file"
                      accept="image/*"
                      className="hammer-source-upload-input"
                      onChange={(event) => {
                        void handleSourceDeskUpload("images", event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </>
                )
              ) : null}

              {selectedSourceTab === "assets" ? (
                sourceAssetItems.length > 0 ? (
                  <>
                    <div className="hammer-source-summary">
                      <span>{sourceAssetItems.length} assets linked</span>
                      <span>{workspaceMapping ? "workspace mapped" : "mapping unavailable"}</span>
                    </div>
                    {sourceAssetItems.map((item) => (
                      <article key={item.id} className="hammer-source-card">
                        <header className="hammer-source-card__head">
                          <strong>{item.label}</strong>
                          <span>{item.kind}</span>
                        </header>
                        <div className="hammer-source-card__meta">
                          <span>Uses: {item.usageCount}</span>
                          <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                          <span>{item.visualMode ?? "mode n/a"}</span>
                        </div>
                        <div className="hammer-source-card__path">{item.assetPath ?? "asset path unavailable"}</div>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("time-focus");
                              seekPlayheadToTime(item.firstStartSec, "playhead");
                            }}
                          >
                            Reveal in timeline
                          </button>
                        </div>
                      </article>
                    ))}
                  </>
                ) : <div className="hammer-empty-state">No linked assets found for this workpiece.</div>
              ) : null}

              {selectedSourceTab === "broll" ? (
                <section className="hammer-visual-flow">
                  <div className="hammer-visual-flow__steps">
                    {([
                      { id: "media_map", label: "Media Map", done: mediaMapBeats.length > 0 },
                      { id: "images", label: "Images", done: sourceImageLibraryItems.length > 0 },
                      { id: "broll", label: "B-roll", done: sourceBrollOnlyItems.length > 0 },
                      { id: "reference_clips", label: "Reference Clips", done: sourceReferenceClipItems.length > 0 },
                    ] as Array<{ id: HammerVisualFlowStepId; label: string; done: boolean }>).map((step) => (
                      <button
                        key={step.id}
                        type="button"
                        className={selectedVisualFlowStep === step.id ? "hammer-visual-flow__step is-active" : "hammer-visual-flow__step"}
                        onClick={() => setSelectedVisualFlowStep(step.id)}
                      >
                        <span>{step.label}</span>
                        <small>{step.done ? "complete" : "pending"}</small>
                      </button>
                    ))}
                  </div>

                  {selectedVisualFlowStep === "media_map" ? (
                    <>
                      <div className="hammer-source-summary">
                        <span>{mediaMapBeats.length} beats</span>
                        <button type="button" className="hammer-source-upload-button is-secondary" onClick={redoMediaMapFromScript}>
                          Redo Media Map
                        </button>
                      </div>
                      {mediaMapBeats.map((beat) => {
                        const brollPrompt = buildMediaMapPrompt({ type: "broll", text: beat.sourceText, tweak: beat.tweak });
                        const referencePrompt = buildMediaMapPrompt({ type: "reference_clip", text: beat.sourceText, tweak: beat.tweak });
                        const timelineImagePrompt = buildTimelineImagePrompt({ text: beat.sourceText, tweak: beat.tweak });
                        const timelineCopyKey = `timeline:${beat.id}`;
                        return (
                          <article key={beat.id} className="hammer-source-card">
                            <header className="hammer-source-card__head">
                              <strong>{beat.sourceText.slice(0, 92)}</strong>
                              <span>{beat.reason}</span>
                            </header>
                            <div className="hammer-source-card__meta">
                              <span>Suggested: {beat.suggestedType === "reference_clip" ? "Reference Clip" : "B-roll"}</span>
                              <span>Selected: {beat.selectedType === "reference_clip" ? "Reference Clip" : "B-roll"}</span>
                              <span>{beat.linkedPlacementId ? "linked placement" : "not linked"}</span>
                            </div>
                            <label className="hammer-tool-field">
                              <span>Type</span>
                              <select
                                value={beat.selectedType}
                                onChange={(event) => {
                                  const nextType = event.target.value === "reference_clip" ? "reference_clip" : "broll";
                                  setMediaMapBeats((current) => current.map((item) => (
                                    item.id === beat.id ? { ...item, selectedType: nextType } : item
                                  )));
                                  if (beat.linkedPlacementId) {
                                    updatePlacementKindFromMediaMap(beat.linkedPlacementId, nextType);
                                  }
                                }}
                              >
                                <option value="broll">B-roll</option>
                                <option value="reference_clip">Reference Clip</option>
                              </select>
                            </label>
                            <label className="hammer-tool-field">
                              <span>Tweak</span>
                              <input
                                type="text"
                                value={beat.tweak}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setMediaMapBeats((current) => current.map((item) => (
                                    item.id === beat.id ? { ...item, tweak: next } : item
                                  )));
                                }}
                                placeholder="Add a light prompt tweak"
                              />
                            </label>
                            <div className="hammer-source-card__path">B-roll prompt: {brollPrompt}</div>
                            <div className="hammer-source-card__path">Reference prompt: {referencePrompt}</div>
                            <div className="hammer-source-card__path">Timeline image prompt: {timelineImagePrompt}</div>
                            <div className="hammer-source-card__actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setMediaMapBeats((current) => current.filter((item) => item.id !== beat.id));
                                  setRemovedMediaMapSegmentIds((current) => (
                                    current.includes(beat.segmentId) ? current : [...current, beat.segmentId]
                                  ));
                                  if (beat.linkedPlacementId) {
                                    removeVisualPlacement(beat.linkedPlacementId);
                                  }
                                }}
                              >
                                Remove visual
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void copyPromptToClipboard({
                                    key: timelineCopyKey,
                                    prompt: timelineImagePrompt,
                                  });
                                }}
                              >
                                {copiedPromptKey === timelineCopyKey ? "Copied" : "Copy Prompt"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void sendPromptToProvider({
                                    key: timelineCopyKey,
                                    prompt: timelineImagePrompt,
                                    label: "timeline image beat",
                                  });
                                }}
                              >
                                Send to Provider
                              </button>
                              <button type="button" onClick={() => queueMediaMapBeatSuggestion(beat)}>
                                Queue Suggestion
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </>
                  ) : null}

                  {selectedVisualFlowStep === "images" ? (
                    <>
                      <div className="hammer-source-summary">
                        <span>{sourceImageLibraryItems.length} stored images</span>
                        <button
                          type="button"
                          className="hammer-source-upload-button is-secondary"
                          onClick={() => imageUploadInputRef.current?.click()}
                          disabled={uploadingCategory != null}
                        >
                          {uploadingCategory === "images" ? "Uploading..." : "Upload Image"}
                        </button>
                      </div>
                      <input
                        ref={imageUploadInputRef}
                        type="file"
                        aria-label="Upload source desk image file"
                        accept="image/*"
                        className="hammer-source-upload-input"
                        onChange={(event) => {
                          void handleSourceDeskUpload("images", event.currentTarget.files);
                          event.currentTarget.value = "";
                        }}
                      />
                      {sourceImageLibraryItems.map((file) => (
                        <article key={`img-step-${file.path}`} className="hammer-source-card">
                          <header className="hammer-source-card__head">
                            <strong>{file.name}</strong>
                            <span>image</span>
                          </header>
                          <div className="hammer-source-card__path">{file.path}</div>
                        </article>
                      ))}
                    </>
                  ) : null}

                  {selectedVisualFlowStep === "broll" ? (
                    <>
                      <div className="hammer-source-summary">
                        <span>{sourceBrollOnlyItems.length} B-roll assets</span>
                        <span>{unresolvedBrollSuggestionItems.length} unresolved suggestions</span>
                        <button
                          type="button"
                          className="hammer-source-upload-button is-secondary"
                          onClick={() => brollUploadInputRef.current?.click()}
                          disabled={uploadingCategory != null}
                        >
                          {uploadingCategory === "broll" ? "Uploading..." : "Upload B-roll"}
                        </button>
                      </div>
                      <input
                        ref={brollUploadInputRef}
                        type="file"
                        aria-label="Upload source desk b-roll file"
                        accept="video/*"
                        className="hammer-source-upload-input"
                        onChange={(event) => {
                          void handleSourceDeskUpload("broll", event.currentTarget.files);
                          event.currentTarget.value = "";
                        }}
                      />
                      {sourceBrollOnlyItems.map((item) => (
                        <article key={`broll-step-${item.id}`} className="hammer-source-card">
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span>B-roll</span>
                          </header>
                          <div className="hammer-source-card__meta">
                            <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                            <span>Uses: {item.usageCount}</span>
                          </div>
                          <div className="hammer-source-card__actions">
                            <button
                              type="button"
                              onClick={() => {
                                void copyPromptToClipboard({
                                  key: `broll:${item.id}`,
                                  prompt: `B-roll: ${item.label}.`,
                                });
                              }}
                            >
                              {copiedPromptKey === `broll:${item.id}` ? "Copied" : "Copy Prompt"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void sendPromptToProvider({
                                  key: `broll:${item.id}`,
                                  prompt: `B-roll: ${item.label}.`,
                                  label: "B-roll",
                                });
                              }}
                            >
                              Send to Provider
                            </button>
                            <button type="button" onClick={() => seekPlayheadToTime(item.firstStartSec, "playhead")}>Cue</button>
                          </div>
                        </article>
                      ))}
                    </>
                  ) : null}

                  {selectedVisualFlowStep === "reference_clips" ? (
                    <>
                      <div className="hammer-source-summary">
                        <span>{referenceClipPlannedBeats.length} planned reference beats</span>
                        <span>{sourceReferenceClipItems.length} generated assets</span>
                      </div>
                      {referenceClipPlannedBeats.length === 0 ? (
                        <div className="hammer-empty-state">No reference clip beats selected in Media Map yet.</div>
                      ) : null}
                      {referenceClipPlannedBeats.map((beat) => {
                        const referenceInput: ReferenceClipInput = {
                          beatId: beat.id,
                          anchorText: beat.sourceText,
                          promptBasis: buildMediaMapPrompt({
                            type: "reference_clip",
                            text: beat.sourceText,
                            tweak: beat.tweak,
                          }),
                          chartType: "auto",
                        };
                        const analysis = analyzeReferenceClipInput(referenceInput);
                        const linkedPlacement = beat.linkedPlacementId
                          ? (visualPlacementsById.get(beat.linkedPlacementId) ?? null)
                          : null;
                        const previewPath = linkedPlacement?.asset_path ?? null;
                        const previewUrl = previewPath ? (sourceDeskPreviewUrls[previewPath] ?? null) : null;
                        const referencePrompt = buildMediaMapPrompt({
                          type: "reference_clip",
                          text: beat.sourceText,
                          tweak: beat.tweak,
                        });
                        return (
                          <article key={`ref-plan-${beat.id}`} className="hammer-source-card">
                            <header className="hammer-source-card__head">
                              <strong>{beat.sourceText.slice(0, 92)}</strong>
                              <span>{beat.reason}</span>
                            </header>
                            {previewUrl ? (
                              <img
                                className="hammer-source-card__thumb"
                                src={previewUrl}
                                alt={analysis.title}
                              />
                            ) : null}
                            <div className="hammer-source-card__meta">
                              <span>Type: {analysis.outputType}</span>
                              <span>Selected: {beat.selectedType === "reference_clip" ? "Reference Clip" : "B-roll"}</span>
                              <span>{beat.linkedPlacementId ? "generated" : "not generated"}</span>
                            </div>
                            <div className="hammer-source-card__path">Title: {analysis.title}</div>
                            <div className="hammer-source-card__path">Summary: {analysis.summary}</div>
                            <div className="hammer-source-card__path">Prompt: {referencePrompt}</div>
                            <div className="hammer-source-card__actions">
                              <button
                                type="button"
                                onClick={() => {
                                  void generateReferenceClipFromBeat(beat);
                                }}
                                disabled={generatingReferenceBeatId != null}
                              >
                                {generatingReferenceBeatId === beat.id
                                  ? "Generating..."
                                  : beat.linkedPlacementId
                                  ? "Regenerate"
                                  : "Generate"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void copyPromptToClipboard({
                                    key: `ref-clip:${beat.id}`,
                                    prompt: referencePrompt,
                                  });
                                }}
                              >
                                {copiedPromptKey === `ref-clip:${beat.id}` ? "Copied" : "Copy Prompt"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!beat.linkedPlacementId) return;
                                  setTranscriptTimingHint("Reference clip already saved to Source Desk.");
                                }}
                                disabled={!beat.linkedPlacementId}
                              >
                                Save Reference Clip
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!beat.linkedPlacementId) return;
                                  removeVisualPlacement(beat.linkedPlacementId);
                                  setMediaMapBeats((current) => current.map((item) => (
                                    item.id === beat.id ? { ...item, linkedPlacementId: null } : item
                                  )));
                                }}
                                disabled={!beat.linkedPlacementId}
                              >
                                Delete Reference Clip
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {sourceReferenceClipItems.map((item) => (
                        <article key={`ref-step-${item.id}`} className="hammer-source-card">
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span>Reference Clip</span>
                          </header>
                          <div className="hammer-source-card__meta">
                            <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                            <span>Uses: {item.usageCount}</span>
                          </div>
                          <div className="hammer-source-card__path">{item.assetPath ?? "asset path unavailable"}</div>
                          <div className="hammer-source-card__actions">
                            <button
                              type="button"
                              onClick={() => seekPlayheadToTime(item.firstStartSec, "playhead")}
                            >
                              {item.assetPath ? "Regenerate" : "Generate"}
                            </button>
                            <button type="button" onClick={() => seekPlayheadToTime(item.firstStartSec, "playhead")}>Cue</button>
                          </div>
                        </article>
                      ))}
                    </>
                  ) : null}
                </section>
              ) : null}

              {selectedSourceTab === "introoutro" ? (
                <>
                  <div className="hammer-source-summary">
                    <span>Choose project intro and outro media</span>
                    <button
                      type="button"
                      className="hammer-source-upload-button"
                      onClick={() => introOutroUploadInputRef.current?.click()}
                      disabled={uploadingCategory != null}
                    >
                      {uploadingCategory === "introoutro" ? "Uploading..." : "Upload Intro/Outro"}
                    </button>
                  </div>
                  <input
                    ref={introOutroUploadInputRef}
                    type="file"
                    aria-label="Upload source desk intro or outro file"
                    accept="video/*,audio/*"
                    className="hammer-source-upload-input"
                    onChange={(event) => {
                      void handleSourceDeskUpload("introoutro", event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />

                  <section className="hammer-source-card">
                    <header className="hammer-source-card__head">
                      <strong>Project Intro</strong>
                      <span>{introOutroSelection.intro_path ? "selected" : "not set"}</span>
                    </header>
                    <select
                      className="hammer-source-select"
                      aria-label="Project intro media selection"
                      value={introOutroSelection.intro_path ?? ""}
                      onChange={(event) => {
                        const next: HammerIntroOutroSelection = {
                          ...introOutroSelection,
                          intro_path: event.target.value || null,
                          updated_at: new Date().toISOString(),
                        };
                        void persistIntroOutroSelection(next);
                      }}
                      disabled={savingIntroOutro}
                    >
                      <option value="">No intro</option>
                      {introOutroCandidateItems.map((item) => (
                        <option key={`intro-${item.path}`} value={item.path}>
                          {item.name} ({item.kind})
                        </option>
                      ))}
                    </select>
                    <div className="hammer-source-card__path">{introOutroSelection.intro_path ?? "No intro selected"}</div>
                  </section>

                  <section className="hammer-source-card">
                    <header className="hammer-source-card__head">
                      <strong>Project Outro</strong>
                      <span>{introOutroSelection.outro_path ? "selected" : "not set"}</span>
                    </header>
                    <select
                      className="hammer-source-select"
                      aria-label="Project outro media selection"
                      value={introOutroSelection.outro_path ?? ""}
                      onChange={(event) => {
                        const next: HammerIntroOutroSelection = {
                          ...introOutroSelection,
                          outro_path: event.target.value || null,
                          updated_at: new Date().toISOString(),
                        };
                        void persistIntroOutroSelection(next);
                      }}
                      disabled={savingIntroOutro}
                    >
                      <option value="">No outro</option>
                      {introOutroCandidateItems.map((item) => (
                        <option key={`outro-${item.path}`} value={item.path}>
                          {item.name} ({item.kind})
                        </option>
                      ))}
                    </select>
                    <div className="hammer-source-card__path">{introOutroSelection.outro_path ?? "No outro selected"}</div>
                  </section>
                  <div className="hammer-source-summary">
                    <span>Saved to Tongs workpiece storage</span>
                    <span>{savingIntroOutro ? "Saving..." : `Updated ${introOutroSelection.updated_at}`}</span>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className="hammer-preview-bay">
            <header className="hammer-bay-head">
              <strong>Preview Monitors</strong>
              <span>{previewMode}</span>
            </header>
            <div className="hammer-bay-body hammer-preview-bay__body">
              <div className="hammer-preview-surface" ref={previewSurfaceRef}>
                <video
                  ref={previewAudioRef}
                  src={playbackMediaSrc ?? undefined}
                  preload="metadata"
                  playsInline
                  onTimeUpdate={(event) => {
                    if (!isPlaybackActive) return;
                    handlePlaybackProgress(event.currentTarget.currentTime);
                  }}
                  onEnded={() => {
                    setIsPlaybackActive(false);
                    if (playbackWindow?.mode === "roll") {
                      setPlaybackWindow(null);
                    }
                  }}
                  className="hammer-preview-media"
                />
                <div className="hammer-preview-surface__label">{resolvePreviewLabel(playheadSegment, playheadSec)}</div>
                <div className="hammer-preview-canvas" aria-label="Visual composition canvas">
                  {activePreviewOverlays.map((overlay) => (
                    <div
                      ref={(node) => applyPreviewOverlayStyle(node, overlay)}
                      key={`${overlay.placementId}:${overlay.startSec}:${overlay.endSec}`}
                      className={[
                        "hammer-preview-canvas__bbox",
                        resolveImageAnimationClass(overlay.animationPreset),
                        overlay.isSelected ? "is-selected" : "",
                        currentPass === "image_placement" && selectedImagePlacementId && !overlay.isSelected ? "is-dimmed" : "",
                      ].filter(Boolean).join(" ")}
                      onMouseDown={(event) => {
                        setSelectedImagePlacementId(overlay.placementId);
                        if (currentPass !== "image_placement") return;
                        beginPreviewCanvasDrag(event, {
                          placementId: overlay.placementId,
                          mode: "move",
                        });
                      }}
                    >
                      {overlay.kind === "broll" ? (
                        overlay.src ? (
                          <video
                            ref={(node) => {
                              if (node) {
                                previewBrollVideoRefs.current.set(overlay.placementId, node);
                              } else {
                                previewBrollVideoRefs.current.delete(overlay.placementId);
                              }
                            }}
                            src={overlay.src}
                            muted
                            playsInline
                            preload="metadata"
                            className="hammer-preview-canvas__video"
                          />
                        ) : (
                          <div className="hammer-preview-canvas__fallback">{overlay.label}</div>
                        )
                      ) : overlay.src ? (
                        <img
                          src={overlay.src}
                          alt={overlay.label}
                          className="hammer-preview-canvas__image"
                        />
                      ) : (
                        <div className="hammer-preview-canvas__fallback">{overlay.label}</div>
                      )}
                      {currentPass === "image_placement" && overlay.isSelected ? (
                        <button
                          type="button"
                          className="hammer-preview-canvas__resize-handle"
                          aria-label="Resize selected visual"
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            beginPreviewCanvasDrag(event, {
                              placementId: overlay.placementId,
                              mode: "resize",
                            });
                          }}
                        />
                      ) : null}
                    </div>
                  ))}
                  {activePreviewOverlays.length === 0 ? (
                    <div className="hammer-preview-canvas__empty">
                      No active visual overlay at this playhead time.
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="hammer-preview-meta">
                <span>Playhead {playheadSec.toFixed(1)}s</span>
                <span>{playbackModeLabel}</span>
                <span>{mediaSourceLabel ?? "No media source"}</span>
                <span>Playback lane: {studioRackPlaybackConfig.backend}</span>
                <span>{playbackMediaSrc ? "Mapped media ready" : "Mapped media unavailable"}</span>
                {currentPass === "visual_finishing" ? (
                  <span>Visual finishing preview mode active</span>
                ) : null}
                {currentPass === "image_animation" ? (
                  <span>Image animation preset: {selectedImageAnimationLabel}</span>
                ) : null}
                {currentPass === "audio_finalization" ? (
                  <span>Audio compare: {audioFinalizationCompareMode === "before" ? "Before" : "After"}</span>
                ) : null}
                {currentPass === "packaging" ? (
                  <span>
                    Packaging: intro {packagingIntroPlacement ? "on" : "off"} · outro {packagingOutroPlacement ? "on" : "off"} · logo {packagingLogoPlacement ? "on" : "off"}
                  </span>
                ) : null}
                {playbackWindow ? (
                  <span>
                    Window {playbackWindow.startSec.toFixed(1)}s - {playbackWindow.endSec.toFixed(1)}s
                  </span>
                ) : null}
                <button type="button" onClick={togglePlayback}>
                  {isPlaybackActive ? "Pause (Space)" : "Play (Space)"}
                </button>
              </div>
            </div>
          </section>

          <section className="hammer-tool-bay">
            <header className="hammer-bay-head">
              <strong>Tool Rack</strong>
              <div className="hammer-pass-head">
                <span>{currentPassMeta.label}</span>
                <span className={`hammer-pass-badge hammer-pass-badge--${passStatus[currentPass] ?? "not_started"}`}>
                  {passStatus[currentPass] ?? "not_started"}
                </span>
                <button type="button" onClick={markCurrentPassComplete}>
                  Mark Complete
                </button>
              </div>
            </header>
            <div className="hammer-bay-body">
              {activeTool === "polish" ? (
                currentPass === "transcript_cleanup" || currentPass === "retakes" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">
                      {currentPass === "transcript_cleanup" ? "Transcript Cleanup" : "Retake Review"}
                    </header>
                    <div className="hammer-tool-hint">
                      {currentPass === "transcript_cleanup"
                        ? "Review filler candidates and approve or reject each one."
                        : "Review retake candidates and approve or reject each one."}
                    </div>
                    {currentPass === "transcript_cleanup" ? (
                      <label className="hammer-tool-field">
                        <span>Aggressiveness</span>
                        <select
                          value={fillerCleanupOptions.aggressiveness}
                          onChange={(event) => setFillerCleanupOptions((current) => ({
                            ...current,
                            aggressiveness: event.target.value as FillerCleanupOptions["aggressiveness"],
                          }))}
                        >
                          <option value="light">Light</option>
                          <option value="medium">Medium</option>
                          <option value="strong">Strong</option>
                        </select>
                      </label>
                    ) : (
                      <label className="hammer-tool-field">
                        <span>Detection mode</span>
                        <select
                          value={retakeCleanupOptions.detection}
                          onChange={(event) => setRetakeCleanupOptions((current) => ({
                            ...current,
                            detection: event.target.value as RetakeCleanupOptions["detection"],
                          }))}
                        >
                          <option value="conservative">Conservative</option>
                          <option value="normal">Normal</option>
                          <option value="aggressive">Aggressive</option>
                        </select>
                      </label>
                    )}
                    <div className="hammer-candidate-review__actions">
                      <button
                        type="button"
                        onClick={() => refreshCandidateQueue(currentPass === "transcript_cleanup" ? "fillers" : "retakes")}
                      >
                        Refresh Candidates
                      </button>
                    </div>
                    {activeCandidateCard ? (
                      <article className="hammer-candidate-card">
                        <header className="hammer-candidate-card__head">
                          <strong>
                            {activeCandidateIndex + 1} / {candidateCards.length}
                          </strong>
                          <span>{activeCandidateCard.segmentId}</span>
                        </header>
                        <p className="hammer-candidate-card__description">{activeCandidateCard.description}</p>
                        <div className="hammer-candidate-card__context">
                          <header>Current</header>
                          <p>{activeCandidateCard.beforeText}</p>
                        </div>
                        <div className="hammer-candidate-card__context">
                          <header>Proposed</header>
                          <p>{activeCandidateCard.afterText ?? "[segment removed]"}</p>
                        </div>
                        <div className="hammer-candidate-card__meta">
                          <span>Confidence {Math.round(activeCandidateCard.confidence * 100)}%</span>
                          <span>Time saved {activeCandidateCard.timeSavedSec.toFixed(1)}s</span>
                        </div>
                        <div className="hammer-candidate-review__actions">
                          <button type="button" onClick={() => handleCandidateDecision(true)}>Approve</button>
                          <button type="button" onClick={() => handleCandidateDecision(false)}>Reject</button>
                        </div>
                      </article>
                    ) : (
                      <div className="hammer-tool-hint">
                        No pending candidates in this pass.
                      </div>
                    )}
                    <div className="hammer-tool-hint">Approve applies immediately. Reject leaves source unchanged.</div>
                  </section>
                ) : currentPass === "gap_pacing" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Gap / Pacing</header>
                    <div className="hammer-tool-hint">
                      Deterministic global pacing pass. Changes apply instantly as you adjust controls.
                    </div>
                    <label className="hammer-tool-field">
                      <span>Max Pause Length (sec)</span>
                      <input
                        type="number"
                        min={0.1}
                        step={0.05}
                        value={gapCleanupOptions.maxGapSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setGapCleanupOptions((current) => ({
                            ...current,
                            maxGapSec: Math.max(0.1, Number(event.target.value) || 0.4),
                          }));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={gapCleanupOptions.preserveDramaticPauses}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setGapCleanupOptions((current) => ({
                            ...current,
                            preserveDramaticPauses: event.target.checked,
                          }));
                        }}
                      />
                      <span>Preserve dramatic pauses</span>
                    </label>
                    {cleanupReceipt ? (
                      <PolishResultSummary phase="applied" summary={cleanupReceipt} />
                    ) : null}
                    <div className="hammer-tool-hint">No per-gap approval cards in this pass.</div>
                  </section>
                ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Transcript Polish</header>
                  <label className="hammer-tool-field">
                    <span>Cleanup Strength: {polishStrength}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={polishStrength}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setPolishStrength(Number(event.target.value));
                      }}
                    />
                  </label>
                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Shorten Gaps</strong>
                      <span>
                        Intent: Tighten dead air between adjacent lines without changing spoken words.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Max allowed gap (sec)</span>
                      <input
                        type="number"
                        min={0.1}
                        step={0.05}
                        value={gapCleanupOptions.maxGapSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setGapCleanupOptions((current) => ({
                            ...current,
                            maxGapSec: Math.max(0.1, Number(event.target.value) || 0.4),
                          }));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={gapCleanupOptions.preserveDramaticPauses}
                        onChange={(event) => setGapCleanupOptions((current) => ({
                          ...current,
                          preserveDramaticPauses: event.target.checked,
                        }))}
                      />
                      <span>Preserve dramatic pauses</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewShortenGaps(editableTranscriptSegments, gapCleanupOptions));
                      }}
                    >
                      Preview Changes
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Remove Fillers</strong>
                      <span>
                        Intent: Remove filler phrases such as uh, um, you know, and like without rewriting surrounding content.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Aggressiveness</span>
                      <select
                        value={fillerCleanupOptions.aggressiveness}
                        onChange={(event) => setFillerCleanupOptions((current) => ({
                          ...current,
                          aggressiveness: event.target.value as FillerCleanupOptions["aggressiveness"],
                        }))}
                      >
                        <option value="light">Light</option>
                        <option value="medium">Medium</option>
                        <option value="strong">Strong</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={fillerCleanupOptions.protectIntentionalPhrasing}
                        onChange={(event) => setFillerCleanupOptions((current) => ({
                          ...current,
                          protectIntentionalPhrasing: event.target.checked,
                        }))}
                      />
                      <span>Protect intentional phrasing</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewRemoveFillers(editableTranscriptSegments, fillerCleanupOptions));
                      }}
                    >
                      Preview Changes
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Remove Retakes</strong>
                      <span>
                        Intent: Remove explicit retake lines or adjacent repeated takes using deterministic overlap rules.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Detection mode</span>
                      <select
                        value={retakeCleanupOptions.detection}
                        onChange={(event) => setRetakeCleanupOptions((current) => ({
                          ...current,
                          detection: event.target.value as RetakeCleanupOptions["detection"],
                        }))}
                      >
                        <option value="conservative">Conservative</option>
                        <option value="normal">Normal</option>
                        <option value="aggressive">Aggressive</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={retakeCleanupOptions.preferLaterCleanerTake}
                        onChange={(event) => setRetakeCleanupOptions((current) => ({
                          ...current,
                          preferLaterCleanerTake: event.target.checked,
                        }))}
                      />
                      <span>Prefer later cleaner take</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewRemoveRetakes(editableTranscriptSegments, retakeCleanupOptions));
                      }}
                    >
                      Preview Changes
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Solo Mode</strong>
                      <span>
                        Intent: Keep one speaker in focus while suppressing non-target voices for rapid monologue-style review.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Target speaker</span>
                      <select
                        value={speakerSoloOptions.targetSpeaker}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerSoloOptions((current) => ({
                            ...current,
                            targetSpeaker: event.target.value,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`solo-speaker-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerSoloOptions.collapseInterruptions}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerSoloOptions((current) => ({
                            ...current,
                            collapseInterruptions: event.target.checked,
                          }));
                        }}
                      />
                      <span>Collapse short interruptions</span>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Interruption max (sec)</span>
                      <input
                        type="number"
                        min={0.2}
                        max={5}
                        step={0.1}
                        value={speakerSoloOptions.maxInterruptionSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerSoloOptions((current) => ({
                            ...current,
                            maxInterruptionSec: Math.max(0.2, Number(event.target.value) || 0.8),
                          }));
                        }}
                        disabled={!speakerSoloOptions.collapseInterruptions}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerSoloOptions.compressGaps}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerSoloOptions((current) => ({
                            ...current,
                            compressGaps: event.target.checked,
                          }));
                        }}
                      />
                      <span>Compress gaps around suppressed segments</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewSpeakerSolo({
                          segments: editableTranscriptSegments,
                          options: speakerSoloOptions,
                          segmentIds: hasTranscriptSelection ? transcriptSelectionRange.segmentIds : undefined,
                        }));
                      }}
                      disabled={!speakerSoloOptions.targetSpeaker}
                    >
                      Preview Solo Mode
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Interview Mode</strong>
                      <span>
                        Intent: Keep interviewer prompts intact while tightening respondent answers into a cleaner conversational cut.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Interviewer speaker</span>
                      <select
                        value={speakerInterviewOptions.hostSpeaker}
                        onChange={(event) => {
                          const hostSpeaker = event.target.value;
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            hostSpeaker,
                            respondentSpeaker: current.respondentSpeaker === hostSpeaker
                              ? (speakerOptions.find((speaker) => speaker !== hostSpeaker) ?? hostSpeaker)
                              : current.respondentSpeaker,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`interview-host-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Respondent speaker</span>
                      <select
                        value={speakerInterviewOptions.respondentSpeaker}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            respondentSpeaker: event.target.value,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`interview-respondent-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Tightness</span>
                      <select
                        value={speakerInterviewOptions.tightness}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            tightness: event.target.value as SpeakerInterviewOptions["tightness"],
                          }));
                        }}
                      >
                        <option value="light">Light</option>
                        <option value="medium">Medium</option>
                        <option value="tight">Tight</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerInterviewOptions.removeBackchannels}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            removeBackchannels: event.target.checked,
                          }));
                        }}
                      />
                      <span>Remove short backchannels</span>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerInterviewOptions.collapseInterruptions}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerInterviewOptions((current) => ({
                            ...current,
                            collapseInterruptions: event.target.checked,
                          }));
                        }}
                      />
                      <span>Suppress non-flow interruptions</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewSpeakerInterview({
                          segments: editableTranscriptSegments,
                          options: speakerInterviewOptions,
                          segmentIds: hasTranscriptSelection ? transcriptSelectionRange.segmentIds : undefined,
                        }));
                      }}
                      disabled={!speakerInterviewOptions.hostSpeaker || !speakerInterviewOptions.respondentSpeaker}
                    >
                      Preview Interview Mode
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Monologue Cleanup</strong>
                      <span>
                        Intent: Keep one speaker's through-line readable by suppressing brief outside interruptions and tightening filler-heavy target runs.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Target speaker</span>
                      <select
                        value={speakerMonologueOptions.targetSpeaker}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            targetSpeaker: event.target.value,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`monologue-speaker-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerMonologueOptions.removeBackchannels}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            removeBackchannels: event.target.checked,
                          }));
                        }}
                      />
                      <span>Remove short backchannels from others</span>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerMonologueOptions.suppressInterruptions}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            suppressInterruptions: event.target.checked,
                          }));
                        }}
                      />
                      <span>Suppress short interruptions</span>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Interruption max (sec)</span>
                      <input
                        type="number"
                        min={0.2}
                        max={5}
                        step={0.1}
                        value={speakerMonologueOptions.maxInterruptionSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            maxInterruptionSec: Math.max(0.2, Number(event.target.value) || 0.8),
                          }));
                        }}
                        disabled={!speakerMonologueOptions.suppressInterruptions}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerMonologueOptions.tightenTargetRuns}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            tightenTargetRuns: event.target.checked,
                          }));
                        }}
                      />
                      <span>Tighten filler-heavy target runs</span>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerMonologueOptions.compressGaps}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerMonologueOptions((current) => ({
                            ...current,
                            compressGaps: event.target.checked,
                          }));
                        }}
                      />
                      <span>Compress gaps after suppressed interruptions</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewSpeakerMonologue({
                          segments: editableTranscriptSegments,
                          options: speakerMonologueOptions,
                          segmentIds: hasTranscriptSelection ? transcriptSelectionRange.segmentIds : undefined,
                        }));
                      }}
                      disabled={!speakerMonologueOptions.targetSpeaker}
                    >
                      Preview Monologue Cleanup
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Panel Mode</strong>
                      <span>
                        Intent: Keep multi-speaker panel flow readable by suppressing low-signal backchannels and short cross-talk without rewriting speaker structure.
                      </span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Host / moderator speaker</span>
                      <select
                        value={speakerPanelOptions.hostSpeaker}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            hostSpeaker: event.target.value,
                          }));
                        }}
                        disabled={speakerOptions.length === 0}
                      >
                        {speakerOptions.length > 0 ? speakerOptions.map((speaker) => (
                          <option key={`panel-host-${speaker}`} value={speaker}>{speaker}</option>
                        )) : (
                          <option value="">No speakers</option>
                        )}
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Primary speaker bias</span>
                      <select
                        value={speakerPanelOptions.primarySpeakerBias}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            primarySpeakerBias: event.target.value as SpeakerPanelOptions["primarySpeakerBias"],
                          }));
                        }}
                      >
                        <option value="none">None</option>
                        <option value="balanced">Balanced</option>
                        <option value="host_favoring">Host favoring</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerPanelOptions.removeShortBackchannels}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            removeShortBackchannels: event.target.checked,
                          }));
                        }}
                      />
                      <span>Remove short backchannels</span>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={speakerPanelOptions.suppressShortCrossTalk}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            suppressShortCrossTalk: event.target.checked,
                          }));
                        }}
                      />
                      <span>Suppress short cross-talk interruptions</span>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Max interruption (sec)</span>
                      <input
                        type="number"
                        min={0.2}
                        max={5}
                        step={0.1}
                        value={speakerPanelOptions.maxInterruptionSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSpeakerPanelOptions((current) => ({
                            ...current,
                            maxInterruptionSec: Math.max(0.2, Number(event.target.value) || 0.8),
                          }));
                        }}
                        disabled={!speakerPanelOptions.suppressShortCrossTalk}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewSpeakerPanel({
                          segments: editableTranscriptSegments,
                          options: speakerPanelOptions,
                          segmentIds: hasTranscriptSelection ? transcriptSelectionRange.segmentIds : undefined,
                        }));
                      }}
                      disabled={!speakerPanelOptions.hostSpeaker}
                    >
                      Preview Panel Mode
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool hammer-cleanup-tool--quick">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Quick Clean</strong>
                      <span>
                        Intent: Run deterministic polish in order: Remove Retakes {"->"} Remove Fillers {"->"} Shorten Gaps.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewQuickClean({
                          segments: editableTranscriptSegments,
                          retakes: retakeCleanupOptions,
                          fillers: fillerCleanupOptions,
                          gaps: gapCleanupOptions,
                        }));
                      }}
                    >
                      Preview Quick Clean
                    </button>
                  </section>

                  {cleanupPreview && cleanupPreviewSummary ? (
                    <PolishResultSummary phase="preview" summary={cleanupPreviewSummary}>
                      {cleanupPreview.metadata?.tightenSelection ? (
                        <section className="hammer-tighten-preview" aria-label="Meaning-preserving tighten preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.tightenSelection.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Removed fillers: {cleanupPreview.metadata.tightenSelection.removedFillers}</span>
                            <span>Collapsed repetitions: {cleanupPreview.metadata.tightenSelection.collapsedRepetitions}</span>
                            <span>Merged fragments: {cleanupPreview.metadata.tightenSelection.mergedFragments}</span>
                            <span>Estimated time saved: {cleanupPreview.summary.timeSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.tightenSelection.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.tightenSelection.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__text-grid">
                            <article className="hammer-tighten-preview__pane">
                              <header>Before</header>
                              <p>{cleanupPreview.metadata.tightenSelection.beforeText || "No source text in selection."}</p>
                            </article>
                            <article className="hammer-tighten-preview__pane">
                              <header>After</header>
                              <p>{cleanupPreview.metadata.tightenSelection.afterText || "No tightened text proposed."}</p>
                            </article>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.tightenSelection.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      {cleanupPreview.metadata?.speakerSolo ? (
                        <section className="hammer-tighten-preview" aria-label="Solo mode preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.speakerSolo.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Target speaker: {cleanupPreview.metadata.speakerSolo.targetSpeaker}</span>
                            <span>Scope: {cleanupPreview.metadata.speakerSolo.scopeLabel}</span>
                            <span>Suppressed segments: {cleanupPreview.metadata.speakerSolo.suppressedSegments}</span>
                            <span>Collapsed interruptions: {cleanupPreview.metadata.speakerSolo.collapsedInterruptions}</span>
                            <span>Estimated time saved: {cleanupPreview.metadata.speakerSolo.estimatedDurationSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.speakerSolo.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.speakerSolo.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.speakerSolo.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      {cleanupPreview.metadata?.speakerInterview ? (
                        <section className="hammer-tighten-preview" aria-label="Interview mode preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.speakerInterview.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Interviewer: {cleanupPreview.metadata.speakerInterview.hostSpeaker}</span>
                            <span>Respondent: {cleanupPreview.metadata.speakerInterview.respondentSpeaker}</span>
                            <span>Prompts kept: {cleanupPreview.metadata.speakerInterview.promptsKept}</span>
                            <span>Answer segments tightened: {cleanupPreview.metadata.speakerInterview.answerSegmentsTightened}</span>
                            <span>Fillers removed: {cleanupPreview.metadata.speakerInterview.fillersRemoved}</span>
                            <span>Retakes removed: {cleanupPreview.metadata.speakerInterview.retakesRemoved}</span>
                            <span>Interruptions suppressed: {cleanupPreview.metadata.speakerInterview.interruptionsSuppressed}</span>
                            <span>Estimated time saved: {cleanupPreview.metadata.speakerInterview.estimatedDurationSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.speakerInterview.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.speakerInterview.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.speakerInterview.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      {cleanupPreview.metadata?.speakerMonologue ? (
                        <section className="hammer-tighten-preview" aria-label="Monologue cleanup preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.speakerMonologue.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Target speaker: {cleanupPreview.metadata.speakerMonologue.targetSpeaker}</span>
                            <span>Backchannels removed: {cleanupPreview.metadata.speakerMonologue.backchannelsRemoved}</span>
                            <span>Interruptions suppressed: {cleanupPreview.metadata.speakerMonologue.interruptionsSuppressed}</span>
                            <span>Same-speaker runs tightened: {cleanupPreview.metadata.speakerMonologue.sameSpeakerRunsTightened}</span>
                            <span>Estimated time saved: {cleanupPreview.metadata.speakerMonologue.estimatedDurationSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.speakerMonologue.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.speakerMonologue.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.speakerMonologue.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      {cleanupPreview.metadata?.speakerPanel ? (
                        <section className="hammer-tighten-preview" aria-label="Panel mode preview">
                          <div className="hammer-tighten-preview__intent">
                            <strong>Intent</strong>
                            <span>{cleanupPreview.metadata.speakerPanel.intent}</span>
                          </div>
                          <div className="hammer-tighten-preview__meta">
                            <span>Participant scope: {cleanupPreview.metadata.speakerPanel.participantScope}</span>
                            <span>Host/moderator: {cleanupPreview.metadata.speakerPanel.hostSpeaker}</span>
                            <span>Bias: {cleanupPreview.metadata.speakerPanel.primarySpeakerBias.replace(/_/g, " ")}</span>
                            <span>Backchannels removed: {cleanupPreview.metadata.speakerPanel.backchannelsRemoved}</span>
                            <span>Cross-talk suppressed: {cleanupPreview.metadata.speakerPanel.crossTalkSegmentsSuppressed}</span>
                            <span>Turns preserved: {cleanupPreview.metadata.speakerPanel.turnsPreserved}</span>
                            <span>Estimated time saved: {cleanupPreview.metadata.speakerPanel.estimatedDurationSavedSec.toFixed(1)} s</span>
                            <span>
                              Confidence: {cleanupPreview.metadata.speakerPanel.confidenceLabel}
                              {" "}
                              ({Math.round(cleanupPreview.metadata.speakerPanel.confidenceScore * 100)}%)
                            </span>
                          </div>
                          <div className="hammer-tighten-preview__safety">
                            {cleanupPreview.metadata.speakerPanel.safetyNote}
                          </div>
                        </section>
                      ) : null}
                      <button type="button" onClick={() => applyCleanup(cleanupPreview)}>Apply</button>
                      <button type="button" onClick={() => setCleanupPreview(null)}>Discard</button>
                    </PolishResultSummary>
                  ) : null}
                  {cleanupReceipt ? (
                    <PolishResultSummary phase="applied" summary={cleanupReceipt} />
                  ) : null}
                  <div className="hammer-tool-hint">Deterministic cleanup only. No AI inference path.</div>
                </section>
                )
              ) : null}

              {activeTool === "audio" ? (
                currentPass === "audio_finalization" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Audio Finalization</header>
                    <div className="hammer-tool-hint">
                      Podcast-first finish. Apply Studio Sound once, then make lightweight tweaks only if needed.
                    </div>
                    <div className="hammer-source-card__actions">
                      <button type="button" onClick={applyStudioSoundProfile}>
                        Apply Studio Sound
                      </button>
                    </div>
                    <div className="hammer-tool-hint">
                      Status: {audioStudioSoundApplied ? "Studio Sound applied" : "Studio Sound not applied yet"}
                    </div>
                    <div className="hammer-source-card__actions">
                      <button
                        type="button"
                        className={audioFinalizationCompareMode === "before" ? "is-selected" : ""}
                        onClick={() => setAudioFinalizationCompare("before")}
                      >
                        Before
                      </button>
                      <button
                        type="button"
                        className={audioFinalizationCompareMode === "after" ? "is-selected" : ""}
                        onClick={() => setAudioFinalizationCompare("after")}
                      >
                        After
                      </button>
                    </div>
                    <div className="hammer-tool-hint">
                      Compare mode: {audioFinalizationCompareMode === "before" ? "Before (rack bypassed)" : "After (rack active)"}
                    </div>

                    <label className="hammer-tool-field">
                      <span>Warmth ({audioFinalizationWarmth})</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={audioFinalizationWarmth}
                        onChange={(event) => updateAudioFinalizationWarmth(Number(event.target.value))}
                      />
                    </label>
                    <label className="hammer-tool-field">
                      <span>Presence ({audioFinalizationPresence})</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={audioFinalizationPresence}
                        onChange={(event) => updateAudioFinalizationPresence(Number(event.target.value))}
                      />
                    </label>
                    <label className="hammer-tool-field">
                      <span>Harshness ({audioFinalizationHarshness})</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={audioFinalizationHarshness}
                        onChange={(event) => updateAudioFinalizationHarshness(Number(event.target.value))}
                      />
                    </label>
                    <label className="hammer-tool-field">
                      <span>Output Level ({audioFinalizationOutputLevel})</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={audioFinalizationOutputLevel}
                        onChange={(event) => updateAudioFinalizationOutputLevel(Number(event.target.value))}
                      />
                    </label>
                  </section>
                ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Audio Adjustments</header>
                  <div className="hammer-tool-hint">Current prep status: {props.audioPolish?.status ?? "not_started"}</div>
                  <div className="hammer-tool-hint">
                    Preferred backend: {editableStudioRack.backend_preference}
                  </div>
                  <div className="hammer-tool-hint">
                    Playback lane: {studioRackPlaybackConfig.backend} ({studioRackPlaybackBackendResolution.status})
                  </div>
                  <div className="hammer-tool-hint">
                    Render lane: {studioRackRenderConfig.backend} ({studioRackRenderBackendResolution.status})
                  </div>
                  {studioRackRenderStatus ? (
                    <div className="hammer-tool-hint">
                      Last render lane result: {studioRackRenderStatus.message}
                    </div>
                  ) : null}
                  {studioRackRenderStatus ? (
                    <div className="hammer-tool-hint">
                      Render receipt: requested lane {studioRackRenderStatus.requestedBackend}, resolved lane {studioRackRenderStatus.resolvedBackend}, status {studioRackRenderStatus.status}
                    </div>
                  ) : null}
                  {studioRackRenderStatus?.outputWorkpiecePath ? (
                    <div className="hammer-tool-hint">
                      Derived artifact: {studioRackRenderStatus.outputWorkpiecePath}
                    </div>
                  ) : null}
                  {studioRackRenderAppliedModules.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Render applied modules: {studioRackRenderAppliedModules.join(", ")}
                    </div>
                  ) : null}
                  {studioRackRenderDeferredModules.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Requested but not yet rendered in v1: {studioRackRenderDeferredModules.join(", ")}
                    </div>
                  ) : null}
                  <div className="hammer-tool-hint">Active rack modules: {studioRackEnabledModuleCount}</div>
                  <div className="hammer-tool-hint">
                    Podcast Master: {podcastMasterLayer ? "declared" : "not declared"}
                    {podcastMasterLayer
                      ? ` · export posture ${podcastMasterLayer.posture} (${podcastMasterLayer.capability})`
                      : ""}
                  </div>
                  <div className="hammer-tool-hint">
                    {podcastMasterUiStatus.headline}
                  </div>
                  <div className="hammer-tool-hint">
                    {podcastMasterUiStatus.detail}
                  </div>
                  {podcastMasterLayer?.meta ? (
                    <div className="hammer-tool-hint">
                      Preset {podcastMasterLayer.meta.preset}
                      {` · loudness ${podcastMasterLayer.meta.normalization_lufs} LUFS`}
                      {` · compression ${podcastMasterLayer.meta.compression_amount}`}
                      {` · limiter ${podcastMasterLayer.meta.limiter_ceiling_dbtp} dBTP`}
                      {` · preview ${podcastMasterLayer.meta.preview_mode === "previewable" ? "supported" : "export-only"}`}
                      {podcastMasterLayer.meta.applied_stages?.length
                        ? ` · applied ${podcastMasterLayer.meta.applied_stages.join(", ")}`
                        : ""}
                      {podcastMasterLayer.meta.skipped_stages?.length
                        ? ` · skipped ${podcastMasterLayer.meta.skipped_stages.join(", ")}`
                        : ""}
                    </div>
                  ) : null}
                  <button type="button" onClick={applyPodcastMasterPass} disabled={Boolean(podcastMasterLayer)}>
                    {podcastMasterUiStatus.action_label}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusOverride("tool-focus");
                      setStudioRackOpen((current) => !current);
                    }}
                  >
                    {studioRackOpen ? "Hide Studio Rack" : "Studio Rack ->"}
                  </button>
                  {studioRackOpen ? (
                    <>
                      <label className="hammer-tool-check">
                        <input
                          type="checkbox"
                          checked={editableStudioRack.is_enabled}
                          onChange={(event) => setStudioRackEnabled(event.target.checked)}
                        />
                        <span>Enable rack</span>
                      </label>
                      <label className="hammer-tool-check">
                        <input
                          type="checkbox"
                          checked={editableStudioRack.is_bypassed}
                          onChange={(event) => setStudioRackBypassed(event.target.checked)}
                          disabled={!editableStudioRack.is_enabled}
                        />
                        <span>Global bypass (A/B)</span>
                      </label>
                      <label className="hammer-tool-field">
                        <span>Preferred render backend</span>
                        <select
                          value={editableStudioRack.backend_preference}
                          onChange={(event) => setStudioRackBackend(event.target.value === "ffmpeg" ? "ffmpeg" : "native")}
                        >
                          <option value="native">Native/editor lane</option>
                          <option value="ffmpeg">FFmpeg power lane</option>
                        </select>
                      </label>
                      <section className="hammer-cleanup-tool">
                        <div className="hammer-cleanup-tool__head">
                          <strong>Gate</strong>
                          <span>Smooth spoken-word gate.</span>
                        </div>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.gate.is_enabled}
                            onChange={(event) => setStudioRackModuleEnabled("gate", event.target.checked)}
                          />
                          <span>Enable gate</span>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.gate.is_bypassed}
                            onChange={(event) => setStudioRackModuleBypassed("gate", event.target.checked)}
                            disabled={!editableStudioRack.modules.gate.is_enabled}
                          />
                          <span>Bypass gate</span>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Threshold (dB)</span>
                          <input
                            type="number"
                            min={-80}
                            max={0}
                            step={1}
                            value={editableStudioRack.modules.gate.threshold_db}
                            onChange={(event) => applyStudioRackMutation("Adjust gate threshold", (current) => ({
                              ...current,
                              modules: {
                                ...current.modules,
                                gate: { ...current.modules.gate, threshold_db: Number(event.target.value) },
                              },
                            }))}
                          />
                        </label>
                      </section>
                      <section className="hammer-cleanup-tool">
                        <div className="hammer-cleanup-tool__head">
                          <strong>Compressor</strong>
                          <span>Dialogue dynamics control.</span>
                        </div>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.compressor.is_enabled}
                            onChange={(event) => setStudioRackModuleEnabled("compressor", event.target.checked)}
                          />
                          <span>Enable compressor</span>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.compressor.is_bypassed}
                            onChange={(event) => setStudioRackModuleBypassed("compressor", event.target.checked)}
                            disabled={!editableStudioRack.modules.compressor.is_enabled}
                          />
                          <span>Bypass compressor</span>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Ratio</span>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            step={0.1}
                            value={editableStudioRack.modules.compressor.ratio}
                            onChange={(event) => applyStudioRackMutation("Adjust compressor ratio", (current) => ({
                              ...current,
                              modules: {
                                ...current.modules,
                                compressor: { ...current.modules.compressor, ratio: Number(event.target.value) },
                              },
                            }))}
                          />
                        </label>
                      </section>
                      <section className="hammer-cleanup-tool">
                        <div className="hammer-cleanup-tool__head">
                          <strong>Parametric EQ</strong>
                          <span>Low shelf, mid, and high shelf shaping.</span>
                        </div>
                        <div className="hammer-tool-hint">
                          Render lane note: EQ controls are visible now, but FFmpeg render v1 does not apply EQ yet.
                        </div>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.eq.is_enabled}
                            onChange={(event) => setStudioRackModuleEnabled("eq", event.target.checked)}
                          />
                          <span>Enable EQ</span>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.eq.is_bypassed}
                            onChange={(event) => setStudioRackModuleBypassed("eq", event.target.checked)}
                            disabled={!editableStudioRack.modules.eq.is_enabled}
                          />
                          <span>Bypass EQ</span>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Mid gain (dB)</span>
                          <input
                            type="number"
                            min={-12}
                            max={12}
                            step={0.1}
                            value={editableStudioRack.modules.eq.mid_gain_db}
                            onChange={(event) => applyStudioRackMutation("Adjust EQ mid gain", (current) => ({
                              ...current,
                              modules: {
                                ...current.modules,
                                eq: { ...current.modules.eq, mid_gain_db: Number(event.target.value) },
                              },
                            }))}
                          />
                        </label>
                      </section>
                      <section className="hammer-cleanup-tool">
                        <div className="hammer-cleanup-tool__head">
                          <strong>Reverb</strong>
                          <span>Subtle space for voice polish.</span>
                        </div>
                        <div className="hammer-tool-hint">
                          Render lane note: Reverb controls are visible now, but FFmpeg render v1 does not apply reverb yet.
                        </div>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.reverb.is_enabled}
                            onChange={(event) => setStudioRackModuleEnabled("reverb", event.target.checked)}
                          />
                          <span>Enable reverb</span>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.reverb.is_bypassed}
                            onChange={(event) => setStudioRackModuleBypassed("reverb", event.target.checked)}
                            disabled={!editableStudioRack.modules.reverb.is_enabled}
                          />
                          <span>Bypass reverb</span>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Mix</span>
                          <input
                            type="number"
                            min={0}
                            max={0.35}
                            step={0.01}
                            value={editableStudioRack.modules.reverb.mix}
                            onChange={(event) => applyStudioRackMutation("Adjust reverb mix", (current) => ({
                              ...current,
                              modules: {
                                ...current.modules,
                                reverb: { ...current.modules.reverb, mix: Number(event.target.value) },
                              },
                            }))}
                          />
                        </label>
                      </section>
                      <section className="hammer-cleanup-tool">
                        <div className="hammer-cleanup-tool__head">
                          <strong>Tube Mic Character</strong>
                          <span>Premium condenser-style character layer.</span>
                        </div>
                        <div className="hammer-tool-hint">
                          Render lane note: Tube Mic Character controls are visible now, but FFmpeg render v1 does not apply tube shaping yet.
                        </div>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.tubeMicCharacter.is_enabled}
                            onChange={(event) => setStudioRackModuleEnabled("tubeMicCharacter", event.target.checked)}
                          />
                          <span>Enable Tube Mic Character</span>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={editableStudioRack.modules.tubeMicCharacter.is_bypassed}
                            onChange={(event) => setStudioRackModuleBypassed("tubeMicCharacter", event.target.checked)}
                            disabled={!editableStudioRack.modules.tubeMicCharacter.is_enabled}
                          />
                          <span>Bypass Tube Mic Character</span>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Amount</span>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={editableStudioRack.modules.tubeMicCharacter.amount}
                            onChange={(event) => applyStudioRackMutation("Adjust Tube Mic Character amount", (current) => ({
                              ...current,
                              modules: {
                                ...current.modules,
                                tubeMicCharacter: { ...current.modules.tubeMicCharacter, amount: Number(event.target.value) },
                              },
                            }))}
                          />
                        </label>
                      </section>
                    </>
                  ) : null}
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={audioLevelingEnabled}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setAudioLevelingEnabled(event.target.checked);
                      }}
                    />
                    <span>Level dialogue track (legacy prep)</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={audioNoiseReductionEnabled}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setAudioNoiseReductionEnabled(event.target.checked);
                      }}
                    />
                    <span>Reduce background noise (legacy prep)</span>
                  </label>
                </section>
                )
              ) : null}

              {activeTool === "video" ? (
                currentPass === "visual_finishing" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Visual Finishing</header>
                    <div className="hammer-tool-hint">
                      Podcast-first finishing controls only. Keep changes simple and fast.
                    </div>
                    <label className="hammer-tool-field">
                      <span>LUT Preset</span>
                      <select
                        value={visualLutPreset}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setVisualLutPreset(event.target.value as HammerVisualLutPreset);
                        }}
                      >
                        <option value="neutral">Neutral</option>
                        <option value="clean_daylight">Clean Daylight</option>
                        <option value="warm_studio">Warm Studio</option>
                        <option value="cool_evening">Cool Evening</option>
                        <option value="high_contrast">High Contrast</option>
                        <option value="soft_documentary">Soft Documentary</option>
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>White Balance ({visualWhiteBalance})</span>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        step={1}
                        value={visualWhiteBalance}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setVisualWhiteBalance(Number(event.target.value));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-field">
                      <span>Color ({visualColorAmount})</span>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        step={1}
                        value={visualColorAmount}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setVisualColorAmount(Number(event.target.value));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={visualBackgroundBlur}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setVisualBackgroundBlur(event.target.checked);
                        }}
                      />
                      <span>Background Blur</span>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={visualEyeContact}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setVisualEyeContact(event.target.checked);
                        }}
                      />
                      <span>Eye Contact</span>
                    </label>
                    <div className="hammer-tool-hint">
                      Eye Contact and Background Blur are lightweight preview controls in this phase.
                    </div>
                  </section>
                ) : currentPass === "image_placement" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Image Placement</header>
                    <div className="hammer-tool-hint">
                      Direct manipulation mode. Drag and resize image clips in timeline or preview.
                    </div>
                    {selectedImagePlacement ? (
                      <>
                        <div className="hammer-tool-hint">
                          Selected: {selectedImagePlacement.label}
                          {` (${selectedImagePlacement.startSec.toFixed(1)}s - ${selectedImagePlacement.endSec.toFixed(1)}s)`}
                        </div>
                        <label className="hammer-tool-field">
                          <span>Start (sec)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={selectedImagePlacement.startSec}
                            onChange={(event) => {
                              const nextStart = Math.max(0, Number(event.target.value) || 0);
                              const minEnd = roundToTenth(nextStart + MIN_IMAGE_PLACEMENT_DURATION_SEC);
                              commitVisualPlacementWindow(selectedImagePlacement.id, {
                                startSec: nextStart,
                                endSec: Math.max(minEnd, selectedImagePlacement.endSec),
                                label: "Adjust image clip start",
                              });
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>End (sec)</span>
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={selectedImagePlacement.endSec}
                            onChange={(event) => {
                              const nextEnd = Math.max(0, Number(event.target.value) || 0);
                              commitVisualPlacementWindow(selectedImagePlacement.id, {
                                startSec: selectedImagePlacement.startSec,
                                endSec: Math.max(
                                  roundToTenth(selectedImagePlacement.startSec + MIN_IMAGE_PLACEMENT_DURATION_SEC),
                                  nextEnd,
                                ),
                                label: "Adjust image clip end",
                              });
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button type="button" onClick={() => updateVisualPlacementTiming(selectedImagePlacement.id, -0.5)}>
                            Move -0.5s
                          </button>
                          <button type="button" onClick={() => updateVisualPlacementTiming(selectedImagePlacement.id, 0.5)}>
                            Move +0.5s
                          </button>
                          <button type="button" onClick={() => removeVisualPlacement(selectedImagePlacement.id)}>
                            Remove Clip
                          </button>
                        </div>
                        <label className="hammer-tool-field">
                          <span>Position X ({Math.round(selectedImagePlacementTransform.leftPct)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={92}
                            step={1}
                            value={selectedImagePlacementTransform.leftPct}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              const updated = clampImagePlacementTransform({
                                ...selectedImagePlacementTransform,
                                leftPct: next,
                              });
                              updateImagePlacementTransform(selectedImagePlacement.id, () => updated);
                              commitImagePlacementTransform(selectedImagePlacement.id, updated, "Adjust visual overlay X");
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Position Y ({Math.round(selectedImagePlacementTransform.topPct)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={92}
                            step={1}
                            value={selectedImagePlacementTransform.topPct}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              const updated = clampImagePlacementTransform({
                                ...selectedImagePlacementTransform,
                                topPct: next,
                              });
                              updateImagePlacementTransform(selectedImagePlacement.id, () => updated);
                              commitImagePlacementTransform(selectedImagePlacement.id, updated, "Adjust visual overlay Y");
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>
                            Scale ({Math.round((selectedImagePlacementTransform.widthPct / DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) * 100)}%)
                          </span>
                          <input
                            type="range"
                            min={50}
                            max={200}
                            step={1}
                            value={Math.round((selectedImagePlacementTransform.widthPct / DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct) * 100)}
                            onChange={(event) => {
                              const scale = Number(event.target.value) / 100;
                              const updated = clampImagePlacementTransform({
                                ...selectedImagePlacementTransform,
                                widthPct: DEFAULT_IMAGE_PLACEMENT_TRANSFORM.widthPct * scale,
                                heightPct: DEFAULT_IMAGE_PLACEMENT_TRANSFORM.heightPct * scale,
                              });
                              updateImagePlacementTransform(selectedImagePlacement.id, () => updated);
                              commitImagePlacementTransform(selectedImagePlacement.id, updated, "Adjust visual overlay scale");
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              updateImagePlacementTransform(selectedImagePlacement.id, () => DEFAULT_IMAGE_PLACEMENT_TRANSFORM);
                              commitImagePlacementTransform(
                                selectedImagePlacement.id,
                                DEFAULT_IMAGE_PLACEMENT_TRANSFORM,
                                "Center visual overlay",
                              );
                            }}
                          >
                            Center
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="hammer-tool-hint">
                        Select an image clip in the timeline to open inspector controls.
                      </div>
                    )}
                  </section>
                ) : currentPass === "image_animation" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Image Animation</header>
                    <div className="hammer-tool-hint">
                      Right-click an image clip in the timeline to assign an animation preset.
                    </div>
                    <div className="hammer-tool-hint">
                      One preset per clip. Current selection: {selectedImageAnimationLabel}
                    </div>
                    {selectedImagePlacement ? (
                      <div className="hammer-tool-hint">
                        Selected clip: {selectedImagePlacement.label}
                      </div>
                    ) : (
                      <div className="hammer-tool-hint">Select an image clip to preview its animation preset.</div>
                    )}
                  </section>
                ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Visual Placement</header>
                  <label className="hammer-tool-field">
                    <span>Snap Mode</span>
                    <select
                      value={videoSnapMode}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setVideoSnapMode(event.target.value as "timeline" | "segment");
                      }}
                    >
                      <option value="timeline">Timeline grid</option>
                      <option value="segment">Segment boundaries</option>
                    </select>
                  </label>
                  <div className="hammer-tool-hint">Placed visuals: {editableVisualPlacements?.placements.length ?? 0}</div>
                  <div className="hammer-tool-hint">
                    Resolved bindings: {resolvedBrollBindingItems.length} · unresolved suggestions: {unresolvedBrollSuggestionItems.length}
                  </div>
                  <div className="hammer-tool-hint">
                    Needs review: {boundAttentionSummary.total}
                    {` (unresolved ${boundAttentionSummary.unresolvedCount}, degraded ${boundAttentionSummary.degradedCount}, superseded ${boundAttentionSummary.supersededCount}, transitions ${boundAttentionSummary.transitionCount})`}
                  </div>
                  <div className="hammer-source-card__actions">
                    <button type="button" onClick={() => addMinimalTransition("hard_cut")}>Add Hard Cut</button>
                    <button type="button" onClick={() => addMinimalTransition("crossfade")}>Add Crossfade</button>
                    <button type="button" onClick={() => addMinimalTransition("dip_to_black")}>Add Dip To Black</button>
                    <button type="button" onClick={() => addMinimalTransition("fade_audio")}>Add Fade Audio</button>
                  </div>
                  <div className="hammer-source-card__actions">
                    <button
                      type="button"
                      onClick={() => navigateBoundAttention("previous")}
                      disabled={boundAttentionQueue.length === 0}
                    >
                      Previous Attention
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateBoundAttention("next")}
                      disabled={boundAttentionQueue.length === 0}
                    >
                      Next Attention
                    </button>
                  </div>
                  {boundAttentionQueue.length > 0 ? (
                    <div className="hammer-source-list">
                      {boundAttentionQueue.slice(0, 5).map((item) => (
                        <article key={`attention:${item.operationId}`} className={selectedBoundBrollOperationId === item.operationId ? "hammer-source-card is-selected" : "hammer-source-card"}>
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span>{item.kind.replace(/_/g, " ")}</span>
                          </header>
                          <div className="hammer-source-card__meta">
                            <span>{item.reasons.join(" ")}</span>
                          </div>
                          <div className="hammer-source-card__actions">
                            <button
                              type="button"
                              onClick={() => focusBoundAttentionOperation(item.operationId)}
                            >
                              Open In Inspector
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {selectedBoundBrollInspectorState ? (
                    <section className="hammer-cleanup-tool">
                      <div className="hammer-cleanup-tool__head">
                        <strong>Bound Object Inspector</strong>
                        <span>{selectedBoundBrollInspectorState.operationId}</span>
                      </div>
                      <div className="hammer-tool-hint">
                        Intent: {selectedBoundBrollInspectorState.intentSource}
                        {selectedBoundBrollInspectorState.intentDescription
                          ? ` · ${selectedBoundBrollInspectorState.intentDescription}`
                          : ""}
                      </div>
                      <div className="hammer-tool-hint">
                        Binding: {selectedBoundBrollInspectorState.bindingState} · lifecycle: {selectedBoundBrollInspectorState.lifecycle}
                      </div>
                      <div className="hammer-tool-hint">
                        Window: {selectedBoundBrollInspectorState.startSec.toFixed(1)}s - {selectedBoundBrollInspectorState.endSec.toFixed(1)}s
                      </div>
                      <div className="hammer-tool-hint">Asset: {selectedBoundBrollInspectorState.assetRef}</div>
                      <div className="hammer-tool-hint">
                        Posture: preview {selectedBoundBrollInspectorState.previewPosture}
                        {` · export ${selectedBoundBrollInspectorState.exportPosture} · handoff ${selectedBoundBrollInspectorState.handoffPosture}`}
                      </div>
                      {selectedBoundBrollInspectorState.linkedDuck ? (
                        <div className="hammer-tool-hint">
                          Linked duck {selectedBoundBrollInspectorState.linkedDuck.operationId}
                          {`: ${selectedBoundBrollInspectorState.linkedDuck.startSec.toFixed(1)}s - ${selectedBoundBrollInspectorState.linkedDuck.endSec.toFixed(1)}s`}
                          {` · aligned ${selectedBoundBrollInspectorState.linkedDuck.aligned ? "yes" : "no"}`}
                          {` · ${selectedBoundBrollInspectorState.linkedDuck.capability}`}
                        </div>
                      ) : (
                        <div className="hammer-tool-hint">Linked duck: none</div>
                      )}
                      {selectedBoundBrollInspectorState.needsAttention ? (
                        <div className="hammer-tool-hint">
                          Attention: {selectedBoundBrollInspectorState.attentionFlags.join(" ")}
                        </div>
                      ) : (
                        <div className="hammer-tool-hint">Attention: none</div>
                      )}
                      {selectedBoundBrollInspectorState.bindingState === "resolved"
                        && selectedBoundBrollInspectorState.lifecycle === "active" ? (
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => moveResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, -0.5)}
                          >
                            Move -0.5s
                          </button>
                          <button
                            type="button"
                            onClick={() => moveResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, 0.5)}
                          >
                            Move +0.5s
                          </button>
                          <button
                            type="button"
                            onClick={() => trimResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, "start", 0.25)}
                          >
                            Trim In +0.25s
                          </button>
                          <button
                            type="button"
                            onClick={() => trimResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, "end", -0.25)}
                          >
                            Trim Out -0.25s
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const replacement = sourceBrollItems.find(
                                (item) => item.assetPath && item.assetPath !== selectedBoundBrollInspectorState.assetRef,
                              )?.assetPath ?? null;
                              if (!replacement) {
                                setTranscriptTimingHint("Upload another b-roll asset before replacing this binding.");
                                return;
                              }
                              replaceResolvedBrollBinding(selectedBoundBrollInspectorState.operationId, replacement);
                            }}
                          >
                            Replace Asset
                          </button>
                          <button
                            type="button"
                            onClick={() => revertResolvedBrollBinding(selectedBoundBrollInspectorState.operationId)}
                          >
                            Revert Binding
                          </button>
                        </div>
                      ) : null}
                      {selectedBoundBrollInspectorState.bindingState === "unresolved"
                        && selectedBoundBrollInspectorState.lifecycle === "active" ? (
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              const candidate = sourceBrollItems.find((item) => item.assetPath)?.assetPath ?? null;
                              if (!candidate) {
                                setTranscriptTimingHint("Upload B-roll before resolving this suggestion.");
                                return;
                              }
                              resolveHearthBrollSuggestion({
                                operationId: selectedBoundBrollInspectorState.operationId,
                                assetPath: candidate,
                                label: "Resolved from inspector",
                              });
                            }}
                          >
                            Resolve With First Asset
                          </button>
                          <button
                            type="button"
                            onClick={() => discardHearthBrollSuggestion(selectedBoundBrollInspectorState.operationId)}
                          >
                            Discard Suggestion
                          </button>
                        </div>
                      ) : null}
                    </section>
                  ) : selectedTransitionBoundObject ? (
                    <section className="hammer-cleanup-tool">
                      <div className="hammer-cleanup-tool__head">
                        <strong>Transition Inspector</strong>
                        <span>{selectedTransitionBoundObject.object_id}</span>
                      </div>
                      <div className="hammer-tool-hint">
                        Type: {selectedTransitionBoundObject.payload.transition_kind}
                      </div>
                      <div className="hammer-tool-hint">
                        Window: {selectedTransitionBoundObject.placement_window.start_sec.toFixed(1)}s - {selectedTransitionBoundObject.placement_window.end_sec.toFixed(1)}s
                      </div>
                      <div className="hammer-tool-hint">
                        Posture: preview {selectedTransitionBoundObject.posture.preview}
                        {` · export ${selectedTransitionBoundObject.posture.export} · handoff ${selectedTransitionBoundObject.posture.handoff}`}
                      </div>
                      <div className="hammer-tool-hint">
                        Attention: {selectedTransitionBoundObject.attention_flags.length > 0
                          ? selectedTransitionBoundObject.attention_flags.join(", ")
                          : "none"}
                      </div>
                    </section>
                  ) : (
                    <div className="hammer-tool-hint">
                      Select a bound object from the queue or Source Desk to inspect canonical linkage and attention state.
                    </div>
                  )}
                </section>
                )
              ) : null}

              {activeTool === "captions" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Caption Output</header>
                  <section className="hammer-caption-source-card">
                    <div className="hammer-caption-source-card__head">
                      <strong>Caption Source</strong>
                      <span>{captionArtifactStatusLabel}</span>
                    </div>
                    <div className="hammer-caption-source-card__status-line">
                      <article className={`hammer-caption-status-pill hammer-caption-status-pill--${captionBuiltTone}`}>
                        <span className="hammer-caption-status-pill__label">Built</span>
                        <strong>{captionBuiltSummary}</strong>
                      </article>
                      <article className={`hammer-caption-status-pill hammer-caption-status-pill--${captionEditedTone}`}>
                        <span className="hammer-caption-status-pill__label">Edited</span>
                        <strong>{captionEditedSummary}</strong>
                        <span className="hammer-caption-status-pill__detail">{captionEditedBasisDetail}</span>
                      </article>
                      <article className="hammer-caption-status-pill hammer-caption-status-pill--basis">
                        <span className="hammer-caption-status-pill__label">Basis</span>
                        <strong>{captionSourceLabel}</strong>
                      </article>
                    </div>
                    <div className={`hammer-caption-mode-banner hammer-caption-mode-banner--${activeCaptionMode === "edited" ? "editing" : "viewing"}`}>
                      <strong>{captionActiveModeLabel}</strong>
                      <span>{captionActiveModeSourceLabel}</span>
                    </div>
                    <div className={`hammer-caption-release-signal hammer-caption-release-signal--${captionReleasePrepSafetyState}`}>
                      <strong>{captionReleasePrepSafetyLabel}</strong>
                      <span>{captionReleasePrepSafetyDetail}</span>
                    </div>
                    {captionEditedState ? (
                      <div className="hammer-caption-manual-summary">{captionEditedChangeSummary}</div>
                    ) : null}
                    <div className="hammer-tool-hint">
                      Export basis authority: captions follow Export Basis, not current Viewing layer.
                    </div>
                    <div className="hammer-tool-hint">Release prep caption source: {captionReleaseSourceLabel}</div>
                    {captionBuildState ? (
                      <div className="hammer-tool-hint">
                        Last build {new Date(captionBuildState.builtAt).toLocaleTimeString()} ·
                        {` ${captionBuildState.chunkCount} rows`}
                        {captionBuildState.approximateTiming ? " · approximate timing" : ""}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        handleRebuildCaptionArtifacts();
                      }}
                    >
                      {captionBuildFreshness === "current" ? "Refresh Captions" : "Generate Captions"}
                    </button>
                    <div className="hammer-caption-source-card__action-note">{captionRebuildConsequenceLabel}</div>
                    {captionBuildState && !captionEditedState ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          handleEnableCaptionEdits();
                        }}
                      >
                        Create Edited Captions
                      </button>
                    ) : null}
                    {captionEditedState ? (
                      <div className="hammer-caption-source-card__mode-row">
                        <button
                          type="button"
                          className={activeCaptionMode === "built" ? "is-active" : ""}
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            setActiveCaptionArtifactMode("built");
                          }}
                        >
                          Built captions
                        </button>
                        <button
                          type="button"
                          className={activeCaptionMode === "edited" ? "is-active" : ""}
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            setActiveCaptionArtifactMode("edited");
                          }}
                        >
                          Edited captions
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            handleDiscardEditedCaptions();
                          }}
                        >
                          Discard edits
                        </button>
                      </div>
                    ) : null}
                    {captionDiscardConsequenceLabel ? (
                      <div className="hammer-caption-source-card__action-note">{captionDiscardConsequenceLabel}</div>
                    ) : null}
                  </section>
                  <label className="hammer-tool-field">
                    <span>Caption Style</span>
                    <select
                      value={captionFormatting.style}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setCaptionFormatting((current) => ({
                          ...current,
                          style: event.target.value as "sentence" | "title" | "upper",
                        }));
                      }}
                    >
                      <option value="sentence">Sentence case</option>
                      <option value="title">Title case</option>
                      <option value="upper">UPPERCASE</option>
                    </select>
                  </label>
                  <label className="hammer-tool-field">
                    <span>Max chars per line</span>
                    <input
                      type="number"
                      min={24}
                      max={80}
                      step={1}
                      value={captionFormatting.maxCharsPerLine}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        const nextValue = Math.max(24, Math.min(80, Number(event.target.value) || 42));
                        setCaptionFormatting((current) => ({ ...current, maxCharsPerLine: nextValue }));
                      }}
                    />
                  </label>
                  <label className="hammer-tool-field">
                    <span>Max lines per caption</span>
                    <select
                      value={captionFormatting.maxLinesPerCaption}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setCaptionFormatting((current) => ({
                          ...current,
                          maxLinesPerCaption: Number(event.target.value) || 2,
                        }));
                      }}
                    >
                      <option value={1}>1 line</option>
                      <option value={2}>2 lines</option>
                      <option value={3}>3 lines</option>
                    </select>
                  </label>
                  <label className="hammer-tool-field">
                    <span>Reading speed</span>
                    <select
                      value={captionFormatting.readingSpeed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setCaptionFormatting((current) => ({
                          ...current,
                          readingSpeed: event.target.value as HammerCaptionReadingSpeed,
                        }));
                      }}
                    >
                      <option value="slow">Slow</option>
                      <option value="standard">Standard</option>
                      <option value="fast">Fast</option>
                    </select>
                  </label>
                  <label className="hammer-tool-field">
                    <span>Punctuation</span>
                    <select
                      value={captionFormatting.punctuationMode}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setCaptionFormatting((current) => ({
                          ...current,
                          punctuationMode: event.target.value as HammerCaptionPunctuationMode,
                        }));
                      }}
                    >
                      <option value="preserve">Preserve</option>
                      <option value="normalize">Normalize</option>
                    </select>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={captionFormatting.includeSpeakerLabels}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setCaptionFormatting((current) => ({
                          ...current,
                          includeSpeakerLabels: event.target.checked,
                        }));
                      }}
                    />
                    <span>Include speaker labels</span>
                  </label>
                  <div className="hammer-caption-preview-card">
                    <div className="hammer-caption-preview-card__head">
                      <div className="hammer-caption-preview-card__head-copy">
                        <strong>Caption Preview</strong>
                        <span>{captionActiveModeLabel}</span>
                      </div>
                      <select
                        aria-label="Caption artifact format"
                        title="Caption artifact format"
                        value={selectedCaptionArtifactFormat}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setSelectedCaptionArtifactFormat(event.target.value as "srt" | "vtt");
                        }}
                      >
                        <option value="srt">SRT</option>
                        <option value="vtt">VTT</option>
                      </select>
                    </div>
                    {captionBuildFeedback ? (
                      <div className="hammer-tool-hint">{captionBuildFeedback}</div>
                    ) : null}
                    {activeCaptionState ? (
                      <>
                        <div className="hammer-caption-preview-list">
                          {activeCaptionState.chunks.slice(0, 12).map((chunk) => (
                            <article key={chunk.id} className="hammer-caption-preview-list__row">
                              <div className="hammer-caption-preview-list__time">
                                {chunk.startSec.toFixed(1)}s - {chunk.endSec.toFixed(1)}s
                              </div>
                              {activeCaptionMode === "edited" ? (
                                <>
                                  <textarea
                                    className="hammer-caption-preview-list__editor"
                                    aria-label={`Edit caption block ${chunk.startSec.toFixed(1)} to ${chunk.endSec.toFixed(1)} seconds`}
                                    title="Edit caption block"
                                    value={chunk.text}
                                    ref={(node) => {
                                      if (node) {
                                        captionEditorRefs.current.set(chunk.id, node);
                                      } else {
                                        captionEditorRefs.current.delete(chunk.id);
                                      }
                                    }}
                                    onChange={(event) => {
                                      setFocusOverride("tool-focus");
                                      handleEditCaptionChunkText(chunk.id, event.target.value);
                                    }}
                                  />
                                  <div className="hammer-caption-preview-list__actions">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFocusOverride("tool-focus");
                                        handleSplitEditedCaptionChunk(chunk.id);
                                      }}
                                    >
                                      Split
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFocusOverride("tool-focus");
                                        handleMergeEditedCaptionChunk({ chunkId: chunk.id, direction: "up" });
                                      }}
                                    >
                                      Merge Up
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFocusOverride("tool-focus");
                                        handleMergeEditedCaptionChunk({ chunkId: chunk.id, direction: "down" });
                                      }}
                                    >
                                      Merge Down
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFocusOverride("tool-focus");
                                        handleNormalizeEditedCaptionChunkPunctuation(chunk.id);
                                      }}
                                    >
                                      Normalize
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFocusOverride("tool-focus");
                                        handleToggleEditedCaptionChunkSpeakerLabel(chunk.id);
                                      }}
                                    >
                                      Toggle Label
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <pre className="hammer-caption-preview-list__text">{chunk.text}</pre>
                              )}
                            </article>
                          ))}
                        </div>
                        <details>
                          <summary>{selectedCaptionArtifactFormat.toUpperCase()} output</summary>
                          <pre className="hammer-caption-preview-card__artifact">{activeCaptionArtifactText}</pre>
                        </details>
                      </>
                    ) : (
                      <div className="hammer-tool-hint">
                        No caption artifact yet. Generate captions to preview deterministic output from Export Basis.
                      </div>
                    )}
                  </div>
                </section>
              ) : null}

              {activeTool === "details" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Edit Metadata</header>
                  <label className="hammer-tool-field">
                    <span>Tag</span>
                    <input
                      type="text"
                      value={detailTag}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setDetailTag(event.target.value);
                      }}
                    />
                  </label>
                </section>
              ) : null}

              {activeTool === "finishing" ? (
                currentPass === "packaging" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Packaging</header>
                    <div className="hammer-tool-hint">
                      One-click branding pass. Reuses your existing intro/outro assets and timeline placements.
                    </div>
                    <div className="hammer-source-card__actions">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          applyIntroPlacement();
                        }}
                        disabled={!introOutroSelection.intro_path}
                      >
                        Apply Intro
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          applyOutroPlacement();
                        }}
                        disabled={!introOutroSelection.outro_path}
                      >
                        Apply Outro
                      </button>
                    </div>
                    <div className="hammer-tool-hint">
                      Intro: {introOutroSelection.intro_path ? "ready" : "not selected"} ·
                      {" "}Outro: {introOutroSelection.outro_path ? "ready" : "not selected"}
                    </div>
                    <div className="hammer-tool-hint">
                      Intro applied: {packagingIntroPlacement ? "yes" : "no"} ·
                      {" "}Outro applied: {packagingOutroPlacement ? "yes" : "no"}
                    </div>

                    <label className="hammer-tool-field">
                      <span>Logo Asset</span>
                      <select
                        value={packagingLogoAssetPath ?? ""}
                        onChange={(event) => {
                          const nextPath = event.target.value || null;
                          setFocusOverride("tool-focus");
                          applyLogoOverlayStyle({ assetPath: nextPath });
                        }}
                      >
                        <option value="">No logo selected</option>
                        {sourceImageLibraryItems.map((item) => (
                          <option key={`logo-${item.path}`} value={item.path}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="hammer-source-card__actions">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          toggleLogoOverlay();
                        }}
                        disabled={!packagingLogoPlacement && !packagingLogoAssetPath}
                      >
                        {packagingLogoPlacement ? "Disable Logo Overlay" : "Toggle Logo Overlay"}
                      </button>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Logo Position</span>
                      <select
                        value={packagingLogoPosition}
                        onChange={(event) => {
                          const next = event.target.value as HammerLogoOverlayPosition;
                          setFocusOverride("tool-focus");
                          applyLogoOverlayStyle({ position: next });
                        }}
                      >
                        {LOGO_POSITION_OPTIONS.map((option) => (
                          <option key={`logo-position-${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Logo Size</span>
                      <select
                        value={packagingLogoSize}
                        onChange={(event) => {
                          const next = event.target.value as HammerLogoOverlaySize;
                          setFocusOverride("tool-focus");
                          applyLogoOverlayStyle({ size: next });
                        }}
                      >
                        {LOGO_SIZE_OPTIONS.map((option) => (
                          <option key={`logo-size-${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="hammer-tool-hint">
                      Logo overlay: {packagingLogoPlacement ? "enabled (episode-wide)" : "disabled"}
                    </div>
                    <label className="hammer-tool-field">
                      <span>Thumbnail Prompt</span>
                      <textarea
                        value={thumbnailPromptDraft}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setThumbnailPromptDraft(event.target.value);
                        }}
                        rows={3}
                        placeholder="Describe a strong thumbnail concept."
                      />
                    </label>
                    <div className="hammer-source-card__actions">
                      <button
                        type="button"
                        onClick={() => {
                          void copyPromptToClipboard({
                            key: "thumbnail:packaging",
                            prompt: thumbnailPromptDraft,
                          });
                        }}
                      >
                        {copiedPromptKey === "thumbnail:packaging" ? "Copied" : "Copy Prompt"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void sendPromptToProvider({
                            key: "thumbnail:packaging",
                            prompt: thumbnailPromptDraft,
                            label: "thumbnail",
                          });
                        }}
                      >
                        Send to Provider
                      </button>
                    </div>
                  </section>
                ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Finishing Checklist</header>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.transcriptReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          transcriptReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Transcript reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.visualsReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          visualsReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Visuals reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.audioReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          audioReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Audio reviewed</span>
                  </label>
                </section>
                )
              ) : null}

              {activeTool === "export" ? (
                currentPass === "ready" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Ready State</header>
                    <div className="hammer-tool-hint">
                      Hammer prepares and hands off. Quench publishes and distributes.
                    </div>
                    <div className="hammer-source-list">
                      {readySummaryAreas.map((item) => (
                        <article key={`ready-${item.id}`} className="hammer-source-card">
                          <header className="hammer-source-card__head">
                            <strong>{item.label}</strong>
                            <span>{item.status.replace("_", " ")}</span>
                          </header>
                        </article>
                      ))}
                    </div>
                    <div className="hammer-tool-hint">
                      Readiness: {readinessStatusLabel}
                      {` · blockers ${readinessGate.blocker_count} · review ${readinessGate.review_count}`}
                    </div>
                    <div className="hammer-tool-hint">Export packet: {exportStatusLabel}</div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleSendToQuench();
                      }}
                      disabled={releasePrepSaving || releasePrepLoading || readinessGate.status === "blocked"}
                    >
                      {releasePrepSaving ? "Sending..." : sendToQuenchButtonLabel}
                    </button>
                    {quenchHandoffStatus ? (
                      <div className="hammer-tool-hint">
                        Handoff status: {quenchHandoffStatus.status} · {quenchHandoffStatus.message}
                      </div>
                    ) : null}
                  </section>
                ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Quench Handoff</header>
                  <div className="hammer-tool-hint">
                    {releasePrepOpenHref ? "Handoff path available." : "Handoff path unavailable."}
                  </div>
                  <div className="hammer-tool-hint">Export status: {exportStatusLabel}</div>
                  <div className="hammer-tool-hint">
                    Readiness gate: {readinessStatusLabel}
                    {` · blockers ${readinessGate.blocker_count} · review ${readinessGate.review_count}`}
                  </div>
                  <div className="hammer-tool-hint">Output source: {outputSelectionSummary}</div>
                  <div className="hammer-tool-hint">Preview truth: {previewTruthPosture}</div>
                  <div className="hammer-tool-hint">Export truth: {exportTruthPosture}</div>
                  <div className="hammer-tool-hint">Handoff truth: {handoffTruthPosture}</div>
                  {previewTruthPosture !== "authoritative" ? (
                    <div className="hammer-tool-hint">
                      Preview is {previewTruthPosture}; at least one active operation is not fully previewable in this runtime.
                    </div>
                  ) : null}
                  {unresolvedBrollSuggestionItems.length > 0 ? (
                    <div className="hammer-tool-hint">
                      {unresolvedBrollSuggestionItems.length} unresolved B-roll intent(s) need binding before authoritative visual handoff.
                    </div>
                  ) : null}
                  {readinessGate.blocking_reasons.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Blocking reasons: {readinessGate.blocking_reasons.slice(0, 3).map((reason) => reason.label).join(" ")}
                    </div>
                  ) : null}
                  {readinessGate.review_reasons.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Review reasons: {readinessGate.review_reasons.slice(0, 3).map((reason) => reason.label).join(" ")}
                    </div>
                  ) : null}
                  {(readinessGate.blocker_count > 0 || readinessGate.review_count > 0) ? (
                    <button type="button" onClick={focusReadinessIssue}>
                      Review Next Issue
                    </button>
                  ) : null}
                  <div className={`hammer-caption-release-summary hammer-caption-release-summary--${captionReleasePrepSafetyState}`}>
                    <div className="hammer-caption-release-summary__head">
                      <strong>Caption release truth</strong>
                      <span>{captionReleasePrepSafetyLabel}</span>
                    </div>
                    <div className="hammer-caption-release-summary__meta">{captionReleasePrepSummaryLine}</div>
                    <div className="hammer-caption-release-summary__basis">Basis: {captionSourceLabel}</div>
                    <div className="hammer-caption-release-summary__detail">{captionReleasePrepSafetyDetail}</div>
                  </div>
                  {studioRackRenderStatus ? (
                    <div className="hammer-tool-hint">
                      Studio Rack render: {studioRackRenderStatus.message}
                    </div>
                  ) : null}
                  {studioRackRenderStatus ? (
                    <div className="hammer-tool-hint">
                      Render receipt: requested lane {studioRackRenderStatus.requestedBackend}, resolved lane {studioRackRenderStatus.resolvedBackend}, status {studioRackRenderStatus.status}
                    </div>
                  ) : null}
                  {studioRackRenderStatus?.outputWorkpiecePath ? (
                    <div className="hammer-tool-hint">
                      Render artifact path: {studioRackRenderStatus.outputWorkpiecePath}
                    </div>
                  ) : null}
                  {studioRackRenderAppliedModules.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Render applied modules: {studioRackRenderAppliedModules.join(", ")}
                    </div>
                  ) : null}
                  {studioRackRenderDeferredModules.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Requested but not yet rendered in v1: {studioRackRenderDeferredModules.join(", ")}
                    </div>
                  ) : null}
                  <div className="hammer-tool-hint">Layer selection lives in the Layer State block.</div>
                  {releasePrepLoading ? (
                    <div className="hammer-tool-hint">Checking Quench packet state...</div>
                  ) : null}
                  {loadedPreparedPackage?.preparedAt ? (
                    <div className="hammer-tool-hint">
                      Last exported {new Date(loadedPreparedPackage.preparedAt).toLocaleString()}.
                    </div>
                  ) : null}
                  {loadedPreparedPackage?.transcript.fingerprint ? (
                    <div className="hammer-tool-hint">
                      Basis {loadedPreparedPackage.transcript.fingerprint.slice(0, 18)}...
                    </div>
                  ) : null}
                  {exportTruthState === "stale" && releasePrepStaleReasons.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Changes since last prepare: {releasePrepStaleReasons.join("; ")}.
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void handleSendToQuench();
                    }}
                    disabled={releasePrepSaving || releasePrepLoading || readinessGate.status === "blocked"}
                  >
                    {releasePrepSaving ? "Sending..." : sendToQuenchButtonLabel}
                  </button>
                  {quenchHandoffStatus ? (
                    <div className="hammer-tool-hint">
                      Handoff status: {quenchHandoffStatus.status} · {quenchHandoffStatus.message}
                    </div>
                  ) : null}
                  {releasePrepSaved ? (
                    <div className="hammer-tool-hint">
                      {readinessGate.status === "ready" ? "Ready for Quench." : readinessGate.status === "blocked" ? "Prepared packet is blocked for handoff." : "Prepared packet needs review before handoff."}
                      {" "}Exported {new Date(releasePrepSaved.preparedAt).toLocaleString()}.
                      Status {releasePrepSaved.overallStatus}.
                      Subtitle artifacts {releasePrepSaved.subtitleArtifactCount}.
                    </div>
                  ) : null}
                  {releasePrepError ? (
                    <div className="hammer-tool-hint">
                      {releasePrepError}
                    </div>
                  ) : null}
                  {releasePrepOpenHref && exportTruthState !== "never_prepared" ? (
                    <a href={releasePrepOpenHref}>
                      {readinessGate.status === "blocked"
                        ? "Open in Quench (blocked)"
                        : exportTruthState === "current"
                        ? "Open in Quench"
                        : "Open in Quench (stale)"}
                    </a>
                  ) : null}
                </section>
                )
              ) : null}

              <div className="hammer-tool-state-grid">
                <div>Workspace mode: {workspaceFocusMode}</div>
                <div>Macro: {props.selectedMacroRecipeRef ?? "none"}</div>
                <div>Last run: {props.lastMacroRunRef ?? "none"}</div>
                <div>Viewing: {viewingModeSummary}</div>
                <div>Output source: {outputSelectionSummary}</div>
                <div>Release prep: {releasePrepOpenHref ? "available" : "unavailable"}</div>
                <div>Preview truth: {previewTruthPosture}</div>
              </div>
            </div>
          </section>
        </div>

        <section className="hammer-timeline-dock">
            <header className="hammer-bay-head">
              <strong>Timeline Dock</strong>
              <div className="hammer-timeline-tools">
                <button type="button" onClick={() => setFocusOverride("auto")}>Auto</button>
                <button type="button" onClick={() => setFocusOverride("source-focus")}>Source</button>
                <button type="button" onClick={() => setFocusOverride("tool-focus")}>Tool</button>
                <button type="button" onClick={() => setFocusOverride("time-focus")}>Time</button>
              </div>
            </header>
          <div className={`hammer-bay-body hammer-timeline-dock__body${isScrubbing ? " is-scrubbing" : ""}`}>
            <HammerWaveformLane
              waveformProxy={props.audioPolish?.analysis?.waveform_proxy ?? null}
              playheadSec={playheadSec}
              onSeekRequest={(targetSec) => {
                seekPlayheadToTime(targetSec, "timeline", { snapToBoundary: false });
              }}
            />
            <div className="hammer-timeline-tools">
              <button type="button" onClick={togglePlayback}>
                {isPlaybackActive ? "Pause" : "Play"}
              </button>
              <button type="button" onClick={toggleSelectionLoopPlayback}>
                {isLoopPlaybackActive ? "Stop Loop (L)" : "Loop Selection (L)"}
              </button>
              <button type="button" onClick={playSelectionWithRoll}>
                Audition Roll (P)
              </button>
              <button type="button" onClick={() => selectAdjacentSegment("previous")} disabled={!selectedSegment}>
                Prev (↑)
              </button>
              <button type="button" onClick={() => selectAdjacentSegment("next")} disabled={!selectedSegment}>
                Next (↓)
              </button>
              <button type="button" onClick={() => jumpToSelectionBoundary("start")}>
                Sel In (Home)
              </button>
              <button type="button" onClick={() => jumpToSelectionBoundary("end")}>
                Sel Out (End)
              </button>
              <button type="button" onClick={() => jumpToEditPoint("previous")}>
                Prev Edit (,)
              </button>
              <button type="button" onClick={() => jumpToEditPoint("next")}>
                Next Edit (.)
              </button>
              <button type="button" onClick={() => jumpToMarker("previous")} disabled={sortedTimelineMarkers.length === 0}>
                Prev Marker (PgUp)
              </button>
              <button type="button" onClick={() => jumpToMarker("next")} disabled={sortedTimelineMarkers.length === 0}>
                Next Marker (PgDn)
              </button>
              <button type="button" onClick={addMarkerAtPlayhead}>
                Add Marker (K)
              </button>
              <label className="hammer-timeline-tools__field" aria-label="Scrub rate control">
                <span>Scrub</span>
                <select
                  value={String(scrubRate)}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (!SCRUB_RATE_OPTIONS.includes(parsed as HammerScrubRate)) return;
                    setScrubRate(parsed as HammerScrubRate);
                  }}
                >
                  {SCRUB_RATE_OPTIONS.map((rate) => (
                    <option key={`scrub-rate-${rate}`} value={String(rate)}>
                      {rate}x
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => nudgePlayhead(-SMALL_PLAYHEAD_NUDGE_SEC)}>
                -0.1s (←)
              </button>
              <button type="button" onClick={() => nudgePlayhead(SMALL_PLAYHEAD_NUDGE_SEC)}>
                +0.1s (→)
              </button>
              <button type="button" onClick={splitSelectedSegmentAtPlayhead} disabled={!selectedSegment}>
                Split (S)
              </button>
              <button type="button" onClick={deleteSelectedSegmentAndRipple} disabled={!selectedSegment}>
                Delete (Del)
              </button>
              <button type="button" onClick={toggleSelectedSegmentDisabled} disabled={!selectedSegment}>
                {selectedSegment?.is_disabled ? "Enable (M)" : "Disable (M)"}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={transcriptDurationSec}
              step={0.1}
              value={playheadSec}
              onChange={(event) => {
                seekPlayheadToTime(Number(event.target.value), "playhead");
              }}
              aria-label="Timeline playhead"
            />
            {sortedTimelineMarkers.length > 0 ? (
              <div className="hammer-timeline-markers" role="group" aria-label="Timeline markers">
                {sortedTimelineMarkers.map((marker) => (
                  <div key={marker.id} className="hammer-timeline-marker-pill">
                    <button
                      type="button"
                      onClick={() => jumpToMarkerById(marker.id)}
                    >
                      {marker.label} {marker.timeSec.toFixed(1)}s
                    </button>
                    <button
                      type="button"
                      className="hammer-timeline-marker-pill__remove"
                      onClick={() => removeMarker(marker.id)}
                      aria-label={`Remove ${marker.label}`}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {selectedSegment ? (
              <section className="hammer-timeline-editor" aria-label="Selected segment timing inspector">
                <div className="hammer-timeline-editor__meta">
                  <span>{selectedSegment.speaker}</span>
                  <span>{selectedSegment.start_sec.toFixed(1)}s - {selectedSegment.end_sec.toFixed(1)}s</span>
                  <span>{selectedSegment.is_disabled ? "Disabled" : "Enabled"}</span>
                  <span>Gain {(selectedSegment.gain_db ?? 0).toFixed(1)} dB</span>
                </div>
                <div className="hammer-timeline-editor__meta">
                  <span>Split/Delete target: {selectedSegment.segment_id}</span>
                </div>
                <div className="hammer-timeline-editor__controls">
                  <div className="hammer-timeline-editor__control-group">
                    <span>Move</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        moveSegment(selectedSegment.segment_id, -0.5);
                      }}
                    >
                      -0.5s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        moveSegment(selectedSegment.segment_id, 0.5);
                      }}
                    >
                      +0.5s
                    </button>
                  </div>
                  <div className="hammer-timeline-editor__control-group">
                    <span>Trim In</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        trimSegmentStart(selectedSegment.segment_id, -0.1);
                      }}
                    >
                      -0.1s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        trimSegmentStart(selectedSegment.segment_id, 0.1);
                      }}
                    >
                      +0.1s
                    </button>
                  </div>
                  <div className="hammer-timeline-editor__control-group">
                    <span>Trim Out</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        trimSegmentEnd(selectedSegment.segment_id, -0.1);
                      }}
                    >
                      -0.1s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        trimSegmentEnd(selectedSegment.segment_id, 0.1);
                      }}
                    >
                      +0.1s
                    </button>
                  </div>
                  <div className="hammer-timeline-editor__control-group">
                    <span>Segment</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        toggleSelectedSegmentDisabled();
                      }}
                    >
                      {selectedSegment.is_disabled ? "Enable" : "Disable"}
                    </button>
                  </div>
                  <div className="hammer-timeline-editor__control-group">
                    <span>Gain</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        adjustSelectedSegmentGain(-1);
                      }}
                    >
                      -1dB
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        adjustSelectedSegmentGain(1);
                      }}
                    >
                      +1dB
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            <div className="hammer-timeline-track-scroll" ref={timelineTrackScrollRef}>
              {editableTranscriptSegments.length > 0 ? (
                <section className="hammer-timeline-board" aria-label="Track-based timeline">
                  <div
                    className="hammer-timeline-ruler"
                    onMouseDown={(event) => {
                      beginTimelineScrub(event);
                    }}
                  >
                    <svg className="hammer-timeline-ruler__canvas" viewBox="0 0 1000 28" preserveAspectRatio="none" aria-hidden="true">
                      {timelineMinorTicks.map((tick) => {
                        const x = tick.ratio * 1000;
                        return (
                          <line
                            key={`minor-tick-${tick.ratio}`}
                            className="hammer-timeline-ruler__tick hammer-timeline-ruler__tick--minor"
                            x1={x}
                            y1={13}
                            x2={x}
                            y2={28}
                          />
                        );
                      })}
                      {timelineTicks.map((tick) => {
                        const x = tick.ratio * 1000;
                        return (
                          <g key={`tick-${tick.ratio}`}>
                            <line
                              className="hammer-timeline-ruler__tick"
                              x1={x}
                              y1={7}
                              x2={x}
                              y2={28}
                            />
                            <text className="hammer-timeline-ruler__tick-label" x={Math.min(995, x + 3)} y={7}>
                              {tick.timeSec.toFixed(0)}s
                            </text>
                          </g>
                        );
                      })}
                      {sortedTimelineMarkers.map((marker) => {
                        const x = (marker.timeSec / timelineDurationSec) * 1000;
                        return (
                          <line
                            key={marker.id}
                            className="hammer-timeline-ruler__marker"
                            x1={x}
                            y1={0}
                            x2={x}
                            y2={28}
                          >
                            <title>{`${marker.label} ${marker.timeSec.toFixed(1)}s`}</title>
                          </line>
                        );
                      })}
                      <g transform={`translate(${playheadRatioPercent * 10} 0)`}>
                        <line className="hammer-timeline-playhead" x1={0} y1={0} x2={0} y2={28} />
                        <rect className="hammer-timeline-playhead-cap" x={-3.5} y={0} width={7} height={3} rx={1} ry={1} />
                        <g transform="translate(0 2)">
                          <rect className="hammer-timeline-ruler__time-readout" x={-20} y={0} width={40} height={13} rx={6} ry={6} />
                          <text className="hammer-timeline-ruler__time-readout-text" x={0} y={9} textAnchor="middle">
                            {playheadSec.toFixed(1)}s
                          </text>
                        </g>
                      </g>
                    </svg>
                  </div>

                  {timelineLanes.map((lane) => (
                    <div key={lane.id} className={`hammer-timeline-lane hammer-timeline-lane--${lane.tone}`}>
                      <div className="hammer-timeline-lane__label">
                        <strong>{lane.label}</strong>
                        <span>{lane.blocks.length} clips</span>
                      </div>
                      <div
                        className={`hammer-timeline-lane__track hammer-timeline-lane__track--${lane.tone}`}
                        onMouseDown={(event) => {
                          beginTimelineScrub(event);
                        }}
                      >
                        <svg className="hammer-timeline-lane__canvas" viewBox="0 0 1000 34" preserveAspectRatio="none" aria-label={`${lane.label} lane`}>
                          {(laneGapsById.get(lane.id) ?? []).map((gap) => {
                            const x = (gap.startSec / timelineDurationSec) * 1000;
                            const width = Math.max(8, ((gap.endSec - gap.startSec) / timelineDurationSec) * 1000);
                            return (
                              <rect
                                key={gap.id}
                                className="hammer-timeline-gap"
                                x={x}
                                y={4}
                                width={width}
                                height={26}
                                rx={6}
                                ry={6}
                              />
                            );
                          })}
                          <line
                            className="hammer-timeline-lane__playhead"
                            x1={playheadRatioPercent * 10}
                            y1={0}
                            x2={playheadRatioPercent * 10}
                            y2={34}
                          />
                          {lane.blocks.map((block) => {
                            const x = (block.startSec / timelineDurationSec) * 1000;
                            const width = Math.max(14, ((block.endSec - block.startSec) / timelineDurationSec) * 1000);
                            const imagePlacementEditable = currentPass === "image_placement"
                              && (lane.id === "stills" || lane.id === "broll")
                              && (block.tone === "image" || block.tone === "broll")
                              && Boolean(block.placementId);
                            const imageAnimationMenuEnabled = currentPass === "image_animation"
                              && lane.id === "stills"
                              && block.tone === "image"
                              && Boolean(block.placementId);
                            const hasImageAnimationPreset = block.placementId
                              ? resolvePlacementAnimationPreset(visualPlacementsById.get(block.placementId)) !== "none"
                              : false;
                            return (
                              <g
                                key={block.id}
                                role="button"
                                tabIndex={0}
                                className={`hammer-timeline-block hammer-timeline-block--${block.tone}${block.selected ? " is-active" : ""}${block.inRange ? " is-range" : ""}${block.disabled ? " is-disabled" : ""}${imagePlacementEditable ? " is-image-placement-editable" : ""}${hasImageAnimationPreset ? " has-animation-preset" : ""}`}
                                transform={`translate(${x} 5)`}
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  if (imagePlacementEditable && block.placementId) {
                                    beginTimelineImagePlacementDrag(event, {
                                      placementId: block.placementId,
                                      mode: "move",
                                      startSec: block.startSec,
                                      endSec: block.endSec,
                                    });
                                  }
                                }}
                                onContextMenu={(event) => {
                                  if (!imageAnimationMenuEnabled || !block.placementId) return;
                                  openImageAnimationContextMenu(event, block.placementId);
                                }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  block.onSelect();
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" && event.key !== " ") return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  block.onSelect();
                                }}
                                aria-label={`${block.label} ${block.startSec.toFixed(1)}-${block.endSec.toFixed(1)}s`}
                              >
                                <title>{`${block.label} ${block.startSec.toFixed(1)}-${block.endSec.toFixed(1)}s`}</title>
                                <rect className="hammer-timeline-block__rect" width={width} height={22} rx={3} ry={3} />
                                {imagePlacementEditable ? (
                                  <>
                                    <rect
                                      className="hammer-timeline-block__resize hammer-timeline-block__resize--start"
                                      x={0}
                                      y={2}
                                      width={6}
                                      height={18}
                                      rx={2}
                                      ry={2}
                                      onMouseDown={(event) => {
                                        if (!block.placementId) return;
                                        beginTimelineImagePlacementDrag(event, {
                                          placementId: block.placementId,
                                          mode: "resize_start",
                                          startSec: block.startSec,
                                          endSec: block.endSec,
                                        });
                                      }}
                                    />
                                    <rect
                                      className="hammer-timeline-block__resize hammer-timeline-block__resize--end"
                                      x={Math.max(0, width - 6)}
                                      y={2}
                                      width={6}
                                      height={18}
                                      rx={2}
                                      ry={2}
                                      onMouseDown={(event) => {
                                        if (!block.placementId) return;
                                        beginTimelineImagePlacementDrag(event, {
                                          placementId: block.placementId,
                                          mode: "resize_end",
                                          startSec: block.startSec,
                                          endSec: block.endSec,
                                        });
                                      }}
                                    />
                                  </>
                                ) : null}
                                <text className="hammer-timeline-block__text" x={5} y={14}>
                                  {block.label}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>
                  ))}
                </section>
              ) : (
                <div className="hammer-empty-state">Timeline content transplant pending.</div>
              )}
            </div>
          </div>
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
        <div className="hammer-toolbar__title">Passes</div>
        {PASS_ORDER.map((pass) => (
          <button
            key={pass.id}
            type="button"
            className={currentPass === pass.id ? "hammer-toolbar__tool is-active" : "hammer-toolbar__tool"}
            onClick={() => selectPass(pass.id)}
            title={`${pass.label} (${pass.toolId})`}
          >
            <strong>{pass.shortLabel}</strong>
            <span>{pass.label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
