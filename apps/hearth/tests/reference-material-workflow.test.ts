import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReferenceVisualWorkflowFocus,
  isReferenceVisualFailureActionable,
  projectReferenceMaterialVisualAction,
} from "../src/lib/hearth-reference-material-workflow";
import type { ReferenceVisualOpportunity } from "../src/lib/hearth-reference-visual-authority";

function opportunity(
  overrides: Partial<ReferenceVisualOpportunity> = {},
): ReferenceVisualOpportunity {
  return {
    id: "opportunity-1",
    revisionId: "opportunity-revision-1",
    revision: 1,
    sourceStatus: "unresolved",
    subtype: "stat_card",
    focus: "A supported statistic",
    before: "",
    after: "",
    editorialReason: "Explain the number",
    desiredMaterial: "A clear statistic",
    searchTerms: [],
    placement: "At the cited moment",
    durationMs: 5000,
    sourceRevisionId: null,
    sourceLinkRevisionId: null,
    source: null,
    sourceUse: null,
    sourceUseSequenceId: null,
    sourceUseSequenceRevision: 0,
    evidence: [],
    evidenceSequenceId: null,
    evidenceSequenceRevision: 0,
    recipe: null,
    recipeSequenceId: null,
    recipeSequenceRevision: 0,
    rights: null,
    candidates: [],
    selectionRevision: 0,
    selectedCandidateRevisionId: null,
    releaseReady: false,
    ...overrides,
  };
}

const linkedSource = {
  memberId: "member-1",
  ordinal: 1,
  sourceRevisionId: "source-1",
  sourceLinkRevisionId: "link-1",
  sourceRevision: 1,
  sourceLinkRevision: 1,
  source: { title: "Current report" },
  link: {},
};

function project(
  visual: ReferenceVisualOpportunity,
  overrides: Partial<
    Parameters<typeof projectReferenceMaterialVisualAction>[0]
  > = {},
) {
  return projectReferenceMaterialVisualAction({
    opportunity: visual,
    resolution: null,
    ...overrides,
  });
}

test("Reference Material uses the detailed workflow projection for its next action", () => {
  const noSource = project(opportunity());
  assert.equal(noSource.action, "continue");
  assert.equal(noSource.label, "Choose a Source");
  assert.equal(noSource.target, "reference_visual_workflow");

  const factsOnlyNeedsEvidence = project(
    opportunity({
      sourceStatus: "linked",
      sources: [linkedSource],
      sourceUse: { use_classification: "facts_data_only" },
    }),
  );
  assert.equal(factsOnlyNeedsEvidence.label, "Confirm supporting evidence");
  assert.equal(factsOnlyNeedsEvidence.target, "reference_visual_workflow");
  assert.notEqual(factsOnlyNeedsEvidence.label, "Review rights");
  assert.equal(
    factsOnlyNeedsEvidence.workflow.usageSummary,
    "Facts/data only · no rights action needed",
  );
});

test("Reference Material sends a one-Source comparison back to Source instead of repeating evidence confirmation", () => {
  const comparison = project(
    opportunity({
      subtype: "comparison",
      sourceStatus: "linked",
      sources: [linkedSource],
      evidence: Array.from({ length: 15 }, (_, index) => ({
        id: `evidence-${index + 1}`,
        source_set_member_id: linkedSource.memberId,
        confirmation_state: "creator_confirmed",
        label: `Confirmed item ${index + 1}`,
        raw_excerpt: `Supported evidence ${index + 1}`,
      })),
    }),
  );

  assert.equal(comparison.action, "continue");
  assert.equal(comparison.label, "Add a comparison Source");
  assert.equal(comparison.workflow.currentStageId, "source");
  assert.equal(comparison.target, "reference_visual_workflow");
});

test("only a current release-ready candidate is directly approvable", () => {
  const candidate = {
    revisionId: "candidate-1",
    kind: "stat_card",
    assetId: "asset-1",
    imageUrl: null,
    releaseReady: true,
    currentForPlan: true,
    createdAt: "",
    provenance: {},
  };
  const current = opportunity({ candidates: [candidate] });
  assert.equal(project(current).action, "approve");
  assert.equal(project(current).target, "approval");

  const historical = opportunity({
    candidates: [{ ...candidate, currentForPlan: false }],
  });
  assert.equal(project(historical).action, "continue");
  assert.notEqual(project(historical).target, "approval");

  const blocked = project(current, { approvalBlocked: true });
  assert.equal(blocked.action, "continue");
  assert.equal(blocked.target, "reference_visual_workflow");
});

test("Hammer verification gates Ready and a failed approval returns to review", () => {
  const approved = opportunity({ selectedCandidateRevisionId: "candidate-1" });
  const unverified = project(approved, {
    resolution: "approved",
    hammerVerified: false,
  });
  assert.equal(unverified.action, "continue");
  assert.equal(unverified.label, "Review visual");
  assert.equal(unverified.target, "reference_visual_workflow");
  assert.equal(isReferenceVisualFailureActionable("approve", unverified), true);

  const verified = project(approved, {
    resolution: "approved",
    hammerVerified: true,
  });
  assert.equal(verified.action, "ready");
  assert.equal(verified.label, "Ready");
  assert.equal(verified.target, "none");
  assert.equal(isReferenceVisualFailureActionable("approve", verified), false);
});

test("skip remains terminal and visual mutation failures do not reopen outer drawers", () => {
  const skipped = project(opportunity(), { resolution: "skipped" });
  assert.equal(skipped.action, "skipped");
  assert.equal(skipped.target, "none");
  assert.equal(isReferenceVisualFailureActionable("skip", skipped), false);

  const current = project(opportunity());
  assert.equal(isReferenceVisualFailureActionable("replace", current), false);
  assert.equal(
    isReferenceVisualFailureActionable("save_edits", current),
    false,
  );
  assert.equal(
    isReferenceVisualFailureActionable("use_source", current),
    false,
  );
  assert.equal(isReferenceVisualFailureActionable("skip", current), true);
});

test("the detailed workflow transition preserves exact canonical identity", () => {
  const focus = buildReferenceVisualWorkflowFocus({
    workspaceId: "workspace-1",
    workpieceId: "workpiece-1",
    returnCardKey: "reference_visual:opportunity-1",
    opportunity: opportunity({
      sourceSetRevisionId: "source-set-revision-1",
      rights: { id: "rights-revision-1" },
    }),
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
