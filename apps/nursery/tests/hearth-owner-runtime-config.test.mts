import assert from "node:assert/strict";
import test from "node:test";
import { resolveHearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";

const KEYS = [
  "OPENAI_HEARTH_OWNER_API_KEY",
  "OPENAI_HEARTH_RESEARCH_OWNER_API_KEY",
  "HEARTH_OWNER_RESEARCH_BRAVE_API_KEY",
  "OPENAI_TEXT_API_KEY",
  "OPENAI_API_KEY",
  "HEARTH_RESEARCH_API_KEY",
  "HEARTH_RESEARCH_BRAVE_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "BRAVE_API_KEY",
  "BAR_STOCK_OWNER_BRAVE_API_KEY",
] as const;

function withCleanEnvironment(run: () => void): void {
  const snapshot = new Map(KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of KEYS) delete process.env[key];
    run();
  } finally {
    for (const key of KEYS) {
      const value = snapshot.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Hearth owner text and research credentials use only their isolated variables", () => {
  withCleanEnvironment(() => {
    let config = resolveHearthRuntimeConfig();
    assert.equal(config.ownerTextApiKey, null);
    assert.equal(config.ownerResearchTextApiKey, null);
    assert.equal(config.ownerResearchApiKey, null);

    process.env.OPENAI_TEXT_API_KEY = "customer-openai";
    process.env.HEARTH_RESEARCH_API_KEY = "customer-brave";
    process.env.BAR_STOCK_OWNER_BRAVE_API_KEY = "bar-stock-brave";
    config = resolveHearthRuntimeConfig();
    assert.equal(config.ownerTextApiKey, null);
    assert.equal(config.ownerResearchTextApiKey, null);
    assert.equal(config.ownerResearchApiKey, null);

    process.env.OPENAI_HEARTH_OWNER_API_KEY = "hearth-owner-openai";
    process.env.OPENAI_HEARTH_RESEARCH_OWNER_API_KEY = "hearth-research-openai";
    process.env.HEARTH_OWNER_RESEARCH_BRAVE_API_KEY = "hearth-research-brave";
    config = resolveHearthRuntimeConfig();
    assert.equal(config.ownerTextApiKey, "hearth-owner-openai");
    assert.equal(config.ownerResearchTextApiKey, "hearth-research-openai");
    assert.equal(config.ownerResearchApiKey, "hearth-research-brave");
    assert.equal(process.env.BAR_STOCK_OWNER_BRAVE_API_KEY, "bar-stock-brave");
  });
});

test("Hearth owner credential resolution emits no secret values", () => {
  withCleanEnvironment(() => {
    const secret = "hearth-owner-secret-must-not-escape";
    process.env.OPENAI_HEARTH_OWNER_API_KEY = secret;
    process.env.OPENAI_HEARTH_RESEARCH_OWNER_API_KEY = `${secret}-research`;
    process.env.HEARTH_OWNER_RESEARCH_BRAVE_API_KEY = `${secret}-brave`;
    const observed: unknown[][] = [];
    const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    try {
      console.log = (...args: unknown[]) => { observed.push(args); };
      console.info = (...args: unknown[]) => { observed.push(args); };
      console.warn = (...args: unknown[]) => { observed.push(args); };
      console.error = (...args: unknown[]) => { observed.push(args); };
      const config = resolveHearthRuntimeConfig();
      assert.equal(config.ownerTextApiKey, secret);
      assert.equal(config.ownerResearchTextApiKey, `${secret}-research`);
      assert.equal(config.ownerResearchApiKey, `${secret}-brave`);
      assert.deepEqual(observed, []);
    } finally {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
    }
  });
});
