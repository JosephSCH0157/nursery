import assert from "node:assert/strict";
import {
  generateHammerSubtitleArtifact,
  getHammerSubtitleArtifact,
  isHammerSubtitleArtifactCurrent,
  setHammerSubtitleArtifact,
} from "../src/lib/hammerSubtitleExports";
import { setHammerDerivedTextLayerActive, setHammerDerivedTextLayerOutput } from "../src/macros/hammerDerivedTranscriptLayers";
import { runHammerFillerCleanupMacro } from "../src/macros/hammerFillerCleanupMacro";
import { runHammerRetakeTighteningMacro } from "../src/macros/hammerRetakeTighteningMacro";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "subtitle_export_01",
  media_id: "media_subtitle_export_01",
  media_signature: "sig_subtitle_export_01",
  prepared_at: "2026-03-15T09:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_subtitle_export_01",
    kind: "recording_audio",
    source_hint: "local",
    local_relpath: "recordings/subtitle-export.wav",
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1"],
    raw_labels: ["host"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_subtitle_export_01",
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
  subtitle_outputs: {
    schema_version: 1,
    last_generated_format: null,
    srt: null,
    vtt: null,
  },
};

{
  const artifact = generateHammerSubtitleArtifact({
    rawSegments: transcript.segments,
    transcript,
    format: "srt",
    generatedAt: "2026-03-15T09:05:00.000Z",
  });

  assert.equal(artifact.source_kind, "raw");
  assert.equal(artifact.source_layer_id, null);
  assert.equal(artifact.entry_count, 2);
  assert.match(artifact.content, /^1\n00:00:00,000 --> 00:00:02,000\nUm this is the start\./);
}

{
  const fillerRun = runHammerFillerCleanupMacro(transcript, "2026-03-15T09:06:00.000Z");
  const withActiveFiller = setHammerDerivedTextLayerActive(fillerRun.transcript, fillerRun.layer_id);
  const retakeRun = runHammerRetakeTighteningMacro(withActiveFiller, "2026-03-15T09:07:00.000Z");
  const withRetakeOutput = setHammerDerivedTextLayerOutput(retakeRun.transcript, retakeRun.layer_id);
  const artifact = generateHammerSubtitleArtifact({
    rawSegments: transcript.segments,
    transcript: withRetakeOutput,
    format: "vtt",
    generatedAt: "2026-03-15T09:08:00.000Z",
  });

  assert.equal(artifact.source_kind, "derived");
  assert.equal(artifact.source_layer_id, retakeRun.layer_id);
  assert.equal(artifact.source_recipe_ref, "macro:interview_tight_cut.v1");
  assert.match(artifact.content, /^WEBVTT/);
  assert.match(artifact.content, /Um this is the start\./);
  assert.match(artifact.content, /I think we should move forward\./);
}

{
  const fillerRun = runHammerFillerCleanupMacro(transcript, "2026-03-15T09:06:00.000Z");
  const withOutput = setHammerDerivedTextLayerOutput(fillerRun.transcript, fillerRun.layer_id);
  const artifact = generateHammerSubtitleArtifact({
    rawSegments: transcript.segments,
    transcript: withOutput,
    format: "srt",
    generatedAt: "2026-03-15T09:09:00.000Z",
  });
  const stored = setHammerSubtitleArtifact(withOutput, artifact);

  assert.equal(stored.subtitle_outputs?.last_generated_format, "srt");
  assert.equal(getHammerSubtitleArtifact(stored, "srt")?.generated_at, "2026-03-15T09:09:00.000Z");
  assert.equal(isHammerSubtitleArtifactCurrent(stored, "srt"), true);

  const changedOutput = setHammerDerivedTextLayerOutput(stored, null);
  assert.equal(isHammerSubtitleArtifactCurrent(changedOutput, "srt"), false);
}

console.log("Hammer subtitle export tests passed.");
