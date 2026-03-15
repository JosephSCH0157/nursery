import assert from "node:assert/strict";
import {
  applyHammerDerivedTextLayerToSegments,
  setHammerDerivedTextLayerActive,
} from "../src/macros/hammerDerivedTranscriptLayers";
import { runHammerRetakeTighteningMacro } from "../src/macros/hammerRetakeTighteningMacro";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "transcript_02",
  media_id: "media_02",
  media_signature: "sig_02",
  prepared_at: "2026-03-15T03:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_02",
    kind: "recording_audio",
    source_hint: "local",
    local_relpath: "recordings/interview.wav",
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1"],
    raw_labels: ["host"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_02",
    model: "gpt-4o-transcribe",
  },
  confidence_flags: [],
  segments: [
    {
      segment_id: "seg_101",
      start_sec: 0,
      end_sec: 3,
      speaker: "S1",
      text: "I think- I think the real issue is trust.",
    },
    {
      segment_id: "seg_102",
      start_sec: 3,
      end_sec: 6,
      speaker: "S1",
      text: "The point is, the point is, we need proof.",
    },
    {
      segment_id: "seg_103",
      start_sec: 6,
      end_sec: 8,
      speaker: "S1",
      text: "This is very very important.",
    },
  ],
  derived_text_layers: {
    schema_version: 1,
    active_layer_id: null,
    layers: [],
  },
};

{
  const run = runHammerRetakeTighteningMacro(transcript, "2026-03-15T03:05:00.000Z");
  assert.equal(run.changed_segment_count, 2);
  assert.equal(run.removal_count, 2);
  assert.equal(run.transcript.derived_text_layers?.layers[0]?.macro_kind, "retake_tightening");
  assert.equal(
    run.transcript.derived_text_layers?.layers[0]?.changes[0]?.cleaned_text,
    "I think the real issue is trust.",
  );
  assert.equal(
    run.transcript.derived_text_layers?.layers[0]?.changes[1]?.cleaned_text,
    "the point is, we need proof.",
  );
  assert.equal(
    run.transcript.derived_text_layers?.layers[0]?.changes[0]?.operations[0]?.kind,
    "retake_fragment_removed",
  );
}

{
  const run = runHammerRetakeTighteningMacro(transcript, "2026-03-15T03:05:00.000Z");
  const active = setHammerDerivedTextLayerActive(run.transcript, run.layer_id);
  const effectiveSegments = applyHammerDerivedTextLayerToSegments(active.segments, active);
  assert.equal(effectiveSegments[0]?.text, "I think the real issue is trust.");
  assert.equal(effectiveSegments[1]?.text, "the point is, we need proof.");
  assert.equal(effectiveSegments[2]?.text, "This is very very important.");
}

console.log("Hammer retake tightening macro tests passed.");
