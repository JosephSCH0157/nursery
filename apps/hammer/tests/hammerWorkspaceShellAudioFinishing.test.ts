import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHammerAudioFinishingRequestLifecycle } from "../src/editor/useHammerWorkspaceShellAudioFinishing";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { applyHammerStudioRackNativePreview } from "../src/editor/hammerStudioRackNativePreview";

test("audio finishing request lifecycle rejects stale settings and source identities", () => {
  const lifecycle = createHammerAudioFinishingRequestLifecycle("workpiece-a|source-a|rack-a");
  const first = lifecycle.begin();
  lifecycle.syncIdentity("workpiece-a|source-a|rack-b");
  assert.equal(lifecycle.accepts(first), false);
  const second = lifecycle.begin();
  assert.equal(lifecycle.accepts(second), true);
  lifecycle.syncIdentity("workpiece-b|source-b|rack-b");
  assert.equal(lifecycle.accepts(second), false);
});

test("a newer processing request invalidates an older request on the same identity", () => {
  const lifecycle = createHammerAudioFinishingRequestLifecycle("same-source-and-rack");
  const first = lifecycle.begin();
  const second = lifecycle.begin();
  assert.equal(lifecycle.accepts(first), false);
  assert.equal(lifecycle.accepts(second), true);
});

test("native compare preview preserves bypass semantics", () => {
  const rack = createDefaultHammerStudioRackState();
  const calls: string[] = [];
  const media = { volume: 1 } as HTMLMediaElement;
  Object.defineProperty(media, "preservesPitch", { value: true, writable: true });
  applyHammerStudioRackNativePreview(media, { ...rack, is_bypassed: true });
  calls.push(String(media.volume));
  assert.deepEqual(calls, ["1"]);
});

test("slot-specific hooks preserve shell and mixed preview registration order", async () => {
  const shell = await readFile(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf8");
  const preview = await readFile(new URL("../src/editor/useHammerWorkspaceShellPreviewRuntime.ts", import.meta.url), "utf8");
  const rack = shell.indexOf("useHammerAudioFinishingStudioRackState()");
  const cleanupReview = shell.indexOf("useHammerWorkspaceShellCleanupCandidateReview({");
  const polish = shell.indexOf("useHammerAudioFinishingPolishState(props.audioPolish)");
  assert.ok(rack >= 0 && cleanupReview > rack && polish > cleanupReview);
  const audioState = preview.indexOf("useHammerAudioFinishingPreviewSourceState()");
  const visualState = preview.indexOf("useHammerVisualPreviewRuntimeState()");
  const audioRefs = preview.indexOf("useHammerAudioFinishingPreviewRefs()");
  const audioEffects = preview.indexOf("useHammerAudioFinishingPreviewEffects({");
  const visualDerived = preview.indexOf("useHammerVisualPreviewRuntimeDerived({");
  assert.ok(audioState >= 0 && visualState > audioState && audioRefs > visualState && audioEffects > audioRefs && visualDerived > audioEffects);
});

test("audio authority owns backend execution, cleanup, history metadata, and excludes neighbors", async () => {
  const authority = await readFile(new URL("../src/editor/useHammerWorkspaceShellAudioFinishing.ts", import.meta.url), "utf8");
  const preview = await readFile(new URL("../src/editor/useHammerWorkspaceShellPreviewRuntime.ts", import.meta.url), "utf8");
  assert.ok(authority.includes("executeDialogueAudioRenderWithBackend"));
  assert.ok(authority.includes("URL.revokeObjectURL"));
  assert.ok(authority.includes('kind: "editor_state_change"'));
  assert.ok(authority.includes("immediatePersist: true"));
  assert.equal(preview.includes("executeDialogueAudioRenderWithBackend"), false);
  assert.equal(authority.includes("hammerCleanupCandidateQueue"), false);
  assert.equal(authority.includes("Caption"), false);
  assert.equal(authority.includes("AutomaticPlacement"), false);
});
