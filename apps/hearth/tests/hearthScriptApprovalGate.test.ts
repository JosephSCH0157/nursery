import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScriptTags, validateScriptTags } from "@forge/shared/script-tags";
import { getScriptReadiness } from "../src/lib/hearth-script-readiness";

test("hearthScriptApprovalGate: invalid script blocks readiness", () => {
  const validation = validateScriptTags(normalizeScriptTags("Narration without tags"));
  const readiness = getScriptReadiness({
    hasScriptText: true,
    tagValidationOk: validation.ok,
    composeSetup: null,
    contentValidationOk: false,
    completionBadge: "outline_draft",
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reasons.includes("Script tags are invalid."), true);
});

test("hearthScriptApprovalGate: valid script is ready", () => {
  const validation = validateScriptTags(normalizeScriptTags("[s1]\nReady.\n[/s1]\n[s2]\nReady.\n[/s2]\n"));
  const readiness = getScriptReadiness({
    hasScriptText: true,
    tagValidationOk: validation.ok,
    composeSetup: {
      speakerCount: 2,
      speakers: ["s1", "s2"],
      mode: "full_script_all_speakers",
      targetSpeaker: null,
      usesProductionDefault: true,
      isOverrideFromProductionDefault: false,
    },
    contentValidationOk: true,
    completionBadge: "approval_ready",
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.reasons.length, 0);
});
