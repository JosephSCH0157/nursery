import { applyHammerOutputDerivedTextLayerToSegments, getHammerOutputDerivedTextLayer } from "../macros/hammerDerivedTranscriptLayers";
import { buildHammerCaptionPreviewModel } from "./hammerCaptionPreview";
import { getHammerSubtitleArtifact, isHammerSubtitleArtifactCurrent } from "./hammerSubtitleExports";
import type {
  HammerDerivedTextMacroKind,
  HammerPersistedStructuredTranscript,
  HammerPersistedSubtitleArtifact,
  HammerSubtitleFormat,
} from "../persistence/hammerPersistenceContract";

export type HammerTextOutputArtifactFreshness = "missing" | "current" | "stale";

export interface HammerTextOutputPackageSubtitleEntry {
  format: HammerSubtitleFormat;
  freshness: HammerTextOutputArtifactFreshness;
  artifact: HammerPersistedSubtitleArtifact | null;
}

export interface HammerTextOutputPackage {
  schema_version: 1;
  transcript_source: {
    transcript_id: string;
    media_id: string | null;
    media_signature: string | null;
    prepared_at: string;
    structure: "speaker_turns";
    segment_count: number;
    speaker_labels: string[];
  };
  output_selection: {
    source_kind: "raw" | "derived";
    layer_id: string | null;
    recipe_ref: string | null;
    macro_kind: HammerDerivedTextMacroKind | null;
    based_on_transcript_id: string | null;
  };
  resolved_output: {
    segment_count: number;
    segments: HammerPersistedStructuredTranscript["segments"];
    full_text: string;
    approximate_caption_timing: boolean;
    caption_preview_row_count: number;
  };
  subtitles: {
    last_generated_format: HammerSubtitleFormat | null;
    srt: HammerTextOutputPackageSubtitleEntry;
    vtt: HammerTextOutputPackageSubtitleEntry;
  };
}

function cloneSegments(
  segments: HammerPersistedStructuredTranscript["segments"],
): HammerPersistedStructuredTranscript["segments"] {
  return segments.map((segment) => ({ ...segment }));
}

function buildSubtitleEntry(
  transcript: HammerPersistedStructuredTranscript,
  format: HammerSubtitleFormat,
): HammerTextOutputPackageSubtitleEntry {
  const artifact = getHammerSubtitleArtifact(transcript, format);
  return {
    format,
    freshness: artifact
      ? isHammerSubtitleArtifactCurrent(transcript, format)
        ? "current"
        : "stale"
      : "missing",
    artifact: artifact ? { ...artifact } : null,
  };
}

export function buildHammerTextOutputsPackage(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): HammerTextOutputPackage | null {
  if (!transcript) return null;

  const outputLayer = getHammerOutputDerivedTextLayer(transcript);
  const outputSegments = applyHammerOutputDerivedTextLayerToSegments(transcript.segments, transcript);
  const captionPreview = buildHammerCaptionPreviewModel(transcript.segments, transcript);

  return {
    schema_version: 1,
    transcript_source: {
      transcript_id: transcript.transcript_id,
      media_id: transcript.media_id,
      media_signature: transcript.media_signature,
      prepared_at: transcript.prepared_at,
      structure: transcript.structure,
      segment_count: transcript.segments.length,
      speaker_labels: [...transcript.diarization.labels],
    },
    output_selection: {
      source_kind: outputLayer ? "derived" : "raw",
      layer_id: outputLayer?.layer_id ?? null,
      recipe_ref: outputLayer?.recipe_ref ?? null,
      macro_kind: outputLayer?.macro_kind ?? null,
      based_on_transcript_id: outputLayer?.based_on_transcript_id ?? null,
    },
    resolved_output: {
      segment_count: outputSegments.length,
      segments: cloneSegments(outputSegments),
      full_text: outputSegments.map((segment) => `${segment.speaker}: ${segment.text}`).join("\n"),
      approximate_caption_timing: captionPreview.approximate_timing,
      caption_preview_row_count: captionPreview.chunk_count,
    },
    subtitles: {
      last_generated_format: transcript.subtitle_outputs?.last_generated_format ?? null,
      srt: buildSubtitleEntry(transcript, "srt"),
      vtt: buildSubtitleEntry(transcript, "vtt"),
    },
  };
}
