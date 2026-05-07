import assert from "node:assert/strict";
import test from "node:test";
import type { HearthHenrySignal, HenryContext } from "@forge/shared/henry";
import { deriveHenryMode } from "../src/henry/henry-mode.ts";

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

test("deriveHenryMode gracefully falls back when signal is unavailable", () => {
  const mode = deriveHenryMode({ context: baseContext(), hearthSignal: null });
  assert.equal(mode, null);
});

test("deriveHenryMode resolves warming when spark exists and draft is missing", () => {
  const mode = deriveHenryMode({
    context: baseContext(),
    hearthSignal: baseSignal({ hasActiveSpark: true, hasDraft: false }),
  });
  assert.equal(mode, "warming");
});

test("deriveHenryMode resolves blocked when draft exists with validation issues", () => {
  const mode = deriveHenryMode({
    context: baseContext(),
    hearthSignal: baseSignal({ hasDraft: true, tagValidationOk: false }),
  });
  assert.equal(mode, "blocked");
});

test("deriveHenryMode resolves structuring when tags are valid but pacing is weak", () => {
  const mode = deriveHenryMode({
    context: baseContext(),
    hearthSignal: baseSignal({ hasDraft: true, tagValidationOk: true, hasPacingCues: false }),
  });
  assert.equal(mode, "structuring");
});

test("deriveHenryMode resolves recording_ready for paced and valid scripts", () => {
  const mode = deriveHenryMode({
    context: baseContext(),
    hearthSignal: baseSignal({ hasDraft: true, tagValidationOk: true, hasPacingCues: true }),
  });
  assert.equal(mode, "recording_ready");
});

test("deriveHenryMode resolves reviewing when approved script is being reviewed", () => {
  const mode = deriveHenryMode({
    context: baseContext(),
    hearthSignal: baseSignal({ hasDraft: true, tagValidationOk: true, hasPacingCues: true, isApprovedOrReady: true }),
  });
  assert.equal(mode, "reviewing");
});

test("deriveHenryMode resolves idle when there is no active episode context", () => {
  const context = {
    ...baseContext(),
    workpieceId: null,
    episodeContextState: "none" as const,
  };
  const mode = deriveHenryMode({
    context,
    hearthSignal: baseSignal({ workpieceId: null, hasActiveSpark: false, hasDraft: false }),
  });
  assert.equal(mode, "idle");
});

