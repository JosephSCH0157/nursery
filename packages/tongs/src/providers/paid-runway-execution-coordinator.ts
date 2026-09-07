import {
  RunwayTransportError,
  type RunwaySubmission,
  type RunwayTask,
} from "./runway-broll-video-provider.js";

type RpcError = { message: string };
export type PaidRunwayGateClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: RpcError | null }>;
};

export type PaidRunwayProvider = {
  submit(input: {
    prompt: string;
    model: "gen4.5" | "seedance2";
    durationSeconds: number;
    ratio: "1280:720" | "720:1280";
    attemptId: string;
    referenceImages?: Array<{ mimeType: string; bytesBase64: string }>;
  }): Promise<RunwaySubmission>;
  poll(taskId: string): Promise<RunwayTask>;
};

export type PaidRunwayExecutionInput = {
  reservationId: string;
  quoteId: string;
  fundingSourceType: "customer_deposit" | "paid_allowance" | "owner_budget" | "none";
  fundingSourceId: string | null;
  reservationKey: string;
  attemptKey: string;
  prompt: string;
  model: "gen4.5" | "seedance2";
  durationSeconds: number;
  ratio: "1280:720" | "720:1280";
  referenceImages?: Array<{ mimeType: string; bytesBase64: string }>;
  actualFulfillmentCostMicros: number;
  settlementId: string;
  settlementKey: string;
};

export type PaidRunwayExecutionResult =
  | { state: "shadow_blocked"; reservationId: string }
  | { state: "submission_unknown"; reservationId: string }
  | { state: "definitive_rejection"; reservationId: string }
  | { state: "provider_pending"; reservationId: string; taskId: string }
  | { state: "provider_failed"; reservationId: string; taskId: string; code: string }
  | { state: "settled"; reservationId: string; taskId: string };

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class PaidRunwayExecutionCoordinator {
  constructor(
    private readonly gate: PaidRunwayGateClient,
    private readonly provider: PaidRunwayProvider,
  ) {}

  private async rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.gate.rpc(name, args);
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
    return row(result.data);
  }

  private settlementRpc(input: PaidRunwayExecutionInput): string {
    return input.fundingSourceType === "owner_budget" ? "settle_owner_operation" : "settle_operation";
  }

  async execute(input: PaidRunwayExecutionInput): Promise<PaidRunwayExecutionResult> {
    await this.rpc("reserve_operation", {
      p_reservation_id: input.reservationId,
      p_quote_id: input.quoteId,
      p_funding_source_type: input.fundingSourceType,
      p_funding_source_id: input.fundingSourceId,
      p_idempotency_key: input.reservationKey,
    });
    const attemptRpc = input.fundingSourceType === "owner_budget"
      ? "begin_owner_provider_attempt"
      : "begin_provider_attempt";
    const attempt = await this.rpc(attemptRpc, {
      p_reservation_id: input.reservationId,
      p_attempt_key: input.attemptKey,
      p_lease_seconds: 120,
      p_evidence_json: { provider: "runway", model: input.model, fake_ready: true },
    });
    if (attempt.provider_execution_authorized !== true) {
      return { state: "shadow_blocked", reservationId: input.reservationId };
    }

    let submitted: RunwaySubmission;
    try {
      submitted = await this.provider.submit({
        prompt: input.prompt,
        model: input.model,
        durationSeconds: input.durationSeconds,
        ratio: input.ratio,
        attemptId: input.attemptKey,
        referenceImages: input.referenceImages,
      });
    } catch (error) {
      if (error instanceof RunwayTransportError && error.ambiguous) {
        await this.rpc("mark_submission_unknown", {
          p_reservation_id: input.reservationId,
          p_event_key: `${input.attemptKey}:submission-unknown`,
          p_attempt_key: input.attemptKey,
          p_evidence_json: error.evidence,
        });
        return { state: "submission_unknown", reservationId: input.reservationId };
      }
      const evidence = error instanceof RunwayTransportError ? error.evidence : { transmitted: false };
      await this.rpc("record_provider_failure", {
        p_reservation_id: input.reservationId,
        p_event_key: `${input.attemptKey}:definitive-rejection`,
        p_failure_class: "prebilling_rejection",
        p_evidence_json: evidence,
      });
      await this.rpc("release_operation", {
        p_reservation_id: input.reservationId,
        p_release_key: `${input.attemptKey}:release`,
        p_reason: "definitive prebilling rejection",
        p_evidence_json: evidence,
      });
      return { state: "definitive_rejection", reservationId: input.reservationId };
    }

    const task = await this.provider.poll(submitted.taskId);
    if (task.state === "pending") {
      return { state: "provider_pending", reservationId: input.reservationId, taskId: task.taskId };
    }
    if (task.state === "failed") {
      await this.rpc("record_provider_failure", {
        p_reservation_id: input.reservationId,
        p_event_key: `${input.attemptKey}:provider-failure`,
        p_failure_class: "provider_billed_failure",
        p_evidence_json: task.response,
      });
      await this.rpc(this.settlementRpc(input), {
        p_reservation_id: input.reservationId,
        p_settlement_id: input.settlementId,
        p_settlement_key: input.settlementKey,
        p_outcome: "billable_failure",
        p_failure_class: "provider_billed_failure",
        p_actual_fulfillment_cost_micros: input.actualFulfillmentCostMicros,
        p_evidence_json: task.response,
      });
      return { state: "provider_failed", reservationId: input.reservationId, taskId: task.taskId, code: task.code };
    }
    await this.rpc(this.settlementRpc(input), {
      p_reservation_id: input.reservationId,
      p_settlement_id: input.settlementId,
      p_settlement_key: input.settlementKey,
      p_outcome: "success",
      p_failure_class: null,
      p_actual_fulfillment_cost_micros: input.actualFulfillmentCostMicros,
      p_evidence_json: task.response,
    });
    return { state: "settled", reservationId: input.reservationId, taskId: task.taskId };
  }
}
