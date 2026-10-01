import type { HammerShortsDurationPreset, HammerShortsGoal } from "../../../../packages/contracts/hammer/shorts.contract";
import type { HammerShortsOutputSegment } from "./hammerShortsResolver";

export interface HammerShortsLogicalRequestIdentityInput {
  workspace_id: string;
  parent_workpiece_id: string;
  basis_lock_id: string;
  basis_fingerprint: string;
  goal: HammerShortsGoal;
  duration_preset: HammerShortsDurationPreset;
  minimum_duration_sec: number;
  maximum_duration_sec: number;
  target_candidate_count: 3 | 4;
  output_segments: HammerShortsOutputSegment[];
}
/**
 * This is a client retry key, not financial authority. The server still derives
 * and enforces the canonical paid request fingerprint. Keeping the exact input
 * snapshot here only decides whether a UI retry may reuse its logical operation.
 */
export function hammerShortsLogicalRequestRetryKey(
  input: HammerShortsLogicalRequestIdentityInput,
): string {
  return JSON.stringify({
    schema: "forge.hammer.shorts.logical-request.v1",
    workspace_id: input.workspace_id,
    parent_workpiece_id: input.parent_workpiece_id,
    basis_lock_id: input.basis_lock_id,
    basis_fingerprint: input.basis_fingerprint,
    goal: input.goal,
    duration_preset: input.duration_preset,
    minimum_duration_sec: input.minimum_duration_sec,
    maximum_duration_sec: input.maximum_duration_sec,
    target_candidate_count: input.target_candidate_count,
    output_segments: input.output_segments.map((segment) => ({
      segment_id: segment.segment_id,
      text: segment.text,
      output_start_sec: segment.output_start_sec,
      output_end_sec: segment.output_end_sec,
      source_start_sec: segment.source_start_sec,
      source_end_sec: segment.source_end_sec,
      disabled: segment.disabled === true,
    })),
  });
}

type PendingOperation = { retryKey: string; operationId: string };
type ActiveOperation = { retryKey: string; promise: Promise<unknown> };

export class HammerShortsOperationIdentity {
  private pending: PendingOperation | null = null;
  private active: ActiveOperation | null = null;
  private readonly createOperationId: () => string;

  constructor(createOperationId: () => string = () => `hammer-shorts-discovery:${crypto.randomUUID()}`) {
    this.createOperationId = createOperationId;
  }

  run<T>(retryKey: string, execute: (operationId: string) => Promise<T>): Promise<T> {
    if (this.active) {
      if (this.active.retryKey !== retryKey) {
        return Promise.reject(new Error("hammer_shorts_discovery_already_in_progress"));
      }
      return this.active.promise as Promise<T>;
    }

    if (!this.pending || this.pending.retryKey !== retryKey) {
      this.pending = { retryKey, operationId: this.createOperationId() };
    }
    const pending = this.pending;
    const promise = execute(pending.operationId).then(
      (result) => {
        if (this.pending === pending) this.pending = null;
        return result;
      },
      (error) => {
        throw error;
      },
    ).finally(() => {
      if (this.active?.promise === promise) this.active = null;
    });
    this.active = { retryKey, promise };
    return promise;
  }
}
