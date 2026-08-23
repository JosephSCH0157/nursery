import type { JSX } from "react";
import type { HammerCaptionArtifactMode, HammerCaptionBuildState, HammerCaptionEditedState, HammerCaptionFormattingState, HammerCaptionPunctuationMode, HammerCaptionReadingSpeed } from "./hammerWorkspaceShellCaptionUtils";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerVoicePolishState } from "./hammerVoicePolish";
import type { HammerToolBayContextSurface } from "./hammerToolBayContext";

export function HammerTypedAudioCaptionMetadataSurface(props: { surface: Extract<HammerToolBayContextSurface, "audio_finalization" | "audio_adjustments" | "captions" | "metadata">; model: unknown }): JSX.Element {
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

              
  </div>;
}
