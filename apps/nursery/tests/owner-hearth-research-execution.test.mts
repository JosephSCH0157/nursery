import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES,
  OWNER_RESEARCH_MODEL_TERMS,
  OwnerResearchSubmissionUnknownError,
  buildOwnerResearchPlan,
  createOwnerHearthResearchFetch,
  fingerprintOwnerResearchPlan,
  freezeOwnerHearthResearchSynthesis,
  ownerHearthResearchExecutionGate,
  ownerResearchCostCeiling,
} from "../server/hearth/owner-hearth-research-execution";
import { readCustomerSpendingQuote } from "../../../packages/tongs/src/customer-spending-confirmation";
import { fingerprintOpenAiTextPaidRequest } from "../../../packages/tongs/src/providers/paid-openai-text-route-execution";

type RpcCall = { name: string; args: Record<string, unknown> };

function mockGate(handler: (call: RpcCall) => unknown) {
  const calls: RpcCall[] = [];
  return {
    calls,
    gate: {
      async rpc(name: string, args: Record<string, unknown>) {
        const call = { name, args };
        calls.push(call);
        return { data: handler(call), error: null };
      },
    },
  };
}

const handle = {
  operationId: "owner-research:operation-0001",
  reservationId: "00000000-0000-4000-8000-000000000001",
  requestFingerprint: "a".repeat(64),
};

const sessionPlan = buildOwnerResearchPlan({
  workspaceId: "00000000-0000-4000-8000-000000000010",
  workpieceId: "00000000-0000-4000-8000-000000000020",
  userAuthoredText: "Find primary evidence",
  query: "primary evidence",
  briefFingerprint: "b".repeat(64),
});

const canaryPlan = buildOwnerResearchPlan({
  workspaceId: "00000000-0000-4000-8000-000000000010",
  workpieceId: "00000000-0000-4000-8000-000000000020",
  userAuthoredText: "Run the bounded canary",
  query: "bounded canary evidence",
  briefFingerprint: "c".repeat(64),
  requestedModel: "gpt-5.6-luna",
  limitProfile: "canary",
});

test("research ceilings preserve the exact component arithmetic", () => {
  assert.equal(OWNER_RESEARCH_MODEL_TERMS["gpt-6-astra"].directCeilingMicros, 2_099_200);
  assert.deepEqual(ownerResearchCostCeiling("gpt-6-astra"), {
    directProviderCeilingMicros: 2_099_200,
    fullCostCeilingMicros: 2_130_656,
    aggregateAdmissionMicros: 2_130_659,
  });
  assert.deepEqual(ownerResearchCostCeiling("gpt-6-astra", "canary"), {
    directProviderCeilingMicros: 130_000,
    fullCostCeilingMicros: 136_456,
    aggregateAdmissionMicros: 136_459,
  });
  assert.equal(10 * 2_130_656 + 136_456 + 83_772, 21_526_788);
  assert.equal(10_840_000 + 21_526_788 + 11 * 3, 32_366_821);
  assert.equal(144_072 + 9 * 2_138_272 + 2_138_268, 21_526_788);
});

test("the shared confirmation parser exposes only customer-safe credit terms", () => {
  const valid = readCustomerSpendingQuote({ billing_quote: {
    quote_id: "00000000-0000-4000-8000-000000000001",
    operation_id: "owner-research:operation-0001",
    quote_hash: "d".repeat(64), request_fingerprint: "e".repeat(64),
    credit_charge: 0, funding_eligible: true, funding_label: "Owner research budget",
    expires_at: "2026-10-10T12:10:00Z",
    cost_components: { openai_synthesis_micros: 130_000, brave_search_micros: 5_000, platform_support_micros: 1_456, continuing_storage_micros: 7_616 },
    limits: { profile: "canary", search_requests: 1, http_attempts: 24, retained_sources: 2, input_tokens: 8_000, output_tokens: 1_000 },
  } });
  assert.equal(valid?.credit_charge, 0);
  assert.equal(valid?.funding_label, "Owner research budget");
  assert.equal("maximum_owner_commitment_micros" in (valid ?? {}), false);
  assert.equal("cost_components" in (valid ?? {}), false);
  assert.equal("limits" in (valid ?? {}), false);
});

test("the accepted plan fingerprint excludes source content that does not exist yet", async () => {
  const plan = sessionPlan;
  assert.equal(fingerprintOwnerResearchPlan(plan), fingerprintOwnerResearchPlan({ ...plan }));
  assert.equal(fingerprintOwnerResearchPlan(plan), await fingerprintOpenAiTextPaidRequest(plan));
  assert.equal("sources" in plan, false);
  assert.equal(plan.maximum_http_attempts, 24);
  assert.equal(plan.maximum_output_tokens, 16_384);
  assert.equal(canaryPlan.requested_model, "gpt-6-astra");
  assert.equal(canaryPlan.maximum_search_requests, 1);
  assert.equal(canaryPlan.maximum_sources, 2);
  assert.equal(canaryPlan.maximum_input_tokens, 8_000);
  assert.equal(canaryPlan.maximum_output_tokens, 1_000);
});

test("captured retrieval is persisted before delivery and replays without a supplier call", async () => {
  let supplierCalls = 0;
  const capture = {
    status: 200,
    headers: { "content-type": "text/plain" },
    body_base64: Buffer.from("evidence").toString("base64"),
    response_bytes: 8,
  };
  let replay = false;
  const mocked = mockGate(({ name }) => {
    if (name === "begin_owner_hearth_research_stage") return replay ? { replay: true, capture } : { replay: false, authorized: true };
    return { replay: false };
  });
  const boundedFetch = createOwnerHearthResearchFetch({
    gate: mocked.gate,
    handle,
    deadlineAt: Date.now() + 60_000,
    plan: sessionPlan,
    fetchImpl: async () => {
      supplierCalls += 1;
      return new Response("evidence", { status: 200, headers: { "content-type": "text/plain" } });
    },
  });
  assert.equal(await (await boundedFetch("https://example.test/source")).text(), "evidence");
  assert.equal(supplierCalls, 1);
  assert.equal(mocked.calls.at(-1)?.name, "complete_owner_hearth_research_stage");

  replay = true;
  const replayFetch = createOwnerHearthResearchFetch({ gate: mocked.gate, handle, deadlineAt: Date.now() + 60_000, plan: sessionPlan,
    fetchImpl: async () => { supplierCalls += 1; return new Response("wrong"); } });
  assert.equal(await (await replayFetch("https://example.test/source")).text(), "evidence");
  assert.equal(supplierCalls, 1);
});

test("an ambiguous supplier call is recorded and is never automatically retried", async () => {
  let supplierCalls = 0;
  const mocked = mockGate(({ name }) => name === "begin_owner_hearth_research_stage"
    ? { replay: false, authorized: true }
    : { replay: false });
  const boundedFetch = createOwnerHearthResearchFetch({ gate: mocked.gate, handle, deadlineAt: Date.now() + 60_000, plan: sessionPlan,
    fetchImpl: async () => { supplierCalls += 1; throw new TypeError("socket closed"); } });
  await assert.rejects(() => boundedFetch("https://api.search.brave.com/res/v1/web/search?q=x"), OwnerResearchSubmissionUnknownError);
  assert.equal(supplierCalls, 1);
  assert.equal(mocked.calls.at(-1)?.name, "mark_owner_hearth_research_stage_unknown");
});

test("the final synthesis body is frozen after extraction and the custom gate binds that freeze", async () => {
  const mocked = mockGate(({ name }) => name === "freeze_owner_hearth_research_synthesis_request"
    ? { authorized: true }
    : { ok: true });
  const frozen = await freezeOwnerHearthResearchSynthesis({
    gate: mocked.gate,
    handle,
    model: "gpt-6-astra",
    messages: [{ role: "system", content: "Use only supplied evidence." }, { role: "user", content: "Extracted source: exact evidence" }],
    maximumOutputTokens: 1_000,
    deadlineAt: Date.now() + 60_000,
    sourceRevisionFingerprint: "c".repeat(64),
    plan: canaryPlan,
  });
  const freezeCall = mocked.calls.find((call) => call.name === "freeze_owner_hearth_research_synthesis_request");
  assert.equal(freezeCall?.args.p_serialized_body, frozen.serializedBody);
  assert.equal(freezeCall?.args.p_serialized_body_sha256, frozen.serializedBodySha256);
  assert.match(frozen.serializedBody, /exact evidence/);

  const gate = ownerHearthResearchExecutionGate(mocked.gate);
  await gate.rpc("bind_bounded_provider_request", { p_reservation_id: handle.reservationId });
  assert.equal(mocked.calls.at(-1)?.name, "bind_owner_hearth_research_bounded_provider_request");
  assert.equal(OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES, 1024 * 1024);
});
