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
