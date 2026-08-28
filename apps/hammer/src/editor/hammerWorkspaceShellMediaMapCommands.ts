import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerVisualPlacementRecord } from "../persistence/hammerPersistenceContract";
import { DEFAULT_VISUAL_PLACEMENT_GEOMETRY } from "./hammerWorkspaceShellVisualUtils";
import {
  migrateLegacyPlacementRecordToAsset,
  migrateLegacyPlacementRecordToClip,
} from "../visuals/model/hammerVisualMigrations";
import {
  appendAuthorityInstructionToGraph,
  createAudioDuckInstruction,
  resolveInsertBrollSuggestionInGraph,
  setAuthorityOperationLifecycle,
  synchronizeLinkedAudioDuckForBrollOperation,
  updateResolvedInsertBrollOperationInGraph,
} from "./hammerAuthorityOps";
import {
  applyWorkspaceVisualTimelineAction,
  applyWorkspaceVisualTimelineActions,
  replaceWorkspaceVisualTimelineState,
  resolveCanonicalWorkspaceVisualTimeline,
} from "./hammerWorkspaceMutationGateway";
import { selectClipById } from "../visuals/state/hammerVisualSelectors";
import type { HammerHistoryEntry } from "./hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs } from "./hammerWorkspaceShellHistoryController";
import { deriveHammerMediaMapBeats, type HammerMediaMapBeat } from "./useHammerWorkspaceShellMediaMap";
import type { HammerMediaMapSuggestionType } from "./hammerWorkspaceShellMediaUtils";
import { roundToTenth } from "./hammerWorkspaceTimeline";
import { removeGovernedBrollPlacement, updateGovernedBrollTiming } from "./hammerGovernedBrollMutation";
import { requireReadyHammerCanonicalAssetAuthority } from "../lib/hammerCanonicalAssetAuthority";
import type { CanonicalAssetId } from "../../../../packages/tongs/src/canonical-asset-authority";

/** Media-map and manual B-roll mutation commands. This authority owns no Source Desk loading,
 * automatic-placement lifecycle, preview effects, persistence, view models, JSX, or shorts. */

type ApplyHistoryMutation = (args: HammerHistoryMutationArgs) => HammerHistoryEntry | null;

export function createHammerMediaMapMutationCommands(args: {
  applyHistoryMutation: ApplyHistoryMutation;
  transcriptDurationSec: number;
  transcriptSegments: HammerTranscriptSegment[];
  placementsBySegmentId: ReadonlyMap<string, { id: string; kind: string }>;
  createPlacementId: () => string;
  identity: { workpieceId: string; workspaceId: string; sessionId: string; transcriptSourceId: string };
  setMediaMapBeats: (beats: HammerMediaMapBeat[]) => void;
  setRemovedMediaMapSegmentIds: (ids: string[]) => void;
  setTimingHint: (hint: string | null) => void;
  resolveCanonicalAssetAuthority?: typeof requireReadyHammerCanonicalAssetAuthority;
}) {
  const resolveCanonicalAssetAuthority = args.resolveCanonicalAssetAuthority ?? requireReadyHammerCanonicalAssetAuthority;
  const commitVisualAnchorRefinement = (input: {
    clipId: string;
    anchorText: string;
    anchorLabel: string;
    detached: boolean;
    label: string;
  }): void => {
    const nextAnchorText = input.anchorText.trim();
    const nextAnchorLabel = input.anchorLabel.trim();
    args.applyHistoryMutation({
      label: input.label,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [input.clipId],
      immediatePersist: true,
      computeAfter: (before) => {
        const timeline = resolveCanonicalWorkspaceVisualTimeline(before);
        const clip = selectClipById(timeline, input.clipId);
        if (!clip) return before;
        return applyWorkspaceVisualTimelineAction(before, {
          type: "RELABEL_CLIP_ANCHOR",
          clip_id: input.clipId,
          anchor_hint: {
            ...clip.anchor_hint,
            anchor_text: nextAnchorText.length > 0 ? nextAnchorText : null,
            anchor_label: nextAnchorLabel.length > 0 ? nextAnchorLabel : null,
            detached: input.detached,
          },
          updated_at: new Date().toISOString(),
        });
      },
    });
  };

  const updatePlacementKindFromMediaMap = (
    placementId: string,
    nextType: HammerMediaMapSuggestionType,
  ): void => {
    args.applyHistoryMutation({
      label: `Change visual type to ${nextType === "reference_clip" ? "Reference Clip" : "B-roll"}`,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => replaceWorkspaceVisualTimelineState(before, (timeline) => ({
        ...timeline,
        assets: timeline.assets.map((asset) => timeline.clips.some((clip) => clip.clip_id === placementId && clip.asset_id === asset.asset_id)
          ? { ...asset, kind: nextType === "reference_clip" ? "reference_clip" : "broll" }
          : asset),
        clips: timeline.clips.map((clip) => (
          clip.clip_id === placementId
            ? {
              ...clip,
              visual_mode: nextType === "reference_clip" ? "reference_clip" : "broll",
              label: clip.label ?? (nextType === "reference_clip" ? "Reference Clip" : "B-roll"),
            }
            : clip
        )),
      })),
    });
  };

  const redoMediaMapFromScript = (): void => {
    args.setRemovedMediaMapSegmentIds([]);
    args.setMediaMapBeats(deriveHammerMediaMapBeats({
      current: [],
      segments: args.transcriptSegments,
      removedSegmentIds: [],
      placementsBySegmentId: args.placementsBySegmentId,
    }));
    args.setTimingHint("Media Map regenerated from current transcript.");
  };

  const resolveHearthBrollSuggestion = async (input: {
    operationId: string;
    canonicalAssetId: string;
    assetPath: string;
    label: string;
  }): Promise<void> => {
    const authority = await resolveCanonicalAssetAuthority({
      workspaceId: args.identity.workspaceId,
      workpieceId: args.identity.workpieceId,
      canonicalAssetId: input.canonicalAssetId as CanonicalAssetId,
      expectedPath: input.assetPath,
      requiredAssetKind: "broll",
    });
    const placementId = args.createPlacementId();
    args.applyHistoryMutation({
      label: "Resolve Hearth B-roll suggestion",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const operation = graph.operations.find((item) => item.operation_id === input.operationId) ?? null;
        if (!operation || operation.instruction.type !== "insert_broll") return before;
        const startSec = Math.max(0, roundToTenth(operation.instruction.start_sec));
        const endSec = Math.max(
          startSec + 0.5,
          Math.min(args.transcriptDurationSec, roundToTenth(operation.instruction.end_sec)),
        );
        const resolvedGraph = resolveInsertBrollSuggestionInGraph({
          graph,
          operationId: input.operationId,
          assetRef: authority.canonicalAssetId,
          startSec,
          endSec,
        });
        if (!resolvedGraph) return before;
        const anchorSegment = before.transcriptSegments.find(
          (segment) => segment.segment_id === operation.instruction.segment_id,
        ) ?? before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;

        let nextGraph = resolvedGraph;
        if ((operation.instruction.duck_preference ?? "auto") === "auto") {
          nextGraph = appendAuthorityInstructionToGraph({
            graph: nextGraph,
            instruction: createAudioDuckInstruction({
              segmentId: anchorSegment.segment_id,
              startSec,
              endSec,
              duckGainDb: -9,
              linkedBrollOperationId: input.operationId,
            }),
            fallback: {
              graphId: `${args.identity.workpieceId}:authority`,
              workspaceId: args.identity.workspaceId,
              workpieceId: args.identity.workpieceId,
              sessionId: args.identity.sessionId,
              sourceTranscriptId: args.identity.transcriptSourceId,
            },
          });
          const duckOperationId = nextGraph.operations.at(-1)?.operation_id ?? null;
          nextGraph = updateResolvedInsertBrollOperationInGraph({
            graph: nextGraph,
            operationId: input.operationId,
            changes: { companion_audio_duck_operation_id: duckOperationId },
          }) ?? nextGraph;
        }

        const brollPlacement: HammerVisualPlacementRecord = {
          placement_id: placementId,
          authority_operation_id: input.operationId,
          entry_id: `manual:${placementId}`,
          anchor_segment_id: anchorSegment.segment_id,
          matched_segment_ids: [anchorSegment.segment_id],
          anchor_text: anchorSegment.text,
          asset_ref: authority.canonicalAssetId,
          asset_id: authority.canonicalAssetId,
          canonical_asset_id: authority.canonicalAssetId,
          canonical_asset_state: "canonical_proven",
          canonical_asset_workspace_id: authority.workspaceId ?? args.identity.workspaceId,
          canonical_asset_workpiece_id: authority.scope?.kind === "workpiece" ? authority.scope.workpieceId : null,
          canonical_asset_content_hash: authority.contentHash ?? null,
          asset_path: authority.path ?? input.assetPath,
          storage_key: authority.storageObjectKey ?? null,
          label: input.label,
          visual_mode: "broll",
          start_sec: startSec,
          end_sec: endSec,
          confidence: null,
          timing_source: "ordered_fallback",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
          overlay_geometry: { ...DEFAULT_VISUAL_PLACEMENT_GEOMETRY, x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
          animation_preset: "none",
          overlay_opacity: 1,
          overlay_z_index: resolveCanonicalWorkspaceVisualTimeline(before).clips.length + 1,
        };
        const updatedAt = new Date().toISOString();
        const assetId = brollPlacement.canonical_asset_id;
        if (!assetId) return before;
        const nextClip = migrateLegacyPlacementRecordToClip({ record: brollPlacement, asset_id: assetId, updated_at: updatedAt });
        const asset = migrateLegacyPlacementRecordToAsset({ record: brollPlacement, asset_id: assetId, updated_at: updatedAt });
        return applyWorkspaceVisualTimelineActions({ ...before, editorialAuthorityGraph: nextGraph }, [
          { type: "UPSERT_ASSETS", assets: [asset], updated_at: updatedAt },
          { type: "CREATE_CLIP", clip: nextClip, updated_at: updatedAt },
        ]);
      },
    });
  };

  const discardHearthBrollSuggestion = (operationId: string): void => {
    args.applyHistoryMutation({
      label: "Discard Hearth B-roll suggestion",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const next = setAuthorityOperationLifecycle({ graph, operationId, lifecycle: "reverted" });
        return next ? { ...before, editorialAuthorityGraph: next } : before;
      },
    });
  };

  const moveResolvedBrollBinding = (operationId: string, deltaSec: number): void => {
    args.applyHistoryMutation({
      label: "Move resolved b-roll binding",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const operation = graph.operations.find((item) => item.operation_id === operationId) ?? null;
        if (!operation || operation.instruction.type !== "insert_broll"
          || operation.instruction.asset_binding_state === "unresolved") return before;
        const duration = Math.max(
          0.5,
          roundToTenth(operation.instruction.end_sec - operation.instruction.start_sec),
        );
        const candidateStart = Math.max(0, roundToTenth(operation.instruction.start_sec + deltaSec));
        const maxStart = Math.max(0, roundToTenth(args.transcriptDurationSec - duration));
        const nextStart = Math.min(candidateStart, maxStart);
        const nextEnd = Math.min(args.transcriptDurationSec, roundToTenth(nextStart + duration));
        const clip = resolveCanonicalWorkspaceVisualTimeline(before).clips.find((item) => item.authority_operation_id === operationId) ?? null;
        return clip ? updateGovernedBrollTiming({ before, clipId: clip.clip_id, operationId, startSec: nextStart, endSec: nextEnd, nowIso: new Date().toISOString() }) : before;
      },
    });
  };

  const trimResolvedBrollBinding = (
    operationId: string,
    edge: "start" | "end",
    deltaSec: number,
  ): void => {
    args.applyHistoryMutation({
      label: edge === "start" ? "Trim b-roll in point" : "Trim b-roll out point",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const operation = graph.operations.find((item) => item.operation_id === operationId) ?? null;
        if (!operation || operation.instruction.type !== "insert_broll"
          || operation.instruction.asset_binding_state === "unresolved") return before;
        let nextStart = operation.instruction.start_sec;
        let nextEnd = operation.instruction.end_sec;
        if (edge === "start") {
          nextStart = Math.max(0, roundToTenth(nextStart + deltaSec));
          nextStart = Math.min(nextStart, roundToTenth(nextEnd - 0.5));
        } else {
          nextEnd = Math.min(args.transcriptDurationSec, roundToTenth(nextEnd + deltaSec));
          nextEnd = Math.max(nextEnd, roundToTenth(nextStart + 0.5));
        }
        if (nextEnd <= nextStart) return before;
        const clip = resolveCanonicalWorkspaceVisualTimeline(before).clips.find((item) => item.authority_operation_id === operationId) ?? null;
        return clip ? updateGovernedBrollTiming({ before, clipId: clip.clip_id, operationId, startSec: nextStart, endSec: nextEnd, nowIso: new Date().toISOString() }) : before;
      },
    });
  };

  const replaceResolvedBrollBinding = async (input: {
    operationId: string;
    canonicalAssetId: string;
    assetPath: string;
    label: string;
  }): Promise<void> => {
    const authority = await resolveCanonicalAssetAuthority({
      workspaceId: args.identity.workspaceId,
      workpieceId: args.identity.workpieceId,
      canonicalAssetId: input.canonicalAssetId as CanonicalAssetId,
      expectedPath: input.assetPath,
      requiredAssetKind: "broll",
    });
    args.applyHistoryMutation({
      label: "Replace resolved b-roll asset",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const operation = graph.operations.find((item) => item.operation_id === input.operationId) ?? null;
        if (!operation || operation.instruction.type !== "insert_broll"
          || operation.instruction.asset_binding_state === "unresolved") return before;
        const nextGraph = updateResolvedInsertBrollOperationInGraph({
          graph,
          operationId: input.operationId,
          changes: { asset_ref: authority.canonicalAssetId },
        });
        if (!nextGraph) return before;
        const synchronizedGraph = synchronizeLinkedAudioDuckForBrollOperation({
          graph: nextGraph,
          brollOperationId: input.operationId,
        }) ?? nextGraph;
        return replaceWorkspaceVisualTimelineState({ ...before, editorialAuthorityGraph: synchronizedGraph }, (timeline) => {
          const clip = timeline.clips.find((candidate) => candidate.authority_operation_id === input.operationId) ?? null;
          if (!clip) return timeline;
          const nextRecord: HammerVisualPlacementRecord = {
            placement_id: clip.clip_id,
            authority_operation_id: clip.authority_operation_id,
            entry_id: clip.entry_id ?? `manual:${clip.clip_id}`,
            anchor_segment_id: clip.anchor_hint.anchor_segment_id ?? "",
            matched_segment_ids: [...clip.anchor_hint.matched_segment_ids],
            anchor_text: clip.anchor_hint.anchor_text ?? null,
            asset_ref: authority.canonicalAssetId,
            asset_id: authority.canonicalAssetId,
            canonical_asset_id: authority.canonicalAssetId,
            canonical_asset_state: "canonical_proven",
            canonical_asset_workspace_id: authority.workspaceId ?? args.identity.workspaceId,
            canonical_asset_workpiece_id: authority.scope?.kind === "workpiece" ? authority.scope.workpieceId : null,
            canonical_asset_content_hash: authority.contentHash ?? null,
            asset_path: authority.path ?? input.assetPath,
            storage_key: authority.storageObjectKey ?? null,
            label: input.label || clip.label,
            visual_mode: clip.visual_mode,
            start_sec: clip.start_sec,
            end_sec: clip.end_sec,
            confidence: clip.confidence,
            timing_source: "ordered_fallback",
            status: clip.placement_status,
            ingest_state: clip.ingest_state ?? undefined,
            uncertainty_flags: [...clip.uncertainty_flags],
            overlay_geometry: { ...clip.geometry },
            animation_preset: clip.animation.preset,
            overlay_opacity: clip.opacity,
            overlay_z_index: clip.z_index,
          };
          const assetId = authority.canonicalAssetId;
          const asset = migrateLegacyPlacementRecordToAsset({
            record: nextRecord,
            asset_id: assetId,
            updated_at: new Date().toISOString(),
          });
          return {
            ...timeline,
            assets: timeline.assets.some((item) => item.asset_id === assetId)
              ? timeline.assets.map((item) => item.asset_id === assetId ? asset : item)
              : [...timeline.assets, asset],
            clips: timeline.clips.map((candidate) => candidate.authority_operation_id === input.operationId
              ? { ...candidate, asset_id: assetId, canonical_asset_id: assetId, canonical_asset_state: "canonical_proven", updated_at: asset.updated_at }
              : candidate),
          };
        });
      },
    });
  };

  const revertResolvedBrollBinding = (operationId: string): void => {
    args.applyHistoryMutation({
      label: "Revert resolved b-roll binding",
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        const graph = before.editorialAuthorityGraph;
        if (!graph) return before;
        const brollOperation = graph.operations.find((item) => item.operation_id === operationId) ?? null;
        if (!brollOperation || brollOperation.instruction.type !== "insert_broll") return before;
        const clip = resolveCanonicalWorkspaceVisualTimeline(before).clips.find((item) => item.authority_operation_id === operationId) ?? null;
        return clip ? removeGovernedBrollPlacement({ before, clipId: clip.clip_id, operationId, nowIso: new Date().toISOString() }) : before;
      },
    });
  };

  return {
    commitVisualAnchorRefinement,
    updatePlacementKindFromMediaMap,
    redoMediaMapFromScript,
    resolveHearthBrollSuggestion,
    discardHearthBrollSuggestion,
    moveResolvedBrollBinding,
    trimResolvedBrollBinding,
    replaceResolvedBrollBinding,
    revertResolvedBrollBinding,
  };
}
