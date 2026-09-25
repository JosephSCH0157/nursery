import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadImageMapCandidatePreviewDataUrl } from "../../lib/hearth-image-map-repo";
import type { EpisodeBrollAssetCandidate, EpisodeBrollPlanBeat } from "../../lib/episode-package-v2";
import type { ExternalGenerationProvider } from "../../lib/hearth-visual-actionability";
import { refreshCanonicalBrollMediaUrl, type CanonicalBrollPromptState, type CustomerMotionPromptSpendingQuote, type CustomerRunwaySpendingQuote, type CustomerRunwaySpendingReceipt } from "../../lib/hearth-broll-v2-authority";
import { readVisualOpportunityDispositions, type VisualOpportunityDisposition } from "../../lib/hearth-visual-disposition-authority";
import { VisualOpportunityDispositionControl } from "./VisualOpportunityDispositionControl";

type BrollPlanPanelProps = {
  beats: EpisodeBrollPlanBeat[];
  selectedBeatId: string | null;
  coverageStrength: string | null;
  saveState: "saved" | "editing" | "saving" | "error" | "offline";
  saveError: string | null;
  motionPromptError?: string | null;
  motionPromptQuote?: CustomerMotionPromptSpendingQuote | null;
  message: string | null;
  activeOperation?: "motion_prompt" | "video" | null;
  disabled?: boolean;
  workpieceId: string | null;
  workspaceId?: string | null;
  canonicalPlanRevisionId?: string | null;
  canonicalPlanRevision?: number;
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
  promptState?: CanonicalBrollPromptState | null;
  onGenerateMotionPrompt?: (creatorDirection: string) => void;
  onAcceptMotionPromptQuote?: () => void;
  onDismissMotionPromptQuote?: () => void;
  onSaveMotionPrompt?: (finalPrompt: string) => void;
  onCreateRunwayReadyPrompt?: () => Promise<{ finalPrompt:string;lengthUtf16:number }|null>;
  onGenerateVideo?: (referenceImages: Array<{ file: File; stageLabel?: string }>) => void;
  spendingQuote?: CustomerRunwaySpendingQuote | null;
  spendingReceipt?: CustomerRunwaySpendingReceipt | null;
  onAcceptSpendingQuote?: () => void;
  onDismissSpendingQuote?: () => void;
  canonicalV2?: boolean;
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

function formatCurrencyMicros(micros: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(micros / 1_000_000);
}

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

function formatDuration(durationMs?: number | null): string {
  if (!durationMs) return "Duration unavailable";
  return `${(durationMs / 1000).toFixed(durationMs % 1000 ? 1 : 0)} sec`;
}

function formatCandidateDate(candidate: EpisodeBrollAssetCandidate): string | null {
  const value = candidate.created_at ?? candidate.attached_at ?? null;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function candidateSourceLabel(candidate: EpisodeBrollAssetCandidate): string {
  if (candidate.source === "generated" || candidate.asset_category === "ai_video") return "Runway";
  if (candidate.source === "upload") return "Upload";
  if (candidate.source === "external") return "External";
  return candidate.source_label?.trim() || candidate.source.replaceAll("_", " ");
}

function creatorBrollProgress(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("runway") || normalized.includes("generation")) return message;
  if (normalized.includes("candidate is ready") || normalized.includes("ready to preview")) return "Ready to review";
  if (normalized.includes("poster") || normalized.includes("preview")) return "Creating preview";
  if (normalized.includes("processing") || normalized.includes("video asset")) return "Processing video";
  if (normalized.includes("durable task")) return "Generating with Runway";
  if (normalized.includes("reserved") || normalized.includes("preparing")) return "Preparing request";
  return message;
}

function creatorBrollError(message: string): string {
  if (/unavailable for new Forge-funded execution|paid_execution_halted/i.test(message)) {
    return "Motion prompt generation is temporarily paused for customer-funded AI operations. No credits were charged. You can still upload a video or attach an external clip.";
  }
  if (/vite module runner has been closed/i.test(message)) {
    return "Video generation could not start because the server was unavailable. Restart Forge and try again.";
  }
  if (/not have enough credits|insufficient credits?/i.test(message)) {
    return "Runway could not accept this request because the configured Runway provider account has insufficient credits. This is separate from the Forge AI Credits balance shown in the header. Fund or replace the configured Runway account, or upload an existing B-roll clip.";
  }
  return message;
}

function CandidateList(args: {
  workpieceId: string | null;
  candidates: EpisodeBrollAssetCandidate[];
  selectedCandidateId: string | null;
  disabled: boolean;
  previewStateById: Record<string, CandidatePreviewState>;
  previewUrlById: Record<string, string>;
  previewErrorById: Record<string, string>;
  onSelectCandidate: (candidateId: string) => void;
  onRetryCandidateIngestion: (candidateId: string) => void;
}) {
  const [freshMediaById, setFreshMediaById] = useState<Record<string, string>>({});
  const [mediaErrorById, setMediaErrorById] = useState<Record<string, string>>({});
  const refreshingMediaRef = useRef(new Set<string>());
  const refreshMedia = async (candidate: EpisodeBrollAssetCandidate, open: boolean) => {
    if (!candidate.path || refreshingMediaRef.current.has(candidate.asset_id)) return;
    refreshingMediaRef.current.add(candidate.asset_id);
    const opened = open ? window.open("about:blank", "_blank") : null;
    if (opened) opened.opener = null;
    if (!args.workpieceId) { opened?.close(); refreshingMediaRef.current.delete(candidate.asset_id); return; }
    const result = await refreshCanonicalBrollMediaUrl({ workpieceId: args.workpieceId, path: candidate.path });
    refreshingMediaRef.current.delete(candidate.asset_id);
    if (!result.ok) {
      opened?.close();
      setMediaErrorById((current) => ({ ...current, [candidate.asset_id]: result.error }));
      return;
    }
    setFreshMediaById((current) => ({ ...current, [candidate.asset_id]: result.data }));
    setMediaErrorById((current) => ({ ...current, [candidate.asset_id]: "" }));
    if (opened) opened.location.replace(result.data);
  };
  if (args.candidates.length === 0) {
    return <div className="hs-imap-empty">No candidate assets attached yet.</div>;
  }
  return (
    <div className="hs-imap-candidates">
      {args.candidates.map((candidate) => {
        const mediaSource = freshMediaById[candidate.asset_id] ?? candidate.uri ?? undefined;
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
              {previewSource && isVideoCandidate(candidate) ? (
                <video
                  src={mediaSource}
                  poster={candidate.preview_path ?? undefined}
                  className="hs-imap-candidate-image"
                  controls
                  preload="metadata"
                  onError={() => { if (candidate.path && !freshMediaById[candidate.asset_id]) void refreshMedia(candidate, false); }}
                />
              ) : previewSource ? (
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
              <div className="hs-broll-candidate-chips"><span>{candidateSourceLabel(candidate)}</span><span>{formatDuration(candidate.duration_ms)}</span>{formatCandidateDate(candidate) ? <span>{formatCandidateDate(candidate)}</span> : null}</div>
              <div className="hs-imap-candidate-status">{statusLabel}</div>
              {candidate.ingest_error ? <div className="hs-error-text-small">{candidate.ingest_error}</div> : null}
              {previewError ? <div className="hs-error-text-small">{previewError}</div> : null}
              {mediaErrorById[candidate.asset_id] ? <div className="hs-error-text-small">{mediaErrorById[candidate.asset_id]}</div> : null}
              <details className="hs-broll-candidate-details">
                <summary>Provenance</summary>
                <p>Source: {candidateSourceLabel(candidate)}</p>
                {candidate.mime_type ? <p>Media: {candidate.mime_type}</p> : null}
                {candidate.path ? <button type="button" className="hs-imap-link-inline" onClick={() => void refreshMedia(candidate, true)}>Open canonical media</button> : null}
              </details>
            </div>
            <div className="hs-imap-candidate-actions">
              <button
                type="button"
                className="hs-imap-candidate-apply"
                disabled={selectDisabled}
                onClick={() => args.onSelectCandidate(candidate.asset_id)}
              >
                {candidate.asset_id === args.selectedCandidateId
                  ? "Selected clip"
                  : canSelect
                    ? "Use this clip"
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
  const [dispositions, setDispositions] = useState<VisualOpportunityDisposition[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const lastPreviewLoadSignatureRef = useRef<string>("");
  const formFieldIdPrefix = useId();
  const selectedBeat = useMemo(
    () => props.beats.find((beat) => beat.id === props.selectedBeatId) ?? null,
    [props.beats, props.selectedBeatId],
  );
  const currentDisposition = selectedBeat
    ? dispositions.find((item) => item.kind === "broll" && item.opportunityId === selectedBeat.id) ?? null
    : null;
  useEffect(() => {
    if (!props.workspaceId || !props.workpieceId || !props.canonicalV2) return;
    void readVisualOpportunityDispositions(props.workspaceId, props.workpieceId).then((result) => {
      if (result.ok) setDispositions(result.data);
    });
  }, [props.workspaceId, props.workpieceId, props.canonicalV2]);
  const beatCandidates = selectedBeat?.candidate_assets ?? [];
  const [previewStateById, setPreviewStateById] = useState<Record<string, CandidatePreviewState>>({});
  const [previewUrlById, setPreviewUrlById] = useState<Record<string, string>>({});
  const [previewErrorById, setPreviewErrorById] = useState<Record<string, string>>({});
  const [creatorDirection, setCreatorDirection] = useState("");
  const [finalPromptDraft, setFinalPromptDraft] = useState("");
  const [runwayProposalPending, setRunwayProposalPending] = useState(false);
  const [generationReferences, setGenerationReferences] = useState<Array<{ file: File; stageLabel: string }>>([]);
  const [acquisitionMode, setAcquisitionMode] = useState<"generate" | "upload" | "external" | "stock">("generate");
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
    setCreatorDirection(props.promptState?.creatorDirection?.trim() ? props.promptState.creatorDirection : selectedBeat?.description ?? "");
    setFinalPromptDraft(props.promptState?.finalPrompt ?? "");
  }, [selectedBeat?.id, selectedBeat?.description, props.promptState?.revisionId, props.promptState?.creatorDirection, props.promptState?.finalPrompt]);

  useEffect(() => setGenerationReferences([]), [selectedBeat?.id]);

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

  if (props.canonicalV2) {
    const skippedIds = new Set(dispositions.filter((item) => item.kind === "broll" && item.state === "skipped").map((item) => item.opportunityId));
    const readyCount = props.beats.filter((beat) => beat.fulfillment_state === "resolved" && beat.selected_asset_id && !skippedIds.has(beat.id)).length;
    const skippedCount = props.beats.filter((beat) => skippedIds.has(beat.id)).length;
    const unresolvedCount = props.beats.length - readyCount - skippedCount;
    return (
      <div className="hs-imap-panel hs-broll-v2" data-testid="broll-v2-panel">
        <div className="hs-imap-header hs-broll-v2-header">
          <div>
            <h4 className="hs-imap-title">B-roll</h4>
            <p className="hs-imap-subtitle">{readyCount} fulfilled · {skippedCount} skipped · {unresolvedCount} unresolved</p>
          </div>
          {skippedCount?<button type="button" onClick={()=>{const first=props.beats.find(beat=>skippedIds.has(beat.id));if(first)props.onSelectBeat(first.id);}} disabled={props.disabled}>Review skipped ({skippedCount})</button>:null}
          {!props.beats.length ? <button type="button" className="hs-primary-btn" onClick={props.onGeneratePlan} disabled={props.disabled || props.saveState === "saving"}>Create B-roll plan</button> : null}
        </div>
        {props.saveError ? <div className="hs-error-text" role="alert">{creatorBrollError(props.saveError)}</div> : null}
        {props.message ? <div className="hs-success-text" role="status">{creatorBrollProgress(props.message)}</div> : null}
        <div className="hs-imap-grid hs-broll-v2-layout">
          <section className="hs-imap-list" aria-label="Canonical B-roll beats">
            {props.beats.length === 0 ? <div className="hs-imap-empty">No canonical B-roll plan exists yet.</div> : props.beats.map((beat, index) => (
              <button key={beat.id} type="button" className={`hs-imap-entry${beat.id === props.selectedBeatId ? " is-selected" : ""}`} onClick={() => props.onSelectBeat(beat.id)} disabled={props.disabled}>
                <div className="hs-imap-entry-title"><span className="hs-broll-beat-mark">{skippedIds.has(beat.id) ? "−" : beat.selected_asset_id ? "✓" : "•"}</span>{index + 1}. {beat.anchor_text}</div>
                <div className="hs-imap-entry-meta">{skippedIds.has(beat.id) ? "Skipped" : beat.selected_asset_id ? "Selected clip" : `${beat.candidate_assets?.length ?? 0} candidate${(beat.candidate_assets?.length ?? 0) === 1 ? "" : "s"} ready`}</div>
              </button>
            ))}
          </section>
          <section className="hs-imap-editor" aria-label="Canonical B-roll beat">
            {!selectedBeat ? <div className="hs-imap-empty">Select a canonical beat.</div> : <>
              <div className="hs-broll-active-heading">
                <div><span className="hs-imap-next-eyebrow">B-roll beat</span><h4>{selectedBeat.anchor_text}</h4></div>
                <span className={`hs-broll-status${selectedBeat.selected_asset_id ? " is-ready" : ""}`}>{selectedBeat.selected_asset_id ? "Ready" : `${beatCandidates.length} candidates`}</span>
              </div>
              <div className="hs-imap-next-card hs-broll-section">
                <div className="hs-imap-next-eyebrow">Script moment</div>
                <blockquote className="hs-broll-script-focus">{selectedBeat.anchor_text}</blockquote>
                {selectedBeat.description && selectedBeat.description !== selectedBeat.anchor_text ? <p className="hs-broll-context">{selectedBeat.description}</p> : null}
                <div className="hs-broll-facts"><span>{selectedBeat.placement_hint.replaceAll("_", " ")}</span><span>{formatDuration(selectedBeat.suggested_duration_ms ?? 4000)}</span></div>
                {props.workspaceId && props.workpieceId && props.canonicalPlanRevisionId && selectedBeat.canonical_revision_id ? <VisualOpportunityDispositionControl
                  workspaceId={props.workspaceId}
                  workpieceId={props.workpieceId}
                  kind="broll"
                  opportunityId={selectedBeat.id}
                  opportunityRevisionIdentity={selectedBeat.canonical_revision_id}
                  childPlanRevisionId={props.canonicalPlanRevisionId}
                  childPlanRevision={props.canonicalPlanRevision ?? 0}
                  current={currentDisposition}
                  onChanged={setDispositions}
                /> : null}
              </div>
              <section className="hs-imap-next-card hs-broll-section" aria-label="Canonical motion prompt" aria-busy={props.activeOperation === "motion_prompt"}>
                <div className="hs-broll-section-heading"><div><div className="hs-imap-next-eyebrow">Motion direction</div><h5>What should this clip show?</h5></div><span className="hs-broll-revision">{props.promptState?.revision ? `Revision ${props.promptState.revision}` : "Not created"}</span></div>
                {props.motionPromptError ? <div className="hs-error-text" role="alert">{creatorBrollError(props.motionPromptError)}</div> : null}
                {props.promptState?.mismatchReasons.length ? <div className="hs-error-text-small">{props.promptState.mismatchReasons.join(", ")}</div> : null}
                <div className="hs-imap-field">
                  <label htmlFor={`${formFieldIdPrefix}-creator-direction`}>Creator direction</label>
                  <textarea className="hs-broll-creator-direction" id={`${formFieldIdPrefix}-creator-direction`} value={creatorDirection} onChange={(event) => setCreatorDirection(event.target.value)} rows={4} disabled={props.disabled} placeholder="Describe what should happen, camera behavior, pacing, or details that matter." />
                  <small>Hearth populated this direction from the script moment. Edit it if you want to guide the motion differently.</small>
                </div>
                <button type="button" className="hs-broll-secondary-action" onClick={() => props.onGenerateMotionPrompt?.(creatorDirection)} disabled={props.disabled || !props.onGenerateMotionPrompt}>
                  {props.activeOperation === "motion_prompt" ? "Generating motion prompt…" : props.promptState?.revisionId ? "Regenerate motion prompt" : "Generate motion prompt"}
                </button>
                {props.activeOperation === "motion_prompt" ? <div className="hs-broll-operation-progress" role="status" aria-live="polite"><span aria-hidden="true" className="hs-broll-operation-spinner" /> <span><strong>Creating motion prompt</strong><small>Hearth is building the motion brief and canonical prompt. Keep this page open.</small></span></div> : null}
                {props.motionPromptQuote ? <section className="hs-broll-spending-card" aria-label="Motion prompt price confirmation" data-testid="motion-prompt-price-confirmation">
                  <div className="hs-broll-section-heading"><div><div className="hs-imap-next-eyebrow">Price confirmation</div><h5>{props.motionPromptQuote.credit_charge} {props.motionPromptQuote.credit_charge === 1 ? "Forge Credit" : "Forge Credits"}</h5></div><span className="hs-broll-revision">Expires {new Date(props.motionPromptQuote.expires_at).toLocaleTimeString()}</span></div>
                  <p><strong>Generate one canonical motion brief and prompt with {props.motionPromptQuote.model_display_name ?? "the selected OpenAI model"}.</strong></p>
                  {props.motionPromptQuote.model_tradeoff_summary ? <p>{props.motionPromptQuote.model_tradeoff_summary}</p> : null}
                  <dl className="hs-broll-spending-terms"><div><dt>Exact price</dt><dd>{props.motionPromptQuote.credit_charge} {props.motionPromptQuote.credit_charge === 1 ? "Forge Credit" : "Forge Credits"}</dd></div><div><dt>Funding</dt><dd>{props.motionPromptQuote.funding_label}</dd></div><div><dt>Failures</dt><dd>{props.motionPromptQuote.failure_terms}</dd></div></dl>
                  {!props.motionPromptQuote.funding_eligible ? <div className="hs-broll-spending-notice">No verified eligible Test funding is available for this one-credit request.</div> : null}
                  <p>OpenAI has not been called and no credits are reserved until you accept.</p>
                  <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions"><button type="button" className="hs-primary-btn" onClick={props.onAcceptMotionPromptQuote} disabled={props.disabled || !props.motionPromptQuote.funding_eligible}>Accept {props.motionPromptQuote.credit_charge} {props.motionPromptQuote.credit_charge === 1 ? "Forge Credit" : "Forge Credits"} and generate</button><button type="button" onClick={props.onDismissMotionPromptQuote} disabled={props.disabled}>Cancel</button></div>
                </section> : null}
                {props.promptState?.motionBrief ? <details className="hs-broll-advanced"><summary>View motion brief</summary><div className="hs-imap-field-grid" data-testid="broll-motion-brief">{Object.entries(props.promptState.motionBrief).map(([key, value]) => <div key={key}><strong>{key.replaceAll("_", " ")}</strong><p>{Array.isArray(value) ? value.join(", ") : String(value ?? "")}</p></div>)}</div></details> : <p>No canonical AI motion brief exists for this beat yet.</p>}
                <div className="hs-imap-field">
                  <label htmlFor={`${formFieldIdPrefix}-final-motion-prompt`}>Canonical final motion prompt</label>
                  <textarea className="hs-broll-final-prompt" id={`${formFieldIdPrefix}-final-motion-prompt`} value={finalPromptDraft} onChange={(event) => setFinalPromptDraft(event.target.value)} readOnly={!props.promptState?.revisionId} rows={8} placeholder="Generate a motion prompt to create the canonical creator-visible prompt." />
                </div>
                <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions hs-broll-prompt-actions">
                  <button type="button" onClick={async () => {
                    setRunwayProposalPending(true);
                    try {
                      const proposal = await props.onCreateRunwayReadyPrompt?.();
                      if (proposal) setFinalPromptDraft(proposal.finalPrompt);
                    } finally {
                      setRunwayProposalPending(false);
                    }
                  }} disabled={props.disabled || runwayProposalPending || !props.promptState?.revisionId || !props.promptState.motionBrief}>{runwayProposalPending ? "Creating Runway-ready prompt…" : "Create Runway-ready prompt"}</button>
                  <button type="button" onClick={() => props.onSaveMotionPrompt?.(finalPromptDraft)} disabled={props.disabled || !props.promptState?.revisionId || !finalPromptDraft.trim() || finalPromptDraft === props.promptState.finalPrompt}>Save prompt as new revision</button>
                  <button type="button" onClick={props.onCopyPrompt} disabled={!props.promptState?.finalPrompt}>{props.copyPromptAcknowledged ? "Copied canonical prompt" : "Copy canonical prompt"}</button>
                </div>
                {finalPromptDraft ? <div className={finalPromptDraft.length>1000?"hs-error-text-small":"hs-imap-next-copy"}>{finalPromptDraft.length} / 1000 UTF-16 code units{finalPromptDraft!==props.promptState?.finalPrompt?" · proposed or unsaved":" · canonical"}</div>:null}
              </section>
              <section className="hs-imap-next-card hs-broll-section" aria-label="Acquire verified B-roll" aria-busy={props.activeOperation === "video"}>
                <div className="hs-imap-next-eyebrow">Get the clip</div>
                <div className="hs-broll-acquisition-tabs" role="tablist" aria-label="B-roll acquisition method">
                  {([['generate','Generate video'],['upload','Upload video'],['external','External clip'],['stock','Stock']] as const).map(([mode,label])=><button key={mode} type="button" role="tab" aria-selected={acquisitionMode===mode} className={acquisitionMode===mode?"is-active":""} onClick={()=>setAcquisitionMode(mode)}>{label}</button>)}
                </div>
                <div className="hs-broll-acquisition-pane">
                  {acquisitionMode === "generate" ? <><p>Generate from the exact saved canonical prompt above. Add up to three ordered historical references to preserve the subject across stages.</p><div className="hs-imap-field"><label>Reference images (optional)</label><button type="button" onClick={() => referenceInputRef.current?.click()} disabled={props.disabled || generationReferences.length >= 3}>Add reference images</button><small>JPEG, PNG, or WebP; 5 MB each. Order them from the opening state to the concluding state.</small></div>{generationReferences.map((reference,index)=><div className="hs-imap-field" key={`${reference.file.name}-${reference.file.lastModified}-${index}`}><label htmlFor={`${formFieldIdPrefix}-reference-${index}`}>{index+1}. {reference.file.name}</label><input id={`${formFieldIdPrefix}-reference-${index}`} value={reference.stageLabel} onChange={(event)=>setGenerationReferences((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,stageLabel:event.target.value}:item))} placeholder={index===0?"e.g. derelict museum display":index===generationReferences.length-1?"e.g. restored and under steam":"e.g. transported to the repair shop"}/><button type="button" onClick={()=>setGenerationReferences((current)=>current.filter((_,itemIndex)=>itemIndex!==index))}>Remove</button></div>)}<input ref={referenceInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event)=>{const files=Array.from(event.currentTarget.files??[]).slice(0,3-generationReferences.length);setGenerationReferences((current)=>[...current,...files.map((file)=>({file,stageLabel:""}))]);event.currentTarget.value="";}}/><button type="button" className="hs-primary-btn" onClick={()=>props.onGenerateVideo?.(generationReferences)} disabled={props.disabled || !props.onGenerateVideo || !props.promptState?.revisionId || (props.promptState.status !== "current" && props.promptState.status !== "creator_edited")}>{props.activeOperation === "video" ? "Generating Runway video…" : generationReferences.length ? `Generate Video with ${generationReferences.length} Reference${generationReferences.length===1?"":"s"}` : "Generate Video"}</button>{props.activeOperation === "video" ? <div className="hs-broll-operation-progress" role="status" aria-live="polite"><span aria-hidden="true" className="hs-broll-operation-spinner" /><span><strong>{props.message?.includes("confirmation") ? "Waiting for confirmation" : "Runway generation in progress"}</strong><small>{props.message ?? "Keep this page open until the verified video and preview appear."}</small></span></div> : null}</> : null}
                  {acquisitionMode === "upload" ? <><p>Choose an MP4 or WebM file. Tongs will verify and preserve it.</p><button type="button" className="hs-primary-btn" onClick={() => uploadInputRef.current?.click()} disabled={props.disabled}>Choose video file</button></> : null}
                  {acquisitionMode === "external" ? <><div className="hs-imap-field"><label htmlFor={`${formFieldIdPrefix}-canonical-external-url`}>Video URL</label><input id={`${formFieldIdPrefix}-canonical-external-url`} value={props.draft.sourceUrl} onChange={(event) => props.onDraftChange("sourceUrl", event.target.value)} disabled={props.disabled} placeholder="https://…/clip.mp4" /></div><button type="button" className="hs-primary-btn" onClick={props.onAttachResultFromUrl} disabled={props.disabled || !props.draft.sourceUrl.trim()}>Fetch and verify external clip</button></> : null}
                  {acquisitionMode === "stock" ? <p>Licensed stock search will appear here when Forge has a configured provider.</p> : null}
                </div>
                {props.spendingQuote ? <section className="hs-broll-spending-card" aria-label="Runway price confirmation" data-testid="runway-price-confirmation">
                  <div className="hs-broll-section-heading"><div><div className="hs-imap-next-eyebrow">Price confirmation</div><h5>{formatCurrencyMicros(props.spendingQuote.normalMaximumChargeMicros, props.spendingQuote.currency)} maximum</h5></div><span className="hs-broll-revision">Expires {new Date(props.spendingQuote.expiresAt).toLocaleTimeString()}</span></div>
                  <dl className="hs-broll-spending-terms">
                    <div><dt>Normal maximum charge</dt><dd>{formatCurrencyMicros(props.spendingQuote.normalMaximumChargeMicros, props.spendingQuote.currency)}</dd></div>
                    <div><dt>Billable-failure maximum</dt><dd>{formatCurrencyMicros(props.spendingQuote.billableFailureMaximumChargeMicros, props.spendingQuote.currency)}</dd></div>
                    <div><dt>Funding source</dt><dd>{props.spendingQuote.fundingLabel}</dd></div>
                    <div><dt>Included</dt><dd>{String(props.spendingQuote.includedQuantity.duration_seconds ?? 5)} seconds · {String(props.spendingQuote.includedQuantity.ratio ?? "1280:720")}</dd></div>
                  </dl>
                  <p><strong>Billable failures:</strong> {props.spendingQuote.billableFailureClasses.length ? props.spendingQuote.billableFailureClasses.join(", ").replaceAll("_", " ") : "None"}.</p>
                  <p><strong>Free failures:</strong> {props.spendingQuote.freeFailureClasses.length ? props.spendingQuote.freeFailureClasses.join(", ").replaceAll("_", " ") : "None specified"}.</p>
                  {!props.spendingQuote.customerSpendingEnabled ? <div className="hs-broll-spending-notice">Customer spending is disabled. You can review this quote, but Forge will not reserve funds or call Runway.</div> : !props.spendingQuote.fundingEligible ? <div className="hs-broll-spending-notice">No verified eligible funding is available for this maximum charge. Only funding from the active financial environment can be used; legacy credits remain historical.</div> : null}
                  <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions"><button type="button" className="hs-primary-btn" onClick={props.onAcceptSpendingQuote} disabled={props.disabled || !props.spendingQuote.customerSpendingEnabled || !props.spendingQuote.fundingEligible}>Accept price and generate</button><button type="button" onClick={props.onDismissSpendingQuote} disabled={props.disabled}>Cancel</button></div>
                </section> : null}
                {props.spendingReceipt ? <section className="hs-broll-spending-card" aria-label="Runway billing receipt" data-testid="runway-billing-receipt">
                  <div className="hs-imap-next-eyebrow">Billing receipt</div>
                  <h5>{props.spendingReceipt.customerChargeMicros == null ? "Settlement pending" : `${formatCurrencyMicros(props.spendingReceipt.customerChargeMicros, props.spendingReceipt.currency)} charged`}</h5>
                  <p>{props.spendingReceipt.fundingLabel ?? "Funding source pending"} · {props.spendingReceipt.receiptStatus.replaceAll("_", " ")}</p>
                  <small>Accepted ceiling: {formatCurrencyMicros(props.spendingReceipt.maximumChargeMicros, props.spendingReceipt.currency)}. A pending receipt is not a confirmed charge.</small>
                </section> : null}
                <input ref={uploadInputRef} type="file" accept="video/mp4,video/webm" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) props.onUploadAsset(file); event.currentTarget.value = ""; }} />
              </section>
              <div className="hs-broll-section-heading"><div><div className="hs-imap-next-eyebrow">Choose a clip</div><h5>{beatCandidates.length} candidate{beatCandidates.length === 1 ? "" : "s"}</h5></div></div>
              <CandidateList workpieceId={props.workpieceId} candidates={beatCandidates} selectedCandidateId={props.selectedCandidateId} disabled={Boolean(props.disabled)} previewStateById={previewStateById} previewUrlById={previewUrlById} previewErrorById={previewErrorById} onSelectCandidate={props.onSelectCandidate} onRetryCandidateIngestion={props.onRetryCandidateIngestion} />
              {selectedBeat.selected_asset_id ? <div className="hs-success-text">Selected clip saved. It will be included in the episode edit.</div> : null}
              <details className="hs-broll-advanced"><summary>Advanced details</summary><dl><div><dt>Authority status</dt><dd>{props.promptState?.status ?? "missing"}</dd></div><div><dt>Beat state</dt><dd>{resolveBeatState(selectedBeat)}</dd></div><div><dt>Shot type</dt><dd>{selectedBeat.shot_type ?? "mixed"}</dd></div><div><dt>Mood</dt><dd>{selectedBeat.mood ?? "neutral"}</dd></div></dl><p><strong>Legacy B-roll compatibility:</strong> older episode data remains read-only and cannot override this canonical workflow.</p></details>
            </>}
          </section>
        </div>
      </div>
    );
  }

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
                workpieceId={props.workpieceId}
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
