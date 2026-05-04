import assert from "node:assert/strict";
import test from "node:test";
import type { HenryContext } from "@forge/shared/henry";
import { classifyHenryAiLane } from "../src/henry/henry-ai-cost-policy.ts";
import { buildHenryChatReply } from "../src/henry/henryMessageEngine.ts";

function baseContext(overrides: Partial<HenryContext> = {}): HenryContext {
  return {
    surface: "hearth",
    routePath: "/app/hearth",
    workspaceId: "workspace-1",
    workpieceId: "workpiece-1",
    episodeTitle: "Episode",
    phase: "script",
    displayStatus: "draft",
    episodeContextState: "active",
    workspaceResolutionState: "ready",
    ...overrides,
  };
}

test("help question routes to free_help lane", () => {
  const lane = classifyHenryAiLane("What does this button do?", baseContext());
  assert.equal(lane, "free_help");
});

test("script writing request routes to user_metered lane", () => {
  const lane = classifyHenryAiLane("Write me a full script for this episode.", baseContext());
  assert.equal(lane, "user_metered");
});

test("workflow question routes to free_help lane", () => {
  const lane = classifyHenryAiLane("How do I send this to Anvil?", baseContext());
  assert.equal(lane, "free_help");
});

test("bulk generation request routes to user_metered lane", () => {
  const lane = classifyHenryAiLane("Generate 10 titles for this episode.", baseContext());
  assert.equal(lane, "user_metered");
});

test("free_help lane does not trigger billing/network calls", () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    const reply = buildHenryChatReply("Why is this disabled?", baseContext());
    assert.equal(reply.lane, "free_help");
    assert.equal(called, false);
    assert.doesNotMatch(reply.text, /credit|billing|cost/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
