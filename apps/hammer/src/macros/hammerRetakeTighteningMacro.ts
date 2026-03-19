import type {
  HammerDerivedTextChange,
  HammerDerivedTextOperation,
  HammerPersistedStructuredTranscript,
} from "../persistence/hammerPersistenceContract";
import {
  appendHammerDerivedTextLayer,
  cleanHammerDerivedTextWhitespace,
  cloneHammerStructuredTranscript,
  createHammerDerivedTextLayer,
} from "./hammerDerivedTranscriptLayers";

export const EXECUTABLE_RETAKE_TIGHTENING_RECIPE_REF = "macro:interview_tight_cut.v1" as const;

type IndexedToken = {
  value: string;
  start: number;
  end: number;
};

export type HammerRetakeTighteningRunResult = {
  transcript: HammerPersistedStructuredTranscript;
  layer_id: string;
  changed_segment_count: number;
  removal_count: number;
};

function tokenizeForRetakeDetection(text: string): IndexedToken[] {
  const tokens: IndexedToken[] = [];
  const pattern = /[A-Za-z0-9']+/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    const value = match[0];
    if (value) {
      tokens.push({
        value: value.toLowerCase(),
        start: match.index,
        end: match.index + value.length,
      });
    }
    match = pattern.exec(text);
  }
  return tokens;
}

function detectRepeatedStartFragment(text: string): HammerDerivedTextOperation | null {
  const tokens = tokenizeForRetakeDetection(text);
  const maxPhraseLength = Math.min(6, Math.floor(tokens.length / 2));
  for (let phraseLength = maxPhraseLength; phraseLength >= 2; phraseLength -= 1) {
    const firstPhrase = tokens.slice(0, phraseLength);
    const repeatedPhrase = tokens.slice(phraseLength, phraseLength * 2);
    if (repeatedPhrase.length !== phraseLength) continue;
    const isRepeated = firstPhrase.every((token, index) => token.value === repeatedPhrase[index]?.value);
    if (!isRepeated) continue;

    const repeatedStart = repeatedPhrase[0]?.start ?? -1;
    if (repeatedStart <= 0) continue;

    const removedFragment = text.slice(0, repeatedStart).trim();
    if (!removedFragment) continue;

    return {
      kind: "retake_fragment_removed",
      value: removedFragment,
      start: 0,
      end: repeatedStart,
    };
  }

  return null;
}

function tightenConservativeRetake(text: string): {
  cleaned: string;
  operations: HammerDerivedTextOperation[];
} {
  const operation = detectRepeatedStartFragment(text);
  if (!operation) {
    return {
      cleaned: cleanHammerDerivedTextWhitespace(text),
      operations: [],
    };
  }

  return {
    cleaned: cleanHammerDerivedTextWhitespace(text.slice(operation.end)),
    operations: [operation],
  };
}

export function runHammerRetakeTighteningMacro(
  transcript: HammerPersistedStructuredTranscript,
  nowIso = new Date().toISOString(),
): HammerRetakeTighteningRunResult {
  const next = cloneHammerStructuredTranscript(transcript);
  if (!next) {
    throw new Error("Hammer structured transcript is required.");
  }

  const changes: HammerDerivedTextChange[] = next.segments.flatMap((segment) => {
    const result = tightenConservativeRetake(segment.text);
    if (
      result.operations.length === 0
      || !result.cleaned
      || result.cleaned === cleanHammerDerivedTextWhitespace(segment.text)
    ) {
      return [];
    }

    return [{
      segment_id: segment.segment_id,
      original_text: segment.text,
      cleaned_text: result.cleaned,
      operations: result.operations,
    }];
  });

  const layer = createHammerDerivedTextLayer({
    transcriptId: next.transcript_id,
    recipeRef: EXECUTABLE_RETAKE_TIGHTENING_RECIPE_REF,
    macroKind: "retake_tightening",
    changes,
    nowIso,
  });
  layer.summary.untouched_segment_count = Math.max(next.segments.length - changes.length, 0);
  const withLayer = appendHammerDerivedTextLayer(next, layer);

  return {
    transcript: withLayer,
    layer_id: layer.layer_id,
    changed_segment_count: layer.summary.changed_segment_count,
    removal_count: layer.summary.removal_count,
  };
}
