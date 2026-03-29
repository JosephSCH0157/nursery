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
  });

  assert.equal(guidance.primaryAction, "seed_from_script");
  assert.equal(guidance.primaryActionLabel, "Pull Beats from Script");
  assert.match(guidance.cardLead, /pulling image beats from the script/i);
});

test("hearthImageMapWorkflow: selected beat without assets points to sourcing next", () => {
  const guidance = resolveImageMapWorkflowGuidance({
    manualOnly: false,
    entryCount: 4,
    hasSelection: true,
    candidateCount: 0,
    hasSelectedCandidate: false,
  });

  assert.equal(guidance.primaryAction, "find_stock");
  assert.equal(guidance.primaryActionLabel, "Find Stock");
  assert.match(guidance.cardLead, /bring in the image/i);
  assert.match(guidance.note, /uploading it is the quickest route/i);
});

test("hearthImageMapWorkflow: candidates without attachment points to choosing one", () => {
  const guidance = resolveImageMapWorkflowGuidance({
    manualOnly: false,
    entryCount: 4,
    hasSelection: true,
    candidateCount: 3,
    hasSelectedCandidate: false,
  });

  assert.equal(guidance.primaryAction, "select_candidate");
  assert.equal(guidance.primaryActionLabel, "Use This Image");
  assert.match(guidance.cardLead, /you have options now/i);
});

test("hearthImageMapWorkflow: attached beat shifts toward verification", () => {
  const guidance = resolveImageMapWorkflowGuidance({
    manualOnly: false,
    entryCount: 4,
    hasSelection: true,
    candidateCount: 3,
    hasSelectedCandidate: true,
  });

  assert.equal(guidance.primaryAction, "none");
  assert.equal(guidance.primaryActionLabel, null);
  assert.match(guidance.cardLead, /beat is attached/i);
});
