import assert from "node:assert/strict";
import test from "node:test";
import {
  ANVIL_WHISPER_ROUTE,
  createAnvilWhisperHandler,
} from "../server/anvil/create-anvil-whisper-handler";
import type { OwnerCostRpcGate } from "../server/anvil/forge-owner-cost-transcription";
import { calculateOpenAiOwnerCostValuation } from "../server/anvil/forge-owner-cost-transcription";

const TEST_USER_ID = "11111111-2222-4333-8444-555555555555";
const OPERATION_CREATED_AT = "2026-09-28T12:00:00.000Z";

type RpcCall = { name: string; args: Record<string, unknown> };

function createRecordingGate(options: { failTerminal?: boolean } = {}): {
  gate: OwnerCostRpcGate;
  calls: RpcCall[];
} {
  const calls: RpcCall[] = [];
  const submitted = new Set<string>();
  const operationFingerprints = new Map<string, string>();
  return {
    calls,
    gate: {
      async rpc(name, args = {}) {
        calls.push({ name, args });
        if (name === "read_financial_runtime_environment") {
          return { data: { financial_environment: "test" }, error: null };
        }
        if (name === "establish_owner_cost_operation") {
          const operationId = String(args.p_operation_id);
          const fingerprint = String(args.p_request_fingerprint);
          const existing = operationFingerprints.get(operationId);
          if (existing && existing !== fingerprint) {
            return { data: null, error: { message: "owner-cost operation replay conflict", code: "23505" } };
          }
          operationFingerprints.set(operationId, fingerprint);
          return { data: { replay: existing != null }, error: null };
        }
        if (name === "append_owner_cost_attempt_event") {
          const state = String(args.p_lifecycle_state ?? "");
          if (state === "submitted") {
            const eventId = String(args.p_attempt_event_id);
            if (submitted.has(eventId)) {
              return { data: { replay: true, provider_submission_created: false }, error: null };
            }
            submitted.add(eventId);
            return { data: { replay: false, provider_submission_created: true }, error: null };
          }
          if (options.failTerminal && Number(args.p_event_sequence) === 4) {
            return { data: null, error: { message: "terminal persistence failed", code: "XX000" } };
          }
          return { data: { replay: false, provider_submission_created: false }, error: null };
        }
        if (name === "record_owner_cost_valuation") {
          return {
            data: {
              valuation_id: args.p_valuation_id,
              journal_event_id: args.p_recognition_mode === "journal_recognized" ? args.p_valuation_id : null,
              replay: false,
            },
            error: null,
          };
        }
        return { data: { replay: false }, error: null };
      },
    },
  };
}

function buildRequest(): Request {
  const form = new FormData();
  form.set("file", new Blob(["stable audio bytes"], { type: "audio/webm" }), "chunk.webm");
  form.set("language", "en-US");
  form.set("operation_created_at", OPERATION_CREATED_AT);
  form.set("source_asset_revision", "recording-chunk:17");
  form.set("workspace_id", "10000000-0000-4000-8000-000000000001");
  form.set("workpiece_id", "10000000-0000-4000-8000-000000000002");
  form.set("recording_session_id", "10000000-0000-4000-8000-000000000003");
  form.set("recording_capture_authority_id", "10000000-0000-4000-8000-000000000004");
  form.set("anvil_capture_execution_id", "10000000-0000-4000-8000-000000000005");
  return new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
    method: "POST",
    headers: { authorization: "Bearer test-access-token" },
    body: form,
  });
}

function createHandler(gate: OwnerCostRpcGate) {
  return createAnvilWhisperHandler({
    apiKey: "forge-openai-key",
    sttModel: "gpt-4o-mini-transcribe",
    supabaseUrl: "https://runtime-test.supabase.co",
    supabaseServiceRoleKey: "service-role",
    ownerCostGate: gate,
    financialEnvironment: "test",
    runtimeEnvironment: "development",
  });
}

function mockAuthAndOpenAi(
  openAi: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.openai.com/v1/audio/transcriptions") return openAi(input, init);
    throw new Error(`Unexpected external call: ${url}`);
  };
  return () => { globalThis.fetch = originalFetch; };
}

test("unpriced or usage-free evidence cannot independently become a financial amount", () => {
  const missingUsage = calculateOpenAiOwnerCostValuation("gpt-4o-mini-transcribe", { text: "no usage" });
  assert.equal(missingUsage.basis, "estimated");
  assert.equal(missingUsage.amountMicros, 0);
  assert.equal(missingUsage.recognitionMode, "evidence_only");

  const missingRate = calculateOpenAiOwnerCostValuation("future-unpriced-model", {
    usage: { output_tokens: 10 },
  });
  assert.equal(missingRate.basis, "estimated");
  assert.equal(missingRate.amountMicros, 0);
  assert.equal(missingRate.recognitionMode, "evidence_only");
});

test("OpenAI ASR establishes owner cost before submission and journals calculated usage", async () => {
  const { gate, calls } = createRecordingGate();
  let providerCalls = 0;
  const restore = mockAuthAndOpenAi(async (_input, init) => {
    providerCalls += 1;
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer forge-openai-key");
    return new Response(JSON.stringify({
      text: "forge-funded transcript",
      usage: {
        input_token_details: { audio_tokens: 100, text_tokens: 0 },
        output_tokens: 10,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_owner_cost_1" },
    });
  });
  try {
    const response = await createHandler(gate)(buildRequest());
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.text, "forge-funded transcript");
    assert.equal(payload.billing_mode, undefined);
    assert.equal(payload.actual_cost_usd, undefined);
    assert.equal(payload.billable_tokens, undefined);
    assert.equal(providerCalls, 1);

    const names = calls.map((call) => call.name);
    assert.deepEqual(names, [
      "establish_owner_cost_operation",
      "authorize_owner_cost_provider_attempt",
      "append_owner_cost_attempt_event",
      "append_owner_cost_attempt_event",
      "record_owner_cost_valuation",
      "append_owner_cost_attempt_event",
    ]);
    const states = calls
      .filter((call) => call.name === "append_owner_cost_attempt_event")
      .map((call) => call.args.p_lifecycle_state);
    assert.deepEqual(states, ["submitted", "response_captured", "succeeded"]);
    const operation = calls[0]!.args;
    assert.equal(operation.p_originating_tool, "anvil");
    assert.equal(operation.p_financial_environment, "test");
    assert.equal(operation.p_workspace_id, "10000000-0000-4000-8000-000000000001");
    assert.equal(operation.p_recording_session_id, "10000000-0000-4000-8000-000000000003");
    const valuation = calls.find((call) => call.name === "record_owner_cost_valuation")!.args;
    assert.equal(valuation.p_valuation_basis, "usage_calculated");
    assert.equal(valuation.p_recognition_mode, "journal_recognized");
    assert.equal(valuation.p_amount_micros, 175);
    assert.equal((valuation.p_private_valuation_evidence as Record<string, unknown>).calculated_not_provider_actual, true);
  } finally {
    restore();
  }
});

test("deterministic replay never creates a second provider submission", async () => {
  const { gate, calls } = createRecordingGate();
  let providerCalls = 0;
  const restore = mockAuthAndOpenAi(async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ text: "once", usage: { output_tokens: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  try {
    const handler = createHandler(gate);
    assert.equal((await handler(buildRequest())).status, 200);
    const replay = await handler(buildRequest());
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).code, "owner_cost_submission_replay");
    assert.equal(providerCalls, 1);
    const operationIds = calls
      .filter((call) => call.name === "establish_owner_cost_operation")
      .map((call) => call.args.p_operation_id);
    assert.equal(operationIds.length, 2);
    assert.equal(operationIds[0], operationIds[1]);
  } finally {
    restore();
  }
});

test("reuse of a stable operation with a conflicting request fingerprint fails closed", async () => {
  const { gate } = createRecordingGate();
  let providerCalls = 0;
  const restore = mockAuthAndOpenAi(async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ text: "once", usage: { output_tokens: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  try {
    const handler = createHandler(gate);
    assert.equal((await handler(buildRequest())).status, 200);
    const conflictingRequest = buildRequest();
    const conflictingForm = await conflictingRequest.formData();
    conflictingForm.set("language", "fr");
    const conflict = await handler(new Request(conflictingRequest.url, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: conflictingForm,
    }));
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, "owner_cost_identity_conflict");
    assert.equal(providerCalls, 1);
  } finally {
    restore();
  }
});

test("provider rejection is definitive, recorded after submitted, and not language-retried", async () => {
  const { gate, calls } = createRecordingGate();
  let providerCalls = 0;
  const restore = mockAuthAndOpenAi(async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ error: { message: "language is invalid" } }), {
      status: 400,
      headers: { "content-type": "application/json", "x-request-id": "req_rejected" },
    });
  });
  try {
    const response = await createHandler(gate)(buildRequest());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "invalid_language_hint");
    assert.equal(providerCalls, 1);
    const states = calls
      .filter((call) => call.name === "append_owner_cost_attempt_event")
      .map((call) => call.args.p_lifecycle_state);
    assert.deepEqual(states, ["submitted", "definitively_rejected"]);
    assert.equal(calls.some((call) => call.name === "record_owner_cost_valuation"), false);
  } finally {
    restore();
  }
});

test("transport ambiguity records submission_unknown and is never auto-retried", async () => {
  const { gate, calls } = createRecordingGate();
  let providerCalls = 0;
  const restore = mockAuthAndOpenAi(async () => {
    providerCalls += 1;
    throw new TypeError("network connection reset");
  });
  try {
    const response = await createHandler(gate)(buildRequest());
    assert.equal(response.status, 202);
    assert.equal((await response.json()).code, "submission_unknown");
    assert.equal(providerCalls, 1);
    const states = calls
      .filter((call) => call.name === "append_owner_cost_attempt_event")
      .map((call) => call.args.p_lifecycle_state);
    assert.deepEqual(states, ["submitted", "submission_unknown"]);
  } finally {
    restore();
  }
});

test("recognized expense survives a user-visible post-provider failure", async () => {
  const { gate, calls } = createRecordingGate({ failTerminal: true });
  const restore = mockAuthAndOpenAi(async () => new Response(JSON.stringify({
    text: "provider succeeded",
    usage: { input_token_details: { audio_tokens: 100 }, output_tokens: 10 },
  }), {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": "req_terminal_failure" },
  }));
  try {
    const response = await createHandler(gate)(buildRequest());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, "owner_cost_terminalization_failed");
    const valuation = calls.find((call) => call.name === "record_owner_cost_valuation")!.args;
    assert.equal(valuation.p_recognition_mode, "journal_recognized");
    assert.equal(valuation.p_amount_micros, 175);
    const responseCapturedIndex = calls.findIndex((call) => call.args.p_lifecycle_state === "response_captured");
    const valuationIndex = calls.findIndex((call) => call.name === "record_owner_cost_valuation");
    assert(responseCapturedIndex >= 0 && valuationIndex > responseCapturedIndex);
  } finally {
    restore();
  }
});
