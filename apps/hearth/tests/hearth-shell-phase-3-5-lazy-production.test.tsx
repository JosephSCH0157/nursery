import assert from "node:assert/strict";
import test from "node:test";
import {
  act,
  createElement,
  lazy,
  useState,
  type ComponentType,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import LazyProductionSurfaceBoundary from "../src/components/production/LazyProductionSurfaceBoundary";
import {
  loadHearthProductionSurface,
  type HearthProductionSurfaceId,
  type HearthProductionSurfaceLoaderRegistry,
} from "../src/views/surfaces/hearth-production-surface-loaders";

const SURFACES: HearthProductionSurfaceId[] = [
  "visual-plan",
  "thumbnails",
  "episode-images",
  "broll",
  "reference-clips",
  "metadata",
];

function createRegistry() {
  const calls = new Map<HearthProductionSurfaceId, number>();
  const registry = Object.fromEntries(SURFACES.map((surface) => [
    surface,
    async () => {
      calls.set(surface, (calls.get(surface) ?? 0) + 1);
      return { default: (() => null) as ComponentType };
    },
  ])) as HearthProductionSurfaceLoaderRegistry;
  return { calls, registry };
}

function installDom(): { container: HTMLElement; restore: () => void } {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>");
  const runtime = globalThis as unknown as Record<string, unknown>;
  const properties = ["window", "document", "navigator", "Node", "HTMLElement"] as const;
  const previous = new Map<string, PropertyDescriptor | undefined>(
    properties.map((property) => [property, Object.getOwnPropertyDescriptor(globalThis, property)]),
  );
  const values: Record<(typeof properties)[number], unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement,
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

test("production surface registry loads only the selected creator-facing boundary", async () => {
  for (const selected of SURFACES) {
    const { calls, registry } = createRegistry();
    await loadHearthProductionSurface(selected, registry);
    assert.deepEqual(
      SURFACES.filter((surface) => (calls.get(surface) ?? 0) > 0),
      [selected],
    );
  }
});

test("production surface loaders resolve the existing panel modules", async () => {
  for (const surface of SURFACES) {
    const loaded = await loadHearthProductionSurface(surface);
    assert.equal(typeof loaded.default, "function", `${surface} should expose its existing panel`);
  }
});

test("lazy boundary preserves component state and passes authority contracts unchanged", async () => {
  const dom = installDom();
  let root: Root | null = null;
  const authority = Object.freeze({ workspaceId: "workspace-a", workpieceId: "workpiece-a" });
  let receivedAuthority: typeof authority | null = null;

  function StatefulPanel(props: { authority: typeof authority }) {
    receivedAuthority = props.authority;
    const [count, setCount] = useState(0);
    return createElement(
      "button",
      { type: "button", onClick: () => setCount((value) => value + 1) },
      `Count ${count}`,
    );
  }
  const LazyPanel = lazy(async () => ({ default: StatefulPanel }));

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      root = createRoot(dom.container);
      root.render(createElement(
        LazyProductionSurfaceBoundary,
        { surfaceKey: "test" },
        createElement(LazyPanel, { authority }),
      ));
    });
    const button = dom.container.querySelector("button");
    assert.ok(button);
    await act(async () => button.dispatchEvent(new dom.container.ownerDocument.defaultView!.MouseEvent(
      "click",
      { bubbles: true },
    )));
    assert.equal(button.textContent, "Count 1");

    await act(async () => {
      root?.render(createElement(
        LazyProductionSurfaceBoundary,
        { surfaceKey: "test" },
        createElement(LazyPanel, { authority }),
      ));
    });
    assert.equal(dom.container.querySelector("button")?.textContent, "Count 1");
    assert.equal(receivedAuthority, authority);
  } finally {
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    dom.restore();
  }
});

test("lazy chunk failure is contained to the production surface", async () => {
  const dom = installDom();
  let root: Root | null = null;
  const previousConsoleError = console.error;
  const FailedPanel = lazy(async () => {
    throw new Error("simulated chunk failure");
  });

  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  console.error = () => undefined;
  try {
    await act(async () => {
      root = createRoot(dom.container);
      root.render(createElement(
        "main",
        null,
        createElement("h1", null, "Hearth remains mounted"),
        createElement(
          LazyProductionSurfaceBoundary,
          { surfaceKey: "failed-panel" },
          createElement(FailedPanel),
        ),
      ));
    });
    assert.match(dom.container.textContent ?? "", /Hearth remains mounted/);
    assert.match(dom.container.textContent ?? "", /This panel could not be loaded/);
    assert.equal(dom.container.querySelector("[role=\"alert\"]") !== null, true);
  } finally {
    console.error = previousConsoleError;
    await act(async () => root?.unmount());
    Reflect.deleteProperty(globalThis as Record<string, unknown>, "IS_REACT_ACT_ENVIRONMENT");
    dom.restore();
  }
});
