export type OwnerPurchaseMode = "test" | "live";

export type OwnerWebhookEvent = {
  event_id: string;
  event_type: string;
  processed_at: string;
};

export type OwnerPurchaseActivity = {
  purchase_id: string;
  user_id: string;
  customer_email: string | null;
  customer_name: string | null;
  stripe_mode: OwnerPurchaseMode;
  purchase_type: "subscription" | "cloud_storage" | "ai_credits";
  item_id: string;
  interval: string;
  status: string;
  checkout_session_id: string | null;
  stripe_invoice_id: string | null;
  payment_status: string | null;
  checkout_currency: string | null;
  checkout_amount_minor: number | null;
  checkout_processed_at: string | null;
  accounting_receipt_id: string | null;
  accounted_cash_micros: number | null;
  accounting_currency: string | null;
  accounting_received_at: string | null;
  allowance_grant_count: number;
  allocated_revenue_micros: number;
  maximum_wholesale_spend_micros: number;
  recognized_revenue_micros: number;
  accounting_state: "cycle_receipt_recorded" | "deposit_receipt_recorded" | "invoice_receipt_pending" | "checkout_recorded" | "subscription_recorded";
  live_funding_eligible: boolean;
  signed_webhook_events: OwnerWebhookEvent[];
  observed_at: string;
};

export type OwnerPurchaseActivityResponse = {
  contract_version: "forge.owner-purchase-activity.v1" | "forge.owner-purchase-activity.v2";
  stripe_mode: OwnerPurchaseMode;
  purchases: OwnerPurchaseActivity[];
  contains_wholesale_costs: false;
  creates_accounting_entries: false;
  spending_activation_changed: false;
};

function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function formatCurrencyMinor(amountMinor: number | null, currency: string | null): string {
  if (amountMinor == null || !Number.isFinite(amountMinor) || !currency) return "Amount unavailable";
  const normalized = currency.toUpperCase();
  const amount = amountMinor / (10 ** currencyDigits(normalized));
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: normalized }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalized}`;
  }
}

export function formatCurrencyMicros(amountMicros: number, currency: string | null): string {
  if (!Number.isFinite(amountMicros) || !currency) return "Amount unavailable";
  const normalized = currency.toUpperCase();
  const amount = amountMicros / 1_000_000;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: normalized }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalized}`;
  }
}

export function ownerPurchaseAccountingLabel(purchase: OwnerPurchaseActivity): string {
  if (purchase.accounting_state === "cycle_receipt_recorded") return "Cycle receipt recorded";
  if (purchase.accounting_state === "deposit_receipt_recorded") return "Test deposit receipt recorded";
  if (purchase.accounting_state === "invoice_receipt_pending") return "Invoice receipt pending";
  if (purchase.accounting_state === "checkout_recorded") return "Checkout recorded; invoice not identified";
  return "Subscription recorded; checkout not identified";
}
