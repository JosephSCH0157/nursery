import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import { stableHashToken } from "./hammerWorkspaceShellCore";

export type HammerCaptionReadingSpeed = "slow" | "standard" | "fast";
export type HammerCaptionPunctuationMode = "preserve" | "normalize";

export type HammerCaptionFormattingState = {
  style: "sentence" | "title" | "upper";
  maxCharsPerLine: number;
  maxLinesPerCaption: number;
  includeSpeakerLabels: boolean;
  punctuationMode: HammerCaptionPunctuationMode;
  readingSpeed: HammerCaptionReadingSpeed;
};

export type HammerCaptionBuiltChunk = {
  id: string;
  speaker: string;
  startSec: number;
  endSec: number;
  text: string;
  lineCount: number;
  charCount: number;
  sourceSegmentIds: string[];
  approximateTiming: boolean;
};

export type HammerCaptionBuildState = {
  builtAt: string;
  sourceLayerId: string | null;
  sourceLabel: string;
  fingerprint: string;
  chunkCount: number;
  segmentCount: number;
  approximateTiming: boolean;
  chunks: HammerCaptionBuiltChunk[];
  srt: string;
  vtt: string;
};

export type HammerCaptionEditedState = {
  createdAt: string;
  updatedAt: string;
  baseFingerprint: string;
  sourceLayerId: string | null;
  sourceLabel: string;
  chunkCount: number;
  segmentCount: number;
  approximateTiming: boolean;
  chunks: HammerCaptionBuiltChunk[];
  srt: string;
  vtt: string;
};

export type HammerCaptionArtifactMode = "built" | "edited";

export function toTitleCaseText(value: string): string {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

export function applyCaptionStyle(value: string, style: HammerCaptionFormattingState["style"]): string {
  if (style === "upper") return value.toUpperCase();
  if (style === "title") return toTitleCaseText(value.toLowerCase());
  return value;
}

export function normalizeCaptionPunctuation(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,.!?;:]){2,}/g, "$1")
    .trim();
}

export function splitCaptionWordsByLimit(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxChars) {
      chunks.push(current);
      current = word;
      continue;
    }
    current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function wrapCaptionLines(text: string, maxCharsPerLine: number, maxLines: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let index = 0;
  while (index < words.length && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      lines.push(words.slice(index).join(" "));
      break;
    }
    let line = words[index] ?? "";
    index += 1;
    while (index < words.length) {
      const candidate = `${line} ${words[index]}`;
      if (candidate.length > maxCharsPerLine) break;
      line = candidate;
      index += 1;
    }
    lines.push(line);
  }
  return lines.slice(0, maxLines).join("\n");
}

export function resolveCaptionCharsPerSecond(speed: HammerCaptionReadingSpeed): number {
  if (speed === "slow") return 12;
  if (speed === "fast") return 20;
  return 16;
}

export function buildCaptionChunksFromPreview(args: {
  chunks: Array<{
    chunk_id: string;
    speaker: string;
    start_sec: number;
    end_sec: number;
    text: string;
    segment_ids: string[];
    approximate_timing: boolean;
  }>;
  formatting: HammerCaptionFormattingState;
}): HammerCaptionBuiltChunk[] {
  const results: HammerCaptionBuiltChunk[] = [];
  const cpsLimit = resolveCaptionCharsPerSecond(args.formatting.readingSpeed);
  let cursor = 0;
  for (const chunk of args.chunks) {
    const duration = Math.max(0.1, chunk.end_sec - chunk.start_sec);
    const layoutCap = Math.max(18, args.formatting.maxCharsPerLine * args.formatting.maxLinesPerCaption);
    const speedCap = Math.max(18, Math.floor(duration * cpsLimit));
    const maxChars = Math.max(18, Math.min(layoutCap, speedCap));
    const baseText = args.formatting.includeSpeakerLabels
      ? `${chunk.speaker}: ${chunk.text}`
      : chunk.text;
    const punctuated = args.formatting.punctuationMode === "normalize"
      ? normalizeCaptionPunctuation(baseText)
      : baseText.replace(/\s+/g, " ").trim();
    const styled = applyCaptionStyle(punctuated, args.formatting.style);
    const parts = splitCaptionWordsByLimit(styled, maxChars);
    const totalWeight = Math.max(parts.reduce((sum, part) => sum + Math.max(part.length, 1), 0), 1);
    let offset = chunk.start_sec;
    let consumed = 0;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      consumed += Math.max(part.length, 1);
      const nextEnd = index < parts.length - 1
        ? chunk.start_sec + (duration * (consumed / totalWeight))
        : chunk.end_sec;
      const wrapped = wrapCaptionLines(part, args.formatting.maxCharsPerLine, args.formatting.maxLinesPerCaption);
      const lines = wrapped.split("\n").filter(Boolean);
      results.push({
        id: `${chunk.chunk_id}:${index}:${cursor}`,
        speaker: chunk.speaker,
        startSec: offset,
        endSec: Math.max(nextEnd, offset + 0.05),
        text: wrapped,
        lineCount: lines.length,
        charCount: wrapped.replace(/\n/g, "").length,
        sourceSegmentIds: [...chunk.segment_ids],
        approximateTiming: chunk.approximate_timing || parts.length > 1,
      });
      offset = Math.max(nextEnd, offset + 0.05);
      cursor += 1;
    }
  }
  return results;
}

export function formatCaptionTimestamp(totalSeconds: number, format: "srt" | "vtt"): string {
  const clampedMs = Math.max(Math.round(totalSeconds * 1000), 0);
  const hours = Math.floor(clampedMs / 3_600_000);
  const minutes = Math.floor((clampedMs % 3_600_000) / 60_000);
  const seconds = Math.floor((clampedMs % 60_000) / 1000);
  const milliseconds = clampedMs % 1000;
  const separator = format === "srt" ? "," : ".";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(milliseconds).padStart(3, "0")}`;
}

export function renderBuiltSrt(chunks: HammerCaptionBuiltChunk[]): string {
  return chunks.map((chunk, index) => [
    String(index + 1),
    `${formatCaptionTimestamp(chunk.startSec, "srt")} --> ${formatCaptionTimestamp(chunk.endSec, "srt")}`,
    chunk.text,
  ].join("\n")).join("\n\n");
}

export function renderBuiltVtt(chunks: HammerCaptionBuiltChunk[]): string {
  const body = chunks.map((chunk) => [
    `${formatCaptionTimestamp(chunk.startSec, "vtt")} --> ${formatCaptionTimestamp(chunk.endSec, "vtt")}`,
    chunk.text,
  ].join("\n")).join("\n\n");
  return body ? `WEBVTT\n\n${body}` : "WEBVTT\n";
}

export function rebuildCaptionArtifactsFromChunks(chunks: HammerCaptionBuiltChunk[]): {
  chunkCount: number;
  approximateTiming: boolean;
  srt: string;
  vtt: string;
} {
  return {
    chunkCount: chunks.length,
    approximateTiming: chunks.some((chunk) => chunk.approximateTiming),
    srt: renderBuiltSrt(chunks),
    vtt: renderBuiltVtt(chunks),
  };
}

export function countChangedCaptionBlocks(
  baseChunks: readonly HammerCaptionBuiltChunk[],
  nextChunks: readonly HammerCaptionBuiltChunk[],
): number {
  const comparisonLength = Math.max(baseChunks.length, nextChunks.length);
  let changedBlocks = 0;

  for (let index = 0; index < comparisonLength; index += 1) {
    const base = baseChunks[index] ?? null;
    const next = nextChunks[index] ?? null;
    if (!base || !next) {
      changedBlocks += 1;
      continue;
    }

    if (
      base.id !== next.id
      || base.speaker !== next.speaker
      || base.startSec !== next.startSec
      || base.endSec !== next.endSec
      || base.text !== next.text
      || base.lineCount !== next.lineCount
      || base.charCount !== next.charCount
    ) {
      changedBlocks += 1;
    }
  }

  return changedBlocks;
}

export function buildCaptionBasisFingerprint(args: {
  transcript: HammerPersistedStructuredTranscript;
  outputLayerId: string | null;
  outputRecipeRef: string | null;
  formatting: HammerCaptionFormattingState;
}): string {
  return stableHashToken(JSON.stringify({
    transcriptId: args.transcript.transcript_id,
    outputLayerId: args.outputLayerId,
    outputRecipeRef: args.outputRecipeRef,
    formatting: args.formatting,
    segments: args.transcript.segments.map((segment) => ({
      id: segment.segment_id,
      speaker: segment.speaker,
      text: segment.text,
      start: segment.start_sec,
      end: segment.end_sec,
      disabled: segment.is_disabled === true,
    })),
  }));
}
