import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerDeadAirAnalysis } from "./hammerDeadAirClosure";

export type HammerAudioCutSelection = {
  startSec: number;
  endSec: number;
};

const MIN_CUT_SEC = 0.0001;
const MERGE_EPSILON_SEC = 0.001;

function clampToDuration(timeSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(timeSec)) return 0;
  return Math.max(0, Math.min(durationSec, timeSec));
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
}): HammerAudioCutSelection[] {
  if (!Array.isArray(args.removeSegmentIds) || args.removeSegmentIds.length === 0) return [];
  const removeSet = new Set(args.removeSegmentIds.filter(Boolean));
  if (removeSet.size === 0) return [];

  const selections: HammerAudioCutSelection[] = [];
  for (const segment of args.segments) {
    if (!removeSet.has(segment.segment_id)) continue;
    const startSec = clampToDuration(Number(segment.start_sec), args.durationSec);
    const endSec = clampToDuration(Number(segment.end_sec), args.durationSec);
    if (endSec - startSec <= MIN_CUT_SEC) continue;
    selections.push({ startSec, endSec });
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

