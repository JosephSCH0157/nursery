type StripeCatalogIds = {
  liveProductId: string;
  testProductId: string;
  livePriceId: string;
  testPriceId: string;
};

type StripePlanInterval = "monthly" | "quarterly";
type StripeAddonInterval = "monthly";
type StripePackInterval = "one_time";
type StripeStorageInterval = "monthly";
type StripePlanId = "creator" | "studio";
type StripeAddonId = "seat";
type StripePackType = "ai_credits";
type StripePackId = "ai_small" | "ai_medium" | "ai_large";
type StripeStorageLevel = "50gb" | "100gb" | "1tb";
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

export const STRIPE_CATALOG = {
  plans: {
    creator: {
      monthly: {
        planId: "creator",
        interval: "monthly",
        liveProductId: "prod_TncbKTaecCg24w",
        testProductId: "prod_U5Xbk4zVfJjRek",
        livePriceId: "price_1Sq1M01OSG3CCNl80iaTXKeJ",
        testPriceId: "price_1T7MWa1OSG3CCNl8tAtHR2LY",
      },
      quarterly: {
        planId: "creator",
        interval: "quarterly",
        liveProductId: "prod_TncbKTaecCg24w",
        testProductId: "prod_U5Xbk4zVfJjRek",
        livePriceId: "price_1Sq1M01OSG3CCNl8x3ASWmgD",
        testPriceId: "price_1T83sY1OSG3CCNl8f1hdNE9t",
      },
    },
    studio: {
      monthly: {
        planId: "studio",
        interval: "monthly",
        liveProductId: "prod_U6EufezDArpNZf",
        testProductId: "prod_U6GWcVFIxtKbTM",
        livePriceId: "price_1T82QU1OSG3CCNl8k4DHCfm9",
        testPriceId: "price_1T83zY1OSG3CCNl8Jm4YkLHh",
      },
    },
  },
  addons: {
    seat: {
      monthly: {
        addonId: "seat",
        interval: "monthly",
        liveProductId: "prod_U6Ezc4QSolhaRr",
        testProductId: "prod_U6GXQcPOfqcky3",
        livePriceId: "price_1T82V41OSG3CCNl89yqb9B4j",
        testPriceId: "price_1T84071OSG3CCNl8n1X4wY8R",
      },
    },
  },
  packs: {
    ai_credits: {
      ai_small: {
        packType: "ai_credits",
        packId: "ai_small",
        interval: "one_time",
        // Token amounts are inferred from the existing Forge AI pack mapping already in repo.
        tokenAmount: 1_000_000,
        liveProductId: "prod_U5TpXdkVfZtwDh",
        testProductId: "prod_TndF1ENQTGet4Q",
        livePriceId: "price_1T7Iry1OSG3CCNl8VQ86l8Ff",
        testPriceId: "price_1T7MSt1OSG3CCNl8p7bTPKE8",
      },
      ai_medium: {
        packType: "ai_credits",
        packId: "ai_medium",
        interval: "one_time",
        tokenAmount: 3_000_000,
        liveProductId: "prod_U5TpXdkVfZtwDh",
        testProductId: "prod_TndF1ENQTGet4Q",
        livePriceId: "price_1T7Iry1OSG3CCNl8Oo8Myfhw",
        testPriceId: "price_1Sq1zI1OSG3CCNl8w823S5rR",
      },
      ai_large: {
        packType: "ai_credits",
        packId: "ai_large",
        interval: "one_time",
        tokenAmount: 7_000_000,
        liveProductId: "prod_U5TpXdkVfZtwDh",
        testProductId: "prod_TndF1ENQTGet4Q",
        livePriceId: "price_1T7Iry1OSG3CCNl8QjxT3OiY",
        testPriceId: "price_1T83vg1OSG3CCNl8MQMqUTR0",
      },
    },
  },
  storage: {
    "50gb": {
      storageLevel: "50gb",
      interval: "monthly",
      liveProductId: "prod_U7SAHtH1OMlkTh",
      testProductId: "prod_U7RzELyWyE9APS",
      livePriceId: "price_1T9DGO1OSG3CCNl8epUVy5e5",
      testPriceId: "price_1T9D5M1OSG3CCNl8IU9GVtUL",
    },
    "100gb": {
      storageLevel: "100gb",
      interval: "monthly",
      liveProductId: "prod_U7SAHtH1OMlkTh",
      testProductId: "prod_U7RzELyWyE9APS",
      livePriceId: "price_1T9DKG1OSG3CCNl8cXriaTZQ",
      testPriceId: "price_1T9D9J1OSG3CCNl8w8nwqQ21",
    },
    "1tb": {
      storageLevel: "1tb",
      interval: "monthly",
      liveProductId: "prod_U7SAHtH1OMlkTh",
      testProductId: "prod_U7RzELyWyE9APS",
      livePriceId: "price_1T9DKG1OSG3CCNl89UguaE0u",
      testPriceId: "price_1T9D9J1OSG3CCNl8m1d9vlrc",
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
      index.set(entry.livePriceId, { kind: "plan", ...entry });
      index.set(entry.testPriceId, { kind: "plan", ...entry });
    }
  }

  for (const intervals of Object.values(STRIPE_CATALOG.addons)) {
    for (const entry of Object.values(intervals)) {
      index.set(entry.livePriceId, { kind: "addon", ...entry });
      index.set(entry.testPriceId, { kind: "addon", ...entry });
    }
  }

  for (const packs of Object.values(STRIPE_CATALOG.packs)) {
    for (const entry of Object.values(packs)) {
      index.set(entry.livePriceId, { kind: "pack", ...entry });
      index.set(entry.testPriceId, { kind: "pack", ...entry });
    }
  }

  for (const entry of Object.values(STRIPE_CATALOG.storage)) {
    index.set(entry.livePriceId, { kind: "storage", ...entry });
    index.set(entry.testPriceId, { kind: "storage", ...entry });
  }

  return index;
})();

const STRIPE_CATALOG_AI_PACK_INDEX = (() => {
  const index = new Map<string, StripePackCatalogEntry>();
  for (const entry of Object.values(STRIPE_CATALOG.packs.ai_credits)) {
    index.set(entry.packId, entry);
  }
  return index;
})();

export function findStripeCatalogPriceById(
  priceId: unknown,
): StripeCatalogPriceMatch | null {
  const normalized = normalizeCatalogKey(priceId);
  if (!normalized) return null;
  return STRIPE_CATALOG_PRICE_INDEX.get(normalized) ?? null;
}

export function findStripeCatalogAiPackById(
  packId: unknown,
): StripePackCatalogEntry | null {
  const normalized = normalizeCatalogKey(packId);
  if (!normalized) return null;
  return STRIPE_CATALOG_AI_PACK_INDEX.get(normalized) ?? null;
}
