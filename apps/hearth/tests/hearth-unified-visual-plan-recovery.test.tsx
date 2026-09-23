import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useUnifiedVisualPlanRecovery } from "../src/hooks/visuals/useUnifiedVisualPlanRecovery";

test("submission_unknown projects the durable retry guard without recovery execution", async () => {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

  let resumeCalls = 0;
  let retryBlocked = false;
  const operationStates: Array<string | null> = [];
  const messages: string[] = [];
  const setBusy = () => undefined;
  const setSaveState = () => undefined;
  const setMessage = (message: string) => messages.push(message);
  const setError = () => undefined;
  const setOperationState = (state: string | null) => operationStates.push(state);
  const refresh = async () => undefined;
  const dependencies = {
    readLatest: async () => ({ ok: true as const, data: { operation_id: "forge:test:submission-unknown", state: "submission_unknown" } as never }),
    resume: async () => {
      resumeCalls += 1;
      return { ok: true as const, data: {} as never };
    },
  };

  function Harness() {
    retryBlocked = useUnifiedVisualPlanRecovery({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      workpieceId: "33333333-3333-4333-8333-333333333333",
      hasApprovedScript: true,
      setBusy,
      setSaveState,
      setMessage,
      setError,
      setOperationState,
      refresh,
      dependencies,
    }).retryBlocked;
    return null;
  }

  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => { root.render(createElement(Harness)); });
    assert.equal(retryBlocked, true);
    assert.equal(resumeCalls, 0);
    assert.deepEqual(operationStates, ["submission_unknown"]);
    assert.deepEqual(messages, ["Visual Plan submission outcome is unknown. Forge will not submit this request again."]);
  } finally {
    await act(async () => { root.unmount(); });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: previousNavigator });
    dom.window.close();
  }
});

test("durable Visual Plan failure is resumed at most once across repeated renders", async () => {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

  let resumeCalls = 0;
  const errors: string[] = [];
  const states: string[] = [];
  const dependencies = {
    readLatest: async () => ({ ok: true as const, data: { operation_id: "forge:test:failed-resume", state: "broll_plan_committed" } as never }),
    resume: async () => {
      resumeCalls += 1;
      return { ok: false as const, status: 502, code: "unified_reference_retention_failed", error: "ordinal check failed", stage: "reference_clip_retention" };
    },
  };

  function Harness({ renderNumber }: { renderNumber: number }) {
    useUnifiedVisualPlanRecovery({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      workpieceId: "22222222-2222-4222-8222-222222222222",
      hasApprovedScript: true,
      setBusy: () => undefined,
      setSaveState: (state) => states.push(`${renderNumber}:${state}`),
      setMessage: () => undefined,
      setError: (error) => errors.push(error),
      refresh: async () => undefined,
      dependencies,
    });
    return null;
  }

  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => { root.render(createElement(StrictMode, null, createElement(Harness, { renderNumber: 1 }))); });
    await act(async () => { root.render(createElement(Harness, { renderNumber: 2 })); });
    await act(async () => { root.render(createElement(Harness, { renderNumber: 3 })); });
    assert.equal(resumeCalls, 1);
    assert.deepEqual(errors, ["reference_clip_retention: ordinal check failed"]);
    assert.ok(states.includes("1:error"));
  } finally {
    await act(async () => { root.unmount(); });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: previousNavigator });
    dom.window.close();
  }
});
