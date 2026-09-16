import { OpenAiTextBoundaryError } from "./openai-text-paid-boundary.js";
import {
  AggregateFinancialAdmissionCoordinator,
  type AggregateAdmissionCallerClass,
  type AggregateProviderMode,
} from "./aggregate-financial-admission.js";
import type { CoordinatedOpenAiRouteCode } from "./paid-openai-text-route-execution.js";

type RpcResult = { data: unknown; error: { message: string } | null };
export type OpenAiTextGateClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };
export type OpenAiCredentialFunding = "forge" | "byo_customer";

export class OpenAiTextProviderError extends Error {
  readonly ambiguous: boolean;
  readonly supplierCostMicros: number | null;
  readonly evidence: Record<string, unknown>;
  readonly retryable: boolean;
  constructor(
    message: string,
    ambiguous: boolean,
    supplierCostMicros: number | null,
    evidence: Record<string, unknown> = {},
    retryable = false,
  ) {
    super(message);
    this.name = "OpenAiTextProviderError";
    this.ambiguous = ambiguous;
    this.supplierCostMicros = supplierCostMicros;
    this.evidence = evidence;
    this.retryable = retryable;
  }
}

/**
 * The route's canonical domain write succeeded, but a later billing or
 * response step did not. Keep the reservation intact so a replay can recover
 * that exact result and finish settlement without another provider call.
 */
export class OpenAiTextPostPersistenceContinuationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OpenAiTextPostPersistenceContinuationError";
  }
}

export type OpenAiTextProviderResult<T> = {
  value: T;
  requestId: string | null;
  inputUnits: number;
  outputUnits: number;
  supplierCostMicros: number | null;
  supplierCostAuthoritative: boolean;
  /** Separately attributable Forge-side fulfillment work for this attempt. */
  supportingCostMicros?: number | null;
  supportingCostAuthoritative?: boolean;
  supportingCostEvidence?: Record<string, unknown>;
  /** False while supporting/tail cost evidence is still unresolved. */
  costCoverageComplete?: boolean;
  evidence?: Record<string, unknown>;
};

export type PaidOpenAiTextExecutionInput<T> = {
  routeCode: CoordinatedOpenAiRouteCode;
  reservationId: string;
  quoteId: string;
  fundingSourceType: "customer_deposit" | "paid_allowance" | "beta_grant" | "owner_budget" | "none";
  fundingSourceId: string | null;
  reservationKey: string;
  attemptKey: string;
  settlementId: string;
  settlementKey: string;
  credentialFunding: OpenAiCredentialFunding;
  byoCredentialPresent: boolean;
  model: string;
  maximumInputUnits: number;
  maximumOutputUnits: number;
  maximumAttempts: number;
  maximumFailureExposureMicros: number;
  supportingCostCeilingMicros?: number;
  aggregateCallerClass: AggregateAdmissionCallerClass;
  aggregateProviderMode: AggregateProviderMode;
  /**
   * The server-owned execution adapter consumes a reservation that has already
   * been accepted, reserved, and bound in one database transaction. Browser
   * callers must never be allowed to opt into this mode directly.
   */
  reservationAlreadyCreated?: boolean;
  executeProvider: (attemptNumber: number) => Promise<OpenAiTextProviderResult<T>>;
  validateResult: (value: T) => Promise<void> | void;
  persistResult: (value: T) => Promise<void>;
};

export type PaidOpenAiTextExecutionResult<T> =
  | { state: "settled"; value: T; requestId: string | null; attempts: number; customerChargeMicros: number }
  | { state: "failed_released"; customerChargeMicros: 0; supplierCostMicros: number | null; attempts: number }
  | { state: "submission_unknown"; customerChargeMicros: 0; attempts: number };

function asRow(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function assertBoundedInteger(value: number, name: string, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new OpenAiTextBoundaryError(name === "maximumFailureExposureMicros" ? "pricing_not_configured" : "funding_context_required");
  }
}

function attemptKey(base: string, attemptNumber: number): string {
  return `${base}:attempt:${attemptNumber}`;
}

export class PaidOpenAiTextExecutionCoordinator {
  private readonly gate: OpenAiTextGateClient;

  constructor(gate: OpenAiTextGateClient) {
    this.gate = gate;
  }

  private async rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.gate.rpc(name, args);
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
    return asRow(result.data);
  }

  async execute<T>(input: PaidOpenAiTextExecutionInput<T>): Promise<PaidOpenAiTextExecutionResult<T>> {
    if (input.credentialFunding === "byo_customer" && !input.byoCredentialPresent) {
      throw new OpenAiTextBoundaryError("byo_credential_required");
    }
    assertBoundedInteger(input.maximumAttempts, "maximumAttempts", 1, 4);
    assertBoundedInteger(input.maximumInputUnits, "maximumInputUnits", 1, Number.MAX_SAFE_INTEGER);
    assertBoundedInteger(input.maximumOutputUnits, "maximumOutputUnits", 1, Number.MAX_SAFE_INTEGER);
    assertBoundedInteger(input.maximumFailureExposureMicros, "maximumFailureExposureMicros", 0, Number.MAX_SAFE_INTEGER);

    if (!input.reservationAlreadyCreated) {
      if (input.fundingSourceType === "owner_budget") {
        throw new OpenAiTextBoundaryError("funding_context_required");
      }
      await this.rpc("reserve_operation", {
        p_reservation_id: input.reservationId,
        p_quote_id: input.quoteId,
        p_funding_source_type: input.fundingSourceType,
        p_funding_source_id: input.fundingSourceId,
        p_idempotency_key: input.reservationKey,
      });
    }

    const aggregate = new AggregateFinancialAdmissionCoordinator(this.gate);
    const admission = await aggregate.acquireForOpenAiText({
      reservationId: input.reservationId,
      callerClass: input.aggregateCallerClass,
      providerMode: input.aggregateProviderMode,
    });
    const normalCustomerCreditAdmission = !admission.enforcementEnabled
      && admission.authorized
      && admission.reason === "normal_customer_credit_bounded"
      && admission.holdId === null;
    const aggregateAdmissionSatisfied = normalCustomerCreditAdmission
      || (admission.enforcementEnabled && admission.authorized && Boolean(admission.holdId));
    if (((input.credentialFunding === "forge" || (input.supportingCostCeilingMicros ?? 0) > 0)
        && !aggregateAdmissionSatisfied)
      || (admission.enforcementEnabled && !admission.authorized)) {
      await this.releaseBeforeProvider(input, `${input.attemptKey}:aggregate-admission-denied`, admission.reason);
      throw new OpenAiTextBoundaryError("funding_context_required");
    }

    let knownSupplierCostMicros = 0;
    let knownSupportingCostMicros = 0;
    let supplierCostComplete = true;
    let allCostEvidenceAuthoritative = true;
    let totalInputUnits = 0;
    let totalOutputUnits = 0;

    for (let attemptNumber = 1; attemptNumber <= input.maximumAttempts; attemptNumber += 1) {
      const currentAttemptKey = attemptKey(input.attemptKey, attemptNumber);
      const attempt = await this.rpc("authorize_openai_text_provider_attempt_with_aggregate", {
          p_reservation_id: input.reservationId,
          p_attempt_key: currentAttemptKey,
          p_attempt_number: attemptNumber,
          p_caller_class: attemptNumber === 1 ? input.aggregateCallerClass : "retry",
          p_failure_exposure_micros: input.credentialFunding === "forge" ? input.maximumFailureExposureMicros : 0,
          p_lease_seconds: 120,
          p_evidence_json: {
            provider: "openai",
            route_code: input.routeCode,
            model: input.model,
            maximum_attempts: input.maximumAttempts,
            credential_funding: input.credentialFunding,
          },
        });
      if (attempt.provider_execution_authorized !== true) {
        const reason = typeof attempt.reason === "string" && attempt.reason.trim()
          ? attempt.reason.trim()
          : "provider_authorization_denied";
        const platformRiskDenial = attempt.denial_class === "platform_risk"
          || [
            "aggregate_failure_limit",
            "operation_failure_limit",
            "failure_loss_concurrency_limit",
            "failure_loss_environment_halted",
          ].includes(reason);
        if (platformRiskDenial && attempt.preprovider_release_required !== false) {
          await this.releaseBeforeProvider(input, `${currentAttemptKey}:platform-risk-denied-release`, reason);
          throw new OpenAiTextBoundaryError("platform_risk_unavailable");
        }
        throw new OpenAiTextBoundaryError("funding_context_required");
      }

      let result: OpenAiTextProviderResult<T>;
      try {
        result = await input.executeProvider(attemptNumber);
      } catch (error) {
        const providerError = error instanceof OpenAiTextProviderError
          ? error
          : new OpenAiTextProviderError(String(error), false, null);
        if (providerError.supplierCostMicros == null) supplierCostComplete = false;
        else knownSupplierCostMicros += providerError.supplierCostMicros;
        allCostEvidenceAuthoritative = false;
        await this.recordSupplierAttempt(input, currentAttemptKey, attemptNumber, providerError.supplierCostMicros, false, providerError.evidence);
        if (providerError.ambiguous) {
          await this.rpc("close_openai_text_failure_exposure", {
            p_reservation_id: input.reservationId,
            p_attempt_key: currentAttemptKey,
            p_outcome: "unresolved",
            p_actual_supplier_cost_micros: providerError.supplierCostMicros,
            p_evidence_json: providerError.evidence,
          });
          await this.rpc("mark_submission_unknown", {
            p_reservation_id: input.reservationId,
            p_event_key: `${currentAttemptKey}:submission-unknown`,
            p_attempt_key: currentAttemptKey,
            p_evidence_json: providerError.evidence,
          });
          await aggregate.recordOutcome({
            reservationId: input.reservationId,
            eventKey: `${currentAttemptKey}:aggregate-ambiguous`,
            outcome: "ambiguous",
            supplierObligationMicros: providerError.supplierCostMicros,
            evidence: providerError.evidence,
          });
          return { state: "submission_unknown", customerChargeMicros: 0, attempts: attemptNumber };
        }
        await this.rpc("close_openai_text_failure_exposure", {
          p_reservation_id: input.reservationId,
          p_attempt_key: currentAttemptKey,
          p_outcome: "failure_realized",
          p_actual_supplier_cost_micros: providerError.supplierCostMicros,
          p_evidence_json: providerError.evidence,
        });
        await this.rpc("record_provider_failure", {
          p_reservation_id: input.reservationId,
          p_event_key: `${currentAttemptKey}:provider-failure`,
          p_failure_class: "provider_failure",
          p_evidence_json: providerError.evidence,
        });
        if (providerError.retryable && attemptNumber < input.maximumAttempts) continue;
        await this.settleFailure(input, "provider_failure", knownSupplierCostMicros, supplierCostComplete, providerError.evidence);
        await aggregate.recordOutcome({
          reservationId: input.reservationId,
          eventKey: `${currentAttemptKey}:aggregate-provider-failure`,
          outcome: "failure",
          supplierObligationMicros: supplierCostComplete ? knownSupplierCostMicros : null,
          evidence: providerError.evidence,
        });
        return {
          state: "failed_released",
          customerChargeMicros: 0,
          supplierCostMicros: supplierCostComplete ? knownSupplierCostMicros : null,
          attempts: attemptNumber,
        };
      }

      totalInputUnits += result.inputUnits;
      totalOutputUnits += result.outputUnits;
      if (result.supplierCostMicros == null) supplierCostComplete = false;
      else knownSupplierCostMicros += result.supplierCostMicros;
      if (!result.supplierCostAuthoritative) allCostEvidenceAuthoritative = false;
      if (result.supportingCostMicros === null) supplierCostComplete = false;
      else if (result.supportingCostMicros != null) knownSupportingCostMicros += result.supportingCostMicros;
      if (result.supportingCostMicros != null && result.supportingCostAuthoritative !== true) {
        allCostEvidenceAuthoritative = false;
      }
      if (result.costCoverageComplete === false) supplierCostComplete = false;
      const boundsExceeded = totalInputUnits > input.maximumInputUnits || totalOutputUnits > input.maximumOutputUnits;

      // Provider evidence is accounting evidence, not a success receipt. Record
      // it before Forge validation or canonical persistence can fail so a paid
      // supplier response is never lost or misreported as a zero-cost failure.
      await this.rpc("record_openai_text_provider_capture", {
        p_capture_id: crypto.randomUUID(),
        p_reservation_id: input.reservationId,
        p_capture_key: `${currentAttemptKey}:provider-capture`,
        p_provider_request_id: result.requestId,
        p_attempt_number: attemptNumber,
        p_input_units: result.inputUnits,
        p_output_units: result.outputUnits,
        p_response_evidence_json: result.evidence ?? {},
      });
      await this.recordSupplierAttempt(
        input,
        currentAttemptKey,
        attemptNumber,
        result.supplierCostMicros,
        result.supplierCostAuthoritative,
        result.evidence ?? {},
      );
      if (result.supportingCostMicros !== undefined) {
        await this.recordSupportingAttempt(
          input,
          currentAttemptKey,
          result.supportingCostMicros,
          result.supportingCostAuthoritative === true,
          result.supportingCostEvidence ?? {},
        );
      }
      let validated = false;
      let persisted = false;
      let failureClass: "forge_failure" | "forge_validation_failure" | "persistence_failure" | null =
        boundsExceeded ? "forge_failure" : null;
      let failureReason = boundsExceeded ? "aggregate_usage_bound_exceeded" : "";
      if (!boundsExceeded) {
        try {
          await input.validateResult(result.value);
          validated = true;
        } catch (error) {
          failureClass = "forge_validation_failure";
          failureReason = "forge_validation_failure";
          result.evidence = {
            ...result.evidence,
            forge_failure_phase: "validation",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
      if (validated) {
        try {
          await input.persistResult(result.value);
          persisted = true;
        } catch (error) {
          if (error instanceof OpenAiTextPostPersistenceContinuationError) {
            throw error;
          }
          failureClass = "persistence_failure";
          failureReason = "persistence_failure";
          result.evidence = {
            ...result.evidence,
            forge_failure_phase: "persistence",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
      const usable = validated && persisted;
      await this.rpc("record_openai_text_usage", {
        p_evidence_id: crypto.randomUUID(),
        p_reservation_id: input.reservationId,
        p_evidence_key: `${currentAttemptKey}:usage`,
        p_provider_request_id: result.requestId,
        p_attempt_number: attemptNumber,
        p_input_units: result.inputUnits,
        p_output_units: result.outputUnits,
        p_provider_reported: true,
        p_result_validated: validated,
        p_canonical_persistence_confirmed: persisted,
        p_evidence_json: result.evidence ?? {},
      });
      const knownFulfillmentCostMicros = knownSupplierCostMicros + knownSupportingCostMicros;
      await this.rpc("close_openai_text_failure_exposure", {
        p_reservation_id: input.reservationId,
        p_attempt_key: currentAttemptKey,
        p_outcome: usable ? "success_released" : "failure_realized",
        p_actual_supplier_cost_micros: usable ? result.supplierCostMicros : knownFulfillmentCostMicros,
        p_evidence_json: { ...result.evidence, reason: failureReason || undefined },
      });
      if (!usable) {
        await this.rpc("record_provider_failure", {
          p_reservation_id: input.reservationId,
          p_event_key: `${currentAttemptKey}:forge-failure`,
          p_failure_class: failureClass ?? "forge_failure",
          p_evidence_json: { ...result.evidence, reason: failureReason },
        });
        await this.settleFailure(input, failureClass ?? "forge_failure", knownFulfillmentCostMicros, supplierCostComplete, {
          ...result.evidence,
          reason: failureReason,
        });
        await aggregate.recordOutcome({
          reservationId: input.reservationId,
          eventKey: `${currentAttemptKey}:aggregate-${failureClass ?? "forge-failure"}`,
          outcome: "failure",
          supplierObligationMicros: supplierCostComplete ? knownFulfillmentCostMicros : null,
          evidence: { ...result.evidence, reason: failureReason },
        });
        return {
          state: "failed_released",
          customerChargeMicros: 0,
          supplierCostMicros: supplierCostComplete ? knownSupplierCostMicros : null,
          attempts: attemptNumber,
        };
      }

      const settleRpc = input.fundingSourceType === "owner_budget" ? "settle_owner_operation" : "settle_operation";
      const settlement = await this.rpc(settleRpc, {
        p_reservation_id: input.reservationId,
        p_settlement_id: input.settlementId,
        p_settlement_key: input.settlementKey,
        p_outcome: "success",
        p_failure_class: null,
        p_actual_fulfillment_cost_micros: knownFulfillmentCostMicros,
        p_evidence_json: {
          ...result.evidence,
          provider: "openai",
          provider_request_id: result.requestId,
          authoritative: supplierCostComplete && allCostEvidenceAuthoritative,
          cost_coverage: supplierCostComplete
            ? allCostEvidenceAuthoritative ? "confirmed" : "estimated"
            : "incomplete",
          attempts: attemptNumber,
        },
      });
      const rawCustomerCharge = settlement.customer_charge_micros;
      const customerChargeMicros = typeof rawCustomerCharge === "number"
        ? rawCustomerCharge
        : typeof rawCustomerCharge === "string" ? Number(rawCustomerCharge) : 0;
      await aggregate.recordOutcome({
        reservationId: input.reservationId,
        eventKey: `${currentAttemptKey}:aggregate-success`,
        outcome: supplierCostComplete && allCostEvidenceAuthoritative
          ? "reconciled"
          : "settled_unconfirmed",
        supplierObligationMicros: supplierCostComplete ? knownFulfillmentCostMicros : null,
        evidence: {
          provider: "openai",
          provider_request_id: result.requestId,
          authoritative: supplierCostComplete && allCostEvidenceAuthoritative,
          provider_usage_reported: true,
          direct_cost_rounding_risk_micros: input.credentialFunding === "forge" ? 3 : 0,
          supporting_and_tail_costs_confirmed:
            result.supportingCostAuthoritative === true && result.costCoverageComplete !== false,
        },
      });
      return {
        state: "settled",
        value: result.value,
        requestId: result.requestId,
        attempts: attemptNumber,
        customerChargeMicros: Number.isSafeInteger(customerChargeMicros) && customerChargeMicros >= 0
          ? customerChargeMicros
          : 0,
      };
    }
    throw new OpenAiTextBoundaryError("funding_context_required");
  }

  private async recordSupplierAttempt<T>(
    input: PaidOpenAiTextExecutionInput<T>,
    currentAttemptKey: string,
    attemptNumber: number,
    supplierCostMicros: number | null,
    authoritative: boolean,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    if (input.credentialFunding !== "forge") return;
    await this.rpc("record_openai_text_supplier_attempt_expense", {
      p_reservation_id: input.reservationId,
      p_attempt_key: currentAttemptKey,
      p_attempt_number: attemptNumber,
      p_provider_reference: typeof evidence.provider_reference === "string" ? evidence.provider_reference : null,
      p_amount_micros: supplierCostMicros,
      p_evidence_status: supplierCostMicros == null ? "unresolved" : authoritative ? "confirmed" : "estimated",
      p_evidence_json: evidence,
    });
  }

  private async recordSupportingAttempt<T>(
    input: PaidOpenAiTextExecutionInput<T>,
    currentAttemptKey: string,
    supportingCostMicros: number | null,
    authoritative: boolean,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    await this.rpc("record_supplier_expense", {
      p_expense_id: crypto.randomUUID(),
      p_reservation_id: input.reservationId,
      p_expense_key: `${currentAttemptKey}:supporting-expense`,
      p_provider: "forge",
      p_component_code: `openai.text.${input.routeCode}.supporting`,
      p_provider_reference: null,
      p_currency: "USD",
      p_amount_micros: supportingCostMicros,
      p_evidence_status: supportingCostMicros == null ? "unresolved" : authoritative ? "confirmed" : "estimated",
      p_obligation_status: supportingCostMicros == null ? "unresolved" : "closed",
      p_evidence_json: evidence,
    });
  }

  private async releaseBeforeProvider<T>(
    input: PaidOpenAiTextExecutionInput<T>,
    releaseKey: string,
    reason: string,
  ): Promise<void> {
    await this.rpc("release_operation", {
      p_reservation_id: input.reservationId,
      p_release_key: releaseKey,
      p_reason: reason,
      p_evidence_json: { provider: "openai", transmitted: false },
    });
  }

  private async settleFailure<T>(
    input: PaidOpenAiTextExecutionInput<T>,
    failureClass: "provider_failure" | "forge_failure" | "forge_validation_failure" | "persistence_failure",
    knownSupplierCostMicros: number,
    supplierCostComplete: boolean,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    if (input.fundingSourceType !== "owner_budget") {
      await this.rpc("settle_openai_customer_failure_without_duplicate_expense", {
        p_reservation_id: input.reservationId,
        p_relief_id: input.settlementId,
        p_event_key: input.settlementKey,
        p_failure_class: failureClass,
        p_evidence_json: {
          ...evidence,
          provider: "openai",
          authoritative: false,
          cost_coverage: supplierCostComplete ? "estimated" : "incomplete",
          supplier_cost_micros: supplierCostComplete ? knownSupplierCostMicros : null,
        },
      });
      return;
    }
    const settleRpc = "settle_owner_operation";
    await this.rpc(settleRpc, {
      p_reservation_id: input.reservationId,
      p_settlement_id: input.settlementId,
      p_settlement_key: input.settlementKey,
      p_outcome: "nonbillable_failure",
      p_failure_class: failureClass,
      p_actual_fulfillment_cost_micros: knownSupplierCostMicros,
      p_evidence_json: {
        ...evidence,
        provider: "openai",
        authoritative: false,
        cost_coverage: supplierCostComplete ? "estimated" : "incomplete",
      },
    });
  }
}
