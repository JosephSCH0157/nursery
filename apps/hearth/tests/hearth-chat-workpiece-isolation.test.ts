import assert from "node:assert/strict";
import test from "node:test";
import {
  isChatContextHydrated,
  resolvePreviousChatPersistenceTarget,
} from "../src/hooks/useChatWorkspace";
import { selectActiveHearthResearchResult } from "../src/lib/hearth-research-scope";
import { normalizeHearthResearchResult, type HearthResearchResult } from "../src/lib/hearth-research-contract";

test("A to B navigation flushes the previous chat with A's own canonical identity", () => {
  assert.deepEqual(resolvePreviousChatPersistenceTarget({
    previousHistoryKey: "workpiece-a:draft-a",
    previousDraftId: "draft-a",
    previousWorkpieceId: "workpiece-a",
    nextHistoryKey: "workpiece-b:draft-b",
    nextDraftId: "draft-b",
  }), {
    historyKey: "workpiece-a:draft-a",
    draftId: "draft-a",
    workpieceId: "workpiece-a",
  });
});

test("sending stays disabled until the active workpiece's canonical draft/chat are hydrated", () => {
  assert.equal(isChatContextHydrated({ historyKey: "workpiece-b:draft-b", hydratedHistoryKey: "workpiece-a:draft-a", draftId: "draft-a", canonicalDraftId: "draft-b" }), false);
  assert.equal(isChatContextHydrated({ historyKey: "workpiece-b:draft-b", hydratedHistoryKey: null, draftId: "draft-b", canonicalDraftId: "draft-b" }), false);
  assert.equal(isChatContextHydrated({ historyKey: "workpiece-b:draft-b", hydratedHistoryKey: "workpiece-b:draft-b", draftId: "draft-a", canonicalDraftId: "draft-b" }), false);
  assert.equal(isChatContextHydrated({ historyKey: "workpiece-b:draft-b", hydratedHistoryKey: "workpiece-b:draft-b", draftId: "draft-b", canonicalDraftId: "draft-b" }), true);
});

test("Topic A's research result cannot render in Topic B's Sources view", () => {
  const result = {
    mode: "retrieval_first", runtimeStatus: "ok", sources: [],
    synthesis: { summary: "Topic A citrus", keyPoints: [], uncertainties: [], coverageNote: "" },
  } satisfies HearthResearchResult;
  const recorded = { workspaceId: "workspace", workpieceId: "workpiece-a", result };
  assert.equal(selectActiveHearthResearchResult(recorded, "workspace", "workpiece-b"), null);
  assert.equal(selectActiveHearthResearchResult(recorded, "workspace", "workpiece-a"), result);
});

test("research contract serializes brief, inspection provenance, evidence, and artifact binding", () => {
  const normalized = normalizeHearthResearchResult({
    mode: "retrieval_first", runtimeStatus: "ok", providerStatus: "configured_and_operational",
    brief: { schema: "forge.hearth.research-brief.v1", workspaceId: "workspace", workpieceId: "workpiece-b", briefFingerprint: "fp-b", creatorRequest: "Church Street budget", episodeTitle: "Church Street", goals: ["budget"], queries: ["query"], sourcePriorities: ["official"] },
    sources: [{ sourceId: "source-b", title: "City", url: "https://orlando.gov", domain: "orlando.gov", publishedAt: null, snippet: null, extractedText: "Budget evidence", extractionStatus: "extracted", extractionError: null, provenance: { origin: "search", briefFingerprint: "fp-b", inspectedAt: "2026-09-07T00:00:00.000Z", inspectionStatus: "inspected", accessFailureReason: null, verifiedInCurrentRequest: true } }],
    evidence: [{ evidenceId: "e-b", briefFingerprint: "fp-b", workpieceId: "workpiece-b", sourceId: "source-b", excerpt: "Budget evidence", authority: "primary_government", state: "inspected", uncertainty: null }],
    artifact: { briefFingerprint: "fp-b", workpieceId: "workpiece-b", status: "complete", findings: [{ text: "The city documents the project budget.", status: "verified_fact", sourceIds: ["source-b"] }], uncertainties: [], editorialInterpretation: [] },
    synthesis: { summary: "done", keyPoints: [], uncertainties: [], coverageNote: "1/1" },
  });
  assert.equal(normalized?.brief?.briefFingerprint, "fp-b");
  assert.equal(normalized?.sources[0]?.provenance?.verifiedInCurrentRequest, true);
  assert.equal(normalized?.evidence?.[0]?.authority, "primary_government");
  assert.equal(normalized?.artifact?.workpieceId, "workpiece-b");

  const rejectedBindings = normalizeHearthResearchResult({
    ...normalized,
    evidence: [{ ...normalized?.evidence?.[0], briefFingerprint: "fp-a" }],
    artifact: { ...normalized?.artifact, briefFingerprint: "fp-a" },
  });
  assert.deepEqual(rejectedBindings?.evidence, undefined);
  assert.deepEqual(rejectedBindings?.artifact, undefined);
});
