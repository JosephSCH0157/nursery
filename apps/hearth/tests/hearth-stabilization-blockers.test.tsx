import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createDraft } from "../src/domain/draft";
import type { HearthChatMessage } from "../src/lib/hearth-ai-runtime-contract";
import { readWorkpieceSources, writeWorkpieceSourcesCache } from "../src/lib/source-registry";
import { useChatWorkspaceRuntime } from "../src/hooks/useChatWorkspace";
import { TongsHearthStore } from "../src/storage/tongs-store";

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
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

test("stabilization blocker reproduction: a late AI result from workpiece A mutates workpiece B", {
  todo: "Step 2 will bind every asynchronous completion to immutable operation identity.",
}, async () => {
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

  const args: RuntimeArgs = {
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
    await act(async () => {
      response.resolve({
        ok: true,
        assistantText: "Late answer for A",
        ops: [],
        runtime: { billingMode: "forge" },
      });
      await request;
    });

    assert.equal(messages.some((message) => message.content === "Late answer for A"), true);
    assert.equal(pendingProposal, null);
  } finally {
    await act(async () => {
      root?.unmount();
    });
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    domHarness.restore();
  }
});

test("stabilization blocker reproduction: an unacknowledged browser-cache write resolves as saved", {
  todo: "Step 3 will require a Tongs acknowledgement envelope before save success.",
}, async () => {
  const windowHarness = installWindow();
  try {
    const store = new TongsHearthStore();
    const draft = createDraft({ title: "Unacknowledged", body: "Local recovery evidence only" });
    await store.saveDraft({ ...draft, id: WORKPIECE_A });
    assert.match(windowHarness.storage.getItem("hearth:tongs:cache:v1") ?? "", new RegExp(WORKPIECE_A));
  } finally {
    windowHarness.restore();
  }
});

test("stabilization blocker reproduction: local approval outranks absent canonical approval", {
  todo: "Step 4 will replace local-first approval selection with canonical approval authority.",
}, () => {
  const shellSource = readFileSync(new URL("../src/routes/HearthShell.tsx", import.meta.url), "utf8");
  assert.match(
    shellSource,
    /const resolved = shouldPreferRevisions \? fromRevisions : stored;/,
    "The reproduction depends on the shell promoting stored browser approval without canonical proof.",
  );
});

test("stabilization blocker reproduction: workpiece source recovery evidence leaks across workpieces", {
  todo: "Step 5 will scope source caches and source mutations by workspace and workpiece identity.",
}, () => {
  const windowHarness = installWindow();
  try {
    writeWorkpieceSourcesCache([{ source_id: "source-for-a" }]);
    windowHarness.setSearch(`?workspace_id=${WORKSPACE_A}&workpiece_id=${WORKPIECE_B}`);
    assert.deepEqual(readWorkpieceSources(), [{ source_id: "source-for-a" }]);
  } finally {
    windowHarness.restore();
  }
});
