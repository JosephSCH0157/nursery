import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDefaultHammerVoicePolishState,
  setHammerVoiceCleanupEnabled,
} from "../src/editor/hammerVoicePolish";

async function testVoiceCleanupToggleState() {
  const initial = createDefaultHammerVoicePolishState();
  assert.equal(initial.voice_cleanup_enabled, false);

  const enabled = setHammerVoiceCleanupEnabled(initial, true);
  assert.equal(enabled.voice_cleanup_enabled, true);

  const disabled = setHammerVoiceCleanupEnabled(enabled, false);
  assert.equal(disabled.voice_cleanup_enabled, false);
}

async function testAudioFinalizationControlIsControlledAndAccessible() {
  const toolBayPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/editor/HammerWorkspaceShellToolBay.tsx");
  const source = await readFile(toolBayPath, "utf-8");
  assert.equal(
    source.includes("checked={Boolean(voicePolish?.voice_cleanup_enabled)}"),
    true,
    "Voice Cleanup checkbox must be controlled by canonical voice polish state.",
  );
  assert.equal(
    source.includes("className={`hammer-tool-field hammer-audio-fix ${voicePolish?.voice_cleanup_enabled ? \"is-active\" : \"\"}`}"),
    true,
    "Voice Cleanup card should derive active visual state from canonical boolean.",
  );
  assert.equal(source.includes('aria-label="Voice Cleanup"'), true, "Voice Cleanup checkbox must have an accessible name.");
  assert.equal(
    source.includes("hammer-audio-fix__checkmark"),
    true,
    "Active audio cards should render a visible checkmark marker.",
  );
}

async function run() {
  await testVoiceCleanupToggleState();
  await testAudioFinalizationControlIsControlledAndAccessible();
  console.log("Hammer audio finalization UI state tests passed.");
}

run().catch((error) => {
  console.error("Hammer audio finalization UI state tests failed:", error);
  process.exitCode = 1;
});
