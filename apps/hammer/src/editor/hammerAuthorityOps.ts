import type {
  HammerAudioDuckInstruction,
  HammerEditInstruction,
  HammerInsertBrollInstruction,
  HammerRippleDeleteInstruction,
} from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type {
  HammerEditorialAuthorityGraph,
  HammerEditorialAuthorityOperation,
} from "../../../../packages/contracts/hammer/editorial-authority.contract";

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
