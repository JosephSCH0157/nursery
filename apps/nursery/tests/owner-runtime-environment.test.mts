import assert from "node:assert/strict";
import test from "node:test";

import {
  readOwnerRuntimeEnvironment,
  resolveOwnerRuntimeEnvironment,
  runWithOwnerRuntimeEnvironment,
} from "../server/accounting/owner-runtime-environment";

test("canonical Netlify deploy contexts map to owner runtime environments", () => {
  assert.equal(resolveOwnerRuntimeEnvironment("production"), "production");
  assert.equal(resolveOwnerRuntimeEnvironment("deploy-preview"), "preview");
  assert.equal(resolveOwnerRuntimeEnvironment("branch-deploy"), "preview");
  assert.equal(resolveOwnerRuntimeEnvironment("dev"), "development");
  assert.throws(() => resolveOwnerRuntimeEnvironment("unknown-context"), /unsupported/);
});

test("owner runtime environment is isolated per concurrent request", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const production = runWithOwnerRuntimeEnvironment("production", async () => {
    await gate;
    return readOwnerRuntimeEnvironment();
  });
  const preview = runWithOwnerRuntimeEnvironment("deploy-preview", async () => {
    await gate;
    return readOwnerRuntimeEnvironment();
  });

  release?.();
  assert.deepEqual(await Promise.all([production, preview]), ["production", "preview"]);
});

test("hosted execution fails closed without a request deploy context", () => {
  assert.throws(() => resolveOwnerRuntimeEnvironment(undefined, true), /missing/);
});
