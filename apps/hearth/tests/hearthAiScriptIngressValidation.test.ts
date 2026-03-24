import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScriptTags, repairScriptTags, validateScriptTags } from "@forge/shared/script-tags";

test("hearthAiScriptIngressValidation: AI candidate is normalized and validated before use", () => {
  const aiText = "[S1] Hello from AI [/S1]";
  const normalized = normalizeScriptTags(aiText);
  const repaired = repairScriptTags(normalized);
  const validation = validateScriptTags(repaired.text);
  assert.equal(validation.ok, true);
});

test("hearthAiScriptIngressValidation: unrepairable invalid structure stays blocked", () => {
  const aiText = "[s1]\nOne\n[s2]\nTwo\n[/s1]\n";
  const normalized = normalizeScriptTags(aiText);
  const repaired = repairScriptTags(normalized);
  const validation = validateScriptTags(repaired.text);
  assert.equal(validation.ok, false);
});
