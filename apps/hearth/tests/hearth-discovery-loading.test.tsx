import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useHearthInitialLoader } from "../src/hooks/useHearthInitialLoader";
import { useHearthFocusOpenActions } from "../src/hooks/useHearthFocusOpenActions";
import { useHearthDraftHydrationActions } from "../src/hooks/useHearthDraftHydrationActions";
import { useHearthScriptPersistenceWorkspace, useHearthScriptRevisionLoader } from "../src/routes/hearth-shell/useHearthScriptController";
import { hearthLoadCancelled, type HearthLoadGuard } from "../src/lib/hearth-discovery-retry";
import { parseHearthWorkpiecesPayload } from "../src/lib/hearth-workpieces";
import type { Draft } from "../src/domain/draft";
import { TongsHearthStore } from "../src/storage/tongs-store";

const WS = "f7f581e2-94d0-4c7d-bd0c-b650f6f9d8b1";
const WS2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WP = "9287963f-e82a-4d9a-b810-db100e9d0021";
const WP2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const normalizeUuid = (value: string | null | undefined) => value && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : null;
const draft: Draft = { id: WP, title: "Canonical fixture", body: "Existing usable script", createdAt: 1, updatedAt: 1 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const collection = (workspace = WS, id = WP) => ({ ok: true, data: { episodes: [{ id, workspace_id: workspace, label: "Fixture" }] } });
const summaries = parseHearthWorkpiecesPayload(WS, collection());
const ref = <T,>(value: T) => ({ current: value });
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mount(t: TestContext, render: () => void, strict = false) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/" });
  const values = { window: dom.window, localStorage: dom.window.localStorage, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const old = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  Object.assign(dom.window, { __forgeTongsApiToken: "isolated-fixture" });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected external request in isolated fixture"); };
  const root = createRoot(dom.window.document.getElementById("root")!);
  let unmounted = false;
  function Harness() { render(); return null; }
  const rerender = async () => { await act(async () => { root.render(strict ? createElement(StrictMode, null, createElement(Harness)) : createElement(Harness)); }); };
  const unmount = async () => { if (!unmounted) { unmounted = true; await act(async () => { root.unmount(); }); } };
  t.after(async () => {
    await unmount(); globalThis.fetch = oldFetch;
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  });
  return { rerender, unmount };
}

function loaderFixture() {
  const events: Array<[string, unknown]> = [];
  const setter = (name: string) => (value: unknown) => { events.push([name, value]); };
  const opens: string[] = [];
  const args: Parameters<typeof useHearthInitialLoader>[0] = {
    initialLoadKey: "fixture", requestedWorkpieceId: WP, incomingBarStockIntakeRoute: false,
    workspaceId: WS, routeProjectId: null, routeSparkId: null, normalizeUuid,
    resolveWorkspaceId: () => null, resolveWorkpieceIdForDraftId: () => WP,
    openWorkpieceInFocus: async (id, options) => { options?.loadGuard?.assertCurrent(); opens.push(id); return draft; },
    sessionStore: { getSession: async () => ({ activeWorkpieceId: WP, activeDraftId: WP }) } as Parameters<typeof useHearthInitialLoader>[0]["sessionStore"],
    store: { listDrafts: async () => [draft] }, dedupeDraftListById: (list) => list,
    workpieceIdRef: ref<string | null>(WP), activeDraftRef: ref<Draft | null>(null), intakeResetKeyRef: ref<string | null>(null),
    restoredCursorDraftIdRef: ref<string | null>(null), draftsRef: ref<Draft[]>([]), workpieceSummariesRef: ref(summaries),
    setIsLoading: setter("loading"), setError: setter("error"), setSession: setter("session"),
    setWorkpieceSummaries: setter("summaries"), setDrafts: setter("drafts"), setWorkpiecesError: setter("discoveryError"),
    setRevisionView: setter("revisionView"), setFocusTab: setter("focusTab"), setWorkpieceId: setter("workpiece"),
    setActiveDraft: setter("activeDraft"), clearDraftSnapshot: () => setter("clearSnapshot")(null),
    setRevisions: setter("revisions"), setSelectedRevision: setter("selectedRevision"),
  };
  return { args, events, opens };
}

function hydrationFixture() {
  const events: string[] = [];
  const args: Parameters<typeof useHearthDraftHydrationActions>[0] = {
    hearthUser: { userId: null, displayName: "Fixture" }, sparks: [],
    store: { listWorkpieceDrafts: async () => [draft], saveDraft: async () => {
      events.push("save");
      return { ok: true, kind: "canonical", authority: "tongs", artifact: "draft_snapshot", workspaceId: WS, workpieceId: WP, committedAt: "2026-09-13T00:00:00Z" };
    } },
    draftsRef: ref<Draft[]>([]), workpieceSummariesRef: ref(summaries), setDrafts: () => { events.push("drafts"); },
    setAiRuntimeWarning: () => { events.push("warning"); }, refreshDrafts: async (guard) => { guard?.assertCurrent(); events.push("refresh"); return [draft]; },
    normalizeUuid, dedupeDraftListById: (list) => list,
    selectDraftForWorkpiece: ({ workpieceId, drafts }) => drafts.find((entry) => entry.id === workpieceId) ?? null,
    parseDraftConflictError: () => null, buildDraftAttribution: () => ({ userId: null, displayName: "Fixture" }),
    parseIsoTimestamp: (value) => value ? Date.parse(value) : undefined,
    readTrimmedString: (value) => typeof value === "string" ? value.trim() || null : null,
    isLegacyDraftScriptPlaceholder: (value) => value === "## Draft Script", safeScriptStarter: "## Draft Script",
  };
  return { args, events };
}

function focusFixture(hydrate: Parameters<typeof useHearthFocusOpenActions>[0]["hydrateOrCreateDraftBufferForWorkpiece"]) {
  const events: string[] = [];
  const args: Parameters<typeof useHearthFocusOpenActions>[0] = {
    normalizeUuid, workspaceId: WS, isMobile: true, draftsRef: ref([draft]), workpieceSummariesRef: ref(summaries),
    pendingFocusOpenCountRef: ref(0), pendingDraftEditorPanelRef: ref(null),
    setWorkspaceId: () => { events.push("workspace"); }, setActiveWorkpieceTab: () => {},
    setWorkpieceId: () => { events.push("workpiece"); }, setFocusTab: () => {}, setMode: () => {},
    setMobileOverlayView: () => { events.push("overlay"); }, clearActiveDraftSelection: () => { events.push("clear"); },
    writeWorkpieceWorkspaceTab: () => {}, replaceHearthRouteContext: () => {},
    refreshWorkpieces: async () => { throw new Error("Unexpected unbounded rediscovery"); },
    selectDraft: async (_draft, options) => { options?.loadGuard?.assertCurrent(); events.push("select"); },
    persistSession: async () => { events.push("persistSession"); }, hydrateOrCreateDraftBufferForWorkpiece: hydrate,
  };
  return { args, events };
}

test("actual loader -> focus -> hydration: transient retry hydrates once; self-adoption and rerender do not repeat it", async (t) => {
  const initial = loaderFixture(); initial.args.requestedWorkpieceId = null;
  const hydration = hydrationFixture();
  let reads = 0;
  hydration.args.store.listWorkpieceDrafts = async () => { reads++; return [draft]; };
  const focus = focusFixture(async () => null);
  // Force the hydration read rather than relying on the cached draft buffer.
  initial.args.store.listDrafts = async () => [];
  let calls = 0;
  const view = await mount(t, () => {
    const hydrated = useHearthDraftHydrationActions(hydration.args);
    const opened = useHearthFocusOpenActions({ ...focus.args, ...hydrated });
    useHearthInitialLoader({ ...initial.args, openWorkpieceInFocus: opened.openWorkpieceInFocus });
  });
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.method, "GET"); calls++;
    return calls === 1 ? json({ ok: false }, 503) : json(collection());
  };
  await view.rerender();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  assert.equal(calls, 2); assert.equal(reads, 1);
  assert.equal(focus.events.filter((event) => event === "select").length, 1);
  assert.equal(hydration.events.includes("save"), false);
  initial.args.requestedWorkpieceId = WP;
  await view.rerender(); await view.rerender();
  assert.equal(calls, 2); assert.equal(reads, 1);
  assert.deepEqual(initial.events.filter(([key]) => key === "loading").map(([, value]) => value), [true, false]);
});

test("three failures end loading, never trust cached identity, and rerender cannot restart exhaustion", async (t) => {
  const fixture = loaderFixture(); let calls = 0;
  const view = await mount(t, () => useHearthInitialLoader(fixture.args));
  globalThis.fetch = async () => { calls++; return json({ ok: false }, 503); };
  await view.rerender();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 280)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
  assert.equal(calls, 3); assert.deepEqual(fixture.opens, []);
  assert.ok(fixture.events.some(([key, value]) => key === "error" && typeof value === "string"));
  assert.deepEqual(fixture.events.at(-1), ["loading", false]);
  await view.rerender(); assert.equal(calls, 3);
});

test("failed discovery settles even when a cached preference read never resolves", async (t) => {
  const fixture = loaderFixture(); let cacheReads = 0;
  fixture.args.store.listDrafts = () => { cacheReads++; return new Promise(() => {}); };
  const view = await mount(t, () => useHearthInitialLoader(fixture.args));
  globalThis.fetch = async () => json({ ok: false }, 403);
  await view.rerender(); assert.deepEqual(fixture.opens, []);
  assert.deepEqual(fixture.events.at(-1), ["loading", false]);
  assert.equal(cacheReads, 0, "no cached-identity hydration on discovery failure");
});

test("canonical discovery cannot bypass a rejected project relationship", async (t) => {
  const fixture = loaderFixture(); fixture.args.routeProjectId = WP2;
  const view = await mount(t, () => useHearthInitialLoader(fixture.args));
  let reads = 0;
  Object.assign(window, { __forge_supabase_client__: { rpc: async (name: string) => {
    assert.equal(name, "validate_hearth_project_episode"); reads++; return { data: { valid: false }, error: null };
  } } });
  globalThis.fetch = async () => json(collection()); await view.rerender();
  assert.equal(reads, 1); assert.deepEqual(fixture.opens, []);
  assert.ok(fixture.events.some(([key, value]) => key === "error" && String(value).includes("does not belong")));
  assert.deepEqual(fixture.events.at(-1), ["loading", false]);
});

test("new canonical draft buffer persists exactly once after discovery; no Episode creation endpoint is used", async (t) => {
  const initial = loaderFixture(); initial.args.store.listDrafts = async () => [];
  const hydration = hydrationFixture(); hydration.args.store.listWorkpieceDrafts = async () => [];
  const focus = focusFixture(async () => null); const urls: string[] = [];
  const view = await mount(t, () => {
    const hydrated = useHearthDraftHydrationActions(hydration.args);
    const opened = useHearthFocusOpenActions({ ...focus.args, ...hydrated });
    useHearthInitialLoader({ ...initial.args, openWorkpieceInFocus: opened.openWorkpieceInFocus });
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.method, "GET"); urls.push(String(url));
    if (String(url).includes("/episodes")) return json(collection());
    assert.ok(String(url).includes(`/workpieces/${WP}/read-file`));
    return json({ ok: true, data: "Canonical script" });
  };
  await view.rerender(); await view.rerender();
  assert.equal(urls.length, 2);
  assert.equal(hydration.events.filter((event) => event === "save").length, 1);
  assert.equal(hydration.events.filter((event) => event === "refresh").length, 1);
  assert.equal(focus.events.filter((event) => event === "select").length, 1);
});

test("empty canonical collection ignores cached workpiece hints without creating a replacement", async (t) => {
  const fixture = loaderFixture(); fixture.args.requestedWorkpieceId = null;
  const view = await mount(t, () => useHearthInitialLoader(fixture.args));
  globalThis.fetch = async (_url, init) => { assert.equal(init?.method, "GET"); return json({ ok: true, data: { episodes: [] } }); };
  await view.rerender(); assert.deepEqual(fixture.opens, []);
  assert.ok(fixture.events.some(([key, value]) => key === "workpiece" && value === null));
  assert.equal(fixture.events.some(([key, value]) => key === "error" && value !== null), false);
});

for (const changed of ["workspace", "workpiece", "project", "generation"] as const) {
  test(`${changed} supersession prevents old discovery completion from any state mutation`, async (t) => {
    const fixture = loaderFixture(); const delayed = deferred<Response>(); let calls = 0; let oldSignal!: AbortSignal;
    const view = await mount(t, () => useHearthInitialLoader(fixture.args));
    globalThis.fetch = async (_url, init) => { calls++; if (calls === 1) { oldSignal = init!.signal!; return delayed.promise; } return json({ ok: false }, 403); };
    await view.rerender();
    if (changed === "workspace") fixture.args.workspaceId = WS2;
    if (changed === "workpiece") fixture.args.requestedWorkpieceId = WP2;
    if (changed === "project") fixture.args.routeProjectId = WP2;
    if (changed === "generation") fixture.args.initialLoadKey = "next";
    await view.rerender(); assert.equal(oldSignal.aborted, true);
    const before = [...fixture.events];
    await act(async () => { delayed.resolve(json(collection())); await flush(); });
    assert.deepEqual(fixture.events, before); assert.deepEqual(fixture.opens, []);
  });
}

test("unmount aborts discovery and ignores its late completion", async (t) => {
  const fixture = loaderFixture(); const delayed = deferred<Response>(); let signal!: AbortSignal;
  const view = await mount(t, () => useHearthInitialLoader(fixture.args));
  globalThis.fetch = async (_url, init) => { signal = init!.signal!; return delayed.promise; };
  await view.rerender(); await view.unmount(); const before = [...fixture.events];
  delayed.resolve(json(collection())); await flush();
  assert.equal(signal.aborted, true); assert.deepEqual(fixture.events, before); assert.deepEqual(fixture.opens, []);
});

test("StrictMode cleanup/restart performs only one successful hydration handoff", async (t) => {
  const fixture = loaderFixture(); let calls = 0;
  const view = await mount(t, () => useHearthInitialLoader(fixture.args), true);
  globalThis.fetch = async () => { calls++; return json(collection()); };
  await view.rerender(); assert.equal(calls, 1); assert.deepEqual(fixture.opens, [WP]);
});

test("workspace changes while draft hydration awaits cannot mutate draft state or persist", async (t) => {
  const fixture = loaderFixture(); fixture.args.store.listDrafts = async () => [];
  const hydration = hydrationFixture(); const pending = deferred<Draft[]>();
  hydration.args.store.listWorkpieceDrafts = () => pending.promise;
  const focus = focusFixture(async () => null);
  const view = await mount(t, () => {
    const hydrated = useHearthDraftHydrationActions(hydration.args);
    const opened = useHearthFocusOpenActions({ ...focus.args, workspaceId: fixture.args.workspaceId, ...hydrated });
    useHearthInitialLoader({ ...fixture.args, openWorkpieceInFocus: opened.openWorkpieceInFocus });
  });
  globalThis.fetch = async () => json(collection()); await view.rerender();
  fixture.args.workspaceId = WS2; globalThis.fetch = async () => json({ ok: false }, 403); await view.rerender();
  const before = [...fixture.events]; const focusBefore = [...focus.events];
  await act(async () => { pending.resolve([draft]); await flush(); });
  assert.deepEqual(hydration.events, []); assert.deepEqual(fixture.events, before); assert.deepEqual(focus.events, focusBefore);
  assert.equal(focus.args.pendingFocusOpenCountRef.current, 0);
});

test("cancellation after a dispatched save preserves that save but blocks refresh, focus and duplicate persistence", async (t) => {
  const hydration = hydrationFixture(); hydration.args.store.listWorkpieceDrafts = async () => [];
  const pending = deferred<Awaited<ReturnType<typeof hydration.args.store.saveDraft>>>(); let saves = 0;
  hydration.args.store.saveDraft = () => { saves++; return pending.promise; };
  let api!: ReturnType<typeof useHearthDraftHydrationActions>;
  const view = await mount(t, () => { api = useHearthDraftHydrationActions(hydration.args); });
  globalThis.fetch = async (_url, init) => { assert.equal(init?.method, "GET"); return json({ ok: true, data: "Canonical script" }); };
  await view.rerender(); let current = true;
  const guard: HearthLoadGuard = { assertCurrent: () => { if (!current) throw hearthLoadCancelled(); } };
  const result = api.hydrateOrCreateDraftBufferForWorkpiece(WP, { loadGuard: guard }).catch((error) => error);
  await flush(); assert.equal(saves, 1); current = false;
  pending.resolve({ ok: true, kind: "canonical", authority: "tongs", artifact: "draft_snapshot", workspaceId: WS, workpieceId: WP, committedAt: "2026-09-13T00:00:00Z" });
  assert.equal((await result).name, "AbortError"); assert.equal(saves, 1); assert.deepEqual(hydration.events, []);
});

test("late canonical script read cannot start a draft write after cancellation", async (t) => {
  const hydration = hydrationFixture(); hydration.args.store.listWorkpieceDrafts = async () => [];
  const pending = deferred<Response>(); let api!: ReturnType<typeof useHearthDraftHydrationActions>;
  const view = await mount(t, () => { api = useHearthDraftHydrationActions(hydration.args); });
  globalThis.fetch = () => pending.promise; await view.rerender(); let current = true;
  const result = api.hydrateOrCreateDraftBufferForWorkpiece(WP, { loadGuard: { assertCurrent: () => { if (!current) throw hearthLoadCancelled(); } } }).catch((error) => error);
  await flush(); current = false; pending.resolve(json({ ok: true, data: "Canonical script" }));
  assert.equal((await result).name, "AbortError"); assert.deepEqual(hydration.events, []);
});

test("a newer focus request supersedes the initial guarded hydration without selecting its late draft", async (t) => {
  const pending = deferred<Draft | null>(); let hydrations = 0;
  const focus = focusFixture(async () => { hydrations++; return hydrations === 1 ? pending.promise : draft; });
  let api!: ReturnType<typeof useHearthFocusOpenActions>;
  const view = await mount(t, () => { api = useHearthFocusOpenActions(focus.args); }); await view.rerender();
  const old = api.openWorkpieceInFocus(WP, { loadGuard: { assertCurrent() {} }, workpieces: summaries }).catch((error) => error);
  await api.openWorkpieceInFocus(WP, { workpieces: summaries }); const before = [...focus.events];
  pending.resolve(draft); assert.equal((await old).name, "AbortError"); assert.deepEqual(focus.events, before);
  assert.equal(focus.events.filter((event) => event === "select").length, 1);
});

test("ordinary focus workpiece adoption does not start a duplicate initial hydration", async (t) => {
  const initial = loaderFixture(); const next = { ...draft, id: WP2 };
  const nextSummaries = parseHearthWorkpiecesPayload(WS, collection(WS, WP2));
  let hydrations = 0; let calls = 0;
  const focus = focusFixture(async (id) => { hydrations++; return id === WP ? draft : next; });
  let opened!: ReturnType<typeof useHearthFocusOpenActions>;
  const view = await mount(t, () => {
    opened = useHearthFocusOpenActions({ ...focus.args, initialLoadKey: initial.args.initialLoadKey });
    useHearthInitialLoader({ ...initial.args, openWorkpieceInFocus: opened.openWorkpieceInFocus, focusHandoffRef: opened.focusHandoffRef });
  });
  globalThis.fetch = async () => { calls++; return json(collection()); };
  await view.rerender(); assert.equal(hydrations, 1);
  await opened.openWorkpieceInFocus(WP2, { workpieces: nextSummaries });
  initial.args.requestedWorkpieceId = WP2;
  await view.rerender(); await view.rerender();
  assert.equal(hydrations, 2); assert.equal(calls, 1);
  assert.equal(opened.focusHandoffRef.current, null, "handoff is consumed, not reusable authority");
  assert.deepEqual(initial.events.at(-1), ["loading", false]);
});

test("revision read cannot update state after its load authority is lost", async (t) => {
  const pending = deferred<never[]>(); const events: string[] = []; let current = true;
  let api!: ReturnType<typeof useHearthScriptPersistenceWorkspace>;
  const view = await mount(t, () => { api = useHearthScriptPersistenceWorkspace({
    activeDraft: null, draftSnapshot: null, revisions: [], revisionWorkpieceId: WP, isBodyComposing: false,
    persistDraft: async () => { throw new Error("Unexpected persistence"); },
    store: { listRevisions: () => pending.promise } as unknown as Parameters<typeof useHearthScriptPersistenceWorkspace>[0]["store"],
    draftEditVersionRef: ref(0), setActiveDraft: () => {}, setRevisions: () => { events.push("revisions"); },
    setAiAutosaveWarning: () => {}, setAiAutosaveStatusAt: () => {}, setAiRuntimeWarning: () => {}, setError: () => {},
  }); });
  await view.rerender();
  const result = api.refreshRevisions(WP, WP, { assertCurrent: () => { if (!current) throw hearthLoadCancelled(); } }).catch((error) => error);
  current = false; pending.resolve([]);
  assert.equal((await result).name, "AbortError"); assert.deepEqual(events, []);
});

test("automatic revision loader suppresses stale results/errors and pauses during initial hydration", async (t) => {
  const pending = deferred<never[]>(); const events: string[] = []; let calls = 0;
  const args: Parameters<typeof useHearthScriptRevisionLoader>[0] = {
    activeDraftId: WP, revisionWorkpieceId: WP, loadScope: WS, enabled: true,
    onError: () => { events.push("error"); },
    refreshRevisions: async (_wp, _draft, guard) => {
      calls++; const result = await pending.promise; guard?.assertCurrent(); events.push("revisions"); return result;
    },
  };
  const view = await mount(t, () => useHearthScriptRevisionLoader(args));
  await view.rerender(); assert.equal(calls, 1);
  args.loadScope = WS2; args.enabled = false; await view.rerender();
  await act(async () => { pending.resolve([]); await flush(); });
  assert.equal(calls, 1); assert.deepEqual(events, []);
});

for (const lane of ["workspace", "workpiece"] as const) {
  test(`Tongs ${lane} draft read cannot overwrite cache or pointers after cancellation`, async (t) => {
    await mount(t, () => {});
    window.history.replaceState({}, "", `?workspace_id=${WS}`);
    localStorage.setItem(`forge_hearth_script_workpiece_v1:${WS}`, WP);
    const pending = deferred<Response>(); globalThis.fetch = () => pending.promise;
    let current = true;
    const guard = { assertCurrent: () => { if (!current) throw hearthLoadCancelled(); }, canonicalWorkpieceIds: new Set([WP]) };
    const store = new TongsHearthStore();
    const result = (lane === "workspace" ? store.listDrafts(guard) : store.listWorkpieceDrafts(WP, guard)).catch((error) => error);
    await flush(); current = false;
    // Represent newer-context cache writes that the old read must not overwrite.
    localStorage.setItem("hearth:tongs:cache:v1", "new-context-sentinel");
    localStorage.setItem("forge_hearth_script_workpiece_id_v1", WP2);
    const before = Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index)!; return [key, localStorage.getItem(key)];
    }));
    pending.resolve(json({ ok: true, data: { schemaVersion: 1, drafts: [draft] } }));
    assert.equal((await result).name, "AbortError");
    const after = Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index)!; return [key, localStorage.getItem(key)];
    }));
    assert.deepEqual(after, before);
  });
}

test("Tongs initial cached workpiece hint outside canonical discovery cannot trigger snapshot hydration", async (t) => {
  await mount(t, () => {});
  window.history.replaceState({}, "", `?workspace_id=${WS}`);
  localStorage.setItem(`forge_hearth_script_workpiece_v1:${WS}`, WP2);
  let requests = 0; globalThis.fetch = async () => { requests++; throw new Error("Unapproved identity read"); };
  await new TongsHearthStore().listDrafts({ assertCurrent() {}, canonicalWorkpieceIds: new Set([WP]) });
  assert.equal(requests, 0);
});
