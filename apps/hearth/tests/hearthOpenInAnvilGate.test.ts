import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScriptTags, validateScriptTags } from "@forge/shared/script-tags";
import { getScriptHandoffReadiness } from "../src/lib/hearth-script-readiness";

test("hearthOpenInAnvilGate: invalid script blocks handoff", () => {
  const validation = validateScriptTags(normalizeScriptTags("[s1]\nMissing close"));
  const readiness = getScriptHandoffReadiness({
    hasScriptText: true,
    tagValidationOk: validation.ok,
    composeSetup: null,
    contentValidationOk: false,
    completionBadge: "outline_draft",
  });
  assert.equal(readiness.ready, false);
});

test("hearthOpenInAnvilGate: valid script allows handoff", () => {
  const validation = validateScriptTags(normalizeScriptTags("[s1]\nOpen in Anvil\n[/s1]\n"));
  const readiness = getScriptHandoffReadiness({
    hasScriptText: true,
    tagValidationOk: validation.ok,
    composeSetup: {
      speakerCount: 1,
      speakers: ["s1"],
      mode: "full_script_single_speaker",
      targetSpeaker: "s1",
      usesProductionDefault: false,
      isOverrideFromProductionDefault: true,
    },
    contentValidationOk: true,
    completionBadge: "approval_ready",
  });
  assert.equal(readiness.ready, true);
});

test("hearthOpenInAnvilGate: outline drafts can still open in Anvil", () => {
  const validation = validateScriptTags(normalizeScriptTags("[s1]\n- Hook\n- Key beat\n[/s1]\n"));
  const readiness = getScriptHandoffReadiness({
    hasScriptText: true,
    tagValidationOk: validation.ok,
    composeSetup: {
      speakerCount: 1,
      speakers: ["s1"],
      mode: "outline_by_speaker",
      targetSpeaker: "s1",
      usesProductionDefault: false,
      isOverrideFromProductionDefault: true,
    },
    contentValidationOk: true,
    completionBadge: "outline_draft",
  });
  assert.equal(readiness.ready, true);
});
