import assert from "node:assert/strict";
import { buildHammerCaptionPreviewModel } from "../src/lib/hammerCaptionPreview";
import { setHammerDerivedTextLayerActive, setHammerDerivedTextLayerOutput } from "../src/macros/hammerDerivedTranscriptLayers";
import { runHammerFillerCleanupMacro } from "../src/macros/hammerFillerCleanupMacro";
import { runHammerRetakeTighteningMacro } from "../src/macros/hammerRetakeTighteningMacro";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "caption_preview_01",
  media_id: "media_caption_preview_01",
  media_signature: "sig_caption_preview_01",
  prepared_at: "2026-03-15T08:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_caption_preview_01",
    kind: "recording_audio",
    source_hint: "local",
    local_relpath: "recordings/caption-preview.wav",
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1"],
    raw_labels: ["host"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_caption_preview_01",
    model: "gpt-4o-transcribe",
  },
  confidence_flags: [],
  segments: [
    {
      segment_id: "seg_a",
      start_sec: 0,
      end_sec: 2,
      speaker: "S1",
      text: "Um this is the start.",
    },
    {
      segment_id: "seg_b",
      start_sec: 2,
      end_sec: 4,
      speaker: "S1",
      text: "I think I think we should move forward.",
    },
  ],
  derived_text_layers: {
    schema_version: 1,
    active_layer_id: null,
    output_layer_id: null,
    layers: [],
  },
};

{
  const preview = buildHammerCaptionPreviewModel(transcript.segments, transcript);
  assert.equal(preview.source_kind, "raw");
  assert.equal(preview.source_layer_id, null);
  assert.equal(preview.chunk_count, 2);
  assert.equal(preview.chunks[0]?.text, "Um this is the start.");
}

{
  const fillerRun = runHammerFillerCleanupMacro(transcript, "2026-03-15T08:05:00.000Z");
  const withActiveFiller = setHammerDerivedTextLayerActive(fillerRun.transcript, fillerRun.layer_id);
  const retakeRun = runHammerRetakeTighteningMacro(withActiveFiller, "2026-03-15T08:06:00.000Z");
  const withRetakeOutput = setHammerDerivedTextLayerOutput(retakeRun.transcript, retakeRun.layer_id);
  const preview = buildHammerCaptionPreviewModel(transcript.segments, withRetakeOutput);

  assert.equal(preview.source_kind, "derived");
  assert.equal(preview.source_layer_id, retakeRun.layer_id);
  assert.equal(preview.chunks[0]?.text, "Um this is the start.");
  assert.equal(preview.chunks[1]?.text, "I think we should move forward.");
}

{
  const longTurnTranscript: HammerPersistedStructuredTranscript = {
    ...transcript,
    transcript_id: "caption_preview_02",
    segments: [
      {
        segment_id: "seg_long",
        start_sec: 0,
        end_sec: 6,
        speaker: "S1",
        text: "This is a longer sentence that keeps going so the preview has to split it for readability. This second sentence also keeps moving to prove the chunking stays deterministic.",
      },
    ],
  };
  const preview = buildHammerCaptionPreviewModel(longTurnTranscript.segments, longTurnTranscript);

  assert.equal(preview.source_kind, "raw");
  assert.equal(preview.chunk_count > 1, true);
  assert.equal(preview.approximate_timing, true);
  assert.equal(preview.chunks.every((chunk) => chunk.approximate_timing), true);
}

console.log("Hammer caption preview tests passed.");
