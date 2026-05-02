import { useEffect, useMemo, useState } from "react";
import type { EpisodeSeoTitle } from "../../lib/episode-package-v2";
import {
  partitionMetadataTitles,
  resolveTitleSlotByLabel,
  shouldConfirmTitleSlotReplacement,
  type TitleSlotLabel,
} from "../../lib/hearth-metadata-titles";

type MetadataSaveState = "saved" | "editing" | "saving" | "offline" | "error";
type MetadataPreviewMode = "youtube" | "rss" | "plain";

type MetadataPanelProps = {
  titles: EpisodeSeoTitle[];
  tags: string[];
  tagInput: string;
  tagSuggestions: string[];
  descriptionShort: string;
  descriptionLong: string;
  previewMode: MetadataPreviewMode;
  saveState: MetadataSaveState;
  saveError: string | null;
  disabled?: boolean;
  onTitleChange: (titleId: string, nextText: string) => void;
  onSetPrimaryTitle: (titleId: string) => void;
  onTagInputChange: (value: string) => void;
  onAddTagFromInput: () => void;
  onRemoveTag: (tag: string) => void;
  onAddTagSuggestion: (tag: string) => void;
  onDescriptionShortChange: (value: string) => void;
  onDescriptionLongChange: (value: string) => void;
  onPreviewModeChange: (mode: MetadataPreviewMode) => void;
};

function formatSaveState(state: MetadataSaveState): string {
  if (state === "saved") return "Saved";
  if (state === "editing") return "Editing";
  if (state === "saving") return "Saving...";
  if (state === "offline") return "Offline";
  return "Save failed";
}

function descriptionCountClass(length: number, softLimit: number): string {
  if (length <= softLimit) return "hs-meta-count";
  if (length <= softLimit + 80) return "hs-meta-count is-warn";
  return "hs-meta-count is-alert";
}

function tagCountGuidance(count: number): string {
  if (count === 0) return "Pick the most relevant 5–10 tags. Avoid over-tagging.";
  if (count <= 4) return "Too few to be discoverable — aim for 5–10.";
  if (count <= 10) return "Good range. Add or remove tags to fine-tune.";
  if (count <= 15) return "Getting broad — consider trimming to the strongest tags.";
  return "Too many — trim down for better discoverability.";
}

function renderPreview(args: {
  mode: MetadataPreviewMode;
  titles: EpisodeSeoTitle[];
  tags: string[];
  descriptionShort: string;
  descriptionLong: string;
}): string {
  const primaryTitle = args.titles.find((title) => title.is_primary)?.text.trim()
    || args.titles[0]?.text.trim()
    || "Untitled Episode";
  const shortText = args.descriptionShort.trim();
  const longText = args.descriptionLong.trim();
  const hashtags = args.tags.map((tag) => `#${tag}`).join(" ");

  if (args.mode === "youtube") {
    return [
      primaryTitle,
      "",
      shortText || "Short description",
      "",
      longText || "Long description",
      "",
      hashtags || "#tag1 #tag2",
    ].join("\n");
  }

  if (args.mode === "rss") {
    return [
      primaryTitle,
      "",
      shortText || "Summary",
      "",
      longText || "Episode notes",
    ].join("\n");
  }

  return [
    `Title: ${primaryTitle}`,
    `Short: ${shortText || "(empty)"}`,
    `Long: ${longText || "(empty)"}`,
    `Tags: ${args.tags.join(", ") || "(none)"}`,
  ].join("\n");
}

export default function MetadataPanel({
  titles,
  tags,
  tagInput,
  tagSuggestions,
  descriptionShort,
  descriptionLong,
  previewMode,
  saveState,
  saveError,
  disabled = false,
  onTitleChange,
  onSetPrimaryTitle,
  onTagInputChange,
  onAddTagFromInput,
  onRemoveTag,
  onAddTagSuggestion,
  onDescriptionShortChange,
  onDescriptionLongChange,
  onPreviewModeChange,
}: MetadataPanelProps) {
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);
  const [recentlyAddedTag, setRecentlyAddedTag] = useState<string | null>(null);
  const shortCount = descriptionShort.length;
  const longCount = descriptionLong.length;
  const { slotTitles, generatedSuggestions } = useMemo(
    () => partitionMetadataTitles(titles),
    [titles],
  );
  const previewText = renderPreview({
    mode: previewMode,
    titles,
    tags,
    descriptionShort,
    descriptionLong,
  });

  useEffect(() => {
    if (!assignmentStatus) return;
    const timer = window.setTimeout(() => setAssignmentStatus(null), 1800);
    return () => window.clearTimeout(timer);
  }, [assignmentStatus]);

  function onAssignSuggestionToSlot(suggestionId: string, slotLabel: TitleSlotLabel): void {
    const suggestion = generatedSuggestions.find((title) => title.id === suggestionId);
    if (!suggestion) return;
    const slot = resolveTitleSlotByLabel(slotTitles, slotLabel);
    if (!slot) return;

    const nextText = suggestion.text.trim();
    if (!nextText) return;

    if (shouldConfirmTitleSlotReplacement(slot.text, nextText)) {
      const confirmed = window.confirm(`Replace Title ${slotLabel} with this generated suggestion?`);
      if (!confirmed) return;
    }

    onTitleChange(slot.id, nextText);
    setAssignmentStatus(`Set as Title ${slotLabel}.`);
  }

  return (
    <section className="hs-meta-panel" aria-label="Framing panel">
      <header className="hs-meta-header">
        <div className="hs-meta-title">Framing</div>
        <div className={`hs-meta-save-state is-${saveState}`}>{formatSaveState(saveState)}</div>
      </header>

      <section className="hs-meta-section" aria-label="Title variants">
        <div className="hs-meta-section-title">Episode Titles</div>
        <div className="hs-field-label-muted">
          Assign up to three title candidates, then pick one Primary title.
        </div>
        <div className="hs-field-label-muted">
          These are the title slots that can move forward to release tools.
        </div>
        <div className="hs-meta-title-list">
          {slotTitles.map((title) => (
            <label key={title.id} className="hs-meta-title-row">
              <span className="hs-meta-title-label">Title {title.label}</span>
              <input
                type="text"
                value={title.text}
                onChange={(event) => onTitleChange(title.id, event.target.value)}
                placeholder={`Title ${title.label}`}
                disabled={disabled}
              />
              <button
                type="button"
                onClick={() => onSetPrimaryTitle(title.id)}
                disabled={disabled || title.is_primary}
              >
                {title.is_primary ? "Primary" : "Set Primary"}
              </button>
            </label>
          ))}
        </div>
        <div className="hs-meta-suggestions-head">
          <div className="hs-meta-section-title">Generated Title Suggestions</div>
          <div className="hs-field-label-muted">
            Use these as starting points. Assign your favorites into Title A, B, or C.
          </div>
        </div>
        <div className="hs-meta-suggestion-list" role="list" aria-label="Generated title suggestions">
          {generatedSuggestions.length === 0 ? (
            <span className="hs-meta-empty">No generated title suggestions yet.</span>
          ) : (
            generatedSuggestions.map((suggestion) => (
              <article key={suggestion.id} className="hs-meta-suggestion-row" role="listitem">
                <p>{suggestion.text}</p>
                <div className="hs-meta-suggestion-actions" role="group" aria-label="Assign generated title">
                  <button
                    type="button"
                    onClick={() => onAssignSuggestionToSlot(suggestion.id, "A")}
                    disabled={disabled}
                    aria-label="Set suggestion as Title A"
                  >
                    Set as A
                  </button>
                  <button
                    type="button"
                    onClick={() => onAssignSuggestionToSlot(suggestion.id, "B")}
                    disabled={disabled}
                    aria-label="Set suggestion as Title B"
                  >
                    Set as B
                  </button>
                  <button
                    type="button"
                    onClick={() => onAssignSuggestionToSlot(suggestion.id, "C")}
                    disabled={disabled}
                    aria-label="Set suggestion as Title C"
                  >
                    Set as C
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        {assignmentStatus ? (
          <div className="hs-field-label-muted" role="status" aria-live="polite">{assignmentStatus}</div>
        ) : null}
      </section>

      <section className="hs-meta-section" aria-label="Tags">
        <div className="hs-meta-section-title">
          Tags
          {tags.length > 0 && (
            <span className="hs-meta-tag-count">
              {tags.length} / 10 recommended
            </span>
          )}
        </div>
        <div className="hs-field-label-muted">
          {tagCountGuidance(tags.length)}
        </div>
        <div className="hs-meta-tags-wrap">
          {tags.length === 0 ? (
            <span className="hs-meta-empty">No tags yet.</span>
          ) : (
            tags.map((tag) => (
              <span key={tag} className="hs-meta-tag-chip">
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  disabled={disabled}
                  aria-label={`Remove tag ${tag}`}
                >
                  x
                </button>
              </span>
            ))
          )}
        </div>
        <div className="hs-meta-tag-input-row">
          <input
            type="text"
            value={tagInput}
            onChange={(event) => onTagInputChange(event.target.value)}
            placeholder="Add tags (comma or Enter)"
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onAddTagFromInput();
            }}
          />
          <button
            type="button"
            onClick={onAddTagFromInput}
            disabled={disabled || !tagInput.trim()}
          >
            Add
          </button>
        </div>
        {tagSuggestions.length > 0 && (
          <>
            <div className="hs-field-label-muted hs-meta-tag-suggestions-hint">
              Click tags to add them. Remove any that don't fit.
            </div>
            <div className="hs-meta-tag-suggestions">
              {tagSuggestions.map((tag) => {
                const isSelected = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={isSelected ? "hs-meta-tag-suggestion is-selected" : "hs-meta-tag-suggestion"}
                    onClick={() => {
                      if (isSelected) return;
                      onAddTagSuggestion(tag);
                      setRecentlyAddedTag(tag);
                      setTimeout(() => setRecentlyAddedTag((prev) => (prev === tag ? null : prev)), 1500);
                    }}
                    disabled={disabled}
                    aria-label={isSelected ? `${tag} — already added` : `Add tag: ${tag}`}
                    aria-pressed={isSelected}
                  >
                    {isSelected ? "✓ " : "+ "}{tag}
                  </button>
                );
              })}
            </div>
            {recentlyAddedTag ? (
              <div className="hs-meta-tag-added-notice" role="status" aria-live="polite">
                Added: {recentlyAddedTag}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="hs-meta-section" aria-label="Descriptions">
        <div className="hs-meta-section-title">Descriptions</div>
        <label className="hs-field">
          <span className="hs-field-label">Short</span>
          <textarea
            value={descriptionShort}
            onChange={(event) => onDescriptionShortChange(event.target.value)}
            rows={3}
            placeholder="Short description"
            disabled={disabled}
          />
          <span className={descriptionCountClass(shortCount, 180)}>
            {shortCount} chars
          </span>
        </label>
        <label className="hs-field">
          <span className="hs-field-label">Long</span>
          <textarea
            value={descriptionLong}
            onChange={(event) => onDescriptionLongChange(event.target.value)}
            rows={5}
            placeholder="Long description"
            disabled={disabled}
          />
          <span className={descriptionCountClass(longCount, 3000)}>
            {longCount} chars
          </span>
        </label>
      </section>

      <section className="hs-meta-section" aria-label="Preview">
        <div className="hs-meta-preview-header">
          <div className="hs-meta-section-title">Preview</div>
          <select
            aria-label="Preview format"
            value={previewMode}
            onChange={(event) => onPreviewModeChange(event.target.value as MetadataPreviewMode)}
            disabled={disabled}
          >
            <option value="youtube" title="YouTube-style description (optimized for YouTube discovery)">YT-ish</option>
            <option value="rss" title="Podcast-style description (optimized for RSS feeds and players)">RSS-ish</option>
            <option value="plain">Plain</option>
          </select>
        </div>
        <div className="hs-meta-preview-mode-hint">
          {previewMode === "youtube" && "YouTube-style description — optimized for YouTube discovery."}
          {previewMode === "rss" && "Podcast-style description — optimized for RSS feeds and players."}
        </div>
        <pre className="hs-meta-preview">{previewText}</pre>
      </section>

      {saveError ? (
        <div className="hs-error-text-small">{saveError}</div>
      ) : null}
    </section>
  );
}
