import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import { migrateLegacyPlacementRecordsToTimelineState } from "../visuals/model/hammerVisualMigrations";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { cloneHammerDerivedTextLayers } from "../macros/hammerDerivedTranscriptLayers";
import {
  applyTranscriptCleanupPreviewComposition,
  applyTranscriptDeleteRangeComposition,
  applyTranscriptSplitComposition,
  applyTranscriptToggleMuteSegmentsComposition,
  applyTranscriptTrimSegmentComposition,
  type HammerAuthorityOp,
  type HammerCompositionMutationContext,
} from "./hammerCompositionMutations";
import { appendAuthorityInstructionToGraph } from "./hammerAuthorityOps";
import { cloneEditorState, type HammerEditorStateSerializable, type HammerHistoryEntry } from "./hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs, HammerHistoryPostSaveSnapshotRequest } from "./hammerWorkspaceShellHistoryController";

/** History-owned construction for canonical composition commands. It owns command payloads and
 * metadata, not transcript editing UI, persistence, snapshot production, or domain state. */

export type HammerAuthorityFallback = {
  graphId: string; workspaceId: string; workpieceId: string; sessionId: string; sourceTranscriptId: string;
};

export function appendHammerAuthorityInstructionForHistory(args: {
  state: HammerEditorStateSerializable; instruction: HammerEditInstruction; fallback: HammerAuthorityFallback;
}): HammerEditorialAuthorityGraph {
  return appendAuthorityInstructionToGraph({ graph: args.state.editorialAuthorityGraph, instruction: args.instruction, fallback: args.fallback });
}

export function executeHammerCompositionHistoryMutation(args: {
  op: HammerAuthorityOp;
  applyMutation: (mutation: HammerHistoryMutationArgs) => HammerHistoryEntry | null;
  playbackDurationSec: number;
  waveformProxy: HammerCompositionMutationContext["waveformProxy"];
  authorityFallback: HammerAuthorityFallback;
}): HammerHistoryEntry | null {
  const context = { playbackDurationSec: args.playbackDurationSec, waveformProxy: args.waveformProxy, authorityFallback: args.authorityFallback };
  const op = args.op;
  switch (op.type) {
    case "TRANSCRIPT_DELETE_RANGE":
      return args.applyMutation({ label: op.label, kind: op.kind ?? "segment_structure", toolId: op.toolId,
        affectedSegments: op.segmentIds, immediatePersist: op.immediatePersist === true,
        computeAfter: (before) => applyTranscriptDeleteRangeComposition({ before, op, context }) });
    case "TRANSCRIPT_APPLY_CLEANUP_PREVIEW":
      return args.applyMutation({ label: op.label, kind: op.kind ?? "cleanup_tool", toolId: op.toolId,
        affectedSegments: op.preview.suggestions.map((suggestion) => suggestion.segmentId), immediatePersist: op.immediatePersist === true,
        computeAfter: (before) => applyTranscriptCleanupPreviewComposition({ before, op, context }) });
    case "TRANSCRIPT_TOGGLE_MUTE_SEGMENTS":
      return args.applyMutation({ label: op.label, kind: op.kind ?? "segment_structure", toolId: op.toolId,
        affectedSegments: op.segmentIds, immediatePersist: op.immediatePersist === true,
        computeAfter: (before) => applyTranscriptToggleMuteSegmentsComposition({ before, op, context }) });
    case "TRANSCRIPT_SPLIT":
      return args.applyMutation({ label: op.label, kind: op.kind ?? "segment_structure", toolId: op.toolId,
        affectedSegments: [op.segmentId], immediatePersist: op.immediatePersist === true,
        computeAfter: (before) => applyTranscriptSplitComposition({ before, op, context }) });
    case "TRANSCRIPT_TRIM_SEGMENT":
      return args.applyMutation({ label: op.label, kind: op.kind ?? "timing_adjustment", toolId: op.toolId,
        affectedSegments: [op.segmentId], immediatePersist: op.immediatePersist === true,
        computeAfter: (before) => applyTranscriptTrimSegmentComposition({ before, op, context }) });
    default:
      return null;
  }
}

export function resolveHammerDerivedLayersForUndoStack(args: {
  undoStack: readonly string[];
  baseline: HammerPersistedStructuredTranscript["derived_text_layers"];
  transitions: ReadonlyMap<string, { after: HammerPersistedStructuredTranscript["derived_text_layers"] }>;
}): HammerPersistedStructuredTranscript["derived_text_layers"] {
  let next = cloneHammerDerivedTextLayers(args.baseline);
  for (const entryId of args.undoStack) {
    const transition = args.transitions.get(entryId);
    if (transition) next = cloneHammerDerivedTextLayers(transition.after);
  }
  return next;
}

export function captureHammerPostHistorySaveRequest(args: {
  document: { workpieceId: string; sessionId: string; baseRevisionId: string; headEntryId?: string | null;
    undoStack: readonly string[]; redoStack: readonly string[] };
  editorState: HammerEditorStateSerializable;
}): HammerHistoryPostSaveSnapshotRequest {
  return Object.freeze({ workpieceId: args.document.workpieceId, sessionId: args.document.sessionId,
    baseRevisionId: args.document.baseRevisionId, headEntryId: args.document.headEntryId ?? null,
    undoDepth: args.document.undoStack.length, redoDepth: args.document.redoStack.length,
    editorState: cloneEditorState(args.editorState) });
}

export function normalizeHammerHistoryCompatibilityState(args: {
  state: HammerEditorStateSerializable; fallbackTimeline: HammerVisualTimelineState | null; nowIso?: () => string;
}): HammerEditorStateSerializable {
  if (args.state.visualTimeline) return { ...args.state, visualPlacements: deriveLegacyVisualPlacementsFromTimeline(args.state.visualTimeline) };
  if (!args.state.visualPlacements) return { ...args.state, visualTimeline: args.fallbackTimeline };
  return { ...args.state, visualTimeline: migrateLegacyPlacementRecordsToTimelineState({
    placements: args.state.visualPlacements.placements, selected_overlay_row_id: null,
    updated_at: (args.nowIso ?? (() => new Date().toISOString()))(),
  }) };
}
