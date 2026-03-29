import assert from "node:assert/strict";
import { buildHammerPreparedHandoffModel } from "../src/editor/hammerPreparedHandoff";
import { buildHammerMediaPrepOutputsPackage } from "../src/lib/hammerMediaPrepOutputsPackage";

{
  const model = buildHammerPreparedHandoffModel({
    transcriptSegmentCount: 12,
    transcriptSourceId: "hammer_transcript_01",
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:hammer_transcript_01"],
      uncertainty_flags: [],
      placements: [
        {
          placement_id: "placement_01",
          entry_id: "image-map-01",
          anchor_segment_id: "turn_001",
          matched_segment_ids: ["turn_001"],
          anchor_text: "Hello world",
          asset_ref: "asset_01",
          asset_id: "asset_01",
          asset_path: "assets/example.png",
          storage_key: "assets/example.png",
          label: "explainer",
          visual_mode: "comparison",
          start_sec: 0,
          end_sec: 4,
          confidence: 0.92,
          timing_source: "transcript_match",
          status: "placed",
          uncertainty_flags: [],
        },
      ],
    },
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound", "noise_cleanup", "level_consistency"],
      source_artifact_paths: ["recordings/episode.wav"],
      settings_summary: {
        supported_source: true,
      },
      source_media_id: "media_01",
      source_media_signature: "sig_01",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-03-14T10:00:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/example.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 8_000,
      failure_code: null,
      failure_reason: null,
      audio_edit: null,
    },
  });

  assert.equal(model.summaries[0]?.status_label, "Ready");
  assert.equal(model.summaries[1]?.status_label, "Suggested");
  assert.equal(model.summaries[2]?.status_label, "Polished");
  assert.equal(model.actions.find((action) => action.id === "review_visuals")?.enabled, true);
  assert.equal(model.actions.find((action) => action.id === "review_audio")?.label, "Listen to Polished Audio");
  assert.equal(model.actions.find((action) => action.id === "review_macros")?.enabled, true);
}

{
  const model = buildHammerPreparedHandoffModel({
    transcriptSegmentCount: 9,
    transcriptSourceId: "hammer_transcript_02",
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:hammer_transcript_02"],
      uncertainty_flags: ["match_missing:image-map-02"],
      placements: [
        {
          placement_id: "placement_02",
          entry_id: "image-map-02",
          anchor_segment_id: "turn_002",
          matched_segment_ids: ["turn_002"],
          anchor_text: "Guest answer",
          asset_ref: "asset_02",
          asset_id: "asset_02",
          asset_path: "assets/example-2.png",
          storage_key: "assets/example-2.png",
          label: "b-roll",
          visual_mode: "cutaway",
          start_sec: 4,
          end_sec: 8,
          confidence: 0.44,
          timing_source: "ordered_fallback",
          status: "uncertain",
          uncertainty_flags: ["low_confidence"],
        },
      ],
    },
    audioPolish: {
      schema_version: 1,
      status: "failed",
      prepared_passes: [],
      source_artifact_paths: ["recordings/episode.mp4"],
      settings_summary: {
        source_extension: ".mp4",
      },
      source_media_id: "media_02",
      source_media_signature: "sig_02",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: null,
      output_local_relpath: null,
      output_mime_type: null,
      output_duration_ms: null,
      failure_code: "unsupported_source",
      failure_reason: "Unsupported sources will open normally without polish.",
      audio_edit: null,
    },
  });

  assert.equal(model.summaries[1]?.status_label, "Needs Review");
  assert.equal(model.summaries[2]?.status_label, "Raw Fallback");
  assert.equal(model.actions.find((action) => action.id === "review_audio")?.label, "Review Raw Audio Fallback");
  assert.equal(model.actions.find((action) => action.id === "review_visuals")?.recommended, true);
  assert.equal(model.actions.some((action) => action.id === "macro_later"), false);
}

{
  const mediaPrepOutputs = buildHammerMediaPrepOutputsPackage({
    structuredTranscript: {
      schema_version: 1,
      transcript_id: "hammer_transcript_03",
      media_id: "media_03",
      media_signature: "sig_03",
      prepared_at: "2026-03-18T10:00:00.000Z",
      structure: "speaker_turns",
      source_media_ref: {
        media_id: "media_03",
        kind: "recording_audio",
        source_hint: "local",
        local_relpath: "recordings/original.wav",
        duration_ms: 8_000,
      },
      diarization: {
        label_scheme: "forge-neutral-speakers.v1",
        labels: ["S1"],
        raw_labels: ["host"],
        version: "gpt-4o-transcribe",
        provider: "openai",
        provider_request_id: "req_03",
        model: "gpt-4o-transcribe",
      },
      confidence_flags: [],
      segments: [
        {
          segment_id: "turn_003",
          start_sec: 0,
          end_sec: 4,
          speaker: "S1",
          text: "Current raw audio should win.",
        },
      ],
    },
    visualPlacements: null,
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound", "noise_cleanup", "level_consistency"],
      source_artifact_paths: ["recordings/original.wav"],
      settings_summary: {
        supported_source: true,
      },
      source_media_id: "media_03",
      source_media_signature: "sig_03",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-03-18T10:05:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/original.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 8_000,
      failure_code: null,
      failure_reason: null,
      audio_edit: null,
    },
    mediaRef: {
      media_id: "media_03",
      kind: "recording_audio",
      source_hint: "local",
      local_relpath: "recordings/retake.wav",
      duration_ms: 8_200,
    },
    mediaSourceLabel: "tongs:media_03",
  });
  const model = buildHammerPreparedHandoffModel({
    transcriptSegmentCount: 7,
    transcriptSourceId: "hammer_transcript_03",
    visualPlacements: null,
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound", "noise_cleanup", "level_consistency"],
      source_artifact_paths: ["recordings/original.wav"],
      settings_summary: {
        supported_source: true,
      },
      source_media_id: "media_03",
      source_media_signature: "sig_03",
      processor_version: "forge-v1.2.0/audio-polish.v4",
      prepared_at: "2026-03-18T10:05:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/original.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 8_000,
      failure_code: null,
      failure_reason: null,
      audio_edit: null,
    },
    mediaPrepOutputs,
  });

  assert.equal(model.summaries[2]?.status_label, "Stale polish");
  assert.equal(model.actions.find((action) => action.id === "review_audio")?.label, "Review Raw Audio Fallback");
}

console.log("Hammer prepared handoff tests passed.");


