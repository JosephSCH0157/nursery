import assert from "node:assert/strict";
import test from "node:test";
import { validateScriptTags } from "./index";

test("anvilScriptTagValidator: accepts balanced speaker blocks", () => {
  const result = validateScriptTags("[s1]\nHello.\n[/s1]\n[s2]\nHi.\n[/s2]\n");
  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
});

test("anvilScriptTagValidator: rejects text outside speaker blocks", () => {
  const result = validateScriptTags("Hello\n[s1]\nInside\n[/s1]\n");
  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "TEXT_OUTSIDE_SPEAKER_BLOCK"), true);
});

test("anvilScriptTagValidator: rejects unsupported tags", () => {
  const result = validateScriptTags("[speaker1]\nHello\n[/speaker1]\n");
  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "INVALID_SPEAKER_TAG"), true);
});
