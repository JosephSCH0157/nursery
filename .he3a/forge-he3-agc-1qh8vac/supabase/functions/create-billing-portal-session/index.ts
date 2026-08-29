import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type BillingPortalBody = {
  returnUrl?: string;
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
const defaultReturnUrl = Deno.env.get("STRIPE_PORTAL_RETURN_URL")
  ?? Deno.env.get("STRIPE_SUCCESS_URL")
  ?? "";
const portalConfigurationId = normalizeString(
  Deno.env.get("STRIPE_BILLING_PORTAL_CONFIGURATION_ID"),
);

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

  const body = await req.json().catch(() => ({} as BillingPortalBody));
  const returnUrl = normalizeString(body.returnUrl) || defaultReturnUrl;

  if (!returnUrl) {
    return json(400, {
      error:
        "Missing returnUrl. Provide returnUrl or set STRIPE_PORTAL_RETURN_URL.",
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
    const billingCustomers = supabaseAdmin.schema("tongs") as unknown as TongsBillingCustomersTableClient;
    const tongsRpc = supabaseAdmin.schema("tongs") as unknown as TongsRpcClient;
    let stripeCustomerId = "";

    const { data: billingCustomerRow, error: billingCustomerError } = await billingCustomers
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (billingCustomerError) {
      throw new Error(
        `Failed to read tongs.billing_customers: ${billingCustomerError.message}`,
      );
    }

    stripeCustomerId = normalizeString(billingCustomerRow?.stripe_customer_id);

    if (!stripeCustomerId) {
      try {
        const { data: profileRow, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("stripe_customer_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          console.warn(
            "[create-billing-portal-session]",
            `legacy_profile_lookup_failed user_id=${user.id} error=${profileError.message}`,
          );
        } else {
          stripeCustomerId = normalizeString(profileRow?.stripe_customer_id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          "[create-billing-portal-session]",
          `legacy_profile_lookup_exception user_id=${user.id} error=${message}`,
        );
      }
    }

    const customerName = normalizeString(user.user_metadata?.full_name);
    const forgeCustomerMetadata: Record<string, string> = {
      supabase_user_id: user.id,
      forge_user_id: user.id,
      forge_product: "podcasters_forge",
    };

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

    try {
      const { error: profileUpdateError } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("user_id", user.id);

      if (profileUpdateError) {
        console.warn(
          "[create-billing-portal-session]",
          `legacy_profile_write_failed user_id=${user.id} error=${profileUpdateError.message}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        "[create-billing-portal-session]",
        `legacy_profile_write_exception user_id=${user.id} error=${message}`,
      );
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
      throw new Error(
        `upsert_billing_customer failed: ${billingCustomerUpsertError.message}`,
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
      ...(portalConfigurationId ? { configuration: portalConfigurationId } : {}),
    });

    return json(200, { url: portalSession.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: message });
  }
});
