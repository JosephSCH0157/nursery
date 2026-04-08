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
  segmentId: string;
  description: string;
  beforeText: string;
  afterText: string | null;
  confidence: number;
  timeSavedSec: number;
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

    cards.push({
      id: suggestion.id,
      kind: args.kind,
      segmentId: suggestion.segmentId,
      description: suggestion.description,
      beforeText: before.text,
      afterText: after ? after.text : null,
      confidence: suggestion.confidence,
      timeSavedSec: suggestion.timeSavedSec,
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
