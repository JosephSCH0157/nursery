import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authority = await readFile(new URL("../src/lib/hearth-unified-visual-plan-authority.ts", import.meta.url), "utf8");

test("terminal unified Visual Plan operations start a distinct operation without replaying history", () => {
  assert.match(authority, /latestState !== "verified" && latestState !== "failed" && latestState !== "submission_unknown"[\s\S]*return recoverUnifiedVisualPlanOperation/);
  assert.match(authority, /const current = await currentInputs/);
  assert.match(authority, /operationId = `forge:unified-visual-plan:\$\{operationFingerprint\}:\$\{crypto\.randomUUID\(\)\}`/);
  assert.doesNotMatch(authority, /latestState === "submission_unknown"[\s\S]{0,300}paid_submission_unknown/);
});

test("a nonterminal durable Visual Plan command uses recovery instead of generation", () => {
  const generateStart = authority.indexOf("export async function generateOrResumeUnifiedVisualPlan");
  const recoverStart = authority.indexOf("export async function recoverUnifiedVisualPlanOperation", generateStart);
  const generate = authority.slice(generateStart, recoverStart);
  assert.match(generate, /return recoverUnifiedVisualPlanOperation\(\{ workspaceId: args\.workspaceId, workpieceId: args\.workpieceId \}\)/);
  assert.ok(generate.indexOf("return recoverUnifiedVisualPlanOperation") < generate.indexOf("currentInputs"));
});
