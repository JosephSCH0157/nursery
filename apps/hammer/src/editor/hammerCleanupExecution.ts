import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { diffTranscriptWords } from "../lib/hammerWordDiff";
import type { HammerDeadAirAnalysis } from "./hammerDeadAirClosure";
import type { HammerAudioPolishAnalysisWaveformProxy } from "../persistence/hammerPersistenceContract";
import {
  resolveSmartCutRange,
  type HammerSmartCutEditKind,
} from "./hammerWaveformCutRefinement";

export type HammerAudioCutSelection = {
  startSec: number;
  endSec: number;
};

export const HAMMER_FILLER_CUT_PAD_BEFORE_SEC = 0.015;
export const HAMMER_FILLER_CUT_PAD_AFTER_SEC = 0.03;
export const HAMMER_FILLER_CUT_SEAM_FADE_SEC = 0.006;

const MIN_CUT_SEC = 0.0001;
const MERGE_EPSILON_SEC = 0.001;
const FILLER_BOUNDARY_MIN_SLACK_SEC = 0.04;
const FILLER_BOUNDARY_MAX_SLACK_SEC = 0.12;
const FILLER_BOUNDARY_INITIAL_MAX_SLACK_SEC = 0.18;
const FILLER_BOUNDARY_INITIAL_EXTRA_POST_MAX_SEC = 0.12;
const FILLER_BOUNDARY_INITIAL_EXTRA_PRE_MAX_SEC = 0.04;

export type HammerFillerBoundaryHints = {
  baseRange: HammerAudioCutSelection;
  previousProtectedBoundarySec: number;
  nextProtectedBoundarySec: number;
  isPhraseInitial: boolean;
};

export function resolveFillerBoundaryHints(args: {
  baseRange: HammerAudioCutSelection;
  segmentStartSec: number;
  segmentEndSec: number;
  audioDurationSec: number;
  seedStartSec: number;
  seedEndSec: number;
  totalTokenCount: number;
  deleteStartTokenIndex: number;
  deleteEndTokenIndexExclusive: number;
}): HammerFillerBoundaryHints {
  const segmentStartSec = clampToDuration(Number(args.segmentStartSec), Number(args.audioDurationSec));
  const segmentEndSec = clampToDuration(Number(args.segmentEndSec), Number(args.audioDurationSec));
  const normalizedSegmentStartSec = Math.min(segmentStartSec, segmentEndSec);
  const normalizedSegmentEndSec = Math.max(segmentStartSec, segmentEndSec);

  const totalTokenCount = Math.max(1, Math.trunc(args.totalTokenCount));
  const avgTokenSec = clampNonNegative((normalizedSegmentEndSec - normalizedSegmentStartSec) / totalTokenCount);
  const isPhraseInitial = Math.max(0, Math.trunc(args.deleteStartTokenIndex)) === 0;

  const baseNeighborSlackSec = Math.min(
    FILLER_BOUNDARY_MAX_SLACK_SEC,
    Math.max(FILLER_BOUNDARY_MIN_SLACK_SEC, avgTokenSec * (isPhraseInitial ? 0.9 : 0.45)),
  );
  const phraseInitialExtraPreSec = isPhraseInitial
    ? Math.min(FILLER_BOUNDARY_INITIAL_EXTRA_PRE_MAX_SEC, Math.max(0.01, avgTokenSec * 0.35))
    : 0;
  const phraseInitialExtraPostSec = isPhraseInitial
    ? Math.min(FILLER_BOUNDARY_INITIAL_EXTRA_POST_MAX_SEC, Math.max(0.03, avgTokenSec * 0.9))
    : 0;
  const expandedNeighborSlackSec = isPhraseInitial
    ? Math.min(FILLER_BOUNDARY_INITIAL_MAX_SLACK_SEC, baseNeighborSlackSec + (avgTokenSec * 0.25))
    : baseNeighborSlackSec;

  const expandedBaseRange = {
    startSec: clampToDuration(
      Math.max(normalizedSegmentStartSec, Number(args.baseRange.startSec) - phraseInitialExtraPreSec),
      Number(args.audioDurationSec),
    ),
    endSec: clampToDuration(
      Math.min(normalizedSegmentEndSec, Number(args.baseRange.endSec) + phraseInitialExtraPostSec),
      Number(args.audioDurationSec),
    ),
  };

  return {
    baseRange: {
      startSec: Math.min(expandedBaseRange.startSec, expandedBaseRange.endSec),
      endSec: Math.max(expandedBaseRange.startSec, expandedBaseRange.endSec),
    },
    previousProtectedBoundarySec: clampToDuration(
      Math.max(normalizedSegmentStartSec, Number(args.seedStartSec) - expandedNeighborSlackSec),
      Number(args.audioDurationSec),
    ),
    nextProtectedBoundarySec: clampToDuration(
      Math.min(normalizedSegmentEndSec, Number(args.seedEndSec) + expandedNeighborSlackSec),
      Number(args.audioDurationSec),
    ),
    isPhraseInitial,
  };
}

export function computeRemovalTrimRange(args: {
  wordStartSec: number;
  wordEndSec: number;
  audioDurationSec: number;
  basePreBufferSec?: number;
  basePostBufferSec?: number;
}): HammerAudioCutSelection | null {
  const wordStartSec = Number(args.wordStartSec);
  const wordEndSec = Number(args.wordEndSec);
  if (!Number.isFinite(wordStartSec) || !Number.isFinite(wordEndSec)) {
    return null;
  }

  const removalStartSec = Math.min(wordStartSec, wordEndSec);
  const removalEndSec = Math.max(wordStartSec, wordEndSec);
  const removalDuration = removalEndSec - removalStartSec;
  if (removalDuration <= MIN_CUT_SEC) {
    return null;
  }

  const basePreBufferSec = clampNonNegative(Number(args.basePreBufferSec ?? HAMMER_FILLER_CUT_PAD_BEFORE_SEC));
  const basePostBufferSec = clampNonNegative(Number(args.basePostBufferSec ?? HAMMER_FILLER_CUT_PAD_AFTER_SEC));
  let preBufferSec = basePreBufferSec;
  let postBufferSec = basePostBufferSec;

  if (basePreBufferSec > 0 || basePostBufferSec > 0) {
    if (removalDuration < 0.180) {
      preBufferSec += 0.005;
      postBufferSec += 0.010;
    }

    if (removalDuration < 0.100) {
      preBufferSec += 0.005;
      postBufferSec += 0.010;
    }
  }

  const audioDurationSec = Number(args.audioDurationSec);
  const clampDurationSec = Number.isFinite(audioDurationSec) && audioDurationSec > 0
    ? audioDurationSec
    : (removalEndSec + postBufferSec);
  const trimStartSec = clampToDuration(removalStartSec - preBufferSec, clampDurationSec);
  const trimEndSec = clampToDuration(removalEndSec + postBufferSec, clampDurationSec);
  if ((trimEndSec - trimStartSec) <= MIN_CUT_SEC) {
    return null;
  }

  return {
    startSec: trimStartSec,
    endSec: trimEndSec,
  };
}

export function computeTranscriptCutRange(args: {
  wordStartSec: number;
  wordEndSec: number;
  audioDurationSec: number;
  basePreBufferSec?: number;
  basePostBufferSec?: number;
}): HammerAudioCutSelection | null {
  return computeRemovalTrimRange(args);
}

function resolveCleanupEditKindFromDeletedWords(words: string[]): HammerSmartCutEditKind {
  const deletedText = words.join(" ").toLowerCase();
  if (!deletedText.trim()) return "delete_only";

  if (/\b(?:um|uh|er|ah|you know|i mean|kind of|sort of|like)\b/i.test(deletedText)) {
    return "filler";
  }
  if (/\b(?:redo|retake|start over|scratch that|take again|one more time|restart)\b/i.test(deletedText)) {
    return "retake";
  }
  return "delete_only";
}

function maybeLogSmartCutDebug(payload: Record<string, unknown>): void {
  if (!(globalThis as { __forgeHammerDebugSmartCut__?: boolean }).__forgeHammerDebugSmartCut__) {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug("[hammer-smart-cut]", payload);
}

function clampToDuration(timeSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(timeSec)) return 0;
  return Math.max(0, Math.min(durationSec, timeSec));
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function normalizeAndMerge(selections: HammerAudioCutSelection[]): HammerAudioCutSelection[] {
  const normalized = selections
    .map((selection) => ({
      startSec: Number(selection.startSec),
      endSec: Number(selection.endSec),
    }))
    .filter((selection) => Number.isFinite(selection.startSec) && Number.isFinite(selection.endSec))
    .map((selection) => {
      const startSec = Math.min(selection.startSec, selection.endSec);
      const endSec = Math.max(selection.startSec, selection.endSec);
      return { startSec, endSec };
    })
    .filter((selection) => selection.endSec - selection.startSec > MIN_CUT_SEC)
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);

  const merged: HammerAudioCutSelection[] = [];
  for (const selection of normalized) {
    const current = merged[merged.length - 1] ?? null;
    if (!current || selection.startSec > current.endSec + MERGE_EPSILON_SEC) {
      merged.push({ ...selection });
      continue;
    }
    current.endSec = Math.max(current.endSec, selection.endSec);
  }
  return merged;
}

function applyPaddingToSelections(args: {
  selections: HammerAudioCutSelection[];
  durationSec: number;
  padBeforeSec?: number;
  padAfterSec?: number;
}): HammerAudioCutSelection[] {
  const padBeforeSec = clampNonNegative(Number(args.padBeforeSec ?? 0));
  const padAfterSec = clampNonNegative(Number(args.padAfterSec ?? 0));
  if (padBeforeSec <= 0 && padAfterSec <= 0) {
    return normalizeAndMerge(args.selections);
  }

  return normalizeAndMerge(args.selections.map((selection) => ({
    startSec: clampToDuration(selection.startSec - padBeforeSec, args.durationSec),
    endSec: clampToDuration(selection.endSec + padAfterSec, args.durationSec),
  })));
}

export function deriveAudioCutsForRemovedSegments(args: {
  segments: HammerTranscriptSegment[];
  removeSegmentIds: string[];
  durationSec: number;
  padBeforeSec?: number;
  padAfterSec?: number;
}): HammerAudioCutSelection[] {
  if (!Array.isArray(args.removeSegmentIds) || args.removeSegmentIds.length === 0) return [];
  const removeSet = new Set(args.removeSegmentIds.filter(Boolean));
  if (removeSet.size === 0) return [];

  const padBeforeSec = clampNonNegative(Number(args.padBeforeSec ?? 0));
  const padAfterSec = clampNonNegative(Number(args.padAfterSec ?? 0));

  const selections: HammerAudioCutSelection[] = [];
  for (const segment of args.segments) {
    if (!removeSet.has(segment.segment_id)) continue;
    const startSec = clampToDuration(Number(segment.start_sec) - padBeforeSec, args.durationSec);
    const endSec = clampToDuration(Number(segment.end_sec) + padAfterSec, args.durationSec);
    if (endSec - startSec <= MIN_CUT_SEC) continue;
    selections.push({ startSec, endSec });
  }

  return normalizeAndMerge(selections);
}

export function deriveAudioCutsForTimelineCompression(args: {
  beforeSegments: HammerTranscriptSegment[];
  afterSegments: HammerTranscriptSegment[];
  durationSec: number;
  padBeforeSec?: number;
  padAfterSec?: number;
}): HammerAudioCutSelection[] {
  if (!Number.isFinite(args.durationSec) || args.durationSec <= 0) return [];

  const beforeById = new Map<string, HammerTranscriptSegment>();
  for (const segment of args.beforeSegments) {
    beforeById.set(segment.segment_id, segment);
  }

  const orderedAfter = [...args.afterSegments].sort((left, right) => (
    left.start_sec - right.start_sec || left.end_sec - right.end_sec
  ));

  const selections: HammerAudioCutSelection[] = [];
  let cumulativeRemovedSec = 0;

  for (const segment of orderedAfter) {
    const before = beforeById.get(segment.segment_id);
    if (!before) continue;

    const impliedRemovedSec = clampNonNegative(Number(before.start_sec) - Number(segment.start_sec));
    if (impliedRemovedSec <= cumulativeRemovedSec + MIN_CUT_SEC) {
      cumulativeRemovedSec = Math.max(cumulativeRemovedSec, impliedRemovedSec);
      continue;
    }

    const deltaSec = impliedRemovedSec - cumulativeRemovedSec;
    const endSec = clampToDuration(Number(before.start_sec), args.durationSec);
    const startSec = clampToDuration(endSec - deltaSec, args.durationSec);
    if (endSec - startSec > MIN_CUT_SEC) {
      selections.push({ startSec, endSec });
    }
    cumulativeRemovedSec = impliedRemovedSec;
  }

  const beforeEndSec = args.beforeSegments.reduce((max, segment) => Math.max(max, Number(segment.end_sec) || 0), 0);
  const afterEndSec = args.afterSegments.reduce((max, segment) => Math.max(max, Number(segment.end_sec) || 0), 0);
  const totalRemovedSec = clampNonNegative(beforeEndSec - afterEndSec);
  if (totalRemovedSec > cumulativeRemovedSec + MIN_CUT_SEC) {
    const deltaSec = totalRemovedSec - cumulativeRemovedSec;
    const endSec = clampToDuration(beforeEndSec, args.durationSec);
    const startSec = clampToDuration(endSec - deltaSec, args.durationSec);
    if (endSec - startSec > MIN_CUT_SEC) {
      selections.push({ startSec, endSec });
    }
  }

  return applyPaddingToSelections({
    selections,
    durationSec: args.durationSec,
    padBeforeSec: args.padBeforeSec,
    padAfterSec: args.padAfterSec,
  });
}

export function deriveAudioCutsForSubtractiveTextEdits(args: {
  beforeSegments: HammerTranscriptSegment[];
  afterSegments: HammerTranscriptSegment[];
  durationSec: number;
  padBeforeSec?: number;
  padAfterSec?: number;
  waveformProxy?: HammerAudioPolishAnalysisWaveformProxy | null;
}): HammerAudioCutSelection[] {
  if (!Number.isFinite(args.durationSec) || args.durationSec <= 0) return [];
  const hasWaveformProxy = Boolean(
    args.waveformProxy
    && Array.isArray(args.waveformProxy.peaks)
    && args.waveformProxy.peaks.length > 0
    && Number.isFinite(args.waveformProxy.bucket_duration_sec)
    && Number(args.waveformProxy.bucket_duration_sec) > 0,
  );

  const afterById = new Map<string, HammerTranscriptSegment>();
  for (const segment of args.afterSegments) {
    afterById.set(segment.segment_id, segment);
  }

  const selections: HammerAudioCutSelection[] = [];
  for (const before of args.beforeSegments) {
    const after = afterById.get(before.segment_id);
    if (!after || before.text === after.text) continue;

    const ops = diffTranscriptWords(before.text, after.text);
    if (ops.some((op) => op.type === "insert" && op.words.length > 0)) {
      continue;
    }

    const beforeWordCount = ops.reduce((count, op) => (
      op.type === "equal" || op.type === "delete" ? count + op.words.length : count
    ), 0);
    const segmentDurationSec = Math.max(0, Number(before.end_sec) - Number(before.start_sec));
    if (beforeWordCount <= 0 || segmentDurationSec <= MIN_CUT_SEC) continue;

    let beforeWordCursor = 0;
    for (const op of ops) {
      if (op.type === "equal") {
        beforeWordCursor += op.words.length;
        continue;
      }
      if (op.type === "insert") continue;

      const startRatio = beforeWordCursor / beforeWordCount;
      const endRatio = (beforeWordCursor + op.words.length) / beforeWordCount;
      const wordStartSec = Number(before.start_sec) + (segmentDurationSec * startRatio);
      const wordEndSec = Number(before.start_sec) + (segmentDurationSec * endRatio);
      const baseRange = computeTranscriptCutRange({
        wordStartSec,
        wordEndSec,
        audioDurationSec: args.durationSec,
        basePreBufferSec: args.padBeforeSec,
        basePostBufferSec: args.padAfterSec,
      });
      if (baseRange) {
        const editKind = resolveCleanupEditKindFromDeletedWords(op.words);
        const boundaryHints = (
          editKind === "filler" && hasWaveformProxy
        ) ? resolveFillerBoundaryHints({
          baseRange,
          segmentStartSec: Number(before.start_sec),
          segmentEndSec: Number(before.end_sec),
          audioDurationSec: args.durationSec,
          seedStartSec: wordStartSec,
          seedEndSec: wordEndSec,
          totalTokenCount: beforeWordCount,
          deleteStartTokenIndex: beforeWordCursor,
          deleteEndTokenIndexExclusive: beforeWordCursor + op.words.length,
        }) : null;
        const resolved = resolveSmartCutRange({
          baseRange: boundaryHints?.baseRange ?? baseRange,
          editKind,
          waveformProxy: args.waveformProxy ?? null,
          previousProtectedBoundarySec: boundaryHints?.previousProtectedBoundarySec ?? wordStartSec,
          nextProtectedBoundarySec: boundaryHints?.nextProtectedBoundarySec ?? wordEndSec,
        });
        maybeLogSmartCutDebug({
          source: "deriveAudioCutsForSubtractiveTextEdits",
          segmentId: before.segment_id,
          boundaryPolicy: boundaryHints ? "filler_slack" : "default",
          phraseInitial: boundaryHints?.isPhraseInitial ?? false,
          ...resolved.debug,
        });
        selections.push(resolved.range);
      }
      beforeWordCursor += op.words.length;
    }
  }

  return normalizeAndMerge(selections);
}

export function deriveAudioCutsForDeadAirClosure(args: {
  analysis: HammerDeadAirAnalysis;
  durationSec: number;
}): HammerAudioCutSelection[] {
  const thresholdSec = Number(args.analysis.thresholdSec);
  if (!Number.isFinite(thresholdSec) || thresholdSec < 0) return [];

  const selections: HammerAudioCutSelection[] = [];
  for (const gap of args.analysis.gaps) {
    const startSec = clampToDuration(Number(gap.currentEndSec) + thresholdSec, args.durationSec);
    const endSec = clampToDuration(Number(gap.nextStartSec), args.durationSec);
    if (endSec - startSec <= MIN_CUT_SEC) continue;
    selections.push({ startSec, endSec });
  }

  return normalizeAndMerge(selections);
}

