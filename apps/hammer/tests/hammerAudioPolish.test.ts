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
  assert.equal(preparing.audio_edit, null);
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
        speech_region_count: 1,
        silence_region_count: 0,
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
            source: "short_file",
          },
        ],
      },
      channel_characterization: {
        channel_count: 1,
        silent_channel: null,
        dual_mono: false,
        phase_correlation: 1,
        phase_concern: false,
      },
      waveform_proxy: {
        version: "v1",
        duration_sec: 8,
        bucket_count: 4,
        bucket_duration_sec: 2,
        channel_mode: "mono_mixdown",
        peaks: [0.2, 0.5, 0.35, 0.8],
      },
    },
    audioEdit: {
      version: "v1",
      operations: [
        {
          id: "cut_01",
          type: "cut",
          start_sec: 1.25,
          end_sec: 2.5,
        },
      ],
    },
  });
  assert.equal(isReusableHammerAudioPolish(prepared, prepSource), true);
  const cloned = cloneHammerAudioPolish(prepared);
  assert.notEqual(cloned, prepared);
  assert.notEqual(cloned?.analysis, prepared.analysis);
  assert.notEqual(cloned?.analysis?.segmentation, prepared.analysis?.segmentation);
  assert.notEqual(cloned?.analysis?.segmentation.regions, prepared.analysis?.segmentation.regions);
  assert.notEqual(cloned?.analysis?.waveform_proxy?.peaks, prepared.analysis?.waveform_proxy?.peaks);
  assert.notEqual(cloned?.audio_edit, prepared.audio_edit);
  assert.notEqual(cloned?.audio_edit?.operations, prepared.audio_edit?.operations);
  assert.equal(cloned?.analysis?.loudness.integrated_lufs, -18.2);
  assert.deepEqual(cloned?.audio_edit?.operations, prepared.audio_edit?.operations);
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
    audio_edit: undefined as never,
  });
  assert.equal(legacy?.analysis ?? null, null);
  assert.equal(legacy?.audio_edit ?? null, null);
}

{
  // Test channel characterization structure requirements
  const prepared = buildPreparedHammerAudioPolish({
    prepSource,
    preparedAt: "2026-03-14T10:00:00.000Z",
    outputLocalRelpath: "hammer/prep/audio-polish/workpiece/stereo-example.wav",
    outputMimeType: "audio/wav",
    outputDurationMs: 8_000,
    analysis: {
      schema_version: 1,
      source_ref: "workpiece:recordings/stereo-example.wav",
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
        speech_region_count: 1,
        silence_region_count: 0,
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
            source: "short_file",
            chunk_index: 1,
            boundary_reason: "short_file",
          },
        ],
        chunk_count: 1,
      },
      channel_characterization: {
        channel_count: 2,
        silent_channel: null,
        dual_mono: false,
        phase_correlation: 0.85,
        phase_concern: false,
      },
      waveform_proxy: {
        version: "v1",
        duration_sec: 8,
        bucket_count: 4,
        bucket_duration_sec: 2,
        channel_mode: "mono_mixdown",
        peaks: [0.3, 0.4, 0.5, 0.6],
      },
    },
  });

  assert(prepared.analysis != null, "analysis populated for stereo");
  assert.equal(prepared.analysis.channel_characterization?.channel_count, 2);
  assert.equal(prepared.analysis.channel_characterization?.silent_channel, null);
  assert.equal(prepared.analysis.channel_characterization?.dual_mono, false);
  assert.equal(prepared.analysis.channel_characterization?.phase_concern, false);
  assert(
    prepared.analysis.channel_characterization?.phase_correlation != null,
    "phase_correlation defined"
  );
  assert.equal(prepared.analysis.waveform_proxy?.version, "v1");
  assert.equal(prepared.analysis.waveform_proxy?.channel_mode, "mono_mixdown");
  assert.equal(prepared.analysis.waveform_proxy?.peaks.length, prepared.analysis.waveform_proxy?.bucket_count);
  
  // Day 4: buildPreparedHammerAudioPolish preserves waveform proxy completely
  assert.equal(prepared.analysis.waveform_proxy?.version, "v1", "waveform version preserved");
  assert.equal(prepared.analysis.waveform_proxy?.bucket_count, 4, "bucket_count preserved");
  assert.equal(prepared.analysis.waveform_proxy?.bucket_duration_sec, 2, "bucket_duration_sec preserved");
  assert.deepEqual(prepared.analysis.waveform_proxy?.peaks, [0.3, 0.4, 0.5, 0.6], "peaks preserved exactly");
  assert.equal(prepared.audio_edit, null, "audio_edit defaults to null when omitted");
  
  // Day 4: Backward compatibility - null waveform_proxy stays null through buildPreparedHammerAudioPolish
  const preparedNoWaveform = buildPreparedHammerAudioPolish({
    prepSource,
    preparedAt: "2026-03-25T12:00:00.000Z",
    outputLocalRelpath: "hammer/prep/audio-polish/legacy.wav",
    outputMimeType: "audio/wav",
    outputDurationMs: 4000,
    analysis: {
      schema_version: 1,
      source_ref: "workpiece:recordings/legacy-1.wav",
      analyzed_at: "2026-03-25T12:00:00.000Z",
      loudness: {
        integrated_lufs: -16,
        loudness_range_lu: 2.5,
        true_peak_dbtp: -0.5,
        rms_dbfs: -18,
      },
      segmentation: {
        strategy: "ffmpeg_silencedetect_v1",
        noise_floor_db: -35,
        min_silence_sec: 0.25,
        regions: [],
        speech_region_count: 0,
        silence_region_count: 0,
      },
      transcript_prep: {
        strategy: "fixed_chunk_with_silence_bias_v1",
        target_chunk_sec: 60,
        max_chunk_sec: 90,
        chunks: [],
        chunk_count: 0,
      },
      channel_characterization: null,
      waveform_proxy: null,
    },
  });
  assert.equal(preparedNoWaveform.analysis.waveform_proxy, null, "null waveform_proxy preserved through buildPreparedHammerAudioPolish");
  assert.equal(preparedNoWaveform.audio_edit, null, "missing audio_edit defaults to null");
}

console.log("Hammer audio polish tests passed.");
