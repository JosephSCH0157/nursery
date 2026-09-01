import assert from "node:assert/strict";
import { buildHammerMediaBackboneRuntimeSummary } from "../src/media/hammerMediaBackbone";
import {
  executeDialogueAudioRenderWithBackend,
  processDialogueAudioWithBackend,
  resolveHammerAudioProcessingBackend,
} from "../src/editor/hammerAudioProcessingBackend";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { buildHammerNativePreviewPlan } from "../src/editor/hammerStudioRackNativePreview";

function testNativePreviewPlanTracksCleanupAndBypass() {
  const rack = createDefaultHammerStudioRackState();
  assert.deepEqual(buildHammerNativePreviewPlan(rack), []);
  rack.is_enabled = true;
  rack.voice_polish!.voice_cleanup_enabled = true;
  const kinds = buildHammerNativePreviewPlan(rack).map((filter) => filter.kind);
  assert.equal(kinds.includes("highpass"), true);
  assert.equal(kinds.includes("noise_reduction"), true);
  assert.equal(kinds.includes("compressor"), true);
  assert.equal(kinds.includes("limiter"), true);
  rack.is_bypassed = true;
  assert.deepEqual(buildHammerNativePreviewPlan(rack), []);
}

function testNativeLaneRemainsNative() {
  const runtime = buildHammerMediaBackboneRuntimeSummary();
  const resolution = resolveHammerAudioProcessingBackend({
    requestedBackend: "native",
    mode: "playback",
    runtimeSummary: runtime,
  });
  assert.equal(resolution.resolvedBackend, "native");
  assert.equal(resolution.degraded, false);
}

function testPlaybackStaysNativeWhenFfmpegRequested() {
  const runtime = buildHammerMediaBackboneRuntimeSummary({
    ffmpegBin: "ffmpeg",
    ffprobeBin: "ffprobe",
    ffmpegAvailable: true,
    ffprobeAvailable: true,
  });
  const resolution = resolveHammerAudioProcessingBackend({
    requestedBackend: "ffmpeg",
    mode: "playback",
    runtimeSummary: runtime,
  });
  assert.equal(resolution.resolvedBackend, "native");
  assert.equal(resolution.degraded, true);
}

function testRenderUsesFfmpegWhenAvailable() {
  const runtime = buildHammerMediaBackboneRuntimeSummary({
    ffmpegBin: "ffmpeg",
    ffprobeBin: "ffprobe",
    ffmpegAvailable: true,
    ffprobeAvailable: true,
  });
  const resolution = resolveHammerAudioProcessingBackend({
    requestedBackend: "ffmpeg",
    mode: "render",
    runtimeSummary: runtime,
  });
  assert.equal(resolution.resolvedBackend, "ffmpeg");
  assert.equal(resolution.degraded, false);
}

function testRenderFallsBackWhenFfmpegUnavailable() {
  const runtime = buildHammerMediaBackboneRuntimeSummary();
  const resolution = resolveHammerAudioProcessingBackend({
    requestedBackend: "ffmpeg",
    mode: "render",
    runtimeSummary: runtime,
  });
  assert.equal(resolution.resolvedBackend, "native");
  assert.equal(resolution.degraded, true);
}

function testProcessDialogueUsesResolutionSeam() {
  const runtime = buildHammerMediaBackboneRuntimeSummary();
  const rack = createDefaultHammerStudioRackState();
  rack.backend_preference = "ffmpeg";
  const playbackConfig = processDialogueAudioWithBackend({
    rackState: rack,
    mode: "playback",
    runtimeSummary: runtime,
  });
  const renderConfig = processDialogueAudioWithBackend({
    rackState: rack,
    mode: "render",
    runtimeSummary: runtime,
  });
  assert.equal(playbackConfig.backend, "native");
  assert.equal(renderConfig.backend, "native");
}

async function testRenderExecutionSkipsWhenFfmpegUnavailable() {
  const runtime = buildHammerMediaBackboneRuntimeSummary();
  const rack = createDefaultHammerStudioRackState();
  rack.is_enabled = true;
  rack.backend_preference = "ffmpeg";
  rack.modules.compressor.is_enabled = true;

  let called = false;
  const result = await executeDialogueAudioRenderWithBackend({
    workspaceId: "ws-1",
    workpieceId: "wp-1",
    mediaKind: "recording_audio",
    timelineSegments: [
      { segment_id: "s1", start_sec: 0, end_sec: 1 },
    ],
    rackState: rack,
    runtimeSummary: runtime,
    executor: async () => {
      called = true;
      throw new Error("executor should not be called when ffmpeg is unavailable");
    },
  });

  assert.equal(called, false);
  assert.equal(result.status, "skipped");
  assert.equal(result.requestedBackend, "ffmpeg");
  assert.equal(result.resolvedBackend, "native");
  assert.equal(/unavailable/i.test(result.message), true);
}

async function testRenderExecutionProcessesWhenFfmpegAvailable() {
  const runtime = buildHammerMediaBackboneRuntimeSummary({
    ffmpegBin: "ffmpeg",
    ffprobeBin: "ffprobe",
    ffmpegAvailable: true,
    ffprobeAvailable: true,
  });
  const rack = createDefaultHammerStudioRackState();
  rack.is_enabled = true;
  rack.backend_preference = "ffmpeg";
  rack.modules.compressor.is_enabled = true;

  let called = false;
  const result = await executeDialogueAudioRenderWithBackend({
    workspaceId: "ws-2",
    workpieceId: "wp-2",
    mediaKind: "recording_audio",
    timelineSegments: [
      { segment_id: "s1", start_sec: 0, end_sec: 1 },
    ],
    rackState: rack,
    runtimeSummary: runtime,
    executor: async () => {
      called = true;
      return {
        status: "processed",
        requested_backend: "ffmpeg",
        resolved_backend: "ffmpeg",
        processed_at: "2026-03-24T12:00:00.000Z",
        output_local_relpath: "hammer/render/studio-rack/wp-2/out.wav",
        output_workpiece_path: "hammer/render/studio-rack/wp-2/out.wav",
        output_mime_type: "audio/wav",
        output_duration_ms: 1234,
        failure_reason: null,
        settings_summary: {},
        canonical_audio_master: null,
      };
    },
  });

  assert.equal(called, true);
  assert.equal(result.status, "processed");
  assert.equal(result.requestedBackend, "ffmpeg");
  assert.equal(result.resolvedBackend, "ffmpeg");
  assert.equal(result.outputWorkpiecePath, "hammer/render/studio-rack/wp-2/out.wav");
}

async function run() {
  testNativePreviewPlanTracksCleanupAndBypass();
  testNativeLaneRemainsNative();
  testPlaybackStaysNativeWhenFfmpegRequested();
  testRenderUsesFfmpegWhenAvailable();
  testRenderFallsBackWhenFfmpegUnavailable();
  testProcessDialogueUsesResolutionSeam();
  await testRenderExecutionSkipsWhenFfmpegUnavailable();
  await testRenderExecutionProcessesWhenFfmpegAvailable();
  // eslint-disable-next-line no-console
  console.log("Hammer audio processing backend tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer audio processing backend tests failed:", error);
  process.exit(1);
});
