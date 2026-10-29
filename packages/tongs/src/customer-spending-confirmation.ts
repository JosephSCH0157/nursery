export type CustomerSpendingQuote = {
  quote_id: string;
  operation_id: string;
  quote_hash: string;
  request_fingerprint: string;
  credit_charge: number;
  failure_terms: string;
  funding_eligible: boolean;
  funding_label: string;
  model_display_name: string | null;
  model_tradeoff_summary: string | null;
  expires_at: string;
};

export type CustomerSpendingAcceptance = {
  quote_id: string;
  operation_id: string;
  quote_hash: string;
  request_fingerprint: string;
};

export type ScopedLiveFundingContext = {
  workspace_id: string;
  workpiece_id: string;
  route_code: "hammer.transcript_prep";
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
  const creditCharge = Number(row.credit_charge);
  const expiresAt = string(row.expires_at);
  if (!string(row.quote_id) || !string(row.operation_id) || !string(row.quote_hash)
    || !string(row.request_fingerprint)
    || !Number.isSafeInteger(creditCharge) || creditCharge < 0 || !expiresAt) return null;
  return {
    quote_id: string(row.quote_id),
    operation_id: string(row.operation_id),
    quote_hash: string(row.quote_hash),
    request_fingerprint: string(row.request_fingerprint),
    credit_charge: creditCharge,
    failure_terms: string(row.failure_terms) || "Failed operations do not consume Forge Credits.",
    funding_eligible: row.funding_eligible === true,
    funding_label: string(row.funding_label) || "Not enough Forge Credits",
    model_display_name: string(row.model_display_name) || null,
    model_tradeoff_summary: string(row.model_tradeoff_summary) || null,
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
  return globalThis.confirm([
    quote.model_display_name ? `Model: ${quote.model_display_name}` : null,
    quote.model_tradeoff_summary || null,
    `Cost: ${quote.credit_charge.toLocaleString("en-US")} ${quote.credit_charge === 1 ? "Credit" : "Credits"}`,
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
  scopedLiveFunding?: ScopedLiveFundingContext,
): CustomerSpendingAcceptance | null {
  if (quote.funding_eligible) {
    return confirmCustomerSpendingQuote(quote)
      ? customerSpendingAcceptance(quote)
      : null;
  }

  const shouldOpenBilling = globalThis.confirm([
    "Not enough Forge Credits for this operation.",
    quote.funding_label,
    "Legacy balances are historical and cannot fund provider calls.",
    "Review Account & Billing? You will need to retry this action and accept a fresh quote after funding is available.",
  ].join("\n\n"));
  if (!shouldOpenBilling) return null;

  const location = globalThis.location;
  if (location && typeof location.assign === "function") {
    const returnTo = `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
    const params = new URLSearchParams({ funding: "required", return_to: returnTo });
    if (scopedLiveFunding) {
      params.set("workspace_id", scopedLiveFunding.workspace_id);
      params.set("workpiece_id", scopedLiveFunding.workpiece_id);
      params.set("route_code", scopedLiveFunding.route_code);
    }
    location.assign(`/app/subscriptions?${params.toString()}`);
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
