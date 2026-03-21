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
