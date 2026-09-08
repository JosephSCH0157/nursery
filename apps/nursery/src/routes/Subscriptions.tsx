import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
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
type PlanKey = "creator" | "pro" | "studio";
type PlanInterval = "monthly" | "quarterly";
type StorageLevel = keyof typeof STRIPE_CATALOG.storage;

type PlanChoice = {
  key: PlanKey;
  interval: PlanInterval;
  offerId: string;
  label: string;
  description: string;
  includedCreditsLabel: string;
  priceId: string;
};

type AiPack = {
  key: AiPackKey;
  offerId: string;
  label: string;
  amountLabel: string;
  tokensLabel: string;
  priceId: string;
};

type StoragePack = {
  level: StorageLevel;
  offerId: string;
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

type TestBillingDeposit = {
  deposit_id: string;
  pack_id: string;
  currency: string;
  gross_amount_micros: number;
  credit_units: number;
  received_at: string;
  label: "Stripe Test";
};

type TestBillingReceipt = {
  operation_id: string;
  customer_charge_micros: number;
  outcome: string;
  settled_at: string;
  execution_kind: "simulated_test";
};

type TestBillingSnapshot = {
  contract_version: "forge.customer-test-billing.v1";
  stripe_mode: "test";
  test_credit_balance: number;
  live_provider_eligible: false;
  live_revenue: false;
  deposits: TestBillingDeposit[];
  receipts: TestBillingReceipt[];
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

function isConfiguredPriceId(priceId: string): boolean {
  const normalized = normalizeString(priceId);
  if (!normalized) return false;
  return !/(^price_.*_todo$|_todo$|not_configured|todo)/i.test(normalized);
}

function getConfiguredPlanPriceId(plan: PlanKey, interval: PlanInterval): string {
  const meta = (typeof import.meta !== "undefined" ? import.meta : {}) as ImportMeta & {
    env?: Record<string, unknown>;
  };
  const metaEnv = meta.env ?? {};

  if (plan === "creator") {
    return String(
      readWindowConfig(`__forgeCreator${interval === "monthly" ? "Monthly" : "Quarterly"}PriceId`)
        || (interval === "monthly"
          ? metaEnv.VITE_STRIPE_CREATOR_MONTHLY_PRICE_ID
          : metaEnv.VITE_STRIPE_CREATOR_QUARTERLY_PRICE_ID)
        || metaEnv.VITE_STRIPE_PRICE_ID
        || getCatalogPriceId(
          interval === "monthly"
            ? STRIPE_CATALOG.plans.creator.monthly
            : STRIPE_CATALOG.plans.creator.quarterly,
        ),
    ).trim();
  }

  if (plan === "pro") {
    return String(
      readWindowConfig(`__forgePro${interval === "monthly" ? "Monthly" : "Quarterly"}PriceId`)
        || (interval === "monthly"
          ? metaEnv.VITE_STRIPE_PRO_MONTHLY_PRICE_ID
          : metaEnv.VITE_STRIPE_PRO_QUARTERLY_PRICE_ID)
        || getCatalogPriceId(
          interval === "monthly"
            ? STRIPE_CATALOG.plans.pro.monthly
            : STRIPE_CATALOG.plans.pro.quarterly,
        ),
    ).trim();
  }

  return String(
    readWindowConfig(`__forgeStudio${interval === "monthly" ? "Monthly" : "Quarterly"}PriceId`)
      || (interval === "monthly"
        ? metaEnv.VITE_STRIPE_STUDIO_MONTHLY_PRICE_ID
        : metaEnv.VITE_STRIPE_STUDIO_QUARTERLY_PRICE_ID)
      || getCatalogPriceId(
        interval === "monthly"
          ? STRIPE_CATALOG.plans.studio.monthly
          : STRIPE_CATALOG.plans.studio.quarterly,
      ),
  ).trim();
}

function getConfiguredPlanChoices(): PlanChoice[] {
  return [
    {
      key: "creator",
      interval: "monthly",
      offerId: STRIPE_CATALOG.plans.creator.monthly.offerId,
      label: "Creator Monthly",
      description: "Paid individual plan for solo creators.",
      includedCreditsLabel: "1,000 included monthly credits",
      priceId: getConfiguredPlanPriceId("creator", "monthly"),
    },
    {
      key: "creator",
      interval: "quarterly",
      offerId: STRIPE_CATALOG.plans.creator.quarterly.offerId,
      label: "Creator Quarterly",
      description: "Paid individual plan for solo creators.",
      includedCreditsLabel: "1,000 included monthly credits",
      priceId: getConfiguredPlanPriceId("creator", "quarterly"),
    },
    {
      key: "pro",
      interval: "monthly",
      offerId: STRIPE_CATALOG.plans.pro.monthly.offerId,
      label: "Pro Monthly",
      description: "Advanced individual plan with higher monthly AI inclusion.",
      includedCreditsLabel: "4,000 included monthly credits",
      priceId: getConfiguredPlanPriceId("pro", "monthly"),
    },
    {
      key: "pro",
      interval: "quarterly",
      offerId: STRIPE_CATALOG.plans.pro.quarterly.offerId,
      label: "Pro Quarterly",
      description: "Advanced individual plan with higher monthly AI inclusion.",
      includedCreditsLabel: "4,000 included monthly credits",
      priceId: getConfiguredPlanPriceId("pro", "quarterly"),
    },
    {
      key: "studio",
      interval: "monthly",
      offerId: STRIPE_CATALOG.plans.studio.monthly.offerId,
      label: "Studio Monthly",
      description: "Team and organization tier.",
      includedCreditsLabel: "10,000 included monthly credits (shared)",
      priceId: getConfiguredPlanPriceId("studio", "monthly"),
    },
    {
      key: "studio",
      interval: "quarterly",
      offerId: STRIPE_CATALOG.plans.studio.quarterly.offerId,
      label: "Studio Quarterly",
      description: "Team and organization tier.",
      includedCreditsLabel: "10,000 included monthly credits (shared)",
      priceId: getConfiguredPlanPriceId("studio", "quarterly"),
    },
  ];
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

  const envKey = level === "50gb_v2"
    ? metaEnv.VITE_STRIPE_STORAGE_PRICE_ID_50GB
    : level === "150gb"
    ? metaEnv.VITE_STRIPE_STORAGE_PRICE_ID_150GB
    : level === "500gb"
    ? metaEnv.VITE_STRIPE_STORAGE_PRICE_ID_500GB
    : level === "50gb"
    ? metaEnv.VITE_STRIPE_STORAGE_PRICE_ID_250GB_LEGACY
    : level === "100gb"
    ? metaEnv.VITE_STRIPE_STORAGE_PRICE_ID_1TB_LEGACY
    : metaEnv.VITE_STRIPE_STORAGE_PRICE_ID_5TB_LEGACY;

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
      offerId: STRIPE_CATALOG.packs.ai_credits.ai_small.offerId,
      label: "AI Credits 2,000",
      amountLabel: "$10",
      tokensLabel: "2,000",
      priceId: getConfiguredAiPriceId("base"),
    },
    {
      key: "mid",
      offerId: STRIPE_CATALOG.packs.ai_credits.ai_medium.offerId,
      label: "AI Credits 6,000",
      amountLabel: "$25",
      tokensLabel: "6,000",
      priceId: getConfiguredAiPriceId("mid"),
    },
    {
      key: "high",
      offerId: STRIPE_CATALOG.packs.ai_credits.ai_large.offerId,
      label: "AI Credits 15,000",
      amountLabel: "$50",
      tokensLabel: "15,000",
      priceId: getConfiguredAiPriceId("high"),
    },
  ];
}

function getConfiguredStoragePacks(): StoragePack[] {
  return [
    {
      level: "50gb_v2",
      offerId: STRIPE_CATALOG.storage["50gb_v2"].offerId,
      sizeLabel: "+50 GB",
      priceLabel: "$5/month",
      description: "Stackable monthly recurring add-on",
      priceId: getConfiguredStoragePriceId("50gb_v2"),
    },
    {
      level: "150gb",
      offerId: STRIPE_CATALOG.storage["150gb"].offerId,
      sizeLabel: "+150 GB",
      priceLabel: "$10/month",
      description: "Most popular monthly recurring add-on",
      featured: true,
      priceId: getConfiguredStoragePriceId("150gb"),
    },
    {
      level: "500gb",
      offerId: STRIPE_CATALOG.storage["500gb"].offerId,
      sizeLabel: "+500 GB",
      priceLabel: "$20/month",
      description: "Large monthly recurring add-on",
      priceId: getConfiguredStoragePriceId("500gb"),
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
  if (normalized === "pro") return "Pro";
  if (normalized === "studio") return "Studio";
  if (normalized === "seat") return "Seat Add-on";
  if (normalized === "admin") return "Admin";
  const founderLabel = getFounderAccessLabel(normalized);
  if (founderLabel) return founderLabel;
  return formatStatusLabel(normalized);
}

function isStorageLevel(value: string): value is StorageLevel {
  return value in STRIPE_CATALOG.storage;
}

function formatStorageLabel(value: string | null | undefined): string {
  const normalized = normalizeLowerString(value);
  if (!normalized) return "No storage add-on";
  if (normalized === "50gb") return "Legacy 250 GB";
  if (normalized === "100gb") return "Legacy 1 TB";
  if (normalized === "1tb") return "Legacy 5 TB";
  if (normalized === "50gb_v2") return "50 GB";
  if (normalized === "150gb") return "150 GB";
  if (normalized === "500gb") return "500 GB";
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
  const profilesClient = supabase;

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

async function updateProfileDisplayName(
  user: User,
  displayName: string,
): Promise<ForgeProfile> {
  const profilesClient = supabase;
  const normalizedDisplayName = normalizeString(displayName);

  const { data, error } = await profilesClient
    .from("profiles")
    .update({
      display_name: normalizedDisplayName || null,
    })
    .eq("user_id", user.id)
    .select("user_id, display_name, tier, stripe_customer_id, subscription_status, current_period_end")
    .single();

  if (error) throw error;
  return data as ForgeProfile;
}

function getPasswordUpdateErrorMessage(message: string): string {
  const normalized = normalizeLowerString(message);
  if (
    normalized.includes("auth session missing")
    || normalized.includes("invalid jwt")
    || normalized.includes("jwt expired")
    || normalized.includes("refresh token not found")
  ) {
    return "Your session expired. Sign in again, then retry password update.";
  }

  if (
    normalized.includes("reauthentication required")
    || normalized.includes("requires reauthentication")
    || normalized.includes("recent login required")
  ) {
    return "Password update requires email verification. Send a verification code below, then enter it to continue.";
  }

  return message || "Unable to update password.";
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

async function fetchTestBillingSnapshot(userId: string): Promise<TestBillingSnapshot> {
  const { data, error } = await tongsBillingDb.rpc("read_customer_test_billing", { p_user_id: userId });
  if (error) throw new Error(error.message || "Failed to load Stripe Test funding.");
  return data as TestBillingSnapshot;
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
  const planChoices = useMemo(() => getConfiguredPlanChoices(), []);

  const [profile, setProfile] = useState<ForgeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileDraftName, setProfileDraftName] = useState("");
  const [profileSavePending, setProfileSavePending] = useState(false);
  const [profileSaveNotice, setProfileSaveNotice] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordConfirmDraft, setPasswordConfirmDraft] = useState("");
  const [passwordUpdatePending, setPasswordUpdatePending] = useState(false);
  const [passwordUpdateNotice, setPasswordUpdateNotice] = useState<string | null>(null);
  const [passwordUpdateError, setPasswordUpdateError] = useState<string | null>(null);
  const [passwordReauthCode, setPasswordReauthCode] = useState("");
  const [passwordReauthPending, setPasswordReauthPending] = useState(false);
  const [passwordReauthRequested, setPasswordReauthRequested] = useState(false);
  const [accountOverview, setAccountOverview] = useState<AccountBillingOverview | null>(null);
  const [accountOverviewLoading, setAccountOverviewLoading] = useState(false);
  const [accountOverviewError, setAccountOverviewError] = useState<string | null>(null);
  const [aiSnapshot, setAiSnapshot] = useState<AiCreditsSnapshot | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [testBilling, setTestBilling] = useState<TestBillingSnapshot | null>(null);
  const [testBillingLoading, setTestBillingLoading] = useState(false);
  const [testBillingError, setTestBillingError] = useState<string | null>(null);
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

  const refreshTestBilling = useCallback(async () => {
    if (!user) {
      setTestBilling(null);
      setTestBillingError(null);
      setTestBillingLoading(false);
      return;
    }
    setTestBillingLoading(true);
    try {
      setTestBilling(await fetchTestBillingSnapshot(user.id));
      setTestBillingError(null);
    } catch (error) {
      setTestBilling(null);
      setTestBillingError(error instanceof Error ? error.message : "Failed to load Stripe Test funding.");
    } finally {
      setTestBillingLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      setProfileEditOpen(false);
      setProfileDraftName("");
      setProfileSavePending(false);
      setProfileSaveNotice(null);
      setProfileSaveError(null);
      setPasswordFormOpen(false);
      setPasswordDraft("");
      setPasswordConfirmDraft("");
      setPasswordUpdatePending(false);
      setPasswordUpdateNotice(null);
      setPasswordUpdateError(null);
      setAccountOverview(null);
      setAccountOverviewError(null);
      setAccountOverviewLoading(false);
      setAiSnapshot(null);
      setAiError(null);
      setAiLoading(false);
      setTestBilling(null);
      setTestBillingError(null);
      setTestBillingLoading(false);
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
    void refreshTestBilling();

    return () => {
      cancelled = true;
    };
  }, [refreshAccountOverview, refreshAiCredits, refreshTestBilling, user]);

  useEffect(() => {
    if (checkoutStatus !== "success") return;
    const timer = window.setTimeout(() => {
      void refreshAccountOverview();
      void refreshAiCredits();
      void refreshTestBilling();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [checkoutStatus, refreshAccountOverview, refreshAiCredits, refreshTestBilling]);

  useEffect(() => {
    if (profileEditOpen) return;
    const nextDraft = normalizeString(profile?.display_name)
      || normalizeString(user?.user_metadata?.full_name)
      || "";
    setProfileDraftName(nextDraft);
  }, [profile?.display_name, profileEditOpen, user?.user_metadata?.full_name]);

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
  const selectedPlanChoice = planChoices.find((choice) =>
    choice.key === (accountOverview?.planItemId ?? "")
    && choice.interval === (accountOverview?.planInterval === "quarterly" ? "quarterly" : "monthly")
  );
  const aiBalance = accountOverview?.aiCreditBalance ?? aiSnapshot?.tokenBalance ?? null;
  const avatarUrl = buildAvatarUrl(user);
  const avatarInitials = buildInitials(displayName, user?.email);
  const aiAccessEligible = Boolean(accountOverview?.planEntitled || founderAccessLabel);
  const aiLockedReason = !user
    ? "Sign in to manage Forge AI credits."
    : accountOverviewLoading
    ? "Loading membership entitlement..."
    : !aiAccessEligible
    ? "Active Creator, Pro, Studio, or Founder membership is required for AI access (including BYO lane)."
    : aiLoading
    ? "Loading AI billing mode..."
    : aiError
    ? "Unable to load AI billing mode. Refresh and try again."
    : "";
  const aiLocked = !user || accountOverviewLoading || !aiAccessEligible || aiLoading || !!aiError;
  const canonicalFallbackNotice = !accountOverviewLoading && !accountOverview && !accountOverviewError
    ? "Some billing details are still syncing. A few fields may be limited until that finishes."
    : null;
  const hasAnyCheckoutNotice = Boolean(checkoutMessage);

  async function handlePlanCheckout(plan: PlanChoice): Promise<void> {
    if (!user || !isConfiguredPriceId(plan.priceId) || planPending || founderAccessOnly) return;
    setPlanPending(true);
    setPlanMessage(null);
    try {
      await startCheckout(plan.priceId, "create-checkout-session");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout failed.";
      setPlanMessage(`Checkout error: ${message}`);
      setPlanPending(false);
    }
  }

  async function handleStorageCheckout(pack: StoragePack): Promise<void> {
    if (!user || !isConfiguredPriceId(pack.priceId) || pendingStorageLevel) return;
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
    if (!user || aiLocked || !isConfiguredPriceId(pack.priceId) || pendingPackKey) return;
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

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!user || profileSavePending) return;

    const nextDisplayName = normalizeString(profileDraftName);
    if (!nextDisplayName) {
      setProfileSaveError("Display name is required.");
      setProfileSaveNotice(null);
      return;
    }

    if (nextDisplayName === normalizeString(profile?.display_name)) {
      setProfileSaveNotice("No profile changes to save.");
      setProfileSaveError(null);
      return;
    }

    setProfileSavePending(true);
    setProfileSaveNotice(null);
    setProfileSaveError(null);

    try {
      const updated = await updateProfileDisplayName(user, nextDisplayName);
      setProfile(updated);

      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: {
          full_name: nextDisplayName,
          display_name: nextDisplayName,
        },
      });

      if (authUpdateError) {
        setProfileSaveNotice(
          "Profile saved. Session metadata will refresh after next sign-in.",
        );
      } else {
        setProfileSaveNotice("Profile updated.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save profile.";
      setProfileSaveError(message);
    } finally {
      setProfileSavePending(false);
    }
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!user || passwordUpdatePending) return;

    const nextPassword = passwordDraft.trim();
    const confirmPassword = passwordConfirmDraft.trim();

    if (!nextPassword) {
      setPasswordUpdateError("Enter a new password.");
      setPasswordUpdateNotice(null);
      return;
    }

    if (nextPassword.length < 8) {
      setPasswordUpdateError("Use at least 8 characters.");
      setPasswordUpdateNotice(null);
      return;
    }

    if (nextPassword !== confirmPassword) {
      setPasswordUpdateError("Passwords do not match.");
      setPasswordUpdateNotice(null);
      return;
    }

    setPasswordUpdatePending(true);
    setPasswordUpdateNotice(null);
    setPasswordUpdateError(null);

    try {
      const { data: sessionResult } = await supabase.auth.getSession();
      if (!sessionResult.session) {
        setPasswordUpdateError("Your session expired. Sign in again, then retry.");
        return;
      }

      const nonce = passwordReauthCode.trim();
      const { error } = await supabase.auth.updateUser({
        password: nextPassword,
        ...(nonce ? { nonce } : {}),
      });
      if (error) {
        setPasswordUpdateError(getPasswordUpdateErrorMessage(error.message));
        return;
      }

      setPasswordDraft("");
      setPasswordConfirmDraft("");
      setPasswordReauthCode("");
      setPasswordReauthRequested(false);
      setPasswordUpdateNotice("Password updated. A security notification will be sent to your account email.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update password.";
      setPasswordUpdateError(getPasswordUpdateErrorMessage(message));
    } finally {
      setPasswordUpdatePending(false);
    }
  }

  async function handleSendPasswordReauthentication(): Promise<void> {
    if (!user || passwordReauthPending) return;
    setPasswordReauthPending(true);
    setPasswordUpdateNotice(null);
    setPasswordUpdateError(null);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) {
        setPasswordUpdateError(getPasswordUpdateErrorMessage(error.message));
        return;
      }
      setPasswordReauthRequested(true);
      setPasswordUpdateNotice("Verification email sent. Enter the code from that email below.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send verification email.";
      setPasswordUpdateError(getPasswordUpdateErrorMessage(message));
    } finally {
      setPasswordReauthPending(false);
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
                  <dd>Use the forms below to update your profile and password.</dd>
                </div>
              </dl>

              <div className="subscriptions-actions">
                <button
                  type="button"
                  className="subscriptions-button subscriptions-button--ghost"
                  onClick={() => {
                    setProfileEditOpen((open) => !open);
                    setProfileSaveNotice(null);
                    setProfileSaveError(null);
                  }}
                >
                  {profileEditOpen ? "Close profile editor" : "Edit profile"}
                </button>
                <button
                  type="button"
                  className="subscriptions-button subscriptions-button--ghost"
                  onClick={() => {
                    setPasswordFormOpen((open) => !open);
                    setPasswordUpdateNotice(null);
                    setPasswordUpdateError(null);
                  }}
                >
                  {passwordFormOpen ? "Cancel password change" : "Change password"}
                </button>
              </div>

              {profileEditOpen ? (
                <form className="subscriptions-inline-form" onSubmit={(event) => void handleSaveProfile(event)}>
                  <label className="subscriptions-inline-form__field">
                    <span>Display name</span>
                    <input
                      type="text"
                      value={profileDraftName}
                      onChange={(event) => setProfileDraftName(event.target.value)}
                      maxLength={120}
                      autoComplete="name"
                      placeholder="Display name"
                      disabled={profileSavePending}
                    />
                  </label>
                  <div className="subscriptions-inline-form__actions">
                    <button
                      type="submit"
                      className="subscriptions-button subscriptions-button--secondary"
                      disabled={profileSavePending}
                    >
                      {profileSavePending ? "Saving..." : "Save profile"}
                    </button>
                  </div>
                  {profileSaveNotice ? (
                    <p className="subscriptions-status subscriptions-status--success">{profileSaveNotice}</p>
                  ) : null}
                  {profileSaveError ? (
                    <p className="subscriptions-status subscriptions-status--error">{profileSaveError}</p>
                  ) : null}
                </form>
              ) : null}

              {passwordFormOpen ? (
                <form className="subscriptions-inline-form" onSubmit={(event) => void handleUpdatePassword(event)}>
                  <p className="subscriptions-card__copy">
                    Choose a new password with at least 8 characters.
                  </p>
                  <label className="subscriptions-inline-form__field">
                    <span>New password</span>
                    <input
                      type="password"
                      value={passwordDraft}
                      onChange={(event) => setPasswordDraft(event.target.value)}
                      autoComplete="new-password"
                      placeholder="New password"
                      minLength={8}
                      required
                      disabled={passwordUpdatePending}
                    />
                  </label>
                  <label className="subscriptions-inline-form__field">
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={passwordConfirmDraft}
                      onChange={(event) => setPasswordConfirmDraft(event.target.value)}
                      autoComplete="new-password"
                      placeholder="Confirm password"
                      minLength={8}
                      required
                      disabled={passwordUpdatePending}
                    />
                  </label>
                  <div className="subscriptions-inline-form__actions">
                    <button
                      type="submit"
                      className="subscriptions-button subscriptions-button--secondary"
                      disabled={passwordUpdatePending}
                    >
                      {passwordUpdatePending ? "Updating..." : "Update password"}
                    </button>
                  </div>
                  <div className="subscriptions-inline-form__reauth">
                    <p className="subscriptions-card__copy">
                      If Forge asks you to reauthenticate, request a verification code before submitting the password again.
                    </p>
                    <button
                      type="button"
                      className="subscriptions-button subscriptions-button--ghost"
                      disabled={passwordReauthPending}
                      onClick={() => void handleSendPasswordReauthentication()}
                    >
                      {passwordReauthPending ? "Sending..." : passwordReauthRequested ? "Resend verification email" : "Send verification email"}
                    </button>
                    {passwordReauthRequested ? (
                      <label className="subscriptions-inline-form__field">
                        <span>Verification code</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={passwordReauthCode}
                          onChange={(event) => setPasswordReauthCode(event.target.value)}
                          placeholder="Enter the code from your email"
                          disabled={passwordUpdatePending || passwordReauthPending}
                        />
                      </label>
                    ) : null}
                  </div>
                  {passwordUpdateNotice ? (
                    <p className="subscriptions-status subscriptions-status--success" role="status">{passwordUpdateNotice}</p>
                  ) : null}
                  {passwordUpdateError ? (
                    <p className="subscriptions-status subscriptions-status--error" role="alert">{passwordUpdateError}</p>
                  ) : null}
                </form>
              ) : null}

              {profileError ? <p className="subscriptions-status subscriptions-status--error">{profileError}</p> : null}
            </article>

            <article className="subscriptions-card">
              <h3>Plan</h3>
              <p className="subscriptions-card__copy">
                Creator and Pro are paid individual plans. Studio remains the team/org tier. Seat add-ons are billed as explicit Stripe offers in workspace billing flows.
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
                  <>
                    {planChoices.map((plan) => (
                      <button
                        key={`${plan.key}-${plan.interval}`}
                        type="button"
                        className="subscriptions-button"
                        disabled={!isConfiguredPriceId(plan.priceId) || planPending}
                        onClick={() => void handlePlanCheckout(plan)}
                      >
                        {planPending
                          ? "Redirecting..."
                          : `Choose ${plan.label}`}
                      </button>
                    ))}
                  </>
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
              {!selectedPlanChoice ? (
                <p className="subscriptions-status subscriptions-status--info">
                  Included monthly credits: Creator 1,000, Pro 4,000, Studio 10,000 shared.
                </p>
              ) : (
                <p className="subscriptions-status subscriptions-status--info">
                  {selectedPlanChoice.includedCreditsLabel} on each renewal cycle.
                </p>
              )}
              {planChoices.some((plan) => !isConfiguredPriceId(plan.priceId)) && !founderAccessOnly ? (
                <p className="subscriptions-status subscriptions-status--error">
                  One or more plan price IDs are not configured in this environment.
                </p>
              ) : null}
              {planMessage ? <p className="subscriptions-status subscriptions-status--error">{planMessage}</p> : null}
            </article>

            <article className="subscriptions-card subscriptions-card--wide">
              <h3>Storage</h3>
              <p className="subscriptions-card__copy">
                Storage add-ons are stackable and billed monthly. Total storage equals base plan storage plus all active add-ons.
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
                        {pack.featured ? (
                          <span className="subscriptions-storage-tier__badge subscriptions-storage-tier__badge--popular">
                            Most popular
                          </span>
                        ) : null}
                      </div>
                      <div className="subscriptions-storage-tier__price">{pack.priceLabel}</div>
                      <button
                        type="button"
                        className={`subscriptions-button${pack.featured ? " subscriptions-button--featured" : ""}`}
                        disabled={!isConfiguredPriceId(pack.priceId) || pendingStorageLevel !== null}
                        onClick={() => void handleStorageCheckout(pack)}
                      >
                        {pendingStorageLevel === pack.level ? "Redirecting..." : "Add storage"}
                      </button>
                    </article>
                  );
                })}
              </div>

              {storagePacks.some((pack) => !isConfiguredPriceId(pack.priceId)) ? (
                <p className="subscriptions-status subscriptions-status--error">
                  One or more storage price IDs are not configured.
                </p>
              ) : null}
              {storageMessage ? <p className="subscriptions-status subscriptions-status--error">{storageMessage}</p> : null}
            </article>

            <article className="subscriptions-card subscriptions-card--wide">
              <h3>AI Credits</h3>
              <p className="subscriptions-card__copy">
                AI access requires active membership (Creator, Pro, Studio, or Founder), including BYO lane.
              </p>

              <div className="subscriptions-pack-row">
                {aiPacks.map((pack) => (
                  <button
                    key={pack.key}
                    type="button"
                    className="subscriptions-button"
                    disabled={aiLocked || !isConfiguredPriceId(pack.priceId) || pendingPackKey !== null}
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

              <p className="subscriptions-status subscriptions-status--info">
                A completed Live AI Credit purchase becomes eligible for funded Runway operations only after Stripe fee evidence is recorded and a customer price is published and activated. Test receipts and legacy compatibility credits cannot fund a real provider call.
              </p>
              <section aria-label="Stripe Test funding" className="subscriptions-status subscriptions-status--info">
                <strong>Stripe Test funding</strong>
                <p>
                  {testBillingLoading
                    ? "Loading Test activity..."
                    : `${formatTokenBalance(testBilling?.test_credit_balance ?? 0)} Test credits · never eligible for a real provider call or Live revenue.`}
                </p>
                {testBillingError ? <p>Test activity unavailable: {testBillingError}</p> : null}
                {testBilling?.deposits.map((deposit) => (
                  <p key={deposit.deposit_id}>
                    <strong>Test</strong> · {deposit.pack_id.replaceAll("_", " ")} · {formatTokenBalance(deposit.credit_units)} credits · {new Intl.NumberFormat("en-US", { style: "currency", currency: deposit.currency }).format(deposit.gross_amount_micros / 1_000_000)} · {new Date(deposit.received_at).toLocaleString()}
                  </p>
                ))}
                {testBilling?.receipts.map((receipt) => (
                  <p key={receipt.operation_id}>
                    Simulated receipt · {receipt.outcome} · {(receipt.customer_charge_micros / 1_000_000).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </p>
                ))}
              </section>
              <p className="subscriptions-status subscriptions-status--info">
                BYO usage does not consume Forge credits. BYO members still receive included monthly base credits on renewal.
              </p>

              {aiLockedReason ? (
                <p className="subscriptions-status subscriptions-status--info">{aiLockedReason}</p>
              ) : null}
              {aiPacks.some((pack) => !isConfiguredPriceId(pack.priceId)) ? (
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
