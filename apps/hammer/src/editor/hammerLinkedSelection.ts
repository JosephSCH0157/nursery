import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

export type HammerLinkedSelectionKind = "timeline" | "transcript" | "visual";

export type HammerLinkedTranscriptRange = {
  segmentIds: string[];
  segmentId?: string;
  startOffset?: number;
  endOffset?: number;
};

export type HammerLinkedSelection = {
  kind: HammerLinkedSelectionKind;
  anchorId: string | null;
  timeRange: { startSec: number; endSec: number } | null;
  transcriptRange: HammerLinkedTranscriptRange | null;
  visualIds: string[];
  primaryVisualId?: string | null;
  isLinked: boolean;
};

export type HammerLinkedSelectionVisualItem = {
  id: string;
  anchorSegmentId: string | null;
  startSec: number;
  endSec: number;
};

export type HammerLinkedSelectionTextSelection = {
  start: number;
  end: number;
  text: string;
  segments: Array<{
    segmentId: string;
    selectionStart: number;
    selectionEnd: number;
    text: string;
  }>;
};

function buildTranscriptSegmentIndex(segments: HammerTranscriptSegment[]): Map<string, number> {
  const indexById = new Map<string, number>();
  for (let index = 0; index < segments.length; index += 1) {
    indexById.set(segments[index]!.segment_id, index);
  }
  return indexById;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function findTranscriptSegmentRange(args: {
  transcriptSegments: HammerTranscriptSegment[];
  anchorSegmentId: string | null;
  focusSegmentId?: string | null;
}): HammerTranscriptSegment[] {
  if (!args.anchorSegmentId) return [];
  const byId = buildTranscriptSegmentIndex(args.transcriptSegments);
  const anchorIndex = byId.get(args.anchorSegmentId);
  if (anchorIndex == null) return [];
  const focusIndex = args.focusSegmentId ? byId.get(args.focusSegmentId) ?? anchorIndex : anchorIndex;
  const startIndex = Math.min(anchorIndex, focusIndex);
  const endIndex = Math.max(anchorIndex, focusIndex);
  return args.transcriptSegments.slice(startIndex, endIndex + 1);
}

function findTranscriptSegmentsForTimeRange(args: {
  transcriptSegments: HammerTranscriptSegment[];
  startSec: number;
  endSec: number;
}): HammerTranscriptSegment[] {
  return args.transcriptSegments.filter((segment) => segment.end_sec > args.startSec && segment.start_sec < args.endSec);
}

function buildTimeRange(segments: HammerTranscriptSegment[]): { startSec: number; endSec: number } | null {
  if (segments.length === 0) return null;
  return {
    startSec: segments[0]!.start_sec,
    endSec: segments[segments.length - 1]!.end_sec,
  };
}

function resolveVisualIdsForSegmentIds(args: {
  visualItems: HammerLinkedSelectionVisualItem[];
  segmentIds: string[];
}): string[] {
  if (args.segmentIds.length === 0) return [];
  const selectedIds = new Set(args.segmentIds);
  return args.visualItems
    .filter((item) => item.anchorSegmentId && selectedIds.has(item.anchorSegmentId))
    .map((item) => item.id);
}

export function buildLinkedSelectionTranscriptSegmentIdSet(selection: HammerLinkedSelection | null | undefined): Set<string> {
  return new Set(selection?.transcriptRange?.segmentIds ?? []);
}

export function buildLinkedSelectionVisualIdSet(selection: HammerLinkedSelection | null | undefined): Set<string> {
  return new Set(selection?.visualIds ?? []);
}

export function isTranscriptRangeLinked(args: {
  selection: HammerLinkedSelection | null | undefined;
  segmentId: string;
}): boolean {
  return Boolean(args.selection?.transcriptRange?.segmentIds.includes(args.segmentId));
}

export function isVisualLinked(args: {
  selection: HammerLinkedSelection | null | undefined;
  visualId: string;
}): boolean {
  return Boolean(args.selection?.visualIds.includes(args.visualId));
}

export function doesTimelineSpanMatchSelection(args: {
  selection: HammerLinkedSelection | null | undefined;
  startSec: number;
  endSec: number;
}): boolean {
  const range = args.selection?.timeRange;
  if (!range) return false;
  return range.startSec < args.endSec && range.endSec > args.startSec;
}

export function resolveSelectionFromTranscript(args: {
  transcriptSegments: HammerTranscriptSegment[];
  visualItems: HammerLinkedSelectionVisualItem[];
  anchorSegmentId: string | null;
  focusSegmentId?: string | null;
  textSelection?: HammerLinkedSelectionTextSelection | null;
  currentPrimaryVisualId?: string | null;
}): HammerLinkedSelection | null {
  const selectedSegments = args.textSelection?.segments.length
    ? uniqueStrings(args.textSelection.segments.map((segment) => segment.segmentId))
        .map((segmentId) => args.transcriptSegments.find((segment) => segment.segment_id === segmentId) ?? null)
        .filter((segment): segment is HammerTranscriptSegment => Boolean(segment))
    : findTranscriptSegmentRange({
      transcriptSegments: args.transcriptSegments,
      anchorSegmentId: args.anchorSegmentId,
      focusSegmentId: args.focusSegmentId,
    });

  if (selectedSegments.length === 0) return null;

  const segmentIds = selectedSegments.map((segment) => segment.segment_id);
  const visualIds = resolveVisualIdsForSegmentIds({
    visualItems: args.visualItems,
    segmentIds,
  });
  const primaryVisualId = args.currentPrimaryVisualId && visualIds.includes(args.currentPrimaryVisualId)
    ? args.currentPrimaryVisualId
    : (visualIds[0] ?? null);

  return {
    kind: "transcript",
    anchorId: args.focusSegmentId ?? args.anchorSegmentId ?? segmentIds[0] ?? null,
    timeRange: buildTimeRange(selectedSegments),
    transcriptRange: {
      segmentIds,
      segmentId: segmentIds[0],
      startOffset: args.textSelection?.segments[0]?.selectionStart ?? args.textSelection?.start,
      endOffset: args.textSelection?.segments.length === 1
        ? args.textSelection.segments[0]?.selectionEnd
        : args.textSelection?.end,
    },
    visualIds,
    primaryVisualId,
    isLinked: true,
  };
}

export function resolveSelectionFromTimeline(args: {
  transcriptSegments: HammerTranscriptSegment[];
  visualItems: HammerLinkedSelectionVisualItem[];
  startSec: number;
  endSec: number;
  segmentIds?: string[];
  anchorId?: string | null;
  clipId?: string | null;
  currentPrimaryVisualId?: string | null;
}): HammerLinkedSelection | null {
  if (args.clipId) {
    return resolveSelectionFromVisual({
      transcriptSegments: args.transcriptSegments,
      visualItems: args.visualItems,
      visualId: args.clipId,
      currentPrimaryVisualId: args.currentPrimaryVisualId,
      kind: "timeline",
    });
  }

  const selectedSegments = args.segmentIds?.length
    ? uniqueStrings(args.segmentIds)
        .map((segmentId) => args.transcriptSegments.find((segment) => segment.segment_id === segmentId) ?? null)
        .filter((segment): segment is HammerTranscriptSegment => Boolean(segment))
    : findTranscriptSegmentsForTimeRange({
      transcriptSegments: args.transcriptSegments,
      startSec: args.startSec,
      endSec: args.endSec,
    });

  const segmentIds = selectedSegments.map((segment) => segment.segment_id);
  const visualIds = resolveVisualIdsForSegmentIds({
    visualItems: args.visualItems,
    segmentIds,
  });

  return {
    kind: "timeline",
    anchorId: args.anchorId ?? segmentIds[0] ?? null,
    timeRange: { startSec: args.startSec, endSec: args.endSec },
    transcriptRange: segmentIds.length > 0
      ? {
        segmentIds,
        segmentId: segmentIds[0],
      }
      : null,
    visualIds,
    primaryVisualId: args.currentPrimaryVisualId && visualIds.includes(args.currentPrimaryVisualId)
      ? args.currentPrimaryVisualId
      : (visualIds[0] ?? null),
    isLinked: segmentIds.length > 0,
  };
}

export function resolveSelectionFromVisual(args: {
  transcriptSegments: HammerTranscriptSegment[];
  visualItems: HammerLinkedSelectionVisualItem[];
  visualId: string;
  currentPrimaryVisualId?: string | null;
  kind?: HammerLinkedSelectionKind;
}): HammerLinkedSelection | null {
  const visual = args.visualItems.find((item) => item.id === args.visualId) ?? null;
  if (!visual) return null;
  const anchorSegment = visual.anchorSegmentId
    ? (args.transcriptSegments.find((segment) => segment.segment_id === visual.anchorSegmentId) ?? null)
    : null;
  const visualIds = visual.anchorSegmentId
    ? args.visualItems.filter((item) => item.anchorSegmentId === visual.anchorSegmentId).map((item) => item.id)
    : [visual.id];

  return {
    kind: args.kind ?? "visual",
    anchorId: anchorSegment?.segment_id ?? null,
    timeRange: {
      startSec: visual.startSec,
      endSec: visual.endSec,
    },
    transcriptRange: anchorSegment
      ? {
        segmentIds: [anchorSegment.segment_id],
        segmentId: anchorSegment.segment_id,
      }
      : null,
    visualIds,
    primaryVisualId: args.currentPrimaryVisualId && visualIds.includes(args.currentPrimaryVisualId)
      ? args.currentPrimaryVisualId
      : visual.id,
    isLinked: Boolean(anchorSegment),
  };
}