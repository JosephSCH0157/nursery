type StripeCatalogIds = {
  offerId: string;
  liveProductId: string;
  testProductId: string;
  livePriceId: string;
  testPriceId: string;
  legacyLiveProductIds?: readonly string[];
  legacyTestProductIds?: readonly string[];
  legacyLivePriceIds?: readonly string[];
  legacyTestPriceIds?: readonly string[];
};

type StripePlanInterval = "monthly" | "quarterly";
type StripeAddonInterval = "monthly" | "quarterly";
type StripePackInterval = "one_time";
type StripeStorageInterval = "monthly";
type StripePlanId = "creator" | "pro" | "studio";
type StripeAddonId = "seat";
type StripePackType = "ai_credits";
type StripePackId = "ai_small" | "ai_medium" | "ai_large";
type StripeStorageLevel =
  | "50gb"
  | "100gb"
  | "1tb"
  | "50gb_v2"
  | "150gb"
  | "500gb";
type StripeCouponId = "founders_50";
type StripeCouponScope = "plans_only";
type StripeCouponDuration = "forever";

type StripePlanCatalogEntry = StripeCatalogIds & {
  planId: StripePlanId;
  interval: StripePlanInterval;
};

type StripeAddonCatalogEntry = StripeCatalogIds & {
  addonId: StripeAddonId;
  interval: StripeAddonInterval;
};

type StripePackCatalogEntry = StripeCatalogIds & {
  packType: StripePackType;
  packId: StripePackId;
  interval: StripePackInterval;
  tokenAmount: number;
  legacyPackAliases?: readonly string[];
};

type StripeStorageCatalogEntry = StripeCatalogIds & {
  storageLevel: StripeStorageLevel;
  interval: StripeStorageInterval;
};

type StripeCouponCatalogEntry = {
  couponId: StripeCouponId;
  scope: StripeCouponScope;
  percentOff: number;
  duration: StripeCouponDuration;
};

function collectCatalogPriceIds(entry: StripeCatalogIds): string[] {
  return [
    entry.livePriceId,
    entry.testPriceId,
    ...(entry.legacyLivePriceIds ?? []),
    ...(entry.legacyTestPriceIds ?? []),
  ];
}

function collectCatalogProductIds(entry: StripeCatalogIds): string[] {
  return [
    entry.liveProductId,
    entry.testProductId,
    ...(entry.legacyLiveProductIds ?? []),
    ...(entry.legacyTestProductIds ?? []),
  ];
}

export const STRIPE_CATALOG = {
  plans: {
    creator: {
      monthly: {
        offerId: "forge_creator_monthly",
        planId: "creator",
        interval: "monthly",
        liveProductId: "prod_UFw2TGwvLz1ezQ",
        testProductId: "prod_UFwW5GdpDxpvSs",
        livePriceId: "price_1THR9h1OSG3CCNl8faJxd3FP",
        testPriceId: "price_1THQeN1OSG3CCNl8MHVMvIbG",
        // Legacy grouped product/price IDs retained for compatibility.
        legacyLiveProductIds: ["prod_TncbKTaecCg24w"],
        legacyTestProductIds: ["prod_U5Xbk4zVfJjRek"],
        legacyLivePriceIds: ["price_1Sq1M01OSG3CCNl80iaTXKeJ"],
        legacyTestPriceIds: ["price_1T7MWa1OSG3CCNl8tAtHR2LY"],
      },
      quarterly: {
        offerId: "forge_creator_quarterly",
        planId: "creator",
        interval: "quarterly",
        liveProductId: "prod_UFw2hGWtTWT59p",
        testProductId: "prod_UFwWWQqvDM9gyS",
        livePriceId: "price_1THR9i1OSG3CCNl8V7i38kxn",
        testPriceId: "price_1THQeO1OSG3CCNl8cmNiQP8R",
        // Legacy grouped product/price IDs retained for compatibility.
        legacyLiveProductIds: ["prod_TncbKTaecCg24w"],
        legacyTestProductIds: ["prod_U5Xbk4zVfJjRek"],
        legacyLivePriceIds: ["price_1Sq1M01OSG3CCNl8x3ASWmgD"],
        legacyTestPriceIds: ["price_1T83sY1OSG3CCNl8f1hdNE9t"],
      },
    },
    pro: {
      monthly: {
        offerId: "forge_pro_monthly",
        planId: "pro",
        interval: "monthly",
        liveProductId: "prod_UFx32SCZeDcaFW",
        testProductId: "prod_UFwjHGme9StMrO",
        livePriceId: "price_1THR9j1OSG3CCNl8DsdcO4vf",
        testPriceId: "price_1THQqY1OSG3CCNl8w3VJk1qd",
      },
      quarterly: {
        offerId: "forge_pro_quarterly",
        planId: "pro",
        interval: "quarterly",
        liveProductId: "prod_UFx3EDPxaMIMiU",
        testProductId: "prod_UFwjt2XWlB8kEk",
        livePriceId: "price_1THR9k1OSG3CCNl8a2tpqxMo",
        testPriceId: "price_1THQqa1OSG3CCNl8CHxd7bDP",
      },
    },
    studio: {
      monthly: {
        offerId: "forge_studio_monthly",
        planId: "studio",
        interval: "monthly",
        liveProductId: "prod_UFw2dprDuPSHUa",
        testProductId: "prod_UFwWpoKG7TRY83",
        livePriceId: "price_1THR9l1OSG3CCNl8RFVTkfXF",
        testPriceId: "price_1THQeP1OSG3CCNl82c9OoMFt",
        // Legacy grouped product/price IDs retained for compatibility.
        legacyLiveProductIds: ["prod_U6EufezDArpNZf"],
        legacyTestProductIds: ["prod_U6GWcVFIxtKbTM"],
        legacyLivePriceIds: ["price_1T82QU1OSG3CCNl8k4DHCfm9"],
        legacyTestPriceIds: ["price_1T83zY1OSG3CCNl8Jm4YkLHh"],
      },
      quarterly: {
        offerId: "forge_studio_quarterly",
        planId: "studio",
        interval: "quarterly",
        liveProductId: "prod_UFx3okRn0WtGS0",
        testProductId: "prod_UFwmspdkv5rXmp",
        livePriceId: "price_1THR9m1OSG3CCNl8sqzDcNrp",
        testPriceId: "price_1THQsj1OSG3CCNl8lEPGsK1v",
      },
    },
  },
  addons: {
    seat: {
      monthly: {
        offerId: "forge_addon_seat_monthly",
        addonId: "seat",
        interval: "monthly",
        liveProductId: "prod_UFw2bmzm1gt0rY",
        testProductId: "prod_UFwWUP1wNcL1LZ",
        livePriceId: "price_1THR9n1OSG3CCNl8cORcIkxC",
        testPriceId: "price_1THQeQ1OSG3CCNl8zuDBu5rs",
        // Legacy grouped product/price IDs retained for compatibility.
        legacyLiveProductIds: ["prod_U6Ezc4QSolhaRr"],
        legacyTestProductIds: ["prod_U6GXQcPOfqcky3"],
        legacyLivePriceIds: ["price_1T82V41OSG3CCNl89yqb9B4j"],
        legacyTestPriceIds: ["price_1T84071OSG3CCNl8n1X4wY8R"],
      },
      quarterly: {
        offerId: "forge_addon_seat_quarterly",
        addonId: "seat",
        interval: "quarterly",
        liveProductId: "prod_UFx3eaBYU7BANu",
        testProductId: "prod_UFwmKEgTP2jQeO",
        livePriceId: "price_1THR9o1OSG3CCNl8GCAAHU1F",
        testPriceId: "price_1THQsk1OSG3CCNl87K8KXFmQ",
      },
    },
  },
  packs: {
    ai_credits: {
      ai_small: {
        offerId: "forge_ai_credits_2000",
        packType: "ai_credits",
        packId: "ai_small",
        interval: "one_time",
        tokenAmount: 2_000,
        liveProductId: "prod_UFw2TIryedKAqv",
        testProductId: "prod_UFwW61glKzQWEO",
        livePriceId: "price_1THR9p1OSG3CCNl89Pm2J7BR",
        testPriceId: "price_1THQeR1OSG3CCNl8YajEHCL8",
        // Legacy grouped product/price IDs retained for compatibility.
        legacyLiveProductIds: ["prod_U5TpXdkVfZtwDh"],
        legacyTestProductIds: ["prod_TndF1ENQTGet4Q"],
        legacyLivePriceIds: ["price_1T7Iry1OSG3CCNl8VQ86l8Ff"],
        legacyTestPriceIds: ["price_1T7MSt1OSG3CCNl8p7bTPKE8"],
        legacyPackAliases: ["forge_ai_credits_2000"],
      },
      ai_medium: {
        offerId: "forge_ai_credits_6000",
        packType: "ai_credits",
        packId: "ai_medium",
        interval: "one_time",
        tokenAmount: 6_000,
        liveProductId: "prod_UFw2Enfc7CgIsd",
        testProductId: "prod_UFwWSwnxAMF7S8",
        livePriceId: "price_1THR9q1OSG3CCNl8IKWwVQLY",
        testPriceId: "price_1THQeT1OSG3CCNl8aEXhSrGx",
        // Legacy grouped product/price IDs retained for compatibility.
        legacyLiveProductIds: ["prod_U5TpXdkVfZtwDh"],
        legacyTestProductIds: ["prod_TndF1ENQTGet4Q"],
        legacyLivePriceIds: ["price_1T7Iry1OSG3CCNl8Oo8Myfhw"],
        legacyTestPriceIds: ["price_1Sq1zI1OSG3CCNl8w823S5rR"],
        legacyPackAliases: ["forge_ai_credits_6000"],
      },
      ai_large: {
        offerId: "forge_ai_credits_15000",
        packType: "ai_credits",
        packId: "ai_large",
        interval: "one_time",
        tokenAmount: 15_000,
        liveProductId: "prod_UFw2NvKZbPGj9Q",
        testProductId: "prod_UFwWVhvFehtYC2",
        livePriceId: "price_1THR9q1OSG3CCNl8KnKj1lHI",
        testPriceId: "price_1THQeV1OSG3CCNl8XJJv7vvT",
        // Legacy grouped product/price IDs retained for compatibility.
        legacyLiveProductIds: ["prod_U5TpXdkVfZtwDh"],
        legacyTestProductIds: ["prod_TndF1ENQTGet4Q"],
        legacyLivePriceIds: ["price_1T7Iry1OSG3CCNl8QjxT3OiY"],
        legacyTestPriceIds: ["price_1T83vg1OSG3CCNl8MQMqUTR0"],
        legacyPackAliases: ["forge_ai_credits_15000"],
      },
    },
  },
  storage: {
    // Legacy storage ladder entries retained for webhook/backfill compatibility.
    "50gb": {
      offerId: "forge_storage_legacy_250gb",
      storageLevel: "50gb",
      interval: "monthly",
      liveProductId: "prod_U7SAHtH1OMlkTh",
      testProductId: "prod_U7RzELyWyE9APS",
      livePriceId: "price_1T9DGO1OSG3CCNl8epUVy5e5",
      testPriceId: "price_1T9D5M1OSG3CCNl8IU9GVtUL",
    },
    "100gb": {
      offerId: "forge_storage_legacy_1tb",
      storageLevel: "100gb",
      interval: "monthly",
      liveProductId: "prod_U7SAHtH1OMlkTh",
      testProductId: "prod_U7RzELyWyE9APS",
      livePriceId: "price_1T9DKG1OSG3CCNl8cXriaTZQ",
      testPriceId: "price_1T9D9J1OSG3CCNl8w8nwqQ21",
    },
    "1tb": {
      offerId: "forge_storage_legacy_5tb",
      storageLevel: "1tb",
      interval: "monthly",
      liveProductId: "prod_U7SAHtH1OMlkTh",
      testProductId: "prod_U7RzELyWyE9APS",
      livePriceId: "price_1T9DKG1OSG3CCNl89UguaE0u",
      testPriceId: "price_1T9D9J1OSG3CCNl8m1d9vlrc",
    },
    // New explicit one-product-per-offer storage ladder.
    "50gb_v2": {
      offerId: "forge_storage_50gb",
      storageLevel: "50gb_v2",
      interval: "monthly",
      liveProductId: "prod_UFw2YJ6a4Ks7rQ",
      testProductId: "prod_UFwW0QUSUgTyV8",
      livePriceId: "price_1THR9r1OSG3CCNl8pzjejaet",
      testPriceId: "price_1THQiC1OSG3CCNl8KMwHQFQU",
      legacyLiveProductIds: ["prod_UFw2YJ6a4Ks7rQ"],
      legacyTestProductIds: ["prod_UFwW0QUSUgTyV8"],
      legacyLivePriceIds: ["price_1THR9r1OSG3CCNl8pzjejaet"],
      // Preserve earlier one-time storage pack price IDs for compatibility only.
      legacyTestPriceIds: ["price_1THQeW1OSG3CCNl86xKEUga3"],
    },
    "150gb": {
      offerId: "forge_storage_150gb",
      storageLevel: "150gb",
      interval: "monthly",
      liveProductId: "prod_UFw2wxuzLwaGDg",
      testProductId: "prod_UFwWplSyzDWtG7",
      livePriceId: "price_1THR9s1OSG3CCNl8xkIWxXb9",
      testPriceId: "price_1THQiD1OSG3CCNl8Krar9qOv",
      legacyLiveProductIds: ["prod_UFw2wxuzLwaGDg"],
      legacyTestProductIds: ["prod_UFwWplSyzDWtG7"],
      legacyLivePriceIds: ["price_1THR9s1OSG3CCNl8xkIWxXb9"],
      // Preserve earlier one-time storage pack price IDs for compatibility only.
      legacyTestPriceIds: ["price_1THQeX1OSG3CCNl8oAIRsqws"],
    },
    "500gb": {
      offerId: "forge_storage_500gb",
      storageLevel: "500gb",
      interval: "monthly",
      liveProductId: "prod_UFw2ppJXQevjkQ",
      testProductId: "prod_UFwWI0YdAoLb3z",
      livePriceId: "price_1THR9t1OSG3CCNl8i4uhB3Ng",
      testPriceId: "price_1THQiE1OSG3CCNl87lJEVjIO",
      legacyLiveProductIds: ["prod_UFw2ppJXQevjkQ"],
      legacyTestProductIds: ["prod_UFwWI0YdAoLb3z"],
      legacyLivePriceIds: ["price_1THR9t1OSG3CCNl8i4uhB3Ng"],
      // Preserve earlier one-time storage pack price IDs for compatibility only.
      legacyTestPriceIds: ["price_1THQeY1OSG3CCNl8kAEzuDKB"],
    },
  },
  coupons: {
    founders_50: {
      couponId: "founders_50",
      scope: "plans_only",
      percentOff: 50,
      duration: "forever",
    },
  },
} as const satisfies {
  plans: Record<string, Record<string, StripePlanCatalogEntry>>;
  addons: Record<string, Record<string, StripeAddonCatalogEntry>>;
  packs: Record<string, Record<string, StripePackCatalogEntry>>;
  storage: Record<string, StripeStorageCatalogEntry>;
  coupons: Record<string, StripeCouponCatalogEntry>;
};

export type StripeCatalog = typeof STRIPE_CATALOG;

export type StripeCatalogPriceMatch =
  | ({ kind: "plan" } & StripePlanCatalogEntry)
  | ({ kind: "addon" } & StripeAddonCatalogEntry)
  | ({ kind: "pack" } & StripePackCatalogEntry)
  | ({ kind: "storage" } & StripeStorageCatalogEntry);

function normalizeCatalogKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const STRIPE_CATALOG_PRICE_INDEX = (() => {
  const index = new Map<string, StripeCatalogPriceMatch>();

  for (const intervals of Object.values(STRIPE_CATALOG.plans)) {
    for (const entry of Object.values(intervals)) {
      for (const priceId of collectCatalogPriceIds(entry)) {
        index.set(priceId, { kind: "plan", ...entry });
      }
    }
  }

  for (const intervals of Object.values(STRIPE_CATALOG.addons)) {
    for (const entry of Object.values(intervals)) {
      for (const priceId of collectCatalogPriceIds(entry)) {
        index.set(priceId, { kind: "addon", ...entry });
      }
    }
  }

  for (const packs of Object.values(STRIPE_CATALOG.packs)) {
    for (const entry of Object.values(packs)) {
      for (const priceId of collectCatalogPriceIds(entry)) {
        index.set(priceId, { kind: "pack", ...entry });
      }
    }
  }

  for (const entry of Object.values(STRIPE_CATALOG.storage)) {
    for (const priceId of collectCatalogPriceIds(entry)) {
      index.set(priceId, { kind: "storage", ...entry });
    }
  }

  return index;
})();

const STRIPE_CATALOG_PRODUCT_INDEX = (() => {
  const index = new Map<string, StripeCatalogPriceMatch[]>();

  function push(entry: StripeCatalogPriceMatch): void {
    for (const productId of collectCatalogProductIds(entry)) {
      const existing = index.get(productId) ?? [];
      existing.push(entry);
      index.set(productId, existing);
    }
  }

  for (const intervals of Object.values(STRIPE_CATALOG.plans)) {
    for (const entry of Object.values(intervals)) {
      push({ kind: "plan", ...entry });
    }
  }

  for (const intervals of Object.values(STRIPE_CATALOG.addons)) {
    for (const entry of Object.values(intervals)) {
      push({ kind: "addon", ...entry });
    }
  }

  for (const packs of Object.values(STRIPE_CATALOG.packs)) {
    for (const entry of Object.values(packs)) {
      push({ kind: "pack", ...entry });
    }
  }

  for (const entry of Object.values(STRIPE_CATALOG.storage)) {
    push({ kind: "storage", ...entry });
  }

  return index;
})();

const STRIPE_CATALOG_AI_PACK_INDEX = (() => {
  const index = new Map<string, StripePackCatalogEntry>();
  for (const entry of Object.values(STRIPE_CATALOG.packs.ai_credits)) {
    index.set(entry.packId, entry);
    index.set(entry.offerId, entry);
    for (const alias of entry.legacyPackAliases ?? []) {
      index.set(alias, entry);
    }
  }
  return index;
})();

export function stripeCatalogEntryHasProductId(
  entry: StripeCatalogIds,
  productId: unknown,
): boolean {
  const normalized = normalizeCatalogKey(productId);
  if (!normalized) return false;
  return collectCatalogProductIds(entry).includes(normalized);
}

export function findStripeCatalogPriceById(
  priceId: unknown,
): StripeCatalogPriceMatch | null {
  const normalized = normalizeCatalogKey(priceId);
  if (!normalized) return null;
  return STRIPE_CATALOG_PRICE_INDEX.get(normalized) ?? null;
}

export function findStripeCatalogPriceByProductId(
  productId: unknown,
): StripeCatalogPriceMatch | null {
  const normalized = normalizeCatalogKey(productId);
  if (!normalized) return null;

  const matches = STRIPE_CATALOG_PRODUCT_INDEX.get(normalized) ?? [];
  if (matches.length !== 1) return null;
  return matches[0] ?? null;
}

export function findStripeCatalogAiPackById(
  packId: unknown,
): StripePackCatalogEntry | null {
  const normalized = normalizeCatalogKey(packId);
  if (!normalized) return null;
  return STRIPE_CATALOG_AI_PACK_INDEX.get(normalized) ?? null;
}

