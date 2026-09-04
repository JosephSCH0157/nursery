import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const configUrl = new URL("../playwright.config.ts", import.meta.url);

test("authenticated browser gates own a strict, non-reused Vite server", async () => {
  const source = await readFile(configUrl, "utf8");

  assert.match(source, /--strictPort/);
  assert.match(source, /reuseExistingServer:\s*false/);
});
