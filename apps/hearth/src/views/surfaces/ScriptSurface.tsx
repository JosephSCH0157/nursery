import type { ReactNode, RefObject } from "react";

type VisualParagraphRail = {
  beatCount: number;
  globalCount: number;
  orphanedCount: number;
  paragraphs: Array<{
    paragraphId: string;
    density: string;
    label: string;
    count: number;
  }>;
};

type ScriptSurfaceProps = {
  visible: boolean;
  showScriptEditor: boolean;
  scriptPanelTitle: string;
  scriptPanelCopyMessage: string | null;
  scriptPanelCopyAcknowledged: boolean;
  scriptPanelHint: string | null;
  scriptPanelMetaText: string;
  scriptPanelBodyText: string;
  scriptPanelPlaceholder: string;
  isVisualScriptMode: boolean;
  visualScriptParagraphRail: VisualParagraphRail;
  isCanonicalImageMapScriptPanel: boolean;
  activeDraftExists: boolean;
  sourcesSummary: string;
  unusedSummary: string;
  canReviewSources: boolean;
  sttLane: "browser" | "ai";
  sttTarget: "chat" | "script";
  sttState: "idle" | "listening" | "transcribing";
  hasBrowserSpeech: boolean;
  sttNotice: string | null;
  sttError: string | null;
  bodyRef: RefObject<HTMLTextAreaElement | null>;
  copyIcon: ReactNode;
  listeningIndicator: ReactNode;
  onSetSttLane: (lane: "browser" | "ai") => void;
  onToggleScriptMic: () => void;
  onCopyScriptPanelText: () => void;
  onBodyChange: (value: string) => void;
  onBodyCompositionStart: () => void;
  onBodyCompositionEnd: () => void;
  onBodyCursorChange: (cursorPosition: number) => void;
  onBodyScrollChange: (scrollTop: number) => void;
  onReviewSources: () => void;
};

export default function ScriptSurface(props: ScriptSurfaceProps) {
  if (!props.visible || !props.showScriptEditor) return null;
  const showScriptVoiceFeedback = props.sttTarget === "script";
  const scriptVoiceDisabled = !props.activeDraftExists || props.isCanonicalImageMapScriptPanel || props.sttState === "transcribing";

  return (
    <section className="hs-script-panel" aria-label="Manual draft editor">
      <header className="hs-script-panel-header">
        <div className="hs-script-panel-title">
          {props.scriptPanelTitle}
        </div>
        <div className="hs-script-panel-header-actions">
          {props.scriptPanelCopyMessage ? (
            <div className="hs-field-label-muted">{props.scriptPanelCopyMessage}</div>
          ) : null}
          {props.scriptPanelHint ? (
            <div className="hs-field-label-muted">{props.scriptPanelHint}</div>
          ) : null}
          <div className="hs-script-panel-meta">{props.scriptPanelMetaText}</div>
          {!props.isCanonicalImageMapScriptPanel ? (
            <div className="hs-script-panel-voice">
              <select
                aria-label="Script dictation voice lane"
                value={props.sttLane}
                onChange={(event) => props.onSetSttLane(event.target.value as "browser" | "ai")}
                className="stt-lane-select"
                disabled={props.sttState !== "idle"}
                title={
                  props.sttState !== "idle"
                    ? "Voice lane is locked while listening/transcribing."
                    : !props.hasBrowserSpeech
                      ? "Browser speech not supported"
                      : undefined
                }
              >
                <option value="browser" disabled={!props.hasBrowserSpeech}>
                  Browser (Free)
                </option>
                <option value="ai">AI</option>
              </select>
              <button
                type="button"
                onClick={props.onToggleScriptMic}
                className={`mic-button ${showScriptVoiceFeedback ? props.sttState : "idle"}`}
                disabled={scriptVoiceDisabled}
                title={
                  props.sttState === "idle"
                    ? props.sttLane === "browser"
                      ? "Dictate into script (Free)"
                      : "Dictate into script (AI)"
                    : showScriptVoiceFeedback && props.sttState === "listening"
                      ? "Listening... tap to stop"
                      : showScriptVoiceFeedback && props.sttState === "transcribing"
                        ? "Transcribing..."
                        : "Dictate into script"
                }
                aria-label="Dictate into script"
              >
                {showScriptVoiceFeedback && props.sttState === "listening" ? "🔴🎙️" : null}
                {showScriptVoiceFeedback && props.sttState === "transcribing" ? "⏳🎙️" : null}
                {(!showScriptVoiceFeedback || props.sttState === "idle") ? "🎙️" : null}
              </button>
              <div className="hs-script-panel-voice-copy">
                {showScriptVoiceFeedback && props.sttState === "listening" ? (
                  <>
                    {props.listeningIndicator}
                    <span>Listening for script dictation...</span>
                  </>
                ) : showScriptVoiceFeedback && props.sttState === "transcribing" ? (
                  <span>Transcribing into the script...</span>
                ) : (
                  <span>Dictate directly into the script.</span>
                )}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className={`hs-script-panel-copy${props.scriptPanelCopyAcknowledged ? " hs-copy-ack" : ""}`}
            onClick={props.onCopyScriptPanelText}
            disabled={!props.scriptPanelBodyText.trim()}
            title="Copy panel text to clipboard"
            aria-label="Copy panel text to clipboard"
          >
            {props.copyIcon}
            <span>Copy</span>
          </button>
        </div>
      </header>

      {props.isVisualScriptMode ? (
        <section className="hs-vsm-rail" aria-label="Visual anchor rail">
          <div className="hs-vsm-rail-head">
            <span>Paragraph anchors</span>
            <span>
              beat {props.visualScriptParagraphRail.beatCount} · global {props.visualScriptParagraphRail.globalCount} · orphaned {props.visualScriptParagraphRail.orphanedCount}
            </span>
          </div>
          <div className="hs-vsm-chip-grid">
            {props.visualScriptParagraphRail.paragraphs.map((paragraph) => (
              <div
                key={paragraph.paragraphId}
                className={`hs-vsm-chip is-${paragraph.density}`}
                title={`${paragraph.label}: ${paragraph.count} visual${paragraph.count === 1 ? "" : "s"}`}
              >
                <span>{paragraph.label}</span>
                <strong>{paragraph.count}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <label className="hs-field">
        <span className="hs-field-label">Body</span>
        <textarea
          ref={props.bodyRef}
          value={props.scriptPanelBodyText}
          placeholder={props.scriptPanelPlaceholder}
          onChange={(event) => {
            if (props.isCanonicalImageMapScriptPanel) return;
            props.onBodyChange(event.target.value);
          }}
          onCompositionStart={() => {
            if (props.isCanonicalImageMapScriptPanel) return;
            props.onBodyCompositionStart();
          }}
          onCompositionEnd={() => {
            if (props.isCanonicalImageMapScriptPanel) return;
            props.onBodyCompositionEnd();
          }}
          onSelect={(event) => {
            if (props.isCanonicalImageMapScriptPanel) return;
            const target = event.target as HTMLTextAreaElement;
            props.onBodyCursorChange(target.selectionStart);
          }}
          onKeyUp={(event) => {
            if (props.isCanonicalImageMapScriptPanel) return;
            const target = event.target as HTMLTextAreaElement;
            props.onBodyCursorChange(target.selectionStart);
          }}
          onScroll={(event) => {
            if (props.isCanonicalImageMapScriptPanel) return;
            const target = event.target as HTMLTextAreaElement;
            props.onBodyScrollChange(target.scrollTop);
          }}
          readOnly={props.isCanonicalImageMapScriptPanel}
          disabled={!props.isCanonicalImageMapScriptPanel && !props.activeDraftExists}
          className="hs-textarea-body hs-textarea-script-panel"
        />
      </label>

      <div className="hs-sources-row">
        <span className="hs-sources-summary">Sources: {props.sourcesSummary}{props.unusedSummary}</span>
        <button
          type="button"
          onClick={props.onReviewSources}
          disabled={!props.canReviewSources}
        >
          Review sources
        </button>
      </div>

      {showScriptVoiceFeedback && props.sttNotice ? (
        <div className="hs-field-label-muted">{props.sttNotice}</div>
      ) : null}
      {showScriptVoiceFeedback && props.sttError ? (
        <div className="hs-error-text-small">{props.sttError}</div>
      ) : null}
    </section>
  );
}
