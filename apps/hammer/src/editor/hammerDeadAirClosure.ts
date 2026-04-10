import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

export type HammerDeadAirGapRecord = {
  currentSegmentId: string;
  nextSegmentId: string;
  currentEndSec: number;
  nextStartSec: number;
  gapSec: number;
  removableSec: number;
};

export type HammerDeadAirAnalysis = {
  thresholdSec: number;
  gaps: HammerDeadAirGapRecord[];
  eligibleGapCount: number;
  totalRemovableSec: number;
};

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function isEligibleSpokenSegment(segment: HammerTranscriptSegment): boolean {
  if (segment.is_disabled === true) return false;
  const startSec = Number(segment.start_sec);
  const endSec = Number(segment.end_sec);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return false;
  if (endSec < startSec) return false;
  return true;
}

export function analyzeDeadAirGaps(
  segments: HammerTranscriptSegment[],
  thresholdSec: number,
): HammerDeadAirAnalysis {
  const threshold = roundToTenth(Math.max(0, Number(thresholdSec)));
  const ordered = segments
    .slice()
    .sort((a, b) => a.start_sec - b.start_sec);

  const gaps: HammerDeadAirGapRecord[] = [];

  let previousEligible: HammerTranscriptSegment | null = null;
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    if (!isEligibleSpokenSegment(current)) {
      previousEligible = null;
      continue;
    }

    if (!previousEligible) {
      previousEligible = current;
      continue;
    }

    const gapSec = roundToTenth(Number(current.start_sec) - Number(previousEligible.end_sec));
    if (Number.isFinite(gapSec) && gapSec > threshold && gapSec > 0) {
      const removableSec = roundToTenth(gapSec - threshold);
      if (removableSec > 0) {
        gaps.push({
          currentSegmentId: previousEligible.segment_id,
          nextSegmentId: current.segment_id,
          currentEndSec: Number(previousEligible.end_sec),
          nextStartSec: Number(current.start_sec),
          gapSec,
          removableSec,
        });
      }
    }

    previousEligible = current;
  }

  return {
    thresholdSec: threshold,
    gaps,
    eligibleGapCount: gaps.length,
    totalRemovableSec: roundToTenth(gaps.reduce((sum, item) => sum + item.removableSec, 0)),
  };
}

export function applyDeadAirClosure(args: {
  segments: HammerTranscriptSegment[];
  thresholdSec: number;
}): { segments: HammerTranscriptSegment[]; analysis: HammerDeadAirAnalysis } {
  const analysis = analyzeDeadAirGaps(args.segments, args.thresholdSec);
  if (analysis.gaps.length === 0) {
    return { segments: args.segments.slice(), analysis };
  }

  const ordered = args.segments.slice().sort((a, b) => a.start_sec - b.start_sec);
  const removableByNextId = new Map<string, number>();
  for (const gap of analysis.gaps) {
    removableByNextId.set(gap.nextSegmentId, gap.removableSec);
  }

  let cumulativeShiftSec = 0;
  const updatedById = new Map<string, HammerTranscriptSegment>();
  for (let index = 0; index < ordered.length; index += 1) {
    const segment = ordered[index];
    const clone: HammerTranscriptSegment = { ...segment };
    const shiftNow = removableByNextId.get(segment.segment_id) ?? 0;
    cumulativeShiftSec = roundToTenth(cumulativeShiftSec + shiftNow);

    const startSec = Number(clone.start_sec);
    const endSec = Number(clone.end_sec);
    const canShift = Number.isFinite(startSec) && Number.isFinite(endSec) && endSec >= startSec;
    if (canShift && cumulativeShiftSec > 0) {
      clone.start_sec = roundToTenth(Math.max(0, startSec - cumulativeShiftSec));
      clone.end_sec = roundToTenth(Math.max(clone.start_sec, endSec - cumulativeShiftSec));
    }

    updatedById.set(clone.segment_id, clone);
  }

  return {
    segments: args.segments.map((segment) => updatedById.get(segment.segment_id) ?? segment),
    analysis,
  };
}
