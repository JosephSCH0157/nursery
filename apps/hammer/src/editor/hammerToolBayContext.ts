import type { HammerSelectedImageContext, HammerSelectedVisualContext } from "./hammerSelectedVisualContext";
import type { HammerToolBayRouteDecision, HammerToolBayUnsupportedReason } from "./hammerToolBayRouteDecision";
import type { HammerCaptionArtifactMode, HammerCaptionBuildState, HammerCaptionEditedState, HammerCaptionFormattingState } from "./hammerWorkspaceShellCaptionUtils";
import type { HammerImagePlacementTransform, HammerLogoOverlayPosition, HammerLogoOverlaySize, HammerSourceImageItem } from "./hammerWorkspaceShellVisualUtils";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerVoicePolishDeEsserStrength, HammerVoicePolishEqProfile, HammerVoicePolishFixId, HammerVoicePolishPresetId, HammerVoicePolishState } from "./hammerVoicePolish";
import type { HammerPodcastMasterUiStatus } from "./hammerPodcastMasterStatus";
import type { HammerExportTimelineAudioLayer } from "./hammerRenderAssembly";
import type { useHammerWorkspaceShellTranscriptCleanup } from "./useHammerWorkspaceShellTranscriptCleanup";
import type { useHammerWorkspaceShellCleanupCandidateReview } from "./useHammerWorkspaceShellCleanupCandidateReview";
import type { useHammerWorkspaceShellSilenceEditing } from "./useHammerWorkspaceShellSilenceEditing";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerVisualClip } from "../visuals/model/hammerVisualTypes";
import type { deriveHammerAutoPlacementDiagnostics } from "./useHammerWorkspaceShellAutomaticPlacement";
import type {
  createHammerVisualLookExposureCommands,
  useHammerVisualPreviewRuntimeDerived,
  useHammerVisualPreviewRuntimeState,
  useHammerVisualPreviewState,
} from "./useHammerWorkspaceShellVisualPreview";
import type { SegmentationProviderDescriptor } from "../features/visual-effects/providers/segmentationProviderRegistry";
import type { HammerVisualLutPreset } from "./hammerWorkspaceShellCore";

export type HammerResolvedToolBayRoute = Extract<HammerToolBayRouteDecision, { status: "resolved" }>;
export type HammerToolBayContextUnsupportedReason =
  | HammerToolBayUnsupportedReason
  | "route_not_resolved"
  | "required_data_missing"
  | "route_surface_mismatch"
  | "selected_visual_missing"
  | "selected_visual_kind_mismatch"
  | "selected_visual_capability_mismatch";

type SurfaceContext<Surface extends string, Data, Commands> = Readonly<{
  surface: Surface;
  route: HammerResolvedToolBayRoute;
  data: Readonly<Data>;
  commands: Readonly<Commands>;
}>;

export type TranscriptCleanupCommands = Readonly<{
  refreshCandidates(): void;
  previewCandidate(candidateId: string): void;
  acceptCandidate(candidateId: string): void;
  dismissCandidate(candidateId: string): void;
  applyCleanup(previewId: string): void;
  discardCleanup(previewId: string): void;
}>;
export type RetakePacingCommands = Readonly<{
  previewRange(rangeId: string): void;
  acceptRange(rangeId: string): void;
  dismissRange(rangeId: string): void;
}>;
export type TranscriptPolishCommands = Readonly<{
  previewCleanup(): void;
  applyCleanup(previewId: string): void;
  discardCleanup(previewId: string): void;
}>;
type VisualPreviewAuthority = ReturnType<typeof useHammerVisualPreviewState>;
type VisualRuntimeAuthority = ReturnType<typeof useHammerVisualPreviewRuntimeState>;
type VisualRuntimeDerived = ReturnType<typeof useHammerVisualPreviewRuntimeDerived>;
type VisualLookExposureAuthority = ReturnType<typeof createHammerVisualLookExposureCommands>;
export type HammerVisualPolishToolBayData = Readonly<Pick<VisualPreviewAuthority,
  "visualWhiteBalance" | "visualColorAmount" | "visualEyeContactAssistEnabled" | "visualEyeContactAssistStrength" |
  "visualBackgroundBlur" | "visualBackgroundBlurPx" | "visualBackgroundBlurFeatherPx" | "visualBackgroundBlurTemporalSmoothing" |
  "visualBackgroundBlurSubjectExpansionPx" | "visualBackgroundBlurQualityMode" | "visualBackgroundBlurFallbackMode" |
  "visualBackgroundReplaceEnabled" | "visualBackgroundReplaceMode" | "visualBackgroundReplaceColor" | "visualBackgroundReplaceImageUrl" |
  "visualBackgroundReplaceImageAssetPath" | "visualBackgroundWashEnabled" | "visualBackgroundWashDimAmount" |
  "visualBackgroundWashDesaturateAmount" | "visualBackgroundBlurDebugMask" | "visualBackgroundMaskPreviewMode" |
  "visualBackgroundMaskPreviewStage" | "visualEyeContactAssistDebugOverlay"
> & Pick<VisualRuntimeAuthority, "visualBackgroundBlurRuntimeStatus" | "visualEyeContactAssistRuntimeStatus"> &
Pick<VisualRuntimeDerived, "visualBackgroundBlurStatusSummary" | "visualEyeContactAssistStatusSummary"> & {
  activeExposureAdjustment: number | null;
  activeLookPreset: HammerVisualLutPreset | null;
  backgroundBlurProviderDescriptor: SegmentationProviderDescriptor | null;
  segmentationProviderDescriptors: readonly SegmentationProviderDescriptor[];
  sourceImageLibraryItems: readonly Readonly<{ path: string; name: string }>[];
  selectedBackgroundReplacementAssetId: string | null;
  uploadingCategory: "images" | "broll" | "introoutro" | null;
}>;
export type VisualPolishCommands = Readonly<Pick<VisualPreviewAuthority,
  "setVisualWhiteBalance" | "setVisualColorAmount" | "setVisualEyeContactAssistEnabled" | "setVisualEyeContactAssistStrength" |
  "setVisualBackgroundBlur" | "setVisualBackgroundBlurPx" | "setVisualBackgroundBlurFeatherPx" | "setVisualBackgroundBlurTemporalSmoothing" |
  "setVisualBackgroundBlurSubjectExpansionPx" | "setVisualBackgroundBlurQualityMode" | "setVisualBackgroundBlurFallbackMode" |
  "setVisualBackgroundBlurProviderId" | "setVisualBackgroundReplaceEnabled" | "setVisualBackgroundReplaceMode" |
  "setVisualBackgroundReplaceColor" | "setVisualBackgroundReplaceImageUrl" | "setVisualBackgroundReplaceImageAssetPath" |
  "setVisualBackgroundWashEnabled" | "setVisualBackgroundWashDimAmount" | "setVisualBackgroundWashDesaturateAmount" |
  "setVisualBackgroundBlurDebugMask" | "setVisualBackgroundMaskPreviewMode" | "setVisualBackgroundMaskPreviewStage" |
  "setVisualEyeContactAssistDebugOverlay"
> & Pick<VisualRuntimeAuthority, "setVisualBackgroundBlurRuntimeStatus" | "setVisualEyeContactAssistRuntimeStatus"> &
Pick<VisualLookExposureAuthority, "applyLookPresetSelection" | "applyExposureAdjustment"> & {
  setFocusOverride(mode: "auto" | "source-focus" | "tool-focus" | "time-focus"): void;
  handleSourceDeskUpload(category: "images" | "broll" | "introoutro", fileList: FileList | null): Promise<void>;
}>;
export type ImagePlacementRetimeInput = Readonly<{ placementId: string; startSec: number; endSec: number }>;
export type ImageAnchorUpdateInput = Readonly<{ placementId: string; segmentId: string | null; label: string }>;
export type ImageTransformInput = Readonly<{ placementId: string; leftPct: number; topPct: number; widthPct: number; heightPct: number }>;
export type ImagePlacementCommands = Readonly<{
  removePlacement(placementId: string): void;
  updateAnchor(input: ImageAnchorUpdateInput): void;
}>;
export type ImageTimingCommands = Readonly<{ retimePlacement(input: ImagePlacementRetimeInput): void }>;
export type ImageTransformCommands = Readonly<{ updateTransform(input: ImageTransformInput): void; resetTransform(placementId: string): void }>;
export type ImageAnimationCommands = Readonly<{ updateAnimation(placementId: string, animation: string): void }>;
export type BrollRebindInput = Readonly<{ placementId: string; targetSegmentId: string }>;
export type BrollReplaceInput = Readonly<{ placementId: string; assetId: string }>;
export type BrollCommands = Readonly<{
  removePlacement(placementId: string): void;
  rebindPlacement(input: BrollRebindInput): void;
  replaceBinding(input: BrollReplaceInput): void;
  revertBinding(placementId: string): void;
  addTransition(placementId: string): void;
}>;
export type AudioFinalizationCommands = Readonly<{
  setVoiceCleanupEnabled(enabled: boolean): void; setVoiceFixEnabled(fix: HammerVoicePolishFixId, enabled: boolean): void;
  applyVoicePreset(preset: HammerVoicePolishPresetId): void; setCompareMode(mode: "before" | "after"): void;
  setDeEsserStrength(strength: HammerVoicePolishDeEsserStrength): void; setEqProfile(profile: HammerVoicePolishEqProfile): void;
}>;
export type AudioAdjustmentCommands = Readonly<{
  focusTool(): void; applyPodcastMaster(): void; toggleRack(): void; setRackEnabled(enabled: boolean): void; setRackBypassed(bypassed: boolean): void;
  setRackBackend(backend: "native" | "ffmpeg"): void; setModuleEnabled(module: keyof HammerStudioRackState["modules"], enabled: boolean): void;
  setModuleBypassed(module: keyof HammerStudioRackState["modules"], bypassed: boolean): void;
  applyRackMutation(label: string, mutate: (current: HammerStudioRackState) => HammerStudioRackState): void;
  setLevelingEnabled(enabled: boolean): void; setNoiseReductionEnabled(enabled: boolean): void;
}>;
export type CaptionCommands = Readonly<{
  focusTool(): void; buildCaptions(): void; enableEdits(): void; selectMode(mode: HammerCaptionArtifactMode): void; discardEdits(): void;
  updateFormatting(next: HammerCaptionFormattingState | ((current: HammerCaptionFormattingState) => HammerCaptionFormattingState)): void;
  selectArtifactFormat(format: "srt" | "vtt"): void; editCaption(captionId: string, text: string): void; splitCaption(captionId: string): void;
  mergeCaption(input: Readonly<{ chunkId: string; direction: "up" | "down" }>): void; normalizePunctuation(captionId: string): void; toggleSpeakerLabel(captionId: string): void;
}>;
export type MetadataCommands = Readonly<{ focusTool(): void; setTag(tag: string): void }>;
export type PackagingCommands = Readonly<{
  focusTool(): void; applyIntro(): void; applyOutro(): void; removePlacement(id: string, label: string): void;
  updateLogoStyle(input: Readonly<{ assetPath?: string | null; position?: HammerLogoOverlayPosition; size?: HammerLogoOverlaySize }>): void; toggleLogo(): void;
}>;
export type FinishingCommands = Readonly<{ focusTool(): void; setReviewFlag(flag: "transcript" | "visual" | "audio", complete: boolean): void }>;
export type ReleaseCommands = Readonly<{ focusIssue(): void; sendToQuench(): void }>;
export type PassCompletionCommands = Readonly<{ markPassComplete(): void }>;

type VisualData = { selectedVisual: HammerSelectedVisualContext; placementId: string; model: unknown };
export type HammerImageInspectorToolBayData = Readonly<{
  selectedVisual: HammerSelectedImageContext; placementId: string; placement: HammerSourceImageItem; transform: HammerImagePlacementTransform;
  selectedClip: HammerVisualClip; selectedAnchorSegment: HammerTranscriptSegment | null; selectedAnchorSegmentId: string | null;
  anchorTextDraft: string; anchorLabelDraft: string; autoPlacementDebugEnabled: boolean; selectedAutoPreviewActive: boolean;
  previewAutoPositionStatus: string | null; previewDiagnostics: ReturnType<typeof deriveHammerAutoPlacementDiagnostics>;
  episodeHealth: Readonly<{ workspaceId: string | null; workpieceId: string | null; episodeId: string | null; recordingPath: string | null; playbackMediaPath: string | null;
    playbackMediaReady: boolean; visualPlacementsCount: number; anchorCount: number; selectedPlacementId: string | null; selectedClipId: string | null;
    selectedAssetId: string | null; selectedOverlayAssetId: string | null; frameInputAvailable: boolean; maskBoundsCount: number; candidateCount: number;
    selectedScale: number | null; resolvedPlacement: boolean; resolverStatus: string; resolverReason: string; diagnosticsEnabled: boolean; diagnosticsState: string }>;
}>;
export type HammerImageInspectorCommands = Readonly<{
  focus(mode: "auto" | "source-focus" | "tool-focus" | "time-focus"): void;
  previewAutoPosition: (() => void) | null; resetPreviewAutoPosition: (() => void) | null;
  setAnchorTextDraft(next: string | ((current: string) => string)): void; setAnchorLabelDraft(next: string | ((current: string) => string)): void;
  commitAnchor(input: Readonly<{ clipId: string; anchorText: string; anchorLabel: string; detached: boolean; label: string }>): void;
  commitTiming(placementId: string, input: Readonly<{ startSec: number; endSec: number; label: string }>): boolean;
  shiftTiming(placementId: string, deltaSec: number): void; removePlacement(placementId: string): void;
  updateTransformDraft(placementId: string, updater: (current: HammerImagePlacementTransform) => HammerImagePlacementTransform): void;
  commitTransform(placementId: string, transform: HammerImagePlacementTransform, label: string): boolean;
}>;

type TranscriptCleanupAuthority = ReturnType<typeof useHammerWorkspaceShellTranscriptCleanup>;
type TranscriptCandidateAuthority = ReturnType<typeof useHammerWorkspaceShellCleanupCandidateReview>;
type TranscriptSilenceAuthority = ReturnType<typeof useHammerWorkspaceShellSilenceEditing>;
export type HammerTranscriptReviewWorkspaceData = Readonly<Pick<TranscriptCandidateAuthority,
  "activeReviewKind" | "fillerCandidateCards" | "fillerActiveCandidateIndex" | "fillerDecisionInFlight" | "retakeCandidateCards" | "retakeActiveCandidateIndex" | "retakeDecisionInFlight" |
  "candidateReceiptByKind" | "candidateProposedRemovalById" | "activeFillerCandidateCard" | "activeRetakeCandidateCard"
> & Pick<TranscriptSilenceAuthority,
  "hasSilenceSuggestionAnalysis" | "silenceCutSuggestions" | "visibleSilenceCutSuggestions" | "deadAirThresholdSec" | "deadAirAnalysis" | "deadAirApplyInFlight"
> & Pick<TranscriptCleanupAuthority, "fillerCleanupOptions" | "retakeCleanupOptions"> & {
  silenceSuggestionCount: number;
  activeFillerCandidateDiffOps: readonly Readonly<{ type: "insert" | "delete" | "equal"; words: readonly string[] }>[] | null;
  selectedTranscriptRange: Readonly<{ start: number; end: number; text: string }> | null;
}>;
export type HammerTranscriptReviewWorkspaceCommands = Readonly<Pick<TranscriptCandidateAuthority,
  "setActiveReviewKind" | "updateCandidateProposedRemoval" | "handleCandidateDecision"
> & Pick<TranscriptSilenceAuthority,
  "acceptSilenceCutSuggestion" | "dismissSilenceCutSuggestion" | "setDeadAirThresholdSec" | "analyzeDeadAirClosure" | "applyDeadAirClosureBatch"
> & Pick<TranscriptCleanupAuthority, "setFillerCleanupOptions" | "setRetakeCleanupOptions"> & {
  setFocusOverride(mode: "auto" | "source-focus" | "tool-focus" | "time-focus"): void;
  setActiveTranscriptToolSection(section: "fillers" | "retakes" | "silence_gaps"): void;
  refreshCleanupCandidateQueue(kind: "fillers" | "retakes"): void;
  seekPlayheadToTime: ((time: number, origin: "timeline" | "playhead", options?: { snapToBoundary?: boolean }) => void) | null;
}>;
export type HammerTranscriptPolishToolBayData = Readonly<Pick<TranscriptCleanupAuthority,
  "gapCleanupOptions" | "fillerCleanupOptions" | "retakeCleanupOptions" | "speakerSoloOptions" | "speakerInterviewOptions" | "speakerMonologueOptions" | "speakerPanelOptions" |
  "cleanupPreview" | "cleanupPreviewSummary" | "cleanupReceipt"
> & {
  editableTranscriptSegments: HammerTranscriptSegment[];
  speakerOptions: string[];
  hasTranscriptSelection: boolean;
  transcriptSelectionRange: Readonly<{ segmentIds: string[] }>;
  polishStrength: number;
}>;
export type HammerTranscriptPolishToolBayCommands = Readonly<Pick<TranscriptCleanupAuthority,
  "setGapCleanupOptions" | "setFillerCleanupOptions" | "setRetakeCleanupOptions" | "setSpeakerSoloOptions" | "setSpeakerInterviewOptions" | "setSpeakerMonologueOptions" | "setSpeakerPanelOptions" |
  "setCleanupPreview" | "applyCleanup" | "previewQuickClean" | "previewRemoveFillers" | "previewRemoveRetakes" | "previewShortenGaps" | "previewSpeakerInterview" | "previewSpeakerMonologue" | "previewSpeakerPanel" | "previewSpeakerSolo"
> & {
  setFocusOverride(mode: "auto" | "source-focus" | "tool-focus" | "time-focus"): void;
  setPolishStrength(next: number | ((current: number) => number)): void;
}>;
export type HammerTranscriptCleanupToolBayContext = SurfaceContext<"transcript_cleanup", HammerTranscriptReviewWorkspaceData, HammerTranscriptReviewWorkspaceCommands>;
export type HammerRetakesToolBayContext = SurfaceContext<"retakes", HammerTranscriptReviewWorkspaceData, HammerTranscriptReviewWorkspaceCommands>;
export type HammerGapPacingToolBayContext = SurfaceContext<"gap_pacing", HammerTranscriptReviewWorkspaceData, HammerTranscriptReviewWorkspaceCommands>;
export type HammerTranscriptPolishToolBayContext = SurfaceContext<"transcript_polish", HammerTranscriptPolishToolBayData, HammerTranscriptPolishToolBayCommands>;
export type HammerVisualPolishToolBayContext = SurfaceContext<"visual_polish", HammerVisualPolishToolBayData, VisualPolishCommands>;
export type HammerImagePlacementToolBayContext = SurfaceContext<"image_placement", HammerImageInspectorToolBayData, HammerImageInspectorCommands>;
export type HammerImageTimingToolBayContext = SurfaceContext<"image_timing", HammerImageInspectorToolBayData, HammerImageInspectorCommands>;
export type HammerImageTransformToolBayContext = SurfaceContext<"image_transform", HammerImageInspectorToolBayData, HammerImageInspectorCommands>;
export type HammerImageAnimationToolBayContext = SurfaceContext<"image_animation", HammerImageInspectorToolBayData, HammerImageInspectorCommands>;
export type HammerBrollToolBayContext = SurfaceContext<"broll", VisualData, BrollCommands>;
export type HammerReferenceClipToolBayContext = SurfaceContext<"reference_clip", VisualData, BrollCommands>;
export type HammerAudioFinalizationToolBayData = Readonly<{ compareMode: "before" | "after"; voicePolish: HammerVoicePolishState | null }>;
export type HammerAudioAdjustmentsToolBayData = Readonly<{
  editableAudioPolish: Readonly<{ status?: string }> | null; persistedAudioCutCount: number; effectivePlaybackCutRegions: readonly unknown[]; silenceSuggestionCount: number;
  editableStudioRack: HammerStudioRackState; studioRackPlaybackConfig: Readonly<{ backend: string }>; studioRackPlaybackBackendResolution: Readonly<{ status: string }>;
  studioRackRenderConfig: Readonly<{ backend: string }>; studioRackRenderBackendResolution: Readonly<{ status: string }>;
  studioRackRenderStatus: Readonly<{ message: string; requestedBackend: string; resolvedBackend: string; status: string; outputWorkpiecePath?: string | null }> | null;
  studioRackRenderAppliedModules: readonly string[]; studioRackRenderDeferredModules: readonly string[]; studioRackEnabledModuleCount: number; studioRackComparePreviewStatusLabel: string | null; studioRackOpen: boolean;
  podcastMasterLayer: HammerExportTimelineAudioLayer | null;
  podcastMasterUiStatus: HammerPodcastMasterUiStatus; audioLevelingEnabled: boolean; audioNoiseReductionEnabled: boolean;
}>;
export type HammerCaptionsToolBayData = Readonly<{
  activeCaptionArtifactText: string; activeCaptionMode: HammerCaptionArtifactMode; activeCaptionState: HammerCaptionBuildState | HammerCaptionEditedState | null;
  captionActiveModeLabel: string; captionActiveModeSourceLabel: string; captionArtifactStatusLabel: string; captionBuildFeedback: string | null; captionBuildFreshness: string;
  captionBuildState: HammerCaptionBuildState | null; captionBuiltSummary: string; captionBuiltTone: string; captionDiscardConsequenceLabel: string | null;
  captionEditedBasisDetail: string; captionEditedChangeSummary: string; captionEditedState: HammerCaptionEditedState | null; captionEditedSummary: string; captionEditedTone: string;
  captionEditorRefs: { current: Map<string, HTMLTextAreaElement> }; captionFormatting: HammerCaptionFormattingState; captionRebuildConsequenceLabel: string;
  captionReleasePrepSafetyDetail: string; captionReleasePrepSafetyLabel: string; captionReleasePrepSafetyState: string; captionReleaseSourceLabel: string; captionSourceLabel: string;
  selectedCaptionArtifactFormat: "srt" | "vtt";
}>;
export type HammerMetadataToolBayData = Readonly<{ detailTag: string }>;
export type HammerPackagingToolBayData = Readonly<{
  selectedIntroPath: string | null; selectedOutroPath: string | null; selectedIntroAssetId: string | null; selectedOutroAssetId: string | null;
  introPlaced: boolean; outroPlaced: boolean; logoAssetPath: string | null; logoPlaced: boolean; logoPosition: HammerLogoOverlayPosition; logoSize: HammerLogoOverlaySize;
  sourceImageLibraryItems: readonly Readonly<{ path: string; name: string }>[]; logoPositionOptions: readonly Readonly<{ id: HammerLogoOverlayPosition; label: string }>[];
  logoSizeOptions: readonly Readonly<{ id: HammerLogoOverlaySize; label: string }>[]; introEntryId: string; outroEntryId: string;
}>;
export type HammerFinishingChecklist = Readonly<{ transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean }>;
export type HammerFinishingToolBayData = Readonly<{ checklist: HammerFinishingChecklist }>;
export type HammerAudioFinalizationToolBayContext = SurfaceContext<"audio_finalization", HammerAudioFinalizationToolBayData, AudioFinalizationCommands>;
export type HammerAudioAdjustmentsToolBayContext = SurfaceContext<"audio_adjustments", HammerAudioAdjustmentsToolBayData, AudioAdjustmentCommands>;
export type HammerCaptionsToolBayContext = SurfaceContext<"captions", HammerCaptionsToolBayData, CaptionCommands>;
export type HammerMetadataToolBayContext = SurfaceContext<"metadata", HammerMetadataToolBayData, MetadataCommands>;
export type HammerPackagingToolBayContext = SurfaceContext<"packaging", HammerPackagingToolBayData, PackagingCommands>;
export type HammerFinishingToolBayContext = SurfaceContext<"finishing", HammerFinishingToolBayData, FinishingCommands>;
export type HammerReleaseSummaryArea = Readonly<{ id: string; label: string; status: string }>;
export type HammerReleaseReason = Readonly<{ label: string }>;
export type HammerQuenchHandoffStatus = Readonly<{ status: string; message: string }>;
export type HammerPreparedReleaseSummary = Readonly<{
  preparedAt: string;
  overallStatus: string;
  subtitleArtifactCount: number;
  transcriptFingerprint: string | null;
}>;
export type HammerRenderStatusSummary = Readonly<{
  message: string;
  requestedBackend: string;
  resolvedBackend: string;
  status: string;
  outputWorkpiecePath: string | null;
  appliedModules: readonly string[];
  deferredModules: readonly string[];
}>;
export type HammerReleaseReadinessToolBayContext = SurfaceContext<"release_readiness", {
  summaryAreas: readonly HammerReleaseSummaryArea[];
  readinessLabel: string;
  blockerCount: number;
  reviewCount: number;
  exportStatusLabel: string;
  sending: boolean;
  loading: boolean;
  blocked: boolean;
  sendLabel: string;
  handoffStatus: HammerQuenchHandoffStatus | null;
}, ReleaseCommands>;
export type HammerExportToolBayContext = SurfaceContext<"export", {
  handoffAvailable: boolean;
  openHref: string | null;
  exportStatusLabel: string;
  readinessLabel: string;
  readinessStatus: "ready" | "blocked" | "needs_review";
  blockerCount: number;
  reviewCount: number;
  outputSelectionSummary: string;
  previewTruthPosture: string;
  exportTruthPosture: string;
  handoffTruthPosture: string;
  unresolvedBrollCount: number;
  blockingReasons: readonly HammerReleaseReason[];
  reviewReasons: readonly HammerReleaseReason[];
  captionSafetyState: string;
  captionSafetyLabel: string;
  captionSummaryLine: string;
  captionSourceLabel: string;
  captionSafetyDetail: string;
  renderStatus: HammerRenderStatusSummary | null;
  loading: boolean;
  sending: boolean;
  sendLabel: string;
  preparedPackage: HammerPreparedReleaseSummary | null;
  exportTruthState: "never_prepared" | "current" | "stale";
  staleReasons: readonly string[];
  handoffStatus: HammerQuenchHandoffStatus | null;
  savedPackage: HammerPreparedReleaseSummary | null;
  error: string | null;
}, ReleaseCommands>;
export type HammerPassCompletionToolBayContext = SurfaceContext<"pass_completion", { passLabel: string; passStatus: string; complete: boolean }, PassCompletionCommands>;
export type HammerUnsupportedToolBayContext = Readonly<{
  surface: "unsupported";
  route: HammerToolBayRouteDecision;
  data: Readonly<{ reason: HammerToolBayContextUnsupportedReason; selectedPlacementId: string | null }>;
  commands: Readonly<Record<never, never>>;
}>;

export type HammerToolBayContext =
  | HammerTranscriptCleanupToolBayContext | HammerRetakesToolBayContext | HammerGapPacingToolBayContext
  | HammerTranscriptPolishToolBayContext | HammerVisualPolishToolBayContext
  | HammerImagePlacementToolBayContext | HammerImageTimingToolBayContext | HammerImageTransformToolBayContext | HammerImageAnimationToolBayContext
  | HammerBrollToolBayContext | HammerReferenceClipToolBayContext
  | HammerAudioFinalizationToolBayContext | HammerAudioAdjustmentsToolBayContext | HammerCaptionsToolBayContext
  | HammerMetadataToolBayContext | HammerPackagingToolBayContext | HammerFinishingToolBayContext
  | HammerReleaseReadinessToolBayContext | HammerExportToolBayContext | HammerPassCompletionToolBayContext
  | HammerUnsupportedToolBayContext;

export type HammerToolBayContextSurface = Exclude<HammerToolBayContext["surface"], "unsupported">;
export const HAMMER_TOOL_BAY_CONTEXT_SURFACES = [
  "transcript_cleanup", "retakes", "gap_pacing", "transcript_polish", "visual_polish",
  "image_placement", "image_timing", "image_transform", "image_animation", "broll", "reference_clip",
  "audio_finalization", "audio_adjustments", "captions", "metadata", "packaging", "finishing",
  "release_readiness", "export", "pass_completion",
] as const satisfies readonly HammerToolBayContextSurface[];

type ContextBySurface<S extends HammerToolBayContextSurface> = Extract<HammerToolBayContext, { surface: S }>;
export type HammerToolBayContextBuildInput = {
  [S in HammerToolBayContextSurface]: Readonly<{ surface: S; route: HammerToolBayRouteDecision; data: ContextBySurface<S>["data"] | null; commands: ContextBySurface<S>["commands"] }>
}[HammerToolBayContextSurface];

function unsupported(route: HammerToolBayRouteDecision, reason: HammerToolBayContextUnsupportedReason, placementId: string | null = null): HammerUnsupportedToolBayContext {
  return { surface: "unsupported", route, data: { reason, selectedPlacementId: placementId }, commands: {} };
}

function visualRequirement(input: HammerToolBayContextBuildInput): HammerUnsupportedToolBayContext | null {
  if (input.data === null) return unsupported(input.route, "required_data_missing");
  if (!("selectedVisual" in input.data)) return null;
  const selected = input.data.selectedVisual;
  if (selected.status !== "selected") return unsupported(input.route, "selected_visual_missing", selected.status === "unsupported" ? selected.placementId : null);
  if (selected.placementId !== input.data.placementId) return unsupported(input.route, "required_data_missing", selected.placementId);
  const imageSurface = input.surface.startsWith("image_");
  if ((imageSurface && selected.kind !== "image") || (input.surface === "broll" && selected.kind !== "broll") || (input.surface === "reference_clip" && selected.kind !== "reference_clip")) {
    return unsupported(input.route, "selected_visual_kind_mismatch", selected.placementId);
  }
  if (imageSurface && "placement" in input.data) {
    if (input.data.placement.kind !== "image") return unsupported(input.route, "selected_visual_kind_mismatch", selected.placementId);
    if (input.data.placement.id !== selected.placementId || input.data.selectedClip.clip_id !== selected.clipId
      || input.data.selectedClip.lane_id !== selected.laneId || input.data.selectedClip.asset_id !== selected.assetId) {
      return unsupported(input.route, "required_data_missing", selected.placementId);
    }
    if (!selected.capabilities.remove || !selected.capabilities.retime || !selected.capabilities.anchor || !selected.capabilities.transform || !selected.capabilities.animate) {
      return unsupported(input.route, "selected_visual_capability_mismatch", selected.placementId);
    }
  }
  const requiredCapability = input.surface === "image_placement" ? "remove"
    : input.surface === "image_timing" ? "retime"
    : input.surface === "image_transform" ? "transform"
    : input.surface === "image_animation" ? "animate"
    : "rebind";
  if (!selected.capabilities[requiredCapability]) return unsupported(input.route, "selected_visual_capability_mismatch", selected.placementId);
  if ((input.surface === "broll" || input.surface === "reference_clip")
    && (!selected.capabilities.remove || !selected.capabilities.retime || !selected.capabilities.replace || !selected.capabilities.revert || !selected.capabilities.transition)) {
    return unsupported(input.route, "selected_visual_capability_mismatch", selected.placementId);
  }
  return null;
}

function routeMatchesSurface(surface: HammerToolBayContextSurface, route: HammerResolvedToolBayRoute): boolean {
  return surface === "pass_completion" || surface === route.surface;
}

export function buildHammerToolBayContext(input: HammerToolBayContextBuildInput): HammerToolBayContext {
  if (input.route.status !== "resolved") {
    const reason = input.route.status === "unsupported" ? input.route.reason : "route_not_resolved";
    const placementId = input.route.status === "unsupported" ? input.route.selectedPlacementId : null;
    return unsupported(input.route, reason, placementId);
  }
  if (!routeMatchesSurface(input.surface, input.route)) return unsupported(input.route, "route_surface_mismatch");
  if (input.data === null) return unsupported(input.route, "required_data_missing");
  const visualFailure = visualRequirement(input);
  if (visualFailure) return visualFailure;
  return { surface: input.surface, route: input.route, data: input.data, commands: input.commands } as HammerToolBayContext;
}
