export type RunwayBoundaryRpcError = { message: string };

export type RunwayBoundaryRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RunwayBoundaryRpcError | null }>;
};

export type RunwaySubmissionAuthorizationInput = {
  operationId: string;
  operationFingerprint: string;
  submissionAttemptId: string;
  userId: string;
  workspaceId: string;
  model: "gen4.5";
  durationSeconds: number;
  ratio: "1280:720" | "720:1280";
};

export type RunwayOperationFunding = {
  mode: "observe" | "enforce" | "halt_new";
  rolloutRevision: number;
  sharedFundingReady: boolean;
  useLegacyAccounting: boolean;
  reason: string;
  reservationId: string | null;
  fundingSourceType:
    | "customer_deposit"
    | "paid_allowance"
    | "owner_budget"
    | null;
};

export type RunwaySubmissionAuthorization = {
  mode: "observe" | "enforce" | "halt_new";
  rolloutRevision: number;
  providerExecutionAuthorized: boolean;
  legacyExecutionAllowed: boolean;
  reason: string;
  replay: boolean;
  reservationId: string | null;
  fundingSourceType:
    | "customer_deposit"
    | "paid_allowance"
    | "owner_budget"
    | null;
};

export type RunwayPaidExecutionBoundary = {
  resolveOperationFunding(
    input: Omit<RunwaySubmissionAuthorizationInput, "submissionAttemptId">,
  ): Promise<RunwayOperationFunding>;
  authorizeSubmission(
    input: RunwaySubmissionAuthorizationInput,
  ): Promise<RunwaySubmissionAuthorization>;
  markSubmissionUnknown(
    authorization: RunwaySubmissionAuthorization,
    input: RunwaySubmissionAuthorizationInput,
    evidence: Record<string, unknown>,
  ): Promise<void>;
  recordDefinitiveRejection(
    authorization: RunwaySubmissionAuthorization,
    input: RunwaySubmissionAuthorizationInput,
    evidence: Record<string, unknown>,
  ): Promise<void>;
  recordProviderFailure(
    input: RunwaySubmissionAuthorizationInput,
    providerTaskId: string,
    evidence: Record<string, unknown>,
  ): Promise<void>;
  recordCompletionForReconciliation(
    input: RunwaySubmissionAuthorizationInput,
    providerTaskId: string,
    evidence: Record<string, unknown>,
  ): Promise<void>;
  recordCanonicalSuccessForReconciliation(
    input: RunwaySubmissionAuthorizationInput,
    providerTaskId: string,
    evidence: Record<string, unknown>,
  ): Promise<void>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRevision(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

export class SupabaseRunwayPaidExecutionBoundary
  implements RunwayPaidExecutionBoundary
{
  private readonly client: RunwayBoundaryRpcClient;

  constructor(client: RunwayBoundaryRpcClient) {
    this.client = client;
  }

  private async rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await this.client.rpc(name, args);
    if (result.error)
      throw new Error(`${name}: ${result.error.message}`);
    return asRecord(result.data);
  }

  async resolveOperationFunding(
    input: Omit<RunwaySubmissionAuthorizationInput, "submissionAttemptId">,
  ): Promise<RunwayOperationFunding> {
    const row = await this.rpc("resolve_runway_execution_funding", {
      p_operation_id: input.operationId,
      p_operation_fingerprint: input.operationFingerprint,
      p_user_id: input.userId,
      p_workspace_id: input.workspaceId,
      p_model: input.model,
      p_duration_seconds: input.durationSeconds,
      p_ratio: input.ratio,
    });
    const mode = asString(row.mode);
    if (mode !== "observe" && mode !== "enforce" && mode !== "halt_new")
      throw new Error("resolve_runway_execution_funding: invalid rollout mode");
    const fundingSourceType = asString(row.funding_source_type);
    return {
      mode,
      rolloutRevision: asRevision(row.rollout_revision),
      sharedFundingReady: asBoolean(row.shared_funding_ready),
      useLegacyAccounting: asBoolean(row.use_legacy_accounting),
      reason: asString(row.reason) ?? "Runway funding is unavailable",
      reservationId: asString(row.reservation_id),
      fundingSourceType:
        fundingSourceType === "customer_deposit" ||
        fundingSourceType === "paid_allowance" ||
        fundingSourceType === "owner_budget"
          ? fundingSourceType
          : null,
    };
  }

  async authorizeSubmission(
    input: RunwaySubmissionAuthorizationInput,
  ): Promise<RunwaySubmissionAuthorization> {
    const row = await this.rpc("authorize_runway_submission_with_aggregate", {
      p_operation_id: input.operationId,
      p_operation_fingerprint: input.operationFingerprint,
      p_submission_attempt_id: input.submissionAttemptId,
      p_user_id: input.userId,
      p_workspace_id: input.workspaceId,
      p_model: input.model,
      p_duration_seconds: input.durationSeconds,
      p_ratio: input.ratio,
      p_caller_class: "interactive",
      p_evidence_json: {
        boundary: "tongs_broll_v2",
        provider: "runway",
        model: input.model,
        duration_seconds: input.durationSeconds,
        ratio: input.ratio,
      },
    });
    const mode = asString(row.mode);
    if (mode !== "observe" && mode !== "enforce" && mode !== "halt_new")
      throw new Error("authorize_runway_submission: invalid rollout mode");
    const fundingSourceType = asString(row.funding_source_type);
    return {
      mode,
      rolloutRevision: asRevision(row.rollout_revision),
      providerExecutionAuthorized: asBoolean(
        row.provider_execution_authorized,
      ),
      legacyExecutionAllowed: asBoolean(row.legacy_execution_allowed),
      reason: asString(row.reason) ?? "Runway funding boundary denied execution",
      replay: asBoolean(row.replay),
      reservationId: asString(row.reservation_id),
      fundingSourceType:
        fundingSourceType === "customer_deposit" ||
        fundingSourceType === "paid_allowance" ||
        fundingSourceType === "owner_budget"
          ? fundingSourceType
          : null,
    };
  }

  private async reservationRpc(
    authorization: RunwaySubmissionAuthorization,
    name: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    if (!authorization.reservationId) return;
    await this.rpc(name, {
      p_reservation_id: authorization.reservationId,
      ...args,
    });
  }

  async markSubmissionUnknown(
    authorization: RunwaySubmissionAuthorization,
    input: RunwaySubmissionAuthorizationInput,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    await this.reservationRpc(authorization, "mark_submission_unknown", {
      p_event_key: `${input.submissionAttemptId}:runway-unknown`,
      p_attempt_key: input.submissionAttemptId,
      p_evidence_json: evidence,
    });
    await this.reservationRpc(authorization, "record_paid_operation_aggregate_outcome", {
      p_event_key: `${input.submissionAttemptId}:aggregate-runway-unknown`,
      p_outcome: "ambiguous",
      p_supplier_obligation_micros: null,
      p_supplier_recovery_micros: null,
      p_evidence_json: evidence,
    });
  }

  async recordDefinitiveRejection(
    authorization: RunwaySubmissionAuthorization,
    input: RunwaySubmissionAuthorizationInput,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    if (!authorization.reservationId) return;
    await this.reservationRpc(authorization, "record_provider_failure", {
      p_event_key: `${input.submissionAttemptId}:runway-prebilling-rejection`,
      p_failure_class: "prebilling_rejection",
      p_evidence_json: evidence,
    });
    await this.reservationRpc(authorization, "release_operation", {
      p_release_key: `${input.submissionAttemptId}:runway-release`,
      p_reason: "definitive Runway prebilling rejection",
      p_evidence_json: evidence,
    });
    await this.reservationRpc(authorization, "record_paid_operation_aggregate_outcome", {
      p_event_key: `${input.submissionAttemptId}:aggregate-runway-rejection`,
      p_outcome: "reconciled",
      p_supplier_obligation_micros: 0,
      p_supplier_recovery_micros: null,
      p_evidence_json: { ...evidence, authoritative: true, transmitted: true, provider_billed: false },
    });
  }

  async recordProviderFailure(
    input: RunwaySubmissionAuthorizationInput,
    providerTaskId: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    await this.rpc("record_runway_failure_for_reconciliation", {
      p_operation_id: input.operationId,
      p_operation_fingerprint: input.operationFingerprint,
      p_provider_task_id: providerTaskId,
      p_evidence_json: evidence,
    });
    const funding = await this.resolveOperationFunding(input);
    if (funding.reservationId) {
      await this.rpc(
        funding.fundingSourceType === "owner_budget"
          ? "settle_owner_operation"
          : "settle_operation",
        {
          p_reservation_id: funding.reservationId,
          p_settlement_id: crypto.randomUUID(),
          p_settlement_key: `${input.operationId}:runway-provider-failure-settlement`,
          p_outcome: "nonbillable_failure",
          p_failure_class: "provider_failure",
          p_actual_fulfillment_cost_micros: 0,
          p_evidence_json: {
            ...evidence,
            provider: "runway",
            provider_task_id: providerTaskId,
            authoritative: false,
            cost_coverage: "incomplete",
            customer_charge_micros: 0,
          },
        },
      );
      await this.rpc("record_paid_operation_aggregate_outcome", {
        p_reservation_id: funding.reservationId,
        p_event_key: `${input.operationId}:aggregate-runway-provider-failure`,
        p_outcome: "failure",
        p_supplier_obligation_micros: null,
        p_supplier_recovery_micros: null,
        p_evidence_json: { ...evidence, provider_task_id: providerTaskId },
      });
    }
  }

  async recordCompletionForReconciliation(
    input: RunwaySubmissionAuthorizationInput,
    providerTaskId: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    await this.rpc("record_runway_completion_for_reconciliation", {
      p_operation_id: input.operationId,
      p_operation_fingerprint: input.operationFingerprint,
      p_provider_task_id: providerTaskId,
      p_evidence_json: evidence,
    });
  }

  async recordCanonicalSuccessForReconciliation(
    input: RunwaySubmissionAuthorizationInput,
    providerTaskId: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    const funding = await this.resolveOperationFunding(input);
    if (!funding.reservationId) return;
    await this.rpc("record_paid_operation_aggregate_outcome", {
      p_reservation_id: funding.reservationId,
      p_event_key: `${input.operationId}:aggregate-runway-canonical-success`,
      p_outcome: "settled_unconfirmed",
      p_supplier_obligation_micros: null,
      p_supplier_recovery_micros: null,
      p_evidence_json: {
        ...evidence,
        provider_task_id: providerTaskId,
        canonical_persistence_confirmed: true,
        authoritative: false,
      },
    });
  }
}
