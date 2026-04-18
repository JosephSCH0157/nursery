import { appendAuthorityInstructionToGraph, createRippleDeleteInstruction, remapResolvedBrollOperationsForRippleDelete } from "./hammerAuthorityOps";
import {
  deriveAudioCutsForRemovedSegments,
  deriveAudioCutsForSubtractiveTextEdits,
  deriveAudioCutsForTimelineCompression,
} from "./hammerCleanupExecution";
import { commitAudioCutSelection } from "./hammerAudioEditOperations";
import { buildNotStartedHammerAudioPolish, cloneHammerAudioEdit } from "../prep/hammerAudioPolish";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import { createEmptyVisualTimelineState } from "../visuals/model/hammerVisualDefaults";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { migrateLegacyPlacementRecordsToTimelineState } from "../visuals/model/hammerVisualMigrations";
import { hammerVisualTimelineReducer } from "../visuals/state/hammerVisualReducer";
import type { HammerHistoryKind, HammerEditorStateSerializable } from "./hammerWorkspaceHistory";
import type { HammerCleanupPreview } from "./hammerCleanupTools";
import {
  cutSegmentRangeAndRipple,
  remapPlacementForRippleDelete,
  resolvePlayheadAfterRangeCut,
  resolvePlayheadSegment,
  resolveSelectedSegmentAfterDelete,
} from "./hammerWorkspaceTimeline";
import { syncEditableTranscriptSegments } from "./hammerWorkspaceTranscript";

export type HammerAuthorityOp =
  | {
    type: "TRANSCRIPT_DELETE_RANGE";
    label: string;
    segmentIds: string[];
    kind?: HammerHistoryKind;
    toolId?: string;
    immediatePersist?: boolean;
  }
  | {
    type: "TRANSCRIPT_APPLY_CLEANUP_PREVIEW";
    label: string;
    preview: HammerCleanupPreview;
    kind?: HammerHistoryKind;
    toolId?: string;
    immediatePersist?: boolean;
  };

export interface HammerCompositionMutationContext {
  playbackDurationSec: number;
  authorityFallback: {
    graphId: string;
    workspaceId: string;
    workpieceId: string;
    sessionId: string;
    sourceTranscriptId: string;
  };
  nowIso?: string;
}

type RippleDeleteRemapSummary = {
  adjustedOperationIds: string[];
  removedOperationIds: string[];
  attentionOperationIds: string[];
  adjustedDuckOperationIds: string[];
  removedDuckOperationIds: string[];
  orphanedDuckOperationIds: string[];
  adjustedTransitionOperationIds: string[];
  removedTransitionOperationIds: string[];
  degradedTransitionOperationIds: string[];
};

function createEmptyRippleDeleteRemapSummary(): RippleDeleteRemapSummary {
  return {
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
}

function resolveCanonicalVisualTimeline(
  state: HammerEditorStateSerializable,
  nowIso: string,
): HammerVisualTimelineState {
  if (state.visualTimeline) {
    return state.visualTimeline;
  }
  if (state.visualPlacements) {
    return migrateLegacyPlacementRecordsToTimelineState({
      placements: state.visualPlacements.placements,
      selected_overlay_row_id: null,
      updated_at: nowIso,
    });
  }
  return createEmptyVisualTimelineState({
    updated_at: nowIso,
    debug_origin: "empty_init",
  });
}

function replaceVisualTimelineState(
  state: HammerEditorStateSerializable,
  updater: (timeline: HammerVisualTimelineState) => HammerVisualTimelineState,
  nowIso: string,
): HammerEditorStateSerializable {
  const baseTimeline = resolveCanonicalVisualTimeline(state, nowIso);
  const nextTimeline = hammerVisualTimelineReducer(baseTimeline, {
    type: "LOAD_TIMELINE",
    timeline: updater(baseTimeline),
  });
  return {
    ...state,
    visualTimeline: nextTimeline,
    visualPlacements: deriveLegacyVisualPlacementsFromTimeline(nextTimeline),
  };
}

function applyCutSelectionsToAudioEdit(args: {
  audioEdit: HammerEditorStateSerializable["audioEdit"];
  cutSelections: Array<{ startSec: number; endSec: number }>;
  operationIdPrefix: string;
  durationSec: number;
}): HammerEditorStateSerializable["audioEdit"] {
  let nextAudioEdit = cloneHammerAudioEdit(args.audioEdit);
  if (args.cutSelections.length === 0) {
    return nextAudioEdit;
  }

  let audioPolish = {
    ...buildNotStartedHammerAudioPolish(),
    audio_edit: cloneHammerAudioEdit(args.audioEdit),
  };
  for (let index = 0; index < args.cutSelections.length; index += 1) {
    const committed = commitAudioCutSelection({
      audioPolish,
      selection: args.cutSelections[index],
      durationSec: args.durationSec,
      operationId: `${args.operationIdPrefix}:${index}`,
    });
    if (committed) {
      audioPolish = committed.audioPolish;
    }
  }
  nextAudioEdit = cloneHammerAudioEdit(audioPolish.audio_edit);
  return nextAudioEdit;
}

function resolveSegmentIdForCutSelection(args: {
  segments: HammerEditorStateSerializable["transcriptSegments"];
  startSec: number;
  endSec: number;
  fallbackSegmentId: string | null;
}): string {
  const overlapping = args.segments.find((segment) => (
    args.startSec < segment.end_sec && args.endSec > segment.start_sec
  )) ?? resolvePlayheadSegment(args.segments, args.startSec)
    ?? resolvePlayheadSegment(args.segments, Math.max(0, args.endSec - 0.0001));
  return overlapping?.segment_id ?? args.fallbackSegmentId ?? args.segments[0]?.segment_id ?? "segment:unknown";
}

function applySingleRippleDeleteToState(args: {
  state: HammerEditorStateSerializable;
  transcriptSegmentsForInstruction: HammerEditorStateSerializable["transcriptSegments"];
  removedStartSec: number;
  removedEndSec: number;
  fallbackSegmentId: string | null;
  authorityFallback: HammerCompositionMutationContext["authorityFallback"];
  nowIso: string;
}): HammerEditorStateSerializable {
  const authorityInstruction = createRippleDeleteInstruction({
    segmentId: resolveSegmentIdForCutSelection({
      segments: args.transcriptSegmentsForInstruction,
      startSec: args.removedStartSec,
      endSec: args.removedEndSec,
      fallbackSegmentId: args.fallbackSegmentId,
    }),
    startSec: args.removedStartSec,
    endSec: args.removedEndSec,
    nowIso: args.nowIso,
  });
  const nextGraph = appendAuthorityInstructionToGraph({
    graph: args.state.editorialAuthorityGraph,
    instruction: authorityInstruction,
    nowIso: args.nowIso,
    fallback: args.authorityFallback,
  });
  const rippleDeleteOperationId = nextGraph.operations.at(-1)?.operation_id ?? null;
  const remapped = rippleDeleteOperationId
    ? remapResolvedBrollOperationsForRippleDelete({
      graph: nextGraph,
      rippleDeleteOperationId,
      removedStartSec: args.removedStartSec,
      removedEndSec: args.removedEndSec,
    })
    : {
      graph: nextGraph,
      summary: createEmptyRippleDeleteRemapSummary(),
    };

  return replaceVisualTimelineState({
    ...args.state,
    editorialAuthorityGraph: remapped.graph,
  }, (timeline) => ({
    ...timeline,
    clips: timeline.clips.flatMap((clip) => {
      const operationId = clip.authority_operation_id;
      if (!operationId) return [clip];
      if (remapped.summary.removedOperationIds.includes(operationId)) {
        return [];
      }
      if (!remapped.summary.adjustedOperationIds.includes(operationId)) {
        return [clip];
      }
      const placementRemap = remapPlacementForRippleDelete({
        startSec: clip.start_sec,
        endSec: clip.end_sec,
        removedStartSec: args.removedStartSec,
        removedEndSec: args.removedEndSec,
      });
      if (placementRemap.kind === "removed") {
        return [];
      }
      return [{
        ...clip,
        start_sec: placementRemap.startSec,
        end_sec: placementRemap.endSec,
        placement_status: placementRemap.needsAttention ? "uncertain" : clip.placement_status,
        uncertainty_flags: placementRemap.needsAttention
          ? Array.from(new Set([...clip.uncertainty_flags, "timeline_remap_review"]))
          : [...clip.uncertainty_flags],
      }];
    }),
    lanes: timeline.lanes.map((lane) => ({
      ...lane,
      clip_ids: lane.clip_ids.filter((clipId) => (
        !remapped.summary.removedOperationIds.includes(
          timeline.clips.find((clip) => clip.clip_id === clipId)?.authority_operation_id ?? "",
        )
      )),
    })),
    selected_clip_id: timeline.selected_clip_id
      && remapped.summary.removedOperationIds.includes(
        timeline.clips.find((clip) => clip.clip_id === timeline.selected_clip_id)?.authority_operation_id ?? "",
      )
      ? null
      : timeline.selected_clip_id,
  }), args.nowIso);
}

function normalizeSequentialRippleDeletes(
  cutSelections: Array<{ startSec: number; endSec: number }>,
): Array<{ startSec: number; endSec: number }> {
  const ordered = [...cutSelections].sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec);
  const normalized: Array<{ startSec: number; endSec: number }> = [];
  let cumulativeShiftSec = 0;
  for (const selection of ordered) {
    const startSec = Math.max(0, selection.startSec - cumulativeShiftSec);
    const endSec = Math.max(startSec, selection.endSec - cumulativeShiftSec);
    if (endSec <= startSec) continue;
    normalized.push({ startSec, endSec });
    cumulativeShiftSec += selection.endSec - selection.startSec;
  }
  return normalized;
}

function applySequentialRippleDeletes(args: {
  state: HammerEditorStateSerializable;
  transcriptSegmentsForInstruction: HammerEditorStateSerializable["transcriptSegments"];
  rippleDeletes: Array<{ startSec: number; endSec: number }>;
  fallbackSegmentId: string | null;
  authorityFallback: HammerCompositionMutationContext["authorityFallback"];
  nowIso: string;
}): HammerEditorStateSerializable {
  return normalizeSequentialRippleDeletes(args.rippleDeletes).reduce(
    (current, selection) => applySingleRippleDeleteToState({
      state: current,
      transcriptSegmentsForInstruction: args.transcriptSegmentsForInstruction,
      removedStartSec: selection.startSec,
      removedEndSec: selection.endSec,
      fallbackSegmentId: args.fallbackSegmentId,
      authorityFallback: args.authorityFallback,
      nowIso: args.nowIso,
    }),
    args.state,
  );
}

export function applyTranscriptDeleteRangeComposition(args: {
  before: HammerEditorStateSerializable;
  op: Extract<HammerAuthorityOp, { type: "TRANSCRIPT_DELETE_RANGE" }>;
  context: HammerCompositionMutationContext;
}): HammerEditorStateSerializable {
  const cut = cutSegmentRangeAndRipple({
    segments: args.before.transcriptSegments,
    segmentIds: args.op.segmentIds,
  });
  if (!cut.changed || cut.removedStartSec == null || cut.removedEndSec == null) {
    return args.before;
  }

  let nextState: HammerEditorStateSerializable = {
    ...args.before,
    transcriptSegments: cut.segments,
    audioEdit: applyCutSelectionsToAudioEdit({
      audioEdit: args.before.audioEdit,
      cutSelections: deriveAudioCutsForRemovedSegments({
        segments: args.before.transcriptSegments,
        removeSegmentIds: args.op.segmentIds,
        durationSec: args.context.playbackDurationSec,
      }),
      operationIdPrefix: "composition:transcript-delete-range",
      durationSec: args.context.playbackDurationSec,
    }),
    selectedSegmentId: resolveSelectedSegmentAfterDelete({
      segmentsAfterDelete: cut.segments,
      removedIndex: cut.removedStartIndex,
    }),
    playheadSec: resolvePlayheadAfterRangeCut({
      playheadSec: args.before.playheadSec,
      removedStartSec: cut.removedStartSec,
      removedEndSec: cut.removedEndSec,
      shiftSec: cut.shiftSec,
    }),
    transcriptTimingHint: null,
  };

  nextState = applySequentialRippleDeletes({
    state: nextState,
    transcriptSegmentsForInstruction: args.before.transcriptSegments,
    rippleDeletes: [{ startSec: cut.removedStartSec, endSec: cut.removedEndSec }],
    fallbackSegmentId: args.op.segmentIds[0] ?? args.before.selectedSegmentId,
    authorityFallback: args.context.authorityFallback,
    nowIso: args.context.nowIso ?? new Date().toISOString(),
  });
  return nextState;
}

export function applyTranscriptCleanupPreviewComposition(args: {
  before: HammerEditorStateSerializable;
  op: Extract<HammerAuthorityOp, { type: "TRANSCRIPT_APPLY_CLEANUP_PREVIEW" }>;
  context: HammerCompositionMutationContext;
}): HammerEditorStateSerializable {
  const synced = syncEditableTranscriptSegments(args.op.preview.resultSegments, args.before.selectedSegmentId);
  const structuralCuts = deriveAudioCutsForTimelineCompression({
    beforeSegments: args.before.transcriptSegments,
    afterSegments: synced.segments,
    durationSec: args.context.playbackDurationSec,
  });
  const textCuts = deriveAudioCutsForSubtractiveTextEdits({
    beforeSegments: args.before.transcriptSegments,
    afterSegments: synced.segments,
    durationSec: args.context.playbackDurationSec,
  });
  const selected = synced.selectedSegmentId
    ? synced.segments.find((segment) => segment.segment_id === synced.selectedSegmentId) ?? null
    : null;

  let nextState: HammerEditorStateSerializable = {
    ...args.before,
    transcriptSegments: synced.segments,
    audioEdit: applyCutSelectionsToAudioEdit({
      audioEdit: args.before.audioEdit,
      cutSelections: [...structuralCuts, ...textCuts],
      operationIdPrefix: `cleanup:${args.op.toolId ?? "polish"}:${args.op.label.toLowerCase().replace(/\s+/g, "-")}`,
      durationSec: args.context.playbackDurationSec,
    }),
    selectedSegmentId: synced.selectedSegmentId,
    playheadSec: selected ? selected.start_sec : args.before.playheadSec,
    transcriptTimingHint: null,
  };

  if (structuralCuts.length === 0) {
    return nextState;
  }

  nextState = applySequentialRippleDeletes({
    state: nextState,
    transcriptSegmentsForInstruction: args.before.transcriptSegments,
    rippleDeletes: structuralCuts,
    fallbackSegmentId: synced.selectedSegmentId ?? args.before.selectedSegmentId,
    authorityFallback: args.context.authorityFallback,
    nowIso: args.context.nowIso ?? new Date().toISOString(),
  });
  return nextState;
}