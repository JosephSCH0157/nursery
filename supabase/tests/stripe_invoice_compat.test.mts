import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveInvoiceServicePeriod,
  resolveInvoiceSubscriptionId,
} from "../functions/_shared/stripe-invoice-compat";

test("resolves current Stripe invoice parent subscription and line service period", () => {
  const invoice = {
    subscription: null,
    period_start: 1_788_790_895,
    period_end: 1_788_790_895,
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: "sub_current" },
    },
    lines: {
      data: [{
        parent: {
          type: "subscription_item_details",
          subscription_item_details: { subscription: "sub_current" },
        },
        period: { start: 1_788_790_895, end: 1_791_382_895 },
      }],
    },
  };

  assert.equal(resolveInvoiceSubscriptionId(invoice), "sub_current");
  assert.deepEqual(
    resolveInvoiceServicePeriod(invoice, {}, "sub_current"),
    { start: 1_788_790_895, end: 1_791_382_895 },
  );
});

test("preserves legacy top-level subscription and valid period fallbacks", () => {
  const invoice = {
    subscription: { id: "sub_legacy" },
    period_start: 100,
    period_end: 200,
    lines: { data: [] },
  };

  assert.equal(resolveInvoiceSubscriptionId(invoice), "sub_legacy");
  assert.deepEqual(
    resolveInvoiceServicePeriod(invoice, {}, "sub_legacy"),
    { start: 100, end: 200 },
  );
});

test("rejects zero-length invoice periods instead of creating invalid receipts", () => {
  const invoice = {
    parent: { subscription_details: { subscription: "sub_zero" } },
    period_start: 100,
    period_end: 100,
    lines: { data: [] },
  };

  assert.equal(resolveInvoiceServicePeriod(invoice, {}, "sub_zero"), null);
});
