import { useEffect, useMemo, useState } from "react";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedVisualPlacements } from "../persistence/hammerPersistenceContract";
import { resolveMediaMapSuggestionType, type HammerMediaMapSuggestionType } from "./hammerWorkspaceShellMediaUtils";
import {
  deriveHammerBoundAttentionQueue,
  deriveHammerBoundObjects,
  type HammerBoundAttentionQueueItem,
  type HammerBoundObject,
} from "./hammerBoundObjects";

/**
 * Media-map authority derives beats, suggestions, removal state, transcript/media bindings,
 * and bound-object projections from explicit canonical inputs. It does not own Source Desk
 * loading, automatic placement, visual-preview effects, view-model composition, JSX,
 * canonical autosave, or release orchestration.
 */

export type HammerMediaMapBeat = {
  id: string; segmentId: string; sourceText: string;
  suggestedType: HammerMediaMapSuggestionType; selectedType: HammerMediaMapSuggestionType;
  reason: string; tweak: string; linkedPlacementId: string | null;
};

export type HammerBrollSuggestionItem = {
  operationId: string; segmentId: string; startSec: number; endSec: number; assetRef: string;
  intentRef: string | null; intentDescription: string | null; bindingState: "resolved" | "unresolved";
  duckPreference: "auto" | "none" | "manual";
};

export type HammerResolvedBrollBindingItem = HammerBrollSuggestionItem & {
  bindingState: "resolved"; assetRef: string; linkedPlacementId: string | null;
};

export type HammerBoundBrollInspectorState = {
  operationId: string; lifecycle: "active" | "reverted" | "superseded";
  intentSource: "manual" | "hearth_suggestion"; intentDescription: string | null;
  bindingState: "resolved" | "unresolved"; startSec: number; endSec: number; assetRef: string;
  previewPosture: "authoritative" | "degraded" | "unavailable";
  exportPosture: "authoritative" | "degraded" | "unavailable";
  handoffPosture: "authoritative" | "degraded" | "unavailable";
  needsAttention: boolean; attentionFlags: string[];
  linkedDuck: { operationId: string; startSec: number; endSec: number; aligned: boolean;
    capability: "executable" | "degraded" | "unavailable"; needsAttention: boolean } | null;
};

export type HammerBoundAttentionItem = {
  operationId: string;
  kind: "unresolved_suggestion" | "degraded_binding" | "superseded_binding" | "transition_attention";
  label: string; reasons: string[];
};

export function deriveHammerMediaMapBeats(args: {
  current: HammerMediaMapBeat[]; segments: HammerTranscriptSegment[]; removedSegmentIds: string[];
  placementsBySegmentId: ReadonlyMap<string, { id: string; kind: string }>;
}): HammerMediaMapBeat[] {
  const removedSet = new Set(args.removedSegmentIds);
  return args.segments.slice(0, 12).filter((segment) => !removedSet.has(segment.segment_id)).map((segment) => {
    const suggested = resolveMediaMapSuggestionType(segment.text);
    const existing = args.current.find((item) => item.segmentId === segment.segment_id) ?? null;
    const linkedPlacement = args.placementsBySegmentId.get(segment.segment_id) ?? null;
    const linkedType: HammerMediaMapSuggestionType | null = linkedPlacement ? (linkedPlacement.kind === "reference_clip" ? "reference_clip" : "broll") : null;
    return { id: existing?.id ?? `map:${segment.segment_id}`, segmentId: segment.segment_id,
      sourceText: segment.text, suggestedType: suggested.type, selectedType: linkedType ?? existing?.selectedType ?? suggested.type,
      reason: suggested.reason, tweak: existing?.tweak ?? "", linkedPlacementId: linkedPlacement?.id ?? null };
  });
}

export function deriveHammerBrollSuggestionItems(graph: Pick<HammerEditorialAuthorityGraph, "operations"> | null): HammerBrollSuggestionItem[] {
  return (graph?.operations ?? []).flatMap((operation) => {
    if (operation.lifecycle !== "active" || operation.instruction.type !== "insert_broll") return [];
    return [{ operationId: operation.operation_id, segmentId: operation.instruction.segment_id,
      startSec: operation.instruction.start_sec, endSec: operation.instruction.end_sec,
      assetRef: operation.instruction.asset_ref, intentRef: operation.instruction.intent_ref ?? null,
      intentDescription: operation.instruction.intent_description ?? null,
      bindingState: operation.instruction.asset_binding_state === "unresolved" ? "unresolved" as const : "resolved" as const,
      duckPreference: operation.instruction.duck_preference ?? "auto" }];
  });
}

export function deriveHammerResolvedBrollBindings(items: HammerBrollSuggestionItem[], placements: Pick<HammerPersistedVisualPlacements, "placements"> | null | undefined): HammerResolvedBrollBindingItem[] {
  const placementsByOperationId = new Map((placements?.placements ?? []).filter((placement) => placement.authority_operation_id).map((placement) => [placement.authority_operation_id!, placement]));
  return items.filter((item): item is HammerBrollSuggestionItem & { bindingState: "resolved" } => item.bindingState === "resolved").map((item) => {
    const linked = placementsByOperationId.get(item.operationId) ?? null;
    return { ...item, bindingState: "resolved", assetRef: linked?.asset_ref ?? item.assetRef, linkedPlacementId: linked?.placement_id ?? null };
  });
}

export function useHammerMediaMapState() {
  const [mediaMapBeats, setMediaMapBeats] = useState<HammerMediaMapBeat[]>([]);
  const [removedMediaMapSegmentIds, setRemovedMediaMapSegmentIds] = useState<string[]>([]);
  return { mediaMapBeats, setMediaMapBeats, removedMediaMapSegmentIds, setRemovedMediaMapSegmentIds };
}

export function useHammerMediaMapDerived(args: {
  mediaMapBeats: HammerMediaMapBeat[]; setMediaMapBeats: React.Dispatch<React.SetStateAction<HammerMediaMapBeat[]>>;
  removedSegmentIds: string[]; segments: HammerTranscriptSegment[];
  placementsBySegmentId: ReadonlyMap<string, { id: string; kind: string }>;
  editorialOperations: HammerEditorialAuthorityGraph["operations"] | undefined;
  visualPlacements: HammerPersistedVisualPlacements["placements"] | undefined;
}) {
  const { mediaMapBeats, setMediaMapBeats, removedSegmentIds, segments, placementsBySegmentId, editorialOperations, visualPlacements } = args;
  const referenceClipPlannedBeats = useMemo(() => mediaMapBeats.filter((beat) => beat.selectedType === "reference_clip"), [mediaMapBeats]);
  const brollSuggestionItems = useMemo(() => deriveHammerBrollSuggestionItems(editorialOperations ? { operations: editorialOperations } : null), [editorialOperations]);
  const unresolvedBrollSuggestionItems = useMemo(() => brollSuggestionItems.filter((item) => item.bindingState === "unresolved"), [brollSuggestionItems]);
  const resolvedBrollBindingItems = useMemo(() => deriveHammerResolvedBrollBindings(brollSuggestionItems, visualPlacements ? { placements: visualPlacements } : undefined), [brollSuggestionItems, visualPlacements]);
  useEffect(() => {
    setMediaMapBeats((current) => {
      const next = deriveHammerMediaMapBeats({ current, segments, removedSegmentIds, placementsBySegmentId });
      return JSON.stringify(current) !== JSON.stringify(next) ? next : current;
    });
  }, [placementsBySegmentId, removedSegmentIds, segments, setMediaMapBeats]);
  return { referenceClipPlannedBeats, brollSuggestionItems, unresolvedBrollSuggestionItems, resolvedBrollBindingItems };
}

export function useHammerMediaMapBoundObjects(args: {
  canonicalGraph: Parameters<typeof deriveHammerBoundObjects>[0]["canonical_graph"];
  renderAssembly: Parameters<typeof deriveHammerBoundObjects>[0]["render_assembly"];
  selectedOperationId: string | null;
  resolvedBrollBindingItems: readonly HammerResolvedBrollBindingItem[];
}) {
  const { canonicalGraph, renderAssembly, selectedOperationId, resolvedBrollBindingItems } = args;
  const boundObjects = useMemo(
    () => deriveHammerBoundObjects({ canonical_graph: canonicalGraph, render_assembly: renderAssembly }),
    [canonicalGraph, renderAssembly],
  );
  const boundObjectById = useMemo(() => {
    const byId = new Map<string, HammerBoundObject>();
    for (const object of boundObjects) byId.set(object.object_id, object);
    return byId;
  }, [boundObjects]);
  const selectedBoundBrollInspectorState = useMemo<HammerBoundBrollInspectorState | null>(() => {
    const operationId = selectedOperationId ?? resolvedBrollBindingItems[0]?.operationId ?? null;
    if (!operationId) return null;
    const selectedBoundObject = boundObjectById.get(operationId) ?? null;
    if (!selectedBoundObject || selectedBoundObject.type !== "broll") return null;
    const linkedDuckObject = selectedBoundObject.linked_object_ids
      .map((linkedObjectId) => boundObjectById.get(linkedObjectId) ?? null)
      .find((linkedObject): linkedObject is HammerBoundObject => Boolean(linkedObject && linkedObject.type === "audio_duck")) ?? null;
    const attentionFlags = [
      ...(selectedBoundObject.attention_flags.includes("operation_conflict") ? ["Adjusted by structural remap; review recommended."] : []),
      ...(selectedBoundObject.lifecycle_state === "superseded" ? ["Removed by structural edit."] : []),
      ...(selectedBoundObject.binding_state === "unresolved" ? ["Unresolved suggestion: not yet media truth."] : []),
      ...(linkedDuckObject && linkedDuckObject.capability === "degraded" ? ["Linked duck companion requires review."] : []),
    ];
    const duckAligned = linkedDuckObject?.type === "audio_duck"
      ? linkedDuckObject.placement_window.start_sec === selectedBoundObject.placement_window.start_sec
        && linkedDuckObject.placement_window.end_sec === selectedBoundObject.placement_window.end_sec
      : false;
    return {
      operationId, lifecycle: selectedBoundObject.lifecycle_state,
      intentSource: selectedBoundObject.intent_source === "system" ? "manual" : selectedBoundObject.intent_source,
      intentDescription: selectedBoundObject.payload.intent_description ?? null,
      bindingState: selectedBoundObject.binding_state === "unresolved" ? "unresolved" : "resolved",
      startSec: selectedBoundObject.placement_window.start_sec, endSec: selectedBoundObject.placement_window.end_sec,
      assetRef: selectedBoundObject.payload.asset_ref, previewPosture: selectedBoundObject.posture.preview,
      exportPosture: selectedBoundObject.posture.export, handoffPosture: selectedBoundObject.posture.handoff,
      needsAttention: attentionFlags.length > 0, attentionFlags,
      linkedDuck: linkedDuckObject?.type === "audio_duck" ? {
        operationId: linkedDuckObject.object_id, startSec: linkedDuckObject.placement_window.start_sec,
        endSec: linkedDuckObject.placement_window.end_sec, aligned: duckAligned,
        capability: linkedDuckObject.capability,
        needsAttention: !duckAligned || linkedDuckObject.attention_flags.length > 0,
      } : null,
    };
  }, [boundObjectById, resolvedBrollBindingItems, selectedOperationId]);
  const selectedTransitionBoundObject = useMemo(() => {
    if (!selectedOperationId) return null;
    const selectedBoundObject = boundObjectById.get(selectedOperationId) ?? null;
    return selectedBoundObject?.type === "transition" ? selectedBoundObject : null;
  }, [boundObjectById, selectedOperationId]);
  const boundAttentionQueue = useMemo<HammerBoundAttentionItem[]>(
    () => deriveHammerBoundAttentionQueue(boundObjects).map((item) => ({
      operationId: item.object_id,
      kind: item.object_type === "transition" ? "transition_attention"
        : item.reasons.includes("awaiting_resolution") ? "unresolved_suggestion"
        : item.reasons.includes("superseded_by_structural_edit") ? "superseded_binding" : "degraded_binding",
      label: item.label, reasons: item.reasons,
    })),
    [boundObjects],
  );
  const boundAttentionQueueForGate = useMemo<HammerBoundAttentionQueueItem[]>(
    () => deriveHammerBoundAttentionQueue(boundObjects), [boundObjects],
  );
  return { boundObjects, boundObjectById, selectedBoundBrollInspectorState, selectedTransitionBoundObject, boundAttentionQueue, boundAttentionQueueForGate };
}
