import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHammerTranscriptCleanupLifecycle } from "../src/editor/useHammerWorkspaceShellTranscriptCleanup";
import { previewRemoveFillers } from "../src/editor/hammerCleanupTools";

test("cleanup preview remains advisory and leaves transcript input unchanged", () => {
  const segments = [{
    segment_id: "s1",
    speaker: "S1",
    text: "Um, this is the take.",
    start_sec: 0,
    end_sec: 2,
  }];
  const before = structuredClone(segments);
  const preview = previewRemoveFillers(segments, {
    aggressiveness: "medium",
    protectIntentionalPhrasing: true,
  });
  const lifecycle = createHammerTranscriptCleanupLifecycle("workpiece-a|revision-1");
  lifecycle.bindPreview(preview);
  assert.deepEqual(segments, before);
  assert.equal(lifecycle.canApply(preview), true);
});

test("new request and identity invalidate stale cleanup responses", () => {
  const lifecycle = createHammerTranscriptCleanupLifecycle("workpiece-a|revision-1");
  const requestA = lifecycle.beginRequest();
  const requestB = lifecycle.beginRequest();
  assert.equal(lifecycle.accepts(requestA), false);
  assert.equal(lifecycle.accepts(requestB), true);
  lifecycle.syncIdentity("workpiece-b|revision-2");
  assert.equal(lifecycle.accepts(requestB), false);
});

test("one accepted cleanup preview cannot be applied twice", () => {
  const lifecycle = createHammerTranscriptCleanupLifecycle("workpiece-a|revision-1");
  const preview = {};
  lifecycle.bindPreview(preview);
  assert.equal(lifecycle.canApply(preview), true);
  lifecycle.markApplied(preview);
  assert.equal(lifecycle.canApply(preview), false);
});

test("controller routes accepted cleanup through history and excludes adjacent authorities", async () => {
  const source = await readFile(
    new URL("../src/editor/useHammerWorkspaceShellTranscriptCleanup.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("args.applyHistoryMutation({"));
  assert.ok(source.includes("args.applyCompositionCleanup({ preview, toolId })"));
  assert.ok(source.includes("kind: \"cleanup_tool\""));
  assert.ok(source.includes("immediatePersist: true"));
  assert.equal(source.includes("hammerDeadAirClosure"), false);
  assert.equal(source.includes("hammerCandidateQueue"), false);
  assert.equal(source.includes("hammerSilenceCutSuggestions"), false);
});
