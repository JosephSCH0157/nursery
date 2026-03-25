import assert from "node:assert/strict";
import {
  buildHammerMediaBackboneRuntimeSummary,
  resolveHammerAudioPolishExecutionPlan,
} from "../src/media/hammerMediaBackbone";

{
  const runtime = buildHammerMediaBackboneRuntimeSummary();
  assert.equal(runtime.ffmpeg.install_state, "not_configured");
  assert.equal(runtime.preferred_backend, "auto");
  assert.equal(runtime.future_operations.length, 3);
}

{
  const runtime = buildHammerMediaBackboneRuntimeSummary();
  const plan = resolveHammerAudioPolishExecutionPlan({
    runtime,
    mediaKind: "recording_audio",
    sourceExtension: ".wav",
  });
  assert.equal(plan.readiness, "ready_now");
  assert.equal(plan.executable, true);
  assert.equal(plan.backend, "builtin");
  assert.equal(plan.current_strategy, "builtin_wav_v1");
  assert.equal(plan.requires_ffmpeg, false);
}

{
  const runtime = buildHammerMediaBackboneRuntimeSummary();
  const plan = resolveHammerAudioPolishExecutionPlan({
    runtime,
    mediaKind: "recording_audio",
    sourceExtension: ".mp3",
  });
  assert.equal(plan.readiness, "requires_future_ffmpeg");
  assert.equal(plan.executable, false);
  assert.equal(plan.future_strategy, "ffmpeg_working_audio_v1");
  assert.equal(plan.requires_ffmpeg, true);
}

{
  const runtime = buildHammerMediaBackboneRuntimeSummary({
    preferredBackend: "ffmpeg",
    ffmpegBin: "C:\\ffmpeg\\bin\\ffmpeg.exe",
    ffprobeBin: "C:\\ffmpeg\\bin\\ffprobe.exe",
    ffmpegAvailable: true,
    ffprobeAvailable: true,
  });
  const plan = resolveHammerAudioPolishExecutionPlan({
    runtime,
    mediaKind: "recording_video",
    sourceExtension: ".mp4",
  });
  assert.equal(runtime.ffmpeg.install_state, "ready");
  assert.equal(plan.readiness, "ready_now");
  assert.equal(plan.backend, "ffmpeg");
  assert.equal(plan.executable, true);
  assert.equal(plan.current_strategy, "ffmpeg_working_audio_v1");
}

{
  const runtime = buildHammerMediaBackboneRuntimeSummary();
  const plan = resolveHammerAudioPolishExecutionPlan({
    runtime,
    mediaKind: "asset_image",
    sourceExtension: ".png",
  });
  assert.equal(plan.readiness, "unsupported");
  assert.equal(plan.executable, false);
  assert.equal(plan.backend, "none");
}

console.log("Hammer media backbone tests passed.");
