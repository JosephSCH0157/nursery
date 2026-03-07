import type {
  HammerDeleteInstruction,
  HammerEditInstruction,
  HammerMergeInstruction,
  HammerMuteInstruction,
  HammerSplitInstruction,
  HammerTrimInstruction,
} from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

export type InstructionIndex = {
  deleteBySegmentId: Map<string, HammerDeleteInstruction>;
  muteBySegmentId: Map<string, HammerMuteInstruction>;
  trimBySegmentId: Map<string, HammerTrimInstruction>;
  splitBySegmentId: Map<string, HammerSplitInstruction>;
  mergeBySegmentId: Map<string, HammerMergeInstruction>;
};

export type TranscriptOverlayBlock = {
  block_id: string;
  start_sec: number;
  end_sec: number;
  label: string | null;
  text: string;
  source_segment_ids: string[];
};

export type TranscriptOverlayRow = {
  row_id: string;
  anchor_segment_id: string;
  next_segment_id: string | null;
  source_segment_ids: string[];
  speaker: string;
  start_sec: number;
  end_sec: number;
  structure: "base" | "split" | "merge";
  blocks: TranscriptOverlayBlock[];
  timing_blocks: TranscriptOverlayBlock[];
  split_instruction: HammerSplitInstruction | null;
  merge_instruction: HammerMergeInstruction | null;
  is_deleted: boolean;
  is_muted: boolean;
  is_trimmed: boolean;
};

export type TranscriptPlayableSlice = {
  start_sec: number;
  end_sec: number;
};

export type TranscriptPlaybackRange = {
  row_id: string;
  anchor_segment_id: string;
  start_sec: number;
  end_sec: number;
  playable_start_sec: number | null;
  playable_end_sec: number | null;
  playable_slices: TranscriptPlayableSlice[];
  is_deleted: boolean;
  is_muted: boolean;
  source_segment_ids: string[];
};

export type PreviewSkipReason = "deleted" | "trim-start" | "trim-end";

export type PreviewBoundaryAction =
  | { kind: "none" }
  | {
    kind: "seek";
    time_sec: number;
    reason: PreviewSkipReason;
    to_row_id: string | null;
  }
  | {
    kind: "pause";
    time_sec: number;
    reason: PreviewSkipReason;
    to_row_id: null;
  };

export const MIN_SEGMENT_DURATION_SEC = 0.2;
export const MIN_SPLIT_EDGE_SEC = 0.05;
export const MIN_TRIMMED_DURATION_SEC = 0.15;
export const PREVIEW_EPSILON_SEC = 0.05;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getSegmentMidpointSec(segment: HammerTranscriptSegment): number {
  return segment.start_sec + ((segment.end_sec - segment.start_sec) / 2);
}

function normalizeSplitAtSec(segment: HammerTranscriptSegment, proposedSec: number): number {
  const duration = Math.max(segment.end_sec - segment.start_sec, MIN_SEGMENT_DURATION_SEC);
  if (duration <= MIN_SPLIT_EDGE_SEC * 2) {
    return segment.start_sec + (duration / 2);
  }
  return clamp(
    proposedSec,
    segment.start_sec + MIN_SPLIT_EDGE_SEC,
    segment.end_sec - MIN_SPLIT_EDGE_SEC,
  );
}

function splitTextForDisplay(text: string, ratio: number): [string, string] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text, text];

  const splitIndex = clamp(
    Math.round(words.length * clamp(ratio, 0.1, 0.9)),
    1,
    words.length - 1,
  );
  return [
    words.slice(0, splitIndex).join(" "),
    words.slice(splitIndex).join(" "),
  ];
}

function createBaseBlock(segment: HammerTranscriptSegment): TranscriptOverlayBlock {
  return {
    block_id: segment.segment_id,
    start_sec: segment.start_sec,
    end_sec: segment.end_sec,
    label: null,
    text: segment.text,
    source_segment_ids: [segment.segment_id],
  };
}

function createSplitBlocks(
  segment: HammerTranscriptSegment,
  instruction: HammerSplitInstruction,
): TranscriptOverlayBlock[] {
  const splitAtSec = normalizeSplitAtSec(segment, instruction.split_at_sec);
  const ratio = clamp(
    (splitAtSec - segment.start_sec) / Math.max(segment.end_sec - segment.start_sec, MIN_SEGMENT_DURATION_SEC),
    0.1,
    0.9,
  );
  const [firstText, secondText] = splitTextForDisplay(segment.text, ratio);

  return [
    {
      block_id: `${segment.segment_id}::split-a`,
      start_sec: segment.start_sec,
      end_sec: splitAtSec,
      label: "Split A",
      text: firstText,
      source_segment_ids: [segment.segment_id],
    },
    {
      block_id: `${segment.segment_id}::split-b`,
      start_sec: splitAtSec,
      end_sec: segment.end_sec,
      label: "Split B",
      text: secondText,
      source_segment_ids: [segment.segment_id],
    },
  ];
}

function createMergedBlock(blocks: TranscriptOverlayBlock[]): TranscriptOverlayBlock {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  return {
    block_id: `${first.block_id}::merge`,
    start_sec: first.start_sec,
    end_sec: last.end_sec,
    label: "Merged",
    text: blocks.map((block) => block.text).join(" ").replace(/\s+/g, " ").trim(),
    source_segment_ids: uniqueIds(blocks.flatMap((block) => block.source_segment_ids)),
  };
}

function resolveTrimBounds(
  segment: HammerTranscriptSegment,
  trimInstruction: HammerTrimInstruction | null,
): TranscriptPlayableSlice | null {
  const rawStart = trimInstruction?.trim_start_sec ?? segment.start_sec;
  const rawEnd = trimInstruction?.trim_end_sec ?? segment.end_sec;
  const trimStartSec = clamp(rawStart, segment.start_sec, segment.end_sec);
  const trimEndSec = clamp(rawEnd, segment.start_sec, segment.end_sec);
  if ((trimEndSec - trimStartSec) < MIN_TRIMMED_DURATION_SEC) {
    return null;
  }
  return {
    start_sec: trimStartSec,
    end_sec: trimEndSec,
  };
}

function buildOverlayFlags(
  sourceSegmentIds: string[],
  instructionIndex: InstructionIndex,
): Pick<TranscriptOverlayRow, "is_deleted" | "is_muted" | "is_trimmed"> {
  return {
    is_deleted: sourceSegmentIds.length > 0
      && sourceSegmentIds.every((segmentId) => instructionIndex.deleteBySegmentId.has(segmentId)),
    is_muted: sourceSegmentIds.some((segmentId) => instructionIndex.muteBySegmentId.has(segmentId)),
    is_trimmed: sourceSegmentIds.some((segmentId) => instructionIndex.trimBySegmentId.has(segmentId)),
  };
}

export function buildInstructionIndex(instructions: HammerEditInstruction[]): InstructionIndex {
  const index: InstructionIndex = {
    deleteBySegmentId: new Map<string, HammerDeleteInstruction>(),
    muteBySegmentId: new Map<string, HammerMuteInstruction>(),
    trimBySegmentId: new Map<string, HammerTrimInstruction>(),
    splitBySegmentId: new Map<string, HammerSplitInstruction>(),
    mergeBySegmentId: new Map<string, HammerMergeInstruction>(),
  };

  for (const instruction of instructions) {
    switch (instruction.type) {
      case "delete":
        index.deleteBySegmentId.set(instruction.segment_id, instruction);
        break;
      case "mute":
        index.muteBySegmentId.set(instruction.segment_id, instruction);
        break;
      case "trim":
        index.trimBySegmentId.set(instruction.segment_id, instruction);
        break;
      case "split":
        index.splitBySegmentId.set(instruction.segment_id, instruction);
        break;
      case "merge":
        index.mergeBySegmentId.set(instruction.segment_id, instruction);
        break;
    }
  }

  return index;
}

export function resolveSplitAtSec(segment: HammerTranscriptSegment, currentSec: number): number {
  const useCurrentSec = currentSec > segment.start_sec && currentSec < segment.end_sec;
  const sourceSec = useCurrentSec ? currentSec : getSegmentMidpointSec(segment);
  return normalizeSplitAtSec(segment, sourceSec);
}

export function buildDefaultTrimInstruction(
  segment: HammerTranscriptSegment,
): Pick<HammerTrimInstruction, "trim_start_sec" | "trim_end_sec"> {
  const duration = Math.max(segment.end_sec - segment.start_sec, MIN_SEGMENT_DURATION_SEC);
  const maxInset = Math.max((duration / 2) - (MIN_TRIMMED_DURATION_SEC / 2), 0);
  const inset = maxInset > 0
    ? Math.min(Math.max(duration * 0.18, 0.05), maxInset)
    : 0;
  return {
    trim_start_sec: Number((segment.start_sec + inset).toFixed(3)),
    trim_end_sec: Number((segment.end_sec - inset).toFixed(3)),
  };
}

export function buildTranscriptOverlayRows(
  segments: HammerTranscriptSegment[],
  instructionIndex: InstructionIndex,
): TranscriptOverlayRow[] {
  const rows: TranscriptOverlayRow[] = [];
  const hiddenByMerge = new Set<string>();

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (hiddenByMerge.has(segment.segment_id)) continue;

    const nextSegment = segments[index + 1] ?? null;
    const splitInstruction = instructionIndex.splitBySegmentId.get(segment.segment_id) ?? null;
    const mergeInstruction = instructionIndex.mergeBySegmentId.get(segment.segment_id) ?? null;
    const segmentBlocks = splitInstruction
      ? createSplitBlocks(segment, splitInstruction)
      : [createBaseBlock(segment)];

    const canApplyMerge = Boolean(
      mergeInstruction
      && nextSegment
      && mergeInstruction.merge_with_segment_id === nextSegment.segment_id
      && nextSegment.speaker === segment.speaker,
    );

    if (canApplyMerge && nextSegment) {
      const nextSplitInstruction = instructionIndex.splitBySegmentId.get(nextSegment.segment_id) ?? null;
      const nextBlocks = nextSplitInstruction
        ? createSplitBlocks(nextSegment, nextSplitInstruction)
        : [createBaseBlock(nextSegment)];
      const mergedBlock = createMergedBlock([...segmentBlocks, ...nextBlocks]);
      const sourceSegmentIds = mergedBlock.source_segment_ids;

      rows.push({
        row_id: `${segment.segment_id}::merge`,
        anchor_segment_id: segment.segment_id,
        next_segment_id: nextSegment.segment_id,
        source_segment_ids: sourceSegmentIds,
        speaker: segment.speaker,
        start_sec: mergedBlock.start_sec,
        end_sec: mergedBlock.end_sec,
        structure: "merge",
        blocks: [mergedBlock],
        timing_blocks: [...segmentBlocks, ...nextBlocks],
        split_instruction: splitInstruction,
        merge_instruction: mergeInstruction,
        ...buildOverlayFlags(sourceSegmentIds, instructionIndex),
      });
      hiddenByMerge.add(nextSegment.segment_id);
      continue;
    }

    if (splitInstruction) {
      for (const block of segmentBlocks) {
        rows.push({
          row_id: block.block_id,
          anchor_segment_id: segment.segment_id,
          next_segment_id: nextSegment?.segment_id ?? null,
          source_segment_ids: [segment.segment_id],
          speaker: segment.speaker,
          start_sec: block.start_sec,
          end_sec: block.end_sec,
          structure: "split",
          blocks: [block],
          timing_blocks: [block],
          split_instruction: splitInstruction,
          merge_instruction: mergeInstruction,
          ...buildOverlayFlags([segment.segment_id], instructionIndex),
        });
      }
      continue;
    }

    rows.push({
      row_id: segment.segment_id,
      anchor_segment_id: segment.segment_id,
      next_segment_id: nextSegment?.segment_id ?? null,
      source_segment_ids: [segment.segment_id],
      speaker: segment.speaker,
      start_sec: segmentBlocks[0].start_sec,
      end_sec: segmentBlocks[0].end_sec,
      structure: "base",
      blocks: [segmentBlocks[0]],
      timing_blocks: [segmentBlocks[0]],
      split_instruction: splitInstruction,
      merge_instruction: mergeInstruction,
      ...buildOverlayFlags([segment.segment_id], instructionIndex),
    });
  }

  return rows;
}

export function buildPlaybackRanges(
  overlayRows: TranscriptOverlayRow[],
  segmentById: Map<string, HammerTranscriptSegment>,
  instructionIndex: InstructionIndex,
): TranscriptPlaybackRange[] {
  return overlayRows.map((row) => {
    const playableSlices = row.timing_blocks
      .map((block) => {
        const sourceSegmentId = block.source_segment_ids[0] ?? row.anchor_segment_id;
        const sourceSegment = segmentById.get(sourceSegmentId);
        if (!sourceSegment) return null;
        if (instructionIndex.deleteBySegmentId.has(sourceSegmentId)) return null;

        const trimBounds = resolveTrimBounds(
          sourceSegment,
          instructionIndex.trimBySegmentId.get(sourceSegmentId) ?? null,
        );
        if (!trimBounds) return null;

        const playableStartSec = Math.max(block.start_sec, trimBounds.start_sec);
        const playableEndSec = Math.min(block.end_sec, trimBounds.end_sec);
        if ((playableEndSec - playableStartSec) < PREVIEW_EPSILON_SEC) {
          return null;
        }

        return {
          start_sec: playableStartSec,
          end_sec: playableEndSec,
        };
      })
      .filter((slice): slice is TranscriptPlayableSlice => Boolean(slice));

    return {
      row_id: row.row_id,
      anchor_segment_id: row.anchor_segment_id,
      start_sec: row.start_sec,
      end_sec: row.end_sec,
      playable_start_sec: playableSlices[0]?.start_sec ?? null,
      playable_end_sec: playableSlices[playableSlices.length - 1]?.end_sec ?? null,
      playable_slices: playableSlices,
      is_deleted: playableSlices.length === 0,
      is_muted: row.is_muted,
      source_segment_ids: row.source_segment_ids,
    };
  });
}

export function getPlayableRows(playbackRanges: TranscriptPlaybackRange[]): TranscriptPlaybackRange[] {
  return playbackRanges.filter((range) => range.playable_slices.length > 0);
}

export function findPlaybackRangeByTime(
  playbackRanges: TranscriptPlaybackRange[],
  timeSec: number,
  mode: "raw" | "playable" = "raw",
): TranscriptPlaybackRange | null {
  for (const range of playbackRanges) {
    if (mode === "raw") {
      if (timeSec >= range.start_sec && timeSec < range.end_sec) {
        return range;
      }
      continue;
    }

    if (range.playable_slices.some((slice) => timeSec >= slice.start_sec && timeSec < slice.end_sec)) {
      return range;
    }
  }
  return null;
}

export function findNextPlayableSlice(
  playbackRange: TranscriptPlaybackRange,
  timeSec: number,
): TranscriptPlayableSlice | null {
  for (const slice of playbackRange.playable_slices) {
    if (timeSec < slice.start_sec - PREVIEW_EPSILON_SEC) {
      return slice;
    }
    if (timeSec >= slice.start_sec && timeSec < slice.end_sec) {
      return slice;
    }
  }
  return null;
}

export function findNextPlayableRow(
  playbackRanges: TranscriptPlaybackRange[],
  timeSec: number,
): TranscriptPlaybackRange | null {
  return getPlayableRows(playbackRanges).find((range) => (
    (range.playable_start_sec ?? Number.POSITIVE_INFINITY) >= (timeSec - PREVIEW_EPSILON_SEC)
  )) ?? null;
}

export function findPreviousPlayableRow(
  playbackRanges: TranscriptPlaybackRange[],
  timeSec: number,
): TranscriptPlaybackRange | null {
  const playableRows = getPlayableRows(playbackRanges);
  for (let index = playableRows.length - 1; index >= 0; index -= 1) {
    const range = playableRows[index];
    if ((range.playable_end_sec ?? Number.NEGATIVE_INFINITY) <= (timeSec + PREVIEW_EPSILON_SEC)) {
      return range;
    }
  }
  return null;
}

export function resolveSeekTargetForRow(
  playbackRange: TranscriptPlaybackRange,
  playbackRanges: TranscriptPlaybackRange[],
): { row_id: string | null; timeSec: number | null } {
  const firstPlayableSlice = playbackRange.playable_slices[0] ?? null;
  if (firstPlayableSlice) {
    return {
      row_id: playbackRange.row_id,
      timeSec: firstPlayableSlice.start_sec,
    };
  }

  const nextPlayableRow = findNextPlayableRow(playbackRanges, playbackRange.end_sec - PREVIEW_EPSILON_SEC);
  if (nextPlayableRow?.playable_start_sec != null) {
    return {
      row_id: nextPlayableRow.row_id,
      timeSec: nextPlayableRow.playable_start_sec,
    };
  }

  return {
    row_id: null,
    timeSec: null,
  };
}

export function resolvePreviewBoundaryAction(
  rawPlaybackRange: TranscriptPlaybackRange | null,
  playbackRanges: TranscriptPlaybackRange[],
  currentTimeSec: number,
  effectiveDurationSec: number,
): PreviewBoundaryAction {
  if (!rawPlaybackRange) {
    return { kind: "none" };
  }

  const nextPlayableSlice = findNextPlayableSlice(rawPlaybackRange, currentTimeSec);
  if (nextPlayableSlice) {
    if (currentTimeSec < nextPlayableSlice.start_sec - PREVIEW_EPSILON_SEC) {
      return {
        kind: "seek",
        time_sec: nextPlayableSlice.start_sec,
        reason: rawPlaybackRange.is_deleted ? "deleted" : "trim-start",
        to_row_id: rawPlaybackRange.row_id,
      };
    }
    return { kind: "none" };
  }

  const nextPlayableRow = findNextPlayableRow(playbackRanges, currentTimeSec);
  if (nextPlayableRow?.playable_start_sec != null) {
    return {
      kind: "seek",
      time_sec: nextPlayableRow.playable_start_sec,
      reason: rawPlaybackRange.is_deleted ? "deleted" : "trim-end",
      to_row_id: nextPlayableRow.row_id,
    };
  }

  const previousPlayableRow = findPreviousPlayableRow(playbackRanges, currentTimeSec);
  const pauseAtSec = previousPlayableRow?.playable_end_sec
    ?? rawPlaybackRange.playable_end_sec
    ?? effectiveDurationSec;
  if (currentTimeSec >= pauseAtSec - PREVIEW_EPSILON_SEC || rawPlaybackRange.is_deleted) {
    return {
      kind: "pause",
      time_sec: pauseAtSec,
      reason: rawPlaybackRange.is_deleted ? "deleted" : "trim-end",
      to_row_id: null,
    };
  }

  return { kind: "none" };
}
