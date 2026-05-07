import assert from "node:assert/strict";
import test from "node:test";
import type { HearthHenrySignal, HenryContext } from "@forge/shared/henry";
import { getHenryNextStep } from "../src/henry/henry-next-step.ts";

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

test("returns hearth structuring next step from signal state", () => {
  const next = getHenryNextStep(baseContext(), baseSignal({ hasPacingCues: false }));
  assert.ok(next);
  assert.match(next ?? "", /read-aloud shaping pass|pacing cues/i);
});

test("returns blocked next step for invalid tags", () => {
  const next = getHenryNextStep(baseContext(), baseSignal({ tagValidationOk: false }));
  assert.ok(next);
  assert.match(next ?? "", /Fix speaker tags first/i);
});

test("returns null outside Hearth", () => {
  const next = getHenryNextStep(baseContext({ surface: "anvil" }), baseSignal());
  assert.equal(next, null);
});
