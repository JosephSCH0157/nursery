import assert from "node:assert/strict";
import {
  cloneHammerStructuredTranscript,
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

{
  const normalized = cloneHammerStructuredTranscript({
    ...transcript,
    derived_text_layers: {
      schema_version: 1,
      active_layer_id: "missing_active",
      output_layer_id: "missing_output",
      layers: [
        {
          layer_id: "legacy_layer",
          recipe_ref: "macro:podcast_cleanup.v1",
          macro_kind: "filler_cleanup",
          status: "review",
          created_at: "2026-03-15T04:07:00.000Z",
          based_on_transcript_id: transcript.transcript_id,
          summary: {
            changed_segment_count: 1,
            removal_count: 1,
            untouched_segment_count: 1,
          },
          changes: [
            {
              segment_id: "seg_a",
              original_text: "Um this is the start.",
              cleaned_text: "this is the start.",
              removed_fillers: [
                {
                  value: "Um",
                  start: 0,
                  end: 2,
                },
              ],
            },
          ],
        },
      ],
    },
  } as unknown as HammerPersistedStructuredTranscript);

  assert.equal(normalized?.derived_text_layers?.active_layer_id, null);
  assert.equal(normalized?.derived_text_layers?.output_layer_id, null);
  assert.deepEqual(
    normalized?.derived_text_layers?.layers[0]?.changes[0]?.operations,
    [
      {
        kind: "filler_removed",
        value: "Um",
        start: 0,
        end: 2,
      },
    ],
  );
}

{
  const normalized = cloneHammerStructuredTranscript({
    ...transcript,
    subtitle_outputs: {
      schema_version: 1,
      last_generated_format: "srt",
      srt: {
        format: "srt",
        generated_at: "2026-03-15T09:09:00.000Z",
        source_transcript_id: transcript.transcript_id,
        source_layer_id: null,
        source_kind: "raw",
        source_recipe_ref: null,
        approximate_timing: false,
        entry_count: 2,
        content: "example",
      },
      vtt: "bad-payload",
    },
  } as unknown as HammerPersistedStructuredTranscript);

  assert.equal(normalized?.subtitle_outputs?.last_generated_format, "srt");
  assert.equal(normalized?.subtitle_outputs?.srt?.format, "srt");
  assert.equal(normalized?.subtitle_outputs?.vtt, null);
}

console.log("Hammer derived transcript layer tests passed.");
