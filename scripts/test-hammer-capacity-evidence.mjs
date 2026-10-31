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
const metrics = [
  "node_network_transmit_bytes_total{device=\"ens5\"} 10557615259",
  "process_start_time_seconds 1789285933.91",
  "runtime_uptime_milliseconds_total 3927449794",
].join("\n");
const attestation = {
  schema: "forge.supabase.capacity-control-attestation.v1",
  organizationSlug: "nclurylekhseghlhrvxg",
  projectRef: "wtvdjndyxegudufrompx",
  observedDate: "2026-10-29",
  validThroughExclusiveDate: "2026-11-05",
  plan: "pro",
  spendCapEnabled: true,
  uncachedEgressAllowanceBytes: 250_000_000_000,
  observedUncachedEgressUsedBytes: 676_500_000,
  authority: "owner-attested authenticated Supabase Billing Cost Control dashboard",
};
const database = { observed_at: "2026-10-31T00:59:59.000Z", database_used_bytes: 626_945_171, active_hammer_operation_count: 0 };
function receipts(date = "2026-10-31T00:59:58.000Z") {
  return {
    netlify_account: responseReceipt(netlifyAccount, date),
    netlify_credits: responseReceipt(netlifyCredits, date),
    supabase_metrics: responseReceipt(metrics, date),
  };
}
function build(overrides = {}) {
  return buildHammerCapacityEvidence({ netlifyAccount, netlifyCredits, supabaseMetrics: metrics, supabaseControlAttestation: attestation, databaseObservation: database, observedAt, expiresAt, sourceReceipts: receipts(), ...overrides });
}

test("Netlify authenticated credit response uses exact microunit arithmetic", () => {
  assert.deepEqual(parseNetlifyCapacity(netlifyAccount, netlifyCredits), { plan: "pro", remainingCreditsMicrounits: 2_700_900_000 });
  assert.equal(parseNetlifyCapacity(netlifyAccount, { plan_credits: { available: "2424.7293999066" } }).remainingCreditsMicrounits, 2_424_729_399);
  assert.throws(() => parseNetlifyCapacity({ type_name: "Free" }, netlifyCredits), /netlify_pro_plan_unverified/);
  assert.throws(() => parseNetlifyCapacity(netlifyAccount, { plan_credits: { available: "not-a-number" } }), /netlify_plan_credit_balance_invalid/);
});

test("Supabase supported telemetry produces a conservative egress lower bound", () => {
  const result = parseSupabaseCapacity(metrics, database, attestation, observedAt);
  assert.equal(result.spendCapEnabled, true);
  assert.equal(result.conservativeUsedUncachedEgressBytes, 11_234_115_259);
  assert.equal(result.remainingUncachedEgressBytes, 238_765_884_741);
  assert.equal(result.remainingDatabaseBytes, HAMMER_CAPACITY_LIMITS.supabaseProDatabaseBytes - 626_945_171);
});

test("counter continuity and the bounded Spend Cap attestation fail closed", () => {
  const restarted = "node_network_transmit_bytes_total 1\nprocess_start_time_seconds 1793410000\nruntime_uptime_milliseconds_total 1000";
  assert.throws(() => parseSupabaseCapacity(restarted, database, attestation, observedAt), /counter_continuity_unverified/);
  assert.throws(() => parseSupabaseCapacity(metrics, database, { ...attestation, spendCapEnabled: false }, observedAt), /control_attestation_invalid/);
  assert.throws(() => parseSupabaseCapacity(metrics, database, attestation, "2026-11-05T00:00:00.000Z"), /control_attestation_expired/);
  assert.throws(() => parseSupabaseCapacity(metrics, database, { ...attestation, validThroughExclusiveDate: "2026-11-06" }, observedAt), /control_attestation_expired/);
});

test("capacity evidence fingerprints fresh responses without retaining bodies", () => {
  const result = build();
  assert.equal(result.schema, "forge.hammer.capacity-observation.v3");
  assert.equal(result.evidence.netlify.remainingCreditsMicrounits, 2_700_900_000);
  assert.equal(result.evidence.supabase.remainingUncachedEgressBytes, 238_765_884_741);
  assert.equal(result.evidence.evidenceSha256, fingerprintHammerCapacityEvidence(result.evidence));
  assert.equal(result.provenance.supabaseEgressBound.method, "owner_observed_usage_plus_full_current_network_counter");
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

test("capacity shortfalls are rejected before authority renewal", () => {
  assert.throws(() => build({ netlifyCredits: { plan_credits: { available: "0.600000" } } }), /netlify_capacity_insufficient/);
  const exhausted = metrics.replace("10557615259", "249900000000");
  assert.throws(() => build({ supabaseMetrics: exhausted, sourceReceipts: { ...receipts(), supabase_metrics: responseReceipt(exhausted, "2026-10-31T00:59:58.000Z") } }), /supabase_egress_capacity_insufficient/);
  assert.throws(() => build({ databaseObservation: { ...database, database_used_bytes: HAMMER_CAPACITY_LIMITS.supabaseProDatabaseBytes - 1 } }), /supabase_database_capacity_insufficient/);
});
