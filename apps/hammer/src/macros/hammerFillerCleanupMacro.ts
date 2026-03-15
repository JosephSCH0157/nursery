import type { HammerDerivedTextChange, HammerDerivedTextOperation, HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import {
  appendHammerDerivedTextLayer,
  cleanHammerDerivedTextWhitespace,
  cloneHammerStructuredTranscript,
  createHammerDerivedTextLayer,
} from "./hammerDerivedTranscriptLayers";

const FILLER_RULES = [
  {
    pattern: /^\s*(um+|uh+)\b[\s,.-]*/i,
    valueResolver: (match: RegExpExecArray) => match[1] ?? match[0],
  },
  {
    pattern: /^\s*(you know|i mean|like)\b[\s,.-]*/i,
    valueResolver: (match: RegExpExecArray) => match[1] ?? match[0],
  },
  {
    pattern: /([,;:-]\s*)(um+|uh+|you know|i mean|like)\b(?=(\s*[,;:-]|\s))/i,
    valueResolver: (match: RegExpExecArray) => match[2] ?? match[0],
  },
  {
    pattern: /\s+(um+|uh+)\b$/i,
    valueResolver: (match: RegExpExecArray) => match[1] ?? match[0],
  },
];

export const EXECUTABLE_FILLER_CLEANUP_RECIPE_REF = "macro:podcast_cleanup.v1" as const;

export type HammerFillerCleanupRunResult = {
  transcript: HammerPersistedStructuredTranscript;
  layer_id: string;
  changed_segment_count: number;
  removal_count: number;
};

function removeConservativeFillers(text: string): {
  cleaned: string;
  removed: HammerDerivedTextOperation[];
} {
  let working = text;
  const removed: HammerDerivedTextOperation[] = [];

  let mutated = true;
  while (mutated) {
    mutated = false;
    for (const rule of FILLER_RULES) {
      const match = rule.pattern.exec(working);
      if (!match || match.index == null) continue;
      const full = match[0];
      const matchedValue = rule.valueResolver(match).trim();
      const start = match.index;
      const end = start + full.length;
      removed.push({
        kind: "filler_removed",
        value: matchedValue,
        start,
        end,
      });
      working = `${working.slice(0, start)} ${working.slice(end)}`;
      mutated = true;
      break;
    }
  }

  return {
    cleaned: cleanHammerDerivedTextWhitespace(working),
    removed,
  };
}

export function runHammerFillerCleanupMacro(
  transcript: HammerPersistedStructuredTranscript,
  nowIso = new Date().toISOString(),
): HammerFillerCleanupRunResult {
  const next = cloneHammerStructuredTranscript(transcript);
  if (!next) {
    throw new Error("Hammer structured transcript is required.");
  }

  const changes: HammerDerivedTextChange[] = next.segments.flatMap((segment) => {
    const result = removeConservativeFillers(segment.text);
    if (
      !result.cleaned
      || result.cleaned === cleanHammerDerivedTextWhitespace(segment.text)
      || result.removed.length === 0
    ) {
      return [];
    }
    return [{
      segment_id: segment.segment_id,
      original_text: segment.text,
      cleaned_text: result.cleaned,
      operations: result.removed,
    }];
  });

  const layer = createHammerDerivedTextLayer({
    transcriptId: next.transcript_id,
    recipeRef: EXECUTABLE_FILLER_CLEANUP_RECIPE_REF,
    macroKind: "filler_cleanup",
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
