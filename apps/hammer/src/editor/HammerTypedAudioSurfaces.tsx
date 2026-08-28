import type { JSX } from "react";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerAudioAdjustmentsToolBayContext, HammerAudioFinalizationToolBayContext } from "./hammerToolBayContext";

type AudioSurfaceContext = HammerAudioFinalizationToolBayContext | HammerAudioAdjustmentsToolBayContext;

export function HammerTypedAudioSurfaces(props: { context: AudioSurfaceContext }): JSX.Element {
  return props.context.surface === "audio_finalization" ? <AudioFinalizationSurface context={props.context} /> : <AudioAdjustmentsSurface context={props.context} />;
}

function AudioFinalizationSurface(props: { context: HammerAudioFinalizationToolBayContext }): JSX.Element {
  const { commands, data, surface } = props.context;
  const { compareMode: audioFinalizationCompareMode, voicePolish } = data;
  const setVoiceCleanupEnabled = commands.setVoiceCleanupEnabled;
  const setVoicePolishFixEnabled = commands.setVoiceFixEnabled;
  const applyVoicePolishPreset = commands.applyVoicePreset;
  const setAudioFinalizationCompare = commands.setCompareMode;
  const setVoicePolishDeEsserStrength = commands.setDeEsserStrength;
  const setVoicePolishEqProfile = commands.setEqProfile;
  return <div data-hammer-tool-bay-surface={surface}>
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
                          onChange={(event) => setVoicePolishDeEsserStrength(event.target.value === "low" || event.target.value === "high" ? event.target.value : "medium")}
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
                          onChange={(event) => setVoicePolishEqProfile(event.target.value === "flat" || event.target.value === "bright" ? event.target.value : "voice")}
                        >
                          <option value="flat">Flat</option>
                          <option value="voice">Voice</option>
                          <option value="bright">Bright</option>
                        </select>
                      </label>
                    </details>
                  </section>
                ) : (
  </div>;
}

function AudioAdjustmentsSurface(props: { context: HammerAudioAdjustmentsToolBayContext }): JSX.Element {
  const { commands, data, surface } = props.context;
  const { editableAudioPolish, persistedAudioCutCount, effectivePlaybackCutRegions, silenceSuggestionCount, editableStudioRack, studioRackPlaybackConfig, studioRackPlaybackBackendResolution, studioRackRenderConfig, studioRackRenderBackendResolution, studioRackRenderStatus, studioRackRenderAppliedModules, studioRackRenderDeferredModules, studioRackEnabledModuleCount, studioRackComparePreviewStatusLabel, studioRackOpen, podcastMasterLayer, podcastMasterUiStatus } = data;
  const applyPodcastMasterPass = commands.applyPodcastMaster;
  const applyStudioRackMutation = commands.applyRackMutation;
  const setStudioRackBackend = commands.setRackBackend;
  const setStudioRackBypassed = commands.setRackBypassed;
  const setStudioRackEnabled = commands.setRackEnabled;
  const setStudioRackModuleBypassed = commands.setModuleBypassed;
  const setStudioRackModuleEnabled = commands.setModuleEnabled;
  const setStudioRackOpen = (_next: boolean | ((current: boolean) => boolean)): void => commands.toggleRack();
  return <div data-hammer-tool-bay-surface={surface}>
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
                      commands.focusTool();
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
                      checked={editableAudioPolish?.prepared_passes?.includes("level_consistency") === true}
                      disabled
                      readOnly
                    />
                    <span>Baseline level consistency applied during preparation</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={editableAudioPolish?.prepared_passes?.includes("noise_cleanup") === true}
                      disabled
                      readOnly
                    />
                    <span>Baseline noise cleanup applied during preparation</span>
                  </label>
                </section>
  </div>;
}
