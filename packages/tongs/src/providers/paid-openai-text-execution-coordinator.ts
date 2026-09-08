import { OpenAiTextBoundaryError, type OpenAiTextRouteCode } from "./openai-text-paid-boundary.js";

type RpcResult = { data: unknown; error: { message: string } | null };
export type OpenAiTextGateClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };
export type OpenAiCredentialFunding = "forge" | "byo_customer";

export class OpenAiTextProviderError extends Error {
  constructor(
    message: string,
    public readonly ambiguous: boolean,
    public readonly supplierCostMicros: number | null,
    public readonly evidence: Record<string, unknown> = {},
  ) { super(message); this.name = "OpenAiTextProviderError"; }
}

export type OpenAiTextProviderResult<T> = {
  value: T;
  requestId: string | null;
  inputUnits: number;
  outputUnits: number;
  supplierCostMicros: number | null;
  supplierCostAuthoritative: boolean;
  evidence?: Record<string, unknown>;
};

export type PaidOpenAiTextExecutionInput<T> = {
  routeCode: OpenAiTextRouteCode;
  reservationId: string;
  quoteId: string;
  fundingSourceType: "customer_deposit" | "paid_allowance" | "owner_budget" | "none";
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
  executeProvider: () => Promise<OpenAiTextProviderResult<T>>;
  validateResult: (value: T) => Promise<void> | void;
  persistResult: (value: T) => Promise<void>;
};

export type PaidOpenAiTextExecutionResult<T> =
  | { state: "settled"; value: T; requestId: string | null }
  | { state: "failed_released"; customerChargeMicros: 0; supplierCostMicros: number | null }
  | { state: "submission_unknown"; customerChargeMicros: 0 };

function asRow(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export class PaidOpenAiTextExecutionCoordinator {
  constructor(private readonly gate: OpenAiTextGateClient) {}

  private async rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.gate.rpc(name, args);
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
    return asRow(result.data);
  }

  async execute<T>(input: PaidOpenAiTextExecutionInput<T>): Promise<PaidOpenAiTextExecutionResult<T>> {
    if (input.credentialFunding === "byo_customer" && !input.byoCredentialPresent) {
      throw new OpenAiTextBoundaryError("byo_credential_required");
    }
    await this.rpc("reserve_operation", {
      p_reservation_id: input.reservationId,
      p_quote_id: input.quoteId,
      p_funding_source_type: input.fundingSourceType,
      p_funding_source_id: input.fundingSourceId,
      p_idempotency_key: input.reservationKey,
    });
    const attemptRpc = input.fundingSourceType === "owner_budget" ? "begin_owner_provider_attempt" : "begin_provider_attempt";
    const attempt = await this.rpc(attemptRpc, {
      p_reservation_id: input.reservationId,
      p_attempt_key: input.attemptKey,
      p_lease_seconds: 120,
      p_evidence_json: { provider: "openai", route_code: input.routeCode, model: input.model, maximum_attempts: input.maximumAttempts },
    });
    if (attempt.provider_execution_authorized !== true) throw new OpenAiTextBoundaryError("funding_context_required");

    let result: OpenAiTextProviderResult<T>;
    try {
      result = await input.executeProvider();
    } catch (error) {
      const providerError = error instanceof OpenAiTextProviderError ? error : new OpenAiTextProviderError(String(error), false, null);
      if (providerError.ambiguous) {
        await this.rpc("mark_submission_unknown", {
          p_reservation_id: input.reservationId,
          p_event_key: `${input.attemptKey}:submission-unknown`,
          p_attempt_key: input.attemptKey,
          p_evidence_json: providerError.evidence,
        });
        return { state: "submission_unknown", customerChargeMicros: 0 };
      }
      await this.failAndRelease(input, "provider_failure", providerError.supplierCostMicros, providerError.evidence);
      return { state: "failed_released", customerChargeMicros: 0, supplierCostMicros: providerError.supplierCostMicros };
    }

    if (result.inputUnits > input.maximumInputUnits || result.outputUnits > input.maximumOutputUnits) {
      await this.failAndRelease(input, "provider_failure", result.supplierCostMicros, { ...result.evidence, reason: "usage_bound_exceeded" });
      return { state: "failed_released", customerChargeMicros: 0, supplierCostMicros: result.supplierCostMicros };
    }
    try {
      await input.validateResult(result.value);
      await input.persistResult(result.value);
    } catch (error) {
      await this.failAndRelease(input, "forge_failure", result.supplierCostMicros, { ...result.evidence, reason: "validation_or_persistence_failed", error: String(error) });
      return { state: "failed_released", customerChargeMicros: 0, supplierCostMicros: result.supplierCostMicros };
    }
    await this.rpc("record_openai_text_usage", {
      p_evidence_id: crypto.randomUUID(), p_reservation_id: input.reservationId,
      p_evidence_key: `${input.attemptKey}:usage`, p_provider_request_id: result.requestId,
      p_attempt_number: 1, p_input_units: result.inputUnits, p_output_units: result.outputUnits,
      p_provider_reported: true, p_result_validated: true, p_canonical_persistence_confirmed: true,
      p_evidence_json: result.evidence ?? {},
    });
    const settleRpc = input.fundingSourceType === "owner_budget" ? "settle_owner_operation" : "settle_operation";
    await this.rpc(settleRpc, {
      p_reservation_id: input.reservationId, p_settlement_id: input.settlementId,
      p_settlement_key: input.settlementKey, p_outcome: "success", p_failure_class: null,
      p_actual_fulfillment_cost_micros: result.supplierCostMicros ?? 0,
      p_evidence_json: { ...result.evidence, provider: "openai", provider_request_id: result.requestId,
        authoritative: result.supplierCostAuthoritative },
    });
    return { state: "settled", value: result.value, requestId: result.requestId };
  }

  private async failAndRelease<T>(
    input: PaidOpenAiTextExecutionInput<T>, failureClass: "provider_failure" | "forge_failure",
    supplierCostMicros: number | null, evidence: Record<string, unknown>,
  ): Promise<void> {
    await this.rpc("record_provider_failure", {
      p_reservation_id: input.reservationId, p_event_key: `${input.attemptKey}:${failureClass}`,
      p_failure_class: failureClass, p_evidence_json: evidence,
    });
    const settleRpc = input.fundingSourceType === "owner_budget" ? "settle_owner_operation" : "settle_operation";
    await this.rpc(settleRpc, {
      p_reservation_id: input.reservationId, p_settlement_id: input.settlementId,
      p_settlement_key: input.settlementKey, p_outcome: "nonbillable_failure", p_failure_class: failureClass,
      p_actual_fulfillment_cost_micros: supplierCostMicros ?? 0,
      p_evidence_json: { ...evidence, provider: "openai", authoritative: supplierCostMicros != null },
    });
  }
}

