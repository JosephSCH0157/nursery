import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { STRIPE_CATALOG } from "../../../../supabase/functions/_shared/stripe-catalog.ts";
import { supabase, tongsSupabase } from "../lib/supabase";
import type { AppShellContext } from "./AppShell";
import "./Subscriptions.css";

type CheckoutFunctionName =
  | "create-checkout-session"
  | "create-one-time-checkout-session";

type CheckoutSessionResponse = {
  url?: string;
};

type PortalSessionResponse = {
  url?: string;
};

type AiBillingMode = "forge" | "byo" | "unknown";
type StripeCatalogMode = "live" | "test";
type AiPackKey = "base" | "mid" | "high";
type StorageLevel = keyof typeof STRIPE_CATALOG.storage;

type AiPack = {
  key: AiPackKey;
  label: string;
  amountLabel: string;
  tokensLabel: string;
  priceId: string;
};

type StoragePack = {
  level: StorageLevel;
  sizeLabel: string;
  priceLabel: string;
  description: string;
  featured?: boolean;
  priceId: string;
};

type AiCreditsSnapshot = {
  billingMode: AiBillingMode;
  tokenBalance: number | null;
};

type ForgeProfile = {
  user_id: string;
  display_name: string | null;
  tier: string | null;
  stripe_customer_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
};

type AccountBalanceRow = {
  stripe_customer_id: string | null;
  plan_item_id: string | null;
  plan_interval: string | null;
  plan_status: string | null;
  plan_current_period_end: string | null;
  plan_entitled: boolean | null;
  storage_item_id: string | null;
  storage_status: string | null;
  storage_current_period_end: string | null;
  storage_bytes_entitled: number | string | null;
  ai_credit_balance: number | string | null;
};

type AccountBillingOverview = {
  stripeCustomerId: string | null;
  planItemId: string | null;
  planInterval: string | null;
  planStatus: string | null;
  planCurrentPeriodEnd: string | null;
  planEntitled: boolean;
  storageItemId: StorageLevel | null;
  storageStatus: string | null;
  storageCurrentPeriodEnd: string | null;
  storageBytesEntitled: number | null;
  aiCreditBalance: number | null;
};

type ProfilesTableClient = {
  from: SupabaseClient<Database>["from"];
};

type TongsRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type TongsAccountBalanceTableClient = {
  from: (
    relation: "account_balances",
  ) => {
    select: (columns: string) => {
      eq: (
        column: "user_id",
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: AccountBalanceRow | null;
          error: { message?: string; code?: string } | null;
        }>;
      };
    };
  };
};

type TongsBillingClient = TongsRpcClient & TongsAccountBalanceTableClient;

// Canonical Account & Billing reads must stay on the tongs schema.
const tongsBillingDb = tongsSupabase as unknown as TongsBillingClient;
const BASE_PLAN_STORAGE_BYTES = 500 * 1024 * 1024 * 1024;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLowerString(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function readWindowConfig(key: string): string {
  const globalWindow = (typeof window !== "undefined" ? window : {}) as typeof window & Record<string, unknown>;
  return normalizeString(globalWindow[key]);
}

function isLocalRuntimeHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = normalizeLowerString(window.location.hostname);
  return host === "localhost"
    || host === "127.0.0.1"
    || host === "::1"
    || host.endsWith(".local");
}

function allowLiveStripeInLocalRuntime(metaEnv: Record<string, unknown>): boolean {
  return normalizeLowerString(metaEnv.VITE_STRIPE_ALLOW_LIVE_IN_LOCAL) === "true";
}

function getConfiguredStripeMode(): StripeCatalogMode {
  const meta = (typeof import.meta !== "undefined" ? import.meta : {}) as ImportMeta & {
    env?: Record<string, unknown>;
  };
  const metaEnv = meta.env ?? {};
  const configured = normalizeLowerString(
    readWindowConfig("__forgeStripeMode") || metaEnv.VITE_STRIPE_MODE,
  );
  const allowLiveInLocalRuntime = allowLiveStripeInLocalRuntime(metaEnv);

  if (isLocalRuntimeHost() && configured === "live" && !allowLiveInLocalRuntime) {
    return "test";
  }

  if (configured === "test") return "test";
  if (configured === "live") return "live";
  return metaEnv.DEV ? "test" : "live";
}

function getCatalogPriceId(entry: { livePriceId: string; testPriceId: string }): string {
  return getConfiguredStripeMode() === "test" ? entry.testPriceId : entry.livePriceId;
}

function getConfiguredPlanPriceId(): string {
  const meta = (typeof import.meta !== "undefined" ? import.meta : {}) as ImportMeta & {
    env?: Record<string, unknown>;
  };
  const metaEnv = meta.env ?? {};
  return String(
    readWindowConfig("__forgeCreatorMonthlyPriceId")
      || metaEnv.VITE_STRIPE_CREATOR_MONTHLY_PRICE_ID
      || metaEnv.VITE_STRIPE_PRICE_ID
      || getCatalogPriceId(STRIPE_CATALOG.plans.creator.monthly),
  ).trim();
}

function getConfiguredAiPriceId(key: AiPackKey): string {
  const meta = (typeof import.meta !== "undefined" ? import.meta : {}) as ImportMeta & {
    env?: Record<string, unknown>;
  };
  const metaEnv = meta.env ?? {};
  const envKey = key === "base"
    ? metaEnv.VITE_STRIPE_AI_PRICE_ID_BASE
    : key === "mid"
    ? metaEnv.VITE_STRIPE_AI_PRICE_ID_MID
    : metaEnv.VITE_STRIPE_AI_PRICE_ID_HIGH;
  const catalogPrice = key === "base"
    ? STRIPE_CATALOG.packs.ai_credits.ai_small
    : key === "mid"
    ? STRIPE_CATALOG.packs.ai_credits.ai_medium
    : STRIPE_CATALOG.packs.ai_credits.ai_large;

  return String(
    readWindowConfig(`__forgeAiPriceId_${key}`)
      || envKey
      || getCatalogPriceId(catalogPrice),
  ).trim();
}

function getConfiguredStoragePriceId(level: StorageLevel): string {
  const meta = (typeof import.meta !== "undefined" ? import.meta : {}) as ImportMeta & {
    env?: Record<string, unknown>;
  };
  const metaEnv = meta.env ?? {};
  const forceTestCatalogPrice = isLocalRuntimeHost() && !allowLiveStripeInLocalRuntime(metaEnv);

  // In local development, do not allow live storage price overrides by default.
  if (forceTestCatalogPrice) {
    return STRIPE_CATALOG.storage[level].testPriceId;
  }

  const envKey = level === "50gb"
    ? metaEnv.VITE_STRIPE_STORAGE_PRICE_ID_50GB
    : level === "100gb"
    ? metaEnv.VITE_STRIPE_STORAGE_PRICE_ID_100GB
    : metaEnv.VITE_STRIPE_STORAGE_PRICE_ID_1TB;

  return String(
    readWindowConfig(`__forgeStoragePriceId_${level}`)
      || envKey
      || getCatalogPriceId(STRIPE_CATALOG.storage[level]),
  ).trim();
}

function getConfiguredAiPacks(): AiPack[] {
  return [
    {
      key: "base",
      label: "AI Base",
      amountLabel: "$10",
      tokensLabel: "1,000,000",
      priceId: getConfiguredAiPriceId("base"),
    },
    {
      key: "mid",
      label: "AI Mid",
      amountLabel: "$25",
      tokensLabel: "3,000,000",
      priceId: getConfiguredAiPriceId("mid"),
    },
    {
      key: "high",
      label: "AI High",
      amountLabel: "$50",
      tokensLabel: "7,000,000",
      priceId: getConfiguredAiPriceId("high"),
    },
  ];
}

function getConfiguredStoragePacks(): StoragePack[] {
  return [
    {
      level: "50gb",
      sizeLabel: "+250 GB",
      priceLabel: "$9/month",
      description: "Starter boost",
      priceId: getConfiguredStoragePriceId("50gb"),
    },
    {
      level: "100gb",
      sizeLabel: "+1 TB",
      priceLabel: "$24/month",
      description: "Most popular",
      featured: true,
      priceId: getConfiguredStoragePriceId("100gb"),
    },
    {
      level: "1tb",
      sizeLabel: "+5 TB",
      priceLabel: "$79/month",
      description: "Studio-scale storage",
      priceId: getConfiguredStoragePriceId("1tb"),
    },
  ];
}

function getFounderAccessLabel(tier: string | null | undefined): string | null {
  const normalized = normalizeLowerString(tier);
  if (!normalized) return null;
  if (normalized === "founder") return "Founder";
  if (
    normalized === "founders_club"
    || normalized === "founders club"
    || normalized === "founder's club"
  ) {
    return "Founder's Club";
  }
  return null;
}

function billingStatusEntitlesAccess(status: string | null | undefined): boolean {
  const normalized = normalizeLowerString(status);
  return normalized === "active" || normalized === "trialing";
}

function getCheckoutStatus(search: string): "success" | "canceled" | null {
  const params = new URLSearchParams(search);
  const raw = params.get("checkout");
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "success") return "success";
  if (value === "canceled") return "canceled";
  return null;
}

function getCheckoutStatusMessage(search: string): string | null {
  const checkoutStatus = getCheckoutStatus(search);
  if (checkoutStatus === "success") return "Thanks. Your billing update is processing.";
  if (checkoutStatus === "canceled") return "Checkout canceled.";
  const params = new URLSearchParams(search);
  if (params.has("session_id")) return "Checkout received. Processing...";
  return null;
}

function parseIntegerValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function formatTokenBalance(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return Math.max(0, Math.floor(value)).toLocaleString();
}

function formatStatusLabel(value: string | null | undefined): string {
  const normalized = normalizeLowerString(value);
  if (!normalized) return "--";
  return normalized
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatPlanLabel(value: string | null | undefined): string {
  const normalized = normalizeLowerString(value);
  if (!normalized || normalized === "free") return "Free";
  if (normalized === "creator") return "Creator";
  if (normalized === "studio") return "Studio";
  if (normalized === "seat") return "Seat Add-on";
  if (normalized === "admin") return "Admin";
  const founderLabel = getFounderAccessLabel(normalized);
  if (founderLabel) return founderLabel;
  return formatStatusLabel(normalized);
}

function isStorageLevel(value: string): value is StorageLevel {
  return value === "50gb" || value === "100gb" || value === "1tb";
}

function formatStorageLabel(value: string | null | undefined): string {
  const normalized = normalizeLowerString(value);
  if (!normalized) return "No storage add-on";
  if (normalized === "50gb") return "50 GB";
  if (normalized === "100gb") return "100 GB";
  if (normalized === "1tb") return "1 TB";
  return formatStatusLabel(normalized);
}

function formatIntervalLabel(value: string | null | undefined): string {
  const normalized = normalizeLowerString(value);
  if (!normalized) return "--";
  if (normalized === "monthly") return "Monthly";
  if (normalized === "quarterly") return "Quarterly";
  if (normalized === "one_time") return "One-time";
  return formatStatusLabel(normalized);
}

function formatDateLabel(value: string | null | undefined): string {
  const normalized = normalizeString(value);
  if (!normalized) return "--";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatByteCount(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "--";
  if (value === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let next = value;
  let unitIndex = 0;

  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }

  const rounded = next >= 100 || unitIndex === 0 ? next.toFixed(0) : next.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

function formatAiBillingModeLabel(mode: AiBillingMode | null | undefined): string {
  if (mode === "forge") return "Forge-managed";
  if (mode === "byo") return "BYO";
  return "Unknown";
}

function buildAvatarUrl(user: User | null): string {
  if (!user) return "";
  return normalizeString(
    user.user_metadata?.avatar_url
      || user.user_metadata?.picture
      || user.user_metadata?.avatar,
  );
}

function buildInitials(displayName: string, email: string | null | undefined): string {
  const source = normalizeString(displayName) || normalizeString(email) || "F";
  const words = source
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const initials = words.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials || "F";
}

async function ensureUserProfile(user: User): Promise<ForgeProfile> {
  const profilesClient = supabase as unknown as ProfilesTableClient;

  const { data: profile, error: profileError } = await profilesClient
    .from("profiles")
    .select("user_id, display_name, tier, stripe_customer_id, subscription_status, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile) {
    return profile as ForgeProfile;
  }

  if (profileError && (profileError as { code?: string }).code !== "PGRST116") {
    throw profileError;
  }

  const defaultDisplay = normalizeString(user.user_metadata?.full_name)
    || normalizeString(user.email)
    || "New user";

  const { data: inserted, error: insertError } = await profilesClient
    .from("profiles")
    .insert({
      user_id: user.id,
      display_name: defaultDisplay,
      tier: "free",
    })
    .select("user_id, display_name, tier, stripe_customer_id, subscription_status, current_period_end")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      const { data: existing, error: refetchError } = await profilesClient
        .from("profiles")
        .select("user_id, display_name, tier, stripe_customer_id, subscription_status, current_period_end")
        .eq("user_id", user.id)
        .single();
      if (refetchError) throw refetchError;
      return existing as ForgeProfile;
    }
    throw insertError;
  }

  return inserted as ForgeProfile;
}

async function fetchCanonicalAccountOverview(userId: string): Promise<AccountBillingOverview | null> {
  const { data, error } = await tongsBillingDb
    .from("account_balances")
    .select([
      "stripe_customer_id",
      "plan_item_id",
      "plan_interval",
      "plan_status",
      "plan_current_period_end",
      "plan_entitled",
      "storage_item_id",
      "storage_status",
      "storage_current_period_end",
      "storage_bytes_entitled",
      "ai_credit_balance",
    ].join(", "))
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load account billing overview.");
  }

  if (!data) return null;

  const rawStorageItemId = normalizeLowerString(data.storage_item_id);

  return {
    stripeCustomerId: normalizeString(data.stripe_customer_id) || null,
    planItemId: normalizeLowerString(data.plan_item_id) || null,
    planInterval: normalizeLowerString(data.plan_interval) || null,
    planStatus: normalizeLowerString(data.plan_status) || null,
    planCurrentPeriodEnd: normalizeString(data.plan_current_period_end) || null,
    planEntitled: Boolean(data.plan_entitled),
    storageItemId: isStorageLevel(rawStorageItemId) ? rawStorageItemId : null,
    storageStatus: normalizeLowerString(data.storage_status) || null,
    storageCurrentPeriodEnd: normalizeString(data.storage_current_period_end) || null,
    storageBytesEntitled: parseIntegerValue(data.storage_bytes_entitled),
    aiCreditBalance: parseIntegerValue(data.ai_credit_balance),
  };
}

async function fetchAiCreditsSnapshot(): Promise<AiCreditsSnapshot> {
  const { data, error } = await tongsBillingDb.rpc("get_my_ai_credits");
  if (error) {
    throw new Error(error.message || "Failed to load AI credits state.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const rawMode = normalizeLowerString(row?.billing_mode);
  const billingMode: AiBillingMode = rawMode === "forge" || rawMode === "byo"
    ? rawMode
    : "unknown";

  return {
    billingMode,
    tokenBalance: parseIntegerValue(row?.token_balance),
  };
}

function buildReturnUrl(): string {
  const currentUrl = new URL(window.location.href);
  const params = new URLSearchParams(currentUrl.search);
  params.delete("checkout");
  params.delete("session_id");
  currentUrl.search = params.toString() ? `?${params.toString()}` : "";
  currentUrl.hash = "";
  return currentUrl.toString();
}

function buildCheckoutUrls(): { successUrl: string; cancelUrl: string } {
  const baseUrl = buildReturnUrl();
  const successUrl = new URL(baseUrl);
  successUrl.searchParams.set("checkout", "success");

  const cancelUrl = new URL(baseUrl);
  cancelUrl.searchParams.set("checkout", "canceled");

  return {
    successUrl: successUrl.toString(),
    cancelUrl: cancelUrl.toString(),
  };
}

async function startCheckout(
  priceId: string,
  functionName: CheckoutFunctionName,
): Promise<void> {
  const { successUrl, cancelUrl } = buildCheckoutUrls();
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: {
      price_id: priceId,
      successUrl,
      cancelUrl,
    },
  });

  if (error) throw error;

  const payload = (data || {}) as CheckoutSessionResponse;
  const url = normalizeString(payload.url);
  if (!url) {
    throw new Error("Checkout session missing url.");
  }

  window.location.assign(url);
}

async function startBillingPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke("create-billing-portal-session", {
    body: {
      returnUrl: buildReturnUrl(),
    },
  });

  if (error) throw error;

  const payload = (data || {}) as PortalSessionResponse;
  const url = normalizeString(payload.url);
  if (!url) {
    throw new Error("Billing portal session missing url.");
  }

  window.location.assign(url);
}

export default function SubscriptionsRoute() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const user = shell.session?.user ?? null;
  const checkoutMessage = useMemo(
    () => getCheckoutStatusMessage(location.search),
    [location.search],
  );
  const checkoutStatus = useMemo(
    () => getCheckoutStatus(location.search),
    [location.search],
  );
  const loginHref = useMemo(() => {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
    return `/login?next=${next}`;
  }, [location.hash, location.pathname, location.search]);
  const aiPacks = useMemo(() => getConfiguredAiPacks(), []);
  const storagePacks = useMemo(() => getConfiguredStoragePacks(), []);
  const planPriceId = useMemo(() => getConfiguredPlanPriceId(), []);

  const [profile, setProfile] = useState<ForgeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [accountOverview, setAccountOverview] = useState<AccountBillingOverview | null>(null);
  const [accountOverviewLoading, setAccountOverviewLoading] = useState(false);
  const [accountOverviewError, setAccountOverviewError] = useState<string | null>(null);
  const [aiSnapshot, setAiSnapshot] = useState<AiCreditsSnapshot | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [planPending, setPlanPending] = useState(false);
  const [portalPending, setPortalPending] = useState(false);
  const [pendingPackKey, setPendingPackKey] = useState<AiPackKey | null>(null);
  const [pendingStorageLevel, setPendingStorageLevel] = useState<StorageLevel | null>(null);

  const refreshAccountOverview = useCallback(async () => {
    if (!user) {
      setAccountOverview(null);
      setAccountOverviewError(null);
      setAccountOverviewLoading(false);
      return;
    }

    setAccountOverviewLoading(true);
    try {
      const nextOverview = await fetchCanonicalAccountOverview(user.id);
      setAccountOverview(nextOverview);
      setAccountOverviewError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load billing overview.";
      setAccountOverview(null);
      setAccountOverviewError(message);
    } finally {
      setAccountOverviewLoading(false);
    }
  }, [user]);

  const refreshAiCredits = useCallback(async () => {
    if (!user) {
      setAiSnapshot(null);
      setAiError(null);
      setAiLoading(false);
      return;
    }

    setAiLoading(true);
    try {
      const nextSnapshot = await fetchAiCreditsSnapshot();
      setAiSnapshot(nextSnapshot);
      setAiError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load AI credits.";
      setAiSnapshot(null);
      setAiError(message);
    } finally {
      setAiLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      setAccountOverview(null);
      setAccountOverviewError(null);
      setAccountOverviewLoading(false);
      setAiSnapshot(null);
      setAiError(null);
      setAiLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const nextProfile = await ensureUserProfile(user);
        if (cancelled) return;
        setProfile(nextProfile);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load profile.";
        setProfile(null);
        setProfileError(message);
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    })();

    void refreshAccountOverview();
    void refreshAiCredits();

    return () => {
      cancelled = true;
    };
  }, [refreshAccountOverview, refreshAiCredits, user]);

  useEffect(() => {
    if (checkoutStatus !== "success") return;
    const timer = window.setTimeout(() => {
      void refreshAccountOverview();
      void refreshAiCredits();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [checkoutStatus, refreshAccountOverview, refreshAiCredits]);

  const displayName = normalizeString(profile?.display_name)
    || normalizeString(user?.user_metadata?.full_name)
    || normalizeString(user?.email)
    || "No display name";
  const founderAccessLabel = getFounderAccessLabel(profile?.tier);
  const founderAccessOnly = Boolean(founderAccessLabel && !accountOverview?.planItemId);
  const currentPlanLabel = accountOverview?.planItemId
    ? formatPlanLabel(accountOverview.planItemId)
    : founderAccessLabel
    ? founderAccessLabel
    : formatPlanLabel(profile?.tier);
  const planStatusLabel = accountOverview?.planStatus
    ? formatStatusLabel(accountOverview.planStatus)
    : profile?.subscription_status
    ? formatStatusLabel(profile.subscription_status)
    : founderAccessLabel
    ? "Admin-assigned"
    : currentPlanLabel === "Free"
    ? "No active subscription"
    : "--";
  const planBillingModeLabel = founderAccessLabel
    ? "Admin-assigned"
    : accountOverview?.planInterval
    ? formatIntervalLabel(accountOverview.planInterval)
    : currentPlanLabel === "Free"
    ? "No recurring billing"
    : "--";
  const planPeriodEnd = accountOverview?.planCurrentPeriodEnd || profile?.current_period_end || null;
  const activeStoragePack = storagePacks.find((pack) => pack.level === accountOverview?.storageItemId) ?? null;
  const storageTierLabel = activeStoragePack?.sizeLabel || formatStorageLabel(accountOverview?.storageItemId);
  const storageStatusLabel = accountOverview?.storageStatus
    ? formatStatusLabel(accountOverview.storageStatus)
    : accountOverview?.storageItemId
    ? "Pending"
    : "No storage add-on";
  const storageAddonBytesEntitled = accountOverview?.storageBytesEntitled ?? 0;
  const storageTotalBytesEntitled = BASE_PLAN_STORAGE_BYTES + storageAddonBytesEntitled;
  const storageBytesUsed: number | null = null;
  const storageBytesRemaining = storageBytesUsed == null
    ? null
    : Math.max(0, storageTotalBytesEntitled - storageBytesUsed);
  const aiBalance = accountOverview?.aiCreditBalance ?? aiSnapshot?.tokenBalance ?? null;
  const avatarUrl = buildAvatarUrl(user);
  const avatarInitials = buildInitials(displayName, user?.email);
  const aiLockedReason = !user
    ? "Sign in to manage Forge AI credits."
    : aiLoading
    ? "Loading AI billing mode..."
    : aiSnapshot?.billingMode === "byo"
    ? "Forge AI credits are only available for Forge-managed AI usage. Your workspace is currently in BYO mode."
    : aiError
    ? "Unable to load AI billing mode. Refresh and try again."
    : "";
  const aiLocked = !user || aiLoading || !!aiError || aiSnapshot?.billingMode === "byo";
  const canonicalFallbackNotice = !accountOverviewLoading && !accountOverview && !accountOverviewError
    ? "Some billing details are still syncing. A few fields may be limited until that finishes."
    : null;
  const hasAnyCheckoutNotice = Boolean(checkoutMessage);

  async function handlePlanCheckout(): Promise<void> {
    if (!user || !planPriceId || planPending || founderAccessOnly) return;
    setPlanPending(true);
    setPlanMessage(null);
    try {
      await startCheckout(planPriceId, "create-checkout-session");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout failed.";
      setPlanMessage(`Checkout error: ${message}`);
      setPlanPending(false);
    }
  }

  async function handleStorageCheckout(pack: StoragePack): Promise<void> {
    if (!user || !pack.priceId || pendingStorageLevel) return;
    setPendingStorageLevel(pack.level);
    setStorageMessage(null);
    try {
      await startCheckout(pack.priceId, "create-checkout-session");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout failed.";
      setStorageMessage(`Checkout error: ${message}`);
      setPendingStorageLevel(null);
    }
  }

  async function handleAiCheckout(pack: AiPack): Promise<void> {
    if (!user || aiLocked || !pack.priceId || pendingPackKey) return;
    setPendingPackKey(pack.key);
    setAiMessage(null);
    try {
      await startCheckout(pack.priceId, "create-one-time-checkout-session");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout failed.";
      setAiMessage(`Checkout error: ${message}`);
      setPendingPackKey(null);
    }
  }

  async function handleManageBilling(): Promise<void> {
    if (!user || portalPending) return;
    setPortalPending(true);
    setBillingMessage(null);
    try {
      await startBillingPortal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open billing management.";
      setBillingMessage(`Billing portal error: ${message}`);
      setPortalPending(false);
    }
  }

  return (
    <section className="subscriptions-page">
      <header className="subscriptions-page__header">
        <div>
          <h2 className="subscriptions-page__title">Account &amp; Billing</h2>
          <p className="subscriptions-page__copy">
            Manage your account, subscription, storage, and AI usage in one place.
          </p>
        </div>
      </header>

      {!user ? (
        <article className="subscriptions-card subscriptions-card--notice">
          <h3>Sign in required</h3>
          <p>Sign in to manage your account, subscription, storage, and AI credits.</p>
          <div className="subscriptions-actions">
            <Link className="subscriptions-link-button" to={loginHref}>Sign in</Link>
          </div>
        </article>
      ) : (
        <>
          {hasAnyCheckoutNotice ? (
            <p
              className={`subscriptions-status subscriptions-status--banner ${
                checkoutStatus === "canceled"
                  ? "subscriptions-status--info"
                  : "subscriptions-status--success"
              }`}
            >
              {checkoutMessage}
            </p>
          ) : null}
          {accountOverviewError ? (
            <p className="subscriptions-status subscriptions-status--banner subscriptions-status--error">
              Live billing details are unavailable right now. Some fields may fall back to older account data until sync recovers. {accountOverviewError}
            </p>
          ) : null}
          {canonicalFallbackNotice ? (
            <p className="subscriptions-status subscriptions-status--banner subscriptions-status--info">
              {canonicalFallbackNotice}
            </p>
          ) : null}

          <div className="subscriptions-grid">
            <article className="subscriptions-card">
              <h3>Account</h3>
              <div className="subscriptions-account-header">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="subscriptions-avatar"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="subscriptions-avatar subscriptions-avatar--fallback" aria-hidden="true">
                    {avatarInitials}
                  </div>
                )}
                <div className="subscriptions-account-meta">
                  <strong>{profileLoading ? "Loading..." : displayName}</strong>
                  <span>{user.email || "No email"}</span>
                </div>
              </div>

              <dl className="subscriptions-facts">
                <div>
                  <dt>Email</dt>
                  <dd>{user.email || "No email"}</dd>
                </div>
                <div>
                  <dt>Display name</dt>
                  <dd>{profileLoading ? "Loading..." : displayName}</dd>
                </div>
                <div>
                  <dt>Profile actions</dt>
                  <dd>Editing and password tools are landing here soon.</dd>
                </div>
              </dl>

              <div className="subscriptions-actions">
                <button type="button" className="subscriptions-button subscriptions-button--ghost" disabled>
                  Edit profile
                </button>
                <button type="button" className="subscriptions-button subscriptions-button--ghost" disabled>
                  Password settings
                </button>
              </div>

              {profileError ? <p className="subscriptions-status subscriptions-status--error">{profileError}</p> : null}
            </article>

            <article className="subscriptions-card">
              <h3>Plan</h3>
              <p className="subscriptions-card__copy">
                Review your current plan, renewal timing, and billing access here.
              </p>

              <dl className="subscriptions-facts subscriptions-facts--compact">
                <div>
                  <dt>Current plan</dt>
                  <dd>{accountOverviewLoading ? "Loading..." : currentPlanLabel}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{accountOverviewLoading ? "Loading..." : planStatusLabel}</dd>
                </div>
                <div>
                  <dt>Billing mode</dt>
                  <dd>{accountOverviewLoading ? "Loading..." : planBillingModeLabel}</dd>
                </div>
                <div>
                  <dt>Renewal</dt>
                  <dd>{accountOverviewLoading ? "Loading..." : formatDateLabel(planPeriodEnd)}</dd>
                </div>
                {founderAccessLabel ? (
                  <div>
                    <dt>Founder access</dt>
                    <dd>{founderAccessLabel}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="subscriptions-actions">
                {!founderAccessOnly ? (
                  <button
                    type="button"
                    className="subscriptions-button"
                    disabled={!planPriceId || planPending}
                    onClick={() => void handlePlanCheckout()}
                  >
                    {planPending
                      ? "Redirecting..."
                      : accountOverview?.planEntitled
                      ? "Change plan"
                      : "Upgrade plan"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="subscriptions-button subscriptions-button--secondary"
                  disabled={portalPending}
                  onClick={() => void handleManageBilling()}
                >
                  {portalPending ? "Opening..." : "Manage Billing"}
                </button>
              </div>

              {founderAccessOnly ? (
                <p className="subscriptions-status subscriptions-status--info">
                  Founder access is admin-assigned.
                </p>
              ) : null}
              {!planPriceId && !founderAccessOnly ? (
                <p className="subscriptions-status subscriptions-status--error">
                  Billing is not configured in this environment.
                </p>
              ) : null}
              {planMessage ? <p className="subscriptions-status subscriptions-status--error">{planMessage}</p> : null}
            </article>

            <article className="subscriptions-card subscriptions-card--wide">
              <h3>Storage</h3>
              <p className="subscriptions-card__copy">
                Only one storage add-on can be active at a time. Total storage equals base plan storage plus your selected add-on.
              </p>

              <dl className="subscriptions-facts subscriptions-facts--compact">
                <div>
                  <dt>Total storage entitlement</dt>
                  <dd>{accountOverviewLoading ? "Loading..." : formatByteCount(storageTotalBytesEntitled)}</dd>
                </div>
                <div>
                  <dt>Base plan storage</dt>
                  <dd>{formatByteCount(BASE_PLAN_STORAGE_BYTES)} included</dd>
                </div>
                <div>
                  <dt>Storage add-on</dt>
                  <dd>{accountOverviewLoading ? "Loading..." : storageTierLabel}</dd>
                </div>
                <div>
                  <dt>Add-on status</dt>
                  <dd>{accountOverviewLoading ? "Loading..." : storageStatusLabel}</dd>
                </div>
                <div>
                  <dt>Add-on entitlement</dt>
                  <dd>{accountOverviewLoading ? "Loading..." : formatByteCount(storageAddonBytesEntitled)}</dd>
                </div>
                <div>
                  <dt>Storage used</dt>
                  <dd>{storageBytesUsed == null ? "Not yet surfaced" : formatByteCount(storageBytesUsed)}</dd>
                </div>
                <div>
                  <dt>Storage remaining</dt>
                  <dd>{storageBytesRemaining == null ? "Not yet surfaced" : formatByteCount(storageBytesRemaining)}</dd>
                </div>
                <div>
                  <dt>Current period end</dt>
                  <dd>{accountOverviewLoading ? "Loading..." : formatDateLabel(accountOverview?.storageCurrentPeriodEnd)}</dd>
                </div>
              </dl>

              <div className="subscriptions-storage-ladder">
                {storagePacks.map((pack) => {
                  const isCurrentTier = accountOverview?.storageItemId === pack.level
                    && billingStatusEntitlesAccess(accountOverview?.storageStatus);
                  const actionLabel = isCurrentTier
                    ? "Active"
                    : accountOverview?.storageItemId
                    ? "Change add-on"
                    : "Add storage";

                  return (
                    <article
                      key={pack.level}
                      className={`subscriptions-storage-tier${pack.featured ? " subscriptions-storage-tier--featured" : ""}`}
                    >
                      <div className="subscriptions-storage-tier__header">
                        <div>
                          <strong>{pack.sizeLabel}</strong>
                          <p>{pack.description}</p>
                        </div>
                        {isCurrentTier ? (
                          <span className="subscriptions-storage-tier__badge">Active</span>
                        ) : pack.featured ? (
                          <span className="subscriptions-storage-tier__badge subscriptions-storage-tier__badge--popular">
                            Most popular
                          </span>
                        ) : null}
                      </div>
                      <div className="subscriptions-storage-tier__price">{pack.priceLabel}</div>
                      <button
                        type="button"
                        className={`subscriptions-button${pack.featured ? " subscriptions-button--featured" : ""}`}
                        disabled={!pack.priceId || pendingStorageLevel !== null || isCurrentTier}
                        onClick={() => void handleStorageCheckout(pack)}
                      >
                        {pendingStorageLevel === pack.level ? "Redirecting..." : actionLabel}
                      </button>
                    </article>
                  );
                })}
              </div>

              {storagePacks.some((pack) => !pack.priceId) ? (
                <p className="subscriptions-status subscriptions-status--error">
                  One or more storage price IDs are not configured.
                </p>
              ) : null}
              {storageMessage ? <p className="subscriptions-status subscriptions-status--error">{storageMessage}</p> : null}
            </article>

            <article className="subscriptions-card subscriptions-card--wide">
              <h3>AI Credits</h3>
              <p className="subscriptions-card__copy">
                Add credits for Forge-managed AI usage without leaving this account hub.
              </p>

              <div className="subscriptions-pack-row">
                {aiPacks.map((pack) => (
                  <button
                    key={pack.key}
                    type="button"
                    className="subscriptions-button"
                    disabled={aiLocked || !pack.priceId || pendingPackKey !== null}
                    onClick={() => void handleAiCheckout(pack)}
                  >
                    {pendingPackKey === pack.key
                      ? "Redirecting..."
                      : `Add ${pack.amountLabel} (${pack.tokensLabel} credits)`}
                  </button>
                ))}
              </div>

              <dl className="subscriptions-facts subscriptions-facts--compact">
                <div>
                  <dt>Current balance</dt>
                  <dd>{aiLoading ? "Loading..." : `${formatTokenBalance(aiBalance)} credits`}</dd>
                </div>
                <div>
                  <dt>Billing mode</dt>
                  <dd>{aiLoading ? "Loading..." : formatAiBillingModeLabel(aiSnapshot?.billingMode)}</dd>
                </div>
              </dl>

              {aiLockedReason ? (
                <p className="subscriptions-status subscriptions-status--info">{aiLockedReason}</p>
              ) : null}
              {aiPacks.some((pack) => !pack.priceId) ? (
                <p className="subscriptions-status subscriptions-status--error">
                  One or more AI credit pack price IDs are not configured.
                </p>
              ) : null}
              {aiMessage ? <p className="subscriptions-status subscriptions-status--error">{aiMessage}</p> : null}
            </article>

            <article className="subscriptions-card">
              <h3>Billing Actions</h3>
              <p className="subscriptions-card__copy">
                Use the Stripe billing portal for subscription changes, invoices, and payment methods.
              </p>

              <div className="subscriptions-actions">
                <button
                  type="button"
                  className="subscriptions-button subscriptions-button--secondary"
                  disabled={portalPending}
                  onClick={() => void handleManageBilling()}
                >
                  {portalPending ? "Opening..." : "Manage Billing"}
                </button>
              </div>

              <p className="subscriptions-status subscriptions-status--info">
                More invoice and payment actions can live here as they are surfaced.
              </p>
              {billingMessage ? <p className="subscriptions-status subscriptions-status--error">{billingMessage}</p> : null}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
