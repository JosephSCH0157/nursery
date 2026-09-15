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
import { LocalHearthStore } from "../src/storage/local-store";
import { useHearthWorkpieceCollectionLoader } from "../src/routes/hearth-shell/useHearthCollectionController";
import {
  resolveHearthChatComposerPlaceholder,
  resolveHearthChatPanelMeta,
  type HearthChatHydrationStatus,
} from "../src/lib/hearth-chat-readiness";

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
  const properties = ["window", "document", "navigator", "Node", "HTMLElement", "Event", "localStorage"] as const;
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
    localStorage: dom.window.localStorage,
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
    ownerChatCapability: { status: "available", reasonCode: null },
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
    setLastTurnResult: () => undefined,
    setAiBillingMode: () => undefined,
    setAiTokenBalance: () => undefined,
    chatMessagesRef: { current: [] },
    aiRequestControllerRef: { current: null },
    gateAwaitingAnswersRef: { current: false },
    pendingShortcutIntentRef: { current: null },
    pendingExplicitActionRef: { current: null },
    chatHistoryMaxMessages: 200,
    getSelectedWritingFormat: () => "explore_expand",
    resolveChatRequestWritingFormat: ({ requestContent }) => ({
      requestContent,
      appliedFormat: "explore_expand",
      source: "default",
    }),
    rememberWritingFormat: () => undefined,
    buildActiveEpisodeContext: () => currentContext,
    detectAiAutosaveReasonCode: () => null,
    countProducerQuestions: () => 0,
    cloneHearthProposalOps: (ops) => ops.map((op) => ({ ...op })),
    createPendingAiProposal: ({ episodeContext, proposalOps }) => ({
      episodeContext,
      ops: proposalOps,
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
      setChatHydrationStatus: ignore,
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
      setChatHydrationStatus: ignore,
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

test("hydration contract: observer callback churn cannot restart one canonical conversation read", async () => {
  const domHarness = installDom();
  const historyRead = deferred<HearthChatMessage[]>();
  const expectedMessages: HearthChatMessage[] = [
    { role: "assistant", content: "Canonical conversation" },
  ];
  let root: Root | null = null;
  let renderCount = 0;
  let historyReadCount = 0;
  let hydratedKey: string | null = null;
  let visibleMessages: HearthChatMessage[] = [];
  const stablePersistenceObserver = () => undefined;
  const recordHydratedKey = (value: string | null) => {
    hydratedKey = value;
  };
  const store = {
    getChatHistory: async () => {
      historyReadCount += 1;
      return historyRead.promise;
    },
    saveChatHistory: async () => undefined,
  };
  const ignore = () => undefined;
  const readCachedHistory = () => [] as HearthChatMessage[];
  const writeCachedHistory = () => undefined;
  const sanitizeMessages = (entries: ReadonlyArray<unknown>) => entries as HearthChatMessage[];

  function Harness() {
    renderCount += 1;
    const [messages, setMessages] = useState<HearthChatMessage[]>([]);
    visibleMessages = messages;
    useChatWorkspaceHistory({
      store,
      activeDraftId: WORKPIECE_A,
      activeWorkpieceId: WORKPIECE_A,
      chatHistoryKey: `${WORKPIECE_A}:${WORKPIECE_A}`,
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
      setHydratedChatHistoryKey: recordHydratedKey,
      setChatHydrationStatus: ignore,
      setLastTurnPersistence: renderCount <= 3
        ? () => undefined
        : stablePersistenceObserver,
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
      root.render(createElement(Harness));
    });
    await act(async () => {
      historyRead.resolve(expectedMessages);
      await historyRead.promise;
    });

    assert.equal(historyReadCount, 1, "one Episode identity must issue one canonical conversation read");
    assert.equal(hydratedKey, `${WORKPIECE_A}:${WORKPIECE_A}`);
    assert.deepEqual(visibleMessages, expectedMessages);
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    domHarness.restore();
  }
});

test("hydration contract: canonical draft arrival cannot strand the workspace collection loader", async () => {
  const domHarness = installDom();
  const response = deferred<Response>();
  const runtime = globalThis as unknown as { fetch?: typeof fetch };
  const previousFetch = runtime.fetch;
  let root: Root | null = null;
  let refreshWorkpieces: (() => Promise<unknown>) | null = null;
  let collectionLoading = false;
  let visibleWorkpieceIds: string[] = [];
  const authority = createHearthOperationAuthority({
    workspaceId: WORKSPACE_A,
    workpieceId: WORKPIECE_A,
    draftId: null,
    draftVersion: null,
    revisionId: null,
  });

  runtime.fetch = async () => response.promise;
  Object.assign(domHarness.container.ownerDocument.defaultView as Window & {
    __forgeTongsApiToken?: string;
  }, { __forgeTongsApiToken: "hydration-regression-token" });

  function Harness() {
    const [workpieces, setWorkpieces] = useState<Array<{ workpieceId: string }>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [, setError] = useState<string | null>(null);
    const summariesRef = useRef<any[]>([]);
    collectionLoading = isLoading;
    visibleWorkpieceIds = workpieces.map((entry) => entry.workpieceId);
    refreshWorkpieces = useHearthWorkpieceCollectionLoader({
      workspaceId: WORKSPACE_A,
      workpieceId: WORKPIECE_A,
      showArchived: false,
      operationAuthority: authority,
      workpieceSummariesRef: summariesRef,
      setWorkpieceSummaries: setWorkpieces as any,
      setIsWorkpiecesLoading: setIsLoading,
      setWorkpiecesError: setError,
    });
    return null;
  }

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(domHarness.container);
      root.render(createElement(Harness));
    });
    assert.ok(refreshWorkpieces);

    let request!: Promise<unknown>;
    await act(async () => {
      request = refreshWorkpieces?.() ?? Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(collectionLoading, true);

    authority.updateScope({
      workspaceId: WORKSPACE_A,
      workpieceId: WORKPIECE_A,
      draftId: "canonical-draft-a",
      draftVersion: 1,
      revisionId: null,
    });
    await act(async () => {
      response.resolve(new Response(JSON.stringify({
        ok: true,
        data: {
          episodes: [{
            id: WORKPIECE_A,
            workspace_id: WORKSPACE_A,
            label: "Route-selected Episode",
            created_at: "2026-09-08T20:00:00.000Z",
            updated_at: "2026-09-08T20:00:00.000Z",
          }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } }));
      await request;
    });

    assert.equal(collectionLoading, false, "same-Episode draft hydration must not strand collection loading");
    assert.deepEqual(visibleWorkpieceIds, [WORKPIECE_A]);
  } finally {
    await act(async () => root?.unmount());
    if (previousFetch === undefined) {
      Reflect.deleteProperty(runtime, "fetch");
    } else {
      runtime.fetch = previousFetch;
    }
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    domHarness.restore();
  }
});

test("hydration contract: a stale A collection response cannot overwrite route-selected B", async () => {
  const domHarness = installDom();
  const responseA = deferred<Response>();
  const responseB = deferred<Response>();
  const runtime = globalThis as unknown as { fetch?: typeof fetch };
  const previousFetch = runtime.fetch;
  let fetchCount = 0;
  let root: Root | null = null;
  let refreshWorkpieces: (() => Promise<unknown>) | null = null;
  let collectionLoading = false;
  let visibleWorkpieceIds: string[] = [];
  const authority = createHearthOperationAuthority({
    workspaceId: WORKSPACE_A,
    workpieceId: WORKPIECE_A,
    draftId: null,
    draftVersion: null,
    revisionId: null,
  });

  runtime.fetch = async () => {
    fetchCount += 1;
    return fetchCount === 1 ? responseA.promise : responseB.promise;
  };
  Object.assign(domHarness.container.ownerDocument.defaultView as Window & {
    __forgeTongsApiToken?: string;
  }, { __forgeTongsApiToken: "hydration-stale-response-token" });

  function Harness(props: { workpieceId: string }) {
    const [workpieces, setWorkpieces] = useState<Array<{ workpieceId: string }>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [, setError] = useState<string | null>(null);
    const summariesRef = useRef<any[]>([]);
    collectionLoading = isLoading;
    visibleWorkpieceIds = workpieces.map((entry) => entry.workpieceId);
    refreshWorkpieces = useHearthWorkpieceCollectionLoader({
      workspaceId: WORKSPACE_A,
      workpieceId: props.workpieceId,
      showArchived: false,
      operationAuthority: authority,
      workpieceSummariesRef: summariesRef,
      setWorkpieceSummaries: setWorkpieces as any,
      setIsWorkpiecesLoading: setIsLoading,
      setWorkpiecesError: setError,
    });
    return null;
  }

  const responseFor = (workpieceId: string, label: string) => new Response(JSON.stringify({
    ok: true,
    data: {
      episodes: [{
        id: workpieceId,
        workspace_id: WORKSPACE_A,
        label,
        created_at: "2026-09-08T20:00:00.000Z",
        updated_at: "2026-09-08T20:00:00.000Z",
      }],
    },
  }), { status: 200, headers: { "content-type": "application/json" } });

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(domHarness.container);
      root.render(createElement(Harness, { workpieceId: WORKPIECE_A }));
    });
    let requestA!: Promise<unknown>;
    await act(async () => {
      requestA = refreshWorkpieces?.() ?? Promise.resolve();
      await Promise.resolve();
    });

    authority.updateScope({
      workspaceId: WORKSPACE_A,
      workpieceId: WORKPIECE_B,
      draftId: null,
      draftVersion: null,
      revisionId: null,
    });
    await act(async () => {
      root?.render(createElement(Harness, { workpieceId: WORKPIECE_B }));
    });
    let requestB!: Promise<unknown>;
    await act(async () => {
      requestB = refreshWorkpieces?.() ?? Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      responseA.resolve(responseFor(WORKPIECE_A, "Stale Episode A"));
      await requestA;
    });
    assert.equal(collectionLoading, true, "stale A completion must not settle B's active request");
    assert.deepEqual(visibleWorkpieceIds, []);

    await act(async () => {
      responseB.resolve(responseFor(WORKPIECE_B, "Current Episode B"));
      await requestB;
    });
    assert.equal(collectionLoading, false);
    assert.deepEqual(visibleWorkpieceIds, [WORKPIECE_B]);
  } finally {
    await act(async () => root?.unmount());
    if (previousFetch === undefined) {
      Reflect.deleteProperty(runtime, "fetch");
    } else {
      runtime.fetch = previousFetch;
    }
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    domHarness.restore();
  }
});

test("hydration contract: pending and failed chat state cannot present as Ready or no Episode", () => {
  assert.equal(resolveHearthChatPanelMeta("loading", 0), "Loading");
  assert.equal(resolveHearthChatPanelMeta("error", 0), "Unavailable");
  assert.equal(resolveHearthChatPanelMeta("ready", 0), "Ready");
  assert.equal(
    resolveHearthChatComposerPlaceholder({ status: "loading", writingFormat: "explore_expand" }),
    "Loading this Episode's canonical conversation...",
  );
  assert.equal(
    resolveHearthChatComposerPlaceholder({ status: "error", writingFormat: "explore_expand" }),
    "Conversation unavailable. Retry before continuing.",
  );
  assert.equal(
    resolveHearthChatComposerPlaceholder({ status: "idle", writingFormat: "explore_expand" }),
    "Select an Episode or Spark to start.",
  );
});

test("hydration contract: a canonical conversation read failure preserves recovery text and can retry", async () => {
  const domHarness = installDom();
  const recoveryMessages: HearthChatMessage[] = [
    { role: "user", content: "Locally pending creator message" },
  ];
  let root: Root | null = null;
  let shouldFail = true;
  let saveCount = 0;
  let hydrationStatus: HearthChatHydrationStatus = "idle";
  let hydratedKey: string | null = null;
  let chatError: string | null = null;
  let visibleMessages: HearthChatMessage[] = [];
  let retryChatHydration: (() => void) | null = null;
  let flushChatHistoryNow: ((options?: {
    historyKey?: string | null;
    draftId?: string | null;
    workpieceId?: string | null;
    messages?: HearthChatMessage[];
  }) => void) | null = null;
  const recordHydrationStatus = (value: HearthChatHydrationStatus) => {
    hydrationStatus = value;
  };
  const recordHydratedKey = (value: string | null) => {
    hydratedKey = value;
  };
  const recordChatError = (value: string | null) => {
    chatError = value;
  };
  const ignore = () => undefined;
  const store = {
    getChatHistory: async () => {
      if (shouldFail) throw new Error("canonical_chat_read_failed:503");
      return [] as HearthChatMessage[];
    },
    saveChatHistory: async () => {
      saveCount += 1;
    },
  };
  const readRecoveryHistory = () => recoveryMessages;
  const sanitizeMessages = (entries: ReadonlyArray<unknown>) => entries as HearthChatMessage[];

  function Harness() {
    const [messages, setMessages] = useState<HearthChatMessage[]>([]);
    visibleMessages = messages;
    ({ retryChatHydration, flushChatHistoryNow } = useChatWorkspaceHistory({
      store,
      activeDraftId: WORKPIECE_A,
      activeWorkpieceId: WORKPIECE_A,
      chatHistoryKey: `${WORKPIECE_A}:${WORKPIECE_A}`,
      chatMessages: messages,
      setChatMessages: setMessages,
      setChatError: recordChatError,
      setPendingAiProposal: ignore,
      chatPersistTimerRef: useRef<number | null>(null),
      chatMessagesRef: useRef<HearthChatMessage[]>(messages),
      latestChatHistoryKeyRef: useRef<string | null>(null),
      latestChatDraftIdRef: useRef<string | null>(null),
      latestChatWorkpieceIdRef: useRef<string | null>(null),
      skipChatHydrationKeyRef: useRef<string | null>(null),
      pendingChatHydrationKeyRef: useRef<string | null>(null),
      chatHydrationSeqRef: useRef(0),
      setHydratedChatHistoryKey: recordHydratedKey,
      setChatHydrationStatus: recordHydrationStatus,
      readChatHistoryFromCache: readRecoveryHistory,
      writeChatHistoryCache: ignore,
      sanitizeChatMessagesForStorage: sanitizeMessages,
      chatHistoryWriteDebounceMs: 0,
    }));
    return null;
  }

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(domHarness.container);
      root.render(createElement(Harness));
      await Promise.resolve();
    });
    assert.equal(hydrationStatus, "error");
    assert.equal(hydratedKey, null);
    assert.match(chatError ?? "", /could not load this Episode's canonical conversation/i);
    assert.deepEqual(visibleMessages, recoveryMessages);
    assert.equal(saveCount, 0, "a failed canonical read must not trigger a canonical write");
    flushChatHistoryNow?.({
      historyKey: `${WORKPIECE_A}:${WORKPIECE_A}`,
      draftId: WORKPIECE_A,
      workpieceId: WORKPIECE_A,
      messages: recoveryMessages,
    });
    await Promise.resolve();
    assert.equal(saveCount, 0, "a failed canonical read must not flush a recovery snapshot over canonical history");

    shouldFail = false;
    assert.ok(retryChatHydration);
    await act(async () => {
      retryChatHydration?.();
      await Promise.resolve();
    });
    assert.equal(hydrationStatus, "ready");
    assert.equal(hydratedKey, `${WORKPIECE_A}:${WORKPIECE_A}`);
    assert.deepEqual(visibleMessages, recoveryMessages);
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    domHarness.restore();
  }
});

test("hydration contract: an empty canonical conversation is a completed ready state", async () => {
  const domHarness = installDom();
  let root: Root | null = null;
  let hydrationStatus: HearthChatHydrationStatus = "idle";
  let hydratedKey: string | null = null;
  let saveCount = 0;
  const ignore = () => undefined;
  const recordHydrationStatus = (value: HearthChatHydrationStatus) => {
    hydrationStatus = value;
  };
  const recordHydratedKey = (value: string | null) => {
    hydratedKey = value;
  };
  const emptyStore = {
    getChatHistory: async () => [] as HearthChatMessage[],
    saveChatHistory: async () => {
      saveCount += 1;
    },
  };
  const readEmptyHistory = () => [] as HearthChatMessage[];
  const sanitizeMessages = (entries: ReadonlyArray<unknown>) => entries as HearthChatMessage[];

  function Harness() {
    const [messages, setMessages] = useState<HearthChatMessage[]>([]);
    useChatWorkspaceHistory({
      store: emptyStore,
      activeDraftId: WORKPIECE_A,
      activeWorkpieceId: WORKPIECE_A,
      chatHistoryKey: `${WORKPIECE_A}:${WORKPIECE_A}`,
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
      setHydratedChatHistoryKey: recordHydratedKey,
      setChatHydrationStatus: recordHydrationStatus,
      readChatHistoryFromCache: readEmptyHistory,
      writeChatHistoryCache: ignore,
      sanitizeChatMessagesForStorage: sanitizeMessages,
      chatHistoryWriteDebounceMs: 0,
    });
    return null;
  }

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(domHarness.container);
      root.render(createElement(Harness));
      await Promise.resolve();
    });
    assert.equal(hydrationStatus, "ready");
    assert.equal(hydratedKey, `${WORKPIECE_A}:${WORKPIECE_A}`);
    assert.equal(saveCount, 0, "hydrating an empty conversation must not clear it as a new write");
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

for (const initial of [[], [{ role: "user", content: "Retained canonical text" }]] as HearthChatMessage[][]) {
  test(`persistence boundary: ${initial.length ? "nonempty" : "empty"} hydration stays read-only through idle, unload, and navigation`, async () => {
    const dom = installDom();
    const saves: unknown[] = [];
    const cacheWrites: unknown[] = [];
    let reads = 0;
    let setVisible: (messages: HearthChatMessage[]) => void = () => undefined;
    const store = { getChatHistory: async () => { reads++; return initial; }, saveChatHistory: async (...values: unknown[]) => { saves.push(values); } };
    const ignore = () => undefined;
    const readCache = () => [] as HearthChatMessage[];
    const writeCache = (...values: unknown[]) => { cacheWrites.push(values); };
    const sanitize = (entries: ReadonlyArray<unknown>) => entries as HearthChatMessage[];
    function Harness({ id }: { id: string }) {
      const [messages, setMessages] = useState<HearthChatMessage[]>([]);
      setVisible = setMessages;
      useChatWorkspaceHistory({ store, activeDraftId: id, activeWorkpieceId: id, chatHistoryKey: id, chatMessages: messages,
        setChatMessages: setMessages, setChatError: ignore, setPendingAiProposal: ignore,
        chatPersistTimerRef: useRef(null), chatMessagesRef: useRef(messages), latestChatDraftIdRef: useRef(null),
        latestChatWorkpieceIdRef: useRef(null), latestChatHistoryKeyRef: useRef(null), skipChatHydrationKeyRef: useRef(null),
        pendingChatHydrationKeyRef: useRef(null), chatHydrationSeqRef: useRef(0), setHydratedChatHistoryKey: ignore,
        setChatHydrationStatus: ignore, readChatHistoryFromCache: readCache, writeChatHistoryCache: writeCache,
        sanitizeChatMessagesForStorage: sanitize, chatHistoryWriteDebounceMs: 10 });
      return null;
    }
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(dom.container);
    try {
      await act(async () => root.render(createElement(Harness, { id: WORKPIECE_A })));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
      assert.equal(reads, 1);
      assert.equal(saves.length, 0, "idle hydration must not save");
      const writesAfterHydration = cacheWrites.length;
      await act(async () => window.dispatchEvent(new Event("beforeunload")));
      assert.equal(saves.length, 0, "beforeunload must not save unchanged hydrated content");
      await act(async () => window.dispatchEvent(new Event("pagehide")));
      assert.equal(saves.length, 0, "pagehide must not save unchanged hydrated content");
      assert.equal(cacheWrites.length, writesAfterHydration, "unload must not overwrite recovery material");
      if (initial.length > 0) {
        await act(async () => setVisible([]));
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
        await act(async () => window.dispatchEvent(new Event("beforeunload")));
        await act(async () => window.dispatchEvent(new Event("pagehide")));
        assert.equal(saves.length, 0, "a non-explicit empty state must not clear canonical data");
        assert.equal(cacheWrites.length, writesAfterHydration, "a non-explicit empty state preserves recovery cache");
      }
      await act(async () => root.render(createElement(Harness, { id: WORKPIECE_B })));
      assert.equal(reads, 2);
      assert.equal(saves.length, 0, "unchanged A must not flush during A to B");
    } finally { await act(async () => root.unmount()); dom.restore(); }
  });
}

test("persistence boundary: ordinary empty saves preserve Tongs and local recovery caches and make no requests", async () => {
  const harness = installWindow();
  const oldFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => { requests++; throw new Error("Unexpected request in empty-save regression"); }) as typeof fetch;
  const original = JSON.stringify({ schemaVersion: 1, drafts: {}, chats: { [WORKPIECE_A]: { draftId: WORKPIECE_A, updatedAt: 1, messages: [{ role: "user", content: "Recovery copy" }] } }, draftWorkspaceById: { [WORKPIECE_A]: WORKSPACE_A }, draftSnapshotUpdatedAtByWorkspace: {}, workpieceByWorkspace: { [WORKSPACE_A]: WORKPIECE_A } });
  harness.storage.setItem("hearth:tongs:cache:v1", original);
  harness.storage.setItem("hearth:chat-local:v1", original);
  try {
    await new TongsHearthStore().saveChatHistory(WORKPIECE_A, [], WORKPIECE_A);
    await new LocalHearthStore().saveChatHistory(WORKPIECE_A, [], WORKPIECE_A);
    assert.equal(harness.storage.getItem("hearth:tongs:cache:v1"), original);
    assert.equal(harness.storage.getItem("hearth:chat-local:v1"), original);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = oldFetch; harness.restore(); }
});

for (const outcome of ["cleared", "generation_conflict", "rejected", "invalid_ack"] as const) {
  test(`persistence boundary: explicit ${outcome} clear changes recovery only after canonical acknowledgement`, async () => {
    const dom = installDom();
    const runtime = globalThis as typeof globalThis & { __FORGE_RUNTIME_CONFIG__?: Record<string, unknown> };
    const oldConfig = runtime.__FORGE_RUNTIME_CONFIG__;
    const oldFetch = globalThis.fetch;
    runtime.__FORGE_RUNTIME_CONFIG__ = { supabaseUrl: "https://example.test", supabaseAnonKey: "anon" };
    const token = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;
    window.localStorage.setItem("forge-auth", token);
    const initial: HearthChatMessage[] = [{ role: "user", content: "Keep unless acknowledged" }];
    const cache = JSON.stringify({ schemaVersion: 1, drafts: { [WORKPIECE_A]: { ...createDraft({ title: "Generic recovery", body: "Script unchanged" }), id: WORKPIECE_A } }, chats: { [WORKPIECE_A]: { draftId: WORKPIECE_A, updatedAt: 1, messages: initial } }, draftWorkspaceById: { [WORKPIECE_A]: WORKSPACE_A }, draftSnapshotUpdatedAtByWorkspace: {}, workpieceByWorkspace: { [WORKSPACE_A]: WORKPIECE_A } });
    window.localStorage.setItem("hearth:tongs:cache:v1", cache);
    const ack = deferred<Response>();
    const clearBodies: unknown[] = [];
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      if (String(input).includes("read_my_hearth_conversation")) return new Response(JSON.stringify([{ generation: 5, completeness: "complete", sequence: 1, role: "user", content: initial[0].content }]));
      if (String(input).includes("clear_my_hearth_conversation")) { clearBodies.push(JSON.parse(String(init?.body))); return ack.promise; }
      return new Response(JSON.stringify({ ok: true, data: { ok: true } }));
    }) as typeof fetch;
    let root: Root | null = null;
    try {
      const store = new TongsHearthStore();
      assert.deepEqual(await store.getChatHistory(WORKPIECE_A, WORKPIECE_A), initial);
      let visible: HearthChatMessage[] = [];
      let clearNow: () => Promise<boolean> = async () => false;
      let chatError: string | null = null;
      const ignore = () => undefined;
      const readCache = () => [] as HearthChatMessage[];
      const writeCache = () => undefined;
      const sanitize = (entries: ReadonlyArray<unknown>) => entries as HearthChatMessage[];
      const recordError = (value: string | null) => { chatError = value; };
      const clearCache = (key: string) => { window.localStorage.removeItem(key); };
      window.localStorage.setItem("recovery-history", JSON.stringify(initial));
      function ClearHarness() {
        const [messages, setMessages] = useState<HearthChatMessage[]>([]);
        visible = messages;
        const controller = useChatWorkspaceHistory({ store, activeDraftId: WORKPIECE_A, activeWorkpieceId: WORKPIECE_A,
          chatHistoryKey: "recovery-history", chatMessages: messages, setChatMessages: setMessages, setChatError: recordError,
          setPendingAiProposal: ignore, chatPersistTimerRef: useRef(null), chatMessagesRef: useRef(messages),
          latestChatDraftIdRef: useRef(null), latestChatWorkpieceIdRef: useRef(null), latestChatHistoryKeyRef: useRef(null),
          skipChatHydrationKeyRef: useRef(null), pendingChatHydrationKeyRef: useRef(null), chatHydrationSeqRef: useRef(0),
          setHydratedChatHistoryKey: ignore, setChatHydrationStatus: ignore, readChatHistoryFromCache: readCache,
          writeChatHistoryCache: writeCache, clearChatHistoryCache: clearCache, sanitizeChatMessagesForStorage: sanitize,
          chatHistoryWriteDebounceMs: 10 });
        clearNow = (controller as unknown as { clearChatHistoryNow: () => Promise<boolean> }).clearChatHistoryNow;
        return null;
      }
      (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
      await act(async () => { root = createRoot(dom.container); root.render(createElement(ClearHarness)); });
      assert.deepEqual(visible, initial);
      const before = window.localStorage.getItem("hearth:tongs:cache:v1");
      const result = clearNow();
      assert.equal(window.localStorage.getItem("hearth:tongs:cache:v1"), before, "pending clear preserves cache");
      assert.deepEqual(visible, initial, "pending clear preserves visible messages");
      await act(async () => {
        ack.resolve(new Response(JSON.stringify(outcome === "invalid_ack" ? {} : { status: outcome, generation: outcome === "cleared" ? 6 : 7 }), { status: outcome === "rejected" ? 403 : 200 }));
        assert.equal(await result, outcome === "cleared");
      });
      assert.deepEqual(clearBodies, [{ p_workspace_id: WORKSPACE_A, p_workpiece_id: WORKPIECE_A, p_expected_generation: 5 }]);
      if (outcome === "cleared") {
        assert.equal(JSON.parse(window.localStorage.getItem("hearth:tongs:cache:v1")!).chats[WORKPIECE_A], undefined);
        assert.deepEqual(visible, []);
        assert.equal(window.localStorage.getItem("recovery-history"), null);
      } else {
        assert.equal(window.localStorage.getItem("hearth:tongs:cache:v1"), before);
        assert.deepEqual(visible, initial);
        assert.equal(window.localStorage.getItem("recovery-history"), JSON.stringify(initial));
        assert.match(chatError ?? "", /not cleared/);
      }
    } finally { await act(async () => root?.unmount()); globalThis.fetch = oldFetch; runtime.__FORGE_RUNTIME_CONFIG__ = oldConfig; dom.restore(); }
  });
}

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
