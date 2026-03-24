import type {
  HammerAudioDuckInstruction,
  HammerEditInstruction,
  HammerInsertBrollInstruction,
  HammerRippleDeleteInstruction,
} from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type {
  HammerEditorialAuthorityGraph,
  HammerEditorialAuthorityOperation,
  HammerEditorialDegradationReasonCode,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { remapPlacementForRippleDelete } from "./hammerWorkspaceTimeline";

interface AppendAuthorityInstructionArgs {
  graph: HammerEditorialAuthorityGraph | null;
  instruction: HammerEditInstruction;
  nowIso?: string;
  fallback: {
    graphId: string;
    workspaceId: string;
    workpieceId: string;
    sessionId: string;
    sourceTranscriptId: string;
  };
}

function createOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `op:${crypto.randomUUID()}`;
  }
  return `op:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function createInstructionId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeGraph(args: AppendAuthorityInstructionArgs): HammerEditorialAuthorityGraph {
  if (args.graph) {
    return {
      ...args.graph,
      operation_order: [...args.graph.operation_order],
      operations: args.graph.operations.map((operation) => ({
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
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    schema_version: 1,
    graph_id: args.fallback.graphId,
    graph_version: 1,
    workspace_id: args.fallback.workspaceId,
    workpiece_id: args.fallback.workpieceId,
    session_id: args.fallback.sessionId,
    source_transcript_id: args.fallback.sourceTranscriptId,
    operation_order: [],
    operations: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export function appendAuthorityInstructionToGraph(
  args: AppendAuthorityInstructionArgs,
): HammerEditorialAuthorityGraph {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const graph = normalizeGraph(args);
  const nextSequence = graph.operations.length > 0
    ? Math.max(...graph.operations.map((operation) => operation.sequence)) + 1
    : 0;
  const operation: HammerEditorialAuthorityOperation = {
    operation_id: createOperationId(),
    sequence: nextSequence,
    lifecycle: "active",
    instruction: { ...args.instruction },
    capability_state: {
      capability: "executable",
      reason_codes: [],
    },
    truth_posture: {
      preview: {
        target: "preview",
        posture: "authoritative",
        capability: "executable",
        reason_codes: [],
      },
      export: {
        target: "export",
        posture: "authoritative",
        capability: "executable",
        reason_codes: [],
      },
      handoff: {
        target: "handoff",
        posture: "authoritative",
        capability: "executable",
        reason_codes: [],
      },
    },
    provenance: {
      source: "user",
      authored_at: nowIso,
    },
    created_at: nowIso,
    updated_at: nowIso,
  };
  return {
    ...graph,
    operation_order: [...graph.operation_order, operation.operation_id],
    operations: [...graph.operations, operation],
    graph_version: graph.graph_version + 1,
    updated_at: nowIso,
  };
}

export function createRippleDeleteInstruction(args: {
  segmentId: string;
  startSec: number;
  endSec: number;
  nowIso?: string;
  instructionId?: string;
}): HammerRippleDeleteInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("ripple_delete"),
    segment_id: args.segmentId,
    type: "ripple_delete",
    start_sec: args.startSec,
    end_sec: args.endSec,
    created_at: nowIso,
    execution: {
      operation_family: "timeline_structural",
      capability: "executable",
      status: "declared",
      target: "preview",
    },
  };
}

export function createInsertBrollInstruction(args: {
  segmentId: string;
  assetRef: string;
  startSec: number;
  endSec: number;
  intentSource?: "manual" | "hearth_suggestion";
  intentRef?: string;
  intentDescription?: string | null;
  assetBindingState?: "resolved" | "unresolved";
  duckPreference?: "auto" | "none" | "manual";
  nowIso?: string;
  instructionId?: string;
}): HammerInsertBrollInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("insert_broll"),
    segment_id: args.segmentId,
    type: "insert_broll",
    asset_ref: args.assetRef,
    start_sec: args.startSec,
    end_sec: args.endSec,
    intent_source: args.intentSource ?? "manual",
    intent_ref: args.intentRef ?? undefined,
    intent_description: args.intentDescription ?? null,
    asset_binding_state: args.assetBindingState ?? "resolved",
    duck_preference: args.duckPreference ?? "auto",
    created_at: nowIso,
    execution: {
      operation_family: "visual_insertion",
      capability: "executable",
      status: "declared",
      target: "preview",
    },
  };
}

export function createHearthBrollSuggestionInstruction(args: {
  segmentId: string;
  intentRef: string;
  intentDescription: string;
  startSec: number;
  endSec: number;
  duckPreference?: "auto" | "none" | "manual";
  nowIso?: string;
  instructionId?: string;
}): HammerInsertBrollInstruction {
  return createInsertBrollInstruction({
    segmentId: args.segmentId,
    assetRef: `unresolved:${args.intentRef}`,
    startSec: args.startSec,
    endSec: args.endSec,
    intentSource: "hearth_suggestion",
    intentRef: args.intentRef,
    intentDescription: args.intentDescription,
    assetBindingState: "unresolved",
    duckPreference: args.duckPreference ?? "auto",
    nowIso: args.nowIso,
    instructionId: args.instructionId,
  });
}

export function resolveInsertBrollSuggestionInGraph(args: {
  graph: HammerEditorialAuthorityGraph;
  operationId: string;
  assetRef: string;
  startSec: number;
  endSec: number;
  nowIso?: string;
}): HammerEditorialAuthorityGraph | null {
  const nowIso = args.nowIso ?? new Date().toISOString();
  let changed = false;
  const operations = args.graph.operations.map((operation) => {
    if (operation.operation_id !== args.operationId) return operation;
    if (operation.instruction.type !== "insert_broll") return operation;
    changed = true;
    return {
      ...operation,
      instruction: {
        ...operation.instruction,
        asset_ref: args.assetRef,
        start_sec: args.startSec,
        end_sec: args.endSec,
        asset_binding_state: "resolved" as const,
      },
      updated_at: nowIso,
    };
  });
  if (!changed) return null;
  return {
    ...args.graph,
    operations,
    graph_version: args.graph.graph_version + 1,
    updated_at: nowIso,
  };
}

export function updateResolvedInsertBrollOperationInGraph(args: {
  graph: HammerEditorialAuthorityGraph;
  operationId: string;
  changes: Partial<Pick<
    HammerInsertBrollInstruction,
    "asset_ref" | "start_sec" | "end_sec" | "intent_description" | "duck_preference"
  >>;
  nowIso?: string;
}): HammerEditorialAuthorityGraph | null {
  const nowIso = args.nowIso ?? new Date().toISOString();
  let changed = false;
  const operations = args.graph.operations.map((operation) => {
    if (operation.operation_id !== args.operationId) return operation;
    if (operation.instruction.type !== "insert_broll") return operation;
    if (operation.instruction.asset_binding_state === "unresolved") return operation;
    const nextInstruction: HammerInsertBrollInstruction = {
      ...operation.instruction,
      ...(args.changes.asset_ref ? { asset_ref: args.changes.asset_ref } : {}),
      ...(typeof args.changes.start_sec === "number" ? { start_sec: args.changes.start_sec } : {}),
      ...(typeof args.changes.end_sec === "number" ? { end_sec: args.changes.end_sec } : {}),
      ...(args.changes.intent_description !== undefined ? { intent_description: args.changes.intent_description } : {}),
      ...(args.changes.duck_preference ? { duck_preference: args.changes.duck_preference } : {}),
      asset_binding_state: "resolved",
    };
    if (JSON.stringify(nextInstruction) === JSON.stringify(operation.instruction)) return operation;
    changed = true;
    return {
      ...operation,
      instruction: nextInstruction,
      updated_at: nowIso,
    };
  });
  if (!changed) return null;
  return {
    ...args.graph,
    operations,
    graph_version: args.graph.graph_version + 1,
    updated_at: nowIso,
  };
}

export interface RippleDeleteRemapSummary {
  adjustedOperationIds: string[];
  removedOperationIds: string[];
  attentionOperationIds: string[];
}

function mergeReasonCodes(
  current: HammerEditorialDegradationReasonCode[],
  incoming: HammerEditorialDegradationReasonCode[],
): HammerEditorialDegradationReasonCode[] {
  return Array.from(new Set([...current, ...incoming]));
}

export function remapResolvedBrollOperationsForRippleDelete(args: {
  graph: HammerEditorialAuthorityGraph;
  rippleDeleteOperationId: string;
  removedStartSec: number;
  removedEndSec: number;
  nowIso?: string;
}): {
  graph: HammerEditorialAuthorityGraph;
  summary: RippleDeleteRemapSummary;
} {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const summary: RippleDeleteRemapSummary = {
    adjustedOperationIds: [],
    removedOperationIds: [],
    attentionOperationIds: [],
  };
  let changed = false;

  const operations = args.graph.operations.map((operation) => {
    if (operation.lifecycle !== "active") return operation;
    if (operation.operation_id === args.rippleDeleteOperationId) return operation;
    if (operation.instruction.type !== "insert_broll") return operation;
    if (operation.instruction.asset_binding_state === "unresolved") return operation;

    const remap = remapPlacementForRippleDelete({
      startSec: operation.instruction.start_sec,
      endSec: operation.instruction.end_sec,
      removedStartSec: args.removedStartSec,
      removedEndSec: args.removedEndSec,
    });
    if (remap.kind === "unchanged") return operation;

    changed = true;
    if (remap.kind === "removed") {
      summary.removedOperationIds.push(operation.operation_id);
      return {
        ...operation,
        lifecycle: "superseded" as const,
        superseded_by_operation_id: args.rippleDeleteOperationId,
        updated_at: nowIso,
      };
    }

    summary.adjustedOperationIds.push(operation.operation_id);
    const reasonCodes = remap.needsAttention
      ? mergeReasonCodes(operation.capability_state.reason_codes, ["operation_conflict"])
      : operation.capability_state.reason_codes;
    if (remap.needsAttention) {
      summary.attentionOperationIds.push(operation.operation_id);
    }
    return {
      ...operation,
      instruction: {
        ...operation.instruction,
        start_sec: remap.startSec,
        end_sec: remap.endSec,
      },
      capability_state: remap.needsAttention
        ? {
          ...operation.capability_state,
          capability: "degraded" as const,
          reason_codes: reasonCodes,
        }
        : operation.capability_state,
      truth_posture: remap.needsAttention
        ? {
          preview: {
            ...operation.truth_posture.preview,
            posture: "degraded" as const,
            capability: "degraded" as const,
            reason_codes: mergeReasonCodes(operation.truth_posture.preview.reason_codes, ["operation_conflict"]),
          },
          export: {
            ...operation.truth_posture.export,
            posture: "degraded" as const,
            capability: "degraded" as const,
            reason_codes: mergeReasonCodes(operation.truth_posture.export.reason_codes, ["operation_conflict"]),
          },
          handoff: {
            ...operation.truth_posture.handoff,
            posture: "degraded" as const,
            capability: "degraded" as const,
            reason_codes: mergeReasonCodes(operation.truth_posture.handoff.reason_codes, ["operation_conflict"]),
          },
        }
        : operation.truth_posture,
      updated_at: nowIso,
    };
  });

  return {
    graph: changed
      ? {
        ...args.graph,
        operations,
        graph_version: args.graph.graph_version + 1,
        updated_at: nowIso,
      }
      : args.graph,
    summary,
  };
}

export function setAuthorityOperationLifecycle(args: {
  graph: HammerEditorialAuthorityGraph;
  operationId: string;
  lifecycle: "active" | "reverted" | "superseded";
  nowIso?: string;
}): HammerEditorialAuthorityGraph | null {
  const nowIso = args.nowIso ?? new Date().toISOString();
  let changed = false;
  const operations = args.graph.operations.map((operation) => {
    if (operation.operation_id !== args.operationId) return operation;
    if (operation.lifecycle === args.lifecycle) return operation;
    changed = true;
    return {
      ...operation,
      lifecycle: args.lifecycle,
      updated_at: nowIso,
    };
  });
  if (!changed) return null;
  return {
    ...args.graph,
    operations,
    graph_version: args.graph.graph_version + 1,
    updated_at: nowIso,
  };
}

export function createAudioDuckInstruction(args: {
  segmentId: string;
  startSec: number;
  endSec: number;
  duckGainDb: number;
  nowIso?: string;
  instructionId?: string;
}): HammerAudioDuckInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("audio_duck"),
    segment_id: args.segmentId,
    type: "audio_duck",
    start_sec: args.startSec,
    end_sec: args.endSec,
    duck_gain_db: args.duckGainDb,
    created_at: nowIso,
    execution: {
      operation_family: "audio_shaping",
      capability: "executable",
      status: "declared",
      target: "preview",
    },
  };
}
