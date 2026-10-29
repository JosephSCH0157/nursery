import assert from "node:assert/strict";
import test from "node:test";
import {
  HAMMER_SESSION_CONFLICT_CODES,
  canRetryHammerTranscript,
  claimHammerAiFallbackJobRequest,
  classifyHammerSessionOpenFailure,
  createHammerAiFallbackSelection,
  createHammerSessionRetryTransition,
  finishHammerAiFallbackJobRequest,
  isActiveHammerTranscriptPrepJob,
  preserveHammerAiFallbackSelection,
  shouldPollHammerTranscriptPrepJob,
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

test("AI fallback selection survives ordinary hydration for the same Hammer target", () => {
  const selection = createHammerAiFallbackSelection({
    targetKey: "workspace:workpiece",
    preparationAttemptId: "attempt-1",
    clientRequestId: "request-1",
  });
  assert.equal(preserveHammerAiFallbackSelection(selection, "workspace:workpiece"), selection);
  assert.equal(preserveHammerAiFallbackSelection(selection, "workspace:other-workpiece"), null);
  assert.equal(preserveHammerAiFallbackSelection(
    finishHammerAiFallbackJobRequest({ selection, cancelled: true }),
    "workspace:workpiece",
  ), null);
});

test("one AI selection can claim exactly one transcript job request", () => {
  const selection = createHammerAiFallbackSelection({
    targetKey: "workspace:workpiece",
    preparationAttemptId: "attempt-1",
    clientRequestId: "request-1",
  });
  const first = claimHammerAiFallbackJobRequest({
    selection,
    targetKey: "workspace:workpiece",
    preparationAttemptId: "attempt-1",
  });
  assert.equal(first.claimed, true);
  assert.equal(first.selection?.jobRequestState, "requesting");
  const duplicate = claimHammerAiFallbackJobRequest({
    selection: first.selection,
    targetKey: "workspace:workpiece",
    preparationAttemptId: "attempt-1",
  });
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.selection?.jobRequestState, "requesting");
});

test("AI fallback claim fails closed if rehydration changes the preparation attempt", () => {
  const selection = createHammerAiFallbackSelection({
    targetKey: "workspace:workpiece",
    preparationAttemptId: "attempt-1",
    clientRequestId: "request-1",
  });
  const result = claimHammerAiFallbackJobRequest({
    selection,
    targetKey: "workspace:workpiece",
    preparationAttemptId: "attempt-2",
  });
  assert.equal(result.claimed, false);
  assert.equal(result.selection?.jobRequestState, "failed");
});

test("created, failed, and cancelled job states are terminal for automatic submission", () => {
  const selected = createHammerAiFallbackSelection({
    targetKey: "workspace:workpiece",
    preparationAttemptId: "attempt-1",
    clientRequestId: "request-1",
  });
  const requesting = claimHammerAiFallbackJobRequest({
    selection: selected,
    targetKey: "workspace:workpiece",
    preparationAttemptId: "attempt-1",
  }).selection!;
  for (const terminal of [
    finishHammerAiFallbackJobRequest({ selection: requesting, jobId: "job-1" }),
    finishHammerAiFallbackJobRequest({ selection: requesting, failed: true }),
    finishHammerAiFallbackJobRequest({ selection: requesting, cancelled: true }),
  ]) {
    const replay = claimHammerAiFallbackJobRequest({
      selection: terminal,
      targetKey: "workspace:workpiece",
      preparationAttemptId: "attempt-1",
    });
    assert.equal(replay.claimed, false);
  }
});
