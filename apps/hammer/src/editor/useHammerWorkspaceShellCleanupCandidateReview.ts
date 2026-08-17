import { useCallback, useMemo, useRef, useState } from "react";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedAudioEdit } from "../persistence/hammerPersistenceContract";
import { buildNotStartedHammerAudioPolish, cloneHammerAudioEdit } from "../prep/hammerAudioPolish";
import { commitAudioCutSelection } from "./hammerAudioEditOperations";
import { getEffectiveCutRegions, resolveNextAudiblePlaybackTime } from "./hammerAudioEditPlayback";
import {
  buildCleanupCandidateQueue,
  clampActiveCleanupCandidateIndex,
  type HammerCleanupCandidateCard,
  type HammerCleanupCandidateReviewKind,
} from "./hammerCleanupCandidateQueue";
import type { FillerCleanupOptions, RetakeCleanupOptions } from "./hammerCleanupTools";
import { deriveDeleteOnlyTranscriptCutSelection, resolveDeleteOnlyTranscriptDeletion } from "./hammerDeleteOnlyTranscriptEditing";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "./hammerWorkspaceHistory";
import type { HammerSelectedTranscriptRangeDetail } from "./hammerWorkspaceShellSelectionUtils";
import { syncEditableTranscriptSegments } from "./hammerWorkspaceTranscript";

/** Cleanup review owns transcript-removal proposals only; it is not a short-candidate system. */
export type UseHammerWorkspaceShellCleanupCandidateReviewArgs = {
  transcriptSegments: HammerTranscriptSegment[];
  getDurationSec: () => number;
  getWaveformProxy: () => Parameters<typeof deriveDeleteOnlyTranscriptCutSelection>[0]["waveformProxy"];
  getFillerOptions: () => FillerCleanupOptions;
  getRetakeOptions: () => RetakeCleanupOptions;
  getSelectedRemoval: () => HammerSelectedTranscriptRangeDetail | null;
  captureState: () => HammerEditorStateSerializable;
  getCurrentState: () => HammerEditorStateSerializable | null;
  applyHistoryMutation: (args: {
    label: string;
    kind: "cleanup_tool";
    toolId: "polish";
    affectedSegments: string[];
    immediatePersist: true;
    computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable;
  }) => HammerHistoryEntry | null;
  clearCleanupPreview: () => void;
  setTranscriptTimingHint: (value: string | null) => void;
};

function createRemovalDraft(card: HammerCleanupCandidateCard | null): HammerSelectedTranscriptRangeDetail | null {
  if (!card || card.suggestedRemoval.length === 0) return null;
  const text = card.suggestedRemovalText.trim() ? card.suggestedRemovalText : card.suggestedRemoval.map((item) => item.text).join("\n");
  return {
    start: 0, end: text.length, text,
    segments: card.suggestedRemoval.map((item) => ({ segmentId: item.segmentId, selectionStart: item.selectionStart, selectionEnd: item.selectionEnd, text: item.text })),
  };
}

export function useHammerWorkspaceShellCleanupCandidateReview(args: UseHammerWorkspaceShellCleanupCandidateReviewArgs) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const [fillerCandidateCards, setFillerCandidateCards] = useState<HammerCleanupCandidateCard[]>([]);
  const [fillerActiveCandidateIndex, setFillerActiveCandidateIndex] = useState(0);
  const [fillerDecisionInFlight, setFillerDecisionInFlight] = useState(false);
  const [retakeCandidateCards, setRetakeCandidateCards] = useState<HammerCleanupCandidateCard[]>([]);
  const [retakeActiveCandidateIndex, setRetakeActiveCandidateIndex] = useState(0);
  const [retakeDecisionInFlight, setRetakeDecisionInFlight] = useState(false);
  const [activeReviewKind, setActiveReviewKind] = useState<HammerCleanupCandidateReviewKind>("fillers");
  const [candidateProposedRemovalById, setCandidateProposedRemovalById] = useState<Record<string, HammerSelectedTranscriptRangeDetail>>({});
  const [candidateReceiptByKind, setCandidateReceiptByKind] = useState<Record<HammerCleanupCandidateReviewKind, string | null>>({ fillers: null, retakes: null });
  const handledIdsRef = useRef({ fillers: new Set<string>(), retakes: new Set<string>() });
  const inFlightRef = useRef({ fillers: false, retakes: false });
  const lastHandledIdRef = useRef<{ fillers: string | null; retakes: string | null }>({ fillers: null, retakes: null });

  const activeFillerCandidateCard = fillerCandidateCards[fillerActiveCandidateIndex] ?? null;
  const activeRetakeCandidateCard = retakeCandidateCards[retakeActiveCandidateIndex] ?? null;
  const activeCandidateCard = activeReviewKind === "retakes" ? activeRetakeCandidateCard : activeFillerCandidateCard;
  const candidateSegmentIdSet = useMemo(() => new Set([...fillerCandidateCards.flatMap((card) => card.segmentIds), ...retakeCandidateCards.flatMap((card) => card.segmentIds)]), [fillerCandidateCards, retakeCandidateCards]);
  const activeCandidateSegmentIdSet = useMemo(() => new Set(activeCandidateCard?.segmentIds ?? []), [activeCandidateCard]);

  const resolveRemovalDraft = useCallback((card: HammerCleanupCandidateCard | null) => card ? candidateProposedRemovalById[card.id] ?? createRemovalDraft(card) : null, [candidateProposedRemovalById]);
  const resetHandled = useCallback((kind: HammerCleanupCandidateReviewKind) => {
    handledIdsRef.current[kind] = new Set();
    lastHandledIdRef.current[kind] = null;
  }, []);
  const rebuildCandidateQueue = useCallback((input: { kind: HammerCleanupCandidateReviewKind; segments: HammerTranscriptSegment[]; resetHandled?: boolean; preserveIndex?: number }) => {
    if (input.resetHandled) resetHandled(input.kind);
    const { cards } = buildCleanupCandidateQueue({
      kind: input.kind, segments: input.segments,
      fillerOptions: argsRef.current.getFillerOptions(), retakeOptions: argsRef.current.getRetakeOptions(),
      handledCandidateIds: handledIdsRef.current[input.kind],
    });
    if (input.kind === "fillers") {
      setFillerCandidateCards(cards);
      setFillerActiveCandidateIndex((previous) => clampActiveCleanupCandidateIndex(input.preserveIndex ?? previous, cards.length));
    } else {
      setRetakeCandidateCards(cards);
      setRetakeActiveCandidateIndex((previous) => clampActiveCleanupCandidateIndex(input.preserveIndex ?? previous, cards.length));
    }
    argsRef.current.clearCleanupPreview();
  }, [resetHandled]);
  const refreshCandidateQueue = useCallback((kind: HammerCleanupCandidateReviewKind) => {
    setActiveReviewKind(kind);
    setCandidateProposedRemovalById({});
    setCandidateReceiptByKind((current) => ({ ...current, [kind]: null }));
    rebuildCandidateQueue({ kind, segments: argsRef.current.transcriptSegments, resetHandled: true, preserveIndex: 0 });
  }, [rebuildCandidateQueue]);
  const updateCandidateProposedRemoval = useCallback((kind: HammerCleanupCandidateReviewKind) => {
    setActiveReviewKind(kind);
    const card = kind === "retakes" ? activeRetakeCandidateCard : activeFillerCandidateCard;
    const selected = argsRef.current.getSelectedRemoval();
    if (!card) return;
    if (!selected || selected.segments.length === 0 || !selected.text.trim()) {
      argsRef.current.setTranscriptTimingHint("Select transcript text, then choose Update Proposed Removal.");
      return;
    }
    setCandidateProposedRemovalById((current) => ({ ...current, [card.id]: { ...selected, segments: selected.segments.map((segment) => ({ ...segment })) } }));
    argsRef.current.setTranscriptTimingHint(null);
  }, [activeFillerCandidateCard, activeRetakeCandidateCard]);

  const applyCuts = useCallback((audioEdit: HammerPersistedAudioEdit | null | undefined, cuts: Array<{ startSec: number; endSec: number }>, prefix: string) => {
    let polish = { ...buildNotStartedHammerAudioPolish(), audio_edit: cloneHammerAudioEdit(audioEdit) };
    for (let index = 0; index < cuts.length; index += 1) {
      const committed = commitAudioCutSelection({ audioPolish: polish, selection: cuts[index], durationSec: argsRef.current.getDurationSec(), operationId: `${prefix}:${index}` });
      if (committed) polish = committed.audioPolish;
    }
    return cloneHammerAudioEdit(polish.audio_edit);
  }, []);
  const handleCandidateDecision = useCallback((kind: HammerCleanupCandidateReviewKind, approve: boolean) => {
    setActiveReviewKind(kind);
    const card = kind === "retakes" ? activeRetakeCandidateCard : activeFillerCandidateCard;
    if (!card || inFlightRef.current[kind] || lastHandledIdRef.current[card.kind] === card.id) return;
    inFlightRef.current[kind] = true;
    if (kind === "fillers") setFillerDecisionInFlight(true); else setRetakeDecisionInFlight(true);
    try {
      const preserveIndex = kind === "retakes" ? retakeActiveCandidateIndex : fillerActiveCandidateIndex;
      const beforeState = argsRef.current.captureState();
      let nextSegments = beforeState.transcriptSegments;
      if (approve) {
        const draft = resolveRemovalDraft(card);
        if (!draft?.segments.length) { argsRef.current.setTranscriptTimingHint("No proposed removal is available for this candidate."); lastHandledIdRef.current[card.kind] = null; return; }
        const uniqueSlices = draft.segments.filter((slice, index, all) => all.findIndex((candidate) => candidate.segmentId === slice.segmentId) === index);
        const edits = uniqueSlices.flatMap((slice) => {
          const segment = beforeState.transcriptSegments.find((item) => item.segment_id === slice.segmentId);
          if (!segment) return [];
          const deletion = resolveDeleteOnlyTranscriptDeletion({ text: String(segment.text ?? ""), selectionStart: slice.selectionStart, selectionEnd: slice.selectionEnd, direction: "selection" });
          if (!deletion) return [];
          const cutSelection = deriveDeleteOnlyTranscriptCutSelection({ segment, deletion, audioDurationSec: argsRef.current.getDurationSec(), waveformProxy: argsRef.current.getWaveformProxy(), editKind: card.kind === "fillers" ? "filler" : "retake" });
          return cutSelection ? [{ segmentId: slice.segmentId, nextText: deletion.nextText, deletion, cutSelection }] : [];
        });
        if (!edits.length) { argsRef.current.setTranscriptTimingHint("Proposed removal did not resolve to a valid transcript deletion."); lastHandledIdRef.current[card.kind] = null; return; }
        const transcriptWouldChange = edits.some((edit) => beforeState.transcriptSegments.find((segment) => segment.segment_id === edit.segmentId)?.text !== edit.nextText);
        const cuts = edits.map((edit) => edit.cutSelection);
        if (!transcriptWouldChange && !cuts.length) { setCandidateReceiptByKind((current) => ({ ...current, [card.kind]: "No-op: candidate approval produced no transcript or playback changes." })); lastHandledIdRef.current[card.kind] = null; return; }
        const beforeAudioOpCount = beforeState.audioEdit?.operations?.length ?? 0;
        const applied = argsRef.current.applyHistoryMutation({
          label: card.kind === "fillers" ? "Approve filler removal" : "Approve retake removal", kind: "cleanup_tool", toolId: "polish", affectedSegments: card.segmentIds, immediatePersist: true,
          computeAfter: (before) => {
            const remaining = before.transcriptSegments.flatMap((segment) => { const edit = edits.find((item) => item.segmentId === segment.segment_id); return !edit ? [segment] : edit.nextText.trim() ? [{ ...segment, text: edit.nextText }] : []; });
            const synced = syncEditableTranscriptSegments(remaining, before.selectedSegmentId);
            const nextAudioEdit = applyCuts(before.audioEdit, cuts, `cleanup:${card.kind}:${card.id}`);
            const changed = transcriptWouldChange || (nextAudioEdit?.operations?.length ?? 0) !== (before.audioEdit?.operations?.length ?? 0);
            return { ...before, transcriptSegments: synced.segments, selectedSegmentId: synced.selectedSegmentId, audioEdit: nextAudioEdit, transcriptTimingHint: changed ? null : before.transcriptTimingHint };
          },
        });
        if (!applied) { setCandidateReceiptByKind((current) => ({ ...current, [card.kind]: "No-op: candidate approval did not commit any canonical changes." })); lastHandledIdRef.current[card.kind] = null; return; }
        const afterState = argsRef.current.getCurrentState();
        const committedCutCount = Math.max(0, (afterState?.audioEdit?.operations?.length ?? beforeAudioOpCount) - beforeAudioOpCount);
        handledIdsRef.current[card.kind].add(card.id); lastHandledIdRef.current[card.kind] = card.id;
        if (import.meta.env.DEV && typeof window !== "undefined" && Boolean((window as any).__forgeHammerDebugCandidateApproval__)) {
          const durationSec = argsRef.current.getDurationSec();
          const effectiveRegions = getEffectiveCutRegions(afterState?.audioEdit ?? null, durationSec);
          const seekTarget = afterState ? resolveNextAudiblePlaybackTime({ requestedTimeSec: afterState.playheadSec, durationSec, effectiveCutRegions: effectiveRegions, transcriptSegments: afterState.transcriptSegments }) : null;
          // eslint-disable-next-line no-console
          console.debug("[HammerCandidateApproval]", { kind: card.kind, cardId: card.id, primarySegmentId: card.primarySegmentId, transcriptWouldChange, removalEdits: edits.map((edit) => ({ segmentId: edit.segmentId, deletedText: edit.deletion.deletedText, nextText: edit.nextText })), plannedCutCount: cuts.length, beforeAudioOpCount, afterAudioOpCount: afterState?.audioEdit?.operations?.length ?? beforeAudioOpCount, committedCutCount, effectiveCutRegions: effectiveRegions.length, seekTarget });
        }
        setCandidateReceiptByKind((current) => ({ ...current, [card.kind]: committedCutCount > 0 ? `Applied cleanup + ${committedCutCount} timeline cut${committedCutCount === 1 ? "" : "s"}.` : "Applied transcript cleanup (no new timeline cuts committed)." }));
        nextSegments = afterState?.transcriptSegments ?? nextSegments;
      } else {
        handledIdsRef.current[card.kind].add(card.id); lastHandledIdRef.current[card.kind] = card.id;
        setCandidateReceiptByKind((current) => ({ ...current, [card.kind]: "Candidate discarded (no transcript or audio change)." }));
      }
      rebuildCandidateQueue({ kind: card.kind, segments: nextSegments, preserveIndex });
      const otherKind = kind === "fillers" ? "retakes" : "fillers";
      rebuildCandidateQueue({ kind: otherKind, segments: nextSegments, preserveIndex: otherKind === "retakes" ? retakeActiveCandidateIndex : fillerActiveCandidateIndex });
    } finally {
      inFlightRef.current[kind] = false;
      if (kind === "fillers") setFillerDecisionInFlight(false); else setRetakeDecisionInFlight(false);
    }
  }, [activeFillerCandidateCard, activeRetakeCandidateCard, applyCuts, fillerActiveCandidateIndex, rebuildCandidateQueue, resolveRemovalDraft, retakeActiveCandidateIndex]);

  const syncReviewPass = useCallback((pass: string) => {
    if (pass === "transcript_cleanup" || pass === "retakes") {
      setActiveReviewKind(pass === "retakes" ? "retakes" : "fillers");
      rebuildCandidateQueue({ kind: "fillers", segments: argsRef.current.transcriptSegments, resetHandled: true, preserveIndex: 0 });
      rebuildCandidateQueue({ kind: "retakes", segments: argsRef.current.transcriptSegments, resetHandled: true, preserveIndex: 0 });
    } else {
      setFillerCandidateCards([]); setFillerActiveCandidateIndex(0); setFillerDecisionInFlight(false);
      setRetakeCandidateCards([]); setRetakeActiveCandidateIndex(0); setRetakeDecisionInFlight(false);
    }
  }, [rebuildCandidateQueue]);
  const reconcileFillerIndex = useCallback(() => {
    if (fillerCandidateCards.length === 0 && fillerActiveCandidateIndex !== 0) setFillerActiveCandidateIndex(0);
    else if (fillerActiveCandidateIndex >= fillerCandidateCards.length && fillerCandidateCards.length > 0) setFillerActiveCandidateIndex(fillerCandidateCards.length - 1);
  }, [fillerActiveCandidateIndex, fillerCandidateCards.length]);
  const reconcileRetakeIndex = useCallback(() => {
    if (retakeCandidateCards.length === 0 && retakeActiveCandidateIndex !== 0) setRetakeActiveCandidateIndex(0);
    else if (retakeActiveCandidateIndex >= retakeCandidateCards.length && retakeCandidateCards.length > 0) setRetakeActiveCandidateIndex(retakeCandidateCards.length - 1);
  }, [retakeActiveCandidateIndex, retakeCandidateCards.length]);

  return { fillerCandidateCards, fillerActiveCandidateIndex, fillerDecisionInFlight, retakeCandidateCards, retakeActiveCandidateIndex, retakeDecisionInFlight, activeReviewKind, candidateReceiptByKind, candidateProposedRemovalById, activeFillerCandidateCard, activeRetakeCandidateCard, activeCandidateCard, candidateSegmentIdSet, activeCandidatePrimarySegmentId: activeCandidateCard?.primarySegmentId ?? null, activeCandidateSegmentIdSet, resolveCandidateRemovalDraft: resolveRemovalDraft, setActiveReviewKind, setFillerActiveCandidateIndex, setRetakeActiveCandidateIndex, updateCandidateProposedRemoval, refreshCandidateQueue, handleCandidateDecision, syncReviewPass, reconcileFillerIndex, reconcileRetakeIndex };
}
