import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  acceptsReferenceReviewEvent,
  projectReferenceReviewItems,
} from "../src/lib/hearth-reference-review";
import type { ReferenceClipState } from "../src/lib/hearth-reference-clip-authority";
import type { ReferenceVisualState } from "../src/lib/hearth-reference-visual-authority";

const clipState: ReferenceClipState = {
  planRevisionId: "clip-plan",
  planRevision: 2,
  canonicalSelectionRevision: 0,
  opportunities: [
    {
      id: "clip-op",
      revisionId: "clip-op-r1",
      revision: 1,
      sourceStatus: "linked",
      sourceLinkRevisionId: "clip-link",
      focus: "Exact clip passage",
      before: "",
      after: "",
      purpose: "Ground the claim",
      editorialReason: "The original speaker matters here.",
      desiredMaterial: "A short excerpt from the interview",
      searchTerms: [],
      placement: "At the passage",
      durationMs: 8000,
      citation: {},
      mediaRange: {},
      source: {
        revisionId: "clip-source",
        revision: 1,
        title: "Interview",
        author: null,
        publisher: null,
        url: "https://example.test/interview",
      },
      candidates: [
        {
          revisionId: "clip-candidate",
          candidateId: "clip",
          deliveryKind: "local_asset",
          assetId: "asset",
          posterAssetId: null,
          videoUrl: "https://example.test/clip.mp4",
          posterUrl: null,
          mimeType: "video/mp4",
          durationMs: 8000,
          createdAt: "2026-01-01",
          rights: { basis: "licensed" },
          provenance: {},
          externalProvider: null,
          externalMediaId: null,
          externalUrl: null,
          embedUrl: null,
          startMs: null,
          endMs: null,
          externalMetadata: {},
        },
      ],
      selectionSetRevision: 0,
      selectedRevisionIds: [],
    },
  ],
};
const visualState: ReferenceVisualState = {
  planRevisionId: "visual-plan",
  planRevision: 3,
  scriptApprovalId: "script",
  scriptApprovalRevision: 1,
  scriptContentHash: "hash",
  opportunities: [
    {
      id: "visual-op",
      revisionId: "visual-op-r1",
      revision: 1,
      sourceStatus: "linked",
      sourceSetRevision: 1,
      sources: [
        {
          memberId: "member",
          ordinal: 1,
          sourceRevisionId: "visual-source",
          sourceLinkRevisionId: "visual-link",
          sourceRevision: 1,
          sourceLinkRevision: 1,
          source: { title: "Annual report" },
          link: {},
        },
      ],
      subtype: "stat_card",
      focus: "Exact visual passage",
      before: "",
      after: "",
      editorialReason: "The number should be readable.",
      desiredMaterial: "A source-backed stat card",
      searchTerms: [],
      placement: "At the passage",
      durationMs: 6000,
      sourceRevisionId: "visual-source",
      sourceLinkRevisionId: "visual-link",
      source: { title: "Annual report" },
      sourceUse: { id: "use", use_classification: "facts_data_only" },
      sourceUseSequenceId: "use",
      sourceUseSequenceRevision: 1,
      evidence: [{ id: "evidence" }],
      evidenceSequenceId: "evidence",
      evidenceSequenceRevision: 1,
      recipe: { id: "recipe" },
      recipeSequenceId: "recipe",
      recipeSequenceRevision: 1,
      rights: null,
      candidates: [
        {
          revisionId: "visual-candidate",
          kind: "rendered_visual",
          assetId: "visual-asset",
          imageUrl: "https://example.test/stat.png",
          releaseReady: true,
          createdAt: "2026-01-01",
          provenance: {},
        },
      ],
      selectionRevision: 0,
      selectedCandidateRevisionId: null,
      releaseReady: true,
    },
  ],
};

test("mixed Clip and Visual authorities project into one non-canonical review queue", () => {
  const items = projectReferenceReviewItems({
    clips: clipState,
    visuals: visualState,
    dispositions: [],
  });
  assert.deepEqual(items.map((item) => item.label).sort(), [
    "Reference Clip",
    "Reference Visual",
  ]);
  assert.equal(
    items.every((item) => item.state === "needs_your_decision"),
    true,
  );
  assert.notEqual(
    items[0]?.opportunityRevisionId,
    items[1]?.opportunityRevisionId,
  );
});
test("Ready requires a durable resolution and matching Hammer verification", () => {
  const unresolved = projectReferenceReviewItems({
    clips: clipState,
    visuals: null,
    dispositions: [],
    hammerVerifiedKeys: new Set(["reference_clip:clip-op"]),
  });
  assert.equal(unresolved[0]?.state, "needs_your_decision");
  const selected = {
    ...clipState,
    opportunities: [
      {
        ...clipState.opportunities[0]!,
        selectedRevisionIds: ["clip-candidate"],
      },
    ],
  };
  const approved = projectReferenceReviewItems({
    clips: selected,
    visuals: null,
    dispositions: [],
    hammerVerifiedKeys: new Set(["reference_clip:clip-op"]),
  });
  assert.equal(approved[0]?.resolution, "approved");
  assert.equal(approved[0]?.state, "ready");
});
test("skipped proposals become Ready only after Hammer absence verification", () => {
  const dispositions = [
    {
      revisionId: "skip-r1",
      revision: 1,
      kind: "reference_visual" as const,
      opportunityId: "visual-op",
      opportunityRevisionIdentity: "visual-op-r1",
      childPlanRevisionId: "visual-plan",
      childPlanRevision: 3,
      state: "skipped" as const,
      reason: "editorially_unneeded" as const,
      note: null,
      createdAt: "2026-01-01",
    },
  ];
  assert.equal(
    projectReferenceReviewItems({
      clips: null,
      visuals: visualState,
      dispositions,
    })[0]?.state,
    "needs_your_decision",
  );
  const verified = projectReferenceReviewItems({
    clips: null,
    visuals: visualState,
    dispositions,
    hammerVerifiedKeys: new Set(["reference_visual:visual-op"]),
  });
  assert.equal(verified[0]?.resolution, "skipped");
  assert.equal(verified[0]?.state, "ready");
});
test("rights-sensitive reproduction disables approval without blocking facts-only visuals", () => {
  const facts = projectReferenceReviewItems({
    clips: null,
    visuals: visualState,
    dispositions: [],
  })[0];
  assert.equal(facts?.approveDisabledReason, null);
  const sensitive = {
    ...visualState,
    opportunities: [
      {
        ...visualState.opportunities[0]!,
        sourceUse: { id: "use", use_classification: "third_party_media" },
        rights: null,
      },
    ],
  };
  assert.match(
    projectReferenceReviewItems({
      clips: null,
      visuals: sensitive,
      dispositions: [],
    })[0]?.approveDisabledReason ?? "",
    /permission|licensing/i,
  );
});
test("out-of-order events require exact native revision identities", () => {
  const item = projectReferenceReviewItems({
    clips: clipState,
    visuals: null,
    dispositions: [],
  })[0]!;
  assert.equal(
    acceptsReferenceReviewEvent(item, {
      opportunityId: item.opportunityId,
      opportunityRevisionId: item.opportunityRevisionId,
      planRevisionId: item.planRevisionId,
    }),
    true,
  );
  assert.equal(
    acceptsReferenceReviewEvent(item, {
      opportunityId: item.opportunityId,
      opportunityRevisionId: "late-revision",
      planRevisionId: item.planRevisionId,
    }),
    false,
  );
});
test("Hammer verification reads the Tongs response envelope before exact identity comparison", () => {
  const source = readFileSync(
    new URL("../src/lib/hearth-reference-review.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /root\.data[\s\S]*data\?\.visuals/);
  assert.match(
    source,
    /candidate_revision_id ===\s+item\.candidate\?\.revisionId/,
  );
});
test("Edit, Replace, and Skip remain distinct creator operations", () => {
  const source = readFileSync(
    new URL(
      "../src/components/visuals/CanonicalReferenceMaterialPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /drawer\?\.mode === "replace"/);
  assert.match(source, />\s*Save edits\s*</);
  assert.match(source, /commitReferenceVisualRecipe/);
  assert.match(source, /await begin\(item, "save_edits"\)/);
  assert.match(source, /setDrawer\(null\)[\s\S]*await refresh\(\)/);
  assert.equal(
    /drawer\?\.mode === "replace"[\s\S]*Why skip\?/.test(
      source.slice(
        source.indexOf('{drawer?.mode === "edit"'),
        source.indexOf("</aside>"),
      ),
    ),
    true,
    "the explicit third drawer branch keeps Skip outside Replace",
  );
});
test("sanitized workflow fixture enforces the acceptance target", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("fixtures/reference-review-mixed-episode.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(fixture.expected.goodProposalDecisions, 1);
  assert.equal(fixture.expected.sourceAddActions, 1);
  assert.equal(fixture.expected.hardRefreshes, 0);
  assert.equal(fixture.scenarios.includes("linked_retry"), true);
});

test("canonical Reference Material is default-off behind workspace authority", () => {
  const panel = readFileSync(
    new URL("../src/components/visuals/ReferenceClipPlanPanel.tsx", import.meta.url),
    "utf8",
  );
  const service = readFileSync(
    new URL("../src/lib/hearth-style-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(panel, /getReferenceMaterialRollout\(workspaceId\)/);
  assert.match(panel, /rollout === "enabled"/);
  assert.match(panel, /rollout === "unavailable"[\s\S]*LegacyReferenceClipPlanPanel/);
  assert.match(service, /get_my_reference_material_rollout/);
  assert.match(service, /enabled: raw\?\.reference_material_review_enabled === true/);
});
