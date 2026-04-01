import assert from "node:assert/strict";
import test from "node:test";
import { evaluateHearthScriptValidation } from "../src/lib/hearth-script-tag-policy";

test("hearthScriptTagPolicy: plain text without tags is acceptable", () => {
  const result = evaluateHearthScriptValidation("Narration without any speaker tags.");

  assert.equal(result.tagMode, "absent");
  assert.equal(result.validation.ok, true);
  assert.equal(result.validation.issues.length, 0);
});

test("hearthScriptTagPolicy: bracketed editorial notes do not trigger tag mode", () => {
  const result = evaluateHearthScriptValidation([
    "Open with the headline.",
    "[applause]",
    "[pause]",
    "[music fades]",
    "[quote]",
  ].join("\n"));

  assert.equal(result.tagMode, "absent");
  assert.equal(result.validation.ok, true);
  assert.equal(result.validation.issues.length, 0);
});

test("hearthScriptTagPolicy: incorrect tags still surface validation errors", () => {
  const result = evaluateHearthScriptValidation("[speaker1]\nHello\n[/speaker1]\n");

  assert.equal(result.tagMode, "present");
  assert.equal(result.validation.ok, false);
  assert.equal(result.validation.issues.some((issue) => issue.code === "INVALID_SPEAKER_TAG"), true);
});
