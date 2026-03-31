import type { EpisodeSeoTitle } from "../../lib/episode-package-v2";

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
  const shortCount = descriptionShort.length;
  const longCount = descriptionLong.length;
  const previewText = renderPreview({
    mode: previewMode,
    titles,
    tags,
    descriptionShort,
    descriptionLong,
  });

  return (
    <section className="hs-meta-panel" aria-label="Framing panel">
      <header className="hs-meta-header">
        <div className="hs-meta-title">Framing</div>
        <div className={`hs-meta-save-state is-${saveState}`}>{formatSaveState(saveState)}</div>
      </header>

      <section className="hs-meta-section" aria-label="Title variants">
        <div className="hs-meta-section-title">Titles</div>
        <div className="hs-meta-title-list">
          {titles.map((title) => (
            <label key={title.id} className="hs-meta-title-row">
              <span className="hs-meta-title-label">{title.label}</span>
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
      </section>

      <section className="hs-meta-section" aria-label="Tags">
        <div className="hs-meta-section-title">Tags</div>
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
        <div className="hs-meta-tag-suggestions">
          {tagSuggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onAddTagSuggestion(tag)}
              disabled={disabled}
            >
              + {tag}
            </button>
          ))}
        </div>
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
            <option value="youtube">YT-ish</option>
            <option value="rss">RSS-ish</option>
            <option value="plain">Plain</option>
          </select>
        </div>
        <pre className="hs-meta-preview">{previewText}</pre>
      </section>

      {saveError ? (
        <div className="hs-error-text-small">{saveError}</div>
      ) : null}
    </section>
  );
}
