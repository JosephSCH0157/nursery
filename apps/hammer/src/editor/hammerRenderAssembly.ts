import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerEditPlan } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerEditorialAuthorityGraph,
  HammerEditorialAuthorityOperation,
  HammerEditorialCapability,
  HammerEditorialDegradationReasonCode,
  HammerEditorialPreviewTruthPosture,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";

export type HammerRenderAssemblyTruthPosture = HammerEditorialPreviewTruthPosture;
export type HammerRenderAssemblyPlanTarget = "preview" | "export" | "handoff";

export interface HammerRenderRuntimeCapabilities {
  preview_supported_operation_types: HammerEditInstruction["type"][];
  export_supported_operation_types: HammerEditInstruction["type"][];
  handoff_supported_operation_types: HammerEditInstruction["type"][];
}

export interface HammerRenderAssemblyOperationResolution {
  operation_id: string;
  instruction_id: string;
  type: HammerEditInstruction["type"];
  lifecycle: HammerEditorialAuthorityOperation["lifecycle"];
  preview_posture: HammerRenderAssemblyTruthPosture;
  export_posture: HammerRenderAssemblyTruthPosture;
  handoff_posture: HammerRenderAssemblyTruthPosture;
  capability: HammerEditorialCapability;
  reason_codes: HammerEditorialDegradationReasonCode[];
}

export interface HammerRenderAssemblyPlan {
  target: HammerRenderAssemblyPlanTarget;
  posture: HammerRenderAssemblyTruthPosture;
  operation_ids: string[];
  degraded_operation_ids: string[];
  unavailable_operation_ids: string[];
}

export interface HammerRenderAssemblyResult {
  schema_version: 1;
  graph_id: string;
  graph_version: number;
  operations: HammerRenderAssemblyOperationResolution[];
  preview: HammerRenderAssemblyPlan;
  export: HammerRenderAssemblyPlan;
  handoff: HammerRenderAssemblyPlan;
}

function postureFromSupport(isSupported: boolean): HammerRenderAssemblyTruthPosture {
  return isSupported ? "authoritative" : "degraded";
}

function aggregatePosture(values: HammerRenderAssemblyTruthPosture[]): HammerRenderAssemblyTruthPosture {
  if (values.includes("unavailable")) return "unavailable";
  if (values.includes("degraded")) return "degraded";
  return "authoritative";
}

function mapLegacyInstructionCapability(
  instruction: HammerEditInstruction,
): HammerEditorialCapability {
  return instruction.execution?.capability ?? "executable";
}

function mapLegacyInstructionReasons(
  instruction: HammerEditInstruction,
): HammerEditorialDegradationReasonCode[] {
  const reasons = instruction.execution?.degradation_reasons ?? [];
  return reasons
    .map((reason) => {
      switch (reason) {
        case "runtime_missing_capability":
        case "runtime_partial_capability":
        case "preview_not_supported":
        case "export_not_supported":
        case "handoff_deferred":
        case "operation_not_implemented":
        case "operation_input_invalid":
        case "operation_conflict":
          return reason;
        default:
          return "operation_not_implemented";
      }
    });
}

function baseOperationPosture(args: {
  instruction: HammerEditInstruction;
  capabilities: HammerRenderRuntimeCapabilities;
}): Pick<HammerRenderAssemblyOperationResolution, "preview_posture" | "export_posture" | "handoff_posture"> {
  const previewSupported = args.capabilities.preview_supported_operation_types.includes(args.instruction.type);
  const exportSupported = args.capabilities.export_supported_operation_types.includes(args.instruction.type);
  const handoffSupported = args.capabilities.handoff_supported_operation_types.includes(args.instruction.type);
  return {
    preview_posture: postureFromSupport(previewSupported),
    export_posture: postureFromSupport(exportSupported),
    handoff_posture: postureFromSupport(handoffSupported),
  };
}

export function projectEditorialAuthorityGraphFromEditPlan(args: {
  editPlan: HammerEditPlan;
  workspaceId?: string | null;
  workpieceId?: string | null;
  sessionId?: string | null;
  nowIso?: string;
}): HammerEditorialAuthorityGraph {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const operations: HammerEditorialAuthorityOperation[] = args.editPlan.instructions.map((instruction, index) => {
    const operationId = `op:${instruction.instruction_id}`;
    return {
      operation_id: operationId,
      sequence: index,
      lifecycle: "active",
      instruction: { ...instruction },
      capability_state: {
        capability: mapLegacyInstructionCapability(instruction),
        reason_codes: mapLegacyInstructionReasons(instruction),
      },
      truth_posture: {
        preview: {
          target: "preview",
          posture: "authoritative",
          capability: mapLegacyInstructionCapability(instruction),
          reason_codes: mapLegacyInstructionReasons(instruction),
        },
        export: {
          target: "export",
          posture: "authoritative",
          capability: mapLegacyInstructionCapability(instruction),
          reason_codes: mapLegacyInstructionReasons(instruction),
        },
        handoff: {
          target: "handoff",
          posture: "authoritative",
          capability: mapLegacyInstructionCapability(instruction),
          reason_codes: mapLegacyInstructionReasons(instruction),
        },
      },
      provenance: {
        source: "projection",
        source_ref: args.editPlan.edit_plan_id,
        authored_at: instruction.created_at,
      },
      created_at: instruction.created_at,
      updated_at: nowIso,
    };
  });

  return {
    schema_version: 1,
    graph_id: `${args.editPlan.edit_plan_id}:authority`,
    graph_version: 1,
    workspace_id: args.workspaceId ?? args.editPlan.workspace_id ?? null,
    workpiece_id: args.workpieceId ?? args.editPlan.workpiece_id ?? null,
    session_id: args.sessionId ?? args.editPlan.session_id ?? null,
    source_transcript_id: args.editPlan.source_transcript_id,
    operation_order: operations.map((operation) => operation.operation_id),
    operations,
    created_at: args.editPlan.created_at,
    updated_at: nowIso,
  };
}

export function projectEditPlanFromEditorialAuthorityGraph(args: {
  graph: HammerEditorialAuthorityGraph;
  fallback: HammerEditPlan;
  nowIso?: string;
}): HammerEditPlan {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const activeOperations = args.graph.operations
    .filter((operation) => operation.lifecycle === "active")
    .sort((left, right) => left.sequence - right.sequence);
  return {
    ...args.fallback,
    updated_at: nowIso,
    source_transcript_id: args.graph.source_transcript_id ?? args.fallback.source_transcript_id,
    workspace_id: args.graph.workspace_id ?? args.fallback.workspace_id,
    workpiece_id: args.graph.workpiece_id ?? args.fallback.workpiece_id,
    session_id: args.graph.session_id ?? args.fallback.session_id,
    instructions: activeOperations.map((operation) => ({ ...operation.instruction })),
  };
}

export function buildHammerRenderAssembly(args: {
  canonicalGraph: HammerEditorialAuthorityGraph;
  runtimeCapabilities: HammerRenderRuntimeCapabilities;
}): HammerRenderAssemblyResult {
  const operations = args.canonicalGraph.operations
    .filter((operation) => operation.lifecycle === "active")
    .sort((left, right) => left.sequence - right.sequence)
    .map((operation) => {
      const baseline = baseOperationPosture({
        instruction: operation.instruction,
        capabilities: args.runtimeCapabilities,
      });
      const explicitPreview = operation.truth_posture.preview.posture;
      const explicitExport = operation.truth_posture.export.posture;
      const explicitHandoff = operation.truth_posture.handoff.posture;
      const previewPosture = aggregatePosture([baseline.preview_posture, explicitPreview]);
      const exportPosture = aggregatePosture([baseline.export_posture, explicitExport]);
      const handoffPosture = aggregatePosture([baseline.handoff_posture, explicitHandoff]);
      const unresolvedBroll = operation.instruction.type === "insert_broll"
        && operation.instruction.asset_binding_state === "unresolved";
      const unresolvedReasonCodes: HammerEditorialDegradationReasonCode[] = unresolvedBroll
        ? ["preview_not_supported", "handoff_deferred"]
        : [];
      const reasonCodes = [
        ...operation.capability_state.reason_codes,
        ...operation.truth_posture.preview.reason_codes,
        ...operation.truth_posture.export.reason_codes,
        ...operation.truth_posture.handoff.reason_codes,
        ...unresolvedReasonCodes,
      ];
      return {
        operation_id: operation.operation_id,
        instruction_id: operation.instruction.instruction_id,
        type: operation.instruction.type,
        lifecycle: operation.lifecycle,
        preview_posture: unresolvedBroll ? "unavailable" : previewPosture,
        export_posture: unresolvedBroll ? "degraded" : exportPosture,
        handoff_posture: unresolvedBroll ? "degraded" : handoffPosture,
        capability: unresolvedBroll ? "degraded" : operation.capability_state.capability,
        reason_codes: Array.from(new Set(reasonCodes)),
      } satisfies HammerRenderAssemblyOperationResolution;
    });

  const buildPlan = (target: HammerRenderAssemblyPlanTarget): HammerRenderAssemblyPlan => {
    const operationIds = operations.map((operation) => operation.operation_id);
    const postureValues = operations.map((operation) => {
      if (target === "preview") return operation.preview_posture;
      if (target === "export") return operation.export_posture;
      return operation.handoff_posture;
    });
    const degradedOperationIds = operations
      .filter((operation) => (
        (target === "preview" && operation.preview_posture === "degraded")
        || (target === "export" && operation.export_posture === "degraded")
        || (target === "handoff" && operation.handoff_posture === "degraded")
      ))
      .map((operation) => operation.operation_id);
    const unavailableOperationIds = operations
      .filter((operation) => (
        (target === "preview" && operation.preview_posture === "unavailable")
        || (target === "export" && operation.export_posture === "unavailable")
        || (target === "handoff" && operation.handoff_posture === "unavailable")
      ))
      .map((operation) => operation.operation_id);
    return {
      target,
      posture: aggregatePosture(postureValues),
      operation_ids: operationIds,
      degraded_operation_ids: degradedOperationIds,
      unavailable_operation_ids: unavailableOperationIds,
    };
  };

  return {
    schema_version: 1,
    graph_id: args.canonicalGraph.graph_id,
    graph_version: args.canonicalGraph.graph_version,
    operations,
    preview: buildPlan("preview"),
    export: buildPlan("export"),
    handoff: buildPlan("handoff"),
  };
}
