import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { register } from "node:module";
import { act, cloneElement, createElement, type ComponentProps, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useHearthSourcesController } from "../src/routes/hearth-shell/useHearthSourcesController";
import HearthSourcesPresentation, { createHearthSourcesPresentation, HEARTH_SOURCES_PRESENTATION_LOADER } from "../src/routes/hearth-shell/HearthSourcesPresentation";
import { createHearthOperationAuthority } from "../src/lib/hearth-operation-authority";
import type { HearthSourcesController } from "../src/routes/hearth-shell/hearth-sources-contracts";
import type { HearthResearchResult } from "../src/lib/hearth-research-contract";

// Node/JSDOM renders the real presentation; CSS remains Vite's responsibility.
register(`data:text/javascript,${encodeURIComponent('export async function load(url, context, next) { if (url.endsWith(".css")) return { format: "module", source: "export default {}", shortCircuit: true }; return next(url, context); }')}`, import.meta.url);

const WS = "11111111-1111-4111-8111-111111111111";
const WP = "22222222-2222-4222-8222-222222222222";
const HASH = "a".repeat(64);
const json = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200 });
const research = { sources: [], synthesis: "Retained research", query: "Fixture", mode: "knowledge_first", runtimeStatus: "complete" } as unknown as HearthResearchResult;
const artifact = { id: WP, revision: 1, artifact_content_hash: HASH, artifact_json: { result: research } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function fixture(t: TestContext, presentation?: typeof HearthSourcesPresentation) {
  const dom = new JSDOM('<div id="root"></div>', { url: `http://localhost/?workspace_id=${WS}&workpiece_id=${WP}&tongs_api_token=fixture` });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
  const old = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input), method = init?.method ?? "GET";
    calls.push({ url, method });
    assert.equal(method, "GET", "tab loading must not perform canonical writes");
    if (url.includes("/hearth-research")) return json({ disposition: "current", artifact });
    if (url.includes("/read-file")) return json({ schema: "forge.script.sources.v1", updated_at: "2026-09-14T00:00:00Z", refs: [{ source_id: "source-a", notes: "Existing notes" }] });
    if (url.includes("/sources")) return json({ sources: [] });
    throw new Error(`Unexpected fixture request: ${url}`);
  };
  const authority = createHearthOperationAuthority({ workspaceId: WS, workpieceId: WP, draftId: WP, draftVersion: 1, revisionId: null });
  const begun: string[] = [];
  const originalBegin = authority.begin;
  const scopedAuthority = { ...authority, begin: (...args: Parameters<typeof originalBegin>) => { begun.push(args[0]); return originalBegin(...args); } };
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  let controller!: HearthSourcesController;
  function Harness({ visible }: { visible: boolean }) {
    controller = useHearthSourcesController({ workspaceId: WS, workpieceId: WP, draftId: WP, draftText: "Existing script", mode: "summary", operationAuthority: scopedAuthority });
    if (!visible) return createElement("h1", null, "Hearth remains usable");
    const section = controller.surface.render() as ReactElement<{ children: ReactElement<ComponentProps<typeof HearthSourcesPresentation>> }>;
    // A fresh lazy instance permits deterministic rejection, without changing the controller or its props.
    return presentation ? cloneElement(section, {}, createElement(presentation, section.props.children.props)) : section;
  }
  const render = async (visible: boolean) => { await act(async () => { root.render(createElement(Harness, { visible })); }); };
  const settle = async () => {
    for (let i = 0; i < 40 && controller.state.provenance.canonicalPersistence === "loading"; i++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    assert.equal(controller.state.provenance.canonicalPersistence, "saved");
  };
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  });
  return { container, render, settle, calls, begun, controller: () => controller };
}

test("real Sources presentation stays lazy; resolution and tab switches preserve the mounted controller", async t => {
  const pending = deferred<Awaited<ReturnType<typeof HEARTH_SOURCES_PRESENTATION_LOADER.load>>>();
  const realLoad = HEARTH_SOURCES_PRESENTATION_LOADER.load;
  let loads = 0;
  HEARTH_SOURCES_PRESENTATION_LOADER.load = () => { loads++; return pending.promise; };
  t.after(() => { HEARTH_SOURCES_PRESENTATION_LOADER.load = realLoad; });
  const f = await fixture(t);
  await f.render(false);
  await f.settle();
  assert.equal(loads, 0, "ordinary Hearth work does not request SourcesView");
  const prior = f.controller().state;
  const requests = [...f.calls];
  const authorityOperations = [...f.begun];
  assert.deepEqual(prior.sources.workpiece, [{ source_id: "source-a", notes: "Existing notes" }]);
  assert.equal(prior.provenance.canonicalContentHash, HASH);
  await f.render(true);
  assert.equal(loads, 1);
  assert.match(f.container.querySelector('[role="status"]')?.textContent ?? "", /Loading Sources/);
  assert.equal(f.controller().state.provenance.researchResult, prior.provenance.researchResult);
  await act(async () => { pending.resolve(await realLoad()); });
  assert.equal(f.container.querySelector('[aria-busy="true"]'), null);
  assert.match(f.container.textContent ?? "", /Recover Sources from chat/);
  assert.match(f.container.textContent ?? "", /Canonical Episode evidence saved/);
  assert.equal(f.controller().state.sources.workpiece, prior.sources.workpiece);
  assert.equal(f.controller().state.provenance.researchResult, prior.provenance.researchResult);
  await f.render(false);
  await f.render(true);
  assert.equal(loads, 1, "React retains the resolved presentation module");
  assert.deepEqual(f.calls, requests, "tab changes must not duplicate hydration or persistence");
  assert.deepEqual(f.begun, authorityOperations, "tab changes must not recreate source authority");
  assert.equal(f.controller().state.provenance.canonicalContentHash, HASH);
});

test("a rejected Sources import is localized and cannot reset controller data, authority, or persistence", async t => {
  const pending = deferred<Awaited<ReturnType<typeof HEARTH_SOURCES_PRESENTATION_LOADER.load>>>();
  let loads = 0;
  const FailedPresentation = createHearthSourcesPresentation(() => { loads++; return pending.promise; });
  const f = await fixture(t, FailedPresentation);
  const previousError = console.error;
  console.error = () => undefined;
  t.after(() => { console.error = previousError; });
  await f.render(false);
  await f.settle();
  const before = f.controller().state;
  const requests = [...f.calls], begun = [...f.begun];
  await f.render(true);
  assert.match(f.container.textContent ?? "", /Loading Sources/);
  await act(async () => { pending.reject(new Error("Simulated presentation import failure")); });
  assert.match(f.container.querySelector('[role="alert"]')?.textContent ?? "", /Sources presentation could not be loaded/);
  assert.deepEqual(f.controller().state, before);
  await f.render(false);
  assert.match(f.container.textContent ?? "", /Hearth remains usable/);
  await f.render(true);
  assert.equal(loads, 1, "no automatic retry or source regeneration");
  assert.deepEqual(f.controller().state, before);
  assert.deepEqual(f.calls, requests);
  assert.deepEqual(f.begun, begun);
});
