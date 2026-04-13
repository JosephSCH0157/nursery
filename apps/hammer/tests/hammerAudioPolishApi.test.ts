import assert from "node:assert/strict";
import {
  HAMMER_AUDIO_POLISH_ROUTE,
  requestHammerAudioPolish,
} from "../src/prep/hammerAudioPolishApi";

const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;

async function main(): Promise<void> {
  (globalThis as typeof globalThis & { window?: unknown }).window = {
    location: { search: "" },
    localStorage: {
      getItem: () => null,
      key: () => null,
      length: 0,
    },
  };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.equal(String(input), HAMMER_AUDIO_POLISH_ROUTE);
    assert.equal(init?.method, "POST");
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as { workpiece_id?: string };

    if (requestBody.workpiece_id === "wp_with_analysis") {
      return new Response(JSON.stringify({
        ok: true,
        data: {
          status: "prepared",
          prepared_at: "2026-03-25T12:00:00.000Z",
          prepared_passes: ["studio_sound"],
          processor_version: "forge-v1.2.0/audio-polish.v4",
          output_local_relpath: "hammer/prep/audio-polish/example.wav",
          output_workpiece_path: "hammer/prep/audio-polish/example.wav",
          output_mime_type: "audio/wav",
          output_duration_ms: 8000,
          failure_code: null,
          failure_reason: null,
          audio_edit: {
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
          settings_summary: {
            supported_source: true,
            analysis_integrated_lufs: -18.2,
          },
          analysis: {
            schema_version: 1,
            source_ref: "workpiece:recordings/example.wav",
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
              chunk_count: 1,
              chunks: [
                {
                  id: "chunk_1",
                  chunk_index: 1,
                  start_sec: 0,
                  end_sec: 8,
                  duration_sec: 8,
                  boundary_reason: "short_file",
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
              peaks: [0.2, 0.6, 0.4, 0.7],
            },
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      data: {
        status: "prepared",
        prepared_at: "2026-03-20T10:00:00.000Z",
        prepared_passes: ["studio_sound"],
        processor_version: "forge-v1.2.0/audio-polish.v1",
        output_local_relpath: null,
        output_workpiece_path: "hammer/prep/audio-polish/legacy.wav",
        output_mime_type: "audio/wav",
        output_duration_ms: 4000,
        failure_code: null,
        failure_reason: null,
        settings_summary: {},
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const withAnalysis = await requestHammerAudioPolish({
    workspace_id: "ws_01",
    workpiece_id: "wp_with_analysis",
    media_kind: "recording_audio",
    input: { type: "url", value: "http://example.test/source.wav" },
    canonical_workpiece_path: "recordings/example.wav",
    mime_type: "audio/wav",
  });
  assert.equal(withAnalysis.analysis?.loudness.integrated_lufs, -18.2);
  assert.equal(withAnalysis.analysis?.segmentation.regions[0]?.kind, "speech");
  assert.equal(withAnalysis.analysis?.transcript_prep.chunk_count, 1);
  assert.equal(withAnalysis.analysis?.transcript_prep.chunks[0]?.chunk_index, 1);
  assert.equal(withAnalysis.analysis?.transcript_prep.chunks[0]?.boundary_reason, "short_file");
  assert.equal(withAnalysis.analysis?.transcript_prep.chunks[0]?.source, "short_file");
  assert.equal(withAnalysis.analysis?.waveform_proxy?.version, "v1");
  assert.equal(withAnalysis.analysis?.waveform_proxy?.channel_mode, "mono_mixdown");
  assert.equal(withAnalysis.analysis?.waveform_proxy?.bucket_count, 4);
  assert.deepEqual(withAnalysis.analysis?.waveform_proxy?.peaks, [0.2, 0.6, 0.4, 0.7]);
  assert.deepEqual(withAnalysis.audio_edit, {
    version: "v1",
    operations: [
      {
        id: "cut_01",
        type: "cut",
        start_sec: 1.25,
        end_sec: 2.5,
      },
    ],
  });

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.equal(String(input), HAMMER_AUDIO_POLISH_ROUTE);
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as { workpiece_id?: string };
    if (requestBody.workpiece_id === "wp_legacy_reason") {
      return new Response(JSON.stringify({
        ok: true,
        data: {
          status: "prepared",
          prepared_at: "2026-03-25T12:00:00.000Z",
          prepared_passes: ["studio_sound"],
          processor_version: "forge-v1.2.0/audio-polish.v4",
          output_local_relpath: "hammer/prep/audio-polish/example.wav",
          output_workpiece_path: "hammer/prep/audio-polish/example.wav",
          output_mime_type: "audio/wav",
          output_duration_ms: 8000,
          failure_code: null,
          failure_reason: null,
          audio_edit: {
            version: "v1",
            operations: [
              {
                id: "cut_invalid",
                type: "cut",
                start_sec: -1,
                end_sec: 1,
              },
            ],
          },
          settings_summary: {},
          analysis: {
            schema_version: 1,
            source_ref: "workpiece:recordings/example.wav",
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
              regions: [{ id: "speech_1", start_sec: 0, end_sec: 8, kind: "speech", confidence: 0.99 }],
              speech_region_count: 1,
              silence_region_count: 0,
            },
            transcript_prep: {
              strategy: "fixed_chunk_with_silence_bias_v1",
              target_chunk_sec: 60,
              max_chunk_sec: 90,
              chunks: [{ id: "chunk_1", start_sec: 0, end_sec: 8, duration_sec: 8, source: "short_file_single_chunk" }],
            },
            channel_characterization: null,
            waveform_proxy: {
              version: "v1",
              duration_sec: 8,
              bucket_count: 3,
              bucket_duration_sec: 2,
              channel_mode: "mono_mixdown",
              peaks: [0.2, 0.6],
            },
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      data: {
        status: "prepared",
        prepared_at: "2026-03-20T10:00:00.000Z",
        prepared_passes: ["studio_sound"],
        processor_version: "forge-v1.2.0/audio-polish.v1",
        output_local_relpath: null,
        output_workpiece_path: "hammer/prep/audio-polish/legacy.wav",
        output_mime_type: "audio/wav",
        output_duration_ms: 4000,
        failure_code: null,
        failure_reason: null,
        settings_summary: {},
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const legacyReason = await requestHammerAudioPolish({
    workspace_id: "ws_01",
    workpiece_id: "wp_legacy_reason",
    media_kind: "recording_audio",
    input: { type: "url", value: "http://example.test/legacy-reason.wav" },
    canonical_workpiece_path: "recordings/legacy-reason.wav",
    mime_type: "audio/wav",
  });
  assert.equal(legacyReason.analysis?.transcript_prep.chunks[0]?.boundary_reason, "short_file");
  assert.equal(legacyReason.analysis?.transcript_prep.chunks[0]?.source, "short_file");
  assert.equal(legacyReason.analysis?.transcript_prep.chunk_count, 1);
  // Day 4: Invalid waveform_proxy (bucket_count=3 but peaks.length=2) normalizes to null
  assert.equal(legacyReason.analysis?.waveform_proxy, null, "invalid waveform_proxy should normalize to null");
  assert.equal(legacyReason.audio_edit, null, "invalid audio_edit should normalize to null");

  // Day 4: Test backward compatibility - payload without waveform_proxy field (old artifacts)
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.equal(String(input), HAMMER_AUDIO_POLISH_ROUTE);
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as { workpiece_id?: string };
    if (requestBody.workpiece_id === "wp_legacy_no_waveform") {
      return new Response(JSON.stringify({
        ok: true,
        data: {
          status: "prepared",
          prepared_at: "2026-03-25T12:00:00.000Z",
          prepared_passes: ["studio_sound"],
          processor_version: "forge-v1.2.0/audio-polish.v2",
          output_local_relpath: "hammer/prep/audio-polish/legacy-no-waveform.wav",
          output_workpiece_path: "hammer/prep/audio-polish/legacy-no-waveform.wav",
          output_mime_type: "audio/wav",
          output_duration_ms: 4000,
          failure_code: null,
          failure_reason: null,
          settings_summary: { supported_source: true },
          analysis: {
            schema_version: 1,
            source_ref: "workpiece:recordings/legacy-no-waveform.wav",
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
              regions: [{ id: "r1", start_sec: 0, end_sec: 4, kind: "speech", confidence: 0.95 }],
              speech_region_count: 1,
              silence_region_count: 0,
            },
            transcript_prep: {
              strategy: "fixed_chunk_with_silence_bias_v1",
              target_chunk_sec: 60,
              max_chunk_sec: 90,
              chunks: [{ id: "c1", chunk_index: 1, start_sec: 0, end_sec: 4, duration_sec: 4, boundary_reason: "short_file", source: "short_file" }],
              chunk_count: 1,
            },
            channel_characterization: {
              channel_count: 1,
              silent_channel: null,
              dual_mono: false,
              phase_correlation: 1,
              phase_concern: false,
            },
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      data: {
        status: "prepared",
        prepared_at: "2026-03-20T10:00:00.000Z",
        prepared_passes: ["studio_sound"],
        processor_version: "forge-v1.2.0/audio-polish.v1",
        output_local_relpath: null,
        output_workpiece_path: "hammer/prep/audio-polish/legacy.wav",
        output_mime_type: "audio/wav",
        output_duration_ms: 4000,
        failure_code: null,
        failure_reason: null,
        settings_summary: {},
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const legacyNoWaveform = await requestHammerAudioPolish({
    workspace_id: "ws_01",
    workpiece_id: "wp_legacy_no_waveform",
    media_kind: "recording_audio",
    input: { type: "url", value: "http://example.test/legacy-no-waveform.wav" },
    canonical_workpiece_path: "recordings/legacy-no-waveform.wav",
    mime_type: "audio/wav",
  });
  // Backward compatibility: old payload without waveform_proxy → waveform_proxy is null
  assert.equal(legacyNoWaveform.analysis?.waveform_proxy, null, "legacy payload without waveform_proxy should have null");
  assert.equal(legacyNoWaveform.analysis?.loudness.integrated_lufs, -16);
  assert.equal(legacyNoWaveform.analysis?.transcript_prep.chunk_count, 1);
  assert.equal(legacyNoWaveform.audio_edit, null, "legacy payload without audio_edit should have null");

  const legacy = await requestHammerAudioPolish({
    workspace_id: "ws_01",
    workpiece_id: "wp_legacy",
    media_kind: "recording_audio",
    input: { type: "url", value: "http://example.test/legacy.wav" },
    canonical_workpiece_path: "recordings/legacy.wav",
    mime_type: "audio/wav",
  });
  assert.equal(legacy.analysis, null);
  assert.equal(legacy.audio_edit, null);
}

main()
  .then(() => {
    console.log("Hammer audio polish API tests passed.");
  })
  .catch((error) => {
    console.error("Hammer audio polish API tests failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as typeof globalThis & { window?: unknown }).window;
    } else {
      (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
    }
  });


