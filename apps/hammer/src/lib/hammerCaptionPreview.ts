import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { applyHammerOutputDerivedTextLayerToSegments, getHammerOutputDerivedTextLayer } from "../macros/hammerDerivedTranscriptLayers";
import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";

const CAPTION_PREVIEW_MAX_CHARS = 64;
const CAPTION_PREVIEW_MAX_WORDS = 12;
const SENTENCE_PATTERN = /[^.!?]+(?:[.!?]+|$)/g;

export type HammerCaptionPreviewChunk = {
  chunk_id: string;
  speaker: string;
  text: string;
  start_sec: number;
  end_sec: number;
  segment_ids: string[];
  word_count: number;
  character_count: number;
  approximate_timing: boolean;
};

export type HammerCaptionPreviewModel = {
  source_kind: "raw" | "derived";
  source_layer_id: string | null;
  approximate_timing: boolean;
  segment_count: number;
  chunk_count: number;
  chunks: HammerCaptionPreviewChunk[];
};

function normalizeCaptionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  const normalized = normalizeCaptionText(text);
  if (!normalized) return 0;
  return normalized.split(" ").length;
}

function splitLongCaptionPart(text: string): string[] {
  const normalized = normalizeCaptionText(text);
  if (!normalized) return [];
  const words = normalized.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (
      current
      && (countWords(candidate) > CAPTION_PREVIEW_MAX_WORDS || candidate.length > CAPTION_PREVIEW_MAX_CHARS)
    ) {
      chunks.push(current);
      current = word;
      continue;
    }
    current = candidate;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function splitCaptionTextIntoParts(text: string): string[] {
  const normalized = normalizeCaptionText(text);
  if (!normalized) return [];

  const sentenceMatches = normalized.match(SENTENCE_PATTERN);
  const sentenceUnits = (sentenceMatches?.length ? sentenceMatches : [normalized])
    .map((unit) => normalizeCaptionText(unit))
    .filter(Boolean);

  const parts: string[] = [];
  let current = "";
  for (const unit of sentenceUnits) {
    if (!current) {
      if (countWords(unit) > CAPTION_PREVIEW_MAX_WORDS || unit.length > CAPTION_PREVIEW_MAX_CHARS) {
        parts.push(...splitLongCaptionPart(unit));
      } else {
        current = unit;
      }
      continue;
    }

    const candidate = `${current} ${unit}`;
    if (countWords(candidate) > CAPTION_PREVIEW_MAX_WORDS || candidate.length > CAPTION_PREVIEW_MAX_CHARS) {
      parts.push(current);
      if (countWords(unit) > CAPTION_PREVIEW_MAX_WORDS || unit.length > CAPTION_PREVIEW_MAX_CHARS) {
        parts.push(...splitLongCaptionPart(unit));
        current = "";
      } else {
        current = unit;
      }
      continue;
    }

    current = candidate;
  }

  if (current) {
    parts.push(current);
  }

  return parts.length > 0 ? parts : [normalized];
}

export function buildHammerCaptionPreviewChunks(
  segments: HammerTranscriptSegment[],
): HammerCaptionPreviewChunk[] {
  const chunks: HammerCaptionPreviewChunk[] = [];

  for (const segment of segments) {
    const parts = splitCaptionTextIntoParts(segment.text);
    if (parts.length === 0) continue;

    const segmentDuration = Math.max(segment.end_sec - segment.start_sec, 0);
    const approximateTiming = parts.length > 1;
    const totalWeight = parts.reduce((sum, part) => sum + Math.max(part.length, 1), 0);
    let cursor = segment.start_sec;
    let consumedWeight = 0;

    parts.forEach((part, index) => {
      consumedWeight += Math.max(part.length, 1);
      const nextEnd = approximateTiming && totalWeight > 0 && index < parts.length - 1
        ? segment.start_sec + (segmentDuration * (consumedWeight / totalWeight))
        : segment.end_sec;
      const startSec = approximateTiming ? cursor : segment.start_sec;
      const endSec = approximateTiming ? Math.max(nextEnd, startSec) : segment.end_sec;

      chunks.push({
        chunk_id: `${segment.segment_id}:${index}`,
        speaker: segment.speaker,
        text: part,
        start_sec: startSec,
        end_sec: endSec,
        segment_ids: [segment.segment_id],
        word_count: countWords(part),
        character_count: part.length,
        approximate_timing: approximateTiming,
      });

      cursor = endSec;
    });
  }

  return chunks;
}

export function buildHammerCaptionPreviewModel(
  rawSegments: HammerTranscriptSegment[],
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerCaptionPreviewModel {
  const outputLayer = getHammerOutputDerivedTextLayer(transcript);
  const outputSegments = applyHammerOutputDerivedTextLayerToSegments(rawSegments, transcript);
  const chunks = buildHammerCaptionPreviewChunks(outputSegments);

  return {
    source_kind: outputLayer ? "derived" : "raw",
    source_layer_id: outputLayer?.layer_id ?? null,
    approximate_timing: chunks.some((chunk) => chunk.approximate_timing),
    segment_count: outputSegments.length,
    chunk_count: chunks.length,
    chunks,
  };
}
