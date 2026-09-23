import test from "node:test";
import assert from "node:assert/strict";
import {
  executeBoundedOpenAiTextTransport,
  OPENAI_TEXT_ATTEMPT_LEASE_SECONDS,
  OPENAI_TEXT_OUTER_REQUEST_DEADLINE_MS,
  OPENAI_TEXT_PROVIDER_DEADLINE_MS,
  OpenAiTextTransportFailure,
} from "../dist/providers/openai-text-timing-contract.js";

test("provider, lease, and outer deadlines form one ordered authority window", () => {
  assert.ok(OPENAI_TEXT_PROVIDER_DEADLINE_MS < OPENAI_TEXT_ATTEMPT_LEASE_SECONDS * 1_000);
  assert.ok(OPENAI_TEXT_ATTEMPT_LEASE_SECONDS * 1_000 <= OPENAI_TEXT_OUTER_REQUEST_DEADLINE_MS);
});

test("a synchronous failure before fetch acceptance is provably pre-transmission", async () => {
  await assert.rejects(
    executeBoundedOpenAiTextTransport({
      routeCode: "visual.unified_plan",
      deadlineMs: 50,
      execute: () => { throw new Error("invalid transport setup"); },
    }),
    (error) => {
      assert.ok(error instanceof OpenAiTextTransportFailure);
      assert.equal(error.ambiguous, false);
      assert.equal(error.evidence.fetch_entered, false);
      assert.equal(error.evidence.transmitted, false);
      return true;
    },
  );
});

test("a post-fetch hung transport is bounded and classified submission-unknown", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    executeBoundedOpenAiTextTransport({
      routeCode: "visual.unified_plan",
      deadlineMs: 25,
      execute: async ({ markTransmissionStarted }) => {
        markTransmissionStarted();
        return await new Promise(() => {});
      },
    }),
    (error) => {
      assert.ok(error instanceof OpenAiTextTransportFailure);
      assert.equal(error.ambiguous, true);
      assert.equal(error.evidence.deadline_expired, true);
      assert.equal(error.evidence.transmitted, "unknown");
      return true;
    },
  );
  assert.ok(Date.now() - startedAt < 1_000);
});
