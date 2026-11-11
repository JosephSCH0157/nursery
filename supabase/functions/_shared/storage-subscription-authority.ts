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

/** Stripe price authority wins over stale Checkout/portal metadata for storage. */
export function resolveStorageSubscriptionMetadata(
  subscription: Subscription,
  userId: string,
  purchaseType?: string,
) {
  const items = subscription.items.data;
  const matches = items.map((item) => findStripeCatalogPriceById(item.price.id));
  const claimsStorage = purchaseType === "cloud_storage"
    || subscription.metadata?.forge_purchase_type === "cloud_storage"
    || subscription.metadata?.purchase_type === "cloud_storage"
    || Boolean(subscription.metadata?.forge_storage_level);
  if (!claimsStorage && !matches.some((match) => match?.kind === "storage")) return null;

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
