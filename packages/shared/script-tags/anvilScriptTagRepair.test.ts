import assert from "node:assert/strict";
import test from "node:test";
import { repairScriptTags, validateScriptTags } from "./index";

test("anvilScriptTagRepair: fixes inline speaker lines to own-line tags", () => {
  const repaired = repairScriptTags("[S1] hello there [/S1]");
  assert.equal(repaired.changed, true);
  const validation = validateScriptTags(repaired.text);
  assert.equal(validation.ok, true);
});

test("anvilScriptTagRepair: leaves ambiguous crossed tags invalid", () => {
  const repaired = repairScriptTags("[s1]\nA\n[s2]\nB\n[/s1]\n[/s2]\n");
  assert.equal(repaired.remainingIssues.length > 0, true);
  assert.equal(repaired.remainingIssues.some((issue) => issue.code === "CROSSED_TAGS"), true);
});
