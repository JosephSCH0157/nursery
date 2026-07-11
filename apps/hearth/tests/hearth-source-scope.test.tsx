import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useSourcesState, type SourcesState } from "../src/hooks/useSourcesState";
import { createHearthOperationAuthority } from "../src/lib/hearth-operation-authority";
import {
  readLegacyWorkpieceSourcesRecoveryEvidence,
  readSourceIndex,
  readWorkpieceSources,
  resolveWorkpieceSourcesCacheKey,
  writeSourceIndexCache,
  writeWorkpieceSourcesCache,
} from "../src/lib/source-registry";

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "44444444-4444-4444-8444-444444444444";
const WORKPIECE_A = "22222222-2222-4222-8222-222222222222";
const WORKPIECE_B = "33333333-3333-4333-8333-333333333333";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function installDom(): { container: HTMLElement; restore: () => void } {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: `http://localhost/?workspace_id=${WORKSPACE_A}&workpiece_id=${WORKPIECE_A}&tongs_api_token=test-token`,
  });
  const runtime = globalThis as unknown as Record<string, unknown>;
  const properties = ["window", "document", "navigator", "Node", "HTMLElement", "Event", "StorageEvent", "localStorage"] as const;
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
    StorageEvent: dom.window.StorageEvent,
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
        if (descriptor) Object.defineProperty(globalThis, property, descriptor);
        else Reflect.deleteProperty(runtime, property);
      }
    },
  };
}

function sourceReadResponse(sourceId: string): Response {
  return new Response(JSON.stringify({
    ok: true,
    data: {
      schema: "forge.script.sources.v1",
      updated_at: "2026-07-11T22:00:00.000Z",
      refs: [{ source_id: sourceId }],
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("source scope: recovery caches are isolated by workspace and workpiece", () => {
  const dom = installDom();
  try {
    writeWorkpieceSourcesCache(WORKSPACE_A, WORKPIECE_A, [{ source_id: "source-a" }]);
    writeWorkpieceSourcesCache(WORKSPACE_A, WORKPIECE_B, [{ source_id: "source-b" }]);
    writeWorkpieceSourcesCache(WORKSPACE_B, WORKPIECE_A, [{ source_id: "source-other-workspace" }]);
    writeSourceIndexCache(WORKSPACE_A, [{ source_id: "index-a", title: "A" }]);
    writeSourceIndexCache(WORKSPACE_B, [{ source_id: "index-b", title: "B" }]);
    window.localStorage.setItem("hearth:script:sources:v1", JSON.stringify([{ source_id: "legacy" }]));

    assert.notEqual(
      resolveWorkpieceSourcesCacheKey(WORKSPACE_A, WORKPIECE_A),
      resolveWorkpieceSourcesCacheKey(WORKSPACE_A, WORKPIECE_B),
    );
    assert.deepEqual(readWorkpieceSources(WORKSPACE_A, WORKPIECE_A), [{ source_id: "source-a" }]);
    assert.deepEqual(readWorkpieceSources(WORKSPACE_A, WORKPIECE_B), [{ source_id: "source-b" }]);
    assert.deepEqual(readWorkpieceSources(WORKSPACE_B, WORKPIECE_A), [{ source_id: "source-other-workspace" }]);
    assert.deepEqual(readSourceIndex(WORKSPACE_A).map((entry) => entry.source_id), ["index-a"]);
    assert.deepEqual(readSourceIndex(WORKSPACE_B).map((entry) => entry.source_id), ["index-b"]);
    assert.deepEqual(readLegacyWorkpieceSourcesRecoveryEvidence(), [{ source_id: "legacy" }]);
  } finally {
    dom.restore();
  }
});

test("source scope: late A hydration cannot overwrite B and B mutations post only to B", async () => {
  const dom = installDom();
  writeWorkpieceSourcesCache(WORKSPACE_A, WORKPIECE_A, [{ source_id: "source-a-cache" }]);
  const previousFetch = globalThis.fetch;
  const responseA = deferred<Response>();
  const posts: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST") {
      posts.push(url);
      return Promise.resolve(new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }
    if (url.includes(`/tongs/workpieces/${WORKPIECE_A}/read-file`)) return responseA.promise;
    if (url.includes(`/tongs/workpieces/${WORKPIECE_B}/read-file`)) {
      return Promise.resolve(sourceReadResponse("source-b"));
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true, exists: false }), { status: 404 }));
  }) as typeof fetch;

  const authority = createHearthOperationAuthority({
    workspaceId: WORKSPACE_A,
    workpieceId: WORKPIECE_A,
    draftId: WORKPIECE_A,
    draftVersion: 1,
    revisionId: null,
  }, { createAuthorityId: () => "source-scope-authority" });
  let api: SourcesState | null = null;
  let root: Root | null = null;
  const renderedSourcesByWorkpiece: Array<{ workpieceId: string; sourceIds: string[] }> = [];
  const Harness = (props: { workspaceId: string; workpieceId: string }) => {
    api = useSourcesState(props.workspaceId, props.workpieceId, "", {
      mode: "summary",
      operationAuthority: authority,
    });
    renderedSourcesByWorkpiece.push({
      workpieceId: props.workpieceId,
      sourceIds: api.workpieceSources.map((source) => source.source_id),
    });
    return null;
  };

  try {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(dom.container);
    await act(async () => {
      root?.render(createElement(Harness, { workspaceId: WORKSPACE_A, workpieceId: WORKPIECE_A }));
      await Promise.resolve();
    });

    authority.updateScope({
      workspaceId: WORKSPACE_A,
      workpieceId: WORKPIECE_B,
      draftId: WORKPIECE_B,
      draftVersion: 1,
      revisionId: null,
    });
    await act(async () => {
      root?.render(createElement(Harness, { workspaceId: WORKSPACE_A, workpieceId: WORKPIECE_B }));
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(
      renderedSourcesByWorkpiece
        .filter((entry) => entry.workpieceId === WORKPIECE_B)
        .some((entry) => entry.sourceIds.includes("source-a-cache")),
      false,
    );
    assert.deepEqual((api as SourcesState | null)?.workpieceSources, [{ source_id: "source-b" }]);

    await act(async () => {
      responseA.resolve(sourceReadResponse("source-a-late"));
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.deepEqual((api as SourcesState | null)?.workpieceSources, [{ source_id: "source-b" }]);

    await act(async () => {
      api?.attachSourceToWorkpiece("source-b-new");
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(posts.some((url) => url.includes(`/tongs/workpieces/${WORKPIECE_A}/commit-file`)), false);
    assert.equal(posts.some((url) => url.includes(`/tongs/workpieces/${WORKPIECE_B}/commit-file`)), true);
  } finally {
    await act(async () => { root?.unmount(); });
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    globalThis.fetch = previousFetch;
    dom.restore();
  }
});
