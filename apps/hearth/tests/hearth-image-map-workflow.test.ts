import assert from "node:assert/strict";
import test from "node:test";
import { resolveImageMapWorkflowGuidance } from "../src/lib/hearth-image-map-workflow";

test("hearthImageMapWorkflow: empty timeline images points to script seeding first", () => {
  const guidance = resolveImageMapWorkflowGuidance({
    manualOnly: false,
    entryCount: 0,
    hasSelection: false,
    candidateCount: 0,
    hasSelectedCandidate: false,
    sourceType: "stock",
  });

  assert.equal(guidance.primaryAction, "seed_from_script");
  assert.equal(guidance.primaryActionLabel, "Pull Beats from Script");
  assert.match(guidance.cardLead, /pulling beats from the script/i);
});

test("hearthImageMapWorkflow: selected beat without assets points to sourcing next", () => {
  const guidance = resolveImageMapWorkflowGuidance({
    manualOnly: false,
    entryCount: 4,
    hasSelection: true,
    candidateCount: 0,
    hasSelectedCandidate: false,
    sourceType: "stock",
  });

  assert.equal(guidance.primaryAction, "find_stock");
  assert.equal(guidance.primaryActionLabel, "Find Stock");
  assert.match(guidance.cardLead, /bringing in the image/i);
  assert.match(guidance.note, /bring that in instead/i);
});

test("hearthImageMapWorkflow: candidates without attachment points to choosing one", () => {
  const guidance = resolveImageMapWorkflowGuidance({
    manualOnly: false,
    entryCount: 4,
    hasSelection: true,
    candidateCount: 3,
    hasSelectedCandidate: false,
    sourceType: "stock",
  });

  assert.equal(guidance.primaryAction, "select_candidate");
  assert.equal(guidance.primaryActionLabel, "Use This Image");
  assert.match(guidance.cardLead, /you've got options now/i);
});

test("hearthImageMapWorkflow: attached beat shifts toward verification", () => {
  const guidance = resolveImageMapWorkflowGuidance({
    manualOnly: false,
    entryCount: 4,
    hasSelection: true,
    candidateCount: 3,
    hasSelectedCandidate: true,
    sourceType: "stock",
  });

  assert.equal(guidance.primaryAction, "none");
  assert.equal(guidance.primaryActionLabel, null);
  assert.match(guidance.cardLead, /this one's set/i);
});

test("hearthImageMapWorkflow: owned-asset sourcing promotes upload action", () => {
  const guidance = resolveImageMapWorkflowGuidance({
    manualOnly: false,
    entryCount: 2,
    hasSelection: true,
    candidateCount: 0,
    hasSelectedCandidate: false,
    sourceType: "upload",
  });

  assert.equal(guidance.primaryAction, "upload_asset");
  assert.equal(guidance.primaryActionLabel, "Use Your Own Image");
  assert.match(guidance.note, /fastest path/i);
});
