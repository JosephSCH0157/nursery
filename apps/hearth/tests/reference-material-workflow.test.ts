import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReferenceVisualWorkflowFocus,
  projectReferenceMaterialVisualAction,
} from "../src/lib/hearth-reference-material-workflow";
import type { ReferenceVisualOpportunity } from "../src/lib/hearth-reference-visual-authority";

const project = (
  overrides: Partial<Parameters<typeof projectReferenceMaterialVisualAction>[0]> = {},
) =>
  projectReferenceMaterialVisualAction({
    sourceLinked: true,
    rightsSaved: true,
    subtype: "stat_card",
    candidateReady: false,
    resolution: null,
    ...overrides,
  });

test("Reference Material projects the creator's next meaningful visual action", () => {
  assert.deepEqual(project({ sourceLinked: false }), {
    action: "add_source",
    label: "Add Source",
    target: "source_drawer",
    disabled: false,
  });
  assert.equal(project({ rightsSaved: false }).label, "Review rights");
  assert.equal(project({ subtype: "archival_still" }).label, "Acquire image");
  assert.equal(project({ subtype: "archival_sequence" }).label, "Acquire image");

  for (const subtype of [
    "stat_card",
    "chart",
    "timeline",
    "comparison",
    "document_excerpt",
    "quote_card",
  ] as const) {
    const state = project({ subtype });
    assert.equal(state.label, "Design visual");
    assert.equal(state.target, "reference_visual_workflow");
  }

  assert.equal(project({ candidateReady: true }).label, "Approve");
  assert.deepEqual(project({ resolution: "approved" }), {
    action: "ready",
    label: "Ready",
    target: "none",
    disabled: true,
  });
  assert.deepEqual(project({ resolution: "skipped" }), {
    action: "skipped",
    label: "Skipped",
    target: "none",
    disabled: true,
  });
});

test("a rights-complete stat card advances to design instead of reopening rights", () => {
  const state = project({ subtype: "stat_card", rightsSaved: true });
  assert.equal(state.action, "design_visual");
  assert.equal(state.target, "reference_visual_workflow");
  assert.notEqual(state.target, "rights_drawer");
  assert.notEqual(state.target, "acquisition_drawer");
});

test("retry uses the currently projected target instead of the obsolete prepare loop", () => {
  const current = project({ subtype: "stat_card", rightsSaved: true });
  assert.equal(current.target, "reference_visual_workflow");
  assert.notEqual(current.target, "rights_drawer");
});

test("the detailed workflow transition preserves exact canonical identity", () => {
  const focus = buildReferenceVisualWorkflowFocus({
    workspaceId: "workspace-1",
    workpieceId: "workpiece-1",
    returnCardKey: "reference_visual:opportunity-1",
    opportunity: {
      id: "opportunity-1",
      revisionId: "opportunity-revision-1",
      sourceSetRevisionId: "source-set-revision-1",
      rights: { id: "rights-revision-1" },
    } as unknown as ReferenceVisualOpportunity,
  });
  assert.deepEqual(focus, {
    workspaceId: "workspace-1",
    workpieceId: "workpiece-1",
    opportunityId: "opportunity-1",
    opportunityRevisionId: "opportunity-revision-1",
    sourceSetRevisionId: "source-set-revision-1",
    rightsRevisionId: "rights-revision-1",
    returnCardKey: "reference_visual:opportunity-1",
  });
});
