import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EpisodeMediaMapPanel from "../src/components/visuals/EpisodeMediaMapPanel";
import {
  describeHearthVisualPlanOperation,
  type HearthVisualPlanFailure,
  type HearthVisualPlanOperationStage,
} from "../src/lib/hearth-visual-plan-operation";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const generationSource = fs.readFileSync(
  path.resolve(testDir, "../src/hooks/visuals/useMediaMapGenerationActions.ts"),
  "utf8",
);
const panelSource = fs.readFileSync(
  path.resolve(testDir, "../src/components/visuals/EpisodeMediaMapPanel.tsx"),
  "utf8",
);
const shellSource = fs.readFileSync(
  path.resolve(testDir, "../src/routes/HearthShell.tsx"),
  "utf8",
);
const entryActionsSource = fs.readFileSync(
  path.resolve(testDir, "../src/hooks/visuals/useMediaMapEntryActions.ts"),
  "utf8",
);

const noop = () => undefined;
const panelProps = {
  canonicalItems: [],
  entries: [],
  selectedEntryId: null,
  scriptVersionLabel: "v1",
  mapStatus: "draft",
  stale: false,
  saveState: "error" as const,
  packageState: "loaded" as const,
  packageError: null,
  generateDisabledReason: null,
  message: null,
  disabled: false,
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

function renderFailurePresentation(args: {
  operationStage: HearthVisualPlanOperationStage;
  operationFailure: HearthVisualPlanFailure | null;
  saveError: string | null;
}): string {
  return renderToStaticMarkup(createElement(EpisodeMediaMapPanel, { ...panelProps, ...args }));
}

test("hearthVisualPlanOperation: every operation stage has creator-facing copy", () => {
  const stages: HearthVisualPlanOperationStage[] = [
    "idle",
    "generating",
    "validating",
    "refreshing",
    "complete",
    "failed",
  ];

  for (const stage of stages) {
    const status = describeHearthVisualPlanOperation(stage);
    assert.equal(status.stage, stage);
    assert.ok(status.message.trim().length > 0);
  }
  assert.match(describeHearthVisualPlanOperation("generating").message, /saves this generation atomically/i);
  assert.match(describeHearthVisualPlanOperation("refreshing").message, /canonical projections/i);
  assert.equal(describeHearthVisualPlanOperation("failed").message, "Visual plan generation failed. Please try again.");
  assert.doesNotMatch(describeHearthVisualPlanOperation("failed").message, /review the error/i);
});

test("hearthVisualPlanOperation: both generation commands publish truthful terminal stages", () => {
  assert.equal((generationSource.match(/setVisualPlanOperationStage\("generating"\)/g) ?? []).length, 2);
  assert.equal((generationSource.match(/setVisualPlanOperationStage\("validating"\)/g) ?? []).length, 2);
  assert.equal((generationSource.match(/setVisualPlanOperationStage\("refreshing"\)/g) ?? []).length, 2);
  assert.equal((generationSource.match(/setVisualPlanOperationStage\("complete"\)/g) ?? []).length, 2);
  assert.ok((generationSource.match(/setVisualPlanOperationStage\("failed"\)/g) ?? []).length >= 6);
  assert.equal((generationSource.match(/finally \{\s*args\.setIsMediaMapBusy\(false\);\s*\}/g) ?? []).length, 2);
});

test("hearthVisualPlanOperation: presentation is accessible and local controls restore in finally", () => {
  assert.match(panelSource, /role="status"/);
  assert.match(panelSource, /aria-live="polite"/);
  assert.match(panelSource, /aria-atomic="true"/);
  assert.match(panelSource, /data-operation-stage=\{props\.operationStage\}/);
  assert.match(panelSource, /props\.operationStage === "failed" && \(props\.operationFailure \|\| props\.saveError\)/);
  assert.match(panelSource, /Why it failed:/);
  assert.doesNotMatch(panelSource, /<summary>View details<\/summary>/);
  assert.match(panelSource, /Duplicate generation is disabled until this operation finishes\./);
  assert.match(panelSource, /finally \{\s*setIsConversationApplying\(false\);\s*\}/);
});

test("hearthVisualPlanOperation: structured failure is preferred with a safe fallback only in failed state", () => {
  const structuredFailure: HearthVisualPlanFailure = {
    status: 502,
    code: "visual_plan_provider_unavailable",
    stage: "provider_transport",
    message: "The Visual Plan provider is temporarily unavailable.",
  };
  const sensitiveFallback = "raw provider response: secret-token-value";
  const structuredHtml = renderFailurePresentation({
    operationStage: "failed",
    operationFailure: structuredFailure,
    saveError: sensitiveFallback,
  });
  assert.match(structuredHtml, /The Visual Plan provider is temporarily unavailable\./);
  assert.match(structuredHtml, /visual_plan_provider_unavailable/);
  assert.doesNotMatch(structuredHtml, /secret-token-value|raw provider response/i);

  const fallbackHtml = renderFailurePresentation({
    operationStage: "failed",
    operationFailure: null,
    saveError: "Unable to verify the canonical Visual Plan.",
  });
  assert.match(fallbackHtml, /Unable to verify the canonical Visual Plan\./);

  const successfulHtml = renderFailurePresentation({
    operationStage: "complete",
    operationFailure: structuredFailure,
    saveError: null,
  });
  assert.doesNotMatch(successfulHtml, /Why it failed|temporarily unavailable/);

  const independentSaveFailureHtml = renderFailurePresentation({
    operationStage: "idle",
    operationFailure: null,
    saveError: "Unable to save the edited media-map entry.",
  });
  assert.match(independentSaveFailureHtml, /Unable to save the edited media-map entry\./);
  assert.doesNotMatch(independentSaveFailureHtml, /Why it failed/);
});

test("hearthVisualPlanOperation: independent save attempts clear earlier save errors", () => {
  assert.ok((entryActionsSource.match(/setMediaMapSaveState\("saving"\);\s*args\.setMediaMapSaveError\(null\);/g) ?? []).length >= 3);
  assert.ok((entryActionsSource.match(/args\.setMediaMapSaveState\("saved"\)/g) ?? []).length >= 3);
});

test("hearthVisualPlanOperation: canonical summary includes every visual family", () => {
  assert.match(panelSource, /kind: "image" \| "broll" \| "reference_clip" \| "reference_visual"/);
  assert.match(panelSource, /referenceVisuals: canonicalItems\.filter/);
  assert.match(shellSource, /\.\.\.\(canonicalReferenceVisualState\?\.opportunities \?\? \[\]\)\.map/);
  assert.match(shellSource, /kind: "reference_visual" as const/);
  assert.match(panelSource, /Source Clips:/);
  assert.match(panelSource, /Reference Visuals:/);
  assert.doesNotMatch(panelSource, /Data\/graphics: \{hasCanonicalProjection \? 0/);
});
