import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  describeHearthVisualPlanOperation,
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
  assert.match(panelSource, /Duplicate generation is disabled until this operation finishes\./);
  assert.match(panelSource, /finally \{\s*setIsConversationApplying\(false\);\s*\}/);
});

