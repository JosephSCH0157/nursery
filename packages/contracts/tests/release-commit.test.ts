import assert from "node:assert/strict";
import test from "node:test";

import {
  HAMMER_RELEASE_MEMBER_KINDS,
  HAMMER_RELEASE_PROFILE_REQUIREMENTS,
  HAMMER_RELEASE_PROFILES,
  HAMMER_RELEASE_REASON_CLASSIFICATION,
  assertHammerReleaseContractTablesComplete,
  evaluateHammerReleaseReasonCodes,
} from "../hammer/release-commit.contract";
import { HAMMER_QUENCH_CANONICAL_READINESS_REASON_CODES } from "../hammer/quench-readiness-taxonomy.contract";

test("release profile requirement table is exhaustive and profile-specific", () => {
  assert.equal(assertHammerReleaseContractTablesComplete(), true);
  for (const profile of HAMMER_RELEASE_PROFILES) {
    assert.deepEqual(Object.keys(HAMMER_RELEASE_PROFILE_REQUIREMENTS[profile]), [...HAMMER_RELEASE_MEMBER_KINDS]);
  }
  assert.equal(HAMMER_RELEASE_PROFILE_REQUIREMENTS.audio_episode.final_video_master.integrity, "forbidden");
  assert.equal(HAMMER_RELEASE_PROFILE_REQUIREMENTS.video_episode.final_video_master.integrity, "required");
  assert.equal(HAMMER_RELEASE_PROFILE_REQUIREMENTS.video_episode.captions_srt.integrity, "optional");
  assert.equal(HAMMER_RELEASE_PROFILE_REQUIREMENTS.video_episode.captions_srt.publication, "required");
});

test("every existing readiness reason has one explicit release disposition", () => {
  assert.deepEqual(Object.keys(HAMMER_RELEASE_REASON_CLASSIFICATION), [
    ...HAMMER_QUENCH_CANONICAL_READINESS_REASON_CODES,
  ]);
});

test("integrity failures prevent certification and cannot become review posture", () => {
  const result = evaluateHammerReleaseReasonCodes([
    "packet_final_audio_master_missing",
    "handoff_needs_review",
  ]);
  assert.equal(result.certification_allowed, false);
  assert.equal(result.editorial_status, "blocked");
  assert.deepEqual(result.preventing_codes, ["packet_final_audio_master_missing"]);
  assert.deepEqual(result.review_codes, ["handoff_needs_review"]);
});

test("review reasons permit certification but prohibit publication", () => {
  const result = evaluateHammerReleaseReasonCodes(["export_posture_degraded"]);
  assert.equal(result.certification_allowed, true);
  assert.equal(result.editorial_status, "needs_review");
  assert.equal(result.publication_allowed_by_reasons, false);
});

test("unknown reasons fail closed", () => {
  const result = evaluateHammerReleaseReasonCodes(["future_unclassified_reason"]);
  assert.equal(result.certification_allowed, false);
  assert.equal(result.editorial_status, "blocked");
  assert.deepEqual(result.unknown_codes, ["future_unclassified_reason"]);
});
