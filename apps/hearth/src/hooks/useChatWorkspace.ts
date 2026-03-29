import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { HearthChatMessage } from "../lib/hearth-chat-api";
import type { ChatSurfaceProps } from "../views/surfaces/ChatSurface";

type UseChatWorkspaceArgs = {
  chatSurfaceProps: ChatSurfaceProps;
};

export function useChatWorkspace(args: UseChatWorkspaceArgs): { chatSurfaceProps: ChatSurfaceProps } {
  const chatSurfaceProps = useMemo(() => args.chatSurfaceProps, [args.chatSurfaceProps]);
  return { chatSurfaceProps };
}

export function useChatWorkspaceState<TPendingAiProposal>() {
  const [chatMessages, setChatMessages] = useState<HearthChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [sttLane, setSttLane] = useState<"browser" | "ai">("browser");
  const [sttState, setSttState] = useState<"idle" | "listening" | "transcribing">("idle");
  const [sttError, setSttError] = useState<string | null>(null);
  const [sttNotice, setSttNotice] = useState<string | null>(null);
  const [sttPreview, setSttPreview] = useState<string | null>(null);
  const [pendingAiProposal, setPendingAiProposal] = useState<TPendingAiProposal | null>(null);
  const [isApplyingAiOps, setIsApplyingAiOps] = useState(false);
  const [aiRuntimeWarning, setAiRuntimeWarning] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const aiRequestControllerRef = useRef<AbortController | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const aiSttChunksRef = useRef<BlobPart[]>([]);
  const aiSttStartedAtRef = useRef<number | null>(null);
  const aiSttMimeTypeRef = useRef<string>("audio/webm");
  const aiSttEpisodeIdRef = useRef<string | null>(null);
  const aiSttStopTimerRef = useRef<number | null>(null);
  const aiSttDiscardNextStopRef = useRef(false);
  const aiSttTranscribeControllerRef = useRef<AbortController | null>(null);
  const sttNoticeTimerRef = useRef<number | null>(null);
  const sttPreviewTimerRef = useRef<number | null>(null);
  const chatPersistTimerRef = useRef<number | null>(null);
  const chatMessagesRef = useRef<HearthChatMessage[]>([]);
  const latestChatHistoryKeyRef = useRef<string | null>(null);
  const latestChatDraftIdRef = useRef<string | null>(null);
  const skipChatHydrationKeyRef = useRef<string | null>(null);
  const pendingChatHydrationKeyRef = useRef<string | null>(null);
  const chatHydrationSeqRef = useRef(0);

  return {
    chatMessages,
    setChatMessages,
    chatDraft,
    setChatDraft,
    chatError,
    setChatError,
    sttLane,
    setSttLane,
    sttState,
    setSttState,
    sttError,
    setSttError,
    sttNotice,
    setSttNotice,
    sttPreview,
    setSttPreview,
    pendingAiProposal,
    setPendingAiProposal,
    isApplyingAiOps,
    setIsApplyingAiOps,
    aiRuntimeWarning,
    setAiRuntimeWarning,
    isAiProcessing,
    setIsAiProcessing,
    chatInputRef,
    aiRequestControllerRef,
    speechRecognitionRef,
    mediaRecorderRef,
    mediaStreamRef,
    aiSttChunksRef,
    aiSttStartedAtRef,
    aiSttMimeTypeRef,
    aiSttEpisodeIdRef,
    aiSttStopTimerRef,
    aiSttDiscardNextStopRef,
    aiSttTranscribeControllerRef,
    sttNoticeTimerRef,
    sttPreviewTimerRef,
    chatPersistTimerRef,
    chatMessagesRef,
    latestChatHistoryKeyRef,
    latestChatDraftIdRef,
    skipChatHydrationKeyRef,
    pendingChatHydrationKeyRef,
    chatHydrationSeqRef,
  };
}

type ChatHistoryStore = {
  getChatHistory: (draftId: string) => Promise<unknown>;
  saveChatHistory: (draftId: string, messages: HearthChatMessage[]) => Promise<unknown> | void;
};

type UseChatWorkspaceHistoryArgs<TPendingAiProposal> = {
  store: ChatHistoryStore;
  activeDraftId: string | null;
  chatHistoryKey: string | null;
  chatMessages: HearthChatMessage[];
  setChatMessages: (messages: HearthChatMessage[]) => void;
  setChatError: (value: string | null) => void;
  setPendingAiProposal: (value: TPendingAiProposal | null) => void;
  chatPersistTimerRef: MutableRefObject<number | null>;
  chatMessagesRef: MutableRefObject<HearthChatMessage[]>;
  latestChatHistoryKeyRef: MutableRefObject<string | null>;
  latestChatDraftIdRef: MutableRefObject<string | null>;
  skipChatHydrationKeyRef: MutableRefObject<string | null>;
  pendingChatHydrationKeyRef: MutableRefObject<string | null>;
  chatHydrationSeqRef: MutableRefObject<number>;
  readChatHistoryFromCache: (historyKey: string | null) => HearthChatMessage[];
  writeChatHistoryCache: (historyKey: string | null, messages: HearthChatMessage[]) => void;
  sanitizeChatMessagesForStorage: (messages: ReadonlyArray<unknown>) => HearthChatMessage[];
  chatHistoryWriteDebounceMs: number;
};

export function useChatWorkspaceHistory<TPendingAiProposal>(
  args: UseChatWorkspaceHistoryArgs<TPendingAiProposal>,
): {
  flushChatHistoryNow: (options?: {
    historyKey?: string | null;
    draftId?: string | null;
    messages?: HearthChatMessage[];
  }) => void;
} {
  const flushChatHistoryNow = useCallback((options?: {
    historyKey?: string | null;
    draftId?: string | null;
    messages?: HearthChatMessage[];
  }) => {
    const historyKey = options?.historyKey ?? args.latestChatHistoryKeyRef.current;
    const draftId = options?.draftId ?? args.latestChatDraftIdRef.current;
    if (!historyKey) return;
    if (args.chatPersistTimerRef.current) {
      window.clearTimeout(args.chatPersistTimerRef.current);
      args.chatPersistTimerRef.current = null;
    }
    const messages = options?.messages ?? args.chatMessagesRef.current;
    args.writeChatHistoryCache(historyKey, messages);
    if (draftId) {
      void args.store.saveChatHistory(draftId, messages);
    }
  }, [
    args.chatMessagesRef,
    args.chatPersistTimerRef,
    args.latestChatDraftIdRef,
    args.latestChatHistoryKeyRef,
    args.store,
    args.writeChatHistoryCache,
  ]);

  useEffect(() => {
    args.chatMessagesRef.current = args.chatMessages;
  }, [args.chatMessages, args.chatMessagesRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const flush = () => flushChatHistoryNow();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [flushChatHistoryNow]);

  useEffect(() => {
    const previousKey = args.latestChatHistoryKeyRef.current;
    const previousDraftId = args.latestChatDraftIdRef.current;
    const nextDraftId = args.activeDraftId ?? null;
    const shouldFlushPrevious = previousKey
      && (previousKey !== args.chatHistoryKey || previousDraftId !== nextDraftId);
    if (shouldFlushPrevious) {
      flushChatHistoryNow({ historyKey: previousKey, draftId: previousDraftId });
    }
    args.latestChatHistoryKeyRef.current = args.chatHistoryKey;
    args.latestChatDraftIdRef.current = nextDraftId;

    if (!args.chatHistoryKey) {
      args.pendingChatHydrationKeyRef.current = null;
      args.setChatMessages([]);
      args.setChatError(null);
      args.setPendingAiProposal(null);
      return;
    }

    if (args.skipChatHydrationKeyRef.current === args.chatHistoryKey) {
      args.skipChatHydrationKeyRef.current = null;
      args.pendingChatHydrationKeyRef.current = null;
      return;
    }

    const hydrationSeq = args.chatHydrationSeqRef.current + 1;
    args.chatHydrationSeqRef.current = hydrationSeq;
    args.pendingChatHydrationKeyRef.current = args.chatHistoryKey;

    const draftId = nextDraftId;
    void (async () => {
      let hydratedMessages: HearthChatMessage[] = [];
      let loadedFromStore = false;

      if (draftId) {
        try {
          const storeMessages = await args.store.getChatHistory(draftId);
          hydratedMessages = args.sanitizeChatMessagesForStorage(
            Array.isArray(storeMessages) ? storeMessages : [],
          );
          loadedFromStore = hydratedMessages.length > 0;
        } catch {
          loadedFromStore = false;
        }
      }

      if (!loadedFromStore) {
        hydratedMessages = args.readChatHistoryFromCache(args.chatHistoryKey);
        if (draftId && hydratedMessages.length > 0) {
          void args.store.saveChatHistory(draftId, hydratedMessages);
        }
      } else {
        args.writeChatHistoryCache(args.chatHistoryKey, hydratedMessages);
      }

      if (args.chatHydrationSeqRef.current !== hydrationSeq) return;
      args.pendingChatHydrationKeyRef.current = null;
      args.setChatMessages(hydratedMessages);
      args.setChatError(null);
      args.setPendingAiProposal(null);
    })();
  }, [
    args.activeDraftId,
    args.chatHistoryKey,
    args.chatHydrationSeqRef,
    args.latestChatDraftIdRef,
    args.latestChatHistoryKeyRef,
    args.pendingChatHydrationKeyRef,
    args.readChatHistoryFromCache,
    args.sanitizeChatMessagesForStorage,
    args.setChatError,
    args.setChatMessages,
    args.setPendingAiProposal,
    args.skipChatHydrationKeyRef,
    args.store,
    args.writeChatHistoryCache,
    flushChatHistoryNow,
  ]);

  useEffect(() => {
    if (!args.chatHistoryKey) return;
    if (args.pendingChatHydrationKeyRef.current === args.chatHistoryKey) {
      args.pendingChatHydrationKeyRef.current = null;
      return;
    }
    const draftId = args.activeDraftId ?? null;

    if (args.chatPersistTimerRef.current) {
      window.clearTimeout(args.chatPersistTimerRef.current);
      args.chatPersistTimerRef.current = null;
    }
    args.chatPersistTimerRef.current = window.setTimeout(() => {
      args.writeChatHistoryCache(args.chatHistoryKey, args.chatMessages);
      if (draftId) {
        void args.store.saveChatHistory(draftId, args.chatMessages);
      }
      args.chatPersistTimerRef.current = null;
    }, args.chatHistoryWriteDebounceMs);

    return () => {
      if (args.chatPersistTimerRef.current) {
        window.clearTimeout(args.chatPersistTimerRef.current);
        args.chatPersistTimerRef.current = null;
      }
    };
  }, [
    args.activeDraftId,
    args.chatHistoryKey,
    args.chatHistoryWriteDebounceMs,
    args.chatMessages,
    args.chatPersistTimerRef,
    args.pendingChatHydrationKeyRef,
    args.store,
    args.writeChatHistoryCache,
  ]);

  return { flushChatHistoryNow };
}

type SendChatMessageArgs = {
  requestContent: string;
  displayContent?: string;
  productionAction?: string;
  productionScriptVersion?: number;
  source?: "typed" | "voice" | "shortcut";
};

type UseChatWorkspaceRuntimeArgs<TPendingAiProposal, TEpisodeContext, THearthOp> = {
  isAiProcessing: boolean;
  aiTokenBalance: number | null;
  chatDraft: string;
  setChatDraft: (value: string) => void;
  setChatMessages: (value: HearthChatMessage[] | ((prev: HearthChatMessage[]) => HearthChatMessage[])) => void;
  setChatError: (value: string | null) => void;
  setPendingAiProposal: (value: TPendingAiProposal | null) => void;
  setAiRuntimeWarning: (value: string | null) => void;
  setIsAiProcessing: (value: boolean) => void;
  setAiBillingMode: (value: "forge" | "byo") => void;
  setAiTokenBalance: (value: number | null) => void;
  chatMessagesRef: MutableRefObject<HearthChatMessage[]>;
  aiRequestControllerRef: MutableRefObject<AbortController | null>;
  gateAwaitingAnswersRef: MutableRefObject<boolean>;
  pendingShortcutIntentRef: MutableRefObject<"outline" | "script" | null>;
  chatHistoryMaxMessages: number;
  getSelectedWritingFormat: () => string;
  resolveChatRequestWritingFormat: (args: {
    requestContent: string;
    pendingShortcutIntent: "outline" | "script" | null;
    selectedFormat: string;
  }) => {
    requestContent: string;
    appliedFormat: string;
    source: "message" | "shortcut" | "default";
  };
  rememberWritingFormat: (format: string) => void;
  buildActiveEpisodeContext: () => TEpisodeContext | null;
  detectChatIntentSignals: (text: string) => {
    hasDeliverable: boolean;
    requestedOutline: boolean;
    requestedScript: boolean;
    explicitDraftNow: boolean;
  };
  detectAiAutosaveReasonCode: (text: string) => any;
  buildAssistantMessageContent: (args: {
    assistantText: string;
    ops: THearthOp[];
    autosaveReasonCode: any;
  }) => string;
  countProducerQuestions: (text: string) => number;
  readLatestOutlineFromOps: (ops: THearthOp[]) => string | null;
  cloneHearthProposalOps: (ops: THearthOp[]) => THearthOp[];
  createPendingAiProposal: (args: {
    assistantText: string;
    proposalOps: THearthOp[];
    episodeContext: TEpisodeContext;
    fromGate: boolean;
    autosaveReasonCode: any;
  }) => TPendingAiProposal;
  resolveAiLaneFromStorage: () => "forge" | "byo";
  requestHearthChatReply: (
    messages: HearthChatMessage[],
    episodeContext: TEpisodeContext,
    options: { signal: AbortSignal },
  ) => Promise<{
    ok: boolean;
    cancelled?: boolean;
    error?: string;
    assistantText?: string;
    ops?: THearthOp[];
    gate?: "clarify";
    creditsWarning?: string;
    runtime: {
      billingMode: "forge" | "byo";
    };
  }>;
  persistProductionArtifact: (args: {
    action: string;
    scriptVersion: number;
    assistantText: string;
  }) => Promise<void>;
  refreshMyAiCredits: () => Promise<{
    ok: boolean;
    runtime?: {
      billingMode: "forge" | "byo";
      tokenBalance: number | null;
    };
  }>;
  recordInteractionEvent: (eventType: any, payload?: Record<string, unknown>) => void;
  publishForgeNotice: (notice: {
    job: any;
    title: string;
    message?: string;
    severity: any;
  }) => void;
};

export function useChatWorkspaceRuntime<TPendingAiProposal, TEpisodeContext, THearthOp>(
  args: UseChatWorkspaceRuntimeArgs<TPendingAiProposal, TEpisodeContext, THearthOp>,
): {
  sendChatMessage: (params: SendChatMessageArgs) => Promise<void>;
  onSendChat: () => Promise<void>;
  onCancelAiRequest: () => void;
} {
  const onCancelAiRequest = useCallback(() => {
    args.aiRequestControllerRef.current?.abort();
  }, [args.aiRequestControllerRef]);

  const sendChatMessage = useCallback(async (params: SendChatMessageArgs) => {
    if (args.isAiProcessing) return;
    const rawRequestContent = params.requestContent.trim();
    if (!rawRequestContent) return;

    const displayContent = (params.displayContent ?? rawRequestContent).trim();
    const episodeContext = args.buildActiveEpisodeContext();
    if (!episodeContext) {
      args.setChatError("Pick an Episode or Spark and I’ll work from there.");
      return;
    }

    const lane = args.resolveAiLaneFromStorage();
    args.setAiBillingMode(lane);
    if (lane === "forge" && args.aiTokenBalance != null && args.aiTokenBalance <= 0) {
      args.setChatError("You are out of AI credits for now.");
      return;
    }
    if (lane === "byo") {
      args.setAiTokenBalance(null);
    }

    const source = params.source ?? "typed";
    const isProductionRequest = Boolean(params.productionAction);
    const intentSignals = args.detectChatIntentSignals(rawRequestContent);
    const autosaveReasonCode = args.detectAiAutosaveReasonCode(rawRequestContent);
    const pendingShortcutIntent = args.pendingShortcutIntentRef.current;
    args.pendingShortcutIntentRef.current = null;
    const selectedWritingFormat = args.getSelectedWritingFormat();
    const resolvedWritingFormat = args.resolveChatRequestWritingFormat({
      requestContent: rawRequestContent,
      pendingShortcutIntent,
      selectedFormat: selectedWritingFormat,
    });
    const requestContent = resolvedWritingFormat.requestContent;
    args.rememberWritingFormat(resolvedWritingFormat.appliedFormat);

    args.recordInteractionEvent("chat_sent", {
      source,
      chars: rawRequestContent.length,
      lane,
      has_deliverable: intentSignals.hasDeliverable,
      production_action: params.productionAction ?? null,
      writing_format: resolvedWritingFormat.appliedFormat,
      writing_format_source: resolvedWritingFormat.source,
    });

    if (!isProductionRequest) {
      if (intentSignals.requestedOutline && pendingShortcutIntent !== "outline") {
        args.recordInteractionEvent("user_requested_outline", { source });
      }
      if (intentSignals.requestedScript && pendingShortcutIntent !== "script") {
        args.recordInteractionEvent("user_requested_script", { source });
      }
      if (intentSignals.explicitDraftNow) {
        args.recordInteractionEvent("user_explicit_draft_now", { source });
      }
    }

    const gateAnswering = args.gateAwaitingAnswersRef.current;
    if (gateAnswering) {
      args.gateAwaitingAnswersRef.current = false;
      args.recordInteractionEvent("gate_answers_provided", { source });
    }

    const requestUserMessage: HearthChatMessage = { role: "user", content: requestContent };
    const displayUserMessage: HearthChatMessage = { role: "user", content: displayContent || requestContent };
    const baseMessages = args.chatMessagesRef.current;
    const requestMessages = [...baseMessages, requestUserMessage].slice(-args.chatHistoryMaxMessages);
    const displayMessages = [...baseMessages, displayUserMessage].slice(-args.chatHistoryMaxMessages);
    args.setChatMessages(displayMessages);
    args.setChatDraft("");
    args.setChatError(null);
    args.setAiRuntimeWarning(null);
    args.setPendingAiProposal(null);

    const controller = new AbortController();
    args.aiRequestControllerRef.current = controller;
    args.setIsAiProcessing(true);

    try {
      const result = await args.requestHearthChatReply(requestMessages, episodeContext, { signal: controller.signal });
      args.setAiBillingMode(result.runtime.billingMode);
      if (result.runtime.billingMode === "byo") {
        args.setAiTokenBalance(null);
      }
      if (!result.ok) {
        if (!result.cancelled) {
          const message = result.error ?? "AI request failed.";
          args.setChatError(message);
          args.publishForgeNotice({
            job: "job-failed",
            title: "Hearth job failed",
            message,
            severity: "error",
          });
        }
        return;
      }

      const ops = result.ops ?? [];
      const assistantText = result.assistantText ?? "";

      if (result.gate === "clarify") {
        args.gateAwaitingAnswersRef.current = true;
        args.recordInteractionEvent("gate_questions_shown", {
          source: "server_gate",
          question_count: args.countProducerQuestions(assistantText),
        });
      }

      const keepOutlineInChatOnly = !params.productionAction && autosaveReasonCode === "ai_outline";
      const assistantContent = args.buildAssistantMessageContent({
        assistantText,
        ops,
        autosaveReasonCode,
      });
      const assistantMessage: HearthChatMessage = { role: "assistant", content: assistantContent };
      args.setChatMessages((prev) => [...prev, assistantMessage].slice(-args.chatHistoryMaxMessages));

      if (params.productionAction && params.productionScriptVersion) {
        await args.persistProductionArtifact({
          action: params.productionAction,
          scriptVersion: params.productionScriptVersion,
          assistantText,
        });
      }

      const proposalOps = keepOutlineInChatOnly ? [] : ops;
      if (keepOutlineInChatOnly) {
        args.recordInteractionEvent("outline_generated", {
          source,
          has_outline: Boolean(args.readLatestOutlineFromOps(ops)),
          ops_count: ops.length,
        });
      } else if (!params.productionAction && ops.some((op: any) => op.op === "set_body")) {
        args.recordInteractionEvent("draft_generated", {
          source,
          ops_count: ops.length,
        });
      }

      if (!params.productionAction && proposalOps.length > 0) {
        args.setPendingAiProposal(args.createPendingAiProposal({
          assistantText: assistantContent,
          proposalOps,
          episodeContext,
          fromGate: gateAnswering,
          autosaveReasonCode,
        }));
      }

      if (!params.productionAction) {
        const scriptUpdated = proposalOps.some((op: any) => op.op === "set_body");
        const sourceAdditions = proposalOps.filter((op: any) => op.op === "add_source").length;
        if (scriptUpdated) {
          const sourceSuffix = sourceAdditions > 0
            ? ` and added ${sourceAdditions} source${sourceAdditions === 1 ? "" : "s"}`
            : "";
          args.publishForgeNotice({
            job: "script-completed",
            title: "Draft ready",
            message: `Hearth put together a draft pass${sourceSuffix}.`,
            severity: "success",
          });
        } else if (sourceAdditions > 0) {
          args.publishForgeNotice({
            job: "sources-found",
            title: "Sources lined up",
            message: `Hearth lined up ${sourceAdditions} source${sourceAdditions === 1 ? "" : "s"} for this episode.`,
            severity: "success",
          });
        }
      }

      if (result.creditsWarning) {
        args.setAiRuntimeWarning(result.creditsWarning);
      }

      const refreshedCredits = await args.refreshMyAiCredits();
      const laneNow = args.resolveAiLaneFromStorage();
      if (laneNow === "byo") {
        args.setAiBillingMode("byo");
        args.setAiTokenBalance(null);
      } else if (refreshedCredits.ok && refreshedCredits.runtime) {
        args.setAiBillingMode(refreshedCredits.runtime.billingMode);
        args.setAiTokenBalance(refreshedCredits.runtime.tokenBalance);
      } else {
        args.setAiRuntimeWarning("Unable to update credits.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      const message = err instanceof Error ? err.message : "AI request failed.";
      args.setChatError(message);
      args.publishForgeNotice({
        job: "job-failed",
        title: "Hearth job failed",
        message,
        severity: "error",
      });
    } finally {
      if (args.aiRequestControllerRef.current === controller) {
        args.aiRequestControllerRef.current = null;
        args.setIsAiProcessing(false);
      }
    }
  }, [args]);

  const onSendChat = useCallback(async () => {
    const content = args.chatDraft.trim();
    if (!content) return;
    await sendChatMessage({ requestContent: content });
  }, [args.chatDraft, sendChatMessage]);

  return { sendChatMessage, onSendChat, onCancelAiRequest };
}

type UseChatWorkspaceSttArgs = {
  workpieceId: string | null;
  devMode: boolean;
  hasBrowserSpeech: boolean;
  isAiProcessing: boolean;
  aiTokenBalance: number | null;
  sttLane: "browser" | "ai";
  sttState: "idle" | "listening" | "transcribing";
  setSttLane: (lane: "browser" | "ai") => void;
  setSttState: (state: "idle" | "listening" | "transcribing") => void;
  setSttError: (value: string | null) => void;
  setSttNotice: (value: string | null) => void;
  setSttPreview: (value: string | null) => void;
  setAiRuntimeWarning: (value: string | null) => void;
  setAiBillingMode: (value: "forge" | "byo") => void;
  setAiTokenBalance: (value: number | null) => void;
  speechRecognitionRef: MutableRefObject<any>;
  mediaRecorderRef: MutableRefObject<MediaRecorder | null>;
  mediaStreamRef: MutableRefObject<MediaStream | null>;
  aiSttChunksRef: MutableRefObject<BlobPart[]>;
  aiSttStartedAtRef: MutableRefObject<number | null>;
  aiSttMimeTypeRef: MutableRefObject<string>;
  aiSttEpisodeIdRef: MutableRefObject<string | null>;
  aiSttStopTimerRef: MutableRefObject<number | null>;
  aiSttDiscardNextStopRef: MutableRefObject<boolean>;
  aiSttTranscribeControllerRef: MutableRefObject<AbortController | null>;
  sttNoticeTimerRef: MutableRefObject<number | null>;
  sttPreviewTimerRef: MutableRefObject<number | null>;
  sttInlineFeedbackMs: number;
  sttPreviewMaxChars: number;
  aiSttMaxDurationMs: number;
  aiSttMaxBytes: number;
  resolveAiLaneFromStorage: () => "forge" | "byo";
  resolveAiSttMimeType: () => string | null;
  uploadHearthSttAudio: (args: { workpieceId: string; blob: Blob }) => Promise<any>;
  requestHearthSttTranscript: (args: {
    workpieceId: string;
    storageKey: string;
    mimeType: string;
    signal: AbortSignal;
  }) => Promise<any>;
  sendChatMessage: (args: { requestContent: string; source?: "voice" | "typed" | "shortcut" }) => Promise<void>;
};

export function useChatWorkspaceStt(args: UseChatWorkspaceSttArgs): {
  onToggleMic: () => void;
} {
  const clearSttNoticeTimer = useCallback(() => {
    if (args.sttNoticeTimerRef.current) {
      window.clearTimeout(args.sttNoticeTimerRef.current);
      args.sttNoticeTimerRef.current = null;
    }
  }, [args.sttNoticeTimerRef]);

  const clearSttPreviewTimer = useCallback(() => {
    if (args.sttPreviewTimerRef.current) {
      window.clearTimeout(args.sttPreviewTimerRef.current);
      args.sttPreviewTimerRef.current = null;
    }
  }, [args.sttPreviewTimerRef]);

  const showSttNotice = useCallback((message: string) => {
    const text = message.trim();
    if (!text) return;
    clearSttNoticeTimer();
    args.setSttNotice(text);
    args.sttNoticeTimerRef.current = window.setTimeout(() => {
      args.setSttNotice(null);
      args.sttNoticeTimerRef.current = null;
    }, args.sttInlineFeedbackMs);
  }, [args, clearSttNoticeTimer]);

  const showSttPreviewLine = useCallback((transcript: string) => {
    if (!args.devMode) return;
    const normalized = transcript.replace(/\s+/g, " ").trim();
    if (!normalized) return;
    const snippet = normalized.length > args.sttPreviewMaxChars
      ? `${normalized.slice(0, args.sttPreviewMaxChars).trimEnd()}...`
      : normalized;
    clearSttPreviewTimer();
    args.setSttPreview(`STT: "${snippet}"`);
    args.sttPreviewTimerRef.current = window.setTimeout(() => {
      args.setSttPreview(null);
      args.sttPreviewTimerRef.current = null;
    }, args.sttInlineFeedbackMs);
  }, [args, clearSttPreviewTimer]);

  const commitVoiceTranscript = useCallback(async (rawTranscript: string) => {
    const text = rawTranscript.trim();
    if (!text) {
      args.setSttError(null);
      showSttNotice("No speech detected.");
      return;
    }
    showSttPreviewLine(text);
    await args.sendChatMessage({ requestContent: text, source: "voice" });
  }, [args, showSttNotice, showSttPreviewLine]);

  const clearAiSttStopTimer = useCallback(() => {
    if (args.aiSttStopTimerRef.current) {
      window.clearTimeout(args.aiSttStopTimerRef.current);
      args.aiSttStopTimerRef.current = null;
    }
  }, [args.aiSttStopTimerRef]);

  const stopAiSttStream = useCallback(() => {
    const stream = args.mediaStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
    args.mediaStreamRef.current = null;
  }, [args.mediaStreamRef]);

  const commitAiSttBlob = useCallback(async (blobArgs: {
    episodeId: string;
    blob: Blob;
    mimeType: string;
  }) => {
    const episodeId = blobArgs.episodeId.trim();
    if (!episodeId) {
      args.setSttError("Select an Episode or Spark to start.");
      return;
    }

    const uploaded = await args.uploadHearthSttAudio({
      workpieceId: episodeId,
      blob: blobArgs.blob,
    });
    if (!uploaded.ok) {
      args.setSttError(uploaded.error);
      return;
    }

    const controller = new AbortController();
    args.aiSttTranscribeControllerRef.current = controller;
    let transcriptResult: any;
    try {
      transcriptResult = await args.requestHearthSttTranscript({
        workpieceId: episodeId,
        storageKey: uploaded.storageKey,
        mimeType: uploaded.mimeType || blobArgs.mimeType,
        signal: controller.signal,
      });
    } finally {
      if (args.aiSttTranscribeControllerRef.current === controller) {
        args.aiSttTranscribeControllerRef.current = null;
      }
    }

    args.setAiBillingMode(transcriptResult.runtime.billingMode);
    if (transcriptResult.runtime.billingMode === "byo") {
      args.setAiTokenBalance(null);
    } else {
      args.setAiTokenBalance(transcriptResult.runtime.tokenBalance);
    }

    if (!transcriptResult.ok) {
      if (!transcriptResult.cancelled) {
        args.setSttError(transcriptResult.error);
      }
      if (transcriptResult.creditsWarning) {
        args.setAiRuntimeWarning(transcriptResult.creditsWarning);
      }
      return;
    }

    if (transcriptResult.creditsWarning) {
      args.setAiRuntimeWarning(transcriptResult.creditsWarning);
    }
    await commitVoiceTranscript(transcriptResult.text);
  }, [args, commitVoiceTranscript]);

  const stopAiStt = useCallback(() => {
    const recorder = args.mediaRecorderRef.current;
    if (!recorder) {
      args.setSttState("idle");
      return;
    }
    if (recorder.state === "inactive") {
      args.setSttState("idle");
      return;
    }
    args.setSttState("transcribing");
    clearAiSttStopTimer();
    try {
      recorder.stop();
    } catch {
      args.aiSttDiscardNextStopRef.current = true;
      args.mediaRecorderRef.current = null;
      args.aiSttChunksRef.current = [];
      args.aiSttStartedAtRef.current = null;
      args.aiSttEpisodeIdRef.current = null;
      stopAiSttStream();
      args.setSttState("idle");
      args.setSttError("Unable to stop recorder.");
    }
  }, [args, clearAiSttStopTimer, stopAiSttStream]);

  const startAiStt = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      args.setSttError("Microphone capture is not supported in this browser.");
      args.setSttState("idle");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      args.setSttError("MediaRecorder is not available in this browser.");
      args.setSttState("idle");
      return;
    }
    const episodeId = args.workpieceId?.trim();
    if (!episodeId) {
      args.setSttError("Select an Episode or Spark to start.");
      args.setSttState("idle");
      return;
    }
    if (args.isAiProcessing) {
      args.setSttError("Wait for the current AI request to finish.");
      args.setSttState("idle");
      return;
    }

    const lane = args.resolveAiLaneFromStorage();
    if (lane === "forge" && args.aiTokenBalance != null && args.aiTokenBalance <= 0) {
      args.setSttError("No AI credits remaining.");
      args.setSttState("idle");
      return;
    }

    clearSttNoticeTimer();
    args.setSttNotice(null);
    clearSttPreviewTimer();
    args.setSttPreview(null);
    args.setSttError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to access microphone.";
      args.setSttError(message);
      args.setSttState("idle");
      return;
    }

    const mimeType = args.resolveAiSttMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (error) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      const message = error instanceof Error ? error.message : "Unable to start recorder.";
      args.setSttError(message);
      args.setSttState("idle");
      return;
    }

    args.mediaStreamRef.current = stream;
    args.mediaRecorderRef.current = recorder;
    args.aiSttChunksRef.current = [];
    args.aiSttStartedAtRef.current = Date.now();
    args.aiSttEpisodeIdRef.current = episodeId;
    args.aiSttMimeTypeRef.current = recorder.mimeType || mimeType || "audio/webm";
    args.aiSttDiscardNextStopRef.current = false;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        args.aiSttChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      args.aiSttDiscardNextStopRef.current = true;
      clearAiSttStopTimer();
      args.mediaRecorderRef.current = null;
      args.aiSttChunksRef.current = [];
      args.aiSttStartedAtRef.current = null;
      args.aiSttEpisodeIdRef.current = null;
      stopAiSttStream();
      args.setSttState("idle");
      args.setSttError("Recording failed.");
    };

    recorder.onstop = async () => {
      const shouldDiscard = args.aiSttDiscardNextStopRef.current;
      const chunks = args.aiSttChunksRef.current.slice();
      const startedAt = args.aiSttStartedAtRef.current;
      const durationMs = startedAt ? Date.now() - startedAt : 0;
      const recordedMimeType = args.aiSttMimeTypeRef.current || "audio/webm";
      const activeEpisodeId = args.aiSttEpisodeIdRef.current;

      args.aiSttDiscardNextStopRef.current = false;
      args.mediaRecorderRef.current = null;
      args.aiSttChunksRef.current = [];
      args.aiSttStartedAtRef.current = null;
      args.aiSttEpisodeIdRef.current = null;
      clearAiSttStopTimer();
      stopAiSttStream();

      if (shouldDiscard) {
        args.setSttState("idle");
        return;
      }

      const blob = new Blob(chunks, { type: recordedMimeType });
      if (!blob.size) {
        await commitVoiceTranscript("");
        args.setSttState("idle");
        return;
      }
      if (!activeEpisodeId) {
        args.setSttState("idle");
        args.setSttError("Select an Episode or Spark to start.");
        return;
      }
      if (durationMs > args.aiSttMaxDurationMs + 1500) {
        args.setSttState("idle");
        args.setSttError("Recording exceeded the 5 minute limit.");
        return;
      }
      if (blob.size > args.aiSttMaxBytes) {
        args.setSttState("idle");
        args.setSttError("Recording exceeds the 10MB limit.");
        return;
      }

      args.setSttState("transcribing");
      try {
        await commitAiSttBlob({
          episodeId: activeEpisodeId,
          blob,
          mimeType: recordedMimeType,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transcription failed.";
        args.setSttError(message);
      } finally {
        args.setSttState("idle");
      }
    };

    try {
      recorder.start(1000);
      args.setSttState("listening");
      clearAiSttStopTimer();
      args.aiSttStopTimerRef.current = window.setTimeout(() => {
        if (args.mediaRecorderRef.current !== recorder) return;
        if (recorder.state === "inactive") return;
        stopAiStt();
      }, args.aiSttMaxDurationMs);
    } catch (error) {
      args.mediaRecorderRef.current = null;
      args.aiSttChunksRef.current = [];
      args.aiSttStartedAtRef.current = null;
      args.aiSttEpisodeIdRef.current = null;
      clearAiSttStopTimer();
      stopAiSttStream();
      const message = error instanceof Error ? error.message : "Unable to start recorder.";
      args.setSttState("idle");
      args.setSttError(message);
    }
  }, [args, clearAiSttStopTimer, clearSttNoticeTimer, clearSttPreviewTimer, commitAiSttBlob, commitVoiceTranscript, stopAiStt, stopAiSttStream]);

  const startBrowserStt = useCallback(async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      args.setSttError("Browser speech not supported.");
      args.setSttState("idle");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          const chunk = result[0]?.transcript;
          if (typeof chunk === "string" && chunk.trim()) {
            finalTranscript += `${chunk.trim()} `;
          }
        }
      }
    };

    recognition.onerror = () => {
      args.speechRecognitionRef.current = null;
      stopAiSttStream();
      args.setSttState("idle");
      args.setSttError("Speech recognition error.");
    };

    recognition.onend = async () => {
      args.speechRecognitionRef.current = null;
      stopAiSttStream();
      args.setSttState("idle");
      await commitVoiceTranscript(finalTranscript);
    };

    stopAiSttStream();
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const previewStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        args.mediaStreamRef.current = previewStream;
      } catch {
        args.mediaStreamRef.current = null;
      }
    }

    args.speechRecognitionRef.current = recognition;
    clearSttNoticeTimer();
    args.setSttNotice(null);
    clearSttPreviewTimer();
    args.setSttPreview(null);
    args.setSttError(null);
    args.setSttState("listening");
    try {
      recognition.start();
    } catch {
      args.speechRecognitionRef.current = null;
      stopAiSttStream();
      args.setSttState("idle");
      args.setSttError("Unable to start speech recognition.");
    }
  }, [args, clearSttNoticeTimer, clearSttPreviewTimer, commitVoiceTranscript, stopAiSttStream]);

  const stopBrowserStt = useCallback(() => {
    stopAiSttStream();
    try {
      args.speechRecognitionRef.current?.stop();
    } catch {
      // onend will settle state
    }
  }, [args.speechRecognitionRef, stopAiSttStream]);

  const onToggleMic = useCallback(() => {
    if (args.sttState === "transcribing") return;
    if (args.sttState === "idle") {
      args.setSttError(null);
      clearSttNoticeTimer();
      args.setSttNotice(null);
      if (args.sttLane === "browser") {
        void startBrowserStt();
        return;
      }
      void startAiStt();
      return;
    }
    if (args.sttState === "listening") {
      if (args.sttLane === "browser") {
        stopBrowserStt();
        return;
      }
      stopAiStt();
    }
  }, [args, clearSttNoticeTimer, startAiStt, startBrowserStt, stopAiStt, stopBrowserStt]);

  useEffect(() => {
    if (args.hasBrowserSpeech || args.sttLane !== "browser") return;
    args.setSttLane("ai");
    args.setSttState("idle");
    args.setSttError("Browser speech not supported.");
  }, [args.hasBrowserSpeech, args.setSttError, args.setSttLane, args.setSttState, args.sttLane]);

  useEffect(() => {
    return () => {
      try {
        args.speechRecognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
      args.speechRecognitionRef.current = null;
      args.aiSttTranscribeControllerRef.current?.abort();
      args.aiSttTranscribeControllerRef.current = null;
      clearSttNoticeTimer();
      clearSttPreviewTimer();
      clearAiSttStopTimer();
      const recorder = args.mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        args.aiSttDiscardNextStopRef.current = true;
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      args.mediaRecorderRef.current = null;
      args.aiSttChunksRef.current = [];
      args.aiSttStartedAtRef.current = null;
      args.aiSttEpisodeIdRef.current = null;
      stopAiSttStream();
    };
  }, [args, clearAiSttStopTimer, clearSttNoticeTimer, clearSttPreviewTimer, stopAiSttStream]);

  return { onToggleMic };
}

type ApplyMode = "all" | "selected";

type ProposalStateSetter<TPendingAiProposal> = (
  next:
    | TPendingAiProposal
    | null
    | ((prev: TPendingAiProposal | null) => TPendingAiProposal | null),
) => void;

type ProposalLike<TOp> = {
  ops: TOp[];
  originalOps: TOp[];
  selected: boolean[];
  fromGate: boolean;
};

type UseChatWorkspaceProposalArgs<TPendingAiProposal extends ProposalLike<TOp>, TOp> = {
  pendingAiProposal: TPendingAiProposal | null;
  setPendingAiProposal: ProposalStateSetter<TPendingAiProposal>;
  isApplyingAiOps: boolean;
  setIsApplyingAiOps: (value: boolean) => void;
  setChatError: (value: string | null) => void;
  clearProposalUiErrors: () => void;
  getApplyPreconditionError: () => string | null;
  validateProposalApply: (args: {
    proposal: TPendingAiProposal;
    opsToApply: TOp[];
    mode: ApplyMode;
  }) => boolean;
  applyProposalOps: (args: {
    proposal: TPendingAiProposal;
    opsToApply: TOp[];
    mode: ApplyMode;
  }) => Promise<void>;
  recordProposalApplied: (payload: {
    mode: ApplyMode;
    totalOps: number;
    appliedOps: number;
    fromGate: boolean;
  }) => void;
  recordProposalDiscarded: (payload: {
    opsCount: number;
    fromGate: boolean;
  }) => void;
  updateProposalBodyOps: (
    ops: TOp[],
    index: number,
    value: string,
  ) => TOp[];
  resetProposalBodyOps: (
    ops: TOp[],
    originalOps: TOp[],
    index: number,
  ) => TOp[];
  isProposalBodyDirty: (ops: TOp[], originalOps: TOp[], index: number) => boolean;
};

export function useChatWorkspaceProposal<TPendingAiProposal extends ProposalLike<TOp>, TOp>(
  args: UseChatWorkspaceProposalArgs<TPendingAiProposal, TOp>,
): {
  onApplyAiProposal: (mode: ApplyMode) => Promise<void>;
  onDiscardAiProposal: () => void;
  onToggleAiProposalOp: (index: number) => void;
  onEditAiProposalBody: (index: number, value: string) => void;
  onResetAiProposalBody: (index: number) => void;
  isProposalBodyDirtyAt: (index: number) => boolean;
} {
  const onApplyAiProposal = useCallback(async (mode: ApplyMode) => {
    const proposal = args.pendingAiProposal;
    if (!proposal || args.isApplyingAiOps) return;

    const preconditionError = args.getApplyPreconditionError();
    if (preconditionError) {
      args.setChatError(preconditionError);
      return;
    }

    const opsToApply = mode === "all"
      ? proposal.ops
      : proposal.ops.filter((_, index) => proposal.selected[index]);

    if (opsToApply.length === 0) {
      args.setChatError("Select at least one proposed change.");
      return;
    }

    const isValid = args.validateProposalApply({ proposal, opsToApply, mode });
    if (!isValid) {
      return;
    }

    args.setIsApplyingAiOps(true);
    args.setChatError(null);
    args.clearProposalUiErrors();

    try {
      await args.applyProposalOps({ proposal, opsToApply, mode });
      args.recordProposalApplied({
        mode,
        totalOps: proposal.ops.length,
        appliedOps: opsToApply.length,
        fromGate: proposal.fromGate,
      });

      if (mode === "all") {
        args.setPendingAiProposal(null);
      } else {
        args.setPendingAiProposal((prev) => {
          if (!prev) return prev;
          const remainingOps = prev.ops.filter((_, index) => !prev.selected[index]);
          if (remainingOps.length === 0) return null;
          return {
            ...prev,
            ops: remainingOps,
            selected: remainingOps.map(() => true),
          };
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply AI changes.";
      args.setChatError(message);
    } finally {
      args.setIsApplyingAiOps(false);
    }
  }, [args]);

  const onDiscardAiProposal = useCallback(() => {
    if (args.pendingAiProposal) {
      args.recordProposalDiscarded({
        opsCount: args.pendingAiProposal.ops.length,
        fromGate: args.pendingAiProposal.fromGate,
      });
    }
    args.setPendingAiProposal(null);
  }, [args]);

  const onToggleAiProposalOp = useCallback((index: number) => {
    args.setPendingAiProposal((prev) => {
      if (!prev) return prev;
      const selected = prev.selected.slice();
      selected[index] = !selected[index];
      return { ...prev, selected };
    });
  }, [args]);

  const onEditAiProposalBody = useCallback((index: number, value: string) => {
    args.clearProposalUiErrors();
    args.setChatError(null);
    args.setPendingAiProposal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ops: args.updateProposalBodyOps(prev.ops, index, value),
      };
    });
  }, [args]);

  const onResetAiProposalBody = useCallback((index: number) => {
    args.clearProposalUiErrors();
    args.setChatError(null);
    args.setPendingAiProposal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ops: args.resetProposalBodyOps(prev.ops, prev.originalOps, index),
      };
    });
  }, [args]);

  const isProposalBodyDirtyAt = useCallback((index: number) => {
    const proposal = args.pendingAiProposal;
    if (!proposal) return false;
    return args.isProposalBodyDirty(proposal.ops, proposal.originalOps, index);
  }, [args]);

  return {
    onApplyAiProposal,
    onDiscardAiProposal,
    onToggleAiProposalOp,
    onEditAiProposalBody,
    onResetAiProposalBody,
    isProposalBodyDirtyAt,
  };
}
