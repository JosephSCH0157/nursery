import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, StrictMode, useCallback, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useHearthIntakeLifecycle } from "../src/hooks/useHearthIntakeLifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

test("project-only intake survives Strict Mode and never hydrates a linked episode", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

  const projectId = "95ac3ae5-dbd6-4ddc-882d-4097c5bd306b";
  const workspaceId = "494c2ae5-9037-4208-b898-fab4898ab430";
  const linkedWorkpieceId = "661a1d04-2ff1-46c0-b5f5-1e762d68f712";
  const lookup = deferred<{ projectExists: boolean; projectTitle: string; episodes: Array<{ workpieceId: string; label: string; status: string; createdAt: string; updatedAt: string }> }>();
  let lookupCount = 0;
  let creationCount = 0;
  let observed: { isForging: boolean; title: string | null; workpieceId: string | null; error: string | null } | null = null;
  const resolveWorkspaceId = () => workspaceId;
  const readPendingProjectWorkpieceId = () => null;
  const writePendingProjectWorkpieceId = () => undefined;
  const ignore = () => undefined;
  const openWorkpieceInFocus = async () => null;

  function Harness() {
    const projectIntakeHandledRef = useRef<string | null>(null);
    const sparkIntakeHandledRef = useRef<string | null>(null);
    const [isForging, setIsForging] = useState(false);
    const [title, setTitle] = useState<string | null>(null);
    const [workpieceId, setWorkpieceId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const createProjectWorkpiece = useCallback(async () => {
      creationCount += 1;
      return { ok: true, workpieceId: "unexpected" };
    }, []);
    const readProjectContext = useCallback(() => {
      lookupCount += 1;
      return lookup.promise;
    }, []);

    useHearthIntakeLifecycle({
      routeProjectId: projectId, routeSparkId: null, workspaceId,
      sparkDiscoveryWorkspaceId: workspaceId, isSparksLoading: false, sparkDiscoveryError: null,
      routeSpark: null, projectIntakeHandledRef, sparkIntakeHandledRef,
      resolveWorkspaceId, readPendingProjectWorkpieceId,
      writePendingProjectWorkpieceId, readProjectContext, createProjectWorkpiece,
      openWorkpieceInFocus, forgeSpark: ignore,
      setIsForging, setForgeError: setError, setRouteProjectTitle: setTitle,
      setWorkspaceId: ignore, setWorkpieceId, setSelectedSparkId: ignore,
      setMode: ignore,
    });
    observed = { isForging, title, workpieceId, error };
    return null;
  }

  let root: Root | null = null;
  try {
    await act(async () => {
      root = createRoot(dom.window.document.getElementById("root")!);
      root.render(createElement(StrictMode, null, createElement(Harness)));
    });
    assert.equal(observed?.isForging, true);
    assert.ok(lookupCount >= 2, "Strict Mode must restart the cancelled intake consumer");

    await act(async () => lookup.resolve({
      projectExists: true,
      projectTitle: "In the Forge",
      episodes: [{ workpieceId: linkedWorkpieceId, label: "Original", status: "draft", createdAt: "", updatedAt: "" }],
    }));

    assert.deepEqual(observed, {
      isForging: false,
      title: "In the Forge",
      workpieceId: null,
      error: null,
    });
    assert.equal(creationCount, 0, "project-only intake must never create or hydrate a workpiece");
  } finally {
    await act(async () => root?.unmount());
    dom.window.close();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});
