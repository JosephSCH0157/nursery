import assert from "node:assert/strict";
import test from "node:test";
import { shouldInvalidateMediaMapForScriptVersion } from "../src/lib/hearth-visual-artifact-authority";

test("cold reload does not invalidate an applied visual plan while approval hydrates", () => {
  assert.equal(shouldInvalidateMediaMapForScriptVersion("4", null), false);
});

test("an applied visual plan is retained when the canonical script version matches", () => {
  assert.equal(shouldInvalidateMediaMapForScriptVersion("4", 4), false);
});

test("a new canonical script version invalidates the applied visual plan", () => {
  assert.equal(shouldInvalidateMediaMapForScriptVersion("4", 5), true);
});
