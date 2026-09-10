import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateOpenAiTranscriptionDirectCostMicros,
  executePaidOpenAiTranscriptionRoute,
  readOpenAiTranscriptionUsage,
} from "../dist/providers/paid-openai-transcription-route-execution.js";
import { fingerprintOpenAiTextPaidRequest } from "../dist/providers/paid-openai-text-route-execution.js";
import { OpenAiTextProviderError } from "../dist/providers/paid-openai-text-execution-coordinator.js";

const reservationId = "11111111-1111-4111-8111-111111111111";

function makeGate({ state = "reserved", authorize = true, aggregateAuthorize = true, stored = null } = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "resolve_openai_text_paid_execution_context") {
        return { data: {
          operation_id: "transcription-operation", reservation_id: reservationId,
          quote_id: "22222222-2222-4222-8222-222222222222", route_code: args.p_route_code,
          funding_source_type: "customer_deposit", funding_source_id: "33333333-3333-4333-8333-333333333333",
          credential_funding: "forge", model: "gpt-4o-mini-transcribe",
          maximum_input_units: 16_000, maximum_output_units: 2_000, maximum_attempts: 1,
          maximum_failure_exposure_micros: 30_000, direct_provider_ceiling_micros: 30_000,
          supporting_cost_ceiling_micros: 0, input_micros_per_million_tokens: 1_250_000,
          cached_input_micros_per_million_tokens: 0, output_micros_per_million_tokens: 5_000_000,
          audio_input_micros_per_million_tokens: 1_250_000,
          text_input_micros_per_million_tokens: 1_250_000,
          reservation_state: state,
        }, error: null };
      }
      if (name === "acquire_openai_text_aggregate_admission") {
        return { data: { enforcement_enabled: true, authorized: aggregateAuthorize, reason: aggregateAuthorize ? "authorized" : "aggregate_capacity_exhausted" }, error: null };
      }
      if (name === "authorize_openai_text_provider_attempt_with_aggregate") {
        const allowed = typeof authorize === "function" ? authorize() : authorize;
        return { data: { provider_execution_authorized: allowed }, error: null };
      }
      if (name === "read_openai_text_paid_result") return { data: stored, error: null };
      if (name === "settle_operation") return { data: { customer_charge_micros: 399 }, error: null };
      return { data: {}, error: null };
    },
  };
}

async function routeArgs(gate, overrides = {}) {
  const requestFingerprintPayload = { route: "hearth.speech_transcription", source_sha256: "b".repeat(64) };
  const requestFingerprint = await fingerprintOpenAiTextPaidRequest(requestFingerprintPayload);
  return {
    gate,
    routeCode: "hearth.speech_transcription",
    handle: { operationId: "transcription-operation", reservationId, requestFingerprint },
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: "55555555-5555-4555-8555-555555555555",
    workpieceId: "speech-asset-1",
    credentialSource: "forge_managed",
    callerClass: "interactive",
    inputUnitUpperBound: 2_000,
    requestFingerprintPayload,
    executeProvider: async () => ({
      value: { text: "Canonical transcript" }, requestId: "req_audio_1",
      usage: { audioInputTokens: 1_000, textInputTokens: 0, outputTokens: 100, durationSeconds: 4.2, providerReported: true },
    }),
    validateResult: (value) => { if (!value.text) throw new Error("empty transcript"); },
    persistCanonical: async (value) => ({ ...value, persisted: true }),
    ...overrides,
  };
}

test("reads OpenAI audio-token dimensions without folding output into input", () => {
  assert.deepEqual(readOpenAiTranscriptionUsage({ usage: {
    input_tokens: 1_025,
    input_token_details: { audio_tokens: 1_000, text_tokens: 25 },
    output_tokens: 125,
  } }), {
    audioInputTokens: 1_000, textInputTokens: 25, outputTokens: 125,
    durationSeconds: null, providerReported: true,
  });
});

test("prices audio, text, and output token dimensions using exact accepted rates", () => {
  const context = {
    audioInputMicrosPerMillionTokens: 1_250_000,
    textInputMicrosPerMillionTokens: 1_250_000,
    outputMicrosPerMillionTokens: 5_000_000,
    directProviderCeilingMicros: 30_000,
  };
  assert.equal(estimateOpenAiTranscriptionDirectCostMicros(context, {
    audioInputTokens: 1_000, textInputTokens: 25, outputTokens: 125,
    durationSeconds: null, providerReported: true,
  }), 1_907);
});

test("captures provider audio usage before validation/persistence and settles once", async () => {
  const gate = makeGate();
  const outcome = await executePaidOpenAiTranscriptionRoute(await routeArgs(gate));
  assert.equal(outcome.state, "settled");
  assert.equal(outcome.customerChargeMicros, 399);
  const names = gate.calls.map(({ name }) => name);
  assert.ok(names.indexOf("record_openai_text_provider_capture") < names.indexOf("persist_openai_text_paid_result"));
  assert.ok(names.indexOf("persist_openai_text_paid_result") < names.indexOf("settle_operation"));
  assert.equal(gate.calls.find(({ name }) => name === "record_openai_text_supplier_attempt_expense").args.p_amount_micros, 1_750);
});

test("Forge validation failure charges zero while retaining estimated supplier expense", async () => {
  const gate = makeGate();
  const outcome = await executePaidOpenAiTranscriptionRoute(await routeArgs(gate, {
    validateResult: () => { throw new Error("malformed transcript"); },
  }));
  assert.equal(outcome.state, "failed_released");
  assert.equal(outcome.customerChargeMicros, 0);
  assert.equal(gate.calls.find(({ name }) => name === "record_provider_failure").args.p_failure_class, "forge_validation_failure");
  assert.equal(gate.calls.filter(({ name }) => name === "record_openai_text_supplier_attempt_expense").length, 1);
  assert.equal(gate.calls.filter(({ name }) => name === "settle_openai_customer_failure_without_duplicate_expense").length, 1);
  assert.equal(gate.calls.some(({ name }) => name === "settle_operation"), false);
});

test("ambiguous audio submission retains reservation and never retries", async () => {
  const gate = makeGate();
  let submissions = 0;
  const outcome = await executePaidOpenAiTranscriptionRoute(await routeArgs(gate, {
    executeProvider: async () => {
      submissions += 1;
      throw new OpenAiTextProviderError("connection outcome unknown", true, null);
    },
  }));
  assert.equal(outcome.state, "submission_unknown");
  assert.equal(submissions, 1);
  assert.equal(gate.calls.filter(({ name }) => name === "mark_submission_unknown").length, 1);
  assert.equal(gate.calls.some(({ name }) => name === "settle_operation"), false);
});

test("concurrent duplicate authority permits one audio provider boundary", async () => {
  let grants = 0;
  const gate = makeGate({ authorize: () => ++grants === 1 });
  let submissions = 0;
  const args = await routeArgs(gate, {
    executeProvider: async () => {
      submissions += 1;
      return { value: { text: "one" }, requestId: "req_only", usage: {
        audioInputTokens: 1, textInputTokens: 0, outputTokens: 1, durationSeconds: 1, providerReported: true,
      } };
    },
  });
  const outcomes = await Promise.allSettled([
    executePaidOpenAiTranscriptionRoute(args),
    executePaidOpenAiTranscriptionRoute(args),
  ]);
  assert.equal(submissions, 1);
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
});

test("shared aggregate capacity rejection releases transcription funding before provider execution", async () => {
  const gate = makeGate({ aggregateAuthorize: false });
  let submissions = 0;
  const args = await routeArgs(gate, {
    executeProvider: async () => {
      submissions += 1;
      throw new Error("provider must not run");
    },
  });
  await assert.rejects(() => executePaidOpenAiTranscriptionRoute(args), /funding_context_required/);
  assert.equal(submissions, 0);
  assert.equal(gate.calls.filter(({ name }) => name === "release_operation").length, 1);
  assert.equal(gate.calls.some(({ name }) => name === "authorize_openai_text_provider_attempt_with_aggregate"), false);
});

test("BYO binding cannot execute through a Forge credential", async () => {
  const gate = makeGate();
  const original = gate.rpc.bind(gate);
  gate.rpc = async (name, args) => {
    const result = await original(name, args);
    if (name === "resolve_openai_text_paid_execution_context") result.data.credential_funding = "byo_customer";
    return result;
  };
  let submissions = 0;
  await assert.rejects(async () => executePaidOpenAiTranscriptionRoute(await routeArgs(gate, {
    executeProvider: async () => { submissions += 1; throw new Error("must not execute"); },
  })), /byo_credential_required/);
  assert.equal(submissions, 0);
});
