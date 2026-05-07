import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import fsPromises from "node:fs/promises";
import { handleHammerStudioRackRenderRequest } from "../scripts/hammer-studio-rack-render";
import { createDefaultHammerStudioRackState } from "../../hammer/src/editor/hammerStudioRack";

function commandAvailable(command: string): boolean {
  try {
    const result = spawnSync(command, ["-version"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function runCommand(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    windowsHide: true,
  });
  if (result.status === 0) return;
  throw new Error(result.stderr?.toString("utf8") || `${command} failed`);
}

function readWavDataChunk(buffer: Buffer): Buffer {
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > buffer.length) break;
    if (chunkId === "data") {
      return buffer.subarray(chunkStart, chunkEnd);
    }
    offset = chunkEnd + (chunkSize % 2);
  }
  throw new Error("WAV data chunk not found.");
}

function readWavPcmPeak(buffer: Buffer): number {
  const data = readWavDataChunk(buffer);
  let peak = 0;
  for (let index = 0; index + 1 < data.length; index += 2) {
    const sample = Math.abs(data.readInt16LE(index));
    if (sample > peak) peak = sample;
  }
  return peak / 32768;
}

async function run() {
  if (!commandAvailable("ffmpeg")) {
    console.log("Skipping hammer studio-rack route test (ffmpeg unavailable).");
    return;
  }

  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-studio-rack-route-test-"));
  try {
    const inputRelpath = "input.wav";
    const inputAbs = path.join(tempRoot, inputRelpath);
    runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=1.8",
      "-ac",
      "2",
      "-ar",
      "48000",
      inputAbs,
    ]);

    const rackState = createDefaultHammerStudioRackState();
    rackState.is_enabled = true;
    rackState.backend_preference = "ffmpeg";
    rackState.modules.gate.is_enabled = true;
    rackState.modules.gate.threshold_db = 0;
    rackState.modules.gate.range_db = -60;

    const commonRequest = {
      workspace_id: "ws_hammer_studio_rack_test",
      workpiece_id: "wp_hammer_studio_rack_test",
      media_kind: "recording_audio" as const,
      timeline_segments: [
        {
          segment_id: "seg_1",
          start_sec: 0,
          end_sec: 1.8,
          gain_db: 0,
        },
      ],
      rack_state: rackState,
      local_root_abs: tempRoot,
      local_relpath: inputRelpath,
      canonical_workpiece_path: "recordings/input.wav",
      mime_type: "audio/wav",
    };

    const nativeResult = await handleHammerStudioRackRenderRequest({
      ...commonRequest,
      requested_backend: "native",
    });
    assert.equal(nativeResult.status, 200);
    assert.equal(nativeResult.payload.ok, true);
    assert.equal(nativeResult.payload.data?.status, "processed");

    const nativeOutRelpath = nativeResult.payload.data?.output_local_relpath;
    assert.equal(typeof nativeOutRelpath, "string");
    const nativeBytes = await fsPromises.readFile(path.join(tempRoot, nativeOutRelpath!));
    const nativePeak = readWavPcmPeak(nativeBytes);

    const ffmpegResult = await handleHammerStudioRackRenderRequest({
      ...commonRequest,
      requested_backend: "ffmpeg",
    });
    assert.equal(ffmpegResult.status, 200);
    assert.equal(ffmpegResult.payload.ok, true);
    assert.equal(
      ffmpegResult.payload.data?.status,
      "processed",
      `ffmpeg render failed: ${ffmpegResult.payload.data?.failure_reason ?? "unknown"}`,
    );
    assert.equal(ffmpegResult.payload.data?.settings_summary.export_audio_filter_mode, "filter_complex");
    assert.equal(ffmpegResult.payload.data?.settings_summary.export_audio_mapped_stream, "[outa]");

    const ffmpegOutRelpath = ffmpegResult.payload.data?.output_local_relpath;
    assert.equal(typeof ffmpegOutRelpath, "string");
    const ffmpegBytes = await fsPromises.readFile(path.join(tempRoot, ffmpegOutRelpath!));
    const ffmpegPeak = readWavPcmPeak(ffmpegBytes);

    assert.ok(
      ffmpegPeak < nativePeak * 0.5,
      `expected proof-filtered export peak to drop significantly (native=${nativePeak}, ffmpeg=${ffmpegPeak})`,
    );
    console.log("Hammer studio-rack render route tests passed.");
  } finally {
    await fsPromises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

run().catch((error) => {
  console.error("Hammer studio-rack render route tests failed:", error);
  process.exitCode = 1;
});
