import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HammerTypedPassCompletionHeader, HammerTypedToolBayBody } from "../src/editor/HammerTypedToolBaySurfaces";
import { assembleHammerToolBayRuntimeContexts, HAMMER_MIGRATED_TOOL_BAY_SURFACES } from "../src/editor/hammerToolBayRuntimeContext";
import type { HammerToolBayRouteDecision } from "../src/editor/hammerToolBayRouteDecision";

const resolved: Extract<HammerToolBayRouteDecision, { status: "resolved" }> = {
  status: "resolved", surface: "release_readiness", activeTool: "export", activeVisualTool: null, representativePass: "ready",
  editorMode: "transcript", source: "current_pass", navigationPermitted: false, selectionPreserved: true,
};
const unsupported: HammerToolBayRouteDecision = {
  status: "unsupported", reason: "surface_not_supported", selectedPlacementId: "placement:1",
  navigationPermitted: false, selectionPreserved: true,
};

function fixture(route: HammerToolBayRouteDecision = resolved, currentPass: "ready" | "packaging" = "ready") {
  const activity = { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 };
  const markPassComplete = (): void => { activity.completion += 1; };
  const focusIssue = (): void => { activity.focus += 1; };
  const sendToQuench = (): void => { activity.send += 1; };
  const exactRoute = currentPass === "packaging" && route.status === "resolved" ? { ...route, surface: "export" as const } : route;
  const noop = (): void => undefined;
  const migratedEditorModel = {
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
  };
  const contexts = assembleHammerToolBayRuntimeContexts({
    route: exactRoute, passLabel: "Ready", passStatus: "in_progress",
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
    audioCommands: { updateVoicePreset: noop, toggleCompare: noop, applyPodcastMaster: noop }, captionCommands: { buildCaptions: noop, discardEdits: noop, editCaption: noop, splitCaption: noop, mergeCaption: noop }, metadataCommands: { setTags: noop }, transcriptCleanupCommands: { refreshCandidates: noop, previewCandidate: noop, acceptCandidate: noop, dismissCandidate: noop, applyCleanup: noop, discardCleanup: noop }, retakeCommands: { previewRange: noop, acceptRange: noop, dismissRange: noop }, gapCommands: { previewRange: noop, acceptRange: noop, dismissRange: noop }, transcriptPolishCommands: { previewCleanup: noop, applyCleanup: noop, discardCleanup: noop },
  });
  return { contexts, activity, commands: { markPassComplete, focusIssue, sendToQuench } };
}

test("runtime assembly locks twelve migrated surfaces and preserves callback identity with zero activity", () => {
  assert.deepEqual(HAMMER_MIGRATED_TOOL_BAY_SURFACES, ["unsupported", "release_readiness", "export", "pass_completion", "audio_finalization", "audio_adjustments", "captions", "metadata", "transcript_cleanup", "retakes", "gap_pacing", "transcript_polish"]);
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
    route: resolved, passLabel: "Ready", passStatus: "in_progress",
    markPassComplete: base.commands.markPassComplete, readinessData: null, exportData: null,
    focusIssue: base.commands.focusIssue, sendToQuench: base.commands.sendToQuench, migratedEditorModel: {}, audioCommands: { updateVoicePreset() {}, toggleCompare() {}, applyPodcastMaster() {} }, captionCommands: { buildCaptions() {}, discardEdits() {}, editCaption() {}, splitCaption() {}, mergeCaption() {} }, metadataCommands: { setTags() {} }, transcriptCleanupCommands: { refreshCandidates() {}, previewCandidate() {}, acceptCandidate() {}, dismissCandidate() {}, applyCleanup() {}, discardCleanup() {} }, retakeCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, gapCommands: { previewRange() {}, acceptRange() {}, dismissRange() {} }, transcriptPolishCommands: { previewCleanup() {}, applyCleanup() {}, discardCleanup() {} },
  });
  assert.equal(failed.body?.surface, "unsupported");
  if (failed.body?.surface !== "unsupported") assert.fail();
  assert.equal(failed.body.data.reason, "required_data_missing");
  assert.deepEqual(Object.keys(failed.body.commands), []);
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
    assert.deepEqual(item.activity, { completion: 0, focus: 0, send: 0, history: 0, persistence: 0, selection: 0 });
  }
});
