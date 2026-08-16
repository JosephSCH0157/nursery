import { useCallback, useMemo, useRef, useState } from "react";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerAudioPolishAnalysisSegmentation } from "../persistence/hammerPersistenceContract";
import { buildNotStartedHammerAudioPolish, cloneHammerAudioEdit } from "../prep/hammerAudioPolish";
import { commitAudioCutSelection, normalizeAudioCutSelection } from "./hammerAudioEditOperations";
import { isTimeRangeFullyCoveredByCuts, type HammerEffectiveCutRegion } from "./hammerAudioEditPlayback";
import { applyDeadAirClosure, analyzeDeadAirGaps, type HammerDeadAirAnalysis } from "./hammerDeadAirClosure";
import { deriveAudioCutsForDeadAirClosure } from "./hammerCleanupExecution";
import { buildSilenceCutSuggestions, filterDismissedSilenceCutSuggestions } from "./hammerSilenceCutSuggestions";
import { syncEditableTranscriptSegments } from "./hammerWorkspaceTranscript";
import type { HammerEditorStateSerializable, HammerHistoryEntry, HammerHistoryKind } from "./hammerWorkspaceHistory";

type ApplyHistoryMutation = (args: {
  label: string;
  kind?: HammerHistoryKind;
  affectedSegments?: string[];
  toolId?: string;
  immediatePersist?: boolean;
  computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable;
}) => HammerHistoryEntry | null;

export type UseHammerWorkspaceShellSilenceEditingArgs = {
  identityKey: string;
  transcriptSegments: HammerTranscriptSegment[];
  segmentation: HammerAudioPolishAnalysisSegmentation | null;
  durationSec: number;
  effectiveCutRegions: HammerEffectiveCutRegion[];
  playheadSec: number;
  captureState: () => HammerEditorStateSerializable | null;
  applyHistoryMutation: ApplyHistoryMutation;
  setFocusToTime: () => void;
  setTranscriptTimingHint: (value: string | null) => void;
};

export function useHammerWorkspaceShellSilenceEditing(args: UseHammerWorkspaceShellSilenceEditingArgs) {
  const [audioCutSelectionStartSec, setAudioCutSelectionStartSec] = useState<number | null>(null);
  const [audioCutSelectionEndSec, setAudioCutSelectionEndSec] = useState<number | null>(null);
  const [dismissedSilenceSuggestionIds, setDismissedSilenceSuggestionIds] = useState<Set<string>>(() => new Set());
  const [deadAirThresholdSec, setDeadAirThresholdSec] = useState(1.5);
  const [deadAirAnalysis, setDeadAirAnalysis] = useState<HammerDeadAirAnalysis | null>(null);
  const [deadAirApplyInFlight, setDeadAirApplyInFlight] = useState(false);
  const identityRef = useRef(args.identityKey);
  const applyInFlightRef = useRef(false);

  if (identityRef.current !== args.identityKey) {
    identityRef.current = args.identityKey;
    applyInFlightRef.current = false;
  }

  const audioCutSelection = useMemo(() => normalizeAudioCutSelection({
    selection: { startSec: audioCutSelectionStartSec, endSec: audioCutSelectionEndSec },
    durationSec: args.durationSec,
  }), [args.durationSec, audioCutSelectionEndSec, audioCutSelectionStartSec]);
  const hasPendingAudioCutSelection = audioCutSelectionStartSec != null || audioCutSelectionEndSec != null;
  const isAudioCutSelectionCovered = useMemo(() => audioCutSelection != null && isTimeRangeFullyCoveredByCuts({
    effectiveCutRegions: args.effectiveCutRegions,
    startSec: audioCutSelection.startSec,
    endSec: audioCutSelection.endSec,
  }), [args.effectiveCutRegions, audioCutSelection]);
  const audioCutSelectionStatus = useMemo(() => {
    if (args.durationSec <= 0) return "Timeline duration unavailable. Cut selection is disabled.";
    if (audioCutSelection && isAudioCutSelectionCovered) return `Selection ${audioCutSelection.startSec.toFixed(1)}s-${audioCutSelection.endSec.toFixed(1)}s is already covered by an existing cut.`;
    if (audioCutSelection) return `Cut selection ready: ${audioCutSelection.startSec.toFixed(1)}s-${audioCutSelection.endSec.toFixed(1)}s.`;
    if (audioCutSelectionStartSec != null && audioCutSelectionEndSec != null) return "Selection must be longer than 0.0s to create a cut.";
    if (audioCutSelectionStartSec != null) return `In point marked at ${audioCutSelectionStartSec.toFixed(1)}s. Move the playhead and mark out.`;
    if (audioCutSelectionEndSec != null) return `Out point marked at ${audioCutSelectionEndSec.toFixed(1)}s. Move the playhead and mark in.`;
    return "Use the current playhead to mark in, mark out, and create one persisted cut.";
  }, [args.durationSec, audioCutSelection, audioCutSelectionEndSec, audioCutSelectionStartSec, isAudioCutSelectionCovered]);
  const silenceCutSuggestions = useMemo(() => buildSilenceCutSuggestions({
    segmentation: args.segmentation,
    durationSec: args.durationSec,
    effectiveCutRegions: args.effectiveCutRegions,
  }), [args.durationSec, args.effectiveCutRegions, args.segmentation]);
  const visibleSilenceCutSuggestions = useMemo(() => filterDismissedSilenceCutSuggestions({
    suggestions: silenceCutSuggestions,
    dismissedSuggestionIds: dismissedSilenceSuggestionIds,
  }), [dismissedSilenceSuggestionIds, silenceCutSuggestions]);

  const commitCut = useCallback((startSec: number | null, endSec: number | null, operationId?: string): boolean => {
    const beforeState = args.captureState();
    if (!beforeState) return false;
    if (operationId && (beforeState.audioEdit?.operations ?? []).some((operation) => operation.id === operationId)) return false;
    const committed = commitAudioCutSelection({
      audioPolish: { ...buildNotStartedHammerAudioPolish(), audio_edit: cloneHammerAudioEdit(beforeState.audioEdit) },
      selection: { startSec, endSec },
      durationSec: args.durationSec,
      operationId,
    });
    if (!committed) return false;
    const applied = args.applyHistoryMutation({
      label: "Add audio cut",
      kind: "timing_adjustment",
      toolId: "polish",
      immediatePersist: true,
      computeAfter: (before) => ({ ...before, audioEdit: cloneHammerAudioEdit(committed.audioPolish.audio_edit), transcriptTimingHint: null }),
    });
    if (!applied) return false;
    args.setFocusToTime();
    return true;
  }, [args]);

  const markAudioCutBoundary = useCallback((boundary: "start" | "end") => {
    if (args.durationSec <= 0) return;
    const markerTimeSec = Math.max(0, Math.min(args.durationSec, Math.round(args.playheadSec * 10) / 10));
    if (boundary === "start") setAudioCutSelectionStartSec(markerTimeSec);
    else setAudioCutSelectionEndSec(markerTimeSec);
  }, [args.durationSec, args.playheadSec]);
  const clearAudioCutSelection = useCallback(() => {
    setAudioCutSelectionStartSec(null);
    setAudioCutSelectionEndSec(null);
  }, []);
  const applyAudioCutSelection = useCallback(() => {
    if (commitCut(audioCutSelectionStartSec, audioCutSelectionEndSec)) clearAudioCutSelection();
  }, [audioCutSelectionEndSec, audioCutSelectionStartSec, clearAudioCutSelection, commitCut]);
  const acceptSilenceCutSuggestion = useCallback((suggestionId: string) => {
    const suggestion = visibleSilenceCutSuggestions.find((item) => item.id === suggestionId);
    if (!suggestion || !commitCut(suggestion.startSec, suggestion.endSec)) return;
    setDismissedSilenceSuggestionIds((current) => {
      const next = new Set(current); next.delete(suggestionId); return next;
    });
  }, [commitCut, visibleSilenceCutSuggestions]);
  const dismissSilenceCutSuggestion = useCallback((suggestionId: string) => {
    setDismissedSilenceSuggestionIds((current) => new Set(current).add(suggestionId));
  }, []);
  const reconcileDismissedSuggestions = useCallback(() => {
    setDismissedSilenceSuggestionIds((current) => {
      if (current.size === 0) return current;
      const active = new Set(silenceCutSuggestions.map((suggestion) => suggestion.id));
      const next = new Set(Array.from(current).filter((id) => active.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [silenceCutSuggestions]);
  const resetForWorkpiece = useCallback(() => {
    clearAudioCutSelection();
    setDismissedSilenceSuggestionIds(new Set());
    setDeadAirAnalysis(null);
    applyInFlightRef.current = false;
  }, [clearAudioCutSelection]);
  const invalidateDeadAirAnalysis = useCallback(() => setDeadAirAnalysis(null), []);
  const analyzeDeadAirClosure = useCallback(() => {
    const identity = identityRef.current;
    const analysis = analyzeDeadAirGaps(args.transcriptSegments, deadAirThresholdSec);
    if (identityRef.current === identity) setDeadAirAnalysis(analysis);
  }, [args.transcriptSegments, deadAirThresholdSec]);
  const applyDeadAirClosureBatch = useCallback(() => {
    if (applyInFlightRef.current) return;
    const identity = identityRef.current;
    applyInFlightRef.current = true;
    setDeadAirApplyInFlight(true);
    try {
      const { segments: updated, analysis } = applyDeadAirClosure({ segments: args.transcriptSegments, thresholdSec: deadAirThresholdSec });
      if (identityRef.current !== identity) return;
      setDeadAirAnalysis(analysis);
      if (analysis.eligibleGapCount === 0) return;
      const cutSelections = deriveAudioCutsForDeadAirClosure({ analysis, durationSec: args.durationSec });
      const affected = new Set<string>();
      for (const gap of analysis.gaps) { affected.add(gap.currentSegmentId); affected.add(gap.nextSegmentId); }
      const applied = args.applyHistoryMutation({
        label: `Trim dead air (${analysis.thresholdSec.toFixed(1)}s threshold)`,
        kind: "timing_adjustment",
        toolId: "polish",
        affectedSegments: Array.from(affected),
        immediatePersist: true,
        computeAfter: (before) => {
          const synced = syncEditableTranscriptSegments(updated, before.selectedSegmentId);
          let audioPolish = { ...buildNotStartedHammerAudioPolish(), audio_edit: cloneHammerAudioEdit(before.audioEdit) };
          for (let index = 0; index < cutSelections.length; index += 1) {
            const committed = commitAudioCutSelection({ audioPolish, selection: cutSelections[index], durationSec: args.durationSec, operationId: `dead_air:${analysis.thresholdSec.toFixed(1)}:${index}` });
            if (committed) audioPolish = committed.audioPolish;
          }
          return { ...before, transcriptSegments: synced.segments, selectedSegmentId: synced.selectedSegmentId, audioEdit: cloneHammerAudioEdit(audioPolish.audio_edit), transcriptTimingHint: null };
        },
      });
      if (applied && identityRef.current === identity) args.setTranscriptTimingHint(`${analysis.eligibleGapCount} gap${analysis.eligibleGapCount === 1 ? "" : "s"} exceed ${analysis.thresholdSec.toFixed(1)}s; removed ${analysis.totalRemovableSec.toFixed(1)}s of dead air.`);
    } finally {
      if (identityRef.current === identity) setDeadAirApplyInFlight(false);
      applyInFlightRef.current = false;
    }
  }, [args, deadAirThresholdSec]);

  return {
    audioCutSelection, audioCutSelectionStartSec, audioCutSelectionEndSec, audioCutSelectionStatus,
    hasPendingAudioCutSelection, canMarkAudioCutSelection: args.durationSec > 0,
    canApplyAudioCutSelection: audioCutSelection != null && !isAudioCutSelectionCovered,
    silenceCutSuggestions, visibleSilenceCutSuggestions,
    hasSilenceSuggestionAnalysis: args.segmentation != null,
    silenceSuggestionCount: visibleSilenceCutSuggestions.length,
    deadAirThresholdSec, deadAirAnalysis, deadAirApplyInFlight,
    setDeadAirThresholdSec, markAudioCutBoundary, clearAudioCutSelection, applyAudioCutSelection,
    acceptSilenceCutSuggestion, dismissSilenceCutSuggestion, reconcileDismissedSuggestions,
    resetForWorkpiece, invalidateDeadAirAnalysis, analyzeDeadAirClosure, applyDeadAirClosureBatch,
  };
}
