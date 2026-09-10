export const RESTRICTED_BETA_PAID_CAPABILITIES = [
  "openai.text.hearth_chat", "openai.text.hearth_research",
  "openai.text.visual_unified_plan", "openai.text.visual_narrative",
  "openai.text.motion_broll", "openai.text.hammer_cleanup",
  "openai.text.shorts_discovery", "openai.text.quench_metadata",
  "openai.image", "openai.audio", "runway.video", "brave.search",
  "extraction.remote", "huggingface.inference", "fly.probe", "fly.transcode",
  "fly.render", "postmark.auth_email", "storage.persistence", "delivery.egress",
] as const;

export type RestrictedBetaPaidCapability = typeof RESTRICTED_BETA_PAID_CAPABILITIES[number];
export type RestrictedBetaCallerClass = "interactive" | "background" | "retry" | "recovery";
export type RestrictedBetaProviderMode = "real" | "simulated" | "byo";
export type RestrictedBetaFundingClass = "verified_customer_deposit" | "economically_backed_allowance"
  | "owner_operating_budget" | "test_customer" | "byo" | "none";

export type RestrictedBetaAdmission = {
  enrolled: boolean;
  policyState: "inactive" | "blocked" | "authorized";
  capability: RestrictedBetaPaidCapability;
  operationIdentity?: string;
  requestFingerprint?: string;
  opaqueFundingHandle?: string;
  fundingClass?: RestrictedBetaFundingClass;
  providerMode?: RestrictedBetaProviderMode;
  modelOrSku?: string;
  reason?: string;
  attemptNumber?: number;
  maximumAttempts?: number;
  latestOutcome?: "reserved" | "attempt_started" | "ambiguous" | "supplier_obligation" | "released" | "reconciled";
};

export class RestrictedBetaBoundaryError extends Error {
  readonly code: "restricted_beta_capability_blocked" | "restricted_beta_funding_required"
    | "restricted_beta_binding_invalid" | "restricted_beta_real_provider_forbidden"
    | "restricted_beta_retry_forbidden";
  constructor(code: RestrictedBetaBoundaryError["code"], detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
    this.name = "RestrictedBetaBoundaryError";
  }
}

function requireExactAuthorization(admission: RestrictedBetaAdmission): void {
  if (!admission.operationIdentity || !admission.requestFingerprint || !admission.opaqueFundingHandle) {
    throw new RestrictedBetaBoundaryError("restricted_beta_binding_invalid", "missing_exact_server_binding");
  }
  if (admission.latestOutcome === "ambiguous" || admission.latestOutcome === "supplier_obligation") {
    throw new RestrictedBetaBoundaryError("restricted_beta_retry_forbidden", "reconciliation_only");
  }
  if ((admission.attemptNumber ?? 1) > (admission.maximumAttempts ?? 1)) {
    throw new RestrictedBetaBoundaryError("restricted_beta_retry_forbidden", "attempt_ceiling");
  }
  if (admission.providerMode === "real" && admission.fundingClass === "test_customer") {
    throw new RestrictedBetaBoundaryError("restricted_beta_real_provider_forbidden", "test_funding");
  }
  if (admission.providerMode !== "byo" && (admission.fundingClass === "none" || !admission.fundingClass)) {
    throw new RestrictedBetaBoundaryError("restricted_beta_funding_required");
  }
}

/** Server-side restricted-beta boundary. Enrolled traffic never falls back around a denial. */
export async function executeRestrictedBetaPaidBoundary<T>(input: {
  admission: RestrictedBetaAdmission;
  callerClass: RestrictedBetaCallerClass;
  executeExisting: () => Promise<T>;
  executeAuthorized: (authorization: {
    operationIdentity: string;
    requestFingerprint: string;
    opaqueFundingHandle: string;
    callerClass: RestrictedBetaCallerClass;
  }) => Promise<T>;
}): Promise<T> {
  const { admission } = input;
  if (!admission.enrolled || admission.policyState === "inactive") return input.executeExisting();
  if (admission.policyState !== "authorized") {
    throw new RestrictedBetaBoundaryError("restricted_beta_capability_blocked", admission.reason);
  }
  requireExactAuthorization(admission);
  return input.executeAuthorized({
    operationIdentity: admission.operationIdentity!,
    requestFingerprint: admission.requestFingerprint!,
    opaqueFundingHandle: admission.opaqueFundingHandle!,
    callerClass: input.callerClass,
  });
}
