import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  HammerVisualPlacement,
  HammerVisualPlacementMatchType,
  HammerVisualPlacementResult,
} from "../../../../packages/contracts/hammer/visual-placement.contract";
import type { HammerVisualPackage, HammerVisualPackageVisual } from "../../../../packages/contracts/hammer/visual-package.contract";

const MIN_CONTAINS_LENGTH = 12;
const MAX_WINDOW_SIZE = 3;
const STRONG_OVERLAP_MIN = 0.72;
const WEAK_OVERLAP_MIN = 0.38;
const PROGRESS_FALLBACK_CONFIDENCE = 0.18;

export type HammerVisualTimelineClip = {
  clip_id: string;
  entry_id: string;
  asset_id: string | null;
  start_sec: number;
  end_sec: number;
  label: string;
  tone: string;
  linked_row_id: string | null;
  linked_segment_id: string | null;
  match_type: HammerVisualPlacementMatchType;
};

type SegmentWindow = {
  startIndex: number;
  endIndex: number;
  startSec: number;
  endSec: number;
  segmentIds: string[];
  normalized: string;
  tokens: string[];
};

type CandidateScore = {
  score: number;
  exact: boolean;
  contains: boolean;
};

type SemanticCandidate = SegmentWindow & CandidateScore;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(" ") : [];
}

function countOverlap(anchorTokens: string[], candidateTokens: string[]): number {
  if (anchorTokens.length === 0 || candidateTokens.length === 0) return 0;
  const candidateSet = new Set(candidateTokens);
  let overlap = 0;
  const seen = new Set<string>();
  for (const token of anchorTokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    if (candidateSet.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function computeOrderedTokenRatio(anchorTokens: string[], candidateTokens: string[]): number {
  if (anchorTokens.length === 0 || candidateTokens.length === 0) return 0;
  let candidateIndex = 0;
  let matched = 0;
  for (const anchorToken of anchorTokens) {
    while (candidateIndex < candidateTokens.length && candidateTokens[candidateIndex] !== anchorToken) {
      candidateIndex += 1;
    }
    if (candidateIndex < candidateTokens.length) {
      matched += 1;
      candidateIndex += 1;
    }
  }
  return matched / anchorTokens.length;
}

function buildSegmentWindows(
  segments: HammerTranscriptSegment[],
  searchStartIndex: number,
  maxWindowSize: number,
): SegmentWindow[] {
  const windows: SegmentWindow[] = [];
  for (let startIndex = searchStartIndex; startIndex < segments.length; startIndex += 1) {
    const maxSize = Math.min(maxWindowSize, segments.length - startIndex);
    for (let size = 1; size <= maxSize; size += 1) {
      const endIndex = startIndex + size - 1;
      const slice = segments.slice(startIndex, endIndex + 1);
      const text = slice.map((segment) => segment.text).join(" ");
      windows.push({
        startIndex,
        endIndex,
        startSec: slice[0]?.start_sec ?? 0,
        endSec: slice[slice.length - 1]?.end_sec ?? 0,
        segmentIds: slice.map((segment) => segment.segment_id),
        normalized: normalizeText(text),
        tokens: tokenize(text),
      });
    }
  }
  return windows;
}

function scoreWindow(anchorText: string, window: SegmentWindow): CandidateScore {
  const anchorNormalized = normalizeText(anchorText);
  const anchorTokens = tokenize(anchorText);
  if (!anchorNormalized || anchorTokens.length === 0 || !window.normalized || window.tokens.length === 0) {
    return { score: 0, exact: false, contains: false };
  }

  const exact = anchorNormalized === window.normalized;
  const contains = anchorNormalized.length >= MIN_CONTAINS_LENGTH
    && (window.normalized.includes(anchorNormalized) || anchorNormalized.includes(window.normalized));
  if (exact) {
    return { score: 1, exact: true, contains: true };
  }
  if (contains) {
    return { score: 0.97, exact: false, contains: true };
  }

  const overlapCount = countOverlap(anchorTokens, window.tokens);
  const anchorRecall = overlapCount / anchorTokens.length;
  const candidatePrecision = overlapCount / Math.max(window.tokens.length, 1);
  const orderedRatio = computeOrderedTokenRatio(anchorTokens, window.tokens);
  const score = Math.max(
    0,
    Number(((anchorRecall * 0.55) + (candidatePrecision * 0.15) + (orderedRatio * 0.30)).toFixed(4)),
  );

  return {
    score,
    exact: false,
    contains: false,
  };
}

function pickAnchorText(visual: HammerVisualPackageVisual): string | null {
  const spanText = visual.script_anchor?.span_text?.trim() ?? "";
  return spanText.length > 0 ? spanText : null;
}

function pickSemanticCandidate(
  anchorText: string | null,
  segments: HammerTranscriptSegment[],
  searchStartIndex: number,
): SemanticCandidate | null {
  if (!anchorText || searchStartIndex >= segments.length) return null;

  const anchorTokens = tokenize(anchorText);
  const maxWindowSize = Math.min(
    MAX_WINDOW_SIZE,
    Math.max(1, Math.ceil(anchorTokens.length / 10) + 1),
  );
  const windows = buildSegmentWindows(segments, searchStartIndex, maxWindowSize);
  let bestCandidate: SemanticCandidate | null = null;

  for (const window of windows) {
    const candidateScore = scoreWindow(anchorText, window);
    if (candidateScore.score <= 0) continue;

    const candidate: SemanticCandidate = {
      ...window,
      ...candidateScore,
    };

    if (!bestCandidate) {
      bestCandidate = candidate;
      continue;
    }

    if (candidate.score > bestCandidate.score) {
      bestCandidate = candidate;
      continue;
    }
    if (candidate.score === bestCandidate.score && candidate.startIndex < bestCandidate.startIndex) {
      bestCandidate = candidate;
      continue;
    }
    if (
      candidate.score === bestCandidate.score
      && candidate.startIndex === bestCandidate.startIndex
      && (candidate.endIndex - candidate.startIndex) < (bestCandidate.endIndex - bestCandidate.startIndex)
    ) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function buildPlacement(args: {
  visual: HammerVisualPackageVisual;
  anchorTextUsed: string | null;
  matchType: HammerVisualPlacementMatchType;
  confidence: number;
  startSec: number | null;
  endSec: number | null;
  matchedSegmentIds: string[];
}): HammerVisualPlacement {
  return {
    entry_id: args.visual.entry_id,
    beat_order: args.visual.beat_order,
    paragraph_beat_order: args.visual.paragraph_beat_order,
    visual_mode: args.visual.visual_mode,
    selected_asset_id: args.visual.selected_asset_id,
    start_sec: args.startSec,
    end_sec: args.endSec,
    confidence: Number(args.confidence.toFixed(2)),
    match_type: args.matchType,
    matched_segment_ids: [...args.matchedSegmentIds],
    anchor_text_used: args.anchorTextUsed,
  };
}

function getVisualTimelineClipTone(matchType: HammerVisualPlacementMatchType): string {
  switch (matchType) {
    case "exact":
      return "#fb923c";
    case "overlap":
      return "#f59e0b";
    case "ordered_fallback":
      return "#facc15";
    case "progress_fallback":
      return "#fde68a";
    case "unmatched":
    default:
      return "#94a3b8";
  }
}

export function resolveVisualPlacements(
  visualPackage: HammerVisualPackage,
  transcriptSegments: HammerTranscriptSegment[],
): HammerVisualPlacementResult {
  const orderedTranscriptSegments = [...transcriptSegments].sort((left, right) => {
    if (left.start_sec !== right.start_sec) {
      return left.start_sec - right.start_sec;
    }
    if (left.end_sec !== right.end_sec) {
      return left.end_sec - right.end_sec;
    }
    return left.segment_id.localeCompare(right.segment_id);
  });
  const orderedVisuals = [...visualPackage.visuals].sort((left, right) => {
    if (left.beat_order !== right.beat_order) {
      return left.beat_order - right.beat_order;
    }
    if (left.paragraph_beat_order !== right.paragraph_beat_order) {
      return left.paragraph_beat_order - right.paragraph_beat_order;
    }
    return left.entry_id.localeCompare(right.entry_id);
  });

  const placements: HammerVisualPlacement[] = [];
  let searchStartIndex = 0;

  for (const visual of orderedVisuals) {
    const anchorTextUsed = pickAnchorText(visual);
    const semanticCandidate = pickSemanticCandidate(anchorTextUsed, orderedTranscriptSegments, searchStartIndex);

    if (semanticCandidate?.exact || semanticCandidate?.contains) {
      placements.push(buildPlacement({
        visual,
        anchorTextUsed,
        matchType: "exact",
        confidence: semanticCandidate.score,
        startSec: semanticCandidate.startSec,
        endSec: semanticCandidate.endSec,
        matchedSegmentIds: semanticCandidate.segmentIds,
      }));
      searchStartIndex = semanticCandidate.endIndex + 1;
      continue;
    }

    if (semanticCandidate && semanticCandidate.score >= STRONG_OVERLAP_MIN) {
      placements.push(buildPlacement({
        visual,
        anchorTextUsed,
        matchType: "overlap",
        confidence: semanticCandidate.score,
        startSec: semanticCandidate.startSec,
        endSec: semanticCandidate.endSec,
        matchedSegmentIds: semanticCandidate.segmentIds,
      }));
      searchStartIndex = semanticCandidate.endIndex + 1;
      continue;
    }

    if (semanticCandidate && semanticCandidate.score >= WEAK_OVERLAP_MIN) {
      placements.push(buildPlacement({
        visual,
        anchorTextUsed,
        matchType: "ordered_fallback",
        confidence: Math.max(0.35, semanticCandidate.score * 0.78),
        startSec: semanticCandidate.startSec,
        endSec: semanticCandidate.endSec,
        matchedSegmentIds: semanticCandidate.segmentIds,
      }));
      searchStartIndex = semanticCandidate.endIndex + 1;
      continue;
    }

    const fallbackSegment = orderedTranscriptSegments[searchStartIndex] ?? null;
    if (fallbackSegment) {
      placements.push(buildPlacement({
        visual,
        anchorTextUsed,
        matchType: "progress_fallback",
        confidence: PROGRESS_FALLBACK_CONFIDENCE,
        startSec: fallbackSegment.start_sec,
        endSec: fallbackSegment.end_sec,
        matchedSegmentIds: [fallbackSegment.segment_id],
      }));
      searchStartIndex += 1;
      continue;
    }

    placements.push(buildPlacement({
      visual,
      anchorTextUsed,
      matchType: "unmatched",
      confidence: 0,
      startSec: null,
      endSec: null,
      matchedSegmentIds: [],
    }));
  }

  return {
    workspace_id: visualPackage.workspace_id,
    workpiece_id: visualPackage.workpiece_id,
    transcript_segment_count: orderedTranscriptSegments.length,
    placements,
  };
}

export function buildVisualTimelineClips(args: {
  visualPackage: HammerVisualPackage | null;
  placementResult: HammerVisualPlacementResult | null;
  rowIdBySegmentId?: ReadonlyMap<string, string>;
}): HammerVisualTimelineClip[] {
  if (!args.visualPackage || !args.placementResult) return [];
  if (
    args.visualPackage.workspace_id !== args.placementResult.workspace_id
    || args.visualPackage.workpiece_id !== args.placementResult.workpiece_id
  ) {
    return [];
  }

  const visualByEntryId = new Map(args.visualPackage.visuals.map((visual) => [visual.entry_id, visual]));
  const rowIdBySegmentId = args.rowIdBySegmentId ?? new Map<string, string>();

  return args.placementResult.placements
    .flatMap((placement) => {
      if (placement.start_sec == null || placement.end_sec == null) return [];
      const visual = visualByEntryId.get(placement.entry_id) ?? null;
      const selectedAsset = visual?.selected_asset ?? null;
      if (!visual || !selectedAsset || !placement.selected_asset_id) return [];

      const linkedSegmentId = placement.matched_segment_ids[0] ?? null;
      return [{
        clip_id: `visual_${placement.entry_id}`,
        entry_id: placement.entry_id,
        asset_id: placement.selected_asset_id,
        start_sec: placement.start_sec,
        end_sec: placement.end_sec,
        label: `beat ${placement.beat_order}`,
        tone: getVisualTimelineClipTone(placement.match_type),
        linked_row_id: linkedSegmentId ? rowIdBySegmentId.get(linkedSegmentId) ?? null : null,
        linked_segment_id: linkedSegmentId,
        match_type: placement.match_type,
      }];
    })
    .sort((left, right) => {
      if (left.start_sec !== right.start_sec) {
        return left.start_sec - right.start_sec;
      }
      return left.entry_id.localeCompare(right.entry_id);
    });
}
