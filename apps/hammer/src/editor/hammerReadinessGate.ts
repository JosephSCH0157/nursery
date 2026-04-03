import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerRenderAssemblyResult } from "./hammerRenderAssembly";
import type { HammerBoundAttentionQueueItem } from "./hammerBoundObjects";
import {
  buildHammerReadinessVerdict,
  createHammerReadinessReason,
  type HammerReadinessGateResult,
  type HammerReadinessReason,
  type HammerReadinessReasonCode,
} from "./hammerReadinessTypes";
export type {
  HammerReadinessGateResult,
  HammerReadinessReason,
  HammerReadinessReasonCode,
} from "./hammerReadinessTypes";
export type { HammerReadinessVerdictStatus as HammerReadinessGateStatus } from "./hammerReadinessTypes";

function dedupeReasons(reasons: HammerReadinessReason[]): HammerReadinessReason[] {
  const seen = new Set<string>();
  const rows: HammerReadinessReason[] = [];
  for (const reason of reasons) {
    const key = `${reason.severity}:${reason.code}:${reason.operationId ?? "-"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(reason);
  }
  return rows;
}

function resolveBoundAttentionCode(objectType: HammerBoundAttentionQueueItem["object_type"]): HammerReadinessReasonCode {
  switch (objectType) {
    case "audio_duck":
      return "bound_attention_audio";
    case "broll":
    case "transition":
    default:
      return "bound_attention_video";
  }
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
    blocking.push(createHammerReadinessReason({
      code: "export_posture_unavailable",
      label: "Export assembly is unavailable.",
      severity: "blocking",
      source: "gate",
      operationId: null,
    }));
  } else if (args.renderAssembly.export_timeline.export_posture === "degraded") {
    review.push(createHammerReadinessReason({
      code: "export_posture_degraded",
      label: "Export assembly is degraded and needs review.",
      severity: "review",
      source: "gate",
      operationId: null,
    }));
  }

  for (const operation of args.renderAssembly.export_timeline.unsupported_or_degraded_ops) {
    if (operation.posture === "unavailable") {
      blocking.push(createHammerReadinessReason({
        code: "operation_unavailable",
        label: `${operation.type} is unavailable for export.`,
        severity: "blocking",
        source: "gate",
        operationId: operation.operation_id,
      }));
    } else {
      review.push(createHammerReadinessReason({
        code: "operation_degraded",
        label: `${operation.type} is degraded for export.`,
        severity: "review",
        source: "gate",
        operationId: operation.operation_id,
      }));
    }
  }

  for (const attentionItem of args.boundAttentionQueue) {
    review.push(createHammerReadinessReason({
      code: resolveBoundAttentionCode(attentionItem.object_type),
      label: `${attentionItem.label} needs review (${attentionItem.reasons.join(", ")}).`,
      severity: "review",
      source: "gate",
      operationId: attentionItem.object_id,
    }));
  }

  for (const unresolvedOperationId of args.unresolvedBrollSuggestionOperationIds) {
    review.push(createHammerReadinessReason({
      code: "unresolved_broll_intent",
      label: "Unresolved B-roll suggestion still needs editorial resolution.",
      severity: "review",
      source: "gate",
      operationId: unresolvedOperationId,
    }));
  }

  const podcastMasterLayer = args.renderAssembly.export_timeline.audio_layers
    .find((layer) => layer.kind === "podcast_master_pass") ?? null;
  const podcastMasterOperationId = resolvePodcastMasterOperationId(args.canonicalGraph);
  if (podcastMasterLayer) {
    if (podcastMasterLayer.posture === "unavailable") {
      blocking.push(createHammerReadinessReason({
        code: "podcast_master_unavailable",
        label: "Podcast Master is declared but unavailable in this runtime.",
        severity: "blocking",
        source: "gate",
        operationId: podcastMasterOperationId,
      }));
    } else if (podcastMasterLayer.posture === "degraded") {
      review.push(createHammerReadinessReason({
        code: "podcast_master_degraded",
        label: "Podcast Master is declared with degraded stage support.",
        severity: "review",
        source: "gate",
        operationId: podcastMasterOperationId,
      }));
    }
    if (podcastMasterLayer.meta?.preview_mode === "export_only") {
      review.push(createHammerReadinessReason({
        code: "podcast_master_export_only",
        label: "Podcast Master is export-only in this runtime.",
        severity: "review",
        source: "gate",
        operationId: podcastMasterOperationId,
      }));
    }
  }

  const blockingReasons = dedupeReasons(blocking);
  const reviewReasons = dedupeReasons(review);
  return buildHammerReadinessVerdict({
    blockingReasons,
    reviewReasons,
  });
}
