import assert from "node:assert/strict";
import test from "node:test";
import type { HearthHenrySignal, HenryContext, HenryMode, HenrySuggestion } from "@forge/shared/henry";
import {
  getHenrySuppressionReason,
  shouldHenrySurfaceSuggestion,
  type HenrySilencePolicyHistory,
} from "../src/henry/henry-silence-policy.ts";

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
    hasPacingCues: false,
    isApprovedOrReady: false,
    updatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

function baseHistory(overrides: Partial<HenrySilencePolicyHistory> = {}): HenrySilencePolicyHistory {
  return {
    nowMs: 1_000_000,
    explicitUserInvocation: false,
    userIsTyping: false,
    userMutedHenry: false,
    previousMode: "warming",
    previousTagValidationOk: true,
    lastSignalFingerprint: "other",
    lastSuggestionKind: null,
    lastSuggestionAtMs: null,
    ...overrides,
  };
}

function suggestion(kind: HenrySuggestion["kind"], text = "This may need clean speaker tags before Anvil can read it cleanly."): HenrySuggestion {
  return { kind, text };
}

function evaluate(args: {
  context?: HenryContext;
  signal?: HearthHenrySignal | null;
  mode?: HenryMode | null;
  suggestion?: HenrySuggestion | null;
  history?: HenrySilencePolicyHistory;
} = {}) {
  return {
    reason: getHenrySuppressionReason({
      context: args.context ?? baseContext(),
      signal: args.signal ?? baseSignal(),
      mode: args.mode ?? "blocked",
      suggestion: args.suggestion ?? suggestion("anvil_readiness"),
      history: args.history ?? baseHistory(),
    }),
    shouldSurface: shouldHenrySurfaceSuggestion({
      context: args.context ?? baseContext(),
      signal: args.signal ?? baseSignal(),
      mode: args.mode ?? "blocked",
      suggestion: args.suggestion ?? suggestion("anvil_readiness"),
      history: args.history ?? baseHistory(),
    }),
  };
}

test("suppresses repeated suggestion kind", () => {
  const result = evaluate({
    history: baseHistory({
      lastSuggestionKind: "anvil_readiness",
      lastSuggestionAtMs: 950_000,
      nowMs: 1_000_000,
      previousMode: "warming",
      previousTagValidationOk: false,
      lastSignalFingerprint: "different-fingerprint",
    }),
  });
  assert.equal(result.reason, "recently_suggested_same_kind");
  assert.equal(result.shouldSurface, false);
});

test("suppresses while user is typing", () => {
  const result = evaluate({
    history: baseHistory({ userIsTyping: true }),
  });
  assert.equal(result.reason, "user_is_typing");
  assert.equal(result.shouldSurface, false);
});

test("suppresses when already recording-ready unless user explicitly invokes Henry", () => {
  const passive = evaluate({
    mode: "recording_ready",
    signal: baseSignal({ hasPacingCues: true, isApprovedOrReady: true }),
    history: baseHistory({ previousMode: "recording_ready" }),
    suggestion: suggestion("anvil_readiness", "This looks recordable. Not perfect, recordable."),
  });
  assert.equal(passive.reason, "already_recording_ready");
  assert.equal(passive.shouldSurface, false);

  const explicit = evaluate({
    mode: "recording_ready",
    signal: baseSignal({ hasPacingCues: true, isApprovedOrReady: true }),
    history: baseHistory({ explicitUserInvocation: true, previousMode: "recording_ready" }),
    suggestion: suggestion("anvil_readiness", "This looks recordable. Not perfect, recordable."),
  });
  assert.equal(explicit.reason, "none");
  assert.equal(explicit.shouldSurface, true);
});

test("allows new validation failure suggestion", () => {
  const result = evaluate({
    mode: "blocked",
    signal: baseSignal({ tagValidationOk: false }),
    history: baseHistory({ previousTagValidationOk: true }),
  });
  assert.equal(result.reason, "none");
  assert.equal(result.shouldSurface, true);
});

test("allows explicit user-invoked Henry help", () => {
  const result = evaluate({
    history: baseHistory({
      explicitUserInvocation: true,
      userIsTyping: true,
      lastSuggestionKind: "anvil_readiness",
      lastSuggestionAtMs: 999_500,
    }),
  });
  assert.equal(result.reason, "none");
  assert.equal(result.shouldSurface, true);
});

test("silence policy is pure and does not call AI/network", () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    const result = evaluate();
    assert.equal(result.shouldSurface, true);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserves mute/suppression behavior", () => {
  const result = evaluate({
    history: baseHistory({ userMutedHenry: true }),
  });
  assert.equal(result.reason, "user_muted_henry");
  assert.equal(result.shouldSurface, false);
});

test("non-hearth surfaces remain unchanged by this pass", () => {
  const result = evaluate({
    context: baseContext({ surface: "anvil" }),
  });
  assert.equal(result.reason, "surface_not_hearth");
  assert.equal(result.shouldSurface, false);
});
