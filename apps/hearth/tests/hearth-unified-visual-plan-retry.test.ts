import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authority = await readFile(new URL("../src/lib/hearth-unified-visual-plan-authority.ts", import.meta.url), "utf8");

test("failed unified Visual Plan operations start from fresh canonical revisions", () => {
  assert.match(authority, /latestState !== "verified" && latestState !== "failed"/);
  assert.match(authority, /const current = await currentInputs/);
});
