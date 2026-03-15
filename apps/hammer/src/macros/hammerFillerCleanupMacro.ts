import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  HammerDerivedTextChange,
  HammerDerivedTextOperation,
  HammerPersistedDerivedTextLayers,
  HammerPersistedStructuredTranscript,
} from "../persistence/hammerPersistenceContract";

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

function normalizeHammerDerivedTextOperations(change: {
  operations?: HammerDerivedTextOperation[];
  removed_fillers?: Array<{
    value: string;
    start: number;
    end: number;
  }>;
}): HammerDerivedTextOperation[] {
  if (Array.isArray(change.operations)) {
    return change.operations.map((operation) => ({ ...operation }));
  }

  if (Array.isArray(change.removed_fillers)) {
    return change.removed_fillers.map((removal) => ({
      kind: "filler_removed",
      value: removal.value,
      start: removal.start,
      end: removal.end,
    }));
  }

  return [];
}

function cloneTranscriptSegments(segments: HammerTranscriptSegment[]): HammerTranscriptSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

function cloneDerivedTextLayers(
  value: HammerPersistedStructuredTranscript["derived_text_layers"],
): HammerPersistedStructuredTranscript["derived_text_layers"] {
  if (!value) {
    return {
      schema_version: 1,
      active_layer_id: null,
      layers: [],
    };
  }

  return {
    schema_version: 1,
    active_layer_id: value.active_layer_id ?? null,
    layers: value.layers.map((layer) => ({
      ...layer,
      summary: { ...layer.summary },
      changes: layer.changes.map((change) => ({
        ...change,
        operations: normalizeHammerDerivedTextOperations(change),
      })),
    })),
  };
}

export function cloneHammerStructuredTranscript(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerPersistedStructuredTranscript | null {
  if (!transcript) return null;
  return {
    ...transcript,
    source_media_ref: transcript.source_media_ref ? { ...transcript.source_media_ref } : null,
    diarization: {
      ...transcript.diarization,
      labels: [...transcript.diarization.labels],
      raw_labels: [...transcript.diarization.raw_labels],
    },
    confidence_flags: transcript.confidence_flags.map((flag) => ({ ...flag })),
    segments: cloneTranscriptSegments(transcript.segments),
    derived_text_layers: cloneDerivedTextLayers(transcript.derived_text_layers),
  };
}

export function ensureHammerDerivedTextLayers(
  transcript: HammerPersistedStructuredTranscript,
): HammerPersistedDerivedTextLayers {
  return cloneDerivedTextLayers(transcript.derived_text_layers) ?? {
    schema_version: 1,
    active_layer_id: null,
    layers: [],
  };
}

export function cleanHammerDerivedTextWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

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

  const cleaned = cleanHammerDerivedTextWhitespace(working);
  return {
    cleaned,
    removed,
  };
}

export function buildHammerDerivedTextLayerId(nowIso: string): string {
  return `macro_run_${nowIso.replace(/[^0-9]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getHammerDerivedTextLayer(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
  layerId: string | null | undefined,
) {
  if (!transcript?.derived_text_layers || !layerId) return null;
  return transcript.derived_text_layers.layers.find((layer) => layer.layer_id === layerId) ?? null;
}

export function applyHammerDerivedTextLayerToSegments(
  segments: HammerTranscriptSegment[],
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerTranscriptSegment[] {
  const activeLayerId = transcript?.derived_text_layers?.active_layer_id ?? null;
  const activeLayer = getHammerDerivedTextLayer(transcript, activeLayerId);
  if (!activeLayer || activeLayer.status !== "active") {
    return cloneTranscriptSegments(segments);
  }

  const changeBySegmentId = new Map(
    activeLayer.changes.map((change) => [change.segment_id, change.cleaned_text]),
  );

  return segments.map((segment) => ({
    ...segment,
    text: changeBySegmentId.get(segment.segment_id) ?? segment.text,
  }));
}

export function setHammerDerivedTextLayerActive(
  transcript: HammerPersistedStructuredTranscript,
  layerId: string | null,
): HammerPersistedStructuredTranscript {
  const next = cloneHammerStructuredTranscript(transcript);
  if (!next) {
    throw new Error("Hammer structured transcript is required.");
  }

  const derived = ensureHammerDerivedTextLayers(next);
  derived.active_layer_id = layerId;
  derived.layers = derived.layers.map((layer) => ({
    ...layer,
    status: layer.layer_id === layerId
      ? "active"
      : layer.status === "discarded"
      ? "discarded"
      : "review",
  }));
  next.derived_text_layers = derived;
  return next;
}

export function discardHammerDerivedTextLayer(
  transcript: HammerPersistedStructuredTranscript,
  layerId: string,
): HammerPersistedStructuredTranscript {
  const next = cloneHammerStructuredTranscript(transcript);
  if (!next) {
    throw new Error("Hammer structured transcript is required.");
  }

  const derived = ensureHammerDerivedTextLayers(next);
  derived.layers = derived.layers.map((layer) => (
    layer.layer_id === layerId
      ? { ...layer, status: "discarded" as const }
      : layer
  ));
  if (derived.active_layer_id === layerId) {
    derived.active_layer_id = null;
  }
  next.derived_text_layers = derived;
  return next;
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

  const layerId = buildHammerDerivedTextLayerId(nowIso);
  const derived = ensureHammerDerivedTextLayers(next);
  const layer = {
    layer_id: layerId,
    recipe_ref: EXECUTABLE_FILLER_CLEANUP_RECIPE_REF,
    macro_kind: "filler_cleanup" as const,
    status: "review" as const,
    created_at: nowIso,
    based_on_transcript_id: next.transcript_id,
    summary: {
      changed_segment_count: changes.length,
      removal_count: changes.reduce((sum, change) => sum + change.operations.length, 0),
      untouched_segment_count: Math.max(next.segments.length - changes.length, 0),
    },
    changes,
  };

  derived.layers = [
    ...derived.layers.filter((existing) => existing.status !== "review"),
    layer,
  ];
  derived.active_layer_id = null;
  next.derived_text_layers = derived;

  return {
    transcript: next,
    layer_id: layerId,
    changed_segment_count: layer.summary.changed_segment_count,
    removal_count: layer.summary.removal_count,
  };
}
