import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerRenderAssemblyResult } from "./hammerRenderAssembly";

export type HammerBoundObjectType = "broll" | "audio_duck" | "transition";
export type HammerBoundObjectLifecycle = "active" | "reverted" | "superseded";
export type HammerBoundObjectBindingState = "resolved" | "unresolved" | "not_applicable";
export type HammerBoundObjectPosture = "authoritative" | "degraded" | "unavailable";

export interface HammerBoundObjectCore {
  object_id: string;
  authority_operation_id: string;
  type: HammerBoundObjectType;
  lifecycle_state: HammerBoundObjectLifecycle;
  intent_source: "manual" | "hearth_suggestion" | "system";
  placement_window: {
    start_sec: number;
    end_sec: number;
  };
  binding_state: HammerBoundObjectBindingState;
  posture: {
    preview: HammerBoundObjectPosture;
    export: HammerBoundObjectPosture;
    handoff: HammerBoundObjectPosture;
  };
  capability: "executable" | "degraded" | "unavailable";
  attention_flags: string[];
  linked_object_ids: string[];
}

export interface HammerBoundBrollPayload {
  segment_id: string;
  asset_ref: string;
  intent_ref: string | null;
  intent_description: string | null;
  duck_preference: "auto" | "none" | "manual";
}

export interface HammerBoundDuckPayload {
  segment_id: string;
  duck_gain_db: number;
  linked_broll_operation_id: string | null;
}

export interface HammerBoundTransitionPayload {
  segment_id: string;
  transition_kind: "hard_cut" | "crossfade" | "dip_to_black" | "fade_audio";
  next_segment_id: string | null;
  duration_sec: number | null;
  fade_curve: "linear" | "log" | null;
}

export type HammerBoundObject =
  | (HammerBoundObjectCore & { type: "broll"; payload: HammerBoundBrollPayload })
  | (HammerBoundObjectCore & { type: "audio_duck"; payload: HammerBoundDuckPayload })
  | (HammerBoundObjectCore & { type: "transition"; payload: HammerBoundTransitionPayload });

export interface HammerBoundObjectBuildContext {
  canonical_graph: HammerEditorialAuthorityGraph | null;
  render_assembly: HammerRenderAssemblyResult | null;
}

export interface HammerBoundObjectAdapter {
  type: HammerBoundObjectType;
  can_adapt: (instruction: HammerEditInstruction) => boolean;
  adapt: (args: {
    operation: HammerEditorialAuthorityGraph["operations"][number];
    render_operation: HammerRenderAssemblyResult["operations"][number] | null;
    graph: HammerEditorialAuthorityGraph;
  }) => HammerBoundObject | null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function resolveAttentionFlags(args: {
  operation: HammerEditorialAuthorityGraph["operations"][number];
  renderOperation: HammerRenderAssemblyResult["operations"][number] | null;
  bindingState: HammerBoundObjectBindingState;
}): string[] {
  const flags: string[] = [];
  if (args.operation.lifecycle === "superseded") flags.push("superseded_by_structural_edit");
  if (args.operation.lifecycle === "reverted") flags.push("reverted");
  if (args.bindingState === "unresolved") flags.push("awaiting_resolution");
  if (args.operation.capability_state.reason_codes.includes("operation_conflict")) flags.push("operation_conflict");
  if (args.renderOperation && args.renderOperation.capability !== "executable") flags.push("degraded_posture");
  return unique(flags);
}

function buildBrollAdapter(): HammerBoundObjectAdapter {
  return {
    type: "broll",
    can_adapt: (instruction) => instruction.type === "insert_broll",
    adapt: ({ operation, render_operation, graph }) => {
      if (operation.instruction.type !== "insert_broll") return null;
      const brollInstruction = operation.instruction;
      const linkedDuckOperationIds = graph.operations
        .flatMap((candidate) => {
          if (candidate.instruction.type !== "audio_duck") return [];
          if (candidate.instruction.linked_broll_operation_id === operation.operation_id) {
            return [candidate.operation_id];
          }
          if (
            brollInstruction.companion_audio_duck_operation_id
            && candidate.operation_id === brollInstruction.companion_audio_duck_operation_id
          ) {
            return [candidate.operation_id];
          }
          return [];
        });
      const bindingState = brollInstruction.asset_binding_state === "unresolved" ? "unresolved" : "resolved";
      return {
        object_id: operation.operation_id,
        authority_operation_id: operation.operation_id,
        type: "broll",
        lifecycle_state: operation.lifecycle,
        intent_source: brollInstruction.intent_source ?? "manual",
        placement_window: {
          start_sec: brollInstruction.start_sec,
          end_sec: brollInstruction.end_sec,
        },
        binding_state: bindingState,
        posture: {
          preview: render_operation?.preview_posture ?? "unavailable",
          export: render_operation?.export_posture ?? "unavailable",
          handoff: render_operation?.handoff_posture ?? "unavailable",
        },
        capability: render_operation?.capability ?? operation.capability_state.capability,
        attention_flags: resolveAttentionFlags({
          operation,
          renderOperation: render_operation,
          bindingState,
        }),
        linked_object_ids: unique(linkedDuckOperationIds),
        payload: {
          segment_id: brollInstruction.segment_id,
          asset_ref: brollInstruction.asset_ref,
          intent_ref: brollInstruction.intent_ref ?? null,
          intent_description: brollInstruction.intent_description ?? null,
          duck_preference: brollInstruction.duck_preference ?? "auto",
        },
      };
    },
  };
}

function buildDuckAdapter(): HammerBoundObjectAdapter {
  return {
    type: "audio_duck",
    can_adapt: (instruction) => instruction.type === "audio_duck",
    adapt: ({ operation, render_operation }) => {
      if (operation.instruction.type !== "audio_duck") return null;
      const bindingState: HammerBoundObjectBindingState = "not_applicable";
      return {
        object_id: operation.operation_id,
        authority_operation_id: operation.operation_id,
        type: "audio_duck",
        lifecycle_state: operation.lifecycle,
        intent_source: "system",
        placement_window: {
          start_sec: operation.instruction.start_sec,
          end_sec: operation.instruction.end_sec,
        },
        binding_state: bindingState,
        posture: {
          preview: render_operation?.preview_posture ?? "unavailable",
          export: render_operation?.export_posture ?? "unavailable",
          handoff: render_operation?.handoff_posture ?? "unavailable",
        },
        capability: render_operation?.capability ?? operation.capability_state.capability,
        attention_flags: resolveAttentionFlags({
          operation,
          renderOperation: render_operation,
          bindingState,
        }),
        linked_object_ids: operation.instruction.linked_broll_operation_id
          ? [operation.instruction.linked_broll_operation_id]
          : [],
        payload: {
          segment_id: operation.instruction.segment_id,
          duck_gain_db: operation.instruction.duck_gain_db,
          linked_broll_operation_id: operation.instruction.linked_broll_operation_id ?? null,
        },
      };
    },
  };
}

function buildTransitionAdapter(): HammerBoundObjectAdapter {
  return {
    type: "transition",
    can_adapt: (instruction) => (
      instruction.type === "hard_cut"
      || instruction.type === "crossfade"
      || instruction.type === "dip_to_black"
      || instruction.type === "fade_audio"
    ),
    adapt: ({ operation, render_operation }) => {
      if (
        operation.instruction.type !== "hard_cut"
        && operation.instruction.type !== "crossfade"
        && operation.instruction.type !== "dip_to_black"
        && operation.instruction.type !== "fade_audio"
      ) {
        return null;
      }
      const startSec = typeof operation.instruction.start_sec === "number"
        ? operation.instruction.start_sec
        : 0;
      const fallbackEnd = operation.instruction.type === "crossfade"
        ? startSec + operation.instruction.duration_sec
        : startSec;
      const endSec = typeof operation.instruction.end_sec === "number"
        ? operation.instruction.end_sec
        : fallbackEnd;
      return {
        object_id: operation.operation_id,
        authority_operation_id: operation.operation_id,
        type: "transition",
        lifecycle_state: operation.lifecycle,
        intent_source: "system",
        placement_window: {
          start_sec: startSec,
          end_sec: endSec,
        },
        binding_state: "not_applicable",
        posture: {
          preview: render_operation?.preview_posture ?? "unavailable",
          export: render_operation?.export_posture ?? "unavailable",
          handoff: render_operation?.handoff_posture ?? "unavailable",
        },
        capability: render_operation?.capability ?? operation.capability_state.capability,
        attention_flags: resolveAttentionFlags({
          operation,
          renderOperation: render_operation,
          bindingState: "not_applicable",
        }),
        linked_object_ids: [],
        payload: {
          segment_id: operation.instruction.segment_id,
          transition_kind: operation.instruction.type,
          next_segment_id: operation.instruction.type === "crossfade"
            ? operation.instruction.next_segment_id
            : null,
          duration_sec: operation.instruction.type === "crossfade"
            ? operation.instruction.duration_sec
            : endSec - startSec,
          fade_curve: operation.instruction.type === "fade_audio"
            ? operation.instruction.fade_curve ?? "linear"
            : null,
        },
      };
    },
  };
}

export function createHammerBoundObjectRegistry(): HammerBoundObjectAdapter[] {
  return [buildBrollAdapter(), buildDuckAdapter(), buildTransitionAdapter()];
}

export function deriveHammerBoundObjects(args: HammerBoundObjectBuildContext): HammerBoundObject[] {
  if (!args.canonical_graph) return [];
  const renderByOperationId = new Map<string, HammerRenderAssemblyResult["operations"][number]>();
  for (const operation of args.render_assembly?.operations ?? []) {
    renderByOperationId.set(operation.operation_id, operation);
  }
  const registry = createHammerBoundObjectRegistry();
  return [...args.canonical_graph.operations]
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap((operation) => {
      const adapter = registry.find((candidate) => candidate.can_adapt(operation.instruction));
      if (!adapter) return [];
      const boundObject = adapter.adapt({
        operation,
        render_operation: renderByOperationId.get(operation.operation_id) ?? null,
        graph: args.canonical_graph!,
      });
      return boundObject ? [boundObject] : [];
    });
}

export interface HammerBoundAttentionQueueItem {
  object_id: string;
  object_type: HammerBoundObjectType;
  priority: "high" | "medium";
  reasons: string[];
  label: string;
}

export function deriveHammerBoundAttentionQueue(boundObjects: HammerBoundObject[]): HammerBoundAttentionQueueItem[] {
  return boundObjects
    .filter((object) => object.type === "broll" || object.type === "transition")
    .flatMap((object) => {
      const reasons = [...object.attention_flags];
      if (
        object.posture.preview !== "authoritative"
        || object.posture.export !== "authoritative"
        || object.posture.handoff !== "authoritative"
      ) {
        reasons.push("posture_not_authoritative");
      }
      if (reasons.length === 0) return [];
      return [{
        object_id: object.object_id,
        object_type: object.type,
        priority: reasons.includes("operation_conflict") ? "high" : "medium" as const,
        reasons: unique(reasons),
        label: object.type === "broll"
          ? object.payload.intent_description ?? object.payload.intent_ref ?? object.payload.asset_ref
          : object.payload.transition_kind,
      }];
    });
}
