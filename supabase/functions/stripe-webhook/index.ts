import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  findStripeCatalogAiPackById,
  findStripeCatalogPriceById,
  findStripeCatalogPriceByProductId,
} from "../_shared/stripe-catalog.ts";
import {
  buildForgeCheckoutMetadata,
  parseForgePurchaseMetadata,
  type ForgePurchaseMetadata,
} from "../_shared/forge-billing-metadata.ts";
import {
  resolveInvoiceServicePeriod,
  resolveInvoiceSubscriptionId,
} from "../_shared/stripe-invoice-compat.ts";

type SupabaseAdminClient = ReturnType<typeof createClient>;

type TongsRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type TongsTableClient = {
  from: SupabaseAdminClient["from"];
};

type BillingCustomerUpsertParams = {
  userId: string;
  customerId: string;
  email?: string | null;
  customerName?: string | null;
  metadata?: Record<string, unknown>;
};

type BillingOneTimePurchaseUpsertParams = {
  userId: string;
  customerId: string;
  eventId: string;
  sessionId: string;
  purchaseType: "ai_credits";
  itemId: string;
  status: string;
  paymentIntentId?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown>;
};

type BillingSubscriptionUpsertParams = {
  userId: string;
  customerId: string;
  subscriptionId: string;
  purchaseType: "subscription" | "cloud_storage";
  itemId: string;
  interval: "monthly" | "quarterly";
  status: string;
  priceId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string | null;
  metadata?: Record<string, unknown>;
};

type BillingEventRecordParams = {
  event: Stripe.Event;
  userId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  sessionId?: string | null;
};

type RecurringPurchaseMetadata = ForgePurchaseMetadata & {
  purchaseType: "subscription" | "cloud_storage";
  interval: "monthly" | "quarterly";
};

type CheckoutFulfillmentContext = ForgePurchaseMetadata & {
  customerId: string;
  customerEmail: string | null;
  customerName: string | null;
  eventId: string;
  sessionId: string;
  sessionMode: string | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentStatus: string | null;
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

function normalizeLowerString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return normalizeString(customer);
  return normalizeString(customer.id);
}

function normalizeSubscriptionId(
  subscription: string | Stripe.Subscription | null,
): string | null {
  if (!subscription) return null;
  if (typeof subscription === "string") return normalizeString(subscription);
  return normalizeString(subscription.id);
}

function normalizePaymentIntentId(
  paymentIntent: string | Stripe.PaymentIntent | null,
): string | null {
  if (!paymentIntent) return null;
  if (typeof paymentIntent === "string") return normalizeString(paymentIntent);
  return normalizeString(paymentIntent.id);
}

function normalizeUnixTimestampIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

const STRIPE_ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg",
  "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

const STRIPE_THREE_DECIMAL_CURRENCIES = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

function stripeMinorUnitsToCurrencyMicros(amount: number, currency: string): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Stripe amount must be a non-negative safe integer");
  }
  const normalizedCurrency = currency.toLowerCase();
  const multiplier = STRIPE_ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency)
    ? 1_000_000
    : STRIPE_THREE_DECIMAL_CURRENCIES.has(normalizedCurrency)
    ? 1_000
    : 10_000;
  const micros = amount * multiplier;
  if (!Number.isSafeInteger(micros)) {
    throw new Error("Stripe amount exceeds safe currency-micros range");
  }
  return micros;
}

function readMetadataUserId(
  metadata: Record<string, unknown> | Stripe.Metadata | null | undefined,
): string | null {
  return normalizeString(metadata?.supabase_user_id)
    ?? normalizeString(metadata?.forge_user_id);
}

function getTongsRpcClient(supabase: SupabaseAdminClient): TongsRpcClient {
  return supabase.schema("tongs") as unknown as TongsRpcClient;
}

function getTongsTableClient(supabase: SupabaseAdminClient): TongsTableClient {
  return supabase.schema("tongs") as unknown as TongsTableClient;
}

function buildBillingEventPayload(event: Stripe.Event): Record<string, unknown> {
  return JSON.parse(JSON.stringify({
    id: event.id,
    type: event.type,
    api_version: event.api_version ?? null,
    created: event.created ?? null,
    livemode: event.livemode ?? null,
    request: event.request ?? null,
    data: event.data ?? null,
  })) as Record<string, unknown>;
}

function mergeMetadataWithResolvedUserId(
  metadata: Record<string, unknown> | Stripe.Metadata | null | undefined,
  userId: string,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    supabase_user_id: userId,
    forge_user_id: userId,
  };
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
    offerId: context.offerId,
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
  offerId: ForgePurchaseMetadata["offerId"];
  itemId: string;
  interval: ForgePurchaseMetadata["interval"];
  userId: string | null;
  source: ForgePurchaseMetadata["source"];
}): void {
  console.log("[stripe-webhook] subscription lifecycle branch", {
    purchaseType: args.purchaseType,
    offerId: args.offerId,
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

async function fetchStripeCustomerContext(
  customerId: string,
): Promise<{ userId: string | null; email: string | null; customerName: string | null }> {
  const customer = await stripe.customers.retrieve(customerId);
  if (typeof customer === "string" || customer.deleted) {
    return { userId: null, email: null, customerName: null };
  }

  return {
    userId: readMetadataUserId(customer.metadata),
    email: normalizeString(customer.email),
    customerName: normalizeString(customer.name),
  };
}

async function resolveUserIdByCustomerId(
  supabase: SupabaseAdminClient,
  customerId: string,
): Promise<string | null> {
  const tongs = getTongsTableClient(supabase);

  const { data: billingCustomer, error: billingCustomerError } = await tongs
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (billingCustomerError) {
    throw new Error(
      `billing_customers lookup failed for stripe_customer_id=${customerId}: ${billingCustomerError.message}`,
    );
  }

  if (billingCustomer?.user_id) {
    return billingCustomer.user_id;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `profiles lookup failed for stripe_customer_id=${customerId}: ${profileError.message}`,
    );
  }

  if (profile?.user_id) {
    return profile.user_id;
  }

  const stripeCustomer = await fetchStripeCustomerContext(customerId);
  return stripeCustomer.userId;
}

function parsePurchaseMetadataWithResolvedUserId(args: {
  metadata: Record<string, unknown> | Stripe.Metadata | null | undefined;
  mode: string | null;
  userId: string;
}): ForgePurchaseMetadata {
  return parseForgePurchaseMetadata({
    metadata: mergeMetadataWithResolvedUserId(args.metadata, args.userId),
    mode: args.mode,
    allowLegacyFallback: true,
  });
}

function toRecurringPurchaseMetadata(
  metadata: ForgePurchaseMetadata,
): RecurringPurchaseMetadata {
  if (metadata.purchaseType === "ai_credits" || metadata.interval === "one_time") {
    throw new Error(
      `Expected recurring billing metadata, received purchase_type=${metadata.purchaseType} interval=${metadata.interval}`,
    );
  }
  return metadata as RecurringPurchaseMetadata;
}

function tryBuildSubscriptionMetadataFromCatalog(
  subscription: Stripe.Subscription,
  userId: string,
): ForgePurchaseMetadata | null {
  const priceId = normalizeString(subscription.items.data[0]?.price?.id);
  const productId = normalizeString(subscription.items.data[0]?.price?.product);
  const catalogPrice = priceId
    ? findStripeCatalogPriceById(priceId)
    : findStripeCatalogPriceByProductId(productId);
  if (!catalogPrice) return null;

  return parsePurchaseMetadataWithResolvedUserId({
    metadata: buildForgeCheckoutMetadata({
      userId,
      catalogPrice,
    }),
    mode: "subscription",
    userId,
  });
}

async function resolveSubscriptionMetadata(
  supabase: SupabaseAdminClient,
  subscription: Stripe.Subscription,
): Promise<ForgePurchaseMetadata> {
  const customerId = normalizeCustomerId(subscription.customer);
  if (!customerId) {
    throw new Error("customer.subscription event missing customer");
  }

  const metadataUserId = readMetadataUserId(subscription.metadata);
  const resolvedUserId = metadataUserId
    ?? await resolveUserIdByCustomerId(supabase, customerId);

  if (!resolvedUserId) {
    throw new Error(
      `Unable to resolve Forge user for stripe_subscription_id=${subscription.id}`,
    );
  }

  try {
    return parsePurchaseMetadataWithResolvedUserId({
      metadata: subscription.metadata,
      mode: "subscription",
      userId: resolvedUserId,
    });
  } catch (error) {
    const catalogDerived = tryBuildSubscriptionMetadataFromCatalog(
      subscription,
      resolvedUserId,
    );
    if (catalogDerived) {
      return catalogDerived;
    }
    throw error;
  }
}

async function parseCheckoutFulfillmentContext(
  supabase: SupabaseAdminClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<CheckoutFulfillmentContext> {
  const customerId = normalizeCustomerId(session.customer ?? null);
  if (!customerId) {
    throw new Error("checkout.session.completed missing customer");
  }

  const resolvedUserId = readMetadataUserId(session.metadata)
    ?? normalizeString(session.client_reference_id)
    ?? await resolveUserIdByCustomerId(supabase, customerId);

  if (!resolvedUserId) {
    throw new Error(
      `Unable to resolve Forge user for checkout.session.completed customer=${customerId}`,
    );
  }

  const parsed = parsePurchaseMetadataWithResolvedUserId({
    metadata: session.metadata,
    mode: normalizeString(session.mode),
    userId: resolvedUserId,
  });

  return {
    ...parsed,
    customerId,
    customerEmail: normalizeString(session.customer_details?.email),
    customerName: normalizeString(session.customer_details?.name),
    eventId: event.id,
    sessionId: session.id,
    sessionMode: normalizeString(session.mode),
    subscriptionId: normalizeSubscriptionId(session.subscription ?? null),
    paymentIntentId: normalizePaymentIntentId(session.payment_intent ?? null),
    amountTotal: typeof session.amount_total === "number"
      ? session.amount_total
      : null,
    currency: normalizeLowerString(session.currency),
    paymentStatus: normalizeLowerString(session.payment_status),
  };
}

async function runTongsRpc(
  supabase: SupabaseAdminClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const rpcClient = getTongsRpcClient(supabase);
  const { data, error } = await rpcClient.rpc(fn, args);
  if (error) {
    throw new Error(`${fn} failed: ${error.message ?? "unknown error"}`);
  }
  return data;
}

async function upsertBillingCustomerRecord(
  supabase: SupabaseAdminClient,
  params: BillingCustomerUpsertParams,
): Promise<void> {
  await runTongsRpc(supabase, "upsert_billing_customer", {
    p_user_id: params.userId,
    p_stripe_customer_id: params.customerId,
    p_email: params.email ?? null,
    p_customer_name: params.customerName ?? null,
    p_metadata: params.metadata ?? {},
  });
}

async function upsertBillingOneTimePurchaseRecord(
  supabase: SupabaseAdminClient,
  params: BillingOneTimePurchaseUpsertParams,
): Promise<void> {
  await runTongsRpc(supabase, "upsert_billing_one_time_purchase", {
    p_user_id: params.userId,
    p_stripe_customer_id: params.customerId,
    p_stripe_event_id: params.eventId,
    p_stripe_session_id: params.sessionId,
    p_purchase_type: params.purchaseType,
    p_item_id: params.itemId,
    p_status: params.status,
    p_payment_intent_id: params.paymentIntentId ?? null,
    p_amount_total: params.amountTotal ?? null,
    p_currency: params.currency ?? null,
    p_metadata: params.metadata ?? {},
  });
}

async function upsertBillingSubscriptionRecord(
  supabase: SupabaseAdminClient,
  params: BillingSubscriptionUpsertParams,
): Promise<void> {
  await runTongsRpc(supabase, "upsert_billing_subscription", {
    p_user_id: params.userId,
    p_stripe_customer_id: params.customerId,
    p_stripe_subscription_id: params.subscriptionId,
    p_purchase_type: params.purchaseType,
    p_item_id: params.itemId,
    p_interval: params.interval,
    p_status: params.status,
    p_price_id: params.priceId ?? null,
    p_current_period_start: params.currentPeriodStart ?? null,
    p_current_period_end: params.currentPeriodEnd ?? null,
    p_cancel_at_period_end: params.cancelAtPeriodEnd ?? false,
    p_canceled_at: params.canceledAt ?? null,
    p_metadata: params.metadata ?? {},
  });
}

async function recordBillingEventRecord(
  supabase: SupabaseAdminClient,
  params: BillingEventRecordParams,
): Promise<void> {
  await runTongsRpc(supabase, "record_billing_event", {
    p_stripe_event_id: params.event.id,
    p_event_type: params.event.type,
    p_user_id: params.userId ?? null,
    p_stripe_customer_id: params.customerId ?? null,
    p_stripe_subscription_id: params.subscriptionId ?? null,
    p_stripe_session_id: params.sessionId ?? null,
    p_livemode: params.event.livemode,
    p_payload: buildBillingEventPayload(params.event),
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
  await runTongsRpc(supabase, "grant_ai_credits", {
    p_user_id: params.userId,
    p_pack_id: params.itemId,
    p_tokens: params.tokens,
    p_event_id: params.eventId,
    p_session_id: params.sessionId,
    p_amount_total: params.amountTotal,
    p_currency: params.currency,
  });
}

async function recordCustomerDepositAccounting(
  supabase: SupabaseAdminClient,
  params: {
    event: Stripe.Event;
    userId: string;
    sessionId: string;
    paymentIntentId: string | null;
    itemId: string;
    amountTotal: number;
    currency: string;
    creditUnits: number;
  },
): Promise<void> {
  await runTongsRpc(supabase, "record_customer_deposit", {
    p_deposit_id: crypto.randomUUID(),
    p_user_id: params.userId,
    p_stripe_event_id: params.event.id,
    p_stripe_session_id: params.sessionId,
    p_stripe_payment_intent_id: params.paymentIntentId,
    p_livemode: params.event.livemode,
    p_pack_id: params.itemId,
    p_gross_amount_micros: stripeMinorUnitsToCurrencyMicros(
      params.amountTotal,
      params.currency,
    ),
    p_currency: params.currency,
    p_credit_units: params.creditUnits,
    p_received_at: normalizeUnixTimestampIso(params.event.created)
      ?? new Date().toISOString(),
    p_metadata_json: {
      source: "stripe_webhook",
      event_type: params.event.type,
    },
  });
}

async function recordSubscriptionReceiptAccounting(
  supabase: SupabaseAdminClient,
  params: {
    event: Stripe.Event;
    invoice: Stripe.Invoice;
    subscription: Stripe.Subscription;
    userId: string;
    subscriptionId: string;
    metadata: RecurringPurchaseMetadata;
  },
): Promise<{ receiptId: string; stripeMode: "live" | "test"; replay: boolean } | null> {
  const amountPaid = params.invoice.amount_paid;
  const currency = normalizeLowerString(params.invoice.currency);
  const servicePeriod = resolveInvoiceServicePeriod(
    params.invoice,
    params.subscription,
    params.subscriptionId,
  );
  const periodStart = normalizeUnixTimestampIso(servicePeriod?.start);
  const periodEnd = normalizeUnixTimestampIso(servicePeriod?.end);
  if (!Number.isSafeInteger(amountPaid) || amountPaid <= 0 || !currency) return null;
  if (!periodStart || !periodEnd) {
    throw new Error(`invoice.paid missing cycle period for invoice=${params.invoice.id}`);
  }
  const result = await runTongsRpc(supabase, "record_subscription_cycle_receipt", {
    p_receipt_id: crypto.randomUUID(),
    p_user_id: params.userId,
    p_stripe_event_id: params.event.id,
    p_stripe_invoice_id: params.invoice.id,
    p_stripe_subscription_id: params.subscriptionId,
    p_stripe_payment_intent_id: normalizePaymentIntentId(
      params.invoice.payment_intent ?? null,
    ),
    p_livemode: params.event.livemode,
    p_purchase_type: params.metadata.purchaseType,
    p_plan_item_id: params.metadata.itemId,
    p_gross_amount_micros: stripeMinorUnitsToCurrencyMicros(amountPaid, currency),
    p_currency: currency,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_received_at: normalizeUnixTimestampIso(params.event.created)
      ?? new Date().toISOString(),
    p_metadata_json: {
      source: "stripe_webhook",
      event_type: params.event.type,
      forge_offer_id: params.metadata.offerId,
      forge_interval: params.metadata.interval,
    },
  });
  const record = result && typeof result === "object"
    ? result as Record<string, unknown>
    : null;
  const receiptId = normalizeString(record?.receipt_id);
  const stripeMode = record?.stripe_mode === "live" || record?.stripe_mode === "test"
    ? record.stripe_mode
    : null;
  if (!receiptId || !stripeMode) {
    throw new Error(`record_subscription_cycle_receipt returned an invalid result for invoice=${params.invoice.id}`);
  }
  return {
    receiptId,
    stripeMode,
    replay: record?.replay === true,
  };
}

async function resolveRefundPaymentIntentId(refund: Stripe.Refund): Promise<string | null> {
  const direct = normalizePaymentIntentId(refund.payment_intent ?? null);
  if (direct) return direct;
  const chargeId = typeof refund.charge === "string"
    ? refund.charge
    : normalizeString(refund.charge?.id);
  if (!chargeId) return null;
  const charge = await stripe.charges.retrieve(chargeId);
  return normalizePaymentIntentId(charge.payment_intent ?? null);
}

async function recordStripeAdjustmentAccounting(
  supabase: SupabaseAdminClient,
  params: {
    event: Stripe.Event;
    providerObjectId: string;
    paymentIntentId: string;
    adjustmentType: "refund" | "dispute" | "payment_reversal";
    amount: number;
    currency: string;
    evidence: Record<string, unknown>;
  },
): Promise<void> {
  await runTongsRpc(supabase, "record_stripe_adjustment_accounting", {
    p_record_id: crypto.randomUUID(),
    p_stripe_refund_id: params.providerObjectId,
    p_stripe_event_id: params.event.id,
    p_stripe_payment_intent_id: params.paymentIntentId,
    p_adjustment_type: params.adjustmentType,
    p_livemode: params.event.livemode,
    p_amount_micros: stripeMinorUnitsToCurrencyMicros(params.amount, params.currency),
    p_currency: params.currency,
    p_recorded_at: normalizeUnixTimestampIso(params.event.created)
      ?? new Date().toISOString(),
    p_evidence_json: params.evidence,
  });
}

async function upsertCanonicalSubscriptionFromStripe(
  supabase: SupabaseAdminClient,
  params: {
    event: Stripe.Event;
    subscription: Stripe.Subscription;
    metadata: RecurringPurchaseMetadata;
    customerEmail?: string | null;
    customerName?: string | null;
  },
): Promise<void> {
  const customerId = normalizeCustomerId(params.subscription.customer);
  if (!customerId) {
    throw new Error("customer.subscription event missing customer");
  }

  const subscriptionId = normalizeSubscriptionId(params.subscription);
  if (!subscriptionId) {
    throw new Error("customer.subscription event missing subscription id");
  }

  const stripeCustomer = (!params.customerEmail || !params.customerName)
    ? await fetchStripeCustomerContext(customerId)
    : null;

  await upsertBillingCustomerRecord(supabase, {
    userId: params.metadata.supabaseUserId,
    customerId,
    email: params.customerEmail ?? stripeCustomer?.email ?? null,
    customerName: params.customerName ?? stripeCustomer?.customerName ?? null,
    metadata: {
      source: "stripe_webhook",
      event_type: params.event.type,
      forge_purchase_type: params.metadata.purchaseType,
      forge_offer_id: params.metadata.offerId,
      forge_item_id: params.metadata.itemId,
      forge_interval: params.metadata.interval,
      metadata_source: params.metadata.source,
    },
  });

  await upsertBillingSubscriptionRecord(supabase, {
    userId: params.metadata.supabaseUserId,
    customerId,
    subscriptionId,
    purchaseType: params.metadata.purchaseType,
    itemId: params.metadata.itemId,
    interval: params.metadata.interval,
    status: normalizeLowerString(params.subscription.status) ?? "unknown",
    priceId: normalizeString(params.subscription.items.data[0]?.price?.id),
    currentPeriodStart: normalizeUnixTimestampIso(params.subscription.current_period_start),
    currentPeriodEnd: normalizeUnixTimestampIso(params.subscription.current_period_end),
    cancelAtPeriodEnd: params.subscription.cancel_at_period_end ?? false,
    canceledAt: normalizeUnixTimestampIso(params.subscription.canceled_at),
    metadata: {
      source: "stripe_webhook",
      event_type: params.event.type,
      forge_offer_id: params.metadata.offerId,
      metadata_source: params.metadata.source,
    },
  });

  await recordBillingEventRecord(supabase, {
    event: params.event,
    userId: params.metadata.supabaseUserId,
    customerId,
    subscriptionId,
  });
}

async function fulfillAiCreditsCheckout(
  supabase: SupabaseAdminClient,
  context: CheckoutFulfillmentContext,
  event: Stripe.Event,
): Promise<void> {
  logCheckoutFulfillmentBranch("ai_credits", context);

  const tokens = resolveAiPackTokens(context.itemId);
  if (!tokens) {
    throw new Error(`Unsupported AI credits forge_item_id: ${context.itemId}`);
  }
  if (context.paymentStatus !== "paid") {
    throw new Error(`AI credits checkout is not paid: ${context.paymentStatus ?? "unknown"}`);
  }
  const amountTotal = context.amountTotal;
  const currency = context.currency;
  if (typeof amountTotal !== "number" || !Number.isSafeInteger(amountTotal) || amountTotal <= 0) {
    throw new Error("AI credits checkout is missing a positive amount_total");
  }
  if (!currency) {
    throw new Error("AI credits checkout is missing currency");
  }

  await upsertBillingCustomerRecord(supabase, {
    userId: context.supabaseUserId,
    customerId: context.customerId,
    email: context.customerEmail,
    customerName: context.customerName,
    metadata: {
      source: "stripe_webhook",
      event_type: event.type,
      forge_purchase_type: context.purchaseType,
      forge_offer_id: context.offerId,
      forge_item_id: context.itemId,
      forge_interval: context.interval,
      metadata_source: context.source,
    },
  });

  await recordCustomerDepositAccounting(supabase, {
    event,
    userId: context.supabaseUserId,
    sessionId: context.sessionId,
    paymentIntentId: context.paymentIntentId,
    itemId: context.itemId,
    amountTotal,
    currency,
    creditUnits: tokens,
  });

  // Keep the pre-foundation execution balance working only for live receipts.
  // Test-mode value remains isolated in the new accounting journal. This
  // compatibility grant is removed when the shared spending gate is activated.
  if (event.livemode === true) {
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

  await upsertBillingOneTimePurchaseRecord(supabase, {
    userId: context.supabaseUserId,
    customerId: context.customerId,
    eventId: context.eventId,
    sessionId: context.sessionId,
    purchaseType: "ai_credits",
    itemId: context.itemId,
    status: "paid",
    paymentIntentId: context.paymentIntentId,
    amountTotal: context.amountTotal,
    currency: context.currency,
    metadata: {
      source: "stripe_webhook",
      event_type: event.type,
      forge_offer_id: context.offerId,
      metadata_source: context.source,
    },
  });

  await recordBillingEventRecord(supabase, {
    event,
    userId: context.supabaseUserId,
    customerId: context.customerId,
    sessionId: context.sessionId,
  });
}

async function fulfillSubscriptionCheckout(
  supabase: SupabaseAdminClient,
  context: CheckoutFulfillmentContext,
  event: Stripe.Event,
): Promise<void> {
  logCheckoutFulfillmentBranch("subscription", context);

  if (!context.subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(context.subscriptionId);
  await upsertCanonicalSubscriptionFromStripe(supabase, {
    event,
    subscription,
    metadata: toRecurringPurchaseMetadata(context),
    customerEmail: context.customerEmail,
    customerName: context.customerName,
  });
}

async function fulfillCloudStorageCheckout(
  supabase: SupabaseAdminClient,
  context: CheckoutFulfillmentContext,
  event: Stripe.Event,
): Promise<void> {
  logCheckoutFulfillmentBranch("cloud_storage", context);

  if (!context.subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(context.subscriptionId);
  await upsertCanonicalSubscriptionFromStripe(supabase, {
    event,
    subscription,
    metadata: toRecurringPurchaseMetadata(context),
    customerEmail: context.customerEmail,
    customerName: context.customerName,
  });
}

async function fulfillCompletedCheckout(
  supabase: SupabaseAdminClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const context = await parseCheckoutFulfillmentContext(supabase, event, session);

  switch (context.purchaseType) {
    case "subscription":
      await fulfillSubscriptionCheckout(supabase, context, event);
      return;
    case "ai_credits":
      await fulfillAiCreditsCheckout(supabase, context, event);
      return;
    case "cloud_storage":
      await fulfillCloudStorageCheckout(supabase, context, event);
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

  const metadata = await resolveSubscriptionMetadata(supabase, subscription);

  logSubscriptionLifecycleBranch({
    eventId: event.id,
    subscriptionId: normalizeSubscriptionId(subscription),
    customerId,
    purchaseType: metadata.purchaseType,
    offerId: metadata.offerId,
    itemId: metadata.itemId,
    interval: metadata.interval,
    userId: metadata.supabaseUserId,
    source: metadata.source,
  });

  if (metadata.purchaseType === "ai_credits") {
    throw new Error(
      "Recurring subscription lifecycle received unsupported purchase_type=ai_credits",
    );
  }

  await upsertCanonicalSubscriptionFromStripe(supabase, {
    event,
    subscription,
    metadata: toRecurringPurchaseMetadata(metadata),
  });
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

  const metadata = await resolveSubscriptionMetadata(supabase, subscription);

  logSubscriptionLifecycleBranch({
    eventId: event.id,
    subscriptionId: normalizeSubscriptionId(subscription),
    customerId,
    purchaseType: metadata.purchaseType,
    offerId: metadata.offerId,
    itemId: metadata.itemId,
    interval: metadata.interval,
    userId: metadata.supabaseUserId,
    source: metadata.source,
  });

  if (metadata.purchaseType === "ai_credits") {
    throw new Error(
      "Subscription deletion received unsupported purchase_type=ai_credits",
    );
  }

  await upsertCanonicalSubscriptionFromStripe(supabase, {
    event,
    subscription,
    metadata: toRecurringPurchaseMetadata(metadata),
  });
}

async function handleInvoiceLifecycleEvent(
  supabase: SupabaseAdminClient,
  event: Stripe.Event,
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId = normalizeCustomerId(invoice.customer ?? null);
  if (!customerId) {
    throw new Error(`${event.type} missing customer`);
  }

  const subscriptionId = resolveInvoiceSubscriptionId(invoice);
  const userId = await resolveUserIdByCustomerId(supabase, customerId);

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const metadata = toRecurringPurchaseMetadata(
      await resolveSubscriptionMetadata(supabase, subscription),
    );
    let accountingReceipt: Awaited<ReturnType<typeof recordSubscriptionReceiptAccounting>> = null;
    if (event.type === "invoice.paid") {
      accountingReceipt = await recordSubscriptionReceiptAccounting(supabase, {
        event,
        invoice,
        subscription,
        userId: metadata.supabaseUserId,
        subscriptionId,
        metadata,
      });
    }
    await upsertCanonicalSubscriptionFromStripe(supabase, {
      event,
      subscription,
      metadata,
    });
    if (
      accountingReceipt
      && accountingReceipt.stripeMode === "live"
      && metadata.purchaseType === "subscription"
    ) {
      await runTongsRpc(supabase, "grant_legacy_plan_entitlement_compatibility", {
        p_compatibility_grant_id: crypto.randomUUID(),
        p_receipt_id: accountingReceipt.receiptId,
        p_granted_at: normalizeUnixTimestampIso(event.created) ?? new Date().toISOString(),
        p_metadata_json: {
          source: "stripe_webhook",
          event_type: event.type,
          compatibility_only: true,
          eligible_for_shared_spending_gate: false,
        },
      });
    }
    return;
  }

  await recordBillingEventRecord(supabase, {
    event,
    userId,
    customerId,
    subscriptionId: null,
    sessionId: null,
  });
}

async function handleRefundCreatedEvent(
  supabase: SupabaseAdminClient,
  event: Stripe.Event,
  refund: Stripe.Refund,
): Promise<void> {
  const paymentIntentId = await resolveRefundPaymentIntentId(refund);
  const currency = normalizeLowerString(refund.currency);
  if (!paymentIntentId || !currency) {
    throw new Error(`Unable to resolve payment intent or currency for refund=${refund.id}`);
  }
  await recordStripeAdjustmentAccounting(supabase, {
    event,
    providerObjectId: refund.id,
    paymentIntentId,
    adjustmentType: "refund",
    amount: refund.amount,
    currency,
    evidence: {
      source: "stripe_webhook",
      event_type: event.type,
      charge_id: typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null,
      reason: refund.reason ?? null,
      status: refund.status ?? null,
    },
  });
  await recordBillingEventRecord(supabase, { event });
}

async function handleChargeRefundedEvent(
  supabase: SupabaseAdminClient,
  event: Stripe.Event,
  charge: Stripe.Charge,
): Promise<void> {
  const paymentIntentId = normalizePaymentIntentId(charge.payment_intent ?? null);
  const currency = normalizeLowerString(charge.currency);
  if (!paymentIntentId || !currency) {
    throw new Error(`Unable to resolve payment intent or currency for charge=${charge.id}`);
  }
  for (const refund of charge.refunds?.data ?? []) {
    await recordStripeAdjustmentAccounting(supabase, {
      event,
      providerObjectId: refund.id,
      paymentIntentId,
      adjustmentType: "refund",
      amount: refund.amount,
      currency,
      evidence: {
        source: "stripe_webhook",
        event_type: event.type,
        charge_id: charge.id,
        reason: refund.reason ?? null,
        status: refund.status ?? null,
      },
    });
  }
  await recordBillingEventRecord(supabase, {
    event,
    customerId: normalizeCustomerId(charge.customer ?? null),
  });
}

async function handleDisputeCreatedEvent(
  supabase: SupabaseAdminClient,
  event: Stripe.Event,
  dispute: Stripe.Dispute,
): Promise<void> {
  let paymentIntentId = normalizePaymentIntentId(dispute.payment_intent ?? null);
  const chargeId = typeof dispute.charge === "string"
    ? dispute.charge
    : normalizeString(dispute.charge?.id);
  if (!paymentIntentId && chargeId) {
    const charge = await stripe.charges.retrieve(chargeId);
    paymentIntentId = normalizePaymentIntentId(charge.payment_intent ?? null);
  }
  const currency = normalizeLowerString(dispute.currency);
  if (!paymentIntentId || !currency) {
    throw new Error(`Unable to resolve payment intent or currency for dispute=${dispute.id}`);
  }
  await recordStripeAdjustmentAccounting(supabase, {
    event,
    providerObjectId: dispute.id,
    paymentIntentId,
    adjustmentType: "dispute",
    amount: dispute.amount,
    currency,
    evidence: {
      source: "stripe_webhook",
      event_type: event.type,
      charge_id: chargeId,
      reason: dispute.reason,
      status: dispute.status,
    },
  });
  await recordBillingEventRecord(supabase, { event });
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

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoiceLifecycleEvent(supabase, event, invoice);
        break;
      }

      case "refund.created": {
        const refund = event.data.object as Stripe.Refund;
        await handleRefundCreatedEvent(supabase, event, refund);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefundedEvent(supabase, event, charge);
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        await handleDisputeCreatedEvent(supabase, event, dispute);
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
