import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerAudioPolishAnalysisWaveformProxy } from "../persistence/hammerPersistenceContract";
import { computeTranscriptCutRange } from "./hammerCleanupExecution";
import {
  resolveSmartCutRange,
  type HammerSmartCutEditKind,
} from "./hammerWaveformCutRefinement";

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

export type HammerDeleteOnlyTranscriptSelectionRange = {
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
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
  audioDurationSec?: number;
  waveformProxy?: HammerAudioPolishAnalysisWaveformProxy | null;
  editKind?: HammerSmartCutEditKind;
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

  const baseRange = computeTranscriptCutRange({
    wordStartSec: startSec,
    wordEndSec: endSec,
    audioDurationSec: Number(args.audioDurationSec ?? args.segment.end_sec),
  });
  if (!baseRange) {
    return null;
  }

  const resolved = resolveSmartCutRange({
    baseRange,
    editKind: args.editKind ?? "delete_only",
    waveformProxy: args.waveformProxy ?? null,
    previousProtectedBoundarySec: startSec,
    nextProtectedBoundarySec: endSec,
  });

  return {
    startSec: resolved.range.startSec,
    endSec: resolved.range.endSec,
  };
}

export function resolveDeleteOnlyTranscriptSelectionFromTexts(args: {
  beforeText: string;
  afterText: string | null;
}): HammerDeleteOnlyTranscriptSelectionRange | null {
  const beforeText = String(args.beforeText ?? "");
  const afterText = args.afterText == null ? null : String(args.afterText);
  if (!beforeText.trim()) {
    return null;
  }
  if (afterText == null || !afterText.trim()) {
    return {
      selectionStart: 0,
      selectionEnd: beforeText.length,
      selectedText: beforeText,
    };
  }
  if (beforeText === afterText) {
    return null;
  }

  const beforeTokens = tokenizeDeleteOnlyTranscriptText(beforeText);
  const afterTokens = tokenizeDeleteOnlyTranscriptText(afterText);
  if (beforeTokens.length === 0) {
    return null;
  }
  if (afterTokens.length === 0) {
    return {
      selectionStart: 0,
      selectionEnd: beforeText.length,
      selectedText: beforeText,
    };
  }

  let prefixCount = 0;
  while (
    prefixCount < beforeTokens.length
    && prefixCount < afterTokens.length
    && beforeTokens[prefixCount]?.text === afterTokens[prefixCount]?.text
  ) {
    prefixCount += 1;
  }

  let suffixCount = 0;
  while (
    suffixCount < (beforeTokens.length - prefixCount)
    && suffixCount < (afterTokens.length - prefixCount)
    && beforeTokens[beforeTokens.length - 1 - suffixCount]?.text === afterTokens[afterTokens.length - 1 - suffixCount]?.text
  ) {
    suffixCount += 1;
  }

  const deleteStartIndex = prefixCount;
  const deleteEndIndexExclusive = beforeTokens.length - suffixCount;
  if (deleteStartIndex >= deleteEndIndexExclusive) {
    return null;
  }

  const deletedTokens = beforeTokens.slice(deleteStartIndex, deleteEndIndexExclusive);
  const expectedAfterTokens = [
    ...beforeTokens.slice(0, deleteStartIndex),
    ...beforeTokens.slice(deleteEndIndexExclusive),
  ].map((token) => token.text);
  if (
    expectedAfterTokens.length !== afterTokens.length
    || expectedAfterTokens.some((token, index) => token !== afterTokens[index]?.text)
  ) {
    return null;
  }

  const selectionStart = deletedTokens[0]?.start ?? 0;
  const selectionEnd = deletedTokens[deletedTokens.length - 1]?.end ?? selectionStart;
  if (selectionEnd <= selectionStart) {
    return null;
  }

  return {
    selectionStart,
    selectionEnd,
    selectedText: beforeText.slice(selectionStart, selectionEnd),
  };
}
