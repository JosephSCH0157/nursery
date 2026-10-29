import assert from "node:assert/strict";
import test from "node:test";
import { readCustomerSpendingQuote } from "../../../packages/tongs/src/customer-spending-confirmation.ts";
import type { CustomerOpenAiTextQuote } from "../../../packages/tongs/src/providers/openai-text-customer-funding.ts";
import { toHammerCustomerSpendingQuote } from "../scripts/mw-hammer-prep.ts";

const internalFields = [
  "currency",
  "maximum_customer_charge_micros",
  "failure_customer_charge_micros",
  "funding_source",
  "funding_environment",
  "payer_kind",
  "provider_model_id",
  "runtime_model_id",
  "model_catalog_entry_id",
  "catalog_revision",
  "estimated_customer_charge_micros",
  "maximum_wholesale_exposure_micros",
  "provider_cost",
  "wholesale",
  "markup_basis_points",
] as const;

const quote: CustomerOpenAiTextQuote = {
  quoteId: "11111111-1111-4111-8111-111111111111",
  operationId: "forge:hammer:test-operation",
  quoteHash: "a".repeat(64),
  requestFingerprint: "b".repeat(64),
  currency: "USD",
  maximumCustomerChargeMicros: 15_000,
  customerCreditUnits: 3,
  failureCustomerChargeMicros: 0,
  failureTerms: "Failed operations do not consume Forge Credits.",
  fundingEligible: true,
  fundingSource: "customer_deposit",
  fundingEnvironment: "test",
  payerKind: "personal",
  fundingLabel: "Forge Credits",
  modelDisplayName: "Customer-safe model name",
  modelTradeoffSummary: "Customer-safe bounded model summary.",
  providerModelId: "private-provider-model",
  catalogRevision: 7,
  estimatedCustomerChargeMicros: 10_000,
  expiresAt: "2030-01-01T00:00:00.000Z",
};

const allowedFields = [
  "quote_id",
  "operation_id",
  "quote_hash",
  "request_fingerprint",
  "credit_charge",
  "failure_terms",
  "funding_eligible",
  "funding_label",
  "model_display_name",
  "model_tradeoff_summary",
  "expires_at",
] as const;

test("Hammer customer quote is an explicit customer-safe allowlist", () => {
  const wireQuote = toHammerCustomerSpendingQuote(quote);
  assert.deepEqual(Object.keys(wireQuote), [...allowedFields]);
  assert.equal(wireQuote.credit_charge, 3);
  for (const field of internalFields) assert.equal(field in wireQuote, false, field);
});

for (const surface of ["transcript cleanup", "Shorts discovery"] as const) {
  test(`${surface} error quote parses through the shared customer contract`, () => {
    const payload = {
      ok: false,
      error: {
        code: "openai_text_quote_required",
        message: "Accept the exact customer price.",
        billing_quote: toHammerCustomerSpendingQuote(quote),
      },
    };
    assert.deepEqual(readCustomerSpendingQuote(payload), {
      quote_id: quote.quoteId,
      operation_id: quote.operationId,
      quote_hash: quote.quoteHash,
      request_fingerprint: quote.requestFingerprint,
      credit_charge: quote.customerCreditUnits,
      failure_terms: quote.failureTerms,
      funding_eligible: true,
      funding_label: quote.fundingLabel,
      model_display_name: quote.modelDisplayName,
      model_tradeoff_summary: quote.modelTradeoffSummary,
      expires_at: quote.expiresAt,
    });
  });
}

test("transcript prep root quote parses through the shared customer contract", () => {
  const payload = {
    ok: false,
    error: {
      code: "transcription_spending_confirmation_required",
      message: "Accept the exact customer price.",
    },
    billing_quote: toHammerCustomerSpendingQuote(quote),
  };
  assert.equal(readCustomerSpendingQuote(payload)?.credit_charge, 3);
  assert.equal(readCustomerSpendingQuote(payload)?.expires_at, quote.expiresAt);
});

test("owner-sponsored transcript quote distinguishes the reference price from the zero customer charge", () => {
  const payload = {
    ok: false,
    error: {
      code: "transcription_spending_confirmation_required",
      message: "Accept the exact owner-sponsored reference price.",
    },
    billing_quote: {
      ...toHammerCustomerSpendingQuote(quote),
      credit_charge: 0,
      reference_credit_units: 12,
      funding_label: "Owner-sponsored certification; no customer charge",
    },
  };
  const parsed = readCustomerSpendingQuote(payload);
  assert.equal(parsed?.credit_charge, 0);
  assert.equal(parsed?.reference_credit_units, 12);
  assert.equal(parsed?.funding_label, "Owner-sponsored certification; no customer charge");
});
