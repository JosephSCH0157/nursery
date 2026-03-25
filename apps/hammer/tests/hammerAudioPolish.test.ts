import assert from "node:assert/strict";
import {
  cloneHammerAudioPolish,
  buildFailedHammerAudioPolish,
  buildPreparedHammerAudioPolish,
  buildPreparingHammerAudioPolish,
  isReusableHammerAudioPolish,
} from "../src/prep/hammerAudioPolish";
import type { HammerPrepSource } from "../src/prep/hammerPrep";

const prepSource: HammerPrepSource = {
  mediaRef: {
    media_id: "media_01",
    kind: "recording_audio",
    local_relpath: "recordings/episode-1.wav",
    duration_ms: 8_000,
    byte_size: 1_024_000,
    sha256: "sha_episode_1",
  },
  workspaceMapping: {
    workspace_id: "11111111-1111-4111-8111-111111111111",
    local_root_abs: "D:\\ForgeMedia\\workspace",
  },
  local_root_abs: "D:\\ForgeMedia\\workspace",
  local_relpath: "recordings/episode-1.wav",
  media_signature: "media_01|recording_audio|recordings/episode-1.wav||1024000|8000|sha_episode_1",
};

{
  const preparing = buildPreparingHammerAudioPolish(prepSource);
  assert.equal(preparing.status, "preparing");
  assert.equal(preparing.source_media_signature, prepSource.media_signature);
  assert.equal(preparing.analysis, null);
}

{
  const prepared = buildPreparedHammerAudioPolish({
    prepSource,
    preparedAt: "2026-03-14T10:00:00.000Z",
    outputLocalRelpath: "hammer/prep/audio-polish/workpiece/episode-1.wav",
    outputMimeType: "audio/wav",
    outputDurationMs: 8_000,
    analysis: {
      schema_version: 1,
      source_ref: "workpiece:recordings/episode-1.wav",
      analyzed_at: "2026-03-25T12:00:00.000Z",
      loudness: {
        integrated_lufs: -18.2,
        loudness_range_lu: 3.1,
        true_peak_dbtp: -1.4,
        rms_dbfs: -20.5,
      },
      segmentation: {
        strategy: "ffmpeg_silencedetect_v1",
        noise_floor_db: -35,
        min_silence_sec: 0.25,
        regions: [
          {
            id: "speech_1",
            start_sec: 0,
            end_sec: 8,
            kind: "speech",
            confidence: 0.99,
          },
        ],
      },
      transcript_prep: {
        strategy: "fixed_chunk_with_silence_bias_v1",
        target_chunk_sec: 60,
        max_chunk_sec: 90,
        chunks: [
          {
            id: "chunk_1",
            start_sec: 0,
            end_sec: 8,
            duration_sec: 8,
            source: "short_file_single_chunk",
          },
        ],
      },
      channel_characterization: {
        channel_count: 1,
        silent_channel_detected: false,
        mono_compatible: true,
        phase_correlation: 1,
      },
    },
  });
  assert.equal(isReusableHammerAudioPolish(prepared, prepSource), true);
  const cloned = cloneHammerAudioPolish(prepared);
  assert.notEqual(cloned, prepared);
  assert.notEqual(cloned?.analysis, prepared.analysis);
  assert.notEqual(cloned?.analysis?.segmentation, prepared.analysis?.segmentation);
  assert.notEqual(cloned?.analysis?.segmentation.regions, prepared.analysis?.segmentation.regions);
  assert.equal(cloned?.analysis?.loudness.integrated_lufs, -18.2);
}

{
  const unsupported = buildFailedHammerAudioPolish({
    prepSource,
    failureCode: "unsupported_source",
    failureReason: "Unsupported format.",
  });
  assert.equal(isReusableHammerAudioPolish(unsupported, prepSource), true);
}

{
  const retryable = buildFailedHammerAudioPolish({
    prepSource,
    failureCode: "processing_failed",
    failureReason: "Transient processing error.",
  });
  assert.equal(isReusableHammerAudioPolish(retryable, prepSource), false);
}

{
  const legacy = cloneHammerAudioPolish({
    schema_version: 1,
    status: "prepared",
    prepared_passes: ["studio_sound"],
    source_artifact_paths: ["recordings/episode-1.wav"],
    settings_summary: {},
    source_media_id: "media_01",
    source_media_signature: prepSource.media_signature,
    processor_version: "forge-v1.2.0/audio-polish.v1",
    prepared_at: "2026-03-20T10:00:00.000Z",
    output_local_relpath: "hammer/prep/audio-polish/workpiece/episode-1.wav",
    output_workpiece_path: null,
    output_mime_type: "audio/wav",
    output_duration_ms: 8000,
    failure_code: null,
    failure_reason: null,
    analysis: undefined as never,
  });
  assert.equal(legacy?.analysis ?? null, null);
}

console.log("Hammer audio polish tests passed.");
