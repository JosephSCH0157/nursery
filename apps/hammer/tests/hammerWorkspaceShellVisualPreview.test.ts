import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildHammerBackgroundBlurSettings,
  buildHammerVisualPreviewFilter,
  resolveHammerVisualPresetFilter,
} from "../src/editor/useHammerWorkspaceShellVisualPreview";

test("look and exposure projection preserves exact filter order, rounding, and units", () => {
  assert.equal(resolveHammerVisualPresetFilter("warm_studio"), "sepia(0.08) saturate(1.08)");
  assert.equal(buildHammerVisualPreviewFilter({
    lookPreset: "warm_studio", exposureAdjustment: 20, whiteBalance: -9, colorAmount: 40,
  }), "sepia(0.08) saturate(1.08) brightness(1.07) hue-rotate(-3.0deg) saturate(1.10)");
  assert.equal(buildHammerVisualPreviewFilter({
    lookPreset: null, exposureAdjustment: null, whiteBalance: 0, colorAmount: 0,
  }), "brightness(1.00) hue-rotate(0.0deg) saturate(1.00)");
});

test("background projection preserves clamping, fallbacks, and trimmed replacement identity", () => {
  assert.deepEqual(buildHammerBackgroundBlurSettings({
    enabled: true, blurPx: 100, replacementEnabled: true, replacementMode: "image",
    replacementColor: "#2b2b2b", replacementImageUrl: "  preview://image  ", washEnabled: true,
    washDimAmount: 2, washDesaturateAmount: -1, edgeFeatherPx: 80,
    temporalSmoothing: 4, subjectExpansionPx: -20, qualityMode: "medium", fallbackMode: "disable",
  }), {
    enabled: true, blurPx: 64, replacementEnabled: true, replacementMode: "image",
    replacementColor: "#2b2b2b", replacementImageUrl: "preview://image", washEnabled: true,
    washDimAmount: 1, washDesaturateAmount: 0, edgeFeatherPx: 64,
    temporalSmoothing: 1, subjectExpansionPx: -12, qualityMode: "medium", fallbackMode: "disable",
  });
});

test("visual authority remains projection-only and retains the 48ms preview cadence", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const authority = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellVisualPreview.ts"), "utf8");
  assert.match(authority, /does not own[\s\S]*timeline placement[\s\S]*automatic placement/);
  assert.match(authority, /setPreviewSettings\(settings\); \}, 48\)/);
  assert.doesNotMatch(authority, /resolveHammerAutomaticPlacementCommand|onWorkspaceSnapshotChange|saveHammer/);
});

test("mixed runtime preserves audio then visual registration and delegates visual algorithms", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const runtime = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellPreviewRuntime.ts"), "utf8");
  const audioState = runtime.indexOf("useHammerAudioFinishingPreviewSourceState()");
  const visualState = runtime.indexOf("useHammerVisualPreviewRuntimeState()");
  const audioEffects = runtime.indexOf("useHammerAudioFinishingPreviewEffects({");
  assert.ok(audioState >= 0 && visualState > audioState && audioEffects > visualState);
  assert.doesNotMatch(runtime, /resolveSegmentationProviderDescriptor\(args\.visualBackgroundBlurProviderId/);
});

test("shell consumes visual authority without reacquiring projection algorithms", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const shell = fs.readFileSync(path.join(root, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  const placementAuthority = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellAutomaticPlacement.ts"), "utf8");
  assert.match(shell, /useHammerVisualPreviewState\(props\.initialVisualPreviewSettings\)/);
  assert.match(shell, /useHammerVisualPreviewProjection\(/);
  assert.match(shell, /useHammerBackgroundBlurProjection\(/);
  assert.doesNotMatch(shell, /function resolveVisualPresetFilter|setPreviewBackgroundBlurSettings/);
  assert.doesNotMatch(shell, /resolveHammerAutomaticPlacementCommand/);
  assert.match(placementAuthority, /resolveHammerAutomaticPlacementCommand/);
});
