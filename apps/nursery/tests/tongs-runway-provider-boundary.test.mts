import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createTongsCommitService, type BrollVideoProvider } from "../../../packages/tongs/src/workpiece-commit-api";
import { isClientAbortError, resolveNurseryTongsProviderBoundary } from "../scripts/mw-tongs-commit-api";

test("Nursery constructs and injects one Runway provider while disabling the lazy fallback", () => {
  let constructionCount = 0;
  const injectedProvider: BrollVideoProvider = {
    async submit() { return { taskId: "mock-task-1", acceptedResponse: { id: "mock-task-1" } }; },
    async poll(taskId) { return { state: "pending", taskId, response: { id: taskId, status: "RUNNING" } }; },
    async download() { return new Uint8Array(); },
  };
const boundary = resolveNurseryTongsProviderBoundary({
    options: {
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "test-service-key",
      runwayApiKey: "test-runway-key",
    },
    missing: [],
    allowUnsafeNoToken: true,
  }, () => {
    constructionCount += 1;
    return injectedProvider;
  });

  assert.equal(constructionCount, 1);
  assert.equal(boundary.provider, injectedProvider);
  assert.equal(boundary.options.brollVideoProvider, injectedProvider);
  assert.equal(boundary.options.runwayApiKey, undefined);
  assert.deepEqual(boundary.diagnostic, {
    runwayConfigured: true,
    providerConstructed: true,
    providerInjected: true,
    lazyFallbackDisabled: true,
    acquisitionRuntimeInjected: true,
    lateAcquisitionImportDisabled: true,
  });

  const service = createTongsCommitService(boundary.options);
  assert.equal(service.brollVideoProvider, injectedProvider);
  assert.equal(service.brollAcquisitionRuntime, boundary.acquisitionRuntime);
});

test("B-roll acquisition dependencies are loaded statically before request handling", async () => {
  const source = await readFile(
    new URL("../../../packages/tongs/src/workpiece-commit-api.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /acquisitionModuleSpecifier/);
  assert.match(source, /this\.brollAcquisitionRuntime\.inspectMedia/);
});

test("client-aborted Tongs requests do not become Vite application errors", () => {
  assert.equal(isClientAbortError(Object.assign(new Error("aborted"), { code: "ECONNRESET" })), true);
  assert.equal(isClientAbortError(new Error("aborted")), true);
  assert.equal(isClientAbortError(new Error("unrelated failure")), false);
  assert.equal(isClientAbortError(new Error("unrelated failure"), { aborted: true, destroyed: true }), true);
});
