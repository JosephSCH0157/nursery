import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findStripeCatalogAiPackById } from "../_shared/stripe-catalog.ts";
import {
  parseForgePurchaseMetadata,
  type ForgePurchaseMetadata,
} from "../_shared/forge-billing-metadata.ts";

type SupabaseAdminClient = ReturnType<typeof createClient>;

type CheckoutFulfillmentContext = ForgePurchaseMetadata & {
  customerId: string;
  eventId: string;
  sessionId: string;
  sessionMode: string | null;
  subscriptionId: string | null;
  amountTotal: number | null;
  currency: string | null;
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return normalizeString(customer.id);
}

function normalizeSubscriptionId(
  subscription: string | Stripe.Subscription | null,
): string | null {
  if (!subscription) return null;
  if (typeof subscription === "string") return normalizeString(subscription);
  return normalizeString(subscription.id);
}

function normalizePeriodEndIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function hasPaidAccess(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === "active" || status === "trialing";
}

function resolveAiPackTokens(itemId: string): number | null {
  const pack = findStripeCatalogAiPackById(itemId);
  if (!pack) return null;
  if (!Number.isFinite(pack.tokenAmount) || pack.tokenAmount <= 0) return null;
  return Math.trunc(pack.tokenAmount);
}

function logCheckoutFulfillmentBranch(
  purchaseType: CheckoutFulfillmentContext["purchaseType"],
  context: CheckoutFulfillmentContext,
): void {
  console.log("[stripe-webhook] checkout fulfillment branch", {
    purchaseType,
    itemId: context.itemId,
    interval: context.interval,
    userId: context.supabaseUserId,
    sessionId: context.sessionId,
    eventId: context.eventId,
    sessionMode: context.sessionMode,
    metadataSource: context.source,
  });
}

function logSubscriptionLifecycleBranch(args: {
  eventId: string;
  subscriptionId: string | null;
  customerId: string;
  purchaseType: ForgePurchaseMetadata["purchaseType"];
  itemId: string;
  interval: ForgePurchaseMetadata["interval"];
  userId: string | null;
  source: ForgePurchaseMetadata["source"];
}): void {
  console.log("[stripe-webhook] subscription lifecycle branch", {
    purchaseType: args.purchaseType,
    itemId: args.itemId,
    interval: args.interval,
    userId: args.userId,
    sessionId: null,
    eventId: args.eventId,
    subscriptionId: args.subscriptionId,
    customerId: args.customerId,
    metadataSource: args.source,
  });
}

function parseCheckoutFulfillmentContext(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): CheckoutFulfillmentContext {
  const customerId = normalizeCustomerId(session.customer ?? null);
  if (!customerId) {
    throw new Error("checkout.session.completed missing customer");
  }

  const parsed = parseForgePurchaseMetadata({
    metadata: session.metadata,
    mode: normalizeString(session.mode),
    allowLegacyFallback: true,
  });

  return {
    ...parsed,
    customerId,
    eventId: event.id,
    sessionId: session.id,
    sessionMode: normalizeString(session.mode),
    subscriptionId: normalizeSubscriptionId(session.subscription ?? null),
    amountTotal: typeof session.amount_total === "number"
      ? session.amount_total
      : null,
    currency: normalizeString(session.currency),
  };
}

async function requireProfileByCustomerId(
  supabase: SupabaseAdminClient,
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
  supabase: SupabaseAdminClient,
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

async function linkStripeCustomerToUser(
  supabase: SupabaseAdminClient,
  userId: string,
  customerId: string,
): Promise<void> {
  await updateProfileByUserId(supabase, userId, {
    stripe_customer_id: customerId,
  });
}

async function grantAiCredits(
  supabase: SupabaseAdminClient,
  params: {
    userId: string;
    itemId: string;
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
    p_pack_id: params.itemId,
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

async function syncProfileFromSubscription(
  supabase: SupabaseAdminClient,
  subscription: Stripe.Subscription,
  userIdHint: string | null,
): Promise<void> {
  const customerId = normalizeCustomerId(subscription.customer);
  if (!customerId) {
    throw new Error("customer.subscription event missing customer");
  }

  const subscriptionId = normalizeSubscriptionId(subscription);
  const periodEnd = normalizePeriodEndIso(subscription.current_period_end);
  const status = normalizeString(subscription.status);
  const paid = hasPaidAccess(status);
  const metadataUserId = normalizeString(subscription.metadata?.supabase_user_id);
  const userId = userIdHint || metadataUserId || await requireProfileByCustomerId(
    supabase,
    customerId,
  );

  await updateProfileByUserId(supabase, userId, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: status,
    current_period_end: periodEnd,
    anvil_paid: paid,
  });
}

async function clearProfileSubscription(
  supabase: SupabaseAdminClient,
  subscription: Stripe.Subscription,
  userIdHint: string | null,
): Promise<void> {
  const customerId = normalizeCustomerId(subscription.customer);
  if (!customerId) {
    throw new Error("customer.subscription event missing customer");
  }

  const metadataUserId = normalizeString(subscription.metadata?.supabase_user_id);
  const userId = userIdHint || metadataUserId || await requireProfileByCustomerId(
    supabase,
    customerId,
  );

  await updateProfileByUserId(supabase, userId, {
    stripe_customer_id: customerId,
    stripe_subscription_id: null,
    subscription_status: "canceled",
    current_period_end: null,
    anvil_paid: false,
  });
}

async function fulfillAiCreditsCheckout(
  supabase: SupabaseAdminClient,
  context: CheckoutFulfillmentContext,
): Promise<void> {
  logCheckoutFulfillmentBranch("ai_credits", context);

  const tokens = resolveAiPackTokens(context.itemId);
  if (!tokens) {
    throw new Error(`Unsupported AI credits forge_item_id: ${context.itemId}`);
  }

  await grantAiCredits(supabase, {
    userId: context.supabaseUserId,
    itemId: context.itemId,
    tokens,
    eventId: context.eventId,
    sessionId: context.sessionId,
    amountTotal: context.amountTotal,
    currency: context.currency,
  });
}

async function fulfillSubscriptionCheckout(
  supabase: SupabaseAdminClient,
  context: CheckoutFulfillmentContext,
): Promise<void> {
  logCheckoutFulfillmentBranch("subscription", context);

  if (!context.subscriptionId) {
    // Stripe retries are safe here because this branch only overwrites profile linkage.
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(context.subscriptionId);
  await syncProfileFromSubscription(
    supabase,
    subscription,
    context.supabaseUserId,
  );
}

async function fulfillCloudStorageCheckout(
  _supabase: SupabaseAdminClient,
  context: CheckoutFulfillmentContext,
): Promise<void> {
  logCheckoutFulfillmentBranch("cloud_storage", context);
  // TODO: Persist recurring cloud storage entitlements once the canonical
  // storage billing schema exists. Do not overload profile subscription fields.
}

async function fulfillCompletedCheckout(
  supabase: SupabaseAdminClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const context = parseCheckoutFulfillmentContext(event, session);
  await linkStripeCustomerToUser(
    supabase,
    context.supabaseUserId,
    context.customerId,
  );

  switch (context.purchaseType) {
    case "subscription":
      await fulfillSubscriptionCheckout(supabase, context);
      return;
    case "ai_credits":
      await fulfillAiCreditsCheckout(supabase, context);
      return;
    case "cloud_storage":
      await fulfillCloudStorageCheckout(supabase, context);
      return;
  }
}

async function handleRecurringSubscriptionUpsert(
  supabase: SupabaseAdminClient,
  event: Stripe.Event,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = normalizeCustomerId(subscription.customer);
  if (!customerId) {
    throw new Error("customer.subscription event missing customer");
  }

  const metadata = parseForgePurchaseMetadata({
    metadata: subscription.metadata,
    mode: "subscription",
    allowLegacyFallback: true,
  });

  logSubscriptionLifecycleBranch({
    eventId: event.id,
    subscriptionId: normalizeSubscriptionId(subscription),
    customerId,
    purchaseType: metadata.purchaseType,
    itemId: metadata.itemId,
    interval: metadata.interval,
    userId: metadata.supabaseUserId,
    source: metadata.source,
  });

  switch (metadata.purchaseType) {
    case "subscription":
      await syncProfileFromSubscription(
        supabase,
        subscription,
        metadata.supabaseUserId,
      );
      return;
    case "cloud_storage":
      // TODO: Persist recurring cloud storage entitlements once the canonical
      // storage billing schema exists. Do not overload profile subscription fields.
      return;
    case "ai_credits":
      throw new Error(
        "Recurring subscription lifecycle received unsupported purchase_type=ai_credits",
      );
  }
}

async function handleRecurringSubscriptionDelete(
  supabase: SupabaseAdminClient,
  event: Stripe.Event,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = normalizeCustomerId(subscription.customer);
  if (!customerId) {
    throw new Error("customer.subscription event missing customer");
  }

  const metadata = parseForgePurchaseMetadata({
    metadata: subscription.metadata,
    mode: "subscription",
    allowLegacyFallback: true,
  });

  logSubscriptionLifecycleBranch({
    eventId: event.id,
    subscriptionId: normalizeSubscriptionId(subscription),
    customerId,
    purchaseType: metadata.purchaseType,
    itemId: metadata.itemId,
    interval: metadata.interval,
    userId: metadata.supabaseUserId,
    source: metadata.source,
  });

  switch (metadata.purchaseType) {
    case "subscription":
      await clearProfileSubscription(
        supabase,
        subscription,
        metadata.supabaseUserId,
      );
      return;
    case "cloud_storage":
      // TODO: Revoke recurring cloud storage entitlements once the canonical
      // storage billing schema exists. Do not overload profile subscription fields.
      return;
    case "ai_credits":
      throw new Error(
        "Subscription deletion received unsupported purchase_type=ai_credits",
      );
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
        await fulfillCompletedCheckout(supabase, event, session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleRecurringSubscriptionUpsert(supabase, event, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleRecurringSubscriptionDelete(supabase, event, subscription);
        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error("Webhook processing failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message || "Webhook handler failed", { status: 400 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
  });
});
