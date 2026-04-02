type MediaRef = {
  media_id: string;
  kind: string;
  source_hint?: string;
  local_relpath?: string;
  cloud_uri?: string;
  byte_size?: number;
  duration_ms?: number;
  sha256?: string;
};

type HammerTranscriptSegment = {
  segment_id: string;
  start_sec: number;
  end_sec: number;
  speaker: string;
  text: string;
};

export type HammerDerivedTextMacroKind =
  | "filler_cleanup"
  | "retake_tightening"
  | "speaker_solo"
  | "speaker_interview"
  | "speaker_monologue"
  | "speaker_panel";

export type HammerDerivedTextOperationKind =
  | "filler_removed"
  | "retake_fragment_removed";

export interface HammerDerivedTextOperation {
  kind: HammerDerivedTextOperationKind;
  value: string;
  start: number;
  end: number;
}

export interface HammerDerivedTextChange {
  segment_id: string;
  original_text: string;
  cleaned_text: string;
  operations: HammerDerivedTextOperation[];
}

export interface HammerDerivedTextLayer {
  layer_id: string;
  recipe_ref: string;
  macro_kind: HammerDerivedTextMacroKind;
  status: "review" | "active" | "discarded";
  created_at: string;
  based_on_transcript_id: string;
  summary: {
    changed_segment_count: number;
    removal_count: number;
    untouched_segment_count: number;
  };
  changes: HammerDerivedTextChange[];
}

export interface HammerPersistedDerivedTextLayers {
  schema_version: 1;
  active_layer_id: string | null;
  output_layer_id: string | null;
  layers: HammerDerivedTextLayer[];
}

export type HammerSubtitleFormat = "srt" | "vtt";

export interface HammerPersistedSubtitleArtifact {
  format: HammerSubtitleFormat;
  generated_at: string;
  source_transcript_id: string;
  source_layer_id: string | null;
  source_kind: "raw" | "derived";
  source_recipe_ref: string | null;
  approximate_timing: boolean;
  entry_count: number;
  content: string;
}

export interface HammerPersistedSubtitleOutputs {
  schema_version: 1;
  last_generated_format: HammerSubtitleFormat | null;
  srt: HammerPersistedSubtitleArtifact | null;
  vtt: HammerPersistedSubtitleArtifact | null;
}

export interface HammerPersistedStructuredTranscript {
  schema_version: 1;
  transcript_id: string;
  media_id: string | null;
  media_signature: string | null;
  prepared_at: string;
  structure: "speaker_turns";
  source_media_ref: MediaRef | null;
  diarization: {
    label_scheme: "forge-neutral-speakers.v1";
    labels: string[];
    raw_labels: string[];
    version: string | null;
    provider: "openai";
    provider_request_id: string | null;
    model: string | null;
  };
  confidence_flags: Array<{
    turn_id: string;
    code: "speaker_boundary_low_confidence";
    detail: string;
  }>;
  segments: HammerTranscriptSegment[];
  derived_text_layers?: HammerPersistedDerivedTextLayers;
  subtitle_outputs?: HammerPersistedSubtitleOutputs;
}

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

export function normalizeHammerStructuredTranscript(
  value: unknown,
): HammerPersistedStructuredTranscript | null {
  const row = readObject(value);
  if (!row) return null;
  return cloneHammerStructuredTranscript(row as unknown as HammerPersistedStructuredTranscript);
}
