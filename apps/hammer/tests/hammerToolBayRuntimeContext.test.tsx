import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
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
const visualRuntimeArgs = {
  audioFinalizationData: null,
  audioAdjustmentsData: null,
  captionsData: null,
  metadataData: null,
  packagingData: null,
  finishingData: null,
  selectedVisualContext: { status: "none" as const },
  visualPolishCommands: { updateLook() {}, updateExposure() {}, updateBackground() {}, toggleEyeContact() {} },
  imagePlacementCommands: { removePlacement() {}, updateAnchor() {} },
  imageTimingCommands: { retimePlacement() {} },
  imageTransformCommands: { updateTransform() {}, resetTransform() {} },
  imageAnimationCommands: { updateAnimation() {} },
  brollCommands: { removePlacement() {}, rebindPlacement() {}, replaceBinding() {}, revertBinding() {}, addTransition() {} },
  referenceClipCommands: { removePlacement() {}, rebindPlacement() {}, replaceBinding() {}, revertBinding() {}, addTransition() {} },
};

function fixture(route: HammerToolBayRouteDecision = resolved, currentPass: "ready" | "packaging" = "ready", missingDataSurface: "audio_finalization" | "audio_adjustments" | "captions" | "metadata" | "transcript_cleanup" | "retakes" | "gap_pacing" | "transcript_polish" | "packaging" | "finishing" | null = null) {
  const activity = { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 };
  const markPassComplete = (): void => { activity.completion += 1; };
  const focusIssue = (): void => { activity.focus += 1; };
  const sendToQuench = (): void => { activity.send += 1; };
  const exactRoute = currentPass === "packaging" && route.status === "resolved" ? { ...route, surface: "export" as const } : route;
  const noop = (): void => undefined;
  const migratedEditorModel = {
    activeCaptionArtifactText: "", activeCaptionMode: "built", activeCaptionState: null,
    captionActiveModeLabel: "Built", captionActiveModeSourceLabel: "Canonical transcript", captionArtifactStatusLabel: "Not built", captionBuildFeedback: null, captionBuildFreshness: "Current", captionBuildState: null, captionBuiltSummary: "No built captions", captionBuiltTone: "neutral", captionDiscardConsequenceLabel: null, captionEditedBasisDetail: "", captionEditedChangeSummary: "", captionEditedState: null, captionEditedSummary: "No caption edits", captionEditedTone: "neutral", captionEditorRefs: { current: new Map() }, captionFormatting: { style: "sentence", maxCharsPerLine: 42, maxLinesPerCaption: 2, includeSpeakerLabels: false, punctuationMode: "preserve", readingSpeed: "standard" }, captionRebuildConsequenceLabel: "", captionReleasePrepSafetyDetail: "", captionReleasePrepSafetyLabel: "Safe", captionReleasePrepSafetyState: "safe", captionReleaseSourceLabel: "Canonical transcript", captionSourceLabel: "Canonical transcript", detailTag: "", selectedCaptionArtifactFormat: "srt",
    handleDiscardEditedCaptions: noop, handleEditCaptionChunkText: noop, handleEnableCaptionEdits: noop, handleMergeEditedCaptionChunk: noop, handleNormalizeEditedCaptionChunkPunctuation: noop, handleRebuildCaptionArtifacts: noop, handleSplitEditedCaptionChunk: noop, handleToggleEditedCaptionChunkSpeakerLabel: noop, setActiveCaptionArtifactMode: noop, setCaptionFormatting: noop, setSelectedCaptionArtifactFormat: noop, setDetailTag: noop,
    voicePolish: { preset_id: null, voice_cleanup_enabled: false, fixes: { remove_harsh_sibilance: false, reduce_room_boxiness: false, enhance_voice_clarity: false, level_volume: false }, advanced: { de_esser_strength: "medium", eq_profile: "voice" } },
    audioFinalizationCompareMode: "after", editableAudioPolish: { status: "not_started" }, persistedAudioCutCount: 0, effectivePlaybackCutRegions: [], silenceSuggestionCount: 0,
    editableStudioRack: { is_enabled: false, is_bypassed: false, backend_preference: "native", modules: { gate: { is_enabled: false, is_bypassed: false, threshold_db: -52 }, compressor: { is_enabled: false, is_bypassed: false, ratio: 1.8 }, eq: { is_enabled: false, is_bypassed: false, mid_gain_db: 1.2 }, reverb: { is_enabled: false, is_bypassed: false, mix: 0.06 }, tubeMicCharacter: { is_enabled: false, is_bypassed: false, amount: 0.16 } } },
    studioRackPlaybackConfig: { backend: "native" }, studioRackPlaybackBackendResolution: { status: "available" }, studioRackRenderConfig: { backend: "native" }, studioRackRenderBackendResolution: { status: "available" }, studioRackRenderStatus: null, studioRackRenderAppliedModules: [], studioRackRenderDeferredModules: [], studioRackEnabledModuleCount: 0, studioRackComparePreviewStatusLabel: null, studioRackOpen: false,
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
    audioFinalizationData: missingDataSurface === "audio_finalization" ? null : { compareMode: migratedEditorModel.audioFinalizationCompareMode, voicePolish: migratedEditorModel.voicePolish },
    audioAdjustmentsData: missingDataSurface === "audio_adjustments" ? null : { editableAudioPolish: migratedEditorModel.editableAudioPolish, persistedAudioCutCount: migratedEditorModel.persistedAudioCutCount, effectivePlaybackCutRegions: migratedEditorModel.effectivePlaybackCutRegions, silenceSuggestionCount: migratedEditorModel.silenceSuggestionCount, editableStudioRack: migratedEditorModel.editableStudioRack, studioRackPlaybackConfig: migratedEditorModel.studioRackPlaybackConfig, studioRackPlaybackBackendResolution: migratedEditorModel.studioRackPlaybackBackendResolution, studioRackRenderConfig: migratedEditorModel.studioRackRenderConfig, studioRackRenderBackendResolution: migratedEditorModel.studioRackRenderBackendResolution, studioRackRenderStatus: migratedEditorModel.studioRackRenderStatus, studioRackRenderAppliedModules: migratedEditorModel.studioRackRenderAppliedModules, studioRackRenderDeferredModules: migratedEditorModel.studioRackRenderDeferredModules, studioRackEnabledModuleCount: migratedEditorModel.studioRackEnabledModuleCount, studioRackComparePreviewStatusLabel: migratedEditorModel.studioRackComparePreviewStatusLabel, studioRackOpen: migratedEditorModel.studioRackOpen, podcastMasterLayer: migratedEditorModel.podcastMasterLayer, podcastMasterUiStatus: migratedEditorModel.podcastMasterUiStatus, audioLevelingEnabled: migratedEditorModel.audioLevelingEnabled, audioNoiseReductionEnabled: migratedEditorModel.audioNoiseReductionEnabled },
    captionsData: missingDataSurface === "captions" ? null : { activeCaptionArtifactText: migratedEditorModel.activeCaptionArtifactText, activeCaptionMode: migratedEditorModel.activeCaptionMode, activeCaptionState: migratedEditorModel.activeCaptionState, captionActiveModeLabel: migratedEditorModel.captionActiveModeLabel, captionActiveModeSourceLabel: migratedEditorModel.captionActiveModeSourceLabel, captionArtifactStatusLabel: migratedEditorModel.captionArtifactStatusLabel, captionBuildFeedback: migratedEditorModel.captionBuildFeedback, captionBuildFreshness: migratedEditorModel.captionBuildFreshness, captionBuildState: migratedEditorModel.captionBuildState, captionBuiltSummary: migratedEditorModel.captionBuiltSummary, captionBuiltTone: migratedEditorModel.captionBuiltTone, captionDiscardConsequenceLabel: migratedEditorModel.captionDiscardConsequenceLabel, captionEditedBasisDetail: migratedEditorModel.captionEditedBasisDetail, captionEditedChangeSummary: migratedEditorModel.captionEditedChangeSummary, captionEditedState: migratedEditorModel.captionEditedState, captionEditedSummary: migratedEditorModel.captionEditedSummary, captionEditedTone: migratedEditorModel.captionEditedTone, captionEditorRefs: migratedEditorModel.captionEditorRefs, captionFormatting: migratedEditorModel.captionFormatting, captionRebuildConsequenceLabel: migratedEditorModel.captionRebuildConsequenceLabel, captionReleasePrepSafetyDetail: migratedEditorModel.captionReleasePrepSafetyDetail, captionReleasePrepSafetyLabel: migratedEditorModel.captionReleasePrepSafetyLabel, captionReleasePrepSafetyState: migratedEditorModel.captionReleasePrepSafetyState, captionReleaseSourceLabel: migratedEditorModel.captionReleaseSourceLabel, captionSourceLabel: migratedEditorModel.captionSourceLabel, selectedCaptionArtifactFormat: migratedEditorModel.selectedCaptionArtifactFormat },
    metadataData: missingDataSurface === "metadata" ? null : { detailTag: migratedEditorModel.detailTag },
    transcriptReviewData: missingDataSurface === "transcript_cleanup" || missingDataSurface === "retakes" || missingDataSurface === "gap_pacing" ? null : { activeReviewKind: migratedEditorModel.activeReviewKind, fillerCandidateCards: migratedEditorModel.fillerCandidateCards, fillerActiveCandidateIndex: migratedEditorModel.fillerActiveCandidateIndex, fillerDecisionInFlight: migratedEditorModel.fillerDecisionInFlight, retakeCandidateCards: migratedEditorModel.retakeCandidateCards, retakeActiveCandidateIndex: migratedEditorModel.retakeActiveCandidateIndex, retakeDecisionInFlight: migratedEditorModel.retakeDecisionInFlight, candidateReceiptByKind: migratedEditorModel.candidateReceiptByKind, candidateProposedRemovalById: migratedEditorModel.candidateProposedRemovalById, activeFillerCandidateCard: migratedEditorModel.activeFillerCandidateCard, activeRetakeCandidateCard: migratedEditorModel.activeRetakeCandidateCard, hasSilenceSuggestionAnalysis: migratedEditorModel.hasSilenceSuggestionAnalysis, silenceCutSuggestions: migratedEditorModel.silenceCutSuggestions, visibleSilenceCutSuggestions: migratedEditorModel.visibleSilenceCutSuggestions, deadAirThresholdSec: migratedEditorModel.deadAirThresholdSec, deadAirAnalysis: migratedEditorModel.deadAirAnalysis, deadAirApplyInFlight: migratedEditorModel.deadAirApplyInFlight, fillerCleanupOptions: migratedEditorModel.fillerCleanupOptions, retakeCleanupOptions: migratedEditorModel.retakeCleanupOptions, silenceSuggestionCount: migratedEditorModel.silenceSuggestionCount, activeFillerCandidateDiffOps: migratedEditorModel.activeFillerCandidateDiffOps, selectedTranscriptRange: migratedEditorModel.selectedTranscriptRange },
    transcriptPolishData: missingDataSurface === "transcript_polish" ? null : { gapCleanupOptions: migratedEditorModel.gapCleanupOptions, fillerCleanupOptions: migratedEditorModel.fillerCleanupOptions, retakeCleanupOptions: migratedEditorModel.retakeCleanupOptions, speakerSoloOptions: migratedEditorModel.speakerSoloOptions, speakerInterviewOptions: migratedEditorModel.speakerInterviewOptions, speakerMonologueOptions: migratedEditorModel.speakerMonologueOptions, speakerPanelOptions: migratedEditorModel.speakerPanelOptions, cleanupPreview: migratedEditorModel.cleanupPreview, cleanupPreviewSummary: migratedEditorModel.cleanupPreviewSummary, cleanupReceipt: migratedEditorModel.cleanupReceipt, editableTranscriptSegments: migratedEditorModel.editableTranscriptSegments, speakerOptions: migratedEditorModel.speakerOptions, hasTranscriptSelection: migratedEditorModel.hasTranscriptSelection, transcriptSelectionRange: migratedEditorModel.transcriptSelectionRange, polishStrength: migratedEditorModel.polishStrength },
    packagingData: missingDataSurface === "packaging" ? null : { selectedIntroPath: null, selectedOutroPath: null, selectedIntroAssetId: null, selectedOutroAssetId: null, introPlaced: false, outroPlaced: false, logoAssetPath: null, logoPlaced: false, logoPosition: "top_right", logoSize: "medium", sourceImageLibraryItems: [], logoPositionOptions: [], logoSizeOptions: [], introEntryId: "packaging:intro", outroEntryId: "packaging:outro" },
    finishingData: missingDataSurface === "finishing" ? null : { checklist: migratedEditorModel.finishingChecklist },
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
    markPassComplete, focusIssue, sendToQuench, migratedEditorModel,
    audioFinalizationCommands, audioAdjustmentCommands, captionCommands, metadataCommands, transcriptReviewCommands, transcriptPolishCommands, packagingCommands, finishingCommands,
  });
  return { contexts, activity, commands: { markPassComplete, focusIssue, sendToQuench, audioFinalizationCommands, audioAdjustmentCommands, captionCommands, metadataCommands, transcriptCleanupCommands, retakeCommands, gapCommands, transcriptPolishCommands, packagingCommands, finishingCommands } };
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

test("missing migrated data fails closed and never produces a legacy body", () => {
  const base = fixture();
  const failed = assembleHammerToolBayRuntimeContexts({
    ...visualRuntimeArgs, route: resolved, passLabel: "Ready", passStatus: "in_progress",
    markPassComplete: base.commands.markPassComplete, readinessData: null, exportData: null,
    focusIssue: base.commands.focusIssue, sendToQuench: base.commands.sendToQuench, migratedEditorModel: {}, audioCommands: { updateVoicePreset() {}, toggleCompare() {}, applyPodcastMaster() {} }, captionCommands: { buildCaptions() {}, discardEdits() {}, editCaption() {}, splitCaption() {}, mergeCaption() {} }, metadataCommands: { setTags() {} }, transcriptCleanupCommands: { refreshCandidates() {}, previewCandidate() {}, acceptCandidate() {}, dismissCandidate() {}, applyCleanup() {}, discardCleanup() {} }, retakeCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, gapCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, transcriptPolishCommands: { previewCleanup() {}, applyCleanup() {}, discardCleanup() {} }, packagingCommands: { applyIntro() {}, removeIntro() {}, applyOutro() {}, removeOutro() {}, updateLogo() {} }, finishingCommands: { setReviewFlag() {} },
  });
  assert.equal(failed.body?.surface, "unsupported");
  if (failed.body?.surface !== "unsupported") assert.fail();
  assert.equal(failed.body.data.reason, "required_data_missing");
  assert.deepEqual(Object.keys(failed.body.commands), []);
});

test("missing typed surface data fails closed without legacy fallback", () => {
  for (const surface of ["audio_finalization", "audio_adjustments", "captions", "metadata", "transcript_cleanup", "retakes", "gap_pacing", "transcript_polish", "packaging", "finishing"] as const) {
    const item = fixture({ ...resolved, surface }, "ready", surface);
    assert.equal(item.contexts.body?.surface, "unsupported");
    if (item.contexts.body?.surface === "unsupported") assert.equal(item.contexts.body.data.reason, "required_data_missing");
    assert.deepEqual(item.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
  }
});

test("all ten extracted surfaces preserve exact dispatch, representative accessibility, command identity, and passive behavior", () => {
  const cases = [
    ["audio_finalization", "Audio Finalization", "audioFinalizationCommands"],
    ["audio_adjustments", "Audio Adjustments", "audioAdjustmentCommands"],
    ["captions", "Caption Output", "captionCommands"],
    ["metadata", "Edit Metadata", "metadataCommands"],
    ["transcript_cleanup", "Transcript Cleanup", "transcriptCleanupCommands"],
    ["retakes", "Transcript Cleanup", "retakeCommands"],
    ["gap_pacing", "Transcript Cleanup", "gapCommands"],
    ["transcript_polish", "Transcript Polish", "transcriptPolishCommands"],
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

test("migrated and legacy switching is deterministic and mount-safe", () => {
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
  const selectedImage = { status: "selected" as const, placementId: "image:florida", kind: "image" as const, capabilities: { remove: true, retime: true, transform: true, animate: true, rebind: false } };
  const inspectorMarkup: string[] = [];
  for (const surface of ["image_placement", "image_timing", "image_transform", "image_animation"] as const) {
    const route: HammerToolBayRouteDecision = { ...resolved, surface, activeTool: "video", activeVisualTool: "images", representativePass: "visual_polish", editorMode: "visual" };
    const item = fixture(route);
    const contexts = assembleHammerToolBayRuntimeContexts({ ...visualRuntimeArgs, selectedVisualContext: selectedImage, route, passLabel: "Visual", passStatus: "in_progress", markPassComplete: item.commands.markPassComplete, readinessData: null, exportData: null, focusIssue: item.commands.focusIssue, sendToQuench: item.commands.sendToQuench, migratedEditorModel: {}, audioCommands: { updateVoicePreset() {}, toggleCompare() {}, applyPodcastMaster() {} }, captionCommands: { buildCaptions() {}, discardEdits() {}, editCaption() {}, splitCaption() {}, mergeCaption() {} }, metadataCommands: { setTags() {} }, transcriptCleanupCommands: { refreshCandidates() {}, previewCandidate() {}, acceptCandidate() {}, dismissCandidate() {}, applyCleanup() {}, discardCleanup() {} }, retakeCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, gapCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, transcriptPolishCommands: { previewCleanup() {}, applyCleanup() {}, discardCleanup() {} }, packagingCommands: { applyIntro() {}, removeIntro() {}, applyOutro() {}, removeOutro() {}, updateLogo() {} }, finishingCommands: { setReviewFlag() {} } });
    assert.equal(contexts.body?.surface, surface);
    assert.ok(contexts.body);
    const markup = renderToStaticMarkup(<HammerTypedToolBayBody context={contexts.body} />);
    assert.match(markup, new RegExp(`data-hammer-tool-bay-surface="${surface}"`));
    inspectorMarkup.push(markup.replace(`data-hammer-tool-bay-surface="${surface}"`, "data-hammer-tool-bay-surface=\"image_inspector\""));
  }
  assert.equal(inspectorMarkup[0], inspectorMarkup[1]);
  assert.equal(inspectorMarkup[1], inspectorMarkup[2]);
  assert.equal(inspectorMarkup[2], inspectorMarkup[3]);
  const broll = { status: "selected" as const, placementId: "he8:florida-broll", kind: "broll" as const, capabilities: { remove: true, retime: true, transform: false, animate: false, rebind: true } };
  const imageRoute: HammerToolBayRouteDecision = { ...resolved, surface: "image_transform", activeTool: "video", activeVisualTool: "images", representativePass: "visual_polish", editorMode: "visual" };
  const base = fixture();
  const rejected = assembleHammerToolBayRuntimeContexts({ ...visualRuntimeArgs, selectedVisualContext: broll, route: imageRoute, passLabel: "Visual", passStatus: "in_progress", markPassComplete: base.commands.markPassComplete, readinessData: null, exportData: null, focusIssue: base.commands.focusIssue, sendToQuench: base.commands.sendToQuench, migratedEditorModel: {}, audioCommands: { updateVoicePreset() {}, toggleCompare() {}, applyPodcastMaster() {} }, captionCommands: { buildCaptions() {}, discardEdits() {}, editCaption() {}, splitCaption() {}, mergeCaption() {} }, metadataCommands: { setTags() {} }, transcriptCleanupCommands: { refreshCandidates() {}, previewCandidate() {}, acceptCandidate() {}, dismissCandidate() {}, applyCleanup() {}, discardCleanup() {} }, retakeCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, gapCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, transcriptPolishCommands: { previewCleanup() {}, applyCleanup() {}, discardCleanup() {} }, packagingCommands: { applyIntro() {}, removeIntro() {}, applyOutro() {}, removeOutro() {}, updateLogo() {} }, finishingCommands: { setReviewFlag() {} } });
  assert.equal(rejected.body?.surface, "unsupported");
  if (rejected.body?.surface === "unsupported") assert.equal(rejected.body.data.reason, "selected_visual_kind_mismatch");
  assert.equal(broll.kind, "broll");
  assert.equal(broll.placementId, "he8:florida-broll");
  const rejectedMarkup = rejected.body ? renderToStaticMarkup(<HammerTypedToolBayBody context={rejected.body} />) : "";
  assert.doesNotMatch(rejectedMarkup, /Image Placement|Timing|Transform|Animation|Center visual overlay/);
  assert.deepEqual(base.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
});
