export type CustomerSpendingQuote = {
  quote_id: string;
  operation_id: string;
  quote_hash: string;
  request_fingerprint: string;
  currency: "USD";
  maximum_customer_charge_micros: number;
  failure_customer_charge_micros: 0;
  failure_terms: string;
  funding_eligible: boolean;
  funding_source: string;
  funding_label: string;
  model_display_name: string | null;
  provider_model_id: string | null;
  model_tradeoff_summary: string | null;
  catalog_revision: number | null;
  estimated_customer_charge_micros: number;
  maximum_owner_commitment_micros?: number;
  cost_components?: Record<string, number>;
  limits?: Record<string, number>;
  expires_at: string;
};

export type CustomerSpendingAcceptance = {
  quote_id: string;
  operation_id: string;
  quote_hash: string;
  request_fingerprint: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readCustomerSpendingQuote(payload: unknown): CustomerSpendingQuote | null {
  const root = object(payload);
  const error = object(root?.error);
  const details = object(error?.details);
  const row = object(error?.billing_quote) ?? object(details?.billing_quote) ?? object(root?.billing_quote);
  if (!row) return null;
  const maximum = Number(row.maximum_customer_charge_micros);
  const failure = Number(row.failure_customer_charge_micros);
  const expiresAt = string(row.expires_at);
  if (!string(row.quote_id) || !string(row.operation_id) || !string(row.quote_hash)
    || !string(row.request_fingerprint) || row.currency !== "USD"
    || !Number.isSafeInteger(maximum) || maximum < 0 || failure !== 0 || !expiresAt) return null;
  return {
    quote_id: string(row.quote_id),
    operation_id: string(row.operation_id),
    quote_hash: string(row.quote_hash),
    request_fingerprint: string(row.request_fingerprint),
    currency: "USD",
    maximum_customer_charge_micros: maximum,
    failure_customer_charge_micros: 0,
    failure_terms: string(row.failure_terms) || "Forge-caused and provider-caused failures cost you $0.",
    funding_eligible: row.funding_eligible === true,
    funding_source: string(row.funding_source) || "none",
    funding_label: string(row.funding_label) || "No verified eligible funds",
    model_display_name: string(row.model_display_name) || null,
    provider_model_id: string(row.provider_model_id) || null,
    model_tradeoff_summary: string(row.model_tradeoff_summary) || null,
    catalog_revision: Number.isSafeInteger(Number(row.catalog_revision)) ? Number(row.catalog_revision) : null,
    estimated_customer_charge_micros: Number.isSafeInteger(Number(row.estimated_customer_charge_micros))
      ? Number(row.estimated_customer_charge_micros) : maximum,
    ...(Number.isSafeInteger(Number(row.maximum_owner_commitment_micros)) && Number(row.maximum_owner_commitment_micros) >= 0
      ? { maximum_owner_commitment_micros: Number(row.maximum_owner_commitment_micros) }
      : {}),
    ...(object(row.cost_components)
      ? { cost_components: Object.fromEntries(Object.entries(object(row.cost_components)!).flatMap(([key, value]) => (
          Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? [[key, Number(value)]] : []
        ))) }
      : {}),
    ...(object(row.limits)
      ? { limits: Object.fromEntries(Object.entries(object(row.limits)!).flatMap(([key, value]) => (
          Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? [[key, Number(value)]] : []
        ))) }
      : {}),
    expires_at: expiresAt,
  };
}

export function customerSpendingAcceptance(quote: CustomerSpendingQuote): CustomerSpendingAcceptance {
  return {
    quote_id: quote.quote_id,
    operation_id: quote.operation_id,
    quote_hash: quote.quote_hash,
    request_fingerprint: quote.request_fingerprint,
  };
}

export function confirmCustomerSpendingQuote(quote: CustomerSpendingQuote): boolean {
  if (!quote.funding_eligible) return false;
  const maximum = (quote.maximum_customer_charge_micros / 1_000_000).toLocaleString("en-US", {
    style: "currency",
    currency: quote.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  const estimate = (quote.estimated_customer_charge_micros / 1_000_000).toLocaleString("en-US", {
    style: "currency", currency: quote.currency, minimumFractionDigits: 2, maximumFractionDigits: 6,
  });
  const ownerMaximum = quote.maximum_owner_commitment_micros == null ? null
    : (quote.maximum_owner_commitment_micros / 1_000_000).toLocaleString("en-US", {
        style: "currency", currency: quote.currency, minimumFractionDigits: 2, maximumFractionDigits: 6,
      });
  const componentLines = quote.cost_components
    ? Object.entries(quote.cost_components).map(([key, micros]) => (
        `${key === "aggregate_risk_micros" ? "shared aggregate risk exposure (not an owner expense)" : key.replaceAll("_", " ")}: ${(micros / 1_000_000).toLocaleString("en-US", {
          style: "currency", currency: quote.currency, minimumFractionDigits: 2, maximumFractionDigits: 6,
        })}`
      ))
    : [];
  return globalThis.confirm([
    quote.model_display_name ? `Model: ${quote.model_display_name}` : null,
    quote.model_tradeoff_summary || null,
    `Conservative estimate: ${estimate}`,
    `Maximum charge: ${maximum}`,
    ownerMaximum ? `Maximum owner research commitment: ${ownerMaximum}` : null,
    ...componentLines,
    `Funding: ${quote.funding_label}`,
    quote.failure_terms,
    `Quote expires: ${new Date(quote.expires_at).toLocaleString()}`,
    "Continue with this exact request?",
  ].filter(Boolean).join("\n\n"));
}

/**
 * Shared creator-facing quote decision. An ineligible quote never creates an
 * acceptance; it only offers navigation to the normal purchase screen. The
 * original quote is intentionally abandoned so the creator must request and
 * accept fresh terms after funding arrives.
 */
export function requestCustomerSpendingAcceptance(
  quote: CustomerSpendingQuote,
): CustomerSpendingAcceptance | null {
  if (quote.funding_eligible) {
    return confirmCustomerSpendingQuote(quote)
      ? customerSpendingAcceptance(quote)
      : null;
  }

  const shouldOpenBilling = globalThis.confirm([
    "This operation needs verified purchased credits or a funded paid-plan allowance.",
    quote.funding_label,
    "Stripe Test credits and legacy compatibility balances cannot fund a real provider call.",
    "Open Account & Billing to add credits? You will need to retry this action and accept a fresh quote after the payment is recorded.",
  ].join("\n\n"));
  if (!shouldOpenBilling) return null;

  const location = globalThis.location;
  if (location && typeof location.assign === "function") {
    const returnTo = `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
    location.assign(`/app/subscriptions?funding=required&return_to=${encodeURIComponent(returnTo)}`);
  }
  return null;
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(canonical);
  const row = object(value);
  if (!row) return String(value);
  return Object.fromEntries(Object.keys(row).sort().flatMap((key) => (
    typeof row[key] === "undefined" ? [] : [[key, canonical(row[key])]]
  )));
}

export async function deriveCustomerOperationId(prefix: string, payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(payload)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
  return `${prefix}:${fingerprint}`;
}
