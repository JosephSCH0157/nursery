import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScriptTags } from "./index";

test("anvilScriptTagNormalizer: normalizes CRLF, tag case, and trailing whitespace", () => {
  const result = normalizeScriptTags("[S1]\r\nHello  \r\n[/S1]");
  assert.equal(result, "[s1]\nHello\n[/s1]\n");
});

test("anvilScriptTagNormalizer: maps known reflective pause aliases", () => {
  const result = normalizeScriptTags("[reflective_pause]");
  assert.equal(result, "[reflective pause]\n");
});
