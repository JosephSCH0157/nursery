import { normTokens } from '../../speech/matcher';
import type { CueBridgeSkipReason } from './asr-scroll-driver.types';

const CUE_LINE_BRACKET_RE = /^\s*[\[(\{][^\]\)\}]{0,120}[\]\)\}]\s*$/;
const CUE_LINE_WORD_RE = /\b(pause|beat|silence|breath|breathe|hold|wait|reflective)\b/i;
const STRUCTURAL_EMPTY_LINE_RE = /^\s*empty\s*[.!?]?\s*$/i;
const SPEAKER_TAG_ONLY_RE = /^\s*\[\s*\/?\s*(s1|s2|guest1|guest2|g1|g2)\s*\]\s*$/i;
const NOTE_TAG_ONLY_RE = /^\s*\[\s*\/?\s*note(?:[^\]]*)\]\s*$/i;
const NOTE_INLINE_BLOCK_RE = /^\s*\[\s*note(?:[^\]]*)\][\s\S]*\[\s*\/\s*note\s*\]\s*$/i;

function normalizeComparableText(value: string): string {
  return normTokens(String(value || '')).join(' ');
}

function classifySkippableLineForCueBridge(value: string): CueBridgeSkipReason | null {
  const raw = String(value || '').trim();
  if (!raw) return 'blank';
  if (SPEAKER_TAG_ONLY_RE.test(raw)) return 'speaker';
  if (NOTE_TAG_ONLY_RE.test(raw) || NOTE_INLINE_BLOCK_RE.test(raw) || /\[\s*\/?\s*note\b/i.test(raw)) return 'note';
  const normalized = normalizeComparableText(raw);
  if (!normalized) return 'blank';
  if (CUE_LINE_BRACKET_RE.test(raw)) return 'cue';
  const tokenCount = normalized.split(' ').filter(Boolean).length;
  return tokenCount <= 4 && CUE_LINE_WORD_RE.test(normalized) ? 'cue' : null;
}

function classifyStrictSkippableLineForCueBridge(value: string): CueBridgeSkipReason | null {
  const raw = String(value || '').trim();
  if (!raw) return 'blank';
  if (STRUCTURAL_EMPTY_LINE_RE.test(raw)) return 'cue';
  if (SPEAKER_TAG_ONLY_RE.test(raw)) return 'speaker';
  if (NOTE_TAG_ONLY_RE.test(raw) || NOTE_INLINE_BLOCK_RE.test(raw) || /\[\s*\/?\s*note\b/i.test(raw)) return 'note';
  if (CUE_LINE_BRACKET_RE.test(raw)) return 'cue';
  const normalized = normalizeComparableText(raw);
  if (!normalized) return 'blank';
  const tokenCount = normalized.split(' ').filter(Boolean).length;
  if (tokenCount <= 3 && CUE_LINE_WORD_RE.test(normalized)) return 'cue';
  return null;
}

export type AsrLineClassification = {
  skippableReason: CueBridgeSkipReason | null;
  strictSkippableReason: CueBridgeSkipReason | null;
};

export function classifyAsrLine(text: string): AsrLineClassification {
  return {
    skippableReason: classifySkippableLineForCueBridge(text),
    strictSkippableReason: classifyStrictSkippableLineForCueBridge(text),
  };
}

export function isAsrStrictSkippableLine(text: string): boolean {
  return classifyStrictSkippableLineForCueBridge(text) != null;
}

export function resolveForwardSpeakableTarget(input: {
  currentLine: number;
  requestedTarget: number;
  maxSpeakableSteps: number;
  totalLines: number;
  getLineText: (lineIndex: number) => string;
}): number {
  const safeCurrent = Math.max(0, Math.floor(Number(input.currentLine) || 0));
  const safeRequested = Math.max(safeCurrent, Math.floor(Number(input.requestedTarget) || safeCurrent));
  const stepsCap = Math.max(1, Math.floor(Number(input.maxSpeakableSteps) || 1));
  const totalLines = Number.isFinite(input.totalLines) ? Math.max(0, Math.floor(input.totalLines)) : 0;
  const physicalCapped = totalLines > 0
    ? Math.min(Math.max(safeRequested, safeCurrent), Math.max(0, totalLines - 1))
    : safeRequested;
  let cursor = safeCurrent;
  let steps = 0;
  while (steps < stepsCap) {
    const next = findNextSpeakableLineIndex({
      startIndex: Math.max(0, cursor + 1),
      maxLookahead: totalLines,
      totalLines,
      getLineText: input.getLineText,
    });
    if (!Number.isFinite(next as number) || (next as number) <= cursor) break;
    const safeNext = Math.max(0, Math.floor(next as number));
    if (safeNext > physicalCapped) break;
    cursor = safeNext;
    steps += 1;
    if (cursor >= physicalCapped) break;
  }
  if (cursor > safeCurrent) return cursor;
  return Math.min(physicalCapped, safeCurrent + stepsCap);
}

export function countSpeakableDistanceAhead(input: {
  fromLine: number;
  targetLine: number;
  totalLines: number;
  getLineText: (lineIndex: number) => string;
}): number {
  const safeFrom = Number.isFinite(input.fromLine) ? Math.floor(input.fromLine) : -1;
  const safeTarget = Number.isFinite(input.targetLine) ? Math.max(0, Math.floor(input.targetLine)) : -1;
  if (safeTarget <= safeFrom) return 0;
  const total = Number.isFinite(input.totalLines) ? Math.max(0, Math.floor(input.totalLines)) : 0;
  if (total <= 0) {
    return Math.max(0, safeTarget - Math.max(0, safeFrom));
  }
  let steps = 0;
  let cursor = safeFrom;
  const maxIterations = Math.max(1, total + 4);
  for (let i = 0; i < maxIterations; i += 1) {
    const next = findNextSpeakableLineIndex({
      startIndex: Math.max(0, cursor + 1),
      maxLookahead: total,
      totalLines: total,
      getLineText: input.getLineText,
    });
    if (next == null) break;
    steps += 1;
    if (next >= safeTarget) return steps;
    cursor = next;
  }
  return Number.POSITIVE_INFINITY;
}

export function collectSkippedAsrRows(input: {
  currentLine: number;
  targetLine: number;
  getLineText: (lineIndex: number) => string;
  strict?: boolean;
}): {
  skippedReasons: CueBridgeSkipReason[];
  skippedNonIgnorable: boolean;
} {
  const current = Number.isFinite(input.currentLine) ? Math.floor(input.currentLine) : -1;
  const target = Number.isFinite(input.targetLine) ? Math.floor(input.targetLine) : -1;
  const skippedReasons: CueBridgeSkipReason[] = [];
  if (target <= current + 1) {
    return { skippedReasons, skippedNonIgnorable: false };
  }
  const strict = input.strict !== false;
  for (let idx = current + 1; idx < target; idx += 1) {
    const text = input.getLineText(idx);
    const reason = strict
      ? classifyStrictSkippableLineForCueBridge(text)
      : classifySkippableLineForCueBridge(text);
    if (reason == null) {
      return { skippedReasons, skippedNonIgnorable: true };
    }
    skippedReasons.push(reason);
  }
  return { skippedReasons, skippedNonIgnorable: false };
}

export function findNextSpeakableLineIndex(input: {
  startIndex: number;
  maxLookahead: number;
  totalLines: number;
  getLineText: (lineIndex: number) => string;
}): number | null {
  const total = Number.isFinite(input.totalLines) ? Math.max(0, Math.floor(input.totalLines)) : 0;
  if (!Number.isFinite(input.startIndex) || total <= 0) return null;
  const begin = Math.max(0, Math.floor(input.startIndex));
  if (begin >= total) return null;
  const end = Math.min(total - 1, begin + Math.max(1, Math.floor(input.maxLookahead)));
  for (let idx = begin; idx <= end; idx += 1) {
    const lineText = input.getLineText(idx);
    if (classifySkippableLineForCueBridge(lineText) == null) {
      return idx;
    }
  }
  return null;
}

export function findNextSpeakableLineIndexWithin(input: {
  startIndex: number;
  endIndexInclusive: number;
  totalLines: number;
  getLineText: (lineIndex: number) => string;
}): number | null {
  const total = Number.isFinite(input.totalLines) ? Math.max(0, Math.floor(input.totalLines)) : 0;
  if (!Number.isFinite(input.startIndex) || !Number.isFinite(input.endIndexInclusive) || total <= 0) return null;
  const begin = Math.max(0, Math.floor(input.startIndex));
  const end = Math.min(total - 1, Math.max(begin, Math.floor(input.endIndexInclusive)));
  if (begin > end) return null;
  for (let idx = begin; idx <= end; idx += 1) {
    const lineText = input.getLineText(idx);
    if (classifySkippableLineForCueBridge(lineText) == null) {
      return idx;
    }
  }
  return null;
}
