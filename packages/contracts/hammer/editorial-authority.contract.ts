import type { HammerEditInstruction } from "./edit-instruction.contract";

export const HAMMER_EDITORIAL_AUTHORITY_VERSION = 1;
export const HAMMER_EDITORIAL_AUTHORITY_ARTIFACT_PATH = "hammer/session/editorial-authority.v1.json";

export type HammerEditorialCapability =
  | "executable"
  | "degraded"
  | "unavailable";

export type HammerEditorialPreviewTruthPosture =
  | "authoritative"
  | "degraded"
  | "unavailable";

export type HammerEditorialTruthTarget =
  | "preview"
  | "export"
  | "handoff";

export type HammerEditorialOperationLifecycle =
  | "active"
  | "reverted"
  | "superseded";

export type HammerEditorialDegradationReasonCode =
  | "runtime_missing_capability"
  | "runtime_partial_capability"
  | "preview_not_supported"
  | "export_not_supported"
  | "handoff_deferred"
  | "operation_not_implemented"
  | "operation_input_invalid"
  | "operation_conflict";

export interface HammerEditorialCapabilityState {
  capability: HammerEditorialCapability;
  reason_codes: HammerEditorialDegradationReasonCode[];
  reason_detail?: string | null;
}

export interface HammerEditorialPerTargetTruth {
  target: HammerEditorialTruthTarget;
  posture: HammerEditorialPreviewTruthPosture;
  capability: HammerEditorialCapability;
  reason_codes: HammerEditorialDegradationReasonCode[];
}

export interface HammerEditorialOperationExecutionPosture {
  preview: HammerEditorialPerTargetTruth;
  export: HammerEditorialPerTargetTruth;
  handoff: HammerEditorialPerTargetTruth;
}

export interface HammerEditorialOperationProvenance {
  source: "user" | "macro" | "projection" | "migration" | "system";
  source_ref?: string | null;
  authored_by?: string | null;
  authored_at: string;
}

export interface HammerEditorialAuthorityOperation {
  operation_id: string;
  sequence: number;
  lifecycle: HammerEditorialOperationLifecycle;
  instruction: HammerEditInstruction;
  capability_state: HammerEditorialCapabilityState;
  truth_posture: HammerEditorialOperationExecutionPosture;
  superseded_by_operation_id?: string | null;
  provenance: HammerEditorialOperationProvenance;
  created_at: string;
  updated_at: string;
}

export interface HammerEditorialAuthorityGraph {
  schema_version: 1;
  graph_id: string;
  graph_version: number;
  workspace_id?: string | null;
  workpiece_id?: string | null;
  session_id?: string | null;
  source_transcript_id?: string | null;
  operation_order: string[];
  operations: HammerEditorialAuthorityOperation[];
  created_at: string;
  updated_at: string;
}

export type HammerEditorialAuthoritySerialized = HammerEditorialAuthorityGraph;

export function cloneHammerEditorialAuthorityGraph(
  graph: HammerEditorialAuthorityGraph,
): HammerEditorialAuthorityGraph {
  return {
    ...graph,
    operation_order: [...graph.operation_order],
    operations: graph.operations.map((operation) => ({
      ...operation,
      instruction: { ...operation.instruction },
      capability_state: {
        ...operation.capability_state,
        reason_codes: [...operation.capability_state.reason_codes],
      },
      truth_posture: {
        preview: {
          ...operation.truth_posture.preview,
          reason_codes: [...operation.truth_posture.preview.reason_codes],
        },
        export: {
          ...operation.truth_posture.export,
          reason_codes: [...operation.truth_posture.export.reason_codes],
        },
        handoff: {
          ...operation.truth_posture.handoff,
          reason_codes: [...operation.truth_posture.handoff.reason_codes],
        },
      },
      provenance: { ...operation.provenance },
    })),
  };
}
