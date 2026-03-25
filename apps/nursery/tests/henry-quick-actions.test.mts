import assert from "node:assert/strict";
import test from "node:test";
import { HENRY_QUICK_ACTION_REGISTRY, resolveHenryQuickActions } from "../src/henry/henryQuickActions.ts";

test("quick-action registry includes all primary tool surfaces", () => {
  assert.ok(Array.isArray(HENRY_QUICK_ACTION_REGISTRY.hearth));
  assert.ok(Array.isArray(HENRY_QUICK_ACTION_REGISTRY.anvil));
  assert.ok(Array.isArray(HENRY_QUICK_ACTION_REGISTRY.hammer));
  assert.ok(Array.isArray(HENRY_QUICK_ACTION_REGISTRY.quench));
  assert.ok(Array.isArray(HENRY_QUICK_ACTION_REGISTRY["bar-stock"]));
  assert.ok(Array.isArray(HENRY_QUICK_ACTION_REGISTRY.tongs));
});

test("resolveHenryQuickActions returns enabled labels for a surface", () => {
  const actions = resolveHenryQuickActions("hearth");
  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => action.enabled === true));
  assert.ok(actions.some((action) => action.id === "what-next"));
  assert.ok(actions.some((action) => action.id === "explain-screen"));
});
