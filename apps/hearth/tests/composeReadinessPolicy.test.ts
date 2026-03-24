import assert from "node:assert/strict";
import test from "node:test";
import { getScriptReadiness } from "../src/lib/hearth-script-readiness";

test("composeReadinessPolicy: outline badge stays blocked for approval", () => {
  const readiness = getScriptReadiness({
    hasScriptText: true,
    tagValidationOk: true,
    composeSetup: {
      speakerCount: 2,
      speakers: ["s1", "s2"],
      mode: "outline_by_speaker",
      targetSpeaker: null,
      usesProductionDefault: true,
      isOverrideFromProductionDefault: false,
    },
    contentValidationOk: true,
    completionBadge: "outline_draft",
  });
  assert.equal(readiness.ready, false);
});

test("composeReadinessPolicy: full ready badge allows approval", () => {
  const readiness = getScriptReadiness({
    hasScriptText: true,
    tagValidationOk: true,
    composeSetup: {
      speakerCount: 2,
      speakers: ["s1", "s2"],
      mode: "full_script_all_speakers",
      targetSpeaker: null,
      usesProductionDefault: false,
      isOverrideFromProductionDefault: true,
    },
    contentValidationOk: true,
    completionBadge: "approval_ready",
  });
  assert.equal(readiness.ready, true);
});
