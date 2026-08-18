import assert from "node:assert/strict";
import test from "node:test";
import {
  HAMMER_SESSION_CONFLICT_CODES,
  canRetryHammerTranscript,
  classifyHammerSessionOpenFailure,
  createHammerSessionRetryTransition,
  isActiveHammerTranscriptPrepJob,
  shouldPollHammerTranscriptPrepJob,
  shouldTerminateIdleHammerLoadingContext,
} from "../src/editor/hammerSessionStabilization";

test("every canonical session conflict remains a coded terminal session failure", () => {
  for (const code of HAMMER_SESSION_CONFLICT_CODES) {
    assert.deepEqual(classifyHammerSessionOpenFailure(code), {
      kind: "session_open_failed",
      code,
    });
  }
});

test("session errors never expose transcript retry", () => {
  assert.equal(canRetryHammerTranscript({
    hydrationReady: true,
    transcriptDiscoveryStatus: "complete",
    failureKind: "session_open_failed",
  }), false);
});

test("transcript retry requires successful hydration and completed discovery", () => {
  assert.equal(canRetryHammerTranscript({
    hydrationReady: true,
    transcriptDiscoveryStatus: "complete",
    failureKind: "non_ai_missing",
  }), true);
  assert.equal(canRetryHammerTranscript({
    hydrationReady: false,
    transcriptDiscoveryStatus: "complete",
    failureKind: "non_ai_missing",
  }), false);
  assert.equal(canRetryHammerTranscript({
    hydrationReady: true,
    transcriptDiscoveryStatus: "failed",
    failureKind: "non_ai_missing",
  }), false);
});

test("session retry advances canonical hydration reload and resets discovery to pending", () => {
  assert.deepEqual(createHammerSessionRetryTransition(7), {
    reloadNonce: 8,
    transcriptDiscoveryStatus: "pending",
  });
});

test("idle loading-context preparation terminates only when no tracked work remains", () => {
  const idle = {
    prepStatus: "preparing",
    prepStep: "loading_context",
    hydrationInFlight: false,
    prepExecutionInFlight: false,
    transcriptJobId: null,
    readyTransitionPending: false,
  };
  assert.equal(shouldTerminateIdleHammerLoadingContext(idle), true);
  assert.equal(shouldTerminateIdleHammerLoadingContext({ ...idle, hydrationInFlight: true }), false);
  assert.equal(shouldTerminateIdleHammerLoadingContext({ ...idle, prepExecutionInFlight: true }), false);
  assert.equal(shouldTerminateIdleHammerLoadingContext({ ...idle, transcriptJobId: "job_fixture" }), false);
});

test("polling starts only after job-ID installation", () => {
  assert.equal(shouldPollHammerTranscriptPrepJob(null), false);
  assert.equal(shouldPollHammerTranscriptPrepJob("job_fixture"), true);
});

test("completed jobs are neither installed as active prep nor mistaken for a retry", () => {
  assert.equal(isActiveHammerTranscriptPrepJob({
    job_type: "hammer_transcript_prep",
    status: "completed",
  }), false);
  assert.equal(isActiveHammerTranscriptPrepJob({
    job_type: "hammer_transcript_prep",
    status: "queued",
  }), true);
  assert.equal(isActiveHammerTranscriptPrepJob({
    job_type: "hammer_transcript_regeneration",
    status: "running",
  }), false);
});
