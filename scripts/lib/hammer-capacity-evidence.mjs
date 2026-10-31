import { createHash } from "node:crypto";

export const HAMMER_CAPACITY_LIMITS = Object.freeze({
  netlifyCreditsMicrounits: 671_178,
  supabaseUncachedEgressBytes: 243_332_008,
  supabaseDatabaseBytes: 8 * 1_048_576,
  supabaseProUncachedEgressBytes: 250_000_000_000,
  supabaseProDatabaseBytes: 8 * 1_073_741_824,
  maximumEvidenceAgeMs: 24 * 60 * 60 * 1_000,
});

const SHA256 = /^[0-9a-f]{64}$/;

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value;
}

function text(value, code) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(code);
  return value.trim();
}

function iso(value, code) {
  const candidate = text(value, code);
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return new Date(parsed).toISOString();
}

function integer(value, code) {
  const candidate = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(candidate) || candidate < 0) throw new Error(code);
  return candidate;
}

function decimalMicrounits(value, code) {
  const source = typeof value === "number" ? String(value) : value;
  if (typeof source !== "string" || !/^\d+(?:\.\d{1,6})?$/.test(source)) throw new Error(code);
  const [whole, fraction = ""] = source.split(".");
  const result = (BigInt(whole) * 1_000_000n) + BigInt(fraction.padEnd(6, "0"));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(code);
  return Number(result);
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function parseNetlifyCapacity(accountPayload, creditsPayload) {
  const account = object(accountPayload, "netlify_account_response_invalid");
  const planName = String(account.type_name ?? account.plan_name ?? "").trim().toLowerCase();
  const planSlug = String(account.type_slug ?? account.plan_slug ?? "").trim().toLowerCase();
  if (planName !== "pro" && !/(^|[_-])pro($|[_-])/.test(planSlug)) {
    throw new Error("netlify_pro_plan_unverified");
  }
  const credits = object(creditsPayload, "netlify_credit_response_invalid");
  const planCredits = object(credits.plan_credits, "netlify_plan_credits_missing");
  const addonCredits = credits.credit_addons == null
    ? { available: 0 }
    : object(credits.credit_addons, "netlify_addon_credits_invalid");
  const remainingCreditsMicrounits = decimalMicrounits(planCredits.available, "netlify_plan_credit_balance_invalid")
    + decimalMicrounits(addonCredits.available ?? 0, "netlify_addon_credit_balance_invalid");
  if (!Number.isSafeInteger(remainingCreditsMicrounits)) throw new Error("netlify_credit_balance_invalid");
  return Object.freeze({ plan: "pro", remainingCreditsMicrounits });
}

export function parseSupabaseCapacity(subscriptionPayload, dailyUsagePayload, databaseObservation) {
  const subscription = object(subscriptionPayload, "supabase_subscription_response_invalid");
  const plan = object(subscription.plan, "supabase_plan_missing");
  if (plan.id !== "pro") throw new Error("supabase_pro_plan_unverified");
  if (subscription.usage_billing_enabled !== false) throw new Error("supabase_spend_cap_unverified");
  const currentPeriodStart = integer(subscription.current_period_start, "supabase_billing_period_start_invalid");
  const currentPeriodEnd = integer(subscription.current_period_end, "supabase_billing_period_end_invalid");
  if (currentPeriodEnd <= currentPeriodStart) throw new Error("supabase_billing_period_invalid");

  const daily = object(dailyUsagePayload, "supabase_daily_usage_response_invalid");
  if (!Array.isArray(daily.usages)) throw new Error("supabase_daily_usage_missing");
  const egressRows = daily.usages.filter((row) => object(row, "supabase_daily_usage_row_invalid").metric === "EGRESS");
  if (egressRows.length === 0) throw new Error("supabase_uncached_egress_metric_missing");
  let usedEgress = 0;
  for (const row of egressRows) {
    const usage = integer(row.usage_original, "supabase_uncached_egress_usage_invalid");
    usedEgress += usage;
    if (!Number.isSafeInteger(usedEgress)) throw new Error("supabase_uncached_egress_usage_invalid");
  }

  const database = object(databaseObservation, "supabase_database_observation_invalid");
  const databaseUsedBytes = integer(database.database_used_bytes, "supabase_database_usage_invalid");
  const activeHammerOperationCount = integer(database.active_hammer_operation_count, "hammer_operation_count_invalid");
  if (activeHammerOperationCount !== 0) throw new Error("hammer_concurrency_capacity_unverified");
  const databaseObservedAt = iso(database.observed_at, "supabase_database_observed_at_invalid");
  return Object.freeze({
    plan: "pro",
    spendCapEnabled: true,
    remainingUncachedEgressBytes: Math.max(0, HAMMER_CAPACITY_LIMITS.supabaseProUncachedEgressBytes - usedEgress),
    remainingDatabaseBytes: Math.max(0, HAMMER_CAPACITY_LIMITS.supabaseProDatabaseBytes - databaseUsedBytes),
    activeHammerOperationCount,
    databaseObservedAt,
    currentPeriodStart,
    currentPeriodEnd,
    usedUncachedEgressBytes: usedEgress,
  });
}

export function fingerprintHammerCapacityEvidence(evidence) {
  return digest({
    schema: "forge.hammer.assemblyai-capacity-evidence.v1",
    checked_at: evidence.checkedAt,
    expires_at: evidence.expiresAt,
    netlify: evidence.netlify,
    supabase: evidence.supabase,
    active_hammer_operation_count: evidence.activeHammerOperationCount,
  });
}

export function buildHammerCapacityEvidence({
  netlifyAccount,
  netlifyCredits,
  supabaseSubscription,
  supabaseDailyUsage,
  databaseObservation,
  observedAt,
  expiresAt,
  sourceReceipts,
}) {
  const checkedAt = iso(observedAt, "capacity_observed_at_invalid");
  const expiry = iso(expiresAt, "capacity_expires_at_invalid");
  const checkedMs = Date.parse(checkedAt);
  const expiryMs = Date.parse(expiry);
  if (expiryMs <= checkedMs || expiryMs - checkedMs > HAMMER_CAPACITY_LIMITS.maximumEvidenceAgeMs) {
    throw new Error("capacity_evidence_window_invalid");
  }
  const netlify = parseNetlifyCapacity(netlifyAccount, netlifyCredits);
  const parsedSupabase = parseSupabaseCapacity(supabaseSubscription, supabaseDailyUsage, databaseObservation);
  if (Date.parse(parsedSupabase.databaseObservedAt) > checkedMs || checkedMs - Date.parse(parsedSupabase.databaseObservedAt) > 5 * 60 * 1_000) {
    throw new Error("supabase_database_observation_not_fresh");
  }
  const receipts = object(sourceReceipts, "capacity_source_receipts_missing");
  for (const provider of ["netlify_account", "netlify_credits", "supabase_subscription", "supabase_daily_usage"]) {
    const receipt = object(receipts[provider], `capacity_${provider}_receipt_missing`);
    if (!SHA256.test(receipt.response_sha256 ?? "")) throw new Error(`capacity_${provider}_receipt_hash_invalid`);
    const responseAt = Date.parse(iso(receipt.response_date, `capacity_${provider}_response_date_invalid`));
    if (responseAt > checkedMs || checkedMs - responseAt > 5 * 60 * 1_000) throw new Error(`capacity_${provider}_response_not_fresh`);
  }
  const evidenceWithoutHash = {
    checkedAt,
    expiresAt: expiry,
    netlify,
    supabase: {
      plan: parsedSupabase.plan,
      spendCapEnabled: parsedSupabase.spendCapEnabled,
      remainingUncachedEgressBytes: parsedSupabase.remainingUncachedEgressBytes,
      remainingDatabaseBytes: parsedSupabase.remainingDatabaseBytes,
    },
    activeHammerOperationCount: parsedSupabase.activeHammerOperationCount,
  };
  const evidence = Object.freeze({
    ...evidenceWithoutHash,
    evidenceSha256: fingerprintHammerCapacityEvidence(evidenceWithoutHash),
  });
  if (evidence.netlify.remainingCreditsMicrounits < HAMMER_CAPACITY_LIMITS.netlifyCreditsMicrounits) throw new Error("netlify_capacity_insufficient");
  if (evidence.supabase.remainingUncachedEgressBytes < HAMMER_CAPACITY_LIMITS.supabaseUncachedEgressBytes) throw new Error("supabase_egress_capacity_insufficient");
  if (evidence.supabase.remainingDatabaseBytes < HAMMER_CAPACITY_LIMITS.supabaseDatabaseBytes) throw new Error("supabase_database_capacity_insufficient");
  return Object.freeze({
    schema: "forge.hammer.capacity-observation.v2",
    evidence,
    provenance: Object.freeze({
      sources: receipts,
      supabaseBillingPeriod: {
        startUnixSeconds: parsedSupabase.currentPeriodStart,
        endUnixSeconds: parsedSupabase.currentPeriodEnd,
      },
      observedSupabaseUncachedEgressBytes: parsedSupabase.usedUncachedEgressBytes,
      responseBodiesRetained: false,
      credentialsRetained: false,
    }),
  });
}

export function responseReceipt(payload, responseDate) {
  return Object.freeze({ response_sha256: digest(payload), response_date: iso(responseDate, "response_date_invalid") });
}
