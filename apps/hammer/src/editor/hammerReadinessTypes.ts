import {
  resolveMonotonicReadiness,
  type HammerQuenchCanonicalReadinessReasonCode,
  type HammerQuenchCanonicalReadinessReasonSeverity,
  type HammerQuenchCanonicalReadinessReasonSource,
  type HammerQuenchCanonicalReadinessStatus,
} from "@forge/contracts/hammer/quench-readiness-taxonomy.contract";

export type HammerReadinessVerdictStatus = HammerQuenchCanonicalReadinessStatus;
export type HammerReadinessReasonSeverity = HammerQuenchCanonicalReadinessReasonSeverity;
export type HammerReadinessReasonSource = HammerQuenchCanonicalReadinessReasonSource;
export type HammerReadinessReasonCode = HammerQuenchCanonicalReadinessReasonCode;

export interface HammerReadinessReason {
  code: HammerReadinessReasonCode;
  label: string;
  severity: HammerReadinessReasonSeverity;
  source: HammerReadinessReasonSource;
  operationId: string | null;
  // Transitional compatibility field for pre-Phase-6 consumers.
  operation_id: string | null;
}

export interface HammerReadinessVerdict {
  status: HammerReadinessVerdictStatus;
  readyForQuench: boolean;
  reasons: HammerReadinessReason[];
  blockingReasons: HammerReadinessReason[];
  reviewReasons: HammerReadinessReason[];
  counts: {
    blocking: number;
    review: number;
  };
  primaryOperationId: string | null;
}

export interface HammerReadinessGateResult extends HammerReadinessVerdict {
  // Transitional compatibility fields for pre-Phase-6 consumers.
  review_count: number;
  blocker_count: number;
  blocking_reasons: HammerReadinessReason[];
  review_reasons: HammerReadinessReason[];
  primary_operation_id: string | null;
}

export function createHammerReadinessReason(args: {
  code: HammerReadinessReasonCode;
  label: string;
  severity: HammerReadinessReasonSeverity;
  source: HammerReadinessReasonSource;
  operationId?: string | null;
}): HammerReadinessReason {
  const operationId = args.operationId ?? null;
  return {
    code: args.code,
    label: args.label,
    severity: args.severity,
    source: args.source,
    operationId,
    operation_id: operationId,
  };
}

export function buildHammerReadinessVerdict(args: {
  blockingReasons: HammerReadinessReason[];
  reviewReasons: HammerReadinessReason[];
}): HammerReadinessGateResult {
  const resolved = resolveMonotonicReadiness({
    upstreamStatus: "ready",
    upstreamReasons: [],
    downstreamReasons: [...args.blockingReasons, ...args.reviewReasons],
  });
  const status: HammerReadinessVerdictStatus = resolved.status;
  const primaryOperationId = args.blockingReasons[0]?.operationId
    ?? args.reviewReasons[0]?.operationId
    ?? null;
  const reasons = resolved.reasons;
  const counts = {
    blocking: args.blockingReasons.length,
    review: args.reviewReasons.length,
  };

  return {
    status,
    readyForQuench: resolved.readyForQuench,
    reasons,
    blockingReasons: args.blockingReasons,
    reviewReasons: args.reviewReasons,
    counts,
    primaryOperationId,
    review_count: counts.review,
    blocker_count: counts.blocking,
    blocking_reasons: args.blockingReasons,
    review_reasons: args.reviewReasons,
    primary_operation_id: primaryOperationId,
  };
}
