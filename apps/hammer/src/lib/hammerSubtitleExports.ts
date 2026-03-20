import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { buildHammerCaptionPreviewModel, type HammerCaptionPreviewChunk } from "./hammerCaptionPreview";
import { cloneHammerStructuredTranscript, getHammerOutputDerivedTextLayer } from "../macros/hammerDerivedTranscriptLayers";
import type {
  HammerPersistedStructuredTranscript,
  HammerPersistedSubtitleArtifact,
  HammerPersistedSubtitleOutputs,
  HammerSubtitleFormat,
} from "../persistence/hammerPersistenceContract";

function ensureHammerSubtitleOutputs(
  transcript: HammerPersistedStructuredTranscript,
): HammerPersistedSubtitleOutputs {
  return transcript.subtitle_outputs
    ? {
      schema_version: 1,
      last_generated_format: transcript.subtitle_outputs.last_generated_format ?? null,
      srt: transcript.subtitle_outputs.srt ? { ...transcript.subtitle_outputs.srt } : null,
      vtt: transcript.subtitle_outputs.vtt ? { ...transcript.subtitle_outputs.vtt } : null,
    }
    : {
      schema_version: 1,
      last_generated_format: null,
      srt: null,
      vtt: null,
    };
}

function padTimeUnit(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

function formatSubtitleTimestamp(totalSeconds: number, format: HammerSubtitleFormat): string {
  const clampedMs = Math.max(Math.round(totalSeconds * 1000), 0);
  const hours = Math.floor(clampedMs / 3_600_000);
  const minutes = Math.floor((clampedMs % 3_600_000) / 60_000);
  const seconds = Math.floor((clampedMs % 60_000) / 1000);
  const milliseconds = clampedMs % 1000;
  const separator = format === "srt" ? "," : ".";
  return `${padTimeUnit(hours)}:${padTimeUnit(minutes)}:${padTimeUnit(seconds)}${separator}${padTimeUnit(milliseconds, 3)}`;
}

function renderSrt(chunks: HammerCaptionPreviewChunk[]): string {
  return chunks.map((chunk, index) => [
    String(index + 1),
    `${formatSubtitleTimestamp(chunk.start_sec, "srt")} --> ${formatSubtitleTimestamp(chunk.end_sec, "srt")}`,
    chunk.text,
  ].join("\n")).join("\n\n");
}

function renderVtt(chunks: HammerCaptionPreviewChunk[]): string {
  const body = chunks.map((chunk) => [
    `${formatSubtitleTimestamp(chunk.start_sec, "vtt")} --> ${formatSubtitleTimestamp(chunk.end_sec, "vtt")}`,
    chunk.text,
  ].join("\n")).join("\n\n");
  return body ? `WEBVTT\n\n${body}` : "WEBVTT\n";
}

export function getHammerSubtitleArtifact(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
  format: HammerSubtitleFormat,
): HammerPersistedSubtitleArtifact | null {
  return transcript?.subtitle_outputs?.[format] ?? null;
}

export function isHammerSubtitleArtifactCurrent(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
  format: HammerSubtitleFormat,
): boolean {
  if (!transcript) return false;
  const artifact = getHammerSubtitleArtifact(transcript, format);
  if (!artifact) return false;
  const outputLayer = getHammerOutputDerivedTextLayer(transcript);
  return artifact.source_transcript_id === transcript.transcript_id
    && artifact.source_layer_id === (outputLayer?.layer_id ?? null)
    && artifact.source_kind === (outputLayer ? "derived" : "raw")
    && artifact.source_recipe_ref === (outputLayer?.recipe_ref ?? null);
}

export function generateHammerSubtitleArtifact(args: {
  rawSegments: HammerTranscriptSegment[];
  transcript: HammerPersistedStructuredTranscript;
  format: HammerSubtitleFormat;
  generatedAt?: string;
}): HammerPersistedSubtitleArtifact {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const outputLayer = getHammerOutputDerivedTextLayer(args.transcript);
  const preview = buildHammerCaptionPreviewModel(args.rawSegments, args.transcript);
  const content = args.format === "srt"
    ? renderSrt(preview.chunks)
    : renderVtt(preview.chunks);

  return {
    format: args.format,
    generated_at: generatedAt,
    source_transcript_id: args.transcript.transcript_id,
    source_layer_id: outputLayer?.layer_id ?? null,
    source_kind: outputLayer ? "derived" : "raw",
    source_recipe_ref: outputLayer?.recipe_ref ?? null,
    approximate_timing: preview.approximate_timing,
    entry_count: preview.chunk_count,
    content,
  };
}

export function setHammerSubtitleArtifact(
  transcript: HammerPersistedStructuredTranscript,
  artifact: HammerPersistedSubtitleArtifact,
): HammerPersistedStructuredTranscript {
  const next = cloneHammerStructuredTranscript(transcript);
  if (!next) {
    throw new Error("Hammer structured transcript is required.");
  }

  const subtitleOutputs = ensureHammerSubtitleOutputs(next);
  subtitleOutputs.last_generated_format = artifact.format;
  subtitleOutputs[artifact.format] = { ...artifact };
  next.subtitle_outputs = subtitleOutputs;
  return next;
}
