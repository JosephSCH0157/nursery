import assert from "node:assert/strict";
import test from "node:test";
import {
  BELLOWS_SYNC_MAX_ERROR_MS,
  buildBellowsUploadPartId,
  isBellowsSyncObservationWithinTolerance,
  type BellowsSyncObservation,
} from "../../src/index.js";

function observation(residual: number | null): BellowsSyncObservation {
  return {
    observationId: "sync-1",
    sessionId: "session-1" as BellowsSyncObservation["sessionId"],
    participantId: "participant-1" as BellowsSyncObservation["participantId"],
    segmentId: "segment-1",
    kind: "interval",
    expectedOffsetMs: 300_000,
    observedAudioOffsetMs: 300_000,
    observedVideoOffsetMs: 300_000,
    correctedResidualMs: residual,
    confidence: 1,
    observedAt: "2026-09-05T12:00:00.000Z",
  };
}

test("builds stable upload-part identities and rejects invalid sequences", () => {
  assert.equal(buildBellowsUploadPartId("segment-1", 0), "segment-1:part:0");
  assert.equal(buildBellowsUploadPartId("segment-1", 12), "segment-1:part:12");
  assert.throws(() => buildBellowsUploadPartId("", 0));
  assert.throws(() => buildBellowsUploadPartId("segment-1", -1));
  assert.throws(() => buildBellowsUploadPartId("segment-1", 1.5));
});

test("enforces the forty millisecond certification tolerance", () => {
  assert.equal(BELLOWS_SYNC_MAX_ERROR_MS, 40);
  assert.equal(isBellowsSyncObservationWithinTolerance(observation(40)), true);
  assert.equal(isBellowsSyncObservationWithinTolerance(observation(-40)), true);
  assert.equal(isBellowsSyncObservationWithinTolerance(observation(40.01)), false);
  assert.equal(isBellowsSyncObservationWithinTolerance(observation(null)), false);
});
