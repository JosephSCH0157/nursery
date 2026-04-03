import assert from "node:assert/strict";
import test from "node:test";
import { canRenderHenrySurface, shouldRenderHenryForPath } from "../src/henry/henryRenderPolicy.ts";

test("Henry path policy keeps assistant off non-Forge routes", () => {
  assert.equal(shouldRenderHenryForPath("/"), false);
  assert.equal(shouldRenderHenryForPath("/auth/login"), false);
  assert.equal(shouldRenderHenryForPath("/app/hearth"), true);
});

test("Henry is suppressed on mobile even for eligible Forge routes", () => {
  assert.equal(canRenderHenrySurface({ pathname: "/app/barstock", layoutMode: "mobile" }), false);
  assert.equal(canRenderHenrySurface({ pathname: "/app/hearth", layoutMode: "mobile" }), false);
});

test("Henry can render on tablet and desktop when route is eligible", () => {
  assert.equal(canRenderHenrySurface({ pathname: "/app/barstock", layoutMode: "tablet" }), true);
  assert.equal(canRenderHenrySurface({ pathname: "/app/barstock", layoutMode: "desktop" }), true);
});
