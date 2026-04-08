import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerCleanupPreview } from "./hammerCleanupTools";
import {
  previewRemoveFillers,
  previewRemoveRetakes,
  type FillerCleanupOptions,
  type RetakeCleanupOptions,
} from "./hammerCleanupTools";

export type HammerCandidateReviewKind = "fillers" | "retakes";

export type HammerCandidateCard = {
  id: string;
  kind: HammerCandidateReviewKind;
  primarySegmentId: string;
  segmentIds: string[];
  description: string;
  beforeText: string;
  afterText: string | null;
  confidence: number;
  timeSavedSec: number;
  apply: {
    removeSegmentIds: string[];
    updateSegments: Array<{ segmentId: string; text: string }>;
  };
};

export function buildCandidateQueue(args: {
  kind: HammerCandidateReviewKind;
  segments: HammerTranscriptSegment[];
  fillerOptions: FillerCleanupOptions;
  retakeOptions: RetakeCleanupOptions;
  handledCandidateIds: ReadonlySet<string>;
}): { preview: HammerCleanupPreview; cards: HammerCandidateCard[] } {
  const preview = args.kind === "fillers"
    ? previewRemoveFillers(args.segments, args.fillerOptions)
    : previewRemoveRetakes(args.segments, args.retakeOptions);

  const beforeById = new Map(args.segments.map((segment) => [segment.segment_id, segment] as const));
  const afterById = new Map(preview.resultSegments.map((segment) => [segment.segment_id, segment] as const));

  const cards: HammerCandidateCard[] = [];
  for (const suggestion of preview.suggestions) {
    if (args.handledCandidateIds.has(suggestion.id)) continue;

    const matchesKind = args.kind === "fillers"
      ? suggestion.type === "filler_remove"
      : suggestion.type === "retake_remove";
    if (!matchesKind) continue;

    const before = beforeById.get(suggestion.segmentId);
    if (!before) continue;
    const after = afterById.get(suggestion.segmentId) ?? null;

    if (args.kind === "retakes") {
      // Suggestion id encodes the kept segment id for pair review.
      const parts = String(suggestion.id).split(":");
      const keptSegmentId = parts[0] === "retake_pair" ? (parts[2] ?? null) : null;
      const kept = keptSegmentId ? beforeById.get(keptSegmentId) ?? null : null;
      if (!kept) continue;
      cards.push({
        id: suggestion.id,
        kind: args.kind,
        primarySegmentId: before.segment_id,
        segmentIds: [before.segment_id, kept.segment_id],
        description: suggestion.description,
        beforeText: `${before.text}\n${kept.text}`,
        afterText: kept.text,
        confidence: suggestion.confidence,
        timeSavedSec: suggestion.timeSavedSec,
        apply: {
          removeSegmentIds: [before.segment_id],
          updateSegments: [],
        },
      });
      continue;
    }

    const afterText = after ? after.text : null;
    const apply = afterText == null
      ? {
        removeSegmentIds: [before.segment_id],
        updateSegments: [],
      }
      : {
        removeSegmentIds: [],
        updateSegments: [{ segmentId: before.segment_id, text: afterText }],
      };

    cards.push({
      id: suggestion.id,
      kind: args.kind,
      primarySegmentId: suggestion.segmentId,
      segmentIds: [suggestion.segmentId],
      description: suggestion.description,
      beforeText: before.text,
      afterText,
      confidence: suggestion.confidence,
      timeSavedSec: suggestion.timeSavedSec,
      apply,
    });
  }

  return { preview, cards };
}

export function clampActiveCandidateIndex(previousIndex: number, cardsLength: number): number {
  const nextLength = Math.max(0, Math.trunc(cardsLength));
  if (nextLength <= 1) return 0;
  const idx = Math.max(0, Math.trunc(previousIndex));
  return Math.min(idx, nextLength - 1);
}
