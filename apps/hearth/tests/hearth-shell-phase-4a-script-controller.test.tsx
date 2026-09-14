import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createHearthOperationAuthority } from "../src/lib/hearth-operation-authority";
import {
  useHearthCanonicalScriptApprovalLoader,
  useHearthScriptController,
  useHearthScriptCoreState,
  useHearthScriptRevisionLoader,
} from "../src/routes/hearth-shell/useHearthScriptController";
import type { HearthScriptController } from "../src/routes/hearth-shell/hearth-script-contracts";
import {
  NO_CANONICAL_SCRIPT_APPROVAL,
  type ScriptApprovalState,
} from "../src/lib/hearth-approval-authority";
import type { HearthCanonicalRevisionsResult } from "../src/storage/hearth-store";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>");
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const container = dom.window.document.getElementById("root");
  assert.ok(container);
  return {
    container,
    restore() {
      dom.window.close();
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test("script core state keeps missing draft distinct from loading and failure", async () => {
  const dom = installDom();
  let root: Root | null = null;
  let observed: ReturnType<typeof useHearthScriptCoreState> | null = null;
  function Harness() {
    observed = useHearthScriptCoreState("11111111-1111-4111-8111-111111111111");
    return null;
  }
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(dom.container);
      root.render(createElement(Harness));
    });
    assert.equal(observed?.state.activeDraft, null);
    assert.equal(observed?.state.isLoading, true);
    assert.equal(observed?.state.error, null);
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    dom.restore();
  }
});

test("canonical approval loader rejects a stale workpiece completion", async () => {
  const dom = installDom();
  let root: Root | null = null;
  const first = deferred<HearthCanonicalRevisionsResult>();
  const second = deferred<HearthCanonicalRevisionsResult>();
  const requests = [first, second];
  const recoveries: string[] = [];
  const authority = createHearthOperationAuthority({
    workspaceId: "workspace-a",
    workpieceId: "workpiece-a",
    draftId: "draft-a",
    draftVersion: null,
    revisionId: null,
  }, { createAuthorityId: () => "phase-4a-test" });
  let approval = NO_CANONICAL_SCRIPT_APPROVAL;

  function Harness(props: { workpieceId: string; draftId: string }) {
    const [state, setState] = useState<ScriptApprovalState>(NO_CANONICAL_SCRIPT_APPROVAL);
    approval = state;
    useHearthCanonicalScriptApprovalLoader({
      activeDraftId: props.draftId,
      workpieceId: props.workpieceId,
      revisions: [],
      operationAuthority: authority,
      store: {
        readCanonicalRevisions: async () => requests.shift()!.promise,
      },
      setScriptApprovalState: setState,
      writeRecoveryEvidence: (episodeId) => recoveries.push(episodeId),
    });
    return null;
  }

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(dom.container);
      root.render(createElement(Harness, { workpieceId: "workpiece-a", draftId: "draft-a" }));
    });
    authority.updateScope({
      workspaceId: "workspace-b",
      workpieceId: "workpiece-b",
      draftId: "draft-b",
      draftVersion: null,
      revisionId: null,
    });
    await act(async () => {
      root?.render(createElement(Harness, { workpieceId: "workpiece-b", draftId: "draft-b" }));
    });
    await act(async () => first.resolve({
      ok: true,
      kind: "canonical",
      authority: "tongs",
      workpieceId: "workpiece-a",
      fileUpdatedAt: null,
      revisions: [],
    }));
    assert.deepEqual(approval, NO_CANONICAL_SCRIPT_APPROVAL);
    assert.deepEqual(recoveries, []);
    await act(async () => second.resolve({
      ok: true,
      kind: "canonical",
      authority: "tongs",
      workpieceId: "workpiece-b",
      fileUpdatedAt: null,
      revisions: [],
    }));
    assert.deepEqual(recoveries, ["workpiece-b"]);
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    dom.restore();
  }
});

test("revision loader reads only when an active draft identity exists", async () => {
  const dom = installDom();
  let root: Root | null = null;
  const calls: Array<[string | null, string | null | undefined]> = [];
  const refreshRevisions = async (
    workpieceId: string | null,
    draftId?: string | null,
  ) => {
    calls.push([workpieceId, draftId]);
    return [];
  };
  function Harness(props: { draftId: string | null }) {
    useHearthScriptRevisionLoader({
      loadScope: "fixture-workspace",
      enabled: true,
      onError: (error) => { throw error; },
      activeDraftId: props.draftId,
      revisionWorkpieceId: "workpiece-a",
      refreshRevisions,
    });
    return null;
  }
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(dom.container);
      root.render(createElement(Harness, { draftId: null }));
    });
    assert.deepEqual(calls, []);
    await act(async () => {
      root?.render(createElement(Harness, { draftId: "draft-a" }));
    });
    assert.deepEqual(calls, [["workpiece-a", "draft-a"]]);
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    dom.restore();
  }
});

test("route controller exposes one typed script and history surface contract", () => {
  const controller = {
    state: {},
    commands: {},
    status: {},
    surfaces: {
      script: { draft: null, snapshot: null, isDirty: false, error: null },
      history: { revisions: [], selectedRevision: null, view: "list" as const },
    },
  } as unknown as HearthScriptController;
  assert.equal(useHearthScriptController(controller), controller);
});
