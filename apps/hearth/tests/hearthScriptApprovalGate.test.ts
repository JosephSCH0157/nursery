import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScriptTags, validateScriptTags } from "@forge/shared/script-tags";
import { getScriptReadiness } from "../src/lib/hearth-script-readiness";

test("hearthScriptApprovalGate: invalid script blocks readiness", () => {
  const validation = validateScriptTags(normalizeScriptTags("Narration without tags"));
  const readiness = getScriptReadiness({
    validation,
    hasScriptText: true,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reasons.includes("Script tags are invalid."), true);
});

test("hearthScriptApprovalGate: valid script is ready", () => {
  const validation = validateScriptTags(normalizeScriptTags("[s1]\nReady.\n[/s1]\n"));
  const readiness = getScriptReadiness({
    validation,
    hasScriptText: true,
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.reasons.length, 0);
});
