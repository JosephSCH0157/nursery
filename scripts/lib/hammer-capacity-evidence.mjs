import { createHash } from "node:crypto";

export const HAMMER_CAPACITY_LIMITS = Object.freeze({
  netlifyCreditsMicrounits: 671_178,
  supabaseUncachedEgressBytes: 243_332_008,
  supabaseDatabaseBytes: 8 * 1_048_576,
  supabaseProDatabaseBytes: 8 * 1_073_741_824,
  maximumEvidenceAgeMs: 24 * 60 * 60 * 1_000,
});

const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (typeof source !== "string" || !/^\d+(?:\.\d+)?$/.test(source)) throw new Error(code);
  const [whole, fraction = ""] = source.split(".");
  const result = (BigInt(whole) * 1_000_000n) + BigInt(fraction.slice(0, 6).padEnd(6, "0"));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(code);
  return Number(result);
}
function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function metricSamples(body, name) {
  if (typeof body !== "string" || body.trim() === "") throw new Error("supabase_metrics_response_invalid");
  return body.split("\n")
    .filter((line) => line.startsWith(name) && (line[name.length] === "{" || /\s/.test(line[name.length] ?? "")))
    .map((line) => {
      const value = Number(line.match(/^\S+\s+([^\s]+)$/)?.[1]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`supabase_${name}_invalid`);
      return value;
    });
}

export function parseNetlifyCapacity(accountPayload, creditsPayload) {
  const account = object(accountPayload, "netlify_account_response_invalid");
  const planName = String(account.type_name ?? account.plan_name ?? "").trim().toLowerCase();
  const planSlug = String(account.type_slug ?? account.plan_slug ?? "").trim().toLowerCase();
  if (planName !== "pro" && !/(^|[_-])pro($|[_-])/.test(planSlug)) throw new Error("netlify_pro_plan_unverified");
  const credits = object(creditsPayload, "netlify_credit_response_invalid");
  const planCredits = object(credits.plan_credits, "netlify_plan_credits_missing");
  const addonCredits = credits.credit_addons == null ? { available: 0 } : object(credits.credit_addons, "netlify_addon_credits_invalid");
  const remainingCreditsMicrounits = decimalMicrounits(planCredits.available, "netlify_plan_credit_balance_invalid")
    + decimalMicrounits(addonCredits.available ?? 0, "netlify_addon_credit_balance_invalid");
  if (!Number.isSafeInteger(remainingCreditsMicrounits)) throw new Error("netlify_credit_balance_invalid");
  return Object.freeze({ plan: "pro", remainingCreditsMicrounits });
}

export function parseSupabaseCapacity(metricsBody, databaseObservation, controlAttestation, observedAt) {
  const checkedAt = iso(observedAt, "capacity_observed_at_invalid");
  const checkedMs = Date.parse(checkedAt);
  const attestation = object(controlAttestation, "supabase_control_attestation_invalid");
  if (attestation.schema !== "forge.supabase.capacity-control-attestation.v1"
    || attestation.organizationSlug !== "nclurylekhseghlhrvxg"
    || attestation.projectRef !== "wtvdjndyxegudufrompx"
    || attestation.plan !== "pro"
    || attestation.spendCapEnabled !== true) throw new Error("supabase_control_attestation_invalid");
  if (!DATE.test(attestation.observedDate ?? "") || !DATE.test(attestation.validThroughExclusiveDate ?? "")) {
    throw new Error("supabase_control_attestation_date_invalid");
  }
  const attestedDayStart = Date.parse(`${attestation.observedDate}T00:00:00.000Z`);
  const validThrough = Date.parse(`${attestation.validThroughExclusiveDate}T00:00:00.000Z`);
  if (checkedMs < attestedDayStart || checkedMs >= validThrough || validThrough - attestedDayStart > 7 * 24 * 60 * 60 * 1_000) {
    throw new Error("supabase_control_attestation_expired");
  }
  const allowance = integer(attestation.uncachedEgressAllowanceBytes, "supabase_egress_allowance_invalid");
  const observedUsed = integer(attestation.observedUncachedEgressUsedBytes, "supabase_egress_baseline_invalid");
  const transmittedSamples = metricSamples(metricsBody, "node_network_transmit_bytes_total");
  const uptimeSamples = metricSamples(metricsBody, "runtime_uptime_milliseconds_total");
  const processStarts = metricSamples(metricsBody, "process_start_time_seconds");
  if (transmittedSamples.length === 0 || uptimeSamples.length === 0 || processStarts.length === 0) throw new Error("supabase_counter_continuity_unverified");
  const transmittedBytes = transmittedSamples.reduce((sum, value) => sum + Math.ceil(value), 0);
  if (!Number.isSafeInteger(transmittedBytes)) throw new Error("supabase_network_counter_invalid");
  const oldestRuntimeStart = Math.min(...processStarts.map((value) => value * 1_000), ...uptimeSamples.map((value) => checkedMs - value));
  if (oldestRuntimeStart > attestedDayStart) throw new Error("supabase_counter_continuity_unverified");

  const database = object(databaseObservation, "supabase_database_observation_invalid");
  const databaseUsedBytes = integer(database.database_used_bytes, "supabase_database_usage_invalid");
  const activeHammerOperationCount = integer(database.active_hammer_operation_count, "hammer_operation_count_invalid");
  if (activeHammerOperationCount !== 0) throw new Error("hammer_concurrency_capacity_unverified");
  const databaseObservedAt = iso(database.observed_at, "supabase_database_observed_at_invalid");
  const conservativeUsedEgressBytes = observedUsed + transmittedBytes;
  if (!Number.isSafeInteger(conservativeUsedEgressBytes)) throw new Error("supabase_egress_bound_invalid");
  return Object.freeze({
    plan: "pro",
    spendCapEnabled: true,
    remainingUncachedEgressBytes: Math.max(0, allowance - conservativeUsedEgressBytes),
    remainingDatabaseBytes: Math.max(0, HAMMER_CAPACITY_LIMITS.supabaseProDatabaseBytes - databaseUsedBytes),
    activeHammerOperationCount,
    databaseObservedAt,
    observedDate: attestation.observedDate,
    validThroughExclusiveDate: attestation.validThroughExclusiveDate,
    observedUsedUncachedEgressBytes: observedUsed,
    conservativeNetworkTransmitBytes: transmittedBytes,
    conservativeUsedUncachedEgressBytes: conservativeUsedEgressBytes,
    counterContinuityStart: new Date(oldestRuntimeStart).toISOString(),
    controlAttestationSha256: digest(attestation),
  });
}

export function fingerprintHammerCapacityEvidence(evidence) {
  return digest({ schema: "forge.hammer.assemblyai-capacity-evidence.v1", checked_at: evidence.checkedAt, expires_at: evidence.expiresAt, netlify: evidence.netlify, supabase: evidence.supabase, active_hammer_operation_count: evidence.activeHammerOperationCount });
}

export function buildHammerCapacityEvidence({ netlifyAccount, netlifyCredits, supabaseMetrics, supabaseControlAttestation, databaseObservation, observedAt, expiresAt, sourceReceipts }) {
  const checkedAt = iso(observedAt, "capacity_observed_at_invalid");
  const expiry = iso(expiresAt, "capacity_expires_at_invalid");
  const checkedMs = Date.parse(checkedAt);
  const expiryMs = Date.parse(expiry);
  if (expiryMs <= checkedMs || expiryMs - checkedMs > HAMMER_CAPACITY_LIMITS.maximumEvidenceAgeMs) throw new Error("capacity_evidence_window_invalid");
  const netlify = parseNetlifyCapacity(netlifyAccount, netlifyCredits);
  const parsedSupabase = parseSupabaseCapacity(supabaseMetrics, databaseObservation, supabaseControlAttestation, checkedAt);
  if (Date.parse(parsedSupabase.databaseObservedAt) > checkedMs || checkedMs - Date.parse(parsedSupabase.databaseObservedAt) > 5 * 60 * 1_000) throw new Error("supabase_database_observation_not_fresh");
  const receipts = object(sourceReceipts, "capacity_source_receipts_missing");
  for (const provider of ["netlify_account", "netlify_credits", "supabase_metrics"]) {
    const receipt = object(receipts[provider], `capacity_${provider}_receipt_missing`);
    if (!SHA256.test(receipt.response_sha256 ?? "")) throw new Error(`capacity_${provider}_receipt_hash_invalid`);
    const responseAt = Date.parse(iso(receipt.response_date, `capacity_${provider}_response_date_invalid`));
    if (responseAt > checkedMs || checkedMs - responseAt > 5 * 60 * 1_000) throw new Error(`capacity_${provider}_response_not_fresh`);
  }
  const evidenceWithoutHash = { checkedAt, expiresAt: expiry, netlify, supabase: { plan: parsedSupabase.plan, spendCapEnabled: parsedSupabase.spendCapEnabled, remainingUncachedEgressBytes: parsedSupabase.remainingUncachedEgressBytes, remainingDatabaseBytes: parsedSupabase.remainingDatabaseBytes }, activeHammerOperationCount: parsedSupabase.activeHammerOperationCount };
  const evidence = Object.freeze({ ...evidenceWithoutHash, evidenceSha256: fingerprintHammerCapacityEvidence(evidenceWithoutHash) });
  if (evidence.netlify.remainingCreditsMicrounits < HAMMER_CAPACITY_LIMITS.netlifyCreditsMicrounits) throw new Error("netlify_capacity_insufficient");
  if (evidence.supabase.remainingUncachedEgressBytes < HAMMER_CAPACITY_LIMITS.supabaseUncachedEgressBytes) throw new Error("supabase_egress_capacity_insufficient");
  if (evidence.supabase.remainingDatabaseBytes < HAMMER_CAPACITY_LIMITS.supabaseDatabaseBytes) throw new Error("supabase_database_capacity_insufficient");
  return Object.freeze({
    schema: "forge.hammer.capacity-observation.v3",
    evidence,
    provenance: Object.freeze({
      sources: receipts,
      supabaseControl: { observedDate: parsedSupabase.observedDate, validThroughExclusiveDate: parsedSupabase.validThroughExclusiveDate, attestationSha256: parsedSupabase.controlAttestationSha256 },
      supabaseEgressBound: { method: "owner_observed_usage_plus_full_current_network_counter", observedUsedBytes: parsedSupabase.observedUsedUncachedEgressBytes, fullNetworkTransmitCounterBytes: parsedSupabase.conservativeNetworkTransmitBytes, conservativeUsedBytes: parsedSupabase.conservativeUsedUncachedEgressBytes, counterContinuityStart: parsedSupabase.counterContinuityStart },
      responseBodiesRetained: false,
      credentialsRetained: false,
    }),
  });
}

export function responseReceipt(payload, responseDate) {
  return Object.freeze({ response_sha256: digest(payload), response_date: iso(responseDate, "response_date_invalid") });
}
