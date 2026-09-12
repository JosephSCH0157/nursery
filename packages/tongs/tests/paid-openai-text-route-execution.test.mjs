import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateOpenAiTextDirectCostMicros,
  executePaidOpenAiTextRoute,
  fingerprintOpenAiTextPaidRequest,
} from "../dist/providers/paid-openai-text-route-execution.js";
import { OpenAiTextProviderError } from "../dist/providers/paid-openai-text-execution-coordinator.js";

const ROUTES = [
  ["hearth.research_synthesis", { assistant_text: "Synthesis", research_result: { sources: [{ id: "s1" }] } }, (v) => typeof v.assistant_text === "string" && Array.isArray(v.research_result?.sources)],
  ["visual.unified_plan", { images: [{}], broll: [], reference_clips: [], reference_visuals: [] }, (v) => Array.isArray(v.images) && Array.isArray(v.broll) && Array.isArray(v.reference_clips) && Array.isArray(v.reference_visuals)],
  ["visual.narrative_interpretation", { narrative_purpose: "explain", primary_subjects: ["host"], source_context: { focus: "claim" } }, (v) => typeof v.narrative_purpose === "string" && Array.isArray(v.primary_subjects) && typeof v.source_context?.focus === "string"],
  ["motion.broll_interpretation", { action_over_time: "camera tracks the runner", start_frame: "wide", end_frame: "close" }, (v) => /track|move|pan|camera/.test(v.action_over_time ?? "") && Boolean(v.start_frame) && Boolean(v.end_frame)],
  ["hammer.transcript_cleanup", { resultSegments: [{ segment_id: "a", text: "clean" }], suggestions: [{ segmentId: "a" }] }, (v) => Array.isArray(v.resultSegments) && Array.isArray(v.suggestions) && v.suggestions.length > 0],
  ["shorts.discovery", { data: { discovery_id: "d" }, resolution: { outcome: "candidates", rejected: [] } }, (v) => Boolean(v.data?.discovery_id) && typeof v.resolution?.outcome === "string"],
  ["quench.metadata", { title: "Episode", description: "Description", tags: ["podcast"] }, (v) => Boolean(v.title) && Boolean(v.description) && Array.isArray(v.tags)],
];

test("cached input is priced separately without double-counting standard input", () => {
  const cost = estimateOpenAiTextDirectCostMicros({
    inputMicrosPerMillionTokens: 1_000_000,
    cachedInputMicrosPerMillionTokens: 100_000,
    outputMicrosPerMillionTokens: 2_000_000,
  }, 1_000, 100, 400);
  assert.equal(cost, 840);
});

function makeGate({ state = "reserved", authorize = true, stored = null } = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "resolve_openai_text_paid_execution_context") {
        return { data: {
          operation_id: "operation-123", reservation_id: "11111111-1111-4111-8111-111111111111",
          quote_id: "22222222-2222-4222-8222-222222222222", route_code: args.p_route_code,
          funding_source_type: "customer_deposit", funding_source_id: "33333333-3333-4333-8333-333333333333",
          credential_funding: "forge", model: "gpt-test", maximum_input_units: 10000,
          maximum_output_units: 1000, maximum_attempts: 1, maximum_failure_exposure_micros: 5000,
          direct_provider_ceiling_micros: 4000, supporting_cost_ceiling_micros: 1000,
          input_micros_per_million_tokens: 1000, output_micros_per_million_tokens: 2000,
          reservation_state: state,
        }, error: null };
      }
      if (name === "acquire_openai_text_aggregate_admission") {
        return { data: { enforcement_enabled: true, authorized: true, hold_id: "isolated-hold", reason: "authorized" }, error: null };
      }
      if (name === "authorize_openai_text_provider_attempt_with_aggregate") {
        const allowed = typeof authorize === "function" ? authorize() : authorize;
        return { data: { provider_execution_authorized: allowed }, error: null };
      }
      if (name === "read_openai_text_paid_result") return { data: stored, error: null };
      if (name === "settle_operation") return { data: { customer_charge_micros: 1330 }, error: null };
      return { data: {}, error: null };
    },
  };
}

test("missing aggregate assignment rejects before provider execution", async () => {
  const gate = makeGate();
  const original = gate.rpc.bind(gate);
  gate.rpc = (name, args) => name === "acquire_openai_text_aggregate_admission"
    ? Promise.resolve({ data: { enforcement_enabled: false, authorized: true }, error: null })
    : original(name, args);
  const args = await argsFor("quench.metadata", { title: "test" }, () => true, gate);
  let submissions = 0;
  args.executeProvider = async () => { submissions++; throw new Error("must not execute"); };
  await assert.rejects(executePaidOpenAiTextRoute(args), /funding_context_required/);
  assert.equal(submissions, 0);
});

test("halted recovery settles captured canonical result but revoked member cannot receive it", async () => {
  const gate = makeGate();
  const original = gate.rpc.bind(gate);
  gate.rpc = async (name, args) => {
    if (name === "resolve_openai_text_paid_execution_context") return { data: null, error: { message: "halt_new" } };
    if (name === "resolve_openai_text_recovery_context") return original("resolve_openai_text_paid_execution_context", args);
    if (name === "assert_openai_result_delivery_access") return { data: null, error: { message: "current workspace access required" } };
    return original(name, args);
  };
  const args = await argsFor("quench.metadata", { title: "retained" }, () => true, gate);
  args.recoverCanonical = async () => ({ result: { title: "retained" }, providerRequestId: "original-request", inputUnits: 10, outputUnits: 5 });
  let submissions = 0;
  args.executeProvider = async () => { submissions++; throw new Error("must not execute"); };
  await assert.rejects(executePaidOpenAiTextRoute(args), /current workspace access required/);
  assert.equal(submissions, 0);
  assert.equal(gate.calls.filter(c => c.name === "settle_operation").length, 1);
});

async function argsFor(route, value, validator, gate) {
  const requestFingerprintPayload = { schema: `fixture.${route}.v1`, input: "bounded" };
  const requestFingerprint = await fingerprintOpenAiTextPaidRequest(requestFingerprintPayload);
  return {
    gate, routeCode: route,
    handle: { operationId: "operation-123", reservationId: "11111111-1111-4111-8111-111111111111", requestFingerprint },
    userId: "44444444-4444-4444-8444-444444444444", workspaceId: "55555555-5555-4555-8555-555555555555",
    workpieceId: "workpiece-1", credentialSource: "forge_managed",
    inputUnitUpperBound: 100, requestFingerprintPayload,
    executeProvider: async () => ({ value, requestId: `req-${route}`, inputUnits: 10, outputUnits: 5,
      supplierCostMicros: 20, supplierCostAuthoritative: false, supportingCostMicros: 5,
      supportingCostAuthoritative: false, costCoverageComplete: true }),
    validateResult: (candidate) => { if (!validator(candidate)) throw new Error(`malformed ${route}`); },
    persistCanonical: async (candidate) => ({ route, persisted: true, value: candidate }),
  };
}

for (const [route, good, validator] of ROUTES) {
  test(`${route} settles only after route validation and canonical persistence`, async () => {
    const gate = makeGate();
    const result = await executePaidOpenAiTextRoute(await argsFor(route, good, validator, gate));
    assert.equal(result.state, "settled");
    assert.equal(result.customerChargeMicros, 1330);
    assert.equal(result.result.route, route);
    const names = gate.calls.map((call) => call.name);
    assert.ok(names.indexOf("record_openai_text_provider_capture") < names.indexOf("persist_openai_text_paid_result"));
    assert.ok(names.indexOf("persist_openai_text_paid_result") < names.indexOf("settle_operation"));
  });

  test(`${route} malformed result records supplier cost and charges customer zero`, async () => {
    const gate = makeGate();
    const result = await executePaidOpenAiTextRoute(await argsFor(route, {}, validator, gate));
    assert.equal(result.state, "failed_released");
    assert.equal(result.customerChargeMicros, 0);
    assert.equal(gate.calls.find((call) => call.name === "record_provider_failure").args.p_failure_class, "forge_validation_failure");
    assert.equal(gate.calls.filter((call) => call.name === "record_openai_text_supplier_attempt_expense").length, 1);
  });
}

test("persistence failure preserves provider evidence and provides customer relief", async () => {
  const gate = makeGate();
  const [route, good, validator] = ROUTES[0];
  const args = await argsFor(route, good, validator, gate);
  args.persistCanonical = async () => { throw new Error("canonical write failed"); };
  const result = await executePaidOpenAiTextRoute(args);
  assert.equal(result.state, "failed_released");
  assert.equal(result.customerChargeMicros, 0);
  assert.equal(gate.calls.find((call) => call.name === "record_provider_failure").args.p_failure_class, "persistence_failure");
});

test("ambiguous submission is retained without automatic resubmission", async () => {
  const gate = makeGate();
  const [route, good, validator] = ROUTES[1];
  const args = await argsFor(route, good, validator, gate);
  let submissions = 0;
  args.executeProvider = async () => { submissions += 1; throw new OpenAiTextProviderError("timeout", true, null); };
  const result = await executePaidOpenAiTextRoute(args);
  assert.equal(result.state, "submission_unknown");
  assert.equal(submissions, 1);
  assert.equal(gate.calls.filter((call) => call.name === "authorize_openai_text_provider_attempt_with_aggregate").length, 1);
});

test("settled replay returns canonical result without provider execution or debit", async () => {
  const storedResult = { route: "quench.metadata", persisted: true };
  const gate = makeGate({ state: "settled", stored: { result_json: storedResult, provider_request_id: "req-old", customer_charge_micros: 1330 } });
  const [route, good, validator] = ROUTES.at(-1);
  const args = await argsFor(route, good, validator, gate);
  let submissions = 0;
  args.executeProvider = async () => { submissions += 1; throw new Error("must not run"); };
  const result = await executePaidOpenAiTextRoute(args);
  assert.equal(result.state, "settled_replay");
  assert.equal(submissions, 0);
  assert.equal(gate.calls.some((call) => call.name === "settle_operation"), false);
});

test("concurrent authorization permits one provider boundary only", async () => {
  let grants = 0;
  const gate = makeGate({ authorize: () => ++grants === 1 });
  const [route, good, validator] = ROUTES[2];
  let submissions = 0;
  const first = await argsFor(route, good, validator, gate);
  const second = await argsFor(route, good, validator, gate);
  first.executeProvider = second.executeProvider = async () => { submissions += 1; return { value: good, requestId: "req-one", inputUnits: 1, outputUnits: 1, supplierCostMicros: 1, supplierCostAuthoritative: false }; };
  const outcomes = await Promise.allSettled([executePaidOpenAiTextRoute(first), executePaidOpenAiTextRoute(second)]);
  assert.equal(submissions, 1);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
});

test("BYO binding cannot use a Forge credential", async () => {
  const gate = makeGate();
  const original = gate.rpc.bind(gate);
  gate.rpc = async (name, args) => {
    const result = await original(name, args);
    if (name === "resolve_openai_text_paid_execution_context") result.data.credential_funding = "byo_customer";
    return result;
  };
  const [route, good, validator] = ROUTES[3];
  const args = await argsFor(route, good, validator, gate);
  let submissions = 0;
  args.executeProvider = async () => { submissions += 1; return {}; };
  await assert.rejects(() => executePaidOpenAiTextRoute(args), /byo_credential_required/);
  assert.equal(submissions, 0);
});

test("domain commit followed by billing-write loss recovers without another provider call", async () => {
  const gate = makeGate();
  const original = gate.rpc.bind(gate);
  let failBillingWrite = true;
  let reservationState = "reserved";
  gate.rpc = async (name, rpcArgs) => {
    if (name === "persist_openai_text_paid_result" && failBillingWrite) {
      failBillingWrite = false;
      return { data: null, error: { message: "simulated response loss" } };
    }
    const result = await original(name, rpcArgs);
    if (name === "resolve_openai_text_paid_execution_context") result.data.reservation_state = reservationState;
    if (name === "authorize_openai_text_provider_attempt_with_aggregate") reservationState = "attempt_started";
    return result;
  };
  const [route, good, validator] = ROUTES[0];
  const routeArgs = await argsFor(route, good, validator, gate);
  let providerCalls = 0;
  let domainWrites = 0;
  let committed = null;
  routeArgs.executeProvider = async () => {
    providerCalls += 1;
    return { value: good, requestId: "req-recovery", inputUnits: 10, outputUnits: 5,
      supplierCostMicros: 20, supplierCostAuthoritative: false };
  };
  routeArgs.persistCanonical = async (candidate) => {
    domainWrites += 1;
    committed = { route, persisted: true, value: candidate };
    return committed;
  };
  routeArgs.recoverCanonical = async () => committed
    ? { result: committed, providerRequestId: "req-recovery", inputUnits: 10, outputUnits: 5 }
    : null;

  await assert.rejects(
    () => executePaidOpenAiTextRoute(routeArgs),
    /canonical domain result persisted but billing continuation failed/,
  );
  assert.equal(gate.calls.some((call) => call.name === "record_provider_failure"), false);
  assert.equal(gate.calls.some((call) => call.name === "settle_operation"), false);

  const recovered = await executePaidOpenAiTextRoute(routeArgs);
  assert.equal(recovered.state, "settled");
  assert.equal(recovered.result, committed);
  assert.equal(providerCalls, 1);
  assert.equal(domainWrites, 1);
  assert.equal(gate.calls.filter((call) => call.name === "settle_operation").length, 1);
});
