import type { JSX } from "react";
import PolishResultSummary from "./PolishResultSummary";

export type HammerWorkspaceShellToolBayVM = {
  passLabel: string;
  passStatus: string;
  onMarkComplete: () => void;
  activeVisualTool?: "polish" | "images" | "broll";
  onSelectVisualTool?: (nextTool: "polish" | "images" | "broll") => void;
};

export type PackagingIntroStatusView = {
  selectionStatusLine: string;
  placementStatusLine: string;
  applyActionLabel: string;
  removeActionLabel: string;
  canApply: boolean;
  canRemove: boolean;
};

export function derivePackagingIntroStatusView(args: {
  selectedIntroAssetId: string | null;
  selectedIntroPath: string | null;
  introPlaced: boolean;
}): PackagingIntroStatusView {
  const hasSelection = Boolean(args.selectedIntroAssetId);
  const hasResolvedSelection = Boolean(args.selectedIntroAssetId && args.selectedIntroPath);
  const selectedSourceLine = hasSelection
    ? (hasResolvedSelection
      ? `Selected intro from Source Desk: ${args.selectedIntroPath}`
      : `Selected intro from Source Desk is unresolved (${args.selectedIntroAssetId}).`)
    : "No intro selected in Source Desk.";
  const placementLine = args.introPlaced
    ? "Timeline packaging intro: placed."
    : "Timeline packaging intro: not placed.";
  return {
    selectionStatusLine: selectedSourceLine,
    placementStatusLine: placementLine,
    applyActionLabel: "Apply Selected Intro to Timeline",
    removeActionLabel: "Remove Intro from Timeline",
    canApply: hasResolvedSelection,
    canRemove: args.introPlaced,
  };
}

type FillerCleanupOptions = any;
type RetakeCleanupOptions = any;
type SpeakerInterviewOptions = any;
type SpeakerPanelOptions = any;
type BackgroundBlurSettings = any;
type HammerVisualLutPreset = any;
type HammerCaptionReadingSpeed = any;
type HammerCaptionPunctuationMode = any;
type HammerLogoOverlayPosition = any;
type HammerLogoOverlaySize = any;

function isTruthyDevToggle(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function isDevBlurControlsEnabled(): boolean {
  const isDevBuild = Boolean((import.meta as any)?.env?.DEV);
  if (!isDevBuild || typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search ?? "");
    if (isTruthyDevToggle(params.get("dev"))) return true;
    if (isTruthyDevToggle(params.get("tp_dev_mode"))) return true;
  } catch {
    // ignore
  }
  try {
    if (window.localStorage.getItem("tp_dev_mode") === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

export default function HammerWorkspaceShellToolBay(p: { vm: HammerWorkspaceShellToolBayVM }): JSX.Element {
  const vm = p.vm;

  const ctx = vm as any;
  const props = ctx.shellProps as any;
  const activeCaptionArtifactText = ctx.activeCaptionArtifactText as any;
  const activeCaptionMode = ctx.activeCaptionMode as any;
  const activeCaptionState = ctx.activeCaptionState as any;
  const activeExposureAdjustment = ctx.activeExposureAdjustment as any;
  const activeLookPreset = ctx.activeLookPreset as any;
  const addMinimalTransition = ctx.addMinimalTransition as any;
  const anchorLabelDraft = ctx.anchorLabelDraft as any;
  const anchorTextDraft = ctx.anchorTextDraft as any;
  const applyExposureAdjustment = ctx.applyExposureAdjustment as any;
  const applyIntroPlacement = ctx.applyIntroPlacement as any;
  const applyLogoOverlayStyle = ctx.applyLogoOverlayStyle as any;
  const applyLookPresetSelection = ctx.applyLookPresetSelection as any;
  const applyOutroPlacement = ctx.applyOutroPlacement as any;
  const applyPodcastMasterPass = ctx.applyPodcastMasterPass as any;
  const applyStudioRackMutation = ctx.applyStudioRackMutation as any;
  const audioLevelingEnabled = ctx.audioLevelingEnabled as any;
  const audioNoiseReductionEnabled = ctx.audioNoiseReductionEnabled as any;
  const backgroundBlurProviderDescriptor = ctx.backgroundBlurProviderDescriptor as any;
  const boundAttentionQueue = ctx.boundAttentionQueue as any;
  const boundAttentionSummary = ctx.boundAttentionSummary as any;
  const captionActiveModeLabel = ctx.captionActiveModeLabel as any;
  const captionActiveModeSourceLabel = ctx.captionActiveModeSourceLabel as any;
  const captionArtifactStatusLabel = ctx.captionArtifactStatusLabel as any;
  const captionBuildFeedback = ctx.captionBuildFeedback as any;
  const captionBuildFreshness = ctx.captionBuildFreshness as any;
  const captionBuildState = ctx.captionBuildState as any;
  const captionBuiltSummary = ctx.captionBuiltSummary as any;
  const captionBuiltTone = ctx.captionBuiltTone as any;
  const captionDiscardConsequenceLabel = ctx.captionDiscardConsequenceLabel as any;
  const captionEditedBasisDetail = ctx.captionEditedBasisDetail as any;
  const captionEditedChangeSummary = ctx.captionEditedChangeSummary as any;
  const captionEditedState = ctx.captionEditedState as any;
  const captionEditedSummary = ctx.captionEditedSummary as any;
  const captionEditedTone = ctx.captionEditedTone as any;
  const captionEditorRefs = ctx.captionEditorRefs as any;
  const captionFormatting = ctx.captionFormatting as any;
  const captionRebuildConsequenceLabel = ctx.captionRebuildConsequenceLabel as any;
  const captionReleasePrepSafetyDetail = ctx.captionReleasePrepSafetyDetail as any;
  const captionReleasePrepSafetyLabel = ctx.captionReleasePrepSafetyLabel as any;
  const captionReleasePrepSafetyState = ctx.captionReleasePrepSafetyState as any;
  const captionReleasePrepSummaryLine = ctx.captionReleasePrepSummaryLine as any;
  const captionReleaseSourceLabel = ctx.captionReleaseSourceLabel as any;
  const captionSourceLabel = ctx.captionSourceLabel as any;
  const clampImagePlacementTransform = ctx.clampImagePlacementTransform as any;
  const commitImagePlacementTransform = ctx.commitImagePlacementTransform as any;
  const commitVisualAnchorRefinement = ctx.commitVisualAnchorRefinement as any;
  const commitVisualPlacementWindow = ctx.commitVisualPlacementWindow as any;
  const DEFAULT_IMAGE_PLACEMENT_TRANSFORM = ctx.DEFAULT_IMAGE_PLACEMENT_TRANSFORM as any;
  const detailTag = ctx.detailTag as any;
  const discardHearthBrollSuggestion = ctx.discardHearthBrollSuggestion as any;
  const editableVisualPlacements = ctx.editableVisualPlacements as any;
  const exportStatusLabel = ctx.exportStatusLabel as any;
  const exportTruthPosture = ctx.exportTruthPosture as any;
  const exportTruthState = ctx.exportTruthState as any;
  const finishingChecklist = ctx.finishingChecklist as any;
  const focusBoundAttentionOperation = ctx.focusBoundAttentionOperation as any;
  const focusReadinessIssue = ctx.focusReadinessIssue as any;
  const handleDiscardEditedCaptions = ctx.handleDiscardEditedCaptions as any;
  const handleEditCaptionChunkText = ctx.handleEditCaptionChunkText as any;
  const handleEnableCaptionEdits = ctx.handleEnableCaptionEdits as any;
  const handleMergeEditedCaptionChunk = ctx.handleMergeEditedCaptionChunk as any;
  const handleNormalizeEditedCaptionChunkPunctuation = ctx.handleNormalizeEditedCaptionChunkPunctuation as any;
  const handleRebuildCaptionArtifacts = ctx.handleRebuildCaptionArtifacts as any;
  const handleSendToQuench = ctx.handleSendToQuench as any;
  const handleSplitEditedCaptionChunk = ctx.handleSplitEditedCaptionChunk as any;
  const handleToggleEditedCaptionChunkSpeakerLabel = ctx.handleToggleEditedCaptionChunkSpeakerLabel as any;
  const handoffTruthPosture = ctx.handoffTruthPosture as any;
  const introOutroSelectedIntroPath = ctx.introOutroSelectedIntroPath as any;
  const introOutroSelectedOutroPath = ctx.introOutroSelectedOutroPath as any;
  const introOutroSelection = ctx.introOutroSelection as any;
  const loadedPreparedPackage = ctx.loadedPreparedPackage as any;
  const LOGO_POSITION_OPTIONS = ctx.LOGO_POSITION_OPTIONS as any;
  const LOGO_SIZE_OPTIONS = ctx.LOGO_SIZE_OPTIONS as any;
  const MIN_IMAGE_PLACEMENT_DURATION_SEC = ctx.MIN_IMAGE_PLACEMENT_DURATION_SEC as any;
  const moveResolvedBrollBinding = ctx.moveResolvedBrollBinding as any;
  const navigateBoundAttention = ctx.navigateBoundAttention as any;
  const outputSelectionSummary = ctx.outputSelectionSummary as any;
  const PACKAGING_INTRO_ENTRY_ID = ctx.PACKAGING_INTRO_ENTRY_ID as any;
  const PACKAGING_OUTRO_ENTRY_ID = ctx.PACKAGING_OUTRO_ENTRY_ID as any;
  const packagingIntroPlacement = ctx.packagingIntroPlacement as any;
  const packagingLogoAssetPath = ctx.packagingLogoAssetPath as any;
  const packagingLogoPlacement = ctx.packagingLogoPlacement as any;
  const packagingLogoPosition = ctx.packagingLogoPosition as any;
  const packagingLogoSize = ctx.packagingLogoSize as any;
  const packagingOutroPlacement = ctx.packagingOutroPlacement as any;
  const previewTruthPosture = ctx.previewTruthPosture as any;
  const quenchHandoffStatus = ctx.quenchHandoffStatus as any;
  const readinessStatusLabel = ctx.readinessStatusLabel as any;
  const readinessVerdict = ctx.readinessVerdict as any;
  const readySummaryAreas = ctx.readySummaryAreas as any;
  const releasePrepError = ctx.releasePrepError as any;
  const releasePrepLoading = ctx.releasePrepLoading as any;
  const releasePrepOpenHref = ctx.releasePrepOpenHref as any;
  const releasePrepSaved = ctx.releasePrepSaved as any;
  const releasePrepSaving = ctx.releasePrepSaving as any;
  const releasePrepStaleReasons = ctx.releasePrepStaleReasons as any;
  const removePackagingPlacement = ctx.removePackagingPlacement as any;
  const removeVisualPlacement = ctx.removeVisualPlacement as any;
  const replaceResolvedBrollBinding = ctx.replaceResolvedBrollBinding as any;
  const resolvedBrollBindingItems = ctx.resolvedBrollBindingItems as any;
  const resolveHearthBrollSuggestion = ctx.resolveHearthBrollSuggestion as any;
  const revertResolvedBrollBinding = ctx.revertResolvedBrollBinding as any;
  const roundToTenth = ctx.roundToTenth as any;
  const SEGMENTATION_PROVIDER_DESCRIPTORS = ctx.SEGMENTATION_PROVIDER_DESCRIPTORS as any;
  const selectedBoundBrollInspectorState = ctx.selectedBoundBrollInspectorState as any;
  const selectedBoundBrollOperationId = ctx.selectedBoundBrollOperationId as any;
  const selectedCaptionArtifactFormat = ctx.selectedCaptionArtifactFormat as any;
  const selectedImagePlacement = ctx.selectedImagePlacement as any;
  const selectedImagePlacementTransform = ctx.selectedImagePlacementTransform as any;
  const selectedTransitionBoundObject = ctx.selectedTransitionBoundObject as any;
  const selectedVisualAnchorSegment = ctx.selectedVisualAnchorSegment as any;
  const selectedVisualAnchorSegmentId = ctx.selectedVisualAnchorSegmentId as any;
  const selectedVisualClip = ctx.selectedVisualClip as any;
  const sendToQuenchButtonLabel = ctx.sendToQuenchButtonLabel as any;
  const setActiveCaptionArtifactMode = ctx.setActiveCaptionArtifactMode as any;
  const setAnchorLabelDraft = ctx.setAnchorLabelDraft as any;
  const setAnchorTextDraft = ctx.setAnchorTextDraft as any;
  const setAudioLevelingEnabled = ctx.setAudioLevelingEnabled as any;
  const setAudioNoiseReductionEnabled = ctx.setAudioNoiseReductionEnabled as any;
  const setCaptionFormatting = ctx.setCaptionFormatting as any;
  const setDetailTag = ctx.setDetailTag as any;
  const setFinishingChecklist = ctx.setFinishingChecklist as any;
  const setSelectedCaptionArtifactFormat = ctx.setSelectedCaptionArtifactFormat as any;
  const setStudioRackBackend = ctx.setStudioRackBackend as any;
  const setStudioRackBypassed = ctx.setStudioRackBypassed as any;
  const setStudioRackEnabled = ctx.setStudioRackEnabled as any;
  const setStudioRackModuleBypassed = ctx.setStudioRackModuleBypassed as any;
  const setStudioRackModuleEnabled = ctx.setStudioRackModuleEnabled as any;
  const setStudioRackOpen = ctx.setStudioRackOpen as any;
  const setTranscriptTimingHint = ctx.setTranscriptTimingHint as any;
  const hasSilenceSuggestionAnalysis = ctx.hasSilenceSuggestionAnalysis as boolean;
  const silenceSuggestionCountForGaps = ctx.silenceSuggestionCount as number;
  const silenceCutSuggestions = ctx.silenceCutSuggestions as Array<{ id: string }> | null;
  const visibleSilenceCutSuggestions = ctx.visibleSilenceCutSuggestions as Array<{
    id: string;
    startSec: number;
    endSec: number;
    durationSec: number;
    reason: string;
  }>;
  const acceptSilenceCutSuggestion = ctx.acceptSilenceCutSuggestion as (id: string) => void;
  const dismissSilenceCutSuggestion = ctx.dismissSilenceCutSuggestion as (id: string) => void;
  const seekPlayheadToTime = ctx.seekPlayheadToTime as ((nextTimeSec: number, origin: "timeline" | "playhead", options?: { snapToBoundary?: boolean }) => void) | null;
  const setVideoSnapMode = ctx.setVideoSnapMode as any;
  const setVisualBackgroundBlur = ctx.setVisualBackgroundBlur as any;
  const setVisualBackgroundBlurDebugMask = ctx.setVisualBackgroundBlurDebugMask as any;
  const setVisualBackgroundMaskPreviewMode = ctx.setVisualBackgroundMaskPreviewMode as any;
  const setVisualBackgroundMaskPreviewStage = ctx.setVisualBackgroundMaskPreviewStage as any;
  const setVisualBackgroundBlurFallbackMode = ctx.setVisualBackgroundBlurFallbackMode as any;
  const setVisualBackgroundBlurFeatherPx = ctx.setVisualBackgroundBlurFeatherPx as any;
  const setVisualBackgroundBlurSubjectExpansionPx = ctx.setVisualBackgroundBlurSubjectExpansionPx as any;
  const setVisualBackgroundBlurProviderId = ctx.setVisualBackgroundBlurProviderId as any;
  const setVisualBackgroundBlurPx = ctx.setVisualBackgroundBlurPx as any;
  const setVisualBackgroundBlurQualityMode = ctx.setVisualBackgroundBlurQualityMode as any;
  const setVisualBackgroundBlurRuntimeStatus = ctx.setVisualBackgroundBlurRuntimeStatus as any;
  const setVisualBackgroundBlurTemporalSmoothing = ctx.setVisualBackgroundBlurTemporalSmoothing as any;
  const setVisualBackgroundReplaceColor = ctx.setVisualBackgroundReplaceColor as any;
  const setVisualBackgroundReplaceEnabled = ctx.setVisualBackgroundReplaceEnabled as any;
  const setVisualBackgroundReplaceImageAssetPath = ctx.setVisualBackgroundReplaceImageAssetPath as any;
  const setVisualBackgroundReplaceImageUrl = ctx.setVisualBackgroundReplaceImageUrl as any;
  const setVisualBackgroundReplaceMode = ctx.setVisualBackgroundReplaceMode as any;
  const setVisualBackgroundWashDesaturateAmount = ctx.setVisualBackgroundWashDesaturateAmount as any;
  const setVisualBackgroundWashDimAmount = ctx.setVisualBackgroundWashDimAmount as any;
  const setVisualBackgroundWashEnabled = ctx.setVisualBackgroundWashEnabled as any;
  const setVisualColorAmount = ctx.setVisualColorAmount as any;
  const setVisualEyeContactAssistDebugOverlay = ctx.setVisualEyeContactAssistDebugOverlay as any;
  const setVisualEyeContactAssistEnabled = ctx.setVisualEyeContactAssistEnabled as any;
  const setVisualEyeContactAssistRuntimeStatus = ctx.setVisualEyeContactAssistRuntimeStatus as any;
  const setVisualEyeContactAssistStrength = ctx.setVisualEyeContactAssistStrength as any;
  const setVisualWhiteBalance = ctx.setVisualWhiteBalance as any;
  const sourceBrollItems = ctx.sourceBrollItems as any;
  const sourceImageLibraryItems = ctx.sourceImageLibraryItems as any;
  const selectedBackgroundReplacementAssetId = ctx.selectedBackgroundReplacementAssetId as string | null;
  const visualBackgroundReplaceImageAssetPath = ctx.visualBackgroundReplaceImageAssetPath as string | null;
  const handleSourceDeskUpload = ctx.handleSourceDeskUpload as ((category: "images" | "broll" | "introoutro", fileList: FileList | null) => Promise<void>) | undefined;
  const uploadingCategory = ctx.uploadingCategory as ("images" | "broll" | "introoutro" | null);
  const studioRackOpen = ctx.studioRackOpen as any;
  const toggleLogoOverlay = ctx.toggleLogoOverlay as any;
  const trimResolvedBrollBinding = ctx.trimResolvedBrollBinding as any;
  const unresolvedBrollSuggestionItems = ctx.unresolvedBrollSuggestionItems as any;
  const updateImagePlacementTransform = ctx.updateImagePlacementTransform as any;
  const updateVisualPlacementTiming = ctx.updateVisualPlacementTiming as any;
  const videoSnapMode = ctx.videoSnapMode as any;
  const viewingModeSummary = ctx.viewingModeSummary as any;
  const visualBackgroundBlur = ctx.visualBackgroundBlur as any;
  const visualBackgroundBlurDebugMask = ctx.visualBackgroundBlurDebugMask as any;
  const visualBackgroundMaskPreviewMode = ctx.visualBackgroundMaskPreviewMode as any;
  const visualBackgroundMaskPreviewStage = ctx.visualBackgroundMaskPreviewStage as any;
  const visualBackgroundBlurFallbackMode = ctx.visualBackgroundBlurFallbackMode as any;
  const visualBackgroundBlurFeatherPx = ctx.visualBackgroundBlurFeatherPx as any;
  const visualBackgroundBlurSubjectExpansionPx = ctx.visualBackgroundBlurSubjectExpansionPx as any;
  const visualBackgroundBlurPx = ctx.visualBackgroundBlurPx as any;
  const visualBackgroundBlurQualityMode = ctx.visualBackgroundBlurQualityMode as any;
  const visualBackgroundBlurRuntimeStatus = ctx.visualBackgroundBlurRuntimeStatus as any;
  const visualBackgroundBlurStatusSummary = ctx.visualBackgroundBlurStatusSummary as any;
  const visualBackgroundBlurTemporalSmoothing = ctx.visualBackgroundBlurTemporalSmoothing as any;
  const visualBackgroundReplaceColor = ctx.visualBackgroundReplaceColor as any;
  const visualBackgroundReplaceEnabled = ctx.visualBackgroundReplaceEnabled as any;
  const visualBackgroundReplaceImageUrl = ctx.visualBackgroundReplaceImageUrl as any;
  const visualBackgroundReplaceMode = ctx.visualBackgroundReplaceMode as any;
  const visualBackgroundWashDesaturateAmount = ctx.visualBackgroundWashDesaturateAmount as any;
  const visualBackgroundWashDimAmount = ctx.visualBackgroundWashDimAmount as any;
  const visualBackgroundWashEnabled = ctx.visualBackgroundWashEnabled as any;
  const visualColorAmount = ctx.visualColorAmount as any;
  const visualEyeContactAssistDebugOverlay = ctx.visualEyeContactAssistDebugOverlay as any;
  const visualEyeContactAssistEnabled = ctx.visualEyeContactAssistEnabled as any;
  const visualEyeContactAssistRuntimeStatus = ctx.visualEyeContactAssistRuntimeStatus as any;
  const visualEyeContactAssistStatusSummary = ctx.visualEyeContactAssistStatusSummary as any;
  const visualEyeContactAssistStrength = ctx.visualEyeContactAssistStrength as any;
  const visualWhiteBalance = ctx.visualWhiteBalance as any;
  const workspaceFocusMode = ctx.workspaceFocusMode as any;


  const activeTool = ctx.activeTool as string;
  const currentPass = ctx.currentPass as string;
  const activeVisualTool = (ctx.activeVisualTool ?? vm.activeVisualTool ?? "polish") as "polish" | "images" | "broll";
  const onSelectVisualTool = (ctx.onSelectVisualTool ?? vm.onSelectVisualTool ?? null) as ((nextTool: "polish" | "images" | "broll") => void) | null;
  const setFocusOverride = ctx.setFocusOverride as (mode: "auto" | "source-focus" | "tool-focus" | "time-focus") => void;
  const devBlurControlsEnabled = isDevBlurControlsEnabled();
  const introStatusView = derivePackagingIntroStatusView({
    selectedIntroAssetId: introOutroSelection?.intro_asset_id ?? null,
    selectedIntroPath: introOutroSelectedIntroPath ?? null,
    introPlaced: Boolean(packagingIntroPlacement),
  });

  const activeReviewKind = ctx.activeReviewKind as string;
  const setActiveReviewKind = ctx.setActiveReviewKind as (next: any) => void;
  const setActiveTranscriptToolSection = ctx.setActiveTranscriptToolSection as (next: any) => void;
  const refreshCandidateQueue = ctx.refreshCandidateQueue as (...args: any[]) => void;

  const fillerCleanupOptions = ctx.fillerCleanupOptions as any;
  const setFillerCleanupOptions = ctx.setFillerCleanupOptions as (next: any | ((current: any) => any)) => void;
  const activeFillerCandidateCard = ctx.activeFillerCandidateCard as any;
  const fillerActiveCandidateIndex = ctx.fillerActiveCandidateIndex as number;
  const fillerCandidateCards = ctx.fillerCandidateCards as any[];
  const activeFillerCandidateDiffOps = ctx.activeFillerCandidateDiffOps as any;
  const candidateProposedRemovalById = ctx.candidateProposedRemovalById as Record<string, { text: string } | undefined>;
  const candidateReceiptByKind = ctx.candidateReceiptByKind as any;
  const selectedTranscriptRange = ctx.selectedTranscriptRange as { start: number; end: number; text: string } | null;
  const updateCandidateProposedRemoval = ctx.updateCandidateProposedRemoval as (kind: "fillers" | "retakes") => void;
  const fillerDecisionInFlight = ctx.fillerDecisionInFlight as boolean;
  const handleCandidateDecision = ctx.handleCandidateDecision as (...args: any[]) => void;

  const retakeCleanupOptions = ctx.retakeCleanupOptions as any;
  const setRetakeCleanupOptions = ctx.setRetakeCleanupOptions as (next: any | ((current: any) => any)) => void;
  const activeRetakeCandidateCard = ctx.activeRetakeCandidateCard as any;
  const retakeActiveCandidateIndex = ctx.retakeActiveCandidateIndex as number;
  const retakeCandidateCards = ctx.retakeCandidateCards as any[];
  const retakeDecisionInFlight = ctx.retakeDecisionInFlight as boolean;

  const deadAirThresholdSec = ctx.deadAirThresholdSec as number;
  const setDeadAirThresholdSec = ctx.setDeadAirThresholdSec as (next: number) => void;
  const analyzeDeadAirClosure = ctx.analyzeDeadAirClosure as (...args: any[]) => void;
  const deadAirApplyInFlight = ctx.deadAirApplyInFlight as boolean;
  const deadAirAnalysis = ctx.deadAirAnalysis as any;
  const applyDeadAirClosureBatch = ctx.applyDeadAirClosureBatch as (...args: any[]) => void;

  const polishStrength = ctx.polishStrength as number;
  const setPolishStrength = ctx.setPolishStrength as (next: any | ((current: any) => any)) => void;
  const gapCleanupOptions = ctx.gapCleanupOptions as any;
  const setGapCleanupOptions = ctx.setGapCleanupOptions as (next: any | ((current: any) => any)) => void;
  const setCleanupPreview = ctx.setCleanupPreview as (...args: any[]) => void;
  const previewShortenGaps = ctx.previewShortenGaps as (...args: any[]) => any;
  const previewRemoveFillers = ctx.previewRemoveFillers as (...args: any[]) => any;
  const previewRemoveRetakes = ctx.previewRemoveRetakes as (...args: any[]) => any;
  const previewQuickClean = ctx.previewQuickClean as (...args: any[]) => any;
  const editableTranscriptSegments = ctx.editableTranscriptSegments as any[];
  const speakerSoloOptions = ctx.speakerSoloOptions as any;
  const setSpeakerSoloOptions = ctx.setSpeakerSoloOptions as (next: any | ((current: any) => any)) => void;
  const speakerOptions = ctx.speakerOptions as string[];
  const previewSpeakerSolo = ctx.previewSpeakerSolo as (...args: any[]) => any;
  const hasTranscriptSelection = ctx.hasTranscriptSelection as boolean;
  const transcriptSelectionRange = ctx.transcriptSelectionRange as any;

  const speakerInterviewOptions = ctx.speakerInterviewOptions as any;
  const setSpeakerInterviewOptions = ctx.setSpeakerInterviewOptions as (next: any | ((current: any) => any)) => void;
  const previewSpeakerInterview = ctx.previewSpeakerInterview as (...args: any[]) => any;

  const speakerMonologueOptions = ctx.speakerMonologueOptions as any;
  const setSpeakerMonologueOptions = ctx.setSpeakerMonologueOptions as (next: any | ((current: any) => any)) => void;
  const previewSpeakerMonologue = ctx.previewSpeakerMonologue as (...args: any[]) => any;

  const speakerPanelOptions = ctx.speakerPanelOptions as any;
  const setSpeakerPanelOptions = ctx.setSpeakerPanelOptions as (next: any | ((current: any) => any)) => void;
  const previewSpeakerPanel = ctx.previewSpeakerPanel as (...args: any[]) => any;

  const cleanupPreview = ctx.cleanupPreview as any;
  const cleanupPreviewSummary = ctx.cleanupPreviewSummary as any;
  const applyCleanup = ctx.applyCleanup as (...args: any[]) => void;
  const cleanupReceipt = ctx.cleanupReceipt as any;

  const audioFinalizationCompareMode = ctx.audioFinalizationCompareMode as any;
  const setAudioFinalizationCompare = ctx.setAudioFinalizationCompare as (...args: any[]) => void;
  const applyVoicePolishPreset = ctx.applyVoicePolishPreset as (presetId: string) => void;
  const voicePolish = ctx.voicePolish as any;
  const setVoicePolishFixEnabled = ctx.setVoicePolishFixEnabled as (fixId: string, enabled: boolean) => void;
  const setVoicePolishDeEsserStrength = ctx.setVoicePolishDeEsserStrength as (value: string) => void;
  const setVoicePolishEqProfile = ctx.setVoicePolishEqProfile as (value: string) => void;
  const setVoiceCleanupEnabled = ctx.setVoiceCleanupEnabled as (enabled: boolean) => void;

  const editableAudioPolish = ctx.editableAudioPolish as any;
  const persistedAudioCutCount = ctx.persistedAudioCutCount as number;
  const effectivePlaybackCutRegions = ctx.effectivePlaybackCutRegions as any[];
  const silenceSuggestionCount = ctx.silenceSuggestionCount as number;

  const editableStudioRack = ctx.editableStudioRack as any;
  const studioRackPlaybackConfig = ctx.studioRackPlaybackConfig as any;
  const studioRackPlaybackBackendResolution = ctx.studioRackPlaybackBackendResolution as any;
  const studioRackRenderConfig = ctx.studioRackRenderConfig as any;
  const studioRackRenderBackendResolution = ctx.studioRackRenderBackendResolution as any;
  const studioRackRenderStatus = ctx.studioRackRenderStatus as any;
  const studioRackRenderAppliedModules = ctx.studioRackRenderAppliedModules as any[];
  const studioRackRenderDeferredModules = ctx.studioRackRenderDeferredModules as any[];
  const studioRackEnabledModuleCount = ctx.studioRackEnabledModuleCount as number;
  const studioRackComparePreviewStatusLabel = ctx.studioRackComparePreviewStatusLabel as string | null;

  const podcastMasterLayer = ctx.podcastMasterLayer as any;
  const podcastMasterUiStatus = ctx.podcastMasterUiStatus as any;

  function getCommittedProposedRemovalText(card: any): string {
    if (!card) return "";
    return candidateProposedRemovalById[card.id]?.text ?? card.suggestedRemovalText ?? "";
  }

  function getDisplayedProposedRemovalText(card: any): string {
    const committedText = getCommittedProposedRemovalText(card);
    if (committedText.trim()) return committedText;
    return selectedTranscriptRange?.text ?? "";
  }

  return (
    <>
      <header className="hammer-bay-head">
        <strong>Tool Rack</strong>
        <div className="hammer-pass-head">
          <span>{vm.passLabel}</span>
          <span className={`hammer-pass-badge hammer-pass-badge--${vm.passStatus}`}>
            {vm.passStatus}
          </span>
          <button type="button" onClick={vm.onMarkComplete}>
            Mark Complete
          </button>
        </div>
      </header>
      <div className="hammer-bay-body">
        {activeTool === "video" ? (
          <section className="hammer-tool-card hammer-visual-tool-selector" aria-label="Visual tool selector">
            <header className="hammer-tool-card__head">Visual Tools</header>
            <div className="hammer-source-card__actions" aria-label="Visual tools">
              <button
                type="button"
                className={activeVisualTool === "polish" ? "is-selected" : ""}
                onClick={() => onSelectVisualTool?.("polish")}
              >
                Polish
              </button>
              <button
                type="button"
                className={activeVisualTool === "images" ? "is-selected" : ""}
                onClick={() => onSelectVisualTool?.("images")}
              >
                Images
              </button>
              <button
                type="button"
                className={activeVisualTool === "broll" ? "is-selected" : ""}
                onClick={() => onSelectVisualTool?.("broll")}
              >
                B-roll
              </button>
            </div>
          </section>
        ) : null}
                  {activeTool === "polish" ? (
                    currentPass === "transcript_cleanup" || currentPass === "retakes" || currentPass === "gap_pacing" ? (
                      <section className="hammer-tool-card">
                        <header className="hammer-tool-card__head">
                          Transcript Cleanup
                        </header>
                        <div className="hammer-tool-hint">
                          Review filler candidates first, then retake candidates below. Shortcuts: Fillers (1), Retakes (2), Approve (A), Reject (R), Prev/Next (K/J).
                        </div>

                    <div onMouseDown={() => {
                      setActiveReviewKind("fillers");
                      setActiveTranscriptToolSection("fillers");
                    }}>
                      <header className="hammer-cleanup-tool__head">
                        <strong>Filler Cleanup</strong>
                        <span>Intent: Remove filler phrases without rewriting surrounding content.</span>
                      </header>
                      <label className="hammer-tool-field">
                        <span>Aggressiveness</span>
                        <select
                          value={fillerCleanupOptions.aggressiveness}
                          onChange={(event) => setFillerCleanupOptions((current: any) => ({
                            ...current,
                            aggressiveness: event.target.value as FillerCleanupOptions["aggressiveness"],
                          }))}
                        >
                          <option value="light">Light</option>
                          <option value="medium">Medium</option>
                          <option value="strong">Strong</option>
                        </select>
                      </label>
                      <div className="hammer-candidate-review__actions">
                        <button
                          type="button"
                          aria-label="Refresh filler candidates"
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            refreshCandidateQueue("fillers");
                          }}
                        >
                          Refresh Fillers
                        </button>
                      </div>
                      {activeFillerCandidateCard ? (
                        <article className={`hammer-candidate-card ${activeReviewKind === "fillers" ? "hammer-candidate-card--active" : ""}`}>
                          <header className="hammer-candidate-card__head">
                            <strong>
                              {fillerActiveCandidateIndex + 1} / {fillerCandidateCards.length}
                            </strong>
                            <span>{activeFillerCandidateCard.primarySegmentId}</span>
                          </header>
                          <p className="hammer-candidate-card__description">{activeFillerCandidateCard.description}</p>
                          <div className="hammer-candidate-card__context">
                            <header>Current</header>
                            <p className="hammer-candidate-diff">
                              {activeFillerCandidateDiffOps ? (() => {
                                const parts: JSX.Element[] = [];
                                let first = true;
                                for (let idx = 0; idx < activeFillerCandidateDiffOps.length; idx += 1) {
                                  const op = activeFillerCandidateDiffOps[idx];
                                  if (op.type === "insert") continue;
                                  const text = op.words.join(" ");
                                  const prefix = first ? "" : " ";
                                  first = false;
                                  const className = op.type === "delete" ? "hammer-candidate-diff__del" : undefined;
                                  parts.push(
                                    <span key={`cur-${idx}`} className={className}>
                                      {prefix}{text}
                                    </span>,
                                  );
                                }
                                return parts;
                              })() : activeFillerCandidateCard.beforeText}
                            </p>
                          </div>
                          <div className="hammer-candidate-card__context">
                            <header>Proposed Removal</header>
                            <p className="hammer-candidate-diff">
                              {getDisplayedProposedRemovalText(activeFillerCandidateCard) || "[no removal selected]"}
                            </p>
                          </div>
                          <div className="hammer-candidate-card__meta">
                            <span>Confidence {Math.round(activeFillerCandidateCard.confidence * 100)}%</span>
                            <span>Est. time saved {activeFillerCandidateCard.timeSavedSec.toFixed(1)}s</span>
                          </div>
                          {candidateReceiptByKind.fillers ? (
                            <div className="hammer-tool-hint">{candidateReceiptByKind.fillers}</div>
                          ) : null}
                          <div className="hammer-candidate-review__actions">
                            <button
                              type="button"
                              disabled={fillerDecisionInFlight || !selectedTranscriptRange}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                updateCandidateProposedRemoval("fillers");
                              }}
                            >
                              Update Proposed Removal
                            </button>
                            <button
                              type="button"
                              disabled={fillerDecisionInFlight || !getCommittedProposedRemovalText(activeFillerCandidateCard).trim()}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                handleCandidateDecision("fillers", true);
                              }}
                            >
                              Approve Removal
                            </button>
                            <button
                              type="button"
                              disabled={fillerDecisionInFlight}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                handleCandidateDecision("fillers", false);
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        </article>
                      ) : (
                        <div className="hammer-tool-hint">No filler candidates detected in this pass.</div>
                      )}
                    </div>

                    <hr className="hammer-divider" />

                    <div onMouseDown={() => {
                      setActiveReviewKind("retakes");
                      setActiveTranscriptToolSection("retakes");
                    }}>
                      <header className="hammer-cleanup-tool__head">
                        <strong>Retake Review</strong>
                        <span>Intent: Detect adjacent restarts and false starts for optional removal.</span>
                      </header>
                      <label className="hammer-tool-field">
                        <span>Detection mode</span>
                        <select
                          value={retakeCleanupOptions.detection}
                          onChange={(event) => setRetakeCleanupOptions((current: any) => ({
                            ...current,
                            detection: event.target.value as RetakeCleanupOptions["detection"],
                          }))}
                        >
                          <option value="conservative">Conservative</option>
                          <option value="normal">Normal</option>
                          <option value="aggressive">Aggressive</option>
                        </select>
                      </label>
                      <div className="hammer-candidate-review__actions">
                        <button
                          type="button"
                          aria-label="Refresh retake candidates"
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            refreshCandidateQueue("retakes");
                          }}
                        >
                          Refresh Retakes
                        </button>
                      </div>
                      {activeRetakeCandidateCard ? (
                        <article className={`hammer-candidate-card ${activeReviewKind === "retakes" ? "hammer-candidate-card--active" : ""}`}>
                          <header className="hammer-candidate-card__head">
                            <strong>
                              {retakeActiveCandidateIndex + 1} / {retakeCandidateCards.length}
                            </strong>
                            <span>
                              {(() => {
                                const ids = activeRetakeCandidateCard.segmentIds;
                                if (ids.length <= 1) return ids[0] ?? "?";
                                if (ids.length === 2) return `${ids[0] ?? "?"} → ${ids[1] ?? "?"}`;
                                return `${ids.slice(0, -1).join(", ")} → ${ids[ids.length - 1] ?? "?"}`;
                              })()}
                            </span>
                          </header>
                          <p className="hammer-candidate-card__description">{activeRetakeCandidateCard.description}</p>
                          <div className="hammer-candidate-card__context">
                            <header>Current</header>
                            {activeRetakeCandidateCard.beforeText.split("\n").map((line: any, idx: any) => (
                              <p key={`retake-cur-${idx}`} className="hammer-candidate-diff">{line}</p>
                            ))}
                          </div>
                          <div className="hammer-candidate-card__context">
                            <header>Proposed Removal</header>
                            <p className="hammer-candidate-diff">
                              {getDisplayedProposedRemovalText(activeRetakeCandidateCard) || "[no removal selected]"}
                            </p>
                          </div>
                          <div className="hammer-candidate-card__meta">
                            <span>Confidence {Math.round(activeRetakeCandidateCard.confidence * 100)}%</span>
                            <span>Time saved {activeRetakeCandidateCard.timeSavedSec.toFixed(1)}s</span>
                          </div>
                          {candidateReceiptByKind.retakes ? (
                            <div className="hammer-tool-hint">{candidateReceiptByKind.retakes}</div>
                          ) : null}
                          <div className="hammer-candidate-review__actions">
                            <button
                              type="button"
                              disabled={retakeDecisionInFlight || !selectedTranscriptRange}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                updateCandidateProposedRemoval("retakes");
                              }}
                            >
                              Update Proposed Removal
                            </button>
                            <button
                              type="button"
                              disabled={retakeDecisionInFlight || !getCommittedProposedRemovalText(activeRetakeCandidateCard).trim()}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                handleCandidateDecision("retakes", true);
                              }}
                            >
                              Approve Removal
                            </button>
                            <button
                              type="button"
                              disabled={retakeDecisionInFlight}
                              onClick={() => {
                                setFocusOverride("tool-focus");
                                handleCandidateDecision("retakes", false);
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        </article>
                      ) : (
                        <div className="hammer-tool-hint">No retake candidates detected in this pass.</div>
                      )}
                    </div>

                    <hr className="hammer-divider" />

                    <div onMouseDown={() => setActiveTranscriptToolSection("silence_gaps")}>
                      <header className="hammer-cleanup-tool__head">
                        <strong>Silence Gaps</strong>
                        <span>Intent: Trim long silent pauses between spoken segments without changing transcript wording.</span>
                      </header>
                      <div className="hammer-tool-hint">
                        Shortcuts: Focus (Shift+D), Analyze (Shift+A), Apply (Enter).
                      </div>
                      <label className="hammer-tool-field">
                        <span>Max allowed gap</span>
                        <select
                          value={deadAirThresholdSec}
                          onChange={(event) => {
                            setFocusOverride("tool-focus");
                            setDeadAirThresholdSec(Number(event.target.value) || 1.5);
                          }}
                        >
                          <option value={1.0}>1.0s</option>
                          <option value={1.5}>1.5s</option>
                          <option value={2.0}>2.0s</option>
                        </select>
                      </label>
                      <div className="hammer-candidate-review__actions">
                        <button
                          type="button"
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            analyzeDeadAirClosure();
                          }}
                        >
                          Analyze
                        </button>
                        <button
                          type="button"
                          disabled={
                            deadAirApplyInFlight
                            || !deadAirAnalysis
                            || deadAirAnalysis.eligibleGapCount === 0
                          }
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            applyDeadAirClosureBatch();
                          }}
                        >
                          Apply
                        </button>
                      </div>
                      <div className="hammer-tool-hint">
                        {!deadAirAnalysis
                          ? "Analyze to preview how many gaps exceed the selected threshold."
                          : deadAirAnalysis.eligibleGapCount === 0
                            ? "No silence gaps exceed the selected threshold."
                            : `${deadAirAnalysis.eligibleGapCount} gap${deadAirAnalysis.eligibleGapCount === 1 ? "" : "s"} exceed ${deadAirAnalysis.thresholdSec.toFixed(1)}s; applying would remove ${deadAirAnalysis.totalRemovableSec.toFixed(1)}s of silence.`}
                      </div>

                      {hasSilenceSuggestionAnalysis ? (
                        <details className="hammer-timeline-suggestion-list" open>
                          <summary className="hammer-timeline-suggestion-list__meta">
                            <span>
                              Suggested silence cuts: {silenceSuggestionCountForGaps} visible
                              {` · ${(silenceCutSuggestions?.length ?? 0)} total from segmentation`}
                            </span>
                            <span>Accept creates a real cut. Dismiss hides it for this session.</span>
                          </summary>
                          {visibleSilenceCutSuggestions.length > 0 ? (
                            <div className="hammer-timeline-suggestion-list__items">
                              {visibleSilenceCutSuggestions.map((suggestion) => (
                                <article key={suggestion.id} className="hammer-timeline-suggestion-card">
                                  <div className="hammer-timeline-suggestion-card__copy">
                                    <strong>
                                      Cut silence {suggestion.startSec.toFixed(1)}s-{suggestion.endSec.toFixed(1)}s
                                    </strong>
                                    <span>
                                      {suggestion.durationSec.toFixed(1)}s pause · {suggestion.reason === "long_silence" ? "long silence" : suggestion.reason}
                                    </span>
                                  </div>
                                  <div className="hammer-timeline-suggestion-card__actions">
                                    {typeof seekPlayheadToTime === "function" ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setFocusOverride("time-focus");
                                          seekPlayheadToTime(suggestion.startSec, "timeline", { snapToBoundary: true });
                                        }}
                                      >
                                        Jump
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFocusOverride("tool-focus");
                                        acceptSilenceCutSuggestion(suggestion.id);
                                      }}
                                    >
                                      Accept
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFocusOverride("tool-focus");
                                        dismissSilenceCutSuggestion(suggestion.id);
                                      }}
                                    >
                                      Dismiss
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="hammer-timeline-suggestion-list__empty">
                              No long silence suggestions remain above the threshold.
                            </div>
                          )}
                        </details>
                      ) : null}
                    </div>
                  </section>
                ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">
                    Transcript Polish
                  </header>
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
                          setGapCleanupOptions((current: any) => ({
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
                        onChange={(event) => setGapCleanupOptions((current: any) => ({
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
                        onChange={(event) => setFillerCleanupOptions((current: any) => ({
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
                        onChange={(event) => setFillerCleanupOptions((current: any) => ({
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
                        onChange={(event) => setRetakeCleanupOptions((current: any) => ({
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
                        onChange={(event) => setRetakeCleanupOptions((current: any) => ({
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
                          setSpeakerSoloOptions((current: any) => ({
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
                          setSpeakerSoloOptions((current: any) => ({
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
                          setSpeakerSoloOptions((current: any) => ({
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
                          setSpeakerSoloOptions((current: any) => ({
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
                          setSpeakerInterviewOptions((current: any) => ({
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
                          setSpeakerInterviewOptions((current: any) => ({
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
                          setSpeakerInterviewOptions((current: any) => ({
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
                          setSpeakerInterviewOptions((current: any) => ({
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
                          setSpeakerInterviewOptions((current: any) => ({
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
                          setSpeakerMonologueOptions((current: any) => ({
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
                          setSpeakerMonologueOptions((current: any) => ({
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
                          setSpeakerMonologueOptions((current: any) => ({
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
                          setSpeakerMonologueOptions((current: any) => ({
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
                          setSpeakerMonologueOptions((current: any) => ({
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
                          setSpeakerMonologueOptions((current: any) => ({
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
                          setSpeakerPanelOptions((current: any) => ({
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
                          setSpeakerPanelOptions((current: any) => ({
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
                          setSpeakerPanelOptions((current: any) => ({
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
                          setSpeakerPanelOptions((current: any) => ({
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
                          setSpeakerPanelOptions((current: any) => ({
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

                    <label
                      className={`hammer-tool-field hammer-audio-fix ${voicePolish?.voice_cleanup_enabled ? "is-active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(voicePolish?.voice_cleanup_enabled)}
                        onChange={(event) => setVoiceCleanupEnabled(event.target.checked)}
                        aria-label="Voice Cleanup"
                      />
                      <span className="hammer-audio-fix__copy">
                        <strong>
                          Voice Cleanup
                          {voicePolish?.voice_cleanup_enabled ? <span className="hammer-audio-fix__checkmark" aria-hidden="true">✓</span> : null}
                        </strong>
                        <span className="hammer-audio-fix__help">Conservative spoken-audio cleanup (rumble cut, gentle harshness control, light compression, loudness leveling)</span>
                      </span>
                    </label>

                    <header className="hammer-tool-card__subhead">Audio Fixes</header>
                    <label
                      className={`hammer-tool-field hammer-audio-fix ${voicePolish?.fixes?.remove_harsh_sibilance ? "is-active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(voicePolish?.fixes?.remove_harsh_sibilance)}
                        onChange={(event) => setVoicePolishFixEnabled(
                          "remove_harsh_sibilance",
                          event.target.checked,
                        )}
                        aria-label="Remove Harsh Sibilance"
                      />
                      <span className="hammer-audio-fix__copy">
                        <strong>
                          Remove Harsh Sibilance
                          {voicePolish?.fixes?.remove_harsh_sibilance ? <span className="hammer-audio-fix__checkmark" aria-hidden="true">✓</span> : null}
                        </strong>
                        <span className="hammer-audio-fix__help">Softens sharp “S” sounds</span>
                      </span>
                    </label>
                    <label
                      className={`hammer-tool-field hammer-audio-fix ${voicePolish?.fixes?.reduce_room_boxiness ? "is-active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(voicePolish?.fixes?.reduce_room_boxiness)}
                        onChange={(event) => setVoicePolishFixEnabled(
                          "reduce_room_boxiness",
                          event.target.checked,
                        )}
                        aria-label="Reduce Room / Boxiness"
                      />
                      <span className="hammer-audio-fix__copy">
                        <strong>
                          Reduce Room / Boxiness
                          {voicePolish?.fixes?.reduce_room_boxiness ? <span className="hammer-audio-fix__checkmark" aria-hidden="true">✓</span> : null}
                        </strong>
                        <span className="hammer-audio-fix__help">Removes echo / boxy room tone</span>
                      </span>
                    </label>
                    <label
                      className={`hammer-tool-field hammer-audio-fix ${voicePolish?.fixes?.enhance_voice_clarity ? "is-active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(voicePolish?.fixes?.enhance_voice_clarity)}
                        onChange={(event) => setVoicePolishFixEnabled(
                          "enhance_voice_clarity",
                          event.target.checked,
                        )}
                        aria-label="Enhance Voice Clarity"
                      />
                      <span className="hammer-audio-fix__copy">
                        <strong>
                          Enhance Voice Clarity
                          {voicePolish?.fixes?.enhance_voice_clarity ? <span className="hammer-audio-fix__checkmark" aria-hidden="true">✓</span> : null}
                        </strong>
                        <span className="hammer-audio-fix__help">Brings the voice forward and improves intelligibility</span>
                      </span>
                    </label>
                    <label
                      className={`hammer-tool-field hammer-audio-fix ${voicePolish?.fixes?.level_volume ? "is-active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(voicePolish?.fixes?.level_volume)}
                        onChange={(event) => setVoicePolishFixEnabled(
                          "level_volume",
                          event.target.checked,
                        )}
                        aria-label="Level Volume"
                      />
                      <span className="hammer-audio-fix__copy">
                        <strong>
                          Level Volume
                          {voicePolish?.fixes?.level_volume ? <span className="hammer-audio-fix__checkmark" aria-hidden="true">✓</span> : null}
                        </strong>
                        <span className="hammer-audio-fix__help">Evens out overall loudness</span>
                      </span>
                    </label>

                    <header className="hammer-tool-card__subhead">Presets</header>
                    <div className="hammer-source-card__actions hammer-audio-presets">
                      <button
                        type="button"
                        className={voicePolish?.preset_id === "podcast_voice_balanced" ? "is-selected" : ""}
                        onClick={() => applyVoicePolishPreset("podcast_voice_balanced")}
                      >
                        Podcast Voice (Balanced)
                      </button>
                      <button
                        type="button"
                        className={voicePolish?.preset_id === "clean_bright" ? "is-selected" : ""}
                        onClick={() => applyVoicePolishPreset("clean_bright")}
                      >
                        Clean & Bright
                      </button>
                      <button
                        type="button"
                        className={voicePolish?.preset_id === "warm_full" ? "is-selected" : ""}
                        onClick={() => applyVoicePolishPreset("warm_full")}
                      >
                        Warm & Full
                      </button>
                      <button
                        type="button"
                        className={voicePolish?.preset_id === "broadcast_ready" ? "is-selected" : ""}
                        onClick={() => applyVoicePolishPreset("broadcast_ready")}
                      >
                        <span>Broadcast Ready</span>
                        <span className="hammer-inline-badge">Recommended</span>
                      </button>
                    </div>

                    <header className="hammer-tool-card__subhead">Compare</header>
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

                    <details className="hammer-tool-advanced">
                      <summary className="hammer-tool-card__subhead">Advanced</summary>
                      <label className="hammer-tool-field">
                        <span>De-esser strength</span>
                        <select
                          value={voicePolish?.advanced?.de_esser_strength ?? "medium"}
                          onChange={(event) => setVoicePolishDeEsserStrength(event.target.value)}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </label>
                      <label className="hammer-tool-field">
                        <span>EQ profile</span>
                        <select
                          value={voicePolish?.advanced?.eq_profile ?? "voice"}
                          onChange={(event) => setVoicePolishEqProfile(event.target.value)}
                        >
                          <option value="flat">Flat</option>
                          <option value="voice">Voice</option>
                          <option value="bright">Bright</option>
                        </select>
                      </label>
                    </details>
                  </section>
                ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Audio Adjustments</header>
                  <div className="hammer-tool-hint">Current prep status: {editableAudioPolish?.status ?? "not_started"}</div>
                  <div className="hammer-tool-hint">
                    Persisted cut ops: {persistedAudioCutCount} raw · {effectivePlaybackCutRegions.length} effective playback region{effectivePlaybackCutRegions.length === 1 ? "" : "s"}
                  </div>
                  <div className="hammer-tool-hint">
                    Silence suggestions: {silenceSuggestionCount} visible · derived from segmentation only
                  </div>
                  <div className="hammer-tool-hint">
                    Preferred backend: {editableStudioRack.backend_preference}
                  </div>
                  <div className="hammer-tool-hint">
                    Playback lane: {studioRackPlaybackConfig.backend} ({studioRackPlaybackBackendResolution.status})
                  </div>
                  <div className="hammer-tool-hint">
                    Render lane: {studioRackRenderConfig.backend} ({studioRackRenderBackendResolution.status})
                  </div>
                  {studioRackComparePreviewStatusLabel ? (
                    <div className="hammer-tool-hint">
                      {studioRackComparePreviewStatusLabel}
                    </div>
                  ) : null}
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
                      setStudioRackOpen((current: any) => !current);
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
                            onChange={(event) => applyStudioRackMutation("Adjust gate threshold", (current: any) => ({
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
                            onChange={(event) => applyStudioRackMutation("Adjust compressor ratio", (current: any) => ({
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
                            onChange={(event) => applyStudioRackMutation("Adjust EQ mid gain", (current: any) => ({
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
                            onChange={(event) => applyStudioRackMutation("Adjust reverb mix", (current: any) => ({
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
                            onChange={(event) => applyStudioRackMutation("Adjust Tube Mic Character amount", (current: any) => ({
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
                activeVisualTool === "polish" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Visual Polish</header>
                    <div className="hammer-tool-hint">
                      Look Preset and Exposure affect preview and export. White balance, color, and blur stay preview-only in this phase.
                    </div>
                    <label className="hammer-tool-field">
                      <span>Look Preset</span>
                      <select
                        value={activeLookPreset ?? "neutral"}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          applyLookPresetSelection(event.target.value as HammerVisualLutPreset | "neutral");
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
                      <span>Exposure ({activeExposureAdjustment ?? 0})</span>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        step={1}
                        value={activeExposureAdjustment ?? 0}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          applyExposureAdjustment(Number(event.target.value));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={visualEyeContactAssistEnabled}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setVisualEyeContactAssistEnabled(event.target.checked);
                          setVisualEyeContactAssistRuntimeStatus(null);
                        }}
                      />
                      <span>Eye Contact Assist (Preview)</span>
                    </label>
                    {visualEyeContactAssistEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Strength ({visualEyeContactAssistStrength.toFixed(2)})</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={visualEyeContactAssistStrength}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualEyeContactAssistStrength(Number(event.target.value));
                            }}
                          />
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualEyeContactAssistDebugOverlay}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualEyeContactAssistDebugOverlay(event.target.checked);
                            }}
                          />
                          <span>Show gaze debug (overlay/status)</span>
                        </label>
                        <div className="hammer-tool-hint">
                          {visualEyeContactAssistStatusSummary
                            ? visualEyeContactAssistStatusSummary.primaryLine
                            : "Eye contact status unavailable."}
                        </div>
                        {visualEyeContactAssistDebugOverlay && visualEyeContactAssistRuntimeStatus?.debug ? (
                          <div className="hammer-tool-hint">
                            {visualEyeContactAssistStatusSummary?.debugLine ? (
                              <div>{visualEyeContactAssistStatusSummary.debugLine}</div>
                            ) : null}
                            {visualEyeContactAssistRuntimeStatus.debug.applicabilityReasons.length > 0 ? (
                              <div>Applicability: {visualEyeContactAssistRuntimeStatus.debug.applicabilityReasons.join(", ")}</div>
                            ) : null}
                            {visualEyeContactAssistRuntimeStatus.debug.smoothingResetReasons.length > 0 ? (
                              <div>Smoothing reset: {visualEyeContactAssistRuntimeStatus.debug.smoothingResetReasons.join(", ")}</div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    <label className="hammer-tool-field">
                      <span>Preview White Balance ({visualWhiteBalance})</span>
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
                      <span>Preview Color ({visualColorAmount})</span>
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
                          const enabled = event.target.checked;
                          setVisualBackgroundBlur(enabled);
                          if (enabled) {
                            setVisualBackgroundReplaceEnabled(false);
                            setVisualBackgroundWashEnabled(false);
                            if (!devBlurControlsEnabled) {
                              setVisualBackgroundBlurQualityMode("high");
                              setVisualBackgroundBlurPx(5);
                              setVisualBackgroundBlurFeatherPx(9);
                              setVisualBackgroundBlurTemporalSmoothing(0.6);
                              setVisualBackgroundBlurSubjectExpansionPx(0);
                              setVisualBackgroundMaskPreviewMode(false);
                              setVisualBackgroundMaskPreviewStage("refined");
                              setVisualBackgroundBlurFallbackMode("passthrough");
                            }
                          }
                        }}
                      />
                      <span>Background Blur</span>
                    </label>
                    <div className="hammer-tool-hint">
                      {visualBackgroundBlur
                        ? ((visualBackgroundBlurRuntimeStatus?.degradedReason === "reusing_recent_mask"
                          || visualBackgroundBlurRuntimeStatus?.degradedReason === "replacement_degraded_under_load"
                          || visualBackgroundBlurRuntimeStatus?.degradedReason === "replacement_downgraded_to_blur")
                          ? "Using fallback"
                          : visualBackgroundBlurRuntimeStatus?.statusMessage
                          ? "Preparing blur..."
                          : visualBackgroundBlurRuntimeStatus?.mask?.status === "ok"
                          ? "Blur active"
                          : visualBackgroundBlurStatusSummary?.primaryLine
                          ? "Ready"
                          : "Blur unavailable")
                        : "Ready"}
                    </div>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={visualBackgroundReplaceEnabled}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          const enabled = event.target.checked;
                          setVisualBackgroundReplaceEnabled(enabled);
                          if (enabled) {
                            setVisualBackgroundBlur(false);
                            setVisualBackgroundWashEnabled(false);
                            setVisualBackgroundReplaceMode("image");
                          }
                        }}
                      />
                      <span>Background Replacement</span>
                    </label>
                    {visualBackgroundReplaceEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Selected Background</span>
                          <select
                            value={visualBackgroundReplaceImageAssetPath ?? ""}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              const nextPath = event.target.value.trim();
                              setVisualBackgroundReplaceImageAssetPath(nextPath || null);
                              if (nextPath) {
                                setVisualBackgroundReplaceMode("image");
                                setVisualBackgroundReplaceImageUrl("");
                              }
                            }}
                          >
                            <option value="">No background selected</option>
                            {sourceImageLibraryItems.map((item: any) => (
                              <option key={`bg-replace-${item.path}`} value={item.path}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="hammer-source-card__actions">
                          <label className="hammer-diagnostics-banner__button">
                            Upload Background
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              onChange={(event) => {
                                const files = event.currentTarget.files;
                                if (!files || files.length === 0 || !handleSourceDeskUpload) return;
                                setFocusOverride("tool-focus");
                                void handleSourceDeskUpload("images", files).finally(() => {
                                  event.currentTarget.value = "";
                                });
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundReplaceImageAssetPath(null);
                              setVisualBackgroundReplaceImageUrl("");
                            }}
                            disabled={!visualBackgroundReplaceImageAssetPath && !visualBackgroundReplaceImageUrl.trim()}
                          >
                            Clear Background
                          </button>
                        </div>
                        <div className="hammer-tool-hint">
                          {visualBackgroundReplaceImageAssetPath
                            ? `Background asset selected${selectedBackgroundReplacementAssetId ? ` · ${selectedBackgroundReplacementAssetId}` : ""}`
                            : "No background asset selected"}
                          {uploadingCategory === "images" ? " · Uploading..." : ""}
                        </div>
                        <label className="hammer-tool-field">
                          <span>Edge feather ({Math.round(visualBackgroundBlurFeatherPx)}px)</span>
                          <input
                            type="range"
                            min={0}
                            max={24}
                            step={1}
                            value={visualBackgroundBlurFeatherPx}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurFeatherPx(Number(event.target.value));
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {devBlurControlsEnabled ? (
                      <details className="hammer-tool-fieldset">
                        <summary>Advanced Blur Controls</summary>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualBackgroundReplaceEnabled}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              const enabled = event.target.checked;
                              setVisualBackgroundReplaceEnabled(enabled);
                              if (enabled) {
                                setVisualBackgroundBlur(false);
                                setVisualBackgroundWashEnabled(false);
                              }
                            }}
                          />
                          <span>Background Replace (Segmentation Preview)</span>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualBackgroundWashEnabled}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              const enabled = event.target.checked;
                              setVisualBackgroundWashEnabled(enabled);
                              if (enabled) {
                                setVisualBackgroundBlur(false);
                                setVisualBackgroundReplaceEnabled(false);
                              }
                            }}
                          />
                          <span>Background Wash (Segmentation Preview)</span>
                        </label>
                    {visualBackgroundBlur ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Segmentation Provider</span>
                          <select
                            value={backgroundBlurProviderDescriptor?.id ?? "mediapipe_selfie_segmentation"}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurProviderId(event.target.value);
                              setVisualBackgroundBlurRuntimeStatus(null);
                            }}
                          >
                            {SEGMENTATION_PROVIDER_DESCRIPTORS.map((descriptor: any) => (
                              <option key={descriptor.id} value={descriptor.id}>
                                {descriptor.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Blur strength ({Math.round(visualBackgroundBlurPx)}px)</span>
                          <input
                            type="range"
                            min={0}
                            max={40}
                            step={1}
                            value={visualBackgroundBlurPx}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurPx(Number(event.target.value));
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {visualBackgroundReplaceEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Segmentation Provider</span>
                          <select
                            value={backgroundBlurProviderDescriptor?.id ?? "mediapipe_selfie_segmentation"}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurProviderId(event.target.value);
                              setVisualBackgroundBlurRuntimeStatus(null);
                            }}
                          >
                            {SEGMENTATION_PROVIDER_DESCRIPTORS.map((descriptor: any) => (
                              <option key={descriptor.id} value={descriptor.id}>
                                {descriptor.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Replacement Mode</span>
                          <select
                            value={visualBackgroundReplaceMode}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundReplaceMode(event.target.value as "solid" | "image" | "checkerboard");
                            }}
                          >
                            <option value="solid">Solid Color</option>
                            <option value="checkerboard">Checkerboard (Debug)</option>
                            <option value="image">Image (Preview)</option>
                          </select>
                        </label>
                        {visualBackgroundReplaceMode === "solid" ? (
                          <label className="hammer-tool-field">
                            <span>Replacement Color</span>
                            <input
                              type="color"
                              value={visualBackgroundReplaceColor}
                              onChange={(event) => {
                                setFocusOverride("tool-focus");
                                setVisualBackgroundReplaceColor(event.target.value);
                              }}
                            />
                          </label>
                        ) : visualBackgroundReplaceMode === "image" ? (
                          <label className="hammer-tool-field">
                            <span>Replacement Image URL</span>
                            <input
                              type="text"
                              value={visualBackgroundReplaceImageUrl}
                              placeholder="https://..."
                              onChange={(event) => {
                                setFocusOverride("tool-focus");
                                setVisualBackgroundReplaceImageUrl(event.target.value);
                              }}
                            />
                            {visualBackgroundBlurRuntimeStatus?.degradedReason === "replacement_image_load_failed" ? (
                              <div className="hammer-tool-hint">
                                Image load failed. If this is a remote URL, it may be blocked by CORS. Try an image host that sends permissive CORS headers, or use a local/static asset URL.
                              </div>
                            ) : null}
                          </label>
                        ) : null}
                        <label className="hammer-tool-field">
                          <span>Edge feather ({Math.round(visualBackgroundBlurFeatherPx)}px)</span>
                          <input
                            type="range"
                            min={0}
                            max={24}
                            step={1}
                            value={visualBackgroundBlurFeatherPx}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurFeatherPx(Number(event.target.value));
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {visualBackgroundWashEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Segmentation Provider</span>
                          <select
                            value={backgroundBlurProviderDescriptor?.id ?? "mediapipe_selfie_segmentation"}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurProviderId(event.target.value);
                              setVisualBackgroundBlurRuntimeStatus(null);
                            }}
                          >
                            {SEGMENTATION_PROVIDER_DESCRIPTORS.map((descriptor: any) => (
                              <option key={descriptor.id} value={descriptor.id}>
                                {descriptor.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Background dim ({Math.round(visualBackgroundWashDimAmount * 100)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={visualBackgroundWashDimAmount}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundWashDimAmount(Number(event.target.value));
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Desaturate ({Math.round(visualBackgroundWashDesaturateAmount * 100)}%)</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={visualBackgroundWashDesaturateAmount}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundWashDesaturateAmount(Number(event.target.value));
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {visualBackgroundBlur || visualBackgroundReplaceEnabled || visualBackgroundWashEnabled ? (
                      <>
                        <label className="hammer-tool-field">
                          <span>Edge feather ({Math.round(visualBackgroundBlurFeatherPx)}px)</span>
                          <input
                            type="range"
                            min={0}
                            max={24}
                            step={1}
                            value={visualBackgroundBlurFeatherPx}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurFeatherPx(Number(event.target.value));
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Temporal smoothing ({visualBackgroundBlurTemporalSmoothing.toFixed(2)})</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={visualBackgroundBlurTemporalSmoothing}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                                setVisualBackgroundBlurTemporalSmoothing(Number(event.target.value));
                              }}
                            />
                          </label>
                        <div className="hammer-tool-hint">
                          Temporal smoothing stabilizes mask edges across moving frames and is most visible during playback.
                        </div>
                        <label className="hammer-tool-field">
                          <span>Quality</span>
                          <select
                            value={visualBackgroundBlurQualityMode}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurQualityMode(event.target.value as BackgroundBlurSettings["qualityMode"]);
                            }}
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </label>
                        <label className="hammer-tool-field">
                          <span>Fallback</span>
                          <select
                            value={visualBackgroundBlurFallbackMode}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurFallbackMode(event.target.value as BackgroundBlurSettings["fallbackMode"]);
                            }}
                          >
                            <option value="disable">Disable on degraded</option>
                            <option value="passthrough">Show passthrough</option>
                          </select>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualBackgroundBlurDebugMask}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundBlurDebugMask(event.target.checked);
                            }}
                          />
                          <span>Show mask thumbnails (debug)</span>
                        </label>
                        <label className="hammer-tool-check">
                          <input
                            type="checkbox"
                            checked={visualBackgroundMaskPreviewMode}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setVisualBackgroundMaskPreviewMode(event.target.checked);
                            }}
                          />
                          <span>Mask preview mode</span>
                        </label>
                        {visualBackgroundBlurDebugMask ? (
                          <>
                            <label className="hammer-tool-field">
                              <span>Subject expansion ({visualBackgroundBlurSubjectExpansionPx.toFixed(1)}px)</span>
                              <input
                                type="range"
                                min={-6}
                                max={6}
                                step={0.5}
                                value={visualBackgroundBlurSubjectExpansionPx}
                                onChange={(event) => {
                                  setFocusOverride("tool-focus");
                                  setVisualBackgroundBlurSubjectExpansionPx(Number(event.target.value));
                                }}
                              />
                            </label>
                            <label className="hammer-tool-field">
                              <span>Mask preview stage</span>
                              <select
                                value={visualBackgroundMaskPreviewStage}
                                onChange={(event) => {
                                  setFocusOverride("tool-focus");
                                  setVisualBackgroundMaskPreviewStage(event.target.value);
                                }}
                              >
                                <option value="raw">Raw</option>
                                <option value="expanded">Expanded/Contracted</option>
                                <option value="feathered">Feathered</option>
                                <option value="refined">Refined</option>
                                <option value="final_composite">Final Composite</option>
                              </select>
                            </label>
                          </>
                        ) : null}
                        <div className="hammer-tool-hint">
                          {visualBackgroundBlurStatusSummary ? (
                            visualBackgroundBlurStatusSummary.primaryLine
                          ) : (
                            "Segmentation status unavailable."
                          )}
                        </div>
                        {visualBackgroundBlurRuntimeStatus ? (
                          <div className="hammer-tool-hint hammer-background-blur-debug">
                            <div>
                              <strong>
                                mask: {visualBackgroundBlurRuntimeStatus.mask.status === "ok"
                                  ? "OK"
                                  : visualBackgroundBlurRuntimeStatus.mask.status}
                              </strong>
                              {visualBackgroundBlurRuntimeStatus.mask.reason
                                ? ` (${visualBackgroundBlurRuntimeStatus.mask.reason})`
                                : ""}
                            </div>
                            <div>
                              provider: {visualBackgroundBlurRuntimeStatus.mask.providerStatus} ({visualBackgroundBlurRuntimeStatus.mask.providerSource})
                            </div>
                            <div>
                              mask resolution: {visualBackgroundBlurRuntimeStatus.mask.resolution
                                ? `${visualBackgroundBlurRuntimeStatus.mask.resolution.width}x${visualBackgroundBlurRuntimeStatus.mask.resolution.height}`
                                : "n/a"}
                            </div>
                            <div>
                              confidence: {visualBackgroundBlurRuntimeStatus.mask.confidence == null
                                ? "n/a"
                                : visualBackgroundBlurRuntimeStatus.mask.confidence.toFixed(2)}
                              {" · "}
                              mask gen: {visualBackgroundBlurRuntimeStatus.mask.generationMs == null
                                ? "n/a"
                                : `${visualBackgroundBlurRuntimeStatus.mask.generationMs.toFixed(1)}ms`}
                            </div>
                            {visualBackgroundBlurRuntimeStatus.statusMessage ? (
                              <div>{visualBackgroundBlurRuntimeStatus.statusMessage}</div>
                            ) : null}
                          </div>
                        ) : null}
                        {visualBackgroundBlurDebugMask && visualBackgroundBlurRuntimeStatus ? (
                          <div className="hammer-tool-hint hammer-background-blur-debug">
                            {visualBackgroundBlurStatusSummary?.debugLine ? (
                              <div>{visualBackgroundBlurStatusSummary.debugLine}</div>
                            ) : null}
                            <div className="hammer-background-blur-debug__row">
                              <div className="hammer-background-blur-debug__card">
                                <strong>Raw Mask</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.rawMaskDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.rawMaskDataUrl}
                                    alt="Raw segmentation mask"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                              <div className="hammer-background-blur-debug__card">
                                <strong>Expanded/Contracted</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.expandedMaskDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.expandedMaskDataUrl}
                                    alt="Expanded or contracted segmentation mask"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                              <div className="hammer-background-blur-debug__card">
                                <strong>Feathered</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.featheredMaskDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.featheredMaskDataUrl}
                                    alt="Feathered segmentation mask"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                              <div className="hammer-background-blur-debug__card">
                                <strong>Refined Matte</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.refinedMaskDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.refinedMaskDataUrl}
                                    alt="Refined foreground matte"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                              <div className="hammer-background-blur-debug__card">
                                <strong>Final Composite</strong>
                                {visualBackgroundBlurRuntimeStatus.debug?.finalCompositeDataUrl ? (
                                  <img
                                    src={visualBackgroundBlurRuntimeStatus.debug.finalCompositeDataUrl}
                                    alt="Final background treatment composite"
                                    className="hammer-background-blur-debug__image"
                                  />
                                ) : (
                                  <span>Unavailable</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                      </details>
                    ) : null}
                    <div className="hammer-tool-hint">
                      White balance, color, background blur, and background replacement remain preview-only in Phase 1. Look Preset and Exposure carry into the export packet.
                    </div>
                  </section>
                ) : activeVisualTool === "images" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Image Placement</header>
                    <div className="hammer-tool-hint">
                      Direct manipulation mode. Drag and resize image clips in timeline or preview. Hold Shift while dragging to snap to 0.1s steps.
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
                        <div className="hammer-tool-hint">
                          Anchor segment: {selectedVisualAnchorSegmentId ?? "n/a"}
                          {` · matches ${selectedVisualClip?.anchor_hint.matched_segment_ids.length ?? 0}`}
                          {selectedVisualClip?.anchor_hint.detached ? " · detached" : " · attached"}
                        </div>
                        <label className="hammer-tool-field">
                          <span>Anchor Text</span>
                          <textarea
                            value={anchorTextDraft}
                            rows={3}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setAnchorTextDraft(event.target.value);
                            }}
                          />
                        </label>
                        <label className="hammer-tool-field">
                          <span>Anchor Label</span>
                          <input
                            value={anchorLabelDraft}
                            onChange={(event) => {
                              setFocusOverride("tool-focus");
                              setAnchorLabelDraft(event.target.value);
                            }}
                          />
                        </label>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => commitVisualAnchorRefinement({
                              clipId: selectedImagePlacement.id,
                              anchorText: anchorTextDraft,
                              anchorLabel: anchorLabelDraft,
                              detached: true,
                              label: "Refine visual anchor",
                            })}
                          >
                            Save Anchor
                          </button>
                          <button
                            type="button"
                            onClick={() => commitVisualAnchorRefinement({
                              clipId: selectedImagePlacement.id,
                              anchorText: selectedVisualAnchorSegment?.text ?? "",
                              anchorLabel: anchorLabelDraft,
                              detached: false,
                              label: "Reset visual anchor",
                            })}
                            disabled={!selectedVisualAnchorSegment}
                          >
                            Reset to Segment
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
                ) : activeVisualTool === "broll" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">B-roll</header>
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
                      {boundAttentionQueue.slice(0, 5).map((item: any) => (
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
                                (item: any) => item.assetPath && item.assetPath !== selectedBoundBrollInspectorState.assetRef,
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
                              const candidate = sourceBrollItems.find((item: any) => item.assetPath)?.assetPath ?? null;
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
              ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Unsupported Video Mode</header>
                  <div className="hammer-tool-hint">
                    Current visual tool does not have a panel route. Pass: {currentPass}
                  </div>
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
                      Captions follow Export Basis (Source Desk → Advanced), not the transcript editor view.
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
                        setCaptionFormatting((current: any) => ({
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
                        setCaptionFormatting((current: any) => ({ ...current, maxCharsPerLine: nextValue }));
                      }}
                    />
                  </label>
                  <label className="hammer-tool-field">
                    <span>Max lines per caption</span>
                    <select
                      value={captionFormatting.maxLinesPerCaption}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setCaptionFormatting((current: any) => ({
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
                        setCaptionFormatting((current: any) => ({
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
                        setCaptionFormatting((current: any) => ({
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
                        setCaptionFormatting((current: any) => ({
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
                          {activeCaptionState.chunks.slice(0, 12).map((chunk: any) => (
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
                      Packaging placement controls only. Choose intro/outro assets in Source Desk.
                    </div>
                    <div className="hammer-source-card__actions">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          applyIntroPlacement();
                        }}
                        disabled={!introStatusView.canApply}
                      >
                        {introStatusView.applyActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          removePackagingPlacement(PACKAGING_INTRO_ENTRY_ID, "Remove packaging intro");
                        }}
                        disabled={!introStatusView.canRemove}
                      >
                        {introStatusView.removeActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          applyOutroPlacement();
                        }}
                        disabled={!introOutroSelection.outro_asset_id || !introOutroSelectedOutroPath}
                      >
                        Apply Outro
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          removePackagingPlacement(PACKAGING_OUTRO_ENTRY_ID, "Remove packaging outro");
                        }}
                        disabled={!packagingOutroPlacement}
                      >
                        Remove Outro
                      </button>
                    </div>
                    <div className="hammer-tool-hint">
                      {introStatusView.selectionStatusLine} ·
                      {" "}Outro: {introOutroSelection.outro_asset_id
                        ? (introOutroSelectedOutroPath ? "selected" : "selected (unresolved)")
                        : "not selected"}
                    </div>
                    <div className="hammer-tool-hint">
                      {introStatusView.placementStatusLine} ·
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
                        {sourceImageLibraryItems.map((item: any) => (
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
                        {LOGO_POSITION_OPTIONS.map((option: any) => (
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
                        {LOGO_SIZE_OPTIONS.map((option: any) => (
                          <option key={`logo-size-${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="hammer-tool-hint">
                      Logo overlay: {packagingLogoPlacement ? "enabled (episode-wide)" : "disabled"}
                    </div>
                    <div className="hammer-tool-hint">
                      Thumbnails and visual prompts are generated in Hearth. Hammer only consumes existing assets from Tongs / workspace.
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
                        setFinishingChecklist((current: any) => ({
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
                        setFinishingChecklist((current: any) => ({
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
                        setFinishingChecklist((current: any) => ({
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
                      {readySummaryAreas.map((item: any) => (
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
                      {` · blockers ${readinessVerdict.counts.blocking} · review ${readinessVerdict.counts.review}`}
                    </div>
                    <div className="hammer-tool-hint">Export packet: {exportStatusLabel}</div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleSendToQuench();
                      }}
                      disabled={releasePrepSaving || releasePrepLoading || readinessVerdict.status === "blocked"}
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
                    {` · blockers ${readinessVerdict.counts.blocking} · review ${readinessVerdict.counts.review}`}
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
                  {readinessVerdict.blockingReasons.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Blocking reasons: {readinessVerdict.blockingReasons.slice(0, 3).map((reason: any) => reason.label).join(" ")}
                    </div>
                  ) : null}
                  {readinessVerdict.reviewReasons.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Review reasons: {readinessVerdict.reviewReasons.slice(0, 3).map((reason: any) => reason.label).join(" ")}
                    </div>
                  ) : null}
                  {(readinessVerdict.blockingReasons.length > 0 || readinessVerdict.reviewReasons.length > 0) ? (
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
                  <div className="hammer-tool-hint">Layer selection lives in Source Desk → Advanced.</div>
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
                    disabled={releasePrepSaving || releasePrepLoading || readinessVerdict.status === "blocked"}
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
                      {readinessVerdict.status === "ready" ? "Ready for Quench." : readinessVerdict.status === "blocked" ? "Prepared packet is blocked for handoff." : "Prepared packet needs review before handoff."}
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
                      {readinessVerdict.status === "blocked"
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
    </>
  );
}
