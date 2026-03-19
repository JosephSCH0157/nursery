import assert from "node:assert/strict";
import {
  discardHammerDerivedTextLayer,
  getHammerActiveDerivedTextLayer,
  getHammerOutputDerivedTextLayer,
  listHammerDerivedTextLayers,
  resolveHammerDerivedTextInspectionLayerId,
  setHammerDerivedTextLayerActive,
  setHammerDerivedTextLayerOutput,
} from "../src/macros/hammerDerivedTranscriptLayers";
import { runHammerFillerCleanupMacro } from "../src/macros/hammerFillerCleanupMacro";
import { runHammerRetakeTighteningMacro } from "../src/macros/hammerRetakeTighteningMacro";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "transcript_layers_01",
  media_id: "media_layers_01",
  media_signature: "sig_layers_01",
  prepared_at: "2026-03-15T04:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_layers_01",
    kind: "recording_audio",
    source_hint: "local",
    local_relpath: "recordings/layers.wav",
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1"],
    raw_labels: ["host"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_layers_01",
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
      text: "I think- I think we should move.",
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
  const fillerRun = runHammerFillerCleanupMacro(transcript, "2026-03-15T04:05:00.000Z");
  const withActiveFiller = setHammerDerivedTextLayerActive(fillerRun.transcript, fillerRun.layer_id);
  const retakeRun = runHammerRetakeTighteningMacro(withActiveFiller, "2026-03-15T04:06:00.000Z");
  const layers = listHammerDerivedTextLayers(retakeRun.transcript);

  assert.equal(layers.length, 2);
  assert.equal(layers[0]?.macro_kind, "filler_cleanup");
  assert.equal(layers[0]?.status, "active");
  assert.equal(layers[1]?.macro_kind, "retake_tightening");
  assert.equal(layers[1]?.status, "review");
  assert.equal(retakeRun.transcript.derived_text_layers?.active_layer_id, fillerRun.layer_id);
}

{
  const fillerRun = runHammerFillerCleanupMacro(transcript, "2026-03-15T04:05:00.000Z");
  const retakeRun = runHammerRetakeTighteningMacro(fillerRun.transcript, "2026-03-15T04:06:00.000Z");
  const resolvedInspectionLayerId = resolveHammerDerivedTextInspectionLayerId(
    retakeRun.transcript,
    null,
    retakeRun.layer_id,
  );
  assert.equal(resolvedInspectionLayerId, retakeRun.layer_id);
}

{
  const fillerRun = runHammerFillerCleanupMacro(transcript, "2026-03-15T04:05:00.000Z");
  const active = setHammerDerivedTextLayerActive(fillerRun.transcript, fillerRun.layer_id);
  const discarded = discardHammerDerivedTextLayer(active, fillerRun.layer_id);

  assert.equal(getHammerActiveDerivedTextLayer(discarded), null);
  assert.equal(discarded.derived_text_layers?.active_layer_id, null);
  assert.equal(discarded.derived_text_layers?.layers[0]?.status, "discarded");
}

{
  const fillerRun = runHammerFillerCleanupMacro(transcript, "2026-03-15T04:05:00.000Z");
  const retakeRun = runHammerRetakeTighteningMacro(fillerRun.transcript, "2026-03-15T04:06:00.000Z");
  const activeFiller = setHammerDerivedTextLayerActive(retakeRun.transcript, fillerRun.layer_id);
  const outputRetake = setHammerDerivedTextLayerOutput(activeFiller, retakeRun.layer_id);

  assert.equal(outputRetake.derived_text_layers?.active_layer_id, fillerRun.layer_id);
  assert.equal(outputRetake.derived_text_layers?.output_layer_id, retakeRun.layer_id);
  assert.equal(getHammerActiveDerivedTextLayer(outputRetake)?.layer_id, fillerRun.layer_id);
  assert.equal(getHammerOutputDerivedTextLayer(outputRetake)?.layer_id, retakeRun.layer_id);
}

{
  const fillerRun = runHammerFillerCleanupMacro(transcript, "2026-03-15T04:05:00.000Z");
  const withOutput = setHammerDerivedTextLayerOutput(fillerRun.transcript, fillerRun.layer_id);
  const discarded = discardHammerDerivedTextLayer(withOutput, fillerRun.layer_id);

  assert.equal(discarded.derived_text_layers?.output_layer_id, null);
  assert.equal(getHammerOutputDerivedTextLayer(discarded), null);
}

{
  const legacyTranscript = {
    ...transcript,
    derived_text_layers: {
      schema_version: 1 as const,
      active_layer_id: null,
      layers: [],
    },
  } as unknown as HammerPersistedStructuredTranscript;
  assert.equal(getHammerOutputDerivedTextLayer(legacyTranscript), null);
}

console.log("Hammer derived transcript layer tests passed.");
