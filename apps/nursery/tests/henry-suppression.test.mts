import assert from "node:assert/strict";
import test from "node:test";
import { resolveHenrySuppressionState } from "../src/henry/henrySuppression.ts";

test("suppression is active when panel is open", () => {
  const state = resolveHenrySuppressionState({
    pathname: "/app/hearth",
    panelOpen: true,
    mutedUntil: null,
  });
  assert.equal(state.isSuppressed, true);
  assert.ok(state.reasons.includes("panel-open"));
});

test("suppression is active during muted window", () => {
  const state = resolveHenrySuppressionState({
    pathname: "/app/hearth",
    panelOpen: false,
    mutedUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  assert.equal(state.isSuppressed, true);
  assert.ok(state.reasons.includes("muted"));
});

test("suppression is active on recording surface", () => {
  const state = resolveHenrySuppressionState({
    pathname: "/app/anvil",
    panelOpen: false,
    mutedUntil: null,
  });
  assert.equal(state.isSuppressed, true);
  assert.ok(state.reasons.includes("recording-surface"));
});
