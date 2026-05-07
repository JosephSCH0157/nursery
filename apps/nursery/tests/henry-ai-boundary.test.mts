import assert from "node:assert/strict";
import test from "node:test";
import type { HearthHenrySignal, HenryContext, HenryMode } from "@forge/shared/henry";
import { buildHenryActionAnswer, buildHenryChatAnswer, buildHenryChatReply } from "../src/henry/henryMessageEngine.ts";

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
  const answer = buildHenryActionAnswer("what-next", baseContext(), {
    mode: "reviewing",
    suggestion: {
      kind: "anvil_readiness",
      text: "Ready means recordable, not perfect. Want one light cadence pass before recording?",
    },
    hearthSignal: baseSignal(),
  });

  assert.doesNotMatch(answer, /Ready means recordable, not perfect/i);
  assert.match(answer, /approve and replace|move this script to anvil|hand off to anvil/i);
  assert.doesNotMatch(answer, /I scheduled|I recorded|I edited|I published|I stored/i);
});

test("hearth chat remains deterministic and boundary-safe", () => {
  const reply = buildHenryChatReply("Write me a full script and generate 10 titles.", baseContext(), {
    mode: "recording_ready",
    suggestion: { kind: "anvil_readiness", text: "This looks recordable. Not perfect, recordable." },
    hearthSignal: baseSignal(),
  });
  assert.equal(reply.lane, "user_metered");
  assert.doesNotMatch(reply.text, /publish|SEO|thumbnail/i);
  assert.doesNotMatch(reply.text, /I generated/i);
  assert.match(reply.text, /explicit hearth rewrite|generation action/i);
});

test("buildHenryChatAnswer remains backward-compatible and string-only", () => {
  const answer = buildHenryChatAnswer("What should I do next?", baseContext(), {
    mode: "recording_ready",
    suggestion: { kind: "anvil_readiness", text: "This looks recordable. Not perfect, recordable." },
    hearthSignal: baseSignal(),
  });
  assert.equal(typeof answer, "string");
  assert.match(answer, /approve and replace|hand off to anvil|Best next step:/i);
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
