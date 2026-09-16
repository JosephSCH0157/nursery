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
    credit_charge: 3,
    failure_terms: "Failed operations do not consume Forge Credits.",
    funding_eligible: fundingEligible,
    funding_label: fundingEligible ? "Forge Credits" : "Not enough Forge Credits",
    model_display_name: "GPT test model",
    model_tradeoff_summary: "Bounded test model.",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

test("an eligible quote returns only its exact acceptance fields", () => {
  const originalConfirm = globalThis.confirm;
  let customerPrompt = "";
  globalThis.confirm = (message) => {
    customerPrompt = String(message);
    return true;
  };
  try {
    assert.deepEqual(requestCustomerSpendingAcceptance(quote(true)), {
      quote_id: "11111111-1111-4111-8111-111111111111",
      operation_id: "customer-operation-1",
      quote_hash: "a".repeat(64),
      request_fingerprint: "b".repeat(64),
    });
    assert.match(customerPrompt, /Model: GPT test model/);
    assert.match(customerPrompt, /Cost: 3 Credits/);
    assert.match(customerPrompt, /Funding: Forge Credits/);
    assert.doesNotMatch(customerPrompt, /\$|micros|wholesale|markup/i);
  } finally {
    globalThis.confirm = originalConfirm;
  }
});

test("insufficient funding opens billing without implying beta credit purchases", () => {
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
