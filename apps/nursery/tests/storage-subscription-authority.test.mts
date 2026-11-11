import assert from "node:assert/strict";
import test from "node:test";
import { STRIPE_CATALOG } from "../../../supabase/functions/_shared/stripe-catalog.ts";
import { buildForgeCheckoutMetadata } from "../../../supabase/functions/_shared/forge-billing-metadata.ts";
import { refreshStorageSubscription, resolveStorageSubscriptionMetadata } from "../../../supabase/functions/_shared/storage-subscription-authority.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const packs = STRIPE_CATALOG.storage;
function subscription(level: keyof typeof packs, livemode = false): {
  livemode: boolean; metadata: Record<string, string>;
  items: { has_more: boolean; data: Array<{ quantity: number; price: { id: string; type: string; recurring: { interval: string; interval_count: number } } }> };
} {
  return {
    livemode,
    metadata: buildForgeCheckoutMetadata({
      userId, catalogPrice: { ...packs["50gb_v2"], kind: "storage" },
    }),
    items: { has_more: false, data: [{
      quantity: 1,
      price: {
        id: livemode ? packs[level].livePriceId : packs[level].testPriceId,
        type: "recurring", recurring: { interval: "month", interval_count: 1 },
      },
    }] },
  };
}

for (const livemode of [false, true]) {
  test(`actual Stripe price determines upgrades and downgrades (live=${livemode})`, () => {
    for (const level of ["500gb", "150gb", "50gb_v2"] as const) {
      const input = subscription(level, livemode);
      const resolved = resolveStorageSubscriptionMetadata(input, userId);
      assert.equal(resolved?.itemId, level);
      assert.equal(resolved?.offerId, packs[level].offerId);
      assert.equal(resolved?.supabaseUserId, userId);
      assert.deepEqual(resolveStorageSubscriptionMetadata(input, userId), resolved);
      assert.equal(input.metadata.forge_item_id, "50gb_v2", "immutable incoming evidence");
    }
  });
  test(`legacy storage IDs retain their original entitlement mapping (live=${livemode})`, () => {
    for (const level of ["50gb", "100gb", "1tb"] as const) {
      assert.equal(resolveStorageSubscriptionMetadata(subscription(level, livemode), userId)?.itemId, level);
    }
  });
}

test("unknown prices cannot inherit capacity from valid stale metadata", () => {
  const input = subscription("50gb_v2");
  input.items.data[0].price.id = "price_unknown";
  assert.throws(() => resolveStorageSubscriptionMetadata(input, userId), /Unknown storage/);
  input.metadata = { forge_storage_level: "50gb" };
  assert.throws(() => resolveStorageSubscriptionMetadata(input, userId), /Unknown storage/);
});
test("storage price mode must match the subscription", () => {
  const input = subscription("500gb");
  input.livemode = true;
  assert.throws(() => resolveStorageSubscriptionMetadata(input, userId), /mode/);
});
test("rejects quantities, mixed items, missing items and truncated item lists", () => {
  for (const quantity of [0, 2, -1]) {
    const input = subscription("500gb");
    input.items.data[0].quantity = quantity;
    assert.throws(() => resolveStorageSubscriptionMetadata(input, userId), /item shape/);
  }
  const input = subscription("500gb");
  input.items.data.push(input.items.data[0]);
  assert.throws(() => resolveStorageSubscriptionMetadata(input, userId), /item shape/);
  input.items.data = [];
  assert.throws(() => resolveStorageSubscriptionMetadata(input, userId), /item shape/);
  const truncated = subscription("500gb");
  truncated.items.has_more = true;
  assert.throws(() => resolveStorageSubscriptionMetadata(truncated, userId), /item shape/);
});
test("one-time legacy payments cannot become recurring capacity by catalog alias", () => {
  const input = subscription("50gb_v2");
  input.items.data[0].price.id = packs["50gb_v2"].legacyTestPriceIds[0];
  input.items.data[0].price.type = "one_time";
  assert.throws(() => resolveStorageSubscriptionMetadata(input, userId), /monthly recurring/);
});
test("unsupported billing periods fail closed", () => {
  const input = subscription("50gb_v2");
  input.items.data[0].price.recurring.interval_count = 12;
  assert.throws(() => resolveStorageSubscriptionMetadata(input, userId), /monthly recurring/);
});
test("unrelated membership subscriptions are left to the existing resolver", () => {
  const input = subscription("50gb_v2");
  input.metadata = {};
  input.items.data[0].price.id = STRIPE_CATALOG.plans.pro.monthly.testPriceId;
  assert.equal(resolveStorageSubscriptionMetadata(input, userId), null);
  assert.throws(() => resolveStorageSubscriptionMetadata(input, userId, "cloud_storage"), /Unknown storage/);
});
test("storage without stale metadata still resolves from the verified price", () => {
  const input = subscription("150gb");
  input.metadata = {};
  assert.equal(resolveStorageSubscriptionMetadata(input, userId)?.itemId, "150gb");
});

test("duplicate and out-of-order storage events resolve current Stripe state", async () => {
  const old = { ...subscription("500gb"), id: "sub_fixture", customer: "cus_fixture", status: "active" };
  const current = { ...subscription("50gb_v2"), id: old.id, customer: old.customer, status: "canceled" };
  for (let delivery = 0; delivery < 2; delivery++) {
    const refreshed = await refreshStorageSubscription(old, async (id) => {
      assert.equal(id, old.id);
      return current;
    });
    assert.equal(refreshed.status, "canceled");
    assert.equal(resolveStorageSubscriptionMetadata(refreshed, userId)?.itemId, "50gb_v2");
  }
  assert.equal(old.status, "active", "original event remains immutable evidence");
});
test("refresh failures and different customer, subscription, or mode fail closed", async () => {
  const original = { ...subscription("500gb"), id: "sub_fixture", customer: "cus_fixture" };
  for (const replacement of [
    { ...original, id: "sub_other" }, { ...original, customer: "cus_other" },
    { ...original, livemode: true },
  ]) {
    await assert.rejects(refreshStorageSubscription(original, async () => replacement), /identity mismatch/);
  }
  await assert.rejects(refreshStorageSubscription(original, async () => { throw new Error("Stripe unavailable"); }), /Stripe unavailable/);
});
