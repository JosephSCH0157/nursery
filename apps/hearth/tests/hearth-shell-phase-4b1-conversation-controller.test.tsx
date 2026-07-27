import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  useHearthConversationAttachmentState,
  useHearthConversationController,
  useHearthConversationRuntimeState,
} from "../src/routes/hearth-shell/useHearthConversationController";
import type { HearthConversationController } from "../src/routes/hearth-shell/hearth-conversation-contracts";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>");
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
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

test("attachment state keeps empty, loading, and failure distinct", async () => {
  const dom = installDom();
  let root: Root | null = null;
  let observed: ReturnType<typeof useHearthConversationAttachmentState> | null = null;
  function Harness() {
    observed = useHearthConversationAttachmentState();
    return null;
  }
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(dom.container);
      root.render(createElement(Harness));
    });
    assert.deepEqual(observed?.state.attachments, []);
    assert.equal(observed?.state.isLoading, false);
    assert.equal(observed?.state.error, null);
    await act(async () => observed?.bindings.setIsLoading(true));
    assert.equal(observed?.state.isLoading, true);
    assert.equal(observed?.state.error, null);
    await act(async () => {
      observed?.bindings.setIsLoading(false);
      observed?.bindings.setError("attachment_failed");
    });
    assert.equal(observed?.state.isLoading, false);
    assert.equal(observed?.state.error, "attachment_failed");
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    dom.restore();
  }
});

test("AI runtime state preserves the existing lane and optional balance", async () => {
  const dom = installDom();
  let root: Root | null = null;
  let observed: ReturnType<typeof useHearthConversationRuntimeState> | null = null;
  function Harness() {
    observed = useHearthConversationRuntimeState("byo");
    return null;
  }
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(dom.container);
      root.render(createElement(Harness));
    });
    assert.equal(observed?.state.billingMode, "byo");
    assert.equal(observed?.state.tokenBalance, null);
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    dom.restore();
  }
});

test("conversation controller keeps proposal state separate from its script application command", async () => {
  let applied = 0;
  const proposal = { ops: [] };
  const controller = {
    state: { proposal },
    commands: {
      applyProposal: async () => {
        applied += 1;
      },
    },
    surface: Object.freeze({ desktop: "same", mobile: "same" }),
  } as unknown as HearthConversationController;
  const resolved = useHearthConversationController(controller);
  assert.equal(resolved, controller);
  assert.equal(resolved.state.proposal, proposal);
  assert.equal(applied, 0);
  await resolved.commands.applyProposal();
  assert.equal(applied, 1);
});
