import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateReferenceVisualReadiness } from "@forge/shared/reference-visual-readiness";
import {
  proposeReferenceVisualRecipe,
  referenceVisualReadiness,
  renderReferenceVisual,
  type ReferenceVisualOpportunity,
} from "../src/lib/hearth-reference-visual-authority";

const member = (memberId: string) => ({
  memberId,
  ordinal: 1,
  sourceRevisionId: `source-${memberId}`,
  sourceLinkRevisionId: `link-${memberId}`,
  sourceRevision: 1,
  sourceLinkRevision: 1,
  source: { title: "Canonical Source", publisher: "Publisher" },
  link: {},
});
function opportunity(
  evidence: Record<string, unknown>[],
  overrides: Partial<ReferenceVisualOpportunity> = {},
): ReferenceVisualOpportunity {
  return {
    id: "opportunity",
    revisionId: "opportunity-revision",
    revision: 1,
    sourceStatus: "linked",
    sourceSetRevisionId: "source-set-revision",
    sourceSetRevision: 1,
    sources: [member("member-a")],
    subtype: "stat_card",
    focus:
      "The cost of crude oil is usually the largest component of the retail price of gasoline.",
    before: "",
    after: "",
    editorialReason: "Explain the gasoline price components.",
    desiredMaterial: "An EIA-backed gasoline price component graphic.",
    searchTerms: [],
    placement: "At the cited script moment",
    durationMs: 6000,
    sourceRevisionId: "source-member-a",
    sourceLinkRevisionId: "link-member-a",
    source: { title: "Gasoline price fluctuations", publisher: "EIA" },
    sourceUse: { id: "source-use", use_classification: "facts_data_only" },
    sourceUseSequenceId: "source-use-sequence",
    sourceUseSequenceRevision: 1,
    evidence,
    evidenceSequenceId: null,
    evidenceSequenceRevision: 1,
    recipe: null,
    recipeSequenceId: null,
    recipeSequenceRevision: 0,
    rights: { id: "rights" },
    candidates: [],
    selectionRevision: 0,
    selectedCandidateRevisionId: null,
    releaseReady: false,
    ...overrides,
  };
}

const textOnly = {
  id: "evidence-2008",
  source_set_member_id: "member-a",
  confirmation_state: "creator_confirmed",
  label: "2008: Crude oil and gasoline prices reached record highs in 2008",
  raw_excerpt: "Crude oil and gasoline prices reached record highs in 2008",
  numeric_value: null,
  unit: null,
};

const numeric = {
  id: "evidence-component-share",
  source_set_member_id: "member-a",
  confirmation_state: "creator_confirmed",
  label: "Crude oil share of the retail gasoline price",
  raw_excerpt: "The supported Source states the share explicitly.",
  numeric_value: 57,
  unit: "percent",
};

test("stat-card supporting text is preserved but does not satisfy numeric readiness", () => {
  const result = evaluateReferenceVisualReadiness({
    subtype: "stat_card",
    evidence: [textOnly],
    currentSourceMemberIds: ["member-a"],
  });
  assert.equal(result.evidenceReady, false);
  assert.equal(result.code, "needs_numeric_evidence");
  assert.deepEqual(result.supportingEvidenceRevisionIds, ["evidence-2008"]);
  assert.deepEqual(result.eligibleEvidenceRevisionIds, []);
  assert.match(result.message, /Source evidence is confirmed/);
});

test("stat-card numeric evidence requires a label and unit and then satisfies readiness", () => {
  assert.equal(
    evaluateReferenceVisualReadiness({
      subtype: "stat_card",
      evidence: [{ ...numeric, unit: null }],
      currentSourceMemberIds: ["member-a"],
    }).evidenceReady,
    false,
  );
  assert.equal(
    evaluateReferenceVisualReadiness({
      subtype: "stat_card",
      evidence: [textOnly, numeric],
      currentSourceMemberIds: ["member-a"],
    }).evidenceReady,
    true,
  );
});

test("timeline and comparison apply their subtype-specific current-Source rules", () => {
  const timeline = evaluateReferenceVisualReadiness({
    subtype: "timeline",
    evidence: [
      {
        id: "dated-1",
        source_set_member_id: "member-a",
        label: "2008: record high",
      },
      {
        id: "dated-2",
        source_set_member_id: "member-a",
        evidence_date: "2024-09-06",
        raw_excerpt: "Updated",
      },
    ],
    currentSourceMemberIds: ["member-a"],
  });
  assert.equal(timeline.evidenceReady, true);
  assert.equal(
    evaluateReferenceVisualReadiness({
      subtype: "timeline",
      evidence: [textOnly],
      currentSourceMemberIds: ["member-a"],
    }).evidenceReady,
    false,
  );
  const comparisonEvidence = [
    {
      id: "a",
      source_set_member_id: "member-a",
      raw_excerpt: "Supported detail A",
      label: "A",
    },
    {
      id: "b",
      source_set_member_id: "member-b",
      raw_excerpt: "Supported detail B",
      label: "B",
    },
  ];
  assert.equal(
    evaluateReferenceVisualReadiness({
      subtype: "comparison",
      evidence: comparisonEvidence,
      currentSourceMemberIds: ["member-a", "member-b"],
    }).evidenceReady,
    true,
  );
  assert.equal(
    evaluateReferenceVisualReadiness({
      subtype: "comparison",
      evidence: comparisonEvidence.slice(0, 1),
      currentSourceMemberIds: ["member-a", "member-b"],
    }).evidenceReady,
    false,
  );
});

test("recipe binding is exact and becomes stale when qualifying evidence changes", () => {
  const current = evaluateReferenceVisualReadiness({
    subtype: "stat_card",
    evidence: [numeric],
    currentSourceMemberIds: ["member-a"],
    recipeEvidenceRevisionIds: ["evidence-component-share"],
  });
  assert.equal(current.ready, true);
  const stale = evaluateReferenceVisualReadiness({
    subtype: "stat_card",
    evidence: [numeric],
    currentSourceMemberIds: ["member-a"],
    recipeEvidenceRevisionIds: ["evidence-2008"],
  });
  assert.equal(stale.ready, false);
  assert.equal(stale.code, "recipe_stale");
});

test("the 2008 text-only drift cannot prepare a recipe and numeric recipes stay anchored to the opportunity focus", () => {
  assert.equal(proposeReferenceVisualRecipe(opportunity([textOnly])), null);
  assert.equal(
    proposeReferenceVisualRecipe(
      opportunity([
        {
          ...numeric,
          id: "unrelated",
          label: "Electric generator report capacity",
          raw_excerpt: "Generator capacity was 57 percent.",
        },
      ]),
    ),
    null,
  );
  const proposal = proposeReferenceVisualRecipe(
    opportunity([textOnly, numeric]),
  );
  assert.ok(proposal);
  assert.equal(proposal.title, opportunity([]).focus);
  assert.deepEqual(proposal.recipeJson.source_evidence_revision_ids, [
    "evidence-component-share",
  ]);
  assert.doesNotMatch(proposal.title, /record highs in 2008/i);
});

test("UI, recipe preparation, client preflight, and server renderer all consume the shared predicate", () => {
  const authority = readFileSync(
    new URL("../src/lib/hearth-reference-visual-authority.ts", import.meta.url),
    "utf8",
  );
  const panel = readFileSync(
    new URL(
      "../src/components/visuals/CanonicalReferenceVisualPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const renderer = readFileSync(
    new URL(
      "../../../packages/tongs/src/reference-visual-renderer.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const server = readFileSync(
    new URL(
      "../../../packages/tongs/src/workpiece-commit-api.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(authority, /referenceVisualReadiness/);
  assert.match(panel, /evidenceReadiness/);
  assert.match(renderer, /evaluateReferenceVisualReadiness/);
  assert.match(server, /evaluateReferenceVisualReadiness/);
});

test("unmet readiness stops before any render request", async () => {
  const current = opportunity([textOnly], {
    recipe: { id: "recipe", evidence_revision_ids: ["evidence-2008"] },
  });
  assert.equal(referenceVisualReadiness(current, true).ready, false);
  const result = await renderReferenceVisual({
    workspaceId: "workspace",
    workpieceId: "workpiece",
    opportunity: current,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "needs_numeric_evidence");
});
