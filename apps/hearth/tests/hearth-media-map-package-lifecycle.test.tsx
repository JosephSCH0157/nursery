import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EpisodeMediaMapPanel from "../src/components/visuals/EpisodeMediaMapPanel";

const noop = () => undefined;
const baseProps = {
  entries: [],
  selectedEntryId: null,
  scriptVersionLabel: "v1",
  mapStatus: "draft",
  stale: false,
  saveState: "saved" as const,
  saveError: null,
  packageError: null,
  generateDisabledReason: null,
  message: null,
  generationScope: "full_media_plan",
  budgetPolicy: {
    estimatedDurationSec: 504,
    durationSource: "word_count" as const,
    minimumPlacements: 12,
    targetPlacements: 13,
    maximumPlacements: 14,
    defaultMotionAllowance: 2,
  },
  draft: {
    type: "image", anchorMode: "phrase_match", anchorTarget: "", inOffsetSec: "0",
    durationSec: "6", description: "", intent: "", sourceStatus: "unresolved",
    sourceAssetId: "", confidence: "medium", optional: false, critical: false,
  },
  conversation: { state: "idle" as const, seed: null, error: null, onBuildAndApply: async () => false },
  onSelectEntry: noop,
  onDraftChange: noop,
  onGenerationScopeChange: noop,
  onGenerateFromPlans: noop,
  onActivateMap: noop,
  onAddEntry: noop,
  onSaveEntry: noop,
  onDeleteEntry: noop,
  onRetryLoad: noop,
  canRecoverLastGeneration: false,
  onRecoverLastGeneration: noop,
};

function render(packageState: "idle" | "loading" | "loaded" | "error", disabled: boolean, packageError: string | null = null) {
  return renderToStaticMarkup(createElement(EpisodeMediaMapPanel, {
    ...baseProps,
    packageState,
    packageError,
    disabled,
    generateDisabledReason: disabled ? "Package unavailable" : null,
  }));
}

test("workpiece loading masks editor save state", () => {
  const html = render("loading", true);
  assert.match(html, /Episode package is loading/);
  assert.doesNotMatch(html, />saved</);
  assert.doesNotMatch(html, /Generate Media Map|No media map is applied yet|0 mapped beats/);
});

test("successful zero-entry package load shows saved and enables generation", () => {
  const html = render("loaded", false);
  assert.match(html, />saved</);
  assert.doesNotMatch(html, /Generate Media Map[\s\S]*?disabled/);
  assert.match(html, /0 mapped beats/);
});

test("failed package load shows its error and never shows saved", () => {
  const html = render("error", true, "Canonical metadata request failed.");
  assert.match(html, /Episode package unavailable: Canonical metadata request failed/);
  assert.match(html, /Retry Load/);
  assert.doesNotMatch(html, />saved</);
  assert.doesNotMatch(html, /No media map is applied yet|Generate Media Map/);
});

test("recoverable generation is explicit and does not mask the loaded empty state", () => {
  const html = renderToStaticMarkup(createElement(EpisodeMediaMapPanel, {
    ...baseProps, packageState: "loaded", packageError: null, disabled: false,
    generateDisabledReason: null, canRecoverLastGeneration: true,
  }));
  assert.match(html, /Generate Media Map/);
  assert.match(html, /Recover last generation/);
});

test("package lifecycle and media-map save lifecycle have independent writers", () => {
  const loader = readFileSync(resolve(process.cwd(), "src/hooks/visuals/useEpisodePackageLoader.ts"), "utf8");
  const workspace = readFileSync(resolve(process.cwd(), "src/hooks/visuals/useMediaMapWorkspace.ts"), "utf8");
  assert.match(loader, /setEpisodePackageState\("loading"\)/);
  assert.match(loader, /setEpisodePackageState\("loaded"\)/);
  assert.match(loader, /setEpisodePackageState\("error"\)/);
  assert.match(loader, /Episode package load timed out\. Retry Load\./);
  assert.doesNotMatch(loader, /operationAuthority\.isCurrent\(operation\)/);
  const switchBody = loader.match(/if \(artifactStateWorkpieceIdRef\.current !== episodeId\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
  assert.doesNotMatch(switchBody, /setMediaMapSaveState\("saved"\)/);
  const resetBody = workspace.match(/const resetMediaMapWorkspaceForWorkpieceSwitch[\s\S]*?\}, \[\]\);/)?.[0] ?? "";
  assert.doesNotMatch(resetBody, /setMediaMapSaveState/);
});
