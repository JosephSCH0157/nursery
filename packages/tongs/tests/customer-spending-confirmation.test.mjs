import test from "node:test";
import assert from "node:assert/strict";

import {
  requestCustomerSpendingAcceptance,
} from "../dist/customer-spending-confirmation.js";

function quote(fundingEligible) {
  return {
    quote_id: "11111111-1111-4111-8111-111111111111",
    operation_id: "customer-operation-1",
    quote_hash: "a".repeat(64),
    request_fingerprint: "b".repeat(64),
    currency: "USD",
    maximum_customer_charge_micros: 20000,
    failure_customer_charge_micros: 0,
    failure_terms: "Provider and Forge failures cost you $0.",
    funding_eligible: fundingEligible,
    funding_source: fundingEligible ? "customer_deposit" : "none",
    funding_label: fundingEligible ? "Verified AI credit purchase" : "No verified eligible funds",
    model_display_name: "GPT test model",
    provider_model_id: "gpt-test-snapshot",
    model_tradeoff_summary: "Bounded test model.",
    catalog_revision: 1,
    estimated_customer_charge_micros: 20000,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

test("an eligible quote returns only its exact acceptance fields", () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;
  try {
    assert.deepEqual(requestCustomerSpendingAcceptance(quote(true)), {
      quote_id: "11111111-1111-4111-8111-111111111111",
      operation_id: "customer-operation-1",
      quote_hash: "a".repeat(64),
      request_fingerprint: "b".repeat(64),
    });
  } finally {
    globalThis.confirm = originalConfirm;
  }
});

test("insufficient funding opens Add Credits without accepting or executing the old quote", () => {
  const originalConfirm = globalThis.confirm;
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  let assigned = "";
  globalThis.confirm = () => true;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      pathname: "/app/hearth",
      search: "?workpiece=abc",
      hash: "#chat",
      assign(value) { assigned = value; },
    },
  });
  try {
    assert.equal(requestCustomerSpendingAcceptance(quote(false)), null);
    assert.match(assigned, /^\/app\/subscriptions\?funding=required&return_to=/);
    assert.match(decodeURIComponent(assigned), /\/app\/hearth\?workpiece=abc#chat/);
  } finally {
    globalThis.confirm = originalConfirm;
    if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
    else delete globalThis.location;
  }
});
