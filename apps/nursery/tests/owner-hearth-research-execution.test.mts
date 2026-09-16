import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED,
  CUSTOMER_RESEARCH_CREDITS,
  CUSTOMER_RESEARCH_EVIDENCE_LIMITATION_HEADER,
  CUSTOMER_RESEARCH_MODEL,
  CUSTOMER_RESEARCH_SOURCE_CAPTURE_TRUNCATED,
  OWNER_RESEARCH_MAX_CAPTURE_BYTES,
  OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES,
  OWNER_RESEARCH_MODEL_TERMS,
  OwnerResearchSubmissionUnknownError,
  buildCustomerResearchPlan,
  buildOwnerResearchPlan,
  createCustomerHearthResearchFetch,
  createOwnerHearthResearchFetch,
  fingerprintCustomerResearchPlan,
  fingerprintOwnerResearchPlan,
  freezeOwnerHearthResearchSynthesis,
  ownerHearthResearchExecutionGate,
  ownerResearchCostCeiling,
} from "../server/hearth/owner-hearth-research-execution";
import { readCustomerSpendingQuote } from "../../../packages/tongs/src/customer-spending-confirmation";
import { fingerprintOpenAiTextPaidRequest } from "../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import { createHearthResearchRuntime } from "../server/hearth/hearth-research-runtime";
import { hasSufficientCustomerResearchEvidence } from "../server/hearth/create-hearth-ai-handler";

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

const customerPlan = buildCustomerResearchPlan({
  workspaceId: "00000000-0000-4000-8000-000000000010",
  workpieceId: "00000000-0000-4000-8000-000000000020",
  userAuthoredText: "Why are we seeing record layoffs right now",
  query: "record layoffs right now",
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

test("the standard customer plan fixes Luna, 21 credits, and the proven bounded research limits", async () => {
  assert.equal(CUSTOMER_RESEARCH_CREDITS, 21);
  assert.equal(customerPlan.requested_model, CUSTOMER_RESEARCH_MODEL);
  assert.equal(customerPlan.limit_profile, "standard_customer");
  assert.equal(customerPlan.maximum_search_requests, 6);
  assert.equal(customerPlan.maximum_sources, 6);
  assert.equal(customerPlan.maximum_http_attempts, 24);
  assert.equal(customerPlan.maximum_input_tokens, 128_000);
  assert.equal(customerPlan.maximum_output_tokens, 16_384);
  assert.equal("sources" in customerPlan, false);
  assert.equal(fingerprintCustomerResearchPlan(customerPlan), await fingerprintOpenAiTextPaidRequest(customerPlan));
});

test("the standard customer billing identity is stable across per-click chat actions", () => {
  const replay = buildCustomerResearchPlan({
    workspaceId: customerPlan.workspace_id,
    workpieceId: customerPlan.workpiece_id,
    userAuthoredText: `  ${customerPlan.user_authored_text}  `,
    query: `  ${customerPlan.query}  `,
  });
  assert.equal(replay.brief_fingerprint, customerPlan.brief_fingerprint);
  assert.equal(fingerprintCustomerResearchPlan(replay), fingerprintCustomerResearchPlan(customerPlan));
});

test("standard customer retrieval uses the customer stage ledger", async () => {
  const mocked = mockGate(({ name }) => name === "begin_customer_hearth_research_stage"
    ? { replay: false, authorized: true }
    : { replay: false });
  const boundedFetch = createCustomerHearthResearchFetch({
    gate: mocked.gate,
    handle,
    deadlineAt: Date.now() + 60_000,
    plan: customerPlan,
    fetchImpl: async () => new Response("current evidence", { status: 200 }),
  });
  assert.equal(await (await boundedFetch("https://api.search.brave.com/res/v1/web/search?q=layoffs")).text(), "current evidence");
  assert.equal(mocked.calls[0]?.name, "begin_customer_hearth_research_stage");
  assert.equal(mocked.calls.at(-1)?.name, "complete_customer_hearth_research_stage");
  assert.equal(mocked.calls[0]?.args.p_maximum_supplier_cost_micros, 5_000);
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

test("oversized retrieval evidence fails only that source and replays the same bound without another supplier call", async () => {
  const oversizedBody = new Uint8Array(OWNER_RESEARCH_MAX_CAPTURE_BYTES + 1).fill(65);
  let supplierCalls = 0;
  let capture: Record<string, unknown> | null = null;
  let replay = false;
  const mocked = mockGate(({ name, args }) => {
    if (name === "begin_customer_hearth_research_stage") {
      return replay ? { replay: true, capture } : { replay: false, authorized: true };
    }
    if (name === "complete_customer_hearth_research_stage") {
      capture = args.p_capture_json as Record<string, unknown>;
    }
    return { replay: false };
  });
  const boundedFetch = createCustomerHearthResearchFetch({
    gate: mocked.gate,
    handle,
    deadlineAt: Date.now() + 60_000,
    plan: customerPlan,
    fetchImpl: async () => {
      supplierCalls += 1;
      return new Response(oversizedBody, { status: 200, headers: { "content-type": "text/html" } });
    },
  });
  assert.equal((await (await boundedFetch("https://example.test/oversized-source")).arrayBuffer()).byteLength, oversizedBody.byteLength);
  assert.equal(supplierCalls, 1);
  assert.equal(capture?.body_truncated, true);
  assert.equal(capture?.capture_outcome, CUSTOMER_RESEARCH_SOURCE_CAPTURE_TRUNCATED);
  assert.equal(capture?.response_bytes, OWNER_RESEARCH_MAX_CAPTURE_BYTES);
  assert.equal(mocked.calls.at(-1)?.name, "complete_customer_hearth_research_stage");

  replay = true;
  const replayFetch = createCustomerHearthResearchFetch({
    gate: mocked.gate,
    handle,
    deadlineAt: Date.now() + 60_000,
    plan: customerPlan,
    fetchImpl: async () => {
      supplierCalls += 1;
      return new Response("wrong");
    },
  });
  assert.equal((await (await replayFetch("https://example.test/oversized-source")).arrayBuffer()).byteLength, OWNER_RESEARCH_MAX_CAPTURE_BYTES + 1);
  assert.equal(supplierCalls, 1);
});

test("standard customer aggregate exhaustion skips only the over-budget source and replays without suppliers", async () => {
  const retainedBody = new Uint8Array(240 * 1024).fill(65);
  const overRemainingBody = new Uint8Array(70 * 1024).fill(66);
  const captures = new Map<string, Record<string, unknown>>();
  let replay = false;
  let supplierCalls = 0;
  const mocked = mockGate(({ name, args }) => {
    const stageKey = String(args.p_stage_key ?? "");
    if (name === "begin_customer_hearth_research_stage") {
      return replay
        ? { replay: true, event_type: "captured", capture: captures.get(stageKey) ?? null }
        : { replay: false, authorized: true };
    }
    if (name === "complete_customer_hearth_research_stage") {
      captures.set(stageKey, args.p_capture_json as Record<string, unknown>);
    }
    return { replay: false };
  });
  const fetchImpl = async () => {
    supplierCalls += 1;
    return new Response(supplierCalls <= 4 ? retainedBody : overRemainingBody, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };
  const urls = Array.from({ length: 5 }, (_, index) => `https://example.test/source-${index + 1}`);
  const boundedFetch = createCustomerHearthResearchFetch({
    gate: mocked.gate,
    handle,
    deadlineAt: Date.now() + 60_000,
    plan: customerPlan,
    fetchImpl,
  });
  for (const url of urls.slice(0, 4)) {
    assert.equal((await (await boundedFetch(url)).arrayBuffer()).byteLength, retainedBody.byteLength);
  }
  const limited = await boundedFetch(urls[4]);
  assert.equal(limited.headers.get(CUSTOMER_RESEARCH_EVIDENCE_LIMITATION_HEADER), CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED);
  assert.equal(supplierCalls, 5);
  const retainedBytes = Array.from(captures.values()).reduce((total, capture) => total + Number(capture.response_bytes ?? 0), 0);
  assert.equal(retainedBytes, 4 * retainedBody.byteLength);
  assert.ok(retainedBytes <= OWNER_RESEARCH_MAX_CAPTURE_TOTAL_BYTES);
  const limitedCapture = Array.from(captures.values()).find((capture) => (
    capture.capture_outcome === CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED
  ));
  assert.equal(limitedCapture?.retained_bytes, 0);
  assert.equal(limitedCapture?.aggregate_retained_bytes, retainedBytes);

  replay = true;
  const replayFetch = createCustomerHearthResearchFetch({
    gate: mocked.gate,
    handle,
    deadlineAt: Date.now() + 60_000,
    plan: customerPlan,
    fetchImpl,
  });
  for (const url of urls.slice(0, 4)) await (await replayFetch(url)).arrayBuffer();
  const replayLimited = await replayFetch(urls[4]);
  assert.equal(replayLimited.headers.get(CUSTOMER_RESEARCH_EVIDENCE_LIMITATION_HEADER), CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED);
  assert.equal(supplierCalls, 5);
});

test("owner research preserves fail-closed aggregate capture semantics", async () => {
  const retainedBody = new Uint8Array(240 * 1024).fill(65);
  const overRemainingBody = new Uint8Array(70 * 1024).fill(66);
  let supplierCalls = 0;
  const mocked = mockGate(({ name }) => name === "begin_owner_hearth_research_stage"
    ? { replay: false, authorized: true }
    : { replay: false });
  const boundedFetch = createOwnerHearthResearchFetch({
    gate: mocked.gate,
    handle,
    deadlineAt: Date.now() + 60_000,
    plan: sessionPlan,
    fetchImpl: async () => {
      supplierCalls += 1;
      return new Response(supplierCalls <= 4 ? retainedBody : overRemainingBody, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });
  for (let index = 0; index < 4; index += 1) {
    await (await boundedFetch(`https://example.test/owner-${index + 1}`)).arrayBuffer();
  }
  await assert.rejects(() => boundedFetch("https://example.test/owner-5"), /owner_research_capture_size_exceeded/);
  assert.equal(supplierCalls, 5);
  const failure = mocked.calls.find((call) => call.name === "fail_owner_hearth_research_stage");
  assert.equal(failure?.args.p_failure_code, CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED);
});

test("aggregate evidence limitation remains an explicit skipped source while usable evidence survives", async () => {
  const runtime = createHearthResearchRuntime({ braveApiKey: "fake-brave-key" });
  const brief = {
    schema: "forge.hearth.research-brief.v1" as const,
    workspaceId: "00000000-0000-4000-8000-000000000010",
    workpieceId: "00000000-0000-4000-8000-000000000020",
    briefFingerprint: "d".repeat(64),
    creatorRequest: "Verify current energy prices",
    episodeTitle: "Energy prices",
    goals: ["Verify current energy prices"],
    queries: ["current energy prices"],
    sourcePriorities: ["Primary records"],
  };
  const result = await runtime.run({
    request: {
      query: "current energy prices",
      intent: "news",
      recencyPreference: "strict_recent",
      maxSources: 2,
      requireDates: true,
      requireFullExtraction: true,
    },
    brief,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.search.brave.com/")) {
        return new Response(JSON.stringify({ web: { results: [
          { title: "Official energy update", url: "https://energy.example.test/update", description: "Current official data" },
          { title: "Large supporting report", url: "https://report.example.test/large", description: "Additional context" },
        ] } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("energy.example.test")) {
        return new Response("<html><title>Official energy update</title><article>Current energy prices rose after a documented supply disruption.</article></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response(null, {
        status: 200,
        headers: {
          "content-type": "text/plain",
          [CUSTOMER_RESEARCH_EVIDENCE_LIMITATION_HEADER]: CUSTOMER_RESEARCH_AGGREGATE_CAPTURE_BUDGET_EXHAUSTED,
        },
      });
    },
  });
  assert.equal(result.runtimeStatus, "partial");
  assert.equal(result.sources.filter((source) => source.extractionStatus === "extracted").length, 1);
  const skipped = result.sources.find((source) => source.extractionStatus === "skipped");
  assert.match(skipped?.extractionError ?? "", /aggregate evidence budget exhausted/i);
  assert.ok(skipped?.warnings?.some((warning) => /aggregate evidence budget/i.test(warning)));
  assert.ok(result.synthesis.uncertainties.some((warning) => /bounded aggregate evidence budget/i.test(warning)));
  assert.equal(hasSufficientCustomerResearchEvidence(result), true);
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
