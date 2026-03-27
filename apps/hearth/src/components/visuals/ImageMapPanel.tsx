import { useEffect, useRef, useState } from "react";
import {
  EPISODE_IMAGE_MAP_VISUAL_PRIORITY_VALUES,
  EPISODE_IMAGE_MAP_VISUAL_TYPE_VALUES,
  EPISODE_IMAGE_MAP_INTENT_VALUES,
  EPISODE_IMAGE_MAP_SOURCE_TYPE_VALUES,
  buildImageMapAnchorLabel,
  type EpisodeImageMapEntry,
} from "../../lib/episode-package-v2";
import { HEARTH_VISUAL_STYLE_DEFINITIONS } from "../../lib/hearth-visual-styles";
import type {
  ImageMapAnchorPickerParagraph,
  ImageMapScriptSelection,
} from "../../lib/hearth-image-map-beats";

type ImageMapSaveState = "saved" | "editing" | "saving" | "error" | "offline";

type ImageMapCandidateCard = {
  id: string;
  variantLabel: string;
  visualMode: string | null;
  isSelected: boolean;
  previewState: "loading" | "ready" | "error";
  previewDataUrl: string | null;
  previewError: string | null;
};

type ImageMapPanelProps = {
  panelTitle?: string;
  manualOnly?: boolean;
  entries: EpisodeImageMapEntry[];
  selectedEntryId: string | null;
  draftAnchor: string;
  draftDescription: string;
  draftStylePreset: string;
  draftIntent: string;
  draftSourceType: string;
  draftVisualPriority: string;
  draftVisualType: string;
  draftSectionIntentNote: string;
  draftPlacementHint: string;
  saveState: ImageMapSaveState;
  saveError: string | null;
  exportMessage: string | null;
  candidateCards: ImageMapCandidateCard[];
  candidateGenerateBusy: boolean;
  candidateGenerateError: string | null;
  candidateSelectBusy: boolean;
  candidateSelectionError: string | null;
  anchorStatusLabel: string | null;
  anchorStatusTone: "neutral" | "ok" | "warning" | "danger";
  anchorStatusDetail: string | null;
  reanchorMode: boolean;
  reanchorBusy: boolean;
  reanchorDisabledReason: string | null;
  nearestRepairAvailable: boolean;
  reanchorError: string | null;
  reanchorScriptSourceLabel: string | null;
  reanchorScriptHint: string | null;
  reanchorScriptLoading: boolean;
  reanchorParagraphs: ImageMapAnchorPickerParagraph[];
  activeAnchorLabel: string | null;
  disabled?: boolean;
  onSelectEntry: (entryId: string) => void;
  onDraftAnchorChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
  onDraftStylePresetChange: (value: string) => void;
  onDraftIntentChange: (value: string) => void;
  onDraftSourceTypeChange: (value: string) => void;
  onDraftVisualPriorityChange: (value: string) => void;
  onDraftVisualTypeChange: (value: string) => void;
  onDraftSectionIntentNoteChange: (value: string) => void;
  onDraftPlacementHintChange: (value: string) => void;
  onCreateEntry: () => void;
  onDuplicateEntry: () => void;
  onDeleteEntry: () => void;
  onSeedFromScript: () => void;
  onGenerateCandidates: (mode?: "ai" | "stock") => void;
  onUploadAsset: (file: File) => void;
  onSelectCandidate: (candidateId: string) => void;
  onCopyExport: () => void;
  onDownloadExport: () => void;
  onStartReanchor: () => void;
  onRepairNearestParagraph: () => void;
  onConvertToGlobalVisual: () => void;
  onLeaveOrphaned: () => void;
  onCancelReanchor: () => void;
  onPickReanchor: (selection: ImageMapScriptSelection) => void;
};

function summarizeDescription(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No description";
  if (compact.length <= 60) return compact;
  return `${compact.slice(0, 57).trimEnd()}...`;
}

function formatSaveState(state: ImageMapSaveState): string {
  if (state === "saved") return "Saved";
  if (state === "editing") return "Editing";
  if (state === "saving") return "Saving...";
  if (state === "offline") return "Offline";
  return "Save failed";
}

function resolveInitialPreviewCandidateId(candidateCards: ImageMapCandidateCard[]): string | null {
  return candidateCards.find((candidate) => candidate.isSelected)?.id
    ?? candidateCards[0]?.id
    ?? null;
}

export default function ImageMapPanel({
  panelTitle,
  manualOnly = false,
  entries,
  selectedEntryId,
  draftAnchor,
  draftDescription,
  draftStylePreset,
  draftIntent,
  draftSourceType,
  draftVisualPriority,
  draftVisualType,
  draftSectionIntentNote,
  draftPlacementHint,
  saveState,
  saveError,
  exportMessage,
  candidateCards,
  candidateGenerateBusy,
  candidateGenerateError,
  candidateSelectBusy,
  candidateSelectionError,
  anchorStatusLabel,
  anchorStatusTone,
  anchorStatusDetail,
  reanchorMode,
  reanchorBusy,
  reanchorDisabledReason,
  nearestRepairAvailable,
  reanchorError,
  reanchorScriptSourceLabel,
  reanchorScriptHint,
  reanchorScriptLoading,
  reanchorParagraphs,
  activeAnchorLabel,
  disabled = false,
  onSelectEntry,
  onDraftAnchorChange,
  onDraftDescriptionChange,
  onDraftStylePresetChange,
  onDraftIntentChange,
  onDraftSourceTypeChange,
  onDraftVisualPriorityChange,
  onDraftVisualTypeChange,
  onDraftSectionIntentNoteChange,
  onDraftPlacementHintChange,
  onCreateEntry,
  onDuplicateEntry,
  onDeleteEntry,
  onSeedFromScript,
  onGenerateCandidates,
  onUploadAsset,
  onSelectCandidate,
  onCopyExport,
  onDownloadExport,
  onStartReanchor,
  onRepairNearestParagraph,
  onConvertToGlobalVisual,
  onLeaveOrphaned,
  onCancelReanchor,
  onPickReanchor,
}: ImageMapPanelProps) {
  const resolvedPanelTitle = panelTitle?.trim() || (manualOnly ? "Visual Beats" : "Image Map");
  const entryLabel = manualOnly ? "Anchor" : "Entry";
  const hasSelection = Boolean(selectedEntryId);
  const selectedCandidateId = candidateCards.find((candidate) => candidate.isSelected)?.id ?? null;
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(
    () => resolveInitialPreviewCandidateId(candidateCards),
  );

  useEffect(() => {
    if (candidateCards.length === 0) {
      if (previewCandidateId !== null) {
        setPreviewCandidateId(null);
      }
      return;
    }
    if (selectedCandidateId && selectedCandidateId !== previewCandidateId) {
      setPreviewCandidateId(selectedCandidateId);
      return;
    }
    if (previewCandidateId && candidateCards.some((candidate) => candidate.id === previewCandidateId)) {
      return;
    }
    setPreviewCandidateId(resolveInitialPreviewCandidateId(candidateCards));
  }, [candidateCards, previewCandidateId, selectedCandidateId]);

  const previewCandidate = candidateCards.find((candidate) => candidate.id === previewCandidateId) ?? null;
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="hs-imap-panel" aria-label={`${resolvedPanelTitle} panel`}>
      <header className="hs-imap-header">
        <div className="hs-imap-title">{resolvedPanelTitle}</div>
        <div className={`hs-imap-save-state is-${saveState}`}>{formatSaveState(saveState)}</div>
      </header>

      <div className="hs-imap-toolbar">
        <button
          type="button"
          onClick={onCreateEntry}
          disabled={disabled}
        >
          New {entryLabel}
        </button>
        <button
          type="button"
          onClick={onDuplicateEntry}
          disabled={disabled || !hasSelection}
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={onDeleteEntry}
          disabled={disabled || !hasSelection}
        >
          Delete
        </button>
        {!manualOnly ? (
          <button
            type="button"
            onClick={onSeedFromScript}
            disabled={disabled}
          >
            Generate from Script
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCopyExport}
          disabled={disabled}
        >
          Copy JSON
        </button>
        <button
          type="button"
          onClick={onDownloadExport}
          disabled={disabled}
        >
          Download JSON
        </button>
      </div>

      <div className="hs-imap-layout">
        <section className="hs-imap-list" aria-label={`${resolvedPanelTitle} entries list`}>
          {entries.length === 0 ? (
            <div className="hs-imap-empty">No entries yet.</div>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`hs-imap-row${entry.id === selectedEntryId ? " is-selected" : ""}`}
                onClick={() => onSelectEntry(entry.id)}
                disabled={disabled}
              >
                <div className="hs-imap-row-anchor">{entry.anchor}</div>
                <div className="hs-imap-row-meta">
                  {manualOnly
                    ? `${entry.intent} · ${entry.source_type} · ${entry.visual_priority ?? "supporting"} · ${entry.visual_type ?? "still_image"}`
                    : `${entry.intent} · ${entry.source_type} · ${entry.candidate_assets.length} candidates`}
                </div>
                <div className="hs-imap-row-desc">{summarizeDescription(entry.description)}</div>
              </button>
            ))
          )}
        </section>

        <section className="hs-imap-editor" aria-label={`${resolvedPanelTitle} entry editor`}>
          {!hasSelection ? (
            <div className="hs-imap-empty">Select or create an {entryLabel.toLowerCase()} to edit.</div>
          ) : (
            <>
              {/* ── CUE CARD SUMMARY ─────────────────────────────────── */}
              <div className="hs-imap-cue-card" aria-label="Visual beat summary">
                <div className="hs-imap-cue-row">
                  <span className="hs-imap-cue-key">WHEN</span>
                  <span className="hs-imap-cue-val">{draftAnchor || "—"}{draftPlacementHint ? ` · ${draftPlacementHint}` : ""}</span>
                </div>
                <div className="hs-imap-cue-row">
                  <span className="hs-imap-cue-key">PRIORITY</span>
                  <span className="hs-imap-cue-val">{draftVisualPriority || "—"}</span>
                </div>
                <div className="hs-imap-cue-row">
                  <span className="hs-imap-cue-key">TYPE</span>
                  <span className="hs-imap-cue-val">{draftVisualType || "—"}</span>
                </div>
                <div className="hs-imap-cue-row">
                  <span className="hs-imap-cue-key">STYLE</span>
                  <span className="hs-imap-cue-val">{draftStylePreset || "—"}</span>
                </div>
                <div className="hs-imap-cue-row">
                  <span className="hs-imap-cue-key">INTENT</span>
                  <span className="hs-imap-cue-val">{draftIntent || "—"}</span>
                </div>
              </div>

              {/* ── VISUAL BEAT (hero) ────────────────────────────────── */}
              <section className="hs-imap-beat-section" aria-label="Visual beat">
                <div className="hs-imap-beat-section-title">Visual Beat</div>
                <label className="hs-field hs-imap-description-field">
                  <span className="hs-field-label">What viewers see</span>
                  <div className="hs-thumb-field-helper">Describe the image, framing, emotional tone, and subject.</div>
                  <textarea
                    value={draftDescription}
                    onChange={(event) => onDraftDescriptionChange(event.target.value)}
                    rows={5}
                    placeholder="A racing engine block overheating, flames licking the housing edge — engine is the subject, not the source."
                    disabled={disabled}
                    className="hs-imap-description-input"
                  />
                </label>
                <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                  <div className="hs-imap-candidate-action-group">
                    <button
                      type="button"
                      onClick={() => onGenerateCandidates("stock")}
                      disabled={disabled || candidateGenerateBusy}
                    >
                      {candidateGenerateBusy ? "Searching..." : "Find Stock"}
                    </button>
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={disabled || candidateSelectBusy}
                    >
                      {candidateSelectBusy ? "Saving..." : "Upload Asset"}
                    </button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*,video/*"
                      aria-label="Upload visual asset"
                      className="hs-imap-upload-input"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] ?? null;
                        if (file) {
                          onUploadAsset(file);
                        }
                        event.currentTarget.value = "";
                      }}
                      disabled={disabled || candidateSelectBusy}
                    />
                  </div>
                  <span className="hs-field-label-muted">
                    Hearth authors the visual asset plan. Hammer consumes selected assets for deterministic placement.
                  </span>
                </div>
                <div className="hs-imap-beat-selects">
                  <label className="hs-field">
                    <span className="hs-field-label">Visual Style</span>
                    <select
                      value={draftStylePreset}
                      onChange={(event) => onDraftStylePresetChange(event.target.value)}
                      disabled={disabled}
                    >
                      {HEARTH_VISUAL_STYLE_DEFINITIONS.map((style) => (
                        <option key={style.value} value={style.value}>
                          {style.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hs-field">
                    <span className="hs-field-label">Intent</span>
                    <select
                      value={draftIntent}
                      onChange={(event) => onDraftIntentChange(event.target.value)}
                      disabled={disabled}
                    >
                      {EPISODE_IMAGE_MAP_INTENT_VALUES.map((intent) => (
                        <option key={intent} value={intent}>
                          {intent}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hs-field">
                    <span className="hs-field-label">Visual Priority</span>
                    <select
                      value={draftVisualPriority}
                      onChange={(event) => onDraftVisualPriorityChange(event.target.value)}
                      disabled={disabled}
                    >
                      {EPISODE_IMAGE_MAP_VISUAL_PRIORITY_VALUES.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hs-field">
                    <span className="hs-field-label">Visual Type</span>
                    <select
                      value={draftVisualType}
                      onChange={(event) => onDraftVisualTypeChange(event.target.value)}
                      disabled={disabled}
                    >
                      {EPISODE_IMAGE_MAP_VISUAL_TYPE_VALUES.map((visualType) => (
                        <option key={visualType} value={visualType}>
                          {visualType}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              {/* ── TIMELINE LINK (collapsible secondary) ────────────── */}
              <details className="hs-imap-collapsible-section">
                <summary className="hs-imap-collapsible-title">Timeline Link</summary>
                <div className="hs-imap-collapsible-body">
                  <div className="hs-field-label-muted">Controls when and where this beat appears in the edit timeline. Consumed by Hammer.</div>
                  <label className="hs-field">
                    <span className="hs-field-label">Anchor</span>
                    <input
                      type="text"
                      value={draftAnchor}
                      onChange={(event) => onDraftAnchorChange(event.target.value)}
                      placeholder="s1:para1"
                      disabled={disabled}
                    />
                  </label>
                  <section className="hs-imap-anchor-card" aria-label="Exact script anchor">
                    <div className="hs-imap-section-heading">
                      <div className="hs-thumb-section-title">Script Anchor</div>
                      {anchorStatusLabel ? (
                        <div className={`hs-imap-anchor-status is-${anchorStatusTone}`}>{anchorStatusLabel}</div>
                      ) : null}
                    </div>
                    <div className="hs-field-label-muted">
                      {manualOnly
                        ? "Visual Beats binds each anchor to an exact structured span in the canonical script."
                        : "Candidate generation only trusts a structured anchor bound to the current canonical script."}
                    </div>
                    {anchorStatusDetail ? (
                      <div className="hs-imap-anchor-detail">{anchorStatusDetail}</div>
                    ) : null}
                    {reanchorDisabledReason ? (
                      <div className="hs-field-label-muted">{reanchorDisabledReason}</div>
                    ) : null}
                    <div className="hs-imap-anchor-actions">
                      <button
                        type="button"
                        onClick={reanchorMode ? onCancelReanchor : onStartReanchor}
                        disabled={disabled || Boolean(reanchorDisabledReason) || reanchorBusy}
                      >
                        {reanchorBusy ? "Saving..." : reanchorMode ? "Cancel Re-anchor" : "Re-anchor"}
                      </button>
                      <span className="hs-field-label-muted">
                        Editing the anchor label alone does not rebuild the canonical script anchor.
                      </span>
                    </div>
                    <div className="hs-imap-anchor-actions">
                      <button
                        type="button"
                        onClick={onRepairNearestParagraph}
                        disabled={disabled || !nearestRepairAvailable || reanchorBusy}
                      >
                        Reattach nearest paragraph
                      </button>
                      <button
                        type="button"
                        onClick={onConvertToGlobalVisual}
                        disabled={disabled || reanchorBusy}
                      >
                        Convert to global visual
                      </button>
                      <button
                        type="button"
                        onClick={onLeaveOrphaned}
                        disabled={disabled || reanchorBusy}
                      >
                        Leave orphaned
                      </button>
                    </div>
                    {reanchorMode ? (
                      <div className="hs-imap-anchor-picker">
                        <div className="hs-imap-section-heading">
                          <div className="hs-thumb-section-title">Pick from Current Script</div>
                          {reanchorScriptSourceLabel ? (
                            <div className="hs-field-label-muted">{reanchorScriptSourceLabel}</div>
                          ) : null}
                        </div>
                        {reanchorScriptHint ? (
                          <div className="hs-field-label-muted">{reanchorScriptHint}</div>
                        ) : null}
                        {reanchorError ? (
                          <div className="hs-imap-preview-empty is-error">{reanchorError}</div>
                        ) : null}
                        {reanchorScriptLoading ? (
                          <div className="hs-imap-empty">Loading current script...</div>
                        ) : reanchorParagraphs.length === 0 ? (
                          <div className="hs-imap-empty">No canonical script spans are available yet.</div>
                        ) : (
                          <div className="hs-imap-anchor-picker-list">
                            {reanchorParagraphs.map((paragraph) => {
                              const paragraphAnchorLabel = buildImageMapAnchorLabel(paragraph.paragraphOption.anchor);
                              return (
                                <article key={paragraph.key} className="hs-imap-anchor-picker-paragraph">
                                  <div className="hs-imap-anchor-picker-heading">
                                    <div className="hs-imap-anchor-picker-label">{paragraph.label}</div>
                                    <button
                                      type="button"
                                      className={`hs-imap-anchor-picker-option hs-imap-anchor-picker-option-paragraph${activeAnchorLabel === paragraphAnchorLabel ? " is-active" : ""}`}
                                      onClick={() => onPickReanchor(paragraph.paragraphOption.selection)}
                                      disabled={disabled || reanchorBusy}
                                    >
                                      Use full paragraph
                                    </button>
                                  </div>
                                  <div className="hs-imap-anchor-picker-text">{paragraph.text}</div>
                                  <div className="hs-imap-anchor-picker-options">
                                    {paragraph.sentenceOptions.map((option) => {
                                      const optionAnchorLabel = buildImageMapAnchorLabel(option.anchor);
                                      return (
                                        <button
                                          key={option.key}
                                          type="button"
                                          className={`hs-imap-anchor-picker-option${activeAnchorLabel === optionAnchorLabel ? " is-active" : ""}`}
                                          onClick={() => onPickReanchor(option.selection)}
                                          disabled={disabled || reanchorBusy}
                                        >
                                          <span className="hs-imap-anchor-picker-option-label">{option.label}</span>
                                          <span className="hs-imap-anchor-picker-option-text">{option.text}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </section>
                  <label className="hs-field">
                    <span className="hs-field-label">Placement Hint</span>
                    <input
                      type="text"
                      value={draftPlacementHint}
                      onChange={(event) => onDraftPlacementHintChange(event.target.value)}
                      placeholder="first occurrence"
                      disabled={disabled}
                    />
                  </label>
                  <label className="hs-field">
                    <span className="hs-field-label">Section Intent Note</span>
                    <textarea
                      value={draftSectionIntentNote}
                      onChange={(event) => onDraftSectionIntentNoteChange(event.target.value)}
                      rows={3}
                      placeholder="Section-level visual direction"
                      disabled={disabled}
                    />
                  </label>
                </div>
              </details>

              {/* ── MEDIA SOURCE (collapsible advanced) ──────────────── */}
              <details className="hs-imap-collapsible-section">
                <summary className="hs-imap-collapsible-title">Visual Asset</summary>
                <div className="hs-imap-collapsible-body">
                  <div className="hs-field-label-muted">How this visual will be sourced for production.</div>
                  <label className="hs-field">
                    <span className="hs-field-label">Source Type</span>
                    <select
                      value={draftSourceType}
                      onChange={(event) => onDraftSourceTypeChange(event.target.value)}
                      disabled={disabled}
                    >
                      {EPISODE_IMAGE_MAP_SOURCE_TYPE_VALUES.map((sourceType) => (
                        <option key={sourceType} value={sourceType}>
                          {sourceType}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
              <>
                <section className="hs-imap-preview" aria-label="Still preview">
                    <div className="hs-imap-section-heading">
                      <div className="hs-thumb-section-title">Preview</div>
                      {previewCandidate ? (
                        <div className="hs-field-label-muted">
                          Viewing {previewCandidate.variantLabel} · {previewCandidate.visualMode ?? "editorial"}
                        </div>
                      ) : null}
                    </div>
                    <div className="hs-imap-preview-frame">
                      {!previewCandidate ? (
                        <div className="hs-imap-preview-empty">No still candidates generated yet.</div>
                      ) : previewCandidate.previewState === "ready" && previewCandidate.previewDataUrl ? (
                        <img
                          src={previewCandidate.previewDataUrl}
                          alt={`${previewCandidate.variantLabel} still candidate preview`}
                          className="hs-imap-preview-image"
                        />
                      ) : (
                        <div className={`hs-imap-preview-empty${previewCandidate.previewState === "error" ? " is-error" : ""}`}>
                          {previewCandidate.previewState === "loading"
                            ? "Loading preview..."
                            : previewCandidate.previewError || "Preview unavailable"}
                        </div>
                      )}
                    </div>
                    {previewCandidate ? (
                      <div className="hs-imap-preview-actions">
                        <span className="hs-field-label-muted">
                          Preview a candidate below, then use the button to assign it to this visual beat.
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectCandidate(previewCandidate.id)}
                          disabled={disabled || candidateGenerateBusy || candidateSelectBusy}
                        >
                          {previewCandidate.isSelected
                            ? "Selected for Beat"
                            : candidateSelectBusy
                              ? "Saving..."
                              : "Use This Image"}
                        </button>
                      </div>
                    ) : null}
                </section>
                <section className="hs-imap-candidates" aria-label="Still candidates">
                    {candidateCards.length === 0 ? (
                      <div className="hs-imap-empty">No still candidates generated yet.</div>
                    ) : (
                      candidateCards.map((candidate) => (
                        <article
                          key={candidate.id}
                          className={`hs-imap-candidate-card${candidate.isSelected ? " is-selected" : ""}${candidate.id === previewCandidateId ? " is-previewing" : ""}`}
                        >
                          <button
                            type="button"
                            className="hs-imap-candidate-preview-trigger"
                            onClick={() => setPreviewCandidateId(candidate.id)}
                            disabled={disabled || candidateGenerateBusy || candidateSelectBusy}
                          >
                            <div className="hs-imap-candidate-media">
                              {candidate.previewState === "ready" && candidate.previewDataUrl ? (
                                <img
                                  src={candidate.previewDataUrl}
                                  alt={`${candidate.variantLabel} still candidate`}
                                  className="hs-imap-candidate-image"
                                />
                              ) : (
                                <div className={`hs-imap-candidate-placeholder is-${candidate.previewState}`}>
                                  {candidate.previewState === "loading" ? "Loading preview..." : "Preview unavailable"}
                                </div>
                              )}
                            </div>
                            <div className="hs-imap-candidate-meta">
                              <div className="hs-imap-candidate-title">
                                {candidate.variantLabel}
                                {candidate.id === previewCandidateId ? (
                                  <span className="hs-imap-candidate-badge is-preview">Previewing</span>
                                ) : null}
                                {candidate.isSelected ? <span className="hs-imap-candidate-badge">Selected</span> : null}
                              </div>
                              <div className="hs-imap-candidate-subtitle">
                                {candidate.visualMode ?? "editorial"}
                              </div>
                              {candidate.previewError ? (
                                <div className="hs-error-text-small">{candidate.previewError}</div>
                              ) : null}
                            </div>
                          </button>
                          <div className="hs-imap-candidate-actions">
                            <button
                              type="button"
                              className="hs-imap-candidate-apply"
                              onClick={() => onSelectCandidate(candidate.id)}
                              disabled={disabled || candidateGenerateBusy || candidateSelectBusy}
                            >
                              {candidate.isSelected ? "Selected for Beat" : "Use This Image"}
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                </section>
              </>
            </>
          )}
        </section>
      </div>

      {saveError ? (
        <div className="hs-error-text-small">{saveError}</div>
      ) : null}
      {candidateGenerateError ? (
        <div className="hs-error-text-small">{candidateGenerateError}</div>
      ) : null}
      {candidateSelectionError ? (
        <div className="hs-error-text-small">{candidateSelectionError}</div>
      ) : null}
      {exportMessage ? (
        <div className="hs-field-label-muted">{exportMessage}</div>
      ) : null}
    </section>
  );
}
