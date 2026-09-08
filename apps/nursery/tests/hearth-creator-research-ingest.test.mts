import assert from "node:assert/strict";
import test from "node:test";
import type { HearthResearchResult } from "../../hearth/src/lib/hearth-research-contract";
import {
  parseCreatorSuppliedResearch,
  reconcileCreatorSuppliedResearchArtifact,
} from "../server/hearth/hearth-creator-research-ingest";

test("creator research URL parsing stops at Markdown and prose boundaries", () => {
  const parsed = parseCreatorSuppliedResearch([
    "https://example.com/article)The next sentence starts here.",
    "[source](https://example.com/second)Next paragraph.",
    "https://example.com/third\\)The escaped boundary also starts prose.",
    "[SearchViewer](https://www.google.com/searchviewer/example)🏢 Open businesses",
  ].join("\n"));

  assert.deepEqual(parsed.citations.map((citation) => citation.normalizedUrl), [
    "https://example.com/article",
    "https://example.com/second",
    "https://example.com/third",
    "https://www.google.com/searchviewer/example",
  ]);
  assert.match(parsed.textWithoutCitations, /The next sentence/);
  assert.match(parsed.textWithoutCitations, /Next paragraph/);
  assert.match(parsed.textWithoutCitations, /The escaped boundary/);
  assert.match(parsed.textWithoutCitations, /🏢 Open businesses/);
  assert.doesNotMatch(JSON.stringify(parsed.citations), /%F0%9F%8F%A2/i);
});

test("creator research URL parsing preserves legitimate balanced URL parentheses", () => {
  const parsed = parseCreatorSuppliedResearch("Reference: https://example.com/archive/Church_Street_(Orlando). More text.");

  assert.equal(parsed.citations[0]?.normalizedUrl, "https://example.com/archive/Church_Street_(Orlando)");
});

test("unsafe malformed creator citations are retained without becoming fetchable URLs", () => {
  const parsed = parseCreatorSuppliedResearch("Reference: https://example.com/article\\broken");

  assert.equal(parsed.citations.length, 1);
  assert.equal(parsed.citations[0]?.normalizedUrl, null);
  assert.equal(parsed.citations[0]?.status, "malformed_url");
});

test("creator money claims remain unverified leads while trailing fragments are ignored", () => {
  const parsed = parseCreatorSuppliedResearch([
    "The claimed Church Street total is $12 million.",
    "A broader $220 million infrastructure package is separate context.",
    "The complete festival street redesign is slated for",
  ].join("\n"));

  assert.equal(parsed.appearsTruncated, true);
  assert.equal(parsed.claims.length, 2);
  assert.ok(parsed.claims.every((claim) => claim.provenanceStatus === "creator_supplied_unverified"));
  assert.equal(parsed.claims[0]?.scope, "current_subject");
  assert.equal(parsed.claims[1]?.scope, "adjacent_context");
  assert.doesNotMatch(JSON.stringify(parsed.claims), /slated for/i);
});

test("creator business-list bullets survive inaccessible citations as classified unverified leads", () => {
  const parsed = parseCreatorSuppliedResearch([
    "## Open Church Street businesses",
    "- **Kres Chophouse** — 17 W Church Street; described as currently open.",
    "- **The Bao Spot** — restaurant lead near Church Street.",
    "- **Hawkers** — corporate office, not a customer-facing storefront.",
    "- **Kia Center** — adjacent venue, not on the relevant corridor.",
    "[SearchViewer](https://www.google.com/searchviewer/example)🏢 More business research",
  ].join("\n"));

  const businesses = parsed.claims.filter((claim) => claim.claimKind === "business_status");
  assert.deepEqual(businesses.map((claim) => claim.businessName), [
    "Kres Chophouse",
    "The Bao Spot",
    "Hawkers",
    "Kia Center",
  ]);
  assert.ok(businesses.every((claim) => claim.provenanceStatus === "creator_supplied_unverified"));
  assert.equal(businesses.find((claim) => claim.businessName === "Kres Chophouse")?.businessStatus, "creator_supplied_unverified");
  assert.equal(businesses.find((claim) => claim.businessName === "Hawkers")?.businessStatus, "non_customer_facing");
  assert.equal(businesses.find((claim) => claim.businessName === "Kia Center")?.businessStatus, "adjacent_location");
});

test("creator claims degrade a failed mixed-evidence artifact to partial without becoming verified", () => {
  const briefFingerprint = "brief-church-street";
  const workpieceId = "church-street";
  const parsed = parseCreatorSuppliedResearch([
    "The claimed Church Street total is $12 million.",
    "Phase I is $5.2 million.",
    "Phase II is $8 million.",
    "A broader $220 million infrastructure package is separate context.",
    "A $160 million downtown bond package is adjacent funding.",
    "The complete festival street redesign is slated for",
  ].join("\n"));
  const result: HearthResearchResult = {
    mode: "partial_retrieval",
    runtimeStatus: "partial",
    brief: {
      schema: "forge.hearth.research-brief.v1",
      workspaceId: "workspace",
      workpieceId,
      briefFingerprint,
      creatorRequest: "Research the Church Street budget.",
      episodeTitle: "Church Street",
      goals: ["Resolve the project budget"],
      queries: ["Church Street project budget"],
      sourcePriorities: [],
    },
    creatorClaims: parsed.claims,
    creatorInputTruncated: parsed.appearsTruncated,
    sources: [{
      sourceId: "city-source",
      title: "City project page",
      url: "https://example.test/city",
      domain: "example.test",
      publishedAt: null,
      snippet: null,
      extractedText: "Phase I has an approved project cost of $5.2 million.",
      extractionStatus: "extracted",
      extractionError: null,
      provenance: {
        origin: "creator_url",
        briefFingerprint,
        inspectedAt: "2026-09-08T00:00:00.000Z",
        inspectionStatus: "inspected",
        accessFailureReason: null,
        verifiedInCurrentRequest: true,
      },
    }],
    artifact: {
      briefFingerprint,
      workpieceId,
      status: "failed",
      findings: [
        {
          text: "Phase I is funded at $5.2 million.",
          status: "verified_fact",
          sourceIds: ["city-source"],
          scope: "current_subject",
        },
        {
          text: "The total Church Street project budget is $12 million.",
          status: "verified_fact",
          sourceIds: ["city-source"],
          scope: "current_subject",
        },
      ],
      uncertainties: [],
      editorialInterpretation: [],
    },
    synthesis: {
      summary: "",
      keyPoints: [],
      uncertainties: [],
      coverageNote: "",
    },
  };

  const artifact = reconcileCreatorSuppliedResearchArtifact(result);
  assert.equal(artifact?.status, "partial");
  assert.equal(artifact?.findings.find((finding) => finding.text.includes("$5.2"))?.provenanceStatus, "verified_by_current_run");
  assert.equal(artifact?.findings.find((finding) => finding.text.includes("$12"))?.status, "uncertain");
  assert.equal(artifact?.findings.find((finding) => finding.text.includes("$12"))?.provenanceStatus, "creator_supplied_unverified");
  const arithmeticConflict = artifact?.findings.find((finding) => finding.provenanceStatus === "conflicting");
  assert.match(arithmeticConflict?.text ?? "", /Phase I \+ Phase II total \$13\.2 million/i);
  assert.match(arithmeticConflict?.text ?? "", /exceeds the stated \$12 million total/i);
  assert.match(arithmeticConflict?.text ?? "", /different budget scopes or revisions/i);
  assert.equal(artifact?.findings.find((finding) => finding.text.includes("$220"))?.scope, "adjacent_context");
  assert.equal(artifact?.findings.find((finding) => finding.text.includes("$160"))?.scope, "adjacent_context");
  assert.doesNotMatch(JSON.stringify(artifact), /slated for/i);
});

test("business status requires inspected support before a creator lead becomes a verified open door", () => {
  const briefFingerprint = "brief-business-status";
  const workpieceId = "church-street";
  const parsed = parseCreatorSuppliedResearch([
    "## Church Street businesses",
    "- **Kres Chophouse** — restaurant at 17 W Church Street.",
    "- **The Bao Spot** — restaurant lead on Church Street.",
    "- **Hawkers** — corporate office, not a customer-facing storefront.",
  ].join("\n"));
  const result: HearthResearchResult = {
    mode: "partial_retrieval",
    runtimeStatus: "partial",
    brief: {
      schema: "forge.hearth.research-brief.v1",
      workspaceId: "workspace",
      workpieceId,
      briefFingerprint,
      creatorRequest: "Verify currently operating Church Street businesses.",
      episodeTitle: "Church Street",
      goals: ["Find current customer-facing businesses"],
      queries: [],
      sourcePriorities: [],
    },
    creatorClaims: parsed.claims,
    sources: [{
      sourceId: "kres-current-site",
      title: "Kres Chophouse",
      url: "https://example.test/kres",
      domain: "example.test",
      publishedAt: null,
      snippet: null,
      extractedText: "Kres Chophouse is accepting reservations at 17 W Church Street.",
      extractionStatus: "extracted",
      extractionError: null,
      provenance: {
        origin: "creator_url",
        briefFingerprint,
        inspectedAt: "2026-09-08T00:00:00.000Z",
        inspectionStatus: "inspected",
        accessFailureReason: null,
        verifiedInCurrentRequest: true,
      },
    }],
    artifact: {
      briefFingerprint,
      workpieceId,
      status: "partial",
      findings: [
        {
          text: "Kres Chophouse is currently accepting customers at its Church Street location.",
          status: "verified_fact",
          provenanceStatus: "verified_by_current_run",
          sourceIds: ["kres-current-site"],
          scope: "current_subject",
          businessName: "Kres Chophouse",
          businessStatus: "verified_currently_operating",
        },
        {
          text: "The Bao Spot is currently operating on Church Street.",
          status: "verified_fact",
          provenanceStatus: "verified_by_current_run",
          sourceIds: [],
          scope: "current_subject",
          businessName: "The Bao Spot",
          businessStatus: "verified_currently_operating",
        },
      ],
      uncertainties: [],
      editorialInterpretation: [],
    },
    synthesis: { summary: "", keyPoints: [], uncertainties: [], coverageNote: "" },
  };

  const artifact = reconcileCreatorSuppliedResearchArtifact(result);
  const kres = artifact?.findings.find((finding) => finding.businessName === "Kres Chophouse");
  const bao = artifact?.findings.find((finding) => finding.businessName === "The Bao Spot");
  const hawkers = artifact?.findings.find((finding) => finding.businessName === "Hawkers");
  assert.equal(kres?.businessStatus, "verified_currently_operating");
  assert.equal(kres?.provenanceStatus, "verified_by_current_run");
  assert.equal(bao?.status, "uncertain");
  assert.equal(bao?.businessStatus, "creator_supplied_unverified");
  assert.equal(bao?.provenanceStatus, "creator_supplied_unverified");
  assert.equal(hawkers?.businessStatus, "non_customer_facing");
  assert.equal(hawkers?.provenanceStatus, "creator_supplied_unverified");
});

test("short structured business leads make an otherwise failed run partial without becoming verified", () => {
  const briefFingerprint = "brief-short-business-leads";
  const workpieceId = "church-street";
  const parsed = parseCreatorSuppliedResearch([
    "## Creator-supplied Church Street businesses",
    "- Kres Chophouse",
    "- Cucina Pizza & Bar",
    "- The Bao Spot",
    "- Coffee For The Soul",
    "- Birria1983",
    "- Crepe Delicious",
    "- Jenny's Downtown",
    "- The District GastroBar",
    "",
    "Empty storefronts and available business spaces remain numerous along Church Street.",
    "",
    "Source: https://www.yelp.com/biz/church-street-exchange-orlando",
  ].join("\n"));
  const result: HearthResearchResult = {
    mode: "partial_retrieval",
    runtimeStatus: "partial",
    brief: {
      schema: "forge.hearth.research-brief.v1",
      workspaceId: "workspace",
      workpieceId,
      briefFingerprint,
      creatorRequest: "Check which creator-supplied Church Street businesses are currently operating.",
      episodeTitle: "Church Street",
      goals: ["Verify current customer-facing businesses"],
      queries: [],
      sourcePriorities: [],
    },
    creatorClaims: parsed.claims,
    sources: [{
      sourceId: "yelp-source",
      title: "Church Street Exchange",
      url: "https://www.yelp.com/biz/church-street-exchange-orlando",
      domain: "yelp.com",
      publishedAt: null,
      snippet: null,
      extractedText: null,
      extractionStatus: "failed",
      extractionError: "Access denied.",
      provenance: {
        origin: "creator_url",
        briefFingerprint,
        inspectedAt: null,
        inspectionStatus: "inaccessible",
        accessFailureReason: "access_denied",
        verifiedInCurrentRequest: false,
      },
    }],
    artifact: {
      briefFingerprint,
      workpieceId,
      status: "failed",
      findings: [],
      uncertainties: ["No current operating status could be independently verified."],
      editorialInterpretation: [],
    },
    synthesis: { summary: "", keyPoints: [], uncertainties: [], coverageNote: "" },
  };

  const artifact = reconcileCreatorSuppliedResearchArtifact(result);
  assert.equal(artifact?.status, "partial");
  assert.deepEqual(
    artifact?.findings.filter((finding) => finding.businessName).map((finding) => finding.businessName),
    [
      "Kres Chophouse",
      "Cucina Pizza & Bar",
      "The Bao Spot",
      "Coffee For The Soul",
      "Birria1983",
      "Crepe Delicious",
      "Jenny's Downtown",
      "The District GastroBar",
    ],
  );
  assert.ok(artifact?.findings.every((finding) => finding.status === "uncertain"));
  assert.ok(artifact?.findings.every((finding) => finding.provenanceStatus === "creator_supplied_unverified"));
  assert.ok(artifact?.findings.some((finding) => /Empty storefronts and available business spaces remain numerous/i.test(finding.text)));
});

test("evidence-empty failed artifacts remain failed", () => {
  const result: HearthResearchResult = {
    mode: "partial_retrieval",
    runtimeStatus: "no_results",
    brief: {
      schema: "forge.hearth.research-brief.v1",
      workspaceId: "workspace",
      workpieceId: "empty",
      briefFingerprint: "brief-empty",
      creatorRequest: "Research an unsupported topic.",
      episodeTitle: "Empty",
      goals: [],
      queries: [],
      sourcePriorities: [],
    },
    sources: [],
    artifact: {
      briefFingerprint: "brief-empty",
      workpieceId: "empty",
      status: "failed",
      findings: [],
      uncertainties: ["No evidence was available."],
      editorialInterpretation: [],
    },
    synthesis: {
      summary: "",
      keyPoints: [],
      uncertainties: [],
      coverageNote: "",
    },
  };

  assert.equal(reconcileCreatorSuppliedResearchArtifact(result)?.status, "failed");
});
