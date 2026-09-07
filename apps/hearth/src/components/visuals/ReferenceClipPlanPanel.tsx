import { useEffect, useMemo, useRef, useState } from "react";
import { loadImageMapCandidatePreviewDataUrl } from "../../lib/hearth-image-map-repo";
import type { EpisodeBrollAssetCandidate, EpisodeContextualDataCompositePlan } from "../../lib/episode-package-v2";
import type { ExternalGenerationProvider } from "../../lib/hearth-visual-actionability";
import type { PromptPack } from "../../lib/hearth-visual-provider-profiles";
import CanonicalReferenceMaterialPanel from "./CanonicalReferenceMaterialPanel";
import { getReferenceMaterialRollout } from "../../lib/hearth-style-service";
import { subscribeToForgeUserAccessToken } from "../../lib/tongs-fetch";

type ReferenceClipPlanPanelProps = {
  canonicalWorkspaceId?: string | null;
  canonicalWorkpieceId?: string | null;
  canonicalAuthorityExists?: boolean;
  entries: EpisodeContextualDataCompositePlan[];
  selectedEntryId: string | null;
  saveState: "saved" | "editing" | "saving" | "error" | "offline";
  saveError: string | null;
  message: string | null;
  disabled?: boolean;
  workpieceId: string | null;
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
  copyPromptAcknowledged?: boolean;
  copyNegativeAcknowledged?: boolean;
  onSelectEntry: (entryId: string) => void;
  onDraftChange: (field: string, value: string) => void;
  onCreateReferenceClip: () => void;
  onSaveEntry: () => void;
  onDeleteEntry: () => void;
  onGenerateInForge: () => void;
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

type CandidatePreviewState = "loading" | "ready" | "error";

function resolveDirectCandidatePreviewSource(candidate: EpisodeBrollAssetCandidate): string | null {
  const uri = (candidate.uri ?? "").trim();
  if (uri && (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("blob:") || uri.startsWith("data:"))) {
    return uri;
  }
  const path = (candidate.path ?? "").trim();
  if (path && (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:") || path.startsWith("data:"))) {
    return path;
  }
  return null;
}

function resolveCandidatePreviewSource(
  candidate: EpisodeBrollAssetCandidate,
  previewUrlById: Record<string, string>,
): string | null {
  return resolveDirectCandidatePreviewSource(candidate) ?? previewUrlById[candidate.asset_id] ?? null;
}

function CandidateList(args: {
  candidates: EpisodeBrollAssetCandidate[];
  selectedCandidateId: string | null;
  disabled: boolean;
  previewStateById: Record<string, CandidatePreviewState>;
  previewUrlById: Record<string, string>;
  previewErrorById: Record<string, string>;
  onSelectCandidate: (candidateId: string) => void;
}) {
  if (args.candidates.length === 0) {
    return <div className="hs-imap-empty">No candidate assets attached yet.</div>;
  }
  return (
    <div className="hs-imap-candidates">
      {args.candidates.map((candidate) => {
        const previewSource = resolveCandidatePreviewSource(candidate, args.previewUrlById);
        const previewState = args.previewStateById[candidate.asset_id] ?? (previewSource ? "ready" : "error");
        const previewError = args.previewErrorById[candidate.asset_id] ?? null;
        const requiresImagePreview = !candidate.mime_type || candidate.mime_type.startsWith("image/");
        const isIncomplete = requiresImagePreview && !previewSource;
        const selectDisabled = args.disabled || isIncomplete;
        return (
          <article key={candidate.asset_id} className={`hs-imap-candidate-card${candidate.asset_id === args.selectedCandidateId ? " is-selected" : ""}`}>
            {requiresImagePreview ? (
              <div className="hs-imap-candidate-media">
                {previewSource ? (
                  <img
                    src={previewSource}
                    alt={candidate.label ?? "Reference clip candidate"}
                    className="hs-imap-candidate-image"
                    loading="lazy"
                  />
                ) : (
                  <div className="hs-imap-candidate-placeholder">
                    {previewState === "loading" ? "Loading preview..." : "Generation incomplete (no preview URL)"}
                  </div>
                )}
              </div>
            ) : null}
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
              <div className="hs-imap-candidate-subtitle">Asset: {candidate.asset_id}</div>
              {candidate.uri ? (
                <a href={candidate.uri} target="_blank" rel="noreferrer" className="hs-imap-link-inline">
                  Open source
                </a>
              ) : null}
              {candidate.path ? <div className="hs-imap-candidate-subtitle">{candidate.path}</div> : null}
              {previewError ? <div className="hs-error-text-small">{previewError}</div> : null}
            </div>
            <div className="hs-imap-candidate-actions">
              <button
                type="button"
                className="hs-imap-candidate-apply"
                disabled={selectDisabled}
                onClick={() => args.onSelectCandidate(candidate.asset_id)}
              >
                {candidate.asset_id === args.selectedCandidateId
                  ? "Selected for Reference Clip"
                  : isIncomplete
                    ? "Not Selectable (Incomplete)"
                    : "Choose Existing Asset"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function LegacyReferenceClipPlanPanel(props: ReferenceClipPlanPanelProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const lastPreviewLoadSignatureRef = useRef<string>("");
  const selectedEntry = useMemo(
    () => props.entries.find((entry) => entry.id === props.selectedEntryId) ?? null,
    [props.entries, props.selectedEntryId],
  );
  const candidates = selectedEntry?.candidate_assets ?? [];
  const [previewStateById, setPreviewStateById] = useState<Record<string, CandidatePreviewState>>({});
  const [previewUrlById, setPreviewUrlById] = useState<Record<string, string>>({});
  const [previewErrorById, setPreviewErrorById] = useState<Record<string, string>>({});
  const selectedAssetId = selectedEntry?.selected_asset_id ?? null;
  const selectedCandidate = selectedAssetId
    ? candidates.find((candidate) => candidate.asset_id === selectedAssetId) ?? null
    : null;
  const hasSelectedAsset = Boolean(selectedAssetId);
  const selectedAssetPreviewSource = selectedCandidate
    ? resolveCandidatePreviewSource(selectedCandidate, previewUrlById)
    : null;
  const hasUsableSelectedAsset = Boolean(selectedAssetPreviewSource);
  const previewLoadSignature = useMemo(() => {
    const episodeId = props.workpieceId?.trim() ?? "";
    const entryId = selectedEntry?.id ?? "";
    const candidateSignature = candidates
      .map((candidate) => [
        candidate.asset_id ?? "",
        candidate.path ?? "",
        candidate.mime_type ?? "",
        candidate.uri ?? "",
      ].join("|"))
      .join("||");
    return `${episodeId}::${entryId}::${candidateSignature}`;
  }, [candidates, props.workpieceId, selectedEntry?.id]);

  useEffect(() => {
    if (lastPreviewLoadSignatureRef.current === previewLoadSignature) {
      return;
    }
    lastPreviewLoadSignatureRef.current = previewLoadSignature;

    const episodeId = props.workpieceId?.trim() ?? "";
    if (!episodeId || !selectedEntry || candidates.length === 0) {
      setPreviewStateById({});
      setPreviewUrlById({});
      setPreviewErrorById({});
      return;
    }
    const candidatesNeedingLoad = candidates.filter((candidate) => {
      if (!candidate.asset_id || !candidate.path) return false;
      if (candidate.mime_type && !candidate.mime_type.startsWith("image/")) return false;
      return !resolveDirectCandidatePreviewSource(candidate);
    });
    if (!candidatesNeedingLoad.length) {
      setPreviewStateById({});
      setPreviewUrlById({});
      setPreviewErrorById({});
      return;
    }
    let cancelled = false;
    setPreviewStateById(Object.fromEntries(candidatesNeedingLoad.map((candidate) => [candidate.asset_id, "loading"] as const)));
    setPreviewUrlById({});
    setPreviewErrorById({});

    void Promise.all(candidatesNeedingLoad.map(async (candidate) => {
      const result = await loadImageMapCandidatePreviewDataUrl({
        workpieceId: episodeId,
        path: candidate.path ?? null,
        mimeType: candidate.mime_type ?? null,
      });
      return { assetId: candidate.asset_id, result };
    })).then((results) => {
      if (cancelled) return;
      const nextState: Record<string, CandidatePreviewState> = {};
      const nextUrls: Record<string, string> = {};
      const nextErrors: Record<string, string> = {};
      for (const { assetId, result } of results) {
        if (result.ok) {
          nextState[assetId] = "ready";
          nextUrls[assetId] = result.dataUrl;
        } else {
          nextState[assetId] = "error";
          nextErrors[assetId] = result.error;
        }
      }
      setPreviewStateById(nextState);
      setPreviewUrlById(nextUrls);
      setPreviewErrorById(nextErrors);
    });

    return () => {
      cancelled = true;
    };
  }, [candidates, previewLoadSignature, props.workpieceId, selectedEntry]);

  return (
    <div className="hs-imap-panel">
      <div className="hs-imap-header">
        <div>
          <h4 className="hs-imap-title">Reference Clips</h4>
          <p className="hs-imap-subtitle">Create one grounded, usable visual per beat. Start with anchor + description, then generate directly in Forge.</p>
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
        {selectedEntry ? (
          <span className="hs-pill">
            {!hasSelectedAsset
              ? "No result selected"
              : hasUsableSelectedAsset
                ? "Result attached"
                : "Result attached (not usable in Forge yet)"}
          </span>
        ) : null}
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
              <section className="hs-imap-next-card" aria-label="Reference clip quick workflow">
                <div className="hs-imap-next-eyebrow">Quick Workflow</div>
                <div className="hs-imap-next-copy">1) Adjust anchor and description. 2) Generate usable image in Forge. 3) Keep the best attached result.</div>
                <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                  <div className="hs-imap-candidate-action-group">
                    <button type="button" className="hs-primary-btn" onClick={props.onGenerateInForge} disabled={props.disabled}>
                      Generate in Forge
                    </button>
                    <button type="button" onClick={props.onSaveEntry} disabled={props.disabled}>Save Draft</button>
                    <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={props.disabled}>Attach Existing File</button>
                  </div>
                  <div className="hs-imap-candidate-action-group">
                    <button type="button" onClick={props.onDeleteEntry} disabled={props.disabled}>Delete Clip</button>
                  </div>
                </div>
              </section>

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

              <details className="hs-imap-advanced">
                <summary>Fine-tune generation settings</summary>
                <div className="hs-imap-advanced-body">
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
                  <div className="hs-imap-candidate-action-group">
                    <button type="button" onClick={props.onRegenerateStub} disabled={props.disabled}>Refresh Guidance From Description</button>
                  </div>
                </div>
              </details>

              <details className="hs-imap-advanced">
                <summary>Manual Bridge, Prompt Pack, and External Provider</summary>
                <div className="hs-imap-advanced-body">
              <section className="hs-imap-provider-pack" aria-label="Provider-aware prompt pack">
                <div className="hs-imap-provider-pack-header">
                  <div>
                    <div className="hs-field-label">Prompt Pack</div>
                    <div className="hs-imap-help-text">{props.activeVisualProviderBanner}</div>
                  </div>
                  <div className="hs-imap-help-text">{props.activeVisualProviderHelperText}</div>
                </div>
                <div className="hs-imap-help-text">
                  Hearth shapes this pack for the active visual provider. Use it in your outside tool, then track the manual bridge below.
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
                  <div className="hs-imap-empty">Select a reference clip to load the active provider pack for this beat.</div>
                )}
              </section>

              <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                <div className="hs-imap-candidate-action-group">
                  <button
                    type="button"
                    className={props.copyPromptAcknowledged ? "hs-copy-ack" : undefined}
                    onClick={props.onCopyPrompt}
                    disabled={props.disabled || !props.activePromptPack}
                  >
                    Copy Prompt
                  </button>
                  <button
                    type="button"
                    className={props.copyNegativeAcknowledged ? "hs-copy-ack" : undefined}
                    onClick={props.onCopyNegativePrompt}
                    disabled={props.disabled || !props.activePromptPack?.negative}
                  >
                    Copy Negative
                  </button>
                  <button type="button" onClick={props.onDownloadPromptPack} disabled={props.disabled || !props.activePromptPack}>Download Prompt Pack</button>
                  <button type="button" onClick={props.onDownloadBrief} disabled={props.disabled}>Download Source Brief</button>
                  <button type="button" onClick={props.onDownloadBriefJson} disabled={props.disabled}>Download Source Brief JSON</button>
                </div>
                <div className="hs-imap-candidate-action-group">
                  <span className="hs-pill">Manual Bridge State: {props.requestState}</span>
                </div>
              </div>

              <div className="hs-imap-help-text">
                These fields track where you sent the pack and what came back. They do not change the active prompt provider above.
              </div>
              <div className="hs-imap-field-grid">
                <label>
                  Manual Bridge Provider
                  <select value={props.draft.providerId} onChange={(event) => props.onDraftChange("providerId", event.target.value)} disabled={props.disabled}>
                    <option value="">Select provider</option>
                    {props.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Result Source Label
                  <input value={props.draft.sourceLabel} onChange={(event) => props.onDraftChange("sourceLabel", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Result Source URL
                  <input value={props.draft.sourceUrl} onChange={(event) => props.onDraftChange("sourceUrl", event.target.value)} disabled={props.disabled} />
                </label>
              </div>
              <div className="hs-imap-field-grid">
                <label>
                  Manual Bridge Note
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
                  <button type="button" onClick={props.onOpenProvider} disabled={props.disabled}>Open Manual Bridge Provider</button>
                  <button type="button" onClick={props.onMarkSent} disabled={props.disabled}>Mark as Sent</button>
                  <button type="button" onClick={props.onMarkAwaitingResult} disabled={props.disabled}>Mark Awaiting Result</button>
                  <button type="button" onClick={props.onAttachResultFromUrl} disabled={props.disabled}>Attach Result URL</button>
                </div>
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={props.onClearRequestState} disabled={props.disabled}>Clear Request State</button>
                </div>
              </div>
                </div>
              </details>

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

              <div className="hs-imap-tools-label">Attached results</div>
              {hasSelectedAsset && !hasUsableSelectedAsset ? (
                <div className="hs-error-text-small">
                  Selected result is attached but missing a renderable preview URL. Attach a direct image URL or upload/select a candidate that can preview in-app.
                </div>
              ) : null}

              <CandidateList
                candidates={candidates}
                selectedCandidateId={props.selectedCandidateId}
                disabled={Boolean(props.disabled)}
                previewStateById={previewStateById}
                previewUrlById={previewUrlById}
                previewErrorById={previewErrorById}
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

export default function ReferenceClipPlanPanel(props: ReferenceClipPlanPanelProps) {
  const workspaceId = props.canonicalWorkspaceId ?? null;
  const workpieceId = props.canonicalWorkpieceId ?? null;
  const [rollout, setRollout] = useState<"loading" | "enabled" | "disabled" | "unavailable">(
    workspaceId && workpieceId ? "loading" : "disabled",
  );

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || !workpieceId) {
      setRollout("disabled");
      return () => {
        cancelled = true;
      };
    }
    const refreshRollout = () => {
      setRollout("loading");
      void getReferenceMaterialRollout(workspaceId).then((result) => {
        if (cancelled) return;
        setRollout(result.ok ? (result.data.enabled ? "enabled" : "disabled") : "unavailable");
      });
    };
    refreshRollout();
    const unsubscribeFromAuth = subscribeToForgeUserAccessToken(refreshRollout);
    return () => {
      cancelled = true;
      unsubscribeFromAuth();
    };
  }, [workspaceId, workpieceId]);

  if (workspaceId && workpieceId && (rollout === "enabled" || props.canonicalAuthorityExists === true)) {
    return <CanonicalReferenceMaterialPanel workspaceId={workspaceId} workpieceId={workpieceId}/>;
  }
  if (workspaceId && workpieceId && rollout === "loading") {
    return <div className="hs-imap-help-text" role="status">Checking Reference Material availability…</div>;
  }
  return <>
    {rollout === "unavailable" ? <div className="hs-error-text-small" role="status">Reference Material rollout authority is unavailable. The established reference workflow remains available.</div> : null}
    <LegacyReferenceClipPlanPanel {...props}/>
  </>;
}
