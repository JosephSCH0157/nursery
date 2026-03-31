import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useClipboardButtonAcks } from "../../hooks/useClipboardButtonAcks";
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
import { resolveImageMapWorkflowGuidance } from "../../lib/hearth-image-map-workflow";
import {
  buildTimelineImagePromptPack,
  type PromptPack,
  type ResolvedVisualProvider,
  type VisualProviderId,
} from "../../lib/hearth-visual-provider-profiles";

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
  activeVisualProvider: ResolvedVisualProvider;
  visualProviderOptions: ReadonlyArray<{ id: VisualProviderId; label: string }>;
  visualProviderOverride: VisualProviderId | null;
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
  copyExportAcknowledged?: boolean;
  onDownloadExport: () => void;
  onVisualProviderOverrideChange: (providerId: VisualProviderId | null) => void;
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

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back when direct clipboard access is blocked.
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function downloadPromptPack(pack: PromptPack, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([JSON.stringify(pack, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
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
  activeVisualProvider,
  visualProviderOptions,
  visualProviderOverride,
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
  copyExportAcknowledged = false,
  onDownloadExport,
  onVisualProviderOverrideChange,
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
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;
  const selectedCandidateId = candidateCards.find((candidate) => candidate.isSelected)?.id ?? null;
  const workflowGuidance = resolveImageMapWorkflowGuidance({
    manualOnly,
    entryCount: entries.length,
    hasSelection,
    candidateCount: candidateCards.length,
    hasSelectedCandidate: Boolean(selectedCandidateId),
    sourceType: draftSourceType,
  });
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(
    () => resolveInitialPreviewCandidateId(candidateCards),
  );
  const [activePromptPack, setActivePromptPack] = useState<PromptPack | null>(null);
  const { acknowledgeCopy, isCopyAcknowledged } = useClipboardButtonAcks();

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

  useEffect(() => {
    setActivePromptPack(null);
  }, [
    activeVisualProvider.id,
    activeVisualProvider.usedFallback,
    draftAnchor,
    draftDescription,
    draftIntent,
    draftPlacementHint,
    draftSectionIntentNote,
    draftStylePreset,
    selectedEntryId,
  ]);

  const previewCandidate = candidateCards.find((candidate) => candidate.id === previewCandidateId) ?? null;
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const newEntryLabel = manualOnly ? "New Beat" : "New Entry";
  const seedFromScriptLabel = "Pull Beats from Script";
  const canGeneratePromptPack = Boolean(
    selectedEntry
    && (draftDescription.trim().length > 0 || selectedEntry.prompt_basis.trim().length > 0),
  );
  const promptPackButtonLabel = activePromptPack ? "Generate Prompt Pack Again" : "Generate Prompt Pack";
  const onGeneratePromptPack = useCallback(() => {
    if (!selectedEntry) return;
    const result = buildTimelineImagePromptPack({
      entry: selectedEntry,
      description: draftDescription,
      anchor: draftAnchor,
      stylePreset: draftStylePreset,
      intent: draftIntent,
      sectionIntentNote: draftSectionIntentNote,
      placementHint: draftPlacementHint,
      resolvedProvider: activeVisualProvider,
      aspectRatio: "16:9",
    });
    setActivePromptPack(result.pack);
  }, [
    activeVisualProvider,
    draftAnchor,
    draftDescription,
    draftIntent,
    draftPlacementHint,
    draftSectionIntentNote,
    draftStylePreset,
    selectedEntry,
  ]);
  const onCopyPromptPack = useCallback(() => {
    if (!activePromptPack) return;
    void copyTextToClipboard(activePromptPack.prompt).then((copied) => {
      if (copied) acknowledgeCopy("image-map-panel.prompt");
    });
  }, [acknowledgeCopy, activePromptPack]);
  const onCopyNegativePrompt = useCallback(() => {
    if (!activePromptPack?.negative) return;
    void copyTextToClipboard(activePromptPack.negative).then((copied) => {
      if (copied) acknowledgeCopy("image-map-panel.negative");
    });
  }, [acknowledgeCopy, activePromptPack]);
  const onDownloadPromptPack = useCallback(() => {
    if (!activePromptPack || !selectedEntry) return;
    downloadPromptPack(
      activePromptPack,
      `timeline-image-prompt-pack-${selectedEntry.id.slice(0, 8).toLowerCase()}.json`,
    );
  }, [activePromptPack, selectedEntry]);
  let primaryActionButton: ReactNode = null;

  if (workflowGuidance.primaryAction === "seed_from_script" && !manualOnly) {
    primaryActionButton = (
      <button
        type="button"
        className="hs-imap-primary-action"
        onClick={onSeedFromScript}
        disabled={disabled}
      >
        {workflowGuidance.primaryActionLabel}
      </button>
    );
  } else if (workflowGuidance.primaryAction === "new_entry") {
    primaryActionButton = (
      <button
        type="button"
        className="hs-imap-primary-action"
        onClick={onCreateEntry}
        disabled={disabled}
      >
        {workflowGuidance.primaryActionLabel}
      </button>
    );
  } else if (workflowGuidance.primaryAction === "find_stock") {
    primaryActionButton = (
      <button
        type="button"
        className="hs-imap-primary-action"
        onClick={() => onGenerateCandidates("stock")}
        disabled={disabled || candidateGenerateBusy}
      >
        {candidateGenerateBusy ? "Searching..." : workflowGuidance.primaryActionLabel}
      </button>
    );
  } else if (workflowGuidance.primaryAction === "upload_asset") {
    primaryActionButton = (
      <button
        type="button"
        className="hs-imap-primary-action"
        onClick={() => uploadInputRef.current?.click()}
        disabled={disabled || candidateSelectBusy}
      >
        {candidateSelectBusy ? "Saving..." : workflowGuidance.primaryActionLabel}
      </button>
    );
  } else if (workflowGuidance.primaryAction === "select_candidate" && previewCandidate) {
    primaryActionButton = (
      <button
        type="button"
        className="hs-imap-primary-action"
        onClick={() => onSelectCandidate(previewCandidate.id)}
        disabled={disabled || candidateGenerateBusy || candidateSelectBusy}
      >
        {candidateSelectBusy ? "Saving..." : workflowGuidance.primaryActionLabel}
      </button>
    );
  }

  return (
    <section className="hs-imap-panel" aria-label={`${resolvedPanelTitle} panel`}>
      <header className="hs-imap-header">
        <div>
          <div className="hs-imap-title">{resolvedPanelTitle}</div>
          <div className="hs-imap-subtitle">{workflowGuidance.stateCue}</div>
        </div>
        <div className={`hs-imap-save-state is-${saveState}`}>{formatSaveState(saveState)}</div>
      </header>

      <section className="hs-imap-workspace-band" aria-label="Timeline image workspace guidance">
        <section className="hs-imap-next-card" aria-label="Next step guidance">
          <div className="hs-imap-next-eyebrow">{workflowGuidance.cardTitle}</div>
          <div className="hs-imap-next-copy">{workflowGuidance.cardLead}</div>
          <ol className="hs-imap-next-steps">
            {workflowGuidance.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="hs-imap-next-note">{workflowGuidance.note}</div>
        </section>

        {primaryActionButton ? (
          <div className="hs-imap-primary-row">
            <div className="hs-imap-primary-row-label">Do this next</div>
            {primaryActionButton}
          </div>
        ) : null}
      </section>

      <section className="hs-imap-tools-band" aria-label="Timeline image tools">
        <div className="hs-imap-tools-label">Tools</div>
        <div className="hs-imap-toolbar hs-imap-toolbar-secondary">
          {workflowGuidance.primaryAction !== "new_entry" ? (
            <button
              type="button"
              onClick={onCreateEntry}
              disabled={disabled}
            >
              {newEntryLabel}
            </button>
          ) : null}
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
          {!manualOnly && workflowGuidance.primaryAction !== "seed_from_script" ? (
            <button
              type="button"
              onClick={onSeedFromScript}
              disabled={disabled}
            >
              {seedFromScriptLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={copyExportAcknowledged ? "hs-copy-ack" : undefined}
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
      </section>

      <div className="hs-imap-layout">
        <section className="hs-imap-list" aria-label={`${resolvedPanelTitle} entries list`}>
          {entries.length === 0 ? (
            <div className="hs-imap-empty">{manualOnly ? "No beats yet." : "No image beats yet."}</div>
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
            <div className="hs-imap-empty">
              {entries.length > 0
                ? `Pick an ${entryLabel.toLowerCase()} on the left to shape it here.`
                : `Create an ${entryLabel.toLowerCase()} to start.`}
            </div>
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
                  <div className="hs-thumb-field-helper">Describe the image clearly enough that the next sourcing step is obvious.</div>
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
                    <label className="hs-field">
                      <span className="hs-field-label">Provider</span>
                      <select
                        value={visualProviderOverride ?? ""}
                        onChange={(event) => onVisualProviderOverrideChange((event.target.value || null) as VisualProviderId | null)}
                        disabled={disabled}
                      >
                        <option value="">Use Global Default</option>
                        {visualProviderOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={onGeneratePromptPack}
                      disabled={disabled || !canGeneratePromptPack}
                    >
                      {promptPackButtonLabel}
                    </button>
                  </div>
                  <span className="hs-field-label-muted">
                    Choose the active provider Hearth should speak to, then generate a prompt pack you can paste straight into that outside tool.
                  </span>
                </div>
                <section className="hs-imap-provider-pack" aria-label="Provider-aware prompt pack">
                  <div className="hs-imap-provider-pack-header">
                    <div>
                      <div className="hs-field-label">Prompt Pack</div>
                      <div className="hs-imap-help-text">{activeVisualProvider.bannerLabel}</div>
                    </div>
                    <div className="hs-imap-help-text">{activeVisualProvider.helperText}</div>
                  </div>
                  <div className="hs-imap-help-text">
                    Hearth shapes this pack for the active visual provider. Use it in your outside tool, then come back here to source or attach the final asset.
                  </div>
                  {activePromptPack ? (
                    <>
                      <textarea
                        value={activePromptPack.prompt}
                        readOnly
                        rows={5}
                        aria-label="Generated prompt"
                        className="hs-thumb-prompt-card-text"
                      />
                      {activePromptPack.negative ? (
                        <textarea
                          value={activePromptPack.negative}
                          readOnly
                          rows={3}
                          aria-label="Generated negative prompt"
                          className="hs-thumb-prompt-card-text is-secondary"
                        />
                      ) : null}
                      <div className="hs-imap-help-text">
                        Aspect: {activePromptPack.aspectRatio ?? "16:9"} · Provider: {activeVisualProvider.label}
                      </div>
                      {activePromptPack.styleTags?.length ? (
                        <div className="hs-thumb-prompt-card-tags">
                          {activePromptPack.styleTags.map((tag) => (
                            <span key={tag} className="hs-thumb-prompt-card-tag">{tag}</span>
                          ))}
                        </div>
                      ) : null}
                      {activePromptPack.notes ? (
                        <div className="hs-thumb-prompt-card-note">{activePromptPack.notes}</div>
                      ) : null}
                      <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                        <div className="hs-imap-candidate-action-group">
                          <button
                            type="button"
                            className={isCopyAcknowledged("image-map-panel.prompt") ? "hs-copy-ack" : undefined}
                            onClick={onCopyPromptPack}
                            disabled={disabled}
                          >
                            Copy Prompt
                          </button>
                          <button
                            type="button"
                            className={isCopyAcknowledged("image-map-panel.negative") ? "hs-copy-ack" : undefined}
                            onClick={onCopyNegativePrompt}
                            disabled={disabled || !activePromptPack.negative}
                          >
                            Copy Negative
                          </button>
                          <button type="button" onClick={onDownloadPromptPack} disabled={disabled}>Download Prompt Pack</button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="hs-imap-empty">
                      Use <strong>Generate Prompt Pack</strong> to create the active provider pack for this beat.
                    </div>
                  )}
                </section>
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
                      {candidateSelectBusy ? "Saving..." : "Use Your Own Image"}
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
                    If you already know the exact image, bring it in here. Otherwise, pull stock and see what's close.
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
                          Preview a candidate below, then use the one that feels right on this beat.
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
