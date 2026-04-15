import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

export type HammerDeleteOnlyTranscriptDirection = "backward" | "forward" | "selection";

export type HammerDeleteOnlyTranscriptToken = {
  index: number;
  text: string;
  start: number;
  end: number;
};

export type HammerDeleteOnlyTranscriptDeletion = {
  nextText: string;
  deletedText: string;
  deletedTokenCount: number;
  startTokenIndex: number;
  endTokenIndexExclusive: number;
  totalTokenCount: number;
};

export type HammerDeleteOnlyTranscriptCutSelection = {
  startSec: number;
  endSec: number;
};

const MIN_DURATION_SEC = 0.0001;

export function tokenizeDeleteOnlyTranscriptText(text: string): HammerDeleteOnlyTranscriptToken[] {
  const normalized = String(text ?? "");
  const matches = normalized.matchAll(/\S+/g);
  const tokens: HammerDeleteOnlyTranscriptToken[] = [];
  for (const match of matches) {
    const value = match[0] ?? "";
    const start = match.index ?? 0;
    tokens.push({
      index: tokens.length,
      text: value,
      start,
      end: start + value.length,
    });
  }
  return tokens;
}

function clampSelectionIndex(value: number, textLength: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(textLength, Math.trunc(value)));
}

function findBackwardTokenIndex(tokens: HammerDeleteOnlyTranscriptToken[], cursor: number): number {
  if (tokens.length === 0 || cursor <= 0) return -1;
  const anchor = cursor - 1;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (anchor >= token.start && anchor < token.end) {
      return index;
    }
    if (token.end <= cursor) {
      return index;
    }
  }
  return -1;
}

function findForwardTokenIndex(tokens: HammerDeleteOnlyTranscriptToken[], cursor: number): number {
  if (tokens.length === 0) return -1;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (cursor >= token.start && cursor < token.end) {
      return index;
    }
    if (token.start >= cursor) {
      return index;
    }
  }
  return -1;
}

export function resolveDeleteOnlyTranscriptDeletion(args: {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  direction: HammerDeleteOnlyTranscriptDirection;
}): HammerDeleteOnlyTranscriptDeletion | null {
  const text = String(args.text ?? "");
  const tokens = tokenizeDeleteOnlyTranscriptText(text);
  if (tokens.length === 0) return null;

  const selectionStart = clampSelectionIndex(args.selectionStart, text.length);
  const selectionEnd = clampSelectionIndex(args.selectionEnd, text.length);
  const rangeStart = Math.min(selectionStart, selectionEnd);
  const rangeEnd = Math.max(selectionStart, selectionEnd);

  let startTokenIndex = -1;
  let endTokenIndexExclusive = -1;

  if (rangeStart !== rangeEnd || args.direction === "selection") {
    const overlapping = tokens.filter((token) => token.end > rangeStart && token.start < rangeEnd);
    if (overlapping.length === 0) {
      return null;
    }
    startTokenIndex = overlapping[0]?.index ?? -1;
    endTokenIndexExclusive = (overlapping[overlapping.length - 1]?.index ?? -1) + 1;
  } else if (args.direction === "forward") {
    startTokenIndex = findForwardTokenIndex(tokens, rangeStart);
    endTokenIndexExclusive = startTokenIndex >= 0 ? startTokenIndex + 1 : -1;
  } else {
    startTokenIndex = findBackwardTokenIndex(tokens, rangeStart);
    endTokenIndexExclusive = startTokenIndex >= 0 ? startTokenIndex + 1 : -1;
  }

  if (startTokenIndex < 0 || endTokenIndexExclusive <= startTokenIndex) {
    return null;
  }

  const deletedTokens = tokens.slice(startTokenIndex, endTokenIndexExclusive);
  const remainingTokens = tokens.filter((token) => token.index < startTokenIndex || token.index >= endTokenIndexExclusive);

  return {
    nextText: remainingTokens.map((token) => token.text).join(" "),
    deletedText: deletedTokens.map((token) => token.text).join(" "),
    deletedTokenCount: deletedTokens.length,
    startTokenIndex,
    endTokenIndexExclusive,
    totalTokenCount: tokens.length,
  };
}

export function deriveDeleteOnlyTranscriptCutSelection(args: {
  segment: HammerTranscriptSegment;
  deletion: HammerDeleteOnlyTranscriptDeletion;
}): HammerDeleteOnlyTranscriptCutSelection | null {
  const durationSec = Number(args.segment.end_sec) - Number(args.segment.start_sec);
  if (!Number.isFinite(durationSec) || durationSec <= MIN_DURATION_SEC) {
    return null;
  }

  const totalTokenCount = Math.max(0, Math.trunc(args.deletion.totalTokenCount));
  if (totalTokenCount <= 0) {
    return null;
  }

  const startRatio = args.deletion.startTokenIndex / totalTokenCount;
  const endRatio = args.deletion.endTokenIndexExclusive / totalTokenCount;
  const startSec = Number(args.segment.start_sec) + (durationSec * startRatio);
  const endSec = Number(args.segment.start_sec) + (durationSec * endRatio);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || (endSec - startSec) <= MIN_DURATION_SEC) {
    return null;
  }

  return {
    startSec: Math.max(Number(args.segment.start_sec), startSec),
    endSec: Math.min(Number(args.segment.end_sec), endSec),
  };
}