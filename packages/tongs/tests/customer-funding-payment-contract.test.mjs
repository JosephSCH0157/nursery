import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const checkout = readFileSync(resolve(root, "supabase/functions/create-one-time-checkout-session/index.ts"), "utf8");
const webhook = readFileSync(resolve(root, "supabase/functions/stripe-webhook/index.ts"), "utf8");

test("AI-credit checkout is authenticated, catalog-bound, and cannot itself grant funds", () => {
  assert.match(checkout, /supabaseAdmin\.auth\.getUser\(\s*token/);
  assert.match(checkout, /catalogPrice\.kind !== "pack" \|\| catalogPrice\.packType !== "ai_credits"/);
  assert.match(checkout, /Stripe price\/product does not match the Forge catalog/);
  assert.match(checkout, /mode: "payment"/);
  assert.doesNotMatch(checkout, /record_customer_deposit|grant_ai_credits/);
});

test("signed paid webhook records canonical deposit before compatibility balance", () => {
  const signature = webhook.indexOf("stripe.webhooks.constructEventAsync");
  const dispatch = webhook.indexOf('case "checkout.session.completed"');
  const paidGuard = webhook.indexOf('context.paymentStatus !== "paid"');
  const deposit = webhook.indexOf("recordCustomerDepositAccounting(supabase");
  const fee = webhook.indexOf("recordCustomerDepositProcessorFee(supabase");
  const compatibility = webhook.indexOf("grantAiCredits(supabase");
  assert.ok(signature >= 0 && signature < dispatch);
  assert.ok(paidGuard >= 0 && paidGuard < deposit);
  assert.ok(deposit >= 0 && deposit < fee && fee < compatibility);
  assert.match(webhook, /if \(event\.livemode === true\)/);
});

test("refund and dispute webhook branches reach accounting adjustments", () => {
  for (const eventType of [
    "refund.created",
    "charge.refunded",
    "charge.dispute.created",
  ]) {
    assert.match(webhook, new RegExp(`case "${eventType.replaceAll(".", "\\.")}"`));
  }
  assert.match(webhook, /recordStripeAdjustmentAccounting/);
  assert.match(webhook, /adjustmentType: "refund"/);
  assert.match(webhook, /adjustmentType: "dispute"/);
});
