import type Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import {
  STRIPE_CATALOG,
  type StripeCatalogPriceMatch,
} from "./stripe-catalog.ts";

export type ForgePurchaseType =
  | "subscription"
  | "ai_credits"
  | "cloud_storage";

export type ForgePurchaseInterval =
  | "monthly"
  | "quarterly"
  | "one_time";

export type ForgePurchaseMetadata = {
  supabaseUserId: string;
  purchaseType: ForgePurchaseType;
  itemId: string;
  interval: ForgePurchaseInterval;
  version: "v1";
  source: "canonical" | "legacy_compat";
};

export const FORGE_PRODUCT_ID = "podcasters_forge";
export const FORGE_METADATA_VERSION = "v1";

const AI_PACK_IDS = new Set(
  Object.values(STRIPE_CATALOG.packs.ai_credits).map((entry) => entry.packId),
);
const CLOUD_STORAGE_IDS = new Set(
  Object.values(STRIPE_CATALOG.storage).map((entry) => entry.storageLevel),
);
const SUBSCRIPTION_ITEM_IDS = new Set([
  ...Object.values(STRIPE_CATALOG.plans).flatMap((intervals) =>
    Object.values(intervals).map((entry) => entry.planId)
  ),
  ...Object.values(STRIPE_CATALOG.addons).flatMap((intervals) =>
    Object.values(intervals).map((entry) => entry.addonId)
  ),
]);

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isForgePurchaseType(value: string): value is ForgePurchaseType {
  return value === "subscription"
    || value === "ai_credits"
    || value === "cloud_storage";
}

function isForgePurchaseInterval(value: string): value is ForgePurchaseInterval {
  return value === "monthly"
    || value === "quarterly"
    || value === "one_time";
}

function readMetadataString(
  metadata: Record<string, unknown> | Stripe.Metadata | null | undefined,
  key: string,
): string | null {
  return normalizeString(metadata?.[key]);
}

function resolveCheckoutMetadataCore(
  catalogPrice: StripeCatalogPriceMatch,
): Omit<ForgePurchaseMetadata, "supabaseUserId" | "version" | "source"> {
  switch (catalogPrice.kind) {
    case "plan":
      return {
        purchaseType: "subscription",
        itemId: catalogPrice.planId,
        interval: catalogPrice.interval,
      };
    case "addon":
      return {
        purchaseType: "subscription",
        itemId: catalogPrice.addonId,
        interval: catalogPrice.interval,
      };
    case "pack":
      return {
        purchaseType: "ai_credits",
        itemId: catalogPrice.packId,
        interval: catalogPrice.interval,
      };
    case "storage":
      return {
        purchaseType: "cloud_storage",
        itemId: catalogPrice.storageLevel,
        interval: catalogPrice.interval,
      };
  }
}

function inferLegacyPurchaseType(
  metadata: Record<string, unknown> | Stripe.Metadata | null | undefined,
): ForgePurchaseType | null {
  const packType = readMetadataString(metadata, "forge_pack_type");
  if (packType === "ai_credits") return "ai_credits";
  if (readMetadataString(metadata, "forge_storage_level")) return "cloud_storage";
  if (
    readMetadataString(metadata, "forge_plan_id")
    || readMetadataString(metadata, "forge_addon")
  ) {
    return "subscription";
  }
  return null;
}

function inferLegacyItemId(
  metadata: Record<string, unknown> | Stripe.Metadata | null | undefined,
): string | null {
  return readMetadataString(metadata, "forge_item_id")
    ?? readMetadataString(metadata, "forge_pack_id")
    ?? readMetadataString(metadata, "forge_storage_level")
    ?? readMetadataString(metadata, "forge_plan_id")
    ?? readMetadataString(metadata, "forge_addon");
}

function validatePurchaseCombination(
  metadata: Pick<ForgePurchaseMetadata, "purchaseType" | "itemId" | "interval">,
  mode: string | null,
): void {
  switch (metadata.purchaseType) {
    case "subscription":
      if (metadata.interval !== "monthly" && metadata.interval !== "quarterly") {
        throw new Error(
          `Invalid forge_interval for subscription: ${metadata.interval}`,
        );
      }
      if (!SUBSCRIPTION_ITEM_IDS.has(metadata.itemId)) {
        throw new Error(`Unsupported subscription forge_item_id: ${metadata.itemId}`);
      }
      if (mode && mode !== "subscription") {
        throw new Error(
          `Subscription checkout must use session.mode=subscription, received ${mode}`,
        );
      }
      return;
    case "ai_credits":
      if (metadata.interval !== "one_time") {
        throw new Error(
          `Invalid forge_interval for ai_credits: ${metadata.interval}`,
        );
      }
      if (!AI_PACK_IDS.has(metadata.itemId)) {
        throw new Error(`Unsupported ai_credits forge_item_id: ${metadata.itemId}`);
      }
      if (mode && mode !== "payment") {
        throw new Error(
          `AI credits checkout must use session.mode=payment, received ${mode}`,
        );
      }
      return;
    case "cloud_storage":
      if (metadata.interval !== "monthly") {
        throw new Error(
          `Invalid forge_interval for cloud_storage: ${metadata.interval}`,
        );
      }
      if (!CLOUD_STORAGE_IDS.has(metadata.itemId)) {
        throw new Error(`Unsupported cloud_storage forge_item_id: ${metadata.itemId}`);
      }
      if (mode && mode !== "subscription") {
        throw new Error(
          `Cloud storage checkout must use session.mode=subscription, received ${mode}`,
        );
      }
      return;
  }
}

export function buildForgeCheckoutMetadata(
  args: {
    userId: string;
    catalogPrice: StripeCatalogPriceMatch;
  },
): Record<string, string> {
  const core = resolveCheckoutMetadataCore(args.catalogPrice);
  const metadata: Record<string, string> = {
    supabase_user_id: args.userId,
    forge_user_id: args.userId,
    forge_product: FORGE_PRODUCT_ID,
    forge_purchase_type: core.purchaseType,
    forge_item_id: core.itemId,
    forge_interval: core.interval,
    forge_version: FORGE_METADATA_VERSION,
  };

  switch (args.catalogPrice.kind) {
    case "plan":
      metadata.forge_plan_id = args.catalogPrice.planId;
      break;
    case "addon":
      metadata.forge_addon = args.catalogPrice.addonId;
      break;
    case "pack":
      metadata.forge_pack_type = args.catalogPrice.packType;
      metadata.forge_pack_id = args.catalogPrice.packId;
      break;
    case "storage":
      metadata.forge_storage_level = args.catalogPrice.storageLevel;
      break;
  }

  return metadata;
}

export function parseForgePurchaseMetadata(args: {
  metadata: Record<string, unknown> | Stripe.Metadata | null | undefined;
  mode?: string | null;
  allowLegacyFallback?: boolean;
}): ForgePurchaseMetadata {
  const mode = normalizeString(args.mode);
  const product = readMetadataString(args.metadata, "forge_product");
  if (product !== FORGE_PRODUCT_ID) {
    throw new Error(
      `Invalid forge_product metadata: expected ${FORGE_PRODUCT_ID}, received ${product ?? "missing"}`,
    );
  }

  const supabaseUserId = readMetadataString(args.metadata, "supabase_user_id");
  if (!supabaseUserId) {
    throw new Error("Missing required metadata: supabase_user_id");
  }

  const purchaseType = readMetadataString(args.metadata, "forge_purchase_type");
  const itemId = readMetadataString(args.metadata, "forge_item_id");
  const interval = readMetadataString(args.metadata, "forge_interval");
  const version = readMetadataString(args.metadata, "forge_version");
  const hasCanonicalFields = purchaseType !== null
    || itemId !== null
    || interval !== null
    || version !== null;

  if (
    purchaseType && itemId && interval && version === FORGE_METADATA_VERSION
    && isForgePurchaseType(purchaseType)
    && isForgePurchaseInterval(interval)
  ) {
    const canonical = {
      supabaseUserId,
      purchaseType,
      itemId,
      interval,
      version: FORGE_METADATA_VERSION,
      source: "canonical" as const,
    };
    validatePurchaseCombination(canonical, mode);
    return canonical;
  }

  if (hasCanonicalFields) {
    throw new Error(
      "Invalid canonical Forge checkout metadata. Expected forge_purchase_type, forge_item_id, forge_interval, forge_version=v1.",
    );
  }

  if (!args.allowLegacyFallback) {
    throw new Error(
      "Missing required metadata: forge_purchase_type, forge_item_id, forge_interval, forge_version",
    );
  }

  const inferredPurchaseType = inferLegacyPurchaseType(args.metadata);
  const inferredItemId = inferLegacyItemId(args.metadata);
  const inferredInterval = readMetadataString(args.metadata, "forge_interval");

  if (!inferredPurchaseType || !inferredItemId || !inferredInterval) {
    throw new Error(
      "Checkout metadata missing canonical fields and could not be inferred from legacy Forge metadata",
    );
  }

  if (!isForgePurchaseInterval(inferredInterval)) {
    throw new Error(
      `Invalid forge_interval metadata: ${inferredInterval}`,
    );
  }

  const legacy = {
    supabaseUserId,
    purchaseType: inferredPurchaseType,
    itemId: inferredItemId,
    interval: inferredInterval,
    version: FORGE_METADATA_VERSION,
    source: "legacy_compat" as const,
  };
  validatePurchaseCombination(legacy, mode);
  return legacy;
}
