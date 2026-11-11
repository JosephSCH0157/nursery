import { findAccountStripePrice, type StripeCatalogContext } from "./stripe-account-catalog.ts";
import { findStripeCatalogPriceById } from "./stripe-catalog.ts";
import { buildForgeCheckoutMetadata, parseForgePurchaseMetadata } from "./forge-billing-metadata.ts";

type Subscription = {
  livemode: boolean;
  metadata?: Record<string, unknown> | null;
  items: {
    has_more?: boolean;
    data: Array<{
      quantity?: number | null;
      price: { id: string; type?: string; recurring?: { interval: string; interval_count: number } | null };
    }>;
  };
};

function claimsStorage(subscription: Subscription, purchaseType?: string): boolean {
  return purchaseType === "cloud_storage"
    || subscription.metadata?.forge_purchase_type === "cloud_storage"
    || subscription.metadata?.purchase_type === "cloud_storage"
    || Boolean(subscription.metadata?.forge_storage_level);
}

/** Never project an older storage webhook snapshot over Stripe's current state. */
export async function refreshStorageSubscription<T extends Subscription & {
  id: string; customer: string | { id: string };
}>(subscription: T, retrieve: (id: string) => Promise<T>): Promise<T> {
  if (!claimsStorage(subscription) && !subscription.items.data.some(
    (item) => findStripeCatalogPriceById(item.price.id)?.kind === "storage",
  )) return subscription;
  const current = await retrieve(subscription.id);
  const customerId = (value: T["customer"]) => typeof value === "string" ? value : value.id;
  if (current.id !== subscription.id || current.livemode !== subscription.livemode
    || customerId(current.customer) !== customerId(subscription.customer)) {
    throw new Error("Refreshed storage subscription identity mismatch");
  }
  if (!current.items.data.some((item) => findStripeCatalogPriceById(item.price.id)?.kind === "storage")) {
    throw new Error("Refreshed storage subscription has no recognized storage price");
  }
  // Complete shape validation occurs with the resolved user before ledger writes.
  return current;
}

/** Stripe price authority wins over stale Checkout/portal metadata for storage. */
export function resolveStorageSubscriptionMetadata(
  subscription: Subscription,
  userId: string,
  purchaseType?: string,
  context?: StripeCatalogContext,
) {
  const items = subscription.items.data;
  if (context && context.environment !== (subscription.livemode ? "live" : "test")) throw new Error("Storage account/mode mismatch");
  const matches = items.map((item) => context ? findAccountStripePrice(item.price.id, context) : findStripeCatalogPriceById(item.price.id));
  if (!claimsStorage(subscription, purchaseType) && !matches.some((match) => match?.kind === "storage")) return null;

  // The current canonical ledger represents one pack per subscription, not
  // item quantities or mixed subscriptions. Never silently under/over-credit.
  if (subscription.items.has_more || items.length !== 1 || items[0].quantity !== 1) {
    throw new Error("Unsupported storage subscription item shape");
  }
  const match = matches[0];
  if (match?.kind !== "storage") throw new Error("Unknown storage subscription price");
  const allowedIds = subscription.livemode
    ? [match.livePriceId, ...(match.legacyLivePriceIds ?? [])]
    : [match.testPriceId, ...(match.legacyTestPriceIds ?? [])];
  if (!allowedIds.includes(items[0].price.id)) {
    throw new Error("Storage price mode does not match subscription mode");
  }
  const price = items[0].price;
  if (price.type !== "recurring" || price.recurring?.interval !== "month"
    || price.recurring.interval_count !== 1) {
    throw new Error("Storage subscription requires a monthly recurring price");
  }
  return parseForgePurchaseMetadata({
    metadata: buildForgeCheckoutMetadata({ userId, catalogPrice: match }),
    mode: "subscription",
  });
}
