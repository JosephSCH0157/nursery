import { STRIPE_CATALOG, findStripeCatalogPriceById, type StripeCatalogPriceMatch } from "./stripe-catalog.ts";
import type { FinancialEnvironment } from "./financial-environment.ts";

export const FORGE_STRIPE_ACCOUNT = "acct_1Spw8c1OSG3CCNl8";
export const FORGE_STRIPE_SANDBOX = "acct_1Spw8m0v1TAfIsgZ";
export type StripeCatalogContext = { accountId: string; environment: FinancialEnvironment };

// Provider identifiers only. Offers, capacity and entitlement rules remain in
// the existing canonical catalog and storage authority; metadata is not authority.
export const SANDBOX_STORAGE_PRICES = {
  "price_1Uaj7f0v1TAfIsgZHtYtQGh6": { level: "50gb_v2", productId: "prod_Vbx1M86ZW7gIMB" },
  "price_1Uaj7g0v1TAfIsgZ9YJEklY0": { level: "150gb", productId: "prod_Vbx1VHvjQUGhlj" },
  "price_1Uaj7i0v1TAfIsgZ8E61NzZ4": { level: "500gb", productId: "prod_Vbx1XLguEmEvJF" },
} as const;

export function findAccountStripePrice(
  priceId: string, context: StripeCatalogContext,
): StripeCatalogPriceMatch | null {
  if (context.environment !== "test" && context.environment !== "live") return null;
  if (context.accountId === FORGE_STRIPE_ACCOUNT) {
    const match = findStripeCatalogPriceById(priceId);
    if (!match) return null;
    const allowed = context.environment === "live"
      ? [match.livePriceId, ...(match.legacyLivePriceIds ?? [])]
      : [match.testPriceId, ...(match.legacyTestPriceIds ?? [])];
    return allowed.includes(priceId) ? match : null;
  }
  if (context.accountId !== FORGE_STRIPE_SANDBOX || context.environment !== "test") return null;
  if (!Object.hasOwn(SANDBOX_STORAGE_PRICES, priceId)) return null;
  const binding = SANDBOX_STORAGE_PRICES[priceId as keyof typeof SANDBOX_STORAGE_PRICES];
  return {
    ...STRIPE_CATALOG.storage[binding.level], kind: "storage",
    testPriceId: priceId, testProductId: binding.productId,
    livePriceId: "", liveProductId: "",
    legacyTestPriceIds: [], legacyTestProductIds: [],
    legacyLivePriceIds: [], legacyLiveProductIds: [],
  };
}

/** Configuration is server-only. Verify the API credential's account, never
 * infer it from a price name, metadata, event payload or the key's test prefix.
 * Sandbox authorization is deliberately limited to loopback disposable receivers.
 * Network/DB credential isolation must also be certified before real delivery. */
export function verifyStripeWebhookAccount(input: {
  configuredAccountId?: string;
  verifiedAccountId: string;
  eventAccountId?: string;
  livemode: boolean;
  supabaseUrl: string;
}): StripeCatalogContext {
  const accountId = input.configuredAccountId ?? FORGE_STRIPE_ACCOUNT;
  if (input.verifiedAccountId !== accountId
    || (input.eventAccountId !== undefined && input.eventAccountId !== accountId)) {
    throw new Error("Stripe credential/event account mismatch");
  }
  if (accountId !== FORGE_STRIPE_ACCOUNT && accountId !== FORGE_STRIPE_SANDBOX) {
    throw new Error("Unapproved Stripe account");
  }
  if (typeof input.livemode !== "boolean") throw new Error("Stripe mode required");
  if (accountId === FORGE_STRIPE_SANDBOX) {
    const url = new URL(input.supabaseUrl);
    if (input.livemode || url.protocol !== "http:"
      || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.search || url.hash
      || (url.pathname !== "/" && url.pathname !== "")) {
      throw new Error("Sandbox billing requires Test mode and a disposable loopback Supabase receiver");
    }
  }
  return { accountId, environment: input.livemode ? "live" : "test" };
}
