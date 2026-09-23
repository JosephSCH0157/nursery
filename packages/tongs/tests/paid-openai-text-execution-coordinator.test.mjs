import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOpenAiTextProviderExecutionAuthorization,
  PaidOpenAiTextExecutionCoordinator,
  OpenAiTextProviderError,
} from "../dist/providers/paid-openai-text-execution-coordinator.js";

function gate(overrides = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (overrides[name]) return overrides[name](args, calls);
      return {
        data: name === "acquire_openai_text_aggregate_admission"
          ? { enforcement_enabled: true, authorized: true, hold_id: "isolated-hold", reason: "authorized" }
          : name === "authorize_openai_text_provider_attempt_with_aggregate"
            ? { provider_execution_authorized: true, aggregate_enforcement_enabled: false }
            : {},
        error: null,
      };
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
    aggregateCallerClass: "interactive",
    aggregateProviderMode: "real",
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
    "acquire_openai_text_aggregate_admission",
    "authorize_openai_text_provider_attempt_with_aggregate",
    "record_openai_text_provider_capture",
    "record_openai_text_supplier_attempt_expense",
    "record_openai_text_usage",
    "close_openai_text_failure_exposure",
    "settle_operation",
    "record_paid_operation_aggregate_outcome",
  ]);
});

test("server adapter consumes a pre-created owner reservation without invoking the customer reserve RPC", async () => {
  const g = gate();
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    fundingSourceType: "owner_budget",
    fundingSourceId: "owner-budget",
    reservationAlreadyCreated: true,
  }));
  assert.equal(result.state, "settled");
  assert.equal(g.calls.some((call) => call.name === "reserve_operation"), false);
  assert.equal(g.calls.some((call) => call.name === "settle_owner_operation"), true);
});

test("owner funding cannot be routed through the customer reservation RPC", async () => {
  const g = gate();
  let providerCalls = 0;
  await assert.rejects(() => new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    fundingSourceType: "owner_budget",
    fundingSourceId: "owner-budget",
    executeProvider: async () => { providerCalls += 1; return {}; },
  })), /funding_context_required/);
  assert.equal(providerCalls, 0);
  assert.equal(g.calls.length, 0);
});

test("provider charge on failure is a Forge expense and customer charge is zero", async () => {
  const g = gate();
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async () => {
      throw new OpenAiTextProviderError("charged failure", false, 230000, { provider_reference: "req_fail" });
    },
  }));
  assert.deepEqual(result, { state: "failed_released", customerChargeMicros: 0, supplierCostMicros: 230000, attempts: 1 });
  const settlement = g.calls.find((call) => call.name === "settle_openai_customer_failure_without_duplicate_expense");
  assert.equal(settlement.name, "settle_openai_customer_failure_without_duplicate_expense");
  assert.equal(settlement.args.p_failure_class, "provider_failure");
  assert.equal(settlement.args.p_evidence_json.supplier_cost_micros, 230000);
  assert.equal(g.calls.filter((call) => call.name === "record_openai_text_supplier_attempt_expense").length, 1);
  assert.equal(g.calls.some((call) => call.name === "settle_operation"), false);
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
  assert.equal(g.calls.filter((call) => call.name === "authorize_openai_text_provider_attempt_with_aggregate").length, 2);
  assert.equal(g.calls.filter((call) => call.name === "settle_operation").length, 1);
  assert.equal(g.calls.find((call) => call.name === "settle_operation").args.p_actual_fulfillment_cost_micros, 3000);
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
  assert.equal(g.calls.some((call) => call.name === "mark_submission_unknown"), true);
  assert.equal(g.calls.filter((call) => call.name === "authorize_openai_text_provider_attempt_with_aggregate").length, 1);
});

test("proven pre-transmission transport failure releases without inventing supplier expense", async () => {
  const g = gate();
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async () => {
      throw new OpenAiTextProviderError("transport setup failed", false, null, {
        fetch_entered: false,
        transmitted: false,
      });
    },
  }));
  assert.deepEqual(result, {
    state: "failed_released",
    customerChargeMicros: 0,
    supplierCostMicros: 0,
    attempts: 1,
  });
  assert.equal(g.calls.some((call) => call.name === "record_openai_text_supplier_attempt_expense"), false);
  assert.equal(g.calls.find((call) => call.name === "close_openai_text_failure_exposure").args.p_outcome, "success_released");
  assert.equal(g.calls.find((call) => call.name === "release_operation").args.p_evidence_json.transmitted, false);
  assert.equal(g.calls.some((call) => call.name === "mark_submission_unknown"), false);
});

test("persistence failure retains usage, releases the customer, and realizes Forge loss", async () => {
  const g = gate();
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({ persistResult: async () => { throw new Error("write failed"); } }));
  assert.equal(result.customerChargeMicros, 0);
  const lossClose = g.calls.find((call) => call.name === "close_openai_text_failure_exposure");
  assert.equal(lossClose.args.p_outcome, "failure_realized");
  const usage = g.calls.find((call) => call.name === "record_openai_text_usage");
  assert.equal(usage.args.p_result_validated, true);
  assert.equal(usage.args.p_canonical_persistence_confirmed, false);
  assert.ok(g.calls.findIndex((call) => call.name === "record_openai_text_provider_capture")
    < g.calls.findIndex((call) => call.name === "record_openai_text_usage"));
  assert.equal(g.calls.find((call) => call.name === "record_provider_failure").args.p_failure_class, "persistence_failure");
});

test("Forge validation failure retains provider usage and supplier expense without provider blame", async () => {
  const g = gate();
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    validateResult: async () => { throw new Error("artifact contract mismatch"); },
  }));
  assert.equal(result.state, "failed_released");
  const usage = g.calls.find((call) => call.name === "record_openai_text_usage");
  assert.equal(usage.args.p_input_units, 12);
  assert.equal(usage.args.p_output_units, 8);
  assert.equal(usage.args.p_result_validated, false);
  assert.equal(usage.args.p_canonical_persistence_confirmed, false);
  assert.equal(g.calls.filter((call) => call.name === "record_openai_text_supplier_attempt_expense").length, 1);
  assert.equal(g.calls.find((call) => call.name === "record_provider_failure").args.p_failure_class, "forge_validation_failure");
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
    authorize_openai_text_provider_attempt_with_aggregate: async () => ({ data: { provider_execution_authorized: false, reason: "aggregate_failure_limit" }, error: null }),
  });
  await assert.rejects(() => new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async () => { providerCalls += 1; return {}; },
  })), /platform_risk_unavailable/);
  assert.equal(providerCalls, 0);
  const release = g.calls.find((call) => call.name === "release_operation");
  assert.equal(release.args.p_release_key, "operation-key:attempt:1:platform-risk-denied-release");
  assert.equal(release.args.p_reason, "aggregate_failure_limit");
  assert.deepEqual(release.args.p_evidence_json, { provider: "openai", transmitted: false });
  assert.equal(g.calls.some((call) => call.name.includes("relief")), false);
});

test("provider callbacks receive an opaque authorization minted after the affirmative gate", async () => {
  const g = gate();
  let received = null;
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async (_attemptNumber, authorization) => {
      assertOpenAiTextProviderExecutionAuthorization(authorization);
      received = authorization;
      return {
        value: { text: "usable" }, requestId: "req_authorized", inputUnits: 1, outputUnits: 1,
        supplierCostMicros: 1, supplierCostAuthoritative: true,
      };
    },
  }));
  assert.equal(result.state, "settled");
  assert.equal(received.providerExecutionAuthorized, true);
  assert.equal(received.routeCode, "hearth.chat_completion");
  assert.equal(received.attemptKey, "operation-key:attempt:1");
  assert.throws(
    () => assertOpenAiTextProviderExecutionAuthorization({ providerExecutionAuthorized: true }),
    /funding_context_required/,
  );
});

test("a genuine funding-authority denial remains distinct and does not claim a platform-risk release", async () => {
  let providerCalls = 0;
  const g = gate({
    authorize_openai_text_provider_attempt_with_aggregate: async () => ({
      data: { provider_execution_authorized: false, reason: "funding_authority_denied" }, error: null,
    }),
  });
  await assert.rejects(() => new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async () => { providerCalls += 1; return {}; },
  })), /funding_context_required/);
  assert.equal(providerCalls, 0);
  assert.equal(g.calls.some((call) => call.name === "release_operation"), false);
});

test("accepted or owner-funded context cannot bypass a negative provider-attempt decision", async () => {
  for (const funding of [
    { fundingSourceType: "customer_deposit", fundingSourceId: "accepted-deposit" },
    { fundingSourceType: "owner_budget", fundingSourceId: "owner-budget", reservationAlreadyCreated: true },
  ]) {
    let providerCalls = 0;
    const g = gate({
      authorize_openai_text_provider_attempt_with_aggregate: async () => ({
        data: { provider_execution_authorized: false, shadow_mode: true, reason: "shadow_not_authorized" },
        error: null,
      }),
    });
    await assert.rejects(
      () => new PaidOpenAiTextExecutionCoordinator(g).execute(input({
        ...funding,
        executeProvider: async () => { providerCalls += 1; return {}; },
      })),
      /funding_context_required/,
    );
    assert.equal(providerCalls, 0);
    assert.equal(g.calls.some(({ name }) => name === "record_openai_text_provider_capture"), false);
  }
});

test("every coordinated text route shares the exact affirmative provider boundary", async () => {
  const routes = [
    "hearth.chat_completion",
    "hearth.script_generation",
    "hearth.research_synthesis",
    "visual.unified_plan",
    "visual.narrative_interpretation",
    "motion.broll_interpretation",
    "hammer.transcript_cleanup",
    "shorts.discovery",
    "quench.metadata",
  ];
  let providerCalls = 0;
  for (const routeCode of routes) {
    const g = gate({
      authorize_openai_text_provider_attempt_with_aggregate: async () => ({
        data: { provider_execution_authorized: false, reason: "funding_authority_denied" },
        error: null,
      }),
    });
    await assert.rejects(
      () => new PaidOpenAiTextExecutionCoordinator(g).execute(input({
        routeCode,
        executeProvider: async () => { providerCalls += 1; return {}; },
      })),
      /funding_context_required/,
    );
  }
  assert.equal(providerCalls, 0);
});

test("an enabled aggregate denial releases funding before the provider callback", async () => {
  let providerCalls = 0;
  const g = gate({
    acquire_openai_text_aggregate_admission: async () => ({
      data: { enforcement_enabled: true, authorized: false, reason: "aggregate_exposure_exhausted" },
      error: null,
    }),
  });
  await assert.rejects(() => new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async () => { providerCalls += 1; return {}; },
  })), /funding_context_required/);
  assert.equal(providerCalls, 0);
  assert.equal(g.calls.some((call) => call.name === "release_operation"), true);
  assert.equal(g.calls.some((call) => call.name === "authorize_openai_text_provider_attempt_with_aggregate"), false);
});

test("the explicit normal-customer credit admission reaches the existing provider-attempt boundary", async () => {
  let providerCalls = 0;
  const g = gate({
    acquire_openai_text_aggregate_admission: async () => ({
      data: {
        enforcement_enabled: false,
        authorized: true,
        hold_id: null,
        reason: "normal_customer_credit_bounded",
      },
      error: null,
    }),
  });
  const result = await new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async () => {
      providerCalls += 1;
      return {
        value: { text: "usable" }, requestId: "req_normal", inputUnits: 8, outputUnits: 4,
        supplierCostMicros: 1200, supplierCostAuthoritative: true,
      };
    },
  }));
  assert.equal(result.state, "settled");
  assert.equal(providerCalls, 1);
  assert.equal(g.calls.some((call) => call.name === "authorize_openai_text_provider_attempt_with_aggregate"), true);
});

test("a generic inactive aggregate cannot masquerade as normal-customer credit authority", async () => {
  let providerCalls = 0;
  const g = gate({
    acquire_openai_text_aggregate_admission: async () => ({
      data: {
        enforcement_enabled: false,
        authorized: true,
        hold_id: null,
        reason: "aggregate_assignment_inactive",
      },
      error: null,
    }),
  });
  await assert.rejects(() => new PaidOpenAiTextExecutionCoordinator(g).execute(input({
    executeProvider: async () => { providerCalls += 1; return {}; },
  })), /funding_context_required/);
  assert.equal(providerCalls, 0);
  assert.equal(g.calls.some((call) => call.name === "release_operation"), true);
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
