import assert from "node:assert/strict";
import test from "node:test";
import type { HearthHenrySignal, HenryContext, HenryMode } from "@forge/shared/henry";
import {
  buildHenryHearthChatAnswer,
  getHenryDeterministicSuggestion,
} from "../src/henry/henry-deterministic-suggestions.ts";

function baseContext(): HenryContext {
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
  };
}

function baseSignal(overrides: Partial<HearthHenrySignal> = {}): HearthHenrySignal {
  return {
    surface: "hearth",
    workspaceId: "workspace-1",
    workpieceId: "workpiece-1",
    hasActiveSpark: false,
    hasDraft: false,
    tagValidationOk: null,
    hasPacingCues: null,
    isApprovedOrReady: false,
    updatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

function getSuggestion(mode: HenryMode, signal: HearthHenrySignal) {
  return getHenryDeterministicSuggestion({
    context: baseContext(),
    mode,
    hearthSignal: signal,
  });
}

test("deterministic suggestions return null when Hearth signal is unavailable", () => {
  const suggestion = getHenryDeterministicSuggestion({
    context: baseContext(),
    mode: null,
    hearthSignal: null,
  });
  assert.equal(suggestion, null);
});

test("blocked mode flags Anvil-readiness issues with speaker tags", () => {
  const suggestion = getSuggestion("blocked", baseSignal({ hasDraft: true, tagValidationOk: false }));
  assert.ok(suggestion);
  assert.equal(suggestion?.kind, "anvil_readiness");
  assert.match(suggestion?.text ?? "", /speaker tags/i);
  assert.doesNotMatch(suggestion?.text ?? "", /schedule|publish|record now/i);
});

test("recording-ready guidance keeps canonical recordable-not-perfect phrasing", () => {
  const suggestion = getSuggestion("recording_ready", baseSignal({ hasDraft: true, tagValidationOk: true, hasPacingCues: true }));
  assert.ok(suggestion);
  assert.match(suggestion?.text ?? "", /recordable/i);
  assert.match(suggestion?.text ?? "", /not perfect/i);
});

test("chat guidance does not escalate into automatic actions", () => {
  const suggestion = getSuggestion("structuring", baseSignal({ hasDraft: true, tagValidationOk: true, hasPacingCues: false }));
  const answer = buildHenryHearthChatAnswer({
    question: "Rewrite this now",
    context: baseContext(),
    mode: "structuring",
    suggestion,
  });
  assert.ok(answer);
  assert.match(answer ?? "", /paste the section/i);
  assert.doesNotMatch(answer ?? "", /I scheduled|I recorded|I published|I applied/i);
});

test("exploratory questions get one useful question, not a lecture", () => {
  const suggestion = getSuggestion("warming", baseSignal({ hasActiveSpark: true }));
  const answer = buildHenryHearthChatAnswer({
    question: "What do you think about this framing?",
    context: baseContext(),
    mode: "warming",
    suggestion,
  });
  assert.ok(answer);
  assert.match(answer ?? "", /\?$/);
  assert.doesNotMatch(answer ?? "", /SEO|thumbnail|publish/i);
});

