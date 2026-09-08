import test from "node:test";
import assert from "node:assert/strict";
import { PaidOpenAiTextExecutionCoordinator, OpenAiTextProviderError } from "../dist/providers/paid-openai-text-execution-coordinator.js";

function gate(overrides = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (overrides[name]) return overrides[name](args, calls);
      return { data: name === "authorize_openai_text_provider_attempt" ? { provider_execution_authorized: true } : {}, error: null };
    },
  };
}

function input(overrides = {}) {
  return {
    routeCode: "hearth.chat_completion",
    reservationId: "r",
    quoteId: "q",
    fundingSourceType: "customer_deposit",
    fundingSourceId: "d",
    reservationKey: "reserve-key",
    attemptKey: "operation-key",
    settlementId: "s",
    settlementKey: "settlement-key",
    credentialFunding: "forge",
    byoCredentialPresent: false,
    model: "gpt-test",
    maximumInputUnits: 100,
    maximumOutputUnits: 50,
    maximumAttempts: 1,
    maximumFailureExposureMicros: 250000,
    executeProvider: async () => ({
      value: { text: "usable" },
      requestId: "req_1",
      inputUnits: 12,
      outputUnits: 8,
      supplierCostMicros: 490925,
      supplierCostAuthoritative: false,
    }),
    validateResult: async (value) => assert.equal(value.text, "usable"),
    persistResult: async () => {},
    ...overrides,
  };
}

test("settles only after bounded authorization, validation, persistence, usage, and expense evidence", async () => {
  const g = gate();
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input());
  assert.equal(result.state, "settled");
  assert.equal(result.attempts, 1);
  assert.deepEqual(g.calls.map((call) => call.name), [
    "reserve_operation",
    "authorize_openai_text_provider_attempt",
    "record_openai_text_usage",
    "record_openai_text_supplier_attempt_expense",
    "close_openai_text_failure_exposure",
    "settle_operation",
  ]);
});

test("provider charge on failure is a Forge expense and customer charge is zero", async () => {
  const g = gate();
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async () => {
      throw new OpenAiTextProviderError("charged failure", false, 230000, { provider_reference: "req_fail" });
    },
  }));
  assert.deepEqual(result, { state: "failed_released", customerChargeMicros: 0, supplierCostMicros: 230000, attempts: 1 });
  const settlement = g.calls.at(-1);
  assert.equal(settlement.name, "settle_operation");
  assert.equal(settlement.args.p_outcome, "nonbillable_failure");
  assert.equal(settlement.args.p_actual_fulfillment_cost_micros, 230000);
});

test("a bounded retry obtains a fresh loss hold and settles exactly once", async () => {
  const g = gate();
  let providerCalls = 0;
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    maximumAttempts: 2,
    maximumInputUnits: 200,
    maximumOutputUnits: 100,
    executeProvider: async (attemptNumber) => {
      providerCalls += 1;
      if (attemptNumber === 1) throw new OpenAiTextProviderError("retryable", false, 1000, {}, true);
      return { value: { text: "usable" }, requestId: "req_2", inputUnits: 10, outputUnits: 5, supplierCostMicros: 2000, supplierCostAuthoritative: false };
    },
  }));
  assert.equal(result.state, "settled");
  assert.equal(result.attempts, 2);
  assert.equal(providerCalls, 2);
  assert.equal(g.calls.filter((call) => call.name === "authorize_openai_text_provider_attempt").length, 2);
  assert.equal(g.calls.filter((call) => call.name === "settle_operation").length, 1);
  assert.equal(g.calls.at(-1).args.p_actual_fulfillment_cost_micros, 3000);
});

test("ambiguous submission stays reserved and is never retried", async () => {
  const g = gate();
  let providerCalls = 0;
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    maximumAttempts: 3,
    executeProvider: async () => {
      providerCalls += 1;
      throw new OpenAiTextProviderError("timeout", true, null);
    },
  }));
  assert.equal(result.state, "submission_unknown");
  assert.equal(providerCalls, 1);
  assert.equal(g.calls.at(-1).name, "mark_submission_unknown");
  assert.equal(g.calls.filter((call) => call.name === "authorize_openai_text_provider_attempt").length, 1);
});

test("validation or persistence failure releases the customer and realizes Forge loss", async () => {
  const g = gate();
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({ persistResult: async () => { throw new Error("write failed"); } }));
  assert.equal(result.customerChargeMicros, 0);
  const lossClose = g.calls.find((call) => call.name === "close_openai_text_failure_exposure");
  assert.equal(lossClose.args.p_outcome, "failure_realized");
  assert.equal(g.calls.find((call) => call.name === "record_provider_failure").args.p_failure_class, "forge_failure");
});

test("aggregate usage limits cover all provider attempts", async () => {
  const g = gate();
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    maximumInputUnits: 10,
    executeProvider: async () => ({ value: {}, requestId: "req_big", inputUnits: 11, outputUnits: 1, supplierCostMicros: 50, supplierCostAuthoritative: false }),
    validateResult: async () => {},
  }));
  assert.equal(result.state, "failed_released");
  assert.equal(g.calls.find((call) => call.name === "record_openai_text_usage").args.p_result_validated, false);
});

test("a denied failure-loss hold cannot reach OpenAI", async () => {
  let providerCalls = 0;
  const g = gate({
    authorize_openai_text_provider_attempt: async () => ({ data: { provider_execution_authorized: false, reason: "aggregate_failure_limit" }, error: null }),
  });
  await assert.rejects(() => new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async () => { providerCalls += 1; return {}; },
  })), /funding_context_required/);
  assert.equal(providerCalls, 0);
});

test("BYO never falls back to Forge credentials", async () => {
  const g = gate();
  let providerCalls = 0;
  await assert.rejects(() => new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    credentialFunding: "byo_customer",
    byoCredentialPresent: false,
    executeProvider: async () => { providerCalls += 1; return {}; },
  })), /byo_credential_required/);
  assert.equal(providerCalls, 0);
  assert.equal(g.calls.length, 0);
});
