import assert from "node:assert/strict";
import test from "node:test";
import type { HearthHenrySignal, HenryContext, HenryMode, HenrySuggestion } from "@forge/shared/henry";
import { buildHenryActionAnswer, buildHenryChatAnswer } from "../src/henry/henryMessageEngine.ts";

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
    hasActiveSpark: true,
    hasDraft: true,
    tagValidationOk: true,
    hasPacingCues: true,
    isApprovedOrReady: true,
    updatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

test("what-next stays advisory and does not claim control actions", () => {
  const suggestion: HenrySuggestion = {
    kind: "anvil_readiness",
    text: "Ready means recordable, not perfect. Want one light cadence pass before recording?",
  };
  const answer = buildHenryActionAnswer("what-next", baseContext(), {
    mode: "reviewing",
    suggestion,
    hearthSignal: baseSignal(),
  });

  assert.equal(answer, suggestion.text);
  assert.doesNotMatch(answer, /I scheduled|I recorded|I edited|I published|I stored/i);
});

test("hearth chat remains deterministic and boundary-safe", () => {
  const answer = buildHenryChatAnswer("Can you optimize this and publish it?", baseContext(), {
    mode: "recording_ready",
    suggestion: { kind: "anvil_readiness", text: "This looks recordable. Not perfect, recordable." },
    hearthSignal: baseSignal(),
  });
  assert.match(answer, /recordable/i);
  assert.doesNotMatch(answer, /publish|SEO|thumbnail/i);
  assert.doesNotMatch(answer, /I generated/i);
});

test("legacy format remains intact when no hearth signal is present", () => {
  const answer = buildHenryActionAnswer("what-next", baseContext(), {
    mode: null,
    suggestion: null,
    hearthSignal: null,
  });
  assert.match(answer, /Best next step:/);
  assert.match(answer, /Why:/);
  assert.match(answer, /You could also:/);
});

