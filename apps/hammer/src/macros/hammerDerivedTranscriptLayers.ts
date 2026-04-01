import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  HammerDerivedTextChange,
  HammerDerivedTextLayer,
  HammerDerivedTextMacroKind,
  HammerDerivedTextOperation,
  HammerPersistedDerivedTextLayers,
  HammerPersistedSubtitleOutputs,
  HammerPersistedStructuredTranscript,
} from "../persistence/hammerPersistenceContract";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

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

function sortHammerDerivedTextLayers(layers: HammerDerivedTextLayer[]): HammerDerivedTextLayer[] {
  const statusRank = (status: HammerDerivedTextLayer["status"]): number => {
    switch (status) {
      case "active":
        return 0;
      case "review":
        return 1;
      case "discarded":
      default:
        return 2;
    }
  };

  return [...layers].sort((left, right) => {
    const rankDelta = statusRank(left.status) - statusRank(right.status);
    if (rankDelta !== 0) return rankDelta;
    return right.created_at.localeCompare(left.created_at);
  });
}

function normalizeHammerSubtitleArtifact(
  value: unknown,
  format: "srt" | "vtt",
): HammerPersistedSubtitleOutputs["srt"] {
  const row = readObject(value);
  if (!row) return null;

  const generatedAt = readString(row.generated_at);
  const sourceTranscriptId = readString(row.source_transcript_id);
  const sourceKind = readString(row.source_kind);
  const approximateTiming = readBoolean(row.approximate_timing);
  const entryCount = readNumber(row.entry_count);
  const content = readString(row.content);
  if (
    readString(row.format) !== format
    || !generatedAt
    || !sourceTranscriptId
    || (sourceKind !== "raw" && sourceKind !== "derived")
    || approximateTiming == null
    || entryCount == null
    || entryCount < 0
    || !content
  ) {
    return null;
  }

  const sourceLayerId = row.source_layer_id == null ? null : readString(row.source_layer_id);
  const sourceRecipeRef = row.source_recipe_ref == null ? null : readString(row.source_recipe_ref);
  if (row.source_layer_id != null && !sourceLayerId) {
    return null;
  }
  if (row.source_recipe_ref != null && !sourceRecipeRef) {
    return null;
  }

  return {
    format,
    generated_at: generatedAt,
    source_transcript_id: sourceTranscriptId,
    source_layer_id: sourceLayerId,
    source_kind: sourceKind,
    source_recipe_ref: sourceRecipeRef,
    approximate_timing: approximateTiming,
    entry_count: entryCount,
    content,
  };
}

export function cloneHammerSubtitleOutputs(
  value: HammerPersistedSubtitleOutputs | null | undefined,
): HammerPersistedSubtitleOutputs | undefined {
  if (!value) return undefined;
  return {
    schema_version: 1,
    last_generated_format: value.last_generated_format === "vtt" ? "vtt" : value.last_generated_format === "srt" ? "srt" : null,
    srt: normalizeHammerSubtitleArtifact(value.srt, "srt"),
    vtt: normalizeHammerSubtitleArtifact(value.vtt, "vtt"),
  };
}

export function ensureHammerSubtitleOutputs(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerPersistedSubtitleOutputs {
  return cloneHammerSubtitleOutputs(transcript?.subtitle_outputs) ?? {
    schema_version: 1,
    last_generated_format: null,
    srt: null,
    vtt: null,
  };
}

export function cloneHammerDerivedTextLayers(
  value: HammerPersistedStructuredTranscript["derived_text_layers"],
): HammerPersistedStructuredTranscript["derived_text_layers"] {
  if (!value) {
    return {
      schema_version: 1,
      active_layer_id: null,
      output_layer_id: null,
      layers: [],
    };
  }

  const layers = sortHammerDerivedTextLayers(value.layers.map((layer) => ({
    ...layer,
    summary: { ...layer.summary },
    changes: layer.changes.map((change) => ({
      ...change,
      operations: normalizeHammerDerivedTextOperations(change),
    })),
  })));
  const hasSelectableLayer = (layerId: string | null | undefined): boolean => (
    Boolean(layerId) && layers.some((layer) => layer.layer_id === layerId && layer.status !== "discarded")
  );

  return {
    schema_version: 1,
    active_layer_id: hasSelectableLayer(value.active_layer_id) ? value.active_layer_id ?? null : null,
    output_layer_id: hasSelectableLayer((value as { output_layer_id?: string | null }).output_layer_id)
      ? (value as { output_layer_id?: string | null }).output_layer_id ?? null
      : null,
    layers,
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
    derived_text_layers: cloneHammerDerivedTextLayers(transcript.derived_text_layers),
    subtitle_outputs: cloneHammerSubtitleOutputs(transcript.subtitle_outputs),
  };
}

export function ensureHammerDerivedTextLayers(
  transcript: HammerPersistedStructuredTranscript,
): HammerPersistedDerivedTextLayers {
  return cloneHammerDerivedTextLayers(transcript.derived_text_layers) ?? {
    schema_version: 1,
    active_layer_id: null,
    output_layer_id: null,
    layers: [],
  };
}

export function cleanHammerDerivedTextWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

export function buildHammerDerivedTextLayerId(nowIso: string): string {
  return `macro_run_${nowIso.replace(/[^0-9]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createHammerDerivedTextLayer(input: {
  transcriptId: string;
  recipeRef: string;
  macroKind: HammerDerivedTextMacroKind;
  changes: HammerDerivedTextChange[];
  nowIso: string;
}): HammerDerivedTextLayer {
  return {
    layer_id: buildHammerDerivedTextLayerId(input.nowIso),
    recipe_ref: input.recipeRef,
    macro_kind: input.macroKind,
    status: "review",
    created_at: input.nowIso,
    based_on_transcript_id: input.transcriptId,
    summary: {
      changed_segment_count: input.changes.length,
      removal_count: input.changes.reduce((sum, change) => sum + change.operations.length, 0),
      untouched_segment_count: 0,
    },
    changes: input.changes,
  };
}

export function getHammerDerivedTextLayer(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
  layerId: string | null | undefined,
): HammerDerivedTextLayer | null {
  if (!transcript?.derived_text_layers || !layerId) return null;
  return transcript.derived_text_layers.layers.find((layer) => layer.layer_id === layerId) ?? null;
}

export function listHammerDerivedTextLayers(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
  options?: {
    includeDiscarded?: boolean;
  },
): HammerDerivedTextLayer[] {
  const layers = cloneHammerDerivedTextLayers(transcript?.derived_text_layers)?.layers ?? [];
  if (options?.includeDiscarded === false) {
    return layers.filter((layer) => layer.status !== "discarded");
  }
  return layers;
}

export interface HammerOutputSelectionRef {
  layerId: string | null;
  sourceRecipeRef: string | null;
}

export function normalizeHammerOutputSelectionRef(args: {
  selection: {
    layerId: string | null | undefined;
    sourceRecipeRef?: string | null | undefined;
  };
  layers: HammerDerivedTextLayer[];
}): HammerOutputSelectionRef {
  const layerId = args.selection.layerId;
  if (!layerId) {
    return {
      layerId: null,
      sourceRecipeRef: null,
    };
  }

  const layer = args.layers.find((item) => item.layer_id === layerId && item.status !== "discarded") ?? null;
  if (!layer) {
    return {
      layerId: null,
      sourceRecipeRef: null,
    };
  }

  return {
    layerId: layer.layer_id,
    sourceRecipeRef: layer.recipe_ref,
  };
}

export function getHammerActiveDerivedTextLayer(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerDerivedTextLayer | null {
  return getHammerDerivedTextLayer(transcript, transcript?.derived_text_layers?.active_layer_id ?? null);
}

export function getHammerOutputDerivedTextLayer(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerDerivedTextLayer | null {
  return getHammerDerivedTextLayer(transcript, transcript?.derived_text_layers?.output_layer_id ?? null);
}

export function resolveHammerDerivedTextInspectionLayerId(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
  preferredLayerId: string | null | undefined,
  lastRunRef?: string | null | undefined,
): string | null {
  const preferredLayer = getHammerDerivedTextLayer(transcript, preferredLayerId);
  if (preferredLayer) {
    return preferredLayer.layer_id;
  }

  const lastRunLayer = getHammerDerivedTextLayer(transcript, lastRunRef ?? null);
  if (lastRunLayer && lastRunLayer.status !== "discarded") {
    return lastRunLayer.layer_id;
  }

  const activeLayer = getHammerActiveDerivedTextLayer(transcript);
  if (activeLayer) {
    return activeLayer.layer_id;
  }

  const remaining = listHammerDerivedTextLayers(transcript, { includeDiscarded: false });
  if (remaining.length > 0) {
    return remaining[0]?.layer_id ?? null;
  }

  return listHammerDerivedTextLayers(transcript)[0]?.layer_id ?? null;
}

export function applyHammerDerivedTextLayerToSegments(
  segments: HammerTranscriptSegment[],
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerTranscriptSegment[] {
  const activeLayer = getHammerActiveDerivedTextLayer(transcript);
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

export function applyHammerOutputDerivedTextLayerToSegments(
  segments: HammerTranscriptSegment[],
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerTranscriptSegment[] {
  const outputLayer = getHammerOutputDerivedTextLayer(transcript);
  if (!outputLayer || outputLayer.status === "discarded") {
    return cloneTranscriptSegments(segments);
  }

  const changeBySegmentId = new Map(
    outputLayer.changes.map((change) => [change.segment_id, change.cleaned_text]),
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
  derived.layers = sortHammerDerivedTextLayers(derived.layers.map((layer) => ({
    ...layer,
    status: layer.layer_id === layerId
      ? "active"
      : layer.status === "discarded"
      ? "discarded"
      : "review",
  })));
  next.derived_text_layers = derived;
  return next;
}

export function setHammerDerivedTextLayerOutput(
  transcript: HammerPersistedStructuredTranscript,
  layerId: string | null,
): HammerPersistedStructuredTranscript {
  const next = cloneHammerStructuredTranscript(transcript);
  if (!next) {
    throw new Error("Hammer structured transcript is required.");
  }

  const derived = ensureHammerDerivedTextLayers(next);
  const canSelectLayer = layerId
    ? derived.layers.some((layer) => layer.layer_id === layerId && layer.status !== "discarded")
    : false;
  derived.output_layer_id = canSelectLayer ? layerId : null;
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
  derived.layers = sortHammerDerivedTextLayers(derived.layers.map((layer) => (
    layer.layer_id === layerId
      ? { ...layer, status: "discarded" as const }
      : layer
  )));
  if (derived.active_layer_id === layerId) {
    derived.active_layer_id = null;
  }
  if (derived.output_layer_id === layerId) {
    derived.output_layer_id = null;
  }
  next.derived_text_layers = derived;
  return next;
}

export function appendHammerDerivedTextLayer(
  transcript: HammerPersistedStructuredTranscript,
  layer: HammerDerivedTextLayer,
): HammerPersistedStructuredTranscript {
  const next = cloneHammerStructuredTranscript(transcript);
  if (!next) {
    throw new Error("Hammer structured transcript is required.");
  }

  const derived = ensureHammerDerivedTextLayers(next);
  const nextLayer = {
    ...layer,
    summary: { ...layer.summary },
    changes: layer.changes.map((change) => ({
      ...change,
      operations: change.operations.map((operation) => ({ ...operation })),
    })),
  };
  derived.layers = sortHammerDerivedTextLayers([
    ...derived.layers.filter((existing) => existing.layer_id !== nextLayer.layer_id),
    nextLayer,
  ]);
  next.derived_text_layers = derived;
  return next;
}
