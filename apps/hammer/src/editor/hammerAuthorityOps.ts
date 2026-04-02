import type {
  HammerApplyLookInstruction,
  HammerApplyExposureInstruction,
  HammerAudioDuckInstruction,
  HammerDipToBlackInstruction,
  HammerEditInstruction,
  HammerFadeAudioInstruction,
  HammerHardCutInstruction,
  HammerInsertBrollInstruction,
  HammerLookPreset,
  HammerPodcastMasterPassInstruction,
  HammerRippleDeleteInstruction,
  HammerCrossfadeInstruction,
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
    | "asset_ref"
    | "start_sec"
    | "end_sec"
    | "intent_description"
    | "duck_preference"
    | "companion_audio_duck_operation_id"
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
      ...(args.changes.companion_audio_duck_operation_id !== undefined
        ? { companion_audio_duck_operation_id: args.changes.companion_audio_duck_operation_id }
        : {}),
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

export function synchronizeLinkedAudioDuckForBrollOperation(args: {
  graph: HammerEditorialAuthorityGraph;
  brollOperationId: string;
  nowIso?: string;
}): HammerEditorialAuthorityGraph | null {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const broll = args.graph.operations.find((operation) => (
    operation.operation_id === args.brollOperationId
    && operation.lifecycle === "active"
    && operation.instruction.type === "insert_broll"
    && operation.instruction.asset_binding_state !== "unresolved"
  )) ?? null;
  if (!broll || broll.instruction.type !== "insert_broll") return null;
  const brollInstruction = broll.instruction;
  let changed = false;
  const operations = args.graph.operations.map((operation) => {
    if (operation.lifecycle !== "active") return operation;
    if (operation.instruction.type !== "audio_duck") return operation;
    const isLinkedByBrollRef = operation.instruction.linked_broll_operation_id === args.brollOperationId;
    const isLinkedByCompanionRef = (
      brollInstruction.companion_audio_duck_operation_id != null
      && operation.operation_id === brollInstruction.companion_audio_duck_operation_id
    );
    if (!isLinkedByBrollRef && !isLinkedByCompanionRef) return operation;
    const nextInstruction: HammerAudioDuckInstruction = {
      ...operation.instruction,
      segment_id: brollInstruction.segment_id,
      start_sec: brollInstruction.start_sec,
      end_sec: brollInstruction.end_sec,
      linked_broll_operation_id: args.brollOperationId,
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
  adjustedDuckOperationIds: string[];
  removedDuckOperationIds: string[];
  orphanedDuckOperationIds: string[];
  adjustedTransitionOperationIds: string[];
  removedTransitionOperationIds: string[];
  degradedTransitionOperationIds: string[];
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
    adjustedDuckOperationIds: [],
    removedDuckOperationIds: [],
    orphanedDuckOperationIds: [],
    adjustedTransitionOperationIds: [],
    removedTransitionOperationIds: [],
    degradedTransitionOperationIds: [],
  };
  let changed = false;

  let operations = args.graph.operations.map((operation) => {
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

  const activeBrollById = new Map<string, HammerEditorialAuthorityOperation>();
  const companionDuckToBrollId = new Map<string, string>();
  for (const operation of operations) {
    if (operation.lifecycle !== "active") continue;
    if (operation.instruction.type !== "insert_broll") continue;
    if (operation.instruction.asset_binding_state === "unresolved") continue;
    activeBrollById.set(operation.operation_id, operation);
    if (operation.instruction.companion_audio_duck_operation_id) {
      companionDuckToBrollId.set(operation.instruction.companion_audio_duck_operation_id, operation.operation_id);
    }
  }

  operations = operations.map((operation) => {
    if (operation.lifecycle !== "active") return operation;
    if (operation.instruction.type !== "audio_duck") return operation;
    const linkedBrollOperationId = operation.instruction.linked_broll_operation_id
      ?? companionDuckToBrollId.get(operation.operation_id)
      ?? null;
    if (!linkedBrollOperationId) return operation;
    const linkedBroll = activeBrollById.get(linkedBrollOperationId) ?? null;
    if (!linkedBroll || linkedBroll.instruction.type !== "insert_broll") {
      changed = true;
      summary.removedDuckOperationIds.push(operation.operation_id);
      summary.orphanedDuckOperationIds.push(operation.operation_id);
      return {
        ...operation,
        lifecycle: "superseded" as const,
        superseded_by_operation_id: args.rippleDeleteOperationId,
        updated_at: nowIso,
      };
    }
    const nextInstruction: HammerAudioDuckInstruction = {
      ...operation.instruction,
      segment_id: linkedBroll.instruction.segment_id,
      start_sec: linkedBroll.instruction.start_sec,
      end_sec: linkedBroll.instruction.end_sec,
      linked_broll_operation_id: linkedBrollOperationId,
    };
    const needsAttention = linkedBroll.capability_state.reason_codes.includes("operation_conflict");
    const baseReasonCodes = needsAttention
      ? mergeReasonCodes(operation.capability_state.reason_codes, ["operation_conflict"])
      : operation.capability_state.reason_codes;
    const timingChanged = (
      operation.instruction.start_sec !== nextInstruction.start_sec
      || operation.instruction.end_sec !== nextInstruction.end_sec
      || operation.instruction.segment_id !== nextInstruction.segment_id
    );
    const degradedChanged = needsAttention && (
      operation.capability_state.capability !== "degraded"
      || !operation.capability_state.reason_codes.includes("operation_conflict")
    );
    if (!timingChanged && !degradedChanged) return operation;
    changed = true;
    summary.adjustedDuckOperationIds.push(operation.operation_id);
    return {
      ...operation,
      instruction: nextInstruction,
      capability_state: needsAttention
        ? {
          ...operation.capability_state,
          capability: "degraded" as const,
          reason_codes: baseReasonCodes,
        }
        : operation.capability_state,
      truth_posture: needsAttention
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

  operations = operations.map((operation) => {
    if (operation.lifecycle !== "active") return operation;
    const instruction = operation.instruction;
    const transitionType = instruction.type;
    const isTransitionType = (
      transitionType === "hard_cut"
      || transitionType === "crossfade"
      || transitionType === "dip_to_black"
      || transitionType === "fade_audio"
    );
    if (!isTransitionType) return operation;

    const hasWindow = (
      (transitionType === "hard_cut" || transitionType === "dip_to_black" || transitionType === "fade_audio")
      || (
        transitionType === "crossfade"
        && typeof instruction.start_sec === "number"
        && typeof instruction.end_sec === "number"
      )
    );
    if (transitionType === "crossfade" && !hasWindow) {
      changed = true;
      summary.degradedTransitionOperationIds.push(operation.operation_id);
      return {
        ...operation,
        capability_state: {
          ...operation.capability_state,
          capability: "degraded" as const,
          reason_codes: mergeReasonCodes(operation.capability_state.reason_codes, ["operation_conflict"]),
        },
        truth_posture: {
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
        },
        updated_at: nowIso,
      };
    }
    if (!hasWindow) return operation;

    let startSec: number;
    let endSec: number;
    if (transitionType === "crossfade") {
      startSec = instruction.start_sec!;
      endSec = instruction.end_sec!;
    } else {
      startSec = instruction.start_sec;
      endSec = instruction.end_sec;
    }

    const remap = remapPlacementForRippleDelete({
      startSec,
      endSec,
      removedStartSec: args.removedStartSec,
      removedEndSec: args.removedEndSec,
    });
    if (remap.kind === "unchanged") return operation;
    changed = true;
    if (remap.kind === "removed") {
      summary.removedTransitionOperationIds.push(operation.operation_id);
      return {
        ...operation,
        lifecycle: "superseded" as const,
        superseded_by_operation_id: args.rippleDeleteOperationId,
        updated_at: nowIso,
      };
    }
    summary.adjustedTransitionOperationIds.push(operation.operation_id);
    if (remap.needsAttention) {
      summary.degradedTransitionOperationIds.push(operation.operation_id);
    }
    const nextInstruction = {
      ...operation.instruction,
      start_sec: remap.startSec,
      end_sec: remap.endSec,
    } as typeof operation.instruction;
    return {
      ...operation,
      instruction: nextInstruction,
      capability_state: remap.needsAttention
        ? {
          ...operation.capability_state,
          capability: "degraded" as const,
          reason_codes: mergeReasonCodes(operation.capability_state.reason_codes, ["operation_conflict"]),
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
  linkedBrollOperationId?: string | null;
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
    linked_broll_operation_id: args.linkedBrollOperationId ?? null,
    created_at: nowIso,
    execution: {
      operation_family: "audio_shaping",
      capability: "executable",
      status: "declared",
      target: "preview",
    },
  };
}

export function createHardCutInstruction(args: {
  segmentId: string;
  startSec: number;
  endSec: number;
  nowIso?: string;
  instructionId?: string;
}): HammerHardCutInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("hard_cut"),
    segment_id: args.segmentId,
    type: "hard_cut",
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

export function createCrossfadeInstruction(args: {
  segmentId: string;
  nextSegmentId: string;
  durationSec: number;
  startSec?: number;
  endSec?: number;
  nowIso?: string;
  instructionId?: string;
}): HammerCrossfadeInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("crossfade"),
    segment_id: args.segmentId,
    type: "crossfade",
    next_segment_id: args.nextSegmentId,
    duration_sec: args.durationSec,
    ...(typeof args.startSec === "number" && typeof args.endSec === "number"
      ? { start_sec: args.startSec, end_sec: args.endSec }
      : {}),
    created_at: nowIso,
    execution: {
      operation_family: "timeline_structural",
      capability: "executable",
      status: "declared",
      target: "preview",
    },
  };
}

export function createDipToBlackInstruction(args: {
  segmentId: string;
  startSec: number;
  endSec: number;
  nowIso?: string;
  instructionId?: string;
}): HammerDipToBlackInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("dip_to_black"),
    segment_id: args.segmentId,
    type: "dip_to_black",
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

export function createFadeAudioInstruction(args: {
  segmentId: string;
  startSec: number;
  endSec: number;
  fadeCurve?: "linear" | "log";
  nowIso?: string;
  instructionId?: string;
}): HammerFadeAudioInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("fade_audio"),
    segment_id: args.segmentId,
    type: "fade_audio",
    start_sec: args.startSec,
    end_sec: args.endSec,
    fade_curve: args.fadeCurve ?? "linear",
    created_at: nowIso,
    execution: {
      operation_family: "audio_shaping",
      capability: "executable",
      status: "declared",
      target: "preview",
    },
  };
}

export function createPodcastMasterPassInstruction(args: {
  segmentId: string;
  nowIso?: string;
  instructionId?: string;
  noiseCleanup?: "off" | "light";
  normalizationLufs?: number;
  compressionAmount?: "light" | "medium";
  limiterCeilingDbtp?: number;
}): HammerPodcastMasterPassInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("podcast_master_pass"),
    segment_id: args.segmentId,
    type: "podcast_master_pass",
    preset: "podcast_master_v1",
    noise_cleanup: args.noiseCleanup ?? "light",
    normalization_lufs: args.normalizationLufs ?? -16,
    compression_amount: args.compressionAmount ?? "medium",
    limiter_ceiling_dbtp: args.limiterCeilingDbtp ?? -1,
    created_at: nowIso,
    execution: {
      operation_family: "audio_shaping",
      capability: "executable",
      status: "declared",
      target: "export",
    },
  };
}

export function createApplyLookInstruction(args: {
  segmentId: string;
  preset: HammerLookPreset;
  nowIso?: string;
  instructionId?: string;
}): HammerApplyLookInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("apply_look"),
    segment_id: args.segmentId,
    type: "apply_look",
    preset: args.preset,
    created_at: nowIso,
    execution: {
      operation_family: "video_enhancement",
      capability: "executable",
      status: "declared",
      target: "export",
    },
  };
}

export function createApplyExposureInstruction(args: {
  segmentId: string;
  exposure: number;
  nowIso?: string;
  instructionId?: string;
}): HammerApplyExposureInstruction {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return {
    instruction_id: args.instructionId ?? createInstructionId("apply_exposure"),
    segment_id: args.segmentId,
    type: "apply_exposure",
    exposure: args.exposure,
    created_at: nowIso,
    execution: {
      operation_family: "video_enhancement",
      capability: "executable",
      status: "declared",
      target: "export",
    },
  };
}
