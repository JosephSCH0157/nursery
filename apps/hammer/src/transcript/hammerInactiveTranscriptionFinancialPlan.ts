import type { HammerCanonicalRecordingIdentityV2, HammerCertifiedTranscriptionProvider } from "@forge/contracts/hammer/canonical-transcript-v2.contract";

export type HammerTranscriptionCostEvidence = {
  evidenceId: string;
  provider: HammerCertifiedTranscriptionProvider;
  model: string;
  currency: "USD";
  supplierRateMicrosPerHour: number;
  billingIncrementMs: number;
  minimumBillableMs: number;
  supportingCostCeilingMicros: number;
  effectiveAt: string;
  reviewedAt: string;
};

export type HammerInactiveTranscriptionFinancialPlan = {
  schema: "forge.hammer.single-provider-transcription.inactive.v1";
  activation: "inactive";
  routeCode: "hammer.transcript_prep";
  recording: HammerCanonicalRecordingIdentityV2;
  provider: HammerCertifiedTranscriptionProvider;
  model: string;
  pricingEvidenceId: string;
  billableDurationMs: number;
  supplierCeilingMicros: number;
  supportingCostCeilingMicros: number;
  completeWholesaleCeilingMicros: number;
  targetCustomerValueMicros: number;
  customerCreditUnits: number;
  customerChargeMicros: number;
  markupNumerator: 133;
  markupDenominator: 100;
  maximumProviderAttempts: 1;
  quoteRequired: true;
  reservationRequiredBeforeProvider: true;
  canonicalPersistenceRequiredBeforeSettlement: true;
  idempotentReplayRequired: true;
  failureReliefRequired: true;
  supplierReconciliationRequired: true;
  providerExecutionAuthorized: false;
  publishable: false;
};

function positiveSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field}_invalid`);
  return value;
}

function nonNegativeSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field}_invalid`);
  return value;
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function safeNumber(value: bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${field}_unsafe`);
  return result;
}

export function buildInactiveHammerTranscriptionFinancialPlan(args: {
  recording: HammerCanonicalRecordingIdentityV2;
  provider: HammerCertifiedTranscriptionProvider;
  model: string;
  costEvidence: HammerTranscriptionCostEvidence;
}): HammerInactiveTranscriptionFinancialPlan {
  if (args.provider !== args.costEvidence.provider || args.model !== args.costEvidence.model) {
    throw new Error("transcription_cost_evidence_mismatch");
  }
  const durationMs = positiveSafeInteger(args.recording.duration_ms, "recording_duration_ms");
  const incrementMs = positiveSafeInteger(args.costEvidence.billingIncrementMs, "billing_increment_ms");
  const minimumMs = positiveSafeInteger(args.costEvidence.minimumBillableMs, "minimum_billable_ms");
  const rate = positiveSafeInteger(args.costEvidence.supplierRateMicrosPerHour, "supplier_rate_micros_per_hour");
  const supporting = nonNegativeSafeInteger(args.costEvidence.supportingCostCeilingMicros, "supporting_cost_ceiling");
  const duration = BigInt(durationMs);
  const increment = BigInt(incrementMs);
  const minimum = BigInt(minimumMs);
  const roundedDuration = ceilDivide(duration, increment) * increment;
  const billableDuration = roundedDuration > minimum ? roundedDuration : minimum;
  const supplierCeiling = ceilDivide(billableDuration * BigInt(rate), 3_600_000n);
  const completeWholesaleCeiling = supplierCeiling + BigInt(supporting);
  const targetCustomerValue = ceilDivide(completeWholesaleCeiling * 133n, 100n);
  const customerCredits = ceilDivide(targetCustomerValue, 5_000n);
  const billableDurationMs = safeNumber(billableDuration, "billable_duration_ms");
  const supplierCeilingMicros = safeNumber(supplierCeiling, "supplier_ceiling_micros");
  const completeWholesaleCeilingMicros = safeNumber(completeWholesaleCeiling, "complete_wholesale_ceiling_micros");
  const targetCustomerValueMicros = safeNumber(targetCustomerValue, "target_customer_value_micros");
  const customerCreditUnits = safeNumber(customerCredits, "customer_credit_units");
  return {
    schema: "forge.hammer.single-provider-transcription.inactive.v1",
    activation: "inactive",
    routeCode: "hammer.transcript_prep",
    recording: { ...args.recording },
    provider: args.provider,
    model: args.model,
    pricingEvidenceId: args.costEvidence.evidenceId,
    billableDurationMs,
    supplierCeilingMicros,
    supportingCostCeilingMicros: supporting,
    completeWholesaleCeilingMicros,
    targetCustomerValueMicros,
    customerCreditUnits,
    customerChargeMicros: safeNumber(customerCredits * 5_000n, "customer_charge_micros"),
    markupNumerator: 133,
    markupDenominator: 100,
    maximumProviderAttempts: 1,
    quoteRequired: true,
    reservationRequiredBeforeProvider: true,
    canonicalPersistenceRequiredBeforeSettlement: true,
    idempotentReplayRequired: true,
    failureReliefRequired: true,
    supplierReconciliationRequired: true,
    providerExecutionAuthorized: false,
    publishable: false,
  };
}

export function assertHammerTranscriptionProviderExecutionAuthorized(
  plan: HammerInactiveTranscriptionFinancialPlan,
): never {
  void plan;
  throw new Error("hammer_single_provider_transcription_inactive");
}
