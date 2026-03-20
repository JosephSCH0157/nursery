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

type TongsRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type TongsBillingCustomersTableClient = {
  from: (
    relation: "billing_customers",
  ) => {
    select: (columns: string) => {
      eq: (
        column: "user_id",
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { stripe_customer_id: string | null } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

type ErrorResponseArgs = {
  code: string;
  stage: string;
  message: string;
  details?: Record<string, unknown>;
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

function readMetadataString(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLocalMode(): boolean {
  return normalizeString(Deno.env.get("DENO_DEPLOYMENT_ID")) === "";
}

function logStage(stage: string, details: Record<string, unknown> = {}): void {
  console.log("[create-checkout-session]", JSON.stringify({
    stage,
    ...details,
  }));
}

function logWarn(stage: string, details: Record<string, unknown> = {}): void {
  console.warn("[create-checkout-session]", JSON.stringify({
    stage,
    ...details,
  }));
}

function describeError(error: unknown): Record<string, unknown> & { message: string } {
  if (error instanceof Error) {
    const stripeError = error as Error & {
      type?: unknown;
      code?: unknown;
      statusCode?: unknown;
      raw?: { message?: unknown; code?: unknown; type?: unknown } | null;
    };
    return {
      message: normalizeString(stripeError.message)
        || normalizeString(stripeError.raw?.message)
        || String(error),
      errorType: normalizeString(stripeError.type),
      errorCode: normalizeString(stripeError.code || stripeError.raw?.code),
      statusCode: stripeError.statusCode ?? null,
      rawType: normalizeString(stripeError.raw?.type),
    };
  }

  return {
    message: typeof error === "string" ? error : String(error),
  };
}

function errorResponse(status: number, args: ErrorResponseArgs): Response {
  logStage(args.stage, {
    level: "error",
    code: args.code,
    message: args.message,
    ...(args.details ?? {}),
  });

  return json(status, {
    error: isLocalMode() ? args.message : args.code,
    code: args.code,
    stage: args.stage,
    ...(isLocalMode() ? { message: args.message } : {}),
  });
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

  logStage("request_received", {
    priceId: priceId || null,
    successUrl: successUrl || null,
    cancelUrl: cancelUrl || null,
    workspaceId: null,
  });

  if (!priceId) {
    return errorResponse(400, {
      code: "MISSING_PRICE_ID",
      stage: "request_validate",
      message: "Missing priceId",
    });
  }

  const catalogPrice = findStripeCatalogPriceById(priceId);
  if (!catalogPrice) {
    return errorResponse(400, {
      code: "PRICE_NOT_IN_CATALOG",
      stage: "price_catalog_resolve",
      message: "Unknown Stripe catalog priceId",
      details: { priceId },
    });
  }

  const chosenItemId = catalogPrice.kind === "plan"
    ? catalogPrice.planId
    : catalogPrice.kind === "addon"
    ? catalogPrice.addonId
    : catalogPrice.kind === "pack"
    ? catalogPrice.packId
    : catalogPrice.storageLevel;
  const storageLevel = catalogPrice.kind === "storage"
    ? catalogPrice.storageLevel
    : null;

  logStage("price_catalog_resolved", {
    priceId,
    catalogKind: catalogPrice.kind,
    forgeItemId: chosenItemId,
    storageLevel,
  });

  if (!successUrl || !cancelUrl) {
    return errorResponse(400, {
      code: "CHECKOUT_URLS_MISSING",
      stage: "request_validate",
      message:
        "Missing checkout params. Provide successUrl/cancelUrl or set STRIPE_SUCCESS_URL/STRIPE_CANCEL_URL.",
      details: { priceId, catalogKind: catalogPrice.kind, storageLevel },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(
    token,
  );
  if (authError || !authData?.user) {
    return errorResponse(401, {
      code: "AUTH_USER_RESOLVE_FAILED",
      stage: "auth_user_resolve",
      message: authError?.message || "Invalid auth token",
      details: { priceId, catalogKind: catalogPrice.kind, storageLevel },
    });
  }

  const user = authData.user;
  logStage("auth_user_resolved", {
    userId: user.id,
    workspaceId: null,
    priceId,
    catalogKind: catalogPrice.kind,
    forgeItemId: chosenItemId,
    storageLevel,
  });

  let stripeCustomerId = "";
  let existingCustomerSource: "billing_customers" | "profiles" | "created" | "none" = "none";

  const customerName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name.trim()
    : "";
  const forgeCustomerMetadata: StripeMetadata = {
    supabase_user_id: user.id,
    forge_user_id: user.id,
    forge_product: "podcasters_forge",
  };

  const billingCustomers = supabaseAdmin.schema("tongs") as unknown as TongsBillingCustomersTableClient;
  const tongsRpc = supabaseAdmin.schema("tongs") as unknown as TongsRpcClient;

  const { data: billingCustomerRow, error: billingCustomerLookupError } = await billingCustomers
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (billingCustomerLookupError) {
    return errorResponse(500, {
      code: "BILLING_CUSTOMER_LOOKUP_FAILED",
      stage: "billing_customer_lookup",
      message: `Failed to read tongs.billing_customers: ${billingCustomerLookupError.message}`,
      details: { userId: user.id, priceId, catalogKind: catalogPrice.kind, storageLevel },
    });
  }

  stripeCustomerId = normalizeString(billingCustomerRow?.stripe_customer_id);
  if (stripeCustomerId) {
    existingCustomerSource = "billing_customers";
  }

  if (!stripeCustomerId) {
    try {
      const { data: profileRow, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        logWarn("legacy_profile_lookup_failed", {
          userId: user.id,
          priceId,
          catalogKind: catalogPrice.kind,
          storageLevel,
          profileError: profileError.message,
        });
      } else {
        stripeCustomerId = normalizeString(profileRow?.stripe_customer_id);
        if (stripeCustomerId) {
          existingCustomerSource = "profiles";
        }
      }
    } catch (error) {
      logWarn("legacy_profile_lookup_exception", {
        userId: user.id,
        priceId,
        catalogKind: catalogPrice.kind,
        storageLevel,
        ...describeError(error),
      });
    }
  }

  logStage("stripe_customer_resolved", {
    userId: user.id,
    priceId,
    catalogKind: catalogPrice.kind,
    storageLevel,
    hasExistingCustomer: Boolean(stripeCustomerId),
    existingCustomerSource,
  });

  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: customerName || undefined,
        metadata: forgeCustomerMetadata,
      });
      stripeCustomerId = customer.id;
      existingCustomerSource = "created";
      logStage("stripe_customer_created", {
        userId: user.id,
        priceId,
        catalogKind: catalogPrice.kind,
        storageLevel,
        stripeCustomerId,
      });
    } catch (error) {
      const described = describeError(error);
      return errorResponse(500, {
        code: "STRIPE_CUSTOMER_CREATE_FAILED",
        stage: "stripe_customer_create",
        message: described.message,
        details: {
          userId: user.id,
          priceId,
          catalogKind: catalogPrice.kind,
          storageLevel,
          ...described,
        },
      });
    }
  } else {
    try {
      await stripe.customers.update(stripeCustomerId, {
        email: user.email ?? undefined,
        name: customerName || undefined,
        metadata: forgeCustomerMetadata,
      });
      logStage("stripe_customer_updated", {
        userId: user.id,
        priceId,
        catalogKind: catalogPrice.kind,
        storageLevel,
        stripeCustomerId,
        existingCustomerSource,
      });
    } catch (error) {
      const described = describeError(error);
      return errorResponse(500, {
        code: "STRIPE_CUSTOMER_UPDATE_FAILED",
        stage: "stripe_customer_update",
        message: described.message,
        details: {
          userId: user.id,
          priceId,
          catalogKind: catalogPrice.kind,
          storageLevel,
          stripeCustomerId,
          ...described,
        },
      });
    }
  }

  try {
    const { error: profileWriteError } = await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("user_id", user.id);

    if (profileWriteError) {
      logWarn("legacy_profile_write_failed", {
        userId: user.id,
        priceId,
        catalogKind: catalogPrice.kind,
        storageLevel,
        stripeCustomerId,
        profileError: profileWriteError.message,
      });
    }
  } catch (error) {
    logWarn("legacy_profile_write_exception", {
      userId: user.id,
      priceId,
      catalogKind: catalogPrice.kind,
      storageLevel,
      stripeCustomerId,
      ...describeError(error),
    });
  }

  const { error: billingCustomerUpsertError } = await tongsRpc.rpc(
    "upsert_billing_customer",
    {
      p_user_id: user.id,
      p_stripe_customer_id: stripeCustomerId,
      p_email: user.email ?? null,
      p_customer_name: customerName || null,
      p_metadata: forgeCustomerMetadata,
    },
  );

  if (billingCustomerUpsertError) {
    return errorResponse(500, {
      code: "STRIPE_CUSTOMER_UPSERT_FAILED",
      stage: "billing_customer_upsert",
      message: `upsert_billing_customer failed: ${billingCustomerUpsertError.message}`,
      details: {
        userId: user.id,
        priceId,
        catalogKind: catalogPrice.kind,
        storageLevel,
        stripeCustomerId,
      },
    });
  }

  logStage("billing_customer_upsert_succeeded", {
    userId: user.id,
    priceId,
    catalogKind: catalogPrice.kind,
    storageLevel,
    stripeCustomerId,
    existingCustomerSource,
  });

  let price: Stripe.Price;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch (error) {
    const described = describeError(error);
    return errorResponse(500, {
      code: "PRICE_LOOKUP_FAILED",
      stage: "stripe_price_lookup",
      message: described.message,
      details: {
        userId: user.id,
        priceId,
        catalogKind: catalogPrice.kind,
        storageLevel,
        ...described,
      },
    });
  }

  const stripeProductId = typeof price.product === "string"
    ? price.product.trim()
    : null;
  logStage("stripe_price_resolved", {
    userId: user.id,
    priceId,
    catalogKind: catalogPrice.kind,
    forgeItemId: chosenItemId,
    storageLevel,
    stripeProductId,
    isRecurringPrice: Boolean(price.recurring),
    recurringInterval: price.recurring?.interval ?? null,
  });
  const matchesCatalogProduct = stripeProductId === catalogPrice.liveProductId
    || stripeProductId === catalogPrice.testProductId;

  if (!matchesCatalogProduct) {
    return errorResponse(400, {
      code: "PRICE_CATALOG_MISMATCH",
      stage: "stripe_price_validate",
      message: "Stripe price/product does not match the Forge catalog.",
      details: {
        userId: user.id,
        priceId,
        catalogKind: catalogPrice.kind,
        storageLevel,
        stripeProductId,
        expectedLiveProductId: catalogPrice.liveProductId,
        expectedTestProductId: catalogPrice.testProductId,
      },
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
  const isRecurringPrice = Boolean(price.recurring);

  if (catalogPrice.kind === "storage" && !isRecurringPrice) {
    return errorResponse(400, {
      code: "STORAGE_PRICE_NOT_RECURRING",
      stage: "storage_price_validate",
      message: "Cloud storage checkout requires a recurring Stripe price.",
      details: {
        userId: user.id,
        priceId,
        storageLevel: catalogPrice.storageLevel,
        stripeProductId,
      },
    });
  }

  if (isAiCreditPack && isRecurringPrice) {
    return errorResponse(400, {
      code: "AI_PACK_PRICE_INVALID",
      stage: "ai_price_validate",
      message: "AI credit pack prices must be one-time Stripe prices.",
      details: {
        userId: user.id,
        priceId,
        catalogKind: catalogPrice.kind,
      },
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
      return errorResponse(500, {
        code: "AI_BILLING_MODE_LOOKUP_FAILED",
        stage: "ai_billing_mode_lookup",
        message: `Failed to read tongs.ai_credits.billing_mode: ${aiCreditsError.message}`,
        details: { userId: user.id, priceId, catalogKind: catalogPrice.kind },
      });
    }

    const billingMode = typeof aiCreditsRow?.billing_mode === "string"
      ? aiCreditsRow.billing_mode.trim().toLowerCase()
      : "forge";

    if (billingMode === "byo") {
      return errorResponse(400, {
        code: "BYO_KEY_USERS_CANNOT_PURCHASE_FORGE_CREDITS",
        stage: "ai_billing_mode_validate",
        message: "BYO key users cannot purchase Forge credits.",
        details: { userId: user.id, priceId, catalogKind: catalogPrice.kind },
      });
    }
  }

  const mode: Stripe.Checkout.SessionCreateParams.Mode = isAiCreditPack
    ? "payment"
    : isRecurringPrice
    ? "subscription"
    : "payment";

  if (catalogPrice.kind === "storage" && mode !== "subscription") {
    return errorResponse(400, {
      code: "STORAGE_MODE_INVALID",
      stage: "checkout_mode_resolve",
      message: "Cloud storage checkout must use subscription mode.",
      details: { userId: user.id, priceId, storageLevel: catalogPrice.storageLevel, mode },
    });
  }

  logStage("checkout_mode_resolved", {
    userId: user.id,
    priceId,
    catalogKind: catalogPrice.kind,
    forgeItemId: chosenItemId,
    storageLevel,
    mode,
    isRecurringPrice,
  });

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

  logStage("checkout_session_create_attempt", {
    userId: user.id,
    workspaceId: null,
    priceId,
    catalogKind: catalogPrice.kind,
    forgeItemId: chosenItemId,
    storageLevel,
    stripeCustomerId,
    existingCustomerSource,
    mode,
    lineItemCount: sessionParams.line_items?.length ?? 0,
  });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(sessionParams);
  } catch (error) {
    const described = describeError(error);
    return errorResponse(500, {
      code: "CHECKOUT_SESSION_CREATE_FAILED",
      stage: "checkout_session_create",
      message: described.message,
      details: {
        userId: user.id,
        workspaceId: null,
        priceId,
        catalogKind: catalogPrice.kind,
        forgeItemId: chosenItemId,
        storageLevel,
        stripeCustomerId,
        mode,
        ...described,
      },
    });
  }

  const sessionUrl = normalizeString(session.url);
  if (!sessionUrl) {
    return errorResponse(500, {
      code: "CHECKOUT_SESSION_URL_MISSING",
      stage: "checkout_session_create",
      message: "Stripe checkout session created without a redirect URL.",
      details: {
        userId: user.id,
        priceId,
        catalogKind: catalogPrice.kind,
        forgeItemId: chosenItemId,
        storageLevel,
        stripeCustomerId,
        sessionId: session.id,
        mode,
      },
    });
  }

  logStage("checkout_session_create_succeeded", {
    userId: user.id,
    priceId,
    catalogKind: catalogPrice.kind,
    forgeItemId: chosenItemId,
    storageLevel,
    stripeCustomerId,
    sessionId: session.id,
    mode,
    urlPresent: true,
  });

  return json(200, {
    url: sessionUrl,
  });
});
