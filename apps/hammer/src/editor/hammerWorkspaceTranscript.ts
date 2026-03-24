import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

export function resolveSelectedSegmentId(
  segments: HammerTranscriptSegment[],
  currentSelectedSegmentId: string | null,
): string | null {
  if (!segments.length) return null;
  if (currentSelectedSegmentId && segments.some((segment) => segment.segment_id === currentSelectedSegmentId)) {
    return currentSelectedSegmentId;
  }
  return segments[0]?.segment_id ?? null;
}

export function syncEditableTranscriptSegments(
  nextSegments: HammerTranscriptSegment[],
  currentSelectedSegmentId: string | null,
): { segments: HammerTranscriptSegment[]; selectedSegmentId: string | null } {
  return {
    segments: nextSegments,
    selectedSegmentId: resolveSelectedSegmentId(nextSegments, currentSelectedSegmentId),
  };
}

export function updateTranscriptSegmentText(
  segments: HammerTranscriptSegment[],
  segmentId: string,
  text: string,
): HammerTranscriptSegment[] {
  return segments.map((segment) => (
    segment.segment_id === segmentId ? { ...segment, text } : segment
  ));
}

export function updateTranscriptSegmentSpeaker(
  segments: HammerTranscriptSegment[],
  segmentId: string,
  speaker: string,
): HammerTranscriptSegment[] {
  return segments.map((segment) => (
    segment.segment_id === segmentId ? { ...segment, speaker } : segment
  ));
}

export function resolveTranscriptDurationSec(
  segments: HammerTranscriptSegment[],
  minimumDurationSec = 32,
): number {
  const maxEndSec = segments.reduce((currentMax, segment) => Math.max(currentMax, segment.end_sec), 0);
  return Math.max(maxEndSec, minimumDurationSec);
}
