import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { projectReferenceVisualCustomerWorkflow } from "../src/lib/hearth-reference-visual-customer-workflow";
import type { ReferenceVisualOpportunity } from "../src/lib/hearth-reference-visual-authority";

const panelSource = readFileSync(
  new URL(
    "../src/components/visuals/CanonicalReferenceVisualPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const visualStyles = readFileSync(
  new URL("../src/views/surfaces/VisualsSurface.css", import.meta.url),
  "utf8",
);

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

test("customer workflow keeps five stable stages and starts with Source", () => {
  const workflow = projectReferenceVisualCustomerWorkflow({
    opportunity: opportunity(),
    evidenceReady: false,
    recipeCurrent: false,
    renderedType: true,
  });

  assert.deepEqual(
    workflow.stages.map(({ id, label }) => ({ id, label })),
    [
      { id: "source", label: "Source" },
      { id: "evidence", label: "Evidence" },
      { id: "usage-rights", label: "Usage & rights" },
      { id: "design", label: "Design" },
      { id: "generate", label: "Generate" },
    ],
  );
  assert.equal(workflow.currentStageId, "source");
  assert.equal(workflow.nextAction, "Choose a Source");
});

test("facts-only usage keeps the rights stage visible and satisfied", () => {
  const workflow = projectReferenceVisualCustomerWorkflow({
    opportunity: opportunity({
      sourceStatus: "linked",
      sources: [
        {
          memberId: "member-1",
          ordinal: 1,
          sourceRevisionId: "source-1",
          sourceLinkRevisionId: "link-1",
          sourceRevision: 1,
          sourceLinkRevision: 1,
          source: { title: "Fuel price report" },
          link: {},
        },
      ],
      evidence: [{ id: "evidence-1" }],
      sourceUse: { use_classification: "facts_data_only" },
    }),
    evidenceReady: true,
    recipeCurrent: false,
    renderedType: true,
  });

  const usage = workflow.stages.find((stage) => stage.id === "usage-rights");
  assert.equal(usage?.status, "complete");
  assert.equal(usage?.summary, "Facts/data only · no rights action needed");
  assert.equal(workflow.currentStageId, "design");
  assert.equal(workflow.nextAction, "Prepare visual design");
});

test("quoted material stops at rights until the declaration is current", () => {
  const workflow = projectReferenceVisualCustomerWorkflow({
    opportunity: opportunity({
      sourceStatus: "linked",
      sources: [
        {
          memberId: "member-1",
          ordinal: 1,
          sourceRevisionId: "source-1",
          sourceLinkRevisionId: "link-1",
          sourceRevision: 1,
          sourceLinkRevision: 1,
          source: { title: "Interview transcript" },
          link: {},
        },
      ],
      evidence: [{ id: "evidence-1" }],
      sourceUse: { use_classification: "quoted_or_excerpted_text" },
    }),
    evidenceReady: true,
    recipeCurrent: false,
    renderedType: true,
  });

  assert.equal(workflow.currentStageId, "usage-rights");
  assert.equal(workflow.nextAction, "Resolve rights");
  assert.equal(workflow.usageSummary, "Rights action needed");
});

test("only current release-ready candidates become the recommended selection", () => {
  const base = opportunity({
    sourceStatus: "linked",
    sources: [
      {
        memberId: "member-1",
        ordinal: 1,
        sourceRevisionId: "source-1",
        sourceLinkRevisionId: "link-1",
        sourceRevision: 1,
        sourceLinkRevision: 1,
        source: { title: "Current report" },
        link: {},
      },
    ],
    evidence: [{ id: "evidence-1" }],
    sourceUse: { use_classification: "facts_data_only" },
    recipe: { id: "recipe-1" },
    candidates: [
      {
        revisionId: "historical",
        kind: "stat_card",
        assetId: "asset-1",
        imageUrl: null,
        releaseReady: true,
        currentForPlan: false,
        createdAt: "",
        provenance: {},
      },
    ],
  });
  const staleOnly = projectReferenceVisualCustomerWorkflow({
    opportunity: base,
    evidenceReady: true,
    recipeCurrent: true,
    renderedType: true,
  });
  assert.equal(staleOnly.nextAction, "Generate visual");

  const current = projectReferenceVisualCustomerWorkflow({
    opportunity: opportunity({
      ...base,
      candidates: [
        { ...base.candidates[0]!, revisionId: "current", currentForPlan: true },
      ],
    }),
    evidenceReady: true,
    recipeCurrent: true,
    renderedType: true,
  });
  assert.equal(current.nextAction, "Choose a finished visual");
});

test("archival media remains in Design until a current candidate is ready", () => {
  const workflow = projectReferenceVisualCustomerWorkflow({
    opportunity: opportunity({
      subtype: "archival_still",
      sourceStatus: "linked",
      sources: [
        {
          memberId: "member-1",
          ordinal: 1,
          sourceRevisionId: "source-1",
          sourceLinkRevisionId: "link-1",
          sourceRevision: 1,
          sourceLinkRevision: 1,
          source: { title: "Archive" },
          link: {},
        },
      ],
      evidence: [{ id: "evidence-1" }],
      sourceUse: { use_classification: "third_party_media" },
      rights: { id: "rights-1" },
    }),
    evidenceReady: true,
    recipeCurrent: false,
    renderedType: false,
  });

  assert.equal(workflow.currentStageId, "design");
  assert.equal(workflow.nextAction, "Prepare archival media");
});

test("Reference Visuals expose the stable summary, stage navigation, and entry focus contract", () => {
  for (const copy of [
    "Current Source",
    "Usage &amp; rights",
    "Reference Visual workflow stages",
    "Generate &amp; review",
  ]) {
    assert.ok(panelSource.includes(copy), `missing ${copy}`);
  }
  assert.match(panelSource, /aria-current=/);
  assert.match(panelSource, /reference-visual-workspace-heading/);
  assert.match(panelSource, /focus\(\{preventScroll:true\}\)/);
  assert.match(visualStyles, /hs-reference-visual-summary/);
  assert.match(visualStyles, /hs-reference-visual-stage-rail/);
  assert.match(visualStyles, /@media\(max-width:640px\)/);
});
