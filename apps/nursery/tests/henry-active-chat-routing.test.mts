import assert from "node:assert/strict";
import test from "node:test";
import type { HearthHenrySignal, HenryContext } from "@forge/shared/henry";
import { getHenryDeterministicSuggestion } from "../src/henry/henry-deterministic-suggestions.ts";
import { buildHenryChatReply } from "../src/henry/henryMessageEngine.ts";
import { shouldHenrySurfaceSuggestion, type HenrySilencePolicyHistory } from "../src/henry/henry-silence-policy.ts";

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

function baseSignal(overrides: Partial<HearthHenrySignal> = {}): HearthHenrySignal {
  return {
    surface: "hearth",
    workspaceId: "workspace-1",
    workpieceId: "workpiece-1",
    hasActiveSpark: true,
    hasDraft: true,
    tagValidationOk: true,
    hasPacingCues: true,
    isApprovedOrReady: true,
    updatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

function baseHistory(overrides: Partial<HenrySilencePolicyHistory> = {}): HenrySilencePolicyHistory {
  return {
    nowMs: Date.now(),
    explicitUserInvocation: true,
    userIsTyping: true,
    userMutedHenry: false,
    previousMode: "reviewing",
    previousTagValidationOk: true,
    lastSignalFingerprint: null,
    lastSuggestionKind: "clarify",
    lastSuggestionAtMs: Date.now(),
    ...overrides,
  };
}

test("active chat question does not return passive readiness ambient suggestion", () => {
  const passive = getHenryDeterministicSuggestion({
    context: baseContext(),
    mode: "reviewing",
    hearthSignal: baseSignal(),
  });
  assert.ok(passive);
  assert.match(passive?.text ?? "", /Ready means recordable, not perfect/i);

  const reply = buildHenryChatReply("how do I create images", baseContext(), {
    mode: "reviewing",
    suggestion: passive,
    hearthSignal: baseSignal(),
  });
  assert.equal(reply.lane, "free_help");
  assert.doesNotMatch(reply.text, /Ready means recordable, not perfect/i);
});

test("how do I create images gets deterministic image help answer", () => {
  const reply = buildHenryChatReply("how do I create images", baseContext());
  assert.equal(reply.lane, "free_help");
  assert.match(reply.text, /Hearth image|visual flows/i);
  assert.match(reply.text, /normal AI|asset lane/i);
});

test("where does an episode get recorded gets Anvil workflow answer", () => {
  const reply = buildHenryChatReply("where does an episode get recorded", baseContext());
  assert.equal(reply.lane, "free_help");
  assert.match(reply.text, /Recording happens in Anvil/i);
  assert.match(reply.text, /Hearth shapes the script, Anvil captures/i);
});

test("known Hearth context does not fall back to missing-context prompt", () => {
  const reply = buildHenryChatReply("can you sanity check this tool setup", baseContext(), {
    hearthSignal: baseSignal(),
  });
  assert.equal(reply.lane, "free_help");
  assert.doesNotMatch(reply.text, /I may be missing the exact context/i);
  assert.match(reply.text, /You are in Hearth|handoff to Anvil|next step/i);
});

test("passive ambient suggestion still works separately", () => {
  const suggestion = getHenryDeterministicSuggestion({
    context: baseContext(),
    mode: "reviewing",
    hearthSignal: baseSignal(),
  });
  assert.ok(suggestion);
  assert.match(suggestion?.text ?? "", /Ready means recordable, not perfect/i);
});

test("silence policy does not suppress explicit active chat intent", () => {
  const suggestion = getHenryDeterministicSuggestion({
    context: baseContext(),
    mode: "reviewing",
    hearthSignal: baseSignal(),
  });
  const allowed = shouldHenrySurfaceSuggestion({
    context: baseContext(),
    signal: baseSignal(),
    mode: "reviewing",
    suggestion,
    history: baseHistory(),
  });
  assert.equal(allowed, true);
});

test("free_help lane does not bill or call network", () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    const reply = buildHenryChatReply("what is optional here", baseContext());
    assert.equal(reply.lane, "free_help");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("user_metered lane does not auto-generate content", () => {
  const reply = buildHenryChatReply("write me a full script and generate 10 titles", baseContext());
  assert.equal(reply.lane, "user_metered");
  assert.match(reply.text, /explicit Hearth rewrite|generation action/i);
  assert.doesNotMatch(reply.text, /\[s1\]|\[s2\]/i);
});
