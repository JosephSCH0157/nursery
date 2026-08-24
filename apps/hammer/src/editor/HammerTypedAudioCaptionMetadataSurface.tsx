import type { JSX } from "react";
import type { HammerLogoOverlayPosition, HammerLogoOverlaySize } from "./hammerWorkspaceShellVisualUtils";

type PackagingIntroStatusView = Readonly<{ selectionStatusLine: string; placementStatusLine: string; applyActionLabel: string; removeActionLabel: string; canApply: boolean; canRemove: boolean }>;
function derivePackagingIntroStatusView(args: { selectedIntroAssetId: string | null; selectedIntroPath: string | null; introPlaced: boolean }): PackagingIntroStatusView { const selected = Boolean(args.selectedIntroAssetId); const resolved = Boolean(args.selectedIntroAssetId && args.selectedIntroPath); return { selectionStatusLine: selected ? (resolved ? "Selected intro from Source Desk: " + args.selectedIntroPath : "Selected intro from Source Desk is unresolved (" + args.selectedIntroAssetId + ").") : "No intro selected in Source Desk.", placementStatusLine: args.introPlaced ? "Timeline packaging intro: placed." : "Timeline packaging intro: not placed.", applyActionLabel: "Apply Selected Intro to Timeline", removeActionLabel: "Remove Intro from Timeline", canApply: resolved, canRemove: args.introPlaced }; }
type PackagingFinishingSurfaceModel = Readonly<{ introOutroSelectedIntroPath: string | null; introOutroSelectedOutroPath: string | null; introOutroSelection: { intro_asset_id: string | null; outro_asset_id: string | null }; packagingIntroPlacement: unknown | null; packagingOutroPlacement: unknown | null; packagingLogoAssetPath: string | null; packagingLogoPlacement: unknown | null; packagingLogoPosition: HammerLogoOverlayPosition; packagingLogoSize: HammerLogoOverlaySize; sourceImageLibraryItems: readonly { path: string; name: string }[]; LOGO_POSITION_OPTIONS: readonly { id: HammerLogoOverlayPosition; label: string }[]; LOGO_SIZE_OPTIONS: readonly { id: HammerLogoOverlaySize; label: string }[]; PACKAGING_INTRO_ENTRY_ID: string; PACKAGING_OUTRO_ENTRY_ID: string; applyIntroPlacement(): void; applyOutroPlacement(): void; removePackagingPlacement(id: string, label: string): void; applyLogoOverlayStyle(input: { assetPath?: string | null; position?: HammerLogoOverlayPosition; size?: HammerLogoOverlaySize }): void; toggleLogoOverlay(): void; finishingChecklist: { transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean }; setFinishingChecklist(next: { transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean } | ((current: { transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean }) => { transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean })): void }>;

import PolishResultSummary from "./PolishResultSummary";
import type { HammerCleanupCandidateCard } from "./hammerCleanupCandidateQueue";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { FillerCleanupOptions, RetakeCleanupOptions, SpeakerInterviewOptions, SpeakerPanelOptions } from "./hammerCleanupTools";
import type { useHammerWorkspaceShellTranscriptCleanup } from "./useHammerWorkspaceShellTranscriptCleanup";
import type { useHammerWorkspaceShellCleanupCandidateReview } from "./useHammerWorkspaceShellCleanupCandidateReview";
import type { useHammerWorkspaceShellSilenceEditing } from "./useHammerWorkspaceShellSilenceEditing";

type TranscriptSurfaceModel = ReturnType<typeof useHammerWorkspaceShellTranscriptCleanup> & ReturnType<typeof useHammerWorkspaceShellCleanupCandidateReview> & ReturnType<typeof useHammerWorkspaceShellSilenceEditing> & Readonly<{
  silenceSuggestionCount: number; seekPlayheadToTime: ((time: number, origin: "timeline" | "playhead", options?: { snapToBoundary?: boolean }) => void) | null; setFocusOverride(mode: "auto" | "source-focus" | "tool-focus" | "time-focus"): void; setActiveTranscriptToolSection(section: "fillers" | "retakes" | "silence_gaps"): void; refreshCleanupCandidateQueue(kind: "fillers" | "retakes"): void; activeFillerCandidateDiffOps: readonly { type: "insert" | "delete" | "equal"; words: readonly string[] }[] | null; selectedTranscriptRange: { start: number; end: number; text: string } | null; editableTranscriptSegments: HammerTranscriptSegment[]; speakerOptions: string[]; hasTranscriptSelection: boolean; transcriptSelectionRange: { segmentIds: string[] }; polishStrength: number; setPolishStrength(next: number | ((current: number) => number)): void;
}>;

import type { HammerCaptionArtifactMode, HammerCaptionBuildState, HammerCaptionEditedState, HammerCaptionFormattingState, HammerCaptionPunctuationMode, HammerCaptionReadingSpeed } from "./hammerWorkspaceShellCaptionUtils";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerVoicePolishState } from "./hammerVoicePolish";
import type { HammerToolBayContextSurface } from "./hammerToolBayContext";

export function HammerTypedAudioCaptionMetadataSurface(props: { surface: Extract<HammerToolBayContextSurface, "audio_finalization" | "audio_adjustments" | "captions" | "metadata" | "transcript_cleanup" | "retakes" | "gap_pacing" | "transcript_polish" | "packaging" | "finishing">; model: unknown }): JSX.Element {
  const { surface } = props;
  type Command = (...args: unknown[]) => void;
  type CaptionState = HammerCaptionBuildState | HammerCaptionEditedState;
  type SurfaceModel = Readonly<{
    activeCaptionArtifactText: string; activeCaptionMode: HammerCaptionArtifactMode; activeCaptionState: CaptionState | null;
    captionActiveModeLabel: string; captionActiveModeSourceLabel: string; captionArtifactStatusLabel: string; captionBuildFeedback: string | null; captionBuildFreshness: string; captionBuildState: HammerCaptionBuildState | null; captionBuiltSummary: string; captionBuiltTone: string; captionDiscardConsequenceLabel: string | null; captionEditedBasisDetail: string; captionEditedChangeSummary: string; captionEditedState: HammerCaptionEditedState | null; captionEditedSummary: string; captionEditedTone: string; captionEditorRefs: { current: Map<string, HTMLTextAreaElement> }; captionFormatting: HammerCaptionFormattingState; captionRebuildConsequenceLabel: string; captionReleasePrepSafetyDetail: string; captionReleasePrepSafetyLabel: string; captionReleasePrepSafetyState: string; captionReleaseSourceLabel: string; captionSourceLabel: string; detailTag: string; selectedCaptionArtifactFormat: "srt" | "vtt";
    audioFinalizationCompareMode: "before" | "after"; voicePolish: HammerVoicePolishState | null; editableAudioPolish: { status?: string } | null; persistedAudioCutCount: number; effectivePlaybackCutRegions: readonly unknown[]; silenceSuggestionCount: number; editableStudioRack: HammerStudioRackState; studioRackPlaybackConfig: { backend: string }; studioRackPlaybackBackendResolution: { status: string }; studioRackRenderConfig: { backend: string }; studioRackRenderBackendResolution: { status: string }; studioRackRenderStatus: { message: string; requestedBackend: string; resolvedBackend: string; status: string; outputWorkpiecePath?: string | null } | null; studioRackRenderAppliedModules: readonly string[]; studioRackRenderDeferredModules: readonly string[]; studioRackEnabledModuleCount: number; studioRackComparePreviewStatusLabel: string | null; studioRackOpen: boolean; podcastMasterLayer: { posture: string; capability: string; meta?: { preset: string; normalization_lufs: number; compression_amount: number; limiter_ceiling_dbtp: number; preview_mode: string; applied_stages?: readonly string[]; skipped_stages?: readonly string[] } } | null; podcastMasterUiStatus: { headline: string; detail: string; action_label: string }; audioLevelingEnabled: boolean; audioNoiseReductionEnabled: boolean;
    applyPodcastMasterPass: Command; applyStudioRackMutation: Command; setAudioLevelingEnabled: Command; setAudioNoiseReductionEnabled: Command; setStudioRackBackend: Command; setStudioRackBypassed: Command; setStudioRackEnabled: Command; setStudioRackModuleBypassed: Command; setStudioRackModuleEnabled: Command; setStudioRackOpen: Command; setFocusOverride: Command; setAudioFinalizationCompare: Command; applyVoicePolishPreset: Command; setVoicePolishFixEnabled: Command; setVoicePolishDeEsserStrength: Command; setVoicePolishEqProfile: Command; setVoiceCleanupEnabled: Command; handleDiscardEditedCaptions: Command; handleEditCaptionChunkText: Command; handleEnableCaptionEdits: Command; handleMergeEditedCaptionChunk: Command; handleNormalizeEditedCaptionChunkPunctuation: Command; handleRebuildCaptionArtifacts: Command; handleSplitEditedCaptionChunk: Command; handleToggleEditedCaptionChunkSpeakerLabel: Command; setActiveCaptionArtifactMode: Command; setCaptionFormatting: Command; setSelectedCaptionArtifactFormat: Command; setDetailTag: Command;
  }>;
  const ctx = props.model as SurfaceModel;
  const activeCaptionArtifactText = ctx.activeCaptionArtifactText;
  const activeCaptionMode = ctx.activeCaptionMode;
  const activeCaptionState = ctx.activeCaptionState;
  const captionActiveModeLabel = ctx.captionActiveModeLabel;
  const captionActiveModeSourceLabel = ctx.captionActiveModeSourceLabel;
  const captionArtifactStatusLabel = ctx.captionArtifactStatusLabel;
  const captionBuildFeedback = ctx.captionBuildFeedback;
  const captionBuildFreshness = ctx.captionBuildFreshness;
  const captionBuildState = ctx.captionBuildState;
  const captionBuiltSummary = ctx.captionBuiltSummary;
  const captionBuiltTone = ctx.captionBuiltTone;
  const captionDiscardConsequenceLabel = ctx.captionDiscardConsequenceLabel;
  const captionEditedBasisDetail = ctx.captionEditedBasisDetail;
  const captionEditedChangeSummary = ctx.captionEditedChangeSummary;
  const captionEditedState = ctx.captionEditedState;
  const captionEditedSummary = ctx.captionEditedSummary;
  const captionEditedTone = ctx.captionEditedTone;
  const captionEditorRefs = ctx.captionEditorRefs;
  const captionFormatting = ctx.captionFormatting;
  const captionRebuildConsequenceLabel = ctx.captionRebuildConsequenceLabel;
  const captionReleasePrepSafetyDetail = ctx.captionReleasePrepSafetyDetail;
  const captionReleasePrepSafetyLabel = ctx.captionReleasePrepSafetyLabel;
  const captionReleasePrepSafetyState = ctx.captionReleasePrepSafetyState;
  const captionReleaseSourceLabel = ctx.captionReleaseSourceLabel;
  const captionSourceLabel = ctx.captionSourceLabel;
  const detailTag = ctx.detailTag;
  const handleDiscardEditedCaptions = ctx.handleDiscardEditedCaptions;
  const handleEditCaptionChunkText = ctx.handleEditCaptionChunkText;
  const handleEnableCaptionEdits = ctx.handleEnableCaptionEdits;
  const handleMergeEditedCaptionChunk = ctx.handleMergeEditedCaptionChunk;
  const handleNormalizeEditedCaptionChunkPunctuation = ctx.handleNormalizeEditedCaptionChunkPunctuation;
  const handleRebuildCaptionArtifacts = ctx.handleRebuildCaptionArtifacts;
  const handleSplitEditedCaptionChunk = ctx.handleSplitEditedCaptionChunk;
  const handleToggleEditedCaptionChunkSpeakerLabel = ctx.handleToggleEditedCaptionChunkSpeakerLabel;
  const selectedCaptionArtifactFormat = ctx.selectedCaptionArtifactFormat;
  const setActiveCaptionArtifactMode = ctx.setActiveCaptionArtifactMode;
  const setCaptionFormatting = ctx.setCaptionFormatting;
  const setSelectedCaptionArtifactFormat = ctx.setSelectedCaptionArtifactFormat;
  const setDetailTag = ctx.setDetailTag;
  const applyPodcastMasterPass = ctx.applyPodcastMasterPass;
  const applyStudioRackMutation = ctx.applyStudioRackMutation;
  const audioLevelingEnabled = ctx.audioLevelingEnabled;
  const audioNoiseReductionEnabled = ctx.audioNoiseReductionEnabled;
  const setAudioLevelingEnabled = ctx.setAudioLevelingEnabled;
  const setAudioNoiseReductionEnabled = ctx.setAudioNoiseReductionEnabled;
  const setStudioRackBackend = ctx.setStudioRackBackend;
  const setStudioRackBypassed = ctx.setStudioRackBypassed;
  const setStudioRackEnabled = ctx.setStudioRackEnabled;
  const setStudioRackModuleBypassed = ctx.setStudioRackModuleBypassed;
  const setStudioRackModuleEnabled = ctx.setStudioRackModuleEnabled;
  const setStudioRackOpen = ctx.setStudioRackOpen;
  const studioRackOpen = ctx.studioRackOpen;
  const setFocusOverride = ctx.setFocusOverride;
  const audioFinalizationCompareMode = ctx.audioFinalizationCompareMode;
  const setAudioFinalizationCompare = ctx.setAudioFinalizationCompare;
  const applyVoicePolishPreset = ctx.applyVoicePolishPreset;
  const voicePolish = ctx.voicePolish;
  const setVoicePolishFixEnabled = ctx.setVoicePolishFixEnabled;
  const setVoicePolishDeEsserStrength = ctx.setVoicePolishDeEsserStrength;
  const setVoicePolishEqProfile = ctx.setVoicePolishEqProfile;
  const setVoiceCleanupEnabled = ctx.setVoiceCleanupEnabled;
  const editableAudioPolish = ctx.editableAudioPolish;
  const persistedAudioCutCount = ctx.persistedAudioCutCount;
  const effectivePlaybackCutRegions = ctx.effectivePlaybackCutRegions;
  const silenceSuggestionCount = ctx.silenceSuggestionCount;
  const editableStudioRack = ctx.editableStudioRack;
  const studioRackPlaybackConfig = ctx.studioRackPlaybackConfig;
  const studioRackPlaybackBackendResolution = ctx.studioRackPlaybackBackendResolution;
  const studioRackRenderConfig = ctx.studioRackRenderConfig;
  const studioRackRenderBackendResolution = ctx.studioRackRenderBackendResolution;
  const studioRackRenderStatus = ctx.studioRackRenderStatus;
  const studioRackRenderAppliedModules = ctx.studioRackRenderAppliedModules;
  const studioRackRenderDeferredModules = ctx.studioRackRenderDeferredModules;
  const studioRackEnabledModuleCount = ctx.studioRackEnabledModuleCount;
  const studioRackComparePreviewStatusLabel = ctx.studioRackComparePreviewStatusLabel;
  const podcastMasterLayer = ctx.podcastMasterLayer;
  const podcastMasterUiStatus = ctx.podcastMasterUiStatus;
  const packaging = props.model as PackagingFinishingSurfaceModel;
  const { introOutroSelectedIntroPath, introOutroSelectedOutroPath, introOutroSelection, packagingIntroPlacement, packagingOutroPlacement, packagingLogoAssetPath, packagingLogoPlacement, packagingLogoPosition, packagingLogoSize, sourceImageLibraryItems, LOGO_POSITION_OPTIONS, LOGO_SIZE_OPTIONS, PACKAGING_INTRO_ENTRY_ID, PACKAGING_OUTRO_ENTRY_ID, applyIntroPlacement, applyOutroPlacement, removePackagingPlacement, applyLogoOverlayStyle, toggleLogoOverlay, finishingChecklist, setFinishingChecklist } = packaging;
  const introStatusView = derivePackagingIntroStatusView({ selectedIntroAssetId: introOutroSelection.intro_asset_id, selectedIntroPath: introOutroSelectedIntroPath, introPlaced: Boolean(packagingIntroPlacement) });

  const transcript = props.model as TranscriptSurfaceModel;
  const { hasSilenceSuggestionAnalysis, silenceCutSuggestions, visibleSilenceCutSuggestions, acceptSilenceCutSuggestion, dismissSilenceCutSuggestion, seekPlayheadToTime, activeReviewKind, setActiveReviewKind, setActiveTranscriptToolSection, refreshCleanupCandidateQueue, fillerCleanupOptions, setFillerCleanupOptions, activeFillerCandidateCard, fillerActiveCandidateIndex, fillerCandidateCards, activeFillerCandidateDiffOps, candidateReceiptByKind, candidateProposedRemovalById, selectedTranscriptRange, updateCandidateProposedRemoval, fillerDecisionInFlight, handleCandidateDecision, retakeCleanupOptions, setRetakeCleanupOptions, activeRetakeCandidateCard, retakeActiveCandidateIndex, retakeCandidateCards, retakeDecisionInFlight, deadAirThresholdSec, setDeadAirThresholdSec, analyzeDeadAirClosure, deadAirApplyInFlight, deadAirAnalysis, applyDeadAirClosureBatch, polishStrength, setPolishStrength, gapCleanupOptions, setGapCleanupOptions, setCleanupPreview, previewShortenGaps, previewRemoveFillers, previewRemoveRetakes, previewQuickClean, editableTranscriptSegments, speakerSoloOptions, setSpeakerSoloOptions, speakerOptions, previewSpeakerSolo, hasTranscriptSelection, transcriptSelectionRange, speakerInterviewOptions, setSpeakerInterviewOptions, previewSpeakerInterview, speakerMonologueOptions, setSpeakerMonologueOptions, previewSpeakerMonologue, speakerPanelOptions, setSpeakerPanelOptions, previewSpeakerPanel, cleanupPreview, cleanupPreviewSummary, applyCleanup, cleanupReceipt } = transcript;
  const silenceSuggestionCountForGaps = transcript.silenceSuggestionCount;
  function getCommittedProposedRemovalText(card: HammerCleanupCandidateCard | null): string { if (!card) return ""; return candidateProposedRemovalById[card.id]?.text ?? card.suggestedRemovalText ?? ""; }
  function getDisplayedProposedRemovalText(card: HammerCleanupCandidateCard | null): string { const committedText = getCommittedProposedRemovalText(card); if (committedText.trim()) return committedText; return selectedTranscriptRange?.text ?? ""; }

  return <div data-hammer-tool-bay-surface={surface}>
{surface === "audio_finalization" || surface === "audio_adjustments" ? (
                surface === "audio_finalization" ? (
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
                      setStudioRackOpen((current: boolean) => !current);
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
                            onChange={(event) => applyStudioRackMutation("Adjust gate threshold", (current: HammerStudioRackState) => ({
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
                            onChange={(event) => applyStudioRackMutation("Adjust compressor ratio", (current: HammerStudioRackState) => ({
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
                            onChange={(event) => applyStudioRackMutation("Adjust EQ mid gain", (current: HammerStudioRackState) => ({
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
                            onChange={(event) => applyStudioRackMutation("Adjust reverb mix", (current: HammerStudioRackState) => ({
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
                            onChange={(event) => applyStudioRackMutation("Adjust Tube Mic Character amount", (current: HammerStudioRackState) => ({
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

              {surface === "captions" ? (
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
                        setCaptionFormatting((current: HammerCaptionFormattingState) => ({
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
                        setCaptionFormatting((current: HammerCaptionFormattingState) => ({ ...current, maxCharsPerLine: nextValue }));
                      }}
                    />
                  </label>
                  <label className="hammer-tool-field">
                    <span>Max lines per caption</span>
                    <select
                      value={captionFormatting.maxLinesPerCaption}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setCaptionFormatting((current: HammerCaptionFormattingState) => ({
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
                        setCaptionFormatting((current: HammerCaptionFormattingState) => ({
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
                        setCaptionFormatting((current: HammerCaptionFormattingState) => ({
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
                        setCaptionFormatting((current: HammerCaptionFormattingState) => ({
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

              {surface === "metadata" ? (
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

              
                  {surface === "transcript_cleanup" || surface === "retakes" || surface === "gap_pacing" || surface === "transcript_polish" ? (
                    surface !== "transcript_polish" ? (
                      <section className="hammer-tool-card">
                        <header className="hammer-tool-card__head">
                          Transcript Cleanup
                        </header>
                        <div className="hammer-tool-hint">
                          Review filler candidates first, then retake candidates below. Shortcuts: Fillers (1), Retakes (2), Approve (A), Reject (R), Prev/Next (K/J).
                        </div>

                    <div role="group" aria-label="Filler cleanup" onFocusCapture={() => {
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
                      <div className="hammer-candidate-review__actions">
                        <button
                          type="button"
                          aria-label="Refresh filler candidates"
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            refreshCleanupCandidateQueue("fillers");
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

                    <div role="group" aria-label="Retake review" onFocusCapture={() => {
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
                      <div className="hammer-candidate-review__actions">
                        <button
                          type="button"
                          aria-label="Refresh retake candidates"
                          onClick={() => {
                            setFocusOverride("tool-focus");
                            refreshCleanupCandidateQueue("retakes");
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
                            {activeRetakeCandidateCard.beforeText.split("\n").map((line, idx) => (
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

                    <div
                      role="group"
                      aria-label="Silence gap cleanup"
                      onFocusCapture={() => setActiveTranscriptToolSection("silence_gaps")}
                    >
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


              {surface === "packaging" || surface === "finishing" ? (
                surface === "packaging" ? (
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



  </div>;
}
