export type AggregateAdmissionCallerClass =
  | "interactive"
  | "background"
  | "retry"
  | "recovery";

export type AggregateProviderMode = "real" | "simulated" | "byo";

export type AggregateAdmissionRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export type AggregateAdmission = {
  enforcementEnabled: boolean;
  authorized: boolean;
  replay: boolean;
  reason: string;
  holdId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Service-side bridge between an already accepted, reserved operation and the
 * shared Forge supplier-exposure gate. The database derives all monetary and
 * identity fields from immutable funding records; no caller-provided price or
 * authorization flag crosses this boundary.
 */
export class AggregateFinancialAdmissionCoordinator {
  private readonly client: AggregateAdmissionRpcClient;

  constructor(client: AggregateAdmissionRpcClient) {
    this.client = client;
  }

  private async rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await this.client.rpc(name, args);
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
    return asRecord(result.data);
  }

  async acquireForOpenAiText(input: {
    reservationId: string;
    callerClass: AggregateAdmissionCallerClass;
    providerMode: AggregateProviderMode;
  }): Promise<AggregateAdmission> {
    return this.parse(await this.rpc("acquire_openai_text_aggregate_admission", {
      p_reservation_id: input.reservationId,
      p_caller_class: input.callerClass,
      p_provider_mode: input.providerMode,
    }));
  }

  async beginAttempt(input: {
    reservationId: string;
    attemptKey: string;
    attemptNumber: number;
    callerClass: AggregateAdmissionCallerClass;
  }): Promise<AggregateAdmission> {
    return this.parse(await this.rpc("begin_paid_operation_aggregate_attempt", {
      p_reservation_id: input.reservationId,
      p_event_key: `${input.attemptKey}:aggregate`,
      p_attempt_number: input.attemptNumber,
      p_caller_class: input.callerClass,
    }));
  }

  async recordOutcome(input: {
    reservationId: string;
    eventKey: string;
    outcome: "preprovider_release" | "ambiguous" | "failure" | "settled_unconfirmed" | "reconciled" | "supplier_recovery";
    supplierObligationMicros?: number | null;
    supplierRecoveryMicros?: number | null;
    evidence?: Record<string, unknown>;
  }): Promise<void> {
    await this.rpc("record_paid_operation_aggregate_outcome", {
      p_reservation_id: input.reservationId,
      p_event_key: input.eventKey,
      p_outcome: input.outcome,
      p_supplier_obligation_micros: input.supplierObligationMicros ?? null,
      p_supplier_recovery_micros: input.supplierRecoveryMicros ?? null,
      p_evidence_json: input.evidence ?? {},
    });
  }

  private parse(row: Record<string, unknown>): AggregateAdmission {
    return {
      enforcementEnabled: row.enforcement_enabled === true,
      authorized: row.authorized === true,
      replay: row.replay === true,
      reason: stringValue(row.reason) ?? "aggregate_admission_unavailable",
      holdId: stringValue(row.hold_id),
    };
  }
}
