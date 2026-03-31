import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAiSettings } from "../src/lib/hearth/ai-settings";

test("ai settings: default visual provider normalizes to generic fallback", () => {
  const settings = normalizeAiSettings({
    defaultVisualProvider: "unknown-provider",
  });

  assert.equal(settings.defaultVisualProvider, "generic");
});

test("ai settings: preserves valid visual provider ids", () => {
  const settings = normalizeAiSettings({
    lane: "byo",
    behavior: "creative",
    defaultVisualProvider: "openart",
  });

  assert.equal(settings.lane, "byo");
  assert.equal(settings.behavior, "creative");
  assert.equal(settings.defaultVisualProvider, "openart");
});

