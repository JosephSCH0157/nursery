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
          processor_version: "forge-v1.2.0/audio-polish.v3",
          output_local_relpath: "hammer/prep/audio-polish/example.wav",
          output_workpiece_path: "hammer/prep/audio-polish/example.wav",
          output_mime_type: "audio/wav",
          output_duration_ms: 8000,
          failure_code: null,
          failure_reason: null,
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
    canonical_workpiece_path: "recordings/example.wav",
    mime_type: "audio/wav",
  });
  assert.equal(withAnalysis.analysis?.loudness.integrated_lufs, -18.2);
  assert.equal(withAnalysis.analysis?.segmentation.regions[0]?.kind, "speech");
  assert.equal(withAnalysis.analysis?.transcript_prep.chunks[0]?.source, "short_file_single_chunk");

  const legacy = await requestHammerAudioPolish({
    workspace_id: "ws_01",
    workpiece_id: "wp_legacy",
    media_kind: "recording_audio",
    canonical_workpiece_path: "recordings/legacy.wav",
    mime_type: "audio/wav",
  });
  assert.equal(legacy.analysis, null);
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

