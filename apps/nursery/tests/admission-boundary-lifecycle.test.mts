import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "../../hammer/node_modules/jsdom/lib/api.js";
import React, { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AdmissionBoundaryView } from "../src/components/AdmissionBoundaryView";
import type { AdmissionBoundaryRuntime } from "../src/components/AdmissionBoundaryRuntime";

test("routine admission revalidation preserves Hammer and genuine revocation fails closed", async () => {
  const dom = new JSDOM("<!doctype html><div id='app'></div>", { url: "https://forge.test/app/hammer" });
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const priorReact = (globalThis as typeof globalThis & { React?: typeof React }).React;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, React, IS_REACT_ACT_ENVIRONMENT: true });
  const intervalCallbacks: Array<() => void> = [];
  dom.window.setInterval = ((callback: TimerHandler) => {
    intervalCallbacks.push(callback as () => void);
    return 1;
  }) as typeof dom.window.setInterval;
  dom.window.clearInterval = (() => undefined) as typeof dom.window.clearInterval;
  let admission: "admitted" | "revoked" = "admitted";
  let mounts = 0;
  let artifactRequests = 0;
  const session = { access_token: "fixture" } as never;
  const runtime: AdmissionBoundaryRuntime = {
    enforcementEnabled: true,
    async getSession() { return { data: { session }, error: null }; },
    onAuthStateChange() { return () => undefined; },
    async readAdmission() {
      return { data: admission === "admitted"
        ? { admitted: true, effective_state: "admitted" }
        : { admitted: false, effective_state: "revoked" }, error: null };
    },
    reload() { throw new Error("reload must not run"); },
    signOut() { throw new Error("sign out must not run"); },
  };
  function HammerFixture() {
    const [state] = useState("preserved-editor-state");
    useEffect(() => { mounts += 1; artifactRequests += 3; }, []);
    return React.createElement("div", { "data-testid": "hammer" }, state);
  }
  const root = createRoot(dom.window.document.getElementById("app")!);
  try {
    await act(async () => {
      root.render(React.createElement(MemoryRouter, { initialEntries: ["/app/hammer"] },
        React.createElement(AdmissionBoundaryView, { runtime, exempt: false }, React.createElement(HammerFixture))));
      await Promise.resolve();
    });
    assert.match(dom.window.document.body.textContent ?? "", /preserved-editor-state/);
    assert.equal(mounts, 1);
    assert.equal(artifactRequests, 3);

    await act(async () => {
      for (let index = 0; index < 3; index += 1) intervalCallbacks[0]?.();
      dom.window.dispatchEvent(new dom.window.Event("focus"));
      Object.defineProperty(dom.window.document, "visibilityState", { configurable: true, value: "visible" });
      dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
      await Promise.resolve();
    });
    assert.equal(mounts, 1);
    assert.equal(artifactRequests, 3);
    assert.match(dom.window.document.body.textContent ?? "", /preserved-editor-state/);

    admission = "revoked";
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.Event("focus"));
      await Promise.resolve();
    });
    assert.match(dom.window.document.body.textContent ?? "", /Account access is revoked/);
    assert.equal(dom.window.document.querySelector("[data-testid=hammer]"), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, { window: priorWindow, document: priorDocument, React: priorReact });
  }
});
