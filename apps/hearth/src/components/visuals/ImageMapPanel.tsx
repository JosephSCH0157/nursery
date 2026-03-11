import {
  EPISODE_IMAGE_MAP_INTENT_VALUES,
  EPISODE_IMAGE_MAP_SOURCE_TYPE_VALUES,
  type EpisodeImageMapEntry,
} from "../../lib/episode-package-v2";

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
  entries: EpisodeImageMapEntry[];
  selectedEntryId: string | null;
  draftAnchor: string;
  draftDescription: string;
  draftIntent: string;
  draftSourceType: string;
  draftPlacementHint: string;
  saveState: ImageMapSaveState;
  saveError: string | null;
  exportMessage: string | null;
  candidateCards: ImageMapCandidateCard[];
  candidateGenerateBusy: boolean;
  candidateGenerateError: string | null;
  candidateSelectBusy: boolean;
  candidateSelectionError: string | null;
  disabled?: boolean;
  onSelectEntry: (entryId: string) => void;
  onDraftAnchorChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
  onDraftIntentChange: (value: string) => void;
  onDraftSourceTypeChange: (value: string) => void;
  onDraftPlacementHintChange: (value: string) => void;
  onCreateEntry: () => void;
  onDuplicateEntry: () => void;
  onDeleteEntry: () => void;
  onSeedFromScript: () => void;
  onGenerateCandidates: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onCopyExport: () => void;
  onDownloadExport: () => void;
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

export default function ImageMapPanel({
  entries,
  selectedEntryId,
  draftAnchor,
  draftDescription,
  draftIntent,
  draftSourceType,
  draftPlacementHint,
  saveState,
  saveError,
  exportMessage,
  candidateCards,
  candidateGenerateBusy,
  candidateGenerateError,
  candidateSelectBusy,
  candidateSelectionError,
  disabled = false,
  onSelectEntry,
  onDraftAnchorChange,
  onDraftDescriptionChange,
  onDraftIntentChange,
  onDraftSourceTypeChange,
  onDraftPlacementHintChange,
  onCreateEntry,
  onDuplicateEntry,
  onDeleteEntry,
  onSeedFromScript,
  onGenerateCandidates,
  onSelectCandidate,
  onCopyExport,
  onDownloadExport,
}: ImageMapPanelProps) {
  const hasSelection = Boolean(selectedEntryId);

  return (
    <section className="hs-imap-panel" aria-label="Image map panel">
      <header className="hs-imap-header">
        <div className="hs-imap-title">Image Map</div>
        <div className={`hs-imap-save-state is-${saveState}`}>{formatSaveState(saveState)}</div>
      </header>

      <div className="hs-imap-toolbar">
        <button
          type="button"
          onClick={onCreateEntry}
          disabled={disabled}
        >
          New Entry
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
        <button
          type="button"
          onClick={onSeedFromScript}
          disabled={disabled}
        >
          Generate from Script
        </button>
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
        <section className="hs-imap-list" aria-label="Image map entries list">
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
                  {entry.intent} · {entry.source_type} · {entry.candidate_assets.length} candidates
                </div>
                <div className="hs-imap-row-desc">{summarizeDescription(entry.description)}</div>
              </button>
            ))
          )}
        </section>

        <section className="hs-imap-editor" aria-label="Image map entry editor">
          {!hasSelection ? (
            <div className="hs-imap-empty">Select or create an entry to edit.</div>
          ) : (
            <>
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
              <label className="hs-field">
                <span className="hs-field-label">Description</span>
                <textarea
                  value={draftDescription}
                  onChange={(event) => onDraftDescriptionChange(event.target.value)}
                  rows={4}
                  placeholder="What should be shown?"
                  disabled={disabled}
                />
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
              <label className="hs-field">
                <span className="hs-field-label">Placement Hint</span>
                <input
                  type="text"
                  value={draftPlacementHint}
                  onChange={(event) => onDraftPlacementHintChange(event.target.value)}
                  placeholder="Optional placement note"
                  disabled={disabled}
                />
              </label>
              <div className="hs-imap-candidate-toolbar">
                <button
                  type="button"
                  onClick={onGenerateCandidates}
                  disabled={disabled || candidateGenerateBusy}
                >
                  {candidateGenerateBusy ? "Generating..." : "Generate Candidates"}
                </button>
                <span className="hs-field-label-muted">
                  Generates two still-image variants for this exact visual beat.
                </span>
              </div>
              <section className="hs-imap-candidates" aria-label="Still candidates">
                {candidateCards.length === 0 ? (
                  <div className="hs-imap-empty">No still candidates generated yet.</div>
                ) : (
                  candidateCards.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`hs-imap-candidate-card${candidate.isSelected ? " is-selected" : ""}`}
                      onClick={() => onSelectCandidate(candidate.id)}
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
                  ))
                )}
              </section>
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
