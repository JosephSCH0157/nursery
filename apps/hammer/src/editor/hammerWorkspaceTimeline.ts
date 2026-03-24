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
  const minimumRightStart = roundToTenth(source.start_sec + 0.1);
  const maximumLeftEnd = roundToTenth(source.end_sec - 0.1);
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
  const shiftSec = roundToTenth(Math.max(0.1, removedSegment.end_sec - removedSegment.start_sec));

  const remaining = segments
    .filter((segment) => segment.segment_id !== segmentId)
    .map((segment, remainingIndex) => {
      if (remainingIndex < index) return segment;
      const duration = roundToTenth(Math.max(0.1, segment.end_sec - segment.start_sec));
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
