import type { ReactNode, RefObject } from "react";
import CollapsibleFocusPanel from "../../components/focus/CollapsibleFocusPanel";
import type { HearthWritingFormat } from "../../lib/hearth-writing-format";

export type ChatSurfaceProps = {
  visible: boolean;
  chatPanelMeta: string;
  chatMessages: Array<{ role: string; content: string }>;
  chatDraft: string;
  chatError: string | null;
  aiRuntimeWarning: string | null;
  aiCreditsDepleted: boolean;
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  approvedAtText: string;
  approvalPersistenceStatus: {
    cloud: "ok";
    local: "ok" | "failed";
    localPath?: string;
    localMessage?: string;
  } | null;
  pendingAiProposal: any;
  dirtyProposalBodyCount: number;
  isApplyingAiOps: boolean;
  isAiProcessing: boolean;
  aiEpisodeReady: boolean;
  sttLane: "browser" | "ai";
  sttState: "idle" | "listening" | "transcribing";
  hasBrowserSpeech: boolean;
  sttPreview: string | null;
  sttNotice: string | null;
  sttError: string | null;
  devMode: boolean;
  chatInputRef: RefObject<HTMLTextAreaElement | null>;
  listeningIndicator: ReactNode;
  onClearChat: () => void;
  onToggleAiProposalOp: (index: number) => void;
  onEditAiProposalBody: (index: number, value: string) => void;
  onResetAiProposalBody: (index: number) => void;
  onApplyAiProposalAll: () => void;
  onApplyAiProposalSelected: () => void;
  onDiscardAiProposal: () => void;
  writingFormat: HearthWritingFormat;
  writingFormatOptions: Array<{
    id: HearthWritingFormat;
    label: string;
    helperText: string;
  }>;
  onSelectWritingFormat: (format: HearthWritingFormat) => void;
  onUseChatShortcutDraft: () => void;
  draftShortcutLabel: string;
  onUseChatShortcutSources: () => void;
  onOpenComposeScript: () => void;
  onSetSttLane: (lane: "browser" | "ai") => void;
  onToggleMic: () => void;
  onChatDraftChange: (value: string) => void;
  onSendChat: () => void;
  onCancelAiRequest: () => void;
  describeProposalOp: (op: any) => string;
  getProposalDiff: (op: any) => { before: string; after: string } | null;
  validateProposalBody: (value: string) => any;
  isProposalBodyDirty: (index: number) => boolean;
  buildValidationReport: (validation: any) => string;
};

export default function ChatSurface(props: ChatSurfaceProps) {
  if (!props.visible) return null;

  return (
    <CollapsibleFocusPanel
      panelId="hearth-chat-panel"
      title="Chat"
      meta={props.chatPanelMeta}
      collapsed={false}
      onToggle={() => {}}
      collapsible={false}
    >
      <section className="hs-ai-chat" aria-label="Hearth AI chat">
        <div className="hs-ai-chat-header">
          <div className="hs-ai-chat-title">Talk it through</div>
          <button
            type="button"
            onClick={props.onClearChat}
            disabled={props.isAiProcessing || props.chatMessages.length === 0}
          >
            Clear chat
          </button>
        </div>

        <div className="hs-ai-chat-log" role="log" aria-live="polite">
          {props.chatMessages.length === 0 ? (
            <div className="hs-ai-chat-empty">
              Tell Hearth what you want to shape. It already has the episode context with it.
            </div>
          ) : (
            props.chatMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`hs-ai-chat-msg is-${message.role}`}>
                <span className="hs-ai-chat-role">{message.role === "assistant" ? "Hearth" : "You"}</span>
                <span className="hs-ai-chat-content">{message.content}</span>
              </div>
            ))
          )}
        </div>

        {props.pendingAiProposal && props.pendingAiProposal.ops.length > 0 ? (
          <div className="hs-ai-proposal" aria-label="Proposed AI changes">
            <div className="hs-ai-proposal-header">
              <div className="hs-ai-proposal-title">First pass to review</div>
              <div className="hs-ai-proposal-meta">
                {props.pendingAiProposal.selected.filter(Boolean).length} selected · {props.pendingAiProposal.ops.length} total
                {props.dirtyProposalBodyCount > 0 ? ` · ${props.dirtyProposalBodyCount} edited from AI` : ""}
              </div>
            </div>

            <div className="hs-ai-proposal-list">
              {props.pendingAiProposal.ops.map((op: any, index: number) => {
                const diff = props.getProposalDiff(op);
                const proposalBodyValidation = op.op === "set_body"
                  ? props.validateProposalBody(op.value)
                  : null;
                const proposalBodyDirty = op.op === "set_body"
                  ? props.isProposalBodyDirty(index)
                  : false;
                const inputId = `ai-op-${index}`;
                return (
                  <div key={inputId} className="hs-ai-op-row">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={Boolean(props.pendingAiProposal.selected[index])}
                      onChange={() => props.onToggleAiProposalOp(index)}
                      disabled={props.isApplyingAiOps}
                    />
                    <div className="hs-ai-op-body">
                      <label htmlFor={inputId} className="hs-ai-op-title">
                        {props.describeProposalOp(op)}
                      </label>
                      {op.op === "set_body" ? (
                        <div className="hs-ai-op-editor">
                          {diff ? (
                            <div className="hs-ai-op-diff">
                              <pre>{`- ${diff.before || "(empty)"}`}</pre>
                            </div>
                          ) : null}
                          <label className="hs-field">
                            <span className="hs-field-label">
                              Editable proposed draft
                              {proposalBodyDirty ? (
                                <span className="hs-ai-op-dirty-badge">Edited from AI</span>
                              ) : null}
                            </span>
                            <textarea
                              value={op.value}
                              onChange={(event) => props.onEditAiProposalBody(index, event.target.value)}
                              className="hs-ai-op-textarea"
                              rows={12}
                              disabled={props.isApplyingAiOps}
                            />
                          </label>
                          {proposalBodyDirty ? (
                            <div className="hs-ai-op-dirty-actions">
                              <div className="hs-field-label-muted">
                                This proposal now differs from the original AI suggestion.
                              </div>
                              <button
                                type="button"
                                onClick={() => props.onResetAiProposalBody(index)}
                                disabled={props.isApplyingAiOps}
                              >
                                Reset to AI version
                              </button>
                            </div>
                          ) : null}
                          <div className={`hs-ai-op-validation${proposalBodyValidation?.ok ? " is-valid" : " is-invalid"}`}>
                            {proposalBodyValidation?.ok
                              ? "Tag contract looks good."
                              : proposalBodyValidation ? props.buildValidationReport(proposalBodyValidation) : "Tag contract check unavailable."}
                          </div>
                        </div>
                      ) : diff ? (
                        <div className="hs-ai-op-diff">
                          <pre>{`- ${diff.before || "(empty)"}`}</pre>
                          <pre>{`+ ${diff.after || "(empty)"}`}</pre>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hs-ai-proposal-actions">
              <button
                type="button"
                onClick={props.onApplyAiProposalAll}
                disabled={props.isApplyingAiOps}
              >
                {props.isApplyingAiOps ? "Applying..." : "Apply"}
              </button>
              <button
                type="button"
                onClick={props.onApplyAiProposalSelected}
                disabled={props.isApplyingAiOps || props.pendingAiProposal.selected.every((value: boolean) => !value)}
              >
                Apply selected
              </button>
              <button
                type="button"
                onClick={props.onDiscardAiProposal}
                disabled={props.isApplyingAiOps}
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}

        {props.chatError ? (
          <div className="hs-error-text-small">{props.chatError}</div>
        ) : null}

        {props.aiRuntimeWarning ? (
          <div className="hs-error-text-small">{props.aiRuntimeWarning}</div>
        ) : null}

        {props.aiCreditsDepleted ? (
          <div className="hs-error-text-small">You are out of AI credits for now.</div>
        ) : null}

        {props.hasApprovedScript && props.approvedScriptVersion ? (
          <div className="hs-production-mode-status">
            Script v{props.approvedScriptVersion} approved · {props.approvedAtText}
          </div>
        ) : null}

        {props.approvalPersistenceStatus ? (
          <div className="hs-field-label-muted">
            Saved to: Cloud [OK] · Local{" "}
            {props.approvalPersistenceStatus.local === "ok"
              ? `[OK] ${props.approvalPersistenceStatus.localPath ?? ""}`.trim()
              : `[WARN] ${props.approvalPersistenceStatus.localMessage ?? "mirror failed"}`}
          </div>
        ) : null}

        <div className="hs-ai-format-row" role="group" aria-label="Chat mode">
          <div className="hs-ai-format-copy">
            <strong>Start by exploring and expanding the content, or jump straight to a draft.</strong>
            <span>Hearth starts in exploration mode and waits to write until you ask.</span>
          </div>
          <div className="hs-ai-format-buttons">
            {props.writingFormatOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => props.onSelectWritingFormat(option.id)}
                className={option.id === props.writingFormat ? "is-active" : undefined}
                title={option.helperText}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hs-ai-shortcut-row" role="group" aria-label="Chat shortcuts">
          <button type="button" onClick={props.onUseChatShortcutDraft}>
            {props.draftShortcutLabel}
          </button>
          <button type="button" onClick={props.onUseChatShortcutSources}>
            Find sources
          </button>
          <button type="button" onClick={props.onOpenComposeScript}>
            Compose
          </button>
        </div>

        <div className="hs-ai-chat-compose">
          <select
            aria-label="Voice lane"
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
            onClick={props.onToggleMic}
            className={`mic-button ${props.sttState}`}
            title={
              props.sttState === "idle"
                ? props.sttLane === "browser"
                  ? "Voice (Free)"
                  : "Voice (AI)"
                : props.sttState === "listening"
                  ? "Listening... tap to stop"
                  : "Transcribing..."
            }
          >
            {props.sttState === "idle" ? "🎙️" : null}
            {props.sttState === "listening" ? "🔴🎙️" : null}
            {props.sttState === "transcribing" ? "⏳🎙️" : null}
          </button>
          <div className="hs-ai-chat-inputWrap">
            {props.sttState === "listening" ? (
              <div className="hs-stt-inputPanel" role="status" aria-live="polite">
                {props.listeningIndicator}
                <div className="hs-stt-hint">Listening... tap 🎙️ to stop</div>
              </div>
            ) : (
              <textarea
                ref={props.chatInputRef}
                value={props.chatDraft}
                onChange={(event) => props.onChatDraftChange(event.target.value)}
                placeholder={props.aiEpisodeReady
                  ? props.writingFormat === "explore_expand"
                    ? "Talk it through... paste links... explore and expand the content..."
                    : props.writingFormat === "full_script"
                      ? "Talk it through... paste links... ask for a full script..."
                      : "Talk it through... paste links... keep it to bullet points..."
                  : "Select an Episode or Spark to start."}
                className="hs-ai-chat-input"
                rows={2}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  props.onSendChat();
                }}
                disabled={props.isAiProcessing || props.aiCreditsDepleted || !props.aiEpisodeReady}
              />
            )}
          </div>
          {props.isAiProcessing ? (
            <button type="button" onClick={props.onCancelAiRequest}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={props.onSendChat}
            disabled={props.isAiProcessing || props.aiCreditsDepleted || !props.aiEpisodeReady || !props.chatDraft.trim()}
          >
            {props.isAiProcessing ? "Sending..." : "Send"}
          </button>
        </div>
        {props.devMode && props.sttPreview ? (
          <div className="hs-field-label-muted">{props.sttPreview}</div>
        ) : null}
        {props.sttNotice ? (
          <div className="hs-field-label-muted">{props.sttNotice}</div>
        ) : null}
        {props.sttError ? (
          <div className="hs-error-text-small">{props.sttError}</div>
        ) : null}
      </section>
    </CollapsibleFocusPanel>
  );
}
