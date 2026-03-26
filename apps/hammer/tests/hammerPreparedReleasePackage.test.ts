import assert from "node:assert/strict";
import {
  buildHammerPreparedReleasePackage,
  compareHammerPreparedReleasePackageToCurrent,
} from "../src/lib/hammerPreparedReleasePackage";
import { buildHammerReleasePrepPackage } from "../src/lib/hammerReleasePrepPackage";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedEditorSession,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
} from "../src/persistence/hammerPersistenceContract";

function buildCurrentReleasePrep(args?: {
  transcriptText?: string;
  srtContent?: string;
  vttContent?: string;
  mediaId?: string;
  mediaSignature?: string;
  preferredKind?: "raw" | "polished" | "none";
}){
  const transcript: HammerPersistedStructuredTranscript = {
    schema_version: 1,
    transcript_id: "transcript_prepared_pkg_01",
    media_id: args?.mediaId ?? "media_prepared_pkg_01",
    media_signature: args?.mediaSignature ?? "sig_prepared_pkg_01",
    prepared_at: "2026-03-19T12:00:00.000Z",
    structure: "speaker_turns",
    source_media_ref: {
      media_id: args?.mediaId ?? "media_prepared_pkg_01",
      kind: "recording_audio",
      source_hint: "local",
      local_relpath: "recordings/prepared-release.wav",
    },
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: ["S1"],
      raw_labels: ["host"],
      version: "gpt-4o-transcribe",
      provider: "openai",
      provider_request_id: "req_prepared_pkg_01",
      model: "gpt-4o-transcribe",
    },
    confidence_flags: [],
    segments: [
      {
        segment_id: "seg_001",
        start_sec: 0,
        end_sec: 4,
        speaker: "S1",
        text: args?.transcriptText ?? "Welcome back to the show.",
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
      last_generated_format: "vtt",
      srt: {
        format: "srt",
        generated_at: "2026-03-19T12:01:00.000Z",
        source_transcript_id: "transcript_prepared_pkg_01",
        source_layer_id: null,
        source_kind: "raw",
        source_recipe_ref: null,
        approximate_timing: false,
        entry_count: 1,
        content: args?.srtContent ?? "1\n00:00:00,000 --> 00:00:04,000\nWelcome back to the show.",
      },
      vtt: {
        format: "vtt",
        generated_at: "2026-03-19T12:01:30.000Z",
        source_transcript_id: "transcript_prepared_pkg_01",
        source_layer_id: null,
        source_kind: "raw",
        source_recipe_ref: null,
        approximate_timing: false,
        entry_count: 1,
        content: args?.vttContent ?? "WEBVTT\n\n00:00.000 --> 00:04.000\nWelcome back to the show.",
      },
    },
  };

  const visuals: HammerPersistedVisualPlacements = {
    schema_version: 1,
    status: "prepared",
    source_refs: ["transcript:transcript_prepared_pkg_01"],
    uncertainty_flags: [],
    placements: [],
  };

  const audioPolish: HammerPersistedAudioPolish = {
    schema_version: 1,
    status: args?.preferredKind === "polished" ? "prepared" : "not_started",
    prepared_passes: args?.preferredKind === "polished" ? ["studio_sound"] : [],
    source_artifact_paths: ["recordings/prepared-release.wav"],
    settings_summary: {},
    source_media_id: args?.mediaId ?? "media_prepared_pkg_01",
    source_media_signature: args?.mediaSignature ?? "sig_prepared_pkg_01",
    processor_version: "forge-v1.2.0/audio-polish.v3",
    prepared_at: args?.preferredKind === "polished" ? "2026-03-19T12:02:00.000Z" : null,
    output_local_relpath: args?.preferredKind === "polished" ? "hammer/prep/audio-polish/prepared.wav" : null,
    output_workpiece_path: args?.preferredKind === "polished" ? "hammer/prep/audio-polish/prepared.wav" : null,
    output_mime_type: args?.preferredKind === "polished" ? "audio/wav" : null,
    output_duration_ms: 4000,
    failure_code: null,
    failure_reason: null,
  };

  const editorSession: HammerPersistedEditorSession = {
    schema_version: 1,
    session_id: "session_prepared_pkg_01",
    source_mode: "tongs",
    preview_mode: "edit-aware",
    transcript_source_id: "transcript_prepared_pkg_01",
    selected_segment_id: null,
    selected_overlay_row_id: null,
    media_ref: {
      media_id: args?.mediaId ?? "media_prepared_pkg_01",
      kind: "recording_audio",
      source_hint: "local",
      local_relpath: "recordings/prepared-release.wav",
      duration_ms: 4000,
    },
    workspace_mapping: {
      workspace_id: "workspace_prepared_pkg_01",
      local_root_abs: "D:\\ForgeMedia\\workspace_prepared_pkg_01",
    },
    media_source_label: "tongs:media_prepared_pkg_01",
    last_opened_at: "2026-03-19T12:03:00.000Z",
  };

  return buildHammerReleasePrepPackage({
    workspaceId: "workspace_prepared_pkg_01",
    workpieceId: "workpiece_prepared_pkg_01",
    prepStatus: "prepared",
    alignmentStatus: "aligned",
    structuredTranscript: transcript,
    visualPlacements: visuals,
    audioPolish,
    editorSession,
  });
}

{
  const current = buildCurrentReleasePrep();
  const pkg = buildHammerPreparedReleasePackage({
    current,
    timelineRevision: "sig_01",
  });

  assert.equal(pkg.overallStatus, "partial");
  assert.equal(pkg.transcript.status, "ready");
  assert.equal(pkg.subtitles.srt.status, "ready");
  assert.equal(pkg.subtitles.vtt.status, "ready");
  assert.equal(pkg.media.status, "missing");
  assert.equal(pkg.provenance.timelineRevision, "sig_01");
}

{
  const current = buildCurrentReleasePrep();
  const prepared = buildHammerPreparedReleasePackage({ current });
  const comparison = compareHammerPreparedReleasePackageToCurrent(prepared, current);

  assert.equal(comparison.preparedStatus, "partial");
  assert.deepEqual(comparison.staleReasons, []);
}

{
  const prepared = buildHammerPreparedReleasePackage({ current: buildCurrentReleasePrep() });
  const changed = buildCurrentReleasePrep({
    transcriptText: "Welcome back to our rebuilt show.",
  });
  const comparison = compareHammerPreparedReleasePackageToCurrent(prepared, changed);

  assert.equal(comparison.preparedStatus, "stale");
  assert.equal(comparison.changed.transcript, true);
  assert.equal(comparison.staleReasons.includes("Transcript changed"), true);
}

{
  const prepared = buildHammerPreparedReleasePackage({ current: buildCurrentReleasePrep() });
  const changed = buildCurrentReleasePrep({
    srtContent: "1\n00:00:00,000 --> 00:00:04,000\nWelcome back to the changed show.",
  });
  const comparison = compareHammerPreparedReleasePackageToCurrent(prepared, changed);

  assert.equal(comparison.preparedStatus, "stale");
  assert.equal(comparison.changed.subtitles, true);
  assert.equal(comparison.staleReasons.includes("Subtitles changed"), true);
}

{
  const prepared = buildHammerPreparedReleasePackage({ current: buildCurrentReleasePrep() });
  const changed = buildCurrentReleasePrep({
    mediaId: "media_prepared_pkg_02",
    mediaSignature: "sig_prepared_pkg_02",
  });
  const comparison = compareHammerPreparedReleasePackageToCurrent(prepared, changed);

  assert.equal(comparison.preparedStatus, "stale");
  assert.equal(comparison.changed.media, true);
  assert.equal(comparison.staleReasons.includes("Media source changed"), true);
}

console.log("Hammer prepared release package tests passed.");

