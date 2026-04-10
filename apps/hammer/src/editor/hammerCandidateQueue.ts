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

function parseRetakeSuggestionId(id: string): { removeIds: string[]; keepId: string | null } {
  const parts = String(id).split(":");
  if (parts[0] === "retake_pair") {
    return { removeIds: [parts[1] ?? ""].filter(Boolean), keepId: parts[2] ?? null };
  }
  if (parts[0] === "retake_chain") {
    const remove = (parts[1] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return { removeIds: remove, keepId: parts[2] ?? null };
  }
  return { removeIds: [], keepId: null };
}

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
      : (suggestion.type === "retake_remove" || suggestion.type === "restart_trim");
    if (!matchesKind) continue;

    const before = beforeById.get(suggestion.segmentId);
    if (!before) continue;
    const after = afterById.get(suggestion.segmentId) ?? null;

    if (args.kind === "retakes") {
      if (suggestion.type === "restart_trim") {
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
        continue;
      }

      // Suggestion id encodes the kept segment id and any remove segment ids.
      const parsed = parseRetakeSuggestionId(suggestion.id);
      const keepId = parsed.keepId;
      const keptBefore = keepId ? beforeById.get(keepId) ?? null : null;
      const keptAfter = keepId ? afterById.get(keepId) ?? null : null;
      if (!keptBefore) continue;
      const removeSegments = parsed.removeIds
        .map((segmentId) => beforeById.get(segmentId) ?? null)
        .filter((segment): segment is HammerTranscriptSegment => Boolean(segment));
      if (removeSegments.length === 0) continue;

      const keptFinal = keptAfter ?? keptBefore;
      const orderedSegmentIds = Array.from(new Set([...removeSegments.map((seg) => seg.segment_id), keptFinal.segment_id]));
      const beforeText = [...removeSegments.map((seg) => seg.text), keptBefore.text].join("\n");
      const updateSegments: Array<{ segmentId: string; text: string }> = [];
      if (keptAfter && keptBefore && keptAfter.text !== keptBefore.text) {
        updateSegments.push({ segmentId: keptBefore.segment_id, text: keptAfter.text });
      }
      cards.push({
        id: suggestion.id,
        kind: args.kind,
        primarySegmentId: removeSegments[0]!.segment_id,
        segmentIds: orderedSegmentIds,
        description: suggestion.description,
        beforeText,
        afterText: keptFinal.text,
        confidence: suggestion.confidence,
        timeSavedSec: suggestion.timeSavedSec,
        apply: {
          removeSegmentIds: removeSegments.map((seg) => seg.segment_id),
          updateSegments,
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
