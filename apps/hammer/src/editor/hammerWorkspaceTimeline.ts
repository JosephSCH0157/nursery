import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

export type HammerWorkspaceToolId =
  | "polish"
  | "audio"
  | "video"
  | "captions"
  | "details"
  | "finishing"
  | "export";

export type HammerWorkspaceFocusMode = "balanced" | "source-focus" | "tool-focus" | "time-focus";
export type HammerWorkspaceFocusOverride = HammerWorkspaceFocusMode | "auto";
export type SegmentNavigationDirection = "previous" | "next";
export type BoundaryNavigationDirection = "previous" | "next";
export type JumpPointNavigationDirection = "previous" | "next";

export const SMALL_PLAYHEAD_NUDGE_SEC = 0.1;
export const LARGE_PLAYHEAD_NUDGE_SEC = 1;
export const DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC = 0.2;
export const MIN_SEGMENT_DURATION_SEC = 0.1;
export const SEGMENT_GAIN_MIN_DB = -24;
export const SEGMENT_GAIN_MAX_DB = 24;

export function resolveWorkspaceFocusMode(activeTool: HammerWorkspaceToolId): HammerWorkspaceFocusMode {
  switch (activeTool) {
    case "polish":
      return "source-focus";
    case "audio":
    case "video":
    case "captions":
    case "finishing":
    case "export":
      return "tool-focus";
    case "details":
    default:
      return "balanced";
  }
}

export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function resolvePlayheadSegment(
  segments: HammerTranscriptSegment[],
  playheadSec: number,
): HammerTranscriptSegment | null {
  return segments.find((segment) => playheadSec >= segment.start_sec && playheadSec < segment.end_sec) ?? null;
}

export function resolveFocusAfterPlayheadChange(
  focusOverride: HammerWorkspaceFocusOverride,
): HammerWorkspaceFocusMode | "auto" {
  return focusOverride === "auto" ? "time-focus" : focusOverride;
}

export function updateSegmentInTimeline(
  segments: HammerTranscriptSegment[],
  segmentId: string,
  updater: (segment: HammerTranscriptSegment) => HammerTranscriptSegment,
): HammerTranscriptSegment[] {
  return segments.map((segment) => (
    segment.segment_id === segmentId ? updater(segment) : segment
  ));
}

export function resolvePreviewLabel(
  playheadSegment: HammerTranscriptSegment | null,
  playheadSec: number,
): string {
  if (!playheadSegment) return `Timeline gap at ${playheadSec.toFixed(1)}s`;
  if (playheadSegment.is_disabled) {
    return `[Disabled] ${playheadSegment.speaker}: ${playheadSegment.text}`;
  }
  return `${playheadSegment.speaker}: ${playheadSegment.text}`;
}

export function moveSegmentTiming(
  segment: HammerTranscriptSegment,
  deltaSec: number,
): HammerTranscriptSegment {
  const nextStart = Math.max(0, roundToTenth(segment.start_sec + deltaSec));
  const duration = Math.max(0.1, roundToTenth(segment.end_sec - segment.start_sec));
  const nextEnd = roundToTenth(nextStart + duration);
  return {
    ...segment,
    start_sec: nextStart,
    end_sec: nextEnd,
  };
}

export function trimSegmentStartTiming(
  segment: HammerTranscriptSegment,
  deltaSec: number,
): HammerTranscriptSegment {
  const currentDuration = Math.max(0.1, roundToTenth(segment.end_sec - segment.start_sec));
  const nextStart = Math.max(0, roundToTenth(segment.start_sec + deltaSec));
  const maxStart = roundToTenth(segment.end_sec - 0.1);
  const clampedStart = Math.min(nextStart, maxStart);
  return {
    ...segment,
    start_sec: clampedStart,
    end_sec: roundToTenth(clampedStart + currentDuration),
  };
}

export function trimSegmentEndTiming(
  segment: HammerTranscriptSegment,
  deltaSec: number,
): HammerTranscriptSegment {
  const nextEnd = roundToTenth(segment.end_sec + deltaSec);
  const minEnd = roundToTenth(segment.start_sec + 0.1);
  return {
    ...segment,
    end_sec: Math.max(minEnd, nextEnd),
  };
}

function buildUniqueSegmentId(
  preferredId: string,
  usedIds: Set<string>,
): string {
  if (!usedIds.has(preferredId)) {
    usedIds.add(preferredId);
    return preferredId;
  }
  let suffix = 1;
  while (usedIds.has(`${preferredId}:${suffix}`)) {
    suffix += 1;
  }
  const next = `${preferredId}:${suffix}`;
  usedIds.add(next);
  return next;
}

export type SplitSegmentResult = {
  changed: boolean;
  segments: HammerTranscriptSegment[];
  splitSec: number | null;
  leftSegmentId: string | null;
  rightSegmentId: string | null;
};

export function splitSegmentAtTime(
  segments: HammerTranscriptSegment[],
  segmentId: string,
  splitTimeSec: number,
): SplitSegmentResult {
  const index = segments.findIndex((segment) => segment.segment_id === segmentId);
  if (index < 0) {
    return {
      changed: false,
      segments,
      splitSec: null,
      leftSegmentId: null,
      rightSegmentId: null,
    };
  }

  const source = segments[index];
  const minimumRightStart = roundToTenth(source.start_sec + MIN_SEGMENT_DURATION_SEC);
  const maximumLeftEnd = roundToTenth(source.end_sec - MIN_SEGMENT_DURATION_SEC);
  const splitSec = roundToTenth(Math.max(minimumRightStart, Math.min(maximumLeftEnd, splitTimeSec)));
  if (splitSec <= source.start_sec || splitSec >= source.end_sec) {
    return {
      changed: false,
      segments,
      splitSec: null,
      leftSegmentId: null,
      rightSegmentId: null,
    };
  }

  const usedIds = new Set<string>(segments.map((segment) => segment.segment_id));
  const leftSegmentId = buildUniqueSegmentId(`${source.segment_id}::split-a`, usedIds);
  const rightSegmentId = buildUniqueSegmentId(`${source.segment_id}::split-b`, usedIds);

  const left: HammerTranscriptSegment = {
    ...source,
    segment_id: leftSegmentId,
    start_sec: source.start_sec,
    end_sec: splitSec,
  };
  const right: HammerTranscriptSegment = {
    ...source,
    segment_id: rightSegmentId,
    start_sec: splitSec,
    end_sec: source.end_sec,
  };

  return {
    changed: true,
    segments: [...segments.slice(0, index), left, right, ...segments.slice(index + 1)],
    splitSec,
    leftSegmentId,
    rightSegmentId,
  };
}

export type DeleteSegmentRippleResult = {
  changed: boolean;
  segments: HammerTranscriptSegment[];
  removedSegment: HammerTranscriptSegment | null;
  removedIndex: number;
  shiftSec: number;
};

export type TranscriptSegmentRange = {
  segmentIds: string[];
  startSec: number | null;
  endSec: number | null;
  startIndex: number;
  endIndex: number;
};

export function deleteSegmentAndRipple(
  segments: HammerTranscriptSegment[],
  segmentId: string,
): DeleteSegmentRippleResult {
  const index = segments.findIndex((segment) => segment.segment_id === segmentId);
  if (index < 0) {
    return {
      changed: false,
      segments,
      removedSegment: null,
      removedIndex: -1,
      shiftSec: 0,
    };
  }

  const removedSegment = segments[index];
  const shiftSec = roundToTenth(Math.max(MIN_SEGMENT_DURATION_SEC, removedSegment.end_sec - removedSegment.start_sec));

  const remaining = segments
    .filter((segment) => segment.segment_id !== segmentId)
    .map((segment, remainingIndex) => {
      if (remainingIndex < index) return segment;
      const duration = roundToTenth(Math.max(MIN_SEGMENT_DURATION_SEC, segment.end_sec - segment.start_sec));
      const nextStart = roundToTenth(Math.max(0, segment.start_sec - shiftSec));
      return {
        ...segment,
        start_sec: nextStart,
        end_sec: roundToTenth(nextStart + duration),
      };
    });

  return {
    changed: true,
    segments: remaining,
    removedSegment,
    removedIndex: index,
    shiftSec,
  };
}

export function resolvePlayheadAfterDelete(
  playheadSec: number,
  removedSegment: HammerTranscriptSegment,
  shiftSec: number,
): number {
  if (playheadSec < removedSegment.start_sec) return playheadSec;
  if (playheadSec <= removedSegment.end_sec) return roundToTenth(removedSegment.start_sec);
  return roundToTenth(Math.max(0, playheadSec - shiftSec));
}

export function resolveTranscriptSegmentRange(args: {
  segments: HammerTranscriptSegment[];
  anchorSegmentId: string | null;
  focusSegmentId: string | null;
}): TranscriptSegmentRange {
  const anchorIndex = args.anchorSegmentId
    ? args.segments.findIndex((segment) => segment.segment_id === args.anchorSegmentId)
    : -1;
  const focusIndex = args.focusSegmentId
    ? args.segments.findIndex((segment) => segment.segment_id === args.focusSegmentId)
    : -1;
  if (anchorIndex < 0 || focusIndex < 0) {
    return {
      segmentIds: [],
      startSec: null,
      endSec: null,
      startIndex: -1,
      endIndex: -1,
    };
  }

  const startIndex = Math.min(anchorIndex, focusIndex);
  const endIndex = Math.max(anchorIndex, focusIndex);
  const span = args.segments.slice(startIndex, endIndex + 1);
  return {
    segmentIds: span.map((segment) => segment.segment_id),
    startSec: span[0]?.start_sec ?? null,
    endSec: span[span.length - 1]?.end_sec ?? null,
    startIndex,
    endIndex,
  };
}

export type CutSegmentRangeResult = {
  changed: boolean;
  segments: HammerTranscriptSegment[];
  removedSegmentIds: string[];
  removedStartSec: number | null;
  removedEndSec: number | null;
  shiftSec: number;
  removedStartIndex: number;
};

export type RippleDeletePlacementRemapKind =
  | "unchanged"
  | "shifted"
  | "trimmed"
  | "bridged"
  | "removed";

export interface RippleDeletePlacementRemapResult {
  kind: RippleDeletePlacementRemapKind;
  startSec: number;
  endSec: number;
  shiftedBySec: number;
  needsAttention: boolean;
}

export function remapPlacementForRippleDelete(args: {
  startSec: number;
  endSec: number;
  removedStartSec: number;
  removedEndSec: number;
}): RippleDeletePlacementRemapResult {
  const removedStartSec = roundToTenth(Math.max(0, args.removedStartSec));
  const removedEndSec = roundToTenth(Math.max(removedStartSec, args.removedEndSec));
  const shiftSec = roundToTenth(Math.max(0, removedEndSec - removedStartSec));
  const startSec = roundToTenth(Math.max(0, args.startSec));
  const endSec = roundToTenth(Math.max(startSec, args.endSec));
  if (shiftSec <= 0) {
    return {
      kind: "unchanged",
      startSec,
      endSec,
      shiftedBySec: 0,
      needsAttention: false,
    };
  }

  // Entire placement is before the removed range.
  if (endSec <= removedStartSec) {
    return {
      kind: "unchanged",
      startSec,
      endSec,
      shiftedBySec: 0,
      needsAttention: false,
    };
  }

  // Entire placement is after the removed range, so it ripples earlier.
  if (startSec >= removedEndSec) {
    return {
      kind: "shifted",
      startSec: roundToTenth(Math.max(0, startSec - shiftSec)),
      endSec: roundToTenth(Math.max(0, endSec - shiftSec)),
      shiftedBySec: shiftSec,
      needsAttention: false,
    };
  }

  const mapTime = (timeSec: number): number => {
    if (timeSec <= removedStartSec) return roundToTenth(timeSec);
    if (timeSec >= removedEndSec) return roundToTenth(Math.max(0, timeSec - shiftSec));
    return removedStartSec;
  };
  const mappedStart = mapTime(startSec);
  const mappedEnd = mapTime(endSec);
  if (mappedEnd <= mappedStart) {
    return {
      kind: "removed",
      startSec: mappedStart,
      endSec: mappedEnd,
      shiftedBySec: shiftSec,
      needsAttention: false,
    };
  }

  const spansAcrossDelete = startSec < removedStartSec && endSec > removedEndSec;
  return {
    kind: spansAcrossDelete ? "bridged" : "trimmed",
    startSec: mappedStart,
    endSec: mappedEnd,
    shiftedBySec: shiftSec,
    needsAttention: spansAcrossDelete,
  };
}

export function cutSegmentRangeAndRipple(args: {
  segments: HammerTranscriptSegment[];
  segmentIds: string[];
}): CutSegmentRangeResult {
  if (args.segmentIds.length === 0) {
    return {
      changed: false,
      segments: args.segments,
      removedSegmentIds: [],
      removedStartSec: null,
      removedEndSec: null,
      shiftSec: 0,
      removedStartIndex: -1,
    };
  }

  const idSet = new Set(args.segmentIds);
  const firstIndex = args.segments.findIndex((segment) => idSet.has(segment.segment_id));
  if (firstIndex < 0) {
    return {
      changed: false,
      segments: args.segments,
      removedSegmentIds: [],
      removedStartSec: null,
      removedEndSec: null,
      shiftSec: 0,
      removedStartIndex: -1,
    };
  }

  const selectedIndices = args.segments
    .map((segment, index) => (idSet.has(segment.segment_id) ? index : -1))
    .filter((index) => index >= 0);
  const lastIndex = selectedIndices[selectedIndices.length - 1] ?? firstIndex;
  const selectedSegments = args.segments.slice(firstIndex, lastIndex + 1);
  if (selectedSegments.length === 0) {
    return {
      changed: false,
      segments: args.segments,
      removedSegmentIds: [],
      removedStartSec: null,
      removedEndSec: null,
      shiftSec: 0,
      removedStartIndex: -1,
    };
  }

  const removedStartSec = selectedSegments[0]?.start_sec ?? 0;
  const removedEndSec = selectedSegments[selectedSegments.length - 1]?.end_sec ?? removedStartSec;
  const shiftSec = roundToTenth(Math.max(0, removedEndSec - removedStartSec));

  const prefix = args.segments.slice(0, firstIndex);
  const suffix = args.segments.slice(lastIndex + 1).map((segment) => {
    const duration = roundToTenth(Math.max(MIN_SEGMENT_DURATION_SEC, segment.end_sec - segment.start_sec));
    const nextStart = roundToTenth(Math.max(0, segment.start_sec - shiftSec));
    return {
      ...segment,
      start_sec: nextStart,
      end_sec: roundToTenth(nextStart + duration),
    };
  });

  return {
    changed: true,
    segments: [...prefix, ...suffix],
    removedSegmentIds: selectedSegments.map((segment) => segment.segment_id),
    removedStartSec,
    removedEndSec,
    shiftSec,
    removedStartIndex: firstIndex,
  };
}

export function resolvePlayheadAfterRangeCut(args: {
  playheadSec: number;
  removedStartSec: number;
  removedEndSec: number;
  shiftSec: number;
}): number {
  if (args.playheadSec < args.removedStartSec) return roundToTenth(args.playheadSec);
  if (args.playheadSec <= args.removedEndSec) return roundToTenth(args.removedStartSec);
  return roundToTenth(Math.max(0, args.playheadSec - args.shiftSec));
}

export function resolveTimelineBoundaryTimes(segments: HammerTranscriptSegment[]): number[] {
  return [...new Set(
    segments.flatMap((segment) => [roundToTenth(segment.start_sec), roundToTenth(segment.end_sec)]),
  )].sort((a, b) => a - b);
}

export function resolveAdjacentJumpPointTime(args: {
  jumpPointsSec: number[];
  playheadSec: number;
  direction: JumpPointNavigationDirection;
  epsilonSec?: number;
}): number {
  const points = [...new Set(args.jumpPointsSec.map((timeSec) => roundToTenth(timeSec)))]
    .sort((left, right) => left - right);
  if (points.length === 0) return roundToTenth(args.playheadSec);

  const epsilonSec = args.epsilonSec ?? 0.0001;
  if (args.direction === "previous") {
    for (let index = points.length - 1; index >= 0; index -= 1) {
      const point = points[index] ?? 0;
      if (point < args.playheadSec - epsilonSec) {
        return roundToTenth(point);
      }
    }
    return points[0] ?? 0;
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] ?? 0;
    if (point > args.playheadSec + epsilonSec) {
      return roundToTenth(point);
    }
  }
  return points[points.length - 1] ?? roundToTenth(args.playheadSec);
}

export function resolveAdjacentBoundaryTime(args: {
  boundaryTimesSec: number[];
  playheadSec: number;
  direction: BoundaryNavigationDirection;
  epsilonSec?: number;
}): number {
  return resolveAdjacentJumpPointTime({
    jumpPointsSec: args.boundaryTimesSec,
    playheadSec: args.playheadSec,
    direction: args.direction,
    epsilonSec: args.epsilonSec,
  });
}

export function snapPlayheadToBoundary(args: {
  nextPlayheadSec: number;
  boundaryTimesSec: number[];
  toleranceSec?: number;
}): number {
  const toleranceSec = args.toleranceSec ?? DEFAULT_PLAYHEAD_SNAP_TOLERANCE_SEC;
  let nearestBoundary: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const boundary of args.boundaryTimesSec) {
    const distance = Math.abs(boundary - args.nextPlayheadSec);
    if (distance < nearestDistance) {
      nearestBoundary = boundary;
      nearestDistance = distance;
    }
  }

  if (nearestBoundary != null && nearestDistance <= toleranceSec) {
    return roundToTenth(nearestBoundary);
  }
  return roundToTenth(args.nextPlayheadSec);
}

export function resolveSelectedSegmentAfterDelete(args: {
  segmentsAfterDelete: HammerTranscriptSegment[];
  removedIndex: number;
}): string | null {
  if (args.segmentsAfterDelete.length === 0) return null;
  const index = Math.min(args.removedIndex, args.segmentsAfterDelete.length - 1);
  return args.segmentsAfterDelete[index]?.segment_id ?? null;
}

export function resolveAdjacentSegmentSelection(
  segments: HammerTranscriptSegment[],
  currentSegmentId: string | null,
  direction: SegmentNavigationDirection,
): string | null {
  if (segments.length === 0) return null;
  if (!currentSegmentId) return segments[0]?.segment_id ?? null;
  const currentIndex = segments.findIndex((segment) => segment.segment_id === currentSegmentId);
  if (currentIndex < 0) return segments[0]?.segment_id ?? null;

  if (direction === "previous") {
    return segments[Math.max(0, currentIndex - 1)]?.segment_id ?? currentSegmentId;
  }
  return segments[Math.min(segments.length - 1, currentIndex + 1)]?.segment_id ?? currentSegmentId;
}

export function toggleSegmentDisabled(segment: HammerTranscriptSegment): HammerTranscriptSegment {
  return {
    ...segment,
    is_disabled: !segment.is_disabled,
  };
}

export function updateSegmentGain(
  segment: HammerTranscriptSegment,
  deltaDb: number,
): HammerTranscriptSegment {
  const currentGainDb = segment.gain_db ?? 0;
  const nextGainDb = Math.max(
    SEGMENT_GAIN_MIN_DB,
    Math.min(SEGMENT_GAIN_MAX_DB, roundToTenth(currentGainDb + deltaDb)),
  );
  return {
    ...segment,
    gain_db: nextGainDb,
  };
}

export function resolveEffectivePlaybackTime(
  segments: HammerTranscriptSegment[],
  playheadSec: number,
): number {
  const segment = resolvePlayheadSegment(segments, playheadSec);
  if (!segment || !segment.is_disabled) return roundToTenth(playheadSec);
  return roundToTenth(segment.end_sec);
}
