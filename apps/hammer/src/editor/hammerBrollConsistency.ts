import type { HammerEditorialAuthorityGraph, HammerEditorialAuthorityOperation } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerInsertBrollInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerVisualAsset, HammerVisualClip, HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";

export const HAMMER_BROLL_CONSISTENCY_TIMING_TOLERANCE_SEC = 0.001;

export type HammerBrollConsistencyFindingCode =
  | "timeline_clip_without_operation"
  | "operation_without_timeline_clip"
  | "duplicate_operation_projection"
  | "wrong_operation_type"
  | "unresolved_operation_has_clip"
  | "asset_binding_mismatch"
  | "timing_mismatch"
  | "anchor_mismatch"
  | "stale_projection"
  | "linked_duck_divergence";

export interface HammerBrollConsistencyFinding {
  code: HammerBrollConsistencyFindingCode;
  severity: "blocking" | "review";
  operationId: string | null;
  clipId: string | null;
  assetRef: string | null;
  detail: string;
}

export interface HammerBrollConsistencyResult {
  status: "aligned" | "review" | "blocked";
  findings: HammerBrollConsistencyFinding[];
}

const normalize = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
};

const isInsertBroll = (
  operation: HammerEditorialAuthorityOperation,
): operation is HammerEditorialAuthorityOperation & { instruction: HammerInsertBrollInstruction } => (
  operation.instruction.type === "insert_broll"
);

function isGovernedBrollClip(clip: HammerVisualClip, asset: HammerVisualAsset | null): boolean {
  if (asset?.kind === "broll" || asset?.kind === "reference_clip") return true;
  const mode = normalize(clip.visual_mode)?.toLowerCase().replace(/-/g, "_") ?? "";
  return mode === "broll" || mode === "b_roll" || mode === "reference_clip";
}

function resolveClipAssetRef(asset: HammerVisualAsset | null): string | null {
  return normalize(asset?.asset_ref) ?? normalize(asset?.path) ?? normalize(asset?.storage_key);
}

function windowsDiffer(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number, tolerance: number): boolean {
  return Math.abs(leftStart - rightStart) > tolerance || Math.abs(leftEnd - rightEnd) > tolerance;
}

function compareFinding(left: HammerBrollConsistencyFinding, right: HammerBrollConsistencyFinding): number {
  return (left.operationId ?? "").localeCompare(right.operationId ?? "")
    || (left.clipId ?? "").localeCompare(right.clipId ?? "")
    || left.code.localeCompare(right.code)
    || left.detail.localeCompare(right.detail);
}

export function evaluateHammerBrollConsistency(args: {
  graph: HammerEditorialAuthorityGraph | null;
  visualTimeline: HammerVisualTimelineState | null;
  timingToleranceSec?: number;
}): HammerBrollConsistencyResult {
  const tolerance = args.timingToleranceSec ?? HAMMER_BROLL_CONSISTENCY_TIMING_TOLERANCE_SEC;
  const operations = args.graph?.operations ?? [];
  const operationsById = new Map(operations.map((operation) => [operation.operation_id, operation]));
  const assetsById = new Map((args.visualTimeline?.assets ?? []).map((asset) => [asset.asset_id, asset]));
  const governedClips = (args.visualTimeline?.clips ?? []).filter((clip) => (
    isGovernedBrollClip(clip, clip.asset_id ? assetsById.get(clip.asset_id) ?? null : null)
  ));
  const clipsByOperationId = new Map<string, HammerVisualClip[]>();
  const findings: HammerBrollConsistencyFinding[] = [];

  for (const clip of governedClips) {
    const operationId = normalize(clip.authority_operation_id);
    const asset = clip.asset_id ? assetsById.get(clip.asset_id) ?? null : null;
    const assetRef = resolveClipAssetRef(asset);
    if (!operationId) {
      findings.push({
        code: "timeline_clip_without_operation",
        severity: "blocking",
        operationId: null,
        clipId: clip.clip_id,
        assetRef,
        detail: `Visual clip ${clip.clip_id} has no authority operation identity.`,
      });
      continue;
    }
    const correlated = clipsByOperationId.get(operationId) ?? [];
    correlated.push(clip);
    clipsByOperationId.set(operationId, correlated);
    const operation = operationsById.get(operationId) ?? null;
    if (!operation) {
      findings.push({
        code: "timeline_clip_without_operation",
        severity: "blocking",
        operationId,
        clipId: clip.clip_id,
        assetRef,
        detail: `Visual clip ${clip.clip_id} references missing authority operation ${operationId}.`,
      });
      continue;
    }
    if (!isInsertBroll(operation)) {
      findings.push({
        code: "wrong_operation_type",
        severity: "blocking",
        operationId,
        clipId: clip.clip_id,
        assetRef,
        detail: `Visual clip ${clip.clip_id} references ${operation.instruction.type}, not insert_broll.`,
      });
      continue;
    }
    if (operation.lifecycle !== "active" || !clip.enabled) {
      findings.push({
        code: "stale_projection",
        severity: "blocking",
        operationId,
        clipId: clip.clip_id,
        assetRef,
        detail: operation.lifecycle !== "active"
          ? `Visual clip ${clip.clip_id} survives ${operation.lifecycle} operation ${operationId}.`
          : `Active operation ${operationId} is projected by disabled clip ${clip.clip_id}.`,
      });
    }
    if (operation.instruction.asset_binding_state === "unresolved") {
      findings.push({
        code: "unresolved_operation_has_clip",
        severity: "blocking",
        operationId,
        clipId: clip.clip_id,
        assetRef,
        detail: `Unresolved operation ${operationId} has visual clip ${clip.clip_id}.`,
      });
      continue;
    }
    if (normalize(operation.instruction.asset_ref) !== assetRef) {
      findings.push({
        code: "asset_binding_mismatch",
        severity: "blocking",
        operationId,
        clipId: clip.clip_id,
        assetRef,
        detail: `Operation ${operationId} and clip ${clip.clip_id} reference different assets.`,
      });
    }
    if (windowsDiffer(operation.instruction.start_sec, operation.instruction.end_sec, clip.start_sec, clip.end_sec, tolerance)) {
      findings.push({
        code: "timing_mismatch",
        severity: "blocking",
        operationId,
        clipId: clip.clip_id,
        assetRef,
        detail: `Operation ${operationId} and clip ${clip.clip_id} have different composition intervals.`,
      });
    }
    if (normalize(operation.instruction.segment_id) !== normalize(clip.anchor_hint.anchor_segment_id)) {
      findings.push({
        code: "anchor_mismatch",
        severity: "blocking",
        operationId,
        clipId: clip.clip_id,
        assetRef,
        detail: `Operation ${operationId} and clip ${clip.clip_id} reference different transcript anchors.`,
      });
    }
  }

  for (const operation of operations.filter(isInsertBroll)) {
    const clips = clipsByOperationId.get(operation.operation_id) ?? [];
    if (clips.length > 1) {
      findings.push({
        code: "duplicate_operation_projection",
        severity: "blocking",
        operationId: operation.operation_id,
        clipId: null,
        assetRef: normalize(operation.instruction.asset_ref),
        detail: `Operation ${operation.operation_id} is projected by ${clips.length} visual clips.`,
      });
    }
    if (operation.lifecycle === "active" && operation.instruction.asset_binding_state !== "unresolved" && clips.length === 0) {
      findings.push({
        code: "operation_without_timeline_clip",
        severity: "blocking",
        operationId: operation.operation_id,
        clipId: null,
        assetRef: normalize(operation.instruction.asset_ref),
        detail: `Resolved operation ${operation.operation_id} has no visual timeline projection.`,
      });
    }

    const companionId = normalize(operation.instruction.companion_audio_duck_operation_id);
    const linkedDucks = operations.filter((candidate) => (
      candidate.instruction.type === "audio_duck"
      && normalize(candidate.instruction.linked_broll_operation_id) === operation.operation_id
    ));
    if (!companionId && linkedDucks.length === 0) continue;
    const companion = companionId ? operationsById.get(companionId) ?? null : null;
    const companionValid = companion?.instruction.type === "audio_duck"
      && companion.lifecycle === operation.lifecycle
      && normalize(companion.instruction.linked_broll_operation_id) === operation.operation_id
      && !windowsDiffer(
        operation.instruction.start_sec,
        operation.instruction.end_sec,
        companion.instruction.start_sec,
        companion.instruction.end_sec,
        tolerance,
      );
    if (!companionValid || linkedDucks.length !== 1 || linkedDucks[0]?.operation_id !== companionId) {
      findings.push({
        code: "linked_duck_divergence",
        severity: "blocking",
        operationId: operation.operation_id,
        clipId: clips[0]?.clip_id ?? null,
        assetRef: normalize(operation.instruction.asset_ref),
        detail: `Operation ${operation.operation_id} and its linked audio duck are not consistently paired.`,
      });
    }
  }

  findings.sort(compareFinding);
  return {
    status: findings.some((finding) => finding.severity === "blocking")
      ? "blocked"
      : findings.some((finding) => finding.severity === "review")
        ? "review"
        : "aligned",
    findings,
  };
}
