import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const AI_PACK_TOKENS: Record<string, number> = {
  ai_base: 1_000_000,
  ai_mid: 3_000_000,
  ai_high: 7_000_000,
};

function normalizeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return typeof customer.id === "string" && customer.id.trim()
    ? customer.id
    : null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePeriodEndIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function hasPaidAccess(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === "active" || status === "trialing";
}

function resolveUserIdFromCheckoutSession(
  session: Stripe.Checkout.Session,
): string | null {
  const fromClientRef = normalizeString(session.client_reference_id);
  if (fromClientRef) return fromClientRef;
  const fromForgeUser = normalizeString(session.metadata?.forge_user_id);
  if (fromForgeUser) return fromForgeUser;
  return normalizeString(session.metadata?.supabase_user_id);
}

function resolveAiPackTokens(packId: string): number | null {
  const tokens = AI_PACK_TOKENS[packId];
  if (!Number.isFinite(tokens) || tokens <= 0) return null;
  return Math.trunc(tokens);
}

async function requireProfileByCustomerId(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Profile lookup failed for stripe_customer_id=${customerId}: ${error.message}`,
    );
  }

  if (!data?.user_id) {
    throw new Error(`No profile found for stripe_customer_id=${customerId}`);
  }

  return data.user_id;
}

async function updateProfileByUserId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Profile update failed for supabase_user_id=${userId}: ${error.message}`,
    );
  }

  if (!data?.user_id) {
    throw new Error(`No profile found for supabase_user_id=${userId}`);
  }
}

async function grantAiCredits(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string;
    packId: string;
    tokens: number;
    eventId: string;
    sessionId: string;
    amountTotal: number | null;
    currency: string | null;
  },
): Promise<void> {
  const rpcClient = supabase.schema("tongs") as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  const { error } = await rpcClient.rpc("grant_ai_credits", {
    p_user_id: params.userId,
    p_pack_id: params.packId,
    p_tokens: params.tokens,
    p_event_id: params.eventId,
    p_session_id: params.sessionId,
    p_amount_total: params.amountTotal,
    p_currency: params.currency,
  });

  if (error) {
    throw new Error(`grant_ai_credits failed: ${error.message ?? "unknown error"}`);
  }
}

serve(async (req) => {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      endpointSecret,
    );
  } catch (err) {
    console.error("Webhook signature failed:", err);
    return new Response("Signature verification failed", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = resolveUserIdFromCheckoutSession(session);
        const customerId = normalizeCustomerId(session?.customer ?? null);
        const mode = normalizeString(session.mode);
        const packType = normalizeString(session.metadata?.forge_pack_type);
        const packId = normalizeString(session.metadata?.forge_pack_id);

        if (!userId || !customerId) {
          throw new Error("checkout.session.completed missing user identity or customer");
        }

        await updateProfileByUserId(supabase, userId, {
          stripe_customer_id: customerId,
        });

        if (mode === "payment" && packType === "ai_credits") {
          if (!packId) {
            throw new Error("AI credits checkout missing forge_pack_id metadata");
          }
          const tokens = resolveAiPackTokens(packId);
          if (!tokens) {
            throw new Error(`Unsupported AI credits pack_id: ${packId}`);
          }

          await grantAiCredits(supabase, {
            userId,
            packId,
            tokens,
            eventId: event.id,
            sessionId: session.id,
            amountTotal: typeof session.amount_total === "number"
              ? session.amount_total
              : null,
            currency: normalizeString(session.currency),
          });
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = normalizeCustomerId(subscription.customer);
        const status = subscription.status;
        const periodEnd = normalizePeriodEndIso(subscription.current_period_end);
        const subscriptionId =
          typeof subscription.id === "string" ? subscription.id : null;
        const paid = hasPaidAccess(status);
        const userIdFromMetadata =
          subscription.metadata?.supabase_user_id?.trim() || null;

        if (!customerId) {
          throw new Error("customer.subscription event missing customer");
        }

        if (userIdFromMetadata) {
          await updateProfileByUserId(supabase, userIdFromMetadata, {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: status,
            current_period_end: periodEnd,
            anvil_paid: paid,
          });
          break;
        }

        const userId = await requireProfileByCustomerId(supabase, customerId);
        await updateProfileByUserId(supabase, userId, {
          stripe_subscription_id: subscriptionId,
          subscription_status: status,
          current_period_end: periodEnd,
          anvil_paid: paid,
        });

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = normalizeCustomerId(subscription.customer);
        const userIdFromMetadata =
          subscription.metadata?.supabase_user_id?.trim() || null;

        if (!customerId) {
          throw new Error("customer.subscription event missing customer");
        }

        if (userIdFromMetadata) {
          await updateProfileByUserId(supabase, userIdFromMetadata, {
            stripe_customer_id: customerId,
            stripe_subscription_id: null,
            subscription_status: "canceled",
            current_period_end: null,
            anvil_paid: false,
          });
          break;
        }

        const userId = await requireProfileByCustomerId(supabase, customerId);
        await updateProfileByUserId(supabase, userId, {
          stripe_subscription_id: null,
          subscription_status: "canceled",
          current_period_end: null,
          anvil_paid: false,
        });

        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error("Webhook processing failed:", err);
    return new Response("Webhook handler failed", { status: 400 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
  });
});
