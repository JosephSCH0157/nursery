import type { ReactNode } from "react";
import {
  clearHammerTranscriptPrepNonAiMissingBehavior,
  readHammerTranscriptPrepNonAiMissingBehavior,
  type HammerTranscriptPrepNonAiMissingBehavior,
} from "../prep/hammerTranscriptPrepPromptPreference";
import type { HammerPrepFailureKind } from "./hammerSessionStabilization";

export function HammerPrepFailurePanel(props: {
  failureKind: HammerPrepFailureKind;
  failureCode: string | null;
  error: string | null;
  dontAskAgain: boolean;
  aiNoticeModal: ReactNode;
  canShowAiSettings: boolean;
  onRetrySession: () => void;
  onRestartTranscript: (behavior: HammerTranscriptPrepNonAiMissingBehavior, options?: { remember?: boolean; announce?: boolean }) => void;
  onDontAskAgainChange: (checked: boolean) => void;
  onAskEveryTime: () => void;
  onCancel: () => void;
  onRequestAiSettings?: () => void;
}) {
  if (props.failureKind === "session_open_failed") return (
    <section className="hammer-prep-shell__failure"><div className="hammer-prep-shell__failure-card">
      <h2>Hammer session open stopped.</h2>
      <p>{props.error ?? "Hammer could not open the canonical editing session."}</p>
      {props.failureCode ? <p>Code: <code>{props.failureCode}</code></p> : null}
      <div className="hammer-prep-shell__handoff-actions"><button type="button" className="hammer-prep-shell__button" onClick={props.onRetrySession}>Retry session open</button></div>
    </div></section>
  );
  const canOfferAiFallback = props.failureKind === "non_ai_missing";
  const savedPreference = canOfferAiFallback ? readHammerTranscriptPrepNonAiMissingBehavior() : null;
  if (savedPreference) return (
    <section className="hammer-prep-shell__failure"><div className="hammer-prep-shell__failure-card">
      <h2>Hammer transcript prep stopped.</h2><p>{props.error ?? "Hammer could not prepare this episode transcript."}</p>
      <p>Using saved preference: {savedPreference === "retry-non-ai" ? "Retry non-AI" : "Use AI fallback"}.</p>
      <div className="hammer-prep-shell__handoff-actions">
        <button type="button" className="hammer-prep-shell__action-button" onClick={() => props.onRestartTranscript(savedPreference, { announce: true })}>{savedPreference === "retry-non-ai" ? "Retry non-AI" : "Use AI fallback"}</button>
        {props.canShowAiSettings ? <button type="button" className="hammer-prep-shell__action-button hammer-prep-shell__action-button--placeholder" onClick={props.onRequestAiSettings}>Change</button> : null}
        <button type="button" className="hammer-prep-shell__action-button hammer-prep-shell__action-button--dismiss" onClick={() => { clearHammerTranscriptPrepNonAiMissingBehavior(); props.onAskEveryTime(); }}>Ask every time</button>
      </div>
    </div>{props.aiNoticeModal}</section>
  );
  return (
    <section className="hammer-prep-shell__failure"><div className="hammer-prep-shell__failure-card">
      <h2>Hammer transcript prep stopped.</h2><p>{props.error ?? "Hammer could not prepare this episode transcript."}</p>
      <p>Hammer will always try to reuse an existing transcript first. AI transcription only runs if you explicitly choose the AI fallback.</p>
      {canOfferAiFallback ? <label><input type="checkbox" checked={props.dontAskAgain} onChange={(event) => props.onDontAskAgainChange(event.target.checked)} />Don&apos;t ask again</label> : null}
      <div className="hammer-prep-shell__handoff-actions">
        {canOfferAiFallback ? <button type="button" className="hammer-prep-shell__button" onClick={() => props.onRestartTranscript("retry-non-ai", { remember: props.dontAskAgain })}>Retry non-AI</button> : null}
        {canOfferAiFallback ? <button type="button" className="hammer-prep-shell__button" onClick={() => props.onRestartTranscript("use-ai-fallback", { remember: props.dontAskAgain })}>Use AI fallback</button> : null}
        {canOfferAiFallback ? <button type="button" className="hammer-prep-shell__action-button hammer-prep-shell__action-button--dismiss" onClick={props.onCancel}>Cancel</button> : null}
      </div>
    </div>{props.aiNoticeModal}</section>
  );
}
