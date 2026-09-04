import assert from "node:assert/strict";
import test from "node:test";
import { HAMMER_SHORTS_AI_PROPOSAL_SCHEMA } from "../../../packages/contracts/hammer/shorts.contract";
import { hammerShortCoreOverlapRatio, resolveHammerShortCandidates } from "../src/editor/hammerShortsResolver";

const segments = Array.from({ length: 12 }, (_, index) => ({ segment_id: `s${index + 1}`, text: `Segment ${index + 1}.`, output_start_sec: index * 5, output_end_sec: index * 5 + 5, source_start_sec: index < 6 ? index * 5 : index * 5 + 4, source_end_sec: index < 6 ? index * 5 + 5 : index * 5 + 9 }));
const proposal = (rows: Array<[string, string, string]>) => ({ schema_version: HAMMER_SHORTS_AI_PROPOSAL_SCHEMA, discovery_id: "discovery", provider: "openai" as const, model: "gpt-5.3", provider_request_id: null, prompt_fingerprint: "a".repeat(64), proposals: rows.map(([id, first, last], index) => ({ proposal_id: id, rank: index + 1, first_segment_id: first, last_segment_id: last, rationale: "Strong moment", goal_fit: "Fits" })) });

test("resolves anchors, source discontinuities, and edit handles deterministically", async () => {
  const result = await resolveHammerShortCandidates({ discoveryId: "discovery", basisLockId: "lock", basisFingerprint: "b".repeat(64), minimumDurationSec: 20, maximumDurationSec: 40, proposal: proposal([["p1", "s1", "s5"], ["p2", "s7", "s11"]]), outputSegments: segments });
  assert.equal(result.outcome, "partial");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[1]?.source_intervals.length, 1);
  assert.equal(result.candidates[0]?.envelope_output_end_sec, 25);
});

test("deduplicates using core overlap and ignores envelope overlap", async () => {
  const result = await resolveHammerShortCandidates({ discoveryId: "discovery", basisLockId: "lock", basisFingerprint: "b".repeat(64), minimumDurationSec: 20, maximumDurationSec: 40, proposal: proposal([["p1", "s1", "s5"], ["p2", "s3", "s6"], ["p3", "s6", "s9"]]), outputSegments: segments });
  assert.deepEqual(result.candidates.map((candidate) => candidate.proposal_id), ["p1", "p3"]);
  assert.equal(result.rejected[0]?.reason, "duplicate_core_overlap");
  assert.equal(hammerShortCoreOverlapRatio(result.candidates[0]!, result.candidates[1]!), 0);
});

test("returns truthful empty results instead of failing cardinality", async () => {
  const result = await resolveHammerShortCandidates({ discoveryId: "discovery", basisLockId: "lock", basisFingerprint: "b".repeat(64), minimumDurationSec: 45, maximumDurationSec: 75, proposal: proposal([["p1", "missing", "s3"], ["p2", "s1", "s2"]]), outputSegments: segments });
  assert.equal(result.outcome, "empty");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected.length, 2);
});
