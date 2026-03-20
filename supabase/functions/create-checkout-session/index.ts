import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findStripeCatalogPriceById } from "../_shared/stripe-catalog.ts";
import { buildForgeCheckoutMetadata } from "../_shared/forge-billing-metadata.ts";

type CreateCheckoutSessionBody = {
  priceId?: string;
  price_id?: string;
  successUrl?: string;
  cancelUrl?: string;
};

type StripeMetadata = Record<string, string>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  return token || null;
}

function readMetadataString(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const defaultSuccessUrl = Deno.env.get("STRIPE_SUCCESS_URL") ?? "";
const defaultCancelUrl = Deno.env.get("STRIPE_CANCEL_URL") ?? "";

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" })
  : null;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!stripe || !supabaseUrl || !serviceRoleKey) {
    return json(500, {
      error:
        "Missing env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return json(401, { error: "Missing bearer token" });
  }

  const body = await req.json().catch(() => ({} as CreateCheckoutSessionBody));
  const rawPriceId = body?.priceId ?? body?.price_id;
  const priceId = typeof rawPriceId === "string" ? rawPriceId.trim() : "";
  const successUrl = body.successUrl?.trim() || defaultSuccessUrl;
  const cancelUrl = body.cancelUrl?.trim() || defaultCancelUrl;

  if (!priceId) {
    return json(400, { error: "Missing priceId" });
  }

  const catalogPrice = findStripeCatalogPriceById(priceId);
  if (!catalogPrice) {
    return json(400, { error: "Unknown Stripe catalog priceId" });
  }

  if (!successUrl || !cancelUrl) {
    return json(400, {
      error:
        "Missing checkout params. Provide successUrl/cancelUrl or set STRIPE_SUCCESS_URL/STRIPE_CANCEL_URL.",
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(
    token,
  );
  if (authError || !authData?.user) {
    return json(401, { error: "Invalid auth token" });
  }

  const user = authData.user;

  try {
    let stripeCustomerId: string | null = null;
    const forgeCustomerMetadata: StripeMetadata = {
      supabase_user_id: user.id,
      forge_user_id: user.id,
      forge_product: "podcasters_forge",
    };

    try {
      const { data: profileRow, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      if (
        profileRow?.stripe_customer_id &&
        typeof profileRow.stripe_customer_id === "string"
      ) {
        stripeCustomerId = profileRow.stripe_customer_id.trim();
      }
    } catch (e) {
      throw new Error(
        `Failed to read profiles.stripe_customer_id: ${String(e)}`,
      );
    }

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: forgeCustomerMetadata,
      });

      stripeCustomerId = customer.id;

      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("user_id", user.id);

      if (upErr) {
        throw new Error(`Failed to store stripe_customer_id: ${upErr.message}`);
      }
    } else {
      await stripe.customers.update(stripeCustomerId, {
        email: user.email ?? undefined,
        metadata: forgeCustomerMetadata,
      });
    }

    const price = await stripe.prices.retrieve(priceId);
    const stripeProductId = typeof price.product === "string"
      ? price.product.trim()
      : null;
    const matchesCatalogProduct = stripeProductId === catalogPrice.liveProductId
      || stripeProductId === catalogPrice.testProductId;

    if (!matchesCatalogProduct) {
      return json(400, {
        error: "Stripe price/product does not match the Forge catalog.",
      });
    }

    const packType = catalogPrice.kind === "pack"
      ? catalogPrice.packType
      : readMetadataString(price.metadata, "forge_pack_type");
    const packId = catalogPrice.kind === "pack"
      ? catalogPrice.packId
      : readMetadataString(price.metadata, "forge_pack_id");
    const isAiCreditPack = catalogPrice.kind === "pack"
      && catalogPrice.packType === "ai_credits";
    const isRecurringPrice = !!price.recurring;

    if (isAiCreditPack && isRecurringPrice) {
      return json(400, {
        error: "AI credit pack prices must be one-time Stripe prices.",
      });
    }

    if (isAiCreditPack) {
      const { data: aiCreditsRow, error: aiCreditsError } = await supabaseAdmin
        .schema("tongs")
        .from("ai_credits")
        .select("billing_mode")
        .eq("user_id", user.id)
        .maybeSingle();

      if (aiCreditsError) {
        throw new Error(
          `Failed to read tongs.ai_credits.billing_mode: ${aiCreditsError.message}`,
        );
      }

      const billingMode = typeof aiCreditsRow?.billing_mode === "string"
        ? aiCreditsRow.billing_mode.trim().toLowerCase()
        : "forge";

      if (billingMode === "byo") {
        return json(400, {
          error: "BYO_KEY_USERS_CANNOT_PURCHASE_FORGE_CREDITS",
        });
      }
    }

    const mode: Stripe.Checkout.SessionCreateParams.Mode = isAiCreditPack
      ? "payment"
      : isRecurringPrice
      ? "subscription"
      : "payment";

    const sessionMetadata: StripeMetadata = buildForgeCheckoutMetadata({
      userId: user.id,
      catalogPrice,
    });
    if (packType && !sessionMetadata.forge_pack_type) {
      sessionMetadata.forge_pack_type = packType;
    }
    if (packId && !sessionMetadata.forge_pack_id) {
      sessionMetadata.forge_pack_id = packId;
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: stripeCustomerId,
      client_reference_id: user.id,
      metadata: sessionMetadata,
    };

    if (mode === "subscription") {
      sessionParams.subscription_data = {
        metadata: sessionMetadata,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return json(200, {
      url: session.url,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(500, { error: msg });
  }
});
