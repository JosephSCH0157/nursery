import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode, type RefObject } from "react";
import CollapsibleFocusPanel from "../../components/focus/CollapsibleFocusPanel";
import { resolveHearthChatScrollAffordance } from "../../lib/hearth-chat-scroll-affordance";
import type { HearthWritingFormat } from "../../lib/hearth-writing-format";
import { linkifyHearthText } from "../../lib/hearth-conversation-export";
import {
  resolveHearthChatComposerPlaceholder,
  type HearthChatHydrationStatus,
} from "../../lib/hearth-chat-readiness";
import type { HearthOwnerChatCapability } from "../../lib/hearth-chat-api";

type ChatAttachmentView = {
  id: string;
  filename: string;
  mimeType: string;
  status: "uploading" | "reading" | "attached" | "failed" | "needs_text_extraction";
  error?: string | null;
};

export function resolveHearthAttachmentStatusLabel(status: ChatAttachmentView["status"]): string {
  switch (status) {
    case "uploading":
      return "Uploading...";
    case "reading":
      return "Reading file...";
    case "failed":
      return "Failed";
    case "needs_text_extraction":
      return "Needs text";
    case "attached":
    default:
      return "Attached";
  }
}

export function isOwnerChatCapabilityBlocked(capability: HearthOwnerChatCapability): boolean {
  return capability.status === "checking"
    || capability.status === "unavailable"
    || capability.status === "unknown";
}

export type ChatSurfaceProps = {
  visible: boolean;
  chatPanelMeta: string;
  chatMessages: Array<{ role: string; content: string }>;
  chatDraft: string;
  chatError: string | null;
  aiRuntimeWarning: string | null;
  aiCreditsDepleted: boolean;
  aiAdmissionBlocked: boolean;
  ownerChatCapability: HearthOwnerChatCapability;
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
  chatHydrationStatus: HearthChatHydrationStatus;
  sttLane: "browser" | "ai";
  sttTarget: "chat" | "script";
  sttState: "idle" | "listening" | "transcribing";
  hasBrowserSpeech: boolean;
  sttPreview: string | null;
  sttNotice: string | null;
  sttError: string | null;
  devMode: boolean;
  chatInputRef: RefObject<HTMLTextAreaElement | null>;
  listeningIndicator: ReactNode;
  onClearChat: () => void;
  onRetryChatHydration: () => void;
  onRetryOwnerChatCapability: () => void;
  onCopyChat: () => void;
  onExportChatPdf: () => void;
  onToggleAiProposalOp: (index: number) => void;
  onEditAiProposalBody: (index: number, value: string) => void;
  onResetAiProposalBody: (index: number) => void;
  onApplyAiProposalAll: () => void;
  onApplyAiProposalSelected: () => void;
  onApproveAiProposalAsScript: () => void;
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
  chatAttachments: ChatAttachmentView[];
  isAttachmentsLoading: boolean;
  onPickAttachments: (files: FileList | null) => void;
  onDropAttachments: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onPasteAttachmentText: (attachmentId: string, text: string) => void;
  describeProposalOp: (op: any) => string;
  getProposalDiff: (op: any) => { before: string; after: string } | null;
  validateProposalBody: (value: string) => any;
  isProposalBodyDirty: (index: number) => boolean;
  buildValidationReport: (validation: any) => string;
};

export default function ChatSurface(props: ChatSurfaceProps) {
  const ownerChatBlocked = isOwnerChatCapabilityBlocked(props.ownerChatCapability);
  const chatSurfaceRef = useRef<HTMLElement | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const chatTopRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const [scrollAffordance, setScrollAffordance] = useState({
    canScrollTop: false,
    canScrollBottom: false,
  });
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [pasteTextMap, setPasteTextMap] = useState<Record<string, string>>({});

  const refreshScrollTargets = useCallback(() => {
    if (typeof window === "undefined") return;
    const surface = chatSurfaceRef.current;
    const scrollParent = surface ? findScrollParent(surface) : null;
    const viewportRect = scrollParent
      ? scrollParent.getBoundingClientRect()
      : {
          top: 0,
          bottom: window.innerHeight || document.documentElement.clientHeight || 0,
        };
    const topRect = chatTopRef.current?.getBoundingClientRect();
    const bottomRect = chatBottomRef.current?.getBoundingClientRect();
    const chatLog = chatLogRef.current;
    const next = resolveHearthChatScrollAffordance({
      topSentinelTop: topRect?.top ?? null,
      bottomSentinelBottom: bottomRect?.bottom ?? null,
      viewportTop: viewportRect.top,
      viewportBottom: viewportRect.bottom,
      logScrollTop: chatLog?.scrollTop ?? 0,
      logScrollHeight: chatLog?.scrollHeight ?? 0,
      logClientHeight: chatLog?.clientHeight ?? 0,
    });
    setScrollAffordance((prev) => (
      prev.canScrollTop === next.canScrollTop && prev.canScrollBottom === next.canScrollBottom
        ? prev
        : next
    ));
  }, []);

  useEffect(() => {
    if (!props.visible || typeof window === "undefined") return undefined;
    const surface = chatSurfaceRef.current;
    const scrollParent = surface ? findScrollParent(surface) : null;
    const chatLog = chatLogRef.current;
    const scrollTarget: HTMLElement | Window = scrollParent ?? window;
    const onScroll = () => refreshScrollTargets();
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    chatLog?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    refreshScrollTargets();
    const refreshTimer = window.setTimeout(refreshScrollTargets, 80);
    const resizeObserver = typeof ResizeObserver !== "undefined" && surface
      ? new ResizeObserver(refreshScrollTargets)
      : null;
    if (resizeObserver && surface) {
      resizeObserver.observe(surface);
      if (chatLog) resizeObserver.observe(chatLog);
    }
    return () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      chatLog?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearTimeout(refreshTimer);
      resizeObserver?.disconnect();
    };
  }, [props.visible, props.chatMessages.length, props.pendingAiProposal, refreshScrollTargets]);

  const onJumpChatTop = useCallback(() => {
    chatLogRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    chatTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(refreshScrollTargets, 240);
  }, [refreshScrollTargets]);

  const onJumpChatBottom = useCallback(() => {
    const chatLog = chatLogRef.current;
    if (chatLog) {
      chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: "smooth" });
    }
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    window.setTimeout(() => {
      props.chatInputRef.current?.focus();
      refreshScrollTargets();
    }, 240);
  }, [props.chatInputRef, refreshScrollTargets]);

  const onAttachmentInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    props.onPickAttachments(event.target.files);
    event.target.value = "";
  }, [props]);

  const onAttachmentDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    props.onDropAttachments(event.dataTransfer?.files ?? null);
  }, [props]);

  const onAttachmentDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  if (!props.visible) return null;
  const isChatVoiceActive = props.sttTarget === "chat" && props.sttState !== "idle";
  const showScrollControls = props.chatMessages.length > 0
    && (scrollAffordance.canScrollTop || scrollAffordance.canScrollBottom);

  return (
    <CollapsibleFocusPanel
      panelId="hearth-chat-panel"
      title="Chat"
      meta={props.chatPanelMeta}
      collapsed={false}
      onToggle={() => {}}
      collapsible={false}
    >
      <section
        ref={chatSurfaceRef}
        className="hs-ai-chat"
        aria-label="Hearth AI chat"
        onDragOver={onAttachmentDragOver}
        onDrop={onAttachmentDrop}
      >
        <div ref={chatTopRef} className="hs-ai-chat-scroll-sentinel" aria-hidden="true" />
        <div className="hs-ai-chat-header">
          <div className="hs-ai-chat-title">Talk it through</div>
          <div className="hs-ai-chat-header-actions">
            <button type="button" onClick={props.onCopyChat} disabled={props.chatMessages.length === 0}>Copy chat</button>
            <button type="button" onClick={props.onExportChatPdf} disabled={props.chatMessages.length === 0}>Save as PDF</button>
            <button
              type="button"
              onClick={props.onClearChat}
              disabled={props.isAiProcessing || props.chatMessages.length === 0}
            >
              Clear chat
            </button>
          </div>
        </div>

        <div ref={chatLogRef} className="hs-ai-chat-log" role="log" aria-live="polite">
          {props.chatMessages.length === 0 ? (
            <div className="hs-ai-chat-empty">
              Tell Hearth what you want to shape. It already has the episode context with it.
            </div>
          ) : (
            props.chatMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`hs-ai-chat-msg is-${message.role}`}>
                <span className="hs-ai-chat-role">{message.role === "assistant" ? "Hearth" : "You"}</span>
                <span className="hs-ai-chat-content">{linkifyHearthText(message.content).map((part, partIndex) => (
                  part.href
                    ? <a key={partIndex} href={part.href} target="_blank" rel="noreferrer">{part.text}</a>
                    : <span key={partIndex}>{part.text}</span>
                ))}</span>
              </div>
            ))
          )}
        </div>

        {props.pendingAiProposal && props.pendingAiProposal.ops.length > 0 ? (
          <div
            className="hs-ai-proposal"
            aria-label="Proposed script changes"
            data-proposal-id={props.pendingAiProposal.persistedProposal?.proposalId}
          >
            <div className="hs-ai-proposal-header">
              <div className="hs-ai-proposal-title">
                {props.pendingAiProposal.proposalOrigin === "format_only"
                  ? "Format-only preview"
                  : props.pendingAiProposal.proposalOrigin === "user_editorial"
                    ? "User editorial edit"
                    : "First pass to review"}
              </div>
              <div className="hs-ai-proposal-meta">
                {props.pendingAiProposal.selected.filter(Boolean).length} selected · {props.pendingAiProposal.ops.length} total
                {props.dirtyProposalBodyCount > 0 && props.pendingAiProposal.proposalOrigin === "ai"
                  ? ` · ${props.dirtyProposalBodyCount} edited from AI`
                  : ""}
              </div>
            </div>

            {props.pendingAiProposal.proposalOrigin === "format_only" ? (
              <div className="hs-field-label-muted">
                Deterministic formatting only. Wording, punctuation, speaker identity, notes, and pacing cues are unchanged.
              </div>
            ) : props.pendingAiProposal.proposalOrigin === "user_editorial" ? (
              <div className="hs-error-text-small">
                Substantive user edits detected: {(props.pendingAiProposal.formatChanges ?? []).join(", ").replaceAll("_", " ")}.
                Explicit confirmation is required before Apply or approval.
              </div>
            ) : null}

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
                      disabled={props.isApplyingAiOps || Boolean(props.pendingAiProposal.persistedProposal)}
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
                                <span className="hs-ai-op-dirty-badge">
                                  {props.pendingAiProposal.proposalOrigin === "user_editorial" ? "User editorial edit" : "Edited from AI"}
                                </span>
                              ) : null}
                            </span>
                            <textarea
                              value={op.value}
                              onChange={(event) => props.onEditAiProposalBody(index, event.target.value)}
                              className="hs-ai-op-textarea"
                              rows={12}
                              disabled={props.isApplyingAiOps || Boolean(props.pendingAiProposal.persistedProposal)}
                            />
                          </label>
                          {proposalBodyDirty ? (
                            <div className="hs-ai-op-dirty-actions">
                              <div className="hs-field-label-muted">
                                {props.pendingAiProposal.formatOriginalBody !== null
                                  ? "This proposal now differs from the original deterministic format preview."
                                  : "This proposal now differs from the original AI suggestion."}
                              </div>
                              <button
                                type="button"
                                onClick={() => props.onResetAiProposalBody(index)}
                                disabled={props.isApplyingAiOps}
                              >
                                {props.pendingAiProposal.formatOriginalBody !== null ? "Reset to format-only version" : "Reset to AI version"}
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
              {!props.pendingAiProposal.persistedProposal ? (
                <>
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
                </>
              ) : null}
              {props.pendingAiProposal.ops.some((op: any, index: number) => (
                op.op === "set_body" && props.pendingAiProposal.selected[index]
              )) ? (
                <button
                  type="button"
                  onClick={props.onApproveAiProposalAsScript}
                  disabled={props.isApplyingAiOps}
                  title="Replace the canonical working script with this proposal. Recording approval remains a separate producer-review step."
                >
                  Approve &amp; Replace Script
                </button>
              ) : null}
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
          <div className="hs-error-text-small">
            {props.chatError}
            {props.chatHydrationStatus === "error" ? (
              <button type="button" onClick={props.onRetryChatHydration}>Retry conversation</button>
            ) : null}
          </div>
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

        {props.aiAdmissionBlocked ? (
          <div className="hs-field-label-muted" role="status">
            Hearth's AI actions are paused until an authorized AI funding method is available. No OpenAI generation was submitted for this turn.
          </div>
        ) : null}

        {props.ownerChatCapability.status === "checking" ? (
          <div className="hs-owner-ai-readiness" role="status">
            Checking private owner AI availability…
          </div>
        ) : null}

        {props.ownerChatCapability.status === "unavailable" ? (
          <div className="hs-owner-ai-readiness is-unavailable" role="status">
            Private owner AI is unavailable in this runtime. Saved Hearth content and non-AI tools remain available.
          </div>
        ) : null}

        {props.ownerChatCapability.status === "unknown" ? (
          <div className="hs-owner-ai-readiness is-unknown" role="status">
            <span>Hearth couldn’t verify private owner AI availability. Saved content and non-AI tools remain available.</span>
            <button type="button" onClick={props.onRetryOwnerChatCapability}>Retry</button>
          </div>
        ) : null}

        {!props.aiAdmissionBlocked ? <div className="hs-ai-format-row" role="group" aria-label="Chat mode">
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
        </div> : null}

        {!props.aiAdmissionBlocked ? <div className="hs-ai-shortcut-row" role="group" aria-label="Chat shortcuts">
          <button type="button" onClick={props.onUseChatShortcutDraft}>
            {props.draftShortcutLabel}
          </button>
          <button type="button" onClick={props.onUseChatShortcutSources}>
            Find sources
          </button>
          <button type="button" onClick={props.onOpenComposeScript}>
            Compose
          </button>
        </div> : null}

        <div className="hs-ai-chat-compose">
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            onChange={onAttachmentInputChange}
            className="hs-ai-chat-attachment-input"
            aria-label="Attach files"
            title="Attach files"
            accept=".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={props.isAiProcessing || !props.aiEpisodeReady || props.isAttachmentsLoading}
            title={props.isAttachmentsLoading ? "Loading attachments…" : "Attach files"}
          >
            Attach
          </button>
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
              Browser speech-to-text (Free)
            </option>
            <option value="ai">AI</option>
          </select>
          <button
            type="button"
            onClick={props.onToggleMic}
            className={`mic-button ${isChatVoiceActive ? props.sttState : "idle"}`}
            title={
              !isChatVoiceActive
                ? props.sttLane === "browser"
                  ? "Voice (Free)"
                  : "Voice (AI)"
                : props.sttState === "idle"
                ? props.sttLane === "browser"
                  ? "Voice (Free)"
                  : "Voice (AI)"
                : props.sttState === "listening"
                  ? "Listening... tap to stop"
                  : "Transcribing..."
            }
          >
            {!isChatVoiceActive || props.sttState === "idle" ? "🎙️" : null}
            {isChatVoiceActive && props.sttState === "listening" ? "🔴🎙️" : null}
            {isChatVoiceActive && props.sttState === "transcribing" ? "⏳🎙️" : null}
          </button>
          <div className="hs-ai-chat-inputWrap">
            {props.sttTarget === "chat" && props.sttState === "listening" ? (
              <div className="hs-stt-inputPanel" role="status" aria-live="polite">
                {props.listeningIndicator}
                <div className="hs-stt-hint">Listening... tap 🎙️ to stop</div>
              </div>
            ) : (
              <textarea
                ref={props.chatInputRef}
                value={props.chatDraft}
                onChange={(event) => props.onChatDraftChange(event.target.value)}
                placeholder={resolveHearthChatComposerPlaceholder({
                  status: props.chatHydrationStatus,
                  writingFormat: props.writingFormat,
                })}
                className="hs-ai-chat-input"
                rows={2}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  if (ownerChatBlocked) return;
                  event.preventDefault();
                  props.onSendChat();
                }}
                disabled={props.isAiProcessing || props.aiCreditsDepleted || props.aiAdmissionBlocked || !props.aiEpisodeReady}
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
            disabled={props.isAiProcessing || props.aiCreditsDepleted || props.aiAdmissionBlocked || ownerChatBlocked || !props.aiEpisodeReady || !props.chatDraft.trim()}
          >
            {props.isAiProcessing ? "Sending..." : "Send"}
          </button>
        </div>
        {props.chatAttachments.length > 0 ? (
          <div className="hs-ai-chat-attachments" aria-label="Attached files">
            {props.chatAttachments.map((attachment) => (
              <div key={attachment.id} className={`hs-ai-chat-attachment is-${attachment.status}`}>
                <div className="hs-ai-chat-attachment-main">
                  <span className="hs-ai-chat-attachment-name">{attachment.filename}</span>
                  <span className="hs-ai-chat-attachment-status">{resolveHearthAttachmentStatusLabel(attachment.status)}</span>
                </div>
                {attachment.error ? (
                  <div className="hs-ai-chat-attachment-error">{attachment.error}</div>
                ) : null}
                {attachment.status === "needs_text_extraction" ? (
                  <div className="hs-ai-chat-attachment-paste-area">
                    <p className="hs-ai-chat-attachment-paste-hint">
                      Paste the text from this file so it can be used in your script.
                    </p>
                    <textarea
                      className="hs-ai-chat-attachment-paste-input"
                      placeholder="Paste document text here..."
                      value={pasteTextMap[attachment.id] ?? ""}
                      onChange={(e) => setPasteTextMap((prev) => ({ ...prev, [attachment.id]: e.target.value }))}
                      rows={5}
                      disabled={props.isAiProcessing}
                      aria-label={`Paste text for ${attachment.filename}`}
                    />
                    <button
                      type="button"
                      className="hs-ai-chat-attachment-paste-submit"
                      disabled={props.isAiProcessing || !pasteTextMap[attachment.id]?.trim()}
                      onClick={() => {
                        const text = pasteTextMap[attachment.id]?.trim();
                        if (text) props.onPasteAttachmentText(attachment.id, text);
                      }}
                    >
                      Use this text
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => props.onRemoveAttachment(attachment.id)}
                  disabled={props.isAiProcessing || attachment.status === "uploading" || attachment.status === "reading"}
                  title="Remove attachment"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {props.devMode && props.sttTarget === "chat" && props.sttPreview ? (
          <div className="hs-field-label-muted">{props.sttPreview}</div>
        ) : null}
        {props.sttTarget === "chat" && props.sttNotice ? (
          <div className="hs-field-label-muted">{props.sttNotice}</div>
        ) : null}
        {props.sttTarget === "chat" && props.sttError ? (
          <div className="hs-error-text-small">{props.sttError}</div>
        ) : null}
        <div ref={chatBottomRef} className="hs-ai-chat-scroll-sentinel" aria-hidden="true" />
        {showScrollControls ? (
          <div className="hs-ai-chat-scroll-controls" aria-label="Chat scroll controls">
            {scrollAffordance.canScrollTop ? (
              <button
                type="button"
                className="hs-ai-chat-scroll-jump is-top"
                onClick={onJumpChatTop}
                aria-label="Back to top"
                title="Back to top"
              >
                <span aria-hidden="true">↑</span>
                <span>Back to top</span>
              </button>
            ) : null}
            {scrollAffordance.canScrollBottom ? (
              <button
                type="button"
                className="hs-ai-chat-scroll-jump is-bottom"
                onClick={onJumpChatBottom}
                aria-label="Jump to bottom"
                title="Jump to bottom"
              >
                <span aria-hidden="true">↓</span>
                <span>Jump to bottom</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </CollapsibleFocusPanel>
  );
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    const canScroll = /(auto|scroll|overlay)/.test(overflowY)
      && parent.scrollHeight > parent.clientHeight + 1;
    if (canScroll) return parent;
    parent = parent.parentElement;
  }
  return null;
}
