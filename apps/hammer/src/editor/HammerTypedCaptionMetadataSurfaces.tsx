import type { JSX } from "react";
import type { HammerCaptionArtifactMode, HammerCaptionBuildState, HammerCaptionEditedState, HammerCaptionFormattingState, HammerCaptionPunctuationMode, HammerCaptionReadingSpeed } from "./hammerWorkspaceShellCaptionUtils";
import type { HammerCaptionsToolBayContext, HammerMetadataToolBayContext } from "./hammerToolBayContext";

type CaptionMetadataSurfaceContext = HammerCaptionsToolBayContext | HammerMetadataToolBayContext;

export function HammerTypedCaptionMetadataSurfaces(props: { context: CaptionMetadataSurfaceContext }): JSX.Element {
  const { surface } = props.context;
  type Command = (...args: unknown[]) => void;
  type CaptionState = HammerCaptionBuildState | HammerCaptionEditedState;
  type SurfaceModel = Readonly<{
    activeCaptionArtifactText: string; activeCaptionMode: HammerCaptionArtifactMode; activeCaptionState: CaptionState | null;
    captionActiveModeLabel: string; captionActiveModeSourceLabel: string; captionArtifactStatusLabel: string; captionBuildFeedback: string | null; captionBuildFreshness: string; captionBuildState: HammerCaptionBuildState | null; captionBuiltSummary: string; captionBuiltTone: string; captionDiscardConsequenceLabel: string | null; captionEditedBasisDetail: string; captionEditedChangeSummary: string; captionEditedState: HammerCaptionEditedState | null; captionEditedSummary: string; captionEditedTone: string; captionEditorRefs: { current: Map<string, HTMLTextAreaElement> }; captionFormatting: HammerCaptionFormattingState; captionRebuildConsequenceLabel: string; captionReleasePrepSafetyDetail: string; captionReleasePrepSafetyLabel: string; captionReleasePrepSafetyState: string; captionReleaseSourceLabel: string; captionSourceLabel: string; detailTag: string; selectedCaptionArtifactFormat: "srt" | "vtt";
    applyPodcastMasterPass: Command; applyStudioRackMutation: Command; setAudioLevelingEnabled: Command; setAudioNoiseReductionEnabled: Command; setStudioRackBackend: Command; setStudioRackBypassed: Command; setStudioRackEnabled: Command; setStudioRackModuleBypassed: Command; setStudioRackModuleEnabled: Command; setStudioRackOpen: Command; setFocusOverride: Command; setAudioFinalizationCompare: Command; applyVoicePolishPreset: Command; setVoicePolishFixEnabled: Command; setVoicePolishDeEsserStrength: Command; setVoicePolishEqProfile: Command; setVoiceCleanupEnabled: Command; handleDiscardEditedCaptions: Command; handleEditCaptionChunkText: Command; handleEnableCaptionEdits: Command; handleMergeEditedCaptionChunk: Command; handleNormalizeEditedCaptionChunkPunctuation: Command; handleRebuildCaptionArtifacts: Command; handleSplitEditedCaptionChunk: Command; handleToggleEditedCaptionChunkSpeakerLabel: Command; setActiveCaptionArtifactMode: Command; setCaptionFormatting: Command; setSelectedCaptionArtifactFormat: Command; setDetailTag: Command;
  }>;
  const ctx = props.context.data.model as SurfaceModel;
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
  const { setFocusOverride } = ctx;

  return <div data-hammer-tool-bay-surface={surface}>
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
