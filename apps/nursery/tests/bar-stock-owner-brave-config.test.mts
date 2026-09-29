import assert from "node:assert/strict";
import test from "node:test";
import { resolveBarStockOwnerRuntimeConfig } from "../server/bar-stock/bar-stock-owner-runtime-config";
import { resolveHearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";

const BRAVE_ENV_KEYS = [
  "BAR_STOCK_OWNER_BRAVE_API_KEY",
  "HEARTH_RESEARCH_API_KEY",
  "HEARTH_RESEARCH_BRAVE_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "BRAVE_API_KEY",
  "HEARTH_OWNER_RESEARCH_BRAVE_API_KEY",
] as const;

type BraveEnvKey = (typeof BRAVE_ENV_KEYS)[number];

function snapshotEnvironment(): Partial<Record<BraveEnvKey, string>> {
  const snapshot: Partial<Record<BraveEnvKey, string>> = {};
  for (const key of BRAVE_ENV_KEYS) {
    if (process.env[key] != null) snapshot[key] = process.env[key];
  }
  return snapshot;
}

function clearEnvironment(): void {
  for (const key of BRAVE_ENV_KEYS) delete process.env[key];
}

function restoreEnvironment(snapshot: Partial<Record<BraveEnvKey, string>>): void {
  clearEnvironment();
  for (const key of BRAVE_ENV_KEYS) {
    if (snapshot[key] != null) process.env[key] = snapshot[key];
  }
}

test("Bar Stock owner Brave credential is isolated from every Hearth and generic Brave credential", () => {
  const snapshot = snapshotEnvironment();
  try {
    clearEnvironment();
    assert.equal(resolveBarStockOwnerRuntimeConfig().barStockOwnerBraveApiKey, null);

    process.env.HEARTH_RESEARCH_API_KEY = "customer-research-only";
    let config = resolveHearthRuntimeConfig();
    assert.equal(config.researchApiKey, "customer-research-only");
    assert.equal(resolveBarStockOwnerRuntimeConfig().barStockOwnerBraveApiKey, null);
    assert.equal(config.ownerResearchApiKey, null);

    clearEnvironment();
    process.env.HEARTH_OWNER_RESEARCH_BRAVE_API_KEY = "hearth-owner-only";
    config = resolveHearthRuntimeConfig();
    assert.equal(config.ownerResearchApiKey, "hearth-owner-only");
    assert.equal(resolveBarStockOwnerRuntimeConfig().barStockOwnerBraveApiKey, null);
    assert.equal(config.researchApiKey, null);

    clearEnvironment();
    process.env.BAR_STOCK_OWNER_BRAVE_API_KEY = "bar-stock-owner-only";
    const barStockConfig = resolveBarStockOwnerRuntimeConfig();
    config = resolveHearthRuntimeConfig();
    assert.equal(barStockConfig.barStockOwnerBraveApiKey, "bar-stock-owner-only");
    assert.equal(config.ownerResearchApiKey, null);
    assert.equal(config.researchApiKey, null);
  } finally {
    restoreEnvironment(snapshot);
  }
});

test("generic Brave aliases never satisfy Bar Stock owner configuration", () => {
  const snapshot = snapshotEnvironment();
  try {
    for (const key of ["HEARTH_RESEARCH_BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY"] as const) {
      clearEnvironment();
      process.env[key] = `${key.toLowerCase()}-only`;
      const config = resolveHearthRuntimeConfig();
      assert.equal(config.researchApiKey, `${key.toLowerCase()}-only`);
      assert.equal(resolveBarStockOwnerRuntimeConfig().barStockOwnerBraveApiKey, null);
      assert.equal(config.ownerResearchApiKey, null);
    }
  } finally {
    restoreEnvironment(snapshot);
  }
});

test("resolving the Bar Stock owner credential neither logs nor persists its value", () => {
  const snapshot = snapshotEnvironment();
  const secret = "bar-stock-owner-secret-must-not-escape";
  const observed: unknown[][] = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  try {
    clearEnvironment();
    process.env.BAR_STOCK_OWNER_BRAVE_API_KEY = secret;
    console.log = (...args: unknown[]) => { observed.push(args); };
    console.info = (...args: unknown[]) => { observed.push(args); };
    console.warn = (...args: unknown[]) => { observed.push(args); };
    console.error = (...args: unknown[]) => { observed.push(args); };

    const config = resolveBarStockOwnerRuntimeConfig();
    assert.equal(config.barStockOwnerBraveApiKey, secret);
    assert.deepEqual(observed, []);
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    restoreEnvironment(snapshot);
  }
});
