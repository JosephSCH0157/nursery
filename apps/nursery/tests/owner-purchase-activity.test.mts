import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCurrencyMinor,
  formatCurrencyMicros,
  ownerPurchaseAccountingLabel,
  type OwnerPurchaseActivity,
} from "../src/lib/owner-purchase-activity";

const purchase: OwnerPurchaseActivity = {
  purchase_id: "sub_test",
  user_id: "user_test",
  customer_email: "customer@example.test",
  customer_name: "Test Customer",
  stripe_mode: "test",
  purchase_type: "subscription",
  item_id: "creator",
  interval: "monthly",
  status: "active",
  checkout_session_id: "cs_test",
  stripe_invoice_id: "in_test",
  payment_status: "paid",
  checkout_currency: "usd",
  checkout_amount_minor: 1000,
  checkout_processed_at: "2026-09-07T14:21:41Z",
  accounting_receipt_id: null,
  accounted_cash_micros: null,
  accounting_currency: null,
  accounting_received_at: null,
  allowance_grant_count: 0,
  allocated_revenue_micros: 0,
  maximum_wholesale_spend_micros: 0,
  recognized_revenue_micros: 0,
  accounting_state: "invoice_receipt_pending",
  live_funding_eligible: false,
  signed_webhook_events: [],
  observed_at: "2026-09-07T14:21:41Z",
};

test("owner purchase formatting preserves Stripe minor-unit semantics", () => {
  assert.equal(formatCurrencyMinor(1000, "usd"), "$10.00");
  assert.equal(formatCurrencyMinor(null, "usd"), "Amount unavailable");
  assert.equal(formatCurrencyMicros(10_000_000, "usd"), "$10.00");
});

test("pending invoice receipt is explicit and never described as funded", () => {
  assert.equal(ownerPurchaseAccountingLabel(purchase), "Invoice receipt pending");
  assert.equal(purchase.live_funding_eligible, false);
  assert.equal(purchase.recognized_revenue_micros, 0);
});
