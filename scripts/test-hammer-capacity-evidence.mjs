import assert from "node:assert/strict";
import test from "node:test";
import {
  HAMMER_CAPACITY_LIMITS,
  buildHammerCapacityEvidence,
  fingerprintHammerCapacityEvidence,
  parseNetlifyCapacity,
  parseSupabaseCapacity,
  responseReceipt,
} from "./lib/hammer-capacity-evidence.mjs";

const observedAt = "2026-10-31T01:00:00.000Z";
const expiresAt = "2026-11-01T01:00:00.000Z";
const netlifyAccount = { type_name: "Pro", type_slug: "credit_pro" };
const netlifyCredits = { plan_credits: { available: "2700.900000" }, credit_addons: { available: "0" } };
const subscription = {
  plan: { id: "pro" },
  usage_billing_enabled: false,
  current_period_start: 1793404800,
  current_period_end: 1796083200,
};
const usage = { usages: [
  { date: "2026-10-30", metric: "EGRESS", usage_original: 676_500_000 },
  { date: "2026-10-30", metric: "CACHED_EGRESS", usage_original: 2_000_000 },
] };
const database = {
  observed_at: "2026-10-31T00:59:59.000Z",
  database_used_bytes: 626_945_171,
  active_hammer_operation_count: 0,
};
function receipts(date = "2026-10-31T00:59:58.000Z") {
  return {
    netlify_account: responseReceipt(netlifyAccount, date),
    netlify_credits: responseReceipt(netlifyCredits, date),
    supabase_subscription: responseReceipt(subscription, date),
    supabase_daily_usage: responseReceipt(usage, date),
  };
}
function build(overrides = {}) {
  return buildHammerCapacityEvidence({
    netlifyAccount,
    netlifyCredits,
    supabaseSubscription: subscription,
    supabaseDailyUsage: usage,
    databaseObservation: database,
    observedAt,
    expiresAt,
    sourceReceipts: receipts(),
    ...overrides,
  });
}

test("Netlify authenticated credit response is converted with exact microunit arithmetic", () => {
  assert.deepEqual(parseNetlifyCapacity(netlifyAccount, netlifyCredits), {
    plan: "pro",
    remainingCreditsMicrounits: 2_700_900_000,
  });
  assert.throws(() => parseNetlifyCapacity({ type_name: "Free" }, netlifyCredits), /netlify_pro_plan_unverified/);
  assert.throws(() => parseNetlifyCapacity(netlifyAccount, { plan_credits: { available: 1.0000001 } }), /netlify_plan_credit_balance_invalid/);
});

test("Supabase billing response proves Pro and Spend Cap while usage yields an exact decimal-byte bound", () => {
  const result = parseSupabaseCapacity(subscription, usage, database);
  assert.equal(result.spendCapEnabled, true);
  assert.equal(result.remainingUncachedEgressBytes, 249_323_500_000);
  assert.equal(result.remainingDatabaseBytes, HAMMER_CAPACITY_LIMITS.supabaseProDatabaseBytes - 626_945_171);
  assert.throws(() => parseSupabaseCapacity({ ...subscription, usage_billing_enabled: true }, usage, database), /supabase_spend_cap_unverified/);
  assert.throws(() => parseSupabaseCapacity(subscription, { usages: [] }, database), /supabase_uncached_egress_metric_missing/);
});

test("capacity evidence fingerprints authoritative response receipts without retaining response bodies", () => {
  const result = build();
  assert.equal(result.evidence.netlify.remainingCreditsMicrounits, 2_700_900_000);
  assert.equal(result.evidence.supabase.remainingUncachedEgressBytes, 249_323_500_000);
  assert.equal(result.evidence.supabase.spendCapEnabled, true);
  assert.equal(result.evidence.activeHammerOperationCount, 0);
  assert.equal(result.evidence.evidenceSha256, fingerprintHammerCapacityEvidence(result.evidence));
  assert.equal(result.provenance.responseBodiesRetained, false);
  assert.equal(result.provenance.credentialsRetained, false);
});

test("stale, future, incomplete, and concurrent observations fail closed", () => {
  assert.throws(() => build({ sourceReceipts: receipts("2026-10-31T00:54:59.999Z") }), /response_not_fresh/);
  assert.throws(() => build({ sourceReceipts: receipts("2026-10-31T01:00:00.001Z") }), /response_not_fresh/);
  assert.throws(() => build({ sourceReceipts: { ...receipts(), netlify_credits: { response_sha256: "bad", response_date: observedAt } } }), /receipt_hash_invalid/);
  assert.throws(() => build({ databaseObservation: { ...database, active_hammer_operation_count: 1 } }), /hammer_concurrency_capacity_unverified/);
  assert.throws(() => build({ databaseObservation: { ...database, observed_at: "2026-10-31T00:54:59.999Z" } }), /supabase_database_observation_not_fresh/);
});

test("plan capacity shortfalls are rejected before authority renewal", () => {
  assert.throws(() => build({ netlifyCredits: { plan_credits: { available: "0.600000" } } }), /netlify_capacity_insufficient/);
  assert.throws(() => build({ supabaseDailyUsage: { usages: [{ date: "2026-10-30", metric: "EGRESS", usage_original: 249_900_000_000 }] } }), /supabase_egress_capacity_insufficient/);
  assert.throws(() => build({ databaseObservation: { ...database, database_used_bytes: HAMMER_CAPACITY_LIMITS.supabaseProDatabaseBytes - 1 } }), /supabase_database_capacity_insufficient/);
});
