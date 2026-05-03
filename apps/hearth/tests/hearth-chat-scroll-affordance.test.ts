import assert from "node:assert/strict";
import test from "node:test";
import { resolveHearthChatScrollAffordance } from "../src/lib/hearth-chat-scroll-affordance";

test("resolveHearthChatScrollAffordance separates top and bottom visibility", () => {
  const state = resolveHearthChatScrollAffordance({
    topSentinelTop: -260,
    bottomSentinelBottom: 1240,
    viewportTop: 0,
    viewportBottom: 800,
    logScrollTop: 0,
    logScrollHeight: 600,
    logClientHeight: 600,
  });

  assert.deepEqual(state, {
    canScrollTop: true,
    canScrollBottom: true,
  });
});

test("resolveHearthChatScrollAffordance promotes bottom control when log has unseen new content", () => {
  const state = resolveHearthChatScrollAffordance({
    topSentinelTop: 120,
    bottomSentinelBottom: 720,
    viewportTop: 0,
    viewportBottom: 800,
    logScrollTop: 180,
    logScrollHeight: 1200,
    logClientHeight: 500,
  });

  assert.equal(state.canScrollTop, true);
  assert.equal(state.canScrollBottom, true);
});

test("resolveHearthChatScrollAffordance hides bottom control when near bottom", () => {
  const state = resolveHearthChatScrollAffordance({
    topSentinelTop: -420,
    bottomSentinelBottom: 700,
    viewportTop: 0,
    viewportBottom: 800,
    logScrollTop: 682,
    logScrollHeight: 1200,
    logClientHeight: 500,
  });

  assert.equal(state.canScrollTop, true);
  assert.equal(state.canScrollBottom, false);
});
