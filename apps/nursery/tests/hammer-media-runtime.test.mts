import assert from "node:assert/strict";
import { detectHammerMediaRuntime } from "../scripts/hammer-media-runtime";

{
  const runtime = detectHammerMediaRuntime(
    {
      HAMMER_MEDIA_BACKEND: "ffmpeg",
      HAMMER_FFMPEG_BIN: "C:\\custom\\ffmpeg.exe",
      HAMMER_FFPROBE_BIN: "C:\\custom\\ffprobe.exe",
    } as NodeJS.ProcessEnv,
    {
      probeBinary: (binary) => binary.toLowerCase().includes("custom"),
    },
  );
  assert.equal(runtime.preferred_backend, "ffmpeg");
  assert.equal(runtime.ffmpeg.ffmpeg_bin, "C:\\custom\\ffmpeg.exe");
  assert.equal(runtime.ffmpeg.ffprobe_bin, "C:\\custom\\ffprobe.exe");
  assert.equal(runtime.ffmpeg.ffmpeg_available, true);
  assert.equal(runtime.ffmpeg.ffprobe_available, true);
  assert.equal(runtime.ffmpeg.install_state, "ready");
}

{
  const runtime = detectHammerMediaRuntime(
    {} as NodeJS.ProcessEnv,
    {
      probeBinary: (binary) => binary === "ffmpeg" || binary === "ffprobe",
    },
  );
  assert.equal(runtime.ffmpeg.ffmpeg_bin, "ffmpeg");
  assert.equal(runtime.ffmpeg.ffprobe_bin, "ffprobe");
  assert.equal(runtime.ffmpeg.ffmpeg_available, true);
  assert.equal(runtime.ffmpeg.ffprobe_available, true);
  assert.equal(runtime.ffmpeg.install_state, "ready");
}

{
  const runtime = detectHammerMediaRuntime(
    {
      HAMMER_FFMPEG_BIN: "C:\\broken\\ffmpeg.exe",
      HAMMER_FFPROBE_BIN: "C:\\broken\\ffprobe.exe",
    } as NodeJS.ProcessEnv,
    {
      probeBinary: () => false,
    },
  );
  assert.equal(runtime.ffmpeg.ffmpeg_bin, "C:\\broken\\ffmpeg.exe");
  assert.equal(runtime.ffmpeg.ffprobe_bin, "C:\\broken\\ffprobe.exe");
  assert.equal(runtime.ffmpeg.ffmpeg_available, false);
  assert.equal(runtime.ffmpeg.ffprobe_available, false);
  assert.equal(runtime.ffmpeg.install_state, "partial");
}

console.log("Hammer media runtime tests passed.");
