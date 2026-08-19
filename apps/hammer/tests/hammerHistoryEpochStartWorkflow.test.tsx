import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { HammerHistoryEpochStartWorkflow, historyEpochStartCandidateKey, isHammerHistoryEpochStartEligible, type HammerHistoryEpochStartCandidate } from "../src/editor/hammerHistoryEpochStartWorkflow";

const candidate: HammerHistoryEpochStartCandidate = { workspaceId: "11111111-1111-4111-8111-111111111111", workpieceId: "22222222-2222-4222-8222-222222222222", canonicalRecordingId: "33333333-3333-4333-8333-333333333333", revisionId: "44444444-4444-4444-8444-444444444444", revisionUpdatedAt: "2026-08-19T14:00:00.123456Z", historyPath: "hammer/revisions/44444444-4444-4444-8444-444444444444/history.v1.json", canonicalBaseHash: "hammer-state:1234abcd", registry: { path: "hammer/revisions/44444444-4444-4444-8444-444444444444/history.v1.json", sha256: "a".repeat(64), bytes: 208379, revision: 7, updated_at: "2026-08-19T13:59:59.654321Z", storage_bucket: "forge-workpieces", storage_key: "workpieces/22222222-2222-4222-8222-222222222222/hammer/revisions/44444444-4444-4444-8444-444444444444/history.v1.json" }, canonicalState: { transcriptSegments: [], visualPlacements: null, visualTimeline: null, audioEdit: null, studioRack: {} as never, editorialAuthorityGraph: {} as never, outputSelection: { layerId: null, sourceRecipeRef: null }, selectedSegmentId: null, playheadSec: 0, transcriptTimingHint: null }, componentPaths: { audio: "audio", editorial_authority: "authority", transcript: "transcript", visual_placements: "placements", visual_timeline: "timeline" } };

test("only an editor-authorized verified divergence candidate is eligible", () => {
  assert.equal(isHammerHistoryEpochStartEligible({ candidate, workspaceRole: "editor", commandAvailable: true }), true);
  assert.equal(isHammerHistoryEpochStartEligible({ candidate, workspaceRole: "owner", commandAvailable: true }), true);
  for (const workspaceRole of ["viewer", null]) assert.equal(isHammerHistoryEpochStartEligible({ candidate, workspaceRole, commandAvailable: true }), false);
  assert.equal(isHammerHistoryEpochStartEligible({ candidate: null, workspaceRole: "editor", commandAvailable: true }), false);
  assert.equal(isHammerHistoryEpochStartEligible({ candidate, workspaceRole: "editor", commandAvailable: false }), false);
});

test("canonical or durable token changes invalidate the frozen confirmation key losslessly", () => {
  const key = historyEpochStartCandidateKey(candidate); assert.equal(key.includes(".123456Z"), true);
  assert.notEqual(historyEpochStartCandidateKey({ ...candidate, canonicalBaseHash: "hammer-state:deadbeef" }), key);
  assert.notEqual(historyEpochStartCandidateKey({ ...candidate, revisionUpdatedAt: "2026-08-19T14:00:00.123457Z" }), key);
});

test("eligible divergence renders only the deliberate entry action; ordinary states render nothing", () => {
  const base = { getCurrentCandidate: () => candidate, start: async () => ({ outcome: "conflict", code: "unused", terminal: true, retryable: false } as const), onPendingChange: () => undefined, onSuccess: () => undefined, onRequireFreshReadback: () => undefined };
  const eligible = renderToStaticMarkup(<HammerHistoryEpochStartWorkflow {...base} candidate={candidate} workspaceRole="editor" commandAvailable />);
  assert.match(eligible, />Start new history from current state</); assert.doesNotMatch(eligible, />Start new history</);
  assert.equal(renderToStaticMarkup(<HammerHistoryEpochStartWorkflow {...base} candidate={null} workspaceRole="editor" commandAvailable />), "");
});

test("workflow source locks confirmation copy, one in-flight call, no retry, and exact final label", () => {
  const source = readFileSync(new URL("../src/editor/hammerHistoryEpochStartWorkflow.tsx", import.meta.url), "utf8");
  for (const text of ["Existing content will not be changed.", "preserved immutably", "Earlier undo and redo history will remain unavailable.", "exact current canonical state", "Undo cannot cross the new epoch boundary.", ">Start new history</button>"]) assert.equal(source.includes(text), true);
  assert.equal(source.includes("if (!frozen || inFlight.current) return"), true); assert.equal(source.includes("props.start("), true); assert.equal(source.match(/props\.start\(/g)?.length, 1); assert.equal(source.includes("setTimeout"), false);
});
