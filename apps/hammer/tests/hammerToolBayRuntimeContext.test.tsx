import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HammerTypedPassCompletionHeader, HammerTypedToolBayBody } from "../src/editor/HammerTypedToolBaySurfaces";
import { assembleHammerToolBayRuntimeContexts } from "../src/editor/hammerToolBayRuntimeContext";
import { HAMMER_TOOL_BAY_CONTEXT_SURFACES } from "../src/editor/hammerToolBayContext";
import type { HammerToolBayRouteDecision } from "../src/editor/hammerToolBayRouteDecision";

const resolved: Extract<HammerToolBayRouteDecision, { status: "resolved" }> = {
  status: "resolved", surface: "release_readiness", activeTool: "export", activeVisualTool: null, representativePass: "ready",
  editorMode: "transcript", source: "current_pass", navigationPermitted: false, selectionPreserved: true,
};
const unsupported: HammerToolBayRouteDecision = {
  status: "unsupported", reason: "surface_not_supported", selectedPlacementId: "placement:1",
  navigationPermitted: false, selectionPreserved: true,
};
const noop = (): void => undefined;

type InteractionCall = { command: string; args: unknown[] };

function instrumentCommands<T extends object>(commands: T, calls: InteractionCall[]): T {
  return new Proxy(commands, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls.push({ command: String(property), args });
        for (const arg of args) {
          if (typeof arg === "function") {
            try { arg({}); } catch { /* The command owns the authoritative updater input. */ }
          }
        }
        return undefined;
      };
    },
  });
}

function exerciseEnabledInteractions(node: ReactNode): number {
  let exercised = 0;
  const visit = (current: ReactNode): void => {
    if (current === null || current === undefined || typeof current === "boolean" || typeof current === "string" || typeof current === "number") return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!React.isValidElement(current)) return;
    const element = current as ReactElement<Record<string, unknown>>;
    if (typeof element.type === "function") {
      visit(element.type(element.props));
      return;
    }
    const props = element.props;
    if (!props.disabled) {
      const target = {
        value: element.type === "select" ? "medium" : "0.5",
        checked: true,
        files: [],
        dataset: {},
      };
      const event = { target, currentTarget: target, preventDefault() {}, stopPropagation() {} };
      for (const [name, handler] of Object.entries(props)) {
        if (/^on[A-Z]/.test(name) && typeof handler === "function") {
          handler(event);
          exercised += 1;
        }
      }
    }
    visit(props.children as ReactNode);
  };
  visit(node);
  return exercised;
}
const visualPolishData = {
  activeExposureAdjustment: null, activeLookPreset: null, backgroundBlurProviderDescriptor: null, segmentationProviderDescriptors: [],
  sourceImageLibraryItems: [], selectedBackgroundReplacementAssetId: null, uploadingCategory: null,
  visualWhiteBalance: 0, visualColorAmount: 0, visualEyeContactAssistEnabled: true, visualEyeContactAssistStrength: 0.25,
  visualBackgroundBlur: true, visualBackgroundBlurPx: 14, visualBackgroundBlurFeatherPx: 6, visualBackgroundBlurTemporalSmoothing: 0.25,
  visualBackgroundBlurSubjectExpansionPx: 0, visualBackgroundBlurQualityMode: "medium" as const, visualBackgroundBlurFallbackMode: "disable" as const,
  visualBackgroundReplaceEnabled: true, visualBackgroundReplaceMode: "solid" as const, visualBackgroundReplaceColor: "#2b2b2b",
  visualBackgroundReplaceImageUrl: "", visualBackgroundReplaceImageAssetPath: null, visualBackgroundWashEnabled: true,
  visualBackgroundWashDimAmount: 0.35, visualBackgroundWashDesaturateAmount: 0.25, visualBackgroundBlurDebugMask: true,
  visualBackgroundMaskPreviewMode: true, visualBackgroundMaskPreviewStage: "raw" as const, visualEyeContactAssistDebugOverlay: true,
  visualBackgroundBlurRuntimeStatus: null, visualEyeContactAssistRuntimeStatus: null, visualBackgroundBlurStatusSummary: null,
  visualEyeContactAssistStatusSummary: null,
};
const visualPolishCommands = {
  applyLookPresetSelection: noop, applyExposureAdjustment: noop, setVisualBackgroundBlur: noop, setVisualBackgroundBlurDebugMask: noop,
  setVisualBackgroundMaskPreviewMode: noop, setVisualBackgroundMaskPreviewStage: noop, setVisualBackgroundBlurFallbackMode: noop,
  setVisualBackgroundBlurFeatherPx: noop, setVisualBackgroundBlurSubjectExpansionPx: noop, setVisualBackgroundBlurProviderId: noop,
  setVisualBackgroundBlurPx: noop, setVisualBackgroundBlurQualityMode: noop, setVisualBackgroundBlurRuntimeStatus: noop,
  setVisualBackgroundBlurTemporalSmoothing: noop, setVisualBackgroundReplaceColor: noop, setVisualBackgroundReplaceEnabled: noop,
  setVisualBackgroundReplaceImageAssetPath: noop, setVisualBackgroundReplaceImageAssetId: noop, setVisualBackgroundReplaceImageUrl: noop, setVisualBackgroundReplaceMode: noop,
  setVisualBackgroundWashDesaturateAmount: noop, setVisualBackgroundWashDimAmount: noop, setVisualBackgroundWashEnabled: noop,
  setVisualColorAmount: noop, setVisualEyeContactAssistDebugOverlay: noop, setVisualEyeContactAssistEnabled: noop,
  setVisualEyeContactAssistRuntimeStatus: noop, setVisualEyeContactAssistStrength: noop, setVisualWhiteBalance: noop,
  setFocusOverride: noop, handleSourceDeskUpload: async (): Promise<void> => undefined,
};
const visualRuntimeArgs = {
  audioFinalizationData: null,
  audioAdjustmentsData: null,
  captionsData: null,
  metadataData: null,
  packagingData: null,
  finishingData: null,
  imageInspectorData: null,
  visualPolishData,
  brollReferenceData: null,
  selectedVisualContext: { status: "none" as const },
  visualPolishCommands,
  imageInspectorCommands: { focus() {}, previewAutoPosition: null, resetPreviewAutoPosition: null, setAnchorTextDraft() {}, setAnchorLabelDraft() {}, commitAnchor() {}, commitTiming() { return false; }, shiftTiming() {}, removePlacement() {}, updateTransformDraft() {}, commitTransform() { return false; } },
  brollCommands: { removePlacement: noop, addMinimalTransition: noop, navigateBoundAttention: noop, focusBoundAttentionOperation: noop, moveResolvedBrollBinding: noop, trimResolvedBrollBinding: noop, replaceResolvedBrollBinding: noop, revertResolvedBrollBinding: noop, resolveHearthBrollSuggestion: noop, discardHearthBrollSuggestion: noop, setTranscriptTimingHint: noop, setVideoSnapMode: noop, setFocusOverride: noop },
  referenceClipCommands: { removePlacement: noop, addMinimalTransition: noop, navigateBoundAttention: noop, focusBoundAttentionOperation: noop, moveResolvedBrollBinding: noop, trimResolvedBrollBinding: noop, replaceResolvedBrollBinding: noop, revertResolvedBrollBinding: noop, resolveHearthBrollSuggestion: noop, discardHearthBrollSuggestion: noop, setTranscriptTimingHint: noop, setVideoSnapMode: noop, setFocusOverride: noop },
};

function inspectorData(selectedVisual: { placementId: string; clipId: string; assetId: string | null; laneId: string; kind: "image" | "broll"; capabilities: object }) {
  return {
    selectedVisual, placementId: selectedVisual.placementId,
    placement: { id: selectedVisual.placementId, label: "Florida", kind: selectedVisual.kind, anchorSegmentId: "segment:1", anchorText: null, anchorLabel: null, startSec: 1, endSec: 3, status: "placed", confidence: 1, visualMode: selectedVisual.kind, assetPath: "/florida.png", firstVisibleEditableSec: 1, anchorStatus: "anchored" },
    transform: { leftPct: 10, topPct: 10, widthPct: 22, heightPct: 16 },
    selectedClip: { clip_id: selectedVisual.clipId, asset_id: selectedVisual.assetId, lane_id: selectedVisual.laneId, anchor_hint: { matched_segment_ids: [], detached: false } },
    selectedAnchorSegment: null, selectedAnchorSegmentId: null, anchorTextDraft: "", anchorLabelDraft: "", autoPlacementDebugEnabled: false, selectedAutoPreviewActive: false, previewAutoPositionStatus: null,
    previewDiagnostics: { diagnosticsEnabled: false, resolvedPlacementExists: false, diagnosticsResolvedPlacement: false, candidateCount: 0, maskBoundsCount: 0, currentFrameAvailable: false, segmentationMaskAvailable: false, resolverStatus: "disabled", resolverReason: "diagnostics disabled", selectedScale: null, scaleAttempts: [] },
    episodeHealth: { workspaceId: null, workpieceId: null, episodeId: null, recordingPath: null, playbackMediaPath: null, playbackMediaReady: false, visualPlacementsCount: 1, anchorCount: 0, selectedPlacementId: selectedVisual.placementId, selectedClipId: selectedVisual.clipId, selectedAssetId: selectedVisual.assetId, selectedOverlayAssetId: "/florida.png", frameInputAvailable: false, maskBoundsCount: 0, candidateCount: 0, selectedScale: null, resolvedPlacement: false, resolverStatus: "disabled", resolverReason: "diagnostics disabled", diagnosticsEnabled: false, diagnosticsState: "disabled" },
  };
}

function brollReferenceData(selectedVisual: { placementId: string; clipId: string; assetId: string | null; laneId: string; kind: "broll" | "reference_clip"; capabilities: object }) {
  return {
    selectedVisual, placementId: selectedVisual.placementId,
    placement: { id: selectedVisual.placementId, kind: selectedVisual.kind, label: "Florida mounted B-roll", startSec: 1, endSec: 3 },
    selectedClip: { clip_id: selectedVisual.clipId, asset_id: selectedVisual.assetId, lane_id: selectedVisual.laneId },
    placedVisualCount: 1, resolvedBrollBindingItems: [], unresolvedBrollSuggestionItems: [], boundAttentionQueue: [],
    boundAttentionSummary: { total: 0, unresolvedCount: 0, degradedCount: 0, supersededCount: 0, transitionCount: 0 },
    selectedBoundBrollInspectorState: null, selectedBoundBrollOperationId: null, selectedTransitionBoundObject: null,
    sourceBrollItems: [], videoSnapMode: "timeline" as const,
  };
}

function fixture(route: HammerToolBayRouteDecision = resolved, currentPass: "ready" | "packaging" = "ready", missingDataSurface: "audio_finalization" | "audio_adjustments" | "captions" | "metadata" | "transcript_cleanup" | "retakes" | "gap_pacing" | "transcript_polish" | "visual_polish" | "packaging" | "finishing" | null = null) {
  const activity = { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 };
  const markPassComplete = (): void => { activity.completion += 1; };
  const focusIssue = (): void => { activity.focus += 1; };
  const sendToQuench = (): void => { activity.send += 1; };
  const exactRoute = currentPass === "packaging" && route.status === "resolved" ? { ...route, surface: "export" as const } : route;
  const typedFixtureData = {
    activeCaptionArtifactText: "", activeCaptionMode: "built", activeCaptionState: null,
    captionActiveModeLabel: "Built", captionActiveModeSourceLabel: "Canonical transcript", captionArtifactStatusLabel: "Not built", captionBuildFeedback: null, captionBuildFreshness: "Current", captionBuildState: null, captionBuiltSummary: "No built captions", captionBuiltTone: "neutral", captionDiscardConsequenceLabel: null, captionEditedBasisDetail: "", captionEditedChangeSummary: "", captionEditedState: null, captionEditedSummary: "No caption edits", captionEditedTone: "neutral", captionEditorRefs: { current: new Map() }, captionFormatting: { style: "sentence", maxCharsPerLine: 42, maxLinesPerCaption: 2, includeSpeakerLabels: false, punctuationMode: "preserve", readingSpeed: "standard" }, captionRebuildConsequenceLabel: "", captionReleasePrepSafetyDetail: "", captionReleasePrepSafetyLabel: "Safe", captionReleasePrepSafetyState: "safe", captionReleaseSourceLabel: "Canonical transcript", captionSourceLabel: "Canonical transcript", detailTag: "", selectedCaptionArtifactFormat: "srt",
    handleDiscardEditedCaptions: noop, handleEditCaptionChunkText: noop, handleEnableCaptionEdits: noop, handleMergeEditedCaptionChunk: noop, handleNormalizeEditedCaptionChunkPunctuation: noop, handleRebuildCaptionArtifacts: noop, handleSplitEditedCaptionChunk: noop, handleToggleEditedCaptionChunkSpeakerLabel: noop, setActiveCaptionArtifactMode: noop, setCaptionFormatting: noop, setSelectedCaptionArtifactFormat: noop, setDetailTag: noop,
    voicePolish: { preset_id: null, voice_cleanup_enabled: true, fixes: { remove_harsh_sibilance: true, reduce_room_boxiness: true, enhance_voice_clarity: true, level_volume: true }, advanced: { de_esser_strength: "medium", eq_profile: "voice" } },
    audioFinalizationCompareMode: "after", editableAudioPolish: { status: "not_started" }, persistedAudioCutCount: 0, effectivePlaybackCutRegions: [], silenceSuggestionCount: 0,
    editableStudioRack: { is_enabled: true, is_bypassed: false, backend_preference: "native", modules: { gate: { is_enabled: true, is_bypassed: false, threshold_db: -52 }, compressor: { is_enabled: true, is_bypassed: false, ratio: 1.8 }, eq: { is_enabled: true, is_bypassed: false, mid_gain_db: 1.2 }, reverb: { is_enabled: true, is_bypassed: false, mix: 0.06 }, tubeMicCharacter: { is_enabled: true, is_bypassed: false, amount: 0.16 } } },
    studioRackPlaybackConfig: { backend: "native" }, studioRackPlaybackBackendResolution: { status: "available" }, studioRackRenderConfig: { backend: "native" }, studioRackRenderBackendResolution: { status: "available" }, studioRackRenderStatus: null, studioRackRenderAppliedModules: [], studioRackRenderDeferredModules: [], studioRackEnabledModuleCount: 5, studioRackComparePreviewStatusLabel: null, studioRackOpen: true,
    podcastMasterLayer: null, podcastMasterUiStatus: { headline: "Not applied", detail: "", action_label: "Apply Podcast Master" }, audioLevelingEnabled: false, audioNoiseReductionEnabled: false,
    applyPodcastMasterPass: noop, applyStudioRackMutation: noop, setAudioLevelingEnabled: noop, setAudioNoiseReductionEnabled: noop, setStudioRackBackend: noop, setStudioRackBypassed: noop, setStudioRackEnabled: noop, setStudioRackModuleBypassed: noop, setStudioRackModuleEnabled: noop, setStudioRackOpen: noop, setFocusOverride: noop, setAudioFinalizationCompare: noop, applyVoicePolishPreset: noop, setVoicePolishFixEnabled: noop, setVoicePolishDeEsserStrength: noop, setVoicePolishEqProfile: noop, setVoiceCleanupEnabled: noop,
    hasSilenceSuggestionAnalysis: false, silenceCutSuggestions: null, visibleSilenceCutSuggestions: [], acceptSilenceCutSuggestion: noop, dismissSilenceCutSuggestion: noop, seekPlayheadToTime: null, silenceSuggestionCount: 0,
    activeReviewKind: "fillers", setActiveReviewKind: noop, setActiveTranscriptToolSection: noop, refreshCleanupCandidateQueue: noop, fillerCleanupOptions: { aggressiveness: "medium", protectIntentionalPhrasing: true }, setFillerCleanupOptions: noop, activeFillerCandidateCard: null, fillerActiveCandidateIndex: 0, fillerCandidateCards: [], activeFillerCandidateDiffOps: null, candidateReceiptByKind: { fillers: null, retakes: null }, candidateProposedRemovalById: {}, selectedTranscriptRange: null, updateCandidateProposedRemoval: noop, fillerDecisionInFlight: false, handleCandidateDecision: noop,
    retakeCleanupOptions: { detection: "normal", preferLaterCleanerTake: true, honorExplicitRetakePhrases: true, sameSpeakerOnly: true }, setRetakeCleanupOptions: noop, activeRetakeCandidateCard: null, retakeActiveCandidateIndex: 0, retakeCandidateCards: [], retakeDecisionInFlight: false,
    deadAirThresholdSec: 1, setDeadAirThresholdSec: noop, analyzeDeadAirClosure: noop, deadAirApplyInFlight: false, deadAirAnalysis: null, applyDeadAirClosureBatch: noop, polishStrength: 50, setPolishStrength: noop, gapCleanupOptions: { maxGapSec: 0.4, minPauseSec: 0.2, preserveDramaticPauses: true }, setGapCleanupOptions: noop, setCleanupPreview: noop, previewShortenGaps: noop, previewRemoveFillers: noop, previewRemoveRetakes: noop, previewQuickClean: noop, editableTranscriptSegments: [],
    speakerSoloOptions: { targetSpeaker: "", collapseInterruptions: false, compressGaps: false, maxInterruptionSec: 0.8 }, setSpeakerSoloOptions: noop, speakerOptions: [], previewSpeakerSolo: noop, hasTranscriptSelection: false, transcriptSelectionRange: { segmentIds: [] }, speakerInterviewOptions: { hostSpeaker: "", respondentSpeaker: "", tightness: "medium", removeBackchannels: false, collapseInterruptions: false, maxInterruptionSec: 0.8 }, setSpeakerInterviewOptions: noop, previewSpeakerInterview: noop, speakerMonologueOptions: { targetSpeaker: "", removeBackchannels: false, suppressInterruptions: false, maxInterruptionSec: 0.8, tightenTargetRuns: false, compressGaps: false }, setSpeakerMonologueOptions: noop, previewSpeakerMonologue: noop, speakerPanelOptions: { hostSpeaker: "", primarySpeakerBias: "none", removeShortBackchannels: false, suppressShortCrossTalk: false, maxInterruptionSec: 0.8 }, setSpeakerPanelOptions: noop, previewSpeakerPanel: noop, cleanupPreview: null, cleanupPreviewSummary: null, applyCleanup: noop, cleanupReceipt: null,
    introOutroSelectedIntroPath: null, introOutroSelectedOutroPath: null, introOutroSelection: { intro_asset_id: null, outro_asset_id: null }, packagingIntroPlacement: null, packagingOutroPlacement: null, packagingLogoAssetPath: null, packagingLogoPlacement: null, packagingLogoPosition: "top_right", packagingLogoSize: "medium", sourceImageLibraryItems: [], LOGO_POSITION_OPTIONS: [], LOGO_SIZE_OPTIONS: [], PACKAGING_INTRO_ENTRY_ID: "packaging:intro", PACKAGING_OUTRO_ENTRY_ID: "packaging:outro", applyIntroPlacement: noop, applyOutroPlacement: noop, removePackagingPlacement: noop, applyLogoOverlayStyle: noop, toggleLogoOverlay: noop, finishingChecklist: { transcriptReviewed: false, visualsReviewed: false, audioReviewed: false }, setFinishingChecklist: noop,
    SEGMENTATION_PROVIDER_DESCRIPTORS: [], activeLookPreset: null, activeExposureAdjustment: null, backgroundBlurProviderDescriptor: null,
  };
  const audioFinalizationCommands = { setVoiceCleanupEnabled: noop, setVoiceFixEnabled: noop, applyVoicePreset: noop, setCompareMode: noop, setDeEsserStrength: noop, setEqProfile: noop };
  const audioAdjustmentCommands = { focusTool: noop, applyPodcastMaster: noop, toggleRack: noop, setRackEnabled: noop, setRackBypassed: noop, setRackBackend: noop, setModuleEnabled: noop, setModuleBypassed: noop, applyRackMutation: noop, setLevelingEnabled: noop, setNoiseReductionEnabled: noop };
  const captionCommands = { focusTool: noop, buildCaptions: noop, enableEdits: noop, selectMode: noop, discardEdits: noop, updateFormatting: noop, selectArtifactFormat: noop, editCaption: noop, splitCaption: noop, mergeCaption: noop, normalizePunctuation: noop, toggleSpeakerLabel: noop };
  const metadataCommands = { focusTool: noop, setTag: noop };
  const transcriptReviewCommands = { setActiveReviewKind: noop, updateCandidateProposedRemoval: noop, handleCandidateDecision: noop, acceptSilenceCutSuggestion: noop, dismissSilenceCutSuggestion: noop, setDeadAirThresholdSec: noop, analyzeDeadAirClosure: noop, applyDeadAirClosureBatch: noop, setFillerCleanupOptions: noop, setRetakeCleanupOptions: noop, setFocusOverride: noop, setActiveTranscriptToolSection: noop, refreshCleanupCandidateQueue: noop, seekPlayheadToTime: null };
  const transcriptCleanupCommands = transcriptReviewCommands;
  const retakeCommands = transcriptReviewCommands;
  const gapCommands = transcriptReviewCommands;
  const transcriptPolishCommands = { setGapCleanupOptions: noop, setFillerCleanupOptions: noop, setRetakeCleanupOptions: noop, setSpeakerSoloOptions: noop, setSpeakerInterviewOptions: noop, setSpeakerMonologueOptions: noop, setSpeakerPanelOptions: noop, setCleanupPreview: noop, applyCleanup: noop, previewQuickClean: noop, previewRemoveFillers: noop, previewRemoveRetakes: noop, previewShortenGaps: noop, previewSpeakerInterview: noop, previewSpeakerMonologue: noop, previewSpeakerPanel: noop, previewSpeakerSolo: noop, setFocusOverride: noop, setPolishStrength: noop };
  const packagingCommands = { focusTool: noop, applyIntro: noop, applyOutro: noop, removePlacement: noop, updateLogoStyle: noop, toggleLogo: noop };
  const finishingCommands = { focusTool: noop, setReviewFlag: noop };
  const contexts = assembleHammerToolBayRuntimeContexts({
    ...visualRuntimeArgs, route: exactRoute, passLabel: "Ready", passStatus: "in_progress",
    audioFinalizationData: missingDataSurface === "audio_finalization" ? null : { compareMode: typedFixtureData.audioFinalizationCompareMode, voicePolish: typedFixtureData.voicePolish },
    audioAdjustmentsData: missingDataSurface === "audio_adjustments" ? null : { editableAudioPolish: typedFixtureData.editableAudioPolish, persistedAudioCutCount: typedFixtureData.persistedAudioCutCount, effectivePlaybackCutRegions: typedFixtureData.effectivePlaybackCutRegions, silenceSuggestionCount: typedFixtureData.silenceSuggestionCount, editableStudioRack: typedFixtureData.editableStudioRack, studioRackPlaybackConfig: typedFixtureData.studioRackPlaybackConfig, studioRackPlaybackBackendResolution: typedFixtureData.studioRackPlaybackBackendResolution, studioRackRenderConfig: typedFixtureData.studioRackRenderConfig, studioRackRenderBackendResolution: typedFixtureData.studioRackRenderBackendResolution, studioRackRenderStatus: typedFixtureData.studioRackRenderStatus, studioRackRenderAppliedModules: typedFixtureData.studioRackRenderAppliedModules, studioRackRenderDeferredModules: typedFixtureData.studioRackRenderDeferredModules, studioRackEnabledModuleCount: typedFixtureData.studioRackEnabledModuleCount, studioRackComparePreviewStatusLabel: typedFixtureData.studioRackComparePreviewStatusLabel, studioRackOpen: typedFixtureData.studioRackOpen, podcastMasterLayer: typedFixtureData.podcastMasterLayer, podcastMasterUiStatus: typedFixtureData.podcastMasterUiStatus, audioLevelingEnabled: typedFixtureData.audioLevelingEnabled, audioNoiseReductionEnabled: typedFixtureData.audioNoiseReductionEnabled },
    captionsData: missingDataSurface === "captions" ? null : { activeCaptionArtifactText: typedFixtureData.activeCaptionArtifactText, activeCaptionMode: typedFixtureData.activeCaptionMode, activeCaptionState: typedFixtureData.activeCaptionState, captionActiveModeLabel: typedFixtureData.captionActiveModeLabel, captionActiveModeSourceLabel: typedFixtureData.captionActiveModeSourceLabel, captionArtifactStatusLabel: typedFixtureData.captionArtifactStatusLabel, captionBuildFeedback: typedFixtureData.captionBuildFeedback, captionBuildFreshness: typedFixtureData.captionBuildFreshness, captionBuildState: typedFixtureData.captionBuildState, captionBuiltSummary: typedFixtureData.captionBuiltSummary, captionBuiltTone: typedFixtureData.captionBuiltTone, captionDiscardConsequenceLabel: typedFixtureData.captionDiscardConsequenceLabel, captionEditedBasisDetail: typedFixtureData.captionEditedBasisDetail, captionEditedChangeSummary: typedFixtureData.captionEditedChangeSummary, captionEditedState: typedFixtureData.captionEditedState, captionEditedSummary: typedFixtureData.captionEditedSummary, captionEditedTone: typedFixtureData.captionEditedTone, captionEditorRefs: typedFixtureData.captionEditorRefs, captionFormatting: typedFixtureData.captionFormatting, captionRebuildConsequenceLabel: typedFixtureData.captionRebuildConsequenceLabel, captionReleasePrepSafetyDetail: typedFixtureData.captionReleasePrepSafetyDetail, captionReleasePrepSafetyLabel: typedFixtureData.captionReleasePrepSafetyLabel, captionReleasePrepSafetyState: typedFixtureData.captionReleasePrepSafetyState, captionReleaseSourceLabel: typedFixtureData.captionReleaseSourceLabel, captionSourceLabel: typedFixtureData.captionSourceLabel, selectedCaptionArtifactFormat: typedFixtureData.selectedCaptionArtifactFormat },
    metadataData: missingDataSurface === "metadata" ? null : { detailTag: typedFixtureData.detailTag },
    transcriptReviewData: missingDataSurface === "transcript_cleanup" || missingDataSurface === "retakes" || missingDataSurface === "gap_pacing" ? null : { activeReviewKind: typedFixtureData.activeReviewKind, fillerCandidateCards: typedFixtureData.fillerCandidateCards, fillerActiveCandidateIndex: typedFixtureData.fillerActiveCandidateIndex, fillerDecisionInFlight: typedFixtureData.fillerDecisionInFlight, retakeCandidateCards: typedFixtureData.retakeCandidateCards, retakeActiveCandidateIndex: typedFixtureData.retakeActiveCandidateIndex, retakeDecisionInFlight: typedFixtureData.retakeDecisionInFlight, candidateReceiptByKind: typedFixtureData.candidateReceiptByKind, candidateProposedRemovalById: typedFixtureData.candidateProposedRemovalById, activeFillerCandidateCard: typedFixtureData.activeFillerCandidateCard, activeRetakeCandidateCard: typedFixtureData.activeRetakeCandidateCard, hasSilenceSuggestionAnalysis: typedFixtureData.hasSilenceSuggestionAnalysis, silenceCutSuggestions: typedFixtureData.silenceCutSuggestions, visibleSilenceCutSuggestions: typedFixtureData.visibleSilenceCutSuggestions, deadAirThresholdSec: typedFixtureData.deadAirThresholdSec, deadAirAnalysis: typedFixtureData.deadAirAnalysis, deadAirApplyInFlight: typedFixtureData.deadAirApplyInFlight, fillerCleanupOptions: typedFixtureData.fillerCleanupOptions, retakeCleanupOptions: typedFixtureData.retakeCleanupOptions, silenceSuggestionCount: typedFixtureData.silenceSuggestionCount, activeFillerCandidateDiffOps: typedFixtureData.activeFillerCandidateDiffOps, selectedTranscriptRange: typedFixtureData.selectedTranscriptRange },
    transcriptPolishData: missingDataSurface === "transcript_polish" ? null : { gapCleanupOptions: typedFixtureData.gapCleanupOptions, fillerCleanupOptions: typedFixtureData.fillerCleanupOptions, retakeCleanupOptions: typedFixtureData.retakeCleanupOptions, speakerSoloOptions: typedFixtureData.speakerSoloOptions, speakerInterviewOptions: typedFixtureData.speakerInterviewOptions, speakerMonologueOptions: typedFixtureData.speakerMonologueOptions, speakerPanelOptions: typedFixtureData.speakerPanelOptions, cleanupPreview: typedFixtureData.cleanupPreview, cleanupPreviewSummary: typedFixtureData.cleanupPreviewSummary, cleanupReceipt: typedFixtureData.cleanupReceipt, editableTranscriptSegments: typedFixtureData.editableTranscriptSegments, speakerOptions: typedFixtureData.speakerOptions, hasTranscriptSelection: typedFixtureData.hasTranscriptSelection, transcriptSelectionRange: typedFixtureData.transcriptSelectionRange, polishStrength: typedFixtureData.polishStrength },
    packagingData: missingDataSurface === "packaging" ? null : { selectedIntroPath: null, selectedOutroPath: null, selectedIntroAssetId: null, selectedOutroAssetId: null, introPlaced: false, outroPlaced: false, logoAssetPath: null, logoPlaced: false, logoPosition: "top_right", logoSize: "medium", sourceImageLibraryItems: [], logoPositionOptions: [], logoSizeOptions: [], introEntryId: "packaging:intro", outroEntryId: "packaging:outro" },
    finishingData: missingDataSurface === "finishing" ? null : { checklist: typedFixtureData.finishingChecklist },
    visualPolishData: missingDataSurface === "visual_polish" ? null : visualPolishData,
    readinessData: {
      summaryAreas: [{ id: "audio", label: "Audio Finalization", status: "complete" }],
      readinessLabel: "Ready for export", blockerCount: 0, reviewCount: 0,
      exportStatusLabel: "Current", sending: false, loading: false, blocked: false,
      sendLabel: "Send to Quench", handoffStatus: null,
    },
    exportData: {
      handoffAvailable: true, openHref: "/quench", exportStatusLabel: "Current",
      readinessLabel: "Ready for export", readinessStatus: "ready", blockerCount: 0, reviewCount: 0,
      outputSelectionSummary: "Raw transcript", previewTruthPosture: "authoritative",
      exportTruthPosture: "authoritative", handoffTruthPosture: "authoritative", unresolvedBrollCount: 0,
      blockingReasons: [], reviewReasons: [], captionSafetyState: "safe", captionSafetyLabel: "Safe",
      captionSummaryLine: "Current", captionSourceLabel: "canonical", captionSafetyDetail: "Ready",
      renderStatus: null, loading: false, sending: false, sendLabel: "Send to Quench",
      preparedPackage: null, exportTruthState: "current", staleReasons: [], handoffStatus: null,
      savedPackage: null, error: null,
    },
    markPassComplete, focusIssue, sendToQuench,
    audioFinalizationCommands, audioAdjustmentCommands, captionCommands, metadataCommands, transcriptReviewCommands, transcriptPolishCommands, packagingCommands, finishingCommands,
  });
  return { contexts, activity, commands: { markPassComplete, focusIssue, sendToQuench, audioFinalizationCommands, audioAdjustmentCommands, captionCommands, metadataCommands, transcriptCleanupCommands, retakeCommands, gapCommands, transcriptPolishCommands, visualPolishCommands, packagingCommands, finishingCommands } };
}

test("runtime assembly covers all twenty-one contexts and preserves callback identity with zero activity", () => {
  assert.equal(HAMMER_TOOL_BAY_CONTEXT_SURFACES.length + 1, 21);
  const { contexts, activity, commands } = fixture();
  assert.equal(contexts.completion?.commands.markPassComplete, commands.markPassComplete);
  assert.equal(contexts.body?.surface, "release_readiness");
  if (contexts.body?.surface !== "release_readiness") assert.fail();
  assert.equal(contexts.body.commands.focusIssue, commands.focusIssue);
  assert.equal(contexts.body.commands.sendToQuench, commands.sendToQuench);
  assert.deepEqual(activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
});

test("readiness, export, and unsupported mount only typed markup and remain stable across rerenders", () => {
  const readiness = fixture();
  const exportFixture = fixture(resolved, "packaging");
  const unsupportedFixture = fixture(unsupported);
  const cases = [readiness, exportFixture, unsupportedFixture];
  const expected = ["release_readiness", "export", "unsupported"];
  for (let index = 0; index < cases.length; index += 1) {
    const body = cases[index].contexts.body;
    assert.ok(body);
    const first = renderToStaticMarkup(<HammerTypedToolBayBody context={body} />);
    const second = renderToStaticMarkup(<HammerTypedToolBayBody context={body} />);
    assert.equal(first, second);
    assert.match(first, new RegExp(`data-hammer-tool-bay-surface="${expected[index]}"`));
    assert.doesNotMatch(first, /hammer-visual-tool-selector|Transcript Cleanup/);
    assert.deepEqual(cases[index].activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
  }
});

test("missing typed data fails closed and never produces an alternate body", () => {
  const base = fixture();
  const failed = assembleHammerToolBayRuntimeContexts({
    ...visualRuntimeArgs, route: resolved, passLabel: "Ready", passStatus: "in_progress",
    markPassComplete: base.commands.markPassComplete, readinessData: null, exportData: null,
    focusIssue: base.commands.focusIssue, sendToQuench: base.commands.sendToQuench, audioCommands: { updateVoicePreset() {}, toggleCompare() {}, applyPodcastMaster() {} }, captionCommands: { buildCaptions() {}, discardEdits() {}, editCaption() {}, splitCaption() {}, mergeCaption() {} }, metadataCommands: { setTags() {} }, transcriptCleanupCommands: { refreshCandidates() {}, previewCandidate() {}, acceptCandidate() {}, dismissCandidate() {}, applyCleanup() {}, discardCleanup() {} }, retakeCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, gapCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, transcriptPolishCommands: { previewCleanup() {}, applyCleanup() {}, discardCleanup() {} }, packagingCommands: { applyIntro() {}, removeIntro() {}, applyOutro() {}, removeOutro() {}, updateLogo() {} }, finishingCommands: { setReviewFlag() {} },
  });
  assert.equal(failed.body?.surface, "unsupported");
  if (failed.body?.surface !== "unsupported") assert.fail();
  assert.equal(failed.body.data.reason, "required_data_missing");
  assert.deepEqual(Object.keys(failed.body.commands), []);
});

test("missing typed surface data fails closed without legacy fallback", () => {
  for (const surface of ["audio_finalization", "audio_adjustments", "captions", "metadata", "transcript_cleanup", "retakes", "gap_pacing", "transcript_polish", "visual_polish", "packaging", "finishing"] as const) {
    const item = fixture({ ...resolved, surface }, "ready", surface);
    assert.equal(item.contexts.body?.surface, "unsupported");
    if (item.contexts.body?.surface === "unsupported") assert.equal(item.contexts.body.data.reason, "required_data_missing");
    assert.deepEqual(item.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
  }
});

test("all eleven extracted surfaces preserve exact dispatch, representative accessibility, command identity, and passive behavior", () => {
  const cases = [
    ["audio_finalization", "Audio Finalization", "audioFinalizationCommands"],
    ["audio_adjustments", "Audio Adjustments", "audioAdjustmentCommands"],
    ["captions", "Caption Output", "captionCommands"],
    ["metadata", "Edit Metadata", "metadataCommands"],
    ["transcript_cleanup", "Transcript Cleanup", "transcriptCleanupCommands"],
    ["retakes", "Transcript Cleanup", "retakeCommands"],
    ["gap_pacing", "Transcript Cleanup", "gapCommands"],
    ["transcript_polish", "Transcript Polish", "transcriptPolishCommands"],
    ["visual_polish", "Visual Polish", "visualPolishCommands"],
    ["packaging", "Packaging", "packagingCommands"],
    ["finishing", "Finishing Checklist", "finishingCommands"],
  ] as const;
  for (const [surface, accessibleText, commandKey] of cases) {
    const item = fixture({ ...resolved, surface });
    const body = item.contexts.body;
    assert.ok(body);
    assert.equal(body.surface, surface);
    const first = renderToStaticMarkup(<HammerTypedToolBayBody context={body} />);
    const second = renderToStaticMarkup(<HammerTypedToolBayBody context={body} />);
    assert.equal(first, second);
    assert.match(first, new RegExp(`data-hammer-tool-bay-surface="${surface}"`));
    assert.match(first, new RegExp(accessibleText));
    assert.equal(body.commands, item.commands[commandKey]);
    assert.deepEqual(item.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
  }
});

test("enabled typed-surface interactions dispatch through their canonical command contracts", () => {
  const surfaces = [
    "audio_finalization", "audio_adjustments", "captions", "metadata",
    "transcript_cleanup", "retakes", "gap_pacing", "transcript_polish",
    "visual_polish", "packaging", "finishing",
  ] as const;
  let interactionCount = 0;
  let commandCount = 0;
  for (const surface of surfaces) {
    const item = fixture({ ...resolved, surface });
    const body = item.contexts.body;
    assert.ok(body && body.surface === surface);
    const calls: InteractionCall[] = [];
    const instrumented = { ...body, commands: instrumentCommands(body.commands, calls) } as typeof body;
    interactionCount += exerciseEnabledInteractions(<HammerTypedToolBayBody context={instrumented} />);
    commandCount += calls.length;
    assert.ok(calls.length > 0, `${surface} must route at least one enabled interaction through its command contract`);
  }
  assert.ok(interactionCount >= 80, `expected broad interaction coverage, received ${interactionCount}`);
  assert.ok(commandCount >= 60, `expected canonical command dispatch, received ${commandCount}`);
});

test("typed audio surfaces preserve finalization, measurement, backend, readiness, and cross-family transition markup without activity", () => {
  const sequence = ["audio_finalization", "audio_adjustments", "captions", "transcript_cleanup", "audio_finalization"] as const;
  for (const surface of sequence) {
    const item = fixture({ ...resolved, surface });
    assert.ok(item.contexts.body);
    const markup = renderToStaticMarkup(<HammerTypedToolBayBody context={item.contexts.body} />);
    assert.match(markup, new RegExp(`data-hammer-tool-bay-surface="${surface}"`));
    if (surface === "audio_finalization") {
      assert.match(markup, /Voice Cleanup/);
      assert.match(markup, /Before/);
      assert.match(markup, /After/);
    }
    if (surface === "audio_adjustments") {
      assert.match(markup, /Current prep status: not_started/);
      assert.match(markup, /Persisted cut ops: 0 raw · 0 effective playback regions/);
      assert.match(markup, /Playback lane: native \(available\)/);
      assert.match(markup, /Render lane: native \(available\)/);
      assert.match(markup, /Podcast Master: not declared/);
    }
    assert.deepEqual(item.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
  }
});

test("typed surface switching is deterministic and mount-safe", () => {
  const legacyRoute: HammerToolBayRouteDecision = { ...resolved, surface: "audio_finalization", activeTool: "audio", representativePass: "audio_finalization", editorMode: "assets" };
  const sequence = [fixture().contexts, fixture(resolved, "packaging").contexts, fixture(legacyRoute).contexts, fixture().contexts, fixture(unsupported).contexts];
  assert.deepEqual(sequence.map((item) => item.body?.surface ?? "legacy"), ["release_readiness", "export", "audio_finalization", "release_readiness", "unsupported"]);
  for (const item of sequence) {
    if (item.completion) renderToStaticMarkup(<HammerTypedPassCompletionHeader context={item.completion} />);
    if (item.body) renderToStaticMarkup(<HammerTypedToolBayBody context={item.body} />);
  }
});

test("all exact transcript surfaces mount typed markup without construction or render activity", () => {
  const surfaces = ["transcript_cleanup", "retakes", "gap_pacing", "transcript_polish"] as const;
  for (const surface of surfaces) {
    const route: HammerToolBayRouteDecision = { ...resolved, surface, activeTool: "polish", representativePass: surface === "transcript_polish" ? "transcript_cleanup" : surface, editorMode: "transcript" };
    const item = fixture(route);
    assert.equal(item.contexts.body?.surface, surface);
    assert.ok(item.contexts.body);
    const markup = renderToStaticMarkup(<HammerTypedToolBayBody context={item.contexts.body} />);
    assert.match(markup, new RegExp(`data-hammer-tool-bay-surface="${surface}"`));
    assert.doesNotMatch(markup, />\s*\+\s*</);
    assert.deepEqual(item.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
  }
});

test("three transcript review routes retain exact surface identity over one stable composite workspace", () => {
  const surfaces = ["transcript_cleanup", "retakes", "gap_pacing"] as const;
  const rendered = surfaces.map((surface) => {
    const item = fixture({ ...resolved, surface, activeTool: "polish", representativePass: surface, editorMode: "transcript" });
    assert.ok(item.contexts.body && item.contexts.body.surface !== "unsupported");
    assert.equal(item.contexts.body.commands, item.commands.transcriptCleanupCommands);
    const markup = renderToStaticMarkup(<HammerTypedToolBayBody context={item.contexts.body} />);
    assert.match(markup, /Filler Cleanup/);
    assert.match(markup, /Retake Review/);
    assert.match(markup, /Silence Gaps/);
    assert.deepEqual(item.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
    return markup.replace(`data-hammer-tool-bay-surface="${surface}"`, "data-hammer-tool-bay-surface=\"review\"");
  });
  assert.equal(rendered[0], rendered[1]);
  assert.equal(rendered[1], rendered[2]);
});

test("packaging and finishing mount exact typed surfaces with zero passive activity", () => {
  for (const surface of ["packaging", "finishing"] as const) {
    const route: HammerToolBayRouteDecision = { ...resolved, surface, activeTool: "finishing", representativePass: surface, editorMode: "assets" };
    const item = fixture(route);
    assert.equal(item.contexts.body?.surface, surface);
    assert.ok(item.contexts.body);
    const markup = renderToStaticMarkup(<HammerTypedToolBayBody context={item.contexts.body} />);
    assert.match(markup, new RegExp(`data-hammer-tool-bay-surface="${surface}"`));
    assert.doesNotMatch(markup, />\s*\+\s*</);
    assert.deepEqual(item.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
  }
});

test("exact visual routes assemble typed contexts and reject the Florida B-roll fixture from image surfaces", () => {
  const polishRoute: HammerToolBayRouteDecision = { ...resolved, surface: "visual_polish", activeTool: "video", activeVisualTool: "polish", representativePass: "visual_polish", editorMode: "visual" };
  const polish = fixture(polishRoute);
  assert.equal(polish.contexts.body?.surface, "visual_polish");
  assert.ok(polish.contexts.body);
  assert.match(renderToStaticMarkup(<HammerTypedToolBayBody context={polish.contexts.body} />), /data-hammer-tool-bay-surface="visual_polish"/);
  const selectedImage = { status: "selected" as const, placementId: "image:florida", clipId: "image:florida", assetId: "asset:florida", laneId: "lane:overlay", kind: "image" as const, preferredTool: "images" as const, preferredPass: "image_placement" as const, capabilities: { remove: true, retime: true, anchor: true, transform: true, animate: true, rebind: false, replace: false, revert: false, transition: false } };
  const inspectorMarkup: string[] = [];
  let visualInteractionCount = 0;
  const visualCalls: InteractionCall[] = [];
  for (const surface of ["image_placement", "image_timing", "image_transform", "image_animation"] as const) {
    const route: HammerToolBayRouteDecision = { ...resolved, surface, activeTool: "video", activeVisualTool: "images", representativePass: "visual_polish", editorMode: "visual" };
    const item = fixture(route);
    const contexts = assembleHammerToolBayRuntimeContexts({ ...visualRuntimeArgs, imageInspectorData: inspectorData(selectedImage), selectedVisualContext: selectedImage, route, passLabel: "Visual", passStatus: "in_progress", markPassComplete: item.commands.markPassComplete, readinessData: null, exportData: null, focusIssue: item.commands.focusIssue, sendToQuench: item.commands.sendToQuench, audioCommands: { updateVoicePreset() {}, toggleCompare() {}, applyPodcastMaster() {} }, captionCommands: { buildCaptions() {}, discardEdits() {}, editCaption() {}, splitCaption() {}, mergeCaption() {} }, metadataCommands: { setTags() {} }, transcriptCleanupCommands: { refreshCandidates() {}, previewCandidate() {}, acceptCandidate() {}, dismissCandidate() {}, applyCleanup() {}, discardCleanup() {} }, retakeCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, gapCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, transcriptPolishCommands: { previewCleanup() {}, applyCleanup() {}, discardCleanup() {} }, packagingCommands: { applyIntro() {}, removeIntro() {}, applyOutro() {}, removeOutro() {}, updateLogo() {} }, finishingCommands: { setReviewFlag() {} } });
    assert.equal(contexts.body?.surface, surface);
    assert.ok(contexts.body);
    if (contexts.body.surface !== "unsupported") {
      assert.equal(contexts.body.commands, visualRuntimeArgs.imageInspectorCommands);
      assert.equal(contexts.body.data.selectedVisual, selectedImage);
      assert.equal(contexts.body.data.placementId, selectedImage.placementId);
      const interactiveBody = { ...contexts.body, commands: instrumentCommands(contexts.body.commands, visualCalls) } as typeof contexts.body;
      visualInteractionCount += exerciseEnabledInteractions(<HammerTypedToolBayBody context={interactiveBody} />);
    }
    const markup = renderToStaticMarkup(<HammerTypedToolBayBody context={contexts.body} />);
    assert.match(markup, new RegExp(`data-hammer-tool-bay-surface="${surface}"`));
    inspectorMarkup.push(markup.replace(`data-hammer-tool-bay-surface="${surface}"`, "data-hammer-tool-bay-surface=\"image_inspector\""));
  }
  assert.equal(inspectorMarkup[0], inspectorMarkup[1]);
  assert.equal(inspectorMarkup[1], inspectorMarkup[2]);
  assert.equal(inspectorMarkup[2], inspectorMarkup[3]);
  const missingImageData = assembleHammerToolBayRuntimeContexts({ ...visualRuntimeArgs, selectedVisualContext: selectedImage, route: { ...resolved, surface: "image_placement" }, passLabel: "Visual", passStatus: "in_progress", markPassComplete: polish.commands.markPassComplete, readinessData: null, exportData: null, focusIssue: polish.commands.focusIssue, sendToQuench: polish.commands.sendToQuench });
  assert.equal(missingImageData.body?.surface, "unsupported");
  if (missingImageData.body?.surface === "unsupported") assert.equal(missingImageData.body.data.reason, "required_data_missing");
  const incapableImage = { ...selectedImage, capabilities: { ...selectedImage.capabilities, anchor: false } };
  const incapable = assembleHammerToolBayRuntimeContexts({ ...visualRuntimeArgs, imageInspectorData: inspectorData(incapableImage), selectedVisualContext: incapableImage, route: { ...resolved, surface: "image_timing" }, passLabel: "Visual", passStatus: "in_progress", markPassComplete: polish.commands.markPassComplete, readinessData: null, exportData: null, focusIssue: polish.commands.focusIssue, sendToQuench: polish.commands.sendToQuench });
  assert.equal(incapable.body?.surface, "unsupported");
  if (incapable.body?.surface === "unsupported") assert.equal(incapable.body.data.reason, "selected_visual_capability_mismatch");
  const broll = { status: "selected" as const, placementId: "he8:florida-broll", clipId: "he8:florida-broll", assetId: "asset:florida-broll", laneId: "lane:broll", kind: "broll" as const, preferredTool: "broll" as const, preferredPass: "image_animation" as const, capabilities: { remove: true, retime: true, anchor: false, transform: false, animate: false, rebind: true, replace: true, revert: true, transition: true } };
  const base = fixture();
  let rejectedMarkup = "";
  for (const surface of ["image_placement", "image_timing", "image_transform", "image_animation"] as const) {
    const imageRoute: HammerToolBayRouteDecision = { ...resolved, surface, activeTool: "video", activeVisualTool: "images", representativePass: "visual_polish", editorMode: "visual" };
    const rejected = assembleHammerToolBayRuntimeContexts({ ...visualRuntimeArgs, imageInspectorData: inspectorData(broll), selectedVisualContext: broll, route: imageRoute, passLabel: "Visual", passStatus: "in_progress", markPassComplete: base.commands.markPassComplete, readinessData: null, exportData: null, focusIssue: base.commands.focusIssue, sendToQuench: base.commands.sendToQuench });
    assert.equal(rejected.body?.surface, "unsupported");
    if (rejected.body?.surface === "unsupported") assert.equal(rejected.body.data.reason, "selected_visual_kind_mismatch");
    rejectedMarkup += rejected.body ? renderToStaticMarkup(<HammerTypedToolBayBody context={rejected.body} />) : "";
  }
  assert.equal(broll.kind, "broll");
  assert.equal(broll.placementId, "he8:florida-broll");
  assert.doesNotMatch(rejectedMarkup, /Image Placement|Timing|Transform|Animation|Center visual overlay/);
  assert.deepEqual(base.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });

  for (const selected of [broll, { ...broll, placementId: "reference:florida", clipId: "reference:florida", assetId: "asset:reference", kind: "reference_clip" as const }] as const) {
    const surface = selected.kind === "broll" ? "broll" as const : "reference_clip" as const;
    const route: HammerToolBayRouteDecision = { ...resolved, surface, activeTool: "video", activeVisualTool: "broll", representativePass: "image_animation", editorMode: "visual" };
    const removals: string[] = [];
    const commands = { ...visualRuntimeArgs.brollCommands, removePlacement: (placementId: string) => removals.push(placementId) };
    const contexts = assembleHammerToolBayRuntimeContexts({ ...visualRuntimeArgs, route, selectedVisualContext: selected, brollReferenceData: brollReferenceData(selected), brollCommands: commands, referenceClipCommands: commands, passLabel: "Visual", passStatus: "in_progress", markPassComplete: noop, readinessData: null, exportData: null, focusIssue: noop, sendToQuench: noop });
    assert.equal(contexts.body?.surface, surface);
    if (contexts.body?.surface !== surface) assert.fail();
    assert.equal(contexts.body.commands, commands);
    const markup = renderToStaticMarkup(<HammerTypedToolBayBody context={contexts.body} />);
    assert.equal((markup.match(/>Remove Clip<\/button>/g) ?? []).length, 1);
    assert.match(markup, new RegExp(`data-placement-id="${selected.placementId}"`));
    assert.doesNotMatch(markup, /Transform|Center visual overlay/);
    assert.deepEqual(removals, []);
    const interactiveBody = { ...contexts.body, commands: instrumentCommands(contexts.body.commands, visualCalls) } as typeof contexts.body;
    visualInteractionCount += exerciseEnabledInteractions(<HammerTypedToolBayBody context={interactiveBody} />);
    contexts.body.commands.removePlacement(selected.placementId);
    assert.deepEqual(removals, [selected.placementId]);
  }
  const brollRoute: HammerToolBayRouteDecision = { ...resolved, surface: "broll", activeTool: "video", activeVisualTool: "broll", representativePass: "image_animation", editorMode: "visual" };
  const contradictory = brollReferenceData(broll);
  const contradictoryContexts = assembleHammerToolBayRuntimeContexts({ ...visualRuntimeArgs, route: brollRoute, selectedVisualContext: broll, brollReferenceData: { ...contradictory, selectedClip: { ...contradictory.selectedClip, lane_id: "lane:wrong" } }, passLabel: "Visual", passStatus: "in_progress", markPassComplete: noop, readinessData: null, exportData: null, focusIssue: noop, sendToQuench: noop });
  assert.equal(contradictoryContexts.body?.surface, "unsupported");
  if (contradictoryContexts.body?.surface === "unsupported") assert.equal(contradictoryContexts.body.data.reason, "required_data_missing");
  const incapableBroll = { ...broll, capabilities: { ...broll.capabilities, transition: false } };
  const incapableBrollContexts = assembleHammerToolBayRuntimeContexts({ ...visualRuntimeArgs, route: brollRoute, selectedVisualContext: incapableBroll, brollReferenceData: brollReferenceData(incapableBroll), passLabel: "Visual", passStatus: "in_progress", markPassComplete: noop, readinessData: null, exportData: null, focusIssue: noop, sendToQuench: noop });
  assert.equal(incapableBrollContexts.body?.surface, "unsupported");
  if (incapableBrollContexts.body?.surface === "unsupported") assert.equal(incapableBrollContexts.body.data.reason, "selected_visual_capability_mismatch");
  assert.ok(visualInteractionCount >= 30, `expected visual inspector interactions, received ${visualInteractionCount}`);
  assert.ok(visualCalls.length >= 20, `expected visual command dispatch, received ${visualCalls.length}`);
});
