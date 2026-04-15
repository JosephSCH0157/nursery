import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { diffTranscriptWords } from "../lib/hammerWordDiff";
import type { HammerDeadAirAnalysis } from "./hammerDeadAirClosure";

export type HammerAudioCutSelection = {
  startSec: number;
  endSec: number;
};

export const HAMMER_FILLER_CUT_PAD_BEFORE_SEC = 0.02;
export const HAMMER_FILLER_CUT_PAD_AFTER_SEC = 0.02;
export const HAMMER_FILLER_CUT_SEAM_FADE_SEC = 0.01;

const MIN_CUT_SEC = 0.0001;
const MERGE_EPSILON_SEC = 0.001;

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

  return normalizeAndMerge(selections);
}

export function deriveAudioCutsForSubtractiveTextEdits(args: {
  beforeSegments: HammerTranscriptSegment[];
  afterSegments: HammerTranscriptSegment[];
  durationSec: number;
}): HammerAudioCutSelection[] {
  if (!Number.isFinite(args.durationSec) || args.durationSec <= 0) return [];

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
      const startSec = clampToDuration(
        Number(before.start_sec) + (segmentDurationSec * startRatio),
        args.durationSec,
      );
      const endSec = clampToDuration(
        Number(before.start_sec) + (segmentDurationSec * endRatio),
        args.durationSec,
      );
      if (endSec - startSec > MIN_CUT_SEC) {
        selections.push({ startSec, endSec });
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

