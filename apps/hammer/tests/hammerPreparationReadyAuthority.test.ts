import assert from "node:assert/strict";
import {
  markHammerPreparationReadyWithConvergence,
  type HammerPreparationAuthorityResult,
} from "../src/prep/hammerPreparationReadyAuthority";
import type { HammerPreparationAttemptRecord } from "../src/persistence/hammerRecordingRevisionPersistence";

function attempt(stateVersion: number, state: HammerPreparationAttemptRecord["state"]): HammerPreparationAttemptRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "22222222-2222-4222-8222-222222222222",
    workpiece_id: "33333333-3333-4333-8333-333333333333",
    canonical_recording_id: "44444444-4444-4444-8444-444444444444",
    recording_revision_id: "55555555-5555-4555-8555-555555555555",
    source_kind: "anvil_capture",
    source_authority_id: null,
    source_capture_authority_id: null,
    media_path: "recordings/take.webm",
    media_id: "media-1",
    media_hash: "sha256:aaa",
    transcript_policy: "allow_ai_fallback",
    state,
    state_version: stateVersion,
    transcript_job_id: "66666666-6666-4666-8666-666666666666",
    transcript_artifact_path: null,
    failure_code: null,
    failure_detail: null,
    retry_count: 0,
    updated_at: "2026-08-27T12:00:00.000Z",
  };
}

const conflict: HammerPreparationAuthorityResult = {
  ok: false,
  status: 409,
  error: "Hammer preparation changed.",
  error_code: "preparation_state_changed",
};

{
  const calls: number[] = [];
  const result = await markHammerPreparationReadyWithConvergence({
    attempt: attempt(4, "awaiting_transcript_choice"),
    dependencies: {
      advanceMarkReady: async (current) => {
        calls.push(current.state_version);
        return current.state_version === 4
          ? conflict
          : { ok: true, status: 200, data: attempt(6, "ready") };
      },
      refreshAttempt: async () => ({ ok: true, status: 200, data: attempt(5, "transcribing") }),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.state, "ready");
  assert.deepEqual(calls, [4, 5], "stale N must retry mark_ready with canonical N+1");
}

{
  let advanceCalls = 0;
  const result = await markHammerPreparationReadyWithConvergence({
    attempt: attempt(8, "transcribing"),
    dependencies: {
      advanceMarkReady: async () => {
        advanceCalls += 1;
        return conflict;
      },
      refreshAttempt: async () => ({ ok: true, status: 200, data: attempt(10, "ready") }),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.state, "ready");
  assert.equal(advanceCalls, 1, "an already-ready canonical attempt must converge without another mutation");
}

{
  const result = await markHammerPreparationReadyWithConvergence({
    attempt: attempt(3, "transcribing"),
    dependencies: {
      advanceMarkReady: async () => ({ ok: true, status: 200, data: attempt(4, "hydrating") }),
      refreshAttempt: async () => {
        throw new Error("refresh must not run after a successful mutation");
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error_code, "hammer_preparation_not_ready");
}

console.log("hammer preparation ready authority tests passed");
