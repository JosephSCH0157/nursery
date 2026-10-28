import assert from "node:assert/strict";
import {
  PAID_SUBMISSIONS_HALTED_MESSAGE,
  buildTranscriptJobFailureMessage,
  isRetryableWorkpieceJobFailure,
  readWorkpieceJobApiError,
} from "../src/editor/hammerWorkpieceJobErrors";
import { createWorkpieceJob } from "../src/editor/hammerWorkpieceJobsApi";

const financialHalt = readWorkpieceJobApiError({
  ok: false,
  error: {
    code: "paid_submissions_halted",
    message: PAID_SUBMISSIONS_HALTED_MESSAGE,
  },
}, "fallback");

assert.deepEqual(financialHalt, {
  code: "paid_submissions_halted",
  message: PAID_SUBMISSIONS_HALTED_MESSAGE,
});
assert.equal(isRetryableWorkpieceJobFailure({ status: 423, code: financialHalt.code }), false);
assert.equal(buildTranscriptJobFailureMessage({
  status: 423,
  code: financialHalt.code,
  error: financialHalt.message,
}), PAID_SUBMISSIONS_HALTED_MESSAGE);

const unrelatedPermission = readWorkpieceJobApiError({
  error: { code: "db_write_failed", message: "Failed to create workpiece job" },
}, "fallback");
assert.equal(unrelatedPermission.code, "db_write_failed");
assert.equal(isRetryableWorkpieceJobFailure({ status: 502, code: unrelatedPermission.code }), true);

const transientMessage = buildTranscriptJobFailureMessage({
  status: 503,
  code: "ai_policy_unavailable",
  error: "Unable to resolve AI policy for workpiece job creation",
  retryAfterMs: 2_500,
});
assert.equal(
  transientMessage,
  "Transcript service is temporarily unavailable. Retry in about 3s. Unable to resolve AI policy for workpiece job creation",
);

const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
const originalLocalStorage = (globalThis as typeof globalThis & { localStorage?: unknown }).localStorage;
const originalFetch = globalThis.fetch;
let requestCount = 0;
(globalThis as typeof globalThis & { window?: unknown }).window = globalThis;
(globalThis as typeof globalThis & { localStorage?: unknown }).localStorage = {
  length: 1,
  getItem(key: string) {
    return key === "forge-auth" ? JSON.stringify({ access_token: "fixture-user-token" }) : null;
  },
  key(index: number) {
    return index === 0 ? "forge-auth" : null;
  },
};
globalThis.fetch = async () => {
  requestCount += 1;
  return new Response(JSON.stringify({
    ok: false,
    error: {
      code: "paid_submissions_halted",
      message: PAID_SUBMISSIONS_HALTED_MESSAGE,
    },
  }), {
    status: 423,
    headers: { "content-type": "application/json" },
  });
};

try {
  const request = {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workpieceId: "22222222-2222-4222-8222-222222222222",
    jobType: "hammer_transcript_prep" as const,
  };
  const first = await createWorkpieceJob(request);
  assert.equal(first.ok, false);
  if (!first.ok) {
    assert.equal(first.status, 423);
    assert.equal(first.code, "paid_submissions_halted");
    assert.equal(first.retryAfterMs, undefined);
  }
  assert.equal(requestCount, 1, "a financial halt must not trigger an automatic retry");

  await createWorkpieceJob(request);
  assert.equal(requestCount, 2, "a financial halt must not install transient-service backoff");
} finally {
  globalThis.fetch = originalFetch;
  (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  (globalThis as typeof globalThis & { localStorage?: unknown }).localStorage = originalLocalStorage;
}

console.log("hammer workpiece job financial denial error contract tests passed");
