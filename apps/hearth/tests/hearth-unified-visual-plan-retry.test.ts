import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authority = await readFile(new URL("../src/lib/hearth-unified-visual-plan-authority.ts", import.meta.url), "utf8");

test("terminal unified Visual Plan operations start a distinct operation without replaying history", () => {
  assert.match(authority, /latestState !== "verified" && latestState !== "failed" && latestState !== "submission_unknown"/);
  assert.match(authority, /const current = await currentInputs/);
  assert.match(authority, /operationId = `forge:unified-visual-plan:\$\{operationFingerprint\}:\$\{crypto\.randomUUID\(\)\}`/);
  assert.doesNotMatch(authority, /latestState === "submission_unknown"[\s\S]{0,300}paid_submission_unknown/);
});
