import { useMemo, useRef } from "react";
import type { EpisodeBrollAssetCandidate, EpisodeContextualDataCompositePlan } from "../../lib/episode-package-v2";
import type { ExternalGenerationProvider } from "../../lib/hearth-visual-actionability";
import type { PromptPack } from "../../lib/hearth-visual-provider-profiles";

type ReferenceClipPlanPanelProps = {
  entries: EpisodeContextualDataCompositePlan[];
  selectedEntryId: string | null;
  saveState: "saved" | "editing" | "saving" | "error" | "offline";
  saveError: string | null;
  message: string | null;
  disabled?: boolean;
  draft: {
    anchorText: string;
    description: string;
    placementHint: string;
    format: string;
    dataType: string;
    contextType: string;
    tone: string;
    motionLevel: string;
    backgroundContextDescription: string;
    foregroundDataDescription: string;
    visualStyle: string;
    chartType: string;
    title: string;
    labels: string;
    values: string;
    emphasisKey: string;
    sourceType: string;
    providerId: string;
    sourceLabel: string;
    sourceUrl: string;
    providerNote: string;
    usageNote: string;
    resultMetadata: string;
  };
  requestState: string;
  providers: ExternalGenerationProvider[];
  activeVisualProviderLabel: string;
  activeVisualProviderBanner: string;
  activeVisualProviderHelperText: string;
  activePromptPack: PromptPack | null;
  selectedCandidateId: string | null;
  onSelectEntry: (entryId: string) => void;
  onDraftChange: (field: string, value: string) => void;
  onCreateReferenceClip: () => void;
  onSaveEntry: () => void;
  onDeleteEntry: () => void;
  onRegenerateStub: () => void;
  onUploadAsset: (file: File) => void;
  onSelectCandidate: (candidateId: string) => void;
  onCopyPrompt: () => void;
  onCopyNegativePrompt: () => void;
  onDownloadPromptPack: () => void;
  onDownloadBrief: () => void;
  onDownloadBriefJson: () => void;
  onOpenProvider: () => void;
  onMarkSent: () => void;
  onMarkAwaitingResult: () => void;
  onClearRequestState: () => void;
  onAttachResultFromUrl: () => void;
};

const PLACEMENT_HINTS = ["first_occurrence", "exact_timestamp", "manual"];
const FORMATS = ["still", "animated", "hybrid"];
const DATA_TYPES = ["quantitative", "categorical", "timeline", "geographic", "comparison"];
const CONTEXT_TYPES = ["location", "object", "historical", "subject", "conceptual"];
const TONES = ["neutral", "investigative", "nostalgic", "dramatic", "analytical"];
const MOTION_LEVELS = ["static", "subtle", "full_animation"];
const CHART_TYPES = ["line", "bar", "area", "scatter", "timeline", "map", "stat_card", "comparison"];
const SOURCE_TYPES = ["planned", "hearth_ai", "upload", "external", "hammer_upload"];

function CandidateList(args: {
  candidates: EpisodeBrollAssetCandidate[];
  selectedCandidateId: string | null;
  disabled: boolean;
  onSelectCandidate: (candidateId: string) => void;
}) {
  if (args.candidates.length === 0) {
    return <div className="hs-imap-empty">No candidate assets attached yet.</div>;
  }
  return (
    <div className="hs-imap-candidates">
      {args.candidates.map((candidate) => (
        <article key={candidate.asset_id} className={`hs-imap-candidate-card${candidate.asset_id === args.selectedCandidateId ? " is-selected" : ""}`}>
          <div className="hs-imap-candidate-meta">
            <div className="hs-imap-candidate-title">
              {candidate.label ?? candidate.source}
              {candidate.asset_id === args.selectedCandidateId ? <span className="hs-imap-candidate-badge">Selected</span> : null}
            </div>
            <div className="hs-imap-candidate-subtitle">
              {candidate.source}
              {candidate.asset_category ? ` • ${candidate.asset_category}` : ""}
              {candidate.mime_type ? ` • ${candidate.mime_type}` : ""}
            </div>
            {candidate.uri ? (
              <a href={candidate.uri} target="_blank" rel="noreferrer" className="hs-imap-link-inline">
                Open source
              </a>
            ) : null}
            {candidate.path ? <div className="hs-imap-candidate-subtitle">{candidate.path}</div> : null}
          </div>
          <div className="hs-imap-candidate-actions">
            <button
              type="button"
              className="hs-imap-candidate-apply"
              disabled={args.disabled}
              onClick={() => args.onSelectCandidate(candidate.asset_id)}
            >
              {candidate.asset_id === args.selectedCandidateId ? "Selected for Reference Clip" : "Choose Existing Asset"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function ReferenceClipPlanPanel(props: ReferenceClipPlanPanelProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const selectedEntry = useMemo(
    () => props.entries.find((entry) => entry.id === props.selectedEntryId) ?? null,
    [props.entries, props.selectedEntryId],
  );
  const candidates = selectedEntry?.candidate_assets ?? [];

  return (
    <div className="hs-imap-panel">
      <div className="hs-imap-header">
        <div>
          <h4 className="hs-imap-title">Reference Clips</h4>
          <p className="hs-imap-subtitle">Plan explanatory reference visuals that combine real-world context with structured data.</p>
        </div>
        <div className="hs-imap-candidate-action-group">
          <button type="button" className="hs-primary-btn" onClick={props.onCreateReferenceClip} disabled={props.disabled || props.saveState === "saving"}>
            Create Reference Clip
          </button>
        </div>
      </div>

      <div className="hs-imap-toolbar">
        <span className="hs-pill">{props.entries.length} reference clip{props.entries.length === 1 ? "" : "s"}</span>
        <span className="hs-pill">State: {props.saveState}</span>
      </div>

      <div className="hs-imap-grid">
        <section className="hs-imap-list" aria-label="Reference clip entries">
          {props.entries.length === 0 ? (
            <div className="hs-imap-empty">Create a Reference Clip to start.</div>
          ) : props.entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`hs-imap-entry${entry.id === props.selectedEntryId ? " is-selected" : ""}`}
              onClick={() => props.onSelectEntry(entry.id)}
              disabled={props.disabled}
            >
              <div className="hs-imap-entry-title">{entry.anchor_text || "Untitled Reference Clip"}</div>
              <div className="hs-imap-entry-meta">{entry.format} · {entry.data_type} · {entry.context_type}</div>
            </button>
          ))}
        </section>

        <section className="hs-imap-editor" aria-label="Selected reference clip editor">
          {!selectedEntry ? (
            <div className="hs-imap-empty">Select a reference clip to edit.</div>
          ) : (
            <>
              <div className="hs-imap-field-grid">
                <label>
                  Anchor
                  <input value={props.draft.anchorText} onChange={(event) => props.onDraftChange("anchorText", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Placement Hint
                  <select value={props.draft.placementHint} onChange={(event) => props.onDraftChange("placementHint", event.target.value)} disabled={props.disabled}>
                    {PLACEMENT_HINTS.map((hint) => <option key={hint} value={hint}>{hint}</option>)}
                  </select>
                </label>
                <label>
                  Format
                  <select value={props.draft.format} onChange={(event) => props.onDraftChange("format", event.target.value)} disabled={props.disabled}>
                    {FORMATS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
              </div>

              <div className="hs-imap-field">
                <label htmlFor="description-textarea">Description</label>
                <textarea id="description-textarea" value={props.draft.description} onChange={(event) => props.onDraftChange("description", event.target.value)} disabled={props.disabled} rows={2} />
              </div>

              <div className="hs-imap-field-grid">
                <label>
                  Data Type
                  <select value={props.draft.dataType} onChange={(event) => props.onDraftChange("dataType", event.target.value)} disabled={props.disabled}>
                    {DATA_TYPES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                <label>
                  Context Type
                  <select value={props.draft.contextType} onChange={(event) => props.onDraftChange("contextType", event.target.value)} disabled={props.disabled}>
                    {CONTEXT_TYPES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                <label>
                  Tone
                  <select value={props.draft.tone} onChange={(event) => props.onDraftChange("tone", event.target.value)} disabled={props.disabled}>
                    {TONES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                <label>
                  Motion Level
                  <select value={props.draft.motionLevel} onChange={(event) => props.onDraftChange("motionLevel", event.target.value)} disabled={props.disabled}>
                    {MOTION_LEVELS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
              </div>

              <div className="hs-imap-field-grid">
                <label>
                  Background Context Description
                  <input value={props.draft.backgroundContextDescription} onChange={(event) => props.onDraftChange("backgroundContextDescription", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Foreground Data Description
                  <input value={props.draft.foregroundDataDescription} onChange={(event) => props.onDraftChange("foregroundDataDescription", event.target.value)} disabled={props.disabled} />
                </label>
              </div>

              <div className="hs-imap-field-grid">
                <label>
                  Visual Style
                  <input value={props.draft.visualStyle} onChange={(event) => props.onDraftChange("visualStyle", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Source Type
                  <select value={props.draft.sourceType} onChange={(event) => props.onDraftChange("sourceType", event.target.value)} disabled={props.disabled}>
                    {SOURCE_TYPES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
              </div>

              <div className="hs-imap-field-grid">
                <label>
                  Chart Type
                  <select value={props.draft.chartType} onChange={(event) => props.onDraftChange("chartType", event.target.value)} disabled={props.disabled}>
                    {CHART_TYPES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                <label>
                  Title
                  <input value={props.draft.title} onChange={(event) => props.onDraftChange("title", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Emphasis Key
                  <input value={props.draft.emphasisKey} onChange={(event) => props.onDraftChange("emphasisKey", event.target.value)} disabled={props.disabled} />
                </label>
              </div>

              <div className="hs-imap-field-grid">
                <label>
                  Labels (comma separated)
                  <input value={props.draft.labels} onChange={(event) => props.onDraftChange("labels", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Values (comma separated)
                  <input value={props.draft.values} onChange={(event) => props.onDraftChange("values", event.target.value)} disabled={props.disabled} />
                </label>
              </div>

              <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={props.disabled}>Attach Result File</button>
                  <button type="button" onClick={props.onRegenerateStub} disabled={props.disabled}>Regenerate (stub)</button>
                </div>
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={props.onSaveEntry} disabled={props.disabled}>Save Reference Clip</button>
                  <button type="button" onClick={props.onDeleteEntry} disabled={props.disabled}>Delete Reference Clip</button>
                </div>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hs-hidden-input"
                  aria-label="Upload Asset File"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) props.onUploadAsset(file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>

              <section className="hs-imap-provider-pack" aria-label="Provider-aware prompt pack">
                <div className="hs-imap-provider-pack-header">
                  <div>
                    <div className="hs-field-label">Prompt Pack</div>
                    <div className="hs-imap-help-text">{props.activeVisualProviderBanner}</div>
                  </div>
                  <div className="hs-imap-help-text">{props.activeVisualProviderHelperText}</div>
                </div>
                {props.activePromptPack ? (
                  <>
                    <textarea
                      value={props.activePromptPack.prompt}
                      readOnly
                      rows={5}
                      aria-label="Generated prompt"
                      className="hs-thumb-prompt-card-text"
                    />
                    {props.activePromptPack.negative ? (
                      <textarea
                        value={props.activePromptPack.negative}
                        readOnly
                        rows={3}
                        aria-label="Generated negative prompt"
                        className="hs-thumb-prompt-card-text is-secondary"
                      />
                    ) : null}
                    <div className="hs-imap-help-text">
                      Aspect: {props.activePromptPack.aspectRatio ?? "16:9"} · Provider: {props.activeVisualProviderLabel}
                    </div>
                    {props.activePromptPack.styleTags?.length ? (
                      <div className="hs-thumb-prompt-card-tags">
                        {props.activePromptPack.styleTags.map((tag) => (
                          <span key={tag} className="hs-thumb-prompt-card-tag">{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    {props.activePromptPack.notes ? (
                      <div className="hs-thumb-prompt-card-note">{props.activePromptPack.notes}</div>
                    ) : null}
                  </>
                ) : (
                  <div className="hs-imap-empty">Select a reference clip to generate the active provider pack.</div>
                )}
              </section>

              <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={props.onCopyPrompt} disabled={props.disabled || !props.activePromptPack}>Copy Prompt</button>
                  <button
                    type="button"
                    onClick={props.onCopyNegativePrompt}
                    disabled={props.disabled || !props.activePromptPack?.negative}
                  >
                    Copy Negative
                  </button>
                  <button type="button" onClick={props.onDownloadPromptPack} disabled={props.disabled || !props.activePromptPack}>Download Prompt Pack</button>
                  <button type="button" onClick={props.onDownloadBrief} disabled={props.disabled}>Download Brief</button>
                  <button type="button" onClick={props.onDownloadBriefJson} disabled={props.disabled}>Download JSON Brief</button>
                </div>
                <div className="hs-imap-candidate-action-group">
                  <span className="hs-pill">Manual bridge: {props.requestState}</span>
                </div>
              </div>

              <div className="hs-imap-field-grid">
                <label>
                  Provider
                  <select value={props.draft.providerId} onChange={(event) => props.onDraftChange("providerId", event.target.value)} disabled={props.disabled}>
                    <option value="">Select provider</option>
                    {props.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Source Label
                  <input value={props.draft.sourceLabel} onChange={(event) => props.onDraftChange("sourceLabel", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Source URL
                  <input value={props.draft.sourceUrl} onChange={(event) => props.onDraftChange("sourceUrl", event.target.value)} disabled={props.disabled} />
                </label>
              </div>
              <div className="hs-imap-field-grid">
                <label>
                  Provider Note
                  <input value={props.draft.providerNote} onChange={(event) => props.onDraftChange("providerNote", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Usage / Licensing Note
                  <input value={props.draft.usageNote} onChange={(event) => props.onDraftChange("usageNote", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Result Metadata
                  <input value={props.draft.resultMetadata} onChange={(event) => props.onDraftChange("resultMetadata", event.target.value)} disabled={props.disabled} />
                </label>
              </div>

              <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={props.onOpenProvider} disabled={props.disabled}>Open Provider</button>
                  <button type="button" onClick={props.onMarkSent} disabled={props.disabled}>Mark as Sent</button>
                  <button type="button" onClick={props.onMarkAwaitingResult} disabled={props.disabled}>Mark Awaiting Result</button>
                  <button type="button" onClick={props.onAttachResultFromUrl} disabled={props.disabled}>Attach Result URL</button>
                </div>
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={props.onClearRequestState} disabled={props.disabled}>Clear Request State</button>
                </div>
              </div>

              <CandidateList
                candidates={candidates}
                selectedCandidateId={props.selectedCandidateId}
                disabled={Boolean(props.disabled)}
                onSelectCandidate={props.onSelectCandidate}
              />
            </>
          )}
        </section>
      </div>

      {props.saveError ? <div className="hs-error-text-small">{props.saveError}</div> : null}
      {props.message ? <div className="hs-imap-help-text">{props.message}</div> : null}
    </div>
  );
}
