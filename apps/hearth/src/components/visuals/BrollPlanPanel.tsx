import { useMemo, useRef } from "react";
import type { EpisodeBrollAssetCandidate, EpisodeBrollPlanBeat } from "../../lib/episode-package-v2";

type BrollPlanPanelProps = {
  beats: EpisodeBrollPlanBeat[];
  selectedBeatId: string | null;
  coverageStrength: string | null;
  saveState: "saved" | "editing" | "saving" | "error" | "offline";
  saveError: string | null;
  message: string | null;
  disabled?: boolean;
  draft: {
    anchorText: string;
    description: string;
    motionIntent: string;
    priority: string;
    keywords: string;
    mood: string;
    shotType: string;
    motionSuggestion: string;
    suggestedDurationMs: string;
    placementHint: string;
  };
  selectedCandidateId: string | null;
  onSelectBeat: (beatId: string) => void;
  onDraftChange: (field: string, value: string) => void;
  onSaveBeat: () => void;
  onDeleteBeat: () => void;
  onRegenerateBeat: () => void;
  onGeneratePlan: () => void;
  onFindStock: () => void;
  onUploadAsset: (file: File) => void;
  onSelectCandidate: (candidateId: string) => void;
};

const MOTION_INTENTS = ["broll", "establishing", "cutaway", "reaction", "ambient", "explanatory", "graphic", "transition"];
const PRIORITIES = ["primary", "supporting", "background"];
const SHOT_TYPES = ["mixed", "wide", "medium", "close", "macro", "aerial"];
const PLACEMENT_HINTS = ["first_occurrence", "exact_timestamp", "manual"];

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
              {candidate.asset_id === args.selectedCandidateId ? "Selected for Beat" : "Use Selected Asset"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function BrollPlanPanel(props: BrollPlanPanelProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const selectedBeat = useMemo(
    () => props.beats.find((beat) => beat.id === props.selectedBeatId) ?? null,
    [props.beats, props.selectedBeatId],
  );
  const beatCandidates = selectedBeat?.candidate_assets ?? [];
  return (
    <div className="hs-imap-panel">
      <div className="hs-imap-header">
        <div>
          <h4 className="hs-imap-title">B-roll Plan</h4>
          <p className="hs-imap-subtitle">Generate motion coverage beats for the episode, then resolve each beat with stock or uploaded assets.</p>
        </div>
        <div className="hs-imap-candidate-action-group">
          <button type="button" className="hs-secondary-btn" onClick={props.onGeneratePlan} disabled={props.disabled || props.saveState === "saving"}>
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
              <div className="hs-imap-field">
                <label>Anchor</label>
                <input value={props.draft.anchorText} onChange={(event) => props.onDraftChange("anchorText", event.target.value)} disabled={props.disabled} />
              </div>
              <div className="hs-imap-field">
                <label>Description</label>
                <textarea value={props.draft.description} onChange={(event) => props.onDraftChange("description", event.target.value)} disabled={props.disabled} rows={3} />
              </div>
              <div className="hs-imap-field-grid">
                <label>
                  Motion Intent
                  <select value={props.draft.motionIntent} onChange={(event) => props.onDraftChange("motionIntent", event.target.value)} disabled={props.disabled}>
                    {MOTION_INTENTS.map((intent) => <option key={intent} value={intent}>{intent}</option>)}
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
                <label>Motion Suggestion</label>
                <textarea value={props.draft.motionSuggestion} onChange={(event) => props.onDraftChange("motionSuggestion", event.target.value)} disabled={props.disabled} rows={2} />
              </div>

              <div className="hs-imap-candidate-toolbar hs-imap-candidate-toolbar-actions">
                <div className="hs-imap-candidate-action-group">
                  <button type="button" onClick={props.onFindStock} disabled={props.disabled}>Find Stock</button>
                  <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={props.disabled}>Upload Asset</button>
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
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) props.onUploadAsset(file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>

              <CandidateList
                candidates={beatCandidates}
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
