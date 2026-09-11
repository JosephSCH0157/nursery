import assert from "node:assert/strict";
import test from "node:test";
import {
  executePaidHearthChatCompletion,
  type PaidHearthChatResult,
} from "../server/hearth/hearth-paid-chat-execution";
import { validateHearthCompositionArtifact } from "../../hearth/src/lib/hearth-composition-output";

const handle = {
  operationId: "hearth-chat-operation-1",
  reservationId: "11111111-1111-4111-8111-111111111111",
  requestFingerprint: "a".repeat(64),
};

function resolvedContext(state = "reserved") {
  return {
    operation_id: handle.operationId,
    reservation_id: handle.reservationId,
    quote_id: "22222222-2222-4222-8222-222222222222",
    funding_source_type: "owner_budget",
    funding_source_id: "33333333-3333-4333-8333-333333333333",
    credential_funding: "forge",
    model: "gpt-5.3-chat-latest",
    maximum_input_units: 2000,
    maximum_output_units: 512,
    maximum_attempts: 1,
    maximum_failure_exposure_micros: 20668,
    direct_provider_ceiling_micros: 10668,
    supporting_cost_ceiling_micros: 10000,
    input_micros_per_million_tokens: 1750000,
    output_micros_per_million_tokens: 14000000,
    reservation_state: state,
  };
}

function buildGate(state = "reserved") {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "resolve_hearth_chat_paid_execution_context" || name === "resolve_openai_text_paid_execution_context") {
        return { data: resolvedContext(state), error: null };
      }
      if (name === "bind_bounded_provider_request") {
        return { data: { replay: false }, error: null };
      }
      if (name === "authorize_openai_text_provider_attempt" || name === "authorize_openai_text_provider_attempt_with_aggregate") {
        return { data: { provider_execution_authorized: true }, error: null };
      }
      if (name === "settle_owner_operation") {
        return { data: { customer_charge_micros: 0 }, error: null };
      }
      if (name === "read_hearth_chat_paid_result") {
        return {
          data: {
            provider_request_id: "req_replay",
            input_units: 12,
            output_units: 8,
            customer_charge_micros: 0,
            result_json: { assistantText: "Persisted reply", ops: [], scriptText: null, tagAudit: null },
          },
          error: null,
        };
      }
      return { data: {}, error: null };
    },
  };
}

function validResult(rawReply: string): PaidHearthChatResult {
  return { assistantText: rawReply, ops: [], scriptText: null, tagAudit: null };
}

const ORIGINAL_REQUEST = "Write one neutral sentence encouraging a podcaster to review their outline before recording.";
// The production response body was not retained. This synthetic fixture exercises
// the same ordinary-sentence shape without pretending to reproduce provider text.
const SYNTHETIC_RESPONSE_FIXTURE = "Before recording, take a moment to review your outline so your ideas flow clearly.";

test("hearth.chat_completion crosses funding, fake provider, canonical persistence, and owner settlement once", async () => {
  const gate = buildGate();
  let providerCalls = 0;
  const outcome = await executePaidHearthChatCompletion({
    gate,
    handle,
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: null,
    workpieceId: "episode-1",
    credentialSource: "forge_managed",
    apiKey: "fake-key",
    messages: [{ role: "user", content: "Reply with one neutral sentence." }],
    signal: new AbortController().signal,
    providerFetch: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({
        id: "chatcmpl_fake",
        choices: [{ message: { content: "A neutral bounded reply." } }],
        usage: { prompt_tokens: 25, completion_tokens: 7 },
      }), { status: 200, headers: { "x-request-id": "req_fake_1" } });
    },
    validateAndNormalize: validResult,
  });
  assert.equal(outcome.state, "settled");
  assert.equal(providerCalls, 1);
  assert.equal(outcome.customerChargeMicros, 0);
  assert.equal(outcome.result.assistantText, "A neutral bounded reply.");
  const names = gate.calls.map((call) => call.name);
  assert.ok(names.indexOf("authorize_openai_text_provider_attempt") < names.indexOf("persist_hearth_chat_paid_result"));
  assert.ok(names.indexOf("persist_hearth_chat_paid_result") < names.indexOf("settle_owner_operation"));
  assert.equal(names.includes("reserve_operation"), false);
  const expense = gate.calls.find((call) => call.name === "record_openai_text_supplier_attempt_expense");
  assert.equal(expense?.args.p_evidence_status, "estimated");
  const support = gate.calls.find((call) => call.name === "record_supplier_expense");
  assert.equal(support?.args.p_amount_micros, 10000);
  assert.equal(support?.args.p_evidence_status, "estimated");
  assert.equal(support?.args.p_obligation_status, "closed");
  const settlement = gate.calls.find((call) => call.name === "settle_owner_operation");
  assert.equal(settlement?.args.p_actual_fulfillment_cost_micros, 10142);
});

test("mentioning an outline does not impose outline-artifact validation on the retained-request regression", async () => {
  const gate = buildGate();
  const outcome = await executePaidHearthChatCompletion({
    gate,
    handle: { ...handle, operationId: "hearth-chat-original-request-regression" },
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: null,
    workpieceId: "episode-1",
    credentialSource: "forge_managed",
    apiKey: "fake-key",
    messages: [{ role: "user", content: ORIGINAL_REQUEST }],
    signal: new AbortController().signal,
    providerFetch: async () => new Response(JSON.stringify({
      id: "chatcmpl_synthetic_regression_fixture",
      choices: [{ message: { content: SYNTHETIC_RESPONSE_FIXTURE } }],
      usage: { prompt_tokens: 30, completion_tokens: 15 },
    }), { status: 200, headers: { "x-request-id": "req_synthetic_fixture" } }),
    validateAndNormalize: (rawReply) => {
      const validation = validateHearthCompositionArtifact({ requestText: ORIGINAL_REQUEST, assistantText: rawReply, ops: [] });
      if (!validation.ok) throw new Error(validation.error ?? "unexpected composition validation failure");
      return validResult(rawReply);
    },
  });
  assert.equal(outcome.state, "settled");
  assert.equal(outcome.result.assistantText, SYNTHETIC_RESPONSE_FIXTURE);
  assert.equal(gate.calls.filter((call) => call.name === "persist_hearth_chat_paid_result").length, 1);
  assert.equal(gate.calls.filter((call) => call.name === "settle_owner_operation").length, 1);
});

test("an actual outline-generation request still requires and accepts a substantive outline", async () => {
  const gate = buildGate();
  const request = "Create a bullet outline for an episode about preparing to record.";
  const outline = "- Check the microphone\n- Review the episode beats\n- Start recording";
  const outcome = await executePaidHearthChatCompletion({
    gate,
    handle: { ...handle, operationId: "hearth-chat-real-outline-regression" },
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: null,
    workpieceId: "episode-1",
    credentialSource: "forge_managed",
    apiKey: "fake-key",
    messages: [{ role: "user", content: request }],
    signal: new AbortController().signal,
    providerFetch: async () => new Response(JSON.stringify({
      id: "chatcmpl_outline_fixture",
      choices: [{ message: { content: outline } }],
      usage: { prompt_tokens: 25, completion_tokens: 20 },
    }), { status: 200, headers: { "x-request-id": "req_outline_fixture" } }),
    validateAndNormalize: (rawReply) => {
      const validation = validateHearthCompositionArtifact({ requestText: request, assistantText: rawReply, ops: [] });
      if (!validation.ok) throw new Error(validation.error ?? "outline validation failure");
      return validResult(rawReply);
    },
  });
  assert.equal(outcome.state, "settled");
  assert.equal(outcome.result.assistantText, outline);
});

test("provider usage and expense are retained when later Forge validation fails", async () => {
  const gate = buildGate();
  const outcome = await executePaidHearthChatCompletion({
    gate,
    handle: { ...handle, operationId: "hearth-chat-forge-validation-failure" },
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: null,
    workpieceId: "episode-1",
    credentialSource: "forge_managed",
    apiKey: "fake-key",
    messages: [{ role: "user", content: "Create a bullet outline." }],
    signal: new AbortController().signal,
    providerFetch: async () => new Response(JSON.stringify({
      id: "chatcmpl_invalid_outline",
      choices: [{ message: { content: "I made the outline for you." } }],
      usage: { prompt_tokens: 31, completion_tokens: 9 },
    }), { status: 200, headers: { "x-request-id": "req_invalid_outline" } }),
    validateAndNormalize: () => { throw new Error("outline artifact missing"); },
  });
  assert.equal(outcome.state, "failed_released");
  const usage = gate.calls.find((call) => call.name === "record_openai_text_usage");
  assert.equal(usage?.args.p_input_units, 31);
  assert.equal(usage?.args.p_output_units, 9);
  assert.equal(usage?.args.p_result_validated, false);
  assert.equal(usage?.args.p_canonical_persistence_confirmed, false);
  assert.equal(gate.calls.filter((call) => call.name === "record_openai_text_supplier_attempt_expense").length, 1);
  assert.equal(gate.calls.find((call) => call.name === "record_provider_failure")?.args.p_failure_class, "forge_validation_failure");
  assert.equal(gate.calls.find((call) => call.name === "settle_owner_operation")?.args.p_actual_fulfillment_cost_micros, 10181);
});

test("a settled duplicate reads the persisted result and makes no second provider call", async () => {
  const gate = buildGate("settled");
  let providerCalls = 0;
  const outcome = await executePaidHearthChatCompletion({
    gate,
    handle,
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: null,
    workpieceId: "episode-1",
    credentialSource: "forge_managed",
    apiKey: "fake-key",
    messages: [{ role: "user", content: "Duplicate." }],
    signal: new AbortController().signal,
    providerFetch: async () => { providerCalls += 1; return new Response(); },
    validateAndNormalize: validResult,
  });
  assert.equal(outcome.state, "settled_replay");
  assert.equal(providerCalls, 0);
  assert.equal(outcome.result.assistantText, "Persisted reply");
});

test("an uncertain fake-provider submission remains reserved and is never resubmitted", async () => {
  const gate = buildGate();
  let providerCalls = 0;
  const outcome = await executePaidHearthChatCompletion({
    gate,
    handle,
    userId: "44444444-4444-4444-8444-444444444444",
    workspaceId: null,
    workpieceId: "episode-1",
    credentialSource: "forge_managed",
    apiKey: "fake-key",
    messages: [{ role: "user", content: "Timeout safely." }],
    signal: new AbortController().signal,
    providerFetch: async () => { providerCalls += 1; throw new Error("socket closed after write"); },
    validateAndNormalize: validResult,
  });
  assert.equal(outcome.state, "submission_unknown");
  assert.equal(providerCalls, 1);
  assert.equal(gate.calls.filter((call) => call.name === "authorize_openai_text_provider_attempt_with_aggregate").length, 1);
  assert.equal(gate.calls.some((call) => call.name.includes("settle")), false);
});
