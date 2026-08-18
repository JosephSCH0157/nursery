import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedAudioEdit, HammerAudioPolishAnalysisWaveformProxy } from "../persistence/hammerPersistenceContract";
import { buildNotStartedHammerAudioPolish, cloneHammerAudioEdit } from "../prep/hammerAudioPolish";
import { commitAudioCutSelection } from "./hammerAudioEditOperations";
import type { HammerAudioCutSelection } from "./hammerCleanupExecution";
import { deriveAudioCutsForSubtractiveTextEdits } from "./hammerCleanupExecution";
import type { HammerAuthorityOp } from "./hammerCompositionMutations";
import type { HammerDeleteOnlyTranscriptDeletion } from "./hammerDeleteOnlyTranscriptEditing";
import type { HammerHistoryEntry } from "./hammerWorkspaceHistory";
import type { HammerHistoryCommandAuthority, HammerHistoryMutationArgs } from "./hammerWorkspaceShellHistoryController";
import {
  moveSegmentTiming, resolveAdjacentSegmentSelection, resolveTimelineBoundaryTimes, roundToTenth,
  snapPlayheadToBoundary, trimSegmentEndTiming, trimSegmentStartTiming, updateSegmentGain, updateSegmentInTimeline,
} from "./hammerWorkspaceTimeline";

/** Ordinary transcript editing and timing authority. It delegates canonical composition/history
 * mutations and owns no cleanup, silence, candidates, captions, persistence, snapshots, or JSX. */

type CompositionMutation = (op: HammerAuthorityOp) => HammerHistoryEntry | null;
type HistoryMutation = (args: HammerHistoryMutationArgs) => HammerHistoryEntry | null;

export function createHammerTranscriptEditingCommands(args: {
  segments: HammerTranscriptSegment[]; selectedSegmentId: string | null; playbackDurationSec: number;
  waveformProxy: HammerAudioPolishAnalysisWaveformProxy | null; historyAuthority: HammerHistoryCommandAuthority;
  applyHistoryMutation: HistoryMutation; applyCompositionMutation: CompositionMutation; requestImmediatePersist: () => void;
  setTimingHint: (hint: string | null) => void; setSelectionAnchor: (id: string | null) => void;
  setSelectionFocus: (id: string | null) => void; focusTime: () => void;
  selectLinkedTimelineRange: (args: { startSec: number; endSec: number; segmentIds: string[]; anchorId: string }) => void;
  snapToleranceSec: number;
}) {
  const applyCutSelectionsToAudioEdit = (input: { audioEdit: HammerPersistedAudioEdit | null | undefined;
    cutSelections: Array<{ startSec: number; endSec: number }>; operationIdPrefix: string }): HammerPersistedAudioEdit | null => {
    let nextAudioEdit = cloneHammerAudioEdit(input.audioEdit);
    if (input.cutSelections.length === 0) return nextAudioEdit;
    let audioPolish = { ...buildNotStartedHammerAudioPolish(), audio_edit: cloneHammerAudioEdit(input.audioEdit) };
    for (let index = 0; index < input.cutSelections.length; index += 1) {
      const committed = commitAudioCutSelection({ audioPolish, selection: input.cutSelections[index],
        durationSec: args.playbackDurationSec, operationId: `${input.operationIdPrefix}:${index}` });
      if (committed) audioPolish = committed.audioPolish;
    }
    nextAudioEdit = cloneHammerAudioEdit(audioPolish.audio_edit);
    return nextAudioEdit;
  };
  const applyDraftTranscriptEdits = (segments: HammerTranscriptSegment[], drafts: Record<string, string>) => {
    let updatedSegments = segments;
    for (const [segmentId, draftText] of Object.entries(drafts)) {
      updatedSegments = updateSegmentInTimeline(updatedSegments, segmentId, (segment) => ({ ...segment, text: draftText }));
    }
    return updatedSegments;
  };
  const updateSegmentTiming = (segmentId: string, label: string,
    updater: (segment: HammerTranscriptSegment) => HammerTranscriptSegment,
    playheadUpdater?: (current: number) => number): void => {
    args.applyHistoryMutation({ label, kind: "timing_adjustment", affectedSegments: [segmentId],
      computeAfter: (before) => ({ ...before,
        transcriptSegments: updateSegmentInTimeline(before.transcriptSegments, segmentId, updater),
        playheadSec: playheadUpdater ? playheadUpdater(before.playheadSec) : before.playheadSec, transcriptTimingHint: null }) });
  };
  const moveSegment = (segmentId: string, deltaSec: number): void => updateSegmentTiming(segmentId, "Adjust segment timing",
    (segment) => moveSegmentTiming(segment, deltaSec), (current) => Math.max(0, roundToTenth(current + deltaSec)));
  const trimSegmentStart = (segmentId: string, deltaSec: number): void => {
    const segment = args.segments.find((candidate) => candidate.segment_id === segmentId) ?? null;
    if (!segment) return;
    const trimmed = trimSegmentStartTiming(segment, deltaSec);
    args.applyCompositionMutation({ type: "TRANSCRIPT_TRIM_SEGMENT", label: "Trim segment start", kind: "timing_adjustment",
      segmentId, trimStartSec: trimmed.start_sec, trimEndSec: trimmed.end_sec });
  };
  const trimSegmentEnd = (segmentId: string, deltaSec: number): void => {
    const segment = args.segments.find((candidate) => candidate.segment_id === segmentId) ?? null;
    if (!segment) return;
    const trimmed = trimSegmentEndTiming(segment, deltaSec);
    args.applyCompositionMutation({ type: "TRANSCRIPT_TRIM_SEGMENT", label: "Trim segment end", kind: "timing_adjustment",
      segmentId, trimStartSec: trimmed.start_sec, trimEndSec: trimmed.end_sec });
  };
  const commitTranscriptTextEdits = (drafts: Record<string, string>): { applied: boolean; playbackChanged: boolean } => {
    const controller = args.historyAuthority.getController();
    if (!controller) return { applied: false, playbackChanged: false };
    const beforeState = controller.getState();
    const updatedSegments = applyDraftTranscriptEdits(beforeState.transcriptSegments, drafts);
    const textCutSelections = deriveAudioCutsForSubtractiveTextEdits({ beforeSegments: beforeState.transcriptSegments,
      afterSegments: updatedSegments, durationSec: args.playbackDurationSec, waveformProxy: args.waveformProxy });
    const beforeAudioOpCount = beforeState.audioEdit?.operations?.length ?? 0;
    const applied = args.applyHistoryMutation({ label: "Edit transcript", kind: "transcript_text_edit",
      affectedSegments: Object.keys(drafts), immediatePersist: true, computeAfter: (before) => {
        const nextSegments = applyDraftTranscriptEdits(before.transcriptSegments, drafts);
        const cuts = deriveAudioCutsForSubtractiveTextEdits({ beforeSegments: before.transcriptSegments,
          afterSegments: nextSegments, durationSec: args.playbackDurationSec, waveformProxy: args.waveformProxy });
        return { ...before, transcriptSegments: nextSegments,
          audioEdit: applyCutSelectionsToAudioEdit({ audioEdit: before.audioEdit, cutSelections: cuts, operationIdPrefix: "transcript-edit" }),
          transcriptTimingHint: null };
      } });
    if (!applied) return { applied: false, playbackChanged: false };
    args.requestImmediatePersist();
    const afterAudioOpCount = args.historyAuthority.getController()?.getState().audioEdit?.operations?.length ?? beforeAudioOpCount;
    return { applied: true, playbackChanged: textCutSelections.length > 0 && afterAudioOpCount > beforeAudioOpCount };
  };
  const commitDeleteOnlyTranscriptEdits = (edits: Array<{ segmentId: string; nextText: string;
    deletion: HammerDeleteOnlyTranscriptDeletion; cutSelection: HammerAudioCutSelection | null }>) => {
    const controller = args.historyAuthority.getController();
    if (!controller || edits.length === 0) return { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    const beforeState = controller.getState();
    const uniqueEdits = edits.filter((edit, index, all) => all.findIndex((candidate) => candidate.segmentId === edit.segmentId) === index);
    const cuts = uniqueEdits.map((edit) => edit.cutSelection).filter((cut): cut is HammerAudioCutSelection => Boolean(cut));
    if (uniqueEdits.length === 0 || cuts.length !== uniqueEdits.length) return { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    const changed = uniqueEdits.some((edit) => beforeState.transcriptSegments.find((segment) => segment.segment_id === edit.segmentId)?.text !== edit.nextText);
    if (!changed && cuts.length === 0) return { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    const beforeCount = beforeState.audioEdit?.operations?.length ?? 0;
    const applied = args.applyHistoryMutation({ label: "Delete transcript tokens", kind: "transcript_text_edit",
      affectedSegments: uniqueEdits.map((edit) => edit.segmentId), immediatePersist: true,
      computeAfter: (before) => ({ ...before, transcriptSegments: uniqueEdits.reduce((segments, edit) =>
        updateSegmentInTimeline(segments, edit.segmentId, (segment) => ({ ...segment, text: edit.nextText })), before.transcriptSegments),
        audioEdit: applyCutSelectionsToAudioEdit({ audioEdit: before.audioEdit, cutSelections: cuts, operationIdPrefix: "transcript-delete" }),
        transcriptTimingHint: null }) });
    if (!applied) return { applied: false, playbackChanged: false, deletedTokenCount: 0 };
    args.requestImmediatePersist();
    const afterCount = args.historyAuthority.getController()?.getState().audioEdit?.operations?.length ?? beforeCount;
    return { applied: true, playbackChanged: cuts.length > 0 && afterCount > beforeCount,
      deletedTokenCount: uniqueEdits.reduce((count, edit) => count + edit.deletion.deletedTokenCount, 0) };
  };
  const splitSelectedSegmentAtPlayhead = (): void => {
    if (!args.selectedSegmentId) { args.setTimingHint("Select a segment to split."); return; }
    const state = args.historyAuthority.getController()?.getState() ?? null;
    if (!state) { args.setTimingHint("Split could not resolve the current workspace state."); return; }
    const snapped = snapPlayheadToBoundary({ nextPlayheadSec: state.playheadSec,
      boundaryTimesSec: resolveTimelineBoundaryTimes(state.transcriptSegments), toleranceSec: args.snapToleranceSec });
    const applied = args.applyCompositionMutation({ type: "TRANSCRIPT_SPLIT", label: "Split segment at playhead",
      kind: "segment_structure", segmentId: args.selectedSegmentId, splitTimeSec: snapped, immediatePersist: true });
    if (!applied) { args.setTimingHint("Playhead must sit within the selected segment to split."); return; }
    const next = args.historyAuthority.getController()?.getState().selectedSegmentId ?? null;
    args.setSelectionAnchor(next); args.setSelectionFocus(next); args.focusTime();
  };
  const deleteSelectedSegmentAndRipple = (): void => {
    if (!args.selectedSegmentId) { args.setTimingHint("Select a segment to delete."); return; }
    const applied = args.applyCompositionMutation({ type: "TRANSCRIPT_DELETE_RANGE", label: "Delete segment and ripple",
      kind: "segment_structure", segmentIds: [args.selectedSegmentId], immediatePersist: true });
    if (!applied) { args.setTimingHint("Selected segment could not be deleted."); return; }
    const next = args.historyAuthority.getController()?.getState().selectedSegmentId ?? null;
    args.setSelectionAnchor(next); args.setSelectionFocus(next); args.focusTime();
  };
  const selectAdjacentSegment = (direction: "previous" | "next"): void => {
    const id = resolveAdjacentSegmentSelection(args.segments, args.selectedSegmentId, direction);
    if (!id || id === args.selectedSegmentId) return;
    const segment = args.segments.find((item) => item.segment_id === id); if (!segment) return;
    args.selectLinkedTimelineRange({ startSec: segment.start_sec, endSec: segment.end_sec, segmentIds: [id], anchorId: id });
  };
  const toggleSelectedSegmentDisabled = (): void => {
    if (!args.selectedSegmentId) { args.setTimingHint("Select a segment to disable."); return; }
    const selected = args.segments.find((segment) => segment.segment_id === args.selectedSegmentId) ?? null;
    args.applyCompositionMutation({ type: "TRANSCRIPT_TOGGLE_MUTE_SEGMENTS", label: selected?.is_disabled ? "Enable segment" : "Disable segment",
      kind: "segment_structure", segmentIds: [args.selectedSegmentId], disabled: selected?.is_disabled !== true, immediatePersist: true });
  };
  const adjustSelectedSegmentGain = (deltaDb: number): void => {
    if (!args.selectedSegmentId) { args.setTimingHint("Select a segment to adjust gain."); return; }
    args.applyHistoryMutation({ label: deltaDb > 0 ? "Increase segment gain" : "Decrease segment gain", kind: "editor_state_change",
      toolId: "audio", affectedSegments: [args.selectedSegmentId], immediatePersist: true,
      computeAfter: (before) => ({ ...before, transcriptSegments: updateSegmentInTimeline(before.transcriptSegments,
        args.selectedSegmentId!, (segment) => updateSegmentGain(segment, deltaDb)), transcriptTimingHint: null }) });
  };
  return { moveSegment, trimSegmentStart, trimSegmentEnd, commitTranscriptTextEdits, commitDeleteOnlyTranscriptEdits,
    splitSelectedSegmentAtPlayhead, deleteSelectedSegmentAndRipple, selectAdjacentSegment,
    toggleSelectedSegmentDisabled, adjustSelectedSegmentGain };
}

export function createHammerTranscriptSelectionCommands(args: {
  segments: HammerTranscriptSegment[]; getSelectedRangeDetail: () => unknown; anchorId: string | null; focusId: string | null;
  range: { segmentIds: string[] }; timingHint: string | null; hasSelection: boolean;
  selectLinkedTarget: (args: { anchorSegmentId: string; focusSegmentId: string }) => void;
  clearLinkedSelection: () => void; setTimingHint: (hint: string | null) => void;
  applyCompositionMutation: CompositionMutation; historyAuthority: HammerHistoryCommandAuthority;
  setSelectionAnchor: (id: string | null) => void; setSelectionFocus: (id: string | null) => void; focusTime: () => void;
}) {
  const applyTranscriptSelection = (segmentId: string, extendRange: boolean): void => {
    if (!args.segments.some((segment) => segment.segment_id === segmentId)) return;
    const same = !extendRange && args.anchorId === segmentId && args.focusId === segmentId
      && args.range.segmentIds.length === 1 && args.range.segmentIds[0] === segmentId && !args.getSelectedRangeDetail();
    if (same) { if (args.timingHint) args.setTimingHint(null); return; }
    args.selectLinkedTarget({ anchorSegmentId: extendRange && args.anchorId ? args.anchorId : segmentId, focusSegmentId: segmentId });
    args.setTimingHint(null);
  };
  const clearTranscriptSelection = (): void => { args.clearLinkedSelection(); args.setTimingHint(null); };
  const disableTranscriptSelection = (): void => {
    if (!args.hasSelection) { args.setTimingHint("Select transcript segments to disable."); return; }
    const ids = new Set(args.range.segmentIds);
    const selected = args.segments.filter((segment) => ids.has(segment.segment_id));
    const disabled = !selected.every((segment) => segment.is_disabled === true);
    args.applyCompositionMutation({ type: "TRANSCRIPT_TOGGLE_MUTE_SEGMENTS",
      label: disabled ? "Disable transcript selection" : "Enable transcript selection", kind: "segment_structure",
      segmentIds: args.range.segmentIds, disabled, immediatePersist: true });
  };
  const cutTranscriptSelection = (): void => {
    if (!args.hasSelection) { args.setTimingHint("Select transcript segments to cut."); return; }
    const applied = args.applyCompositionMutation({ type: "TRANSCRIPT_DELETE_RANGE", label: "Cut transcript selection",
      kind: "segment_structure", segmentIds: args.range.segmentIds, immediatePersist: true });
    if (!applied) { args.setTimingHint("Transcript selection cut did not change the timeline."); return; }
    const next = args.historyAuthority.getController()?.getState().selectedSegmentId ?? null;
    args.setSelectionAnchor(next); args.setSelectionFocus(next); args.focusTime();
  };
  return { applyTranscriptSelection, clearTranscriptSelection, disableTranscriptSelection, cutTranscriptSelection };
}
