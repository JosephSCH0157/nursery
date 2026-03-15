import assert from "node:assert/strict";
import {
  applyHammerDerivedTextLayerToSegments,
  discardHammerDerivedTextLayer,
  runHammerFillerCleanupMacro,
  setHammerDerivedTextLayerActive,
} from "../src/macros/hammerFillerCleanupMacro";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "transcript_01",
  media_id: "media_01",
  media_signature: "sig_01",
  prepared_at: "2026-03-15T02:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_01",
    kind: "recording_audio",
    source_hint: "local",
    local_relpath: "recordings/example.wav",
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1", "G1"],
    raw_labels: ["host", "guest"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_01",
    model: "gpt-4o-transcribe",
  },
  confidence_flags: [],
  segments: [
    {
      segment_id: "seg_001",
      start_sec: 0,
      end_sec: 2,
      speaker: "S1",
      text: "Um this is the opening line.",
    },
    {
      segment_id: "seg_002",
      start_sec: 2,
      end_sec: 4,
      speaker: "G1",
      text: "This line stays the same.",
    },
    {
      segment_id: "seg_003",
      start_sec: 4,
      end_sec: 6,
      speaker: "S1",
      text: "It was, like, honestly surprising.",
    },
  ],
  derived_text_layers: {
    schema_version: 1,
    active_layer_id: null,
    layers: [],
  },
};

{
  const run = runHammerFillerCleanupMacro(transcript, "2026-03-15T02:05:00.000Z");
  assert.equal(run.changed_segment_count, 2);
  assert.equal(run.removal_count, 2);
  assert.equal(run.transcript.segments[0]?.text, "Um this is the opening line.");
  assert.equal(run.transcript.derived_text_layers?.layers.length, 1);
  assert.equal(run.transcript.derived_text_layers?.layers[0]?.status, "review");
  assert.equal(run.transcript.derived_text_layers?.layers[0]?.changes[0]?.cleaned_text, "this is the opening line.");
}

{
  const run = runHammerFillerCleanupMacro(transcript, "2026-03-15T02:05:00.000Z");
  const active = setHammerDerivedTextLayerActive(run.transcript, run.layer_id);
  const effectiveSegments = applyHammerDerivedTextLayerToSegments(active.segments, active);
  assert.equal(effectiveSegments[0]?.text, "this is the opening line.");
  assert.equal(effectiveSegments[1]?.text, "This line stays the same.");
  assert.equal(effectiveSegments[2]?.text, "It was, honestly surprising.");

  const discarded = discardHammerDerivedTextLayer(active, run.layer_id);
  assert.equal(discarded.derived_text_layers?.active_layer_id, null);
  assert.equal(discarded.derived_text_layers?.layers[0]?.status, "discarded");
}

console.log("Hammer filler cleanup macro tests passed.");
