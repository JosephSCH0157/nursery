import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerRenderAssemblyResult } from "./hammerRenderAssembly";
import type { HammerBoundAttentionQueueItem } from "./hammerBoundObjects";

export type HammerReadinessGateStatus = "ready" | "needs_review" | "blocked";
export type HammerReadinessReasonSeverity = "blocking" | "review";

export interface HammerReadinessReason {
  code: string;
  label: string;
  severity: HammerReadinessReasonSeverity;
  operation_id: string | null;
}

export interface HammerReadinessGateResult {
  status: HammerReadinessGateStatus;
  review_count: number;
  blocker_count: number;
  blocking_reasons: HammerReadinessReason[];
  review_reasons: HammerReadinessReason[];
  primary_operation_id: string | null;
}

function dedupeReasons(reasons: HammerReadinessReason[]): HammerReadinessReason[] {
  const seen = new Set<string>();
  const rows: HammerReadinessReason[] = [];
  for (const reason of reasons) {
    const key = `${reason.severity}:${reason.code}:${reason.operation_id ?? "-"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(reason);
  }
  return rows;
}

function resolvePodcastMasterOperationId(graph: HammerEditorialAuthorityGraph | null): string | null {
  const operation = (graph?.operations ?? []).find((candidate) => (
    candidate.lifecycle === "active" && candidate.instruction.type === "podcast_master_pass"
  )) ?? null;
  return operation?.operation_id ?? null;
}

export function evaluateHammerReadinessGate(args: {
  renderAssembly: HammerRenderAssemblyResult;
  canonicalGraph: HammerEditorialAuthorityGraph | null;
  boundAttentionQueue: HammerBoundAttentionQueueItem[];
  unresolvedBrollSuggestionOperationIds: string[];
}): HammerReadinessGateResult {
  const blocking: HammerReadinessReason[] = [];
  const review: HammerReadinessReason[] = [];

  if (args.renderAssembly.export_timeline.export_posture === "unavailable") {
    blocking.push({
      code: "export_posture_unavailable",
      label: "Export assembly is unavailable.",
      severity: "blocking",
      operation_id: null,
    });
  } else if (args.renderAssembly.export_timeline.export_posture === "degraded") {
    review.push({
      code: "export_posture_degraded",
      label: "Export assembly is degraded and needs review.",
      severity: "review",
      operation_id: null,
    });
  }

  for (const operation of args.renderAssembly.export_timeline.unsupported_or_degraded_ops) {
    if (operation.posture === "unavailable") {
      blocking.push({
        code: "operation_unavailable",
        label: `${operation.type} is unavailable for export.`,
        severity: "blocking",
        operation_id: operation.operation_id,
      });
    } else {
      review.push({
        code: "operation_degraded",
        label: `${operation.type} is degraded for export.`,
        severity: "review",
        operation_id: operation.operation_id,
      });
    }
  }

  for (const attentionItem of args.boundAttentionQueue) {
    review.push({
      code: `bound_attention_${attentionItem.object_type}`,
      label: `${attentionItem.label} needs review (${attentionItem.reasons.join(", ")}).`,
      severity: "review",
      operation_id: attentionItem.object_id,
    });
  }

  for (const unresolvedOperationId of args.unresolvedBrollSuggestionOperationIds) {
    review.push({
      code: "unresolved_broll_intent",
      label: "Unresolved B-roll suggestion still needs editorial resolution.",
      severity: "review",
      operation_id: unresolvedOperationId,
    });
  }

  const podcastMasterLayer = args.renderAssembly.export_timeline.audio_layers
    .find((layer) => layer.kind === "podcast_master_pass") ?? null;
  const podcastMasterOperationId = resolvePodcastMasterOperationId(args.canonicalGraph);
  if (podcastMasterLayer) {
    if (podcastMasterLayer.posture === "unavailable") {
      blocking.push({
        code: "podcast_master_unavailable",
        label: "Podcast Master is declared but unavailable in this runtime.",
        severity: "blocking",
        operation_id: podcastMasterOperationId,
      });
    } else if (podcastMasterLayer.posture === "degraded") {
      review.push({
        code: "podcast_master_degraded",
        label: "Podcast Master is declared with degraded stage support.",
        severity: "review",
        operation_id: podcastMasterOperationId,
      });
    }
    if (podcastMasterLayer.meta?.preview_mode === "export_only") {
      review.push({
        code: "podcast_master_export_only",
        label: "Podcast Master is export-only in this runtime.",
        severity: "review",
        operation_id: podcastMasterOperationId,
      });
    }
  }

  const blockingReasons = dedupeReasons(blocking);
  const reviewReasons = dedupeReasons(review);
  const status: HammerReadinessGateStatus = blockingReasons.length > 0
    ? "blocked"
    : reviewReasons.length > 0
    ? "needs_review"
    : "ready";
  const primaryOperationId = blockingReasons[0]?.operation_id
    ?? reviewReasons[0]?.operation_id
    ?? null;

  return {
    status,
    review_count: reviewReasons.length,
    blocker_count: blockingReasons.length,
    blocking_reasons: blockingReasons,
    review_reasons: reviewReasons,
    primary_operation_id: primaryOperationId,
  };
}
