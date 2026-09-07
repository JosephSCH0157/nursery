import assert from "node:assert/strict";
import test from "node:test";
import { FakeRunwayBrollVideoProvider } from "../dist/providers/fake-runway-broll-video-provider.js";
import { PaidRunwayExecutionCoordinator } from "../dist/providers/paid-runway-execution-coordinator.js";

const baseInput = {
  reservationId: "reservation-1",
  quoteId: "quote-1",
  fundingSourceType: "customer_deposit",
  fundingSourceId: "deposit-1",
  reservationKey: "reservation-key-1",
  attemptKey: "attempt-key-1",
  prompt: "A slow documentary tracking shot",
  model: "gen4.5",
  durationSeconds: 5,
  ratio: "1280:720",
  actualFulfillmentCostMicros: 500000,
  settlementId: "settlement-1",
  settlementKey: "settlement-key-1",
};

class FakeGate {
  constructor({ authorized = true } = {}) {
    this.authorized = authorized;
    this.calls = [];
  }
  async rpc(name, args) {
    this.calls.push({ name, args });
    if (name === "begin_provider_attempt" || name === "begin_owner_provider_attempt") {
      return { data: { provider_execution_authorized: this.authorized, state: this.authorized ? "provider_attempt_shadowed" : "reserved" }, error: null };
    }
    return { data: { state: "ok" }, error: null };
  }
}

test("production shadow response prevents even the fake Runway provider from being called", async () => {
  const gate = new FakeGate({ authorized: false });
  const provider = new FakeRunwayBrollVideoProvider("success");
  const result = await new PaidRunwayExecutionCoordinator(gate, provider).execute(baseInput);
  assert.equal(result.state, "shadow_blocked");
  assert.equal(provider.submitCount, 0);
  assert.deepEqual(gate.calls.map((call) => call.name), ["reserve_operation", "begin_provider_attempt"]);
});

test("authorized fake Runway success reserves, submits once, and settles once", async () => {
  const gate = new FakeGate();
  const provider = new FakeRunwayBrollVideoProvider("success");
  const result = await new PaidRunwayExecutionCoordinator(gate, provider).execute(baseInput);
  assert.equal(result.state, "settled");
  assert.equal(provider.submitCount, 1);
  assert.equal(provider.pollCount, 1);
  assert.equal(gate.calls.filter((call) => call.name === "reserve_operation").length, 1);
  assert.equal(gate.calls.filter((call) => call.name === "begin_provider_attempt").length, 1);
  assert.equal(gate.calls.filter((call) => call.name === "settle_operation").length, 1);
  assert.equal(gate.calls.find((call) => call.name === "settle_operation").args.p_outcome, "success");
});

test("ambiguous fake Runway submission retains the reservation and never settles or releases", async () => {
  const gate = new FakeGate();
  const provider = new FakeRunwayBrollVideoProvider("submission_unknown");
  const result = await new PaidRunwayExecutionCoordinator(gate, provider).execute(baseInput);
  assert.equal(result.state, "submission_unknown");
  assert.equal(provider.submitCount, 1);
  assert.equal(gate.calls.filter((call) => call.name === "mark_submission_unknown").length, 1);
  assert.equal(gate.calls.filter((call) => call.name === "settle_operation").length, 0);
  assert.equal(gate.calls.filter((call) => call.name === "release_operation").length, 0);
});

test("definitive fake rejection records the disclosed free failure and releases funds", async () => {
  const gate = new FakeGate();
  const provider = new FakeRunwayBrollVideoProvider("definitive_rejection");
  const result = await new PaidRunwayExecutionCoordinator(gate, provider).execute(baseInput);
  assert.equal(result.state, "definitive_rejection");
  assert.equal(provider.submitCount, 1);
  assert.equal(gate.calls.filter((call) => call.name === "record_provider_failure").length, 1);
  assert.equal(gate.calls.filter((call) => call.name === "release_operation").length, 1);
  assert.equal(gate.calls.filter((call) => call.name === "settle_operation").length, 0);
});

test("fake billable provider failure uses the accepted failure settlement path", async () => {
  const gate = new FakeGate();
  const provider = new FakeRunwayBrollVideoProvider("provider_failure");
  const result = await new PaidRunwayExecutionCoordinator(gate, provider).execute(baseInput);
  assert.equal(result.state, "provider_failed");
  assert.equal(provider.submitCount, 1);
  assert.equal(gate.calls.filter((call) => call.name === "record_provider_failure").length, 1);
  const settlement = gate.calls.find((call) => call.name === "settle_operation");
  assert.equal(settlement.args.p_outcome, "billable_failure");
  assert.equal(settlement.args.p_failure_class, "provider_billed_failure");
});

test("a duplicate attempt response that is not authorized cannot call Runway twice", async () => {
  const gate = new FakeGate();
  const provider = new FakeRunwayBrollVideoProvider("success");
  const coordinator = new PaidRunwayExecutionCoordinator(gate, provider);
  assert.equal((await coordinator.execute(baseInput)).state, "settled");
  gate.authorized = false;
  assert.equal((await coordinator.execute(baseInput)).state, "shadow_blocked");
  assert.equal(provider.submitCount, 1);
});

test("owner-funded fake Runway execution settles through the no-revenue owner lane", async () => {
  const gate = new FakeGate();
  const provider = new FakeRunwayBrollVideoProvider("success");
  const result = await new PaidRunwayExecutionCoordinator(gate, provider).execute({
    ...baseInput,
    fundingSourceType: "owner_budget",
    fundingSourceId: "owner-budget-1",
  });
  assert.equal(result.state, "settled");
  assert.equal(gate.calls.filter((call) => call.name === "begin_owner_provider_attempt").length, 1);
  assert.equal(gate.calls.filter((call) => call.name === "begin_provider_attempt").length, 0);
  assert.equal(gate.calls.filter((call) => call.name === "settle_owner_operation").length, 1);
  assert.equal(gate.calls.filter((call) => call.name === "settle_operation").length, 0);
});
