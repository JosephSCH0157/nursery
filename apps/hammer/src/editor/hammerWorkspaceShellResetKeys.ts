import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { stableHashToken } from "./hammerWorkspaceShellCore";

export function buildStructuredTranscriptResetKey(
  transcript: HammerPersistedStructuredTranscript | null | undefined,
): string {
  if (!transcript) return "structured-transcript:none";
  return `structured-transcript:${stableHashToken(JSON.stringify({
    transcriptId: transcript.transcript_id,
    preparedAt: transcript.prepared_at,
    mediaSignature: transcript.media_signature,
    segmentCount: transcript.segments.length,
    segments: transcript.segments.map((segment) => ({
      id: segment.segment_id,
      speaker: segment.speaker,
      text: segment.text,
      start: segment.start_sec,
      end: segment.end_sec,
      disabled: segment.is_disabled === true,
    })),
    derivedTextLayers: transcript.derived_text_layers
      ? {
        activeLayerId: transcript.derived_text_layers.active_layer_id ?? null,
        outputLayerId: transcript.derived_text_layers.output_layer_id ?? null,
        layerIds: transcript.derived_text_layers.layers.map((layer) => layer.layer_id),
      }
      : null,
  }))}`;
}

export function buildVisualTimelineResetKey(
  timeline: HammerVisualTimelineState | null | undefined,
): string {
  if (!timeline) return "visual-timeline:none";
  return `visual-timeline:${stableHashToken(JSON.stringify({
    revision: timeline.revision,
    updatedAt: timeline.updated_at,
    selectedClipId: timeline.selected_clip_id,
    clipCount: timeline.clips.length,
    assetCount: timeline.assets.length,
    clipIds: timeline.clips.map((clip) => clip.clip_id),
  }))}`;
}
