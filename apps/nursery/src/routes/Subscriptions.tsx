import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { AppShellContext } from "./AppShell";
import "./Subscriptions.css";

type CheckoutFunctionName =
  | "create-checkout-session"
  | "create-one-time-checkout-session";

type CheckoutSessionResponse = {
  url?: string;
};

type AiBillingMode = "forge" | "byo" | "unknown";

type AiPackKey = "base" | "mid" | "high";

type AiPack = {
  key: AiPackKey;
  label: string;
  amountLabel: string;
  tokensLabel: string;
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
};

type ProfilesTableClient = {
  from: (relation: "profiles") => any;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readWindowConfig(key: string): string {
  const globalWindow = (typeof window !== "undefined" ? window : {}) as typeof window & Record<string, unknown>;
  return normalizeString(globalWindow[key]);
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
      || "",
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
  return String(readWindowConfig(`__forgeAiPriceId_${key}`) || envKey || "").trim();
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

function isFounderTier(tier: string | null | undefined): boolean {
  return normalizeString(tier).toLowerCase() === "founder";
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

function formatTokenBalance(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return Math.max(0, Math.floor(value)).toLocaleString();
}

function parseTokenBalance(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function ensureUserProfile(user: User): Promise<ForgeProfile> {
  const profilesClient = supabase as unknown as ProfilesTableClient;

  const { data: profile, error: profileError } = await profilesClient
    .from("profiles")
    .select("user_id, display_name, tier")
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
    .select("user_id, display_name, tier")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      const { data: existing, error: refetchError } = await profilesClient
        .from("profiles")
        .select("user_id, display_name, tier")
        .eq("user_id", user.id)
        .single();
      if (refetchError) throw refetchError;
      return existing as ForgeProfile;
    }
    throw insertError;
  }

  return inserted as ForgeProfile;
}

async function fetchAiCreditsSnapshot(): Promise<AiCreditsSnapshot> {
  const tongsClient = supabase.schema("tongs") as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  const { data, error } = await tongsClient.rpc("get_my_ai_credits");
  if (error) {
    throw new Error(error.message || "Failed to load AI credits state.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const rawMode = normalizeString(row?.billing_mode);
  const billingMode: AiBillingMode = rawMode === "forge" || rawMode === "byo"
    ? rawMode
    : "unknown";

  return {
    billingMode,
    tokenBalance: parseTokenBalance(row?.token_balance),
  };
}

function buildCheckoutUrls(): { successUrl: string; cancelUrl: string } {
  const currentUrl = new URL(window.location.href);
  const params = new URLSearchParams(currentUrl.search);
  params.delete("checkout");
  params.delete("session_id");
  currentUrl.search = params.toString() ? `?${params.toString()}` : "";
  currentUrl.hash = "";

  const successUrl = new URL(currentUrl.toString());
  successUrl.searchParams.set("checkout", "success");

  const cancelUrl = new URL(currentUrl.toString());
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
  const planPriceId = useMemo(() => getConfiguredPlanPriceId(), []);

  const [profile, setProfile] = useState<ForgeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [aiSnapshot, setAiSnapshot] = useState<AiCreditsSnapshot | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [planPending, setPlanPending] = useState(false);
  const [pendingPackKey, setPendingPackKey] = useState<AiPackKey | null>(null);

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

    void refreshAiCredits();

    return () => {
      cancelled = true;
    };
  }, [refreshAiCredits, user]);

  useEffect(() => {
    if (checkoutStatus !== "success") return;
    const timer = window.setTimeout(() => {
      void refreshAiCredits();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [checkoutStatus, refreshAiCredits]);

  const planTier = normalizeString(profile?.tier) || "free";
  const displayName = normalizeString(profile?.display_name) || "No display name";
  const isFounder = isFounderTier(profile?.tier);
  const aiLockedReason = !user
    ? "Sign in to manage Forge AI tokens."
    : aiLoading
    ? "Loading AI billing mode..."
    : aiSnapshot?.billingMode === "byo"
    ? "Forge AI tokens are only available for Forge-managed AI usage. Your workspace is currently in BYO mode."
    : aiError
    ? "Unable to load AI billing mode. Refresh and try again."
    : "";
  const aiLocked = !user || aiLoading || !!aiError || aiSnapshot?.billingMode === "byo";

  async function handlePlanCheckout(): Promise<void> {
    if (!user || !planPriceId || planPending) return;
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

  return (
    <section className="subscriptions-page">
      <header className="subscriptions-page__header">
        <div>
          <h2 className="subscriptions-page__title">Forge Billing</h2>
          <p className="subscriptions-page__copy">
            Nursery owns plan and AI token billing. Anvil no longer hosts checkout or pricing surfaces.
          </p>
        </div>
      </header>

      {!user ? (
        <article className="subscriptions-card subscriptions-card--notice">
          <h3>Sign in required</h3>
          <p>Sign in to manage your Forge plan and add AI tokens.</p>
          <div className="subscriptions-actions">
            <Link className="subscriptions-link-button" to={loginHref}>Sign in</Link>
          </div>
        </article>
      ) : (
        <div className="subscriptions-grid">
          <article className="subscriptions-card">
            <h3>Account</h3>
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
                <dt>Plan</dt>
                <dd>{profileLoading ? "Loading..." : planTier}</dd>
              </div>
            </dl>
            {profileError ? <p className="subscriptions-status subscriptions-status--error">{profileError}</p> : null}
          </article>

          <article className="subscriptions-card">
            <h3>Plan</h3>
            <p className="subscriptions-card__copy">
              Manage your Forge subscription from Nursery. This page is the canonical billing surface.
            </p>
            {isFounder ? (
              <p className="subscriptions-status subscriptions-status--info">
                Founder access is admin-assigned.
              </p>
            ) : (
              <div className="subscriptions-actions">
                <button
                  type="button"
                  className="subscriptions-button"
                  disabled={!planPriceId || planPending}
                  onClick={() => void handlePlanCheckout()}
                >
                  {planPending ? "Redirecting..." : "Upgrade plan"}
                </button>
              </div>
            )}
            {!planPriceId && !isFounder ? (
              <p className="subscriptions-status subscriptions-status--error">
                Billing is not configured in this environment.
              </p>
            ) : null}
            {checkoutMessage ? (
              <p
                className={`subscriptions-status ${
                  checkoutStatus === "canceled"
                    ? "subscriptions-status--info"
                    : "subscriptions-status--success"
                }`}
              >
                {checkoutMessage}
              </p>
            ) : null}
            {planMessage ? <p className="subscriptions-status subscriptions-status--error">{planMessage}</p> : null}
          </article>

          <article className="subscriptions-card subscriptions-card--wide">
            <h3>AI Tokens</h3>
            <p className="subscriptions-card__copy">
              Add tokens for Forge-managed AI usage. BYO mode does not consume Forge token balance.
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
                    : `Add ${pack.amountLabel} (${pack.tokensLabel} tokens)`}
                </button>
              ))}
            </div>
            <dl className="subscriptions-facts subscriptions-facts--compact">
              <div>
                <dt>Balance</dt>
                <dd>{aiLoading ? "Loading..." : `${formatTokenBalance(aiSnapshot?.tokenBalance ?? null)} tokens`}</dd>
              </div>
              <div>
                <dt>Billing mode</dt>
                <dd>{
                  aiLoading
                    ? "Loading..."
                    : aiSnapshot?.billingMode === "forge"
                    ? "Forge-managed"
                    : aiSnapshot?.billingMode === "byo"
                    ? "BYO"
                    : "Unknown"
                }</dd>
              </div>
            </dl>
            {aiLockedReason ? (
              <p className="subscriptions-status subscriptions-status--info">{aiLockedReason}</p>
            ) : null}
            {aiPacks.some((pack) => !pack.priceId) ? (
              <p className="subscriptions-status subscriptions-status--error">
                One or more AI token pack price IDs are not configured.
              </p>
            ) : null}
            {aiMessage ? <p className="subscriptions-status subscriptions-status--error">{aiMessage}</p> : null}
          </article>
        </div>
      )}
    </section>
  );
}
