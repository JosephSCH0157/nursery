import type { HammerEditorStateSerializable } from "./hammerWorkspaceHistory";
import type { HammerVisualPlacementRecord } from "../persistence/hammerPersistenceContract";
import {
  appendAuthorityInstructionToGraph,
  createAudioDuckInstruction,
  createInsertBrollInstruction,
  setAuthorityOperationLifecycle,
  synchronizeLinkedAudioDuckForBrollOperation,
  updateResolvedInsertBrollOperationInGraph,
} from "./hammerAuthorityOps";
import {
  applyWorkspaceVisualTimelineActions,
  replaceWorkspaceVisualTimelineState,
  resolveCanonicalWorkspaceVisualTimeline,
} from "./hammerWorkspaceMutationGateway";
import { deriveStableHammerVisualAssetId, migrateLegacyPlacementRecordToAsset, migrateLegacyPlacementRecordToClip } from "../visuals/model/hammerVisualMigrations";
import { DEFAULT_VISUAL_PLACEMENT_GEOMETRY } from "./hammerWorkspaceShellVisualUtils";

export type HammerGovernedBrollIdentity = {
  graphId: string;
  workspaceId: string;
  workpieceId: string;
  sessionId: string;
  sourceTranscriptId: string;
};

export function resolveGovernedBrollOperationId(before: HammerEditorStateSerializable, clipId: string): string | null {
  const clip = resolveCanonicalWorkspaceVisualTimeline(before).clips.find((item) => item.clip_id === clipId) ?? null;
  const operation = clip?.authority_operation_id
    ? before.editorialAuthorityGraph?.operations.find((item) => item.operation_id === clip.authority_operation_id) ?? null : null;
  return operation?.lifecycle === "active" && operation.instruction.type === "insert_broll"
    && operation.instruction.asset_binding_state !== "unresolved" ? operation.operation_id : null;
}

export function createGovernedBrollPlacement(args: {
  before: HammerEditorStateSerializable;
  placementId: string;
  assetPath: string;
  label: string;
  kind: "broll" | "reference_clip";
  segmentId: string;
  segmentText: string;
  startSec: number;
  endSec: number;
  identity: HammerGovernedBrollIdentity;
  nowIso: string;
}): HammerEditorStateSerializable {
  let graph = appendAuthorityInstructionToGraph({
    graph: args.before.editorialAuthorityGraph,
    instruction: createInsertBrollInstruction({
      segmentId: args.segmentId,
      assetRef: args.assetPath,
      startSec: args.startSec,
      endSec: args.endSec,
      intentSource: "manual",
      assetBindingState: "resolved",
      duckPreference: "auto",
      nowIso: args.nowIso,
    }),
    fallback: args.identity,
    nowIso: args.nowIso,
  });
  const brollOperationId = graph.operation_order.at(-1) ?? graph.operations.at(-1)?.operation_id ?? null;
  if (!brollOperationId) return args.before;
  graph = appendAuthorityInstructionToGraph({
    graph,
    instruction: createAudioDuckInstruction({
      segmentId: args.segmentId,
      startSec: args.startSec,
      endSec: args.endSec,
      duckGainDb: -9,
      linkedBrollOperationId: brollOperationId,
      nowIso: args.nowIso,
    }),
    fallback: args.identity,
    nowIso: args.nowIso,
  });
  const duckOperationId = graph.operation_order.at(-1) ?? graph.operations.at(-1)?.operation_id ?? null;
  graph = updateResolvedInsertBrollOperationInGraph({
    graph,
    operationId: brollOperationId,
    changes: { companion_audio_duck_operation_id: duckOperationId },
    nowIso: args.nowIso,
  }) ?? graph;

  const timeline = resolveCanonicalWorkspaceVisualTimeline(args.before);
  const placement: HammerVisualPlacementRecord = {
    placement_id: args.placementId,
    authority_operation_id: brollOperationId,
    entry_id: `manual:${args.placementId}`,
    anchor_segment_id: args.segmentId,
    matched_segment_ids: [args.segmentId],
    anchor_text: args.segmentText,
    asset_ref: args.assetPath,
    asset_id: null,
    asset_path: args.assetPath,
    storage_key: args.assetPath,
    label: args.label,
    visual_mode: args.kind,
    start_sec: args.startSec,
    end_sec: args.endSec,
    confidence: null,
    timing_source: "ordered_fallback",
    status: "placed",
    ingest_state: "approved",
    uncertainty_flags: [],
    overlay_geometry: { ...DEFAULT_VISUAL_PLACEMENT_GEOMETRY, x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
    animation_preset: "none",
    overlay_opacity: 1,
    overlay_z_index: timeline.clips.length + 1,
  };
  const assetId = deriveStableHammerVisualAssetId(placement);
  return applyWorkspaceVisualTimelineActions({ ...args.before, editorialAuthorityGraph: graph, selectedSegmentId: args.segmentId }, [
    { type: "UPSERT_ASSETS", assets: [migrateLegacyPlacementRecordToAsset({ record: placement, asset_id: assetId, updated_at: args.nowIso })], updated_at: args.nowIso },
    { type: "CREATE_CLIP", clip: migrateLegacyPlacementRecordToClip({ record: placement, asset_id: assetId, updated_at: args.nowIso }), updated_at: args.nowIso },
  ]);
}

export function removeGovernedBrollPlacement(args: {
  before: HammerEditorStateSerializable;
  clipId: string;
  operationId: string;
  nowIso: string;
}): HammerEditorStateSerializable {
  const graph = args.before.editorialAuthorityGraph;
  const operation = graph?.operations.find((item) => item.operation_id === args.operationId) ?? null;
  if (!graph || !operation || operation.lifecycle !== "active" || operation.instruction.type !== "insert_broll"
    || operation.instruction.asset_binding_state === "unresolved") return args.before;
  let nextGraph = setAuthorityOperationLifecycle({ graph, operationId: args.operationId, lifecycle: "reverted", nowIso: args.nowIso }) ?? graph;
  const duckId = operation.instruction.companion_audio_duck_operation_id ?? null;
  if (duckId) nextGraph = setAuthorityOperationLifecycle({ graph: nextGraph, operationId: duckId, lifecycle: "reverted", nowIso: args.nowIso }) ?? nextGraph;
  return replaceWorkspaceVisualTimelineState({ ...args.before, editorialAuthorityGraph: nextGraph }, (timeline) => {
    const removedIds = new Set(timeline.clips.filter((clip) => clip.clip_id === args.clipId || clip.authority_operation_id === args.operationId).map((clip) => clip.clip_id));
    return { ...timeline,
      clips: timeline.clips.filter((clip) => !removedIds.has(clip.clip_id)),
      lanes: timeline.lanes.map((lane) => ({ ...lane, clip_ids: lane.clip_ids.filter((id) => !removedIds.has(id)) })),
      selected_clip_id: timeline.selected_clip_id && removedIds.has(timeline.selected_clip_id) ? null : timeline.selected_clip_id };
  });
}

export function updateGovernedBrollTiming(args: {
  before: HammerEditorStateSerializable;
  clipId: string;
  operationId: string;
  startSec: number;
  endSec: number;
  nowIso: string;
}): HammerEditorStateSerializable {
  const graph = args.before.editorialAuthorityGraph;
  const clip = resolveCanonicalWorkspaceVisualTimeline(args.before).clips.find((item) => item.clip_id === args.clipId) ?? null;
  const operation = graph?.operations.find((item) => item.operation_id === args.operationId) ?? null;
  if (!graph || !clip || clip.authority_operation_id !== args.operationId || !operation || operation.lifecycle !== "active"
    || operation.instruction.type !== "insert_broll" || operation.instruction.asset_binding_state === "unresolved") return args.before;
  const updated = updateResolvedInsertBrollOperationInGraph({
    graph,
    operationId: args.operationId,
    changes: { start_sec: args.startSec, end_sec: args.endSec },
    nowIso: args.nowIso,
  });
  if (!updated) return args.before;
  const synchronized = synchronizeLinkedAudioDuckForBrollOperation({ graph: updated, brollOperationId: args.operationId, nowIso: args.nowIso }) ?? updated;
  return replaceWorkspaceVisualTimelineState({ ...args.before, editorialAuthorityGraph: synchronized }, (timeline) => ({
    ...timeline,
    clips: timeline.clips.map((item) => item.clip_id === args.clipId
      ? { ...item, start_sec: args.startSec, end_sec: args.endSec, updated_at: args.nowIso }
      : item),
  }));
}
