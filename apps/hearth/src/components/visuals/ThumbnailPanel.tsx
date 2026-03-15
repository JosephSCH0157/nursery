import { useRef } from "react";
import type {
  EpisodeLaunchVariant,
  EpisodeLaunchVariantStatus,
  EpisodeSeoTitle,
  EpisodeThumbnailConcept,
  EpisodeThumbnailVersion,
} from "../../lib/episode-package-v2";
import {
  EPISODE_LAUNCH_VARIANT_STATUS_VALUES,
} from "../../lib/episode-package-v2";
import { HEARTH_VISUAL_STYLE_DEFINITIONS } from "../../lib/hearth-visual-styles";
import {
  TITLE_FONT_PRESETS,
  TITLE_SHADOW_STRENGTH_VALUES,
  normalizeEpisodeThumbnailTitleStyle,
} from "../../lib/hearth-title-fonts";
import type { EpisodeThumbnailTitleStyle, TitleShadowStrength } from "../../lib/hearth-title-fonts";
import {
  resolveThumbnailBrandRender,
} from "../../lib/hearth-thumbnail-brand-templates";
import type { ThumbnailBrandTemplate } from "../../lib/hearth-thumbnail-brand-templates";
import ThumbnailVersions from "./ThumbnailVersions";

type ThumbnailPanelProps = {
  concepts: EpisodeThumbnailConcept[];
  versions: EpisodeThumbnailVersion[];
  titleOptions: EpisodeSeoTitle[];
  launchVariants: EpisodeLaunchVariant[];
  selectedTitleId: string | null;
  selectedTitleText: string;
  selectedConceptId: string;
  selectedVersionId: string | null;
  selectedLaunchVariantId: string | null;
  selectedLaunchVariantStatus: EpisodeLaunchVariantStatus;
  selectedLaunchVariantNotes: string;
  selectedLaunchVariantLastTestedAt: string | null;
  selectedLaunchVariantWinnerSelectedAt: string | null;
  primaryVersionId: string | null;
  selectedConceptLabel: string;
  selectedConceptPrompt: string;
  selectedConceptStylePreset: string;
  selectedConceptTitleStyle: EpisodeThumbnailTitleStyle;
  brandTemplates: ThumbnailBrandTemplate[];
  brandTemplatesLoading: boolean;
  brandTemplatesError: string | null;
  selectedConceptBrandTemplateId: string | null;
  promptOverride: string;
  aspect: "16:9" | "1:1" | "9:16";
  safeZoneEnabled: boolean;
  previewDataUrl: string | null;
  previewState: "idle" | "loading" | "ready" | "error";
  previewError: string | null;
  generateError: string | null;
  uploadError: string | null;
  pairingError: string | null;
  isGenerating: boolean;
  isSavingConcept: boolean;
  isUploading: boolean;
  onSelectTitle: (titleId: string) => void;
  onSelectConcept: (conceptId: string) => void;
  onSelectedConceptLabelChange: (value: string) => void;
  onSelectedConceptPromptChange: (value: string) => void;
  onSelectedConceptStylePresetChange: (value: string) => void;
  onSelectedConceptTitleFontPresetChange: (value: string) => void;
  onSelectedConceptTitleColorChange: (value: string) => void;
  onSelectedConceptTitleShadowEnabledChange: (value: boolean) => void;
  onSelectedConceptTitleShadowStrengthChange: (value: TitleShadowStrength) => void;
  onSelectedConceptBrandTemplateChange: (value: string | null) => void;
  onCreateConcept: () => void;
  onSaveConcept: () => void;
  onDeleteConcept: () => void;
  onPromptOverrideChange: (value: string) => void;
  onAspectChange: (value: "16:9" | "1:1" | "9:16") => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onToggleSafeZone: () => void;
  onUploadImage: (file: File) => void;
  onSelectVersion: (versionId: string) => void;
  onSetPrimary: (versionId: string) => void;
  onRetryVersion: (version: EpisodeThumbnailVersion) => void;
  onSelectLaunchVariant: (variantId: string) => void;
  onCreateLaunchVariant: () => void;
  onSelectedLaunchVariantStatusChange: (value: EpisodeLaunchVariantStatus) => void;
  onSelectedLaunchVariantNotesChange: (value: string) => void;
  onSaveLaunchVariant: () => void;
};

function resolveVariantLabel(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return `Variant ${alphabet[index] ?? index + 1}`;
}

function resolveLaunchVariantStatusLabel(status: EpisodeLaunchVariantStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "tested":
      return "Tested";
    case "winner":
      return "Winner";
    default:
      return "Draft";
  }
}

function formatVariantTimestamp(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleString();
}

function resolveColorInputValue(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : "#FFFFFF";
}

export default function ThumbnailPanel({
  concepts,
  versions,
  titleOptions,
  launchVariants,
  selectedTitleId,
  selectedTitleText,
  selectedConceptId,
  selectedVersionId,
  selectedLaunchVariantId,
  selectedLaunchVariantStatus,
  selectedLaunchVariantNotes,
  selectedLaunchVariantLastTestedAt,
  selectedLaunchVariantWinnerSelectedAt,
  primaryVersionId,
  selectedConceptLabel,
  selectedConceptPrompt,
  selectedConceptStylePreset,
  selectedConceptTitleStyle,
  brandTemplates,
  brandTemplatesLoading,
  brandTemplatesError,
  selectedConceptBrandTemplateId,
  promptOverride,
  aspect,
  safeZoneEnabled,
  previewDataUrl,
  previewState,
  previewError,
  generateError,
  uploadError,
  pairingError,
  isGenerating,
  isSavingConcept,
  isUploading,
  onSelectTitle,
  onSelectConcept,
  onSelectedConceptLabelChange,
  onSelectedConceptPromptChange,
  onSelectedConceptStylePresetChange,
  onSelectedConceptTitleFontPresetChange,
  onSelectedConceptTitleColorChange,
  onSelectedConceptTitleShadowEnabledChange,
  onSelectedConceptTitleShadowStrengthChange,
  onSelectedConceptBrandTemplateChange,
  onCreateConcept,
  onSaveConcept,
  onDeleteConcept,
  onPromptOverrideChange,
  onAspectChange,
  onGenerate,
  onRegenerate,
  onToggleSafeZone,
  onUploadImage,
  onSelectVersion,
  onSetPrimary,
  onRetryVersion,
  onSelectLaunchVariant,
  onCreateLaunchVariant,
  onSelectedLaunchVariantStatusChange,
  onSelectedLaunchVariantNotesChange,
  onSaveLaunchVariant,
}: ThumbnailPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewAspectClass = aspect === "1:1"
    ? " is-square"
    : aspect === "9:16"
      ? " is-vertical"
      : " is-widescreen";
  const previewStatusMessage = selectedVersionId
    ? `Showing version ${selectedVersionId.slice(0, 8)}. Use the versions below to change the preview.`
    : "Generate or choose a version below to preview it here.";
  const hasOverlayTitle = selectedTitleText.trim().length > 0;
  const launchVariantActionLabel = selectedLaunchVariantId ? "Update Pairing" : "Save Pairing";
  const interactionDisabled = isGenerating || isSavingConcept || isUploading;
  const canSaveLaunchVariant = Boolean(selectedTitleId && selectedVersionId);
  const lastTestedLabel = formatVariantTimestamp(selectedLaunchVariantLastTestedAt);
  const winnerSelectedLabel = formatVariantTimestamp(selectedLaunchVariantWinnerSelectedAt);
  const normalizedTitleStyle = normalizeEpisodeThumbnailTitleStyle(selectedConceptTitleStyle);
  const colorInputValue = resolveColorInputValue(normalizedTitleStyle.text_color);
  const selectedBrandTemplate = brandTemplates.find((template) => template.id === selectedConceptBrandTemplateId) ?? null;
  const resolvedBrandRender = resolveThumbnailBrandRender({
    template: selectedBrandTemplate,
    conceptTitleStyle: selectedConceptTitleStyle,
  });
  const resolvedFontPreset = TITLE_FONT_PRESETS[resolvedBrandRender.title_style.font_preset];
  const previewCopyStyle = resolvedBrandRender.layout.title_position === "top"
    ? { top: "10%", bottom: "auto", transform: undefined }
    : resolvedBrandRender.layout.title_position === "center"
      ? { top: "50%", bottom: "auto", transform: "translateY(-50%)" }
      : { top: "auto", bottom: "10%", transform: undefined };
  const previewJustifyItems = resolvedBrandRender.layout.alignment === "center"
    ? "center"
    : resolvedBrandRender.layout.alignment === "right"
      ? "end"
      : "start";
  const accentBorder = resolvedBrandRender.accent.border_color && resolvedBrandRender.accent.border_width > 0
    ? `${resolvedBrandRender.accent.border_width}px solid ${resolvedBrandRender.accent.border_color}`
    : "none";
  const previewTreatmentStyle = {
    backgroundColor: `rgba(0, 0, 0, ${resolvedBrandRender.background_treatment.darken})`,
    backdropFilter: resolvedBrandRender.background_treatment.blur > 0
      ? `blur(${resolvedBrandRender.background_treatment.blur}px)`
      : undefined,
    WebkitBackdropFilter: resolvedBrandRender.background_treatment.blur > 0
      ? `blur(${resolvedBrandRender.background_treatment.blur}px)`
      : undefined,
  };

  return (
    <section className="hs-thumb-panel" aria-label="Visuals panel">
      <header className="hs-thumb-header">
        <div className="hs-thumb-title">Visuals</div>
        <div className="hs-thumb-meta">
          {concepts.length} concepts · {versions.length} versions
        </div>
      </header>

      <div className="hs-thumb-grid">
        <section className="hs-thumb-concepts" aria-label="Thumbnail concepts">
          <div className="hs-thumb-section-title">Concepts</div>
          <div className="hs-thumb-concepts-list">
            {concepts.length === 0 ? (
              <div className="hs-thumb-empty">No concepts yet.</div>
            ) : (
              concepts.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  className={`hs-thumb-concept-item${concept.id === selectedConceptId ? " is-selected" : ""}`}
                  onClick={() => onSelectConcept(concept.id)}
                  disabled={interactionDisabled}
                >
                  <span>{concept.label}</span>
                </button>
              ))
            )}
          </div>

          <div className="hs-thumb-concept-editor">
            <label className="hs-field">
              <span className="hs-field-label">Label</span>
              <input
                type="text"
                value={selectedConceptLabel}
                onChange={(event) => onSelectedConceptLabelChange(event.target.value)}
                placeholder="Concept label"
                disabled={interactionDisabled}
              />
            </label>
            <label className="hs-field">
              <span className="hs-field-label">Prompt</span>
              <textarea
                value={selectedConceptPrompt}
                onChange={(event) => onSelectedConceptPromptChange(event.target.value)}
                placeholder="Prompt text"
                rows={3}
                disabled={interactionDisabled}
              />
            </label>
            <label className="hs-field">
              <span className="hs-field-label">Visual Style</span>
              <select
                value={selectedConceptStylePreset}
                onChange={(event) => onSelectedConceptStylePresetChange(event.target.value)}
                disabled={interactionDisabled}
              >
                {HEARTH_VISUAL_STYLE_DEFINITIONS.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="hs-thumb-concept-actions">
              <button
                type="button"
                onClick={onCreateConcept}
                disabled={interactionDisabled}
              >
                New Concept
              </button>
              <button
                type="button"
                onClick={onSaveConcept}
                disabled={interactionDisabled || !selectedConceptId}
              >
                {isSavingConcept ? "Saving..." : "Save Concept"}
              </button>
              <button
                type="button"
                onClick={onDeleteConcept}
                disabled={interactionDisabled || !selectedConceptId}
              >
                Delete
              </button>
            </div>
          </div>
        </section>

        <section className="hs-thumb-preview-wrap" aria-label="Thumbnail preview">
          <div className="hs-thumb-section-title">Preview</div>
          <div className="hs-thumb-controls">
            <select
              aria-label="Thumbnail aspect ratio"
              title="Thumbnail aspect ratio"
              value={aspect}
              onChange={(event) => onAspectChange(event.target.value as "16:9" | "1:1" | "9:16")}
              disabled={isGenerating || isUploading}
            >
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="9:16">9:16</option>
            </select>
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerating || isUploading}
            >
              {isGenerating ? "Generating..." : "Generate"}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isGenerating || isUploading || !selectedConceptId}
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={onToggleSafeZone}
              disabled={isGenerating || isUploading}
            >
              {safeZoneEnabled ? "Hide Safe Zone" : "Show Safe Zone"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || isUploading}
            >
              {isUploading ? "Uploading..." : "Upload Image"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Upload thumbnail image"
              title="Upload thumbnail image"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onUploadImage(file);
                event.target.value = "";
              }}
              className="hs-thumb-file-input"
            />
          </div>
          <label className="hs-field">
            <span className="hs-field-label">Prompt Override</span>
            <textarea
              value={promptOverride}
              onChange={(event) => onPromptOverrideChange(event.target.value)}
              placeholder="Optional prompt override"
              rows={3}
              disabled={isGenerating || isUploading}
            />
          </label>

          <section className="hs-thumb-title-source" aria-label="Thumbnail title overlay">
            <div className="hs-thumb-section-title">Title Overlay</div>
            {titleOptions.length === 0 ? (
              <div className="hs-thumb-empty">Generate SEO titles to place clean text on the thumbnail.</div>
            ) : (
              <div className="hs-thumb-title-list">
                {titleOptions.map((title) => (
                  <button
                    key={title.id}
                    type="button"
                    className={`hs-thumb-title-chip${title.id === selectedTitleId ? " is-selected" : ""}`}
                    onClick={() => onSelectTitle(title.id)}
                    disabled={isGenerating || isUploading}
                    title={title.text}
                  >
                    <span className="hs-thumb-title-chip-label">{title.label}</span>
                    <span className="hs-thumb-title-chip-text">{title.text}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="hs-thumb-title-help">
              Select the clean text overlay for preview, then save an explicit launch variant below.
            </div>
            <label className="hs-field">
              <span className="hs-field-label">Brand Template</span>
              <select
                value={selectedConceptBrandTemplateId ?? ""}
                onChange={(event) => onSelectedConceptBrandTemplateChange(event.target.value || null)}
                disabled={interactionDisabled || brandTemplatesLoading}
              >
                <option value="">None</option>
                {brandTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.isDefault ? `${template.name} (Default)` : template.name}
                  </option>
                ))}
              </select>
            </label>
            {brandTemplatesLoading ? (
              <div className="hs-thumb-template-meta">Loading workspace brand templates...</div>
            ) : null}
            {brandTemplatesError ? (
              <div className="hs-error-text-small">{brandTemplatesError}</div>
            ) : null}
            <section className="hs-thumb-title-style" aria-label="Thumbnail title styling">
              <div className="hs-thumb-section-title">Title Styling</div>
              <div className="hs-thumb-title-style-grid">
                <label className="hs-field">
                  <span className="hs-field-label">Font Preset</span>
                  <select
                    value={normalizedTitleStyle.font_preset}
                    onChange={(event) => onSelectedConceptTitleFontPresetChange(event.target.value)}
                    disabled={interactionDisabled}
                  >
                    {Object.entries(TITLE_FONT_PRESETS).map(([value, preset]) => (
                      <option key={value} value={value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hs-field hs-thumb-color-field">
                  <span className="hs-field-label">Text Color</span>
                  <input
                    type="color"
                    value={colorInputValue}
                    onChange={(event) => onSelectedConceptTitleColorChange(event.target.value)}
                    disabled={interactionDisabled}
                    className="hs-thumb-color-input"
                  />
                </label>
              </div>
              <label className="hs-thumb-shadow-toggle">
                <input
                  type="checkbox"
                  checked={normalizedTitleStyle.shadow.enabled}
                  onChange={(event) => onSelectedConceptTitleShadowEnabledChange(event.target.checked)}
                  disabled={interactionDisabled}
                />
                <span>Drop Shadow</span>
              </label>
              {normalizedTitleStyle.shadow.enabled ? (
                <label className="hs-field">
                  <span className="hs-field-label">Shadow Strength</span>
                  <select
                    value={normalizedTitleStyle.shadow.strength}
                    onChange={(event) => onSelectedConceptTitleShadowStrengthChange(event.target.value as TitleShadowStrength)}
                    disabled={interactionDisabled}
                  >
                    {TITLE_SHADOW_STRENGTH_VALUES.map((strength) => (
                      <option key={strength} value={strength}>
                        {strength[0]?.toUpperCase()}{strength.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>
          </section>

          <div className="hs-thumb-preview-note">{previewStatusMessage}</div>

          <div
            className={`hs-thumb-preview${previewAspectClass}${safeZoneEnabled ? " show-safe-zone" : ""}`}
          >
            {previewState === "loading" ? (
              <div className="hs-thumb-preview-empty">Loading preview...</div>
            ) : null}
            {previewState === "error" ? (
              <div className="hs-thumb-preview-empty">{previewError || "Preview unavailable."}</div>
            ) : null}
            {previewState === "idle" ? (
              <div className="hs-thumb-preview-empty">Select a version to preview.</div>
            ) : null}
            {previewDataUrl && previewState === "ready" ? (
              <>
                <img src={previewDataUrl} alt="Selected thumbnail preview" className="hs-thumb-preview-image" />
                <div className="hs-thumb-preview-treatment" style={previewTreatmentStyle} aria-hidden="true" />
                <div
                  className="hs-thumb-preview-accent"
                  style={{
                    border: accentBorder,
                    borderRadius: `${resolvedBrandRender.accent.corner_radius}px`,
                  }}
                  aria-hidden="true"
                />
                {hasOverlayTitle ? (
                  <div
                    className="hs-thumb-preview-copy"
                    aria-label="Thumbnail title preview"
                    style={{
                      ...previewCopyStyle,
                      justifyItems: previewJustifyItems,
                    }}
                  >
                    <div
                      className="hs-thumb-preview-copy-text"
                      style={{
                        fontFamily: resolvedFontPreset.css,
                        color: resolvedBrandRender.title_style.text_color,
                        textShadow: resolvedBrandRender.text_shadow_css,
                        textAlign: resolvedBrandRender.layout.alignment,
                        WebkitLineClamp: resolvedBrandRender.layout.max_lines,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {selectedTitleText}
                    </div>
                  </div>
                ) : null}
                <div className="hs-thumb-safe-zone" aria-hidden="true" />
              </>
            ) : null}
          </div>

          {generateError ? (
            <div className="hs-error-text-small">{generateError}</div>
          ) : null}
          {uploadError ? (
            <div className="hs-error-text-small">{uploadError}</div>
          ) : null}
        </section>
      </div>

      <section className="hs-thumb-versions" aria-label="Thumbnail versions">
        <div className="hs-thumb-section-title">Versions</div>
        <ThumbnailVersions
          versions={versions}
          selectedVersionId={selectedVersionId}
          primaryVersionId={primaryVersionId}
          disabled={interactionDisabled}
          onSelectVersion={onSelectVersion}
          onSetPrimary={onSetPrimary}
          onRetryVersion={onRetryVersion}
        />
      </section>

      <section className="hs-thumb-launch-variants" aria-label="Launch variants">
        <div className="hs-thumb-section-title">Launch Variants</div>
        <div className="hs-thumb-launch-toolbar">
          <div className="hs-field-label-muted">
            Save the currently selected title and thumbnail as a launch-ready variant.
          </div>
          <div className="hs-thumb-launch-actions">
            <button
              type="button"
              onClick={onSaveLaunchVariant}
              disabled={interactionDisabled || !canSaveLaunchVariant}
            >
              {launchVariantActionLabel}
            </button>
            <button
              type="button"
              onClick={onCreateLaunchVariant}
              disabled={interactionDisabled}
            >
              New Pairing
            </button>
          </div>
        </div>
        <div className="hs-thumb-launch-editor">
          <label className="hs-field">
            <span className="hs-field-label">Status</span>
            <select
              value={selectedLaunchVariantStatus}
              onChange={(event) => onSelectedLaunchVariantStatusChange(event.target.value as EpisodeLaunchVariantStatus)}
              disabled={interactionDisabled}
            >
              {EPISODE_LAUNCH_VARIANT_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>
                  {resolveLaunchVariantStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="hs-field">
            <span className="hs-field-label">Notes</span>
            <textarea
              value={selectedLaunchVariantNotes}
              onChange={(event) => onSelectedLaunchVariantNotesChange(event.target.value)}
              rows={3}
              placeholder="Optional operator notes for this launch variant"
              disabled={interactionDisabled}
            />
          </label>
          {lastTestedLabel || winnerSelectedLabel ? (
            <div className="hs-thumb-launch-editor-meta">
              {lastTestedLabel ? <div>Last tested: {lastTestedLabel}</div> : null}
              {winnerSelectedLabel ? <div>Winner selected: {winnerSelectedLabel}</div> : null}
            </div>
          ) : null}
        </div>

        {!canSaveLaunchVariant ? (
          <div className="hs-thumb-empty">Choose both a title and a thumbnail version to save a variant.</div>
        ) : null}

        {launchVariants.length === 0 ? (
          <div className="hs-thumb-empty">No launch variants saved yet.</div>
        ) : (
          <div className="hs-thumb-launch-list">
            {launchVariants.map((variant, index) => {
              const linkedTitle = titleOptions.find((title) => title.id === variant.title_id) ?? null;
              const linkedVersion = versions.find((version) => version.id === variant.thumbnail_version_id) ?? null;
              const linkedConcept = linkedVersion
                ? concepts.find((concept) => concept.id === linkedVersion.concept_id) ?? null
                : null;

              return (
                <button
                  key={variant.id}
                  type="button"
                  className={`hs-thumb-launch-card${variant.id === selectedLaunchVariantId ? " is-selected" : ""}`}
                  onClick={() => onSelectLaunchVariant(variant.id)}
                  disabled={interactionDisabled}
                >
                  <div className="hs-thumb-launch-card-heading">
                    <div className="hs-thumb-launch-card-title">{resolveVariantLabel(index)}</div>
                    <div className={`hs-thumb-launch-status is-${variant.status}`}>
                      {resolveLaunchVariantStatusLabel(variant.status)}
                    </div>
                  </div>
                  <div className="hs-thumb-launch-card-copy">
                    {linkedTitle?.text.trim() || "Linked title unavailable"}
                  </div>
                  <div className="hs-thumb-launch-card-meta">
                    {linkedConcept?.label ?? "Missing concept"} · {linkedVersion ? `Version ${linkedVersion.id.slice(0, 8)}` : "Missing version"}
                  </div>
                  {variant.notes ? (
                    <div className="hs-thumb-launch-card-notes">{variant.notes}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {pairingError ? (
          <div className="hs-error-text-small">{pairingError}</div>
        ) : null}
      </section>
    </section>
  );
}
