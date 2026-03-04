import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getMode(): "test" | "live" {
  const raw = (Deno.env.get("STRIPE_MODE") ?? "live").toLowerCase().trim();
  return raw === "test" ? "test" : "live";
}

function getStripeKey(mode: "test" | "live"): string | null {
  if (mode === "test") return Deno.env.get("STRIPE_SECRET_KEY_TEST") ?? null;
  return Deno.env.get("STRIPE_SECRET_KEY") ?? null;
}

function getWebhookSecret(mode: "test" | "live"): string | null {
  if (mode === "test") return Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST") ?? null;
  return Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? null;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const mode = getMode();

  const stripeKey = getStripeKey(mode);
  const webhookSecret = getWebhookSecret(mode);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

  if (!stripeKey) return json(500, { ok: false, error: `Missing Stripe key for mode=${mode}` });
  if (!webhookSecret) return json(500, { ok: false, error: `Missing webhook secret for mode=${mode}` });
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  // Stripe signature verification requires the raw request body
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json(400, { ok: false, error: "Missing stripe-signature header" });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    return json(400, { ok: false, error: "Webhook signature verification failed", detail: String(e) });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Idempotency helper: if we’ve already stored this event id, do nothing.
  // We store last_stripe_event_id on the user row (cheap and good enough for v1).
  async function alreadyProcessed(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("forge_memberships")
      .select("last_stripe_event_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return false; // fail open; Stripe will retry anyway
    return (data?.last_stripe_event_id ?? null) === event.id;
  }

  async function upsertMembership(input: {
    userId: string;
    customerId?: string | null;
    subscriptionId?: string | null;
    status?: string | null;
    priceId?: string | null;
    currentPeriodEnd?: number | null; // unix seconds
  }) {
    const currentPeriodEndTs =
      input.currentPeriodEnd ? new Date(input.currentPeriodEnd * 1000).toISOString() : null;

    const payload = {
      user_id: input.userId,
      stripe_mode: mode,
      stripe_customer_id: input.customerId ?? null,
      stripe_subscription_id: input.subscriptionId ?? null,
      stripe_status: input.status ?? null,
      stripe_price_id: input.priceId ?? null,
      current_period_end: currentPeriodEndTs,
      last_stripe_event_id: event.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("forge_memberships").upsert(payload, {
      onConflict: "user_id",
    });

    if (error) throw error;
  }

  try {
    // We care about 3 event families for “regular members”
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // You set this in create-checkout-session metadata already:
        const userId = (session.metadata?.supabase_user_id ?? "").trim();
        if (!userId) {
          return json(200, { ok: true, ignored: true, reason: "No supabase_user_id in session.metadata" });
        }

        if (await alreadyProcessed(userId)) return json(200, { ok: true, deduped: true });

        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

        // Prefer to retrieve the subscription so we get authoritative status/period end/price id
        let status: string | null = null;
        let priceId: string | null = null;
        let currentPeriodEnd: number | null = null;

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          status = sub.status ?? null;
          currentPeriodEnd = (sub.current_period_end as number) ?? null;

          const firstItem = sub.items?.data?.[0];
          priceId = firstItem?.price?.id ?? null;
        }

        await upsertMembership({
          userId,
          customerId,
          subscriptionId,
          status,
          priceId,
          currentPeriodEnd,
        });

        return json(200, { ok: true });
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        // We need to map Stripe subscription → userId.
        // v1 approach: look up forge_memberships by stripe_subscription_id (we store it on checkout completion).
        const subscriptionId = sub.id;
        const { data, error } = await supabase
          .from("forge_memberships")
          .select("user_id, last_stripe_event_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (error || !data?.user_id) {
          // If we don't know the user yet, ignore. Stripe will retry; and checkout.completed should create the row first.
          return json(200, { ok: true, ignored: true, reason: "Unknown subscription id" });
        }

        const userId = data.user_id as string;
        if ((data.last_stripe_event_id ?? null) === event.id) return json(200, { ok: true, deduped: true });

        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        const status = sub.status ?? null;
        const currentPeriodEnd = (sub.current_period_end as number) ?? null;
        const priceId = sub.items?.data?.[0]?.price?.id ?? null;

        await upsertMembership({
          userId,
          customerId,
          subscriptionId,
          status,
          priceId,
          currentPeriodEnd,
        });

        return json(200, { ok: true });
      }

      default:
        // Ignore everything else for now
        return json(200, { ok: true, ignored: true, event_type: event.type });
    }
  } catch (e) {
    // Stripe retries on non-2xx. For debugging, return 500 so it will retry.
    return json(500, { ok: false, error: String(e), event_type: event.type });
  }
});
