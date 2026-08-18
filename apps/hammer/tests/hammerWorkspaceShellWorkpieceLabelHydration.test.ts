import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  beginHammerWorkspaceWorkpieceLabelHydration,
  type HammerWorkpieceLabelLoader,
} from "../src/editor/useHammerWorkspaceShellHydration";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("label hydration preserves loader identity, reset, normalization, missing, and failure behavior", async () => {
  const calls: Array<[string, string]> = [];
  const values: Array<string | null> = ["prior"];
  const pending = deferred<string | null>();
  const loadLabel: HammerWorkpieceLabelLoader = (workspaceId, workpieceId) => {
    calls.push([workspaceId, workpieceId]);
    return pending.promise;
  };
  beginHammerWorkspaceWorkpieceLabelHydration({
    workspaceId: "workspace-a", workpieceId: "workpiece-a",
    setCanonicalWorkpieceLabel: (value) => { values.push(value as string | null); }, loadLabel,
  });
  assert.deepEqual(calls, [["workspace-a", "workpiece-a"]]);
  assert.deepEqual(values, ["prior", null]);
  pending.resolve("  Florida Oranges  ");
  await settle();
  assert.deepEqual(values, ["prior", null, "Florida Oranges"]);

  for (const outcome of [null, "   "] as const) {
    const missingValues: Array<string | null> = ["prior"];
    beginHammerWorkspaceWorkpieceLabelHydration({
      workspaceId: "workspace-a", workpieceId: "workpiece-a",
      setCanonicalWorkpieceLabel: (value) => { missingValues.push(value as string | null); },
      loadLabel: async () => outcome,
    });
    await settle();
    assert.deepEqual(missingValues, ["prior", null, null]);
  }

  const failedValues: Array<string | null> = ["prior"];
  beginHammerWorkspaceWorkpieceLabelHydration({
    workspaceId: "workspace-a", workpieceId: "workpiece-a",
    setCanonicalWorkpieceLabel: (value) => { failedValues.push(value as string | null); },
    loadLabel: async () => { throw new Error("unavailable"); },
  });
  await settle();
  assert.deepEqual(failedValues, ["prior", null, null]);

  const malformedValues: Array<string | null> = ["prior"];
  beginHammerWorkspaceWorkpieceLabelHydration({
    workspaceId: "workspace-a", workpieceId: "workpiece-a",
    setCanonicalWorkpieceLabel: (value) => { malformedValues.push(value as string | null); },
    loadLabel: async () => 42 as never,
  });
  await settle();
  assert.deepEqual(malformedValues, ["prior", null, null]);
});

test("cleanup rejects stale, unmounted, rapid identity, and Strict Mode results", async () => {
  const values: Array<string | null> = [];
  const requests = new Map<string, ReturnType<typeof deferred<string | null>>>();
  const loadLabel: HammerWorkpieceLabelLoader = (_workspaceId, workpieceId) => {
    const request = deferred<string | null>();
    requests.set(workpieceId, request);
    return request.promise;
  };
  const setCanonicalWorkpieceLabel = (value: unknown) => { values.push(value as string | null); };

  const cancelA1 = beginHammerWorkspaceWorkpieceLabelHydration({
    workspaceId: "workspace", workpieceId: "a-1", setCanonicalWorkpieceLabel, loadLabel,
  });
  cancelA1();
  const cancelB = beginHammerWorkspaceWorkpieceLabelHydration({
    workspaceId: "workspace", workpieceId: "b", setCanonicalWorkpieceLabel, loadLabel,
  });
  cancelB();
  const cancelA2 = beginHammerWorkspaceWorkpieceLabelHydration({
    workspaceId: "workspace", workpieceId: "a-2", setCanonicalWorkpieceLabel, loadLabel,
  });
  requests.get("a-1")?.resolve("stale A");
  requests.get("b")?.resolve("stale B");
  requests.get("a-2")?.resolve("current A");
  await settle();
  assert.deepEqual(values, [null, null, null, "current A"]);
  cancelA2();

  const strictFirst = beginHammerWorkspaceWorkpieceLabelHydration({
    workspaceId: "workspace", workpieceId: "strict-1", setCanonicalWorkpieceLabel, loadLabel,
  });
  strictFirst();
  const strictSecond = beginHammerWorkspaceWorkpieceLabelHydration({
    workspaceId: "workspace", workpieceId: "strict-2", setCanonicalWorkpieceLabel, loadLabel,
  });
  strictSecond();
  requests.get("strict-1")?.resolve("obsolete");
  requests.get("strict-2")?.resolve("unmounted");
  await settle();
  assert.deepEqual(values.slice(-2), [null, null]);
});

test("shell preserves the label effect slot and hydration authority owns no writes", () => {
  const shell = readFileSync(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf8");
  const owner = readFileSync(new URL("../src/editor/useHammerWorkspaceShellHydration.ts", import.meta.url), "utf8");
  const labelSlot = shell.indexOf("useHammerWorkspaceShellWorkpieceLabelHydration({");
  assert.ok(shell.indexOf("clearInvalidHammerOutputSelection({") < labelSlot);
  assert.ok(labelSlot < shell.indexOf("reconcileSpeakerSoloOptions(speakerOptions)"));
  assert.doesNotMatch(shell, /loadHammerWorkspaceWorkpieceLabel/);
  assert.match(owner, /loadLabel = loadHammerWorkspaceWorkpieceLabel/);
  assert.match(owner, /loadLabel\(workspaceId, workpieceId\)/);
  assert.doesNotMatch(owner, /\b(?:saveHammer|upload|onWorkspaceSnapshotChange|writeFile)\s*\(/);
  assert.doesNotMatch(shell, /setCanonicalWorkpieceLabel/);
  assert.ok((shell.match(/canonicalWorkpieceLabel/g) ?? []).length >= 3, "resolved label must still feed identity, snapshot, and release projections");
});
