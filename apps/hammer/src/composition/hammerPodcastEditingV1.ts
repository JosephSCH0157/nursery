import type { HammerCompositionCommand, HammerCompositionV2 } from "./hammerCompositionV2";

export type HammerFrameRate = Readonly<{ numerator: number; denominator: number }>;
export type HammerTimelineSelectionV1 = Readonly<{ start_frame: number; end_frame: number; selected_clip_ids: readonly string[]; selected_transcript_segment_ids: readonly string[] }>;
export type HammerTranscriptNavigationSegment = Readonly<{ segment_id: string; speaker: string; text: string; start_sec: number; end_sec: number }>;

function assertFrameRate(rate: HammerFrameRate): void {
  if (!Number.isInteger(rate.numerator) || !Number.isInteger(rate.denominator) || rate.numerator <= 0 || rate.denominator <= 0) throw new Error("frame_rate_invalid");
}

export function hammerFrameToSec(frame: number, rate: HammerFrameRate): number {
  assertFrameRate(rate);
  if (!Number.isInteger(frame) || frame < 0) throw new Error("frame_invalid");
  return frame * rate.denominator / rate.numerator;
}

export function hammerSecToFrame(sec: number, rate: HammerFrameRate): number {
  assertFrameRate(rate);
  if (!Number.isFinite(sec) || sec < 0) throw new Error("time_invalid");
  return Math.round(sec * rate.numerator / rate.denominator);
}

export function snapHammerPlayheadFrame(args: { frame: number; candidateFrames: readonly number[]; toleranceFrames: number }): number {
  if (!Number.isInteger(args.frame) || !Number.isInteger(args.toleranceFrames) || args.toleranceFrames < 0) throw new Error("snap_input_invalid");
  return args.candidateFrames.filter(Number.isInteger).reduce((best, candidate) => {
    const candidateDistance = Math.abs(candidate - args.frame);
    const bestDistance = Math.abs(best - args.frame);
    return candidateDistance <= args.toleranceFrames && (best === args.frame || candidateDistance < bestDistance || (candidateDistance === bestDistance && candidate < best)) ? candidate : best;
  }, args.frame);
}

export function buildHammerSplitCommand(args: { clipId: string; frame: number; frameRate: HammerFrameRate }): HammerCompositionCommand {
  return Object.freeze({ type: "split_clip", clip_id: args.clipId, at_sec: hammerFrameToSec(args.frame, args.frameRate) });
}

export function buildHammerTrimCommand(args: { clipId: string; startFrame: number; endFrame: number; frameRate: HammerFrameRate }): HammerCompositionCommand {
  return Object.freeze({ type: "trim_clip", clip_id: args.clipId, start_sec: hammerFrameToSec(args.startFrame, args.frameRate), end_sec: hammerFrameToSec(args.endFrame, args.frameRate) });
}

export function buildHammerRangeDeleteCommand(args: { startFrame: number; endFrame: number; frameRate: HammerFrameRate; mode: "lift" | "ripple" }): HammerCompositionCommand {
  return Object.freeze({ type: "delete_media_range", start_sec: hammerFrameToSec(args.startFrame, args.frameRate), end_sec: hammerFrameToSec(args.endFrame, args.frameRate), ripple: args.mode === "ripple" });
}

export function buildHammerTranscriptMediaDeleteCommand(args: { startFrame: number; endFrame: number; frameRate: HammerFrameRate; ripple: boolean }): HammerCompositionCommand {
  return Object.freeze({ type: "delete_transcript_range", start_sec: hammerFrameToSec(args.startFrame, args.frameRate), end_sec: hammerFrameToSec(args.endFrame, args.frameRate), ripple: args.ripple });
}

export function buildHammerTranscriptCorrectionCommand(segmentId: string, correctedText: string): HammerCompositionCommand {
  if (!segmentId.trim() || !correctedText.trim()) throw new Error("transcript_correction_invalid");
  return Object.freeze({ type: "correct_transcript", segment_id: segmentId, corrected_text: correctedText });
}

export function buildHammerCaptionCorrectionCommand(clipId: string, correctedText: string): HammerCompositionCommand {
  if (!clipId.trim() || !correctedText.trim()) throw new Error("caption_correction_invalid");
  return Object.freeze({ type: "correct_caption", clip_id: clipId, corrected_text: correctedText });
}

export function searchHammerTranscript(segments: readonly HammerTranscriptNavigationSegment[], query: string): readonly HammerTranscriptNavigationSegment[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return segments.filter((segment) => segment.text.toLocaleLowerCase().includes(normalized) || segment.speaker.toLocaleLowerCase().includes(normalized));
}

export function navigateHammerSpeaker(args: { segments: readonly HammerTranscriptNavigationSegment[]; speaker: string; fromSec: number; direction: "previous" | "next" }): HammerTranscriptNavigationSegment | null {
  const matches = args.segments.filter((segment) => segment.speaker === args.speaker).sort((a, b) => a.start_sec - b.start_sec);
  return args.direction === "next"
    ? matches.find((segment) => segment.start_sec > args.fromSec) ?? null
    : [...matches].reverse().find((segment) => segment.end_sec < args.fromSec) ?? null;
}

export function selectHammerTranscriptRange(args: { segments: readonly HammerTranscriptNavigationSegment[]; segmentIds: readonly string[]; composition: HammerCompositionV2; frameRate: HammerFrameRate }): HammerTimelineSelectionV1 {
  const selected = args.segments.filter((segment) => args.segmentIds.includes(segment.segment_id));
  if (selected.length === 0) throw new Error("transcript_selection_empty");
  const start = Math.min(...selected.map((segment) => segment.start_sec));
  const end = Math.max(...selected.map((segment) => segment.end_sec));
  const clipIds = args.composition.tracks.flatMap((track) => track.clips).filter((clip) => clip.timeline_start_sec < end && clip.timeline_end_sec > start).map((clip) => clip.clip_id);
  return Object.freeze({ start_frame: hammerSecToFrame(start, args.frameRate), end_frame: hammerSecToFrame(end, args.frameRate), selected_clip_ids: clipIds, selected_transcript_segment_ids: selected.map((segment) => segment.segment_id) });
}

export function selectHammerTimelineRange(args: { composition: HammerCompositionV2; startFrame: number; endFrame: number; frameRate: HammerFrameRate; segments: readonly HammerTranscriptNavigationSegment[] }): HammerTimelineSelectionV1 {
  const start = hammerFrameToSec(args.startFrame, args.frameRate);
  const end = hammerFrameToSec(args.endFrame, args.frameRate);
  const clips = args.composition.tracks.flatMap((track) => track.clips).filter((clip) => clip.timeline_start_sec < end && clip.timeline_end_sec > start).map((clip) => clip.clip_id);
  const segments = args.segments.filter((segment) => segment.start_sec < end && segment.end_sec > start).map((segment) => segment.segment_id);
  return Object.freeze({ start_frame: args.startFrame, end_frame: args.endFrame, selected_clip_ids: clips, selected_transcript_segment_ids: segments });
}
