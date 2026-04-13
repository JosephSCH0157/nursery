import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadImageMapCandidatePreviewDataUrl } from "../../lib/hearth-image-map-repo";
import type { EpisodeBrollAssetCandidate, EpisodeBrollPlanBeat } from "../../lib/episode-package-v2";
import type { ExternalGenerationProvider } from "../../lib/hearth-visual-actionability";

type BrollPlanPanelProps = {
  beats: EpisodeBrollPlanBeat[];
  selectedBeatId: string | null;
  coverageStrength: string | null;
  saveState: "saved" | "editing" | "saving" | "error" | "offline";
  saveError: string | null;
  message: string | null;
  disabled?: boolean;
  workpieceId: string | null;
  draft: {
    anchorText: string;
    description: string;
    motionIntent: string;
    assetCategory: string;
    priority: string;
    keywords: string;
    mood: string;
    shotType: string;
    motionSuggestion: string;
    suggestedDurationMs: string;
    placementHint: string;
    dataChartType: string;
    dataTitle: string;
    dataLabels: string;
    dataValues: string;
    dataEmphasisKey: string;
    dataAnimationStyle: string;
    providerId: string;
    sourceLabel: string;
    sourceUrl: string;
    providerNote: string;
    usageNote: string;
    resultMetadata: string;
  };
  requestState: string;
  providers: ExternalGenerationProvider[];
  selectedCandidateId: string | null;
  copyPromptAcknowledged?: boolean;
  onSelectBeat: (beatId: string) => void;
  onDraftChange: (field: string, value: string) => void;
  onSaveBeat: () => void;
  onDeleteBeat: () => void;
  onRegenerateBeat: () => void;
  onGeneratePlan: () => void;
  onFindStock: () => void;
  onUploadAsset: (file: File) => void;
  onSelectCandidate: (candidateId: string) => void;
  onRetryCandidateIngestion: (candidateId: string) => void;
  onCopyPrompt: () => void;
  onDownloadBrief: () => void;
  onDownloadBriefJson: () => void;
  onOpenProvider: () => void;
  onMarkSent: () => void;
  onMarkAwaitingResult: () => void;
  onClearRequestState: () => void;
  onAttachResultFromUrl: () => void;
};

const MOTION_INTENTS = [
  "broll",
  "establishing",
  "cutaway",
  "reaction",
  "ambient",
  "explanatory",
  "graphic",
  "data_visual",
  "map",
  "timeline",
  "transition",
];
const ASSET_CATEGORIES = [
  "stock_video",
  "ai_video",
  "uploaded_video",
  "animated_chart",
  "animated_graphic",
  "timeline_graphic",
  "map_animation",
  "stat_card",
];
const PRIORITIES = ["primary", "supporting", "background"];
const SHOT_TYPES = ["mixed", "wide", "medium", "close", "macro", "aerial"];
const PLACEMENT_HINTS = ["first_occurrence", "exact_timestamp", "manual"];
const DATA_CHART_TYPES = ["bar", "line", "area", "pie", "timeline", "stat"];

type CandidatePreviewState = "loading" | "ready" | "error";

function isVideoCandidate(candidate: EpisodeBrollAssetCandidate): boolean {
  return (candidate.mime_type ?? "").trim().toLowerCase().startsWith("video/");
}

function resolveDirectCandidatePreviewSource(candidate: EpisodeBrollAssetCandidate): string | null {
  const uri = (candidate.uri ?? "").trim();
  if (uri && (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("blob:") || uri.startsWith("data:"))) {
    return uri;
  }
  const previewPath = (candidate.preview_path ?? "").trim();
  if (previewPath && (previewPath.startsWith("http://") || previewPath.startsWith("https://") || previewPath.startsWith("blob:") || previewPath.startsWith("data:"))) {
    return previewPath;
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

function resolveCandidateStatus(candidate: EpisodeBrollAssetCandidate): "processing" | "ready" | "failed" {
  const status = candidate.ingest_status ?? null;
  if (status === "processing") return "processing";
  if (status === "failed") return "failed";
  if (isVideoCandidate(candidate) && !(candidate.preview_path ?? "").trim()) return "processing";
  return "ready";
}

function resolveBeatState(beat: EpisodeBrollPlanBeat): string {
  if (beat.fulfillment_state) return beat.fulfillment_state;
  if (beat.selected_asset_id) return "resolved";
  if ((beat.candidate_assets?.length ?? 0) > 0) return "candidate_assets_available";
  return "unresolved";
}

function CandidateList(args: {
  candidates: EpisodeBrollAssetCandidate[];
  selectedCandidateId: string | null;
  disabled: boolean;
  previewStateById: Record<string, CandidatePreviewState>;
  previewUrlById: Record<string, string>;
  previewErrorById: Record<string, string>;
  onSelectCandidate: (candidateId: string) => void;
  onRetryCandidateIngestion: (candidateId: string) => void;
}) {
  if (args.candidates.length === 0) {
    return <div className="hs-imap-empty">No candidate assets attached yet.</div>;
  }
  return (
    <div className="hs-imap-candidates">
      {args.candidates.map((candidate) => {
        const status = resolveCandidateStatus(candidate);
        const previewSource = resolveCandidatePreviewSource(candidate, args.previewUrlById);
        const previewState = args.previewStateById[candidate.asset_id] ?? (previewSource ? "ready" : "error");
        const previewError = args.previewErrorById[candidate.asset_id] ?? null;
        const needsPreviewIngestion = isVideoCandidate(candidate) && !(candidate.preview_path ?? "").trim();
        const canSelect = status === "ready";
        const selectDisabled = args.disabled || !canSelect;
        const statusLabel = status === "processing"
          ? "Processing"
          : status === "failed"
            ? "Failed"
            : "Ready";
        return (
          <article key={candidate.asset_id} className={`hs-imap-candidate-card${candidate.asset_id === args.selectedCandidateId ? " is-selected" : ""}`}>
            <div className="hs-imap-candidate-media">
              {previewSource ? (
                <img
                  src={previewSource}
                  alt={candidate.label ?? "B-roll candidate"}
                  className="hs-imap-candidate-image"
                  loading="lazy"
                />
              ) : (
                <div className={`hs-imap-candidate-placeholder${previewError ? " is-error" : ""}`}>
                  {status === "processing"
                    ? "Processing upload..."
                    : previewState === "loading"
                      ? "Loading preview..."
                      : needsPreviewIngestion
                        ? "Video thumbnail pending. Generate a thumbnail to preview."
                        : "Preview unavailable"}
                </div>
              )}
            </div>
            <div className="hs-imap-candidate-meta">
              <div className="hs-imap-candidate-title">
                {candidate.label ?? candidate.source}
                {candidate.asset_id === args.selectedCandidateId ? <span className="hs-imap-candidate-badge">Selected</span> : null}
              </div>
              <div className="hs-imap-candidate-subtitle">
                {candidate.source}
                {candidate.asset_category ? ` • ${candidate.asset_category}` : ""}
                {candidate.mime_type ? ` • ${candidate.mime_type}` : ""}
                {` • ${statusLabel}`}
              </div>
              {candidate.ingest_error ? <div className="hs-error-text-small">{candidate.ingest_error}</div> : null}
              {previewError ? <div className="hs-error-text-small">{previewError}</div> : null}
              {candidate.uri ? (
                <a href={candidate.uri} target="_blank" rel="noreferrer" className="hs-imap-link-inline">
                  Open source
                </a>
              ) : null}
              {(candidate.preview_path ?? candidate.path) ? (
                <div className="hs-imap-candidate-subtitle">{candidate.preview_path ?? candidate.path}</div>
              ) : null}
            </div>
            <div className="hs-imap-candidate-actions">
              <button
                type="button"
                className="hs-imap-candidate-apply"
                disabled={selectDisabled}
                onClick={() => args.onSelectCandidate(candidate.asset_id)}
              >
                {candidate.asset_id === args.selectedCandidateId
                  ? "Selected for Beat"
                  : canSelect
                    ? "Use Selected Asset"
                    : status === "processing"
                      ? "Not Selectable (Processing)"
                      : "Not Selectable (Failed)"}
              </button>
              {status === "failed" || needsPreviewIngestion ? (
                <button
                  type="button"
                  className="hs-imap-candidate-apply"
                  disabled={args.disabled}
                  onClick={() => args.onRetryCandidateIngestion(candidate.asset_id)}
                >
                  {status === "failed" ? "Retry Ingestion" : "Generate Thumbnail"}
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function BrollPlanPanel(props: BrollPlanPanelProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const lastPreviewLoadSignatureRef = useRef<string>("");
  const formFieldIdPrefix = useId();
  const selectedBeat = useMemo(
    () => props.beats.find((beat) => beat.id === props.selectedBeatId) ?? null,
    [props.beats, props.selectedBeatId],
  );
  const beatCandidates = selectedBeat?.candidate_assets ?? [];
  const [previewStateById, setPreviewStateById] = useState<Record<string, CandidatePreviewState>>({});
  const [previewUrlById, setPreviewUrlById] = useState<Record<string, string>>({});
  const [previewErrorById, setPreviewErrorById] = useState<Record<string, string>>({});
  const previewLoadSignature = useMemo(() => {
    const episodeId = props.workpieceId?.trim() ?? "";
    const beatId = selectedBeat?.id ?? "";
    const candidateSignature = beatCandidates
      .map((candidate) => [
        candidate.asset_id ?? "",
        candidate.path ?? "",
        candidate.preview_path ?? "",
        candidate.mime_type ?? "",
        candidate.uri ?? "",
        candidate.ingest_status ?? "",
      ].join("|"))
      .join("||");
    return `${episodeId}::${beatId}::${candidateSignature}`;
  }, [beatCandidates, props.workpieceId, selectedBeat?.id]);

  useEffect(() => {
    if (lastPreviewLoadSignatureRef.current === previewLoadSignature) {
      return;
    }
    lastPreviewLoadSignatureRef.current = previewLoadSignature;

    const episodeId = props.workpieceId?.trim() ?? "";
    if (!episodeId || !selectedBeat || beatCandidates.length === 0) {
      setPreviewStateById({});
      setPreviewUrlById({});
      setPreviewErrorById({});
      return;
    }

    const candidatesNeedingLoad = beatCandidates.filter((candidate) => {
      if (!candidate.asset_id) return false;
      if (candidate.ingest_status === "processing") return false;
      const previewPath = isVideoCandidate(candidate)
        ? (candidate.preview_path ?? candidate.thumbnail_path ?? "").trim()
        : (candidate.preview_path ?? candidate.path ?? "").trim();
      if (!previewPath) return false;
      if (resolveDirectCandidatePreviewSource(candidate)) return false;
      return true;
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
        path: isVideoCandidate(candidate)
          ? (candidate.preview_path ?? candidate.thumbnail_path ?? null)
          : (candidate.preview_path ?? candidate.path ?? null),
        mimeType: "image/jpeg",
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
  }, [beatCandidates, previewLoadSignature, props.workpieceId, selectedBeat]);

  return (
    <div className="hs-imap-panel">
      <div className="hs-imap-header">
        <div>
          <h4 className="hs-imap-title">B-roll Plan</h4>
          <p className="hs-imap-subtitle">Generate motion coverage beats for the episode, then resolve each beat with stock or uploaded assets.</p>
        </div>
        <div className="hs-imap-candidate-action-group">
          <button type="button" className="hs-primary-btn" onClick={props.onGeneratePlan} disabled={props.disabled || props.saveState === "saving"}>
            Generate B-roll Plan
          </button>
        </div>
      </div>

      <div className="hs-imap-toolbar">
        <span className="hs-pill">{props.beats.length} beats</span>
        <span className="hs-pill">Coverage: {props.coverageStrength ?? "low"}</span>
        <span className="hs-pill">State: {props.saveState}</span>
      </div>

      <div className="hs-imap-grid">
        <section className="hs-imap-list" aria-label="B-roll beats">
          {props.beats.length === 0 ? (
            <div className="hs-imap-empty">Generate a B-roll plan to start.</div>
          ) : props.beats.map((beat) => (
            <button
              key={beat.id}
              type="button"
              className={`hs-imap-entry${beat.id === props.selectedBeatId ? " is-selected" : ""}`}
              onClick={() => props.onSelectBeat(beat.id)}
              disabled={props.disabled}
            >
              <div className="hs-imap-entry-title">{beat.anchor_text || "Untitled beat"}</div>
              <div className="hs-imap-entry-meta">{beat.motion_intent} · {beat.priority} · {resolveBeatState(beat)}</div>
            </button>
          ))}
        </section>

        <section className="hs-imap-editor" aria-label="Selected B-roll beat editor">
          {!selectedBeat ? (
            <div className="hs-imap-empty">Select a B-roll beat to edit.</div>
          ) : (
            <>
              <section className="hs-imap-next-card" aria-label="B-roll quick workflow">
                <div className="hs-imap-next-eyebrow">Quick Workflow</div>
                <div className="hs-imap-next-copy">1) Adjust beat details. 2) Resolve with stock, upload from another source, or attach a URL. 3) Save this beat.</div>
                <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                  <div className="hs-imap-candidate-action-group">
                    <button type="button" onClick={props.onFindStock} disabled={props.disabled}>Find Stock</button>
                    <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={props.disabled}>Attach Existing File</button>
                    <button type="button" onClick={props.onAttachResultFromUrl} disabled={props.disabled}>Attach Result URL</button>
                    <button type="button" onClick={props.onSaveBeat} disabled={props.disabled}>Save Beat</button>
                  </div>
                  <div className="hs-imap-candidate-action-group">
                    <button type="button" onClick={props.onDeleteBeat} disabled={props.disabled}>Delete Beat</button>
                  </div>
                </div>
              </section>

              <div className="hs-imap-field">
                <label htmlFor={`${formFieldIdPrefix}-anchor`}>Anchor</label>
                <input
                  id={`${formFieldIdPrefix}-anchor`}
                  value={props.draft.anchorText}
                  onChange={(event) => props.onDraftChange("anchorText", event.target.value)}
                  disabled={props.disabled}
                />
              </div>
              <div className="hs-imap-field">
                <label htmlFor={`${formFieldIdPrefix}-description`}>Description</label>
                <textarea
                  id={`${formFieldIdPrefix}-description`}
                  value={props.draft.description}
                  onChange={(event) => props.onDraftChange("description", event.target.value)}
                  disabled={props.disabled}
                  rows={3}
                />
              </div>
              <div className="hs-imap-field-grid">
                <label>
                  Motion Intent
                  <select value={props.draft.motionIntent} onChange={(event) => props.onDraftChange("motionIntent", event.target.value)} disabled={props.disabled}>
                    {MOTION_INTENTS.map((intent) => <option key={intent} value={intent}>{intent}</option>)}
                  </select>
                </label>
                <label>
                  Asset Category
                  <select value={props.draft.assetCategory} onChange={(event) => props.onDraftChange("assetCategory", event.target.value)} disabled={props.disabled}>
                    {ASSET_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label>
                  Priority
                  <select value={props.draft.priority} onChange={(event) => props.onDraftChange("priority", event.target.value)} disabled={props.disabled}>
                    {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </label>
                <label>
                  Shot Type
                  <select value={props.draft.shotType} onChange={(event) => props.onDraftChange("shotType", event.target.value)} disabled={props.disabled}>
                    {SHOT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  Placement Hint
                  <select value={props.draft.placementHint} onChange={(event) => props.onDraftChange("placementHint", event.target.value)} disabled={props.disabled}>
                    {PLACEMENT_HINTS.map((hint) => <option key={hint} value={hint}>{hint}</option>)}
                  </select>
                </label>
              </div>
              <div className="hs-imap-field-grid">
                <label>
                  Mood
                  <input value={props.draft.mood} onChange={(event) => props.onDraftChange("mood", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Keywords (comma separated)
                  <input value={props.draft.keywords} onChange={(event) => props.onDraftChange("keywords", event.target.value)} disabled={props.disabled} />
                </label>
                <label>
                  Suggested Duration (ms)
                  <input value={props.draft.suggestedDurationMs} onChange={(event) => props.onDraftChange("suggestedDurationMs", event.target.value)} disabled={props.disabled} />
                </label>
              </div>
              <div className="hs-imap-field">
                <label htmlFor={`${formFieldIdPrefix}-motion-suggestion`}>Motion Suggestion</label>
                <textarea
                  id={`${formFieldIdPrefix}-motion-suggestion`}
                  value={props.draft.motionSuggestion}
                  onChange={(event) => props.onDraftChange("motionSuggestion", event.target.value)}
                  disabled={props.disabled}
                  rows={2}
                />
              </div>
              {props.draft.motionIntent === "data_visual" ? (
                <>
                  <div className="hs-imap-field-grid">
                    <label>
                      Chart Type
                      <select value={props.draft.dataChartType} onChange={(event) => props.onDraftChange("dataChartType", event.target.value)} disabled={props.disabled}>
                        {DATA_CHART_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>
                    <label>
                      Data Title
                      <input value={props.draft.dataTitle} onChange={(event) => props.onDraftChange("dataTitle", event.target.value)} disabled={props.disabled} />
                    </label>
                    <label>
                      Emphasis Key
                      <input value={props.draft.dataEmphasisKey} onChange={(event) => props.onDraftChange("dataEmphasisKey", event.target.value)} disabled={props.disabled} />
                    </label>
                  </div>
                  <div className="hs-imap-field-grid">
                    <label>
                      Labels (comma separated)
                      <input value={props.draft.dataLabels} onChange={(event) => props.onDraftChange("dataLabels", event.target.value)} disabled={props.disabled} />
                    </label>
                    <label>
                      Values (comma separated numbers)
                      <input value={props.draft.dataValues} onChange={(event) => props.onDraftChange("dataValues", event.target.value)} disabled={props.disabled} />
                    </label>
                    <label>
                      Animation Style
                      <input value={props.draft.dataAnimationStyle} onChange={(event) => props.onDraftChange("dataAnimationStyle", event.target.value)} disabled={props.disabled} />
                    </label>
                  </div>
                </>
              ) : null}

              <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={props.onFindStock} disabled={props.disabled}>Find Stock</button>
                  <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={props.disabled}>Attach Existing File</button>
                  <button type="button" onClick={props.onRegenerateBeat} disabled={props.disabled}>Regenerate Beat</button>
                </div>
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={props.onSaveBeat} disabled={props.disabled}>Save Beat</button>
                  <button type="button" onClick={props.onDeleteBeat} disabled={props.disabled}>Delete Beat</button>
                </div>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hs-hidden-input"
                  aria-label="Attach result file"
                  title="Attach result file"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) props.onUploadAsset(file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>

              <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                <div className="hs-imap-candidate-action-group">
                  <button
                    type="button"
                    className={props.copyPromptAcknowledged ? "hs-copy-ack" : undefined}
                    onClick={props.onCopyPrompt}
                    disabled={props.disabled}
                  >
                    Copy Prompt
                  </button>
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
                candidates={beatCandidates}
                selectedCandidateId={props.selectedCandidateId}
                disabled={Boolean(props.disabled)}
                previewStateById={previewStateById}
                previewUrlById={previewUrlById}
                previewErrorById={previewErrorById}
                onSelectCandidate={props.onSelectCandidate}
                onRetryCandidateIngestion={props.onRetryCandidateIngestion}
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
