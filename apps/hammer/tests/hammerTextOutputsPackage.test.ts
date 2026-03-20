import assert from "node:assert/strict";
import { buildHammerTextOutputsPackage } from "../src/lib/hammerTextOutputsPackage";
import { generateHammerSubtitleArtifact, setHammerSubtitleArtifact } from "../src/lib/hammerSubtitleExports";
import { setHammerDerivedTextLayerOutput } from "../src/macros/hammerDerivedTranscriptLayers";
import { runHammerFillerCleanupMacro } from "../src/macros/hammerFillerCleanupMacro";
import type { HammerPersistedStructuredTranscript } from "../src/persistence/hammerPersistenceContract";

const transcript: HammerPersistedStructuredTranscript = {
  schema_version: 1,
  transcript_id: "text_outputs_pkg_01",
  media_id: "media_text_outputs_pkg_01",
  media_signature: "sig_text_outputs_pkg_01",
  prepared_at: "2026-03-15T10:00:00.000Z",
  structure: "speaker_turns",
  source_media_ref: {
    media_id: "media_text_outputs_pkg_01",
    kind: "recording_audio",
    source_hint: "local",
    local_relpath: "recordings/text-outputs.wav",
  },
  diarization: {
    label_scheme: "forge-neutral-speakers.v1",
    labels: ["S1", "G1"],
    raw_labels: ["host", "guest"],
    version: "gpt-4o-transcribe",
    provider: "openai",
    provider_request_id: "req_text_outputs_pkg_01",
    model: "gpt-4o-transcribe",
  },
  confidence_flags: [],
  segments: [
    {
      segment_id: "seg_001",
      start_sec: 0,
      end_sec: 2,
      speaker: "S1",
      text: "Um welcome back.",
    },
    {
      segment_id: "seg_002",
      start_sec: 2,
      end_sec: 4,
      speaker: "G1",
      text: "Glad to be here.",
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
  const pkg = buildHammerTextOutputsPackage(transcript);
  assert.ok(pkg);
  assert.equal(pkg?.output_selection.source_kind, "raw");
  assert.equal(pkg?.output_selection.layer_id, null);
  assert.equal(pkg?.resolved_output.full_text, "S1: Um welcome back.\nG1: Glad to be here.");
  assert.equal(pkg?.subtitles.srt.freshness, "missing");
  assert.equal(pkg?.subtitles.vtt.freshness, "missing");
}

{
  const fillerRun = runHammerFillerCleanupMacro(transcript, "2026-03-15T10:05:00.000Z");
  const withOutput = setHammerDerivedTextLayerOutput(fillerRun.transcript, fillerRun.layer_id);
  const subtitleArtifact = generateHammerSubtitleArtifact({
    rawSegments: transcript.segments,
    transcript: withOutput,
    format: "srt",
    generatedAt: "2026-03-15T10:06:00.000Z",
  });
  const withSubtitle = setHammerSubtitleArtifact(withOutput, subtitleArtifact);
  const currentPkg = buildHammerTextOutputsPackage(withSubtitle);

  assert.ok(currentPkg);
  assert.equal(currentPkg?.output_selection.source_kind, "derived");
  assert.equal(currentPkg?.output_selection.layer_id, fillerRun.layer_id);
  assert.equal(currentPkg?.output_selection.recipe_ref, "macro:podcast_cleanup.v1");
  assert.equal(currentPkg?.output_selection.macro_kind, "filler_cleanup");
  assert.match(currentPkg?.resolved_output.full_text ?? "", /S1: welcome back\./);
  assert.equal(currentPkg?.subtitles.srt.freshness, "current");
  assert.equal(currentPkg?.subtitles.srt.artifact?.source_layer_id, fillerRun.layer_id);

  const changedOutput = setHammerDerivedTextLayerOutput(withSubtitle, null);
  const stalePkg = buildHammerTextOutputsPackage(changedOutput);

  assert.ok(stalePkg);
  assert.equal(stalePkg?.output_selection.source_kind, "raw");
  assert.equal(stalePkg?.subtitles.srt.freshness, "stale");
  assert.equal(stalePkg?.subtitles.vtt.freshness, "missing");
}

console.log("Hammer text outputs package tests passed.");
