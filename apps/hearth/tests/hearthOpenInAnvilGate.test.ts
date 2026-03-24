import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScriptTags, validateScriptTags } from "@forge/shared/script-tags";
import { getScriptReadiness } from "../src/lib/hearth-script-readiness";

test("hearthOpenInAnvilGate: invalid script blocks handoff", () => {
  const validation = validateScriptTags(normalizeScriptTags("[s1]\nMissing close"));
  const readiness = getScriptReadiness({
    validation,
    hasScriptText: true,
  });
  assert.equal(readiness.ready, false);
});

test("hearthOpenInAnvilGate: valid script allows handoff", () => {
  const validation = validateScriptTags(normalizeScriptTags("[s1]\nOpen in Anvil\n[/s1]\n"));
  const readiness = getScriptReadiness({
    validation,
    hasScriptText: true,
  });
  assert.equal(readiness.ready, true);
});
