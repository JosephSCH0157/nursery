import type { HammerCanonicalRecordingIdentityV2, HammerCertifiedTranscriptionProvider } from "@forge/contracts/hammer/canonical-transcript-v2.contract";

export type HammerTranscriptionCostEvidence = {
  evidenceId: string;
  provider: HammerCertifiedTranscriptionProvider;
  model: string;
  currency: "USD";
  supplierRateMicrosPerMinute: number;
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
  const rate = positiveSafeInteger(args.costEvidence.supplierRateMicrosPerMinute, "supplier_rate");
  const supporting = nonNegativeSafeInteger(args.costEvidence.supportingCostCeilingMicros, "supporting_cost_ceiling");
  const billableDurationMs = Math.max(minimumMs, Math.ceil(durationMs / incrementMs) * incrementMs);
  const supplierCeilingMicros = Math.ceil((billableDurationMs * rate) / 60_000);
  const completeWholesaleCeilingMicros = supplierCeilingMicros + supporting;
  const targetCustomerValueMicros = Math.ceil((completeWholesaleCeilingMicros * 133) / 100);
  const customerCreditUnits = Math.ceil(targetCustomerValueMicros / 5_000);
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
    customerChargeMicros: customerCreditUnits * 5_000,
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
