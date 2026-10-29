import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  findStripeCatalogPriceById,
  stripeCatalogEntryHasProductId,
} from "../_shared/stripe-catalog.ts";
import { buildForgeCheckoutMetadata } from "../_shared/forge-billing-metadata.ts";
import {
  assertStripeModeMatchesEnvironment,
  readTrustedFinancialEnvironment,
} from "../_shared/financial-environment.ts";

type CreateCheckoutSessionBody = {
  priceId?: string;
  price_id?: string;
  successUrl?: string;
  cancelUrl?: string;
  hammer_live_funding?: {
    claim_id?: string;
    workspace_id?: string;
    workpiece_id?: string;
    route_code?: string;
  };
};

type TongsRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

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

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

  if (!successUrl || !cancelUrl) {
    return json(400, {
      error:
        "Missing checkout params. Provide successUrl/cancelUrl or set STRIPE_SUCCESS_URL/STRIPE_CANCEL_URL.",
    });
  }

  const catalogPrice = findStripeCatalogPriceById(priceId);
  if (!catalogPrice) {
    return json(400, { error: "Unknown Stripe catalog priceId" });
  }

  if (catalogPrice.kind !== "pack" || catalogPrice.packType !== "ai_credits") {
    return json(400, {
      error:
        "create-one-time-checkout-session only supports AI credit pack prices.",
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
    let stripeCustomerId = "";
    const customerName = typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";
    const forgeCustomerMetadata = {
      supabase_user_id: user.id,
      forge_user_id: user.id,
      forge_product: "podcasters_forge",
    };
    const tongsRpc = supabaseAdmin.schema("tongs") as unknown as TongsRpcClient;
    const hammerLiveFunding = body.hammer_live_funding;
    const scopedClaimId = normalizeString(hammerLiveFunding?.claim_id);
    let financialEnvironment: "test" | "live";
    if (hammerLiveFunding != null) {
      const workspaceId = normalizeString(hammerLiveFunding.workspace_id);
      const workpieceId = normalizeString(hammerLiveFunding.workpiece_id);
      const routeCode = normalizeString(hammerLiveFunding.route_code);
      if (!scopedClaimId || !workspaceId || !workpieceId || routeCode !== "hammer.transcript_prep") {
        return json(400, { error: "INVALID_HAMMER_SCOPED_LIVE_FUNDING_CONTEXT" });
      }
      const { data: scopedData, error: scopedError } = await tongsRpc.rpc(
        "claim_hammer_scoped_live_checkout",
        {
          p_claim_id: scopedClaimId,
          p_user_id: user.id,
          p_workspace_id: workspaceId,
          p_workpiece_id: workpieceId,
          p_route_code: routeCode,
          p_live_price_id: priceId,
        },
      );
      if (scopedError) {
        return json(403, { error: "HAMMER_SCOPED_LIVE_FUNDING_UNAVAILABLE" });
      }
      const scoped = scopedData && typeof scopedData === "object"
        ? scopedData as Record<string, unknown>
        : {};
      if (scoped.financial_environment !== "live" || normalizeString(scoped.price_id) !== priceId) {
        throw new Error("Scoped Hammer Live funding authority returned an invalid environment or price.");
      }
      financialEnvironment = "live";
    } else {
      financialEnvironment = await readTrustedFinancialEnvironment(tongsRpc);
      const { data: availabilityData, error: availabilityError } = await tongsRpc.rpc(
        "read_credit_pack_purchase_availability",
      );
      if (availabilityError) {
        throw new Error(
          availabilityError.message ?? "Failed to read Forge Credit purchase availability.",
        );
      }
      const availability = availabilityData && typeof availabilityData === "object"
        ? availabilityData as Record<string, unknown>
        : {};
      if (availability.purchase_enabled !== true) {
        return json(403, {
          error: "FORGE_CREDIT_PURCHASES_UNAVAILABLE",
          reason_code: normalizeString(availability.reason_code) || "financial_environment_inactive",
        });
      }
    }
    const currentPriceId = financialEnvironment === "live"
      ? catalogPrice.livePriceId
      : catalogPrice.testPriceId;
    if (priceId !== currentPriceId) {
      return json(400, {
        error: "Historical Forge Credit prices cannot be used for new purchases.",
      });
    }
    const { data: identifierData, error: identifierError } = await tongsRpc.rpc(
      "read_stripe_customer_environment_identifier",
      { p_user_id: user.id, p_financial_environment: financialEnvironment },
    );
    if (identifierError) throw new Error(identifierError.message ?? "Failed to read environment-scoped Stripe customer.");
    stripeCustomerId = normalizeString(
      identifierData && typeof identifierData === "object"
        ? (identifierData as Record<string, unknown>).stripe_customer_id
        : null,
    );

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: customerName || undefined,
        metadata: forgeCustomerMetadata,
      });

      stripeCustomerId = customer.id;
    } else {
      await stripe.customers.update(stripeCustomerId, {
        email: user.email ?? undefined,
        name: customerName || undefined,
        metadata: forgeCustomerMetadata,
      });
    }

    const { error: identifierWriteError } = await tongsRpc.rpc(
      "record_stripe_customer_environment_identifier",
      {
        p_user_id: user.id,
        p_financial_environment: financialEnvironment,
        p_stripe_customer_id: stripeCustomerId,
        p_evidence_json: { source: "checkout_runtime" },
      },
    );
    if (identifierWriteError) throw new Error(identifierWriteError.message ?? "Failed to record environment-scoped Stripe customer.");

    try {
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("user_id", user.id);

      if (updateError) {
        console.warn(
          "[create-one-time-checkout-session]",
          `legacy_profile_write_failed user_id=${user.id} error=${updateError.message}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        "[create-one-time-checkout-session]",
        `legacy_profile_write_exception user_id=${user.id} error=${message}`,
      );
    }

    const { error: billingCustomerError } = await tongsRpc.rpc(
      "upsert_billing_customer",
      {
        p_user_id: user.id,
        p_stripe_customer_id: stripeCustomerId,
        p_email: user.email ?? null,
        p_customer_name: customerName || null,
        p_metadata: forgeCustomerMetadata,
      },
    );

    if (billingCustomerError) {
      throw new Error(
        `upsert_billing_customer failed: ${billingCustomerError.message}`,
      );
    }

    const price = await stripe.prices.retrieve(priceId);
    assertStripeModeMatchesEnvironment(financialEnvironment, price.livemode);
    const stripeProductId = typeof price.product === "string"
      ? price.product.trim()
      : null;
    const matchesCatalogProduct = stripeCatalogEntryHasProductId(
      catalogPrice,
      stripeProductId,
    );

    if (!matchesCatalogProduct) {
      return json(400, {
        error: "Stripe price/product does not match the Forge catalog.",
      });
    }

    if (price.recurring) {
      return json(400, {
        error: "AI credit pack prices must be one-time Stripe prices.",
      });
    }

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

    const sessionMetadata = buildForgeCheckoutMetadata({
      userId: user.id,
      catalogPrice,
    });
    if (scopedClaimId) {
      sessionMetadata.forge_hammer_live_funding_claim_id = scopedClaimId;
      sessionMetadata.forge_hammer_live_funding_route = "hammer.transcript_prep";
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: stripeCustomerId,
      client_reference_id: user.id,
      metadata: sessionMetadata,
    });

    if (scopedClaimId) {
      const { error: sessionRecordError } = await tongsRpc.rpc(
        "record_hammer_scoped_live_checkout_session",
        {
          p_claim_id: scopedClaimId,
          p_user_id: user.id,
          p_stripe_session_id: session.id,
        },
      );
      if (sessionRecordError) {
        throw new Error("Scoped Hammer Checkout session could not be recorded; no retry is permitted.");
      }
    }

    return json(200, {
      url: session.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: message });
  }
});
