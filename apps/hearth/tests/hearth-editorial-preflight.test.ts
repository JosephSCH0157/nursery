import assert from "node:assert/strict";
import test from "node:test";
import { buildHearthEditorialPreflightReport } from "../src/lib/hearth-editorial-preflight";
import { buildCanonicalHearthResearchResult } from "../src/lib/hearth-research-preflight-authority";

test("preflight binds findings to the exact script and evidence context without an AI call", () => {
  const report = buildHearthEditorialPreflightReport({
    scriptText: "[TODO: verify] This is the biggest project ever. It costs $12 million.",
    researchResult: {
      mode: "retrieval_first",
      runtimeStatus: "partial",
      artifact: {
        briefFingerprint: "brief-12345678",
        workpieceId: "workpiece-1",
        status: "partial",
        findings: [],
        uncertainties: ["The cost remains unverified."],
        editorialInterpretation: [],
      },
      sources: [],
      synthesis: { summary: "", keyPoints: [], uncertainties: [], coverageNote: "" },
    },
  });
  assert.equal(report.schema, "forge.hearth.editorial-preflight.v1");
  assert.equal(report.checkerContractVersion, "forge.hearth.editorial-preflight.deterministic.v1");
  assert.equal(report.usedPaidAi, false);
  assert.equal(report.findings.some((finding) => finding.code === "placeholder_or_todo" && finding.severity === "blocker"), true);
  assert.equal(report.findings.some((finding) => finding.code === "unsupported_number_or_date"), true);
  assert.equal(report.findings.some((finding) => finding.code === "superlative_claim"), true);
});

test("preflight does not invent blockers for clean copy", () => {
  const report = buildHearthEditorialPreflightReport({
    scriptText: "The city describes the work as a streetscape project.\n\nThat leaves a practical question for residents.",
    researchResult: null,
  });
  assert.equal(report.findings.filter((finding) => finding.severity === "blocker").length, 0);
  assert.equal(report.usedPaidAi, false);
});

test("preflight surfaces missing provenance, conflicts, creator leads, and unresolved goals", () => {
  const report = buildHearthEditorialPreflightReport({
    scriptText: "The project is currently open and definitely changed everything.",
    researchResult: {
      mode: "retrieval_first",
      runtimeStatus: "partial",
      artifact: {
        briefFingerprint: "brief-12345678",
        workpieceId: "workpiece-1",
        status: "partial",
        findings: [
          { text: "A creator-supplied claim", status: "uncertain", provenanceStatus: "creator_supplied_unverified", sourceIds: [] },
          { text: "Sources conflict on the date", status: "uncertain", provenanceStatus: "conflicting", sourceIds: ["s1", "s2"] },
        ],
        uncertainties: ["The opening date remains unresolved."],
        editorialInterpretation: [],
      },
      creatorClaims: [{ claimId: "c1", text: "A creator-supplied claim", provenanceStatus: "creator_supplied_unverified", scope: "current_subject", sourceIds: [] }],
      sources: [],
      synthesis: { summary: "", keyPoints: [], uncertainties: [], coverageNote: "" },
    },
  });
  assert.ok(report.findings.some((finding) => finding.code === "creator_claim_unverified"));
  assert.ok(report.findings.some((finding) => finding.code === "conflicting_evidence"));
  assert.ok(report.findings.some((finding) => finding.code === "unanswered_research"));
  assert.ok(report.findings.some((finding) => finding.code === "wording_stronger_than_evidence"));
});

test("canonical research keeps bounded evidence but does not copy inspected documents", () => {
  const canonical = buildCanonicalHearthResearchResult({
    mode: "retrieval_first",
    runtimeStatus: "ok",
    sources: [{
      sourceId: "source-1", title: "Primary source", url: "https://example.invalid/source", domain: "example.invalid",
      publishedAt: null, snippet: "s".repeat(5000), extractedText: "full source body", transcript: "full transcript",
      transcriptSegments: [{ cueIndex: 0, startMs: 0, endMs: 1, text: "full transcript" }],
      attributedQuotes: null, extractionStatus: "extracted", extractionError: null,
    }],
    evidence: [{ evidenceId: "evidence-1", briefFingerprint: "brief-12345678", workpieceId: "workpiece-1", sourceId: "source-1", excerpt: "e".repeat(9000), authority: "primary_institutional", state: "inspected", uncertainty: null }],
    synthesis: { summary: "", keyPoints: [], uncertainties: [], coverageNote: "" },
  });
  assert.equal(canonical.sources[0]?.extractedText, null);
  assert.equal(canonical.sources[0]?.transcript, null);
  assert.equal(canonical.sources[0]?.transcriptSegments, null);
  assert.equal(canonical.sources[0]?.snippet?.length, 4096);
  assert.equal(canonical.evidence?.[0]?.excerpt?.length, 8192);
});
