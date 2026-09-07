import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createDraft } from "../src/domain/draft";
import type { HearthChatMessage } from "../src/lib/hearth-ai-runtime-contract";
import { createHearthOperationAuthority } from "../src/lib/hearth-operation-authority";
import {
  NO_CANONICAL_SCRIPT_APPROVAL,
  resolveCanonicalScriptApproval,
} from "../src/lib/hearth-approval-authority";
import {
  readLegacyWorkpieceSourcesRecoveryEvidence,
  readWorkpieceSources,
  writeWorkpieceSourcesCache,
} from "../src/lib/source-registry";
import { useChatWorkspaceHistory, useChatWorkspaceRuntime } from "../src/hooks/useChatWorkspace";
import { TongsHearthStore } from "../src/storage/tongs-store";

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "44444444-4444-4444-8444-444444444444";
const WORKPIECE_A = "22222222-2222-4222-8222-222222222222";
const WORKPIECE_B = "33333333-3333-4333-8333-333333333333";

type MutableWindow = Window & typeof globalThis & {
  location: { search: string };
};

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.#values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, String(value));
  }
}

function installWindow(search = `?workspace_id=${WORKSPACE_A}&workpiece_id=${WORKPIECE_A}`): {
  storage: MemoryStorage;
  setSearch: (next: string) => void;
  restore: () => void;
} {
  const runtime = globalThis as unknown as { window?: MutableWindow; localStorage?: Storage };
  const previous = runtime.window;
  const previousStorage = runtime.localStorage;
  const storage = new MemoryStorage();
  const nextWindow = {
    location: { search },
    localStorage: storage,
    setTimeout,
    clearTimeout,
  } as unknown as MutableWindow;
  runtime.window = nextWindow;
  runtime.localStorage = storage;
  return {
    storage,
    setSearch: (next) => {
      nextWindow.location.search = next;
    },
    restore: () => {
      if (previous === undefined) {
        Reflect.deleteProperty(runtime, "window");
      } else {
        runtime.window = previous;
      }
      if (previousStorage === undefined) {
        Reflect.deleteProperty(runtime, "localStorage");
      } else {
        runtime.localStorage = previousStorage;
      }
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function installDom(): { container: HTMLElement; restore: () => void } {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: `http://localhost/?workspace_id=${WORKSPACE_A}&workpiece_id=${WORKPIECE_A}`,
  });
  const runtime = globalThis as unknown as Record<string, unknown>;
  const properties = ["window", "document", "navigator", "Node", "HTMLElement", "Event"] as const;
  const previous = new Map<string, PropertyDescriptor | undefined>(
    properties.map((property) => [property, Object.getOwnPropertyDescriptor(globalThis, property)]),
  );
  const values: Record<(typeof properties)[number], unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
  };
  for (const property of properties) {
    Object.defineProperty(globalThis, property, {
      configurable: true,
      writable: true,
      value: values[property],
    });
  }

  const container = dom.window.document.getElementById("root");
  assert.ok(container);
  return {
    container,
    restore: () => {
      dom.window.close();
      for (const property of properties) {
        const descriptor = previous.get(property);
        if (descriptor) {
          Object.defineProperty(globalThis, property, descriptor);
        } else {
          Reflect.deleteProperty(runtime, property);
        }
      }
    },
  };
}

test("stabilization contract: a late AI result from workpiece A cannot mutate workpiece B", async () => {
  type EpisodeContext = { workspaceId: string; workpieceId: string; draftId: string };
  type HearthOp = { op: string };
  type PendingProposal = { episodeContext: EpisodeContext; ops: HearthOp[] };
  type RuntimeApi = ReturnType<typeof useChatWorkspaceRuntime<PendingProposal, EpisodeContext, HearthOp>>;
  type RuntimeArgs = Parameters<typeof useChatWorkspaceRuntime<PendingProposal, EpisodeContext, HearthOp>>[0];

  const response = deferred<Awaited<ReturnType<RuntimeArgs["requestHearthChatReply"]>>>();
  let currentContext: EpisodeContext = {
    workspaceId: WORKSPACE_A,
    workpieceId: WORKPIECE_A,
    draftId: WORKPIECE_A,
  };
  let messages: HearthChatMessage[] = [];
  let pendingProposal: PendingProposal | null = null;
  let runtimeApi: RuntimeApi | null = null;
  let root: Root | null = null;
  const domHarness = installDom();
  const operationAuthority = createHearthOperationAuthority({
    workspaceId: currentContext.workspaceId,
    workpieceId: currentContext.workpieceId,
    draftId: currentContext.draftId,
    draftVersion: 1,
    revisionId: null,
  }, {
    createAuthorityId: () => "mounted-chat-authority",
  });

  const args: RuntimeArgs = {
    operationAuthority,
    isChatContextReady: true,
    isAiProcessing: false,
    aiTokenBalance: 100,
    chatDraft: "",
    setChatDraft: () => undefined,
    setChatMessages: (next) => {
      messages = typeof next === "function" ? next(messages) : next;
    },
    setChatError: () => undefined,
    setPendingAiProposal: (next) => {
      pendingProposal = next;
    },
    setAiRuntimeWarning: () => undefined,
    setIsAiProcessing: () => undefined,
    setAiBillingMode: () => undefined,
    setAiTokenBalance: () => undefined,
    chatMessagesRef: { current: [] },
    aiRequestControllerRef: { current: null },
    gateAwaitingAnswersRef: { current: false },
    pendingShortcutIntentRef: { current: null },
    chatHistoryMaxMessages: 200,
    getSelectedWritingFormat: () => "explore_expand",
    resolveChatRequestWritingFormat: ({ requestContent }) => ({
      requestContent,
      appliedFormat: "explore_expand",
      source: "default",
    }),
    rememberWritingFormat: () => undefined,
    buildActiveEpisodeContext: () => currentContext,
    detectChatIntentSignals: () => ({
      hasDeliverable: false,
      requestedOutline: false,
      requestedScript: false,
      explicitDraftNow: false,
      scriptMutationIntent: {
        destination: "chat",
        kind: null,
        targetsScriptBody: false,
      },
    }),
    detectAiAutosaveReasonCode: () => null,
    buildAssistantMessageContent: ({ assistantText }) => assistantText,
    countProducerQuestions: () => 0,
    readLatestOutlineFromOps: () => null,
    cloneHearthProposalOps: (ops) => ops.map((op) => ({ ...op })),
    createPendingAiProposal: ({ episodeContext, proposalOps }) => ({
      episodeContext,
      ops: proposalOps,
    }),
    createPendingFormatOnlyProposal: ({ episodeContext }) => ({
      ok: true,
      proposal: { episodeContext, ops: [{ op: "set_body" }] },
    }),
    resolveAiLaneFromStorage: () => "forge",
    requestHearthChatReply: () => response.promise,
    persistProductionArtifact: async () => undefined,
    refreshMyAiCredits: async () => ({
      ok: true,
      runtime: { billingMode: "forge", tokenBalance: 99 },
    }),
    recordInteractionEvent: () => undefined,
    publishForgeNotice: () => undefined,
  };

  function Harness() {
    runtimeApi = useChatWorkspaceRuntime(args);
    return null;
  }

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(domHarness.container);
      root.render(createElement(Harness));
    });
    assert.ok(runtimeApi);

    let request!: Promise<void>;
    act(() => {
      request = runtimeApi?.sendChatMessage({ requestContent: "Research this." }) ?? Promise.resolve();
    });

    currentContext = {
      workspaceId: WORKSPACE_A,
      workpieceId: WORKPIECE_B,
      draftId: WORKPIECE_B,
    };
    operationAuthority.updateScope({
      workspaceId: currentContext.workspaceId,
      workpieceId: currentContext.workpieceId,
      draftId: currentContext.draftId,
      draftVersion: 1,
      revisionId: null,
    });
    await act(async () => {
      response.resolve({
        ok: true,
        assistantText: "Late answer for A",
        ops: [],
        runtime: { billingMode: "forge" },
      });
      await request;
    });

    assert.equal(messages.some((message) => message.content === "Late answer for A"), false);
    assert.equal(pendingProposal, null);
  } finally {
    await act(async () => {
      root?.unmount();
    });
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    domHarness.restore();
  }
});

test("stabilization contract: A conversation flush uses A identity during A to B navigation", async () => {
  const domHarness = installDom();
  const saves: Array<{ draftId: string; workpieceId: string | null; messages: HearthChatMessage[] }> = [];
  let root: Root | null = null;
  const messageA: HearthChatMessage = { role: "user", content: "Topic A research" };
  const store = {
    getChatHistory: async () => [] as HearthChatMessage[],
    saveChatHistory: async (draftId: string, nextMessages: HearthChatMessage[], workpieceId?: string | null) => {
      saves.push({ draftId, workpieceId: workpieceId ?? null, messages: nextMessages });
    },
  };
  const ignore = () => undefined;
  const readCachedHistory = () => [] as HearthChatMessage[];
  const writeCachedHistory = () => undefined;
  const sanitizeMessages = (entries: ReadonlyArray<unknown>) => entries as HearthChatMessage[];

  function Harness(props: { workpieceId: string; draftId: string; historyKey: string }) {
    const [messages, setMessages] = useState<HearthChatMessage[]>([messageA]);
    const [, setHydratedKey] = useState<string | null>(null);
    const chatMessagesRef = useRef<HearthChatMessage[]>(messages);
    const latestChatHistoryKeyRef = useRef<string | null>(null);
    const latestChatDraftIdRef = useRef<string | null>(null);
    const latestChatWorkpieceIdRef = useRef<string | null>(null);
    const skipChatHydrationKeyRef = useRef<string | null>(WORKPIECE_A);
    const pendingChatHydrationKeyRef = useRef<string | null>(null);
    const chatHydrationSeqRef = useRef(0);
    const chatPersistTimerRef = useRef<number | null>(null);

    useChatWorkspaceHistory({
      store,
      activeDraftId: props.draftId,
      activeWorkpieceId: props.workpieceId,
      chatHistoryKey: props.historyKey,
      chatMessages: messages,
      setChatMessages: setMessages,
      setChatError: ignore,
      setPendingAiProposal: ignore,
      chatPersistTimerRef,
      chatMessagesRef,
      latestChatHistoryKeyRef,
      latestChatDraftIdRef,
      latestChatWorkpieceIdRef,
      skipChatHydrationKeyRef,
      pendingChatHydrationKeyRef,
      chatHydrationSeqRef,
      setHydratedChatHistoryKey: setHydratedKey,
      readChatHistoryFromCache: readCachedHistory,
      writeChatHistoryCache: writeCachedHistory,
      sanitizeChatMessagesForStorage: sanitizeMessages,
      chatHistoryWriteDebounceMs: 60_000,
    });
    return null;
  }

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(domHarness.container);
      root.render(createElement(Harness, {
        workpieceId: WORKPIECE_A,
        draftId: WORKPIECE_A,
        historyKey: WORKPIECE_A,
      }));
    });
    await act(async () => {
      root?.render(createElement(Harness, {
        workpieceId: WORKPIECE_B,
        draftId: WORKPIECE_B,
        historyKey: WORKPIECE_B,
      }));
    });

    assert.equal(saves.some((save) => save.draftId === WORKPIECE_A && save.workpieceId === WORKPIECE_A && save.messages[0]?.content === messageA.content), true);
    assert.equal(saves.some((save) => save.workpieceId === WORKPIECE_B && save.messages[0]?.content === messageA.content), false);
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    domHarness.restore();
  }
});

test("stabilization contract: stale A chat hydration cannot replace B conversation", async () => {
  const domHarness = installDom();
  const aHydration = deferred<HearthChatMessage[]>();
  const messageB: HearthChatMessage = { role: "assistant", content: "Topic B conversation" };
  let visibleMessages: HearthChatMessage[] = [];
  let root: Root | null = null;
  const store = {
    getChatHistory: async (draftId: string) => draftId === WORKPIECE_A ? aHydration.promise : [messageB],
    saveChatHistory: async () => undefined,
  };
  const ignore = () => undefined;
  const readCachedHistory = () => [] as HearthChatMessage[];
  const writeCachedHistory = () => undefined;
  const sanitizeMessages = (entries: ReadonlyArray<unknown>) => entries as HearthChatMessage[];

  function Harness(props: { workpieceId: string; draftId: string | null; historyKey: string | null }) {
    const [messages, setMessages] = useState<HearthChatMessage[]>([]);
    const [, setHydratedKey] = useState<string | null>(null);
    visibleMessages = messages;
    useChatWorkspaceHistory({
      store,
      activeDraftId: props.draftId,
      activeWorkpieceId: props.workpieceId,
      chatHistoryKey: props.historyKey,
      chatMessages: messages,
      setChatMessages: setMessages,
      setChatError: ignore,
      setPendingAiProposal: ignore,
      chatPersistTimerRef: useRef<number | null>(null),
      chatMessagesRef: useRef<HearthChatMessage[]>(messages),
      latestChatHistoryKeyRef: useRef<string | null>(null),
      latestChatDraftIdRef: useRef<string | null>(null),
      latestChatWorkpieceIdRef: useRef<string | null>(null),
      skipChatHydrationKeyRef: useRef<string | null>(null),
      pendingChatHydrationKeyRef: useRef<string | null>(null),
      chatHydrationSeqRef: useRef(0),
      setHydratedChatHistoryKey: setHydratedKey,
      readChatHistoryFromCache: readCachedHistory,
      writeChatHistoryCache: writeCachedHistory,
      sanitizeChatMessagesForStorage: sanitizeMessages,
      chatHistoryWriteDebounceMs: 60_000,
    });
    return null;
  }

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(domHarness.container);
      root.render(createElement(Harness, { workpieceId: WORKPIECE_A, draftId: WORKPIECE_A, historyKey: WORKPIECE_A }));
    });
    await act(async () => {
      root?.render(createElement(Harness, { workpieceId: WORKPIECE_B, draftId: null, historyKey: null }));
    });
    await act(async () => {
      root?.render(createElement(Harness, { workpieceId: WORKPIECE_B, draftId: WORKPIECE_B, historyKey: WORKPIECE_B }));
    });
    assert.deepEqual(visibleMessages, [messageB]);

    await act(async () => {
      aHydration.resolve([{ role: "assistant", content: "Late Topic A conversation" }]);
      await aHydration.promise;
    });
    assert.deepEqual(visibleMessages, [messageB]);
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    domHarness.restore();
  }
});

test("stabilization contract: an unacknowledged browser-cache write cannot resolve as saved", async () => {
  const windowHarness = installWindow();
  try {
    const store = new TongsHearthStore();
    const draft = createDraft({ title: "Unacknowledged", body: "Local recovery evidence only" });
    const result = await store.saveDraft({ ...draft, id: WORKPIECE_A });
    assert.equal(result.ok, false);
    assert.equal(result.kind, "recovery_only");
    assert.equal(result.authority, "browser_cache");
    assert.match(windowHarness.storage.getItem("hearth:tongs:cache:v1") ?? "", new RegExp(WORKPIECE_A));
  } finally {
    windowHarness.restore();
  }
});

test("stabilization contract: absent canonical approval remains unapproved", () => {
  assert.deepEqual(
    resolveCanonicalScriptApproval([], WORKPIECE_A),
    NO_CANONICAL_SCRIPT_APPROVAL,
  );
});

test("stabilization contract: workpiece source recovery evidence cannot cross identities", () => {
  const windowHarness = installWindow();
  try {
    writeWorkpieceSourcesCache(WORKSPACE_A, WORKPIECE_A, [{ source_id: "source-for-a" }]);
    assert.deepEqual(readWorkpieceSources(WORKSPACE_A, WORKPIECE_A), [{ source_id: "source-for-a" }]);
    assert.deepEqual(readWorkpieceSources(WORKSPACE_A, WORKPIECE_B), []);
    assert.deepEqual(readWorkpieceSources(WORKSPACE_B, WORKPIECE_A), []);
    windowHarness.storage.setItem("hearth:script:sources:v1", JSON.stringify([{ source_id: "legacy-global" }]));
    windowHarness.setSearch(`?workspace_id=${WORKSPACE_A}&workpiece_id=${WORKPIECE_B}`);
    assert.deepEqual(readWorkpieceSources(WORKSPACE_A, WORKPIECE_B), []);
    assert.deepEqual(readLegacyWorkpieceSourcesRecoveryEvidence(), [{ source_id: "legacy-global" }]);
  } finally {
    windowHarness.restore();
  }
});
